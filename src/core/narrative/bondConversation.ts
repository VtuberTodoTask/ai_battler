import type {
  CampaignParty,
  TavernCampaignState,
} from '../tavern/campaign/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { selectWeightedFocalCharacter } from './focalCharacter.ts'
import type {
  CharacterEventNarrativeContext,
  CharacterNarrativeEventType,
  NarrativeCandidate,
} from './types.ts'

/**
 * Phase 9.10 — the four canonical Party-affinity milestones a Bond
 * Conversation can trigger on. Deliberately reuses the EXISTING Party
 * affinity (item 2 of the spec) rather than introducing a separate
 * Player<->Character affinity system.
 */
export type BondConversationMilestone =
  'familiar' | 'trusted' | 'regular' | 'favorite'

export const BOND_CONVERSATION_THRESHOLDS: Record<
  BondConversationMilestone,
  number
> = {
  familiar: 20,
  trusted: 40,
  regular: 60,
  favorite: 80,
}

export const BOND_CONVERSATION_MILESTONE_LABELS: Record<
  BondConversationMilestone,
  string
> = {
  familiar: '顔なじみ',
  trusted: '信頼',
  regular: '常連',
  favorite: '贔屓',
}

/** UI-facing label for the DayResults report row / SoundNovel title —
 * distinct from the internal `becameFavorite`-style eventType (item 31). */
export const BOND_CONVERSATION_UI_LABELS: Record<
  BondConversationMilestone,
  string
> = {
  familiar: '【会話】顔なじみになった',
  trusted: '【会話】信頼を寄せている',
  regular: '【会話】常連になった',
  favorite: '【会話】特別な馴染みになった',
}

export const BOND_CONVERSATION_EVENT_TYPE: Record<
  BondConversationMilestone,
  CharacterNarrativeEventType
> = {
  familiar: 'becameFamiliar',
  trusted: 'becameTrusted',
  regular: 'becameRegular',
  favorite: 'becameFavorite',
}

/** Highest-priority milestone first (item 9/49): a single day's Affinity
 * jump that (rarely) crosses more than one threshold at once should treat
 * the highest as the "real" event, exactly like the pre-existing
 * casualtyDeparture/farewell-over-relationship priority scheme. */
export const BOND_CONVERSATION_MILESTONES_BY_PRIORITY: readonly BondConversationMilestone[] =
  ['favorite', 'regular', 'trusted', 'familiar']

/**
 * Pure threshold-crossing check (item 4): `before < threshold <= after`.
 * Returns every milestone crossed by this single before/after pair, highest
 * priority first — plural because the logic must not break on a rare
 * multi-threshold jump (item 9), even though `AFFINITY_DELTA` in practice
 * makes that vanishingly rare.
 */
export function deriveBondMilestoneCrossings(
  before: number,
  after: number,
): BondConversationMilestone[] {
  const crossed: BondConversationMilestone[] = []
  for (const milestone of BOND_CONVERSATION_MILESTONES_BY_PRIORITY) {
    const threshold = BOND_CONVERSATION_THRESHOLDS[milestone]
    if (before < threshold && after >= threshold) {
      crossed.push(milestone)
    }
  }
  return crossed
}

/**
 * Pure selector (item 10/11): has this Party ever had a Bond Conversation
 * candidate generated for this specific milestone, in ANY state (available/
 * generated/dismissed)? `mergeCandidates` never prunes
 * `campaign.narrativeCandidates`, so this persists for the life of the
 * Campaign — a dropped-then-re-crossed Affinity never refires the same
 * milestone, and a dismissed Conversation is still "occurred" (item 11).
 *
 * A milestone counts as occurred whether it was the day's PRIMARY
 * candidate (`eventType`) or one of that day's SECONDARY triggers
 * (`context.secondaryTriggers`) — a single large Affinity jump that
 * crosses several thresholds at once (PR #60 review item 10/11) only ever
 * surfaces one Conversation candidate (the highest-priority milestone),
 * but every threshold it crossed is consumed by that jump, not just the
 * primary one. Without this, a lower milestone folded into that day's
 * secondaryTriggers could still refire later on its own.
 */
export function hasBondMilestoneOccurred(
  campaign: TavernCampaignState,
  partyId: string,
  milestone: BondConversationMilestone,
): boolean {
  const eventType = BOND_CONVERSATION_EVENT_TYPE[milestone]
  return campaign.narrativeCandidates.some((c) => {
    if (c.category !== 'characterEvent' || c.partyId !== partyId) {
      return false
    }
    if (c.eventType === eventType) return true
    return (
      c.context.kind === 'characterEvent' &&
      c.context.secondaryTriggers.includes(eventType)
    )
  })
}

export type BondConversationEventType =
  'becameFamiliar' | 'becameTrusted' | 'becameRegular' | 'becameFavorite'

export function isBondConversationEventType(
  eventType: CharacterNarrativeEventType | undefined,
): eventType is BondConversationEventType {
  return (
    eventType === 'becameFamiliar' ||
    eventType === 'becameTrusted' ||
    eventType === 'becameRegular' ||
    eventType === 'becameFavorite'
  )
}

export function bondMilestoneForEventType(
  eventType: CharacterNarrativeEventType | undefined,
): BondConversationMilestone | undefined {
  switch (eventType) {
    case 'becameFamiliar':
      return 'familiar'
    case 'becameTrusted':
      return 'trusted'
    case 'becameRegular':
      return 'regular'
    case 'becameFavorite':
      return 'favorite'
    default:
      return undefined
  }
}

/** How many of this Party's most recent Bond Conversation focal picks to
 * penalize against when choosing the next one — mirrors the lookback window
 * `minorScenes.ts` uses for expedition flavor scenes (item 15). */
const RECENT_BOND_FOCAL_WINDOW = 5

/**
 * Bond-Conversation-specific focal pick (item 16): excludes deceased
 * members before delegating to the shared weighted picker, and seeds the
 * `SeededRng` with the established `${campaignSeed}:<domain>:...` convention
 * (`downtime.ts`'s `${campaignSeed}:downtime:${dayNumber}:${party.id}`)
 * so the same Party/day/milestone always picks the same focal member,
 * whether the Conversation is generated immediately or later. Recent-focal
 * history is derived from this Party's own prior Bond Conversation
 * candidates rather than any new persistent field, matching how
 * `hasBondMilestoneOccurred` reuses `campaign.narrativeCandidates`.
 *
 * Returns `undefined` only if every member of the Party is deceased, which
 * should not occur in practice since a wholly-dead Party has no Affinity to
 * cross a threshold with.
 */
export function selectBondConversationFocalCharacter(
  campaign: TavernCampaignState,
  party: CampaignParty,
  dayNumber: number,
  milestone: BondConversationMilestone,
): string | undefined {
  const livingMemberIds = party.party.members
    .filter((m) => m.currentHp > 0)
    .map((m) => m.id)
  if (livingMemberIds.length === 0) return undefined

  const priorFocalIds = campaign.narrativeCandidates
    .filter(
      (
        c,
      ): c is NarrativeCandidate & {
        context: CharacterEventNarrativeContext
      } =>
        c.category === 'characterEvent' &&
        c.partyId === party.id &&
        isBondConversationEventType(c.eventType) &&
        c.context.kind === 'characterEvent',
    )
    .map((c) => c.context.eventFacts.focalCharacterId)
    .filter((id): id is string => typeof id === 'string')
    .slice(-RECENT_BOND_FOCAL_WINDOW)

  const rng = new SeededRng(
    `${campaign.seed}:bondConversation:${dayNumber}:${party.id}:${milestone}`,
  )

  return selectWeightedFocalCharacter(
    rng,
    livingMemberIds,
    party.party.leaderId,
    priorFocalIds,
  )
}
