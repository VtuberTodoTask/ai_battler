import { describe, expect, it } from 'vitest'
import type { Adventurer, CharacterNarrativeProfile } from '../models/types.ts'
import {
  deriveCharacterNarrativeProfile,
  formatNarrativeProfile,
} from './characterProfile.ts'

function makeAdventurer(
  overrides: Partial<Adventurer> & {
    personality?: Adventurer['personality']
  } = {},
): Adventurer {
  return {
    id: 'a1',
    seed: 's1',
    name: 'テスト',
    rank: 'C',
    role: 'vanguard',
    level: 1,
    stats: {} as Adventurer['stats'],
    skills: {} as Adventurer['skills'],
    maxHp: 20,
    currentHp: 20,
    maxMp: 20,
    currentMp: 20,
    morale: 50,
    traits: [],
    personality: {
      bravery: 0,
      caution: 0,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
    },
    equipment: {} as Adventurer['equipment'],
    statusEffects: [],
    ...overrides,
  } as unknown as Adventurer
}

describe('deriveCharacterNarrativeProfile', () => {
  it('returns a profile without mutating the adventurer', () => {
    const member = makeAdventurer({
      role: 'guardian',
      personality: {
        bravery: 2,
        caution: 2,
        cooperation: 1,
        discipline: 1,
        altruism: 2,
        greed: -2,
      },
    })
    const original = JSON.stringify(member)
    const profile = deriveCharacterNarrativeProfile(member)
    expect(profile.temperament).toBeDefined()
    expect(profile.socialStyle).toBeDefined()
    expect(profile.fears).toBeDefined()
    expect(profile.habits).toBeDefined()
    expect(JSON.stringify(member)).toBe(original)
  })

  it('uses provided narrative profile when present', () => {
    const explicit: CharacterNarrativeProfile = {
      temperament: '自分だけの正義を貫く',
      socialStyle: '冷たいが頼りになる',
      values: ['正義'],
      flaws: ['協調性がない'],
      fears: ['仲間を裏切ること'],
      habits: ['剣の手入れを頻繁にする'],
      speechStyle: '一言多い',
    }
    const member = makeAdventurer({ narrativeProfile: explicit })
    expect(deriveCharacterNarrativeProfile(member)).toEqual(explicit)
  })

  it('falls back to role-based fear', () => {
    const guardian = makeAdventurer({ role: 'guardian' })
    const healer = makeAdventurer({ role: 'healer' })
    expect(deriveCharacterNarrativeProfile(guardian).fears).toContain(
      '守るべき者を失うこと',
    )
    expect(deriveCharacterNarrativeProfile(healer).fears).toContain(
      '手の届かない傷',
    )
  })

  it('maps bravery and caution into temperament', () => {
    const reckless = makeAdventurer({
      personality: {
        bravery: 3,
        caution: -2,
        cooperation: 0,
        discipline: 0,
        altruism: 0,
        greed: 0,
      },
    })
    const careful = makeAdventurer({
      personality: {
        bravery: -2,
        caution: 3,
        cooperation: 0,
        discipline: 0,
        altruism: 0,
        greed: 0,
      },
    })
    expect(deriveCharacterNarrativeProfile(reckless).temperament).toContain(
      '猪突',
    )
    expect(deriveCharacterNarrativeProfile(careful).temperament).toContain(
      '慎重',
    )
  })

  it('formats a profile into a single readable line', () => {
    const profile: CharacterNarrativeProfile = {
      temperament: '冷静',
      socialStyle: '友好的',
      values: ['信頼'],
      flaws: ['頑固'],
      fears: ['孤独'],
      habits: ['指を鳴らす'],
      speechStyle: '丁寧',
    }
    const text = formatNarrativeProfile(profile)
    expect(text).toContain('気質: 冷静')
    expect(text).toContain('対人: 友好的')
    expect(text).toContain('重視: 信頼')
    expect(text).toContain('欠点: 頑固')
    expect(text).toContain('恐れ: 孤独')
    expect(text).toContain('癖: 指を鳴らす')
    expect(text).toContain('口調: 丁寧')
  })

  it('formats an empty profile as no notable record', () => {
    expect(formatNarrativeProfile(undefined)).toContain('特筆')
  })
})
