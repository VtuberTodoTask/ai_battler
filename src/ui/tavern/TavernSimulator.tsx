import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../core/tavern/brokerage.ts'
import { deepClone } from '../../core/util.ts'
import { generateDowntimeNarrative } from '../../core/narrative/downtime.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import { TavernControls } from './TavernControls.tsx'
import { CampaignHeader } from './CampaignHeader.tsx'
import { RequestBoard } from './RequestBoard.tsx'
import { PartyBoard } from './PartyBoard.tsx'
import { BrokeragePanel } from './BrokeragePanel.tsx'
import { DispatchResults } from './DispatchResults.tsx'
import { TavernResultDetail } from './TavernResultDetail.tsx'
import { CampaignResultSummary } from './CampaignResultSummary.tsx'
import { CampaignHistory } from './CampaignHistory.tsx'
import { ExpeditionPredictionPanel } from './ExpeditionPredictionPanel.tsx'
import { NarrativeQueue } from './NarrativeQueue.tsx'
import { NarrativeSettings } from './NarrativeSettings.tsx'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { NarrativeProviderConfig } from './NarrativeSettings.tsx'
import './tavern.css'

const GameCanvasHost = lazy(() => import('../canvas/GameCanvasHost.tsx'))

const DEFAULT_CAMPAIGN_SEED = 'tavern-campaign-001'
const initialCampaign = createTavernCampaign(DEFAULT_CAMPAIGN_SEED)

export function TavernSimulator() {
  const [campaign, setCampaign] = useState<TavernCampaignState>(initialCampaign)
  const [seedInput, setSeedInput] = useState(DEFAULT_CAMPAIGN_SEED)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    initialCampaign.currentDay.requests[0]?.id ?? null,
  )
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null)
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [narrativeProvider, setNarrativeProvider] =
    useState<NarrativeProvider | null>(null)
  const [narrativeConfig, setNarrativeConfig] =
    useState<NarrativeProviderConfig>({
      endpoint: '',
      model: '',
      apiKey: '',
    })
  const [uiMode, setUiMode] = useState<'legacy' | 'canvas'>('legacy')

  const day = campaign.currentDay

  const startCampaign = useCallback((seed: string) => {
    const next = createTavernCampaign(seed)
    setCampaign(next)
    setSelectedRequestId(next.currentDay.requests[0]?.id ?? null)
    setSelectedPartyId(null)
    setSelectedResultId(null)
    setError(null)
  }, [])

  const handleSelectRequest = useCallback(
    (id: string) => {
      if (day.status === 'resolved') {
        return
      }
      setSelectedRequestId(id)
      setSelectedPartyId(null)
      setSelectedResultId(null)
      setError(null)
    },
    [day.status],
  )

  const handleSelectParty = useCallback((id: string) => {
    setSelectedPartyId(id)
    setSelectedResultId(null)
    setError(null)
  }, [])

  const handleOfferRequest = useCallback(
    (requestId: string, partyId: string) => {
      try {
        const nextDay = offerRequestToParty(
          campaign.currentDay,
          requestId,
          partyId,
        )
        setCampaign((prev) => ({ ...prev, currentDay: nextDay }))
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : '紹介に失敗しました')
      }
    },
    [campaign],
  )

  const handleOpenActivity = useCallback(
    async (partyId: string, eventId: string) => {
      const party = campaign.currentDay.parties.find((p) => p.id === partyId)
      const event = party?.downtimeEvents?.find((e) => e.id === eventId)
      if (!party || !event) return ''

      const next = deepClone(campaign)
      const nextParty = next.currentDay.parties.find((p) => p.id === partyId)
      const nextEvent = nextParty?.downtimeEvents?.find((e) => e.id === eventId)
      if (!nextParty || !nextEvent) return ''

      const text = await generateDowntimeNarrative(
        nextEvent,
        nextParty as unknown as Parameters<typeof generateDowntimeNarrative>[1],
        narrativeProvider,
      )
      nextEvent.narrativeStatus = 'viewed'
      setCampaign(next)
      return text
    },
    [campaign, narrativeProvider],
  )

  const handleResolve = useCallback(() => {
    try {
      const next = resolveCampaignDay(campaign)
      setCampaign(next)
      const firstResolved = next.currentDay.results.find(
        (r) => r.status === 'resolved',
      )
      setSelectedResultId(
        firstResolved?.requestId ??
          next.currentDay.results[0]?.requestId ??
          null,
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '仲介確定に失敗しました')
    }
  }, [campaign])

  const handleAdvance = useCallback(() => {
    try {
      const next = advanceCampaignDay(campaign)
      setCampaign(next)
      setSelectedRequestId(next.currentDay.requests[0]?.id ?? selectedRequestId)
      setSelectedPartyId(null)
      setSelectedResultId(null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '翌日への進行に失敗しました')
    }
  }, [campaign, selectedRequestId])

  const handleUpdateCampaign = useCallback(
    (updater: (c: TavernCampaignState) => TavernCampaignState) => {
      setCampaign((prev) => updater(prev))
    },
    [],
  )

  const canResolve = useMemo(() => {
    return day.status === 'planning'
  }, [day])

  const canAdvance = useMemo(() => {
    return day.status === 'resolved'
  }, [day])

  const selectedResolved = useMemo(() => {
    if (!selectedResultId) return null
    return day.results.find((r) => r.requestId === selectedResultId) ?? null
  }, [day, selectedResultId])

  const currentDayRecord = useMemo(() => {
    return campaign.history.find((h) => h.dayNumber === campaign.dayNumber)
  }, [campaign])

  const selectedRequest = useMemo(() => {
    return (
      day.requests.find((request) => request.id === selectedRequestId) ?? null
    )
  }, [day, selectedRequestId])

  const selectedParty = useMemo(() => {
    return day.parties.find((party) => party.id === selectedPartyId) ?? null
  }, [day, selectedPartyId])

  if (uiMode === 'canvas') {
    return (
      <div className="tavern-simulator tavern-canvas-shell">
        <Suspense
          fallback={<div className="canvas-loading">Canvas loading...</div>}
        >
          <GameCanvasHost
            campaign={campaign}
            onAdvanceDay={handleAdvance}
            onResolveDay={handleResolve}
            onOfferRequest={handleOfferRequest}
            onOpenActivity={handleOpenActivity}
            onSwitchToLegacy={() => setUiMode('legacy')}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="tavern-simulator">
      <div className="ui-mode-switch">
        <button onClick={() => setUiMode('canvas')}>Canvas UI</button>
      </div>

      <TavernControls
        seed={seedInput}
        onSeedChange={setSeedInput}
        onNewCampaign={startCampaign}
      />

      <CampaignHeader campaign={campaign} />

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

      {day.status === 'planning' && (
        <ExpeditionPredictionPanel
          requestOffer={selectedRequest}
          tavernParty={selectedParty}
        />
      )}

      <BrokeragePanel
        day={day}
        selectedRequestId={selectedRequestId}
        selectedPartyId={selectedPartyId}
        canResolve={canResolve}
        canAdvance={canAdvance}
        error={error}
        onOffer={() => {
          if (selectedRequestId && selectedPartyId) {
            handleOfferRequest(selectedRequestId, selectedPartyId)
          }
        }}
        onResolve={handleResolve}
        onAdvance={handleAdvance}
      />

      {day.status === 'resolved' && currentDayRecord && (
        <>
          <CampaignResultSummary
            results={day.results}
            reputationChange={currentDayRecord.reputationChange}
          />
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

      <CampaignHistory
        history={campaign.history}
        candidates={campaign.narrativeCandidates}
      />

      <NarrativeQueue
        campaign={campaign}
        provider={narrativeProvider}
        onUpdateCampaign={handleUpdateCampaign}
      />

      <NarrativeSettings
        provider={narrativeProvider}
        config={narrativeConfig}
        onChange={setNarrativeConfig}
        onProviderChange={setNarrativeProvider}
      />
    </div>
  )
}
