import type {
  MainQuestBattleInitialSnapshot,
  MainQuestBattleTrace,
  MainQuestOutcome,
} from './types.ts'

export interface MainQuestBattleReplayMemberState {
  characterId: string
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  statuses: string[]
  incapacitated: boolean
  dead: boolean
}

export interface MainQuestBattleReplayMonsterState {
  currentHp: number
  maxHp: number
  statuses: string[]
  defeated: boolean
}

export interface MainQuestBattleReplayResult {
  members: MainQuestBattleReplayMemberState[]
  monster: MainQuestBattleReplayMonsterState
  outcome: MainQuestOutcome | null
  retreated: boolean
}

/**
 * Pure Presentation-state replay: `MainQuestBattleInitialSnapshot` +
 * `MainQuestBattleTrace` -> the exact final combatant state the Simulation
 * reached — zero RNG, zero re-simulation, zero Combat decision-making.
 * This is the SAME algorithm both `MainQuestBattleScene` (driving the
 * animated Battle Playback) and the Save Validator (`../save/
 * validation.ts`, proving final-state parity against the stored
 * `MainQuestSimulationResult`) use — never two independently-maintained
 * implementations of "what does applying this Trace mean" (Phase 9.8.1
 * item 83/16).
 */
export function replayMainQuestBattleTrace(
  initialSnapshot: MainQuestBattleInitialSnapshot,
  trace: MainQuestBattleTrace,
): MainQuestBattleReplayResult {
  const members = new Map<string, MainQuestBattleReplayMemberState>(
    initialSnapshot.partyMembers.map((m) => [
      m.characterId,
      {
        characterId: m.characterId,
        currentHp: m.currentHp,
        maxHp: m.maxHp,
        currentMp: m.currentMp,
        maxMp: m.maxMp,
        statuses: [...m.statuses],
        incapacitated: m.currentHp <= 0,
        dead: false,
      },
    ]),
  )
  const monster: MainQuestBattleReplayMonsterState = {
    currentHp: initialSnapshot.monster.currentHp,
    maxHp: initialSnapshot.monster.maxHp,
    statuses: [...initialSnapshot.monster.statuses],
    defeated: initialSnapshot.monster.currentHp <= 0,
  }

  let outcome: MainQuestOutcome | null = null
  let retreated = false

  function isMonster(id: string): boolean {
    return id === trace.monsterId || !members.has(id)
  }

  type Target =
    MainQuestBattleReplayMemberState | MainQuestBattleReplayMonsterState

  function addStatus(target: Target, status: string): void {
    if (!target.statuses.includes(status)) target.statuses.push(status)
  }

  function removeStatus(target: Target, status: string): void {
    target.statuses = target.statuses.filter((s) => s !== status)
  }

  function applyDamage(targetId: string, amount: number): void {
    if (isMonster(targetId)) {
      monster.currentHp = Math.max(0, monster.currentHp - amount)
    } else {
      const member = members.get(targetId)
      if (!member) return
      member.currentHp = Math.max(0, member.currentHp - amount)
    }
  }

  function applyHealing(targetId: string, amount: number): void {
    if (isMonster(targetId)) {
      monster.currentHp = Math.min(monster.maxHp, monster.currentHp + amount)
    } else {
      const member = members.get(targetId)
      if (!member) return
      member.currentHp = Math.min(member.maxHp, member.currentHp + amount)
    }
  }

  for (const event of trace.events) {
    switch (event.type) {
      case 'damage':
        applyDamage(event.targetId, event.amount)
        break
      case 'periodicDamage':
        applyDamage(event.targetId, event.amount)
        break
      case 'healing':
        applyHealing(event.targetId, event.amount)
        break
      case 'periodicHealing':
        applyHealing(event.targetId, event.amount)
        break
      case 'statusApplied': {
        const target = isMonster(event.targetId)
          ? monster
          : members.get(event.targetId)
        if (target) addStatus(target, event.status)
        break
      }
      case 'statusRemoved': {
        const target = isMonster(event.targetId)
          ? monster
          : members.get(event.targetId)
        if (target) removeStatus(target, event.status)
        break
      }
      case 'mpChanged': {
        const member = members.get(event.targetId)
        if (member) {
          member.currentMp = Math.max(
            0,
            Math.min(member.maxMp, member.currentMp + event.delta),
          )
        }
        break
      }
      case 'incapacitated': {
        const member = members.get(event.memberId)
        if (member) {
          member.incapacitated = true
          member.currentHp = 0
        }
        break
      }
      case 'death': {
        const member = members.get(event.memberId)
        if (member) member.dead = true
        break
      }
      case 'monsterDefeated':
        monster.defeated = true
        monster.currentHp = 0
        break
      case 'retreat':
        retreated = true
        break
      case 'battleEnded':
        outcome = event.outcome
        break
      default:
        break
    }
  }

  return {
    members: [...members.values()],
    monster,
    outcome,
    retreated,
  }
}
