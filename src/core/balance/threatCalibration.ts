import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import { calculateHitChance, calculateWeaponDamage } from '../battle/actions.ts'
import { createAdventurerUnit, createEnemyUnit } from '../battle/battleState.ts'
import type {
  AdventurerRank,
  AdventurerRole,
  EnemyRank,
} from '../models/types.ts'
import type { BattleUnit } from '../battle/battleState.ts'

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const SAMPLES = 120

const PARTY_ROLES: AdventurerRole[] = ['vanguard', 'ranger', 'mage', 'healer']

export interface RankCalibration {
  expectedDamagePerRound: number
  survivalRounds: number
  hitRate: number
  evadeRate: number
  effectiveHp: number
  healingPerRound: number
  statusEffectExpectation: number
  abilityUseCount: number
  actionCount: number
  powerIndex: number
}

export interface ThreatCalibrationResult {
  adventurerThreat: Record<AdventurerRank, number>
  enemyBaseThreat: Record<EnemyRank, number>
  adventurerMetrics: Record<AdventurerRank, RankCalibration>
  enemyMetrics: Record<EnemyRank, RankCalibration>
}

export function calibrateThreatTables(): ThreatCalibrationResult {
  const refEnemyUnit = createEnemyUnit(
    generateEnemy('calib-ref-enemy', {
      rank: 'C',
      species: 'beast',
      archetype: 'assault',
      tier: 'standard',
    }),
  )
  const refAdvUnit = createAdventurerUnit(
    generateAdventurer({
      seed: 'calib-ref-adv',
      rank: 'C',
      role: 'vanguard',
    }),
  )

  const adventurerMetrics: Partial<Record<AdventurerRank, RankCalibration>> = {}
  const enemyMetrics: Partial<Record<EnemyRank, RankCalibration>> = {}

  for (const rank of RANKS) {
    const advSamples = PARTY_ROLES.map((role, i) =>
      createAdventurerUnit(
        generateAdventurer({
          seed: `calib-adv-${rank}-${i}`,
          rank,
          role,
        }),
      ),
    )
    adventurerMetrics[rank] = averageRankCalibration(advSamples, refEnemyUnit)

    const enemySamples: BattleUnit[] = []
    for (let i = 0; i < SAMPLES; i++) {
      enemySamples.push(
        createEnemyUnit(
          generateEnemy(`calib-enemy-${rank}-${i}`, {
            rank: rank as EnemyRank,
            species: 'beast',
            archetype: 'assault',
            tier: 'standard',
          }),
        ),
      )
    }
    enemyMetrics[rank as EnemyRank] = averageRankCalibration(
      enemySamples,
      refAdvUnit,
    )
  }

  const advMetrics = adventurerMetrics as Record<
    AdventurerRank,
    RankCalibration
  >
  const enemyMetricsFull = enemyMetrics as Record<EnemyRank, RankCalibration>

  return {
    adventurerThreat: normalizeToE(mapPower(advMetrics)),
    enemyBaseThreat: {
      ...normalizeToE(mapPower(enemyMetricsFull)),
      DISASTER: Number(
        (normalizeToE(mapPower(enemyMetricsFull)).S * 1.5).toFixed(2),
      ),
    } as Record<EnemyRank, number>,
    adventurerMetrics: advMetrics,
    enemyMetrics: enemyMetricsFull,
  }
}

function averageRankCalibration(
  units: BattleUnit[],
  referenceDefender: BattleUnit,
): RankCalibration {
  const samples = units.map((u) => calibrateUnit(u, referenceDefender))
  return {
    expectedDamagePerRound: average(
      samples.map((s) => s.expectedDamagePerRound),
    ),
    survivalRounds: average(samples.map((s) => s.survivalRounds)),
    hitRate: average(samples.map((s) => s.hitRate)),
    evadeRate: average(samples.map((s) => s.evadeRate)),
    effectiveHp: average(samples.map((s) => s.effectiveHp)),
    healingPerRound: average(samples.map((s) => s.healingPerRound)),
    statusEffectExpectation: average(
      samples.map((s) => s.statusEffectExpectation),
    ),
    abilityUseCount: average(samples.map((s) => s.abilityUseCount)),
    actionCount: average(samples.map((s) => s.actionCount)),
    powerIndex: average(samples.map((s) => s.powerIndex)),
  }
}

function calibrateUnit(unit: BattleUnit, referenceDefender: BattleUnit) {
  const weapon = calculateWeaponDamage(unit)
  const defenderSkill =
    weapon.skill === 'attackMagic' ? 'defenseMagic' : 'defense'
  const hitRate =
    calculateHitChance(unit, referenceDefender, weapon.skill, defenderSkill) /
    100
  const armor = referenceDefender.equipment?.armor?.reduction ?? 0
  const damagePerHit = Math.max(1, weapon.base - armor)
  const expectedDamagePerRound = hitRate * damagePerHit

  const incomingWeapon = calculateWeaponDamage(referenceDefender)
  const incomingSkill =
    incomingWeapon.skill === 'attackMagic' ? 'defenseMagic' : 'defense'
  const incomingHitRate =
    calculateHitChance(
      referenceDefender,
      unit,
      incomingWeapon.skill,
      incomingSkill,
    ) / 100
  const incomingArmor = unit.equipment?.armor?.reduction ?? 0
  const incomingDamagePerHit = Math.max(1, incomingWeapon.base - incomingArmor)
  const incomingDpr = incomingHitRate * incomingDamagePerHit

  const survivalRounds = incomingDpr > 0 ? unit.maxHp / incomingDpr : 999
  const effectiveHp = unit.maxHp
  const evadeRate = Math.min(1, unit.skills.defense / 120)

  const healingPerRound = estimateHealingPerRound(unit)
  const statusEffectExpectation = countStatusAbilities(unit)
  const abilityUseCount = unit.abilities?.length ?? 0
  const actionCount = 1

  const powerIndex = expectedDamagePerRound * survivalRounds

  return {
    expectedDamagePerRound,
    survivalRounds,
    hitRate,
    evadeRate,
    effectiveHp,
    healingPerRound,
    statusEffectExpectation,
    abilityUseCount,
    actionCount,
    powerIndex,
  }
}

function estimateHealingPerRound(unit: BattleUnit): number {
  const healSkill = unit.skills.healing
  if (healSkill <= 0) return 0
  const healPower = Math.max(1, Math.round(healSkill / 4))
  return healPower / 3
}

function countStatusAbilities(unit: BattleUnit): number {
  const statusIds = new Set([
    'poisonAttack',
    'bleedAttack',
    'fear',
    'stunAttack',
    'sleep',
    'confuse',
  ])
  return (
    unit.abilities?.filter((a: { abilityId: string }) =>
      statusIds.has(a.abilityId),
    ).length ?? 0
  )
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function mapPower<T extends string>(
  metrics: Record<T, RankCalibration>,
): Record<T, number> {
  const out = {} as Record<T, number>
  for (const k of Object.keys(metrics) as T[]) {
    out[k] = metrics[k].powerIndex
  }
  return out
}

function normalizeToE<T extends string>(
  powers: Record<T, number>,
): Record<T, number> {
  const entries = Object.entries(powers) as [T, number][]
  const eEntry = entries.find(([k]) => k === 'E')
  const base = eEntry ? eEntry[1] : Math.min(...entries.map(([, v]) => v))
  const out = {} as Record<T, number>
  for (const [k, v] of entries) {
    out[k] = Number((v / base).toFixed(2))
  }
  return out
}
