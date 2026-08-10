import type { CharacterNarrativeProfile } from '../models/types.ts'
import type {
  CharacterRelationshipSnapshot,
  NarrativeDirection,
  NarrativeFocus,
  NarrativeInteractionHint,
  NarrativeMemberSnapshot,
  NarrativeSceneSelection,
  NarrativeTimelineBeat,
} from './types.ts'

interface BeatScore {
  beat: NarrativeTimelineBeat
  index: number
  score: number
}

const MAIN_THRESHOLD = 90
const SECONDARY_THRESHOLD = 70
const MONTAGE_THRESHOLD = 40

function normalizeText(text: string): string {
  return text.toLowerCase()
}

function extractTerms(value: string): string[] {
  const matches = value.match(/[一-龠々〆〤ぁ-ゔァ-ヴーa-zA-Z0-9]+/g) ?? []
  const terms = matches.filter((t) => t.length >= 2)
  return [...new Set(terms)]
}

function profileKeywords(profile: CharacterNarrativeProfile): string[] {
  const keywords: string[] = []
  const add = (value: string | undefined) => {
    if (!value) return
    keywords.push(...extractTerms(value))
  }
  add(profile.temperament)
  add(profile.socialStyle)
  add(profile.speechStyle)
  for (const v of profile.values ?? []) add(v)
  for (const f of profile.flaws ?? []) add(f)
  for (const f of profile.fears ?? []) add(f)
  for (const h of profile.habits ?? []) add(h)
  return [...new Set(keywords)]
}

function profileRelevance(
  beat: NarrativeTimelineBeat,
  member: NarrativeMemberSnapshot,
): number {
  if (!member.narrativeProfile) return 0
  const keywords = profileKeywords(member.narrativeProfile)
  if (keywords.length === 0) return 0
  const text = normalizeText(beat.text)
  let hits = 0
  for (const keyword of keywords) {
    if (text.includes(keyword)) hits += 1
  }
  return hits * 8
}

interface ProfileTheme {
  profileKeywords: string[]
  eventKeywords: string[]
  bonus: number
}

const PROFILE_THEMES: ProfileTheme[] = [
  {
    profileKeywords: ['仲間', '守る', '失う', '死', '傷', '手の届かない', '者'],
    eventKeywords: [
      '負傷',
      '重傷',
      '傷',
      '命',
      '死',
      '倒',
      '不能',
      '被害',
      '損傷',
      '治療',
      '手当て',
      '守',
    ],
    bonus: 12,
  },
  {
    profileKeywords: ['孤立', '囲', '追', '逃'],
    eventKeywords: ['囲', '孤立', '追', '逃', '戦闘', '敵', '逃げ', '挟'],
    bonus: 12,
  },
  {
    profileKeywords: ['任務', '責任', '依頼', '目的', '誰も', '見捨てない'],
    eventKeywords: [
      '任務',
      '目的',
      '依頼',
      '達成',
      '負傷',
      '戦闘',
      '守',
      '手当て',
    ],
    bonus: 10,
  },
  {
    profileKeywords: ['魔力', '魔法', '呪文'],
    eventKeywords: ['魔力', '魔法', '呪文', '詠唱'],
    bonus: 10,
  },
  {
    profileKeywords: ['獲物', '逃', '失', '見落と'],
    eventKeywords: ['逃', '失', '逃した', '逃げ', '達成できな', '見失', '見落'],
    bonus: 10,
  },
  {
    profileKeywords: ['無謀', '猪突', '金銭', '条件', '報酬', '優柔不断'],
    eventKeywords: [
      '先制',
      '突撃',
      '突進',
      '金',
      '報酬',
      '条件',
      '迷う',
      '迷い',
    ],
    bonus: 8,
  },
]

function profileThematicBonus(
  beat: NarrativeTimelineBeat,
  memberMap: ReadonlyMap<string, NarrativeMemberSnapshot>,
): number {
  const ids = new Set<string>([
    ...(beat.actorIds ?? []),
    ...(beat.targetIds ?? []),
  ])
  const text = normalizeText(beat.text)
  let bonus = 0
  const usedThemes = new Set<number>()
  for (const id of ids) {
    const member = memberMap.get(id)
    if (!member?.narrativeProfile) continue
    const profileText = [
      ...(member.narrativeProfile.values ?? []),
      ...(member.narrativeProfile.flaws ?? []),
      ...(member.narrativeProfile.fears ?? []),
      member.narrativeProfile.temperament ?? '',
    ].join(' ')
    if (!profileText) continue
    const normalizedProfile = normalizeText(profileText)
    for (let i = 0; i < PROFILE_THEMES.length; i++) {
      const theme = PROFILE_THEMES[i]
      const profileMatch = theme.profileKeywords.some((k) =>
        normalizedProfile.includes(k),
      )
      const eventMatch = theme.eventKeywords.some((k) => text.includes(k))
      if (profileMatch && eventMatch && !usedThemes.has(i)) {
        bonus += theme.bonus
        usedThemes.add(i)
      }
    }
  }
  return bonus
}

function relationshipRelevance(rel: CharacterRelationshipSnapshot): number {
  let boost = 0
  if (rel.affinity >= 60) boost += 5
  if (rel.affinity <= 40) boost += 5
  if (rel.trust >= 60) boost += 4
  if (rel.trust <= 40) boost += 4
  if (rel.tension >= 60) boost += 7
  if (rel.respect >= 60) boost += 3
  return boost
}

function isNotableRelationship(rel: CharacterRelationshipSnapshot): boolean {
  return (
    rel.affinity >= 60 ||
    rel.affinity <= 40 ||
    rel.trust >= 60 ||
    rel.trust <= 40 ||
    rel.tension >= 60 ||
    rel.respect >= 60 ||
    (rel.tags?.length ?? 0) > 0 ||
    (rel.recentEvents?.length ?? 0) > 0
  )
}

function computeBeatScore(
  beat: NarrativeTimelineBeat,
  index: number,
  timeline: NarrativeTimelineBeat[],
  memberMap: ReadonlyMap<string, NarrativeMemberSnapshot>,
  relationshipMap: ReadonlyMap<string, CharacterRelationshipSnapshot>,
): number {
  let score = beat.importance
  const ids = new Set<string>([
    ...(beat.actorIds ?? []),
    ...(beat.targetIds ?? []),
  ])
  const idList = Array.from(ids)

  let hasRelationship = false
  for (const source of idList) {
    const member = memberMap.get(source)
    if (member) score += profileRelevance(beat, member)
    for (const target of idList) {
      if (source === target) continue
      const rel = relationshipMap.get(`${source}:${target}`)
      if (rel) {
        hasRelationship = true
        score += relationshipRelevance(rel)
      }
    }
  }

  if (idList.length >= 2 && hasRelationship) {
    score += 8
    let hasCollision = false
    for (const id of idList) {
      const member = memberMap.get(id)
      if (member && profileRelevance(beat, member) > 0) {
        hasCollision = true
        break
      }
    }
    if (hasCollision) score += 8
  }

  score += profileThematicBonus(beat, memberMap)

  if (beat.kind === 'outcome' && idList.length === 0) {
    score -= 12
  }

  score -= repetitivePenalty(beat, index, timeline)

  return score
}

function repetitivePenalty(
  beat: NarrativeTimelineBeat,
  index: number,
  timeline: NarrativeTimelineBeat[],
): number {
  if (beat.actorIds?.length || beat.targetIds?.length) return 0
  let consecutive = 0
  for (let i = index - 1; i >= 0; i--) {
    const prev = timeline[i]
    if (
      prev.phase === beat.phase &&
      prev.kind === beat.kind &&
      !prev.actorIds?.length &&
      !prev.targetIds?.length
    ) {
      consecutive++
    } else {
      break
    }
  }
  return Math.min(consecutive, 3) * 10
}

export function scoreBeats(
  timeline: NarrativeTimelineBeat[],
  members: NarrativeMemberSnapshot[],
  characterRelationships?: CharacterRelationshipSnapshot[],
): BeatScore[] {
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const relationshipMap = new Map(
    (characterRelationships ?? []).map((r) => [
      `${r.sourceCharacterId}:${r.targetCharacterId}`,
      r,
    ]),
  )
  return timeline.map((beat, index) => ({
    beat,
    index,
    score: computeBeatScore(beat, index, timeline, memberMap, relationshipMap),
  }))
}

function buildScene(
  scored: BeatScore[],
  startIndex: number,
  endIndex: number,
): NarrativeSceneSelection {
  const sceneBeats = scored.slice(startIndex, endIndex + 1).map((s) => s.beat)
  const beatIds = sceneBeats.map((b) => b.id)
  const focus = sceneBeats.map((b) => b.text).join(' → ')
  const first = sceneBeats[0]!
  const phase = first.phase
  const characterIds = [
    ...new Set(
      sceneBeats.flatMap((b) => [
        ...(b.actorIds ?? []),
        ...(b.targetIds ?? []),
      ]),
    ),
  ].sort()
  const reason =
    sceneBeats.length > 1
      ? `${phase}における連続した出来事（重要度 ${first.importance}）`
      : `${phase}の重要な出来事（重要度 ${first.importance}）`
  return { beatIds, focus, reason, characterIds }
}

function includeConsecutive(
  scored: BeatScore[],
  start: number,
  threshold: number,
  maxLength: number,
  assigned: Set<number>,
): number {
  let end = start
  while (
    end + 1 < scored.length &&
    !assigned.has(end + 1) &&
    scored[end + 1]!.score >= threshold &&
    end - start + 1 < maxLength
  ) {
    end++
  }
  return end
}

function buildFocus(
  mainScenes: NarrativeSceneSelection[],
  secondaryScenes: NarrativeSceneSelection[],
  beatMap: ReadonlyMap<string, NarrativeTimelineBeat>,
  members: NarrativeMemberSnapshot[],
): NarrativeFocus | undefined {
  const sources =
    mainScenes.length > 0 ? mainScenes : secondaryScenes.slice(0, 1)
  if (sources.length === 0) return undefined

  const beatIds = sources.flatMap((s) => s.beatIds)
  const beats = beatIds
    .map((id) => beatMap.get(id))
    .filter((b): b is NarrativeTimelineBeat => b !== undefined)
  const combinedText = beats.map((b) => b.text).join('')
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const characterIds = [
    ...new Set(
      beats.flatMap((b) => [...(b.actorIds ?? []), ...(b.targetIds ?? [])]),
    ),
  ].sort()

  const theme = detectTheme(combinedText)
  const central = pickCentralMember(theme, combinedText, characterIds, members)
  const otherNames = characterIds
    .filter((id) => id !== central.id)
    .map((id) => memberMap.get(id)?.name ?? id)
    .filter(Boolean)
  const others = otherNames.length > 0 ? `と${otherNames.join('、')}` : ''

  let summary: string
  switch (theme) {
    case 'injury':
      summary = `「${central.name}${others}を気にかける仲間たちと、${central.name}が傷を負いながらも前に進む場面」`
      break
    case 'surround':
      summary = `「${central.name}が孤立しかけた場面${others}の連携」`
      break
    case 'route':
      summary = `「帰路で予定を外れた${central.name}${others}の反応」`
      break
    case 'combat':
      summary = `「戦闘の中で${central.name}${others}の連携とその余波」`
      break
    case 'objective':
      summary = `「${central.name}${others}を中心に、依頼目的へ向かう様子」`
      break
    default:
      summary = `「${central.name}${others}を中心に、今回の遠征で最も印象に残る出来事」`
  }

  return {
    summary,
    characterIds,
    relatedBeatIds: beatIds,
    reason: `${mainScenes.length > 0 ? 'MAIN' : 'SECONDARY'} SCENEのテーマ「${theme}」から生成`,
  }
}

type BeatTheme =
  'injury' | 'surround' | 'route' | 'combat' | 'objective' | 'event'

function detectTheme(text: string): BeatTheme {
  if (/負傷|重傷|傷|手当て|治療|命を落と|死亡|戦闘不能|倒|被害|損傷/.test(text))
    return 'injury'
  if (/囲|孤立|追|逃|逃げ|挟/.test(text)) return 'surround'
  if (/道|経路|迂回|迷|戻|帰路/.test(text)) return 'route'
  if (/戦闘|敵|勝利|撤退|敗北/.test(text)) return 'combat'
  if (/護衛|救出|回収|測量|調査|討伐|目的|目標/.test(text)) return 'objective'
  return 'event'
}

function findAllIndices(haystack: string, needle: string): number[] {
  const indices: number[] = []
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    indices.push(i)
    i = haystack.indexOf(needle, i + needle.length)
  }
  return indices
}

function pickCentralMember(
  theme: BeatTheme,
  text: string,
  characterIds: string[],
  members: NarrativeMemberSnapshot[],
): NarrativeMemberSnapshot {
  const memberMap = new Map(members.map((m) => [m.id, m]))

  const themeKeywords: Record<BeatTheme, string[]> = {
    injury: ['負傷', '重傷', '傷', '手当て', '治療', '命', '死', '倒'],
    surround: ['囲', '孤立', '追', '逃'],
    route: ['道', '経路', '迂回', '迷', '戻'],
    combat: ['戦闘', '敵', '勝利', '撤退'],
    objective: ['護衛', '救出', '回収', '測量', '調査', '討伐', '目的'],
    event: [],
  }

  // Prefer a character whose name appears closest to the theme keywords.
  // When distances tie, prefer the name that appears before the keyword
  // (the subject of the event) over the one that appears after it.
  const keywords = themeKeywords[theme]
  if (keywords.length > 0) {
    type Candidate = {
      member: NarrativeMemberSnapshot
      minDistance: number
      nameBeforeKeyword: boolean
    }
    const candidates: Candidate[] = []
    for (const id of characterIds) {
      const member = memberMap.get(id)
      if (!member) continue
      const nameIndices = findAllIndices(text, member.name)
      if (nameIndices.length === 0) continue
      let minDistance = Infinity
      let nameBeforeKeyword = false
      for (const keyword of keywords) {
        for (const keywordIndex of findAllIndices(text, keyword)) {
          for (const nameIndex of nameIndices) {
            const distance = Math.abs(nameIndex - keywordIndex)
            if (distance < minDistance) {
              minDistance = distance
              nameBeforeKeyword = nameIndex <= keywordIndex
            } else if (distance === minDistance && nameIndex <= keywordIndex) {
              nameBeforeKeyword = true
            }
          }
        }
      }
      if (minDistance <= 15) {
        candidates.push({ member, minDistance, nameBeforeKeyword })
      }
    }
    candidates.sort((a, b) => {
      const aScore = a.minDistance - (a.nameBeforeKeyword ? 5 : 0)
      const bScore = b.minDistance - (b.nameBeforeKeyword ? 5 : 0)
      if (aScore !== bScore) return aScore - bScore
      if (a.nameBeforeKeyword !== b.nameBeforeKeyword) {
        return a.nameBeforeKeyword ? -1 : 1
      }
      return 0
    })
    if (candidates.length > 0) return candidates[0]!.member
  }

  // Prefer a character whose profile intersects the theme.
  for (const id of characterIds) {
    const member = memberMap.get(id)
    if (!member?.narrativeProfile) continue
    const profileText = [
      ...(member.narrativeProfile.values ?? []),
      ...(member.narrativeProfile.flaws ?? []),
      ...(member.narrativeProfile.fears ?? []),
      member.narrativeProfile.temperament ?? '',
    ].join(' ')
    if (keywords.some((k) => profileText.includes(k))) return member
  }

  const first = characterIds[0] ? memberMap.get(characterIds[0]) : members[0]
  return first ?? members[0]!
}

function buildInteractionHints(
  mainScenes: NarrativeSceneSelection[],
  secondaryScenes: NarrativeSceneSelection[],
  beatMap: ReadonlyMap<string, NarrativeTimelineBeat>,
  members: NarrativeMemberSnapshot[],
  characterRelationships?: CharacterRelationshipSnapshot[],
): NarrativeInteractionHint[] {
  if (!characterRelationships || characterRelationships.length === 0) return []
  const relMap = new Map(
    characterRelationships.map((r) => [
      `${r.sourceCharacterId}:${r.targetCharacterId}`,
      r,
    ]),
  )
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const hints: NarrativeInteractionHint[] = []
  const seen = new Set<string>()

  const sources = [...mainScenes, ...secondaryScenes.slice(0, 2)]
  for (const scene of sources) {
    const beatIds = scene.beatIds
    const beats = beatIds
      .map((id) => beatMap.get(id))
      .filter((b): b is NarrativeTimelineBeat => b !== undefined)
    const ids = [
      ...new Set(
        beats.flatMap((b) => [...(b.actorIds ?? []), ...(b.targetIds ?? [])]),
      ),
    ].sort()
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!
        const b = ids[j]!
        const key = [a, b].sort().join(':')
        if (seen.has(key)) continue
        const ab = relMap.get(`${a}:${b}`)
        const ba = relMap.get(`${b}:${a}`)
        if (
          (ab && isNotableRelationship(ab)) ||
          (ba && isNotableRelationship(ba))
        ) {
          seen.add(key)
          const aName = memberMap.get(a)?.name ?? a
          const bName = memberMap.get(b)?.name ?? b
          const summary = relationshipHintSummary(ab ?? ba)
          const theme = detectTheme(beats.map((x) => x.text).join(''))
          const dynamic = suggestedDynamic(aName, bName, theme, ab, ba)
          hints.push({
            characterIds: [a, b],
            beatIds,
            relationshipSummary: summary,
            suggestedDynamic: dynamic,
          })
        }
      }
    }
  }

  return hints
}

function relationshipHintSummary(
  rel: CharacterRelationshipSnapshot | undefined,
): string | undefined {
  if (!rel) return undefined
  const parts: string[] = []
  if (rel.affinity >= 60) parts.push('親密度が高い')
  else if (rel.affinity <= 40) parts.push('親密度が低い')
  if (rel.trust >= 60) parts.push('信頼が厚い')
  else if (rel.trust <= 40) parts.push('信頼が薄い')
  if (rel.tension >= 60) parts.push('緊張がある')
  if (rel.respect >= 60) parts.push('尊敬している')
  if (rel.tags && rel.tags.length > 0) parts.push(...rel.tags)
  return parts.length > 0 ? parts.join('・') : '関係に目立った特徴がある'
}

function suggestedDynamic(
  aName: string,
  bName: string,
  theme: BeatTheme,
  ab?: CharacterRelationshipSnapshot,
  ba?: CharacterRelationshipSnapshot,
): string {
  const tensionHigh =
    (ab?.tension ?? 0) >= 60 ||
    (ba?.tension ?? 0) >= 60 ||
    (ab?.affinity ?? 50) <= 40 ||
    (ba?.affinity ?? 50) <= 40
  const trustHigh = (ab?.trust ?? 0) >= 60 || (ba?.trust ?? 0) >= 60

  if (theme === 'injury') {
    if (tensionHigh)
      return `${aName}が${bName}の様子を咎め、${bName}はその言葉を素っ気なく受ける`
    if (trustHigh)
      return `${aName}が${bName}の傷を気にかけ、${bName}は黙ってその気遣いを受け入れる`
    return `${aName}が${bName}の様子をうかがう`
  }
  if (theme === 'route') {
    if (tensionHigh) return `${aName}と${bName}が進路を巡して意見を食い違わせる`
    if (trustHigh) return `${aName}が${bName}の判断を信頼し、二人で道を探る`
    return `${aName}と${bName}が進路を確かめ合う`
  }
  if (theme === 'combat' || theme === 'surround') {
    if (tensionHigh)
      return `${aName}と${bName}が攻撃の順番を巡って張り合いながらも連携する`
    if (trustHigh) return `${aName}が${bName}の背中を預け、無言で呼吸を合わせる`
    return `${aName}と${bName}が背中を合わせて戦う`
  }
  if (tensionHigh)
    return `${aName}と${bName}は言葉少なに、互いの距離感を保っている`
  if (trustHigh) return `${aName}と${bName}は短い言葉だけで意図を通し合う`
  return `${aName}と${bName}の関係がこの場面でにじみ出る`
}

export function determineNarrativeDirection(
  timeline: NarrativeTimelineBeat[],
  members: NarrativeMemberSnapshot[],
  characterRelationships?: CharacterRelationshipSnapshot[],
): NarrativeDirection {
  const scored = scoreBeats(timeline, members, characterRelationships)
  const assigned = new Set<number>()
  const mainScenes: NarrativeSceneSelection[] = []
  const secondaryScenes: NarrativeSceneSelection[] = []

  const maxMainScenes = 2
  const maxSecondaryScenes = 2
  const maxSceneLength = 2

  for (let i = 0; i < scored.length; i++) {
    if (assigned.has(i)) continue
    const current = scored[i]!

    if (current.score >= MAIN_THRESHOLD && mainScenes.length < maxMainScenes) {
      const end = includeConsecutive(
        scored,
        i,
        SECONDARY_THRESHOLD,
        maxSceneLength,
        assigned,
      )
      for (let j = i; j <= end; j++) assigned.add(j)
      mainScenes.push(buildScene(scored, i, end))
      continue
    }

    if (
      current.score >= SECONDARY_THRESHOLD &&
      secondaryScenes.length < maxSecondaryScenes
    ) {
      const end = includeConsecutive(
        scored,
        i,
        SECONDARY_THRESHOLD,
        maxSceneLength,
        assigned,
      )
      for (let j = i; j <= end; j++) assigned.add(j)
      secondaryScenes.push(buildScene(scored, i, end))
      continue
    }
  }

  const beatMap = new Map(timeline.map((b) => [b.id, b]))
  const montageBeatIds = scored
    .filter(
      (s) => !assigned.has(s.index) && s.beat.importance >= MONTAGE_THRESHOLD,
    )
    .map((s) => s.beat.id)

  const focus = buildFocus(mainScenes, secondaryScenes, beatMap, members)
  const interactionHints = buildInteractionHints(
    mainScenes,
    secondaryScenes,
    beatMap,
    members,
    characterRelationships,
  )

  return {
    focus,
    mainScenes,
    secondaryScenes,
    montageBeatIds,
    interactionHints,
  }
}
