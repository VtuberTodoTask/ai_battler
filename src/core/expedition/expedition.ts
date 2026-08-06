import { SeededRng } from '../rng/seededRng.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  BattleResult,
  Difficulty,
  Enemy,
  SkillName,
  StatusEffect,
} from '../models/types.ts'
import { runBattle } from '../battle/battle.ts'
import { generateEncounter } from '../generators/encounterGenerator.ts'
import { ADVENTURER_THREAT } from '../balance/constants.ts'
import { clamp, deepClone } from '../util.ts'
import type {
  BattleEntryConditions,
  BattleIntel,
  CheckResult,
  DiscoveredInformation,
  EliminationObjectiveState,
  EnvironmentEffect,
  ExpeditionBattleRecord,
  ExpeditionEffect,
  ExpeditionFeature,
  ExpeditionInjury,
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
  const partyStatusEffects: Record<string, StatusEffect[]> = {}

  for (const a of party) {
    partyHp[a.id] = a.currentHp
    partyMp[a.id] = a.currentMp
    partyMorale[a.id] = a.morale
    partyStatusEffects[a.id] = deepClone(a.statusEffects)
  }

  const objectiveState: EliminationObjectiveState | undefined =
    request.objectiveType === 'elimination' && request.elimination
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

function getNonDeadParty(
  party: Adventurer[],
  state: ExpeditionState,
): Adventurer[] {
  return party.filter((a) => !state.casualties.includes(a.id))
}

function getActiveParty(
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
  const active = getActiveParty(party, state)
  if (active.length === 0) {
    throw new Error(`Cannot resolve ${phase} check: no active party members`)
  }
  const { primary, assistants } = selectResponsible(
    active,
    skill,
    preferredRole,
  )
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
  const roleBonus = roleBonusForSkill(active, skill)
  const absencePenalty = absencePenaltyForSkill(active, skill)
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

export function isUnresolvedInjury(injury: ExpeditionInjury): boolean {
  return injury.status === 'active' || injury.status === 'worsened'
}

export function isUnresolvedSeriousInjury(injury: ExpeditionInjury): boolean {
  return injury.type === 'serious' && isUnresolvedInjury(injury)
}

function treatMember(
  state: ExpeditionState,
  targetId: string,
  critical: boolean,
): void {
  // 通常成功: active -> treated、worsened -> active（重症を安定化）
  // criticalSuccess: active/worsened -> treated
  if (state.partyHp[targetId] <= 0) {
    state.partyHp[targetId] = 1
  }
  state.incapacitated = state.incapacitated.filter((id) => id !== targetId)

  for (const injury of state.injuries) {
    if (injury.adventurerId !== targetId || !isUnresolvedInjury(injury)) {
      continue
    }
    if (critical) {
      injury.status = 'treated'
    } else if (injury.status === 'worsened') {
      injury.status = 'active'
    } else if (injury.status === 'active') {
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
  for (const a of getNonDeadParty(party, state)) {
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

function eliminationProgressFact(
  objectiveState: EliminationObjectiveState,
): string {
  const {
    requiredTargetIds,
    defeatedTargetIds,
    escapedTargetIds,
    survivingTargetIds,
    unknownTargetIds,
    confirmedTargetIds,
    progress,
    completed,
  } = objectiveState
  const parts: string[] = [
    `討伐対象として${requiredTargetIds.length}体が指定された`,
    `戦闘で${defeatedTargetIds.length}体を撃破した`,
  ]
  if (escapedTargetIds.length > 0) {
    parts.push(`${escapedTargetIds.length}体が逃亡した`)
  }
  if (survivingTargetIds.length > 0) {
    parts.push(`${survivingTargetIds.length}体が生存している`)
  }
  if (unknownTargetIds.length > 0) {
    parts.push(`${unknownTargetIds.length}体の最終状態を確認できなかった`)
  }
  parts.push(`討伐進捗は${progress}%となった`)
  if (confirmedTargetIds.length > 0) {
    parts.push(
      `撃破した${defeatedTargetIds.length}体のうち${confirmedTargetIds.length}体の討伐を確認した`,
    )
  }
  if (completed) {
    parts.push('全対象の討伐を確認した')
  } else if (
    unknownTargetIds.length === 0 &&
    defeatedTargetIds.length === requiredTargetIds.length
  ) {
    parts.push('全対象を撃破したが討伐確認が未完了のため依頼目的は未完了')
  } else {
    parts.push('討伐対象が残っているため依頼目的は未完了')
  }
  return parts.join('。')
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
  if (getActiveParty(party, state).length === 0) return
  state.currentPhase = phase
  const activeParty = getActiveParty(party, state)
  const travelTime = calculateTravelTime(
    request,
    activeParty,
    phase === 'return' ? 0.9 : 1,
  )
  state.elapsedTime += travelTime

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
    if (hasRole(getActiveParty(party, state), 'support')) {
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

  if (!hasRole(getActiveParty(party, state), 'support')) {
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
        const active = getActiveParty(party, state)
        const target = active.length > 0 ? rng.pick(active) : undefined
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

    if (hasRole(getActiveParty(party, state), 'support')) {
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
  if (getActiveParty(party, state).length === 0) return
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

  const incapacitatedIds = getNonDeadParty(party, state)
    .map((a) => a.id)
    .filter((id) => state.incapacitated.includes(id))

  const skill: SkillName = 'firstAid'
  const activeHealers = getActiveParty(party, state).filter(
    (a) => a.role === 'healer',
  )
  if (activeHealers.length > 0) {
    const healer = activeHealers[0]
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
    if (incapacitatedIds.length > 0) {
      facts.push('戦闘不能者を伴って帰還した')
    }
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
      for (const a of getNonDeadParty(party, state)) {
        if (state.partyHp[a.id] < a.maxHp) {
          const heal = Math.min(
            a.maxHp - state.partyHp[a.id],
            result === 'criticalSuccess' ? 10 : 5,
          )
          state.partyHp[a.id] += heal
          effects.push({ type: 'hpHeal', value: heal, targetId: a.id })
        }
        treatMember(state, a.id, result === 'criticalSuccess')
      }
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
    const facts: string[] = []
    if (incapacitatedIds.length > 0) {
      facts.push('戦闘不能者を伴って帰還した')
    }
    for (const a of getNonDeadParty(party, state)) {
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
    facts.push('Healer不在のため、帰還中に負傷が悪化する可能性がある')
    addLog(state, logEntry('return', 'noHealer', [], facts, []))
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

  if (state.objectiveState && state.objectiveState.type === 'elimination') {
    state.objectiveCompleted = state.objectiveState.completed
    facts.push(eliminationProgressFact(state.objectiveState))
  } else {
    setObjectiveCompletedFromProgress(state)
    facts.push(objectiveProgressFact(state.objectiveProgress))
  }

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

  const activeHealers = getActiveParty(party, state).filter(
    (a) => a.role === 'healer',
  )
  if (activeHealers.length > 0) {
    const healer = activeHealers[0]
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
      for (const a of getNonDeadParty(party, state)) {
        const heal = Math.min(
          a.maxHp - state.partyHp[a.id],
          result === 'criticalSuccess' ? 15 : 8,
        )
        if (heal > 0) {
          state.partyHp[a.id] += heal
          healEffects.push({ type: 'hpHeal', value: heal, targetId: a.id })
        }
        treatMember(state, a.id, result === 'criticalSuccess')
      }
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

function determineInvestigationOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  const avgMorale = averagePartyMorale(state)
  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const noSupplies = state.supplies.food <= 0
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length
  const allCasualties = state.casualties.length === party.length
  const hasCasualties = state.casualties.length > 0
  const activeCount = getActiveParty(party, state).length
  const allIncapacitated =
    !allCasualties &&
    activeCount === 0 &&
    getNonDeadParty(party, state).length > 0

  if (allCasualties || allIncapacitated) {
    return 'lostExpedition'
  }

  const forcedBattleRetreat =
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat'

  let outcome: ExpeditionOutcome
  if (
    state.objectiveProgress >= 100 &&
    !hasCasualties &&
    unresolvedSerious === 0 &&
    avgMorale >= 40 &&
    !timeExceeded &&
    !noSupplies
  ) {
    outcome = 'completeSuccess'
  } else if (state.objectiveProgress >= 60) {
    outcome = 'success'
  } else if (state.objectiveProgress >= 40) {
    outcome = 'partialSuccess'
  } else if (forcedBattleRetreat) {
    outcome = 'forcedRetreat'
  } else {
    outcome = 'failedObjective'
  }

  if (timeExceeded || noSupplies || avgMorale < 15) {
    if (outcome === 'completeSuccess') outcome = 'success'
    else if (outcome === 'success') outcome = 'partialSuccess'
    else if (outcome === 'partialSuccess') outcome = 'failedObjective'
    else outcome = 'forcedRetreat'
  }

  if (hasCasualties || unresolvedSerious > 1) {
    if (outcome === 'completeSuccess') outcome = 'success'
    else if (outcome === 'success') outcome = 'partialSuccess'
    else if (outcome === 'partialSuccess') outcome = 'failedObjective'
    else outcome = 'lostExpedition'
  }

  return outcome
}

function determineEliminationOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  const avgMorale = averagePartyMorale(state)
  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const noSupplies = state.supplies.food <= 0
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length
  const allCasualties = state.casualties.length === party.length
  const activeCount = getActiveParty(party, state).length
  const allIncapacitated =
    !allCasualties &&
    activeCount === 0 &&
    getNonDeadParty(party, state).length > 0

  if (allCasualties || allIncapacitated) {
    return 'lostExpedition'
  }

  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'elimination') {
    throw new Error(
      'determineEliminationOutcome called without elimination objectiveState',
    )
  }

  const {
    requiredTargetIds,
    defeatedTargetIds,
    unknownTargetIds,
    confirmedTargetIds,
    progress,
  } = obj
  const hasUnknown = unknownTargetIds.length > 0
  const allDefeated =
    !hasUnknown && defeatedTargetIds.length === requiredTargetIds.length
  const allConfirmed =
    !hasUnknown && confirmedTargetIds.length === requiredTargetIds.length
  const hasCasualties = state.casualties.length > 0
  const majorDamage = hasCasualties || unresolvedSerious > 0
  const returnIssues = timeExceeded || noSupplies || avgMorale < 40

  if (allDefeated && !allConfirmed) {
    return 'failedObjective'
  }

  if (allDefeated && allConfirmed) {
    if (!majorDamage && !returnIssues) {
      return 'completeSuccess'
    }
    return 'success'
  }

  const forcedBattleRetreat =
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat'

  if (progress >= 40) {
    return 'partialSuccess'
  }
  if (forcedBattleRetreat) {
    return 'forcedRetreat'
  }
  return 'failedObjective'
}

function determineOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  if (request.objectiveType === 'elimination') {
    return determineEliminationOutcome(request, state, party)
  }
  return determineInvestigationOutcome(request, state, party)
}

function buildBattleParty(
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

function environmentEffectsToBattleContext(effects: EnvironmentEffect[]): {
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

function applyKnownEnemyWeaknesses(
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

function matchKnownEnemyAbilities(
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

function resolveEliminationTargets(
  state: ExpeditionState,
  result: BattleResult,
  request: ExpeditionRequest,
  battleId: string,
): void {
  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'elimination') return

  const requiredTargetIds = obj.requiredTargetIds
  if (requiredTargetIds.length === 0) {
    addLog(
      state,
      logEntry(
        'battle',
        'diagnostic',
        [],
        [`戦闘${battleId}: 討伐対象IDが設定されていない`],
      ),
    )
    return
  }

  const defeated = new Set(result.defeatedEnemies)
  const surviving = new Set(result.survivingEnemies)
  const escaped = new Set(result.escapedEnemies)

  const defeatedTargetIds: string[] = []
  const escapedTargetIds: string[] = []
  const survivingTargetIds: string[] = []
  const unknownTargetIds: string[] = []

  for (const id of requiredTargetIds) {
    if (defeated.has(id)) {
      defeatedTargetIds.push(id)
    } else if (escaped.has(id)) {
      escapedTargetIds.push(id)
    } else if (surviving.has(id)) {
      survivingTargetIds.push(id)
    } else {
      unknownTargetIds.push(id)
    }
  }

  if (unknownTargetIds.length > 0) {
    addLog(
      state,
      logEntry(
        'battle',
        'diagnostic',
        [],
        [
          `戦闘${battleId}: 討伐対象 ${unknownTargetIds.join(', ')} の最終状態が不明`,
        ],
      ),
    )
  }

  const confirmationRequired =
    request.elimination?.confirmationRequired ?? false
  const confirmedTargetIds = confirmationRequired ? [] : [...defeatedTargetIds]
  const progress = clamp(
    Math.round((defeatedTargetIds.length / requiredTargetIds.length) * 100),
    0,
    100,
  )
  const completed =
    unknownTargetIds.length === 0 &&
    defeatedTargetIds.length === requiredTargetIds.length &&
    confirmedTargetIds.length === requiredTargetIds.length

  const requiredSet = new Set(requiredTargetIds)
  const confirmedUnique = confirmedTargetIds.filter((id) => requiredSet.has(id))

  obj.defeatedTargetIds = defeatedTargetIds
  obj.escapedTargetIds = escapedTargetIds
  obj.survivingTargetIds = survivingTargetIds
  obj.unknownTargetIds = unknownTargetIds
  obj.confirmedTargetIds = confirmedUnique
  obj.progress = progress
  obj.completed = completed

  state.objectiveProgress = progress
  state.objectiveCompleted = completed

  addLog(
    state,
    logEntry(
      'battle',
      'eliminationTargetsAssigned',
      [],
      [
        `討伐対象として${requiredTargetIds.length}体が指定された`,
        `戦闘で${defeatedTargetIds.length}体を撃破した`,
        ...(escapedTargetIds.length > 0
          ? [`${escapedTargetIds.length}体が逃亡した`]
          : []),
        ...(survivingTargetIds.length > 0
          ? [`${survivingTargetIds.length}体が生存している`]
          : []),
        ...(unknownTargetIds.length > 0
          ? [`${unknownTargetIds.length}体の最終状態を確認できなかった`]
          : []),
        `討伐進捗は${progress}%となった`,
      ],
      [
        {
          type: 'eliminationTargets',
          value: requiredTargetIds.length,
        },
        {
          type: 'eliminationDefeated',
          value: defeatedTargetIds.length,
        },
        {
          type: 'eliminationEscaped',
          value: escapedTargetIds.length,
        },
        {
          type: 'eliminationSurviving',
          value: survivingTargetIds.length,
        },
        {
          type: 'eliminationUnknown',
          value: unknownTargetIds.length,
        },
        {
          type: 'eliminationProgress',
          value: progress,
        },
      ],
    ),
  )
}

function logEliminationConfirmationState(
  state: ExpeditionState,
  objective: EliminationObjectiveState,
  facts: string[],
  actorIds: string[] = [],
  check?: ExpeditionLogEntry['check'],
): void {
  addLog(
    state,
    logEntry(
      'objective',
      'eliminationConfirmation',
      actorIds,
      facts,
      [
        {
          type: 'eliminationConfirmed',
          value: objective.confirmedTargetIds.length,
        },
        {
          type: 'eliminationCompleted',
          value: objective.completed ? 1 : 0,
        },
      ],
      check,
    ),
  )
}

function updateEliminationCompleted(
  objective: EliminationObjectiveState,
): void {
  objective.completed =
    objective.unknownTargetIds.length === 0 &&
    objective.defeatedTargetIds.length === objective.requiredTargetIds.length &&
    objective.confirmedTargetIds.length === objective.requiredTargetIds.length
}

function runEliminationObjective(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  state.currentPhase = 'objective'

  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'elimination') {
    return
  }

  const { defeatedTargetIds, confirmationRequired } = obj

  if (defeatedTargetIds.length === 0) {
    obj.confirmedTargetIds = []
    updateEliminationCompleted(obj)
    state.objectiveCompleted = obj.completed
    logEliminationConfirmationState(state, obj, [
      '撃破対象が存在しないため、討伐確認は行われなかった',
      eliminationProgressFact(obj),
    ])
    return
  }

  if (!confirmationRequired) {
    obj.confirmedTargetIds = [...defeatedTargetIds]
    updateEliminationCompleted(obj)
    state.objectiveCompleted = obj.completed
    logEliminationConfirmationState(state, obj, [
      `撃破した${defeatedTargetIds.length}体の討伐を自動確認した`,
      eliminationProgressFact(obj),
    ])
    return
  }

  const skippedBattleOutcome =
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat'

  if (skippedBattleOutcome) {
    obj.confirmedTargetIds = []
    updateEliminationCompleted(obj)
    state.objectiveCompleted = obj.completed
    logEliminationConfirmationState(state, obj, [
      '撤退または戦闘継続不能のため、討伐確認を実施できなかった',
      eliminationProgressFact(obj),
    ])
    return
  }

  const confirmationSkill: SkillName =
    request.environment === 'magical' || request.environment === 'ruins'
      ? 'monsterKnowledge'
      : request.environment === 'mountain' || request.environment === 'desert'
        ? 'survival'
        : 'scouting'
  const preferredRole: AdventurerRole | undefined =
    confirmationSkill === 'monsterKnowledge'
      ? 'mage'
      : confirmationSkill === 'scouting'
        ? 'scout'
        : 'ranger'
  const rankPenalty = rankPenaltyForRequest(request)

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      confirmationSkill,
      preferredRole,
      10,
      rankPenalty,
    )

  const facts: string[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    obj.confirmedTargetIds = [...defeatedTargetIds]
    facts.push(`撃破した${defeatedTargetIds.length}体の討伐を確認した`)
  } else if (result === 'partialSuccess') {
    const confirmCount = Math.ceil(defeatedTargetIds.length / 2)
    obj.confirmedTargetIds = defeatedTargetIds.slice(0, confirmCount)
    facts.push(
      `撃破した${defeatedTargetIds.length}体のうち${confirmCount}体の討伐を確認した`,
    )
  } else if (result === 'failure') {
    obj.confirmedTargetIds = []
    facts.push('討伐確認に失敗した')
  } else {
    obj.confirmedTargetIds = []
    facts.push('討伐証明品を紛失・誤認した')
  }

  updateEliminationCompleted(obj)
  state.objectiveCompleted = obj.completed

  facts.push(eliminationProgressFact(obj))

  logEliminationConfirmationState(
    state,
    obj,
    facts,
    [primary.id, ...assistants.map((a) => a.id)],
    {
      skill: confirmationSkill,
      effectiveValue,
      roll,
      result,
    },
  )
}

function convertBattleInjuries(
  result: BattleResult,
  battleId: string,
  state: ExpeditionState,
): ExpeditionInjury[] {
  const injuries: ExpeditionInjury[] = []
  for (let i = 0; i < result.injuries.length; i++) {
    const injury = result.injuries[i]
    if (injury.category === 'dead') continue
    const type: 'light' | 'serious' =
      injury.category === 'light' ? 'light' : 'serious'
    const id = `${battleId}-injury-${injury.adventurerId}-${i}`
    if (
      state.injuries.some(
        (existing) =>
          existing.sourceType === 'battle' &&
          existing.sourceId === battleId &&
          existing.adventurerId === injury.adventurerId &&
          existing.type === type,
      )
    ) {
      continue
    }
    injuries.push({
      id,
      adventurerId: injury.adventurerId,
      type,
      cause: `battle: ${result.outcome}`,
      hpLoss: injury.severity,
      status: 'active',
      sourceType: 'battle',
      sourceId: battleId,
    })
  }
  return injuries
}

function applyBattleResultToExpedition(
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
): void {
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
}

function runExpeditionBattle(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
): void {
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

  if (state.objectiveState && state.objectiveState.type === 'elimination') {
    state.objectiveState.requiredTargetIds = enemies.map((enemy) => enemy.id)
  }

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
  applyBattleResultToExpedition(
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

  resolveEliminationTargets(state, result, request, battleId)
}

export const expeditionTestInternals = {
  applyExpeditionDamage,
  isUnresolvedInjury,
  isUnresolvedSeriousInjury,
  determineOutcome,
  getActiveParty,
  getNonDeadParty,
  buildBattleParty,
  environmentEffectsToBattleContext,
  applyKnownEnemyWeaknesses,
  matchKnownEnemyAbilities,
  convertBattleInjuries,
  applyBattleResultToExpedition,
  runExpeditionBattle,
  buildBattleEntrySnapshot,
  resolveSkillCheck,
  treatMember,
  resolveEliminationTargets,
  runEliminationObjective,
}

function runInvestigationExpedition(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionResult {
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

  const battleEnabled =
    request.battle !== undefined && request.battle.enabled === true
  if (battleEnabled && getActiveParty(party, state).length > 0) {
    runExpeditionBattle(request, party, state)
  }

  if (getActiveParty(party, state).length === 0) {
    setObjectiveCompletedFromProgress(state)
    state.currentPhase = 'aftermath'
    return {
      request,
      outcome: determineOutcome(request, state, party),
      state,
      party,
    }
  }

  const shouldSkipObjective =
    battleEnabled &&
    (state.battleOutcome === 'retreat' ||
      state.battleOutcome === 'stalemate' ||
      state.battleOutcome === 'defeat' ||
      state.battleOutcome === 'totalLoss')

  if (!shouldSkipObjective) {
    runObjective(request, party, state, rng)
  }

  if (getActiveParty(party, state).length === 0) {
    setObjectiveCompletedFromProgress(state)
    state.currentPhase = 'aftermath'
    return {
      request,
      outcome: determineOutcome(request, state, party),
      state,
      party,
    }
  }

  runReturn(request, party, state, rng)
  runAftermath(request, party, state, rng)

  setObjectiveCompletedFromProgress(state)
  state.currentPhase = 'aftermath'

  const outcome = determineOutcome(request, state, party)

  return { request, outcome, state, party }
}

function runEliminationExpedition(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionResult {
  if (request.elimination === undefined) {
    throw new Error('Elimination request requires elimination configuration')
  }
  if (request.battle === undefined) {
    throw new Error('Elimination request requires battle configuration')
  }
  if (!request.battle.enabled) {
    throw new Error('Elimination request requires battle.enabled === true')
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

  if (getActiveParty(party, state).length > 0) {
    runExpeditionBattle(request, party, state)
  }

  if (getActiveParty(party, state).length === 0) {
    state.currentPhase = 'aftermath'
    return {
      request,
      outcome: determineOutcome(request, state, party),
      state,
      party,
    }
  }

  runEliminationObjective(request, party, state, rng)

  if (getActiveParty(party, state).length === 0) {
    state.currentPhase = 'aftermath'
    return {
      request,
      outcome: determineOutcome(request, state, party),
      state,
      party,
    }
  }

  runReturn(request, party, state, rng)
  runAftermath(request, party, state, rng)

  state.currentPhase = 'aftermath'

  const outcome = determineOutcome(request, state, party)

  return { request, outcome, state, party }
}

export function runExpedition(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionResult {
  switch (request.objectiveType) {
    case 'investigation':
      return runInvestigationExpedition(request, party)

    case 'elimination':
      return runEliminationExpedition(request, party)

    default:
      throw new Error(
        `Unsupported objectiveType in Phase 3.2: ${request.objectiveType}`,
      )
  }
}
