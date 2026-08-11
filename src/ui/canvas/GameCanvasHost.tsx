import { useEffect, useRef, useState } from 'react'
import { CanvasGame } from './CanvasGame.ts'
import type { GameUiActions, GameUiState, UiActionResult } from './types.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'

export interface GameCanvasHostProps {
  campaign: TavernCampaignState
  onAdvanceDay: () => UiActionResult
  onResolveDay: () => UiActionResult
  onOfferRequest: (partyId: string, requestId: string) => UiActionResult
  onOpenActivity: (
    partyId: string,
    eventId: string,
  ) => Promise<UiActionResult<string>>
  onSwitchToLegacy: () => void
}

export default function GameCanvasHost({
  campaign,
  onAdvanceDay,
  onResolveDay,
  onOfferRequest,
  onOpenActivity,
  onSwitchToLegacy,
}: GameCanvasHostProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasGameRef = useRef<CanvasGame | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onAdvanceRef = useRef(onAdvanceDay)
  const onResolveRef = useRef(onResolveDay)
  const onOfferRef = useRef(onOfferRequest)
  const onOpenActivityRef = useRef(onOpenActivity)
  const onSwitchRef = useRef(onSwitchToLegacy)

  useEffect(() => {
    onAdvanceRef.current = onAdvanceDay
    onResolveRef.current = onResolveDay
    onOfferRef.current = onOfferRequest
    onOpenActivityRef.current = onOpenActivity
    onSwitchRef.current = onSwitchToLegacy
  }, [
    onAdvanceDay,
    onResolveDay,
    onOfferRequest,
    onOpenActivity,
    onSwitchToLegacy,
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
          onOfferRef.current(partyId, requestId)
          return { ok: true }
        } catch (e) {
          return {
            ok: false,
            message:
              e instanceof Error ? e.message : '依頼の紹介に失敗しました',
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
      closeModal: () => {
        uiState.modalOpen = false
        uiState.openCharacterId = null
        cg.setUiState({ modalOpen: false, openCharacterId: null })
      },
      switchToLegacy: () => {
        onSwitchRef.current()
      },
    }

    cg.actions = actions
    canvasGameRef.current = cg

    cg.init(host).then(
      () => {
        if (!mounted) return
        cg.setCampaign(campaign)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    canvasGameRef.current?.setCampaign(campaign)
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
