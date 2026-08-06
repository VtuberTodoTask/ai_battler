import {
  Adventurer,
  AdventurerRole,
  Enemy,
  SkillName,
} from '../models/types.ts'
import {
  BattleEntryConditions,
  BattleIntel,
  CheckResult,
  DiscoveredInformation,
  EnvironmentEffect,
  ExpeditionFeature,
  ExpeditionPhase,
  ExpeditionRequest,
  ExpeditionState,
  HiddenInformation,
  InformationDiscoveryAttempt,
} from './types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { addLog, logEntry } from './logs.ts'
import { deepClone } from '../util.ts'
import { hasFeature } from './state.ts'
import { primaryRoleForSkill, resolveSkillCheck } from './checks.ts'

export function requestFeaturesFromState(
  state: ExpeditionState,
): ExpeditionFeature[] {
  return (
    (state.metadata?.requestFeatures as ExpeditionFeature[] | undefined) ?? []
  )
}

export function genericFact(
  rng: SeededRng,
  source: string,
): DiscoveredInformation {
  const facts = [
    '周辺の地形を把握した',
    '敵の痕跡を発見した',
    '安全な休憩地点を見つけた',
    '古い碑文を読み取った',
    '魔力の流れを確認した',
    '獣道を発見した',
  ]
  return {
    id: `generic-${rng.integer(1, 999999)}`,
    name: rng.pick(facts),
    description: '',
    source,
    completeness: 'complete',
  }
}

export function getExistingInfo(
  state: ExpeditionState,
  id: string,
): DiscoveredInformation | undefined {
  return state.information.find((i) => i.id === id)
}

export function attemptInformationDiscovery(
  rng: SeededRng,
  party: Adventurer[],
  state: ExpeditionState,
  phase: ExpeditionPhase,
  defaultSkill: SkillName,
  hidden: HiddenInformation[],
  rankPenalty: number,
): {
  result: CheckResult
  primary: Adventurer
  assistants: Adventurer[]
  effectiveValue: number
  roll: number
  discovered?: DiscoveredInformation
  attempt: InformationDiscoveryAttempt
} {
  const candidates = hidden.filter((h) => {
    const existing = getExistingInfo(state, h.id)
    return !existing || existing.completeness === 'fragment'
  })

  if (candidates.length === 0) {
    const skill = defaultSkill
    const preferredRole = primaryRoleForSkill(skill) as AdventurerRole
    const difficulty = 10 + rankPenalty
    const { result, primary, assistants, effectiveValue, roll } =
      resolveSkillCheck(
        rng,
        party,
        state,
        phase,
        skill,
        preferredRole,
        difficulty,
        rankPenalty,
      )
    const discovered =
      result === 'criticalSuccess' || result === 'success'
        ? genericFact(rng, skill)
        : undefined
    if (discovered) {
      state.information.push(discovered)
      state.objectiveProgress += result === 'criticalSuccess' ? 10 : 5
    }
    return {
      result,
      primary,
      assistants,
      effectiveValue,
      roll,
      discovered,
      attempt: {
        informationId: discovered?.id ?? 'generic',
        requiredSkill: skill,
        difficulty,
        result,
      },
    }
  }

  const picked = rng.pick(candidates)
  const skill = picked.requiredSkill ?? defaultSkill
  const preferredRole = primaryRoleForSkill(skill) as AdventurerRole
  const difficulty = picked.difficulty + rankPenalty
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      phase,
      skill,
      preferredRole,
      difficulty,
      rankPenalty,
    )

  const existing = getExistingInfo(state, picked.id)
  let discovered: DiscoveredInformation | undefined

  if (result === 'criticalSuccess' || result === 'success') {
    if (existing && existing.completeness === 'fragment') {
      existing.completeness = 'complete'
      existing.name = existing.name.replace('（断片）', '')
      existing.description = picked.description
      state.objectiveProgress += 10
      discovered = existing
    } else if (!existing) {
      discovered = {
        id: picked.id,
        name: picked.name,
        description: picked.description,
        source: skill,
        completeness: 'complete',
        battleIntel: picked.battleIntel,
      }
      state.information.push(discovered)
      state.objectiveProgress += result === 'criticalSuccess' ? 20 : 15
    }
  } else if (result === 'partialSuccess') {
    if (!existing) {
      discovered = {
        id: picked.id,
        name: `${picked.name}（断片）`,
        description: picked.description,
        source: skill,
        completeness: 'fragment',
        battleIntel: picked.battleIntel,
      }
      state.information.push(discovered)
      state.objectiveProgress += 5
    }
  }

  return {
    result,
    primary,
    assistants,
    effectiveValue,
    roll,
    discovered,
    attempt: {
      informationId: picked.id,
      requiredSkill: skill,
      difficulty,
      result,
    },
  }
}

export function buildBattleEntrySnapshot(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
): BattleEntryConditions {
  const envEffects: EnvironmentEffect[] = []
  if (hasFeature(request.features, 'poorVisibility')) {
    envEffects.push({ type: 'lighting', value: 'dark' })
  }
  if (hasFeature(request.features, 'unstableTerrain')) {
    envEffects.push({ type: 'terrain', value: 'unstable' })
  }
  if (hasFeature(request.features, 'flyingEnemies')) {
    envEffects.push({ type: 'visibility', value: 'flying' })
  }

  const knownEnemyWeaknesses: BattleIntel[] = []
  const knownEnemyAbilities: BattleIntel[] = []
  for (const info of state.information) {
    if (info.completeness === 'complete' && info.battleIntel !== undefined) {
      if (info.battleIntel.kind === 'weakness') {
        knownEnemyWeaknesses.push(info.battleIntel)
      } else if (info.battleIntel.kind === 'ability') {
        knownEnemyAbilities.push(info.battleIntel)
      }
    }
  }

  const unresolvedThreats = state.discoveredThreats.filter(
    (feature) => !state.avoidedThreats.includes(feature),
  ).length

  let surprise: BattleEntryConditions['surprise']
  if (
    state.avoidedThreats.length > 0 &&
    unresolvedThreats === 0 &&
    state.information.length >= 2
  ) {
    surprise = 'partyAdvantage'
  } else if (unresolvedThreats > 0) {
    surprise = 'enemyAdvantage'
  } else {
    surprise = 'neutral'
  }

  return {
    surprise,
    initialHp: deepClone(state.partyHp),
    initialMp: deepClone(state.partyMp),
    initialMorale: deepClone(state.partyMorale),
    initialStatusEffects: deepClone(state.partyStatusEffects),
    knownEnemyWeaknesses,
    knownEnemyAbilities,
    environmentEffects: envEffects,
  }
}

export function applyKnownEnemyWeaknesses(
  enemies: Enemy[],
  knownWeaknesses: BattleIntel[],
  state: ExpeditionState,
  battleId: string,
): { matched: BattleIntel[]; unmatched: BattleIntel[] } {
  const matched: BattleIntel[] = []
  const unmatched: BattleIntel[] = []

  for (const intel of knownWeaknesses) {
    let matchCount = 0
    for (const enemy of enemies) {
      if (
        intel.targetSpecies !== undefined &&
        enemy.species !== intel.targetSpecies
      ) {
        continue
      }
      for (const weakness of enemy.weaknesses) {
        if (weakness.weaknessId === intel.id || weakness.name === intel.name) {
          weakness.known = true
          matchCount++
        }
      }
    }
    if (matchCount === 0) {
      unmatched.push(intel)
      addLog(
        state,
        logEntry(
          'battle',
          'diagnostic',
          [],
          [`戦闘${battleId}: 弱点「${intel.name}」は敵編成に存在しなかった`],
        ),
      )
    } else {
      matched.push(intel)
    }
  }

  return { matched, unmatched }
}

export function matchKnownEnemyAbilities(
  enemies: Enemy[],
  knownAbilities: BattleIntel[],
  state: ExpeditionState,
  battleId: string,
): { matched: BattleIntel[]; unmatched: BattleIntel[] } {
  const matched: BattleIntel[] = []
  const unmatched: BattleIntel[] = []

  for (const intel of knownAbilities) {
    const found = enemies.some((enemy) => {
      if (
        intel.targetSpecies !== undefined &&
        enemy.species !== intel.targetSpecies
      ) {
        return false
      }

      return enemy.abilities.some(
        (ability) =>
          ability.abilityId === intel.id || ability.name === intel.name,
      )
    })

    if (found) {
      matched.push(intel)
    } else {
      unmatched.push(intel)
      addLog(
        state,
        logEntry(
          'battle',
          'diagnostic',
          [],
          [
            `戦闘${battleId}: 能力「${intel.name}」は今回遭遇した敵編成では確認できなかった`,
          ],
        ),
      )
    }
  }

  return { matched, unmatched }
}
