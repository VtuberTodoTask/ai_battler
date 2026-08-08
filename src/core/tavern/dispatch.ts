import { runExpedition } from '../expedition/expedition.ts'
import { deepClone } from '../util.ts'
import { buildDispatchReport } from './report.ts'
import type {
  DispatchAssignment,
  ResolvedDispatch,
  TavernAdventurer,
  TavernDayState,
  TavernRequestOffer,
} from './types.ts'

export function validateAssignments(
  assignments: DispatchAssignment[],
  adventurers: TavernAdventurer[],
  requests: TavernRequestOffer[],
): string[] {
  const errors: string[] = []
  const requestIds = new Set(requests.map((r) => r.id))
  const adventurerIds = new Set(adventurers.map((a) => a.id))
  const assignedIds = new Set<string>()

  for (const assignment of assignments) {
    if (!requestIds.has(assignment.requestId)) {
      errors.push(`未知の依頼ID: ${assignment.requestId}`)
    }

    if (
      assignment.adventurerIds.length > 0 &&
      assignment.adventurerIds.length !== 4
    ) {
      errors.push(
        `依頼 ${assignment.requestId} のパーティ人数が不正です: ${assignment.adventurerIds.length}人（0または4必要）`,
      )
    }

    if (assignment.adventurerIds.length > 4) {
      errors.push(
        `依頼 ${assignment.requestId} のパーティ人数が4人を超えています`,
      )
    }

    for (const adventurerId of assignment.adventurerIds) {
      if (!adventurerIds.has(adventurerId)) {
        errors.push(`未知の冒険者ID: ${adventurerId}`)
      }
      if (assignedIds.has(adventurerId)) {
        errors.push(`冒険者 ${adventurerId} は複数の依頼に割り当てられています`)
      }
      assignedIds.add(adventurerId)
    }
  }

  if (assignedIds.size > 8) {
    errors.push(
      `割り当てられた冒険者が8人を超えています: ${assignedIds.size}人`,
    )
  }

  return errors
}

export function resolveTavernDay(state: TavernDayState): ResolvedDispatch[] {
  const errors = validateAssignments(
    state.assignments,
    state.adventurers,
    state.requests,
  )
  if (errors.length > 0) {
    throw new Error(`派遣が不正です:\n${errors.join('\n')}`)
  }

  const results: ResolvedDispatch[] = []

  for (const request of state.requests) {
    const assignment = state.assignments.find((a) => a.requestId === request.id)
    if (!assignment || assignment.adventurerIds.length === 0) {
      results.push({
        requestId: request.id,
        request,
        partyIds: [],
        status: 'notDispatched',
      })
      continue
    }

    const assignedAdventurers = new Map(state.adventurers.map((a) => [a.id, a]))

    const party = assignment.adventurerIds.map((id) => {
      const tavernAdventurer = assignedAdventurers.get(id)
      if (!tavernAdventurer) {
        throw new Error(`冒険者 ${id} が見つかりません`)
      }
      return deepClone(tavernAdventurer.adventurer)
    })

    const result = runExpedition(request.expeditionRequest, party)
    const report = buildDispatchReport(request.id, result)

    results.push({
      requestId: request.id,
      request,
      partyIds: assignment.adventurerIds,
      status: 'resolved',
      result,
      report,
    })
  }

  return results
}
