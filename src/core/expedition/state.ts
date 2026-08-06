import { Adventurer, StatusEffect } from '../models/types.ts'
import {
  ExpeditionEffect,
  ExpeditionFeature,
  ExpeditionObjectiveState,
  ExpeditionRequest,
  ExpeditionState,
} from './types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { addLog, logEntry } from './logs.ts'
import { clamp, deepClone } from '../util.ts'

export function hasFeature(
  features: ExpeditionFeature[],
  feature: ExpeditionFeature,
): boolean {
  return features.includes(feature)
}

export function featureLabel(feature: ExpeditionFeature): string {
  const labels: Record<ExpeditionFeature, string> = {
    traps: '罠',
    ambushRisk: '待ち伏せ',
    flyingEnemies: '飛行敵',
    poisonRisk: '毒',
    unstableTerrain: '不安定な地形',
    poorVisibility: '視界不良',
    navigationDifficulty: '難航',
    civilianPresence: '民間人の存在',
    negotiationOpportunity: '交渉機会',
    limitedSupplies: '物資制限',
    longDuration: '長期間',
    retreatDifficulty: '撤退困難',
  }
  return labels[feature] ?? feature
}

export function addDiscoveredThreat(
  state: ExpeditionState,
  feature: ExpeditionFeature,
): void {
  if (!state.discoveredThreats.includes(feature)) {
    state.discoveredThreats.push(feature)
  }
}

export function addAvoidedThreat(
  state: ExpeditionState,
  feature: ExpeditionFeature,
): void {
  addDiscoveredThreat(state, feature)
  if (!state.avoidedThreats.includes(feature)) {
    state.avoidedThreats.push(feature)
  }
}

export function initializeExpeditionState(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionState {
  const size = party.length
  const distance = Math.max(1, request.distance)
  let food = Math.ceil(distance * size * 1.5)
  let medicine = Math.max(1, size)
  let tools = Math.max(1, size)

  if (hasFeature(request.features, 'limitedSupplies')) {
    food = Math.floor(food * 0.7)
    medicine = Math.max(0, medicine - 1)
    tools = Math.max(0, tools - 1)
  }
  if (hasFeature(request.features, 'longDuration')) {
    food = Math.ceil(food * 1.5)
  }

  const partyHp: Record<string, number> = {}
  const partyMp: Record<string, number> = {}
  const partyMorale: Record<string, number> = {}
  const partyStatusEffects: Record<string, StatusEffect[]> = {}

  for (const a of party) {
    partyHp[a.id] = a.currentHp
    partyMp[a.id] = a.currentMp
    partyMorale[a.id] = a.morale
    partyStatusEffects[a.id] = deepClone(a.statusEffects)
  }

  const objectiveState: ExpeditionObjectiveState | undefined =
    request.objectiveType === 'investigation'
      ? { type: 'investigation' }
      : request.objectiveType === 'elimination' && request.elimination
        ? {
            type: 'elimination',
            mode: request.elimination.mode,
            confirmationRequired: request.elimination.confirmationRequired,
            requiredTargetIds: [],
            defeatedTargetIds: [],
            escapedTargetIds: [],
            survivingTargetIds: [],
            unknownTargetIds: [],
            confirmedTargetIds: [],
            progress: 0,
            completed: false,
          }
        : undefined

  return {
    currentPhase: 'preparation',
    elapsedTime: 0,
    partyHp,
    partyMp,
    partyMorale,
    partyStatusEffects,
    supplies: { food, medicine, tools },
    information: request.knownInformation.map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      source: 'known',
      completeness: 'complete' as const,
      battleIntel: k.battleIntel,
    })),
    injuries: [],
    casualties: [],
    incapacitated: [],
    objectiveProgress: 0,
    objectiveCompleted: false,
    discoveredThreats: [],
    avoidedThreats: [],
    logs: [],
    battles: [],
    objectiveState,
    metadata: {
      preparationRouteBonus: 0,
      approachTimeBonus: 0,
      returnTimeBonus: 0,
    },
  }
}

export function consumeSupplies(
  state: ExpeditionState,
  food = 0,
  medicine = 0,
  tools = 0,
): boolean {
  if (
    state.supplies.food < food ||
    state.supplies.medicine < medicine ||
    state.supplies.tools < tools
  ) {
    return false
  }
  state.supplies.food -= food
  state.supplies.medicine -= medicine
  state.supplies.tools -= tools
  return true
}

export function getNonDeadParty(
  party: Adventurer[],
  state: ExpeditionState,
): Adventurer[] {
  return party.filter((a) => !state.casualties.includes(a.id))
}

export function getActiveParty(
  party: Adventurer[],
  state: ExpeditionState,
): Adventurer[] {
  return party.filter(
    (a) =>
      !state.casualties.includes(a.id) &&
      !state.incapacitated.includes(a.id) &&
      state.partyHp[a.id] > 0,
  )
}

export function averagePartyMorale(state: ExpeditionState): number {
  const ids = Object.keys(state.partyMorale)
  if (ids.length === 0) return 50
  const total = ids.reduce((sum, id) => sum + state.partyMorale[id], 0)
  return total / ids.length
}

export function applyExpeditionDamage(
  state: ExpeditionState,
  _party: Adventurer[],
  target: Adventurer,
  damage: number,
  cause: string,
  allowFatal: boolean,
  rng: SeededRng,
): ExpeditionEffect {
  const current = state.partyHp[target.id]
  const nextHp = allowFatal
    ? Math.max(0, current - damage)
    : Math.max(1, current - damage)
  const actualDamage = current - nextHp
  state.partyHp[target.id] = nextHp

  if (actualDamage > 0 && nextHp === 0 && allowFatal) {
    if (!state.casualties.includes(target.id)) {
      state.casualties.push(target.id)
    }
    state.incapacitated = state.incapacitated.filter((id) => id !== target.id)
    addLog(
      state,
      logEntry(
        state.currentPhase,
        'casualty',
        [],
        [`${target.name}が${cause}で命を落とした`],
        [{ type: 'hpDamage', value: actualDamage, targetId: target.id }],
        undefined,
        [target.id],
      ),
    )
  } else if (actualDamage > 0) {
    const type: 'light' | 'serious' = actualDamage >= 10 ? 'serious' : 'light'
    state.injuries.push({
      id: `injury-${state.injuries.length}-${rng.integer(1, 1_000_000)}`,
      adventurerId: target.id,
      type,
      cause,
      hpLoss: actualDamage,
      status: 'active',
    })
  }

  return { type: 'hpDamage', value: actualDamage, targetId: target.id }
}

export function addMorale(
  state: ExpeditionState,
  targetId: string,
  delta: number,
): void {
  state.partyMorale[targetId] = clamp(
    state.partyMorale[targetId] + delta,
    0,
    100,
  )
}

export function addMoraleAll(
  state: ExpeditionState,
  party: Adventurer[],
  delta: number,
): void {
  for (const a of getNonDeadParty(party, state)) {
    addMorale(state, a.id, delta)
  }
}

export function consumeFood(
  state: ExpeditionState,
  party: Adventurer[],
  amount: number,
): boolean {
  return consumeSupplies(state, amount, 0, 0)
}
