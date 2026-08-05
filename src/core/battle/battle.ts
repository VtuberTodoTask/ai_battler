import { SeededRng } from '../rng/seededRng.ts'
import {
  Adventurer,
  BattleContext,
  BattleLogEntry,
  BattleOptions,
  BattleOutcome,
  BattleResult,
  ContactResult,
  Enemy,
  EnemySpecies,
  InjuryResult,
  RetreatResult,
} from '../models/types.ts'
import { clamp } from '../util.ts'
import { MAX_ROUNDS } from '../balance/constants.ts'
import {
  BattleUnit,
  createAdventurerUnit,
  createEnemyUnit,
  getAliveAdventurers,
  getAliveEnemies,
} from './battleState.ts'
import {
  addStatus,
  calculateWeaponDamage,
  getAbilityNumeric,
  hasAbility,
  hasStatus,
  healUnit,
  removeStatus,
  rollAttack,
} from './actions.ts'
import {
  decideAdventurerAction,
  decideEnemyAction,
  DecidedAction,
} from './ai.ts'
import {
  adjustMorale,
  calculateRetreatChance,
  getEnemyLeader,
  getLeader,
  onAllyIncapacitated,
  shouldEnemyRetreat,
  shouldPartyRetreat,
} from './morale.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'

function getDefaultContext(): BattleContext {
  return { lighting: 'normal', noise: 0, water: false, smoke: false }
}

interface BattleState {
  seed: string
  rng: SeededRng
  party: BattleUnit[]
  enemies: BattleUnit[]
  round: number
  logs: BattleLogEntry[]
  contact: ContactResult
  discoveredWeaknesses: Set<string>
  partyDamageDealt: number
  enemyDamageDealt: number
  retreat?: RetreatResult
  ended: boolean
  outcome?: BattleOutcome
  partyInitBonus: number
  enemyInitBonus: number
  deadAdventurers: Set<string>
  injuries: InjuryResult[]
  abilityUsage: Record<string, number>
  context: BattleContext
  leaderTargetId?: string
}

function log(
  state: BattleState,
  phase: BattleLogEntry['phase'],
  actionType: string,
  result: string,
  opts: Partial<BattleLogEntry> = {},
): void {
  state.logs.push({
    round: state.round,
    phase,
    actionType,
    result,
    ...opts,
  })
}

function cloneUnits(
  adventurers: Adventurer[],
  enemies: Enemy[],
): { party: BattleUnit[]; enemies: BattleUnit[] } {
  return {
    party: adventurers.map(createAdventurerUnit),
    enemies: enemies.map(createEnemyUnit),
  }
}

function getAllAlive(state: BattleState): BattleUnit[] {
  return [...getAliveAdventurers(state), ...getAliveEnemies(state)]
}

function getAliveSide(state: BattleState, isAdventurer: boolean): BattleUnit[] {
  return isAdventurer ? getAliveAdventurers(state) : getAliveEnemies(state)
}

function getOtherAliveTargets(
  state: BattleState,
  attacker: BattleUnit,
  currentTarget: BattleUnit,
  count: number,
): BattleUnit[] {
  const side = attacker.isAdventurer ? state.enemies : state.party
  const others = side.filter(
    (u) => u.id !== currentTarget.id && u.isAlive && !u.escaped,
  )
  if (others.length <= count) return others
  return state.rng.shuffle(others).slice(0, count)
}

function getSwarmAllyCount(state: BattleState, attacker: BattleUnit): number {
  if (!attacker.species) return 0
  const side = getAliveSide(state, attacker.isAdventurer)
  return side.filter(
    (u) => u.id !== attacker.id && u.species === attacker.species,
  ).length
}

function wasLeader(state: BattleState, unit: BattleUnit): boolean {
  const side = unit.isAdventurer ? state.party : state.enemies
  const allLeader = [...side].sort(
    (a, b) => b.skills.leadership - a.skills.leadership,
  )[0]
  return allLeader?.id === unit.id
}

function discoverWeakness(
  state: BattleState,
  discoverer: BattleUnit,
  target: BattleUnit,
): boolean {
  const unknown = target.weaknesses?.find((w) => !w.known)
  if (!unknown) return false
  unknown.known = true
  const entry = `discoverer=${discoverer.id},enemy=${target.id},weakness=${unknown.weaknessId},name=${unknown.name}`
  state.discoveredWeaknesses.add(entry)
  log(
    state,
    'contact',
    'weaknessDiscovery',
    `${discoverer.name}は${target.name}の弱点「${unknown.name}」を発見した。`,
    { actorId: discoverer.id, targetIds: [target.id] },
  )
  return true
}

function performMonsterKnowledgeCheck(state: BattleState): void {
  const candidates = state.party
    .filter((u) => u.isAlive && !u.escaped)
    .sort((a, b) => b.skills.monsterKnowledge - a.skills.monsterKnowledge)
  const scholar = candidates[0]
  if (!scholar) return

  const unknowns = state.enemies
    .filter((e) => e.isAlive && !e.escaped)
    .flatMap(
      (e) =>
        e.weaknesses
          ?.filter((w) => !w.known)
          .map((w) => ({ enemy: e, weakness: w })) ?? [],
    )
  if (unknowns.length === 0) return

  const roll = state.rng.d100()
  if (roll <= scholar.skills.monsterKnowledge) {
    const pick = state.rng.pick(unknowns)
    if (pick) {
      pick.weakness.known = true
      const entry = `discoverer=${scholar.id},enemy=${pick.enemy.id},weakness=${pick.weakness.weaknessId},name=${pick.weakness.name}`
      state.discoveredWeaknesses.add(entry)
      log(
        state,
        'contact',
        'monsterKnowledge',
        `${scholar.name}の魔物知識が成功し、${pick.enemy.name}の弱点「${pick.weakness.name}」を発見した。`,
        { actorId: scholar.id, targetIds: [pick.enemy.id] },
      )
    }
  }
}

function resolveContact(state: BattleState): void {
  const party = state.party
  const enemies = state.enemies

  const sortedScouting = [...party]
    .filter((u) => u.isAlive)
    .sort((a, b) => b.skills.scouting - a.skills.scouting)
  const topScout = sortedScouting[0]
  const topScoutSkill = topScout?.skills.scouting ?? 0
  const secondScout = sortedScouting[1]?.skills.scouting ?? 0
  const leader = getLeader(party)
  const leadershipBonus = leader ? leader.skills.leadership / 10 : 0
  const partyScouting = topScoutSkill + secondScout * 0.25 + leadershipBonus

  const sortedStealth = [...enemies]
    .filter((u) => u.isAlive)
    .sort((a, b) => b.skills.stealth - a.skills.stealth)
  const topStealth = sortedStealth[0]?.skills.stealth ?? 0
  const ambushBonus = enemies.some(
    (e) => (e.original as Enemy).archetype === 'ambusher',
  )
    ? 15
    : 0
  const enemyStealth = topStealth + ambushBonus

  const successChance = clamp(50 + partyScouting - enemyStealth, 5, 95)
  const roll = state.rng.d100()

  let type: ContactResult['type']
  const effects: ContactResult['effects'] = {}

  const criticalThreshold = Math.max(1, Math.floor(successChance / 5))

  if (roll <= criticalThreshold) {
    type = 'greatSuccess'
    state.partyInitBonus = 5
    effects.firstRoundHitBonus = 10
    effects.initiativeBonus = 5
    const stunCount = Math.min(2, enemies.length)
    for (let i = 0; i < stunCount; i++) {
      const target = enemies[i]
      if (target) addStatus(target, 'stunned', 1, 0, 'contact')
    }
    effects.stunnedEnemies = stunCount
    log(
      state,
      'contact',
      'contact',
      `冒険者側が接敵に大成功。${stunCount}体の敵が行動不能。`,
      { roll, successChance },
    )

    if (topScout) {
      for (const enemy of enemies) {
        discoverWeakness(state, topScout, enemy)
      }
    }
  } else if (roll <= successChance) {
    type = 'success'
    state.partyInitBonus = 2
    effects.initiativeBonus = 2
    log(state, 'contact', 'contact', '冒険者側が接敵に成功。', {
      roll,
      successChance,
    })
    performMonsterKnowledgeCheck(state)
  } else if (roll >= 96) {
    type = 'greatFailure'
    state.enemyInitBonus = 5
    effects.enemyInitiativeBonus = 5
    const damageCount = Math.min(2, party.length)
    for (let i = 0; i < damageCount; i++) {
      const target = party[i]
      if (target) {
        const dmg = state.rng.integer(3, 8)
        target.hp -= dmg
        state.enemyDamageDealt += dmg
        addStatus(target, 'weakened', 3, 5, 'contact')
      }
    }
    effects.initialDamage = damageCount
    effects.moralePenalty = 5
    party.forEach((u) => adjustMorale(u, -5))
    log(
      state,
      'contact',
      'contact',
      `冒険者側が接敵に大失敗。${damageCount}人が初期ダメージを受ける。`,
      { roll, successChance },
    )
  } else {
    type = 'failure'
    state.enemyInitBonus = 3
    effects.enemyInitiativeBonus = 3
    effects.side = 'enemy'
    log(state, 'contact', 'contact', '敵側が先制。', { roll, successChance })
  }

  state.contact = {
    type,
    partyScouting,
    enemyStealth,
    successChance,
    roll,
    effects,
  }
}

function applyStealthStart(state: BattleState): void {
  for (const enemy of state.enemies) {
    if (hasAbility(enemy, 'stealthStart')) {
      addStatus(enemy, 'stealthed', 1, 0, 'stealthStart')
    }
  }
}

function rollInitiative(state: BattleState): void {
  getAllAlive(state).forEach((u) => {
    const bonus = u.isAdventurer ? state.partyInitBonus : state.enemyInitBonus
    const stunned = hasStatus(u, 'stunned') ? -10 : 0
    const stealth = hasStatus(u, 'stealthed') ? 10 : 0
    u.initiative = u.stats.dex + state.rng.die(20) + bonus + stunned + stealth
  })
}

function sortByInitiative(units: BattleUnit[]): BattleUnit[] {
  return [...units].sort((a, b) => b.initiative - a.initiative)
}

function handleUnitDeath(state: BattleState, unit: BattleUnit): void {
  if (unit.hp > 0 || !unit.isAlive) return
  unit.isAlive = false
  log(state, 'combat', 'incapacitate', `${unit.name}が戦闘不能になった。`, {
    targetIds: [unit.id],
  })
  const isLeader = wasLeader(state, unit)
  getAllAlive(state).forEach((ally) =>
    onAllyIncapacitated(ally, unit, isLeader),
  )
}

function resolveAction(
  state: BattleState,
  unit: BattleUnit,
  action: DecidedAction,
): void {
  if (action.action === 'retreat') {
    attemptRetreat(state, unit)
    return
  }

  if (action.action === 'heal') {
    if (!action.target) return
    if (unit.mp < 3) {
      const enemy = getAliveEnemies(state)[0]
      if (enemy) resolveAttack(state, unit, enemy)
      return
    }
    const power = unit.skills.healing / 3 + unit.stats.int / 6
    const amount = healUnit(unit, action.target, power)
    unit.mp -= 3
    log(
      state,
      'combat',
      'heal',
      `${unit.name}が${action.target.name}を回復させた。+${amount} HP`,
      { actorId: unit.id, targetIds: [action.target.id] },
    )
    return
  }

  if (action.action === 'guard') {
    if (!action.target) return
    addStatus(action.target, 'guarded', 2, 5, unit.id)
    addStatus(unit, 'guarded', 2, 3, unit.id)
    log(
      state,
      'combat',
      'guard',
      `${unit.name}が${action.target.name}を防護した。`,
      { actorId: unit.id, targetIds: [action.target.id] },
    )
    return
  }

  if (action.action === 'support') {
    if (!action.target) return
    action.target.morale = clamp(action.target.morale + 10, 0, 100)
    addStatus(action.target, 'guarded', 2, 3, unit.id)
    log(
      state,
      'combat',
      'support',
      `${unit.name}が${action.target.name}を支援した。`,
      { actorId: unit.id, targetIds: [action.target.id] },
    )
    return
  }

  if (action.action === 'healBlock') {
    if (!action.target) return
    addStatus(action.target, 'healBlocked', 2, 0, unit.id)
    log(
      state,
      'combat',
      'healBlock',
      `${unit.name}が${action.target.name}に治療妨害を仕掛けた。`,
      {
        actorId: unit.id,
        targetIds: [action.target.id],
        metadata: { abilityId: action.abilityId },
      },
    )
    return
  }

  if (action.action === 'revive') {
    if (!action.target || action.target.isAlive || action.target.escaped) return
    if (action.abilityId) {
      unit.usedAbilities.add(action.abilityId)
      state.abilityUsage[action.abilityId] =
        (state.abilityUsage[action.abilityId] ?? 0) + 1
    }
    const heal = getAbilityNumeric(unit, 'reviveHeal', 10)
    action.target.isAlive = true
    action.target.hp = clamp(heal, 1, action.target.maxHp)
    action.target.statusEffects = []
    action.target.morale = clamp(action.target.morale + 10, 0, 100)
    log(
      state,
      'combat',
      'revive',
      `${unit.name}が${action.target.name}を蘇生させた。+${action.target.hp} HP`,
      {
        actorId: unit.id,
        targetIds: [action.target.id],
        metadata: { abilityId: action.abilityId },
      },
    )
    return
  }

  if (action.action === 'summon') {
    if (action.abilityId) {
      unit.usedAbilities.add(action.abilityId)
      state.abilityUsage[action.abilityId] =
        (state.abilityUsage[action.abilityId] ?? 0) + 1
    }
    const count = getAbilityNumeric(unit, 'summonCount', 2)
    const summoned: BattleUnit[] = []
    for (let i = 0; i < count && state.enemies.length < 12; i++) {
      const seed = `${state.seed}-summon-${state.round}-${unit.id}-${i}`
      const species: EnemySpecies = (unit.species as EnemySpecies) ?? 'beast'
      const enemy = generateEnemy(seed, {
        rank: 'E',
        species,
        archetype: 'swarm',
        tier: 'minion',
      })
      const summonedUnit = createEnemyUnit(enemy)
      summonedUnit.isSummoned = true
      state.enemies.push(summonedUnit)
      summoned.push(summonedUnit)
    }
    log(
      state,
      'combat',
      'summon',
      `${unit.name}が${summoned.length}体の仲間を召喚した。`,
      {
        actorId: unit.id,
        targetIds: summoned.map((e) => e.id),
        metadata: { abilityId: action.abilityId },
      },
    )
    return
  }

  if (action.action === 'magic') {
    if (unit.isAdventurer && unit.mp < 5) {
      const fallback = getAliveEnemies(state)[0]
      if (fallback) resolveAttack(state, unit, fallback)
      return
    }
    if (unit.isAdventurer) unit.mp -= 5
    const target = action.target ?? getAliveEnemies(state)[0]
    if (!target) return
    resolveAttack(state, unit, target, 'magic')
    return
  }

  if (action.action === 'ranged') {
    const target = action.target ?? getAliveEnemies(state)[0]
    if (!target) return
    resolveAttack(state, unit, target, 'ranged')
    return
  }

  if (action.action === 'flank') {
    const target = action.target ?? getAliveEnemies(state)[0]
    if (!target) return
    resolveAttack(state, unit, target, undefined, true)
    return
  }

  const target =
    action.target ??
    (unit.isAdventurer
      ? getAliveEnemies(state)[0]
      : getAliveAdventurers(state)[0])
  if (!target) return
  resolveAttack(state, unit, target, undefined, action.isFlank ?? false)
}

function resolveAttack(
  state: BattleState,
  attacker: BattleUnit,
  defender: BattleUnit,
  forcedType?: 'melee' | 'ranged' | 'magic',
  isFlank = false,
  isCounter = false,
): void {
  let attackType: 'melee' | 'ranged' | 'magic'
  if (forcedType) {
    attackType = forcedType
  } else {
    const chosen = calculateWeaponDamage(attacker)
    attackType =
      chosen.skill === 'ranged'
        ? 'ranged'
        : chosen.skill === 'attackMagic'
          ? 'magic'
          : 'melee'
  }

  const weapon = calculateWeaponDamage(attacker)
  const skill =
    attackType === 'ranged'
      ? 'ranged'
      : attackType === 'magic'
        ? 'attackMagic'
        : 'melee'
  const defenderSkill: 'defense' | 'defenseMagic' =
    attackType === 'magic' ? 'defenseMagic' : 'defense'

  let modifier = 0
  if (
    state.round <= 3 &&
    attacker.traits?.some((t) =>
      ['reckless', 'firstStrike'].includes(t.traitId),
    )
  ) {
    modifier += 10
  }
  if (state.round === 1 && attacker.isAdventurer) {
    const bonus = state.contact.effects.firstRoundHitBonus
    if (bonus) modifier += bonus
  }
  if (hasStatus(attacker, 'frightened')) modifier -= 5
  if (hasStatus(defender, 'frightened')) modifier += 5

  const swarmAllyCount = getSwarmAllyCount(state, attacker)

  const result = rollAttack(
    state.rng,
    attacker,
    defender,
    skill,
    defenderSkill,
    weapon.base,
    weapon.element ?? 'physical',
    {
      modifier,
      context: state.context,
      attackType,
      isFlank,
      swarmAllyCount,
    },
  )

  if (result.hit) {
    if (attacker.isAdventurer) state.partyDamageDealt += result.damageDealt
    else state.enemyDamageDealt += result.damageDealt
  }

  log(state, 'combat', attackType, result.message, {
    actorId: attacker.id,
    targetIds: [defender.id],
    roll: result.roll,
    successChance: result.successChance,
    damage: result.damageDealt,
    statusApplied: result.statusApplied,
  })

  if (result.hit && hasAbility(attacker, 'areaAttack')) {
    const areaCount =
      Math.max(1, getAbilityNumeric(attacker, 'areaAttackTargets', 3)) - 1
    const extraTargets = getOtherAliveTargets(
      state,
      attacker,
      defender,
      areaCount,
    )
    for (const extra of extraTargets) {
      const areaDamage = Math.max(1, Math.round(result.damageDealt * 0.5))
      extra.hp -= areaDamage
      if (attacker.isAdventurer) state.partyDamageDealt += areaDamage
      else state.enemyDamageDealt += areaDamage
      log(
        state,
        'combat',
        'area',
        `${attacker.name} hit ${extra.name} for ${areaDamage} area damage`,
        {
          actorId: attacker.id,
          targetIds: [extra.id],
          damage: areaDamage,
        },
      )
      if (extra.hp <= 0 && extra.isAlive) handleUnitDeath(state, extra)
    }
  }

  if (defender.hp <= 0 && defender.isAlive) {
    handleUnitDeath(state, defender)

    if (!isCounter && hasAbility(defender, 'corpseExplosion')) {
      const explosionDamage = getAbilityNumeric(
        defender,
        'corpseExplosionDamage',
        8,
      )
      const others = getAllAlive(state).filter((u) => u.id !== defender.id)
      for (const u of others) {
        u.hp -= explosionDamage
        if (defender.isAdventurer) {
          state.partyDamageDealt += explosionDamage
        } else {
          state.enemyDamageDealt += explosionDamage
        }
        log(
          state,
          'combat',
          'corpseExplosion',
          `${defender.name}の死体が爆発し、${u.name}に${explosionDamage}ダメージ。`,
          { actorId: defender.id, targetIds: [u.id], damage: explosionDamage },
        )
        if (u.hp <= 0 && u.isAlive) handleUnitDeath(state, u)
      }
    }
  }

  if (
    result.hit &&
    defender.isAlive &&
    !isCounter &&
    attackType === 'melee' &&
    hasAbility(defender, 'counter')
  ) {
    const counterChance = getAbilityNumeric(defender, 'counterChance', 0.3)
    if (state.rng.chance(Math.round(counterChance * 100))) {
      log(state, 'combat', 'counter', `${defender.name}が反撃した。`, {
        actorId: defender.id,
        targetIds: [attacker.id],
      })
      resolveAttack(state, defender, attacker, 'melee', false, true)
    }
  }

  if (hasStatus(attacker, 'stealthed')) removeStatus(attacker, 'stealthed')
}

function attemptRetreat(state: BattleState, unit: BattleUnit): void {
  if (unit.isAdventurer) {
    if (state.retreat || state.ended) return
    const leader = getLeader(state.party) ?? unit
    const chance = calculateRetreatChance(leader, getAliveEnemies(state))
    const roll = state.rng.d100()
    const success = roll <= chance
    state.retreat = { side: 'party', success, roll, chance }
    log(
      state,
      'retreat',
      'retreat',
      `${leader.name}が撤退を試みた。${success ? '成功' : '失敗'}`,
      { actorId: leader.id, roll, successChance: chance },
    )
    if (success) {
      state.ended = true
      state.outcome = 'retreat'
      getAliveAdventurers(state).forEach((u) => {
        u.escaped = true
      })
    }
  } else {
    const alive = getAliveEnemies(state)
    if (alive.length === 0) return
    const chance = clamp(
      (unit.behavior?.caution ?? 50) + unit.stats.dex - 30,
      5,
      95,
    )
    const roll = state.rng.d100()
    const success = roll <= chance
    if (success) {
      unit.escaped = true
      log(state, 'retreat', 'retreat', `${unit.name}が撤退した。`, {
        actorId: unit.id,
        roll,
        successChance: chance,
      })
    } else {
      log(state, 'retreat', 'retreat', `${unit.name}は撤退に失敗した。`, {
        actorId: unit.id,
        roll,
        successChance: chance,
      })
    }
  }
}

function processStartOfRound(state: BattleState): void {
  state.leaderTargetId = undefined

  if (shouldPartyRetreat(state.party, state.enemies, state.round)) {
    const leader = getLeader(state.party) ?? getAliveAdventurers(state)[0]
    if (leader) attemptRetreat(state, leader)
  }

  if (!state.ended && shouldEnemyRetreat(state.enemies, state.party)) {
    const alive = getAliveEnemies(state)
    for (const enemy of alive) {
      if (enemy.species !== 'undead' && enemy.species !== 'construct') {
        attemptRetreat(state, enemy)
      }
    }
  }
}

function processEndOfRound(state: BattleState): void {
  const all = getAllAlive(state)

  for (const u of all) {
    const poisoned = u.statusEffects.find((e) => e.type === 'poisoned')
    if (poisoned) {
      const dmg = poisoned.value ?? 3
      u.hp -= dmg
      log(
        state,
        'combat',
        'poison',
        `${u.name}は毒のダメージを受けた。-${dmg} HP`,
        { targetIds: [u.id], damage: dmg },
      )
      if (u.isAdventurer) state.enemyDamageDealt += dmg
      else state.partyDamageDealt += dmg
    }

    const bleeding = u.statusEffects.find((e) => e.type === 'bleeding')
    if (bleeding) {
      const dmg = bleeding.value ?? 3
      u.hp -= dmg
      log(
        state,
        'combat',
        'bleed',
        `${u.name}は出血のダメージを受けた。-${dmg} HP`,
        { targetIds: [u.id], damage: dmg },
      )
      if (u.isAdventurer) state.enemyDamageDealt += dmg
      else state.partyDamageDealt += dmg
    }
  }

  for (const u of all) {
    if (u.hp <= 0 && u.isAlive) handleUnitDeath(state, u)
  }

  for (const u of getAllAlive(state)) {
    const regen = getAbilityNumeric(u, 'regenPerRound', 0)
    if (regen > 0 && u.hp < u.maxHp) {
      const heal = regen
      u.hp = clamp(u.hp + heal, 0, u.maxHp)
      log(state, 'combat', 'regen', `${u.name}が再生した。+${heal} HP`, {
        targetIds: [u.id],
      })
    }
  }

  getAllAlive(state).forEach((u) => {
    u.statusEffects = u.statusEffects
      .map((e) => ({ ...e, duration: e.duration - 1 }))
      .filter((e) => e.duration > 0)
  })
}

function checkBattleEnd(state: BattleState): boolean {
  const partyAlive = getAliveAdventurers(state).length
  const enemiesAlive = getAliveEnemies(state).length

  if (partyAlive === 0) {
    state.ended = true
    state.outcome = 'defeat'
    return true
  }
  if (enemiesAlive === 0) {
    state.ended = true
    state.outcome = undefined
    return true
  }
  return false
}

function determineOutcome(state: BattleState): BattleOutcome {
  if (state.outcome === 'retreat') {
    const defeated = state.enemies.filter((e) => !e.isAlive || e.escaped).length
    const total = state.enemies.length
    if (defeated >= total * 0.5) return 'partialVictory'
    return 'retreat'
  }

  const partyAlive = getAliveAdventurers(state).length
  const enemyAlive = getAliveEnemies(state).length

  if (partyAlive === 0 && enemyAlive === 0) return 'stalemate'
  if (partyAlive === 0) {
    if (state.deadAdventurers.size === state.party.length) return 'totalLoss'
    return 'defeat'
  }
  if (enemyAlive === 0) {
    const hasCostlyInjury = state.injuries.some((i) => i.category !== 'light')
    return hasCostlyInjury ? 'costlyVictory' : 'victory'
  }
  if (state.round >= MAX_ROUNDS) return 'stalemate'
  return 'stalemate'
}

function resolveAftermath(state: BattleState): void {
  const fallenAdventurers = state.party.filter((u) => !u.isAlive && !u.escaped)
  const maxHealing = Math.max(...state.party.map((u) => u.skills.healing), 0)
  const maxFirstAid = Math.max(...state.party.map((u) => u.skills.firstAid), 0)

  state.injuries = fallenAdventurers.map((u) => {
    const original = u.original as Adventurer
    const excess = Math.max(0, -u.hp)
    const bleed = hasStatus(u, 'bleeding') ? 10 : 0
    const poison = hasStatus(u, 'poisoned') ? 10 : 0
    const severity = excess + bleed + poison + state.round
    const survivalChance = clamp(
      original.stats.con + maxHealing / 5 + maxFirstAid / 5 - severity,
      5,
      99,
    )
    const roll = state.rng.d100()
    const survived = roll <= survivalChance

    let category: InjuryResult['category']
    if (!survived) {
      category = 'dead'
      state.deadAdventurers.add(u.id)
    } else if (severity < 20) category = 'light'
    else if (severity < 40) category = 'serious'
    else if (severity < 60) category = 'critical'
    else category = 'permanentInjury'

    log(
      state,
      'aftermath',
      'injury',
      `${u.name}の負傷判定: ${category} (重症度${severity})`,
      { targetIds: [u.id] },
    )

    return {
      adventurerId: u.id,
      name: u.name,
      severity,
      survivalRoll: roll,
      survivalChance,
      category,
    }
  })
}

export function runBattle(
  seed: string,
  adventurers: Adventurer[],
  enemies: Enemy[],
  options?: BattleOptions,
): BattleResult {
  const rng = new SeededRng(seed)
  const { party, enemies: enemyUnits } = cloneUnits(adventurers, enemies)

  const state: BattleState = {
    seed,
    rng,
    party,
    enemies: enemyUnits,
    round: 0,
    logs: [],
    contact: {
      type: 'success',
      partyScouting: 0,
      enemyStealth: 0,
      successChance: 50,
      roll: 0,
      effects: {},
    },
    discoveredWeaknesses: new Set(),
    partyDamageDealt: 0,
    enemyDamageDealt: 0,
    ended: false,
    partyInitBonus: 0,
    enemyInitBonus: 0,
    deadAdventurers: new Set<string>(),
    injuries: [],
    abilityUsage: {},
    context: options?.context ?? getDefaultContext(),
  }

  resolveContact(state)
  applyStealthStart(state)

  for (let round = 1; round <= MAX_ROUNDS && !state.ended; round++) {
    state.round = round
    if (checkBattleEnd(state)) break
    processStartOfRound(state)
    if (state.ended) break

    rollInitiative(state)
    const order = sortByInitiative(getAllAlive(state))

    for (const unit of order) {
      if (!unit.isAlive || unit.escaped) continue
      if (hasStatus(unit, 'stunned')) {
        removeStatus(unit, 'stunned')
        continue
      }

      const action = unit.isAdventurer
        ? decideAdventurerAction(unit, state)
        : decideEnemyAction(unit, state)

      const isLeader =
        (unit.isAdventurer && wasLeader(state, unit)) ||
        (!unit.isAdventurer && getEnemyLeader(state.enemies)?.id === unit.id)
      if (
        isLeader &&
        action.target &&
        action.target.isAdventurer === !unit.isAdventurer
      ) {
        state.leaderTargetId = action.target.id
      }

      resolveAction(state, unit, action)

      if (state.ended) break
      if (checkBattleEnd(state)) break
    }

    if (!state.ended) {
      processEndOfRound(state)
      checkBattleEnd(state)
    }
  }

  resolveAftermath(state)
  state.outcome = determineOutcome(state)

  const survivingAdventurers = state.party
    .filter(
      (u) => u.isAlive || (!u.isAlive && !state.deadAdventurers.has(u.id)),
    )
    .map((u) => u.id)
  const incapacitatedAdventurers = state.party
    .filter((u) => !u.isAlive && !state.deadAdventurers.has(u.id))
    .map((u) => u.id)
  const deadAdventurerIds = [...state.deadAdventurers]

  return {
    seed,
    outcome: state.outcome ?? 'stalemate',
    rounds: state.round,
    survivingAdventurers,
    incapacitatedAdventurers,
    deadAdventurers: deadAdventurerIds,
    survivingEnemies: state.enemies
      .filter((e) => e.isAlive || e.escaped)
      .map((e) => e.id),
    defeatedEnemies: state.enemies.filter((e) => !e.isAlive).map((e) => e.id),
    escapedEnemies: state.enemies.filter((e) => e.escaped).map((e) => e.id),
    injuries: state.injuries,
    discoveredWeaknesses: [...state.discoveredWeaknesses],
    partyDamageDealt: state.partyDamageDealt,
    enemyDamageDealt: state.enemyDamageDealt,
    abilityUsage: state.abilityUsage,
    contactResult: state.contact,
    retreatResult: state.retreat,
    logs: state.logs,
  }
}
