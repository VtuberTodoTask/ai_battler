import { ADVENTURER_THREAT } from '../balance/constants.ts'
import { Adventurer, BattleResult } from '../models/types.ts'
import {
  BattleIntel,
  EnvironmentEffect,
  ExpeditionBattleExecutionResult,
  ExpeditionBattleRecord,
  ExpeditionRequest,
  ExpeditionState,
} from './types.ts'
import { addLog, logEntry } from './logs.ts'
import {
  applyKnownEnemyWeaknesses,
  matchKnownEnemyAbilities,
} from './information.ts'
import { convertBattleInjuries } from './injuries.ts'
import { deepClone } from '../util.ts'
import { generateEncounter } from '../generators/encounterGenerator.ts'
import { getActiveParty } from './state.ts'
import { runBattle } from '../battle/battle.ts'

export function buildBattleParty(
  party: Adventurer[],
  state: ExpeditionState,
): Adventurer[] {
  return getActiveParty(party, state).map((member) => {
    const cloned = deepClone(member)
    cloned.currentHp = state.partyHp[member.id]
    cloned.currentMp = state.partyMp[member.id]
    cloned.morale = state.partyMorale[member.id]
    cloned.statusEffects = deepClone(state.partyStatusEffects[member.id] ?? [])
    return cloned
  })
}

export function environmentEffectsToBattleContext(
  effects: EnvironmentEffect[],
): {
  lighting: 'dark' | 'bright' | 'normal'
  noise: number
  water: boolean
  smoke: boolean
} {
  const context = {
    lighting: 'normal' as 'dark' | 'bright' | 'normal',
    noise: 0,
    water: false,
    smoke: false,
  }
  for (const effect of effects) {
    if (
      effect.type === 'lighting' &&
      (effect.value === 'dark' ||
        effect.value === 'bright' ||
        effect.value === 'normal')
    ) {
      context.lighting = effect.value as 'dark' | 'bright' | 'normal'
    } else if (effect.type === 'noise' && typeof effect.value === 'number') {
      context.noise += effect.value
    } else if (effect.type === 'water' && effect.value === true) {
      context.water = true
    } else if (effect.type === 'smoke' && effect.value === true) {
      context.smoke = true
    }
  }
  return context
}

export function applyBattleResultToExpedition(
  state: ExpeditionState,
  result: BattleResult,
  request: ExpeditionRequest,
  battleId: string,
  encounterSeed: string,
  combatSeed: string,
  knownEnemyWeaknesses: BattleIntel[],
  knownEnemyAbilities: BattleIntel[],
  matchedWeaknessIntel: BattleIntel[],
  unmatchedWeaknessIntel: BattleIntel[],
  matchedAbilityIntel: BattleIntel[],
  unmatchedAbilityIntel: BattleIntel[],
): ExpeditionBattleRecord {
  state.battleOutcome = result.outcome

  state.incapacitated = result.finalAdventurerStates
    .filter((member) => member.incapacitated && !member.dead)
    .map((member) => member.id)

  for (const final of result.finalAdventurerStates) {
    state.partyHp[final.id] = final.currentHp
    state.partyMp[final.id] = final.currentMp
    state.partyMorale[final.id] = final.morale
    state.partyStatusEffects[final.id] = deepClone(final.statusEffects)

    if (final.dead && !state.casualties.includes(final.id)) {
      state.casualties.push(final.id)
    }
  }

  const expeditionInjuries = convertBattleInjuries(result, battleId, state)
  state.injuries.push(...expeditionInjuries)

  const enemySpeciesCount = new Map<string, number>()
  for (const id of result.survivingEnemies.concat(result.defeatedEnemies)) {
    const species = id.split('-')[1] ?? id
    enemySpeciesCount.set(species, (enemySpeciesCount.get(species) ?? 0) + 1)
  }

  const record: ExpeditionBattleRecord = {
    id: battleId,
    phase: 'battle',
    trigger: request.battle?.triggerPhase ?? 'afterExploration',
    encounterSeed,
    combatSeed,
    entrySnapshot: state.battleEntrySnapshot!,
    enemyIds: result.survivingEnemies.concat(result.defeatedEnemies),
    enemyComposition: Array.from(enemySpeciesCount.entries())
      .map(([s, c]) => `${s}x${c}`)
      .join(', '),
    outcome: result.outcome,
    rounds: result.rounds,
    survivingAdventurerIds: result.survivingAdventurers,
    incapacitatedAdventurerIds: result.incapacitatedAdventurers,
    deadAdventurerIds: result.deadAdventurers,
    knownEnemyWeaknesses,
    knownEnemyAbilities,
    matchedWeaknessIntel,
    unmatchedWeaknessIntel,
    matchedAbilityIntel,
    unmatchedAbilityIntel,
    discoveredWeaknesses: result.discoveredWeaknesses,
    injuries: expeditionInjuries,
    result,
  }
  state.battles.push(record)

  const facts: string[] = [
    `戦闘が${result.rounds}ラウンドで${result.outcome}となった`,
  ]
  if (result.contactResult.type) {
    facts.push(`接敵結果: ${result.contactResult.type}`)
  }
  if (result.deadAdventurers.length > 0) {
    facts.push(`戦闘で死亡者: ${result.deadAdventurers.join(', ')}`)
  }
  if (expeditionInjuries.length > 0) {
    facts.push(
      `戦闘負傷者: ${expeditionInjuries.map((i) => i.adventurerId).join(', ')}`,
    )
  }
  if (result.discoveredWeaknesses.length > 0) {
    facts.push(`戦闘中に弱点を発見: ${result.discoveredWeaknesses.join(', ')}`)
  }
  if (knownEnemyAbilities.length > 0) {
    facts.push(
      `戦闘前に得ていた能力情報: ${knownEnemyAbilities.map((i) => i.name).join(', ')}`,
    )
  }
  if (matchedAbilityIntel.length > 0) {
    facts.push(
      `敵編成と一致した能力情報: ${matchedAbilityIntel.map((i) => i.name).join(', ')}`,
    )
  }
  if (unmatchedAbilityIntel.length > 0) {
    facts.push(
      `今回の敵編成では確認できなかった能力情報: ${unmatchedAbilityIntel.map((i) => i.name).join(', ')}`,
    )
  }
  if (matchedWeaknessIntel.length > 0) {
    facts.push(
      `敵編成と一致した弱点情報: ${matchedWeaknessIntel.map((i) => i.name).join(', ')}`,
    )
  }
  if (unmatchedWeaknessIntel.length > 0) {
    facts.push(
      `今回の敵編成では確認できなかった弱点情報: ${unmatchedWeaknessIntel.map((i) => i.name).join(', ')}`,
    )
  }
  addLog(
    state,
    logEntry('battle', 'battleSummary', [], facts, [], undefined, [
      ...result.deadAdventurers,
      ...expeditionInjuries.map((i) => i.adventurerId),
    ]),
  )

  return record
}

export function runExpeditionBattle(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
): ExpeditionBattleExecutionResult {
  const entry = state.battleEntrySnapshot!
  const battleId = `battle-${state.battles.length}`
  const config = request.battle
  const partySize = config?.recommendedPartySize ?? 4
  const requestPartyThreat = ADVENTURER_THREAT[request.rank] * partySize

  const battleSeedBase = config?.seed ?? `${request.seed}:battle:0`
  const encounterSeed = `${battleSeedBase}:encounter`
  const combatSeed = `${battleSeedBase}:combat`

  const enemies = generateEncounter({
    seed: encounterSeed,
    planSeed: encounterSeed,
    difficulty: request.difficulty,
    partyThreat: requestPartyThreat,
    partySize,
    shape: config?.shape,
    allowedSpecies: config?.allowedSpecies,
    bossAllowed: config?.bossAllowed,
  })
  const initialEnemyIds = enemies.map((enemy) => enemy.id)

  const { matched: matchedWeaknessIntel, unmatched: unmatchedWeaknessIntel } =
    applyKnownEnemyWeaknesses(
      enemies,
      entry.knownEnemyWeaknesses,
      state,
      battleId,
    )

  const { matched: matchedAbilityIntel, unmatched: unmatchedAbilityIntel } =
    matchKnownEnemyAbilities(
      enemies,
      entry.knownEnemyAbilities,
      state,
      battleId,
    )

  const battleParty = buildBattleParty(party, state)
  const context = environmentEffectsToBattleContext(entry.environmentEffects)
  const forcedContactType =
    entry.surprise === 'partyAdvantage'
      ? 'success'
      : entry.surprise === 'enemyAdvantage'
        ? 'failure'
        : undefined

  const result = runBattle(combatSeed, battleParty, enemies, {
    context,
    forcedContactType,
  })

  state.currentPhase = 'battle'
  const record = applyBattleResultToExpedition(
    state,
    result,
    request,
    battleId,
    encounterSeed,
    combatSeed,
    entry.knownEnemyWeaknesses,
    entry.knownEnemyAbilities,
    matchedWeaknessIntel,
    unmatchedWeaknessIntel,
    matchedAbilityIntel,
    unmatchedAbilityIntel,
  )

  return {
    battleId,
    battleResult: result,
    battleRecord: record,
    initialEnemyIds,
  }
}
