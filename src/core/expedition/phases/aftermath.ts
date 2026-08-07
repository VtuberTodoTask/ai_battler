import { Adventurer } from '../../models/types.ts'
import {
  ExpeditionEffect,
  ExpeditionExecutionContext,
  ExpeditionObjectiveHandler,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import { addMoraleAll, getActiveParty, getNonDeadParty } from '../state.ts'
import { resolveSkillCheck } from '../checks.ts'
import { treatMember } from '../injuries.ts'

export function runAftermath(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
  handler: ExpeditionObjectiveHandler,
): void {
  state.currentPhase = 'aftermath'

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (state.casualties.length > 0) {
    facts.push(`犠牲者: ${state.casualties.join(', ')}`)
    addMoraleAll(state, party, -10)
    effects.push({ type: 'moraleChange', value: -10 })
  }

  const ctx: ExpeditionExecutionContext = { request, party, state, rng }
  const { objectiveCompleted, progressFact } =
    handler.finalizeObjectiveState(ctx)
  state.objectiveCompleted = objectiveCompleted
  facts.push(progressFact)

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
