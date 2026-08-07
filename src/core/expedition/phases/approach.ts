import { Adventurer, AdventurerRole, SkillName } from '../../models/types.ts'
import {
  CheckResult,
  ExpeditionEffect,
  ExpeditionFeature,
  ExpeditionPhase,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import {
  addAvoidedThreat,
  addDiscoveredThreat,
  addMorale,
  addMoraleAll,
  applyExpeditionDamage,
  consumeFood,
  featureLabel,
  getActiveParty,
  hasFeature,
} from '../state.ts'
import { addLog, logEntry } from '../logs.ts'
import { attemptInformationDiscovery } from '../information.ts'
import { clamp } from '../../util.ts'
import {
  hasRole,
  rankPenaltyForRequest,
  resolveSkillCheck,
  roleCount,
  rolePrimarySkill,
} from '../checks.ts'

export const BASE_PHASE_TIME = 2

export const DISTANCE_TIME_FACTOR = 0.5

export function calculateTravelTime(
  request: ExpeditionRequest,
  party: Adventurer[],
  baseMultiplier: number,
): number {
  const distance = Math.max(1, request.distance)
  const rangerSkill = rolePrimarySkill(party, 'ranger', 'survival')
  const reduction = clamp(rangerSkill / 150, 0, 0.25)
  const supportCount = roleCount(party, 'support')
  const supportReduction = supportCount > 0 ? 0.1 : 0
  const totalReduction = clamp(reduction + supportReduction, 0, 0.35)
  const time =
    (BASE_PHASE_TIME + distance * DISTANCE_TIME_FACTOR) *
    baseMultiplier *
    (1 - totalReduction)
  return Math.max(1, time)
}

export function travelPhase(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
  phase: 'approach' | 'return',
): void {
  if (getActiveParty(party, state).length === 0) return
  state.currentPhase = phase
  const activeParty = getActiveParty(party, state)
  const travelTime = calculateTravelTime(
    request,
    activeParty,
    phase === 'return' ? 0.9 : 1,
  )
  state.elapsedTime += travelTime

  if (phase === 'return') {
    const returnTimeBonus =
      (state.metadata?.returnTimeBonus as number | undefined) ?? 0
    if (returnTimeBonus > 0) {
      state.elapsedTime += returnTimeBonus
    }
  }

  const foodCost = Math.max(
    1,
    Math.ceil(activeParty.length * Math.max(1, request.distance) * 0.4),
  )
  const hadFood = consumeFood(state, party, foodCost)
  if (!hadFood) {
    addMoraleAll(state, party, -5)
    addLog(
      state,
      logEntry(
        phase,
        'foodShortage',
        [],
        ['食糧が不足し、士気が低下した'],
        [{ type: 'moraleChange', value: -5 }],
        undefined,
        Object.keys(state.partyMorale),
      ),
    )
  }

  const skill = 'survival'
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      phase,
      skill,
      'ranger',
      hasFeature(request.features, 'navigationDifficulty') ? 10 : 0,
      0,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    facts.push(
      `${primary.name}が安全な${phase === 'approach' ? '接近' : '帰還'}経路を確保した`,
    )
    if (result === 'criticalSuccess') {
      state.elapsedTime -= 1
      addMorale(state, primary.id, 3)
    }
  } else if (result === 'partialSuccess') {
    facts.push(`${primary.name}が経路を確保したが、多少の遅延が発生した`)
    state.elapsedTime += 1
  } else {
    facts.push(
      `${primary.name}が${phase === 'approach' ? '接近' : '帰還'}経路を見失い、迂回した`,
    )
    state.elapsedTime += 2
    const moraleLoss = result === 'criticalFailure' ? -5 : -2
    addMoraleAll(state, party, moraleLoss)
    effects.push({ type: 'moraleChange', value: moraleLoss })
  }

  const supportCount = roleCount(getActiveParty(party, state), 'support')
  if (supportCount > 0) {
    addMoraleAll(state, party, 2)
    effects.push({ type: 'moraleChange', value: 2 })
    facts.push('Supportが行程を管理し、士気を保った')
  }

  addLog(
    state,
    logEntry(
      phase,
      'travel',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill,
        effectiveValue,
        roll,
        result,
      },
    ),
  )

  handleEnvironmentalHazard(request, party, state, rng, phase, result)
}

export function handleEnvironmentalHazard(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
  phase: ExpeditionPhase,
  travelResult: CheckResult,
): void {
  const hazardSkills: {
    feature: ExpeditionFeature
    skill: SkillName
    preferredRole: AdventurerRole
  }[] = [
    { feature: 'traps', skill: 'trapDetection', preferredRole: 'scout' },
    { feature: 'ambushRisk', skill: 'scouting', preferredRole: 'scout' },
    { feature: 'unstableTerrain', skill: 'melee', preferredRole: 'vanguard' },
    { feature: 'poorVisibility', skill: 'scouting', preferredRole: 'scout' },
    { feature: 'poisonRisk', skill: 'firstAid', preferredRole: 'healer' },
  ]

  const presentHazards = hazardSkills.filter((h) =>
    hasFeature(request.features, h.feature),
  )
  if (presentHazards.length === 0) return

  const hazard = rng.pick(presentHazards)
  const { skill, preferredRole, feature } = hazard
  const baseDifficulty =
    travelResult === 'criticalFailure'
      ? 15
      : travelResult === 'failure'
        ? 10
        : 5
  const toolCost = skill === 'trapDetection' || skill === 'survival' ? 1 : 0
  const rankPenalty = rankPenaltyForRequest(request)
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      phase,
      skill,
      preferredRole,
      baseDifficulty,
      rankPenalty,
      toolCost,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    addAvoidedThreat(state, feature)
    facts.push(
      `${primary.name}が${featureLabel(feature)}を事前に察知・回避した`,
    )
    if (feature === 'traps' || feature === 'ambushRisk') {
      const discovery = attemptInformationDiscovery(
        rng,
        party,
        state,
        phase,
        skill,
        request.hiddenInformation,
        rankPenalty,
      )
      if (discovery.discovered) {
        facts.push(`${discovery.discovered.name}に関する情報を得た`)
      }
    }
  } else {
    addDiscoveredThreat(state, feature)
    facts.push(`${featureLabel(feature)}に遭遇した`)
    const active = getActiveParty(party, state)
    const target = active.length > 0 ? rng.pick(active) : undefined
    if (target) {
      let damage = rng.integer(3, 8)
      if (result === 'criticalFailure') damage += 5
      if (hasRole(getActiveParty(party, state), 'guardian')) {
        const reduction = Math.max(2, Math.floor(damage * 0.3))
        damage = Math.max(1, damage - reduction)
        facts.push(`Guardianが${target.name}の被害を軽減した`)
      }
      const effect = applyExpeditionDamage(
        state,
        party,
        target,
        damage,
        feature,
        result === 'criticalFailure',
        rng,
      )
      effects.push(effect)
      if (effect.value && effect.value > 0) {
        facts.push(`${target.name}が${effect.value}のダメージを受けた`)
      }

      if (
        feature === 'poisonRisk' &&
        !hasRole(getActiveParty(party, state), 'healer')
      ) {
        state.partyStatusEffects[target.id].push({
          type: 'poisoned',
          duration: 3,
          sourceId: feature,
        })
        facts.push(`${target.name}が毒に冒された`)
      }
    }

    if (feature === 'traps' || feature === 'ambushRisk') {
      const moraleLoss = result === 'criticalFailure' ? -6 : -3
      addMoraleAll(state, party, moraleLoss)
      effects.push({ type: 'moraleChange', value: moraleLoss })
    }
  }

  addLog(
    state,
    logEntry(
      phase,
      'hazard',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill,
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

export function runApproach(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  travelPhase(request, party, state, rng, 'approach')
}
