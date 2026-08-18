import { useEffect, useRef, useState } from 'react'
import { CanvasGame } from './CanvasGame.ts'
import type {
  GameUiActions,
  GameUiState,
  OfferRequestActionData,
  SaveSlotSummaryFromActions,
  UiActionResult,
} from './types.ts'
import type {
  TavernCampaignState,
  TavernUpgradeId,
} from '../../core/tavern/campaign/types.ts'

export interface GameCanvasHostProps {
  campaign: TavernCampaignState | null
  onAdvanceDay: () => UiActionResult
  onResolveDay: () => UiActionResult
  onOfferRequest: (
    partyId: string,
    requestId: string,
  ) => UiActionResult<OfferRequestActionData>
  onPurchaseUpgrade: (upgradeId: TavernUpgradeId) => UiActionResult
  onOpenActivity: (
    partyId: string,
    eventId: string,
  ) => Promise<UiActionResult<string>>
  onOpenExpeditionNarrative?: (
    candidateId: string,
  ) => Promise<UiActionResult<string>>
  onOpenSettings?: () => void
  onSwitchToLegacy: () => void
  onNewGame?: () => UiActionResult
  onLoadGame?: (slotId: string) => Promise<UiActionResult>
  onSaveGame?: (slotId: string) => Promise<UiActionResult>
  onDeleteSave?: (slotId: string) => Promise<UiActionResult>
  onListSaves?: () => Promise<UiActionResult<SaveSlotSummaryFromActions[]>>
}

export default function GameCanvasHost({
  campaign,
  onAdvanceDay,
  onResolveDay,
  onOfferRequest,
  onPurchaseUpgrade,
  onOpenActivity,
  onOpenExpeditionNarrative,
  onOpenSettings,
  onSwitchToLegacy,
  onNewGame,
  onLoadGame,
  onSaveGame,
  onDeleteSave,
  onListSaves,
}: GameCanvasHostProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasGameRef = useRef<CanvasGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prevCampaignRef = useRef<TavernCampaignState | null>(null)

  const onAdvanceRef = useRef(onAdvanceDay)
  const onResolveRef = useRef(onResolveDay)
  const onOfferRef = useRef(onOfferRequest)
  const onPurchaseUpgradeRef = useRef(onPurchaseUpgrade)
  const onOpenActivityRef = useRef(onOpenActivity)
  const onOpenExpeditionNarrativeRef = useRef(onOpenExpeditionNarrative)
  const onOpenSettingsRef = useRef(onOpenSettings)
  const onSwitchRef = useRef(onSwitchToLegacy)
  const onNewGameRef = useRef(onNewGame)
  const onLoadGameRef = useRef(onLoadGame)
  const onSaveGameRef = useRef(onSaveGame)
  const onDeleteSaveRef = useRef(onDeleteSave)
  const onListSavesRef = useRef(onListSaves)

  useEffect(() => {
    onAdvanceRef.current = onAdvanceDay
    onResolveRef.current = onResolveDay
    onOfferRef.current = onOfferRequest
    onPurchaseUpgradeRef.current = onPurchaseUpgrade
    onOpenActivityRef.current = onOpenActivity
    onOpenExpeditionNarrativeRef.current = onOpenExpeditionNarrative
    onOpenSettingsRef.current = onOpenSettings
    onSwitchRef.current = onSwitchToLegacy
    onNewGameRef.current = onNewGame
    onLoadGameRef.current = onLoadGame
    onSaveGameRef.current = onSaveGame
    onDeleteSaveRef.current = onDeleteSave
    onListSavesRef.current = onListSaves
  }, [
    onAdvanceDay,
    onResolveDay,
    onOfferRequest,
    onPurchaseUpgrade,
    onOpenActivity,
    onOpenExpeditionNarrative,
    onOpenSettings,
    onSwitchToLegacy,
    onNewGame,
    onLoadGame,
    onSaveGame,
    onDeleteSave,
    onListSaves,
  ])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let mounted = true
    const cg = new CanvasGame()
    const uiState: GameUiState = {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
      viewedReportIds: [],
      viewedActivityIds: [],
    }

    const actions: GameUiActions = {
      advanceDay: () => {
        try {
          onAdvanceRef.current()
          return { ok: true }
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '翌日への進行に失敗しました',
          }
        }
      },
      resolveDay: () => {
        try {
          onResolveRef.current()
          return { ok: true }
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '本日の仲介確定に失敗しました',
          }
        }
      },
      offerRequest: (partyId, requestId) => {
        try {
          return onOfferRef.current(partyId, requestId)
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '依頼の紹介に失敗しました',
          }
        }
      },
      purchaseUpgrade: (upgradeId) => {
        try {
          return onPurchaseUpgradeRef.current(upgradeId)
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '設備の購入に失敗しました',
          }
        }
      },
      selectParty: (partyId) => {
        uiState.selectedPartyId = partyId
        uiState.actionMessage = undefined
        cg.setUiState({ selectedPartyId: partyId, actionMessage: undefined })
      },
      selectQuest: (questId) => {
        uiState.selectedQuestId = questId
        uiState.actionMessage = undefined
        cg.setUiState({ selectedQuestId: questId, actionMessage: undefined })
      },
      openCharacter: (characterId) => {
        uiState.openCharacterId = characterId
        uiState.modalOpen = true
        cg.setUiState({ openCharacterId: characterId, modalOpen: true })
      },
      openActivity: async (partyId, eventId) => {
        try {
          return await onOpenActivityRef.current(partyId, eventId)
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : 'イベントの表示に失敗しました',
          }
        }
      },
      openExpeditionNarrative: async (candidateId) => {
        try {
          const handler = onOpenExpeditionNarrativeRef.current
          if (!handler) {
            return {
              ok: false,
              message: 'AI provider not connected',
            }
          }
          return await handler(candidateId)
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '物語の生成に失敗しました',
          }
        }
      },
      openSettings: () => {
        onOpenSettingsRef.current?.()
      },
      closeModal: () => {
        uiState.modalOpen = false
        uiState.openCharacterId = null
        cg.setUiState({ modalOpen: false, openCharacterId: null })
      },
      switchToLegacy: () => {
        onSwitchRef.current()
      },
      newGame: () => {
        try {
          const handler = onNewGameRef.current
          if (!handler) return { ok: false, message: 'newGame not connected' }
          return handler()
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '新規ゲームの開始に失敗しました',
          }
        }
      },
      loadGame: async (slotId) => {
        try {
          const handler = onLoadGameRef.current
          if (!handler) return { ok: false, message: 'loadGame not connected' }
          return await handler(slotId)
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : 'ロードに失敗しました',
          }
        }
      },
      saveGame: async (slotId) => {
        try {
          const handler = onSaveGameRef.current
          if (!handler) return { ok: false, message: 'saveGame not connected' }
          return await handler(slotId)
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : 'セーブに失敗しました',
          }
        }
      },
      deleteSave: async (slotId) => {
        try {
          const handler = onDeleteSaveRef.current
          if (!handler)
            return { ok: false, message: 'deleteSave not connected' }
          return await handler(slotId)
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : '削除に失敗しました',
          }
        }
      },
      listSaves: async () => {
        try {
          const handler = onListSavesRef.current
          if (!handler) return { ok: true, data: [] }
          return await handler()
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : '一覧取得に失敗しました',
          }
        }
      },
      openSaveLoad: (mode) => {
        cg.openSaveLoad(mode)
      },
      returnToTitle: () => {
        cg.returnToTitle()
      },
    }

    cg.actions = actions
    canvasGameRef.current = cg

    cg.init(host).then(
      () => {
        if (!mounted) return
        if (campaign) {
          cg.setCampaign(campaign)
          prevCampaignRef.current = campaign
        }
      },
      (err) => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : String(err))
      },
    )

    return () => {
      mounted = false
      cg.destroy()
      canvasGameRef.current = null
      prevCampaignRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const cg = canvasGameRef.current
    if (!cg || !campaign) return
    if (campaign === prevCampaignRef.current) return
    cg.setCampaign(campaign)
    prevCampaignRef.current = campaign
  }, [campaign])

  if (error) {
    return (
      <div className="game-canvas-error">
        <p>Canvas UI initialization failed.</p>
        <p>{error}</p>
        <button onClick={onSwitchToLegacy}>Legacy UIへ戻る</button>
      </div>
    )
  }

  return <div ref={hostRef} className="game-canvas-host" />
}
