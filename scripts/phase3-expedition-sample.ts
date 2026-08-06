import {
  isUnresolvedSeriousInjury,
  runExpedition,
} from '../src/core/expedition/expedition.ts'
import type { ExpeditionRequest } from '../src/core/expedition/types.ts'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  StatusEffect,
} from '../src/core/models/types.ts'
import { writeFileSync } from 'node:fs'

function makeRequest(
  seed: string,
  rank: AdventurerRank = 'D',
): ExpeditionRequest {
  return {
    id: `phase3-1-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'investigation',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [
      {
        id: 'info-1',
        name: '敵の痕跡',
        description: '敵が近くにいる証拠',
        difficulty: 5,
      },
      {
        id: 'info-2',
        name: '古い地図',
        description: '遺跡の配置がわかる',
        difficulty: 15,
        requiredSkill: 'scouting',
      },
      {
        id: 'info-3',
        name: '魔力の残滓',
        description: '魔法の気配',
        difficulty: 20,
        requiredSkill: 'monsterKnowledge',
      },
    ],
    battle: {
      enabled: true,
      seed: `${seed}:battle:0`,
      triggerPhase: 'afterExploration',
    },
  }
}

const ROLES: AdventurerRole[] = ['scout', 'ranger', 'mage', 'healer']

function makeParty(seedBase: string, rank: AdventurerRank = 'D'): Adventurer[] {
  return ROLES.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function formatStatus(effects: StatusEffect[]): string {
  if (effects.length === 0) return 'なし'
  return effects.map((e) => `${e.type}(${e.duration})`).join(', ')
}

function formatMemberSnapshots(
  party: Adventurer[],
  hp: Record<string, number>,
  mp: Record<string, number>,
  morale: Record<string, number>,
  statusEffects: Record<string, StatusEffect[]>,
): string[] {
  return party.map((a) => {
    const st = formatStatus(statusEffects[a.id] ?? [])
    return (
      `  - ${a.name}（${a.role}） HP=${hp[a.id]}/${a.maxHp}, MP=${mp[a.id]}/${a.maxMp}, 士気=${morale[a.id]}` +
      (st ? `, 状態異常=[${st}]` : '')
    )
  })
}

function summarizeScenario(
  title: string,
  party: Adventurer[],
  result: ReturnType<typeof runExpedition>,
): string {
  const { outcome, state } = result
  const record = state.battles[0]
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length

  const beforeHp = Object.fromEntries(party.map((a) => [a.id, a.currentHp]))
  const beforeMp = Object.fromEntries(party.map((a) => [a.id, a.currentMp]))
  const beforeMorale = Object.fromEntries(party.map((a) => [a.id, a.morale]))
  const beforeStatus = Object.fromEntries(
    party.map((a) => [a.id, a.statusEffects ?? []]),
  )

  const pre = state.battleEntrySnapshot!
  const post = record?.result.finalAdventurerStates ?? []
  const postHp = Object.fromEntries(post.map((f) => [f.id, f.currentHp]))
  const postMp = Object.fromEntries(post.map((f) => [f.id, f.currentMp]))
  const postMorale = Object.fromEntries(post.map((f) => [f.id, f.morale]))
  const postStatus = Object.fromEntries(
    post.map((f) => [f.id, f.statusEffects ?? []]),
  )

  const lines: string[] = []
  lines.push(`## ${title}`)
  lines.push('')
  lines.push(`- 依頼シード: ${result.request.seed}`)
  lines.push(`- パーティ: ${ROLES.join(' / ')}（D級）`)
  lines.push(`- 遠征結果: ${outcome}`)
  lines.push(
    `- 目的達成: ${state.objectiveCompleted ? 'はい' : 'いいえ'}（進捿=${state.objectiveProgress.toFixed(1)}%）`,
  )
  lines.push(`- 戦闘結果: ${record?.outcome ?? 'なし'}`)
  if (record) {
    lines.push(`- 接敵状況: ${record.entrySnapshot.surprise}`)
    lines.push(`- 戦闘ラウンド数: ${record.rounds}`)
    lines.push(`- 敵編成: ${record.enemyComposition}`)
    lines.push(`- encounterSeed: ${record.encounterSeed}`)
    lines.push(`- combatSeed: ${record.combatSeed}`)
    const weaknessNames = record.knownEnemyWeaknesses
      .map((i) => i.name)
      .join(', ')
    const abilityNames = record.knownEnemyAbilities
      .map((i) => i.name)
      .join(', ')
    lines.push(`- 戦闘前に判明していた弱点: ${weaknessNames || 'なし'}`)
    lines.push(`- 戦闘前に判明していた能力: ${abilityNames || 'なし'}`)
    const matchedWeaknessNames = record.matchedWeaknessIntel
      .map((i) => i.name)
      .join(', ')
    const unmatchedWeaknessNames = record.unmatchedWeaknessIntel
      .map((i) => i.name)
      .join(', ')
    const matchedAbilityNames = record.matchedAbilityIntel
      .map((i) => i.name)
      .join(', ')
    const unmatchedAbilityNames = record.unmatchedAbilityIntel
      .map((i) => i.name)
      .join(', ')
    lines.push(`- 敵編成と一致した弱点情報: ${matchedWeaknessNames || 'なし'}`)
    lines.push(
      `- 敵編成と不一致だった弱点情報: ${unmatchedWeaknessNames || 'なし'}`,
    )
    lines.push(`- 敵編成と一致した能力情報: ${matchedAbilityNames || 'なし'}`)
    lines.push(
      `- 敵編成と不一致だった能力情報: ${unmatchedAbilityNames || 'なし'}`,
    )
  }

  const activeIds = party
    .filter(
      (a) =>
        !state.casualties.includes(a.id) &&
        !state.incapacitated.includes(a.id) &&
        state.partyHp[a.id] > 0,
    )
    .map((a) => a.name)
  const incapacitatedIds = party
    .filter(
      (a) =>
        !state.casualties.includes(a.id) && state.incapacitated.includes(a.id),
    )
    .map((a) => a.name)
  const deadIds = party
    .filter((a) => state.casualties.includes(a.id))
    .map((a) => a.name)
  lines.push(`- 活動可能者: ${activeIds.join(', ') || 'なし'}`)
  lines.push(`- 戦闘不能者: ${incapacitatedIds.join(', ') || 'なし'}`)
  lines.push(`- 死亡者: ${deadIds.join(', ') || 'なし'}`)

  lines.push(
    `- 負傷: ${state.injuries.length}件（未解決の重傷=${unresolvedSerious}）`,
  )
  lines.push(`- 犠牲者: ${state.casualties.join(', ') || 'なし'}`)
  lines.push(`- 発見情報: ${state.information.length}件`)
  lines.push('')

  lines.push('### 1. 遠征開始時')
  lines.push(
    ...formatMemberSnapshots(
      party,
      beforeHp,
      beforeMp,
      beforeMorale,
      beforeStatus,
    ),
  )
  lines.push('')

  lines.push('### 2. 戦闘直前')
  lines.push(
    ...formatMemberSnapshots(
      party,
      pre.initialHp,
      pre.initialMp,
      pre.initialMorale,
      pre.initialStatusEffects,
    ),
  )
  lines.push('')

  lines.push('### 3. 戦闘直後')
  lines.push(
    ...formatMemberSnapshots(party, postHp, postMp, postMorale, postStatus),
  )
  lines.push('')

  lines.push('### 4. 帰還後')
  lines.push(
    ...formatMemberSnapshots(
      party,
      state.partyHp,
      state.partyMp,
      state.partyMorale,
      state.partyStatusEffects,
    ),
  )
  lines.push('')

  if (record) {
    const summary = state.logs
      .filter((l) => l.type === 'battleSummary')
      .flatMap((l) => l.facts)
    if (summary.length > 0) {
      lines.push('### 戦闘要約')
      for (const fact of summary) {
        lines.push(`- ${fact}`)
      }
      lines.push('')
    }

    if (record.result.discoveredWeaknesses.length > 0) {
      lines.push(`### 戦闘で発見した弱点`)
      for (const w of record.result.discoveredWeaknesses) {
        lines.push(`- ${w}`)
      }
      lines.push('')
    }

    if (
      state.casualties.length > 0 ||
      record.result.incapacitatedAdventurers.length > 0
    ) {
      lines.push('### 戦闘被害')
      lines.push(
        `- 死亡者: ${record.result.deadAdventurers.join(', ') || 'なし'}`,
      )
      lines.push(
        `- 戦闘不能者: ${record.result.incapacitatedAdventurers.join(', ') || 'なし'}`,
      )
      lines.push('')
    }
  }

  lines.push('### 主要ログ（直近8件）')
  const recentLogs = state.logs.filter((l) => l.facts.length > 0).slice(-8)
  for (const log of recentLogs) {
    for (const fact of log.facts) {
      lines.push(`- ${fact}`)
    }
  }
  lines.push('')

  return lines.join('\n')
}

const scenarios = [
  {
    title: 'A. 有利接敵からの完全成功',
    seed: 'phase3-1-a-10',
  },
  {
    title: 'B. 戦闘勝利だが調査失敗',
    seed: 'phase3-1-b-12',
  },
  {
    title: 'C. 情報取得後に戦闘撤退',
    seed: 'phase3-1-c-77',
  },
]

let md = '# Phase 3.1 遠征中戦闘発生と状態往復 サンプル出力\n\n'
md +=
  'investigation 依頼で最大1回の戦闘を発生させ、遠征状態と戦闘状態を往復させた決定論的シミュレーション結果。\n\n'

for (const scenario of scenarios) {
  const request = makeRequest(scenario.seed)
  const party = makeParty(scenario.seed)
  const result = runExpedition(request, party)
  md += summarizeScenario(scenario.title, party, result)
}

const outputPath = 'PHASE3_EXPEDITION_SAMPLE.md'
writeFileSync(outputPath, md, 'utf-8')
console.log(`サンプル出力を ${outputPath} に保存しました`)
