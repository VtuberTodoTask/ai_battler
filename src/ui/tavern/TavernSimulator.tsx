import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateTavernDay } from '../../core/tavern/dayGenerator.ts'
import {
  resolveTavernDay,
  validateAssignments,
} from '../../core/tavern/dispatch.ts'
import { makeRandomSeed } from '../expedition/presets.ts'
import type {
  TavernDayState,
  TavernRequestOffer,
} from '../../core/tavern/types.ts'
import { TavernControls } from './TavernControls.tsx'
import { RequestBoard } from './RequestBoard.tsx'
import { AdventurerBoard } from './AdventurerBoard.tsx'
import { DispatchPanel } from './DispatchPanel.tsx'
import { DispatchResults } from './DispatchResults.tsx'
import { TavernResultDetail } from './TavernResultDetail.tsx'
import './tavern.css'

const DEFAULT_SEED = 'tavern-001'
const initialDay = generateTavernDay(DEFAULT_SEED)

function updateAssignments(
  day: TavernDayState,
  nextAssignments: TavernDayState['assignments'],
): TavernDayState {
  const assignedMap = new Map<string, string>()
  for (const a of nextAssignments) {
    for (const adventurerId of a.adventurerIds) {
      assignedMap.set(adventurerId, a.requestId)
    }
  }

  return {
    ...day,
    status: 'planning',
    results: [],
    assignments: nextAssignments,
    adventurers: day.adventurers.map((ta) => ({
      ...ta,
      assignedRequestId: assignedMap.get(ta.id),
    })),
  }
}

export function TavernSimulator() {
  const [day, setDay] = useState<TavernDayState>(initialDay)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    initialDay.requests[0]?.id ?? null,
  )
  const selectedRequestIdRef = useRef<string | null>(selectedRequestId)
  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId
  }, [selectedRequestId])

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [seedInput, setSeedInput] = useState(DEFAULT_SEED)
  const [error, setError] = useState<string | null>(null)

  const generateDay = useCallback((seed: string) => {
    const nextDay = generateTavernDay(seed)
    setDay(nextDay)
    setSelectedRequestId(nextDay.requests[0]?.id ?? null)
    selectedRequestIdRef.current = nextDay.requests[0]?.id ?? null
    setSelectedResultId(null)
    setError(null)
  }, [])

  const handleNewDay = useCallback(() => {
    const seed = makeRandomSeed()
    setSeedInput(seed)
    generateDay(seed)
  }, [generateDay])

  const selectedRequest = useMemo<TavernRequestOffer | null>(() => {
    if (!day || !selectedRequestId) return null
    return day.requests.find((r) => r.id === selectedRequestId) ?? null
  }, [day, selectedRequestId])

  const selectedAssignment = useMemo(() => {
    if (!day || !selectedRequestId) return null
    return (
      day.assignments.find((a) => a.requestId === selectedRequestId) ?? {
        requestId: selectedRequestId,
        adventurerIds: [],
      }
    )
  }, [day, selectedRequestId])

  const selectedAssignedAdventurers = useMemo(() => {
    if (!day || !selectedAssignment) return []
    const ids = new Set(selectedAssignment.adventurerIds)
    return day.adventurers.filter((ta) => ids.has(ta.id))
  }, [day, selectedAssignment])

  const assignmentValidationErrors = useMemo(() => {
    if (!day) return []
    return validateAssignments(day.assignments, day.adventurers, day.requests)
  }, [day])

  const canResolve = useMemo(() => {
    if (!day || day.status === 'resolved') return false
    if (assignmentValidationErrors.length > 0) return false
    return day.assignments.some((a) => a.adventurerIds.length === 4)
  }, [day, assignmentValidationErrors])

  const currentWarning = useMemo(() => {
    if (!selectedAssignment || selectedAssignment.adventurerIds.length === 0)
      return undefined
    if (selectedAssignment.adventurerIds.length < 4) {
      return `${selectedAssignment.adventurerIds.length}人が編成されています。派遣には4人必要です。`
    }
    return undefined
  }, [selectedAssignment])

  const handleSelectRequest = useCallback((id: string) => {
    setSelectedRequestId(id)
    selectedRequestIdRef.current = id
    setSelectedResultId(null)
  }, [])

  const handleToggleAdventurer = useCallback((adventurerId: string) => {
    const requestId = selectedRequestIdRef.current
    if (!requestId) return

    setDay((currentDay) => {
      const adventurer = currentDay.adventurers.find(
        (ta) => ta.id === adventurerId,
      )
      if (!adventurer) return currentDay

      const existingAssignmentIndex = currentDay.assignments.findIndex(
        (a) => a.requestId === requestId,
      )

      const existingAssignment =
        existingAssignmentIndex >= 0
          ? currentDay.assignments[existingAssignmentIndex]
          : { requestId, adventurerIds: [] }

      const alreadyInThis =
        existingAssignment.adventurerIds.includes(adventurerId)

      let nextAssignmentAdventurerIds: string[]
      if (alreadyInThis) {
        nextAssignmentAdventurerIds = existingAssignment.adventurerIds.filter(
          (id) => id !== adventurerId,
        )
      } else {
        if (existingAssignment.adventurerIds.length >= 4) return currentDay
        if (
          adventurer.assignedRequestId &&
          adventurer.assignedRequestId !== requestId
        )
          return currentDay
        nextAssignmentAdventurerIds = [
          ...existingAssignment.adventurerIds,
          adventurerId,
        ]
      }

      const nextAssignments = [...currentDay.assignments]
      if (nextAssignmentAdventurerIds.length === 0) {
        if (existingAssignmentIndex >= 0) {
          nextAssignments.splice(existingAssignmentIndex, 1)
        }
      } else {
        if (existingAssignmentIndex >= 0) {
          nextAssignments[existingAssignmentIndex] = {
            ...existingAssignment,
            adventurerIds: nextAssignmentAdventurerIds,
          }
        } else {
          nextAssignments.push({
            requestId,
            adventurerIds: nextAssignmentAdventurerIds,
          })
        }
      }

      return updateAssignments(currentDay, nextAssignments)
    })
    setError(null)
  }, [])

  const handleResolve = useCallback(() => {
    if (!day) return
    const validation = validateAssignments(
      day.assignments,
      day.adventurers,
      day.requests,
    )
    if (validation.length > 0) {
      setError(validation.join('\n'))
      return
    }

    try {
      const results = resolveTavernDay(day)
      const nextDay: TavernDayState = { ...day, status: 'resolved', results }
      setDay(nextDay)
      const firstResolved = results.find((r) => r.status === 'resolved')
      setSelectedResultId(
        firstResolved?.requestId ?? results[0]?.requestId ?? null,
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '派遣に失敗しました')
    }
  }, [day])

  const selectedResolved = useMemo(() => {
    if (!day || !selectedResultId) return null
    return day.results.find((r) => r.requestId === selectedResultId) ?? null
  }, [day, selectedResultId])

  if (!day) {
    return <div className="tavern-simulator">Loading...</div>
  }

  return (
    <div className="tavern-simulator">
      <TavernControls
        seed={seedInput}
        onSeedChange={setSeedInput}
        onGenerate={generateDay}
        onNewDay={handleNewDay}
      />

      <div className="tavern-day-header">
        <h2>酒場仲介ボード</h2>
        <span className="day-id">Day: {day.seed}</span>
      </div>

      <div className="tavern-boards">
        <RequestBoard
          requests={day.requests}
          assignments={day.assignments}
          selectedRequestId={selectedRequestId}
          results={day.results}
          onSelectRequest={handleSelectRequest}
        />
        <AdventurerBoard
          adventurers={day.adventurers}
          requests={day.requests}
          selectedRequestId={selectedRequestId}
          onToggleAdventurer={handleToggleAdventurer}
        />
      </div>

      <DispatchPanel
        selectedRequest={selectedRequest}
        assignedAdventurers={selectedAssignedAdventurers}
        canResolve={canResolve}
        warning={currentWarning}
        error={error}
        onResolve={handleResolve}
      />

      {day.status === 'resolved' && (
        <>
          <DispatchResults
            results={day.results}
            selectedResultId={selectedResultId}
            onSelectResult={setSelectedResultId}
          />
          {selectedResolved && (
            <TavernResultDetail resolved={selectedResolved} />
          )}
        </>
      )}
    </div>
  )
}
