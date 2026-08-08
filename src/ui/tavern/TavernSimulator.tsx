import { useCallback, useMemo, useState } from 'react'
import { generateTavernDay } from '../../core/tavern/dayGenerator.ts'
import {
  offerRequestToParty,
  resolveTavernDay,
} from '../../core/tavern/brokerage.ts'
import { makeRandomSeed } from '../expedition/presets.ts'
import type { TavernDayState } from '../../core/tavern/types.ts'
import { TavernControls } from './TavernControls.tsx'
import { RequestBoard } from './RequestBoard.tsx'
import { PartyBoard } from './PartyBoard.tsx'
import { BrokeragePanel } from './BrokeragePanel.tsx'
import { DispatchResults } from './DispatchResults.tsx'
import { TavernResultDetail } from './TavernResultDetail.tsx'
import './tavern.css'

const DEFAULT_SEED = 'tavern-001'
const initialDay = generateTavernDay(DEFAULT_SEED)

export function TavernSimulator() {
  const [day, setDay] = useState<TavernDayState>(initialDay)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    initialDay.requests[0]?.id ?? null,
  )
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null)
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [seedInput, setSeedInput] = useState(DEFAULT_SEED)
  const [error, setError] = useState<string | null>(null)

  const generateDay = useCallback((seed: string) => {
    const nextDay = generateTavernDay(seed)
    setDay(nextDay)
    setSelectedRequestId(nextDay.requests[0]?.id ?? null)
    setSelectedPartyId(null)
    setSelectedResultId(null)
    setError(null)
  }, [])

  const handleNewDay = useCallback(() => {
    const seed = makeRandomSeed()
    setSeedInput(seed)
    generateDay(seed)
  }, [generateDay])

  const handleSelectRequest = useCallback((id: string) => {
    setSelectedRequestId(id)
    setSelectedPartyId(null)
    setSelectedResultId(null)
    setError(null)
  }, [])

  const handleSelectParty = useCallback((id: string) => {
    setSelectedPartyId(id)
    setSelectedResultId(null)
    setError(null)
  }, [])

  const handleOffer = useCallback(() => {
    if (!selectedRequestId || !selectedPartyId) return
    try {
      const nextDay = offerRequestToParty(
        day,
        selectedRequestId,
        selectedPartyId,
      )
      setDay(nextDay)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '紹介に失敗しました')
    }
  }, [day, selectedRequestId, selectedPartyId])

  const handleResolve = useCallback(() => {
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
      setError(e instanceof Error ? e.message : '仲介確定に失敗しました')
    }
  }, [day])

  const canResolve = useMemo(() => {
    if (day.status === 'resolved') return false
    return day.matches.length > 0
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
          day={day}
          selectedRequestId={selectedRequestId}
          onSelectRequest={handleSelectRequest}
        />
        <PartyBoard
          parties={day.parties}
          selectedPartyId={selectedPartyId}
          disabled={day.status === 'resolved'}
          onSelectParty={handleSelectParty}
        />
      </div>

      <BrokeragePanel
        day={day}
        selectedRequestId={selectedRequestId}
        selectedPartyId={selectedPartyId}
        canResolve={canResolve}
        error={error}
        onOffer={handleOffer}
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
