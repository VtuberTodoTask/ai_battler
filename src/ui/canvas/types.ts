import type { Application, Container } from 'pixi.js'
import type {
  TavernCampaignState,
  TavernUpgradeId,
} from '../../core/tavern/campaign/types.ts'
import type { MainQuestThreatId } from '../../core/mainQuest/types.ts'
import type { TutorialId } from '../../core/tavern/campaign/tutorial.ts'
import type { TutorialResumeState } from './tutorial/types.ts'
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

export interface SaveSlotSummaryFromActions {
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
}

export interface GameUiActions {
  advanceDay: () => UiActionResult
  resolveDay: () => UiActionResult
  offerRequest: (
    partyId: string,
    requestId: string,
  ) => UiActionResult<OfferRequestActionData>
  purchaseUpgrade: (upgradeId: TavernUpgradeId) => UiActionResult
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
  /** Phase 9.8 Main Quest. */
  dispatchMainQuest?: (
    threatId: MainQuestThreatId,
    partyId: string,
  ) => UiActionResult
  generateMainQuestNarrative?: (attemptId: string) => Promise<UiActionResult>
  startMainQuestPresentation?: (attemptId: string) => UiActionResult
  completeMainQuestPresentation?: (attemptId: string) => UiActionResult
  /** Phase 9.9 Ending. */
  generateEndingNarrative?: () => Promise<UiActionResult>
  startEndingPresentation?: () => UiActionResult
  completeEndingPresentation?: () => UiActionResult
  openSettings: () => void
  closeModal: () => void
  switchToLegacy: () => void
  /** Phase 10.1 Tutorial Runtime commits. Both read the FRESHEST Campaign
   * (via `campaignRef`, not the possibly-stale `campaign` prop closure)
   * before applying the Core transition, so a Tutorial commit issued in
   * the same synchronous tick as another Campaign-mutating action (e.g.
   * completing the Tutorial right after `advanceDay()`) never loses that
   * other action's write — see `TavernSimulator.tsx`'s `commitCampaign`/
   * `campaignRef` doc comment for why a plain `campaign` closure read
   * would race here. This is why the Runtime never commits by handing a
   * pre-computed Campaign object to a generic setter (unlike everything
   * else in this file) — only the Tutorial id / mode ever crosses this
   * boundary. */
  setTutorialMode: (mode: 'enabled' | 'disabled') => UiActionResult
  completeTutorial: (tutorialId: TutorialId) => UiActionResult
  /** Title / save-load lifecycle actions. */
  newGame?: () => UiActionResult
  loadGame?: (slotId: string) => Promise<UiActionResult>
  saveGame?: (slotId: string) => Promise<UiActionResult>
  deleteSave?: (slotId: string) => Promise<UiActionResult>
  listSaves?: () => Promise<UiActionResult<SaveSlotSummaryFromActions[]>>
  openSaveLoad?: (mode: 'save' | 'load') => void
  returnToTitle?: () => void
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
  lastDayResultsStep?: 'important_events' | 'expedition_results'
  lastSelectedResultId?: string
  /** Phase 10.2 item 42 — see `TutorialResumeState`'s own doc comment. */
  tutorialResumeState?: TutorialResumeState
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
