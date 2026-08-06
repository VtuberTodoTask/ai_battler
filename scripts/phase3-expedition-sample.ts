import { runExpedition } from '../src/core/expedition/expedition.ts'
import type { ExpeditionRequest } from '../src/core/expedition/types.ts'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  StatusEffect,
} from '../src/core/models/types.ts'
import { writeFileSync } from 'node:fs'

const ROLES: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']

function makeParty(seedBase: string, rank: AdventurerRank): Adventurer[] {
  return ROLES.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function makeRequest(
  seed: string,
  rank: AdventurerRank,
  confirmationRequired: boolean,
): ExpeditionRequest {
  return {
    id: `phase3-2-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'elimination',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [],
    battle: {
      enabled: true,
      seed: `${seed}:battle:0`,
      triggerPhase: 'afterExploration',
      shape: 'standard',
    },
    elimination: { mode: 'allEnemies', confirmationRequired },
  }
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
  rank: AdventurerRank,
  party: Adventurer[],
  result: ReturnType<typeof runExpedition>,
): string {
  const { outcome, state } = result
  const record = state.battles[0]
  const obj =
    state.objectiveState?.type === 'elimination'
      ? state.objectiveState
      : undefined

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

  const active = party
    .filter(
      (a) =>
        !state.casualties.includes(a.id) &&
        !state.incapacitated.includes(a.id) &&
        state.partyHp[a.id] > 0,
    )
    .map((a) => a.name)
  const incapacitated = party
    .filter(
      (a) =>
        !state.casualties.includes(a.id) && state.incapacitated.includes(a.id),
    )
    .map((a) => a.name)
  const dead = party
    .filter((a) => state.casualties.includes(a.id))
    .map((a) => a.name)

  const lines: string[] = []
  lines.push(`## ${title}`)
  lines.push('')
  lines.push(`- 依頼等級: ${rank}`)
  lines.push(`- パーティ: ${ROLES.join(' / ')}（${rank}級）`)
  lines.push(`- 依頼シード: ${result.request.seed}`)
  if (record) {
    lines.push(`- 敵編成: ${record.enemyComposition}`)
    lines.push(`- 必須対象ID: ${record.enemyIds.join(', ')}`)
    lines.push(`- 戦闘結果: ${record.outcome}`)
  }
  if (obj) {
    lines.push(`- 撃破対象: ${obj.defeatedTargetIds.join(', ') || 'なし'}`)
    lines.push(`- 逃亡対象: ${obj.escapedTargetIds.join(', ') || 'なし'}`)
    lines.push(`- 生存対象: ${obj.survivingTargetIds.join(', ') || 'なし'}`)
    lines.push(`- 確認済み対象: ${obj.confirmedTargetIds.join(', ') || 'なし'}`)
    lines.push(`- 討伐進捗: ${obj.progress}%`)
    lines.push(`- 討伐完了: ${obj.completed ? 'はい' : 'いいえ'}`)
  }
  lines.push(`- 遠征結果: ${outcome}`)
  lines.push(`- 生存者: ${active.join(', ') || 'なし'}`)
  lines.push(`- 戦闘不能者: ${incapacitated.join(', ') || 'なし'}`)
  lines.push(`- 死亡者: ${dead.join(', ') || 'なし'}`)
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

  if (record) {
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
  }

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

  lines.push('### 構造化facts')
  const relevantTypes = new Set([
    'eliminationTargetsAssigned',
    'eliminationConfirmation',
    'eliminationIncomplete',
    'eliminationCompleted',
    'battleSummary',
  ])
  for (const log of state.logs) {
    if (!relevantTypes.has(log.type) || log.facts.length === 0) continue
    lines.push(`- type=${log.type}`)
    for (const fact of log.facts) {
      lines.push(`  - ${fact}`)
    }
    for (const effect of log.effects) {
      lines.push(`  - effect: ${effect.type}=${effect.value}`)
    }
  }
  lines.push('')

  return lines.join('\n')
}

const scenarios = [
  {
    title: 'A. 完全討伐',
    seed: 's37',
    rank: 'S' as AdventurerRank,
    confirmationRequired: false,
  },
  {
    title: 'B. 討伐成功だが損害大',
    seed: 's325',
    rank: 'C' as AdventurerRank,
    confirmationRequired: false,
  },
  {
    title: 'C. 一部撃破して撤退',
    seed: 's1',
    rank: 'C' as AdventurerRank,
    confirmationRequired: false,
  },
  {
    title: 'D. 戦闘勝利だが確認失敗',
    seed: 's45',
    rank: 'S' as AdventurerRank,
    confirmationRequired: true,
  },
]

let md = '# Phase 3.2 討伐依頼（elimination）サンプル出力\n\n'
md +=
  'elimination 依頼で最大1回の戦闘を発生させ、討伐対象の撃破・確認・遠征結果を分離した決定論的シミュレーション結果。\n\n'

for (const scenario of scenarios) {
  const request = makeRequest(
    scenario.seed,
    scenario.rank,
    scenario.confirmationRequired,
  )
  const party = makeParty(scenario.seed, scenario.rank)
  const result = runExpedition(request, party)
  md += summarizeScenario(scenario.title, scenario.rank, party, result)
}

const outputPath = 'PHASE3_EXPEDITION_SAMPLE.md'
writeFileSync(outputPath, md, 'utf-8')
console.log(`サンプル出力を ${outputPath} に保存しました`)
