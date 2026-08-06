import { Adventurer, SkillName } from '../../models/types.ts'
import {
  ExpeditionEffect,
  ExpeditionFeature,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import {
  addMoraleAll,
  applyExpeditionDamage,
  getActiveParty,
  hasFeature,
} from '../state.ts'
import { attemptInformationDiscovery } from '../information.ts'
import { handleEnvironmentalHazard } from './approach.ts'
import { hasRole, rankPenaltyForRequest } from '../checks.ts'

export function runExploration(
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

export function handleFeatureDuringExploration(
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
