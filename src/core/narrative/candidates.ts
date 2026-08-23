import type {
  CampaignParty,
  CampaignRelationshipEvent,
  TavernCampaignState,
  TavernDayRecord,
} from '../tavern/campaign/types.ts'
import {
  buildExpeditionNarrativeContext,
  buildNarrativePartySnapshot,
  buildRecentHighlights,
} from './context.ts'
import type {
  CharacterEventNarrativeContext,
  CharacterNarrativeEventType,
  ExpeditionNarrativeContext,
  NarrativeCandidate,
} from './types.ts'
import type { BrokerageOfferAttempt } from '../tavern/types.ts'
import { getMissionSpecializationMatch } from '../tavern/specialization.ts'
import {
  BOND_CONVERSATION_EVENT_TYPE,
  BOND_CONVERSATION_MILESTONE_LABELS,
  deriveBondMilestoneCrossings,
  hasBondMilestoneOccurred,
  selectBondConversationFocalCharacter,
} from './bondConversation.ts'

const EVENT_PRIORITY: Record<CharacterNarrativeEventType, number> = {
  casualtyDeparture: 100,
  farewell: 90,
  becameFavorite: 80,
  becameRegular: 70,
  becameTrusted: 65,
  becameFamiliar: 62,
  stayExtended: 60,
  recoveryFinished: 50,
  weakObjectiveSuccess: 40,
  riskyRequestAccepted: 30,
  partyArrival: 10,
}

const EXPEDITION_PRIORITY = 0

interface PotentialCharacterEvent {
  eventType: CharacterNarrativeEventType
  title: string
  facts: Record<string, unknown>
  priority: number
}

function candidateId(
  dayNumber: number,
  category: 'expedition' | 'characterEvent',
  eventType: string | undefined,
  partyId: string,
  requestId: string | undefined,
): string {
  const parts = [
    'narrative',
    'v1',
    String(dayNumber),
    category,
    eventType ?? 'expedition',
    partyId,
  ]
  if (requestId) parts.push(requestId)
  return parts.join(':')
}

function makeCandidate(
  dayNumber: number,
  partyId: string,
  partyName: string,
  category: 'expedition' | 'characterEvent',
  title: string,
  context: NarrativeCandidate['context'],
  options: {
    eventType?: CharacterNarrativeEventType
    requestId?: string
    requestTitle?: string
    priority?: number
  } = {},
): NarrativeCandidate {
  const priority =
    options.priority ??
    (options.eventType
      ? EVENT_PRIORITY[options.eventType]
      : EXPEDITION_PRIORITY)
  return {
    id: candidateId(
      dayNumber,
      category,
      options.eventType,
      partyId,
      options.requestId,
    ),
    version: 1,
    category,
    eventType: options.eventType,
    dayNumber,
    partyId,
    partyName,
    requestId: options.requestId,
    requestTitle: options.requestTitle,
    priority,
    title,
    context,
    state: 'available',
  }
}

function findAcceptedOffer(
  day: TavernCampaignState['currentDay'],
  requestId: string,
  partyId: string,
): BrokerageOfferAttempt | undefined {
  return day.offers.find(
    (o) =>
      o.requestId === requestId &&
      o.partyId === partyId &&
      o.decision === 'accepted',
  )
}

function buildCharacterEventContext(
  party: CampaignParty,
  primary: PotentialCharacterEvent,
  secondary: PotentialCharacterEvent[],
  history: TavernDayRecord[],
): CharacterEventNarrativeContext {
  return {
    kind: 'characterEvent',
    eventType: primary.eventType,
    secondaryTriggers: secondary.map((s) => s.eventType),
    party: buildNarrativePartySnapshot(party),
    eventFacts: primary.facts,
    recentHighlights: buildRecentHighlights(party, history),
  }
}

function finalizeCharacterEvents(
  dayNumber: number,
  potentialsByParty: Map<
    string,
    { party: CampaignParty; events: PotentialCharacterEvent[] }
  >,
  history: TavernDayRecord[],
): NarrativeCandidate[] {
  const candidates: NarrativeCandidate[] = []

  for (const { party, events } of potentialsByParty.values()) {
    if (events.length === 0) continue
    events.sort((a, b) => b.priority - a.priority)
    const primary = events[0]!
    const secondary = events.slice(1)
    candidates.push(
      makeCandidate(
        dayNumber,
        party.id,
        party.party.name,
        'characterEvent',
        primary.title,
        buildCharacterEventContext(party, primary, secondary, history),
        { eventType: primary.eventType, priority: primary.priority },
      ),
    )
  }

  return candidates
}

export function deriveResolveCandidates(
  campaign: TavernCampaignState,
  relationshipEvents: CampaignRelationshipEvent[],
): NarrativeCandidate[] {
  const candidates: NarrativeCandidate[] = []
  const potentialsByParty = new Map<
    string,
    { party: CampaignParty; events: PotentialCharacterEvent[] }
  >()

  const dayNumber = campaign.dayNumber
  const day = campaign.currentDay

  function addPotential(party: CampaignParty, event: PotentialCharacterEvent) {
    let entry = potentialsByParty.get(party.id)
    if (!entry) {
      entry = { party, events: [] }
      potentialsByParty.set(party.id, entry)
    }
    entry.events.push(event)
  }

  for (const resolved of day.results) {
    if (
      resolved.status !== 'resolved' ||
      !resolved.result ||
      !resolved.report
    ) {
      continue
    }

    const party = campaign.parties.find((p) => p.id === resolved.partyId)
    if (!party) continue

    const request = day.requests.find((r) => r.id === resolved.requestId)
    if (!request) continue

    const acceptedOffer = findAcceptedOffer(day, request.id, party.id)

    const fullExpeditionContext = buildExpeditionNarrativeContext(
      party,
      request,
      resolved.report,
      acceptedOffer,
      resolved.result,
      dayNumber,
    )
    // Persist only the compact timeline and metrics; the full simulation state
    // is intentionally dropped from the campaign snapshot to avoid expensive
    // deep clones each day.
    const compactExpeditionContext: ExpeditionNarrativeContext = {
      ...fullExpeditionContext,
      state: undefined,
    }

    candidates.push(
      makeCandidate(
        dayNumber,
        party.id,
        party.party.name,
        'expedition',
        `遠征レポート：${request.title}`,
        compactExpeditionContext,
        {
          requestId: request.id,
          requestTitle: request.title,
        },
      ),
    )

    const outcome = resolved.result.outcome
    const specializationMatch = getMissionSpecializationMatch(
      party.party.missionSpecialization,
      request.objectiveType,
    )
    if (
      specializationMatch === 'weak' &&
      (outcome === 'completeSuccess' || outcome === 'success')
    ) {
      addPotential(party, {
        eventType: 'weakObjectiveSuccess',
        title: `苦手分野の成功：${party.party.name}`,
        facts: {
          objectiveType: request.objectiveType,
          outcome,
          weakObjective: party.party.missionSpecialization.weakObjective,
        },
        priority: EVENT_PRIORITY.weakObjectiveSuccess,
      })
    }

    if (acceptedOffer && acceptedOffer.evaluation.rankGap === 1) {
      addPotential(party, {
        eventType: 'riskyRequestAccepted',
        title: `格上依頼を受けた：${party.party.name}`,
        facts: {
          requestTitle: request.title,
          requestRank: request.rank,
          partyRank: party.party.rank,
          rankGap: acceptedOffer.evaluation.rankGap,
          acceptanceReason: acceptedOffer.reason,
        },
        priority: EVENT_PRIORITY.riskyRequestAccepted,
      })
    }
  }

  for (const event of relationshipEvents) {
    if (event.type !== 'affinityChanged') continue

    const party = campaign.parties.find((p) => p.id === event.partyId)
    if (!party) continue

    // Item 9: a single day's Affinity jump can (rarely) cross more than one
    // threshold; each un-fired milestone becomes its own potential event so
    // `finalizeCharacterEvents` can pick the highest-priority one as primary
    // and record the rest as secondary triggers, exactly like any other
    // same-day multi-event Party.
    const crossings = deriveBondMilestoneCrossings(event.before, event.after)
    for (const milestone of crossings) {
      // Item 10/11: a milestone fires at most once per Party ever, even
      // across Affinity drops and re-rises.
      if (hasBondMilestoneOccurred(campaign, party.id, milestone)) continue

      const focalCharacterId = selectBondConversationFocalCharacter(
        campaign,
        party,
        dayNumber,
        milestone,
      )
      // `selectBondConversationFocalCharacter` returns `undefined` only
      // when every member of the Party is deceased — there is no one left
      // to center a Bond Conversation on, so no candidate is created at
      // all (PR #60 review item 5/6), not merely one with a missing focal.
      if (!focalCharacterId) continue

      const eventType = BOND_CONVERSATION_EVENT_TYPE[milestone]

      addPotential(party, {
        eventType,
        title: `${BOND_CONVERSATION_MILESTONE_LABELS[milestone]}になった：${party.party.name}`,
        facts: {
          before: event.before,
          after: event.after,
          outcome: event.outcome,
          milestone,
          focalCharacterId,
        },
        priority: EVENT_PRIORITY[eventType],
      })
    }
  }

  candidates.push(
    ...finalizeCharacterEvents(dayNumber, potentialsByParty, campaign.history),
  )

  return candidates
}

export interface AdvanceCandidateContext {
  nextDayNumber: number
  departing: { party: CampaignParty; scheduled: boolean }[]
  recovered: CampaignParty[]
  extended: CampaignRelationshipEvent[]
  arrivals: CampaignParty[]
}

export function deriveAdvanceCandidates(
  campaign: TavernCampaignState,
  context: AdvanceCandidateContext,
): NarrativeCandidate[] {
  const potentialsByParty = new Map<
    string,
    { party: CampaignParty; events: PotentialCharacterEvent[] }
  >()

  function addPotential(party: CampaignParty, event: PotentialCharacterEvent) {
    let entry = potentialsByParty.get(party.id)
    if (!entry) {
      entry = { party, events: [] }
      potentialsByParty.set(party.id, entry)
    }
    entry.events.push(event)
  }

  for (const { party, scheduled } of context.departing) {
    if (scheduled && party.relationship.affinity >= 60) {
      const stayDays = Math.max(
        0,
        party.plannedDepartureDay - party.arrivalDay + 1,
      )
      addPotential(party, {
        eventType: 'farewell',
        title: `別れの挨拶：${party.party.name}`,
        facts: {
          arrivalDay: party.arrivalDay,
          departureDay: party.plannedDepartureDay,
          stayDays,
          finalAffinity: party.relationship.affinity,
          totalExpeditions: party.stats.totalExpeditions,
          completeSuccesses: party.stats.completeSuccesses,
        },
        priority: EVENT_PRIORITY.farewell,
      })
    }

    if (party.departingCasualty) {
      addPotential(party, {
        eventType: 'casualtyDeparture',
        title: `死亡者を伴う離脱：${party.party.name}`,
        facts: {
          deadMemberNames: party.party.members
            .filter((m) => m.currentHp <= 0)
            .map((m) => m.name),
          survivorNames: party.party.members
            .filter((m) => m.currentHp > 0)
            .map((m) => m.name),
        },
        priority: EVENT_PRIORITY.casualtyDeparture,
      })
    }
  }

  for (const party of context.recovered) {
    addPotential(party, {
      eventType: 'recoveryFinished',
      title: `療養完了：${party.party.name}`,
      facts: {},
      priority: EVENT_PRIORITY.recoveryFinished,
    })
  }

  for (const stayEvent of context.extended) {
    if (stayEvent.type !== 'stayExtended') continue
    const party = campaign.parties.find((p) => p.id === stayEvent.partyId)
    if (!party) continue
    addPotential(party, {
      eventType: 'stayExtended',
      title: `滞在延長：${party.party.name}`,
      facts: {
        previousDepartureDay: stayEvent.previousDepartureDay,
        newDepartureDay: stayEvent.newDepartureDay,
        extensionDays: stayEvent.extensionDays,
        affinity: stayEvent.affinity,
        primaryReason: stayEvent.primaryReason,
        secondaryReason: stayEvent.secondaryReason,
        presentationPlan: stayEvent.presentationPlan,
        relevantCharacterIds: stayEvent.relevantCharacterIds,
      },
      priority: EVENT_PRIORITY.stayExtended,
    })
  }

  for (const party of context.arrivals) {
    addPotential(party, {
      eventType: 'partyArrival',
      title: `新しい顔：${party.party.name}`,
      facts: {
        arrivalDay: party.arrivalDay,
        plannedDepartureDay: party.plannedDepartureDay,
      },
      priority: EVENT_PRIORITY.partyArrival,
    })
  }

  return finalizeCharacterEvents(
    context.nextDayNumber,
    potentialsByParty,
    campaign.history,
  )
}

export function mergeCandidates(
  existing: NarrativeCandidate[],
  derived: NarrativeCandidate[],
): NarrativeCandidate[] {
  const map = new Map(existing.map((c) => [c.id, c]))
  for (const c of derived) {
    if (!map.has(c.id)) {
      map.set(c.id, c)
    }
  }
  return [...map.values()]
}
