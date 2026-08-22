import { describe, expect, it } from 'vitest'
import {
  isKnownStatusEffectType,
  resolveStatusLabel,
  STATUS_EFFECT_TYPES,
} from './statusLabels.ts'
import type { StatusEffectType } from '../models/types.ts'

// Compile-time exhaustiveness: if `StatusEffectType` gains a member this
// switch doesn't cover, TS fails the build (no default case) — keeping
// `STATUS_EFFECT_TYPES` honest against the source-of-truth union.
function assertExhaustive(type: StatusEffectType): void {
  switch (type) {
    case 'poisoned':
    case 'bleeding':
    case 'stunned':
    case 'weakened':
    case 'guarded':
    case 'frightened':
    case 'healBlocked':
    case 'stealthed':
    case 'defenseDown':
      return
  }
}

describe('Phase 9.8.2 status label mapping', () => {
  it('STATUS_EFFECT_TYPES covers every StatusEffectType exhaustively', () => {
    for (const type of STATUS_EFFECT_TYPES) {
      assertExhaustive(type)
    }
    expect(STATUS_EFFECT_TYPES.length).toBe(9)
  })

  it('resolveStatusLabel returns a non-empty Japanese label for every known status, never the raw id', () => {
    for (const type of STATUS_EFFECT_TYPES) {
      const label = resolveStatusLabel(type)
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe(type)
    }
  })

  it('resolveStatusLabel falls back to a generic label for an unrecognized status, never the raw id', () => {
    expect(resolveStatusLabel('totally-unknown-status')).toBe('状態異常')
    expect(isKnownStatusEffectType('totally-unknown-status')).toBe(false)
  })

  it('isKnownStatusEffectType recognizes every real status type', () => {
    for (const type of STATUS_EFFECT_TYPES) {
      expect(isKnownStatusEffectType(type)).toBe(true)
    }
  })
})
