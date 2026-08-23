import type { SeededRng } from '../rng/seededRng.ts'

/**
 * Shared weighted focal-character pick (item 15): a slight bias toward the
 * Party leader, and a strong-but-not-absolute penalty against whoever was
 * focal recently — the same shape `minorScenes.ts`'s `selectFocalCharacter`
 * already uses for expedition flavor scenes, extracted here so Bond
 * Conversation (which additionally needs to exclude deceased members
 * before this runs — item 16) can share the exact weighting logic instead
 * of re-deriving a parallel one.
 *
 * Callers are responsible for filtering `memberIds` down to whichever
 * members are actually eligible; this function has no opinion on why a
 * member might be excluded.
 */
export function selectWeightedFocalCharacter(
  rng: SeededRng,
  memberIds: readonly string[],
  leaderId: string | undefined,
  recentFocalIds: readonly string[],
): string {
  let weights = memberIds.map((id) => {
    let w = 10
    if (id === leaderId) w += 5
    return w
  })

  for (let i = 0; i < memberIds.length; i++) {
    const count = recentFocalIds.filter((id) => id === memberIds[i]).length
    if (count > 0) weights[i] *= Math.pow(0.4, count)
  }

  if (weights.every((w) => w <= 0)) {
    weights = memberIds.map(() => 1)
  }

  return rng.weightedPick([...memberIds], weights)
}
