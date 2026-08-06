import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleLogEntry,
  BattleOutcome,
  BattleResult,
  Enemy,
} from '../src/core/models/types.ts'

const CONFIG = {
  rank: 'C' as const,
  difficulty: 'normal' as const,
  baseTrials: 5000,
  pairedTrials: 5000,
  baseSeed: 'phase2-role-suitability-v2',
} as const

const ACTION_TYPES: Set<BattleLogEntry['actionType']> = new Set([
  'melee',
  'ranged',
  'magic',
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

const ROLES: AdventurerRole[] = [
  'vanguard',
  'guardian',
  'scout',
  'ranger',
  'mage',
  'healer',
  'support',
]

function isFavorable(outcome: BattleOutcome): boolean {
  return (
    outcome === 'victory' ||
    outcome === 'costlyVictory' ||
    outcome === 'partialVictory'
  )
}

interface RoleMetrics {
  partyTrials: number
  characterAppearances: number
  damageDealt: number
  damageTaken: number
  healAmount: number
  guardPotency: number
  requestedMorale: number
  actualMoraleGained: number
  actionCount: number
  statusInflicted: number
  statusCured: number
  enemyActionDisruptions: number
  weaknessDiscoveries: number
  retreatProposed: number
  retreatSuccessContributions: number
  incapacitations: number
  survived: number
  injurySeverities: number[]
}

function emptyMetrics(): RoleMetrics {
  return {
    partyTrials: 0,
    characterAppearances: 0,
    damageDealt: 0,
    damageTaken: 0,
    healAmount: 0,
    guardPotency: 0,
    requestedMorale: 0,
    actualMoraleGained: 0,
    actionCount: 0,
    statusInflicted: 0,
    statusCured: 0,
    enemyActionDisruptions: 0,
    weaknessDiscoveries: 0,
    retreatProposed: 0,
    retreatSuccessContributions: 0,
    incapacitations: 0,
    survived: 0,
    injurySeverities: [],
  }
}

function createMetricsMap(): Record<AdventurerRole, RoleMetrics> {
  return {
    vanguard: emptyMetrics(),
    guardian: emptyMetrics(),
    scout: emptyMetrics(),
    ranger: emptyMetrics(),
    mage: emptyMetrics(),
    healer: emptyMetrics(),
    support: emptyMetrics(),
  }
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
  if (isFavorable(result.outcome)) {
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

function updateMetricsFromBattle(
  result: BattleResult,
  party: Adventurer[],
  enemies: Enemy[],
  metrics: Record<AdventurerRole, RoleMetrics>,
): void {
  const partyIdSet = new Set(party.map((a) => a.id))
  const enemyIdSet = new Set(enemies.map((e) => e.id))
  const roleById = new Map(party.map((a) => [a.id, a.role]))

  const characterCounts = new Map<AdventurerRole, number>()
  for (const a of party) {
    characterCounts.set(a.role, (characterCounts.get(a.role) ?? 0) + 1)
  }
  for (const [role, count] of characterCounts.entries()) {
    const m = metrics[role]
    m.partyTrials += 1
    m.characterAppearances += count
  }

  const aliveOrEscaped = new Set(result.survivingAdventurers)
  const incap = new Set(result.incapacitatedAdventurers)
  const dead = new Set(result.deadAdventurers)
  for (const a of party) {
    const m = metrics[a.role]
    if (aliveOrEscaped.has(a.id)) {
      m.survived += 1
    }
    if (incap.has(a.id) || dead.has(a.id)) {
      m.incapacitations += 1
    }
  }
  for (const injury of result.injuries) {
    const role = roleById.get(injury.adventurerId)
    if (role) {
      metrics[role].injurySeverities.push(injury.severity)
    }
  }

  const statusesByUnit = new Map<string, Set<string>>()

  function record(role: AdventurerRole, key: keyof RoleMetrics, value: number) {
    const m = metrics[role]
    ;(m[key] as number) += value
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
        const amount =
          (log.metadata?.actualHealAmount as number | undefined) ?? 0
        record(actorRole, 'healAmount', amount)
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
        const potency = (log.metadata?.guardPotency as number | undefined) ?? 0
        record(actorRole, 'guardPotency', potency)
      }
      if (log.actionType === 'support') {
        const actual =
          (log.metadata?.actualMoraleGained as number | undefined) ?? 0
        const requested =
          (log.metadata?.requestedMorale as number | undefined) ?? 0
        const potency = (log.metadata?.guardPotency as number | undefined) ?? 0
        record(actorRole, 'requestedMorale', requested)
        record(actorRole, 'actualMoraleGained', actual)
        record(actorRole, 'guardPotency', potency)
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
        (log.actorId && partyIdSet.has(log.actorId)) ||
        (log.actorId && enemyIdSet.has(log.actorId))
      ) {
        record(targetRole, 'damageTaken', log.damage)
      }
    }

    if (
      log.actionType === 'incapacitate' &&
      targetId &&
      partyIdSet.has(targetId)
    ) {
      statusesByUnit.delete(targetId)
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

  for (const attempt of result.retreatAttempts ?? []) {
    if (
      attempt.proposerRole &&
      ROLES.includes(attempt.proposerRole as AdventurerRole)
    ) {
      const role = attempt.proposerRole as AdventurerRole
      record(role, 'retreatProposed', 1)
      if (attempt.success) {
        record(role, 'retreatSuccessContributions', 1)
      }
    }
  }
}

function finalizeMetricsPerParty(
  metrics: Record<AdventurerRole, RoleMetrics>,
): Record<AdventurerRole, Record<string, number>> {
  return finalizeMetrics(metrics, 'party')
}

function finalizeMetricsPerCharacter(
  metrics: Record<AdventurerRole, RoleMetrics>,
): Record<AdventurerRole, Record<string, number>> {
  return finalizeMetrics(metrics, 'character')
}

function finalizeMetrics(
  metrics: Record<AdventurerRole, RoleMetrics>,
  mode: 'party' | 'character',
): Record<AdventurerRole, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [role, m] of Object.entries(metrics) as [
    AdventurerRole,
    RoleMetrics,
  ][]) {
    const divisor =
      mode === 'party' ? m.partyTrials || 1 : m.characterAppearances || 1
    const avg = (value: number) => (divisor > 0 ? value / divisor : 0)
    out[role] = {
      試行数: m.partyTrials,
      キャラクター出現数: m.characterAppearances,
      平均与ダメージ: avg(m.damageDealt),
      平均被ダメージ: avg(m.damageTaken),
      平均回復量: avg(m.healAmount),
      防護付与値: avg(m.guardPotency),
      士気付与値: avg(m.actualMoraleGained),
      士気要求値: avg(m.requestedMorale),
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
  const sep = `| ${['---', ...roles.map(() => '---')].join(' | ')} |`
  const lines = [header, sep]
  for (const key of keys) {
    const cells = roles.map((r) => {
      const v = metrics[r][key]
      if (key === '試行数' || key === 'キャラクター出現数') {
        return Number.isInteger(v) ? v.toString() : v.toFixed(0)
      }
      return v.toFixed(3)
    })
    lines.push(`| ${key} | ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}

function buildSlotAdventurer(
  slotSeed: string,
  role: AdventurerRole,
): Adventurer {
  return generateAdventurer({
    seed: slotSeed,
    rank: CONFIG.rank,
    role,
  })
}

function buildPairedParties(
  name: string,
  trial: number,
  baseRoles: AdventurerRole[],
  variantRoles: AdventurerRole[],
): { baseParty: Adventurer[]; variantParty: Adventurer[] } {
  const baseParty: Adventurer[] = []
  const variantParty: Adventurer[] = []
  const maxSlots = Math.max(baseRoles.length, variantRoles.length)
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
    const slotSeed = `${CONFIG.baseSeed}-${name}-${trial}-slot-${slotIndex}`
    const baseRole = baseRoles[slotIndex]
    const variantRole = variantRoles[slotIndex]

    if (baseRole && variantRole && baseRole === variantRole) {
      const member = buildSlotAdventurer(slotSeed, baseRole)
      baseParty.push(member)
      variantParty.push(structuredClone(member))
      continue
    }

    if (baseRole) {
      baseParty.push(buildSlotAdventurer(slotSeed, baseRole))
    }
    if (variantRole) {
      variantParty.push(buildSlotAdventurer(slotSeed, variantRole))
    }
  }
  return { baseParty, variantParty }
}

interface PairedResult {
  baseOverall: OverallResult
  variantOverall: OverallResult
  baseMetrics: Record<AdventurerRole, RoleMetrics>
  variantMetrics: Record<AdventurerRole, RoleMetrics>
  pairs: { baseFav: boolean; variantFav: boolean }[]
}

function runPairedComparison(
  name: string,
  baseRoles: AdventurerRole[],
  variantRoles: AdventurerRole[],
  trials: number,
): PairedResult {
  const baseOverall = emptyOverall()
  const variantOverall = emptyOverall()
  const baseMetrics = createMetricsMap()
  const variantMetrics = createMetricsMap()
  const pairs: { baseFav: boolean; variantFav: boolean }[] = []

  for (let i = 0; i < trials; i++) {
    const { baseParty, variantParty } = buildPairedParties(
      name,
      i,
      baseRoles,
      variantRoles,
    )
    const battleSeed = `${CONFIG.baseSeed}-${name}-${i}-battle`
    const planSeed = `${CONFIG.baseSeed}-${name}-${i}-plan`
    const encSeed = `${CONFIG.baseSeed}-${name}-${i}-enc`

    const enemies = generateEncounter({
      seed: encSeed,
      planSeed,
      partyThreat: calculatePartyThreat(baseParty),
      difficulty: CONFIG.difficulty,
      partySize: baseParty.length,
    })

    const baseResult = runBattle(battleSeed, baseParty, enemies)
    const variantResult = runBattle(battleSeed, variantParty, enemies)

    updateOverall(baseResult, baseOverall)
    updateOverall(variantResult, variantOverall)
    updateMetricsFromBattle(baseResult, baseParty, enemies, baseMetrics)
    updateMetricsFromBattle(
      variantResult,
      variantParty,
      enemies,
      variantMetrics,
    )
    pairs.push({
      baseFav: isFavorable(baseResult.outcome),
      variantFav: isFavorable(variantResult.outcome),
    })
  }

  return { baseOverall, variantOverall, baseMetrics, variantMetrics, pairs }
}

function pairedBootstrapCI(
  pairs: { baseFav: boolean; variantFav: boolean }[],
  seed: string,
  iterations = 10000,
): { lower: number; upper: number; mean: number } {
  const rng = new SeededRng(seed)
  const diffs: number[] = []
  const n = pairs.length
  for (let i = 0; i < iterations; i++) {
    let baseWins = 0
    let variantWins = 0
    for (let j = 0; j < n; j++) {
      const idx = rng.integer(0, n - 1)
      if (pairs[idx].baseFav) baseWins++
      if (pairs[idx].variantFav) variantWins++
    }
    diffs.push(variantWins / n - baseWins / n)
  }
  diffs.sort((a, b) => a - b)
  const lower = diffs[Math.floor(iterations * 0.025)]
  const upper = diffs[Math.floor(iterations * 0.975)]
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  return { lower, upper, mean }
}

function summarizePaired(
  pairs: { baseFav: boolean; variantFav: boolean }[],
  seed: string,
): {
  baseRate: number
  variantRate: number
  diff: number
  ci: { lower: number; upper: number; mean: number }
  baseWinVariantLoss: number
  baseLossVariantWin: number
} {
  const n = pairs.length
  const baseWins = pairs.filter((p) => p.baseFav).length
  const variantWins = pairs.filter((p) => p.variantFav).length
  const baseWinVariantLoss = pairs.filter(
    (p) => p.baseFav && !p.variantFav,
  ).length
  const baseLossVariantWin = pairs.filter(
    (p) => !p.baseFav && p.variantFav,
  ).length
  const baseRate = baseWins / n
  const variantRate = variantWins / n
  const diff = variantRate - baseRate
  const ci = pairedBootstrapCI(pairs, seed)
  return {
    baseRate,
    variantRate,
    diff,
    ci,
    baseWinVariantLoss,
    baseLossVariantWin,
  }
}

function selfVerification() {
  const standard: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']
  const trials = 1000
  const { pairs, baseOverall, variantOverall } = runPairedComparison(
    'self-verification',
    standard,
    standard,
    trials,
  )
  const base = finalizeOverall(baseOverall)
  const variant = finalizeOverall(variantOverall)
  const mismatches = pairs.filter((p) => p.baseFav !== p.variantFav).length
  const ok =
    mismatches === 0 &&
    base.victories === variant.victories &&
    base.retreats === variant.retreats &&
    base.defeats === variant.defeats &&
    base.totalLosses === variant.totalLosses &&
    base.stalemates === variant.stalemates &&
    Math.abs(base.avgRounds - variant.avgRounds) < 1e-9 &&
    Math.abs(base.avgPartyDamage - variant.avgPartyDamage) < 1e-9 &&
    Math.abs(base.avgEnemyDamage - variant.avgEnemyDamage) < 1e-9
  return { ok, mismatches, base, variant }
}

function runComposition(
  name: string,
  roles: AdventurerRole[],
  trials: number,
): { overall: OverallResult; metrics: Record<AdventurerRole, RoleMetrics> } {
  const overall = emptyOverall()
  const metrics = createMetricsMap()
  for (let i = 0; i < trials; i++) {
    const party: Adventurer[] = []
    for (let slotIndex = 0; slotIndex < roles.length; slotIndex++) {
      const slotSeed = `${CONFIG.baseSeed}-${name}-${i}-slot-${slotIndex}`
      party.push(buildSlotAdventurer(slotSeed, roles[slotIndex]))
    }
    const planSeed = `${CONFIG.baseSeed}-${name}-${i}-plan`
    const encSeed = `${CONFIG.baseSeed}-${name}-${i}-enc`
    const enemies = generateEncounter({
      seed: encSeed,
      planSeed,
      partyThreat: calculatePartyThreat(party),
      difficulty: CONFIG.difficulty,
      partySize: party.length,
    })
    const battleSeed = `${CONFIG.baseSeed}-${name}-${i}-battle`
    const result = runBattle(battleSeed, party, enemies)
    updateOverall(result, overall)
    updateMetricsFromBattle(result, party, enemies, metrics)
  }
  return { overall, metrics }
}

interface ExperimentConfig {
  name: string
  base: AdventurerRole[]
  variant: AdventurerRole[]
}

function experimentSection(
  title: string,
  experiments: ExperimentConfig[],
): string {
  const lines: string[] = []
  lines.push(`## ${title}`)
  lines.push('')

  const summaryRows: string[] = []
  for (const exp of experiments) {
    const { baseOverall, variantOverall, variantMetrics, pairs } =
      runPairedComparison(exp.name, exp.base, exp.variant, CONFIG.pairedTrials)
    const summary = summarizePaired(
      pairs,
      `${CONFIG.baseSeed}-${exp.name}-bootstrap`,
    )

    lines.push(`### ${exp.name}`)
    lines.push('')
    lines.push('**base**')
    lines.push(formatOverall(finalizeOverall(baseOverall)))
    lines.push('')
    lines.push('**variant**')
    lines.push(formatOverall(finalizeOverall(variantOverall)))
    lines.push('')
    lines.push('**variant ロール指標（1パーティあたり）**')
    lines.push(formatMetricsTable(finalizeMetricsPerParty(variantMetrics)))
    lines.push('')
    lines.push('**variant ロール指標（1キャラクターあたり）**')
    lines.push(formatMetricsTable(finalizeMetricsPerCharacter(variantMetrics)))
    lines.push('')

    summaryRows.push(
      `| ${exp.name} | ${summary.baseRate.toFixed(3)} | ${summary.variantRate.toFixed(3)} | ${summary.diff.toFixed(3)} | ${summary.ci.lower.toFixed(3)} | ${summary.ci.upper.toFixed(3)} | ${summary.baseWinVariantLoss} | ${summary.baseLossVariantWin} |`,
    )
  }

  lines.push('### 差分まとめ')
  lines.push('')
  lines.push(
    '| 条件 | base勝率 | variant勝率 | 差分 | 95%CI下限 | 95%CI上限 | base勝/variant敗 | base敗/variant勝 |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  lines.push(...summaryRows)
  lines.push('')
  lines.push(
    '注: 95%信頼区間は paired bootstrap（10,000 回）で算出。信頼区間が 0 を含む場合、差は統計的に不明確とみなします。',
  )
  lines.push('')
  return lines.join('\n')
}

function main() {
  const lines: string[] = []
  lines.push('# Phase 2.1 役割適性計測レポート')
  lines.push('')
  lines.push(`- 等級: ${CONFIG.rank}`)
  lines.push(`- 難易度: ${CONFIG.difficulty}`)
  lines.push(`- 基本計測試行数: ${CONFIG.baseTrials}`)
  lines.push(`- ペアード比較試行数: ${CONFIG.pairedTrials}`)
  lines.push(`- シード: ${CONFIG.baseSeed}`)
  lines.push('')

  // 自己検証
  lines.push('## 0. 自己検証（同一編成を base/variant へ）')
  lines.push('')
  const self = selfVerification()
  if (!self.ok) {
    lines.push(`自己検証に失敗しました。不一致ペア数: ${self.mismatches}`)
    lines.push('')
    lines.push('base/variant の再現性が崩れているため、置換実験を中止します。')
    const report = lines.join('\n')
    fs.writeFileSync(path.resolve(process.cwd(), 'PHASE2_REPORT.md'), report)
    console.error('Self-verification failed:', self.mismatches, 'mismatches')
    process.exit(1)
  }
  lines.push(
    `OK: 1000 試行中不一致ペア 0、勝率・ラウンド・与/被ダメージが一致。`,
  )
  lines.push('')

  // 標準編成の基本指標
  lines.push(
    '## 1. 標準編成（vanguard/guardian/mage/healer）のロール別基本指標',
  )
  lines.push('')
  const standard = runComposition(
    'standard-base',
    ['vanguard', 'guardian', 'mage', 'healer'],
    CONFIG.baseTrials,
  )
  lines.push(formatOverall(finalizeOverall(standard.overall)))
  lines.push('')
  lines.push('**1パーティあたり**')
  lines.push(formatMetricsTable(finalizeMetricsPerParty(standard.metrics)))
  lines.push('')
  lines.push('**1キャラクターあたり**')
  lines.push(formatMetricsTable(finalizeMetricsPerCharacter(standard.metrics)))
  lines.push('')

  // 置換実験
  const swapExperiments: ExperimentConfig[] = [
    {
      name: 'guardian → vanguard',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'vanguard', 'mage', 'healer'],
    },
    {
      name: 'guardian → scout',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'scout', 'mage', 'healer'],
    },
    {
      name: 'mage → ranger',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'ranger', 'healer'],
    },
    {
      name: 'healer → support',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'mage', 'support'],
    },
    {
      name: 'healer → mage',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'mage', 'mage'],
    },
    {
      name: 'mage → healer',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'healer', 'healer'],
    },
  ]
  lines.push(experimentSection('2. 置換実験', swapExperiments))

  // 役割不在（4人維持）
  const absenceExperiments: ExperimentConfig[] = [
    {
      name: 'healer不在',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'mage', 'vanguard'],
    },
    {
      name: 'guardian不在',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'scout', 'mage', 'healer'],
    },
    {
      name: '魔法攻撃不在',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'ranger', 'healer'],
    },
    {
      name: '遠距離攻撃不在',
      base: ['vanguard', 'guardian', 'ranger', 'healer'],
      variant: ['vanguard', 'guardian', 'vanguard', 'healer'],
    },
    {
      name: '索敵役不在',
      base: ['vanguard', 'scout', 'mage', 'healer'],
      variant: ['vanguard', 'vanguard', 'mage', 'healer'],
    },
    {
      name: '指揮役不在',
      base: ['vanguard', 'guardian', 'support', 'healer'],
      variant: ['vanguard', 'guardian', 'vanguard', 'healer'],
    },
  ]
  lines.push(experimentSection('3. 4人維持した役割不在', absenceExperiments))

  // 人数不足
  const understaffedExperiments: ExperimentConfig[] = [
    {
      name: '標準4人 → 3人（healer除く）',
      base: ['vanguard', 'guardian', 'mage', 'healer'],
      variant: ['vanguard', 'guardian', 'mage'],
    },
  ]
  lines.push(experimentSection('4. 人数不足', understaffedExperiments))

  // 注意事項
  lines.push('## 5. 測定上の注意')
  lines.push('')
  lines.push(
    '- 状態異常付与・敵行動妨害は、現行のロール定義では冒険者側が敵に付与する手段がないため 0 となっています。',
  )
  lines.push(
    '- 防護・支援の効果量は「付与値」であり、実際に軽減したダメージ量ではありません。',
  )
  lines.push(
    '- 人数不足実験では、base と variant でパーティサイズが異なるため、敵編成は base（4人）脅威点で生成されます。',
  )

  const reportPath = path.resolve(process.cwd(), 'PHASE2_REPORT.md')
  fs.writeFileSync(reportPath, lines.join('\n'))
  console.log(`Report written to ${reportPath}`)
}

main()
