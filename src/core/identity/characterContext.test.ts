import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { buildCharacterNarrativeProfile } from './generator.ts'
import { projectCharacterContextForNarrative } from './characterContext.ts'
import type {
  CharacterRelationshipSnapshot,
  NarrativeMemberSnapshot,
  NarrativeRequestInfo,
} from '../narrative/types.ts'

function makeSnapshot(
  m: ReturnType<typeof generateAdventurer>,
): NarrativeMemberSnapshot {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    rank: m.rank,
    personality: m.personality,
    narrativeProfile: m.narrativeProfile ?? buildCharacterNarrativeProfile(m),
    identity: m.identity,
    lifeBackground: m.lifeBackground,
    culturalInfluences: m.culturalInfluences,
    romanticProfile: m.romanticProfile,
  }
}

describe('projectCharacterContextForNarrative', () => {
  const request: NarrativeRequestInfo = {
    id: 'req-1',
    title: '廃坑の測量',
    objectiveType: 'survey',
    rank: 'C',
    environment: 'cave',
    briefing: '廃坑の内部構造を測量する',
    publicTags: ['廃坑', '洞窟', '測量'],
  }

  it('omits romance when scene characters are unrelated', () => {
    const m = generateAdventurer({
      seed: 'no-romance',
      rank: 'C',
      role: 'scout',
    })
    const snapshot = makeSnapshot(m)
    const ctx = projectCharacterContextForNarrative(
      snapshot,
      '廃坑の入り口で準備を整える',
      request,
      [m.id],
      [],
    )
    expect(ctx.romanticHint).toBeUndefined()
  })

  it('includes background relevant to the scene focus', () => {
    const m = generateAdventurer({ seed: 'miner-bg', rank: 'C', role: 'scout' })
    const snapshot = makeSnapshot(m)
    snapshot.lifeBackground = {
      ...snapshot.lifeBackground,
      formerOccupation: '鉱夫',
      reasonForAdventuring: '独立資金を得るため',
    }
    snapshot.identity = {
      ...snapshot.identity!,
      countryOfOrigin: 'kared',
    }
    const ctx = projectCharacterContextForNarrative(
      snapshot,
      '鉱夫の経験から坑道の天井を確認する',
      request,
      [m.id],
      [],
    )
    expect(ctx.relevantBackground?.some((b) => b.includes('鉱夫'))).toBe(true)
  })

  it('includes romantic hint when a scene character has high romantic attraction', () => {
    const a = generateAdventurer({
      seed: 'romance-a',
      rank: 'C',
      role: 'vanguard',
    })
    const b = generateAdventurer({
      seed: 'romance-b',
      rank: 'C',
      role: 'healer',
    })
    const snapA = makeSnapshot(a)
    snapA.romanticProfile = {
      attraction: { genders: [b.identity?.gender ?? 'female'], openness: 90 },
      romanceAttitude: 'cautious',
    }
    const rels: CharacterRelationshipSnapshot[] = [
      {
        sourceCharacterId: a.id,
        sourceName: a.name,
        targetCharacterId: b.id,
        targetName: b.name,
        affinity: 50,
        trust: 50,
        respect: 50,
        tension: 50,
        romanticAttraction: 80,
      },
    ]
    const ctx = projectCharacterContextForNarrative(
      snapA,
      'aとbが一一緒に傷を手当てする',
      request,
      [a.id, b.id],
      rels,
    )
    expect(ctx.romanticHint).toBeDefined()
    expect(ctx.romanticHint).toContain(b.name)
  })
})
