import type { UniqueMonsterVisualProfile } from './types.ts'

/**
 * Phase 9.8.2 item 2: a pure, deterministic mapping from a Unique Monster's
 * `UniqueMonsterVisualProfile` (`idleMotion`/`attackMotion`/`hitReaction`/
 * `presentationMotifs`) to Presentation-layer primitives only — durations,
 * translation/pulse amplitudes, screen shake, flash, particle motif tokens.
 * Zero RNG, zero Game State access, zero effect on Battle Trace/Replay —
 * the SAME `visualProfile` always yields the SAME plan. `MainQuestBattle
 * Scene` reads this instead of hand-branching on the raw motion strings, so
 * every real Threat boss (and any future one, via the generic fallback)
 * gets genuinely distinct idle/attack/hit-reaction presentation without
 * touching `UniqueMonsterProfile`'s Narrative/Personality fields at all.
 */

export interface MonsterIdlePlan {
  category:
    | 'still'
    | 'breathing'
    | 'swarmPulse'
    | 'wingDrift'
    | 'sway'
    | 'stance'
    | 'coilDrift'
  /** Vertical bob amplitude in px. `0` for a boss that must never bob
   * (Nosferatu's `still-composed-idle` — item 2's explicit constraint). */
  bobAmplitude: number
  bobPeriodMs: number
  /** Scale-pulse amplitude, e.g. `0.02` = ±2% scale breathing. */
  pulseAmplitude: number
  pulsePeriodMs: number
  /** Interval between small idle particle emissions (sparks/glow ticks);
   * `undefined` = no idle particle emission for this boss. */
  sparkleIntervalMs?: number
}

export interface MonsterAttackPlan {
  category:
    | 'groundSlam'
    | 'convergeLash'
    | 'hammerSwing'
    | 'tentacleLash'
    | 'rootLash'
    | 'chargeRam'
    | 'diveStrike'
    | 'silentStrike'
    | 'generic'
  anticipationMs: number
  strikeMs: number
  recoveryMs: number
  /** Forward lunge distance in px during the strike beat. */
  lungeDistance: number
  screenShakeMagnitude: number
  screenShakeMs: number
  /** Alpha dropped to this value during anticipation, then restored at
   * strike (Nosferatu's `silent-strike` — a fade, never a showy lunge).
   * `undefined` = no fade for this boss's attack. */
  alphaFadeTo?: number
}

export interface MonsterHitReactionPlan {
  category:
    | 'staggerHeavy'
    | 'scatterReform'
    | 'sparksRecoil'
    | 'thrashRecoil'
    | 'barkCrack'
    | 'armorClang'
    | 'roarRecoil'
    | 'unmovedGlance'
    | 'generic'
  recoilDistance: number
  recoilMs: number
  flashIntensity: number
  particleMotif?: string
}

export interface MonsterPresentationPlan {
  idle: MonsterIdlePlan
  attack: MonsterAttackPlan
  hitReaction: MonsterHitReactionPlan
  /** Procedural typed tokens derived from `presentationMotifs`'s Japanese
   * descriptive strings — for particle/motif rendering, kept separate from
   * (and never replacing) the Narrative-facing text itself. */
  motifTokens: string[]
}

const IDLE_PLANS: Record<string, MonsterIdlePlan> = {
  'slow-imposing-idle': {
    category: 'breathing',
    bobAmplitude: 4,
    bobPeriodMs: 2600,
    pulseAmplitude: 0.015,
    pulsePeriodMs: 2600,
  },
  'swarm-pulse-idle': {
    category: 'swarmPulse',
    bobAmplitude: 2,
    bobPeriodMs: 900,
    pulseAmplitude: 0.05,
    pulsePeriodMs: 700,
    sparkleIntervalMs: 1200,
  },
  'forge-breathing-idle': {
    category: 'breathing',
    bobAmplitude: 5,
    bobPeriodMs: 1800,
    pulseAmplitude: 0.03,
    pulsePeriodMs: 1800,
    sparkleIntervalMs: 2200,
  },
  'coil-drift-idle': {
    category: 'coilDrift',
    bobAmplitude: 6,
    bobPeriodMs: 2400,
    pulseAmplitude: 0.02,
    pulsePeriodMs: 2400,
  },
  'root-sway-idle': {
    category: 'sway',
    bobAmplitude: 3,
    bobPeriodMs: 3400,
    pulseAmplitude: 0.01,
    pulsePeriodMs: 3400,
  },
  'armored-stance-idle': {
    category: 'stance',
    bobAmplitude: 2,
    bobPeriodMs: 2000,
    pulseAmplitude: 0.01,
    pulsePeriodMs: 2000,
  },
  'wing-flutter-idle': {
    category: 'wingDrift',
    bobAmplitude: 10,
    bobPeriodMs: 1500,
    pulseAmplitude: 0.04,
    pulsePeriodMs: 500,
  },
  // CRITICAL (item 2): Nosferatu must not bob up/down like the other
  // bosses — near-static, only a tiny scale pulse standing in for a slow
  // eye-glow/cloak-movement flicker.
  'still-composed-idle': {
    category: 'still',
    bobAmplitude: 0,
    bobPeriodMs: 0,
    pulseAmplitude: 0.008,
    pulsePeriodMs: 3000,
  },
}

const DEFAULT_IDLE_PLAN: MonsterIdlePlan = {
  category: 'breathing',
  bobAmplitude: 6,
  bobPeriodMs: 2000,
  pulseAmplitude: 0.02,
  pulsePeriodMs: 2000,
}

const ATTACK_PLANS: Record<string, MonsterAttackPlan> = {
  'ground-slam': {
    category: 'groundSlam',
    anticipationMs: 500,
    strikeMs: 220,
    recoveryMs: 500,
    lungeDistance: 10,
    screenShakeMagnitude: 14,
    screenShakeMs: 380,
  },
  'converge-lash': {
    category: 'convergeLash',
    anticipationMs: 300,
    strikeMs: 260,
    recoveryMs: 350,
    lungeDistance: 24,
    screenShakeMagnitude: 6,
    screenShakeMs: 200,
  },
  'hammer-swing': {
    category: 'hammerSwing',
    anticipationMs: 450,
    strikeMs: 200,
    recoveryMs: 450,
    lungeDistance: 30,
    screenShakeMagnitude: 16,
    screenShakeMs: 400,
  },
  'tentacle-lash': {
    category: 'tentacleLash',
    anticipationMs: 280,
    strikeMs: 240,
    recoveryMs: 320,
    lungeDistance: 26,
    screenShakeMagnitude: 7,
    screenShakeMs: 220,
  },
  'root-lash': {
    category: 'rootLash',
    anticipationMs: 400,
    strikeMs: 260,
    recoveryMs: 420,
    lungeDistance: 20,
    screenShakeMagnitude: 8,
    screenShakeMs: 260,
  },
  'charge-ram': {
    category: 'chargeRam',
    anticipationMs: 350,
    strikeMs: 180,
    recoveryMs: 480,
    lungeDistance: 40,
    screenShakeMagnitude: 18,
    screenShakeMs: 420,
  },
  'dive-strike': {
    category: 'diveStrike',
    anticipationMs: 380,
    strikeMs: 160,
    recoveryMs: 400,
    lungeDistance: 34,
    screenShakeMagnitude: 10,
    screenShakeMs: 260,
  },
  // Nosferatu: explicitly NOT a large showy motion — a brief fade, an
  // almost-instant positional shift, minimal shake.
  'silent-strike': {
    category: 'silentStrike',
    anticipationMs: 220,
    strikeMs: 90,
    recoveryMs: 260,
    lungeDistance: 12,
    screenShakeMagnitude: 2,
    screenShakeMs: 80,
    alphaFadeTo: 0.35,
  },
}

const DEFAULT_ATTACK_PLAN: MonsterAttackPlan = {
  category: 'generic',
  anticipationMs: 300,
  strikeMs: 200,
  recoveryMs: 350,
  lungeDistance: 18,
  screenShakeMagnitude: 6,
  screenShakeMs: 200,
}

const HIT_REACTION_PLANS: Record<string, MonsterHitReactionPlan> = {
  'stagger-heavy': {
    category: 'staggerHeavy',
    recoilDistance: 14,
    recoilMs: 300,
    flashIntensity: 0.9,
  },
  'scatter-reform': {
    category: 'scatterReform',
    recoilDistance: 10,
    recoilMs: 260,
    flashIntensity: 0.7,
  },
  'sparks-recoil': {
    category: 'sparksRecoil',
    recoilDistance: 8,
    recoilMs: 220,
    flashIntensity: 0.8,
    particleMotif: 'sparks',
  },
  'thrash-recoil': {
    category: 'thrashRecoil',
    recoilDistance: 12,
    recoilMs: 240,
    flashIntensity: 0.75,
  },
  'bark-crack': {
    category: 'barkCrack',
    recoilDistance: 6,
    recoilMs: 260,
    flashIntensity: 0.6,
  },
  'armor-clang': {
    category: 'armorClang',
    recoilDistance: 8,
    recoilMs: 220,
    flashIntensity: 0.8,
  },
  'roar-recoil': {
    category: 'roarRecoil',
    recoilDistance: 10,
    recoilMs: 240,
    flashIntensity: 0.75,
  },
  // Nosferatu: barely moves — a small flash/eye-glow reaction only.
  'unmoved-glance': {
    category: 'unmovedGlance',
    recoilDistance: 1,
    recoilMs: 150,
    flashIntensity: 0.3,
  },
}

const DEFAULT_HIT_REACTION_PLAN: MonsterHitReactionPlan = {
  category: 'generic',
  recoilDistance: 8,
  recoilMs: 220,
  flashIntensity: 0.7,
}

const MOTIF_KEYWORD_TOKENS: readonly (readonly [string, string])[] = [
  ['火花', 'sparks'],
  ['霧', 'mist'],
  ['飛沫', 'water_drops'],
  ['水', 'water_drops'],
  ['葉', 'leaves'],
  ['夜', 'shadow'],
  ['影', 'shadow'],
  ['紅', 'red_glow'],
  ['赤', 'red_glow'],
  ['血', 'red_glow'],
  ['疾風', 'wind'],
  ['風', 'wind'],
  ['炉', 'forge_glow'],
  ['炎', 'forge_glow'],
  ['鱗', 'scales'],
  ['翼', 'wings'],
  ['鎖', 'ancient_stone'],
  ['石柱', 'ancient_stone'],
  ['王紋', 'ancient_stone'],
  ['根', 'roots'],
  ['巨木', 'roots'],
  ['砂塵', 'dust'],
  ['角', 'dust'],
  ['瞳', 'presence'],
  ['佇まい', 'presence'],
  ['残骸', 'debris'],
]

/**
 * Derives typed presentation tokens from the Narrative-facing Japanese
 * `presentationMotifs` strings — purely additive/derived, never mutates or
 * replaces those strings. Order-stable (motif order, then keyword-table
 * order), deduplicated; falls back to a single neutral token if nothing
 * matches so a Presentation layer never has to special-case "no motifs".
 */
function deriveMotifTokens(motifs: readonly string[]): string[] {
  const tokens: string[] = []
  for (const motif of motifs) {
    for (const [keyword, token] of MOTIF_KEYWORD_TOKENS) {
      if (motif.includes(keyword) && !tokens.includes(token)) {
        tokens.push(token)
      }
    }
  }
  return tokens.length > 0 ? tokens : ['ambient']
}

export function resolveUniqueMonsterAnimationProfile(
  visualProfile: UniqueMonsterVisualProfile,
): MonsterPresentationPlan {
  return {
    idle: IDLE_PLANS[visualProfile.idleMotion] ?? DEFAULT_IDLE_PLAN,
    attack: ATTACK_PLANS[visualProfile.attackMotion] ?? DEFAULT_ATTACK_PLAN,
    hitReaction:
      HIT_REACTION_PLANS[visualProfile.hitReaction] ??
      DEFAULT_HIT_REACTION_PLAN,
    motifTokens: deriveMotifTokens(visualProfile.presentationMotifs),
  }
}

// --- Motif Runtime (Phase 9.8.3 item 42): connects the already-derived
// `motifTokens` to a small, fixed set of lightweight Presentation-only
// runtime element specs — the Battle Scene builds real Pixi Graphics from
// these once and only ever mutates position/alpha/scale per frame, never
// recreating them. Pure and deterministic: the same `motifTokens` array
// always yields the same element list, in the same order, zero RNG.

export type MotifRuntimeKind =
  | 'sparks'
  | 'forge_glow'
  | 'mist'
  | 'water_drops'
  | 'leaves'
  | 'shadow'
  | 'red_glow'
  | 'wind'
  | 'debris'
  | 'ambient'

export interface MotifElementSpec {
  kind: MotifRuntimeKind
  /** This element's 0-based index among other elements of the same `kind`
   * — used only to phase-shift multiple elements of one kind (e.g. 4
   * `sparks` staggered in time/position), never randomness. */
  index: number
}

/**
 * Not every raw token gets its own dedicated visual — several reuse the
 * closest existing runtime kind (item 57: "似たeffectを共用してもよい"),
 * e.g. a flying boss's `wings` token reuses the `wind` sweep, an ancient
 * boss's `ancient_stone`/`roots` reuse the slow `shadow` pulse. Every token
 * `deriveMotifTokens` can actually produce is covered here, so no token
 * ever silently falls through to nothing.
 */
const MOTIF_TOKEN_TO_RUNTIME_KIND: Record<string, MotifRuntimeKind> = {
  sparks: 'sparks',
  forge_glow: 'forge_glow',
  mist: 'mist',
  water_drops: 'water_drops',
  leaves: 'leaves',
  shadow: 'shadow',
  red_glow: 'red_glow',
  wind: 'wind',
  debris: 'debris',
  dust: 'debris',
  scales: 'sparks',
  wings: 'wind',
  ancient_stone: 'shadow',
  roots: 'leaves',
  presence: 'shadow',
  ambient: 'ambient',
}

/** Element counts per runtime kind — deliberately small (item 59: "数個〜
 * 十数個程度の軽量Graphics"), never scaling with anything but the fixed
 * kind itself. */
const MOTIF_ELEMENT_COUNTS: Record<MotifRuntimeKind, number> = {
  sparks: 4,
  forge_glow: 1,
  mist: 2,
  water_drops: 3,
  leaves: 3,
  shadow: 1,
  red_glow: 1,
  wind: 2,
  debris: 3,
  ambient: 1,
}

export function resolveMotifRuntimeKind(token: string): MotifRuntimeKind {
  return MOTIF_TOKEN_TO_RUNTIME_KIND[token] ?? 'ambient'
}

/**
 * Expands a boss's `motifTokens` into the concrete (small, fixed-count)
 * list of runtime elements the Battle Scene should build once. Token order
 * decides runtime-kind order (first appearance wins); duplicate tokens
 * mapping to the same kind only ever produce that kind's elements once.
 */
export function resolveMotifRuntimeElements(
  motifTokens: readonly string[],
): MotifElementSpec[] {
  const kinds: MotifRuntimeKind[] = []
  for (const token of motifTokens) {
    const kind = resolveMotifRuntimeKind(token)
    if (!kinds.includes(kind)) kinds.push(kind)
  }
  const elements: MotifElementSpec[] = []
  for (const kind of kinds) {
    const count = MOTIF_ELEMENT_COUNTS[kind]
    for (let index = 0; index < count; index++) {
      elements.push({ kind, index })
    }
  }
  return elements
}
