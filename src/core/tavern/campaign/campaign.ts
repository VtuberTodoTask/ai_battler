import { deepClone } from '../../util.ts'
import { resolveTavernDay } from '../brokerage.ts'
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
  buildTavernDay,
  generateCampaignParty,
  generateInitialCampaignParties,
  generateTavernRequestsForDay,
  pickUniquePartyName,
} from './generators.ts'
import type {
  CampaignParty,
  TavernCampaignState,
  TavernDayRecord,
} from './types.ts'
import type { CampaignPartyEvent } from '../types.ts'

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

    if (party.departingCasualty) {
      postEvents.push({
        type: 'departedCasualty',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber,
      })
      continue
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
  }
  nextCampaign.history.push(dayRecord)

  return nextCampaign
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

  // 1. Remove parties that are departing (casualty first, then scheduled).
  const remaining: CampaignParty[] = []
  for (const party of parties) {
    if (party.departingCasualty) {
      // departedCasualty event is recorded on the day it is determined.
      continue
    }
    if (party.plannedDepartureDay < nextDayNumber) {
      preEvents.push({
        type: 'departedScheduled',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber: nextDayNumber,
      })
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

  return nextCampaign
}
