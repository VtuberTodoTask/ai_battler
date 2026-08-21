import type {
  AdventurerRank,
  BattleOutcome,
  BattleParticipantFinalState,
  InjuryResult,
} from '../models/types.ts'
import type { CountryId } from '../identity/types.ts'
import type { EnvironmentType } from '../expedition/types.ts'

/**
 * Phase 9.8 Main Quest. Seven national threats plus the final antagonist,
 * Nosferatu. Unlike a normal Tavern Request, the tavern owner (the player)
 * personally requests a familiar Party and accompanies them — so a Main
 * Quest never occupies a Quest Board slot and never flows through
 * brokerage/settlement (`src/core/tavern/brokerage.ts`).
 */
export type MainQuestThreatId =
  | 'alden'
  | 'velga'
  | 'kared'
  | 'celesta'
  | 'eldia'
  | 'ragna'
  | 'halma'
  | 'nosferatu'

export type MainQuestThreatStatus = 'locked' | 'available' | 'defeated'

export interface MainQuestThreatState {
  id: MainQuestThreatId
  status: MainQuestThreatStatus
  defeatedDay?: number
  defeatedByPartyId?: string
}

export type PlayerCurseStatus = 'active' | 'lifted'

export interface MainQuestState {
  threats: Record<MainQuestThreatId, MainQuestThreatState>
  attempts: MainQuestAttemptRecord[]
  pendingPresentationAttemptId?: string
  playerCurseStatus: PlayerCurseStatus
}

/**
 * Visual identity for a Unique Monster's Battle Presentation. Phase 9.8
 * allows a placeholder/silhouette `assetKey` — final art is not required —
 * but every Unique Monster must resolve to a *distinct* key, never a
 * shared generic monster image.
 */
export interface UniqueMonsterVisualProfile {
  assetKey: string
  scale: number
  idleMotion: string
  hitReaction: string
  attackMotion: string
  presentationMotifs: string[]
}

/**
 * Narrative identity for a Unique Monster. Injected into every Main Quest
 * AI prompt in full — never summarized away — so the generated Story is
 * materially shaped by who this specific monster is, not a generic boss
 * template (see narrativeMustShow / narrativeMustNotInvent below and
 * `buildMainQuestNarrativePrompt` in `../narrative/mainQuestPrompt.ts`).
 */
export interface UniqueMonsterProfile {
  id: MainQuestThreatId
  name: string
  personalityTraits: string[]
  values: string[]
  motivation: string
  conflictReason: string
  attitudeTowardHumans: string
  attitudeTowardPlayer?: string
  communicationStyle: string
  combatIdentity: string[]
  /** Facts the AI Prompt must have the Story make visible (personality-driven reactions, values, etc). */
  narrativeMustShow: string[]
  /** Facts/events the AI must never invent (see doctrine: Simulation decides truth, AI renders it). */
  narrativeMustNotInvent: string[]
  visualProfile: UniqueMonsterVisualProfile
}

/**
 * A Threat's per-day request template. Unlike a normal Tavern Request
 * template, the Simulation itself is generated from `uniqueMonster`
 * (a fixed, hand-authored boss-tier `Enemy`, built once per Threat via
 * `buildUniqueMonsterEnemy` in `./threats.ts`) rather than the normal
 * expedition/objective-template machinery.
 */
export interface MainQuestScenarioRules {
  environment: EnvironmentType
  briefing: string
}

export interface MainQuestThreatDefinition {
  id: MainQuestThreatId
  nationId?: CountryId
  name: string
  title: string
  requiredPartyRank: AdventurerRank
  requiredAffinity: number
  fee: number
  uniqueMonster: UniqueMonsterProfile
  scenarioRules: MainQuestScenarioRules
}

/**
 * Frozen at Dispatch time (Payment happens then, per item 22) — this is
 * the "依頼" itself, independent of whatever the Simulation later decides.
 */
export interface MainQuestRequest {
  threatId: MainQuestThreatId
  dayNumber: number
  partyId: string
  fee: number
  requiredPartyRank: AdventurerRank
  requiredAffinity: number
}

export type MainQuestOutcome = 'victory' | 'failure'

/**
 * Simulation-layer Fact. Derived strictly from `BattleResult.outcome`
 * (`src/core/battle/battle.ts` `runBattle`) — never inferred, adjusted, or
 * invented by Narrative/Presentation.
 */
export interface MainQuestSimulationResult {
  outcome: MainQuestOutcome
  battleOutcome: BattleOutcome
  survivingMemberIds: string[]
  incapacitatedMemberIds: string[]
  deadMemberIds: string[]
  monsterDefeated: boolean
  /** Authoritative final per-member state, applied onto CampaignParty exactly as a normal expedition would (item 114) — never re-derived from the Narrative or Presentation layers. */
  finalMemberStates: BattleParticipantFinalState[]
  injuries: InjuryResult[]
}

// --- Battle Trace: a granular, replayable event sequence derived purely
// from BattleResult (never re-simulated, never RNG-touched again).

export interface MainQuestBattleStartedEvent {
  type: 'battleStarted'
  monsterId: MainQuestThreatId
  monsterName: string
  partyMemberIds: string[]
}

export interface MainQuestRoundStartedEvent {
  type: 'roundStarted'
  round: number
}

export interface MainQuestActionStartedEvent {
  type: 'actionStarted'
  round: number
  actorId: string
  actionType: string
}

export interface MainQuestHitEvent {
  type: 'hit'
  round: number
  actorId: string
  targetId: string
  actionType: string
}

export interface MainQuestMissEvent {
  type: 'miss'
  round: number
  actorId: string
  targetId: string
  actionType: string
}

export interface MainQuestDamageEvent {
  type: 'damage'
  round: number
  actorId: string
  targetId: string
  amount: number
}

export interface MainQuestHealingEvent {
  type: 'healing'
  round: number
  actorId: string
  targetId: string
  amount: number
}

export interface MainQuestStatusAppliedEvent {
  type: 'statusApplied'
  round: number
  targetId: string
  status: string
}

export interface MainQuestStatusRemovedEvent {
  type: 'statusRemoved'
  round: number
  targetId: string
  status: string
}

export interface MainQuestIncapacitatedEvent {
  type: 'incapacitated'
  round: number
  memberId: string
}

export interface MainQuestDeathEvent {
  type: 'death'
  round: number
  memberId: string
}

/**
 * A non-mechanical anchor point derived purely from the monster's actual
 * remaining-HP curve (reconstructed from `BattleLogEntry.damage` events
 * against the monster's id) or from other trace events — never a new
 * mechanical effect. Anchor ids are the fixed vocabulary Dialogue Cues may
 * reference (see `MainQuestBattleAnchorId`); an anchor only appears here if
 * it genuinely occurred in this Simulation.
 */
export interface MainQuestMonsterReactionAnchorEvent {
  type: 'monsterReactionAnchor'
  round: number
  anchorId: MainQuestBattleAnchorId
}

export interface MainQuestRetreatEvent {
  type: 'retreat'
  round: number
}

export interface MainQuestMonsterDefeatedEvent {
  type: 'monsterDefeated'
  round: number
}

export interface MainQuestBattleEndedEvent {
  type: 'battleEnded'
  round: number
  outcome: MainQuestOutcome
}

export type MainQuestBattleEvent =
  | MainQuestBattleStartedEvent
  | MainQuestRoundStartedEvent
  | MainQuestActionStartedEvent
  | MainQuestHitEvent
  | MainQuestMissEvent
  | MainQuestDamageEvent
  | MainQuestHealingEvent
  | MainQuestStatusAppliedEvent
  | MainQuestStatusRemovedEvent
  | MainQuestIncapacitatedEvent
  | MainQuestDeathEvent
  | MainQuestMonsterReactionAnchorEvent
  | MainQuestRetreatEvent
  | MainQuestMonsterDefeatedEvent
  | MainQuestBattleEndedEvent

export const MAIN_QUEST_BATTLE_ANCHOR_IDS = [
  'battle_start',
  'monster_first_action',
  'monster_hp_threshold_75',
  'monster_hp_threshold_50',
  'monster_hp_threshold_25',
  'party_member_critical',
  'party_member_incapacitated',
  'party_member_death',
  'monster_critical',
  'retreat_triggered',
  'monster_defeated',
] as const

export type MainQuestBattleAnchorId =
  (typeof MAIN_QUEST_BATTLE_ANCHOR_IDS)[number]

export interface MainQuestBattleTrace {
  seed: string
  monsterId: MainQuestThreatId
  events: MainQuestBattleEvent[]
  /** The subset of MAIN_QUEST_BATTLE_ANCHOR_IDS that actually occurred, in order. Narrative may only cue dialogue against these. */
  occurredAnchors: MainQuestBattleAnchorId[]
}

// --- Narrative Layer (structured, forced-generation, monster-specific).

export interface MainQuestBattleDialogueCue {
  anchorId: MainQuestBattleAnchorId
  speakerId: string
  speakerName: string
  text: string
}

/**
 * `preBattle`/`postBattle` are flat prose text, deliberately the same
 * shape as a normal `NarrativeGenerationRecord.generatedText` (see
 * `../narrative/types.ts`) — they are handed directly to
 * `SoundNovelSceneInput.text` and rendered through the existing
 * `parseSoundNovelText` narration/dialogue splitter (`「」`-quote
 * detection), reusing 100% of the SoundNovel presentation pipeline rather
 * than inventing a second story-beat format. Only `battleInterludes` (cut
 * in mid-Battle-Playback, anchored to a specific Trace event) needs its
 * own structure.
 */
export interface MainQuestNarrativeScript {
  preBattle: string
  battleInterludes: MainQuestBattleDialogueCue[]
  postBattle: string
  promptVersion: string
  providerId: string
  model?: string
  createdAt: string
}

export type MainQuestPresentationStatus =
  'narrative_pending' | 'ready' | 'viewing' | 'completed'

export interface MainQuestAttemptRecord {
  id: string
  threatId: MainQuestThreatId
  dayNumber: number
  partyId: string
  fee: number
  request: MainQuestRequest
  result?: MainQuestSimulationResult
  battleTrace?: MainQuestBattleTrace
  narrative?: MainQuestNarrativeScript
  presentationStatus: MainQuestPresentationStatus
}

// --- Day record events (TavernDayRecord.mainQuestEvents), mirroring the
// QuestChainEvent / WorldEventEvent pattern in campaign/types.ts.

export type MainQuestEvent =
  | {
      type: 'dispatched'
      attemptId: string
      threatId: MainQuestThreatId
      partyId: string
      dayNumber: number
      fee: number
    }
  | {
      type: 'resolved'
      attemptId: string
      threatId: MainQuestThreatId
      dayNumber: number
      outcome: MainQuestOutcome
    }
  | {
      type: 'threatDefeated'
      threatId: MainQuestThreatId
      dayNumber: number
      partyId: string
    }
  | {
      type: 'curseLifted'
      dayNumber: number
    }
