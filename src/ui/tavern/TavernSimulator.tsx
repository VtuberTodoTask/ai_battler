import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import { generateCampaignSeed } from '../../core/save/seed.ts'
import {
  InMemorySaveRepository,
  IndexedDbSaveRepository,
  listSaveSlotSummaries,
  loadFromSlot,
  saveToSlot,
  type SaveRepository,
} from '../../core/save/index.ts'
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
import { AudioSettings } from '../canvas/audio/AudioSettings.tsx'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { NarrativeProviderConfig } from './NarrativeSettings.tsx'
import './tavern.css'

const GameCanvasHost = lazy(() => import('../canvas/GameCanvasHost.tsx'))

function createInitialCampaign(): TavernCampaignState | null {
  return import.meta.env.MODE === 'test'
    ? createTavernCampaign('tavern-campaign-001')
    : null
}

export function TavernSimulator() {
  const [campaign, setCampaign] = useState<TavernCampaignState | null>(() =>
    createInitialCampaign(),
  )
  const [seedInput, setSeedInput] = useState(
    () => createInitialCampaign()?.seed ?? '',
  )
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    () => createInitialCampaign()?.currentDay.requests[0]?.id ?? null,
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
  const [uiMode, setUiMode] = useState<'legacy' | 'canvas'>(
    import.meta.env.MODE === 'test' ? 'legacy' : 'canvas',
  )
  const [canvasSettingsOpen, setCanvasSettingsOpen] = useState(false)

  const saveRepositoryRef = useRef<SaveRepository | null>(null)

  useEffect(() => {
    if (typeof indexedDB !== 'undefined') {
      try {
        saveRepositoryRef.current = new IndexedDbSaveRepository()
      } catch {
        saveRepositoryRef.current = new InMemorySaveRepository()
      }
    } else {
      saveRepositoryRef.current = new InMemorySaveRepository()
    }
  }, [])

  const getSaveRepository = useCallback((): SaveRepository => {
    if (!saveRepositoryRef.current) {
      saveRepositoryRef.current = new InMemorySaveRepository()
    }
    return saveRepositoryRef.current
  }, [])

  const autosave = useCallback(
    async (target: TavernCampaignState) => {
      try {
        await saveToSlot(getSaveRepository(), 'autosave', {
          campaign: target,
          persistentPresentationState: {
            viewedActivityIds: [],
            viewedReportIds: [],
          },
        })
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'オートセーブに失敗しました'
        setError(message)
      }
    },
    [getSaveRepository],
  )

  const startCampaign = useCallback((seed: string) => {
    const next = createTavernCampaign(seed)
    setCampaign(next)
    setSeedInput(seed)
    setSelectedRequestId(next.currentDay.requests[0]?.id ?? null)
    setSelectedPartyId(null)
    setSelectedResultId(null)
    setError(null)
    return next
  }, [])

  const handleNewGame = useCallback((): UiActionResult => {
    try {
      const seed = generateCampaignSeed()
      const next = startCampaign(seed)
      void autosave(next)
      return { ok: true }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : '新規ゲームの開始に失敗しました'
      setError(message)
      return { ok: false, message }
    }
  }, [startCampaign, autosave])

  const handleLoadGame = useCallback(
    async (slotId: string): Promise<UiActionResult> => {
      try {
        const data = await loadFromSlot(getSaveRepository(), slotId)
        const next = data.campaign
        setCampaign(next)
        setSelectedRequestId(next.currentDay.requests[0]?.id ?? null)
        setSelectedPartyId(null)
        setSelectedResultId(null)
        setError(null)
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'ロードに失敗しました'
        setError(message)
        return { ok: false, message }
      }
    },
    [getSaveRepository],
  )

  const handleSaveGame = useCallback(
    async (slotId: string): Promise<UiActionResult> => {
      if (!campaign) {
        return { ok: false, message: 'セーブ対象のゲームがありません' }
      }
      try {
        await saveToSlot(getSaveRepository(), slotId, {
          campaign,
          persistentPresentationState: {
            viewedActivityIds: [],
            viewedReportIds: [],
          },
        })
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'セーブに失敗しました'
        setError(message)
        return { ok: false, message }
      }
    },
    [campaign, getSaveRepository],
  )

  const handleDeleteSave = useCallback(
    async (slotId: string): Promise<UiActionResult> => {
      try {
        await getSaveRepository().delete(slotId)
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : '削除に失敗しました'
        setError(message)
        return { ok: false, message }
      }
    },
    [getSaveRepository],
  )

  const handleListSaves = useCallback(async () => {
    try {
      const slots = await listSaveSlotSummaries(getSaveRepository())
      return {
        ok: true,
        data: slots.map((s) => ({
          slotId: s.slotId,
          label: s.label,
          empty: s.empty,
          isAutosave: s.isAutosave,
          metadata: s.metadata
            ? {
                currentDay: s.metadata.currentDay,
                updatedAt: s.metadata.updatedAt,
                campaignSeed: s.metadata.campaignSeed,
                gameVersion: s.metadata.gameVersion,
                saveFormatVersion: s.metadata.saveFormatVersion,
              }
            : undefined,
          incompatible: s.incompatible,
          incompatibilityReason: s.incompatibilityReason,
        })),
      } as UiActionResult<
        {
          slotId: string
          label: string
          empty: boolean
          isAutosave: boolean
          metadata?: {
            currentDay: number
            updatedAt: string
            campaignSeed: string
            gameVersion: string
            saveFormatVersion: string
          }
          incompatible?: boolean
          incompatibilityReason?: string
        }[]
      >
    } catch (e) {
      const message = e instanceof Error ? e.message : '一覧取得に失敗しました'
      setError(message)
      return { ok: false, message }
    }
  }, [getSaveRepository])

  const handleSelectRequest = useCallback(
    (id: string) => {
      if (campaign?.currentDay.status === 'resolved') {
        return
      }
      setSelectedRequestId(id)
      setSelectedPartyId(null)
      setSelectedResultId(null)
      setError(null)
    },
    [campaign?.currentDay.status],
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
      if (!campaign) {
        return { ok: false, message: 'キャンペーンが開始されていません' }
      }
      try {
        const nextDay = offerRequestToParty(
          campaign.currentDay,
          requestId,
          partyId,
        )
        const offer = nextDay.offers.find(
          (o) => o.requestId === requestId && o.partyId === partyId,
        )
        setCampaign((prev) => (prev ? { ...prev, currentDay: nextDay } : prev))
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
      if (!campaign) {
        return { ok: false, message: 'キャンペーンが開始されていません' }
      }
      const party = campaign.currentDay.parties.find((p) => p.id === partyId)
      const event = party?.downtimeEvents?.find((e) => e.id === eventId)
      if (!party || !event) {
        return { ok: false, message: 'イベントが見つかりません' }
      }

      if (event.narrativeStatus === 'generated' && event.generatedText) {
        setCampaign((current) => {
          if (!current) return current
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
        if (!current) return current
        const next = deepClone(current)
        const currentParty = next.currentDay.parties.find(
          (p) => p.id === partyId,
        )
        const currentEvent = currentParty?.downtimeEvents?.find(
          (e) => e.id === eventId,
        )
        if (!currentEvent) {
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

  const handleResolve = useCallback((): UiActionResult => {
    if (!campaign) {
      return { ok: false, message: 'キャンペーンが開始されていません' }
    }
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

  const handleAdvance = useCallback((): UiActionResult => {
    if (!campaign) {
      return { ok: false, message: 'キャンペーンが開始されていません' }
    }
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

  const finishingRef = useRef(false)

  const handleFinishDay = useCallback((): UiActionResult => {
    if (finishingRef.current) {
      return { ok: false, message: '処理中です' }
    }
    if (!campaign) {
      return { ok: false, message: 'キャンペーンが開始されていません' }
    }
    finishingRef.current = true
    try {
      let next = campaign
      if (next.currentDay.status === 'planning') {
        next = resolveCampaignDay(next)
      }
      if (next.currentDay.status === 'resolved') {
        next = advanceCampaignDay(next)
      }
      setCampaign(next)
      setSelectedRequestId(next.currentDay.requests[0]?.id ?? null)
      setSelectedPartyId(null)
      setSelectedResultId(null)
      setError(null)
      void autosave(next)
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : '日次処理に失敗しました'
      setError(message)
      return { ok: false, message }
    } finally {
      finishingRef.current = false
    }
  }, [campaign, autosave])

  const handleOpenExpeditionNarrative = useCallback(
    async (candidateId: string): Promise<UiActionResult<string>> => {
      if (!campaign) {
        return { ok: false, message: 'キャンペーンが開始されていません' }
      }
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
        if (!current) return current
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
      setCampaign((prev) => (prev ? updater(prev) : prev))
    },
    [],
  )

  const handleOpenCanvasSettings = useCallback(() => {
    setCanvasSettingsOpen(true)
  }, [])

  const handleCloseCanvasSettings = useCallback(() => {
    setCanvasSettingsOpen(false)
  }, [])

  const canResolve = useMemo(() => {
    return campaign?.currentDay.status === 'planning'
  }, [campaign?.currentDay.status])

  const canAdvance = useMemo(() => {
    return campaign?.currentDay.status === 'resolved'
  }, [campaign?.currentDay.status])

  const selectedResolved = useMemo(() => {
    if (!selectedResultId || !campaign) return null
    return (
      campaign.currentDay.results.find(
        (r) => r.requestId === selectedResultId,
      ) ?? null
    )
  }, [campaign, selectedResultId])

  const currentDayRecord = useMemo(() => {
    if (!campaign) return null
    return campaign.history.find((h) => h.dayNumber === campaign.dayNumber)
  }, [campaign])

  const selectedRequest = useMemo(() => {
    if (!campaign) return null
    return (
      campaign.currentDay.requests.find(
        (request) => request.id === selectedRequestId,
      ) ?? null
    )
  }, [campaign, selectedRequestId])

  const selectedParty = useMemo(() => {
    if (!campaign) return null
    return (
      campaign.currentDay.parties.find(
        (party) => party.id === selectedPartyId,
      ) ?? null
    )
  }, [campaign, selectedPartyId])

  const legacyCampaign = useMemo(() => {
    return campaign ?? createTavernCampaign('tavern-campaign-legacy')
  }, [campaign])

  const legacyDay = legacyCampaign.currentDay

  if (uiMode === 'canvas') {
    return (
      <div className="tavern-simulator tavern-canvas-shell">
        <Suspense
          fallback={<div className="canvas-loading">Canvas loading...</div>}
        >
          <GameCanvasHost
            campaign={campaign}
            onAdvanceDay={handleFinishDay}
            onResolveDay={handleResolve}
            onOfferRequest={handleOfferRequest}
            onOpenActivity={handleOpenActivity}
            onOpenExpeditionNarrative={handleOpenExpeditionNarrative}
            onOpenSettings={handleOpenCanvasSettings}
            onSwitchToLegacy={() => setUiMode('legacy')}
            onNewGame={handleNewGame}
            onLoadGame={handleLoadGame}
            onSaveGame={handleSaveGame}
            onDeleteSave={handleDeleteSave}
            onListSaves={handleListSaves}
          />
        </Suspense>
        {canvasSettingsOpen && (
          <div className="canvas-settings-modal-overlay">
            <div className="canvas-settings-modal">
              <div className="canvas-settings-header">
                <h3>設定</h3>
                <button
                  type="button"
                  className="canvas-settings-close"
                  onClick={handleCloseCanvasSettings}
                  aria-label="設定を閉じる"
                >
                  ×
                </button>
              </div>
              <NarrativeSettings
                provider={narrativeProvider}
                config={narrativeConfig}
                onChange={setNarrativeConfig}
                onProviderChange={setNarrativeProvider}
              />
              <AudioSettings />
            </div>
          </div>
        )}
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
        onNewCampaign={(seed) => {
          const next = startCampaign(seed)
          void autosave(next)
        }}
      />

      <CampaignHeader campaign={legacyCampaign} />

      <div className="tavern-day-header">
        <h2>酒場仲介ボード</h2>
        <span className="day-id">Day: {legacyDay.seed}</span>
      </div>

      <div className="tavern-boards">
        <RequestBoard
          day={legacyDay}
          selectedRequestId={selectedRequestId}
          onSelectRequest={handleSelectRequest}
        />
        <PartyBoard
          parties={legacyDay.parties}
          selectedPartyId={selectedPartyId}
          disabled={legacyDay.status === 'resolved'}
          onSelectParty={handleSelectParty}
        />
      </div>

      {legacyDay.status === 'planning' && (
        <ExpeditionPredictionPanel
          requestOffer={selectedRequest}
          tavernParty={selectedParty}
        />
      )}

      <BrokeragePanel
        day={legacyDay}
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

      {legacyDay.status === 'resolved' && currentDayRecord && (
        <>
          <CampaignResultSummary
            results={legacyDay.results}
            reputationChange={currentDayRecord.reputationChange}
          />
          <DispatchResults
            results={legacyDay.results}
            selectedResultId={selectedResultId}
            onSelectResult={setSelectedResultId}
          />
          {selectedResolved && (
            <TavernResultDetail resolved={selectedResolved} />
          )}
        </>
      )}

      <CampaignHistory
        history={legacyCampaign.history}
        candidates={legacyCampaign.narrativeCandidates}
      />

      <NarrativeQueue
        campaign={legacyCampaign}
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
