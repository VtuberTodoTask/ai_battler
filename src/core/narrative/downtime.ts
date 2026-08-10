import { SeededRng } from '../rng/seededRng.ts'

import type { CampaignParty } from '../tavern/campaign/types.ts'
import type { CharacterRelationship } from './types.ts'
import type {
  DowntimeEvent,
  DowntimeEventType,
  DowntimeRelationshipDelta,
  MemoryValence,
  RelationshipMemory,
  RelationshipMemoryType,
} from './types.ts'
import { updateArcSignals } from './arcSignals.ts'
import { updateRelationshipMilestones } from './milestones.ts'

export const DOWNTIME_PROMPT_VERSION = 'v1'

const MIN_RELATIONSHIP = 0
const MAX_RELATIONSHIP = 100

function clampRelationship(value: number): number {
  return Math.max(MIN_RELATIONSHIP, Math.min(MAX_RELATIONSHIP, value))
}

function relationshipKey(sourceId: string, targetId: string): string {
  return `${sourceId}:${targetId}`
}

function sortedPairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

function ensureRelationship(
  relationships: Record<string, CharacterRelationship>,
  sourceId: string,
  targetId: string,
): CharacterRelationship {
  const key = relationshipKey(sourceId, targetId)
  if (!relationships[key]) {
    relationships[key] = {
      sourceCharacterId: sourceId,
      targetCharacterId: targetId,
      affinity: 50,
      trust: 50,
      respect: 50,
      tension: 50,
      sharedExpeditions: 0,
      tags: [],
      recentEvents: [],
    }
  }
  return relationships[key]!
}

interface EventDeltaSet {
  mutual?: {
    affinity?: number
    trust?: number
    respect?: number
    tension?: number
    romanticAttraction?: number
  }
  sourceToTarget?: {
    affinity?: number
    trust?: number
    respect?: number
    tension?: number
    romanticAttraction?: number
  }
  targetToSource?: {
    affinity?: number
    trust?: number
    respect?: number
    tension?: number
    romanticAttraction?: number
  }
}

interface DowntimeEventDefinition {
  type: DowntimeEventType
  category: 'relationship' | 'flavor'
  baseWeight: number
  valence: MemoryValence
  importance: number
  memoryEligible: boolean
  excludedIfRecovering: boolean
  minParticipants: number
  maxParticipants: number
  narrativeKey: string
  deltas: EventDeltaSet
}

const EVENT_DEFINITIONS: DowntimeEventDefinition[] = [
  {
    type: 'shared_meal',
    category: 'relationship',
    baseWeight: 10,
    valence: 'positive',
    importance: 2,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'shared_meal',
    deltas: { mutual: { affinity: 1 } },
  },
  {
    type: 'casual_conversation',
    category: 'relationship',
    baseWeight: 10,
    valence: 'positive',
    importance: 2,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'casual_conversation',
    deltas: { mutual: { affinity: 1 } },
  },
  {
    type: 'quiet_company',
    category: 'relationship',
    baseWeight: 8,
    valence: 'positive',
    importance: 2,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'quiet_company',
    deltas: { mutual: { affinity: 1 } },
  },
  {
    type: 'equipment_help',
    category: 'relationship',
    baseWeight: 7,
    valence: 'positive',
    importance: 3,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'equipment_help',
    deltas: {
      sourceToTarget: { affinity: 1 },
      targetToSource: { trust: 1, respect: 1 },
    },
  },
  {
    type: 'planning_together',
    category: 'relationship',
    baseWeight: 6,
    valence: 'positive',
    importance: 3,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'planning_together',
    deltas: { mutual: { trust: 1, respect: 1 } },
  },
  {
    type: 'shared_chore',
    category: 'relationship',
    baseWeight: 8,
    valence: 'positive',
    importance: 2,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'shared_chore',
    deltas: { mutual: { affinity: 1, trust: 1 } },
  },
  {
    type: 'minor_argument',
    category: 'relationship',
    baseWeight: 7,
    valence: 'negative',
    importance: 4,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'minor_argument',
    deltas: { mutual: { tension: 2, affinity: -1 } },
  },
  {
    type: 'annoying_habit',
    category: 'relationship',
    baseWeight: 5,
    valence: 'negative',
    importance: 2,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'annoying_habit',
    deltas: {
      sourceToTarget: { tension: 1 },
      targetToSource: { affinity: -1 },
    },
  },
  {
    type: 'misunderstanding',
    category: 'relationship',
    baseWeight: 5,
    valence: 'negative',
    importance: 4,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'misunderstanding',
    deltas: { mutual: { trust: -1, tension: 1 } },
  },
  {
    type: 'resource_disagreement',
    category: 'relationship',
    baseWeight: 5,
    valence: 'negative',
    importance: 4,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'resource_disagreement',
    deltas: { mutual: { tension: 2, respect: -1 } },
  },
  {
    type: 'competitive_activity',
    category: 'relationship',
    baseWeight: 5,
    valence: 'mixed',
    importance: 3,
    memoryEligible: true,
    excludedIfRecovering: true,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'competitive_activity',
    deltas: { mutual: { respect: 1, tension: 1 } },
  },
  {
    type: 'mixed_working_session',
    category: 'relationship',
    baseWeight: 6,
    valence: 'mixed',
    importance: 3,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'mixed_working_session',
    deltas: { mutual: { trust: 1, tension: 1 } },
  },
  {
    type: 'recovery_assistance',
    category: 'relationship',
    baseWeight: 6,
    valence: 'positive',
    importance: 4,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'recovery_assistance',
    deltas: {
      sourceToTarget: { respect: 1 },
      targetToSource: { trust: 2, affinity: 1 },
    },
  },
  {
    type: 'unexpected_common_ground',
    category: 'relationship',
    baseWeight: 2,
    valence: 'positive',
    importance: 4,
    memoryEligible: true,
    excludedIfRecovering: false,
    minParticipants: 2,
    maxParticipants: 2,
    narrativeKey: 'unexpected_common_ground',
    deltas: { mutual: { affinity: 1, respect: 1 } },
  },
  {
    type: 'personal_space',
    category: 'flavor',
    baseWeight: 10,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 4,
    narrativeKey: 'personal_space',
    deltas: {},
  },
  {
    type: 'no_notable_event',
    category: 'flavor',
    baseWeight: 10,
    valence: 'neutral',
    importance: 0,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 4,
    narrativeKey: 'no_notable_event',
    deltas: {},
  },
  {
    type: 'solo_equipment_maintenance',
    category: 'flavor',
    baseWeight: 6,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'solo_equipment_maintenance',
    deltas: {},
  },
  {
    type: 'reading',
    category: 'flavor',
    baseWeight: 5,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'reading',
    deltas: {},
  },
  {
    type: 'sleeping',
    category: 'flavor',
    baseWeight: 8,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 4,
    narrativeKey: 'sleeping',
    deltas: {},
  },
  {
    type: 'quiet_drinking',
    category: 'flavor',
    baseWeight: 6,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 3,
    narrativeKey: 'quiet_drinking',
    deltas: {},
  },
  {
    type: 'writing_notes',
    category: 'flavor',
    baseWeight: 5,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'writing_notes',
    deltas: {},
  },
  {
    type: 'watching_other_adventurers',
    category: 'flavor',
    baseWeight: 5,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'watching_other_adventurers',
    deltas: {},
  },
  {
    type: 'resting_in_room',
    category: 'flavor',
    baseWeight: 7,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'resting_in_room',
    deltas: {},
  },
  {
    type: 'checking_bandages',
    category: 'flavor',
    baseWeight: 6,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'checking_bandages',
    deltas: {},
  },
  {
    type: 'slow_meal',
    category: 'flavor',
    baseWeight: 6,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'slow_meal',
    deltas: {},
  },
  {
    type: 'watching_party_prepare',
    category: 'flavor',
    baseWeight: 5,
    valence: 'neutral',
    importance: 1,
    memoryEligible: false,
    excludedIfRecovering: false,
    minParticipants: 1,
    maxParticipants: 1,
    narrativeKey: 'watching_party_prepare',
    deltas: {},
  },
]

const EVENT_DEF_BY_TYPE = new Map<DowntimeEventType, DowntimeEventDefinition>(
  EVENT_DEFINITIONS.map((d) => [d.type, d]),
)

export interface DowntimeConfig {
  relationshipEventChance: number
  flavorEventChance: number
  maxFlavorEvents: number
  pairRepetitionWindowDays: number
  eventCooldownDays: number
  romanticDeltaEnabled: boolean
  relationshipEventWeightOverride?: Partial<Record<DowntimeEventType, number>>
}

export const DEFAULT_DOWNTIME_CONFIG: DowntimeConfig = {
  relationshipEventChance: 35,
  flavorEventChance: 35,
  maxFlavorEvents: 2,
  pairRepetitionWindowDays: 3,
  eventCooldownDays: 2,
  romanticDeltaEnabled: false,
}

function isRecovering(party: CampaignParty, dayNumber: number): boolean {
  return (
    party.recoveringThroughDay !== undefined &&
    dayNumber <= party.recoveringThroughDay
  )
}

function eligibleMembers(
  party: CampaignParty,
): { id: string; name?: string }[] {
  const incapacitated = new Set(party.condition.incapacitatedIds ?? [])
  return party.party.members
    .filter((m) => !incapacitated.has(m.id))
    .map((m) => ({ id: m.id, name: m.name }))
}

function orderedPairs(members: { id: string }[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = 0; j < members.length; j++) {
      if (i === j) continue
      pairs.push([members[i]!.id, members[j]!.id])
    }
  }
  return pairs
}

function getRelationship(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
): CharacterRelationship | undefined {
  return party.memberRelationships?.[relationshipKey(sourceId, targetId)]
}

function pairEventCount(
  party: CampaignParty,
  a: string,
  b: string,
  dayNumber: number,
  window: number,
): number {
  if (!party.downtimeEvents) return 0
  const key = sortedPairKey(a, b)
  return party.downtimeEvents.filter((e) => {
    if (e.day < dayNumber - window || e.day >= dayNumber) return false
    const ids = e.participantIds
    if (ids.length < 2) return false
    return sortedPairKey(ids[0]!, ids[1]!) === key
  }).length
}

function recentEventTypeForPair(
  party: CampaignParty,
  a: string,
  b: string,
  type: DowntimeEventType,
  dayNumber: number,
  cooldown: number,
): boolean {
  if (!party.downtimeEvents) return false
  const key = sortedPairKey(a, b)
  return party.downtimeEvents.some((e) => {
    if (e.type !== type) return false
    if (e.day < dayNumber - cooldown || e.day >= dayNumber) return false
    if (e.participantIds.length < 2) return false
    return sortedPairKey(e.participantIds[0]!, e.participantIds[1]!) === key
  })
}

function computePairWeight(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
  dayNumber: number,
  config: DowntimeConfig,
): number {
  const rel = getRelationship(party, sourceId, targetId)
  let weight = 1.0

  if (rel) {
    weight += (rel.affinity - 50) * 0.01
    weight += (rel.trust - 50) * 0.01
    weight += (rel.respect - 50) * 0.005
    weight += (rel.tension - 50) * 0.005
  }

  const repetition = pairEventCount(
    party,
    sourceId,
    targetId,
    dayNumber,
    config.pairRepetitionWindowDays,
  )
  weight -= repetition * 0.6

  const milestoneTypes = new Set(
    (party.relationshipMilestones ?? [])
      .filter((m) => m.status === 'active')
      .filter(
        (m) =>
          m.characterIds.includes(sourceId) &&
          m.characterIds.includes(targetId),
      )
      .map((m) => m.type),
  )
  if (milestoneTypes.has('established_trusted_friction')) {
    weight += 0.3
  }
  if (milestoneTypes.has('persistent_romantic_interest')) {
    weight += 0.2
  }

  const arcTypes = new Set(
    (party.arcSignals ?? [])
      .filter(
        (s) =>
          s.characterIds.includes(sourceId) &&
          s.characterIds.includes(targetId),
      )
      .map((s) => s.type),
  )
  if (
    arcTypes.has('growing_reliance') ||
    arcTypes.has('comfortable_familiarity')
  ) {
    weight += 0.2
  }
  if (arcTypes.has('recurring_conflict')) {
    weight += 0.2
  }

  return Math.max(0.1, weight)
}

function selectPair(
  rng: SeededRng,
  party: CampaignParty,
  pairs: [string, string][],
  dayNumber: number,
  config: DowntimeConfig,
): [string, string] {
  const weights = pairs.map(([a, b]) =>
    computePairWeight(party, a, b, dayNumber, config),
  )
  return rng.weightedPick(pairs, weights)
}

function selectRelationshipEventType(
  rng: SeededRng,
  party: CampaignParty,
  pair: [string, string],
  state: 'idle' | 'recovering',
  dayNumber: number,
  config: DowntimeConfig,
): DowntimeEventType {
  const [sourceId, targetId] = pair
  const rel = getRelationship(party, sourceId, targetId)
  const defs = EVENT_DEFINITIONS.filter((d) => d.category === 'relationship')
  const weights = defs.map((def) =>
    computeEventWeight(def, party, pair, rel, state, dayNumber, config),
  )
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    return 'no_notable_event'
  }
  return rng.weightedPick(
    defs.map((d) => d.type),
    weights,
  )
}

function computeEventWeight(
  def: DowntimeEventDefinition,
  party: CampaignParty,
  pair: [string, string],
  rel: CharacterRelationship | undefined,
  state: 'idle' | 'recovering',
  dayNumber: number,
  config: DowntimeConfig,
): number {
  if (state === 'recovering' && def.excludedIfRecovering) {
    return 0
  }

  if (
    def.type !== 'recovery_assistance' &&
    state === 'recovering' &&
    def.baseWeight < 5
  ) {
    // recovering characters tend toward low-key activities
  }

  let weight =
    config.relationshipEventWeightOverride?.[def.type] ?? def.baseWeight

  if (
    recentEventTypeForPair(
      party,
      pair[0],
      pair[1],
      def.type,
      dayNumber,
      config.eventCooldownDays,
    )
  ) {
    return 0
  }

  const affinity = rel?.affinity ?? 50
  const trust = rel?.trust ?? 50
  const tension = rel?.tension ?? 50
  const respect = rel?.respect ?? 50

  if (def.valence === 'positive') {
    weight += (affinity - 50) * 0.15
    weight += (trust - 50) * 0.15
    weight -= (tension - 50) * 0.05
  } else if (def.valence === 'negative') {
    weight += (tension - 50) * 0.2
    weight -= (affinity - 50) * 0.05
  } else if (def.valence === 'mixed') {
    weight += (tension - 50) * 0.1
    weight += (affinity - 50) * 0.05
    weight += (respect - 50) * 0.05
  }

  if (def.type === 'recovery_assistance') {
    if (state === 'recovering') weight += 4
    else weight -= 2
  }

  if (def.type === 'competitive_activity') {
    if (tension > 55 && respect > 55) weight += 2
  }

  if (def.type === 'unexpected_common_ground') {
    // small surprise chance, not a guaranteed positive
    weight += 0.5
  }

  const arcTypes = new Set(
    (party.arcSignals ?? [])
      .filter(
        (s) =>
          s.characterIds.includes(pair[0]) && s.characterIds.includes(pair[1]),
      )
      .map((s) => s.type),
  )
  if (
    (arcTypes.has('growing_reliance') ||
      arcTypes.has('comfortable_familiarity')) &&
    ['equipment_help', 'planning_together', 'shared_chore'].includes(def.type)
  ) {
    weight += 2
  }
  if (
    arcTypes.has('recurring_conflict') &&
    [
      'minor_argument',
      'resource_disagreement',
      'mixed_working_session',
    ].includes(def.type)
  ) {
    weight += 2
  }

  const milestoneTypes = new Set(
    (party.relationshipMilestones ?? [])
      .filter((m) => m.status === 'active')
      .filter(
        (m) =>
          m.characterIds.includes(pair[0]) && m.characterIds.includes(pair[1]),
      )
      .map((m) => m.type),
  )
  if (
    milestoneTypes.has('established_trusted_friction') &&
    [
      'mixed_working_session',
      'competitive_activity',
      'minor_argument',
    ].includes(def.type)
  ) {
    weight += 2
  }

  if (state === 'recovering' && def.excludedIfRecovering) {
    return 0
  }

  return Math.max(0, weight)
}

function selectFlavorEventType(
  rng: SeededRng,
  state: 'idle' | 'recovering',
  participantCount: number,
  _dayNumber: number,
): DowntimeEventType {
  const flavorDefs = EVENT_DEFINITIONS.filter(
    (d) =>
      d.category === 'flavor' &&
      d.minParticipants <= participantCount &&
      d.maxParticipants >= participantCount,
  )
  if (state === 'recovering') {
    const recoveryFlavor = flavorDefs.filter((d) =>
      [
        'resting_in_room',
        'checking_bandages',
        'slow_meal',
        'watching_party_prepare',
        'sleeping',
        'personal_space',
        'no_notable_event',
      ].includes(d.type),
    )
    if (recoveryFlavor.length > 0) {
      return rng.pick(recoveryFlavor).type
    }
  }
  if (flavorDefs.length === 0) return 'no_notable_event'
  return rng.pick(flavorDefs).type
}

function buildDeltas(
  def: DowntimeEventDefinition,
  sourceId: string,
  targetId: string,
  config: DowntimeConfig,
): DowntimeRelationshipDelta[] {
  const deltas: DowntimeRelationshipDelta[] = []
  const apply = (
    from: string,
    to: string,
    set?: {
      affinity?: number
      trust?: number
      respect?: number
      tension?: number
      romanticAttraction?: number
    },
  ) => {
    if (!set) return
    const delta: DowntimeRelationshipDelta = {
      sourceCharacterId: from,
      targetCharacterId: to,
    }
    if (set.affinity !== undefined) delta.affinity = set.affinity
    if (set.trust !== undefined) delta.trust = set.trust
    if (set.respect !== undefined) delta.respect = set.respect
    if (set.tension !== undefined) delta.tension = set.tension
    if (set.romanticAttraction !== undefined && config.romanticDeltaEnabled) {
      delta.romanticAttraction = set.romanticAttraction
    }
    deltas.push(delta)
  }

  apply(sourceId, targetId, def.deltas.sourceToTarget)
  apply(targetId, sourceId, def.deltas.targetToSource)
  if (def.deltas.mutual) {
    apply(sourceId, targetId, def.deltas.mutual)
    apply(targetId, sourceId, def.deltas.mutual)
  }

  return deltas
}

export function createDowntimeEvent(
  party: CampaignParty,
  type: DowntimeEventType,
  participants: string[],
  dayNumber: number,
  state: 'idle' | 'recovering',
  config: DowntimeConfig = DEFAULT_DOWNTIME_CONFIG,
): DowntimeEvent {
  const def = EVENT_DEF_BY_TYPE.get(type)!
  const id = `downtime:${party.id}:${dayNumber}:${type}:${Math.random().toString(36).slice(2, 8)}`
  const sourceId = participants[0]
  const targetId = participants[1]
  const relationshipDeltas =
    sourceId && targetId ? buildDeltas(def, sourceId, targetId, config) : []

  const fallback = downtimeFallbackSummary(
    type,
    participants,
    party.party.members,
  )

  return {
    id,
    day: dayNumber,
    type,
    participantIds: [...participants],
    sourceCharacterId: sourceId,
    targetCharacterId: targetId,
    valence: def.valence,
    importance: def.importance,
    relationshipDeltas,
    memoryEligible: def.memoryEligible,
    narrativeKey: def.narrativeKey,
    createdAtDay: dayNumber,
    narrativeStatus: 'unseen',
    fallbackSummary: fallback,
  }
}

export function resolveDowntimeForParty(
  party: CampaignParty,
  dayNumber: number,
  campaignSeed: string,
  config: DowntimeConfig = DEFAULT_DOWNTIME_CONFIG,
): DowntimeEvent[] {
  if (party.downtimeEvents?.some((e) => e.day === dayNumber)) {
    return []
  }

  const rng = new SeededRng(`${campaignSeed}:downtime:${dayNumber}:${party.id}`)
  const state: 'idle' | 'recovering' = isRecovering(party, dayNumber)
    ? 'recovering'
    : 'idle'

  party.downtimeEvents ??= []
  const events: DowntimeEvent[] = []

  const members = eligibleMembers(party)
  if (members.length === 0) return events

  // Relationship-changing event budget: 0-1 per party per day.
  if (rng.chance(config.relationshipEventChance) && members.length >= 2) {
    const pairs = orderedPairs(members)
    const selected = selectPair(rng, party, pairs, dayNumber, config)
    const eventType = selectRelationshipEventType(
      rng,
      party,
      selected,
      state,
      dayNumber,
      config,
    )
    if (eventType !== 'no_notable_event') {
      const event = createDowntimeEvent(
        party,
        eventType,
        [selected[0], selected[1]],
        dayNumber,
        state,
        config,
      )
      events.push(event)
      party.downtimeEvents.push(event)
    }
  }

  // Flavor event budget: 0-max per party per day.
  if (rng.chance(config.flavorEventChance)) {
    const flavorCount = rng.integer(0, config.maxFlavorEvents)
    for (let i = 0; i < flavorCount; i++) {
      const participantCount = members.length >= 2 ? rng.pick([1, 1, 1, 2]) : 1
      const selectedMembers = rng
        .shuffle([...members])
        .slice(0, participantCount)
      const participantIds = selectedMembers.map((m) => m.id)
      const flavorType = selectFlavorEventType(
        rng,
        state,
        participantIds.length,
        dayNumber,
      )
      const event = createDowntimeEvent(
        party,
        flavorType,
        participantIds,
        dayNumber,
        state,
        config,
      )
      events.push(event)
      party.downtimeEvents.push(event)
    }
  }

  return events
}

export function applyDowntimeEvent(
  party: CampaignParty,
  event: DowntimeEvent,
  dayNumber: number,
): void {
  if (!party.memberRelationships) {
    party.memberRelationships = {}
  }

  for (const delta of event.relationshipDeltas) {
    const rel = ensureRelationship(
      party.memberRelationships,
      delta.sourceCharacterId,
      delta.targetCharacterId,
    )
    if (delta.affinity !== undefined) {
      rel.affinity = clampRelationship(rel.affinity + delta.affinity)
    }
    if (delta.trust !== undefined) {
      rel.trust = clampRelationship(rel.trust + delta.trust)
    }
    if (delta.respect !== undefined) {
      rel.respect = clampRelationship(rel.respect + delta.respect)
    }
    if (delta.tension !== undefined) {
      rel.tension = clampRelationship(rel.tension + delta.tension)
    }
    if (delta.romanticAttraction !== undefined) {
      rel.romanticAttraction = clampRelationship(
        (rel.romanticAttraction ?? 0) + delta.romanticAttraction,
      )
    }
  }

  if (event.memoryEligible && event.participantIds.length >= 2) {
    addDowntimeRelationshipMemory(party, event, dayNumber)
  }
}

function memoryTypeForEvent(
  type: DowntimeEventType,
): RelationshipMemoryType | null {
  switch (type) {
    case 'equipment_help':
    case 'planning_together':
      return 'supported'
    case 'shared_chore':
      return 'shared_success'
    case 'minor_argument':
    case 'annoying_habit':
    case 'misunderstanding':
      return 'conflict'
    case 'resource_disagreement':
      return 'disagreement'
    case 'competitive_activity':
    case 'mixed_working_session':
    case 'unexpected_common_ground':
      return 'shared_success'
    case 'recovery_assistance':
      return 'healed'
    default:
      return null
  }
}

function memberName(party: CampaignParty, id: string): string {
  return party.party.members.find((m) => m.id === id)?.name ?? id
}

function addDowntimeRelationshipMemory(
  party: CampaignParty,
  event: DowntimeEvent,
  dayNumber: number,
): void {
  const type = memoryTypeForEvent(event.type)
  if (!type) return

  const sourceId = event.sourceCharacterId ?? event.participantIds[0]
  const targetId = event.targetCharacterId ?? event.participantIds[1]
  if (!sourceId || !targetId) return

  const sourceName = memberName(party, sourceId)
  const targetName = memberName(party, targetId)

  const summaries: Record<string, string> = {
    equipment_help: `${targetName}の装備を手入れした`,
    planning_together: `${targetName}と次の行動を相談した`,
    shared_chore: `${targetName}と雑務を共にした`,
    minor_argument: `${targetName}と小さな口論になった`,
    annoying_habit: `${targetName}の習慣が気に障った`,
    misunderstanding: `${targetName}と誤解が生じた`,
    resource_disagreement: `${targetName}と物資の配分で意見が合わなかった`,
    competitive_activity: `${targetName}と競い合った`,
    mixed_working_session: `${targetName}と作業を進めた`,
    unexpected_common_ground: `${targetName}と意外な共通点を見つけた`,
    recovery_assistance: `${targetName}の介護を手伝った`,
  }

  const forward = ensureRelationship(
    party.memberRelationships!,
    sourceId,
    targetId,
  )
  const reverse = ensureRelationship(
    party.memberRelationships!,
    targetId,
    sourceId,
  )

  const existingForward = forward.recentEvents?.find(
    (m) => m.day === dayNumber && m.type === type,
  )
  const existingReverse = reverse.recentEvents?.find(
    (m) => m.day === dayNumber && m.type === type,
  )

  if (!existingForward) {
    pushRelationshipMemory(
      forward,
      type,
      summaries[event.type] ?? `${event.type}`,
      event.importance,
      dayNumber,
    )
  }
  if (!existingReverse && sourceId !== targetId) {
    const reverseSummary = reverseSummaryForType(event.type, sourceName)
    if (reverseSummary) {
      pushRelationshipMemory(
        reverse,
        type,
        reverseSummary,
        event.importance,
        dayNumber,
      )
    }
  }
}

function reverseSummaryForType(
  type: DowntimeEventType,
  sourceName: string,
): string | null {
  switch (type) {
    case 'equipment_help':
      return `${sourceName}に装備を手入れしてもらった`
    case 'planning_together':
      return `${sourceName}と次の行動を相談した`
    case 'shared_chore':
      return `${sourceName}と雑務を共にした`
    case 'minor_argument':
      return `${sourceName}と小さな口論になった`
    case 'annoying_habit':
      return `${sourceName}の気に障る習慣に気づかれた`
    case 'misunderstanding':
      return `${sourceName}と誤解が生じた`
    case 'resource_disagreement':
      return `${sourceName}と物資の配分で意見が合わなかった`
    case 'competitive_activity':
      return `${sourceName}と競い合った`
    case 'mixed_working_session':
      return `${sourceName}と作業を進めた`
    case 'unexpected_common_ground':
      return `${sourceName}と意外な共通点を見つけた`
    case 'recovery_assistance':
      return `${sourceName}に介護を手伝ってもらった`
    default:
      return null
  }
}

function pushRelationshipMemory(
  rel: CharacterRelationship,
  type: RelationshipMemoryType,
  summary: string,
  importance: number,
  dayNumber: number,
): void {
  rel.recentEvents ??= []
  const existingCount = rel.recentEvents.length
  const memory: RelationshipMemory = {
    id: `downtime:${rel.sourceCharacterId}:${rel.targetCharacterId}:${type}:${existingCount}`,
    sourceCharacterId: rel.sourceCharacterId,
    targetCharacterId: rel.targetCharacterId,
    day: dayNumber,
    type,
    summary,
    importance,
    valence: memoryValenceFor(type),
    createdAtDay: dayNumber,
    lastReferencedDay: dayNumber,
  }
  rel.recentEvents.unshift(memory)
  if (rel.recentEvents.length > 20) {
    rel.recentEvents = rel.recentEvents.slice(0, 20)
  }
}

function memoryValenceFor(type: RelationshipMemoryType): MemoryValence {
  const positive: RelationshipMemoryType[] = [
    'rescued',
    'healed',
    'protected',
    'supported',
    'shared_success',
    'trust_event',
    'romantic_moment',
  ]
  const negative: RelationshipMemoryType[] = [
    'abandoned',
    'conflict',
    'disagreement',
    'shared_failure',
    'retreat',
    'casualty',
  ]
  if (positive.includes(type)) return 'positive'
  if (negative.includes(type)) return 'negative'
  return 'neutral'
}

function downtimeFallbackSummary(
  type: DowntimeEventType,
  participantIds: string[],
  members: { id: string; name?: string }[],
): string {
  const names = participantIds.map(
    (id) => members.find((m) => m.id === id)?.name ?? id,
  )
  if (names.length >= 2) {
    const pair = `${names[0]}と${names[1]}`
    switch (type) {
      case 'shared_meal':
        return `${pair}が食事を共にした。`
      case 'casual_conversation':
        return `${pair}がしばらく話していた。`
      case 'quiet_company':
        return `${pair}が黙々と過ごした。`
      case 'equipment_help':
        return `${names[0]}が${names[1]}の装備を手入れした。`
      case 'planning_together':
        return `${pair}が次の行動を相談した。`
      case 'shared_chore':
        return `${pair}が雑務を共にした。`
      case 'minor_argument':
        return `${pair}が小さな口論になった。`
      case 'annoying_habit':
        return `${names[0]}が${names[1]}の習慣に気に障った。`
      case 'misunderstanding':
        return `${pair}の間に誤解が生じた。`
      case 'resource_disagreement':
        return `${pair}が物資の配分で意見を交わした。`
      case 'competitive_activity':
        return `${pair}が競い合った。`
      case 'mixed_working_session':
        return `${pair}が作業を進めた。`
      case 'recovery_assistance':
        return `${names[0]}が${names[1]}の介護を手伝った。`
      case 'unexpected_common_ground':
        return `${pair}が意外な共通点を見つけた。`
      default:
        return `${pair}が何かを共にした。`
    }
  }

  const name = names[0] ?? '誰か'
  switch (type) {
    case 'personal_space':
    case 'no_notable_event':
      return `${name}に特に目立ったことはなかった。`
    case 'solo_equipment_maintenance':
      return `${name}が装備を手入れした。`
    case 'reading':
      return `${name}が本を読んでいた。`
    case 'sleeping':
      return `${name}が休んでいた。`
    case 'quiet_drinking':
      return `${name}が静かに酒を飲んでいた。`
    case 'writing_notes':
      return `${name}が書類を整理していた。`
    case 'watching_other_adventurers':
      return `${name}が他の冒険者を見ていた。`
    case 'resting_in_room':
      return `${name}が部屋で休んでいた。`
    case 'checking_bandages':
      return `${name}が傷の手当てを確認した。`
    case 'slow_meal':
      return `${name}がゆっくり食事をした。`
    case 'watching_party_prepare':
      return `${name}が仲間の準備を見守っていた。`
    default:
      return `${name}が過ごしていた。`
  }
}

export function downtimeEventSummary(
  event: DowntimeEvent,
  members: { id: string; name?: string }[],
): string {
  const names = event.participantIds.map(
    (id) => members.find((m) => m.id === id)?.name ?? id,
  )
  if (names.length >= 2) {
    return `${names[0]}と${names[1]}が${eventNoun(event.type)}ようです`
  }
  return `${names[0] ?? '誰か'}が${eventNoun(event.type)}ようです`
}

function eventNoun(type: DowntimeEventType): string {
  switch (type) {
    case 'shared_meal':
      return 'しばらく食事をしていた'
    case 'casual_conversation':
      return '話していた'
    case 'quiet_company':
      return '一緒にいた'
    case 'equipment_help':
      return '装備の手入れをしていた'
    case 'planning_together':
      return '相談していた'
    case 'shared_chore':
      return '雑務をしていた'
    case 'minor_argument':
      return '少し揉め事があった'
    case 'annoying_habit':
      return '気に障る様子があった'
    case 'misunderstanding':
      return '誤解があった'
    case 'resource_disagreement':
      return '物資の話をしていた'
    case 'competitive_activity':
      return '競い合っていた'
    case 'mixed_working_session':
      return '作業をしていた'
    case 'recovery_assistance':
      return '介護をしていた'
    case 'unexpected_common_ground':
      return '意外に意気投合していた'
    case 'personal_space':
    case 'no_notable_event':
      return '特に何もなかった'
    case 'solo_equipment_maintenance':
      return '装備を手入れしていた'
    case 'reading':
      return '本を読んでいた'
    case 'sleeping':
      return '休んでいた'
    case 'quiet_drinking':
      return '酒を飲んでいた'
    case 'writing_notes':
      return '書類を整理していた'
    case 'watching_other_adventurers':
      return '他の冒険者を見ていた'
    case 'resting_in_room':
      return '部屋で休んでいた'
    case 'checking_bandages':
      return '傷を確認していた'
    case 'slow_meal':
      return 'ゆっくり食事をしていた'
    case 'watching_party_prepare':
      return '仲間の準備を見守っていた'
    default:
      return '何かをしていた'
  }
}

export function resolveDowntimeForCampaign(
  campaign: { seed: string; dayNumber: number; parties: CampaignParty[] },
  dispatchedPartyIds: Set<string>,
  config: DowntimeConfig = DEFAULT_DOWNTIME_CONFIG,
): void {
  for (const party of campaign.parties) {
    if (dispatchedPartyIds.has(party.id)) continue
    if (party.departingCasualty) continue

    const events = resolveDowntimeForParty(
      party,
      campaign.dayNumber,
      campaign.seed,
      config,
    )
    for (const event of events) {
      applyDowntimeEvent(party, event, campaign.dayNumber)
    }
    if (
      events.length > 0 &&
      events.some(
        (e) => EVENT_DEF_BY_TYPE.get(e.type)?.category === 'relationship',
      )
    ) {
      updateArcSignals(party, campaign.dayNumber)
      updateRelationshipMilestones(party, campaign.dayNumber)
    }
  }
}

export function buildDowntimePrompt(
  event: DowntimeEvent,
  party: CampaignParty,
): { systemPrompt: string; userPrompt: string } {
  const memberMap = new Map(party.party.members.map((m) => [m.id, m]))
  const names = event.participantIds
    .map((id) => memberMap.get(id)?.name ?? id)
    .join('、')

  const systemPrompt = [
    'You are a short-scene narrator for a fantasy tavern-life RPG.',
    `DOWNTIME_PROMPT_VERSION = ${DOWNTIME_PROMPT_VERSION}`,
    '',
    '=== DOWNTIME EVENT ===',
    `Type: ${event.type}`,
    `Participants: ${names}`,
    `Valence: ${event.valence}`,
    '',
    '=== CHARACTERS ===',
    ...party.party.members.map((m) => {
      const identity: string[] = []
      if (m.identity?.gender) identity.push(`gender: ${m.identity.gender}`)
      if (m.identity?.species) identity.push(`species: ${m.identity.species}`)
      if (m.identity?.countryOfOrigin)
        identity.push(`country: ${m.identity.countryOfOrigin}`)
      return `- ${m.name ?? m.id} (${m.role} ${m.rank}) ${identity.join(', ')}`
    }),
    '',
    '=== RELATIONSHIP CONTEXT ===',
    ...relationshipContextLines(party, event),
    '',
    '=== NARRATIVE RULES ===',
    'Write ONE short scene (300-700 Japanese characters) based on the structured downtime event.',
    'The event facts are fixed: do not invent new injuries, romance confessions, relationship status changes, quests, equipment, factions, finances, or tavern facilities.',
    'Character identity (name, gender, species, country of origin) is immutable and authoritative.',
    'Japanese pronouns: prefer character names or natural subject omission over 彼/彼女. Never use a gendered pronoun that conflicts with identity.',
    'Do not summarize relationship development with abstract phrases such as "trust deepened" or "distance narrowed". Show behavior, not exposition.',
    'Focus on mundane details: food, drink, chairs, equipment, laundry, cards, books, weather outside, small complaints, silence.',
    'One scene per event. No player choices. No internal monologue from the player.',
  ].join('\n')

  const userPrompt = [
    `Write a short scene for the downtime event: ${event.type}`,
    `Participants: ${names}`,
    `Fallback mood: ${event.valence}`,
    'Scene:',
  ].join('\n')

  return { systemPrompt, userPrompt }
}

function relationshipContextLines(
  party: CampaignParty,
  event: DowntimeEvent,
): string[] {
  const lines: string[] = []
  if (event.participantIds.length >= 2) {
    const [a, b] = event.participantIds
    const rel = getRelationship(party, a!, b!)
    if (rel) {
      lines.push(
        `${a} -> ${b}: affinity ${rel.affinity}, trust ${rel.trust}, respect ${rel.respect}, tension ${rel.tension}`,
      )
    }
    const reverse = getRelationship(party, b!, a!)
    if (reverse) {
      lines.push(
        `${b} -> ${a}: affinity ${reverse.affinity}, trust ${reverse.trust}, respect ${reverse.respect}, tension ${reverse.tension}`,
      )
    }
  }
  if (lines.length === 0) lines.push('No specific relationship context.')
  return lines
}

export function generateDowntimeNarrative(
  event: DowntimeEvent,
  party: CampaignParty,
  provider: {
    generate: (request: {
      systemPrompt: string
      userPrompt: string
      candidateId: string
      promptVersion: string
    }) => Promise<{ text: string }>
  } | null,
): Promise<string> {
  if (event.narrativeStatus === 'generated' && event.generatedText) {
    return Promise.resolve(event.generatedText)
  }

  const { systemPrompt, userPrompt } = buildDowntimePrompt(event, party)

  if (!provider) {
    event.generatedText =
      event.fallbackSummary ??
      downtimeFallbackSummary(
        event.type,
        event.participantIds,
        party.party.members,
      )
    event.narrativeStatus = 'generated'
    return Promise.resolve(event.generatedText)
  }

  return provider
    .generate({
      systemPrompt,
      userPrompt,
      candidateId: event.id,
      promptVersion: DOWNTIME_PROMPT_VERSION,
    })
    .then((result) => {
      event.generatedText = result.text
      event.narrativeStatus = 'generated'
      return result.text
    })
    .catch(() => {
      event.generatedText =
        event.fallbackSummary ??
        downtimeFallbackSummary(
          event.type,
          event.participantIds,
          party.party.members,
        )
      event.narrativeStatus = 'generated'
      return event.generatedText
    })
}
