import { Container, Graphics, Rectangle } from 'pixi.js'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import type { MainQuestPlaybackStep } from '../../../../core/mainQuest/playback.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import {
  buildMainQuestBattleViewModel,
  type MainQuestBattlePartyMemberSnapshot,
  type MainQuestBattleSceneInput,
  type MainQuestBattleViewModel,
} from '../../viewModel/mainQuestViewModel.ts'
import {
  resolveUniqueMonsterAnimationProfile,
  type MonsterPresentationPlan,
} from '../../../../core/mainQuest/presentationProfile.ts'
import { resolveStatusLabel } from '../../../../core/battle/statusLabels.ts'

const MONSTER_X = VIRTUAL_WIDTH / 2
const MONSTER_BASE_Y = 240
const PARTY_PANEL_X = 40
const PARTY_PANEL_Y = 420
const PARTY_ROW_HEIGHT = 68
const LOG_PANEL_Y = 700
const LOG_PANEL_HEIGHT = 148
const MAX_LOG_LINES = 5
const DIALOGUE_BOX_Y = 640
const HP_BAR_HEIGHT = 14
const MONSTER_HP_BAR_WIDTH = 360
const MEMBER_HP_BAR_WIDTH = 200

export const SILHOUETTE_SHAPES = [
  'circle',
  'diamond',
  'hex',
  'star',
  'triangleDown',
] as const
export type SilhouetteShape = (typeof SILHOUETTE_SHAPES)[number]

export const SILHOUETTE_COLORS = [
  0x8b3a3a, 0x3a5f8b, 0x5f8b3a, 0x8b3a6f, 0x8b6f3a, 0x3a8b7f, 0x6f3a8b,
  0x3a3a8b,
]

export function hashString(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function pickSilhouette(assetKey: string): {
  shape: SilhouetteShape
  color: number
} {
  const h = hashString(assetKey)
  return {
    shape: SILHOUETTE_SHAPES[h % SILHOUETTE_SHAPES.length],
    color:
      SILHOUETTE_COLORS[
        Math.floor(h / SILHOUETTE_SHAPES.length) % SILHOUETTE_COLORS.length
      ],
  }
}

function drawSilhouette(
  g: Graphics,
  shape: SilhouetteShape,
  color: number,
  radius: number,
): void {
  g.clear()
  switch (shape) {
    case 'circle':
      g.circle(0, 0, radius).fill({ color })
      break
    case 'diamond':
      g.moveTo(0, -radius)
        .lineTo(radius * 0.8, 0)
        .lineTo(0, radius)
        .lineTo(-radius * 0.8, 0)
        .closePath()
        .fill({ color })
      break
    case 'hex': {
      g.moveTo(radius, 0)
      for (let i = 1; i <= 6; i++) {
        const angle = (Math.PI / 3) * i
        g.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      }
      g.closePath().fill({ color })
      break
    }
    case 'star': {
      const points = 5
      g.moveTo(0, -radius)
      for (let i = 1; i <= points * 2; i++) {
        const angle = (Math.PI / points) * i - Math.PI / 2
        const r = i % 2 === 0 ? radius : radius * 0.5
        g.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
      }
      g.closePath().fill({ color })
      break
    }
    case 'triangleDown':
      g.moveTo(-radius, -radius * 0.6)
        .lineTo(radius, -radius * 0.6)
        .lineTo(0, radius)
        .closePath()
        .fill({ color })
      break
  }
}

interface MutableMemberState {
  id: string
  name: string
  maxHp: number
  hp: number
  maxMp: number
  mp: number
  alive: boolean
  statuses: string[]
}

interface MonsterAttackAnimState {
  phase: 'anticipation' | 'strike' | 'recovery'
  elapsedMs: number
}

interface MonsterHitAnimState {
  elapsedMs: number
}

interface PartyRowRefs {
  container: Container
  nameLabel: GameLabel
  hpBarBg: Graphics
  hpBarFg: Graphics
  hpLabel: GameLabel
  mpBarBg: Graphics
  mpBarFg: Graphics
  mpLabel: GameLabel
  statusLabel: GameLabel
  flash: Graphics
}

interface Popup {
  label: GameLabel
  age: number
  ttl: number
}

type BattlePhase = 'playing' | 'dialogue' | 'finished'

const DIALOGUE_AUTO_BASE_MS = 1800
const DIALOGUE_AUTO_PER_CHAR_MS = 45

/**
 * Phase 9.8.1 Battle Presentation: an auto-playing, Pixi-ticker-driven
 * replay of a pre-computed `MainQuestBattlePlaybackPlan`. Zero RNG, zero
 * re-simulation, zero Campaign/Ledger mutation — every visual (HP/MP bars,
 * hit/miss/damage/heal, status, incapacitation/death, Boss defeat/retreat)
 * is driven purely by stepping through the already-decided Trace. Dialogue
 * Anchors pause auto-play until dismissed or a timeout elapses, then
 * playback resumes exactly where it left off.
 */
export class MainQuestBattleScene implements GameScene {
  readonly id = 'mainQuestBattle'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _cameraLayer: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: MainQuestBattleSceneInput | null = null
  private _viewModel: MainQuestBattleViewModel | null = null
  private _uiState: GameUiState = {
    selectedPartyId: null,
    selectedQuestId: null,
    openCharacterId: null,
    modalOpen: false,
    viewedReportIds: [],
    viewedActivityIds: [],
  }

  private _monsterId = ''
  private _monsterHp = 0
  private _monsterMaxHp = 0
  private _monsterName = ''
  private _monsterStatuses: string[] = []
  private _monsterPresentationPlan: MonsterPresentationPlan | null = null
  private _monsterAttackAnim: MonsterAttackAnimState | null = null
  private _monsterHitAnim: MonsterHitAnimState | null = null
  private _members = new Map<string, MutableMemberState>()
  private _memberOrder: string[] = []
  private _log: string[] = []
  private _phase: BattlePhase = 'playing'
  private _stepIndex = -1
  private _beatTimer = 0
  private _dialogueAutoTimer = 0
  private _speed: 1 | 2 = 1
  private _idleTimeMs = 0
  private _shakeTimeMs = 0
  private _shakeMagnitude = 0
  private _monsterFlash = 0
  private _monsterDefeatFade = false
  private _memberFlash = new Map<string, number>()
  private _popups: Popup[] = []

  // Persistent display objects.
  private _monsterContainer: Container | null = null
  private _monsterShapeGraphics: Graphics | null = null
  private _monsterFlashOverlay: Graphics | null = null
  private _monsterNameLabel: GameLabel | null = null
  private _monsterHpBarBg: Graphics | null = null
  private _monsterHpBarFg: Graphics | null = null
  private _monsterHpLabel: GameLabel | null = null
  private _monsterStatusLabel: GameLabel | null = null
  private _partyRows = new Map<string, PartyRowRefs>()
  private _logLabels: GameLabel[] = []
  private _logPanelWidth = 0
  private _popupLayer: Container | null = null
  private _dialogueContainer: Container | null = null
  private _dialogueSpeakerLabel: GameLabel | null = null
  private _dialogueTextLabel: GameLabel | null = null
  private _bannerLabel: GameLabel | null = null
  private _speedButton: GameButton | null = null
  private _advanceButton: GameButton | null = null

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    this._input = (input as MainQuestBattleSceneInput | undefined) ?? null
    this._root = new Container()
    this._root.eventMode = 'static'
    this._root.hitArea = new Rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
    this._root.on('pointertap', this.handleRootTap)
    context.layers.content.addChild(this._root)

    this._cameraLayer = new Container()
    this._root.addChild(this._cameraLayer)

    AudioController.playBgm('tavern', { loop: true })

    if (this._campaign && this._input) {
      this.initializeFromCampaign()
    }
  }

  unmount(): void {
    this.clearUi()
    if (this._root && this._root.parent) {
      this._root.parent.removeChild(this._root)
    }
    this._root?.destroy({ children: true })
    this._root = null
    this._cameraLayer = null
    this._context = null
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
    this._campaign = campaign
    this._uiState = { ...uiState }
    if (this._context && this._input && !this._viewModel) {
      this.initializeFromCampaign()
    }
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
  }

  update(dt: number): void {
    if (!this._viewModel) return
    this._idleTimeMs += dt

    this.updateShake(dt)
    this.updatePopups(dt)
    this.updateFlashes(dt)
    // Boss attack/hit-reaction sequences are driven by elapsed animation
    // time, distinct from idle motion (which `applyCameraOffsets` derives
    // from `_idleTimeMs`, incremented unconditionally above): a large
    // attack sequence must not advance while paused on a Dialogue Cue, but
    // idle motion may keep going (item 2). Speed (1x/2x) applies here too,
    // matching `_beatTimer`/`_dialogueAutoTimer` below.
    if (this._phase !== 'dialogue') {
      this.updateMonsterAttackAnim(dt * this._speed)
      this.updateMonsterHitAnim(dt * this._speed)
    }
    this.applyCameraOffsets(dt)

    if (this._phase === 'finished') return

    if (this._phase === 'dialogue') {
      this._dialogueAutoTimer -= dt * this._speed
      if (this._dialogueAutoTimer <= 0) this.resumeFromDialogue()
      return
    }

    this._beatTimer -= dt * this._speed
    if (this._beatTimer <= 0) this.advance()
  }

  private initializeFromCampaign(): void {
    if (!this._campaign || !this._input || !this._context) return
    const vm = buildMainQuestBattleViewModel(
      this._campaign,
      this._input.attemptId,
      this._input.returnTarget,
    )
    if (!vm) {
      this.returnToPrevious()
      return
    }
    this._viewModel = vm
    this._monsterId = `mainquest:${vm.threatId}`
    this._monsterHp = vm.monsterHp
    this._monsterMaxHp = vm.monsterMaxHp
    this._monsterName = vm.monsterName
    this._monsterStatuses = [...vm.monsterStatuses]
    this._monsterPresentationPlan = resolveUniqueMonsterAnimationProfile(
      vm.monsterVisualProfile,
    )
    this._monsterAttackAnim = null
    this._monsterHitAnim = null
    this._members = new Map(
      vm.partyMembers.map((m) => [
        m.id,
        { ...m, statuses: [...m.statuses] } satisfies MutableMemberState,
      ]),
    )
    this._memberOrder = vm.partyMembers.map((m) => m.id)
    this._log = []
    this._phase = 'playing'
    this._stepIndex = -1
    this._beatTimer = 500

    this.buildStaticUi(this._context, vm)
  }

  // --- Static layout ----------------------------------------------------

  private buildStaticUi(
    context: GameSceneContext,
    vm: MainQuestBattleViewModel,
  ): void {
    if (!this._cameraLayer) return
    this.clearUi()
    const { theme } = context

    const bg = new Graphics()
    bg.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: theme.colors.background,
    })
    this._cameraLayer.addChild(bg)

    this.buildMonsterUi(theme, vm)
    this.buildPartyUi(theme, vm.partyMembers)
    this.buildLogPanel(theme)
    this.buildDialogueBox(theme)
    this.buildControls(theme)

    this._bannerLabel = new GameLabel('', theme, 'display', {
      align: 'center',
      maxWidth: VIRTUAL_WIDTH - 200,
    })
    this._bannerLabel.anchor.set(0.5, 0.5)
    this._bannerLabel.x = VIRTUAL_WIDTH / 2
    this._bannerLabel.y = VIRTUAL_HEIGHT / 2 - 40
    this._bannerLabel.alpha = 0
    this._cameraLayer.addChild(this._bannerLabel)

    this.pushLog(`${vm.monsterName}との戦いが始まる…`)
  }

  private buildMonsterUi(
    theme: GameUiTheme,
    vm: MainQuestBattleViewModel,
  ): void {
    if (!this._cameraLayer) return
    const container = new Container()
    container.x = MONSTER_X
    container.y = MONSTER_BASE_Y
    this._cameraLayer.addChild(container)
    this._monsterContainer = container

    const { shape, color } = pickSilhouette(vm.monsterVisualProfile.assetKey)
    const radius = 90 * vm.monsterVisualProfile.scale
    const shapeGraphics = new Graphics()
    drawSilhouette(shapeGraphics, shape, color, radius)
    container.addChild(shapeGraphics)
    this._monsterShapeGraphics = shapeGraphics

    const flashOverlay = new Graphics()
    drawSilhouette(flashOverlay, shape, 0xffffff, radius)
    flashOverlay.alpha = 0
    container.addChild(flashOverlay)
    this._monsterFlashOverlay = flashOverlay

    const nameLabel = new GameLabel(vm.monsterName, theme, 'heading')
    nameLabel.anchor.set(0.5, 0.5)
    nameLabel.x = MONSTER_X
    nameLabel.y = MONSTER_BASE_Y - radius - 40
    this._cameraLayer.addChild(nameLabel)
    this._monsterNameLabel = nameLabel

    const barX = MONSTER_X - MONSTER_HP_BAR_WIDTH / 2
    const barY = MONSTER_BASE_Y + radius + 20
    const hpBarBg = new Graphics()
    hpBarBg
      .roundRect(barX, barY, MONSTER_HP_BAR_WIDTH, HP_BAR_HEIGHT, 4)
      .fill({ color: theme.colors.panelPressed })
    this._cameraLayer.addChild(hpBarBg)
    this._monsterHpBarBg = hpBarBg

    const hpBarFg = new Graphics()
    this._cameraLayer.addChild(hpBarFg)
    this._monsterHpBarFg = hpBarFg

    const hpLabel = new GameLabel('', theme, 'caption')
    hpLabel.anchor.set(0.5, 0)
    hpLabel.x = MONSTER_X
    hpLabel.y = barY + HP_BAR_HEIGHT + 4
    this._cameraLayer.addChild(hpLabel)
    this._monsterHpLabel = hpLabel

    const statusLabel = new GameLabel('', theme, 'caption')
    statusLabel.anchor.set(0.5, 0)
    statusLabel.x = MONSTER_X
    statusLabel.y = barY + HP_BAR_HEIGHT + 26
    this._cameraLayer.addChild(statusLabel)
    this._monsterStatusLabel = statusLabel

    this.redrawMonsterHpBar(barX, barY)
  }

  /** The monster's HP bar's fixed screen position — its radius (and so this
   * position) depends only on `visualProfile.scale`, never on live Battle
   * state, so it is safe to recompute at any call site. */
  private monsterBarPosition(): { barX: number; barY: number } {
    const radius = 90 * (this._viewModel?.monsterVisualProfile.scale ?? 1)
    return {
      barX: MONSTER_X - MONSTER_HP_BAR_WIDTH / 2,
      barY: MONSTER_BASE_Y + radius + 20,
    }
  }

  private redrawMonsterHpBar(barX: number, barY: number): void {
    if (!this._monsterHpBarFg || !this._monsterHpLabel) return
    const ratio =
      this._monsterMaxHp > 0
        ? Math.max(0, Math.min(1, this._monsterHp / this._monsterMaxHp))
        : 0
    this._monsterHpBarFg.clear()
    if (ratio > 0) {
      this._monsterHpBarFg
        .roundRect(barX, barY, MONSTER_HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT, 4)
        .fill({ color: 0xb8462e })
    }
    this._monsterHpLabel.text = `HP ${this._monsterHp} / ${this._monsterMaxHp}`
    if (this._monsterStatusLabel) {
      this._monsterStatusLabel.text = this.formatStatusLine(
        this._monsterStatuses,
      )
    }
  }

  private formatStatusLine(statuses: readonly string[]): string {
    if (statuses.length === 0) return ''
    return statuses.map((s) => `[${resolveStatusLabel(s)}]`).join('')
  }

  private buildPartyUi(
    theme: GameUiTheme,
    members: MainQuestBattlePartyMemberSnapshot[],
  ): void {
    if (!this._cameraLayer) return
    const panel = new GamePanel({
      width: 420,
      height: PARTY_ROW_HEIGHT * members.length + 32,
      theme,
      title: '同行パーティ',
      alpha: 0.85,
    })
    panel.x = PARTY_PANEL_X
    panel.y = PARTY_PANEL_Y
    this._cameraLayer.addChild(panel)

    members.forEach((member, index) => {
      const rowY = PARTY_PANEL_Y + 40 + index * PARTY_ROW_HEIGHT
      const container = new Container()
      container.x = PARTY_PANEL_X + 16
      container.y = rowY
      this._cameraLayer!.addChild(container)

      const flash = new Graphics()
      flash
        .roundRect(-8, -6, 340, PARTY_ROW_HEIGHT - 12, 6)
        .fill({ color: 0xffffff })
      flash.alpha = 0
      container.addChild(flash)

      const nameLabel = new GameLabel(member.name, theme, 'body')
      container.addChild(nameLabel)

      const hpBarBg = new Graphics()
      hpBarBg
        .roundRect(0, 22, MEMBER_HP_BAR_WIDTH, HP_BAR_HEIGHT, 4)
        .fill({ color: theme.colors.panelPressed })
      container.addChild(hpBarBg)
      const hpBarFg = new Graphics()
      container.addChild(hpBarFg)
      const hpLabel = new GameLabel('', theme, 'caption')
      hpLabel.x = MEMBER_HP_BAR_WIDTH + 10
      hpLabel.y = 20
      container.addChild(hpLabel)

      const mpBarBg = new Graphics()
      mpBarBg
        .roundRect(0, 42, MEMBER_HP_BAR_WIDTH * 0.6, 8, 3)
        .fill({ color: theme.colors.panelPressed })
      container.addChild(mpBarBg)
      const mpBarFg = new Graphics()
      container.addChild(mpBarFg)
      const mpLabel = new GameLabel('', theme, 'caption')
      mpLabel.x = MEMBER_HP_BAR_WIDTH * 0.6 + 10
      mpLabel.y = 40
      container.addChild(mpLabel)

      const statusLabel = new GameLabel('', theme, 'caption')
      statusLabel.x = 0
      statusLabel.y = 54
      container.addChild(statusLabel)

      this._partyRows.set(member.id, {
        container,
        nameLabel,
        hpBarBg,
        hpBarFg,
        hpLabel,
        mpBarBg,
        mpBarFg,
        mpLabel,
        statusLabel,
        flash,
      })
      this.redrawMemberBars(member.id)
    })
  }

  private redrawMemberBars(memberId: string): void {
    const refs = this._partyRows.get(memberId)
    const member = this._members.get(memberId)
    if (!refs || !member) return

    const hpRatio =
      member.maxHp > 0 ? Math.max(0, Math.min(1, member.hp / member.maxHp)) : 0
    refs.hpBarFg.clear()
    if (hpRatio > 0) {
      refs.hpBarFg
        .roundRect(0, 22, MEMBER_HP_BAR_WIDTH * hpRatio, HP_BAR_HEIGHT, 4)
        .fill({ color: member.alive ? 0x4a8f4a : 0x555555 })
    }
    refs.hpLabel.text = `HP ${member.hp}/${member.maxHp}`

    const mpRatio =
      member.maxMp > 0 ? Math.max(0, Math.min(1, member.mp / member.maxMp)) : 0
    refs.mpBarFg.clear()
    if (mpRatio > 0) {
      refs.mpBarFg
        .roundRect(0, 42, MEMBER_HP_BAR_WIDTH * 0.6 * mpRatio, 8, 3)
        .fill({ color: 0x3a6f9f })
    }
    refs.mpLabel.text = `MP ${member.mp}/${member.maxMp}`

    refs.nameLabel.text = member.alive
      ? member.name
      : `${member.name}（戦闘不能）`
    refs.container.alpha = member.alive ? 1 : 0.5

    refs.statusLabel.text = this.formatStatusLine(member.statuses)
  }

  private buildLogPanel(theme: GameUiTheme): void {
    if (!this._cameraLayer) return
    this._logPanelWidth = VIRTUAL_WIDTH - PARTY_PANEL_X * 2
    const panel = new GamePanel({
      width: this._logPanelWidth,
      height: LOG_PANEL_HEIGHT,
      theme,
      title: '戦況',
      alpha: 0.9,
    })
    panel.x = PARTY_PANEL_X
    panel.y = LOG_PANEL_Y
    this._cameraLayer.addChild(panel)

    this._logLabels = []
    for (let i = 0; i < MAX_LOG_LINES; i++) {
      const label = new GameLabel('', theme, 'body', {
        maxWidth: this._logPanelWidth - 32,
      })
      label.x = PARTY_PANEL_X + 16
      label.y = LOG_PANEL_Y + 40 + i * 22
      this._cameraLayer.addChild(label)
      this._logLabels.push(label)
    }
  }

  private buildDialogueBox(theme: GameUiTheme): void {
    if (!this._cameraLayer) return
    const container = new Container()
    container.visible = false
    this._cameraLayer.addChild(container)
    this._dialogueContainer = container

    const panel = new GamePanel({
      width: VIRTUAL_WIDTH - PARTY_PANEL_X * 2,
      height: 180,
      theme,
      color: theme.colors.wood,
      alpha: 0.95,
    })
    panel.x = PARTY_PANEL_X
    panel.y = DIALOGUE_BOX_Y
    container.addChild(panel)

    const speakerLabel = new GameLabel('', theme, 'heading')
    speakerLabel.x = PARTY_PANEL_X + 20
    speakerLabel.y = DIALOGUE_BOX_Y + 16
    container.addChild(speakerLabel)
    this._dialogueSpeakerLabel = speakerLabel

    const textLabel = new GameLabel('', theme, 'narration', {
      maxWidth: VIRTUAL_WIDTH - PARTY_PANEL_X * 2 - 40,
      breakWords: true,
    })
    textLabel.x = PARTY_PANEL_X + 20
    textLabel.y = DIALOGUE_BOX_Y + 56
    container.addChild(textLabel)
    this._dialogueTextLabel = textLabel
  }

  private buildControls(theme: GameUiTheme): void {
    if (!this._cameraLayer) return
    const speedButton = new GameButton({
      width: 90,
      height: 40,
      theme,
      label: '1x',
    })
    speedButton.x = VIRTUAL_WIDTH - PARTY_PANEL_X - 90
    speedButton.y = 24
    speedButton.onActivate = () => this.toggleSpeed()
    this._cameraLayer.addChild(speedButton)
    this._speedButton = speedButton

    const advanceButton = new GameButton({
      width: 140,
      height: 40,
      theme,
      label: '進行中…',
    })
    advanceButton.x = VIRTUAL_WIDTH - PARTY_PANEL_X - 90 - 148
    advanceButton.y = 24
    advanceButton.onActivate = () => this.handleRootTap()
    this._cameraLayer.addChild(advanceButton)
    this._advanceButton = advanceButton
  }

  private clearUi(): void {
    if (!this._cameraLayer) return
    for (const child of this._cameraLayer.removeChildren()) {
      child.destroy({ children: true })
    }
    this._partyRows.clear()
    this._logLabels = []
    this._popups = []
    this._monsterContainer = null
    this._monsterShapeGraphics = null
    this._monsterFlashOverlay = null
    this._monsterNameLabel = null
    this._monsterHpBarBg = null
    this._monsterHpBarFg = null
    this._monsterHpLabel = null
    this._monsterStatusLabel = null
    this._monsterAttackAnim = null
    this._monsterHitAnim = null
    this._dialogueContainer = null
    this._dialogueSpeakerLabel = null
    this._dialogueTextLabel = null
    this._bannerLabel = null
    this._speedButton = null
    this._advanceButton = null
  }

  // --- Playback state machine -------------------------------------------

  private handleRootTap = (): void => {
    if (this._phase === 'finished') {
      this.returnToPrevious()
      return
    }
    if (this._phase === 'dialogue') {
      this.resumeFromDialogue()
    }
  }

  private toggleSpeed(): void {
    this._speed = this._speed === 1 ? 2 : 1
    this._speedButton?.setLabel(`${this._speed}x`)
  }

  private advance(): void {
    if (!this._viewModel) return
    this._stepIndex += 1
    if (this._stepIndex >= this._viewModel.plan.steps.length) {
      this._phase = 'finished'
      this._advanceButton?.setLabel('タップして戻る')
      return
    }
    const duration = this.applyStep(this._viewModel.plan.steps[this._stepIndex])
    if (this._phase !== 'dialogue') {
      this._beatTimer = duration
    }
  }

  private resumeFromDialogue(): void {
    if (this._dialogueContainer) this._dialogueContainer.visible = false
    this._phase = 'playing'
    this._beatTimer = 200
  }

  private nameFor(id: string): string {
    if (id === this._monsterId) return this._monsterName
    return this._members.get(id)?.name ?? id
  }

  private isMonsterId(id: string): boolean {
    return id === this._monsterId
  }

  private applyStep(step: MainQuestPlaybackStep): number {
    if (step.kind === 'dialogue') {
      this.showDialogue(step.cue)
      return 0
    }

    const event = step.event
    switch (event.type) {
      case 'battleStarted':
        this.pushLog(`${event.monsterName}との戦闘が始まった`)
        return 500
      case 'roundStarted':
        this.pushLog(`--- 第${event.round}ラウンド ---`)
        return 250
      case 'actionStarted': {
        this.pushLog(`${this.nameFor(event.actorId)}の${event.actionType}`)
        this.playAnticipation(event.actorId)
        const plan = this.isMonsterId(event.actorId)
          ? this._monsterPresentationPlan?.attack
          : undefined
        return plan ? plan.anticipationMs : 400
      }
      case 'hit': {
        this.pushLog(
          `${this.nameFor(event.actorId)}の攻撃が${this.nameFor(event.targetId)}に命中${event.critical ? '(会心の一撃)' : ''}`,
        )
        this.playHitReaction(event.targetId, event.critical)
        const attackPlan = this.isMonsterId(event.actorId)
          ? this._monsterPresentationPlan?.attack
          : undefined
        if (attackPlan) {
          this.shake(attackPlan.screenShakeMagnitude, attackPlan.screenShakeMs)
          if (this._monsterAttackAnim) {
            this._monsterAttackAnim.phase = 'strike'
            this._monsterAttackAnim.elapsedMs = 0
          }
          return attackPlan.strikeMs + attackPlan.recoveryMs
        }
        return 450
      }
      case 'miss':
        this.pushLog(
          `${this.nameFor(event.actorId)}の攻撃を${this.nameFor(event.targetId)}が回避`,
        )
        this.spawnPopup(event.targetId, 'MISS', 0xcfcfcf)
        return 450
      case 'damage':
        this.applyDamageEvent(event.targetId, event.amount)
        return 500
      case 'healing':
        this.applyHealingEvent(event.targetId, event.amount)
        return 500
      case 'periodicDamage':
        this.pushLog(
          `${this.nameFor(event.targetId)}は${this.periodicLabel(event.source)}を受けた`,
        )
        this.applyDamageEvent(event.targetId, event.amount)
        return 550
      case 'periodicHealing':
        this.pushLog(
          `${this.nameFor(event.targetId)}が${this.periodicLabel(event.source)}した`,
        )
        this.applyHealingEvent(event.targetId, event.amount)
        return 550
      case 'mpChanged': {
        const member = this._members.get(event.targetId)
        if (member) {
          member.mp = Math.max(
            0,
            Math.min(member.maxMp, member.mp + event.delta),
          )
          this.redrawMemberBars(event.targetId)
        }
        return 120
      }
      case 'statusApplied':
        this.pushLog(
          `${this.nameFor(event.targetId)}は${resolveStatusLabel(event.status)}状態になった`,
        )
        this.applyStatusApplied(event.targetId, event.status)
        return 400
      case 'statusRemoved':
        this.pushLog(
          `${this.nameFor(event.targetId)}の${resolveStatusLabel(event.status)}状態が解けた`,
        )
        this.applyStatusRemoved(event.targetId, event.status)
        return 350
      case 'incapacitated': {
        const member = this._members.get(event.memberId)
        if (member) {
          member.alive = false
          this.redrawMemberBars(event.memberId)
        }
        this.pushLog(`${this.nameFor(event.memberId)}が戦闘不能になった`)
        return 700
      }
      case 'death':
        this.pushLog(`${this.nameFor(event.memberId)}は帰らぬ人となった`)
        return 700
      case 'monsterReactionAnchor':
        return 60
      case 'retreat':
        this.pushLog('パーティは撤退した')
        this.showBanner('撤退')
        return 900
      case 'monsterDefeated': {
        this._monsterHp = 0
        const pos = this.monsterBarPosition()
        this.redrawMonsterHpBar(pos.barX, pos.barY)
        this.pushLog(`${this._monsterName}を討伐した！`)
        this.showBanner('撃破！')
        this._monsterDefeatFade = true
        return 1400
      }
      case 'battleEnded':
        this.pushLog(
          event.outcome === 'victory' ? '勝利した' : '戦いは終わった',
        )
        return 300
      default:
        return 300
    }
  }

  private periodicLabel(source: string): string {
    if (source === 'poison') return '毒のダメージ'
    if (source === 'bleed') return '出血のダメージ'
    if (source === 'ambush') return '奇襲のダメージ'
    if (source === 'regen') return '再生'
    return source
  }

  private applyDamageEvent(targetId: string, amount: number): void {
    if (this.isMonsterId(targetId)) {
      this._monsterHp = Math.max(0, this._monsterHp - amount)
      const pos = this.monsterBarPosition()
      this.redrawMonsterHpBar(pos.barX, pos.barY)
      // A modest generic reaction, in case this damage is periodic
      // (poison/bleed/ambush — no preceding 'hit' event). A preceding
      // `playHitReaction`'s boss-specific (possibly larger) flash/shake for
      // an actual attack is never reduced here — both use `Math.max`.
      this._monsterFlash = Math.max(this._monsterFlash, 0.5)
      this.shake(4, 150)
    } else {
      const member = this._members.get(targetId)
      if (member) {
        member.hp = Math.max(0, member.hp - amount)
        this.redrawMemberBars(targetId)
      }
      this._memberFlash.set(targetId, 1)
    }
    this.spawnPopup(targetId, `-${amount}`, 0xff6a5a)
    this.pushLog(`${this.nameFor(targetId)}に${amount}のダメージ`)
  }

  private applyHealingEvent(targetId: string, amount: number): void {
    if (this.isMonsterId(targetId)) {
      this._monsterHp = Math.min(this._monsterMaxHp, this._monsterHp + amount)
      const pos = this.monsterBarPosition()
      this.redrawMonsterHpBar(pos.barX, pos.barY)
    } else {
      const member = this._members.get(targetId)
      if (member) {
        member.hp = Math.min(member.maxHp, member.hp + amount)
        this.redrawMemberBars(targetId)
      }
    }
    this.spawnPopup(targetId, `+${amount}`, 0x6adf7a)
    this.pushLog(`${this.nameFor(targetId)}のHPが${amount}回復`)
  }

  private applyStatusApplied(targetId: string, status: string): void {
    if (this.isMonsterId(targetId)) {
      if (!this._monsterStatuses.includes(status)) {
        this._monsterStatuses.push(status)
      }
      const pos = this.monsterBarPosition()
      this.redrawMonsterHpBar(pos.barX, pos.barY)
      this._monsterFlash = Math.max(this._monsterFlash, 0.5)
    } else {
      const member = this._members.get(targetId)
      if (member && !member.statuses.includes(status)) {
        member.statuses.push(status)
      }
      this.redrawMemberBars(targetId)
      this._memberFlash.set(
        targetId,
        Math.max(this._memberFlash.get(targetId) ?? 0, 0.5),
      )
    }
  }

  private applyStatusRemoved(targetId: string, status: string): void {
    if (this.isMonsterId(targetId)) {
      this._monsterStatuses = this._monsterStatuses.filter((s) => s !== status)
      const pos = this.monsterBarPosition()
      this.redrawMonsterHpBar(pos.barX, pos.barY)
    } else {
      const member = this._members.get(targetId)
      if (member) {
        member.statuses = member.statuses.filter((s) => s !== status)
      }
      this.redrawMemberBars(targetId)
    }
  }

  private playAnticipation(actorId: string): void {
    if (this.isMonsterId(actorId)) {
      this._monsterAttackAnim = { phase: 'anticipation', elapsedMs: 0 }
    } else {
      this._memberFlash.set(
        actorId,
        Math.max(this._memberFlash.get(actorId) ?? 0, 0.4),
      )
    }
  }

  private playHitReaction(targetId: string, critical: boolean): void {
    if (this.isMonsterId(targetId)) {
      const plan = this._monsterPresentationPlan?.hitReaction
      this._monsterHitAnim = { elapsedMs: 0 }
      this._monsterFlash = Math.max(
        this._monsterFlash,
        (plan?.flashIntensity ?? 0.7) + (critical ? 0.2 : 0),
      )
      if (plan) {
        this.shake(
          plan.recoilDistance * (critical ? 1.3 : 1),
          plan.recoilMs + (critical ? 100 : 0),
        )
      }
    } else {
      this._memberFlash.set(targetId, 1)
      if (critical) this.shake(4, 150)
    }
  }

  // --- Boss-specific attack/hit-reaction animation (Phase 9.8.2 item 2) --

  private updateMonsterAttackAnim(dt: number): void {
    const anim = this._monsterAttackAnim
    const plan = this._monsterPresentationPlan?.attack
    if (!anim || !plan) return
    anim.elapsedMs += dt
    if (
      anim.phase === 'anticipation' &&
      anim.elapsedMs >= plan.anticipationMs
    ) {
      anim.phase = 'strike'
      anim.elapsedMs = 0
    } else if (anim.phase === 'strike' && anim.elapsedMs >= plan.strikeMs) {
      anim.phase = 'recovery'
      anim.elapsedMs = 0
    } else if (anim.phase === 'recovery' && anim.elapsedMs >= plan.recoveryMs) {
      this._monsterAttackAnim = null
    }
  }

  private updateMonsterHitAnim(dt: number): void {
    const anim = this._monsterHitAnim
    const plan = this._monsterPresentationPlan?.hitReaction
    if (!anim || !plan) return
    anim.elapsedMs += dt
    if (anim.elapsedMs >= plan.recoilMs) {
      this._monsterHitAnim = null
    }
  }

  /** Forward lunge/alpha for the current attack-anim phase (0/1 when no
   * attack is in progress) — a pure read of current animation state, never
   * mutated here. */
  private computeMonsterAttackOffset(): { lunge: number; alpha: number } {
    const anim = this._monsterAttackAnim
    const plan = this._monsterPresentationPlan?.attack
    if (!anim || !plan) return { lunge: 0, alpha: 1 }
    const fadeTo = plan.alphaFadeTo
    if (anim.phase === 'anticipation') {
      const t =
        plan.anticipationMs > 0
          ? Math.min(1, anim.elapsedMs / plan.anticipationMs)
          : 1
      const alpha = fadeTo !== undefined ? 1 - (1 - fadeTo) * t : 1
      return { lunge: -t * plan.lungeDistance * 0.2, alpha }
    }
    if (anim.phase === 'strike') {
      const t =
        plan.strikeMs > 0 ? Math.min(1, anim.elapsedMs / plan.strikeMs) : 1
      const alpha = fadeTo !== undefined ? fadeTo + (1 - fadeTo) * t : 1
      return { lunge: t * plan.lungeDistance, alpha }
    }
    const t =
      plan.recoveryMs > 0 ? Math.min(1, anim.elapsedMs / plan.recoveryMs) : 1
    return { lunge: plan.lungeDistance * (1 - t), alpha: 1 }
  }

  /** A brief recoil-and-return hump (0 -> -recoilDistance -> 0) over the
   * hitReaction plan's `recoilMs`; `0` once the reaction has finished. */
  private computeMonsterHitRecoil(): number {
    const anim = this._monsterHitAnim
    const plan = this._monsterPresentationPlan?.hitReaction
    if (!anim || !plan || plan.recoilMs <= 0) return 0
    const t = Math.min(1, anim.elapsedMs / plan.recoilMs)
    return -plan.recoilDistance * Math.sin(Math.PI * t)
  }

  private showBanner(text: string): void {
    if (!this._bannerLabel) return
    this._bannerLabel.text = text
    this._bannerLabel.alpha = 1
  }

  private showDialogue(cue: { speakerId: string; text: string }): void {
    if (
      !this._dialogueContainer ||
      !this._dialogueSpeakerLabel ||
      !this._dialogueTextLabel ||
      !this._viewModel
    ) {
      return
    }
    this._dialogueSpeakerLabel.text = this._viewModel.resolveSpeakerName(
      cue.speakerId,
    )
    this._dialogueTextLabel.text = cue.text
    this._dialogueContainer.visible = true
    this._phase = 'dialogue'
    this._dialogueAutoTimer =
      DIALOGUE_AUTO_BASE_MS + cue.text.length * DIALOGUE_AUTO_PER_CHAR_MS
  }

  private spawnPopup(targetId: string, text: string, color: number): void {
    if (!this._context) return
    if (!this._popupLayer) {
      this._popupLayer = new Container()
      this._cameraLayer?.addChild(this._popupLayer)
    }
    const anchor = this.popupAnchor(targetId)
    const label = new GameLabel(text, this._context.theme, 'heading')
    label.setColor(color)
    label.x = anchor.x
    label.y = anchor.y
    label.alpha = 1
    this._popupLayer.addChild(label)
    this._popups.push({ label, age: 0, ttl: 900 })
  }

  private popupAnchor(targetId: string): { x: number; y: number } {
    if (this.isMonsterId(targetId)) {
      return { x: MONSTER_X - 20, y: MONSTER_BASE_Y - 20 }
    }
    const refs = this._partyRows.get(targetId)
    if (refs) {
      return {
        x: refs.container.x + MEMBER_HP_BAR_WIDTH / 2,
        y: refs.container.y - 6,
      }
    }
    return { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT / 2 }
  }

  private pushLog(text: string): void {
    this._log.push(text)
    if (this._log.length > MAX_LOG_LINES) {
      this._log = this._log.slice(this._log.length - MAX_LOG_LINES)
    }
    this._log.forEach((line, i) => {
      if (this._logLabels[i]) this._logLabels[i].text = line
    })
  }

  private shake(magnitude: number, durationMs: number): void {
    this._shakeMagnitude = Math.max(this._shakeMagnitude, magnitude)
    this._shakeTimeMs = Math.max(this._shakeTimeMs, durationMs)
  }

  // --- Per-frame animation ------------------------------------------------

  private updateShake(dt: number): void {
    if (this._shakeTimeMs <= 0) {
      this._shakeMagnitude = 0
      return
    }
    this._shakeTimeMs = Math.max(0, this._shakeTimeMs - dt)
  }

  private applyCameraOffsets(dt: number): void {
    if (!this._cameraLayer) return
    let shakeX = 0
    let shakeY = 0
    if (this._shakeTimeMs > 0 && this._shakeMagnitude > 0) {
      const t = this._idleTimeMs / 30
      const falloff = Math.min(1, this._shakeTimeMs / 300)
      shakeX = Math.sin(t) * this._shakeMagnitude * falloff
      shakeY = Math.cos(t * 1.3) * this._shakeMagnitude * 0.5 * falloff
    }
    this._cameraLayer.x = shakeX
    this._cameraLayer.y = shakeY

    if (this._monsterContainer && this._monsterPresentationPlan) {
      const idle = this._monsterPresentationPlan.idle
      const bobPhase =
        idle.bobPeriodMs > 0
          ? Math.sin((this._idleTimeMs / idle.bobPeriodMs) * Math.PI * 2)
          : 0
      const bob = bobPhase * idle.bobAmplitude
      const pulsePhase =
        idle.pulsePeriodMs > 0
          ? Math.sin((this._idleTimeMs / idle.pulsePeriodMs) * Math.PI * 2)
          : 0
      const idleScale = 1 + pulsePhase * idle.pulseAmplitude

      const { lunge, alpha } = this.computeMonsterAttackOffset()
      const recoil = this.computeMonsterHitRecoil()

      this._monsterContainer.y = MONSTER_BASE_Y + bob
      this._monsterContainer.x = MONSTER_X + lunge + recoil
      this._monsterContainer.scale.set(idleScale)

      if (this._monsterDefeatFade) {
        this._monsterContainer.alpha = Math.max(
          0.15,
          this._monsterContainer.alpha - dt / 1400,
        )
      } else {
        this._monsterContainer.alpha = alpha
      }
    }
    if (this._monsterFlashOverlay) {
      this._monsterFlash = Math.max(0, this._monsterFlash - dt / 250)
      this._monsterFlashOverlay.alpha = this._monsterFlash
    }
  }

  private updateFlashes(dt: number): void {
    for (const [id, refs] of this._partyRows) {
      const flashAmount = this._memberFlash.get(id) ?? 0
      if (flashAmount > 0) {
        refs.flash.alpha = flashAmount * 0.6
        this._memberFlash.set(id, Math.max(0, flashAmount - dt / 250))
      } else {
        refs.flash.alpha = 0
      }
    }
    if (this._bannerLabel && this._bannerLabel.alpha > 0) {
      this._bannerLabel.alpha = Math.max(0, this._bannerLabel.alpha - dt / 1500)
    }
  }

  private updatePopups(dt: number): void {
    const remaining: Popup[] = []
    for (const popup of this._popups) {
      popup.age += dt
      popup.label.y -= dt * 0.04
      popup.label.alpha = Math.max(0, 1 - popup.age / popup.ttl)
      if (popup.age >= popup.ttl) {
        popup.label.destroy()
      } else {
        remaining.push(popup)
      }
    }
    this._popups = remaining
  }

  private returnToPrevious(): void {
    this._context?.canvasGame.sceneManager?.pop()
  }
}
