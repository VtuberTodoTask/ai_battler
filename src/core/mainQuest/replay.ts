import type { StatusEffect } from '../models/types.ts'
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
  statusEffects: StatusEffect[]
  incapacitated: boolean
  dead: boolean
}

export interface MainQuestBattleReplayMonsterState {
  currentHp: number
  maxHp: number
  statusEffects: StatusEffect[]
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
 *
 * `StatusEffect`s are held and compared as full objects, never just
 * `type` (Phase 9.8.3) — a `statusApplied` event's `effect` always
 * *replaces* whatever this replay currently holds for that `type` wholesale
 * (the Battle Engine's own `addStatus` refresh/merge semantics, and its
 * end-of-round duration tick, already happened once — in the engine — by
 * the time that event was recorded; this never re-derives them).
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
        statusEffects: m.statusEffects.map((e) => ({ ...e })),
        incapacitated: m.currentHp <= 0,
        dead: false,
      },
    ]),
  )
  const monster: MainQuestBattleReplayMonsterState = {
    currentHp: initialSnapshot.monster.currentHp,
    maxHp: initialSnapshot.monster.maxHp,
    statusEffects: initialSnapshot.monster.statusEffects.map((e) => ({
      ...e,
    })),
    defeated: initialSnapshot.monster.currentHp <= 0,
  }

  let outcome: MainQuestOutcome | null = null
  let retreated = false

  function isMonster(id: string): boolean {
    return id === trace.monsterId || !members.has(id)
  }

  type Target =
    MainQuestBattleReplayMemberState | MainQuestBattleReplayMonsterState

  function setStatusEffect(target: Target, effect: StatusEffect): void {
    const idx = target.statusEffects.findIndex((e) => e.type === effect.type)
    if (idx >= 0) target.statusEffects[idx] = { ...effect }
    else target.statusEffects.push({ ...effect })
  }

  function removeStatusEffect(target: Target, statusType: string): void {
    target.statusEffects = target.statusEffects.filter(
      (e) => e.type !== statusType,
    )
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
        if (target) setStatusEffect(target, event.effect)
        break
      }
      case 'statusRemoved': {
        const target = isMonster(event.targetId)
          ? monster
          : members.get(event.targetId)
        if (target) removeStatusEffect(target, event.status)
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

/**
 * A stable canonical ordering for a set of `StatusEffect`s — order itself
 * is not a Gameplay Fact, so both the Save Validator and tests compare
 * status-effect sets via this sort rather than depending on array order
 * (Phase 9.8.3 item 25). One shared implementation, not two.
 */
export function sortStatusEffectsCanonically(
  effects: readonly StatusEffect[],
): StatusEffect[] {
  return [...effects].sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.sourceId.localeCompare(b.sourceId) ||
      a.duration - b.duration ||
      (a.value ?? 0) - (b.value ?? 0),
  )
}

/**
 * Full-object equality of two status-effect sets (`type`/`duration`/
 * `value`/`sourceId` all significant, order-independent) — never a
 * `type`-only `Set` comparison (Phase 9.8.3 item 26).
 */
export function statusEffectsEqual(
  a: readonly StatusEffect[],
  b: readonly StatusEffect[],
): boolean {
  if (a.length !== b.length) return false
  const sortedA = sortStatusEffectsCanonically(a)
  const sortedB = sortStatusEffectsCanonically(b)
  return sortedA.every((effect, i) => {
    const other = sortedB[i]
    return (
      effect.type === other.type &&
      effect.duration === other.duration &&
      effect.value === other.value &&
      effect.sourceId === other.sourceId
    )
  })
}
