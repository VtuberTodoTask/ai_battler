import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleLogEntry,
  BattleResult,
  Enemy,
} from '../src/core/models/types.ts'

const RANK = 'C' as const
const DIFFICULTY = 'normal' as const
const BASE_SEED = 'phase2-role-suitability-v1'
const BASE_METRICS_TRIALS = 5000
const PAIRED_TRIALS = 1000

const ACTION_TYPES: Set<BattleLogEntry['actionType']> = new Set([
  'attack',
  'melee',
  'ranged',
  'magic',
  'flank',
  'heal',
  'guard',
  'support',
  'healBlock',
  'revive',
  'summon',
  'retreat',
  'requestPartyRetreat',
  'individualEscape',
  'counter',
])

const DISRUPTIVE_STATUSES = new Set([
  'stunned',
  'frightened',
  'healBlocked',
  'weakened',
  'defenseDown',
])

interface RoleMetrics {
  trials: number
  damageDealt: number
  damageTaken: number
  healAmount: number
  guardAmount: number
  supportMorale: number
  actionCount: number
  statusInflicted: number
  statusCured: number
  enemyActionDisruptions: number
  weaknessDiscoveries: number
  retreatProposed: number
  retreatSuccessContributions: number
  incapacitations: number
  survived: number
  presentInTrials: number
  injurySeverities: number[]
}

function emptyMetrics(): RoleMetrics {
  return {
    trials: 0,
    damageDealt: 0,
    damageTaken: 0,
    healAmount: 0,
    guardAmount: 0,
    supportMorale: 0,
    actionCount: 0,
    statusInflicted: 0,
    statusCured: 0,
    enemyActionDisruptions: 0,
    weaknessDiscoveries: 0,
    retreatProposed: 0,
    retreatSuccessContributions: 0,
    incapacitations: 0,
    survived: 0,
    presentInTrials: 0,
    injurySeverities: [],
  }
}

function buildParty(
  roles: AdventurerRole[],
  seedPrefix: string,
  rank: AdventurerRole extends string ? string : never = RANK,
): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seedPrefix}-${role}-${i}`,
      rank: rank as 'C',
      role,
    }),
  )
}

function partyIds(party: Adventurer[]) {
  return new Set(party.map((a) => a.id))
}

function enemyIds(enemies: Enemy[]) {
  return new Set(enemies.map((e) => e.id))
}

function updateMetricsFromBattle(
  result: BattleResult,
  party: Adventurer[],
  enemies: Enemy[],
  metrics: Record<AdventurerRole, RoleMetrics>,
): void {
  const partyIdSet = partyIds(party)
  const enemyIdSet = enemyIds(enemies)
  const roleById = new Map(party.map((a) => [a.id, a.role]))

  const statusesByUnit = new Map<string, Set<string>>()

  function record(
    role: AdventurerRole | undefined,
    key: keyof RoleMetrics,
    value: number,
  ) {
    if (!role) return
    const m = metrics[role]
    if (key === 'trials' || key === 'presentInTrials') {
      ;(m[key] as number) += value
    } else {
      ;(m[key] as number) += value
    }
  }

  for (const log of result.logs) {
    const actorRole = log.actorId ? roleById.get(log.actorId) : undefined
    const targetId = log.targetIds?.[0]
    const targetRole = targetId ? roleById.get(targetId) : undefined

    if (actorRole) {
      if (ACTION_TYPES.has(log.actionType)) {
        record(actorRole, 'actionCount', 1)
      }
      if (
        log.actionType === 'weaknessDiscovery' ||
        log.actionType === 'monsterKnowledge'
      ) {
        record(actorRole, 'weaknessDiscoveries', 1)
      }
      if (log.actionType === 'heal') {
        const amount = (log.metadata?.healAmount as number | undefined) ?? 0
        record(actorRole, 'healAmount', amount)
        // 状態異常解除の追跡
        if (targetId && amount > 0) {
          const active = statusesByUnit.get(targetId)
          if (active && (active.has('poisoned') || active.has('bleeding'))) {
            record(actorRole, 'statusCured', 1)
            active.delete('poisoned')
            active.delete('bleeding')
          }
        }
      }
      if (log.actionType === 'guard') {
        const amount = (log.metadata?.guardAmount as number | undefined) ?? 0
        record(actorRole, 'guardAmount', amount)
      }
      if (log.actionType === 'support') {
        const morale = (log.metadata?.supportMorale as number | undefined) ?? 0
        const guard = (log.metadata?.guardAmount as number | undefined) ?? 0
        record(actorRole, 'supportMorale', morale)
        record(actorRole, 'guardAmount', guard)
      }
      if (
        typeof log.damage === 'number' &&
        log.damage > 0 &&
        log.targetIds &&
        enemyIdSet.has(log.targetIds[0])
      ) {
        record(actorRole, 'damageDealt', log.damage)
      }
      if (log.statusApplied && log.targetIds) {
        for (const target of log.targetIds) {
          if (enemyIdSet.has(target)) {
            for (const status of log.statusApplied) {
              record(actorRole, 'statusInflicted', 1)
              if (DISRUPTIVE_STATUSES.has(status)) {
                record(actorRole, 'enemyActionDisruptions', 1)
              }
            }
          }
        }
      }
    }

    if (targetRole && typeof log.damage === 'number' && log.damage > 0) {
      if (
        partyIdSet.has(log.actorId ?? '') ||
        enemyIdSet.has(log.actorId ?? '')
      ) {
        record(targetRole, 'damageTaken', log.damage)
      }
    }

    if (
      log.actionType === 'incapacitate' &&
      targetId &&
      partyIdSet.has(targetId)
    ) {
      const role = roleById.get(targetId)
      if (role) {
        statusesByUnit.delete(targetId)
      }
    }

    if (log.statusApplied && log.targetIds) {
      for (const target of log.targetIds) {
        if (partyIdSet.has(target)) {
          const set = statusesByUnit.get(target) ?? new Set<string>()
          for (const status of log.statusApplied) {
            set.add(status)
          }
          statusesByUnit.set(target, set)
        }
      }
    }
  }

  // retreat
  for (const attempt of result.retreatAttempts ?? []) {
    if (attempt.proposerRole) {
      const role = attempt.proposerRole as AdventurerRole
      record(role, 'retreatProposed', 1)
      if (attempt.success) {
        record(role, 'retreatSuccessContributions', 1)
      }
    }
  }

  // survival / incap / injuries
  const aliveOrEscaped = new Set(result.survivingAdventurers)
  const incap = new Set(result.incapacitatedAdventurers)
  const dead = new Set(result.deadAdventurers)
  const rolesSeen = new Set<AdventurerRole>()
  for (const a of party) {
    const role = a.role
    if (rolesSeen.has(role)) continue
    rolesSeen.add(role)
    record(role, 'presentInTrials', 1)
    if (aliveOrEscaped.has(a.id)) record(role, 'survived', 1)
    if (incap.has(a.id) || dead.has(a.id)) record(role, 'incapacitations', 1)
  }
  for (const injury of result.injuries) {
    const role = roleById.get(injury.adventurerId)
    if (role) {
      metrics[role].injurySeverities.push(injury.severity)
    }
  }
}

function finalizeMetrics(
  metrics: Record<AdventurerRole, RoleMetrics>,
): Record<AdventurerRole, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [role, m] of Object.entries(metrics) as [
    AdventurerRole,
    RoleMetrics,
  ][]) {
    const trials = m.presentInTrials
    const avg = (value: number) => (trials > 0 ? value / trials : 0)
    out[role] = {
      試行数: trials,
      平均与ダメージ: avg(m.damageDealt),
      平均被ダメージ: avg(m.damageTaken),
      平均回復量: avg(m.healAmount),
      平均防護量: avg(m.guardAmount),
      平均支援士気: avg(m.supportMorale),
      平均行動回数: avg(m.actionCount),
      状態異常付与回数: avg(m.statusInflicted),
      状態異常解除回数: avg(m.statusCured),
      敵行動妨害回数: avg(m.enemyActionDisruptions),
      弱点発見回数: avg(m.weaknessDiscoveries),
      撤退提案回数: avg(m.retreatProposed),
      撤退成功貢献回数: avg(m.retreatSuccessContributions),
      戦闘不能率: avg(m.incapacitations),
      生存率: avg(m.survived),
      平均重傷重症度:
        m.injurySeverities.length > 0
          ? m.injurySeverities.reduce((a, b) => a + b, 0) /
            m.injurySeverities.length
          : 0,
    }
  }
  return out
}

function formatMetricsTable(
  metrics: Record<AdventurerRole, Record<string, number>>,
): string {
  const roles = Object.keys(metrics).sort() as AdventurerRole[]
  const keys = Object.keys(metrics[roles[0]])
  const header = `| 指標 | ${roles.join(' | ')} |`
  const sep = `| ${'--- | '.repeat(roles.length + 1)}`
  const lines = [header, sep]
  for (const key of keys) {
    const cells = roles.map((r) => metrics[r][key].toFixed(3))
    lines.push(`| ${key} | ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}

interface OverallResult {
  trials: number
  victories: number
  retreats: number
  defeats: number
  totalLosses: number
  stalemates: number
  avgRounds: number
  contactFailures: number
  avgPartyDamage: number
  avgEnemyDamage: number
  avgInjuries: number
}

function emptyOverall(): OverallResult {
  return {
    trials: 0,
    victories: 0,
    retreats: 0,
    defeats: 0,
    totalLosses: 0,
    stalemates: 0,
    avgRounds: 0,
    contactFailures: 0,
    avgPartyDamage: 0,
    avgEnemyDamage: 0,
    avgInjuries: 0,
  }
}

function updateOverall(result: BattleResult, overall: OverallResult): void {
  overall.trials++
  if (
    result.outcome === 'victory' ||
    result.outcome === 'costlyVictory' ||
    result.outcome === 'partialVictory'
  ) {
    overall.victories++
  } else if (result.outcome === 'retreat') {
    overall.retreats++
  } else if (result.outcome === 'defeat') {
    overall.defeats++
  } else if (result.outcome === 'totalLoss') {
    overall.totalLosses++
  } else if (result.outcome === 'stalemate') {
    overall.stalemates++
  }
  overall.avgRounds += result.rounds
  overall.contactFailures +=
    result.contactResult.type === 'failure' ||
    result.contactResult.type === 'greatFailure'
      ? 1
      : 0
  overall.avgPartyDamage += result.partyDamageDealt
  overall.avgEnemyDamage += result.enemyDamageDealt
  overall.avgInjuries += result.injuries.length
}

function finalizeOverall(o: OverallResult): OverallResult {
  const t = o.trials || 1
  return {
    ...o,
    avgRounds: o.avgRounds / t,
    contactFailures: o.contactFailures / t,
    avgPartyDamage: o.avgPartyDamage / t,
    avgEnemyDamage: o.avgEnemyDamage / t,
    avgInjuries: o.avgInjuries / t,
  }
}

function formatOverall(o: OverallResult): string {
  const t = o.trials || 1
  return `
| 指標 | 値 |
|---|---|
| 試行数 | ${o.trials} |
| 勝利（victory系）率 | ${(o.victories / t).toFixed(3)} |
| 撤退率 | ${(o.retreats / t).toFixed(3)} |
| 敗北率 | ${(o.defeats / t).toFixed(3)} |
| 全滅率 | ${(o.totalLosses / t).toFixed(3)} |
| 胶着率 | ${(o.stalemates / t).toFixed(3)} |
| 平均ラウンド | ${o.avgRounds.toFixed(1)} |
| 接敵失敗率 | ${o.contactFailures.toFixed(3)} |
| 平均与ダメージ（パーティ合計） | ${o.avgPartyDamage.toFixed(1)} |
| 平均被ダメージ（パーティ合計） | ${o.avgEnemyDamage.toFixed(1)} |
| 平均負傷件数 | ${o.avgInjuries.toFixed(2)} |
`
}

function runComposition(
  name: string,
  roles: AdventurerRole[],
  trials: number,
  useFixedEnemies: boolean,
  baseRoles?: AdventurerRole[],
): { overall: OverallResult; metrics: Record<AdventurerRole, RoleMetrics> } {
  const overall = emptyOverall()
  const metrics: Record<AdventurerRole, RoleMetrics> = {
    vanguard: emptyMetrics(),
    guardian: emptyMetrics(),
    scout: emptyMetrics(),
    ranger: emptyMetrics(),
    mage: emptyMetrics(),
    healer: emptyMetrics(),
    support: emptyMetrics(),
  }

  for (let i = 0; i < trials; i++) {
    const party = buildParty(roles, `${BASE_SEED}-${name}-${i}`, RANK)
    let enemies: Enemy[]
    if (useFixedEnemies && baseRoles) {
      const baseParty = buildParty(
        baseRoles,
        `${BASE_SEED}-${name}-base-${i}`,
        RANK,
      )
      enemies = generateEncounter({
        seed: `${BASE_SEED}-${name}-enc-${i}`,
        planSeed: `${BASE_SEED}-${name}-plan-${i}`,
        partyThreat: calculatePartyThreat(baseParty),
        difficulty: DIFFICULTY,
        partySize: baseRoles.length,
      })
    } else {
      enemies = generateEncounter({
        seed: `${BASE_SEED}-${name}-enc-${i}`,
        planSeed: `${BASE_SEED}-${name}-plan-${i}`,
        partyThreat: calculatePartyThreat(party),
        difficulty: DIFFICULTY,
        partySize: roles.length,
      })
    }
    const result = runBattle(`${BASE_SEED}-${name}-battle-${i}`, party, enemies)
    updateOverall(result, overall)
    updateMetricsFromBattle(result, party, enemies, metrics)
  }

  return { overall, metrics }
}

function runPairedComparison(
  name: string,
  baseRoles: AdventurerRole[],
  variantRoles: AdventurerRole[],
  trials: number,
): {
  baseOverall: OverallResult
  variantOverall: OverallResult
  baseMetrics: Record<AdventurerRole, RoleMetrics>
  variantMetrics: Record<AdventurerRole, RoleMetrics>
} {
  const baseOverall = emptyOverall()
  const variantOverall = emptyOverall()
  const baseMetrics = {
    vanguard: emptyMetrics(),
    guardian: emptyMetrics(),
    scout: emptyMetrics(),
    ranger: emptyMetrics(),
    mage: emptyMetrics(),
    healer: emptyMetrics(),
    support: emptyMetrics(),
  }
  const variantMetrics = { ...baseMetrics }

  for (let i = 0; i < trials; i++) {
    const baseParty = buildParty(
      baseRoles,
      `${BASE_SEED}-${name}-base-${i}`,
      RANK,
    )
    const variantParty = buildParty(
      variantRoles,
      `${BASE_SEED}-${name}-var-${i}`,
      RANK,
    )
    const enemies = generateEncounter({
      seed: `${BASE_SEED}-${name}-enc-${i}`,
      planSeed: `${BASE_SEED}-${name}-plan-${i}`,
      partyThreat: calculatePartyThreat(baseParty),
      difficulty: DIFFICULTY,
      partySize: baseRoles.length,
    })
    const baseResult = runBattle(
      `${BASE_SEED}-${name}-base-battle-${i}`,
      baseParty,
      enemies,
    )
    const variantResult = runBattle(
      `${BASE_SEED}-${name}-var-battle-${i}`,
      variantParty,
      enemies,
    )
    updateOverall(baseResult, baseOverall)
    updateOverall(variantResult, variantOverall)
    updateMetricsFromBattle(baseResult, baseParty, enemies, baseMetrics)
    updateMetricsFromBattle(
      variantResult,
      variantParty,
      enemies,
      variantMetrics,
    )
  }

  return { baseOverall, variantOverall, baseMetrics, variantMetrics }
}

function main() {
  const lines: string[] = []
  lines.push('# Phase 2 役割適性計測レポート')
  lines.push('')
  lines.push(`- 等級: ${RANK}`)
  lines.push(`- 難易度: ${DIFFICULTY}`)
  lines.push(`- 基本計測試行数: ${BASE_METRICS_TRIALS}`)
  lines.push(`- ペアード比較試行数: ${PAIRED_TRIALS}`)
  lines.push(`- シード: ${BASE_SEED}`)
  lines.push('')

  // 1. ロール別基本指標（標準編成で集計）
  lines.push('## 1. ロール別基本指標（標準編成 vanguard/guardian/mage/healer）')
  lines.push('')
  const standard = runComposition(
    'standard-base-metrics',
    ['vanguard', 'guardian', 'mage', 'healer'],
    BASE_METRICS_TRIALS,
    false,
  )
  lines.push(formatOverall(finalizeOverall(standard.overall)))
  lines.push('')
  lines.push(formatMetricsTable(finalizeMetrics(standard.metrics)))
  lines.push('')

  // 2. 置換実験
  lines.push('## 2. 置換実験（標準編成から一枠変更、同じ敵編成でペアード比較）')
  const replacements: {
    name: string
    variant: AdventurerRole[]
  }[] = [
    {
      name: 'guardian → vanguard',
      variant: ['vanguard', 'vanguard', 'mage', 'healer'],
    },
    {
      name: 'guardian → scout',
      variant: ['vanguard', 'scout', 'mage', 'healer'],
    },
    {
      name: 'mage → ranger',
      variant: ['vanguard', 'guardian', 'ranger', 'healer'],
    },
    {
      name: 'healer → support',
      variant: ['vanguard', 'guardian', 'mage', 'support'],
    },
    {
      name: 'healer → mage',
      variant: ['vanguard', 'guardian', 'mage', 'mage'],
    },
    {
      name: 'vanguard x2（guardianをvanguardへ）',
      variant: ['vanguard', 'vanguard', 'mage', 'healer'],
    },
    {
      name: 'mage x2（healerをmageへ）',
      variant: ['vanguard', 'guardian', 'mage', 'mage'],
    },
    {
      name: 'healer x2（mageをhealerへ）',
      variant: ['vanguard', 'guardian', 'healer', 'healer'],
    },
  ]

  const baseRoles: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']
  for (const rep of replacements) {
    lines.push(`### ${rep.name}`)
    lines.push('')
    const { baseOverall, variantOverall, variantMetrics } = runPairedComparison(
      rep.name,
      baseRoles,
      rep.variant,
      PAIRED_TRIALS,
    )
    lines.push('**base**')
    lines.push(formatOverall(finalizeOverall(baseOverall)))
    lines.push('')
    lines.push('**variant**')
    lines.push(formatOverall(finalizeOverall(variantOverall)))
    lines.push('')
    lines.push('**variant ロール指標**')
    lines.push(formatMetricsTable(finalizeMetrics(variantMetrics)))
    lines.push('')
  }

  // 3. 欠損役割の影響
  lines.push('## 3. 欠損役割の影響')
  lines.push('')
  const missingConfigs: {
    name: string
    base: AdventurerRole[]
    missing: AdventurerRole[]
  }[] = [
    {
      name: 'healer不在（3人）',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      missing: ['vanguard', 'guardian', 'mage'],
    },
    {
      name: 'guardian不在（3人）',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      missing: ['vanguard', 'mage', 'healer'],
    },
    {
      name: '魔法攻撃不在（mageをvanguardへ）',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      missing: ['vanguard', 'guardian', 'vanguard', 'healer'],
    },
    {
      name: '遠距離攻撃不在（rangerをvanguardへ）',
      base: ['vanguard', 'guardian', 'ranger', 'healer'],
      missing: ['vanguard', 'guardian', 'vanguard', 'healer'],
    },
    {
      name: '索敵役不在（scoutをvanguardへ）',
      base: ['vanguard', 'scout', 'mage', 'healer'],
      missing: ['vanguard', 'vanguard', 'mage', 'healer'],
    },
    {
      name: '指揮役不在（supportをvanguardへ）',
      base: ['vanguard', 'guardian', 'support', 'healer'],
      missing: ['vanguard', 'guardian', 'vanguard', 'healer'],
    },
  ]

  const missingResults: {
    name: string
    baseOverall: OverallResult
    variantOverall: OverallResult
    variantMetrics: Record<AdventurerRole, RoleMetrics>
  }[] = []
  for (const cfg of missingConfigs) {
    lines.push(`### ${cfg.name}`)
    lines.push('')
    const result = runPairedComparison(
      cfg.name,
      cfg.base,
      cfg.missing,
      PAIRED_TRIALS,
    )
    missingResults.push({
      name: cfg.name,
      baseOverall: result.baseOverall,
      variantOverall: result.variantOverall,
      variantMetrics: result.variantMetrics,
    })
    lines.push('**base**')
    lines.push(formatOverall(finalizeOverall(result.baseOverall)))
    lines.push('')
    lines.push('**missing**')
    lines.push(formatOverall(finalizeOverall(result.variantOverall)))
    lines.push('')
    lines.push('**missing ロール指標**')
    lines.push(formatMetricsTable(finalizeMetrics(result.variantMetrics)))
    lines.push('')
  }

  // 4. 結果分解（missing vs base の差分）をまとめ
  lines.push('## 4. 欠損役割の影響（差分まとめ）')
  lines.push('')
  lines.push(
    '| 条件 | 勝率差 | 接敵失敗増 | 被ダメージ増 | ラウンド増 | 撤退増 | 重傷増 | 全滅増 |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const { name, baseOverall, variantOverall } of missingResults) {
    const b = finalizeOverall(baseOverall)
    const v = finalizeOverall(variantOverall)
    const diffWin = v.victories / v.trials - b.victories / b.trials
    const diffContact = v.contactFailures - b.contactFailures
    const diffDmg = v.avgEnemyDamage - b.avgEnemyDamage
    const diffRounds = v.avgRounds - b.avgRounds
    const diffRetreat = v.retreats / v.trials - b.retreats / b.trials
    const diffInjuries = v.avgInjuries - b.avgInjuries
    const diffTotalLoss = v.totalLosses / v.trials - b.totalLosses / b.trials
    lines.push(
      `| ${name} | ${diffWin.toFixed(3)} | ${diffContact.toFixed(3)} | ${diffDmg.toFixed(1)} | ${diffRounds.toFixed(1)} | ${diffRetreat.toFixed(3)} | ${diffInjuries.toFixed(2)} | ${diffTotalLoss.toFixed(3)} |`,
    )
  }
  lines.push('')
  lines.push(
    '注: 「特定敵能力への対処失敗」は、現状のログから直接定量化できないため、勝率・全滅・被ダメージの増加を代理指標としています。',
  )

  const report = lines.join('\n')
  const reportPath = path.resolve(process.cwd(), 'PHASE2_REPORT.md')
  fs.writeFileSync(reportPath, report)
  console.log(`Report written to ${reportPath}`)
}

main()
