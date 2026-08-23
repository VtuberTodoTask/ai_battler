import { describe, expect, it } from 'vitest'
import { OPENING_SCRIPT } from './opening.ts'

describe('OPENING_SCRIPT (Phase 9.10 canonical Opening)', () => {
  it('establishes the protagonist was once a hero', () => {
    expect(OPENING_SCRIPT).toContain('勇者')
  })

  it('establishes the protagonist is cursed', () => {
    expect(OPENING_SCRIPT).toContain('呪い')
  })

  it('establishes the protagonist can no longer fight', () => {
    expect(OPENING_SCRIPT).toContain('戦うことはできない')
  })

  it('establishes the tavern setting', () => {
    expect(OPENING_SCRIPT).toContain('酒場')
  })

  it('establishes the relationship with adventurers', () => {
    expect(OPENING_SCRIPT).toContain('冒険者')
  })

  it('never names Nosferatu — the final threat is not spoiled at Opening time', () => {
    expect(OPENING_SCRIPT).not.toContain('ノスフェラトゥ')
  })

  it('is a substantial canonical script, not a short placeholder', () => {
    expect(OPENING_SCRIPT.length).toBeGreaterThan(1500)
  })
})
