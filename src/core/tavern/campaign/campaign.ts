import { deepClone } from '../../util.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import {
  applyLedgerTransaction,
  applyQuestSettlement,
  buildDailyOperatingCostTransaction,
  buildOpeningBalanceTransaction,
  computeQuestSettlement,
  createInitialFinanceState,
} from '../../economy/index.ts'
import { resolveTavernDay } from '../brokerage.ts'
import {
  deriveAdvanceCandidates,
  deriveResolveCandidates,
  mergeCandidates,
} from '../../narrative/candidates.ts'
import {
  applyDailyReputationDelta,
  buildQuestReputationEvent,
  createInitialReputationState,
  deriveTavernRank,
} from './reputation.ts'
import {
  applyRecoveryRoomModifier,
  BASE_PARTY_CAPACITY,
  createInitialUpgradeState,
  getDailyRequestBonus,
  getEffectivePartyCapacity,
  getTrainingGrowthXp,
} from './upgrades.ts'
import {
  applyOvernightRecovery,
  applyRecoveryCompletion,
  calculateRecoveryDays,
  isRecoveringOnDay,
  updateCampaignPartyFromResult,
  updateCampaignPartyStats,
} from './partyState.ts'
import {
  applyAffinityFromOutcome,
  applyFinancialPressureFromOutcome,
  applyIdleFinancialPressure,
  applyRecoveryFinancialPressure,
  forceExtendStayForRecovery,
  tryExtendStay,
} from './relationship.ts'
import {
  applyDeparture,
  applyReturn,
  attemptPartyReturn,
  PARTY_LIFECYCLE_CONFIG,
  selectEligibleAwayParties,
} from './lifecycle.ts'
import { applyCharacterRelationshipChanges } from '../../narrative/characterRelationships.ts'
import { applyExpeditionMemory } from '../../narrative/memory.ts'
import { updateArcSignals } from '../../narrative/arcSignals.ts'
import { updateRelationshipMilestones } from '../../narrative/milestones.ts'
import { resolveDowntimeForCampaign } from '../../narrative/downtime.ts'
import { EXPEDITION_GROWTH_XP, awardPartyGrowthXp } from './progression.ts'
import {
  buildTavernDay,
  generateCampaignParty,
  generateInitialCampaignParties,
  generateTavernRequestsForDay,
  pickUniquePartyName,
} from './generators.ts'
import {
  collectDueChainRequests,
  resolveQuestChainsForDay,
} from './questChains.ts'
import {
  collectDueEventRequest,
  prepareWorldEventsForDay,
  resolveWorldEventsForDay,
} from './worldEvents.ts'
import type {
  CampaignParty,
  CampaignProgressionEvent,
  CampaignProgressionSource,
  CampaignRelationshipEvent,
  TavernCampaignState,
  TavernDayRecord,
  WorldEventEvent,
} from './types.ts'
import type {
  CampaignPartyEvent,
  ResolvedDispatch,
  TavernDayState,
} from '../types.ts'

export function createTavernCampaign(seed: string): TavernCampaignState {
  const dayNumber = 1
  const reputation = createInitialReputationState()
  const upgrades = createInitialUpgradeState()
  const tavernRank = deriveTavernRank(reputation.peakScore)
  const { parties, nextSerial } = generateInitialCampaignParties(
    seed,
    tavernRank,
    0,
  )

  const daySeed = `${seed}:day:${dayNumber}`
  const availablePartyRanks = parties.map((p) => p.party.rank)
  const requestCount = 3 + getDailyRequestBonus(upgrades)
  const requests = generateTavernRequestsForDay(
    daySeed,
    tavernRank,
    availablePartyRanks,
    requestCount,
  )
  const currentDay = buildTavernDay(daySeed, requests, parties, dayNumber)

  return {
    version: 1,
    seed,
    dayNumber,
    reputation,
    nextPartySerial: nextSerial,
    parties,
    awayParties: [],
    retiredParties: [],
    currentDay,
    history: [],
    narrativeCandidates: [],
    narrativeGenerations: [],
    finance: applyLedgerTransaction(
      createInitialFinanceState(),
      buildOpeningBalanceTransaction(),
    ),
    upgrades,
    questChains: [],
    worldEvents: [],
  }
}

export function resolveCampaignDay(
  campaign: TavernCampaignState,
): TavernCampaignState {
  if (campaign.currentDay.status !== 'planning') {
    throw new Error('本日の仲介が確定していないか、既に確定済みです')
  }

  const nextCampaign = deepClone(campaign)
  const dayNumber = nextCampaign.dayNumber
  const results = resolveTavernDay(nextCampaign.currentDay)

  const postEvents: CampaignPartyEvent[] = []
  const progressionEvents: CampaignProgressionEvent[] = []
  const relationshipEvents: CampaignRelationshipEvent[] = []

  let finance = nextCampaign.finance
  const resultsWithSettlement: ResolvedDispatch[] = []

  for (const resolved of results) {
    if (resolved.status === 'resolved' && resolved.result) {
      const settlement = computeQuestSettlement(
        resolved.request.rewardTerms,
        resolved.result.outcome,
      )
      const reportWithSettlement = resolved.report
        ? { ...resolved.report, settlement }
        : undefined
      const withSettlement: ResolvedDispatch = {
        ...resolved,
        settlement,
        report: reportWithSettlement,
      }
      finance = applyQuestSettlement(finance, settlement, dayNumber, {
        requestId: withSettlement.requestId,
        partyId: withSettlement.partyId,
      })
      resultsWithSettlement.push(withSettlement)
      continue
    }
    resultsWithSettlement.push(resolved)
  }

  finance = applyLedgerTransaction(
    finance,
    buildDailyOperatingCostTransaction(dayNumber),
  )

  nextCampaign.currentDay = {
    ...nextCampaign.currentDay,
    status: 'resolved',
    results: resultsWithSettlement,
  }
  nextCampaign.finance = finance

  for (const resolved of resultsWithSettlement) {
    if (resolved.status !== 'resolved' || !resolved.result) {
      continue
    }

    const party = nextCampaign.parties.find((p) => p.id === resolved.partyId)
    if (!party) {
      continue
    }

    updateCampaignPartyFromResult(party, resolved.result)

    const outcome = resolved.result.outcome
    updateCampaignPartyStats(party, outcome)

    applyCharacterRelationshipChanges(
      party,
      resolved.result,
      dayNumber,
      resolved.requestId,
    )
    applyExpeditionMemory(party, resolved.result, dayNumber, resolved.requestId)
    updateArcSignals(party, dayNumber)
    updateRelationshipMilestones(party, dayNumber)

    relationshipEvents.push(applyAffinityFromOutcome(party, outcome, dayNumber))
    relationshipEvents.push(
      applyFinancialPressureFromOutcome(party, outcome, dayNumber),
    )

    if (party.departingCasualty) {
      postEvents.push({
        type: 'departedCasualty',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber,
      })
      progressionEvents.push(
        ...awardPartyGrowthXp(nextCampaign.seed, party, 0, {
          source: 'forcedRetreat',
          dayNumber,
        }),
      )
      continue
    }

    const xpAmount = EXPEDITION_GROWTH_XP[outcome]
    if (xpAmount > 0) {
      const progressionSource: CampaignProgressionSource =
        outcome === 'lostExpedition' ? 'forcedRetreat' : outcome
      progressionEvents.push(
        ...awardPartyGrowthXp(nextCampaign.seed, party, xpAmount, {
          source: progressionSource,
          dayNumber,
        }),
      )
    }

    const baseRecoveryDays = calculateRecoveryDays(party)
    if (baseRecoveryDays > 0) {
      const recoveryDays = applyRecoveryRoomModifier(
        baseRecoveryDays,
        nextCampaign.upgrades,
      )
      party.recoveringThroughDay = dayNumber + recoveryDays
      postEvents.push({
        type: 'startedRecovery',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber,
      })
    }
  }

  const dispatchedPartyIds = new Set(
    results
      .filter((r) => r.status === 'resolved' && r.partyId)
      .map((r) => r.partyId!),
  )

  // Resolve downtime events for parties not on expedition.
  resolveDowntimeForCampaign(nextCampaign, dispatchedPartyIds)

  for (const party of nextCampaign.parties) {
    if (party.departingCasualty || dispatchedPartyIds.has(party.id)) {
      continue
    }
    if (isRecoveringOnDay(party, dayNumber)) {
      relationshipEvents.push(applyRecoveryFinancialPressure(party, dayNumber))
      continue
    }
    relationshipEvents.push(applyIdleFinancialPressure(party, dayNumber))
    progressionEvents.push(
      ...awardPartyGrowthXp(
        nextCampaign.seed,
        party,
        getTrainingGrowthXp(nextCampaign.upgrades),
        {
          source: 'training',
          dayNumber,
        },
      ),
    )
  }

  // Sync resolved day party snapshots with grown campaign parties.
  nextCampaign.currentDay = syncCurrentDayParties(
    nextCampaign.currentDay,
    nextCampaign.parties,
    dayNumber,
  )

  const reputationEvents = resultsWithSettlement
    .filter((r) => r.status === 'resolved' && r.result && r.partyId)
    .map((r) =>
      buildQuestReputationEvent(
        dayNumber,
        r.requestId,
        r.partyId!,
        r.request.rank,
        r.result!.outcome,
      ),
    )

  const { state: reputationState, summary: reputationSummary } =
    applyDailyReputationDelta(nextCampaign.reputation, reputationEvents)
  nextCampaign.reputation = reputationState

  // Quest Chain transition runs after Settlement/Party state/Growth/
  // Reputation, and before the day's record is written — see
  // resolveQuestChainsForDay's own docs for why this is a pure reducer
  // shared with save validation rather than inline logic here.
  const { chains: nextQuestChains, events: questChainEvents } =
    resolveQuestChainsForDay({
      campaignSeed: nextCampaign.seed,
      dayNumber,
      currentChains: nextCampaign.questChains,
      results: resultsWithSettlement,
      afterTavernRank: reputationSummary.afterRank,
    })
  nextCampaign.questChains = nextQuestChains

  // World Event response runs after Quest Chain transition — the two
  // systems never mutate each other's state, only read the same day's
  // results independently (see resolveWorldEventsForDay's own docs).
  // A 'started' event, if the active World Event began today, was already
  // decided by prepareWorldEventsForDay during the DAY-1 -> DAY transition
  // (advanceCampaignDay); it belongs on THIS day's record, so it is
  // reconstructed here from the already-frozen startedDay rather than
  // recomputed, since WorldEventState.startedDay is set exactly once.
  const startedWorldEventEvents: WorldEventEvent[] = nextCampaign.worldEvents
    .filter((e) => e.startedDay === dayNumber)
    .map((e) => ({
      type: 'started',
      eventId: e.id,
      definitionId: e.definitionId,
      dayNumber,
    }))
  const { worldEvents: nextWorldEvents, events: worldEventResponseEvents } =
    resolveWorldEventsForDay({
      dayNumber,
      worldEvents: nextCampaign.worldEvents,
      results: resultsWithSettlement,
    })
  nextCampaign.worldEvents = nextWorldEvents
  const worldEventEvents = [
    ...startedWorldEventEvents,
    ...worldEventResponseEvents,
  ]

  const resolveCandidates = deriveResolveCandidates(
    nextCampaign,
    relationshipEvents,
  )
  nextCampaign.narrativeCandidates = mergeCandidates(
    nextCampaign.narrativeCandidates,
    resolveCandidates,
  )

  const dayRecord: TavernDayRecord = {
    dayNumber,
    daySeed: nextCampaign.currentDay.seed,
    reputationSummary,
    results: deepClone(resultsWithSettlement),
    partyEvents: [
      ...(nextCampaign.currentDay.partyEvents ?? []),
      ...postEvents,
    ],
    progressionEvents,
    relationshipEvents,
    questChainEvents,
    worldEventEvents,
  }
  nextCampaign.history.push(dayRecord)

  return nextCampaign
}

function syncCurrentDayParties(
  currentDay: TavernDayState,
  parties: CampaignParty[],
  dayNumber: number,
): TavernDayState {
  const updated = currentDay.parties.map((tavernParty) => {
    const campaignParty = parties.find((p) => p.id === tavernParty.id)
    if (!campaignParty) return tavernParty
    return {
      ...tavernParty,
      party: deepClone(campaignParty.party),
      progression: {
        growthXp: campaignParty.progression.growthXp,
        totalGrowthXp: campaignParty.progression.totalGrowthXp,
        growthMilestones: campaignParty.progression.growthMilestones,
        trainingDays: campaignParty.progression.trainingDays,
      },
      relationship: {
        affinity: campaignParty.relationship.affinity,
        financialPressure: campaignParty.relationship.financialPressure,
        riskTolerance: campaignParty.relationship.riskTolerance,
        stayExtensionDaysUsed: campaignParty.relationship.stayExtensionDaysUsed,
      },
      stats: { ...campaignParty.stats },
      characterMemories: campaignParty.characterMemories
        ? deepClone(campaignParty.characterMemories)
        : undefined,
      memberRelationships: campaignParty.memberRelationships
        ? deepClone(campaignParty.memberRelationships)
        : undefined,
      arcSignals: campaignParty.arcSignals
        ? deepClone(campaignParty.arcSignals)
        : undefined,
      relationshipMilestones: campaignParty.relationshipMilestones
        ? deepClone(campaignParty.relationshipMilestones)
        : undefined,
      downtimeEvents: campaignParty.downtimeEvents
        ? deepClone(campaignParty.downtimeEvents).filter(
            (e) => e.day === dayNumber,
          )
        : undefined,
    }
  })
  return { ...currentDay, parties: updated }
}

export function advanceCampaignDay(
  campaign: TavernCampaignState,
): TavernCampaignState {
  if (campaign.currentDay.status !== 'resolved') {
    throw new Error('本日を確定していないため翌日へ進めません')
  }

  const nextCampaign = deepClone(campaign)
  const resolvedDay = nextCampaign.dayNumber
  const nextDayNumber = nextCampaign.dayNumber + 1

  const parties = nextCampaign.parties
  const preEvents: CampaignPartyEvent[] = []
  const extensionEvents: CampaignRelationshipEvent[] = []

  // Context for narrative candidate derivation.
  const departing: { party: CampaignParty; scheduled: boolean }[] = []
  const recovered: CampaignParty[] = []

  // 1. Complete recovery, THEN evaluate stay extension/departure, for each
  //    non-casualty party in turn. Recovery completion must be resolved
  //    before the departure decision so a party whose recovery window ends
  //    on the same day it becomes eligible to leave departs in a fully
  //    recovered state (HP/MP/injuries/status effects cleared) rather than
  //    carrying stale recovery data into the away roster.
  const recoveredToday = new Set<string>()
  const remaining: CampaignParty[] = []
  for (const party of parties) {
    if (party.departingCasualty) {
      // departedCasualty event is recorded on the day it is determined.
      departing.push({ party, scheduled: false })
      continue
    }

    if (
      party.recoveringThroughDay !== undefined &&
      party.recoveringThroughDay < nextDayNumber
    ) {
      applyRecoveryCompletion(party)
      recoveredToday.add(party.id)
      recovered.push(party)
      preEvents.push({
        type: 'finishedRecovery',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber: nextDayNumber,
      })
    }

    if (party.plannedDepartureDay < nextDayNumber) {
      // A recovering party must never depart mid-recovery: force the stay
      // through recovery completion, independent of the affinity-based
      // extension budget used below. Recovery completion above may have
      // already cleared recoveringThroughDay for this same day, in which
      // case isRecoveringOnDay is correctly false and departure proceeds.
      if (isRecoveringOnDay(party, nextDayNumber)) {
        const forcedEvent = forceExtendStayForRecovery(
          party,
          nextDayNumber,
          `${nextCampaign.seed}:${party.id}:stay:${nextDayNumber}:recovery-forced`,
        )
        extensionEvents.push(forcedEvent)
        remaining.push(party)
        continue
      }
      const stayEvent = tryExtendStay(
        party,
        nextDayNumber,
        nextDayNumber,
        nextCampaign.seed,
      )
      if (stayEvent) {
        extensionEvents.push(stayEvent)
        remaining.push(party)
        continue
      }
      preEvents.push({
        type: 'departedScheduled',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber: nextDayNumber,
      })
      departing.push({ party, scheduled: true })
      continue
    }
    remaining.push(party)
  }

  // Move departing parties out of the active roster into the away/retired
  // collections — departure is never a delete. Scheduled departures become
  // 'away' (return-eligible after the cooldown); casualty departures
  // become 'retired' (permanent; Phase 9.4 adds no other retirement
  // trigger). Recovery completion (above) has already been applied to any
  // scheduled-departure party before it reaches this step.
  for (const { party, scheduled } of departing) {
    applyDeparture(party, resolvedDay, !scheduled)
    if (scheduled) {
      nextCampaign.awayParties.push(party)
    } else {
      nextCampaign.retiredParties.push(party)
    }
  }

  // 2. Overnight recovery for available parties (skip same-day recovery completes).
  for (const party of remaining) {
    if (recoveredToday.has(party.id)) {
      continue
    }
    if (!isRecoveringOnDay(party, nextDayNumber)) {
      applyOvernightRecovery(party)
    }
  }

  // Fill vacancies up to the effective capacity (base + Guest Room bonus):
  // first at most one returning party (deterministic Campaign RNG only),
  // then brand-new arrivals for whatever vacancy remains.
  // Rank effects apply from the day after they are earned: today's newly
  // generated content uses the Tavern Rank derived from the latest resolved
  // peak reputation, never a mid-day recomputation.
  const tavernRank = deriveTavernRank(nextCampaign.reputation.peakScore)

  // World Event start decision runs at the DAY N -> DAY N+1 transition,
  // right after Tavern Rank is settled for the new day and before request
  // generation, so a freshly-started event's request can appear on this
  // same new day's board — see prepareWorldEventsForDay's own docs.
  const { worldEvents: nextWorldEvents } = prepareWorldEventsForDay({
    campaignSeed: nextCampaign.seed,
    dayNumber: nextDayNumber,
    worldEvents: nextCampaign.worldEvents,
    tavernRank,
  })
  nextCampaign.worldEvents = nextWorldEvents

  // New party names must never collide with ANY known persistent party —
  // not just those currently staying, but every party ever encountered
  // (away or retired) — so a name is never reused within the Visitor
  // Registry's lifetime.
  const usedNames = new Set([
    ...remaining.map((p) => p.party.name),
    ...nextCampaign.awayParties.map((p) => p.party.name),
    ...nextCampaign.retiredParties.map((p) => p.party.name),
  ])
  const arrivals: CampaignParty[] = []

  const effectiveCapacity = getEffectivePartyCapacity(
    BASE_PARTY_CAPACITY,
    nextCampaign.upgrades,
  )
  let vacancies = Math.max(0, effectiveCapacity - remaining.length)

  if (vacancies > 0 && PARTY_LIFECYCLE_CONFIG.maxReturningPartiesPerDay > 0) {
    const eligible = selectEligibleAwayParties(
      nextCampaign.awayParties,
      nextDayNumber,
    )
    const returnRng = new SeededRng(
      `${nextCampaign.seed}:day:${nextDayNumber}:return-roll`,
    )
    const returned = attemptPartyReturn(returnRng, eligible)
    if (returned) {
      nextCampaign.awayParties = nextCampaign.awayParties.filter(
        (p) => p.id !== returned.id,
      )
      applyReturn(returned, nextCampaign.seed, nextDayNumber)
      remaining.push(returned)
      usedNames.add(returned.party.name)
      vacancies -= 1
      // Not added to `arrivals` (which drives the "新しい顔" narrative
      // candidate pool) — a returning party is not a new face. buildTavernDay
      // still derives its 'arrived' CampaignPartyEvent automatically from
      // arrivalDay, same as any other party.
    }
  }

  while (vacancies > 0) {
    const serial = nextCampaign.nextPartySerial
    const newParty = generateCampaignParty(
      nextCampaign.seed,
      serial,
      tavernRank,
      nextDayNumber,
    )
    const name = pickUniquePartyName(
      `${nextCampaign.seed}:arrival:${serial}`,
      usedNames,
    )
    newParty.party.name = name
    usedNames.add(name)
    remaining.push(newParty)
    arrivals.push(newParty)
    nextCampaign.nextPartySerial += 1
    vacancies -= 1
  }

  const daySeed = `${nextCampaign.seed}:day:${nextDayNumber}`
  const availablePartyRanks = remaining
    .filter((p) => !isRecoveringOnDay(p, nextDayNumber))
    .map((p) => p.party.rank)
  const requestCount = 3 + getDailyRequestBonus(nextCampaign.upgrades)

  // Quest Chain follow-ups and the active World Event's request occupy
  // board slots in priority order — neither ever adds to the day's total
  // request count (Phase 9.3's Quest Board sizing is unchanged). Both are
  // already fully generated (frozen rank/objective/reward) by the pure
  // reducers above; only the remaining slots are filled by the existing
  // normal request generator.
  const dueChainRequests = collectDueChainRequests(
    nextCampaign.questChains,
    nextDayNumber,
  )
  const dueEventRequests = collectDueEventRequest(
    nextCampaign.worldEvents,
    nextDayNumber,
  )
  if (dueChainRequests.length + dueEventRequests.length > requestCount) {
    throw new Error(
      `Board slot invariant violated: ${dueChainRequests.length} chain + ${dueEventRequests.length} event requests due on day ${nextDayNumber} (only ${requestCount} board slots)`,
    )
  }
  const normalRequestCount = Math.max(
    0,
    requestCount - dueChainRequests.length - dueEventRequests.length,
  )
  const normalRequests = generateTavernRequestsForDay(
    daySeed,
    tavernRank,
    availablePartyRanks,
    normalRequestCount,
  )
  const requests = [...dueChainRequests, ...dueEventRequests, ...normalRequests]
  const currentDay = buildTavernDay(daySeed, requests, remaining, nextDayNumber)
  currentDay.partyEvents = [...preEvents, ...(currentDay.partyEvents ?? [])]

  nextCampaign.dayNumber = nextDayNumber
  nextCampaign.parties = remaining
  nextCampaign.currentDay = currentDay

  const previousRecord = nextCampaign.history[nextCampaign.history.length - 1]
  if (previousRecord && extensionEvents.length > 0) {
    previousRecord.relationshipEvents = [
      ...previousRecord.relationshipEvents,
      ...extensionEvents,
    ]
  }

  const advanceCandidates = deriveAdvanceCandidates(nextCampaign, {
    nextDayNumber,
    departing,
    recovered,
    extended: extensionEvents,
    arrivals,
  })
  nextCampaign.narrativeCandidates = mergeCandidates(
    nextCampaign.narrativeCandidates,
    advanceCandidates,
  )

  return nextCampaign
}
