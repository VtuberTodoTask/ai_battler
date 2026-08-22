import type { StatusEffectType } from '../models/types.ts'

/**
 * The complete, authoritative list of `StatusEffectType` values — kept in
 * sync with `../models/types.ts`'s `StatusEffectType` union by the
 * `statusLabels.test.ts` exhaustiveness check (a TS switch with no default
 * case fails to compile if the union gains a member this array doesn't
 * cover). Used both as a runtime whitelist (Save Validation) and as the key
 * set for the Player-facing label table below.
 */
export const STATUS_EFFECT_TYPES: readonly StatusEffectType[] = [
  'poisoned',
  'bleeding',
  'stunned',
  'weakened',
  'guarded',
  'frightened',
  'healBlocked',
  'stealthed',
  'defenseDown',
]

const STATUS_EFFECT_TYPE_SET: ReadonlySet<string> = new Set(STATUS_EFFECT_TYPES)

export function isKnownStatusEffectType(
  value: string,
): value is StatusEffectType {
  return STATUS_EFFECT_TYPE_SET.has(value)
}

/**
 * Player-facing display labels for internal status identifiers. A raw
 * status id (`poisoned`, `healBlocked`, ...) must never be shown directly
 * in any Player-facing UI — Battle Playback, Party detail, DayResults, etc.
 * all resolve through `resolveStatusLabel` instead of reading `.type`
 * directly for display purposes.
 */
const STATUS_EFFECT_LABELS: Record<StatusEffectType, string> = {
  poisoned: '毒',
  bleeding: '出血',
  stunned: '気絶',
  weakened: '弱体',
  guarded: '防護',
  frightened: '恐怖',
  healBlocked: '治療阻害',
  stealthed: '隠密',
  defenseDown: '防御低下',
}

const UNKNOWN_STATUS_FALLBACK_LABEL = '状態異常'

/**
 * Resolves any status identifier (including a corrupted/unrecognized one
 * from a tampered or future-incompatible save) to a Player-facing Japanese
 * label — never the raw internal id, and never throws.
 */
export function resolveStatusLabel(status: string): string {
  return isKnownStatusEffectType(status)
    ? STATUS_EFFECT_LABELS[status]
    : UNKNOWN_STATUS_FALLBACK_LABEL
}
