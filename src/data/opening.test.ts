import { describe, expect, it } from 'vitest'
import { OPENING_SCRIPT } from './opening.ts'

describe('OPENING_SCRIPT (Phase 9.10 canonical Opening)', () => {
  it('establishes the protagonist was once a hero', () => {
    expect(OPENING_SCRIPT).toContain('勇者')
  })

  it('names Nosferatu directly, sealing the protagonist’s power on-screen', () => {
    expect(OPENING_SCRIPT).toContain('ノスフェラトゥ')
    expect(OPENING_SCRIPT).toContain('実験台')
  })

  it('has the fairy introduce itself as a messenger of the gods', () => {
    expect(OPENING_SCRIPT).toContain('神の使い')
  })

  it('establishes the tavern-owner premise the fairy proposes', () => {
    expect(OPENING_SCRIPT).toContain('酒場')
    expect(OPENING_SCRIPT).toContain('酒場の主人')
  })

  it('establishes the relationship-brokering premise with adventurers', () => {
    expect(OPENING_SCRIPT).toContain('冒険者')
  })

  it('ends on the fairy guiding the player into the tavern as their new role (future Tutorial hook)', () => {
    expect(OPENING_SCRIPT).toContain('店主さん')
    expect(OPENING_SCRIPT).toContain('お仕事のやり方')
  })

  it('never gives the protagonist a line of dialogue', () => {
    // The protagonist is described only through non-verbal reaction beats
    // (glancing, tilting their head, reaching for a sword) — never a
    // quoted 「」 line attributed to them. Every quoted line in this
    // script belongs to Nosferatu or the fairy.
    const dialogueLines = OPENING_SCRIPT.match(/「[^」]*」/g) ?? []
    expect(dialogueLines.length).toBeGreaterThan(0)
    for (const line of dialogueLines) {
      expect(line).not.toMatch(/俺|僕|私は元勇者|オレ/)
    }
  })

  it('is a substantial canonical script, not a short placeholder', () => {
    expect(OPENING_SCRIPT.length).toBeGreaterThan(1200)
  })
})
