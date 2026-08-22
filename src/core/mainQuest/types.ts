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
  /** Authoritative from `ActionResult.critical` (`../battle/actions.ts`) — never re-derived. */
  critical: boolean
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

/**
 * Periodic (damage-over-time) HP loss ticked at End of Round — e.g. poison,
 * bleed — authoritatively distinct from an `actionType`-driven `damage`
 * event: there is no acting unit, only a `source` (the status type causing
 * it), read straight off `BattleLogEntry.damage` for the `poison`/`bleed`
 * entries `processEndOfRound` already emits.
 */
export interface MainQuestPeriodicDamageEvent {
  type: 'periodicDamage'
  round: number
  targetId: string
  source: string
  amount: number
}

/** Periodic (regen) HP recovery ticked at End of Round — mirrors
 * `MainQuestPeriodicDamageEvent`, sourced from `BattleLogEntry.healAmount`
 * on `regen` entries. */
export interface MainQuestPeriodicHealingEvent {
  type: 'periodicHealing'
  round: number
  targetId: string
  source: string
  amount: number
}

/** A Skill's MP cost/refund, sourced from `BattleLogEntry.mpDelta`. */
export interface MainQuestMpChangedEvent {
  type: 'mpChanged'
  round: number
  targetId: string
  delta: number
}

/**
 * Fires the instant a unit's HP reaches 0 during Combat — sourced from the
 * engine's own `handleUnitDeath` log entry (`actionType: 'incapacitate'`),
 * which is round-accurate. This is a distinct fact from `death`: whether an
 * incapacitated Adventurer ultimately survives or dies is only decided
 * afterwards, in the post-battle Injury/survival roll (`resolveAftermath`)
 * — see `MainQuestDeathEvent`.
 */
export interface MainQuestIncapacitatedEvent {
  type: 'incapacitated'
  round: number
  memberId: string
}

/**
 * Fires from the post-battle Injury resolution (`BattleLogEntry` with
 * `phase: 'aftermath'`, `actionType: 'injury'`, cross-referenced against
 * `BattleResult.injuries` for `category === 'dead'`) — never placed at a
 * guessed mid-combat round. The engine itself only decides survival after
 * Combat ends, so this event's `round` is always the Battle's final round,
 * honestly reflecting when the fact was actually determined.
 */
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
  | MainQuestPeriodicDamageEvent
  | MainQuestPeriodicHealingEvent
  | MainQuestMpChangedEvent
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

/**
 * Presentation-facing snapshot of every combatant's state the instant
 * Battle Simulation began — authoritative, read straight off the same
 * `Adventurer`/`Enemy` records `runBattle` itself initialized its internal
 * `BattleUnit`s from (`createAdventurerUnit`/`createEnemyUnit`,
 * `../battle/battleState.ts`: `hp = currentHp ?? maxHp`). Presentation must
 * never assume combatants start at full HP/MP — a Main Quest Party is not
 * guaranteed to depart at full health (item 7/8).
 */
export interface MainQuestBattleMemberSnapshot {
  characterId: string
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  statuses: readonly string[]
}

export interface MainQuestBattleMonsterSnapshot {
  currentHp: number
  maxHp: number
  statuses: readonly string[]
}

export interface MainQuestBattleInitialSnapshot {
  partyMembers: MainQuestBattleMemberSnapshot[]
  monster: MainQuestBattleMonsterSnapshot
}

export interface MainQuestBattleTrace {
  seed: string
  monsterId: MainQuestThreatId
  /** Authoritative combatant state at Battle start — see
   * `MainQuestBattleInitialSnapshot`'s own docs. Combined with `events`,
   * replaying this in order reaches exactly `MainQuestSimulationResult`'s
   * final state (see `replayMainQuestBattleTrace` in `./replay.ts`). */
  initialSnapshot: MainQuestBattleInitialSnapshot
  events: MainQuestBattleEvent[]
  /** The subset of MAIN_QUEST_BATTLE_ANCHOR_IDS that actually occurred, in order. Narrative may only cue dialogue against these. */
  occurredAnchors: MainQuestBattleAnchorId[]
}

// --- Narrative Layer (structured, forced-generation, monster-specific).

/**
 * Deliberately carries only `speakerId`, never a display name — the AI
 * chooses WHO speaks (`speakerId`, validated against a whitelist at parse
 * time — see `parseMainQuestNarrativeScript`) and WHAT they say (`text`),
 * never how their name is displayed. Canonical display names are resolved
 * at presentation time from authoritative sources only (`resolveMainQuest
 * SpeakerName`, `./narrative.ts`) — this keeps a stray/hallucinated raw ID
 * from the AI response from ever being persisted, let alone shown
 * (Phase 9.8.1 items 45-49).
 */
export interface MainQuestBattleDialogueCue {
  anchorId: MainQuestBattleAnchorId
  speakerId: string
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
