import {
  Adventurer,
  AdventurerRole,
  SkillName,
  StatusEffect,
} from '../../models/types.ts'
import {
  CheckResult,
  EnvironmentType,
  EscortDestinationConfig,
  EscortObjectiveState,
  EscortTargetConfig,
  EscortTargetMobility,
  ExpeditionBattleResolvedContext,
  ExpeditionEffect,
  ExpeditionExecutionContext,
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import { getActiveParty, getNonDeadParty } from '../state.ts'
import { clamp } from '../../util.ts'
import { isUnresolvedSeriousInjury } from '../injuries.ts'
import { requestFeaturesFromState } from '../information.ts'
import { rankPenaltyForRequest, resolveSkillCheck } from '../checks.ts'

const ESCORT_BATTLE_EXPOSURE_MODIFIER: Record<string, number> = {
  victory: 0,
  costlyVictory: 8,
  partialVictory: 10,
  retreat: 15,
  stalemate: 15,
  defeat: 20,
  totalLoss: 30,
}

const ESCORT_ROUTE_BATTLE_MODIFIER: Record<string, number> = {
  victory: -5,
  costlyVictory: 0,
  partialVictory: 5,
  retreat: 10,
  stalemate: 10,
  defeat: 15,
  totalLoss: 0,
}

const ESCORT_EXPOSURE_DAMAGE: Record<CheckResult, number> = {
  criticalSuccess: 0,
  success: 0,
  partialSuccess: 4,
  failure: 10,
  criticalFailure: 18,
}

const ESCORT_EXPOSURE_STRESS: Record<string, number> = {
  victory: 5,
  costlyVictory: 10,
  partialVictory: 15,
  retreat: 20,
  stalemate: 20,
  defeat: 25,
  totalLoss: 30,
}

function escortRng(request: ExpeditionRequest, stage: string): SeededRng {
  return new SeededRng(`${request.seed}:escort:${stage}`)
}

function getEscortConfig(
  request: ExpeditionRequest,
): NonNullable<ExpeditionRequest['escort']> {
  if (request.escort === undefined) {
    throw new Error('Escort request requires escort configuration')
  }
  return request.escort
}

function getEscortObjective(state: ExpeditionState): EscortObjectiveState {
  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'escort') {
    throw new Error('Escort objective state is missing')
  }
  return obj
}

export function isEscortTargetAlive(objective: EscortObjectiveState): boolean {
  return objective.currentHp > 0
}

export type EscortTargetCondition = 'stable' | 'injured' | 'critical' | 'dead'

export function getEscortTargetCondition(
  objective: EscortObjectiveState,
): EscortTargetCondition {
  if (objective.currentHp <= 0) return 'dead'
  const ratio = objective.currentHp / objective.maxHp
  if (ratio <= 0.25) return 'critical'
  if (ratio < 0.7) return 'injured'
  return 'stable'
}

function hasEscortTargetStatus(
  objective: EscortObjectiveState,
  ...types: StatusEffect['type'][]
): boolean {
  return objective.statusEffects.some((e) => types.includes(e.type))
}

export type EscortDamageKind = 'travel' | 'battleExposure' | 'care'

function escortDamageField(
  objective: EscortObjectiveState,
  kind: EscortDamageKind,
  amount: number,
): void {
  switch (kind) {
    case 'travel':
      objective.travelDamage += amount
      break
    case 'battleExposure':
      objective.battleExposureDamage += amount
      break
    case 'care':
      objective.careDamage += amount
      break
  }
}

export function applyEscortTargetDamage(
  state: ExpeditionState,
  objective: EscortObjectiveState,
  damage: number,
  cause: string,
  phase: 'objective' | 'battle' | 'return',
  kind: EscortDamageKind,
): number {
  if (damage <= 0 || objective.currentHp <= 0) return 0
  const actual = Math.min(damage, objective.currentHp)
  objective.currentHp -= actual
  escortDamageField(objective, kind, actual)

  if (objective.currentHp === 0) {
    addLog(
      state,
      logEntry(
        phase,
        'escortTargetDeath',
        [],
        [`${objective.targetName}が${cause}で命を失った`],
        [
          { type: 'escortTargetHp', value: 0 },
          { type: 'escortAlive', value: 0 },
        ],
      ),
    )
  }

  return actual
}

export function healEscortTarget(
  state: ExpeditionState,
  objective: EscortObjectiveState,
  amount: number,
  cause: string,
  phase: 'objective' | 'return',
): number {
  if (amount <= 0 || objective.currentHp <= 0) return 0
  const actual = Math.min(amount, objective.maxHp - objective.currentHp)
  objective.currentHp += actual
  addLog(
    state,
    logEntry(
      phase,
      'escortTargetHeal',
      [],
      [`${objective.targetName}のHPが${actual}回復した（${cause}）`],
      [
        { type: 'escortTargetHeal', value: actual },
        { type: 'escortTargetHp', value: objective.currentHp },
        { type: 'escortAlive', value: 1 },
      ],
    ),
  )
  return actual
}

function removeEscortTargetStatus(
  objective: EscortObjectiveState,
  ...types: StatusEffect['type'][]
): number {
  let removed = 0
  objective.statusEffects = objective.statusEffects.filter((e) => {
    if (types.includes(e.type)) {
      removed++
      return false
    }
    return true
  })
  return removed
}

function removeOneEscortTargetStatus(
  objective: EscortObjectiveState,
  ...types: StatusEffect['type'][]
): StatusEffect['type'] | undefined {
  const index = objective.statusEffects.findIndex((e) => types.includes(e.type))
  if (index === -1) return undefined
  const removed = objective.statusEffects[index].type
  objective.statusEffects.splice(index, 1)
  return removed
}

function modifyEscortStress(
  objective: EscortObjectiveState,
  delta: number,
): number {
  const before = objective.travelStress
  objective.travelStress = clamp(before + delta, 0, 100)
  return objective.travelStress - before
}

function validateEscortDestination(destination: EscortDestinationConfig): void {
  if (destination.id === '') {
    throw new Error('Escort destination id must not be empty')
  }
  if (destination.name === '') {
    throw new Error('Escort destination name must not be empty')
  }
  if (
    destination.handoffDifficulty < 0 ||
    !Number.isFinite(destination.handoffDifficulty)
  ) {
    throw new Error('Escort handoffDifficulty must be finite non-negative')
  }
}

function validateEscortTarget(target: EscortTargetConfig): void {
  if (target.id === '') {
    throw new Error('Escort target id must not be empty')
  }
  if (target.name === '') {
    throw new Error('Escort target name must not be empty')
  }
  if (target.maxHp <= 0) {
    throw new Error('Escort target maxHp must be positive')
  }
  if (target.initialHp <= 0 || target.initialHp > target.maxHp) {
    throw new Error(
      'Escort target initialHp must be between 1 and maxHp inclusive',
    )
  }
  if (target.initialStress < 0 || target.initialStress > 100) {
    throw new Error('Escort target initialStress must be between 0 and 100')
  }
  if (
    target.coordinationDifficulty < 0 ||
    !Number.isFinite(target.coordinationDifficulty) ||
    target.routeDifficulty < 0 ||
    !Number.isFinite(target.routeDifficulty) ||
    target.protectionDifficulty < 0 ||
    !Number.isFinite(target.protectionDifficulty) ||
    target.careDifficulty < 0 ||
    !Number.isFinite(target.careDifficulty)
  ) {
    throw new Error('Escort target difficulties must be finite non-negative')
  }
}

export function validateEscortRequest(request: ExpeditionRequest): void {
  if (request.objectiveType !== 'escort') {
    throw new Error('Expected objectiveType escort')
  }
  if (request.escort === undefined) {
    throw new Error('Escort request requires escort configuration')
  }
  validateEscortTarget(request.escort.target)
  validateEscortDestination(request.escort.destination)
}

export function initializeEscortObjectiveState(
  request: ExpeditionRequest,
): EscortObjectiveState {
  const config = getEscortConfig(request)
  validateEscortTarget(config.target)
  validateEscortDestination(config.destination)
  const state: EscortObjectiveState = {
    type: 'escort',
    targetId: config.target.id,
    targetName: config.target.name,
    destinationId: config.destination.id,
    destinationName: config.destination.name,
    maxHp: config.target.maxHp,
    currentHp: config.target.initialHp,
    mobility: config.target.mobility,
    statusEffects: config.target.initialStatusEffects ?? [],
    travelStress: config.target.initialStress,
    accompanying: true,
    departed: false,
    coordinated: false,
    routeProgress: 0,
    travelDamage: 0,
    battleExposureDamage: 0,
    careProvided: false,
    careHealing: 0,
    careDamage: 0,
    destinationReached: false,
    handoffStatus: 'notStarted',
    delivered: false,
    returnedToOrigin: false,
    stranded: false,
    progress: 0,
    completed: false,
  }
  return state
}

function roleIsActive(
  party: Adventurer[],
  state: ExpeditionState,
  role: string,
): boolean {
  return getActiveParty(party, state).some((a) => a.role === role)
}

export function runEscortDeparture(context: ExpeditionExecutionContext): void {
  const { request, party, state } = context
  if (getActiveParty(party, state).length === 0) return
  const objective = getEscortObjective(state)
  if (!isEscortTargetAlive(objective)) return

  if (!objective.departed) {
    addLog(
      state,
      logEntry(
        'preparation',
        'escortTargetAssigned',
        [],
        [
          `護衛対象「${objective.targetName}」を「${objective.destinationName}」まで護衛する任務を開始した`,
        ],
        [
          { type: 'escortTargetHp', value: objective.currentHp },
          { type: 'escortStress', value: objective.travelStress },
          { type: 'escortRouteProgress', value: objective.routeProgress },
          { type: 'escortDelivered', value: 0 },
        ],
      ),
    )
  }

  const target = request.escort!.target
  const rng = escortRng(request, 'coordination')
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'preparation',
      'leadership',
      'support',
      target.coordinationDifficulty,
      rankPenaltyForRequest(request),
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (
    result === 'criticalSuccess' ||
    result === 'success' ||
    result === 'partialSuccess'
  ) {
    objective.coordinated = true
  } else {
    objective.coordinated = false
  }

  switch (result) {
    case 'criticalSuccess':
      modifyEscortStress(objective, -20)
      facts.push(`${primary.name}が護衛対象との行動を完璧に調整した`)
      break
    case 'success':
      modifyEscortStress(objective, -10)
      facts.push(`${primary.name}が護衛対象との行動を調整した`)
      break
    case 'partialSuccess':
      facts.push(`${primary.name}が護衛対象との行動を何とか調整した`)
      break
    case 'failure':
      modifyEscortStress(objective, 15)
      facts.push(`${primary.name}は護衛対象との行動調整に失敗した`)
      break
    case 'criticalFailure':
      modifyEscortStress(objective, 25)
      facts.push(`${primary.name}は護衛対象との行動調整に大きく失敗した`)
      break
  }

  objective.departed = true
  effects.push({
    type: 'escortCoordinated',
    value: objective.coordinated ? 1 : 0,
  })
  effects.push({ type: 'escortStress', value: objective.travelStress })
  effects.push({ type: 'escortTargetHp', value: objective.currentHp })

  addLog(
    state,
    logEntry(
      'preparation',
      'escortDeparture',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill: 'leadership',
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

const ROUTE_ENVIRONMENT: Record<
  EnvironmentType,
  { skill: SkillName; roles: AdventurerRole[] }
> = {
  magical: { skill: 'defenseMagic', roles: ['mage'] },
  cave: { skill: 'scouting', roles: ['scout', 'ranger'] },
  ruins: { skill: 'scouting', roles: ['scout', 'ranger'] },
  urban: { skill: 'scouting', roles: ['scout', 'ranger'] },
  forest: { skill: 'survival', roles: ['ranger', 'scout'] },
  mountain: { skill: 'survival', roles: ['ranger', 'scout'] },
  plains: { skill: 'survival', roles: ['ranger', 'scout'] },
  swamp: { skill: 'survival', roles: ['ranger', 'scout'] },
  desert: { skill: 'survival', roles: ['ranger', 'scout'] },
}

function environmentRouteDifficulty(): number {
  return 0
}

function routePreferredRole(
  party: Adventurer[],
  state: ExpeditionState,
  environment: EnvironmentType,
): AdventurerRole | undefined {
  const roles = ROUTE_ENVIRONMENT[environment].roles
  for (const role of roles) {
    if (roleIsActive(party, state, role)) return role
  }
  return undefined
}

function routeSkill(environment: EnvironmentType): SkillName {
  return ROUTE_ENVIRONMENT[environment].skill
}

function mobilityDifficulty(mobility: EscortTargetMobility): number {
  switch (mobility) {
    case 'assisted':
      return 8
    case 'immobile':
      return 15
    case 'mobile':
    default:
      return 0
  }
}

function mobilitySupportBonus(
  party: Adventurer[],
  state: ExpeditionState,
  mobility: EscortTargetMobility,
): number {
  if (mobility === 'mobile') return 0
  const active = getActiveParty(party, state)
  let bonus = 0
  if (active.some((a) => a.role === 'vanguard')) {
    bonus += 8
  } else if (active.some((a) => a.role === 'guardian')) {
    bonus += 4
  }
  if (active.some((a) => a.role === 'support')) {
    bonus += 3
  }
  return bonus
}

function stressModifier(objective: EscortObjectiveState): number {
  return Math.min(10, Math.floor(objective.travelStress / 20) * 2)
}

export function runEscortRoute(
  context: ExpeditionExecutionContext,
  leg: 1 | 2,
  battleOutcomeModifier = 0,
): boolean {
  const { request, party, state } = context
  if (getActiveParty(party, state).length === 0) return false
  const objective = getEscortObjective(state)
  if (!isEscortTargetAlive(objective)) return false

  const target = request.escort!.target
  const skill = routeSkill(request.environment)
  const preferredRole = routePreferredRole(party, state, request.environment)
  const rng = escortRng(request, `route:leg-${leg}`)

  const coordinationBonus = objective.coordinated ? 5 : 0
  const difficultyModifier =
    target.routeDifficulty +
    mobilityDifficulty(target.mobility) +
    stressModifier(objective) +
    environmentRouteDifficulty() -
    coordinationBonus -
    mobilitySupportBonus(party, state, target.mobility) +
    battleOutcomeModifier

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      skill,
      preferredRole,
      difficultyModifier,
      rankPenaltyForRequest(request),
    )

  let progressDelta = 0
  let stressDelta = 0
  let timeDelta = 0
  let damage = 0
  let fact = ''

  switch (result) {
    case 'criticalSuccess':
      progressDelta = 50
      stressDelta = -10
      fact = `${primary.name}が移動経路を素早く切り開いた`
      break
    case 'success':
      progressDelta = 50
      fact = `${primary.name}が移動経路を切り開いた`
      break
    case 'partialSuccess':
      progressDelta = 50
      stressDelta = 10
      timeDelta = 1
      fact = `${primary.name}は移動経路を何とか進んだが、護衛対象に負担がかかった`
      break
    case 'failure':
      progressDelta = 25
      stressDelta = 20
      timeDelta = 2
      damage = 4
      fact = `${primary.name}は移動経路で迷い、護衛対象が怪我をした`
      break
    case 'criticalFailure':
      progressDelta = 0
      stressDelta = 30
      timeDelta = 3
      damage = 8
      fact = `${primary.name}は移動経路を大きく誤り、護衛対象に大きな被害が出た`
      break
  }

  objective.routeProgress = clamp(
    objective.routeProgress + progressDelta,
    0,
    100,
  )
  modifyEscortStress(objective, stressDelta)
  state.elapsedTime += timeDelta

  let actualDamage = 0
  if (damage > 0) {
    actualDamage = applyEscortTargetDamage(
      state,
      objective,
      damage,
      '移動中の事故',
      'objective',
      'travel',
    )
  }

  const effects: ExpeditionEffect[] = [
    { type: 'escortRouteProgress', value: objective.routeProgress },
    { type: 'escortTargetHp', value: objective.currentHp },
    { type: 'escortStress', value: objective.travelStress },
  ]
  if (actualDamage > 0) {
    effects.push({ type: 'escortTargetDamage', value: actualDamage })
  }

  const facts: string[] = [fact]
  if (!isEscortTargetAlive(objective)) {
    facts.push(`${objective.targetName}は移動中に命を失った`)
  }

  addLog(
    state,
    logEntry(
      'objective',
      'escortRouteProgress',
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

  return isEscortTargetAlive(objective)
}

function pickActiveByRolePriority(
  party: Adventurer[],
  state: ExpeditionState,
  roles: AdventurerRole[],
  skill: SkillName,
): Adventurer | undefined {
  const active = getActiveParty(party, state)
  for (const role of roles) {
    const candidates = active.filter((a) => a.role === role)
    if (candidates.length > 0) {
      return candidates.reduce((best, a) =>
        a.skills[skill] > best.skills[skill] ? a : best,
      )
    }
  }
  return active.reduce(
    (best, a) => (a.skills[skill] > best.skills[skill] ? a : best),
    active[0],
  )
}

export function assignEscortProtector(
  context: ExpeditionExecutionContext,
): void {
  const { request, party, state } = context
  if (getActiveParty(party, state).length === 0) return
  const objective = getEscortObjective(state)
  const battleWillOccur = request.battle?.enabled === true
  if (!battleWillOccur) return
  if (!isEscortTargetAlive(objective)) return
  if (!objective.accompanying) return
  if (objective.delivered) return

  const protector = pickActiveByRolePriority(
    party,
    state,
    ['guardian', 'vanguard', 'support'],
    'defense',
  )
  if (!protector) return

  objective.protectorId = protector.id
  addLog(
    state,
    logEntry(
      'objective',
      'escortProtectorAssigned',
      [protector.id],
      [`${protector.name}（${protector.role}）が護衛対象の保護担当になった`],
      [
        { type: 'escortProtectorAssigned', value: 1, targetId: protector.id },
        { type: 'escortTargetHp', value: objective.currentHp },
      ],
    ),
  )
}

export function resolveEscortBattleExposure(
  context: ExpeditionBattleResolvedContext,
): void {
  const { request, party, state, battleId, battleResult } = context
  const objective = getEscortObjective(state)
  if (getActiveParty(party, state).length === 0) return
  if (!isEscortTargetAlive(objective)) return
  if (!objective.accompanying) return

  const target = request.escort!.target
  const battleOutcome = battleResult.outcome
  const outcomeModifier = ESCORT_BATTLE_EXPOSURE_MODIFIER[battleOutcome] ?? 0
  const roundModifier = Math.min(10, Math.max(0, battleResult.rounds - 6))
  const difficultyModifier =
    target.protectionDifficulty + outcomeModifier + roundModifier

  const preferredRole =
    objective.protectorId !== undefined
      ? getActiveParty(party, state).find((a) => a.id === objective.protectorId)
          ?.role
      : undefined

  const rng = escortRng(request, `battle-exposure:${battleId}`)
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'battle',
      'defense',
      preferredRole,
      difficultyModifier,
      rankPenaltyForRequest(request),
    )

  const damage = ESCORT_EXPOSURE_DAMAGE[result]
  const stressIncrease = ESCORT_EXPOSURE_STRESS[battleOutcome] ?? 0
  const adjustedStressIncrease = Math.max(
    0,
    stressIncrease - (result === 'criticalSuccess' ? 5 : 0),
  )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  facts.push(`${primary.name}が護衛対象の保護を担当した`)

  let actualDamage = 0
  if (damage > 0) {
    actualDamage = applyEscortTargetDamage(
      state,
      objective,
      damage,
      '戦闘の余波',
      'battle',
      'battleExposure',
    )
  }

  if (!isEscortTargetAlive(objective)) {
    facts.push(`${objective.targetName}は戦闘の余波で命を失った`)
  } else if (actualDamage === 0) {
    facts.push('戦闘中、護衛対象への追加被害は発生しなかった')
  } else {
    facts.push(
      `${objective.targetName}が戦闘の余波で${actualDamage}のダメージを負った`,
    )
  }

  modifyEscortStress(objective, adjustedStressIncrease)

  effects.push({ type: 'escortBattleExposureDamage', value: actualDamage })
  effects.push({ type: 'escortTargetHp', value: objective.currentHp })
  effects.push({ type: 'escortStress', value: objective.travelStress })

  addLog(
    state,
    logEntry(
      'battle',
      'escortBattleExposure',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill: 'defense',
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

function handoffStressModifier(objective: EscortObjectiveState): number {
  if (objective.travelStress < 50) return 0
  if (objective.travelStress < 75) return 5
  return 10
}

export function runEscortHandoff(context: ExpeditionExecutionContext): void {
  const { request, party, state } = context
  if (getActiveParty(party, state).length === 0) return
  const objective = getEscortObjective(state)
  if (!isEscortTargetAlive(objective)) return
  if (!objective.destinationReached) return

  const destination = request.escort!.destination

  if (destination.handoffRequirement === 'none') {
    objective.handoffStatus = 'notRequired'
    objective.delivered = true
    addLog(
      state,
      logEntry(
        'objective',
        'escortHandoff',
        [],
        [
          `${objective.targetName}は${destination.name}へ到着し、引き渡し手続きなしで護衛完了となった`,
        ],
        [
          { type: 'escortHandoffStatus', value: 1 },
          { type: 'escortDelivered', value: 1 },
        ],
      ),
    )
    return
  }

  const features = requestFeaturesFromState(state)
  const negotiationModifier = features.includes('negotiationOpportunity')
    ? 5
    : 0
  const difficultyModifier =
    destination.handoffDifficulty +
    handoffStressModifier(objective) +
    negotiationModifier

  const rng = escortRng(request, 'handoff')
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      'leadership',
      'support',
      difficultyModifier,
      rankPenaltyForRequest(request),
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    objective.handoffStatus = 'completed'
    objective.delivered = true
    facts.push(`${primary.name}が${destination.name}で引き渡しを完了した`)
  } else if (result === 'partialSuccess') {
    objective.handoffStatus = 'pending'
    objective.delivered = false
    facts.push(
      `${primary.name}は${destination.name}へ到着したが、正式な引き渡し手続きが保留となった`,
    )
  } else {
    objective.handoffStatus = 'failed'
    objective.delivered = false
    facts.push(`${primary.name}は${destination.name}での引き渡しに失敗した`)
  }

  effects.push({
    type: 'escortHandoffStatus',
    value:
      objective.handoffStatus === 'completed'
        ? 2
        : objective.handoffStatus === 'pending'
          ? 1
          : 0,
  })
  effects.push({ type: 'escortDelivered', value: objective.delivered ? 1 : 0 })
  effects.push({ type: 'escortTargetHp', value: objective.currentHp })

  addLog(
    state,
    logEntry(
      'objective',
      'escortHandoff',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill: 'leadership',
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

export function runEscortCare(context: ExpeditionExecutionContext): void {
  const { request, party, state } = context
  if (getActiveParty(party, state).length === 0) return
  const objective = getEscortObjective(state)
  if (!isEscortTargetAlive(objective)) return

  const needsCare =
    objective.currentHp < objective.maxHp ||
    hasEscortTargetStatus(objective, 'poisoned', 'bleeding')

  if (!needsCare) return

  const target = request.escort!.target
  const hasMedicine = state.supplies.medicine >= 1
  const medicineBonus = hasMedicine ? 10 : -10
  const difficultyModifier = target.careDifficulty - medicineBonus

  const rng = escortRng(request, 'care')
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      'healing',
      'healer',
      difficultyModifier,
      rankPenaltyForRequest(request),
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []
  let healing = 0
  let damage = 0

  if (
    (result === 'criticalSuccess' ||
      result === 'success' ||
      result === 'partialSuccess') &&
    hasMedicine
  ) {
    state.supplies.medicine -= 1
    facts.push('医薬品を1消費した')
    effects.push({ type: 'supplyConsume', value: 1, targetId: 'medicine' })
  }

  switch (result) {
    case 'criticalSuccess':
      healing = 12
      removeEscortTargetStatus(objective, 'poisoned', 'bleeding')
      objective.careProvided = true
      facts.push(
        `${primary.name}が${objective.targetName}の傷を完全に手当てした`,
      )
      break
    case 'success':
      healing = 8
      removeOneEscortTargetStatus(objective, 'poisoned', 'bleeding')
      objective.careProvided = true
      facts.push(`${primary.name}が${objective.targetName}の傷を手当てした`)
      break
    case 'partialSuccess':
      healing = 4
      objective.careProvided = true
      facts.push(
        `${primary.name}は${objective.targetName}の傷を一時的に手当てした`,
      )
      break
    case 'failure':
      objective.careProvided = false
      facts.push(`${primary.name}は${objective.targetName}の手当てに失敗した`)
      break
    case 'criticalFailure':
      damage = 3
      objective.careProvided = false
      facts.push(
        `${primary.name}は${objective.targetName}の手当てを誤り、傷を広げた`,
      )
      break
  }

  let actualHealing = 0
  if (healing > 0) {
    actualHealing = healEscortTarget(
      state,
      objective,
      healing,
      '治療',
      'objective',
    )
    objective.careHealing += actualHealing
  }

  let actualCareDamage = 0
  if (damage > 0) {
    actualCareDamage = applyEscortTargetDamage(
      state,
      objective,
      damage,
      '治療ミス',
      'objective',
      'care',
    )
  }

  if (!isEscortTargetAlive(objective)) {
    facts.push(`${objective.targetName}は治療中に命を失った`)
  }

  effects.push({ type: 'escortCareHealing', value: objective.careHealing })
  if (actualCareDamage > 0) {
    effects.push({ type: 'escortCareDamage', value: actualCareDamage })
  }
  effects.push({ type: 'escortTargetHp', value: objective.currentHp })

  addLog(
    state,
    logEntry(
      'objective',
      'escortCare',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill: 'healing',
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

export function runEscortObjective(context: ExpeditionExecutionContext): void {
  const { request, state } = context
  const objective = getEscortObjective(state)
  if (!isEscortTargetAlive(objective)) return

  runEscortCare(context)
  if (!isEscortTargetAlive(objective)) return

  const battleOutcome = state.battleOutcome
  const battleOutcomeModifier = battleOutcome
    ? (ESCORT_ROUTE_BATTLE_MODIFIER[battleOutcome] ?? 0)
    : 0

  runEscortRoute(context, 2, battleOutcomeModifier)
  if (!isEscortTargetAlive(objective)) return

  objective.destinationReached =
    objective.routeProgress >= 100 && objective.currentHp > 0

  if (objective.destinationReached) {
    addLog(
      state,
      logEntry(
        'objective',
        'escortDestinationReached',
        [],
        [
          `${objective.targetName}は${request.escort!.destination.name}へ到着した`,
        ],
        [
          { type: 'escortDestinationReached', value: 1 },
          { type: 'escortRouteProgress', value: objective.routeProgress },
          { type: 'escortTargetHp', value: objective.currentHp },
        ],
      ),
    )
    runEscortHandoff(context)
  }

  objective.progress = calculateEscortProgress(objective)
  objective.completed =
    objective.currentHp > 0 &&
    objective.destinationReached &&
    objective.delivered
}

export function runEscortFirstLeg(context: ExpeditionExecutionContext): void {
  runEscortRoute(context, 1, 0)
}

export function calculateEscortProgress(
  objective: EscortObjectiveState,
): number {
  const routePart = Math.round(clamp(objective.routeProgress, 0, 100) * 0.8)
  const deliveryPart = objective.delivered ? 20 : 0
  return clamp(routePart + deliveryPart, 0, 100)
}

export function escortProgressFact(objective: EscortObjectiveState): string {
  const progress = calculateEscortProgress(objective)
  const parts: string[] = []
  if (objective.departed) parts.push('出発済み')
  if (objective.coordinated) parts.push('行動調整済み')
  parts.push(`移動進捗${objective.routeProgress}%`)
  if (objective.destinationReached) parts.push('目的地到達')
  if (objective.handoffStatus !== 'notStarted') {
    const handoffText =
      objective.handoffStatus === 'completed' ||
      objective.handoffStatus === 'notRequired'
        ? '引き渡し完了'
        : objective.handoffStatus === 'pending'
          ? '引き渡し保留'
          : '引き渡し失敗'
    parts.push(handoffText)
  }
  if (objective.returnedToOrigin) parts.push('出発地点へ帰還')
  if (objective.stranded) parts.push('置き去り')
  return `護衛対象は${parts.join('・')}。護衛進捗は${progress}%`
}

export function prepareEscortReturn(context: ExpeditionExecutionContext): void {
  const { party, state } = context
  const objective = getEscortObjective(state)

  if (
    objective.delivered ||
    objective.handoffStatus === 'pending' ||
    objective.handoffStatus === 'completed' ||
    objective.handoffStatus === 'notRequired'
  ) {
    objective.accompanying = false
    objective.returnedToOrigin = false
    objective.stranded = false
    return
  }

  if (
    isEscortTargetAlive(objective) &&
    getActiveParty(party, state).length > 0
  ) {
    objective.accompanying = true
  } else {
    objective.accompanying = false
  }
  objective.returnedToOrigin = false
  objective.stranded = false
}

export function resolveEscortReturn(context: ExpeditionExecutionContext): void {
  const { party, state } = context
  const objective = getEscortObjective(state)

  if (
    objective.delivered ||
    objective.handoffStatus === 'pending' ||
    objective.handoffStatus === 'completed' ||
    objective.handoffStatus === 'notRequired'
  ) {
    return
  }

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (
    isEscortTargetAlive(objective) &&
    getActiveParty(party, state).length > 0
  ) {
    objective.returnedToOrigin = true
    objective.accompanying = false
    objective.stranded = false
    if (objective.destinationReached) {
      facts.push(
        '目的地での引き渡しに失敗したため、護衛対象を出発地点まで連れ戻した',
      )
    } else {
      facts.push(
        '護衛任務は完了しなかったが、護衛対象は出発地点まで連れ戻された',
      )
    }
    effects.push({ type: 'escortReturnedToOrigin', value: 1 })
  } else if (isEscortTargetAlive(objective)) {
    objective.returnedToOrigin = false
    objective.accompanying = false
    objective.stranded = true
    facts.push('護衛対象は出発地点へ戻ることができなかった')
    effects.push({ type: 'escortStranded', value: 1 })
  } else {
    objective.returnedToOrigin = false
    objective.accompanying = false
    objective.stranded = false
  }

  effects.push({ type: 'escortTargetHp', value: objective.currentHp })

  if (facts.length > 0) {
    addLog(state, logEntry('return', 'escortReturnResult', [], facts, effects))
  }
}

export function finalizeEscortObjectiveState(
  context: ExpeditionExecutionContext,
): { objectiveCompleted: boolean; progressFact: string } {
  const objective = getEscortObjective(context.state)
  objective.progress = calculateEscortProgress(objective)
  objective.completed =
    objective.currentHp > 0 &&
    objective.destinationReached &&
    objective.delivered
  context.state.objectiveProgress = objective.progress
  context.state.objectiveCompleted = objective.completed
  return {
    objectiveCompleted: objective.completed,
    progressFact: escortProgressFact(objective),
  }
}

export function determineEscortOutcome(
  context: ExpeditionOutcomeContext,
): ExpeditionOutcome {
  const { request, party, state } = context
  const allCasualties = state.casualties.length === party.length
  const activeCount = getActiveParty(party, state).length
  const allIncapacitated =
    !allCasualties &&
    activeCount === 0 &&
    getNonDeadParty(party, state).length > 0

  if (allCasualties || allIncapacitated) {
    return 'lostExpedition'
  }

  const objective = getEscortObjective(state)

  if (!isEscortTargetAlive(objective)) {
    return 'failedObjective'
  }

  const battleOutcome = state.battleOutcome
  const forcedBattleRetreat =
    battleOutcome === 'retreat' ||
    battleOutcome === 'stalemate' ||
    battleOutcome === 'defeat' ||
    battleOutcome === 'totalLoss'

  if (
    objective.currentHp > 0 &&
    objective.destinationReached &&
    objective.delivered
  ) {
    const ratio = objective.currentHp / objective.maxHp
    const timeExceeded =
      request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
    const hasCasualties = state.casualties.length > 0
    const unresolvedSerious = state.injuries.filter(
      isUnresolvedSeriousInjury,
    ).length

    if (
      !forcedBattleRetreat &&
      ratio >= 0.7 &&
      objective.travelStress < 50 &&
      !hasEscortTargetStatus(objective, 'poisoned', 'bleeding') &&
      !hasCasualties &&
      unresolvedSerious === 0 &&
      !timeExceeded
    ) {
      return 'completeSuccess'
    }

    return 'success'
  }

  if (objective.destinationReached && objective.handoffStatus === 'pending') {
    return 'partialSuccess'
  }

  if (!objective.delivered && forcedBattleRetreat) {
    return 'forcedRetreat'
  }

  return 'failedObjective'
}

export const escortHandler: ExpeditionObjectiveHandler = {
  flow: {
    preparation: true,
    approach: true,
    exploration: true,
    battle: 'optional',
    objective: true,
    objectiveAfterForcedBattleRetreat: false,
    return: true,
    aftermath: true,
  },

  validateRequest: validateEscortRequest,
  initializeObjectiveState: initializeEscortObjectiveState,

  afterPreparation(context: ExpeditionExecutionContext): void {
    runEscortDeparture(context)
  },

  beforeBattle(context: ExpeditionExecutionContext): void {
    runEscortFirstLeg(context)
    assignEscortProtector(context)
  },

  onBattleResolved(context): void {
    resolveEscortBattleExposure(context)
  },

  runObjective: runEscortObjective,

  beforeReturn: prepareEscortReturn,
  afterReturn: resolveEscortReturn,

  finalizeObjectiveState: finalizeEscortObjectiveState,
  determineOutcome: determineEscortOutcome,
}
