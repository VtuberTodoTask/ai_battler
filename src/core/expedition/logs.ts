import {
  ExpeditionEffect,
  ExpeditionLogEntry,
  ExpeditionPhase,
  ExpeditionState,
} from './types.ts'

export function addLog(
  state: ExpeditionState,
  entry: ExpeditionLogEntry,
): void {
  state.logs.push(entry)
}

export function logEntry(
  phase: ExpeditionPhase,
  type: string,
  actorIds: string[],
  facts: string[],
  effects: ExpeditionEffect[] = [],
  check?: ExpeditionLogEntry['check'],
  targetIds?: string[],
): ExpeditionLogEntry {
  return {
    phase,
    type,
    actorIds,
    targetIds,
    check,
    effects,
    facts,
  }
}
