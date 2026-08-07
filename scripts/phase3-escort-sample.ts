import { writeFileSync } from 'node:fs'
import { runExpedition } from '../src/core/expedition/expedition.ts'
import {
  makeEscortRequest,
  makeParty,
} from '../src/core/expedition/test-utils.ts'
import type {
  Adventurer,
  EscortObjectiveState,
  ExpeditionRequest,
  StatusEffect,
} from '../src/core/models/types.ts'

const ROLES: Adventurer['role'][] = ['vanguard', 'guardian', 'mage', 'healer']

function formatStatus(effects: StatusEffect[]): string {
  if (effects.length === 0) return 'なし'
  return effects.map((e) => `${e.type}(${e.duration})`).join(', ')
}

function formatAdventurers(
  party: Adventurer[],
  hp: Record<string, number>,
  mp: Record<string, number>,
  morale: Record<string, number>,
  statusEffects: Record<string, StatusEffect[]>,
): string[] {
  return party.map((a) => {
    const st = formatStatus(statusEffects[a.id] ?? [])
    return (
      `  - ${a.name}（${a.role}） HP=${hp[a.id] ?? a.currentHp}/${a.maxHp}, ` +
      `MP=${mp[a.id] ?? a.currentMp}/${a.maxMp}, 士気=${morale[a.id] ?? a.morale}` +
      (st !== 'なし' ? `, 状態異常=[${st}]` : '')
    )
  })
}

function findProtector(
  party: Adventurer[],
  objective: EscortObjectiveState,
): string {
  if (!objective.protectorId) return 'なし'
  const protector = party.find((a) => a.id === objective.protectorId)
  return protector
    ? `${protector.name}（${protector.role}）`
    : objective.protectorId
}

function summarizeScenario(
  title: string,
  rank: string,
  request: ExpeditionRequest,
  party: Adventurer[],
): string {
  const result = runExpedition(request, party)
  const { state, outcome } = result
  const objective = state.objectiveState as EscortObjectiveState
  const record = state.battles[0]

  const active = party
    .filter(
      (a) =>
        !state.casualties.includes(a.id) &&
        !state.incapacitated.includes(a.id) &&
        state.partyHp[a.id] > 0,
    )
    .map((a) => `${a.name}（${a.role}）`)
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
  lines.push(`- 環境: ${request.environment}`)
  lines.push(`- 護衛対象名: ${objective.targetName}`)
  lines.push(`- 目的地: ${objective.destinationName}`)
  lines.push(`- 初期HP: ${objective.maxHp}`)
  lines.push(`- 最終HP: ${objective.currentHp}`)
  lines.push(`- 移動能力: ${objective.mobility}`)
  lines.push(`- 移動ストレス: ${objective.travelStress}`)
  lines.push(`- 同行状態: ${objective.accompanying ? '同行中' : '分離済み'}`)
  lines.push(`- 行動調整: ${objective.coordinated ? '済み' : '未調整'}`)
  lines.push(`- 移動進捗: ${objective.routeProgress}%`)
  lines.push(
    `- 目的地到達: ${objective.destinationReached ? '到達' : '未到達'}`,
  )
  lines.push(`- 保護担当: ${findProtector(party, objective)}`)
  lines.push(`- 引き渡し状態: ${objective.handoffStatus}`)
  lines.push(`- 治療実施: ${objective.careProvided ? 'あり' : 'なし'}`)
  lines.push(`- 治療回復量: ${objective.careHealing}`)
  if (record) {
    lines.push(
      `- 戦闘結果: ${record.result.outcome}（${record.result.rounds}ラウンド）`,
    )
    lines.push(`- 敵編成: ${record.enemyComposition}`)
    lines.push(`- 戦闘被害: ${objective.battleExposureDamage}`)
  } else {
    lines.push('- 戦闘結果: なし')
    lines.push('- 戦闘被害: 0')
  }
  lines.push(`- 移動被害: ${objective.travelDamage}`)
  lines.push(
    `- 出発地点へ帰還: ${objective.returnedToOrigin ? '帰還済み' : 'なし'}`,
  )
  lines.push(`- 置き去り: ${objective.stranded ? '置き去り' : 'なし'}`)
  lines.push(`- 進捗: ${objective.progress}%`)
  lines.push(`- 遠征結果: ${outcome}`)
  lines.push(`- 冒険者生存者: ${active.join(', ') || 'なし'}`)
  lines.push(`- 戦闘不能者: ${incapacitated.join(', ') || 'なし'}`)
  lines.push(`- 死亡者: ${dead.join(', ') || 'なし'}`)
  lines.push('')

  lines.push('### 1. 遠征開始時')
  lines.push(
    ...formatAdventurers(
      party,
      Object.fromEntries(party.map((a) => [a.id, a.currentHp])),
      Object.fromEntries(party.map((a) => [a.id, a.currentMp])),
      Object.fromEntries(party.map((a) => [a.id, a.morale])),
      Object.fromEntries(party.map((a) => [a.id, a.statusEffects])),
    ),
  )
  lines.push('')

  if (record) {
    lines.push('### 2. 戦闘直前')
    const pre = record.entrySnapshot
    lines.push(
      ...formatAdventurers(
        party,
        pre.initialHp,
        pre.initialMp,
        pre.initialMorale,
        pre.initialStatusEffects,
      ),
    )
    lines.push('')

    lines.push('### 3. 戦闘直後')
    const post = record.result.finalAdventurerStates
    lines.push(
      ...formatAdventurers(
        party,
        Object.fromEntries(post.map((f) => [f.id, f.currentHp])),
        Object.fromEntries(post.map((f) => [f.id, f.currentMp])),
        Object.fromEntries(post.map((f) => [f.id, f.morale])),
        Object.fromEntries(post.map((f) => [f.id, f.statusEffects])),
      ),
    )
    lines.push('')
  }

  lines.push('### 4. 帰還後')
  lines.push(
    ...formatAdventurers(
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
    'escortDeparture',
    'escortRouteProgress',
    'escortProtectorAssigned',
    'escortBattleExposure',
    'escortCare',
    'escortHandoff',
    'escortDestinationReached',
    'escortReturnResult',
    'escortTargetDeath',
    'battleSummary',
    'summary',
  ])
  for (const log of state.logs) {
    if (!relevantTypes.has(log.type) || log.facts.length === 0) continue
    lines.push(`- type=${log.type}`)
    for (const fact of log.facts) {
      lines.push(`  - ${fact}`)
    }
    for (const effect of log.effects) {
      lines.push(
        `  - effect: ${effect.type}=${effect.value}` +
          (effect.targetId ? `, targetId=${effect.targetId}` : ''),
      )
    }
  }
  lines.push('')

  return lines.join('\n')
}

const scenarios = [
  { title: 'A. 完全護衛成功', seed: 's6', rank: 'C' as const },
  { title: 'B. 護衛成功だが対象が負傷', seed: 's80', rank: 'C' as const },
  { title: 'C. 目的地到達だが引き渡し保留', seed: 's9', rank: 'C' as const },
  {
    title: 'D. 護衛失敗（対象を出発地点へ連れ戻した）',
    seed: 's1',
    rank: 'C' as const,
  },
  { title: 'E. 戦闘撤退後も護衛成功', seed: 's21', rank: 'C' as const },
]

let md = '# Phase 3.4 護衛依頼（escort）サンプル出力\n\n'
md +=
  'escort 依頼で最大1回の戦闘を発生させ、護衛対象の同行・移動・保護・治療・引き渡し・帰還を分離した決定論的シミュレーション結果。\n\n'

for (const scenario of scenarios) {
  const request = makeEscortRequest(scenario.seed, scenario.rank)
  const party = makeParty(ROLES, scenario.seed, scenario.rank)
  md += summarizeScenario(scenario.title, scenario.rank, request, party)
}

writeFileSync('PHASE3_ESCORT_SAMPLE.md', md, 'utf-8')
console.log('サンプル出力を PHASE3_ESCORT_SAMPLE.md に保存しました')
