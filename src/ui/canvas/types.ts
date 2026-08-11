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

export interface GameUiActions {
  advanceDay: () => void
  resolveDay: () => void
  offerRequest: (partyId: string, requestId: string) => void
  selectParty: (partyId: string) => void
  selectQuest: (questId: string) => void
  openCharacter: (characterId: string) => void
  openActivity: (partyId: string, eventId: string) => Promise<string>
  closeModal: () => void
  switchToLegacy: () => void
}

export interface GameUiState {
  selectedPartyId: string | null
  selectedQuestId: string | null
  openCharacterId: string | null
  modalOpen: boolean
}

export const DEFAULT_GAME_UI_STATE: GameUiState = {
  selectedPartyId: null,
  selectedQuestId: null,
  openCharacterId: null,
  modalOpen: false,
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
  mount(context: GameSceneContext): void
  unmount(): void
  update?(dt: number): void
  setCampaign?(campaign: TavernCampaignState, uiState: GameUiState): void
  setUiState?(uiState: GameUiState): void
}
