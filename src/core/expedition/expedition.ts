import { SeededRng } from '../rng/seededRng.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  Difficulty,
  SkillName,
} from '../models/types.ts'
import { clamp, deepClone } from '../util.ts'
import type {
  BattleEntryConditions,
  CheckResult,
  DiscoveredInformation,
  EnvironmentEffect,
  ExpeditionEffect,
  ExpeditionFeature,
  ExpeditionLogEntry,
  ExpeditionOutcome,
  ExpeditionPhase,
  ExpeditionRequest,
  ExpeditionResult,
  ExpeditionState,
  HiddenInformation,
  InformationDiscoveryAttempt,
} from './types.ts'
import {
  calculateAssistanceBonus,
  calculateEquipmentBonus,
  calculateInformationBonus,
  difficultyBasePenalty,
  hasRole,
  logEntry,
  primaryRoleForSkill,
  resolveCheck,
  roleCount,
  rolePrimarySkill,
  roleSkillBonus,
  selectResponsible,
} from './checks.ts'

export const EXPEDITION_PHASES: ExpeditionPhase[] = [
  'preparation',
  'approach',
  'contact',
  'exploration',
  'objective',
  'battle',
  'return',
  'aftermath',
]

const BASE_PHASE_TIME = 2
const DISTANCE_TIME_FACTOR = 0.5

export const EXPEDITION_RANK_PENALTY: Record<AdventurerRank, number> = {
  E: 0,
  D: 4,
  C: 8,
  B: 12,
  A: 16,
  S: 20,
}

function hasFeature(
  features: ExpeditionFeature[],
  feature: ExpeditionFeature,
): boolean {
  return features.includes(feature)
}

function featureLabel(feature: ExpeditionFeature): string {
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

function addDiscoveredThreat(
  state: ExpeditionState,
  feature: ExpeditionFeature,
): void {
  if (!state.discoveredThreats.includes(feature)) {
    state.discoveredThreats.push(feature)
  }
}

function addAvoidedThreat(
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
  const partyStatusEffects: Record<string, string[]> = {}

  for (const a of party) {
    partyHp[a.id] = a.currentHp
    partyMp[a.id] = a.currentMp
    partyMorale[a.id] = a.morale
    partyStatusEffects[a.id] = a.statusEffects.map((s) => s.type)
  }

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
    })),
    injuries: [],
    casualties: [],
    objectiveProgress: 0,
    objectiveCompleted: false,
    discoveredThreats: [],
    avoidedThreats: [],
    logs: [],
    metadata: {
      preparationRouteBonus: 0,
      approachTimeBonus: 0,
      returnTimeBonus: 0,
    },
  }
}

function addLog(state: ExpeditionState, entry: ExpeditionLogEntry): void {
  state.logs.push(entry)
}

function consumeSupplies(
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

function getAliveParty(
  party: Adventurer[],
  state: ExpeditionState,
): Adventurer[] {
  return party.filter((a) => !state.casualties.includes(a.id))
}

function averagePartyMorale(state: ExpeditionState): number {
  const ids = Object.keys(state.partyMorale)
  if (ids.length === 0) return 50
  const total = ids.reduce((sum, id) => sum + state.partyMorale[id], 0)
  return total / ids.length
}

function rankPenaltyForRequest(request: ExpeditionRequest): number {
  return EXPEDITION_RANK_PENALTY[request.rank]
}

function featurePenaltyForSkill(
  features: ExpeditionFeature[],
  skill: SkillName,
): number {
  let penalty = 0
  if (
    (skill === 'trapDetection' || skill === 'scouting') &&
    (hasFeature(features, 'traps') || hasFeature(features, 'ambushRisk'))
  ) {
    penalty += 10
  }
  if (
    (skill === 'scouting' || skill === 'survival') &&
    (hasFeature(features, 'poorVisibility') ||
      hasFeature(features, 'navigationDifficulty'))
  ) {
    penalty += 10
  }
  if (
    (skill === 'survival' || skill === 'melee') &&
    hasFeature(features, 'unstableTerrain')
  ) {
    penalty += skill === 'melee' ? 5 : 10
  }
  if (skill === 'firstAid' && hasFeature(features, 'poisonRisk')) {
    penalty += 10
  }
  if (skill === 'leadership' && hasFeature(features, 'retreatDifficulty')) {
    penalty += 10
  }
  if (skill === 'monsterKnowledge' && hasFeature(features, 'flyingEnemies')) {
    penalty += 5
  }
  return penalty
}

function roleBonusForSkill(party: Adventurer[], skill: SkillName): number {
  const mapping: Partial<Record<SkillName, AdventurerRole[]>> = {
    trapDetection: ['scout'],
    trapDisarm: ['scout'],
    stealth: ['scout'],
    scouting: ['scout', 'ranger'],
    survival: ['ranger', 'scout'],
    melee: ['vanguard', 'guardian'],
    defense: ['guardian', 'vanguard'],
    firstAid: ['healer'],
    healing: ['healer'],
    leadership: ['support'],
    tactics: ['support', 'vanguard'],
    monsterKnowledge: ['mage'],
    attackMagic: ['mage'],
    defenseMagic: ['mage'],
    ranged: ['ranger'],
  }
  const roles = mapping[skill] ?? []
  return Math.min(
    roles.reduce((sum, role) => sum + roleSkillBonus(party, role, skill), 0),
    25,
  )
}

function absencePenaltyForSkill(party: Adventurer[], skill: SkillName): number {
  const mapping: Partial<Record<SkillName, AdventurerRole[]>> = {
    trapDetection: ['scout'],
    scouting: ['scout', 'ranger'],
    survival: ['ranger'],
    melee: ['vanguard'],
    firstAid: ['healer'],
    healing: ['healer'],
    leadership: ['support'],
    monsterKnowledge: ['mage'],
    defenseMagic: ['mage'],
  }
  const roles = mapping[skill] ?? []
  let penalty = 0
  for (const role of roles) {
    if (!hasRole(party, role)) penalty += 8
  }
  return penalty
}

function resolveSkillCheck(
  rng: SeededRng,
  party: Adventurer[],
  state: ExpeditionState,
  phase: ExpeditionPhase,
  skill: SkillName,
  preferredRole: AdventurerRole | undefined,
  difficultyModifier: number,
  rankPenalty: number,
  toolCost = 0,
): {
  result: CheckResult
  primary: Adventurer
  assistants: Adventurer[]
  effectiveValue: number
  roll: number
} {
  const alive = getAliveParty(party, state)
  if (alive.length === 0) {
    throw new Error(`Cannot resolve ${phase} check: no living party members`)
  }
  const { primary, assistants } = selectResponsible(alive, skill, preferredRole)
  const assistance = calculateAssistanceBonus(assistants, skill)

  let equipment = 0
  if (toolCost > 0) {
    if (state.supplies.tools >= toolCost) {
      equipment = calculateEquipmentBonus(toolCost)
      state.supplies.tools -= toolCost
    } else {
      equipment = -10
    }
  }

  const info = calculateInformationBonus(skill, state.information)
  const roleBonus = roleBonusForSkill(party, skill)
  const absencePenalty = absencePenaltyForSkill(party, skill)
  const featurePenalty = featurePenaltyForSkill(
    requestFeaturesFromState(state),
    skill,
  )

  const base = primary.skills[skill]
  const effectiveValue = clamp(
    base +
      assistance +
      equipment +
      info +
      roleBonus -
      difficultyModifier -
      rankPenalty -
      difficultyBasePenalty(
        (state.metadata?.difficulty as Difficulty | undefined) ?? 'normal',
      ) -
      absencePenalty -
      featurePenalty,
    1,
    100,
  )

  const { roll, result } = resolveCheck(rng, effectiveValue)

  return { result, primary, assistants, effectiveValue, roll }
}

function requestFeaturesFromState(state: ExpeditionState): ExpeditionFeature[] {
  return (
    (state.metadata?.requestFeatures as ExpeditionFeature[] | undefined) ?? []
  )
}

function genericFact(rng: SeededRng, source: string): DiscoveredInformation {
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

function getExistingInfo(
  state: ExpeditionState,
  id: string,
): DiscoveredInformation | undefined {
  return state.information.find((i) => i.id === id)
}

function attemptInformationDiscovery(
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

function applyExpeditionDamage(
  state: ExpeditionState,
  party: Adventurer[],
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

  if (nextHp === 0 && allowFatal) {
    if (!state.casualties.includes(target.id)) {
      state.casualties.push(target.id)
    }
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

function treatActiveInjuries(state: ExpeditionState): void {
  for (const injury of state.injuries) {
    if (injury.status === 'active') {
      injury.status = 'treated'
    }
  }
}

function addMorale(
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

function addMoraleAll(
  state: ExpeditionState,
  party: Adventurer[],
  delta: number,
): void {
  for (const a of party) {
    addMorale(state, a.id, delta)
  }
}

function consumeFood(
  state: ExpeditionState,
  party: Adventurer[],
  amount: number,
): boolean {
  return consumeSupplies(state, amount, 0, 0)
}

function calculateTravelTime(
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

function objectiveProgressFact(progress: number): string {
  if (progress <= 0) return '目的に関する成果を得られなかった'
  if (progress < 40) return '手がかりは得たが、依頼目的は達成できなかった'
  if (progress < 60) return '依頼目的を部分的に達成した'
  if (progress < 100) return '最低限の目的を達成した'
  return '依頼目的を完全に達成した'
}

function setObjectiveCompletedFromProgress(state: ExpeditionState): void {
  state.objectiveCompleted = state.objectiveProgress >= 60
}

function travelPhase(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
  phase: 'approach' | 'return',
): void {
  state.currentPhase = phase
  const travelTime = calculateTravelTime(
    request,
    party,
    phase === 'return' ? 0.9 : 1,
  )
  state.elapsedTime += travelTime

  const foodCost = Math.max(
    1,
    Math.ceil(party.length * Math.max(1, request.distance) * 0.4),
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

  const supportCount = roleCount(party, 'support')
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

function handleEnvironmentalHazard(
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
    const alive = getAliveParty(party, state)
    const target = alive.length > 0 ? rng.pick(alive) : undefined
    if (target) {
      let damage = rng.integer(3, 8)
      if (result === 'criticalFailure') damage += 5
      if (hasRole(party, 'guardian')) {
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

      if (feature === 'poisonRisk' && !hasRole(party, 'healer')) {
        state.partyStatusEffects[target.id].push('poisoned')
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

function runPreparation(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  state.currentPhase = 'preparation'

  const skill: SkillName = 'survival'
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'preparation',
      skill,
      'ranger',
      0,
      0,
      1,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    facts.push(`${primary.name}が効率的なルートと補給計画を立てた`)
    const bonus = result === 'criticalSuccess' ? 2 : 1
    state.metadata ??= {}
    state.metadata.preparationRouteBonus = bonus
    if (hasRole(party, 'support')) {
      facts.push('Supportが行程を整理し、出発を円滑に進めた')
      addMoraleAll(state, party, 3)
      effects.push({ type: 'moraleChange', value: 3 })
    }
  } else if (result === 'partialSuccess') {
    facts.push('準備は整ったが、計画に若干の無理があった')
    state.metadata ??= {}
    state.metadata.preparationRouteBonus = 0
    state.elapsedTime += 1
  } else {
    facts.push('出発準備が遅れ、初期士気が低下した')
    state.metadata ??= {}
    state.metadata.preparationRouteBonus = -1
    addMoraleAll(state, party, -3)
    effects.push({ type: 'moraleChange', value: -3 })
    state.elapsedTime += 2
  }

  if (!hasRole(party, 'support')) {
    facts.push('Support不在のため、出発時の士気が低めである')
    addMoraleAll(state, party, -2)
    effects.push({ type: 'moraleChange', value: -2 })
  }

  addLog(
    state,
    logEntry(
      'preparation',
      'routePlanning',
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

function runApproach(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  travelPhase(request, party, state, rng, 'approach')
}

function runExploration(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  state.currentPhase = 'exploration'
  const loops = 3
  const rankPenalty = rankPenaltyForRequest(request)

  const skillByEnvironment: Record<string, SkillName> = {
    ruins: 'monsterKnowledge',
    cave: 'scouting',
    magical: 'monsterKnowledge',
    forest: 'scouting',
    mountain: 'survival',
    swamp: 'scouting',
    desert: 'survival',
    plains: 'scouting',
    urban: 'leadership',
  }

  for (let i = 0; i < loops; i++) {
    const defaultSkill = skillByEnvironment[request.environment] ?? 'scouting'
    const difficulty =
      5 +
      (hasFeature(request.features, 'poorVisibility') ? 10 : 0) +
      (hasFeature(request.features, 'unstableTerrain') ? 5 : 0) +
      (hasFeature(request.features, 'limitedSupplies') ? 5 : 0)

    const discovery = attemptInformationDiscovery(
      rng,
      party,
      state,
      'exploration',
      defaultSkill,
      request.hiddenInformation,
      difficulty + rankPenalty,
    )

    const { result, primary, assistants, effectiveValue, roll } = discovery

    const facts: string[] = []
    const effects: ExpeditionEffect[] = []

    if (result === 'criticalSuccess' || result === 'success') {
      facts.push(`${primary.name}が調査対象に関する手がかりを発見した`)
      if (discovery.discovered) {
        const label =
          discovery.discovered.completeness === 'complete'
            ? discovery.discovered.name
            : `${discovery.discovered.name}（断片）`
        facts.push(`${label}に関する情報を得た`)
      }
    } else if (result === 'partialSuccess') {
      facts.push(`${primary.name}が断片的な手がかりを得た`)
      if (discovery.discovered) {
        facts.push(`${discovery.discovered.name}に関する断片情報を得た`)
      }
    } else {
      facts.push('調査に手間取った')
      state.elapsedTime += 1
      if (result === 'criticalFailure') {
        const alive = getAliveParty(party, state)
        const target = alive.length > 0 ? rng.pick(alive) : undefined
        if (target) {
          const damage = rng.integer(2, 5)
          const effect = applyExpeditionDamage(
            state,
            party,
            target,
            damage,
            'explorationAccident',
            true,
            rng,
          )
          effects.push(effect)
          if (effect.value && effect.value > 0) {
            facts.push(
              `${target.name}が小さな事故で${effect.value}のダメージを受けた`,
            )
          }
        }
      }
    }

    if (hasRole(party, 'support')) {
      addMoraleAll(state, party, 1)
      effects.push({ type: 'moraleChange', value: 1 })
    }

    addLog(
      state,
      logEntry(
        'exploration',
        'explore',
        [primary.id, ...assistants.map((a) => a.id)],
        facts,
        effects,
        {
          skill: discovery.attempt.requiredSkill,
          effectiveValue,
          roll,
          result,
        },
      ),
    )

    if (rng.chance(30) && request.features.length > 0) {
      const feature = rng.pick(request.features)
      handleFeatureDuringExploration(request, party, state, rng, feature)
    }
  }
}

function handleFeatureDuringExploration(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
  feature: ExpeditionFeature,
): void {
  if (
    feature !== 'traps' &&
    feature !== 'ambushRisk' &&
    feature !== 'unstableTerrain' &&
    feature !== 'poisonRisk'
  ) {
    return
  }
  handleEnvironmentalHazard(
    request,
    party,
    state,
    rng,
    'exploration',
    'success',
  )
}

function runObjective(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  state.currentPhase = 'objective'

  const skill: SkillName =
    request.environment === 'magical' || request.environment === 'ruins'
      ? 'monsterKnowledge'
      : 'scouting'
  const preferredRole: AdventurerRole | undefined =
    skill === 'monsterKnowledge' ? 'mage' : 'scout'

  const difficulty =
    10 +
    (hasFeature(request.features, 'poorVisibility') ? 5 : 0) +
    (hasFeature(request.features, 'navigationDifficulty') ? 5 : 0) +
    (state.objectiveProgress < 40 ? 10 : 0)
  const rankPenalty = rankPenaltyForRequest(request)

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      skill,
      preferredRole,
      difficulty,
      rankPenalty,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    facts.push(`${primary.name}が目標となる情報を確認した`)
    state.objectiveProgress = 100
  } else if (result === 'partialSuccess') {
    state.objectiveProgress = Math.min(100, state.objectiveProgress + 20)
    if (state.objectiveProgress >= 60 && state.objectiveProgress < 100) {
      facts.push('最低限の目的を達成した')
    }
  } else {
    facts.push('目的の達成に失敗した')
    if (result === 'criticalFailure') {
      state.elapsedTime += 3
    }
  }

  if (
    request.timeLimit !== undefined &&
    state.elapsedTime > request.timeLimit
  ) {
    facts.push('制限時間を超過した')
  }

  setObjectiveCompletedFromProgress(state)
  facts.push(objectiveProgressFact(state.objectiveProgress))

  if (result === 'criticalSuccess') {
    addMoraleAll(state, party, 5)
    effects.push({ type: 'moraleChange', value: 5 })
  }

  addLog(
    state,
    logEntry(
      'objective',
      'objectiveCheck',
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

function runReturn(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  travelPhase(request, party, state, rng, 'return')

  state.currentPhase = 'return'
  const skill: SkillName = 'firstAid'
  const aliveHealers = getAliveParty(party, state).filter(
    (a) => a.role === 'healer',
  )
  if (aliveHealers.length > 0) {
    const healer = aliveHealers[0]
    const { result, effectiveValue, roll } = resolveSkillCheck(
      rng,
      party,
      state,
      'return',
      skill,
      'healer',
      0,
      0,
    )

    const facts: string[] = []
    const effects: ExpeditionEffect[] = []

    if (result === 'criticalSuccess' || result === 'success') {
      const usedMedicine = Math.min(1, state.supplies.medicine)
      if (usedMedicine > 0) {
        state.supplies.medicine -= usedMedicine
        facts.push(`医薬品を${usedMedicine}消費した`)
        effects.push({
          type: 'supplyConsume',
          value: usedMedicine,
          targetId: 'medicine',
        })
      }
      facts.push(`${healer.name}が帰還中の負傷者を手当てした`)
      for (const a of getAliveParty(party, state)) {
        if (state.partyHp[a.id] < a.maxHp) {
          const heal = Math.min(
            a.maxHp - state.partyHp[a.id],
            result === 'criticalSuccess' ? 10 : 5,
          )
          state.partyHp[a.id] += heal
          effects.push({ type: 'hpHeal', value: heal, targetId: a.id })
        }
      }
      treatActiveInjuries(state)
    } else {
      facts.push('帰還中の負傷者手当てが不十分だった')
    }

    addLog(
      state,
      logEntry('return', 'firstAid', [healer.id], facts, effects, {
        skill,
        effectiveValue,
        roll,
        result,
      }),
    )
  } else {
    for (const a of getAliveParty(party, state)) {
      if (state.injuries.some((i) => i.adventurerId === a.id)) {
        if (rng.chance(20)) {
          const worsening = rng.integer(2, 5)
          const effect = applyExpeditionDamage(
            state,
            party,
            a,
            worsening,
            'worseningDuringReturn',
            true,
            rng,
          )
          if (effect.value && effect.value > 0) {
            const injury = state.injuries.find(
              (i) => i.adventurerId === a.id && i.status === 'active',
            )
            if (injury) {
              injury.status = 'worsened'
            }
          }
        }
      }
    }
    addLog(
      state,
      logEntry(
        'return',
        'noHealer',
        [],
        ['Healer不在のため、帰還中に負傷が悪化する可能性がある'],
      ),
    )
  }
}

function runAftermath(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  state.currentPhase = 'aftermath'

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (state.casualties.length > 0) {
    facts.push(`犠牲者: ${state.casualties.join(', ')}`)
    addMoraleAll(state, party, -10)
    effects.push({ type: 'moraleChange', value: -10 })
  }

  setObjectiveCompletedFromProgress(state)
  facts.push(objectiveProgressFact(state.objectiveProgress))

  const moraleDelta =
    state.objectiveProgress >= 100
      ? 5
      : state.objectiveProgress >= 60
        ? 3
        : state.objectiveProgress >= 40
          ? 0
          : -5
  if (moraleDelta !== 0) {
    addMoraleAll(state, party, moraleDelta)
    effects.push({ type: 'moraleChange', value: moraleDelta })
  }

  const aliveHealers = getAliveParty(party, state).filter(
    (a) => a.role === 'healer',
  )
  if (aliveHealers.length > 0) {
    const healer = aliveHealers[0]
    const healSkill = 'healing'
    const { result, effectiveValue, roll } = resolveSkillCheck(
      rng,
      party,
      state,
      'aftermath',
      healSkill,
      'healer',
      0,
      0,
    )

    const healEffects: ExpeditionEffect[] = []
    if (result === 'criticalSuccess' || result === 'success') {
      const usedMedicine = Math.min(2, state.supplies.medicine)
      if (usedMedicine > 0) {
        state.supplies.medicine -= usedMedicine
        facts.push(`医薬品を${usedMedicine}消費した`)
        healEffects.push({
          type: 'supplyConsume',
          value: usedMedicine,
          targetId: 'medicine',
        })
      }
      facts.push(`${healer.name}が負傷者の治療を行った`)
      for (const a of getAliveParty(party, state)) {
        const heal = Math.min(
          a.maxHp - state.partyHp[a.id],
          result === 'criticalSuccess' ? 15 : 8,
        )
        if (heal > 0) {
          state.partyHp[a.id] += heal
          healEffects.push({ type: 'hpHeal', value: heal, targetId: a.id })
        }
      }
      treatActiveInjuries(state)
    } else {
      facts.push('治療は不十分だった')
    }

    addLog(
      state,
      logEntry(
        'aftermath',
        'healing',
        [healer.id],
        [`${healer.name}による治療判定: ${result}`],
        healEffects,
        {
          skill: healSkill,
          effectiveValue,
          roll,
          result,
        },
      ),
    )
  }

  addLog(state, logEntry('aftermath', 'summary', [], facts, effects))
}

function buildBattleEntrySnapshot(
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

  const knownEnemyWeaknesses: string[] = []
  const knownEnemyAbilities: string[] = []
  for (const info of state.information) {
    if (
      info.source.includes('trapDetection') ||
      info.source.includes('scouting')
    ) {
      knownEnemyAbilities.push(info.name)
    }
    if (info.source.includes('monsterKnowledge')) {
      knownEnemyWeaknesses.push(info.name)
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

function determineOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  const avgMorale = averagePartyMorale(state)
  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const noSupplies = state.supplies.food <= 0
  const activeSerious = state.injuries.filter(
    (i) => i.status === 'active' && i.type === 'serious',
  ).length
  const allCasualties = state.casualties.length === party.length
  const hasCasualties = state.casualties.length > 0

  if (allCasualties) {
    return 'lostExpedition'
  }

  let outcome: ExpeditionOutcome
  if (
    state.objectiveProgress >= 100 &&
    !hasCasualties &&
    activeSerious === 0 &&
    avgMorale >= 40 &&
    !timeExceeded &&
    !noSupplies
  ) {
    outcome = 'completeSuccess'
  } else if (state.objectiveProgress >= 60) {
    outcome = 'success'
  } else if (state.objectiveProgress >= 40) {
    outcome = 'partialSuccess'
  } else {
    outcome = 'failedObjective'
  }

  if (timeExceeded || noSupplies || avgMorale < 15) {
    if (outcome === 'completeSuccess') outcome = 'success'
    else if (outcome === 'success') outcome = 'partialSuccess'
    else if (outcome === 'partialSuccess') outcome = 'failedObjective'
    else outcome = 'forcedRetreat'
  }

  if (hasCasualties || activeSerious > 1) {
    if (outcome === 'completeSuccess') outcome = 'success'
    else if (outcome === 'success') outcome = 'partialSuccess'
    else if (outcome === 'partialSuccess') outcome = 'failedObjective'
    else outcome = 'lostExpedition'
  }

  return outcome
}

export function runExpedition(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionResult {
  if (request.objectiveType !== 'investigation') {
    throw new Error(
      `Unsupported objectiveType in Phase 3.0: ${request.objectiveType}`,
    )
  }

  const rng = new SeededRng(request.seed)
  const state = initializeExpeditionState(request, party)
  state.metadata = {
    difficulty: request.difficulty,
    requestFeatures: request.features,
    threatFeatures: request.features,
    ...state.metadata,
  }

  runPreparation(request, party, state, rng)
  runApproach(request, party, state, rng)
  runExploration(request, party, state, rng)

  state.battleEntrySnapshot = buildBattleEntrySnapshot(request, party, state)

  runObjective(request, party, state, rng)
  runReturn(request, party, state, rng)
  runAftermath(request, party, state, rng)

  setObjectiveCompletedFromProgress(state)
  state.currentPhase = 'aftermath'

  const outcome = determineOutcome(request, state, party)

  return { request, outcome, state, party }
}
