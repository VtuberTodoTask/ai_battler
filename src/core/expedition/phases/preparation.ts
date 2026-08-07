import { Adventurer, SkillName } from '../../models/types.ts'
import {
  ExpeditionEffect,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import { addMoraleAll, getActiveParty } from '../state.ts'
import { hasRole, resolveSkillCheck } from '../checks.ts'

export function runPreparation(
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
