import type {
  ExpeditionEffect,
  ExpeditionLogEntry,
  ExpeditionPhase,
  ExpeditionResult,
} from '../../core/expedition/types.ts'

export interface ExpeditionReplayEvent {
  index: number
  phase: ExpeditionPhase
  type: string
  actorIds: string[]
  targetIds: string[]
  facts: string[]
  effects: ExpeditionEffect[]
  check?: ExpeditionLogEntry['check']
}

export function buildReplayEvents(
  result: ExpeditionResult,
): ExpeditionReplayEvent[] {
  return result.state.logs.map((log, index) => ({
    index,
    phase: log.phase,
    type: log.type,
    actorIds: log.actorIds ?? [],
    targetIds: log.targetIds ?? [],
    facts: log.facts ?? [],
    effects: log.effects ?? [],
    check: log.check,
  }))
}

export interface ReplaySummaryItem {
  kind: 'summary'
  outcome: string
  completed: boolean
  progress: number
}

export type ReplayItem =
  | { kind: 'engineLog'; event: ExpeditionReplayEvent }
  | { kind: 'summary'; outcome: string; completed: boolean; progress: number }

export function buildReplayItems(result: ExpeditionResult): ReplayItem[] {
  const items: ReplayItem[] = buildReplayEvents(result).map((event) => ({
    kind: 'engineLog',
    event,
  }))
  items.push({
    kind: 'summary',
    outcome: result.outcome,
    completed: result.state.objectiveCompleted,
    progress: result.state.objectiveProgress,
  })
  return items
}
