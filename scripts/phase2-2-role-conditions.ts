import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculateAbilityThreat,
  generateEnemy,
} from '../src/core/generators/enemyGenerator.ts'
import {
  actionEconomyMultiplier,
  calculatePartyThreat,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import {
  ABILITY_THREAT_COST,
  DIFFICULTY_BUDGET_MULTIPLIER,
  ENEMY_BASE_THREAT,
  MAX_ROUNDS,
  TIER_THREAT_MULTIPLIER,
} from '../src/core/balance/constants.ts'
import type {
  AbilityInstance,
  Adventurer,
  AdventurerRole,
  BattleOutcome,
  BattleResult,
  Enemy,
  EnemyArchetype,
  EnemyRank,
  EnemySpecies,
  EnemyTier,
} from '../src/core/models/types.ts'

const CONFIG = {
  rank: 'C' as const,
  difficulty: 'normal' as const,
  trials: 5000,
  baseSeed: 'phase2-2-role-conditions-v1',
} as const

type EncounterFeature =
  | 'flying'
  | 'physicalResistant'
  | 'magicResistant'
  | 'ambusher'
  | 'swarm'
  | 'boss'
  | 'fear'
  | 'poisonOrBleed'
  | 'healBlock'
  | 'summoner'
  | 'reviver'
  | 'highBurst'
  | 'highDefense'

type InternalCondition = 'rear' | 'healerTarget' | 'mageTarget' | 'regeneration'
type ConditionKey = EncounterFeature | InternalCondition

interface ConditionEnemyConfig {
  species: EnemySpecies
  archetype: EnemyArchetype
  tier: EnemyTier
  rank: EnemyRank
  abilities: AbilityInstance[]
  postProcess?: (enemy: Enemy) => void
  displayName: string
}

const FILLER_CONFIG: Omit<ConditionEnemyConfig, 'displayName'> = {
  species: 'humanoid',
  archetype: 'assault',
  tier: 'standard',
  rank: 'C',
  abilities: [],
}

function ability(
  name: string,
  id: keyof typeof ABILITY_THREAT_COST,
): AbilityInstance {
  return { abilityId: id as string, name }
}

const CONDITION_CONFIG: Record<ConditionKey, ConditionEnemyConfig> = {
  flying: {
    species: 'beast',
    archetype: 'skirmisher',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('飛行', 'flight')],
    displayName: 'flying',
  },
  physicalResistant: {
    species: 'construct',
    archetype: 'tank',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('物理耐性', 'physicalResist')],
    displayName: 'physicalResistant',
  },
  magicResistant: {
    species: 'aberration',
    archetype: 'controller',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('魔術耐性', 'magicResist')],
    displayName: 'magicResistant',
  },
  ambusher: {
    species: 'beast',
    archetype: 'ambusher',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('隠密開始', 'stealthStart')],
    displayName: 'ambusher',
  },
  swarm: {
    species: 'insect',
    archetype: 'swarm',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('群れ連携', 'swarmCoordination')],
    displayName: 'swarm',
  },
  boss: {
    species: 'humanoid',
    archetype: 'assault',
    tier: 'boss',
    rank: 'E',
    abilities: [],
    displayName: 'boss',
  },
  fear: {
    species: 'aberration',
    archetype: 'controller',
    tier: 'standard',
    rank: 'D',
    abilities: [ability('恐怖付与', 'fear')],
    displayName: 'fear',
  },
  poisonOrBleed: {
    species: 'beast',
    archetype: 'ambusher',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('毒攻撃', 'poisonAttack')],
    displayName: 'poisonOrBleed',
  },
  healBlock: {
    species: 'aberration',
    archetype: 'controller',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('治療妨害', 'healBlock')],
    displayName: 'healBlock',
  },
  summoner: {
    species: 'humanoid',
    archetype: 'controller',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('仲間召喚', 'summon')],
    displayName: 'summoner',
  },
  reviver: {
    species: 'undead',
    archetype: 'controller',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('仲間の蘇生', 'revive')],
    displayName: 'reviver',
  },
  highBurst: {
    species: 'beast',
    archetype: 'assault',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('範囲攻撃', 'areaAttack')],
    displayName: 'highBurst',
  },
  highDefense: {
    species: 'construct',
    archetype: 'tank',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('正面防御', 'frontDefense')],
    displayName: 'highDefense',
  },
  rear: {
    species: 'aberration',
    archetype: 'skirmisher',
    tier: 'standard',
    rank: 'C',
    abilities: [],
    postProcess: (enemy) => {
      const rear = enemy.weaknesses.find((w) => w.weaknessId === 'rearAttack')
      if (rear) {
        rear.known = true
      } else {
        enemy.weaknesses.push({
          weaknessId: 'rearAttack',
          name: '背面攻撃',
          known: true,
        })
      }
    },
    displayName: 'rear-line enemy',
  },
  healerTarget: {
    species: 'humanoid',
    archetype: 'controller',
    tier: 'standard',
    rank: 'C',
    abilities: [],
    displayName: 'healerTarget',
  },
  mageTarget: {
    species: 'beast',
    archetype: 'ambusher',
    tier: 'standard',
    rank: 'C',
    abilities: [],
    displayName: 'mageTarget',
  },
  regeneration: {
    species: 'aberration',
    archetype: 'controller',
    tier: 'standard',
    rank: 'C',
    abilities: [ability('再生', 'regeneration')],
    displayName: 'regeneration',
  },
}

function getFocusConditionName(key: ConditionKey): string {
  const names: Record<ConditionKey, string> = {
    flying: '飛行',
    physicalResistant: '物理耐性',
    magicResistant: '魔術耐性',
    ambusher: '待ち伏せ',
    swarm: '群れ',
    boss: 'ボス',
    fear: '恐怖',
    poisonOrBleed: '毒/出血',
    healBlock: '治療妨害',
    summoner: '召喚者',
    reviver: '蘇生者',
    highBurst: '高火力/範囲',
    highDefense: '高防御',
    rear: '後衛型敵',
    healerTarget: 'ヒーラー狙い',
    mageTarget: 'メイジ狙い',
    regeneration: '再生/長期戦',
  }
  return names[key]
}

interface RoleExperimentConfig {
  role: string
  replacements: {
    name: string
    base: AdventurerRole[]
    variant: AdventurerRole[]
  }[]
  focusConditions: ConditionKey[]
}

const ROLE_EXPERIMENTS: RoleExperimentConfig[] = [
  {
    role: 'ranger',
    replacements: [
      {
        name: 'mage → ranger',
        base: ['vanguard', 'guardian', 'mage', 'healer'],
        variant: ['vanguard', 'guardian', 'ranger', 'healer'],
      },
      {
        name: 'vanguard → ranger',
        base: ['vanguard', 'guardian', 'mage', 'healer'],
        variant: ['ranger', 'guardian', 'mage', 'healer'],
      },
    ],
    focusConditions: ['flying', 'magicResistant', 'ambusher', 'rear'],
  },
  {
    role: 'scout',
    replacements: [
      {
        name: 'guardian → scout',
        base: ['vanguard', 'guardian', 'mage', 'healer'],
        variant: ['vanguard', 'scout', 'mage', 'healer'],
      },
      {
        name: 'vanguard → scout',
        base: ['vanguard', 'guardian', 'mage', 'healer'],
        variant: ['scout', 'guardian', 'mage', 'healer'],
      },
    ],
    focusConditions: ['ambusher', 'summoner', 'reviver', 'rear'],
  },
  {
    role: 'guardian',
    replacements: [
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
    ],
    focusConditions: [
      'highBurst',
      'healerTarget',
      'mageTarget',
      'boss',
      'swarm',
    ],
  },
  {
    role: 'support',
    replacements: [
      {
        name: 'support → vanguard',
        base: ['vanguard', 'guardian', 'healer', 'support'],
        variant: ['vanguard', 'guardian', 'healer', 'vanguard'],
      },
      {
        name: 'support → mage',
        base: ['vanguard', 'guardian', 'healer', 'support'],
        variant: ['vanguard', 'guardian', 'healer', 'mage'],
      },
      {
        name: 'support → guardian',
        base: ['vanguard', 'guardian', 'healer', 'support'],
        variant: ['vanguard', 'guardian', 'healer', 'guardian'],
      },
    ],
    focusConditions: ['fear', 'boss', 'regeneration', 'highBurst'],
  },
  {
    role: 'healer',
    replacements: [
      {
        name: 'healer → vanguard',
        base: ['vanguard', 'guardian', 'mage', 'healer'],
        variant: ['vanguard', 'guardian', 'mage', 'vanguard'],
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
    ],
    focusConditions: [
      'poisonOrBleed',
      'healBlock',
      'highBurst',
      'regeneration',
      'physicalResistant',
    ],
  },
]

function isFavorable(outcome: BattleOutcome): boolean {
  return (
    outcome === 'victory' ||
    outcome === 'costlyVictory' ||
    outcome === 'partialVictory'
  )
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

interface SpecificMetrics {
  contactSuccesses: number
  firstStrikes: number
  initialDamage: number
  weaknessDiscoveries: number
  featureDamage: number
  featureDefeatRounds: number
  featureDefeatCount: number
  controllerDefeatRounds: number
  controllerDefeatCount: number
  actualDamagePrevented: number
  actualDamagePreventedByGuardian: number
  actualDamagePreventedBySupport: number
  preventedIncapacitations: number
  preventedIncapacitationsByGuardian: number
  redirectedAttackCount: number
  healerMpSavedEstimate: number
  guardTargetRoleCounts: Record<string, number>
  guardTargetRoleCountsByGuardian: Record<string, number>
  guardTargetRoleCountsBySupport: Record<string, number>
  moraleGained: number
  leaderTargetFollowCount: number
  focusFireContribution: number
  healAmount: number
  statusCured: number
  healerMpUsed: number
  healerMaxMp: number
  healerCount: number
}

function emptySpecificMetrics(): SpecificMetrics {
  return {
    contactSuccesses: 0,
    firstStrikes: 0,
    initialDamage: 0,
    weaknessDiscoveries: 0,
    featureDamage: 0,
    featureDefeatRounds: 0,
    featureDefeatCount: 0,
    controllerDefeatRounds: 0,
    controllerDefeatCount: 0,
    actualDamagePrevented: 0,
    actualDamagePreventedByGuardian: 0,
    actualDamagePreventedBySupport: 0,
    preventedIncapacitations: 0,
    preventedIncapacitationsByGuardian: 0,
    redirectedAttackCount: 0,
    healerMpSavedEstimate: 0,
    guardTargetRoleCounts: {},
    guardTargetRoleCountsByGuardian: {},
    guardTargetRoleCountsBySupport: {},
    moraleGained: 0,
    leaderTargetFollowCount: 0,
    focusFireContribution: 0,
    healAmount: 0,
    statusCured: 0,
    healerMpUsed: 0,
    healerMaxMp: 0,
    healerCount: 0,
  }
}

function addGuardTargetCount(
  map: Record<string, number>,
  role: string | undefined,
): void {
  if (!role) return
  map[role] = (map[role] ?? 0) + 1
}

function featureEnemyId(
  enemies: Enemy[],
  conditionKey: ConditionKey,
): string | undefined {
  const e = enemies.find((enemy) => {
    switch (conditionKey) {
      case 'flying':
        return enemy.abilities.some((a) => a.abilityId === 'flight')
      case 'physicalResistant':
        return enemy.abilities.some((a) => a.abilityId === 'physicalResist')
      case 'magicResistant':
        return enemy.abilities.some((a) => a.abilityId === 'magicResist')
      case 'ambusher':
        return (
          enemy.archetype === 'ambusher' ||
          enemy.abilities.some((a) => a.abilityId === 'stealthStart')
        )
      case 'swarm':
        return (
          enemy.archetype === 'swarm' ||
          enemy.abilities.some((a) => a.abilityId === 'swarmCoordination')
        )
      case 'boss':
        return enemy.tier === 'boss'
      case 'fear':
        return enemy.abilities.some((a) => a.abilityId === 'fear')
      case 'poisonOrBleed':
        return enemy.abilities.some(
          (a) =>
            a.abilityId === 'poisonAttack' || a.abilityId === 'bleedAttack',
        )
      case 'healBlock':
        return enemy.abilities.some((a) => a.abilityId === 'healBlock')
      case 'summoner':
        return enemy.abilities.some((a) => a.abilityId === 'summon')
      case 'reviver':
        return enemy.abilities.some((a) => a.abilityId === 'revive')
      case 'highBurst':
        return enemy.abilities.some((a) => a.abilityId === 'areaAttack')
      case 'highDefense':
        return (
          enemy.archetype === 'tank' ||
          enemy.abilities.some((a) => a.abilityId === 'frontDefense')
        )
      case 'rear':
        return enemy.weaknesses.some(
          (w) => w.weaknessId === 'rearAttack' && w.known,
        )
      case 'healerTarget':
        return (
          enemy.behavior.targetPreference === 'healer' ||
          enemy.archetype === 'controller'
        )
      case 'mageTarget':
        return (
          enemy.behavior.targetPreference === 'mage' ||
          enemy.archetype === 'ambusher'
        )
      case 'regeneration':
        return enemy.abilities.some((a) => a.abilityId === 'regeneration')
      default:
        return false
    }
  })
  return e?.id
}

function controllerEnemyId(enemies: Enemy[]): string | undefined {
  const e = enemies.find(
    (enemy) =>
      enemy.archetype === 'controller' ||
      enemy.abilities.some(
        (a) => a.abilityId === 'summon' || a.abilityId === 'revive',
      ),
  )
  return e?.id
}

function analyzeBattle(
  result: BattleResult,
  party: Adventurer[],
  enemies: Enemy[],
  conditionKey: ConditionKey,
  metrics: SpecificMetrics,
  overall: OverallResult,
): void {
  updateOverall(result, overall)

  const partyIdSet = new Set(party.map((a) => a.id))
  const roleById = new Map(party.map((a) => [a.id, a.role]))

  const contactSuccess =
    result.contactResult.type !== 'failure' &&
    result.contactResult.type !== 'greatFailure'
  metrics.contactSuccesses += contactSuccess ? 1 : 0

  const firstCombat = result.logs.find((l) => l.phase === 'combat')
  if (
    firstCombat &&
    firstCombat.actorId &&
    partyIdSet.has(firstCombat.actorId)
  ) {
    metrics.firstStrikes += 1
  }

  const targetId = featureEnemyId(enemies, conditionKey)
  const controllerId = controllerEnemyId(enemies)

  const statusesByUnit = new Map<string, Set<string>>()
  const mpUsed = new Map<string, number>()
  for (const a of party) mpUsed.set(a.id, 0)

  for (const log of result.logs) {
    if (
      log.phase === 'contact' &&
      (log.actionType === 'weaknessDiscovery' ||
        log.actionType === 'monsterKnowledge')
    ) {
      metrics.weaknessDiscoveries += 1
    }

    if (
      log.phase === 'combat' &&
      typeof log.damage === 'number' &&
      log.targetIds?.[0] === targetId
    ) {
      metrics.featureDamage += log.damage
    }

    if (log.actionType === 'incapacitate' && log.targetIds?.[0] === targetId) {
      metrics.featureDefeatCount += 1
      metrics.featureDefeatRounds += log.round
    }
    if (
      log.actionType === 'incapacitate' &&
      log.targetIds?.[0] === controllerId
    ) {
      metrics.controllerDefeatCount += 1
      metrics.controllerDefeatRounds += log.round
    }

    if (
      log.phase === 'combat' &&
      typeof log.damage === 'number' &&
      log.round <= 1 &&
      log.actorId &&
      !partyIdSet.has(log.actorId)
    ) {
      metrics.initialDamage += log.damage
    }

    const md = (log.metadata ?? {}) as Record<string, unknown>

    if (typeof md.guardPrevented === 'number') {
      metrics.actualDamagePrevented += md.guardPrevented
      const sourceRole = md.guardSourceId
        ? roleById.get(md.guardSourceId as string)
        : undefined
      if (sourceRole === 'guardian') {
        metrics.actualDamagePreventedByGuardian += md.guardPrevented
      }
      if (sourceRole === 'support') {
        metrics.actualDamagePreventedBySupport += md.guardPrevented
      }
      if (md.preventedIncap === true) {
        metrics.preventedIncapacitations += 1
        if (sourceRole === 'guardian') {
          metrics.preventedIncapacitationsByGuardian += 1
        }
      }
    }

    if (log.actionType === 'guard') {
      const targetRole = md.guardTargetRole as string | undefined
      addGuardTargetCount(metrics.guardTargetRoleCounts, targetRole)
      const sourceRole = md.guardSourceRole as string | undefined
      if (sourceRole === 'guardian') {
        addGuardTargetCount(metrics.guardTargetRoleCountsByGuardian, targetRole)
      }
      if (sourceRole === 'support') {
        addGuardTargetCount(metrics.guardTargetRoleCountsBySupport, targetRole)
      }
    }

    if (
      log.actionType === 'support' &&
      typeof md.actualMoraleGained === 'number'
    ) {
      metrics.moraleGained += md.actualMoraleGained
    }

    if (
      md.followedLeaderTarget === true &&
      log.actorId &&
      partyIdSet.has(log.actorId)
    ) {
      metrics.leaderTargetFollowCount += 1
      metrics.focusFireContribution += 1
    }

    if (log.actionType === 'heal' && typeof md.actualHealAmount === 'number') {
      metrics.healAmount += md.actualHealAmount
      const target = log.targetIds?.[0]
      if (target) {
        const active = statusesByUnit.get(target)
        if (active && (active.has('poisoned') || active.has('bleeding'))) {
          metrics.statusCured += 1
        }
      }
      const actorRole = log.actorId ? roleById.get(log.actorId) : undefined
      if (actorRole === 'healer' && log.actorId) {
        mpUsed.set(log.actorId, (mpUsed.get(log.actorId) ?? 0) + 3)
      }
    }
    if (log.actionType === 'magic' && log.actorId) {
      const actorRole = roleById.get(log.actorId)
      if (actorRole === 'mage') {
        mpUsed.set(log.actorId, (mpUsed.get(log.actorId) ?? 0) + 5)
      }
    }

    if (log.statusApplied && log.targetIds) {
      for (const target of log.targetIds) {
        if (partyIdSet.has(target)) {
          const set = statusesByUnit.get(target) ?? new Set<string>()
          for (const s of log.statusApplied) set.add(s)
          statusesByUnit.set(target, set)
        }
      }
    }
    if (
      log.actionType === 'incapacitate' &&
      log.targetIds?.[0] &&
      partyIdSet.has(log.targetIds[0])
    ) {
      statusesByUnit.delete(log.targetIds[0])
    }
  }

  for (const a of party) {
    if (a.role === 'healer') {
      metrics.healerCount += 1
      metrics.healerMaxMp += a.maxMp
      metrics.healerMpUsed += mpUsed.get(a.id) ?? 0
    }
  }
}

function finalizeSpecific(m: SpecificMetrics, trials: number): SpecificMetrics {
  const t = trials || 1
  const finalizeMap = (map: Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(map)) out[k] = v / t
    return out
  }
  return {
    ...m,
    contactSuccesses: m.contactSuccesses / t,
    firstStrikes: m.firstStrikes / t,
    initialDamage: m.initialDamage / t,
    weaknessDiscoveries: m.weaknessDiscoveries / t,
    featureDamage: m.featureDamage / t,
    featureDefeatRounds:
      m.featureDefeatCount > 0
        ? m.featureDefeatRounds / m.featureDefeatCount
        : 0,
    controllerDefeatRounds:
      m.controllerDefeatCount > 0
        ? m.controllerDefeatRounds / m.controllerDefeatCount
        : 0,
    actualDamagePrevented: m.actualDamagePrevented / t,
    actualDamagePreventedByGuardian: m.actualDamagePreventedByGuardian / t,
    actualDamagePreventedBySupport: m.actualDamagePreventedBySupport / t,
    preventedIncapacitations: m.preventedIncapacitations / t,
    preventedIncapacitationsByGuardian:
      m.preventedIncapacitationsByGuardian / t,
    redirectedAttackCount: 0,
    healerMpSavedEstimate: 0,
    guardTargetRoleCounts: finalizeMap(m.guardTargetRoleCounts),
    guardTargetRoleCountsByGuardian: finalizeMap(
      m.guardTargetRoleCountsByGuardian,
    ),
    guardTargetRoleCountsBySupport: finalizeMap(
      m.guardTargetRoleCountsBySupport,
    ),
    moraleGained: m.moraleGained / t,
    leaderTargetFollowCount: m.leaderTargetFollowCount / t,
    focusFireContribution: m.focusFireContribution / t,
    healAmount: m.healAmount / t,
    statusCured: m.statusCured / t,
    healerMpUsed: m.healerMpUsed / t,
    healerMaxMp: m.healerMaxMp / t,
    healerCount: m.healerCount / t,
  }
}

function generateConditionEncounter(
  conditionKey: ConditionKey,
  seed: string,
  party: Adventurer[],
): Enemy[] {
  const partyThreat = calculatePartyThreat(party)
  const count = 4
  const mult = actionEconomyMultiplier(count, party.length)
  const slotTarget =
    (partyThreat * DIFFICULTY_BUDGET_MULTIPLIER[CONFIG.difficulty]) /
    count /
    mult

  const enemies: Enemy[] = []
  for (let i = 0; i < count; i++) {
    const cfg = i === 0 ? CONDITION_CONFIG[conditionKey] : FILLER_CONFIG
    const slotSeed = `${seed}-enc-${conditionKey}-${i}`
    const baseThreat =
      ENEMY_BASE_THREAT[cfg.rank] * TIER_THREAT_MULTIPLIER[cfg.tier]
    const abilityThreat = calculateAbilityThreat(cfg.abilities)
    const threatScale = (slotTarget - abilityThreat) / baseThreat
    const enemy = generateEnemy(slotSeed, {
      rank: cfg.rank,
      species: cfg.species,
      archetype: cfg.archetype,
      tier: cfg.tier,
      abilities: cfg.abilities,
      threatScale,
    })
    if (cfg.postProcess) cfg.postProcess(enemy)
    enemies.push(enemy)
  }
  return enemies
}

function buildSlotAdventurer(seed: string, role: AdventurerRole): Adventurer {
  return generateAdventurer({ seed, rank: CONFIG.rank, role })
}

function buildPairedParties(
  name: string,
  trial: number,
  baseRoles: AdventurerRole[],
  variantRoles: AdventurerRole[],
  conditionKey: ConditionKey,
): { baseParty: Adventurer[]; variantParty: Adventurer[] } {
  const baseParty: Adventurer[] = []
  const variantParty: Adventurer[] = []
  const maxSlots = Math.max(baseRoles.length, variantRoles.length)
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
    const slotSeed = `${CONFIG.baseSeed}-${name}-${conditionKey}-${trial}-slot-${slotIndex}`
    const baseRole = baseRoles[slotIndex]
    const variantRole = variantRoles[slotIndex]

    if (baseRole && variantRole && baseRole === variantRole) {
      const member = buildSlotAdventurer(slotSeed, baseRole)
      baseParty.push(member)
      variantParty.push(structuredClone(member))
      continue
    }

    if (baseRole) baseParty.push(buildSlotAdventurer(slotSeed, baseRole))
    if (variantRole)
      variantParty.push(buildSlotAdventurer(slotSeed, variantRole))
  }
  return { baseParty, variantParty }
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
) {
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

interface SuitabilityMetrics {
  combatOutcomeDelta: number
  contactSuccessDelta: number
  informationGainDelta: number
  injuryReductionDelta: number
  retreatReductionDelta: number
  objectiveUtilityDelta: number
}

interface ExperimentResult {
  role: string
  replacement: string
  condition: ConditionKey
  baseOverall: OverallResult
  variantOverall: OverallResult
  baseSpecific: SpecificMetrics
  variantSpecific: SpecificMetrics
  summary: ReturnType<typeof summarizePaired>
  suitability: SuitabilityMetrics
}

function runExperiment(
  role: string,
  replacement: {
    name: string
    base: AdventurerRole[]
    variant: AdventurerRole[]
  },
  condition: ConditionKey,
  trials: number,
): ExperimentResult {
  const baseOverall = emptyOverall()
  const variantOverall = emptyOverall()
  const baseSpecific = emptySpecificMetrics()
  const variantSpecific = emptySpecificMetrics()
  const pairs: { baseFav: boolean; variantFav: boolean }[] = []

  for (let i = 0; i < trials; i++) {
    const { baseParty, variantParty } = buildPairedParties(
      `${role}-${replacement.name}`,
      i,
      replacement.base,
      replacement.variant,
      condition,
    )
    const battleSeed = `${CONFIG.baseSeed}-${role}-${replacement.name}-${condition}-${i}-battle`
    const encSeed = `${CONFIG.baseSeed}-${role}-${replacement.name}-${condition}-${i}-enc`
    const enemies = generateConditionEncounter(condition, encSeed, baseParty)

    const baseResult = runBattle(battleSeed, baseParty, enemies)
    const variantResult = runBattle(battleSeed, variantParty, enemies)

    analyzeBattle(
      baseResult,
      baseParty,
      enemies,
      condition,
      baseSpecific,
      baseOverall,
    )
    analyzeBattle(
      variantResult,
      variantParty,
      enemies,
      condition,
      variantSpecific,
      variantOverall,
    )

    pairs.push({
      baseFav: isFavorable(baseResult.outcome),
      variantFav: isFavorable(variantResult.outcome),
    })
  }

  const baseO = finalizeOverall(baseOverall)
  const variantO = finalizeOverall(variantOverall)
  const baseS = finalizeSpecific(baseSpecific, trials)
  const variantS = finalizeSpecific(variantSpecific, trials)
  const summary = summarizePaired(
    pairs,
    `${CONFIG.baseSeed}-${role}-${replacement.name}-${condition}-bootstrap`,
  )

  const suitability: SuitabilityMetrics = {
    combatOutcomeDelta: summary.diff,
    contactSuccessDelta: variantS.contactSuccesses - baseS.contactSuccesses,
    informationGainDelta:
      variantS.weaknessDiscoveries - baseS.weaknessDiscoveries,
    injuryReductionDelta: baseO.avgInjuries - variantO.avgInjuries,
    retreatReductionDelta: baseO.retreats / trials - variantO.retreats / trials,
    objectiveUtilityDelta: 0,
  }

  return {
    role,
    replacement: replacement.name,
    condition,
    baseOverall: baseO,
    variantOverall: variantO,
    baseSpecific: baseS,
    variantSpecific: variantS,
    summary,
    suitability,
  }
}

function selfVerification(): { ok: boolean; mismatches: number } {
  const pairs: { baseFav: boolean; variantFav: boolean }[] = []
  const standard: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']
  let mismatches = 0
  for (let i = 0; i < 1000; i++) {
    const { baseParty, variantParty } = buildPairedParties(
      'self',
      i,
      standard,
      standard,
      'flying',
    )
    const battleSeed = `${CONFIG.baseSeed}-self-${i}-battle`
    const encSeed = `${CONFIG.baseSeed}-self-${i}-enc`
    const enemies = generateConditionEncounter('flying', encSeed, baseParty)
    const baseResult = runBattle(battleSeed, baseParty, enemies)
    const variantResult = runBattle(battleSeed, variantParty, enemies)
    if (baseResult.outcome !== variantResult.outcome) mismatches++
    pairs.push({
      baseFav: isFavorable(baseResult.outcome),
      variantFav: isFavorable(variantResult.outcome),
    })
  }
  return { ok: mismatches === 0, mismatches }
}

function fmt(n: number): string {
  return n.toFixed(3)
}

function formatGuardTargetCounts(map: Record<string, number>): string {
  const entries = Object.entries(map)
  if (entries.length === 0) return '0'
  return entries.map(([k, v]) => `${k}:${v.toFixed(3)}`).join(', ')
}

function roleSpecificColumns(role: string): string[] {
  switch (role) {
    case 'ranger':
      return [
        'featureDamageDelta',
        'featureDefeatRoundDelta',
        'contactSuccessDelta',
        'rearSurvivalDelta',
        'favorableRateDelta',
      ]
    case 'scout':
      return [
        'contactSuccessDelta',
        'firstStrikeDelta',
        'initialDamageDelta',
        'weaknessDiscoveryDelta',
        'controllerDefeatRoundDelta',
        'favorableRateDelta',
      ]
    case 'guardian':
      return [
        'actualDamagePrevented',
        'preventedIncapacitations',
        'redirectedAttackCount',
        'healerMpSavedEstimate',
        'guardTargetRoleCounts',
        'favorableRateDelta',
      ]
    case 'support':
      return [
        'moraleGained',
        'moraleLossPrevented',
        'retreatProposalPrevented',
        'retreatChanceReduction',
        'leaderTargetFollowCount',
        'focusFireContribution',
        'initiativeContribution',
        'favorableRateDelta',
      ]
    case 'healer':
      return [
        'healAmount',
        'statusCured',
        'preventedIncap',
        'preventedRetreat',
        'mpDepletionRate',
        'avgFinalMp',
        'favorableRateDelta',
      ]
    default:
      return ['favorableRateDelta']
  }
}

function roleSpecificMetrics(exp: ExperimentResult): SpecificMetrics {
  // In the current experiment design, the role being evaluated is present in
  // base for healer/support/guardian, and in variant for ranger/scout.
  return ['healer', 'support', 'guardian'].includes(exp.role)
    ? exp.baseSpecific
    : exp.variantSpecific
}

function specificValue(exp: ExperimentResult, key: string): string {
  const { role, baseSpecific: base, variantSpecific: variant } = exp
  const roleM = roleSpecificMetrics(exp)

  const d = (k: keyof SpecificMetrics): number => {
    const a = variant[k] as number
    const b = base[k] as number
    return a - b
  }
  const baseRetreatRate = exp.baseOverall.retreats / CONFIG.trials
  const variantRetreatRate = exp.variantOverall.retreats / CONFIG.trials

  // delta metrics: variant vs base (positive = variant side better for that metric)
  if (key === 'featureDamageDelta') return fmt(d('featureDamage'))
  if (key === 'featureDefeatRoundDelta') {
    const a = variant.featureDefeatCount > 0 ? variant.featureDefeatRounds : 0
    const c = base.featureDefeatCount > 0 ? base.featureDefeatRounds : 0
    return fmt(a - c)
  }
  if (key === 'contactSuccessDelta') return fmt(d('contactSuccesses'))
  if (key === 'rearSurvivalDelta') {
    const a =
      variant.featureDefeatCount > 0 ? variant.featureDefeatRounds : MAX_ROUNDS
    const c =
      base.featureDefeatCount > 0 ? base.featureDefeatRounds : MAX_ROUNDS
    return fmt(a - c)
  }
  if (key === 'firstStrikeDelta') return fmt(d('firstStrikes'))
  if (key === 'initialDamageDelta') return fmt(d('initialDamage'))
  if (key === 'weaknessDiscoveryDelta') return fmt(d('weaknessDiscoveries'))
  if (key === 'controllerDefeatRoundDelta') {
    const a =
      variant.controllerDefeatCount > 0 ? variant.controllerDefeatRounds : 0
    const c = base.controllerDefeatCount > 0 ? base.controllerDefeatRounds : 0
    return fmt(a - c)
  }
  if (key === 'retreatChanceReduction') {
    return fmt(baseRetreatRate - variantRetreatRate)
  }
  if (key === 'favorableRateDelta') return fmt(exp.summary.diff)

  // absolute metrics from the side that actually contains the evaluated role
  if (key === 'actualDamagePrevented') {
    const byRole =
      role === 'guardian'
        ? roleM.actualDamagePreventedByGuardian
        : role === 'support'
          ? roleM.actualDamagePreventedBySupport
          : roleM.actualDamagePrevented
    return fmt(byRole)
  }
  if (key === 'preventedIncapacitations') {
    const byRole =
      role === 'guardian'
        ? roleM.preventedIncapacitationsByGuardian
        : roleM.preventedIncapacitations
    return fmt(byRole)
  }
  if (key === 'redirectedAttackCount') return '0 (未実装)'
  if (key === 'healerMpSavedEstimate') return '0 (未実装)'
  if (key === 'guardTargetRoleCounts') {
    const map =
      role === 'guardian'
        ? roleM.guardTargetRoleCountsByGuardian
        : role === 'support'
          ? roleM.guardTargetRoleCountsBySupport
          : roleM.guardTargetRoleCounts
    return formatGuardTargetCounts(map) || '0'
  }
  if (key === 'moraleGained') return fmt(roleM.moraleGained)
  if (key === 'moraleLossPrevented') return '0 (未実装)'
  if (key === 'retreatProposalPrevented') return '0 (未実装)'
  if (key === 'leaderTargetFollowCount')
    return fmt(roleM.leaderTargetFollowCount)
  if (key === 'focusFireContribution') return fmt(roleM.focusFireContribution)
  if (key === 'initiativeContribution') return '0 (未実装)'
  if (key === 'healAmount') return fmt(roleM.healAmount)
  if (key === 'statusCured') return fmt(roleM.statusCured)
  if (key === 'preventedIncap') return '0 (未実装)'
  if (key === 'preventedRetreat') return '0 (未実装)'
  if (key === 'mpDepletionRate') {
    const max = roleM.healerMaxMp
    const used = roleM.healerMpUsed
    return max > 0 ? fmt(used / max) : '-'
  }
  if (key === 'avgFinalMp') {
    const count = roleM.healerCount
    const max = roleM.healerMaxMp
    const used = roleM.healerMpUsed
    return count > 0 ? fmt((max - used) / count) : '-'
  }
  return '-'
}

function generateReport(results: ExperimentResult[]): string {
  const lines: string[] = []
  lines.push('# Phase 2.2 条件別役割適性計測レポート')
  lines.push('')
  lines.push(`- 等級: ${CONFIG.rank}`)
  lines.push(`- 難易度: ${CONFIG.difficulty}`)
  lines.push(`- 各実験試行数: ${CONFIG.trials}`)
  lines.push(`- シード: ${CONFIG.baseSeed}`)
  lines.push('')

  lines.push('## 1. 自己検証')
  const self = selfVerification()
  if (!self.ok) {
    lines.push(`自己検証に失敗しました。不一致数: ${self.mismatches}`)
    return lines.join('\n')
  }
  lines.push(`OK: 同一編成を base/variant へ 1000 試行、不一致 0。`)
  lines.push('')

  lines.push('## 2. 現行モデルの空白（未実装機能）')
  lines.push('')
  const blanks = [
    '冒険者側の状態異常付与',
    '敵行動妨害',
    'supportによる命中支援',
    'supportによる集中攻撃',
    'supportによる行動順操作',
    'scoutによる罠回避',
    'scoutによる敵数事前把握',
    'rangerによる飛行阻害',
    'guardianによる攻撃肩代わり',
    '実際の防護ダメージ軽減量',
  ]
  for (const b of blanks) lines.push(`- ${b}: 0 として記録`)
  lines.push('')
  lines.push(
    'これらは Phase 2.2 では未実装として扱い、バランス評価には使用していません。',
  )
  lines.push('')

  const roleResults = new Map<string, ExperimentResult[]>()
  for (const r of results) {
    const arr = roleResults.get(r.role) ?? []
    arr.push(r)
    roleResults.set(r.role, arr)
  }

  for (const { role, replacements, focusConditions } of ROLE_EXPERIMENTS) {
    lines.push(
      `## 3.${role.charAt(0).toUpperCase() + role.slice(1)}. ${role.toUpperCase()} の条件別適性`,
    )
    lines.push('')
    const roleRes = roleResults.get(role) ?? []

    const headerCols = [
      '条件',
      '置換',
      'base有利率',
      'variant有利率',
      '差分',
      '95%CI',
    ]
    const specificCols = roleSpecificColumns(role)
    lines.push(`| ${headerCols.concat(specificCols).join(' | ')} |`)
    lines.push(
      `| ${headerCols
        .concat(specificCols)
        .map(() => '---')
        .join(' | ')} |`,
    )

    for (const condition of focusConditions) {
      for (const replacement of replacements) {
        const exp = roleRes.find(
          (r) =>
            r.condition === condition && r.replacement === replacement.name,
        )
        if (!exp) continue
        const s = exp.summary
        const cells = [
          getFocusConditionName(condition),
          replacement.name,
          fmt(s.baseRate),
          fmt(s.variantRate),
          fmt(s.diff),
          `${s.ci.lower.toFixed(3)} ~ ${s.ci.upper.toFixed(3)}`,
        ]
        for (const col of specificCols) {
          if (col === 'favorableRateDelta') {
            cells.push(fmt(s.diff))
          } else {
            cells.push(specificValue(exp, col))
          }
        }
        lines.push(`| ${cells.join(' | ')} |`)
      }
    }
    lines.push('')

    lines.push(`### ${role.toUpperCase()} RoleSuitabilityMetrics`)
    lines.push('')
    lines.push(
      '| 条件 | 置換 | combatOutcomeDelta | contactSuccessDelta | informationGainDelta | injuryReductionDelta | retreatReductionDelta | objectiveUtilityDelta |',
    )
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const condition of focusConditions) {
      for (const replacement of replacements) {
        const exp = roleRes.find(
          (r) =>
            r.condition === condition && r.replacement === replacement.name,
        )
        if (!exp) continue
        const m = exp.suitability
        lines.push(
          `| ${getFocusConditionName(condition)} | ${replacement.name} | ${fmt(
            m.combatOutcomeDelta,
          )} | ${fmt(m.contactSuccessDelta)} | ${fmt(
            m.informationGainDelta,
          )} | ${fmt(m.injuryReductionDelta)} | ${fmt(
            m.retreatReductionDelta,
          )} | ${fmt(m.objectiveUtilityDelta)} |`,
        )
      }
    }
    lines.push('')

    if (role === 'guardian') {
      lines.push('**Guardian 追加ログ指標（variant 平均）**')
      lines.push('')
      lines.push(
        '| 条件 | actualDamagePrevented | redirectedAttackCount | preventedIncapacitation | healerMpSavedEstimate | guardTargetRoleCounts |',
      )
      lines.push('| --- | --- | --- | --- | --- | --- |')
      for (const condition of focusConditions) {
        const exp = roleRes.find(
          (r) =>
            r.condition === condition && r.replacement === replacements[0].name,
        )
        if (!exp) continue
        const v = exp.variantSpecific
        lines.push(
          `| ${getFocusConditionName(condition)} | ${fmt(
            v.actualDamagePreventedByGuardian,
          )} | 0 (未実装) | ${fmt(
            v.preventedIncapacitationsByGuardian,
          )} | 0 (未実装) | ${formatGuardTargetCounts(
            v.guardTargetRoleCountsByGuardian,
          )} |`,
        )
      }
      lines.push('')
    }

    if (role === 'support') {
      lines.push('**Support 追加ログ指標（variant 平均）**')
      lines.push('')
      lines.push(
        '| 条件 | moraleLossPrevented | retreatProposalPrevented | retreatChanceReduction | leaderTargetFollowCount | focusFireContribution | initiativeContribution |',
      )
      lines.push('| --- | --- | --- | --- | --- | --- | --- |')
      for (const condition of focusConditions) {
        const exp = roleRes.find(
          (r) =>
            r.condition === condition && r.replacement === replacements[0].name,
        )
        if (!exp) continue
        const v = exp.variantSpecific
        const baseRate = exp.baseOverall.retreats / CONFIG.trials
        const variantRate = exp.variantOverall.retreats / CONFIG.trials
        lines.push(
          `| ${getFocusConditionName(condition)} | 0 (未実装) | 0 (未実装) | ${fmt(
            baseRate - variantRate,
          )} | ${fmt(v.leaderTargetFollowCount)} | ${fmt(
            v.focusFireContribution,
          )} | 0 (未実装) |`,
        )
      }
      lines.push('')
    }
  }

  lines.push('## 4. ロール分類')
  lines.push('')
  lines.push('| ロール | 分類 | 根拠 |')
  lines.push('| --- | --- | --- |')
  for (const { role } of ROLE_EXPERIMENTS) {
    const roleRes = roleResults.get(role) ?? []
    // Use all experiments for this role, not just the primary replacement.
    // diff = variantFav - baseFav; negative means the party WITH the role wins more.
    const threshold = 0.02
    const beneficial = roleRes.filter((r) => r.summary.diff < -threshold).length
    const harmful = roleRes.filter((r) => r.summary.diff > threshold).length
    const total = roleRes.length
    const classification =
      total === 0
        ? 'D. 本来の役割を表す機能が未実装'
        : beneficial >= Math.ceil(total / 2)
          ? 'A. 現行機能で有効'
          : beneficial > 0 && harmful <= beneficial
            ? 'B. 特定条件でのみ有効'
            : harmful > 0 &&
                beneficial > 0 &&
                Math.abs(harmful - beneficial) <= 1
              ? 'E. 他ロールと役割が重複'
              : harmful > 0
                ? 'C. 機能は動作しているが効果不足'
                : 'D. 本来の役割を表す機能が未実装'
    lines.push(
      `| ${role} | ${classification} | 全置換の有利条件 ${beneficial}/${total}（有害 ${harmful}） |`,
    )
  }
  lines.push('')

  lines.push('## 5. 変更禁止事項')
  lines.push('')
  lines.push('本フェーズでは以下を変更していません。')
  lines.push('- ロール能力値・技能値・AI')
  lines.push('- 武器威力・防具・回復量')
  lines.push('- 撤退ロジック')
  lines.push('- 敵生成・脅威点・難易度倍率')
  lines.push('')

  return lines.join('\n')
}

function main(): void {
  const results: ExperimentResult[] = []
  const totalExperiments = ROLE_EXPERIMENTS.reduce(
    (sum, r) => sum + r.replacements.length * r.focusConditions.length,
    0,
  )
  let completed = 0

  for (const { role, replacements, focusConditions } of ROLE_EXPERIMENTS) {
    for (const replacement of replacements) {
      for (const condition of focusConditions) {
        console.error(
          `[${++completed}/${totalExperiments}] ${role} / ${replacement.name} / ${condition}`,
        )
        results.push(runExperiment(role, replacement, condition, CONFIG.trials))
      }
    }
  }

  const report = generateReport(results)
  const reportPath = path.resolve(process.cwd(), 'PHASE2_2_REPORT.md')
  fs.writeFileSync(reportPath, report)
  console.log(`Report written to ${reportPath}`)
}

main()
