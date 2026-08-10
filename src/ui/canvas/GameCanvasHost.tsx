import { useEffect, useRef, useState } from 'react'
import { CanvasGame } from './CanvasGame.ts'
import type { GameUiActions, GameUiState } from './types.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'

export interface GameCanvasHostProps {
  campaign: TavernCampaignState
  onAdvanceDay: () => void
  onSwitchToLegacy: () => void
}

export default function GameCanvasHost({
  campaign,
  onAdvanceDay,
  onSwitchToLegacy,
}: GameCanvasHostProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasGameRef = useRef<CanvasGame | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onAdvanceRef = useRef(onAdvanceDay)
  const onSwitchRef = useRef(onSwitchToLegacy)

  useEffect(() => {
    onAdvanceRef.current = onAdvanceDay
    onSwitchRef.current = onSwitchToLegacy
  }, [onAdvanceDay, onSwitchToLegacy])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const cg = new CanvasGame()
    const uiState: GameUiState = {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    }

    const actions: GameUiActions = {
      advanceDay: () => {
        onAdvanceRef.current()
      },
      selectParty: (partyId) => {
        uiState.selectedPartyId = partyId
        cg.setUiState({ selectedPartyId: partyId })
      },
      selectQuest: (questId) => {
        uiState.selectedQuestId = questId
        cg.setUiState({ selectedQuestId: questId })
      },
      openCharacter: (characterId) => {
        uiState.openCharacterId = characterId
        uiState.modalOpen = true
        cg.setUiState({ openCharacterId: characterId, modalOpen: true })
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
    setError(null)

    cg.init(host).then(
      () => {
        cg.setCampaign(campaign)
      },
      (err) => {
        setError(err instanceof Error ? err.message : String(err))
      },
    )

    return () => {
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
