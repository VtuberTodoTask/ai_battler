import { Adventurer, AdventurerRole, SkillName } from '../../models/types.ts'
import {
  CheckResult,
  ExpeditionEffect,
  ExpeditionExecutionContext,
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionPhase,
  ExpeditionRequest,
  ExpeditionState,
  RetrievalObjectiveState,
  RetrievalTargetConfig,
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
import { rankPenaltyForRequest, resolveSkillCheck } from '../checks.ts'

const RETRIEVAL_BATTLE_MODIFIER: Record<string, number> = {
  victory: 0,
  costlyVictory: 8,
  partialVictory: 10,
  retreat: 15,
  stalemate: 15,
  defeat: 20,
  totalLoss: 30,
}

const RETRIEVAL_BATTLE_DAMAGE: Record<CheckResult, number> = {
  criticalSuccess: 0,
  success: 0,
  partialSuccess: 5,
  failure: 12,
  criticalFailure: 20,
}

const RETRIEVAL_BULK_MODIFIER: Record<RetrievalObjectiveState['bulk'], number> =
  {
    portable: 0,
    bulky: 8,
    heavy: 15,
  }

const RETRIEVAL_SECURING_DAMAGE: Record<CheckResult, number> = {
  criticalSuccess: 0,
  success: 0,
  partialSuccess: 5,
  failure: 0,
  criticalFailure: 12,
}

const RETRIEVAL_EXTRACTION_DAMAGE: Record<CheckResult, number> = {
  criticalSuccess: 0,
  success: 0,
  partialSuccess: 4,
  failure: 0,
  criticalFailure: 8,
}

export function retrievalRng(
  request: ExpeditionRequest,
  stage: string,
): SeededRng {
  return new SeededRng(`${request.seed}:retrieval:${stage}`)
}

function getRetrievalConfig(
  request: ExpeditionRequest,
): NonNullable<ExpeditionRequest['retrieval']> {
  if (request.retrieval === undefined) {
    throw new Error('Retrieval request requires retrieval configuration')
  }
  return request.retrieval
}

export function getRetrievalObjective(
  state: ExpeditionState,
): RetrievalObjectiveState {
  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'retrieval') {
    throw new Error('Retrieval objective state is missing')
  }
  return obj
}

export function isRetrievalTargetDestroyed(
  objective: RetrievalObjectiveState,
): boolean {
  return objective.currentIntegrity <= 0
}

export function applyRetrievalDamage(
  state: ExpeditionState,
  objective: RetrievalObjectiveState,
  damage: number,
  cause: string,
  phase: ExpeditionPhase,
  kind: 'battleExposure' | 'securing' | 'extraction',
): number {
  if (damage <= 0 || objective.currentIntegrity <= 0) return 0
  const actual = Math.min(damage, objective.currentIntegrity)
  objective.currentIntegrity -= actual

  if (kind === 'battleExposure') {
    objective.battleExposureDamage += actual
  } else if (kind === 'securing') {
    objective.securingDamage += actual
  } else {
    objective.extractionDamage += actual
  }

  if (objective.currentIntegrity === 0) {
    addLog(
      state,
      logEntry(
        phase,
        'retrievalTargetDestroyed',
        [],
        [`${objective.targetName}が${cause}で破壊された`],
        [
          { type: 'retrievalIntegrity', value: 0 },
          { type: 'retrievalDestroyed', value: 1 },
        ],
      ),
    )
  }

  return actual
}

export function retrievalFragilityModifier(
  fragility: RetrievalObjectiveState['fragility'],
): number {
  switch (fragility) {
    case 'rugged':
      return -5
    case 'standard':
      return 0
    case 'fragile':
      return 10
  }
}

function requiredCarrierCount(bulk: RetrievalObjectiveState['bulk']): number {
  switch (bulk) {
    case 'portable':
      return 1
    case 'bulky':
      return 2
    case 'heavy':
      return 3
  }
}

function validateRetrievalTarget(target: RetrievalTargetConfig): void {
  if (target.id === '') {
    throw new Error('Retrieval target id must not be empty')
  }
  if (target.name === '') {
    throw new Error('Retrieval target name must not be empty')
  }
  if (
    target.initialIntegrity < 1 ||
    target.initialIntegrity > 100 ||
    !Number.isInteger(target.initialIntegrity)
  ) {
    throw new Error(
      'Retrieval target initialIntegrity must be an integer between 1 and 100',
    )
  }
  if (
    target.minimumAcceptableIntegrity < 1 ||
    target.minimumAcceptableIntegrity > 100 ||
    !Number.isInteger(target.minimumAcceptableIntegrity)
  ) {
    throw new Error(
      'Retrieval target minimumAcceptableIntegrity must be an integer between 1 and 100',
    )
  }
  if (target.minimumAcceptableIntegrity > target.initialIntegrity) {
    throw new Error(
      'Retrieval target minimumAcceptableIntegrity must not exceed initialIntegrity',
    )
  }
  if (
    target.discoveryDifficulty < 0 ||
    !Number.isFinite(target.discoveryDifficulty) ||
    target.accessDifficulty < 0 ||
    !Number.isFinite(target.accessDifficulty) ||
    target.securingDifficulty < 0 ||
    !Number.isFinite(target.securingDifficulty) ||
    target.protectionDifficulty < 0 ||
    !Number.isFinite(target.protectionDifficulty) ||
    target.extractionDifficulty < 0 ||
    !Number.isFinite(target.extractionDifficulty)
  ) {
    throw new Error('Retrieval target difficulties must be finite non-negative')
  }
}

export function validateRetrievalRequest(request: ExpeditionRequest): void {
  if (request.objectiveType !== 'retrieval') {
    throw new Error('Expected objectiveType retrieval')
  }
  if (request.retrieval === undefined) {
    throw new Error('Retrieval request requires retrieval configuration')
  }
  validateRetrievalTarget(request.retrieval.target)
}

export function initializeRetrievalObjectiveState(
  request: ExpeditionRequest,
): RetrievalObjectiveState {
  const config = getRetrievalConfig(request)
  validateRetrievalTarget(config.target)
  return {
    type: 'retrieval',
    targetId: config.target.id,
    targetName: config.target.name,
    initialIntegrity: config.target.initialIntegrity,
    minimumAcceptableIntegrity: config.target.minimumAcceptableIntegrity,
    currentIntegrity: config.target.initialIntegrity,
    bulk: config.target.bulk,
    handling: config.target.handling,
    fragility: config.target.fragility,
    located: config.target.locationKnown,
    reached: false,
    secured: false,
    protectedForTransport: false,
    extracted: false,
    returned: false,
    abandoned: false,
    lostDuringReturn: false,
    carrierIds: [],
    battleExposureDamage: 0,
    securingDamage: 0,
    extractionDamage: 0,
    progress: 0,
    completed: false,
  }
}

function setSearchAccessBonus(state: ExpeditionState, bonus: number): void {
  state.metadata ??= {}
  ;(state.metadata as Record<string, unknown>).retrievalSearchAccessBonus =
    bonus
}

function getSearchAccessBonus(state: ExpeditionState): number {
  return (state.metadata?.retrievalSearchAccessBonus as number | undefined) ?? 0
}

function searchSkillAndPreferredRole(): {
  skill: SkillName
  preferredRole: AdventurerRole
} {
  return { skill: 'scouting', preferredRole: 'scout' }
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

function retrievalBattleSearchBonus(state: ExpeditionState): number {
  const outcome = state.battleOutcome
  if (outcome === 'victory' || outcome === 'costlyVictory') return 10
  if (outcome === 'partialVictory') return 5
  return 0
}

function retrievalBattleAccessBonus(state: ExpeditionState): number {
  const outcome = state.battleOutcome
  if (outcome === 'victory' || outcome === 'costlyVictory') return 5
  return 0
}

function isForcedBattleRetreat(
  battleOutcome: ExpeditionState['battleOutcome'],
): boolean {
  if (battleOutcome === undefined) return false
  return (
    battleOutcome === 'retreat' ||
    battleOutcome === 'stalemate' ||
    battleOutcome === 'defeat' ||
    battleOutcome === 'totalLoss'
  )
}

export function calculateRetrievalProgress(
  objective: RetrievalObjectiveState,
): number {
  let progress = 0
  if (objective.located) progress += 15
  if (objective.reached) progress += 15
  if (objective.secured) progress += 25
  if (objective.extracted) progress += 20
  if (objective.returned) progress += 25
  return clamp(progress, 0, 100)
}

export function retrievalProgressFact(
  objective: RetrievalObjectiveState,
): string {
  const steps: string[] = []
  steps.push(objective.located ? '発見済み' : '未発見')
  steps.push(objective.reached ? '到達済み' : '未到達')
  steps.push(objective.secured ? '確保済み' : '未確保')
  steps.push(objective.extracted ? '搬出済み' : '未搬出')
  steps.push(objective.returned ? '帰還済み' : '未帰還')
  const progress = calculateRetrievalProgress(objective)
  return `回収対象は${steps.join('・')}。回収進捗は${progress}%`
}

function retrievalTargetAssignedLog(context: ExpeditionExecutionContext): void {
  const { request, state } = context
  const objective = getRetrievalObjective(state)
  const target = getRetrievalConfig(request).target
  addLog(
    state,
    logEntry(
      'preparation',
      'retrievalTargetAssigned',
      [],
      [
        `回収対象「${objective.targetName}」の回収依頼を引き受けた`,
        `bulk=${target.bulk}, handling=${target.handling}, fragility=${target.fragility}`,
      ],
      [
        { type: 'retrievalIntegrity', value: objective.currentIntegrity },
        {
          type: 'retrievalInitialIntegrity',
          value: objective.initialIntegrity,
        },
        {
          type: 'retrievalMinimumIntegrity',
          value: objective.minimumAcceptableIntegrity,
        },
        { type: 'retrievalLocated', value: objective.located ? 1 : 0 },
        { type: 'retrievalReached', value: objective.reached ? 1 : 0 },
        {
          type: 'retrievalProgress',
          value: calculateRetrievalProgress(objective),
        },
      ],
    ),
  )
}

export function runRetrievalSearch(
  context: ExpeditionExecutionContext,
  stage: string,
  searchBonus: number,
): void {
  const { request, party, state } = context
  const objective = getRetrievalObjective(state)
  const target = getRetrievalConfig(request).target
  const rng = retrievalRng(request, stage)
  const rankPenalty = rankPenaltyForRequest(request)
  const { skill, preferredRole } = searchSkillAndPreferredRole()

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
      skill,
      preferredRole,
      discoveryDifficulty,
      rankPenalty,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess') {
    objective.located = true
    facts.push(`${primary.name}が即座に${objective.targetName}の位置を特定した`)
    setSearchAccessBonus(state, 10)
  } else if (result === 'success') {
    objective.located = true
    facts.push(`${primary.name}が${objective.targetName}の位置を特定した`)
  } else if (result === 'partialSuccess') {
    objective.located = true
    state.elapsedTime += 1
    facts.push(
      `${primary.name}が${objective.targetName}の位置をようやく特定したが、少し手間取った`,
    )
    setSearchAccessBonus(state, -5)
  } else if (result === 'failure') {
    objective.located = false
    state.elapsedTime += 1
    facts.push(
      `${primary.name}は${objective.targetName}の位置を特定できなかった`,
    )
  } else {
    objective.located = false
    state.elapsedTime += 2
    facts.push(
      `${primary.name}は${objective.targetName}の位置を特定できず、大きな時間を失った`,
    )
  }

  effects.push({ type: 'retrievalLocated', value: objective.located ? 1 : 0 })
  effects.push({
    type: 'retrievalProgress',
    value: calculateRetrievalProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'contact',
      'retrievalSearch',
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

function runInitialRetrievalSearch(context: ExpeditionExecutionContext): void {
  const { request, state } = context
  const objective = getRetrievalObjective(state)
  const target = getRetrievalConfig(request).target
  if (target.locationKnown) {
    objective.located = true
    addLog(
      state,
      logEntry(
        'contact',
        'retrievalTargetLocated',
        [],
        [`事前情報から${objective.targetName}の位置は既に判明していた`],
        [
          { type: 'retrievalLocated', value: 1 },
          {
            type: 'retrievalProgress',
            value: calculateRetrievalProgress(objective),
          },
        ],
      ),
    )
    return
  }
  runRetrievalSearch(context, 'initial-search', 0)
}

export function runRetrievalAccess(
  context: ExpeditionExecutionContext,
  stage: string,
  bonus: number,
): void {
  const { request, party, state } = context
  const objective = getRetrievalObjective(state)
  if (!objective.located || isRetrievalTargetDestroyed(objective)) return
  const target = getRetrievalConfig(request).target
  const { skill, preferredRole } = accessSkillForEnvironment(
    request.environment,
  )
  const rng = retrievalRng(request, stage)
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

  if (result === 'criticalSuccess' || result === 'success') {
    objective.reached = true
    facts.push(`${primary.name}が${objective.targetName}のもとへ到達した`)
  } else if (result === 'partialSuccess') {
    objective.reached = true
    state.elapsedTime += 1
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
    state.elapsedTime += 1
    facts.push(
      `${primary.name}は${objective.targetName}への接近に失敗し、道を切り開く途中で被害が出た`,
    )
    const active = getActiveParty(party, state)
    if (active.length > 0) {
      const targetMember = rng.pick(active)
      const damage = applyExpeditionDamage(
        state,
        party,
        targetMember,
        rng.integer(3, 6),
        '接近失敗',
        false,
        rng,
      )
      if (damage.value && damage.value > 0) {
        effects.push(damage)
      }
    }
  }

  effects.push({ type: 'retrievalReached', value: objective.reached ? 1 : 0 })
  effects.push({
    type: 'retrievalProgress',
    value: calculateRetrievalProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'contact',
      'retrievalAccess',
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

function selectRetrievalProtector(
  active: Adventurer[],
  objective: RetrievalObjectiveState,
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

function assignRetrievalProtector(context: ExpeditionExecutionContext): void {
  const { party, state } = context
  const objective = getRetrievalObjective(state)
  const active = getActiveParty(party, state)
  if (
    active.length === 0 ||
    !objective.located ||
    !objective.reached ||
    isRetrievalTargetDestroyed(objective)
  ) {
    return
  }
  const protector = selectRetrievalProtector(active, objective)
  objective.protectorId = protector.id
  addLog(
    state,
    logEntry(
      'contact',
      'retrievalProtectorAssigned',
      [protector.id],
      [
        `${protector.name}（${protector.role}）が${objective.targetName}の保護担当になった`,
      ],
      [{ type: 'retrievalProtector', value: 1, targetId: protector.id }],
    ),
  )
}

import type { ExpeditionBattleResolvedContext } from '../types.ts'

export function resolveRetrievalBattleExposure(
  context: ExpeditionBattleResolvedContext,
): void {
  const { request, party, state, battleResult } = context
  const objective = getRetrievalObjective(state)
  if (
    !objective.reached ||
    isRetrievalTargetDestroyed(objective) ||
    context.battleId === undefined
  ) {
    return
  }
  const active = getActiveParty(party, state)
  if (active.length === 0) return
  const protector = selectRetrievalProtector(active, objective)
  const target = getRetrievalConfig(request).target

  const baseModifier = RETRIEVAL_BATTLE_MODIFIER[battleResult.outcome] ?? 10
  const roundModifier = Math.min(10, Math.max(0, battleResult.rounds - 6))
  const difficultyModifier =
    target.protectionDifficulty +
    retrievalFragilityModifier(objective.fragility) +
    baseModifier +
    roundModifier
  const rankPenalty = rankPenaltyForRequest(request)

  const rng = retrievalRng(request, `battle-exposure:${context.battleId}`)
  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'battle',
      'defense',
      protector.role,
      difficultyModifier,
      rankPenalty,
    )

  const damage = RETRIEVAL_BATTLE_DAMAGE[result]
  const actual = applyRetrievalDamage(
    state,
    objective,
    damage,
    '戦闘の余波',
    'battle',
    'battleExposure',
  )

  if (isRetrievalTargetDestroyed(objective)) {
    objective.secured = false
    objective.protectedForTransport = false
    objective.extracted = false
  }

  const facts: string[] = []
  if (result === 'criticalSuccess' || result === 'success') {
    facts.push(`${primary.name}が${objective.targetName}を戦闘から守り切った`)
  } else if (result === 'partialSuccess') {
    facts.push(
      `${primary.name}は${objective.targetName}を守ったが、${actual}の損傷を受けた`,
    )
  } else if (result === 'failure') {
    facts.push(
      `${primary.name}は${objective.targetName}を守りきれず、${actual}の損傷を負わせた`,
    )
  } else {
    facts.push(
      `${primary.name}は${objective.targetName}を守れず、${actual}の重大な損傷を負わせた`,
    )
  }

  const effects: ExpeditionEffect[] = [
    { type: 'retrievalDamage', value: actual },
    { type: 'retrievalIntegrity', value: objective.currentIntegrity },
    {
      type: 'retrievalBattleExposureDamage',
      value: objective.battleExposureDamage,
    },
    { type: 'retrievalProgress', value: calculateRetrievalProgress(objective) },
  ]

  addLog(
    state,
    logEntry(
      'battle',
      'retrievalBattleExposure',
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

function runFinalRetrievalSearch(context: ExpeditionExecutionContext): void {
  const { state } = context
  const objective = getRetrievalObjective(state)
  if (objective.located) return
  const bonus = retrievalBattleSearchBonus(state)
  runRetrievalSearch(context, 'final-search', bonus)
}

function runRetrievalReAccess(context: ExpeditionExecutionContext): void {
  const { state } = context
  const objective = getRetrievalObjective(state)
  if (!objective.located || objective.reached) return
  const battleBonus = retrievalBattleAccessBonus(state)
  const searchAccessBonus = getSearchAccessBonus(state)
  runRetrievalAccess(context, 'reaccess', battleBonus + searchAccessBonus)
}

function securingSkillAndPreferredRole(
  handling: RetrievalObjectiveState['handling'],
): { skill: SkillName; preferredRole: AdventurerRole } {
  switch (handling) {
    case 'standard':
      return { skill: 'scouting', preferredRole: 'support' }
    case 'delicate':
      return { skill: 'scouting', preferredRole: 'scout' }
    case 'arcane':
      return { skill: 'defenseMagic', preferredRole: 'mage' }
  }
}

function securingRoleBonus(
  party: Adventurer[],
  state: ExpeditionState,
  handling: RetrievalObjectiveState['handling'],
): number {
  const active = getActiveParty(party, state)
  switch (handling) {
    case 'standard':
      return active.some((a) => a.role === 'support') ? 5 : 0
    case 'delicate':
      return active.some((a) => a.role === 'scout') ? 5 : 0
    case 'arcane':
      return active.some((a) => a.role === 'mage') ? 5 : 0
  }
}

function supportBonus(
  party: Adventurer[],
  state: ExpeditionState,
  handling: RetrievalObjectiveState['handling'],
): number {
  if (handling === 'arcane') return 0
  const active = getActiveParty(party, state)
  return active.some((a) => a.role === 'support') ? 5 : 0
}

export function runRetrievalSecuring(
  context: ExpeditionExecutionContext,
): void {
  const { request, party, state } = context
  const objective = getRetrievalObjective(state)
  if (
    !objective.located ||
    !objective.reached ||
    isRetrievalTargetDestroyed(objective)
  ) {
    return
  }
  const target = getRetrievalConfig(request).target
  const rng = retrievalRng(request, 'securing')
  const rankPenalty = rankPenaltyForRequest(request)
  const { skill, preferredRole } = securingSkillAndPreferredRole(
    objective.handling,
  )

  const roleBonus = securingRoleBonus(party, state, objective.handling)
  const support = supportBonus(party, state, objective.handling)
  const hasTools = state.supplies.tools >= 1
  const toolsBonus = hasTools ? 10 : 0

  const difficultyModifier =
    target.securingDifficulty +
    retrievalFragilityModifier(objective.fragility) -
    roleBonus -
    support -
    toolsBonus

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

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    objective.secured = true
    objective.protectedForTransport = true
    facts.push(
      `${primary.name}は${objective.targetName}を確保し、運搬可能な状態にした`,
    )
  } else if (result === 'partialSuccess') {
    objective.secured = true
    objective.protectedForTransport = false
    const actual = applyRetrievalDamage(
      state,
      objective,
      RETRIEVAL_SECURING_DAMAGE.partialSuccess,
      '確保作業の失敗',
      'objective',
      'securing',
    )
    facts.push(
      `${primary.name}は${objective.targetName}を確保したが、${actual}の損傷を受けた`,
    )
    effects.push({ type: 'retrievalDamage', value: actual })
  } else if (result === 'failure') {
    objective.secured = false
    objective.protectedForTransport = false
    facts.push(`${primary.name}は${objective.targetName}を確保できなかった`)
  } else {
    objective.secured = false
    objective.protectedForTransport = false
    const actual = applyRetrievalDamage(
      state,
      objective,
      RETRIEVAL_SECURING_DAMAGE.criticalFailure,
      '確保作業の重大な失敗',
      'objective',
      'securing',
    )
    facts.push(
      `${primary.name}は${objective.targetName}の確保に失敗し、${actual}の損傷を与えた`,
    )
    effects.push({ type: 'retrievalDamage', value: actual })
  }

  if (isRetrievalTargetDestroyed(objective)) {
    objective.secured = false
    objective.protectedForTransport = false
  }

  if (
    (result === 'criticalSuccess' ||
      result === 'success' ||
      result === 'partialSuccess') &&
    hasTools
  ) {
    consumeSupplies(state, 0, 0, 1)
    facts.push('用具を1消費して回収作業を助けた')
    effects.push({ type: 'supplyConsume', value: 1, targetId: 'tools' })
  }

  effects.push({ type: 'retrievalSecured', value: objective.secured ? 1 : 0 })
  effects.push({
    type: 'retrievalProtectedForTransport',
    value: objective.protectedForTransport ? 1 : 0,
  })
  effects.push({
    type: 'retrievalSecuringDamage',
    value: objective.securingDamage,
  })
  effects.push({
    type: 'retrievalIntegrity',
    value: objective.currentIntegrity,
  })
  effects.push({
    type: 'retrievalProgress',
    value: calculateRetrievalProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'objective',
      'retrievalSecuring',
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

function selectCarriers(
  active: Adventurer[],
  objective: RetrievalObjectiveState,
): Adventurer[] {
  const rolePriority: AdventurerRole[] = [
    'vanguard',
    'guardian',
    'support',
    'ranger',
  ]
  const byRole = rolePriority
    .map((role) =>
      active
        .filter((a) => a.role === role)
        .sort((a, b) => b.stats.str - a.stats.str),
    )
    .flat()
  const others = active
    .filter((a) => !rolePriority.includes(a.role))
    .sort((a, b) => b.stats.str - a.stats.str)
  const ordered = [...byRole, ...others]
  return ordered.slice(0, requiredCarrierCount(objective.bulk))
}

function extractionSkillAndPreferredRole(
  bulk: RetrievalObjectiveState['bulk'],
): { skill: SkillName; preferredRole: AdventurerRole } {
  if (bulk === 'portable') {
    return { skill: 'survival', preferredRole: 'ranger' }
  }
  return { skill: 'survival', preferredRole: 'vanguard' }
}

function extractionRoleBonus(
  party: Adventurer[],
  state: ExpeditionState,
  bulk: RetrievalObjectiveState['bulk'],
): number {
  const active = getActiveParty(party, state)
  let bonus = 0
  const hasVanguard = active.some((a) => a.role === 'vanguard')
  const hasGuardian = active.some((a) => a.role === 'guardian')
  const hasSupport = active.some((a) => a.role === 'support')
  const hasRanger = active.some((a) => a.role === 'ranger')

  if (bulk === 'bulky' || bulk === 'heavy') {
    if (hasVanguard) {
      bonus += 8
    } else if (hasGuardian) {
      bonus += 4
    }
  } else if (bulk === 'portable' && hasRanger) {
    bonus += 5
  }

  if (hasSupport) {
    bonus += 5
  }

  return bonus
}

export function prepareRetrievalExtraction(
  context: ExpeditionExecutionContext,
): void {
  const { request, party, state } = context
  const objective = getRetrievalObjective(state)
  if (
    !objective.secured ||
    isRetrievalTargetDestroyed(objective) ||
    getActiveParty(party, state).length === 0
  ) {
    return
  }
  const active = getActiveParty(party, state)
  const required = requiredCarrierCount(objective.bulk)
  if (active.length < required) {
    objective.extracted = false
    objective.carrierIds = []
    addLog(
      state,
      logEntry(
        'return',
        'retrievalCarriersAssigned',
        [],
        [
          `回収対象を運ぶには${required}名の運搬担当が必要だが、活動可能な冒険者が${active.length}名しかいなかった`,
        ],
        [
          { type: 'retrievalCarrierCount', value: 0 },
          { type: 'retrievalRequiredCarriers', value: required },
          { type: 'retrievalExtracted', value: 0 },
        ],
      ),
    )
    return
  }

  const carriers = selectCarriers(active, objective)
  objective.carrierIds = carriers.map((a) => a.id)

  const target = getRetrievalConfig(request).target
  const rng = retrievalRng(request, 'extraction')
  const rankPenalty = rankPenaltyForRequest(request)
  const { skill, preferredRole } = extractionSkillAndPreferredRole(
    objective.bulk,
  )

  const bulkModifier = RETRIEVAL_BULK_MODIFIER[objective.bulk]
  const fragilityModifier = retrievalFragilityModifier(objective.fragility)
  const transportProtectionBonus = objective.protectedForTransport ? 10 : 0
  const roleBonus = extractionRoleBonus(party, state, objective.bulk)

  const difficultyModifier =
    target.extractionDifficulty +
    bulkModifier +
    fragilityModifier -
    transportProtectionBonus -
    roleBonus

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'return',
      skill,
      preferredRole,
      difficultyModifier,
      rankPenalty,
    )

  const facts: string[] = [
    `運搬担当: ${carriers.map((a) => `${a.name}（${a.role}）`).join(', ')}`,
  ]
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    objective.extracted = true
    facts.push(`${primary.name}は${objective.targetName}を危険地帯から搬出した`)
  } else if (result === 'partialSuccess') {
    objective.extracted = true
    state.elapsedTime += 1
    const actual = applyRetrievalDamage(
      state,
      objective,
      RETRIEVAL_EXTRACTION_DAMAGE.partialSuccess,
      '搬出作業',
      'return',
      'extraction',
    )
    facts.push(
      `${primary.name}は${objective.targetName}を搬出したが、${actual}の損傷を受けた`,
    )
    effects.push({ type: 'retrievalDamage', value: actual })
  } else if (result === 'failure') {
    objective.extracted = false
    facts.push(`${primary.name}は${objective.targetName}を搬出できなかった`)
  } else {
    objective.extracted = false
    state.elapsedTime += 1
    const actual = applyRetrievalDamage(
      state,
      objective,
      RETRIEVAL_EXTRACTION_DAMAGE.criticalFailure,
      '搬出作業の重大な失敗',
      'return',
      'extraction',
    )
    facts.push(
      `${primary.name}は${objective.targetName}の搬出に失敗し、${actual}の損傷を与えた`,
    )
    effects.push({ type: 'retrievalDamage', value: actual })
  }

  if (isRetrievalTargetDestroyed(objective)) {
    objective.extracted = false
  }

  effects.push({
    type: 'retrievalExtracted',
    value: objective.extracted ? 1 : 0,
  })
  effects.push({
    type: 'retrievalExtractionDamage',
    value: objective.extractionDamage,
  })
  effects.push({
    type: 'retrievalIntegrity',
    value: objective.currentIntegrity,
  })
  effects.push({
    type: 'retrievalProgress',
    value: calculateRetrievalProgress(objective),
  })

  addLog(
    state,
    logEntry(
      'return',
      'retrievalExtraction',
      [
        primary.id,
        ...assistants.map((a) => a.id),
        ...carriers.map((a) => a.id),
      ],
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

export function resolveRetrievalReturn(
  context: ExpeditionExecutionContext,
): void {
  const { party, state } = context
  const objective = getRetrievalObjective(state)
  const active = getActiveParty(party, state)

  if (
    objective.extracted &&
    !isRetrievalTargetDestroyed(objective) &&
    active.length > 0
  ) {
    objective.returned = true
    objective.abandoned = false
    objective.lostDuringReturn = false
    addLog(
      state,
      logEntry(
        'return',
        'retrievalReturned',
        objective.carrierIds,
        [`${objective.targetName}を酒場まで持ち帰った`],
        [
          { type: 'retrievalReturned', value: 1 },
          { type: 'retrievalIntegrity', value: objective.currentIntegrity },
          {
            type: 'retrievalProgress',
            value: calculateRetrievalProgress(objective),
          },
        ],
      ),
    )
  } else if (
    objective.extracted &&
    !isRetrievalTargetDestroyed(objective) &&
    active.length === 0
  ) {
    objective.returned = false
    objective.abandoned = false
    objective.lostDuringReturn = true
    addLog(
      state,
      logEntry(
        'return',
        'retrievalTargetLost',
        [],
        [`遠征隊が帰還できず、${objective.targetName}の行方がわからなくなった`],
        [
          { type: 'retrievalLostDuringReturn', value: 1 },
          { type: 'retrievalIntegrity', value: objective.currentIntegrity },
          {
            type: 'retrievalProgress',
            value: calculateRetrievalProgress(objective),
          },
        ],
      ),
    )
  } else if (
    objective.secured &&
    !objective.extracted &&
    !isRetrievalTargetDestroyed(objective)
  ) {
    objective.returned = false
    objective.abandoned = true
    objective.lostDuringReturn = false
    addLog(
      state,
      logEntry(
        'return',
        'retrievalTargetAbandoned',
        [],
        [`${objective.targetName}を回収できずに現場に置き去りにした`],
        [
          { type: 'retrievalAbandoned', value: 1 },
          { type: 'retrievalIntegrity', value: objective.currentIntegrity },
          {
            type: 'retrievalProgress',
            value: calculateRetrievalProgress(objective),
          },
        ],
      ),
    )
  } else {
    objective.returned = false
    objective.abandoned = false
    objective.lostDuringReturn = false
  }
}

export function runRetrievalObjective(
  context: ExpeditionExecutionContext,
): void {
  const { party, state } = context
  const objective = getRetrievalObjective(state)
  if (getActiveParty(party, state).length === 0) return
  state.currentPhase = 'objective'

  if (isForcedBattleRetreat(state.battleOutcome)) {
    return
  }

  if (!objective.located) {
    runFinalRetrievalSearch(context)
  }

  if (objective.located && !objective.reached) {
    runRetrievalReAccess(context)
  }

  if (isRetrievalTargetDestroyed(objective)) {
    addLog(
      state,
      logEntry(
        'objective',
        'retrievalFailed',
        [],
        [`${objective.targetName}は確保前に破壊された`],
        [
          { type: 'retrievalDestroyed', value: 1 },
          { type: 'retrievalIntegrity', value: 0 },
        ],
      ),
    )
    return
  }

  if (objective.located && objective.reached) {
    runRetrievalSecuring(context)
  }
}

export function finalizeRetrievalObjectiveState(
  context: ExpeditionExecutionContext,
): { objectiveCompleted: boolean; progressFact: string } {
  const objective = getRetrievalObjective(context.state)
  objective.progress = calculateRetrievalProgress(objective)
  objective.completed =
    objective.returned &&
    !isRetrievalTargetDestroyed(objective) &&
    objective.currentIntegrity >= objective.minimumAcceptableIntegrity
  context.state.objectiveProgress = objective.progress
  context.state.objectiveCompleted = objective.completed
  return {
    objectiveCompleted: objective.completed,
    progressFact: retrievalProgressFact(objective),
  }
}

export function determineRetrievalOutcome(
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

  const objective = getRetrievalObjective(state)

  if (isRetrievalTargetDestroyed(objective)) {
    return 'failedObjective'
  }

  const battleOutcome = state.battleOutcome
  const forcedBattleRetreat =
    battleOutcome === 'retreat' ||
    battleOutcome === 'stalemate' ||
    battleOutcome === 'defeat' ||
    battleOutcome === 'totalLoss'

  if (!objective.returned) {
    if (forcedBattleRetreat) {
      return 'forcedRetreat'
    }
    return 'failedObjective'
  }

  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const hasCasualties = state.casualties.length > 0
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length

  if (
    objective.currentIntegrity === objective.initialIntegrity &&
    !hasCasualties &&
    unresolvedSerious === 0 &&
    !timeExceeded
  ) {
    return 'completeSuccess'
  }

  if (objective.currentIntegrity >= objective.minimumAcceptableIntegrity) {
    return 'success'
  }

  return 'partialSuccess'
}

export const retrievalHandler: ExpeditionObjectiveHandler = {
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
  validateRequest: validateRetrievalRequest,
  initializeObjectiveState: initializeRetrievalObjectiveState,
  beforeBattle(context: ExpeditionExecutionContext): void {
    const { request, state } = context
    const objective = getRetrievalObjective(state)
    const battleWillOccur = request.battle?.enabled === true
    retrievalTargetAssignedLog(context)
    runInitialRetrievalSearch(context)
    if (objective.located && !objective.reached) {
      runRetrievalAccess(context, 'access', getSearchAccessBonus(state))
    }
    if (
      battleWillOccur &&
      objective.located &&
      objective.reached &&
      !isRetrievalTargetDestroyed(objective)
    ) {
      assignRetrievalProtector(context)
    }
  },
  onBattleResolved(context): void {
    resolveRetrievalBattleExposure(context)
  },
  runObjective: runRetrievalObjective,
  beforeReturn: prepareRetrievalExtraction,
  afterReturn: resolveRetrievalReturn,
  finalizeObjectiveState: finalizeRetrievalObjectiveState,
  determineOutcome: determineRetrievalOutcome,
}
