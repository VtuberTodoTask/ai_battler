import { describe, expect, it } from 'vitest'
import type { NarrativeMemberSnapshot, NarrativeTimelineBeat } from './types.ts'
import { determineNarrativeDirection, scoreBeats } from './director.ts'

function makeMember(
  id: string,
  profile?: NarrativeMemberSnapshot['narrativeProfile'],
): NarrativeMemberSnapshot {
  return {
    id,
    name: id.toUpperCase(),
    role: 'vanguard',
    rank: 'C',
    personality: {
      bravery: 0,
      caution: 0,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
    },
    narrativeProfile: profile,
  }
}

function makeBeat(
  overrides: Partial<NarrativeTimelineBeat>,
): NarrativeTimelineBeat {
  return {
    id: 'b',
    phase: 'approach',
    kind: 'event',
    text: 'default',
    importance: 50,
    ...overrides,
  }
}

describe('determineNarrativeDirection', () => {
  it('prioritizes casualty beats as main scenes', () => {
    const members = [makeMember('a'), makeMember('b')]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({
        id: 't1',
        phase: 'departure',
        text: 'Partyは出発した',
        importance: 45,
      }),
      makeBeat({
        id: 't2',
        phase: 'battle',
        text: 'Aが重傷を負った',
        importance: 95,
        actorIds: ['a'],
        targetIds: ['a'],
      }),
      makeBeat({
        id: 't3',
        phase: 'return',
        text: 'Partyは戻った',
        importance: 45,
      }),
    ]
    const dir = determineNarrativeDirection(timeline, members)
    expect(dir.mainScenes.some((s) => s.beatIds.includes('t2'))).toBe(true)
  })

  it('prioritizes healing and rescue beats', () => {
    const members = [makeMember('h'), makeMember('t')]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({ id: 't1', phase: 'departure', text: '出発', importance: 45 }),
      makeBeat({
        id: 't2',
        phase: 'battle',
        text: 'HがTを手当てした',
        importance: 85,
        actorIds: ['h'],
        targetIds: ['t'],
      }),
      makeBeat({ id: 't3', phase: 'return', text: '帰還', importance: 45 }),
    ]
    const dir = determineNarrativeDirection(timeline, members)
    const mainOrSecondary = [...dir.mainScenes, ...dir.secondaryScenes]
    expect(mainOrSecondary.some((s) => s.beatIds.includes('t2'))).toBe(true)
  })

  it('deprioritizes trivial movement beats to montage', () => {
    const members = [makeMember('a'), makeMember('b')]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({
        id: 't1',
        phase: 'departure',
        text: 'Partyは森へ向かった',
        importance: 45,
      }),
      makeBeat({
        id: 't2',
        phase: 'return',
        text: 'Partyは帰路についた',
        importance: 45,
      }),
    ]
    const dir = determineNarrativeDirection(timeline, members)
    expect(dir.mainScenes).toHaveLength(0)
    expect(dir.secondaryScenes).toHaveLength(0)
    expect(dir.montageBeatIds).toContain('t1')
    expect(dir.montageBeatIds).toContain('t2')
  })

  it('boosts beats involving characters with tense relationships', () => {
    const members = [makeMember('a'), makeMember('b')]
    const relationships = [
      {
        sourceCharacterId: 'a',
        sourceName: 'A',
        targetCharacterId: 'b',
        targetName: 'B',
        affinity: 30,
        trust: 25,
        respect: 50,
        tension: 80,
        recentEvents: [],
      },
      {
        sourceCharacterId: 'b',
        sourceName: 'B',
        targetCharacterId: 'a',
        targetName: 'A',
        affinity: 35,
        trust: 30,
        respect: 50,
        tension: 75,
        recentEvents: [],
      },
    ]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({
        id: 't1',
        text: 'AとBが言い争った',
        importance: 70,
        actorIds: ['a', 'b'],
      }),
      makeBeat({ id: 't2', text: '道を進んだ', importance: 70 }),
    ]
    const dir = determineNarrativeDirection(timeline, members, relationships)
    const selected = [...dir.mainScenes, ...dir.secondaryScenes]
    expect(selected.some((s) => s.beatIds.includes('t1'))).toBe(true)
  })

  it('boosts beats that collide with a character fear', () => {
    const members = [
      makeMember('z', { fears: ['孤立して囲まれること'] }),
      makeMember('a'),
    ]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({
        id: 't1',
        text: 'Zが敵に囲まれて孤立しかけた',
        importance: 70,
        actorIds: ['z'],
      }),
      makeBeat({ id: 't2', text: '森の中を進んだ', importance: 70 }),
    ]
    const dir = determineNarrativeDirection(timeline, members)
    const selected = [...dir.mainScenes, ...dir.secondaryScenes]
    expect(selected.some((s) => s.beatIds.includes('t1'))).toBe(true)
  })
})

describe('scoreBeats', () => {
  it('returns higher scores for relationship-relevant beats', () => {
    const members = [makeMember('a'), makeMember('b')]
    const relationships = [
      {
        sourceCharacterId: 'a',
        sourceName: 'A',
        targetCharacterId: 'b',
        targetName: 'B',
        affinity: 50,
        trust: 50,
        respect: 50,
        tension: 80,
        recentEvents: [],
      },
      {
        sourceCharacterId: 'b',
        sourceName: 'B',
        targetCharacterId: 'a',
        targetName: 'A',
        affinity: 50,
        trust: 50,
        respect: 50,
        tension: 80,
        recentEvents: [],
      },
    ]
    const beats = [
      makeBeat({
        id: 't1',
        text: 'AとBが対立した',
        importance: 60,
        actorIds: ['a', 'b'],
      }),
      makeBeat({ id: 't2', text: '道を進んだ', importance: 60 }),
    ]
    const scored = scoreBeats(beats, members, relationships)
    const s1 = scored.find((s) => s.beat.id === 't1')!
    const s2 = scored.find((s) => s.beat.id === 't2')!
    expect(s1.score).toBeGreaterThan(s2.score)
  })

  it('boosts beats that collide with a character value or flaw', () => {
    const members = [
      makeMember('a', { values: ['任務'] }),
      makeMember('b', { flaws: ['無謀'] }),
    ]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({
        id: 't1',
        text: 'Aは任務のために無謀な前進を続けた',
        importance: 60,
        actorIds: ['a', 'b'],
      }),
      makeBeat({ id: 't2', text: '森の中を進んだ', importance: 60 }),
    ]
    const scored = scoreBeats(timeline, members)
    const s1 = scored.find((s) => s.beat.id === 't1')!
    const s2 = scored.find((s) => s.beat.id === 't2')!
    expect(s1.score).toBeGreaterThan(s2.score)
  })
})

describe('NarrativeDirection focus and hints', () => {
  it('produces a narrative focus that references the main scene theme and characters', () => {
    const members = [
      makeMember('a', { values: ['仲間の安全'], flaws: ['自分を省みない'] }),
      makeMember('b'),
      makeMember('c'),
    ]
    const relationships = [
      {
        sourceCharacterId: 'b',
        sourceName: 'B',
        targetCharacterId: 'a',
        targetName: 'A',
        affinity: 70,
        trust: 75,
        respect: 60,
        tension: 10,
        recentEvents: [],
      },
      {
        sourceCharacterId: 'a',
        sourceName: 'A',
        targetCharacterId: 'b',
        targetName: 'B',
        affinity: 68,
        trust: 72,
        respect: 65,
        tension: 8,
        recentEvents: [],
      },
    ]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({ id: 't1', text: 'Partyは森へ向かった', importance: 45 }),
      makeBeat({
        id: 't2',
        text: 'Aは負傷したが任務を続けた',
        importance: 95,
        actorIds: ['a'],
        targetIds: ['a'],
      }),
      makeBeat({
        id: 't3',
        text: 'BはAの傷を気にかけた',
        importance: 85,
        actorIds: ['b'],
        targetIds: ['a'],
      }),
      makeBeat({ id: 't4', text: 'Partyは帰還した', importance: 45 }),
    ]
    const dir = determineNarrativeDirection(timeline, members, relationships)
    expect(dir.focus).toBeDefined()
    expect(dir.focus!.summary).toContain('A')
    expect(dir.focus!.characterIds).toContain('a')
    expect(dir.focus!.characterIds).toContain('b')
    expect(dir.focus!.relatedBeatIds!.length).toBeGreaterThan(0)
    expect(dir.interactionHints).toBeDefined()
    expect(dir.interactionHints!.length).toBeGreaterThan(0)
    const hint = dir.interactionHints!.find(
      (h) => h.characterIds.includes('a') && h.characterIds.includes('b'),
    )
    expect(hint).toBeDefined()
  })

  it('keeps the main scene budget low for routine success', () => {
    const members = [makeMember('a'), makeMember('b')]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({ id: 't1', text: 'Partyは依頼を引き受けた', importance: 45 }),
      makeBeat({ id: 't2', text: '森を進んだ', importance: 45 }),
      makeBeat({ id: 't3', text: '調査を進めた', importance: 55 }),
      makeBeat({
        id: 't4',
        text: '目的を達成した',
        importance: 85,
        kind: 'outcome',
      }),
      makeBeat({ id: 't5', text: 'Partyは帰還した', importance: 45 }),
    ]
    const dir = determineNarrativeDirection(timeline, members)
    expect(dir.mainScenes.length).toBeLessThanOrEqual(1)
    expect(dir.secondaryScenes.length).toBeLessThanOrEqual(2)
  })

  it('applies repetitive beat penalty so repeated movement stays montage', () => {
    const members = [makeMember('a'), makeMember('b')]
    const timeline: NarrativeTimelineBeat[] = [
      makeBeat({
        id: 't1',
        phase: 'departure',
        text: '出発した',
        importance: 50,
      }),
      makeBeat({
        id: 't2',
        phase: 'exploration',
        text: '森を進んだ',
        importance: 45,
      }),
      makeBeat({
        id: 't3',
        phase: 'exploration',
        text: '周囲を調査した',
        importance: 45,
      }),
      makeBeat({
        id: 't4',
        phase: 'exploration',
        text: 'さらに森を進んだ',
        importance: 45,
      }),
      makeBeat({ id: 't5', phase: 'return', text: '帰還した', importance: 50 }),
    ]
    const dir = determineNarrativeDirection(timeline, members)
    const mainSecondaryIds = [
      ...dir.mainScenes.flatMap((s) => s.beatIds),
      ...dir.secondaryScenes.flatMap((s) => s.beatIds),
    ]
    expect(
      mainSecondaryIds.filter((id) => id === 't3').length,
    ).toBeLessThanOrEqual(1)
    expect(mainSecondaryIds.filter((id) => id === 't4').length).toBe(0)
  })
})
