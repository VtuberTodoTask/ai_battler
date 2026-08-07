import { Adventurer, SkillName } from '../../models/types.ts'
import {
  ExpeditionEffect,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import {
  applyExpeditionDamage,
  getActiveParty,
  getNonDeadParty,
} from '../state.ts'
import { resolveSkillCheck } from '../checks.ts'
import { travelPhase } from './approach.ts'
import { treatMember } from '../injuries.ts'

export function runReturn(
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
