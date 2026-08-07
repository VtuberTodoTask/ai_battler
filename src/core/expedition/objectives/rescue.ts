import {
  Adventurer,
  AdventurerRole,
  BattleResult,
  SkillName,
  StatusEffect,
} from '../../models/types.ts'
import { CheckResult } from '../types.ts'
import {
  ExpeditionEffect,
  ExpeditionExecutionContext,
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  ExpeditionState,
  RescueObjectiveState,
  RescueTargetConfig,
  RescueTargetMobility,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import {
  applyExpeditionDamage,
  consumeSupplies,
  getActiveParty,
  getNonDeadParty,
} from '../state.ts'
import { clamp } from '../../util.ts'
import { isUnresolvedSeriousInjury } from '../injuries.ts'
import { requestFeaturesFromState } from '../information.ts'
import {
  absencePenaltyForSkill,
  calculateAssistanceBonus,
  difficultyBasePenalty,
  featurePenaltyForSkill,
  rankPenaltyForRequest,
  resolveCheck,
  resolveSkillCheck,
  roleBonusForSkill,
} from '../checks.ts'

const BATTLE_EXPOSURE_MODIFIER: Record<string, number> = {
  victory: 0,
  costlyVictory: 8,
  partialVictory: 10,
  retreat: 15,
  stalemate: 15,
  defeat: 20,
  totalLoss: 30,
}

const RESCUE_EXPOSURE_DAMAGE: Record<CheckResult, number> = {
  criticalSuccess: 0,
  success: 0,
  partialSuccess: 4,
  failure: 10,
  criticalFailure: 18,
}

function rescueRng(request: ExpeditionRequest, stage: string): SeededRng {
  return new SeededRng(`${request.seed}:rescue:${stage}`)
}

function getRescueConfig(
  request: ExpeditionRequest,
): NonNullable<ExpeditionRequest['rescue']> {
  if (request.rescue === undefined) {
    throw new Error('Rescue request requires rescue configuration')
  }
  return request.rescue
}

function getRescueObjective(state: ExpeditionState): RescueObjectiveState {
  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'rescue') {
    throw new Error('Rescue objective state is missing')
  }
  return obj
}

export function isRescueTargetAlive(objective: RescueObjectiveState): boolean {
  return objective.currentHp > 0
}

export type RescueTargetCondition = 'stable' | 'injured' | 'critical' | 'dead'

export function getRescueTargetCondition(
  objective: RescueObjectiveState,
): RescueTargetCondition {
  if (objective.currentHp <= 0) return 'dead'
  const ratio = objective.currentHp / objective.maxHp
  if (ratio <= 0.25) return 'critical'
  if (ratio < 0.7) return 'injured'
  return 'stable'
}

function hasRescueTargetStatus(
  objective: RescueObjectiveState,
  ...types: StatusEffect['type'][]
): boolean {
  return objective.statusEffects.some((e) => types.includes(e.type))
}

export function applyRescueTargetDamage(
  state: ExpeditionState,
  objective: RescueObjectiveState,
  damage: number,
  cause: string,
  phase: 'battle' | 'objective' | 'return',
): number {
  if (damage <= 0 || objective.currentHp <= 0) return 0
  const actual = Math.min(damage, objective.currentHp)
  objective.currentHp -= actual
  objective.battleExposureDamage += phase === 'battle' ? actual : 0
  objective.returnDamage += phase === 'return' ? actual : 0

  if (objective.currentHp === 0) {
    addLog(
      state,
      logEntry(
        phase,
        'rescueTargetDeath',
        [],
        [`${objective.targetName}が${cause}で命を失った`],
        [
          { type: 'rescueTargetDamage', value: actual },
          { type: 'rescueTargetHp', value: 0 },
          { type: 'rescueAlive', value: 0 },
        ],
      ),
    )
  }

  return actual
}

export function healRescueTarget(
  state: ExpeditionState,
  objective: RescueObjectiveState,
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
      'rescueTargetHeal',
      [],
      [`${objective.targetName}のHPが${actual}回復した（${cause}）`],
      [
        { type: 'rescueTargetHeal', value: actual },
        { type: 'rescueTargetHp', value: objective.currentHp },
        { type: 'rescueAlive', value: 1 },
      ],
    ),
  )
  return actual
}

function removeRescueTargetStatus(
  objective: RescueObjectiveState,
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

export function calculateRescueProgress(
  objective: RescueObjectiveState,
): number {
  let progress = 0
  if (objective.located) progress += 20
  if (objective.reached) progress += 20
  if (objective.stabilized) progress += 20
  if (objective.evacuated) progress += 20
  if (objective.returned) progress += 20
  return clamp(progress, 0, 100)
}

export function rescueProgressFact(objective: RescueObjectiveState): string {
  const steps: string[] = []
  steps.push(objective.located ? '発見済み' : '未発見')
  steps.push(objective.reached ? '接近済み' : '未接近')
  steps.push(objective.stabilized ? '安定化済み' : '未安定化')
  steps.push(objective.evacuated ? '搬出済み' : '未搬出')
  steps.push(objective.returned ? '帰還済み' : '未帰還')
  const progress = calculateRescueProgress(objective)
  return `救出対象は${steps.join('・')}。救出進捗は${progress}%`
}

function validateRescueTarget(target: RescueTargetConfig): void {
  if (target.id === '') {
    throw new Error('Rescue target id must not be empty')
  }
  if (target.maxHp <= 0) {
    throw new Error('Rescue target maxHp must be positive')
  }
  if (target.initialHp <= 0 || target.initialHp > target.maxHp) {
    throw new Error(
      'Rescue target initialHp must be between 1 and maxHp inclusive',
    )
  }
  if (
    target.discoveryDifficulty < 0 ||
    !Number.isFinite(target.discoveryDifficulty) ||
    target.accessDifficulty < 0 ||
    !Number.isFinite(target.accessDifficulty) ||
    target.stabilizationDifficulty < 0 ||
    !Number.isFinite(target.stabilizationDifficulty) ||
    target.evacuationDifficulty < 0 ||
    !Number.isFinite(target.evacuationDifficulty)
  ) {
    throw new Error('Rescue target difficulties must be finite non-negative')
  }
}

export function validateRescueRequest(request: ExpeditionRequest): void {
  if (request.objectiveType !== 'rescue') {
    throw new Error('Expected objectiveType rescue')
  }
  if (request.rescue === undefined) {
    throw new Error('Rescue request requires rescue configuration')
  }
  validateRescueTarget(request.rescue.target)
}

export function initializeRescueObjectiveState(
  request: ExpeditionRequest,
): RescueObjectiveState {
  const config = getRescueConfig(request)
  validateRescueTarget(config.target)
  return {
    type: 'rescue',
    targetId: config.target.id,
    targetName: config.target.name,
    maxHp: config.target.maxHp,
    currentHp: config.target.initialHp,
    mobility: config.target.mobility,
    statusEffects: config.target.initialStatusEffects
      ? config.target.initialStatusEffects.map((e) => ({ ...e }))
      : [],
    located: config.target.locationKnown,
    reached: false,
    stabilized: false,
    evacuated: false,
    returned: false,
    abandoned: false,
    battleExposureDamage: 0,
    returnDamage: 0,
    progress: 0,
    completed: false,
  }
}

function selectRescueSearcherRole(
  party: Adventurer[],
): AdventurerRole | undefined {
  if (party.some((a) => a.role === 'scout')) return 'scout'
  if (party.some((a) => a.role === 'ranger')) return 'ranger'
  return undefined
}

function accessSkillForEnvironment(
  environment: ExpeditionRequest['environment'],
): { skill: SkillName; preferredRole: AdventurerRole } {
  switch (environment) {
    case 'forest':
    case 'mountain':
    case 'swamp':
    case 'desert':
    case 'plains':
      return { skill: 'survival', preferredRole: 'ranger' }
    case 'cave':
    case 'ruins':
    case 'urban':
      return { skill: 'scouting', preferredRole: 'scout' }
    case 'magical':
      return { skill: 'defenseMagic', preferredRole: 'mage' }
  }
}

function selectRescueProtector(
  active: Adventurer[],
  objective: RescueObjectiveState,
): Adventurer {
  if (objective.protectorId !== undefined) {
    const current = active.find((a) => a.id === objective.protectorId)
    if (current) return current
  }
  const byRole = (role: AdventurerRole) =>
    active
      .filter((a) => a.role === role)
      .sort((a, b) => b.skills.defense - a.skills.defense)[0]
  const guardian = byRole('guardian')
  if (guardian) return guardian
  const vanguard = byRole('vanguard')
  if (vanguard) return vanguard
  const support = byRole('support')
  if (support) return support
  return active.sort((a, b) => b.skills.defense - a.skills.defense)[0]
}

function resolveRescueDefenseCheck(
  rng: SeededRng,
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  primary: Adventurer,
  difficultyModifier: number,
): { result: CheckResult; effectiveValue: number; roll: number } {
  const active = getActiveParty(party, state)
  const ordered = [...active].sort(
    (a, b) => b.skills.defense - a.skills.defense,
  )
  const assistants = ordered.filter((a) => a.id !== primary.id).slice(0, 2)
  const assistance = calculateAssistanceBonus(assistants, 'defense')
  const roleBonus = roleBonusForSkill(active, 'defense')
  const absencePenalty = absencePenaltyForSkill(active, 'defense')
  const featurePenalty = featurePenaltyForSkill(
    requestFeaturesFromState(state),
    'defense',
  )
  const rankPenalty = rankPenaltyForRequest(request)
  const basePenalty = difficultyBasePenalty(request.difficulty)
  const effectiveValue = clamp(
    primary.skills.defense +
      assistance +
      roleBonus -
      difficultyModifier -
      rankPenalty -
      basePenalty -
      absencePenalty -
      featurePenalty,
    1,
    100,
  )
  const { result, roll } = resolveCheck(rng, effectiveValue)
  return { result, effectiveValue, roll }
}

function rescueSearchBonus(state: ExpeditionState): {
  bonus: number
  canSearch: boolean
} {
  const outcome = state.battleOutcome
  if (outcome === undefined) return { bonus: 0, canSearch: true }
  if (outcome === 'victory' || outcome === 'costlyVictory') {
    return { bonus: 10, canSearch: true }
  }
  if (outcome === 'partialVictory') {
    return { bonus: 5, canSearch: true }
  }
  return { bonus: 0, canSearch: false }
}

export function runRescueSearch(
  context: ExpeditionExecutionContext,
  stage: string,
  searchBonus: number,
): void {
  const { request, party, state } = context
  const objective = getRescueObjective(state)
  const target = request.rescue!.target
  const rng = rescueRng(request, stage)
  const rankPenalty = rankPenaltyForRequest(request)
  const preferredRole = selectRescueSearcherRole(getActiveParty(party, state))
  const discoveryDifficulty = Math.max(
    0,
    target.discoveryDifficulty - searchBonus,
  )

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'contact',
      'scouting',
      preferredRole,
      discoveryDifficulty,
      rankPenalty,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess') {
    objective.located = true
    facts.push(`${primary.name}が即座に${objective.targetName}の位置を特定した`)
    setAccessBonus(state, 10)
  } else if (result === 'success') {
    objective.located = true
    facts.push(`${primary.name}が${objective.targetName}の位置を特定した`)
  } else if (result === 'partialSuccess') {
    objective.located = true
    state.elapsedTime += 1
    facts.push(
      `${primary.name}が${objective.targetName}の位置をぎりぎりで特定した`,
    )
    setAccessBonus(state, -5)
  } else if (result === 'failure') {
    objective.located = false
    state.elapsedTime += 1
    facts.push(
      `${primary.name}は${objective.targetName}の位置を見つけられなかった`,
    )
  } else {
    objective.located = false
    state.elapsedTime += 2
    facts.push(
      `${primary.name}は${objective.targetName}の位置を特定できず、大きな時間を失った`,
    )
  }

  effects.push({ type: 'rescueLocated', value: objective.located ? 1 : 0 })
  effects.push({
    type: 'rescueProgress',
    value: calculateRescueProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'contact',
      'rescueSearch',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill: 'scouting',
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

function setAccessBonus(state: ExpeditionState, bonus: number): void {
  state.metadata ??= {}
  ;(state.metadata as Record<string, unknown>).rescueAccessBonus = bonus
}

function getAccessBonus(state: ExpeditionState): number {
  return (state.metadata?.rescueAccessBonus as number | undefined) ?? 0
}

export function runRescueAccess(
  context: ExpeditionExecutionContext,
  stage: string,
  bonus: number,
): void {
  const { request, party, state } = context
  const objective = getRescueObjective(state)
  const target = request.rescue!.target
  const { skill, preferredRole } = accessSkillForEnvironment(
    request.environment,
  )
  const rng = rescueRng(request, stage)
  const rankPenalty = rankPenaltyForRequest(request)

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'contact',
      skill,
      preferredRole,
      target.accessDifficulty - bonus,
      rankPenalty,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess') {
    objective.reached = true
    facts.push(`${primary.name}が難なく${objective.targetName}のもとへ到達した`)
  } else if (result === 'success') {
    objective.reached = true
    facts.push(`${primary.name}が${objective.targetName}のもとへ到達した`)
  } else if (result === 'partialSuccess') {
    objective.reached = true
    state.elapsedTime += 1
    const hadTools = consumeSupplies(state, 0, 0, 1)
    if (hadTools) {
      facts.push('用具を1消費して道を切り開いた')
      effects.push({ type: 'supplyConsume', value: 1, targetId: 'tools' })
    }
    facts.push(
      `${primary.name}は${objective.targetName}のもとへ到達したが、多少の遅延が生じた`,
    )
  } else if (result === 'failure') {
    objective.reached = false
    facts.push(
      `${primary.name}は${objective.targetName}のもとへ到達できなかった`,
    )
  } else {
    objective.reached = false
    const active = getActiveParty(party, state)
    if (active.length > 0) {
      const targetMember = rng.pick(active)
      applyExpeditionDamage(
        state,
        party,
        targetMember,
        rng.integer(3, 6),
        '接近失敗',
        false,
        rng,
      )
      facts.push(
        `${primary.name}は接近に失敗し、${targetMember.name}が負傷した`,
      )
    } else {
      facts.push(`${primary.name}は接近に失敗した`)
    }
  }

  effects.push({ type: 'rescueReached', value: objective.reached ? 1 : 0 })
  effects.push({
    type: 'rescueProgress',
    value: calculateRescueProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'contact',
      'rescueTargetReached',
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

function assignRescueProtector(context: ExpeditionExecutionContext): void {
  const { party, state } = context
  const objective = getRescueObjective(state)
  if (!objective.located || !objective.reached) return
  const active = getActiveParty(party, state)
  if (active.length === 0) return
  const protector = selectRescueProtector(active, objective)
  objective.protectorId = protector.id
  addLog(
    state,
    logEntry(
      'contact',
      'rescueProtectorAssigned',
      [protector.id],
      [
        `${protector.name}（${protector.role}）が${objective.targetName}の保護担当になった`,
      ],
      [{ type: 'rescueProtector', value: 1, targetId: protector.id }],
    ),
  )
}

export function resolveRescueBattleExposure(
  context: ExpeditionExecutionContext,
  battleResult: BattleResult,
): void {
  const { request, party, state, battleId } =
    context as ExpeditionExecutionContext & { battleId?: string }
  const objective = getRescueObjective(state)
  if (
    !objective.located ||
    !objective.reached ||
    !isRescueTargetAlive(objective) ||
    battleId === undefined
  ) {
    return
  }

  const active = getActiveParty(party, state)
  if (active.length === 0) return
  const protector = selectRescueProtector(active, objective)

  const baseModifier = BATTLE_EXPOSURE_MODIFIER[battleResult.outcome] ?? 10
  const roundModifier = Math.min(10, Math.max(0, battleResult.rounds - 6))
  const difficultyModifier = baseModifier + roundModifier

  const stage = `battle-exposure:${battleId}`
  const rng = rescueRng(request, stage)
  const { result, effectiveValue, roll } = resolveRescueDefenseCheck(
    rng,
    request,
    party,
    state,
    protector,
    difficultyModifier,
  )

  const damage = RESCUE_EXPOSURE_DAMAGE[result]
  const actual = applyRescueTargetDamage(
    state,
    objective,
    damage,
    '戦闘に巻き込まれた影響',
    'battle',
  )

  const facts: string[] = []
  if (result === 'criticalSuccess' || result === 'success') {
    facts.push(`${protector.name}が${objective.targetName}を戦闘から守り切った`)
  } else if (result === 'partialSuccess') {
    facts.push(
      `${protector.name}は${objective.targetName}を守ったが、${actual}のダメージを負わせてしまった`,
    )
  } else if (result === 'failure') {
    facts.push(
      `${protector.name}は${objective.targetName}を守りきれず、${actual}のダメージを負わせた`,
    )
  } else {
    facts.push(
      `${protector.name}は${objective.targetName}を守れず、${actual}の重大なダメージを負わせた`,
    )
  }

  addLog(
    state,
    logEntry(
      'battle',
      'rescueBattleExposure',
      [protector.id],
      facts,
      [
        { type: 'rescueTargetDamage', value: actual },
        { type: 'rescueTargetHp', value: objective.currentHp },
        { type: 'rescueAlive', value: isRescueTargetAlive(objective) ? 1 : 0 },
        { type: 'rescueProgress', value: calculateRescueProgress(objective) },
      ],
      {
        skill: 'defense',
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

function runFinalRescueSearch(context: ExpeditionExecutionContext): void {
  const { state } = context
  const objective = getRescueObjective(state)
  if (objective.located) return
  const { bonus, canSearch } = rescueSearchBonus(state)
  if (!canSearch) return
  runRescueSearch(context, 'final-search', bonus)
}

function runRescueReAccess(context: ExpeditionExecutionContext): void {
  const { state } = context
  const objective = getRescueObjective(state)
  if (!objective.located || objective.reached) return
  const outcome = state.battleOutcome
  const battleBonus =
    outcome === 'victory' || outcome === 'costlyVictory' ? 5 : 0
  const searchAccessBonus = getAccessBonus(state)
  runRescueAccess(context, 'reaccess', battleBonus + searchAccessBonus)
}

function runRescueStabilization(context: ExpeditionExecutionContext): void {
  const { request, party, state } = context
  const objective = getRescueObjective(state)
  if (!objective.reached || !isRescueTargetAlive(objective)) return

  const target = request.rescue!.target
  const rng = rescueRng(request, 'stabilization')
  const rankPenalty = rankPenaltyForRequest(request)

  const hasMedicine = state.supplies.medicine > 0
  const medicineBonus = hasMedicine ? 10 : -10
  const hpRatio = objective.currentHp / objective.maxHp
  const hpBonus = hpRatio <= 0.25 ? 10 : 0
  const statusBonus = hasRescueTargetStatus(objective, 'poisoned', 'bleeding')
    ? 5
    : 0

  const difficultyModifier =
    target.stabilizationDifficulty - medicineBonus - hpBonus - statusBonus

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      'healing',
      'healer',
      difficultyModifier,
      rankPenalty,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess') {
    objective.stabilized = true
    const healed = healRescueTarget(
      state,
      objective,
      20,
      'healing critical success',
      'objective',
    )
    removeRescueTargetStatus(objective, 'poisoned', 'bleeding')
    facts.push(
      `${primary.name}が${objective.targetName}を完全に安定化し、毒と出血を解除した`,
    )
    if (healed > 0) facts.push(`HPが${healed}回復した`)
    if (hasMedicine) {
      consumeSupplies(state, 0, 1, 0)
      facts.push('医薬品を1消費した')
      effects.push({ type: 'supplyConsume', value: 1, targetId: 'medicine' })
    }
  } else if (result === 'success') {
    objective.stabilized = true
    const healed = healRescueTarget(
      state,
      objective,
      12,
      'healing success',
      'objective',
    )
    removeRescueTargetStatus(objective, 'poisoned')
    facts.push(`${primary.name}が${objective.targetName}を安定化した`)
    if (healed > 0) facts.push(`HPが${healed}回復した`)
    if (hasMedicine) {
      consumeSupplies(state, 0, 1, 0)
      facts.push('医薬品を1消費した')
      effects.push({ type: 'supplyConsume', value: 1, targetId: 'medicine' })
    }
  } else if (result === 'partialSuccess') {
    const healed = healRescueTarget(
      state,
      objective,
      5,
      'healing partial success',
      'objective',
    )
    if (hpRatio > 0.25) {
      objective.stabilized = true
      facts.push(
        `${primary.name}が${objective.targetName}を一時的に安定化させた`,
      )
    } else {
      objective.stabilized = false
      facts.push(
        `${primary.name}は${objective.targetName}の傷を手当てしたが、状態は不安定である`,
      )
    }
    if (healed > 0) facts.push(`HPが${healed}回復した`)
  } else if (result === 'failure') {
    objective.stabilized = false
    facts.push(
      `${primary.name}は${objective.targetName}の状態を安定化できなかった`,
    )
  } else {
    objective.stabilized = false
    const actual = applyRescueTargetDamage(
      state,
      objective,
      4,
      '応急処置の失敗',
      'objective',
    )
    facts.push(
      `${primary.name}の応急処置が裏目に出て、${objective.targetName}が${actual}のダメージを負った`,
    )
  }

  effects.push({
    type: 'rescueStabilized',
    value: objective.stabilized ? 1 : 0,
  })
  effects.push({ type: 'rescueTargetHp', value: objective.currentHp })
  effects.push({
    type: 'rescueAlive',
    value: isRescueTargetAlive(objective) ? 1 : 0,
  })
  effects.push({
    type: 'rescueProgress',
    value: calculateRescueProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'objective',
      'rescueStabilization',
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

export function runRescueObjective(context: ExpeditionExecutionContext): void {
  const { state } = context
  const objective = getRescueObjective(state)
  if (getActiveParty(context.party, state).length === 0) return
  state.currentPhase = 'objective'

  if (!objective.located) {
    runFinalRescueSearch(context)
  }

  if (objective.located && !objective.reached) {
    runRescueReAccess(context)
  }

  if (!isRescueTargetAlive(objective)) {
    addLog(
      state,
      logEntry(
        'objective',
        'rescueFailed',
        [],
        [`${objective.targetName}は救出前に息を引き取った`],
        [
          { type: 'rescueAlive', value: 0 },
          { type: 'rescueTargetHp', value: 0 },
        ],
      ),
    )
    return
  }

  if (objective.reached) {
    runRescueStabilization(context)
  }

  objective.progress = calculateRescueProgress(objective)
  objective.completed =
    isRescueTargetAlive(objective) && objective.evacuated && objective.returned
}

function evacuationDetails(mobility: RescueTargetMobility): {
  skill: SkillName
  preferredRole: AdventurerRole
  mobilityModifier: number
  returnTimeBonus: number
} {
  switch (mobility) {
    case 'mobile':
      return {
        skill: 'survival',
        preferredRole: 'ranger',
        mobilityModifier: 0,
        returnTimeBonus: 0,
      }
    case 'assisted':
      return {
        skill: 'defense',
        preferredRole: 'guardian',
        mobilityModifier: 8,
        returnTimeBonus: 1,
      }
    case 'immobile':
      return {
        skill: 'defense',
        preferredRole: 'guardian',
        mobilityModifier: 15,
        returnTimeBonus: 2,
      }
  }
}

function activeRole(
  party: Adventurer[],
  state: ExpeditionState,
  role: AdventurerRole,
): boolean {
  return getActiveParty(party, state).some((a) => a.role === role)
}

export function prepareRescueEvacuation(
  context: ExpeditionExecutionContext,
): void {
  const { request, party, state } = context
  const objective = getRescueObjective(state)
  if (
    !objective.located ||
    !objective.reached ||
    !isRescueTargetAlive(objective)
  ) {
    return
  }

  const target = request.rescue!.target
  const rng = rescueRng(request, 'evacuation')
  const rankPenalty = rankPenaltyForRequest(request)

  const { skill, preferredRole, mobilityModifier, returnTimeBonus } =
    evacuationDetails(objective.mobility)

  const unstabilizedModifier = objective.stabilized ? 0 : 10
  const supportBonus = activeRole(party, state, 'support') ? 5 : 0
  const healerBonus =
    activeRole(party, state, 'healer') &&
    getRescueTargetCondition(objective) !== 'stable'
      ? 5
      : 0

  const difficultyModifier =
    target.evacuationDifficulty +
    mobilityModifier +
    unstabilizedModifier -
    supportBonus -
    healerBonus

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      skill,
      preferredRole,
      difficultyModifier,
      rankPenalty,
    )

  state.metadata ??= {}
  const meta = state.metadata as Record<string, unknown>
  meta.rescueEvacuationResult = result

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    objective.evacuated = true
    facts.push(`${primary.name}が${objective.targetName}を危険地帯から搬出した`)
  } else if (result === 'partialSuccess') {
    objective.evacuated = true
    const actual = applyRescueTargetDamage(
      state,
      objective,
      2,
      '搬出中の軽微な事故',
      'objective',
    )
    if (!isRescueTargetAlive(objective)) {
      objective.evacuated = false
      facts.push(
        `${primary.name}は搬出を試みたが、${objective.targetName}が${actual}のダメージで命を失った`,
      )
    } else {
      facts.push(
        `${primary.name}が${objective.targetName}を搬出したが、${actual}のダメージを負わせた`,
      )
    }
    if (objective.evacuated) {
      const currentBonus = (meta.returnTimeBonus as number | undefined) ?? 0
      meta.returnTimeBonus = currentBonus + 1
      facts.push('搬出に手間取り、帰還に余分な時間がかかる')
      effects.push({ type: 'returnTimeBonus', value: 1 })
    }
  } else if (result === 'failure') {
    objective.evacuated = false
    facts.push(`${primary.name}は${objective.targetName}を搬出できなかった`)
  } else {
    objective.evacuated = false
    const actual = applyRescueTargetDamage(
      state,
      objective,
      6,
      '搬出の失敗',
      'objective',
    )
    if (!isRescueTargetAlive(objective)) {
      facts.push(
        `${primary.name}は搬出に失敗し、${objective.targetName}が${actual}のダメージで命を失った`,
      )
    } else {
      facts.push(
        `${primary.name}は搬出に大きく失敗し、${objective.targetName}が${actual}のダメージを負った`,
      )
    }
  }

  if (objective.evacuated) {
    meta.rescueTargetEvacuated = true
    meta.rescueTargetMobility = objective.mobility
    const currentBonus = (meta.returnTimeBonus as number | undefined) ?? 0
    meta.returnTimeBonus = currentBonus + returnTimeBonus
    if (returnTimeBonus > 0) {
      facts.push(
        `移動能力${objective.mobility}のため、帰還に${returnTimeBonus}の時間を要する`,
      )
      effects.push({ type: 'returnTimeBonus', value: returnTimeBonus })
    }
  }

  effects.push({ type: 'rescueEvacuated', value: objective.evacuated ? 1 : 0 })
  effects.push({ type: 'rescueTargetHp', value: objective.currentHp })
  effects.push({
    type: 'rescueAlive',
    value: isRescueTargetAlive(objective) ? 1 : 0,
  })
  effects.push({
    type: 'rescueProgress',
    value: calculateRescueProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'objective',
      'rescueEvacuation',
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

export function resolveRescueReturn(context: ExpeditionExecutionContext): void {
  const { request, party, state } = context
  const objective = getRescueObjective(state)
  const active = getActiveParty(party, state)

  const meta = state.metadata as Record<string, unknown>
  const evacuationResult = meta.rescueEvacuationResult as
    CheckResult | undefined

  if (
    objective.evacuated &&
    active.length > 0 &&
    evacuationResult !== 'partialSuccess'
  ) {
    objective.returned = true
  } else {
    objective.returned = false
    if (
      !objective.evacuated &&
      objective.located &&
      objective.reached &&
      isRescueTargetAlive(objective)
    ) {
      objective.abandoned = true
    }
  }

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (objective.returned && isRescueTargetAlive(objective)) {
    facts.push(`${objective.targetName}を拠点まで連れ帰った`)
  } else if (objective.returned) {
    facts.push(`${objective.targetName}の遺体を拠点まで運んだ`)
  } else if (objective.evacuated && active.length > 0) {
    facts.push(
      `${objective.targetName}を危険地帯から離れたが、拠点までは連れ帰れなかった`,
    )
  } else if (objective.abandoned) {
    facts.push(`${objective.targetName}を置き去りにした`)
  }

  if (isRescueTargetAlive(objective) && evacuationResult === 'partialSuccess') {
    facts.push('搬出は成功したが、完全な帰還には至らなかった')
  }

  if (objective.evacuated && isRescueTargetAlive(objective)) {
    const notStabilized = !objective.stabilized
    const poisonedOrBleeding = hasRescueTargetStatus(
      objective,
      'poisoned',
      'bleeding',
    )
    if (notStabilized || poisonedOrBleeding) {
      const rng = rescueRng(request, 'return')
      let chance = objective.stabilized ? 0 : 20
      if (poisonedOrBleeding) chance += 15
      if (activeRole(party, state, 'healer')) chance -= 10
      chance = clamp(chance, 0, 35)
      if (rng.chance(chance)) {
        const damage = rng.integer(3, 8)
        const actual = applyRescueTargetDamage(
          state,
          objective,
          damage,
          '帰還中の状態悪化',
          'return',
        )
        facts.push(
          `${objective.targetName}の状態が帰還中に悪化し、${actual}のダメージを負った`,
        )
      } else {
        facts.push(`${objective.targetName}は帰還中に状態を維持した`)
      }
    }
  }

  effects.push({ type: 'rescueReturned', value: objective.returned ? 1 : 0 })
  effects.push({ type: 'rescueAbandoned', value: objective.abandoned ? 1 : 0 })
  effects.push({ type: 'rescueTargetHp', value: objective.currentHp })
  effects.push({
    type: 'rescueAlive',
    value: isRescueTargetAlive(objective) ? 1 : 0,
  })
  effects.push({
    type: 'rescueProgress',
    value: calculateRescueProgress(objective),
  })

  addLog(state, logEntry('return', 'rescueReturn', [], facts, effects))
}

export function finalizeRescueObjectiveState(
  context: ExpeditionExecutionContext,
): { objectiveCompleted: boolean; progressFact: string } {
  const objective = getRescueObjective(context.state)
  objective.progress = calculateRescueProgress(objective)
  objective.completed =
    isRescueTargetAlive(objective) && objective.evacuated && objective.returned
  context.state.objectiveProgress = objective.progress
  context.state.objectiveCompleted = objective.completed
  return {
    objectiveCompleted: objective.completed,
    progressFact: rescueProgressFact(objective),
  }
}

export function determineRescueOutcome(
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

  const objective = getRescueObjective(state)

  if (!isRescueTargetAlive(objective)) {
    return 'failedObjective'
  }

  const battleOutcome = state.battleOutcome
  const forcedBattleRetreat =
    battleOutcome === 'retreat' ||
    battleOutcome === 'stalemate' ||
    battleOutcome === 'defeat' ||
    battleOutcome === 'totalLoss'

  if (!objective.evacuated) {
    if (forcedBattleRetreat) {
      return 'forcedRetreat'
    }
    if (!objective.located || !objective.reached || objective.abandoned) {
      return 'failedObjective'
    }
    return 'failedObjective'
  }

  if (!objective.returned) {
    return 'partialSuccess'
  }

  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const hasCasualties = state.casualties.length > 0
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length
  const condition = getRescueTargetCondition(objective)

  if (
    objective.stabilized &&
    condition !== 'critical' &&
    condition !== 'injured' &&
    !hasCasualties &&
    unresolvedSerious === 0 &&
    !timeExceeded
  ) {
    return 'completeSuccess'
  }

  return 'success'
}

export function runInitialRescueSearch(
  context: ExpeditionExecutionContext,
): void {
  const { state, request } = context
  const objective = getRescueObjective(state)
  const target = request.rescue!.target
  if (target.locationKnown) {
    objective.located = true
    addLog(
      state,
      logEntry(
        'contact',
        'rescueTargetLocated',
        [],
        [
          '事前情報から対象の位置を把握していた',
          `${objective.targetName}の位置は既に判明していた`,
        ],
        [
          { type: 'rescueLocated', value: 1 },
          { type: 'rescueProgress', value: calculateRescueProgress(objective) },
        ],
      ),
    )
    return
  }
  runRescueSearch(context, 'initial-search', 0)
}

export const rescueHandler: ExpeditionObjectiveHandler = {
  flow: {
    preparation: true,
    approach: true,
    exploration: true,
    battle: 'optional',
    objective: true,
    return: true,
    aftermath: true,
  },
  validateRequest: validateRescueRequest,
  initializeObjectiveState: initializeRescueObjectiveState,
  beforeBattle(context: ExpeditionExecutionContext): void {
    const { request, state } = context
    const objective = getRescueObjective(state)
    const battleWillOccur = request.battle?.enabled === true
    runInitialRescueSearch(context)
    if (objective.located && !objective.reached) {
      runRescueAccess(context, 'access', getAccessBonus(state))
    }
    if (battleWillOccur && objective.located && objective.reached) {
      assignRescueProtector(context)
    }
  },
  onBattleResolved(context): void {
    resolveRescueBattleExposure(context, context.battleResult)
  },
  runObjective: runRescueObjective,
  beforeReturn: prepareRescueEvacuation,
  afterReturn: resolveRescueReturn,
  finalizeObjectiveState: finalizeRescueObjectiveState,
  determineOutcome: determineRescueOutcome,
}
