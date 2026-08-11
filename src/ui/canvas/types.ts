import type { Application, Container } from 'pixi.js'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type { CanvasGame } from './CanvasGame.ts'
import type { GameAssetManager } from './assets/GameAssetManager.ts'
import type { OverlayManager } from './overlays/OverlayManager.ts'
import type { GameViewport } from './GameViewport.ts'
import type { GameUiTheme } from './theme/gameTheme.ts'

export interface GameLayers {
  background: Container
  content: Container
  ui: Container
  overlay: Container
  modal: Container
  transition: Container
  debug: Container
}

export interface UiActionResult<T = void> {
  ok: boolean
  message?: string
  data?: T
}

export interface OfferRequestActionData {
  decision: 'accepted' | 'declined'
  reason?: string
  reasonText?: string
}

export interface GameUiActions {
  advanceDay: () => UiActionResult
  resolveDay: () => UiActionResult
  offerRequest: (
    partyId: string,
    requestId: string,
  ) => UiActionResult<OfferRequestActionData>
  selectParty: (partyId: string) => void
  selectQuest: (questId: string) => void
  openCharacter: (characterId: string) => void
  openActivity: (
    partyId: string,
    eventId: string,
  ) => Promise<UiActionResult<string>>
  /** Optional: open a generated expedition narrative by candidate id. */
  openExpeditionNarrative?: (
    candidateId: string,
  ) => Promise<UiActionResult<string>>
  openSettings: () => void
  closeModal: () => void
  switchToLegacy: () => void
}

export interface UiActionMessage {
  kind: 'error' | 'success' | 'info'
  text: string
}

export interface GameUiState {
  selectedPartyId: string | null
  selectedQuestId: string | null
  openCharacterId: string | null
  modalOpen: boolean
  actionMessage?: UiActionMessage
  viewedActivityIds?: string[]
  viewedReportIds?: string[]
}

export const DEFAULT_GAME_UI_STATE: GameUiState = {
  selectedPartyId: null,
  selectedQuestId: null,
  openCharacterId: null,
  modalOpen: false,
  viewedReportIds: [],
  viewedActivityIds: [],
}

export interface GameSceneContext {
  id: string
  app: Application
  viewport: GameViewport
  layers: GameLayers
  overlayManager: OverlayManager
  theme: GameUiTheme
  assetManager: GameAssetManager
  actions: GameUiActions
  canvasGame: CanvasGame
}

export interface GameScene {
  readonly id: string
  mount(context: GameSceneContext, input?: unknown): void
  unmount(): void
  update?(dt: number): void
  setCampaign?(campaign: TavernCampaignState, uiState: GameUiState): void
  setUiState?(uiState: GameUiState): void
}
