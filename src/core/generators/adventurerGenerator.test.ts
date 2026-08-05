import { describe, expect, it } from 'vitest'
import {
  generateAdventurer,
  generateAdventurers,
} from './adventurerGenerator.ts'
import { ROLE_MAP } from '../../data/roles.ts'

describe('generateAdventurer', () => {
  it('同一シードで同一キャラクターを生成する', () => {
    const a = generateAdventurer({
      seed: 'adv-test-001',
      rank: 'C',
      role: 'vanguard',
    })
    const b = generateAdventurer({
      seed: 'adv-test-001',
      rank: 'C',
      role: 'vanguard',
    })
    expect(a).toEqual(b)
  })

  it('能力値が範囲内かつ役割の得意能力が高い', () => {
    const adv = generateAdventurer({
      seed: 'adv-test-002',
      rank: 'C',
      role: 'mage',
    })
    const role = ROLE_MAP[adv.role]
    const stats = adv.stats

    Object.entries(stats).forEach(([_key, value]) => {
      expect(value).toBeGreaterThanOrEqual(20)
      expect(value).toBeLessThanOrEqual(adv.rank === 'S' ? 100 : 95)
    })

    expect(stats[role.stats.mostImportant]).toBeGreaterThan(
      stats[role.stats.weak],
    )
    expect(stats[role.stats.mostImportant]).toBeGreaterThan(
      stats[role.stats.fatal],
    )
    for (const good of role.stats.good) {
      expect(stats[good]).toBeGreaterThan(stats[role.stats.fatal])
      expect(stats[good]).toBeGreaterThan(stats[role.stats.weak])
    }
  })

  it('技能が範囲内', () => {
    const adv = generateAdventurer({
      seed: 'adv-test-003',
      rank: 'B',
      role: 'healer',
    })
    Object.values(adv.skills).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(adv.rank === 'S' ? 100 : 95)
    })
  })

  it('特性が2つの長所と1つの短所', () => {
    const adv = generateAdventurer({ seed: 'adv-test-004' })
    const positives = adv.traits.filter(
      (t) =>
        ![
          'reckless',
          'cowardly',
          'lootObsessed',
          'headstrong',
          'frail',
          'magicFear',
          'claustrophobia',
          'loyal',
          'healerHunter',
          'lateRetreat',
        ].includes(t.traitId),
    )
    const negatives = adv.traits.filter((t) =>
      [
        'reckless',
        'cowardly',
        'lootObsessed',
        'headstrong',
        'frail',
        'magicFear',
        'claustrophobia',
        'loyal',
        'healerHunter',
        'lateRetreat',
      ].includes(t.traitId),
    )
    expect(positives.length).toBe(2)
    expect(negatives.length).toBe(1)
  })
})

describe('大規模生成検証', () => {
  it('10,000体の能力値が範囲外にならない', () => {
    const allStats: number[] = []
    for (let i = 0; i < 10000; i++) {
      const adv = generateAdventurer({ seed: `bulk-${i}` })
      allStats.push(...Object.values(adv.stats))
      const role = ROLE_MAP[adv.role]
      expect(adv.stats[role.stats.mostImportant]).toBeGreaterThanOrEqual(20)
      expect(adv.stats[role.stats.fatal]).toBeGreaterThanOrEqual(20)
    }
    expect(allStats.every((v) => v >= 1 && v <= 100)).toBe(true)
  })

  it('全キャラクターが同一能力値にならない', () => {
    const adventurers = generateAdventurers({ seed: 'same-test', count: 5 })
    const statSets = adventurers.map((a) => JSON.stringify(a.stats))
    const unique = new Set(statSets)
    expect(unique.size).toBeGreaterThan(1)
  })
})
