import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../core/tavern/brokerage.ts'
import { deepClone } from '../../core/util.ts'
import { generateNarrative } from '../../core/narrative/generation.ts'
import { generateDowntimeNarrative } from '../../core/narrative/downtime.ts'
import type { NarrativeCandidate } from '../../core/narrative/types.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import { acceptanceReasonText } from '../../core/tavern/acceptance.ts'
import type { OfferRequestActionData, UiActionResult } from '../canvas/types.ts'
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
    (
      partyId: string,
      requestId: string,
    ): UiActionResult<OfferRequestActionData> => {
      try {
        const nextDay = offerRequestToParty(
          campaign.currentDay,
          requestId,
          partyId,
        )
        const offer = nextDay.offers.find(
          (o) => o.requestId === requestId && o.partyId === partyId,
        )
        setCampaign((prev) => ({ ...prev, currentDay: nextDay }))
        setError(null)
        if (!offer) {
          return { ok: true, data: { decision: 'accepted' } }
        }
        return {
          ok: true,
          data: {
            decision: offer.decision,
            reason: offer.reason,
            reasonText: acceptanceReasonText(offer.reason),
          },
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '紹介に失敗しました'
        setError(message)
        return { ok: false, message }
      }
    },
    [campaign],
  )

  const handleOpenActivity = useCallback(
    async (
      partyId: string,
      eventId: string,
    ): Promise<{ ok: true; data: string } | { ok: false; message: string }> => {
      const party = campaign.currentDay.parties.find((p) => p.id === partyId)
      const event = party?.downtimeEvents?.find((e) => e.id === eventId)
      if (!party || !event) {
        return { ok: false, message: 'イベントが見つかりません' }
      }

      // If already generated, just mark viewed and return the existing text (0 AI calls).
      if (event.narrativeStatus === 'generated' && event.generatedText) {
        setCampaign((current) => {
          const next = deepClone(current)
          const currentParty = next.currentDay.parties.find(
            (p) => p.id === partyId,
          )
          const currentEvent = currentParty?.downtimeEvents?.find(
            (e) => e.id === eventId,
          )
          if (currentEvent) {
            currentEvent.narrativeStatus = 'viewed'
          }
          return next
        })
        return { ok: true, data: event.generatedText }
      }

      // Generate once, then merge only the target event narrative into the latest campaign state.
      const cloneForGeneration = deepClone(campaign)
      const cloneParty = cloneForGeneration.currentDay.parties.find(
        (p) => p.id === partyId,
      )
      const cloneEvent = cloneParty?.downtimeEvents?.find(
        (e) => e.id === eventId,
      )
      if (!cloneParty || !cloneEvent) {
        return { ok: false, message: 'イベントが見つかりません' }
      }

      const text = await generateDowntimeNarrative(
        cloneEvent,
        cloneParty as unknown as Parameters<
          typeof generateDowntimeNarrative
        >[1],
        narrativeProvider,
      )

      setCampaign((current) => {
        const next = deepClone(current)
        const currentParty = next.currentDay.parties.find(
          (p) => p.id === partyId,
        )
        const currentEvent = currentParty?.downtimeEvents?.find(
          (e) => e.id === eventId,
        )
        if (!currentEvent) {
          // Event disappeared while generating (e.g. day advanced): discard stale result safely.
          return current
        }
        currentEvent.narrativeStatus = 'viewed'
        currentEvent.generatedText = text
        return next
      })

      return { ok: true, data: text }
    },
    [campaign, narrativeProvider],
  )

  const handleResolve = useCallback(():
    { ok: true } | { ok: false; message: string } => {
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
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : '仲介確定に失敗しました'
      setError(message)
      return { ok: false, message }
    }
  }, [campaign])

  const handleAdvance = useCallback(():
    { ok: true } | { ok: false; message: string } => {
    try {
      const next = advanceCampaignDay(campaign)
      setCampaign(next)
      setSelectedRequestId(next.currentDay.requests[0]?.id ?? selectedRequestId)
      setSelectedPartyId(null)
      setSelectedResultId(null)
      setError(null)
      return { ok: true }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : '翌日への進行に失敗しました'
      setError(message)
      return { ok: false, message }
    }
  }, [campaign, selectedRequestId])

  const handleOpenExpeditionNarrative = useCallback(
    async (candidateId: string): Promise<UiActionResult<string>> => {
      const candidate = campaign.narrativeCandidates.find(
        (c) => c.id === candidateId,
      )
      if (!candidate) {
        return { ok: false, message: '物語の候補が見つかりません' }
      }

      if (candidate.state === 'generated' && candidate.activeGenerationId) {
        const record = campaign.narrativeGenerations.find(
          (g) => g.id === candidate.activeGenerationId,
        )
        if (record) {
          return { ok: true, data: record.generatedText }
        }
      }

      if (!narrativeProvider) {
        return { ok: false, message: 'AI provider not connected' }
      }

      const { candidate: updated, record } = await generateNarrative(
        candidate as NarrativeCandidate,
        narrativeProvider,
      )

      setCampaign((current) => {
        const next = deepClone(current)
        next.narrativeCandidates = next.narrativeCandidates.map((c) =>
          c.id === updated.id ? updated : c,
        )
        if (!next.narrativeGenerations.some((g) => g.id === record.id)) {
          next.narrativeGenerations = [...next.narrativeGenerations, record]
        }
        return next
      })

      return { ok: true, data: record.generatedText }
    },
    [campaign, narrativeProvider],
  )

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
            onOpenExpeditionNarrative={handleOpenExpeditionNarrative}
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
            handleOfferRequest(selectedPartyId, selectedRequestId)
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
