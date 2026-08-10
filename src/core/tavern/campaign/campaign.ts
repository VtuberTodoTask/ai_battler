import { deepClone } from '../../util.ts'
import { resolveTavernDay } from '../brokerage.ts'
import {
  deriveAdvanceCandidates,
  deriveResolveCandidates,
  mergeCandidates,
} from '../../narrative/candidates.ts'
import { computeReputationChange } from './reputation.ts'
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
  tryExtendStay,
} from './relationship.ts'
import { applyCharacterRelationshipChanges } from '../../narrative/characterRelationships.ts'
import { applyExpeditionMemory } from '../../narrative/memory.ts'
import {
  EXPEDITION_GROWTH_XP,
  TRAINING_GROWTH_XP,
  awardPartyGrowthXp,
} from './progression.ts'
import {
  buildTavernDay,
  generateCampaignParty,
  generateInitialCampaignParties,
  generateTavernRequestsForDay,
  pickUniquePartyName,
} from './generators.ts'
import type {
  CampaignParty,
  CampaignProgressionEvent,
  CampaignProgressionSource,
  CampaignRelationshipEvent,
  TavernCampaignState,
  TavernDayRecord,
} from './types.ts'
import type { CampaignPartyEvent, TavernDayState } from '../types.ts'

export function createTavernCampaign(seed: string): TavernCampaignState {
  const dayNumber = 1
  const reputation = 10
  const { parties, nextSerial } = generateInitialCampaignParties(
    seed,
    reputation,
    0,
  )

  const daySeed = `${seed}:day:${dayNumber}`
  const availablePartyRanks = parties.map((p) => p.party.rank)
  const requests = generateTavernRequestsForDay(
    daySeed,
    reputation,
    availablePartyRanks,
  )
  const currentDay = buildTavernDay(daySeed, requests, parties, dayNumber)

  return {
    version: 1,
    seed,
    dayNumber,
    reputation,
    nextPartySerial: nextSerial,
    parties,
    currentDay,
    history: [],
    narrativeCandidates: [],
    narrativeGenerations: [],
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

  nextCampaign.currentDay = {
    ...nextCampaign.currentDay,
    status: 'resolved',
    results,
  }

  const postEvents: CampaignPartyEvent[] = []
  const progressionEvents: CampaignProgressionEvent[] = []
  const relationshipEvents: CampaignRelationshipEvent[] = []

  for (const resolved of results) {
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

    const recoveryDays = calculateRecoveryDays(party)
    if (recoveryDays > 0) {
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
      .map((r) => r.partyId),
  )

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
      ...awardPartyGrowthXp(nextCampaign.seed, party, TRAINING_GROWTH_XP, {
        source: 'training',
        dayNumber,
      }),
    )
  }

  // Sync resolved day party snapshots with grown campaign parties.
  nextCampaign.currentDay = syncCurrentDayParties(
    nextCampaign.currentDay,
    nextCampaign.parties,
  )

  const reputationOutcomes = results
    .filter((r) => r.status === 'resolved' && r.result)
    .map((r) => ({
      requestId: r.requestId,
      outcome: r.result!.outcome,
    }))

  const reputationSummary = computeReputationChange(
    nextCampaign.reputation,
    reputationOutcomes,
  )
  nextCampaign.reputation = reputationSummary.after

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
    reputationBefore: reputationSummary.before,
    reputationAfter: reputationSummary.after,
    reputationChange: reputationSummary,
    results: deepClone(results),
    partyEvents: [
      ...(nextCampaign.currentDay.partyEvents ?? []),
      ...postEvents,
    ],
    progressionEvents,
    relationshipEvents,
  }
  nextCampaign.history.push(dayRecord)

  return nextCampaign
}

function syncCurrentDayParties(
  currentDay: TavernDayState,
  parties: CampaignParty[],
): TavernDayState {
  const updated = currentDay.parties.map((tavernParty) => {
    const campaignParty = parties.find((p) => p.id === tavernParty.id)
    if (!campaignParty) return tavernParty
    return {
      ...tavernParty,
      party: deepClone(campaignParty.party),
      progression: {
        growthXp: campaignParty.progression.growthXp,
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
  const nextDayNumber = nextCampaign.dayNumber + 1

  const parties = nextCampaign.parties
  const preEvents: CampaignPartyEvent[] = []
  const extensionEvents: CampaignRelationshipEvent[] = []

  // Context for narrative candidate derivation.
  const departing: { party: CampaignParty; scheduled: boolean }[] = []
  const recovered: CampaignParty[] = []

  // 1. Evaluate stay extensions for non-casualty parties, then remove
  //    parties whose scheduled departure is not extended.
  const remaining: CampaignParty[] = []
  for (const party of parties) {
    if (party.departingCasualty) {
      // departedCasualty event is recorded on the day it is determined.
      departing.push({ party, scheduled: false })
      continue
    }
    if (party.plannedDepartureDay < nextDayNumber) {
      const stayEvent = tryExtendStay(party, nextDayNumber, nextDayNumber)
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

  // 2. Complete recovery for remaining parties whose recovery window has passed.
  const recoveredToday = new Set<string>()
  for (const party of remaining) {
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
  }

  // 3. Overnight recovery for available parties (skip same-day recovery completes).
  for (const party of remaining) {
    if (recoveredToday.has(party.id)) {
      continue
    }
    if (!isRecoveringOnDay(party, nextDayNumber)) {
      applyOvernightRecovery(party)
    }
  }

  // Fill roster to 4 with new arrivals.
  const usedNames = new Set(remaining.map((p) => p.party.name))
  const arrivals: CampaignParty[] = []
  while (remaining.length < 4) {
    const serial = nextCampaign.nextPartySerial
    const newParty = generateCampaignParty(
      nextCampaign.seed,
      serial,
      nextCampaign.reputation,
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
  }

  const daySeed = `${nextCampaign.seed}:day:${nextDayNumber}`
  const availablePartyRanks = remaining
    .filter((p) => !isRecoveringOnDay(p, nextDayNumber))
    .map((p) => p.party.rank)
  const requests = generateTavernRequestsForDay(
    daySeed,
    nextCampaign.reputation,
    availablePartyRanks,
  )
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
