import { SeededRng } from '../rng/seededRng.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import type {
  MinorNarrativeFingerprint,
  MinorSceneEndingStyle,
  MinorSceneOpeningCategory,
  MinorScenePresentationPlan,
  StayExtensionReason,
} from './types.ts'

export const MINOR_SCENE_FRAMINGS = [
  'direct_report',
  'overheard_conversation',
  'morning_after',
  'preparation_scene',
  'single_character_notice',
  'group_discussion',
] as const

export const MINOR_SCENE_OPENING_CATEGORIES: MinorSceneOpeningCategory[] = [
  'dialogue_first',
  'action_first',
  'observation_first',
  'time_change',
  'object_focus',
]

export const MINOR_SCENE_ENDING_STYLES: MinorSceneEndingStyle[] = [
  'concrete_action',
  'unfinished_conversation',
  'mundane_transition',
  'brief_observation',
  'no_stylized_ending',
]

const STAY_EXTENSION_FRAMING_WEIGHTS: Record<string, number> = {
  direct_report: 20,
  overheard_conversation: 20,
  morning_after: 15,
  preparation_scene: 20,
  single_character_notice: 15,
  group_discussion: 10,
}

const REASON_BASE_WEIGHTS: Record<StayExtensionReason, number> = {
  training: 10,
  recovery: 10,
  equipment_preparation: 10,
  party_coordination: 10,
  resource_preparation: 8,
  waiting_for_work: 8,
  personal_preference: 6,
  mixed: 5,
}

const FINGERPRINT_MEMORY_WINDOW = 3

export function selectStayExtensionReason(
  rng: SeededRng,
  party: CampaignParty,
): { primary: StayExtensionReason; secondary?: StayExtensionReason } {
  const weights: Record<StayExtensionReason, number> = {
    ...REASON_BASE_WEIGHTS,
  }

  const hasInjuries =
    (party.condition.incapacitatedIds?.length ?? 0) > 0 ||
    (party.condition.injuries?.length ?? 0) > 0
  if (hasInjuries) weights.recovery += 15

  const conflictArc = (party.arcSignals ?? []).some(
    (s) =>
      s.type === 'recurring_conflict' ||
      s.type === 'decision_friction' ||
      s.type === 'eroding_trust',
  )
  if (conflictArc) weights.party_coordination += 10

  if (
    party.progression.trainingDays > 0 ||
    party.progression.growthMilestones > 0
  ) {
    weights.training += 5
  }

  if (party.relationship.financialPressure > 60) {
    weights.resource_preparation += 10
    weights.waiting_for_work += 10
  }

  if (party.stats.totalExpeditions === 0) {
    weights.waiting_for_work += 10
    weights.personal_preference += 5
  }

  if (party.relationship.affinity > 70) {
    weights.personal_preference += 5
  }

  const primary = rng.weightedPick(
    Object.keys(weights) as StayExtensionReason[],
    Object.values(weights),
  ) as StayExtensionReason

  let secondary: StayExtensionReason | undefined
  if (primary !== 'mixed' && rng.chance(40)) {
    const remaining = (Object.keys(weights) as StayExtensionReason[]).filter(
      (r) => r !== primary && r !== 'mixed',
    )
    const remainingWeights = remaining.map((r) => weights[r])
    if (remaining.length > 0) {
      secondary = rng.weightedPick(
        remaining,
        remainingWeights,
      ) as StayExtensionReason
    }
  }

  return { primary, secondary }
}

export interface PresentationPlanOptions {
  eventType?: string
  extensionReason?: StayExtensionReason
  isStayExtension?: boolean
  dayNumber: number
}

export function buildMinorScenePresentationPlan(
  rng: SeededRng,
  party: CampaignParty,
  options: PresentationPlanOptions,
): MinorScenePresentationPlan {
  const members = party.party.members
  const fingerprints = party.minorNarrativeFingerprints ?? []

  const framing = selectFraming(rng, fingerprints, options.isStayExtension)
  const openingCategory = selectOpeningCategory(rng, framing, fingerprints)
  const focalCharacterId = selectFocalCharacter(rng, party, fingerprints)

  const speakers = selectSpeakers(rng, party, focalCharacterId, framing)
  const speakingCharacterIds = speakers.map((m) => m.id)

  const backgroundCharacterIds = members
    .filter((m) => !speakingCharacterIds.includes(m.id))
    .map((m) => m.id)

  const endingStyle = selectEndingStyle(rng, fingerprints)

  const basePlan: MinorScenePresentationPlan = {
    id: `presentation:${party.id}:${options.dayNumber}:${options.eventType ?? 'minor'}:${rng.integer(1000, 9999)}`,
    framing,
    openingCategory,
    focalCharacterId,
    speakingCharacterIds,
    backgroundCharacterIds:
      backgroundCharacterIds.length > 0 ? backgroundCharacterIds : undefined,
    endingStyle,
  }

  if (options.isStayExtension) {
    basePlan.communicateDecisionDirectly = selectCommunicateDecisionDirectly(
      rng,
      framing,
    )
    basePlan.mentionExtensionDays = selectMentionExtensionDays(
      rng,
      basePlan.communicateDecisionDirectly,
    )
    basePlan.emphasizeReason = selectEmphasizeReason(
      rng,
      framing,
      options.extensionReason,
    )
    basePlan.emphasizeRelationship = selectEmphasizeRelationship(
      rng,
      party,
      speakers,
    )
  }

  const fingerprint = minorSceneFingerprintFromPlan(
    basePlan,
    options.dayNumber,
    options.eventType,
  )
  updatePartyMinorNarrativeFingerprints(party, fingerprint)

  return basePlan
}

function selectFraming(
  rng: SeededRng,
  fingerprints: MinorNarrativeFingerprint[],
  isStayExtension?: boolean,
): string {
  const framings = [...MINOR_SCENE_FRAMINGS]
  let weights = framings.map((f) => STAY_EXTENSION_FRAMING_WEIGHTS[f] ?? 10)

  if (!isStayExtension) {
    weights = framings.map((_, i) => 10 + (i % 3))
  }

  const recent = fingerprints.slice(-FINGERPRINT_MEMORY_WINDOW)
  for (let i = 0; i < framings.length; i++) {
    const f = framings[i]
    const sameCount = recent.filter((fp) => fp.framing === f).length
    if (sameCount > 0) {
      weights[i] *= Math.pow(0.25, sameCount)
    }
  }

  const lastFraming = fingerprints[fingerprints.length - 1]?.framing
  if (lastFraming) {
    const lastIdx = framings.indexOf(
      lastFraming as (typeof MINOR_SCENE_FRAMINGS)[number],
    )
    if (lastIdx >= 0) {
      weights[lastIdx] = 0
    }
  }

  if (weights.every((w) => w <= 0)) {
    weights = framings.map((_, i) => 10 + i)
  }

  return rng.weightedPick(framings, weights)
}

function selectOpeningCategory(
  rng: SeededRng,
  framing: string,
  fingerprints: MinorNarrativeFingerprint[],
): MinorSceneOpeningCategory {
  const baseWeights: Record<MinorSceneOpeningCategory, number> = {
    dialogue_first: 25,
    action_first: 20,
    observation_first: 20,
    time_change: 15,
    object_focus: 20,
  }

  const framingBias: Record<
    string,
    Partial<Record<MinorSceneOpeningCategory, number>>
  > = {
    direct_report: { dialogue_first: 15 },
    overheard_conversation: { observation_first: 15 },
    morning_after: { time_change: 15 },
    preparation_scene: { action_first: 15 },
    single_character_notice: { object_focus: 15, observation_first: 10 },
    group_discussion: { dialogue_first: 15 },
  }

  const bias = framingBias[framing] ?? {}
  const categories = MINOR_SCENE_OPENING_CATEGORIES
  const weights = categories.map((c) => baseWeights[c] + (bias[c] ?? 0))

  const lastOpening = fingerprints[fingerprints.length - 1]?.openingCategory
  if (lastOpening) {
    const idx = categories.indexOf(lastOpening)
    if (idx >= 0) weights[idx] *= 0.4
  }

  return rng.weightedPick(categories, weights)
}

function selectFocalCharacter(
  rng: SeededRng,
  party: CampaignParty,
  fingerprints: MinorNarrativeFingerprint[],
): string {
  const members = party.party.members
  const leader = members.find((m) => m.id === party.party.leaderId)

  let weights = members.map((m) => {
    let w = 10
    if (m.id === leader?.id) w += 5
    return w
  })

  const recentFocals = fingerprints
    .slice(-FINGERPRINT_MEMORY_WINDOW)
    .map((fp) => fp.focalCharacterId)
  for (let i = 0; i < members.length; i++) {
    const count = recentFocals.filter((id) => id === members[i]!.id).length
    if (count > 0) weights[i] *= Math.pow(0.4, count)
  }

  if (weights.every((w) => w <= 0)) {
    weights = members.map(() => 1)
  }

  return rng.weightedPick(
    members.map((m) => m.id),
    weights,
  )
}

function selectSpeakers(
  rng: SeededRng,
  party: CampaignParty,
  focalCharacterId: string,
  framing: string,
): { id: string }[] {
  const members = party.party.members
  const focal = members.find((m) => m.id === focalCharacterId) ?? members[0]!
  const others = members.filter((m) => m.id !== focal.id)

  let targetCount = 2
  switch (framing) {
    case 'single_character_notice':
    case 'direct_report':
      targetCount = rng.pick([1, 1, 2])
      break
    case 'overheard_conversation':
      targetCount = 2
      break
    case 'morning_after':
    case 'preparation_scene':
      targetCount = rng.pick([1, 2, 2])
      break
    case 'group_discussion':
      targetCount = rng.pick([2, 3, 4, 3])
      break
    default:
      targetCount = rng.pick([1, 2, 2, 3])
  }

  targetCount = Math.min(targetCount, members.length)

  const picked = [focal]
  const shuffled = rng.shuffle([...others])
  while (picked.length < targetCount && shuffled.length > 0) {
    const next = shuffled.shift()!
    if (next) picked.push(next)
  }

  return picked
}

function selectEndingStyle(
  rng: SeededRng,
  fingerprints: MinorNarrativeFingerprint[],
): MinorSceneEndingStyle {
  const styles = [...MINOR_SCENE_ENDING_STYLES]
  const weights = [25, 20, 20, 15, 20]

  const lastStyle = fingerprints[fingerprints.length - 1]?.endingStyle
  if (lastStyle) {
    const idx = styles.indexOf(lastStyle)
    if (idx >= 0) weights[idx] *= 0.4
  }

  return rng.weightedPick(styles, weights) as MinorSceneEndingStyle
}

function selectCommunicateDecisionDirectly(
  rng: SeededRng,
  framing: string,
): boolean {
  const chance: Record<string, number> = {
    direct_report: 80,
    group_discussion: 60,
    single_character_notice: 70,
    overheard_conversation: 20,
    morning_after: 10,
    preparation_scene: 10,
  }
  return rng.chance(chance[framing] ?? 30)
}

function selectMentionExtensionDays(
  rng: SeededRng,
  communicateDecisionDirectly: boolean,
): boolean {
  return rng.chance(communicateDecisionDirectly ? 30 : 15)
}

function selectEmphasizeReason(
  rng: SeededRng,
  framing: string,
  reason?: StayExtensionReason,
): boolean {
  const framingBoost: Record<string, number> = {
    preparation_scene: 60,
    group_discussion: 50,
    direct_report: 40,
    single_character_notice: 30,
    overheard_conversation: 20,
    morning_after: 20,
  }
  if (reason === 'mixed') return false
  return rng.chance(framingBoost[framing] ?? 30)
}

function selectEmphasizeRelationship(
  rng: SeededRng,
  party: CampaignParty,
  speakers: { id: string }[],
): boolean {
  if (speakers.length < 2) return false
  const speakerIds = speakers.map((s) => s.id)
  const hasMilestone = (party.relationshipMilestones ?? []).some(
    (m) =>
      m.status === 'active' &&
      speakerIds.some((id) => m.characterIds.includes(id)),
  )
  return rng.chance(hasMilestone ? 45 : 20)
}

export function minorSceneFingerprintFromPlan(
  plan: MinorScenePresentationPlan,
  day: number,
  eventType?: string,
): MinorNarrativeFingerprint {
  return {
    day,
    eventType,
    framing: plan.framing,
    openingCategory: plan.openingCategory,
    focalCharacterId: plan.focalCharacterId,
    speakerCount: plan.speakingCharacterIds.length,
    endingStyle: plan.endingStyle,
  }
}

export function updatePartyMinorNarrativeFingerprints(
  party: CampaignParty,
  fingerprint: MinorNarrativeFingerprint,
): void {
  party.minorNarrativeFingerprints ??= []
  party.minorNarrativeFingerprints.push(fingerprint)
  if (party.minorNarrativeFingerprints.length > 20) {
    party.minorNarrativeFingerprints =
      party.minorNarrativeFingerprints.slice(-20)
  }
}

const WARNED_PHRASES = [
  '静かな気配',
  '静かな余韻',
  '余韻が広がった',
  '緊張をほどく',
  '緊張がほどけた',
  '歩調を整える',
  '酒場の一角',
  '顔を寄せる',
  '穏やかにまとめる',
]

export function auditMinorScenePhrases(text: string): { warnings: string[] } {
  const warnings: string[] = []
  for (const phrase of WARNED_PHRASES) {
    if (text.includes(phrase)) warnings.push(phrase)
  }
  return { warnings }
}

export interface MinorSceneDiversityAudit {
  framingDistribution: Record<string, number>
  speakerCountDistribution: Record<number, number>
  focalCharacterDistribution: Record<string, number>
  endingStyleDistribution: Record<string, number>
  openingCategoryDistribution: Record<string, number>
  exactDuplicateCount: number
}

export function auditMinorSceneDiversity(
  plans: MinorScenePresentationPlan[],
  getText?: (plan: MinorScenePresentationPlan) => string | undefined,
): MinorSceneDiversityAudit {
  const framingDistribution: Record<string, number> = {}
  const speakerCountDistribution: Record<number, number> = {}
  const focalCharacterDistribution: Record<string, number> = {}
  const endingStyleDistribution: Record<string, number> = {}
  const openingCategoryDistribution: Record<string, number> = {}

  const seenTexts = new Set<string>()
  let exactDuplicateCount = 0

  for (const plan of plans) {
    framingDistribution[plan.framing] =
      (framingDistribution[plan.framing] ?? 0) + 1
    speakerCountDistribution[plan.speakingCharacterIds.length] =
      (speakerCountDistribution[plan.speakingCharacterIds.length] ?? 0) + 1
    if (plan.focalCharacterId) {
      focalCharacterDistribution[plan.focalCharacterId] =
        (focalCharacterDistribution[plan.focalCharacterId] ?? 0) + 1
    }
    endingStyleDistribution[plan.endingStyle] =
      (endingStyleDistribution[plan.endingStyle] ?? 0) + 1
    if (plan.openingCategory) {
      openingCategoryDistribution[plan.openingCategory] =
        (openingCategoryDistribution[plan.openingCategory] ?? 0) + 1
    }

    if (getText) {
      const text = getText(plan)
      if (text) {
        if (seenTexts.has(text)) exactDuplicateCount++
        seenTexts.add(text)
      }
    }
  }

  return {
    framingDistribution,
    speakerCountDistribution,
    focalCharacterDistribution,
    endingStyleDistribution,
    openingCategoryDistribution,
    exactDuplicateCount,
  }
}
