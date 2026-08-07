import type { Adventurer } from '../../core/models/types.ts'
import type {
  ExpeditionObjectiveState,
  ExpeditionResult,
} from '../../core/expedition/types.ts'

export function buildAdventurerMap(
  party: Adventurer[],
): Map<string, Adventurer> {
  return new Map(party.map((a) => [a.id, a]))
}

export function buildTargetNameMap(
  objective: ExpeditionObjectiveState | undefined,
): Map<string, string> {
  const map = new Map<string, string>()
  if (!objective) return map

  switch (objective.type) {
    case 'rescue':
      map.set(objective.targetId, objective.targetName)
      return map
    case 'escort':
      map.set(objective.targetId, objective.targetName)
      map.set(objective.destinationId, objective.destinationName)
      return map
    case 'retrieval':
      map.set(objective.targetId, objective.targetName)
      return map
    case 'survey':
      map.set(objective.areaId, objective.areaName)
      for (const sector of objective.sectors) {
        map.set(sector.id, sector.name)
      }
      return map
    default:
      return map
  }
}

export function resolveActorName(
  id: string,
  partyMap: Map<string, Adventurer>,
): string {
  const a = partyMap.get(id)
  return a ? `${a.name} / ${a.role}` : id
}

export function resolveTargetName(
  id: string,
  targetMap: Map<string, string>,
): string {
  return targetMap.get(id) ?? id
}

export function getInitialStats(
  result: ExpeditionResult,
): Map<string, { hp: number; mp: number; morale: number }> {
  const map = new Map<string, { hp: number; mp: number; morale: number }>()
  const snapshot = result.state.battles[0]?.entrySnapshot
  if (snapshot) {
    for (const id of result.party.map((a) => a.id)) {
      map.set(id, {
        hp: snapshot.initialHp[id] ?? 0,
        mp: snapshot.initialMp[id] ?? 0,
        morale: snapshot.initialMorale[id] ?? 0,
      })
    }
  } else {
    for (const a of result.party) {
      map.set(a.id, { hp: a.currentHp, mp: a.currentMp, morale: a.morale })
    }
  }
  return map
}
