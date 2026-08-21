import { Container, Graphics, Rectangle } from 'pixi.js'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import { buildMainQuestEnemy } from '../../../../core/mainQuest/threats.ts'
import type { MainQuestPlaybackStep } from '../../../../core/mainQuest/playback.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import {
  buildMainQuestBattleViewModel,
  type MainQuestBattlePartyMemberSnapshot,
  type MainQuestBattleSceneInput,
  type MainQuestBattleViewModel,
} from '../../viewModel/mainQuestViewModel.ts'

const MONSTER_X = VIRTUAL_WIDTH / 2
const MONSTER_Y = 250
const MONSTER_RADIUS = 110
const PARTY_PANEL_X = 40
const PARTY_PANEL_Y = 420
const PARTY_ROW_HEIGHT = 64
const LOG_PANEL_Y = 700
const LOG_PANEL_HEIGHT = 148
const MAX_LOG_LINES = 5

/**
 * Phase 9.8 Battle Presentation. Pure playback of a pre-computed
 * `MainQuestBattlePlaybackPlan` (see `core/mainQuest/playback.ts`) — this
 * scene contains zero RNG and never re-simulates combat; it only steps
 * through the already-decided Trace + Narrative dialogue cues one at a
 * time on click/tap, mutating local HP/MP snapshots to reflect each
 * `damage`/`healing`/`incapacitated`/`death` event exactly as recorded.
 */
export class MainQuestBattleScene implements GameScene {
  readonly id = 'mainQuestBattle'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
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

  private _stepIndex = -1
  private _monsterHp = 0
  private _monsterMaxHp = 0
  private _monsterName = ''
  private _members: MainQuestBattlePartyMemberSnapshot[] = []
  private _log: string[] = []
  private _finished = false
  private _nameById = new Map<string, string>()

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    this._input = (input as MainQuestBattleSceneInput | undefined) ?? null
    this._root = new Container()
    this._root.eventMode = 'static'
    this._root.hitArea = new Rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
    this._root.on('pointertap', this.handleRootTap)
    context.layers.content.addChild(this._root)

    AudioController.playBgm('tavern', { loop: true })

    if (this._campaign && this._input) {
      this.initializeFromCampaign()
      this.render()
    }
  }

  unmount(): void {
    this.clearUi()
    if (this._root && this._root.parent) {
      this._root.parent.removeChild(this._root)
    }
    this._root?.destroy({ children: true })
    this._root = null
    this._context = null
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
    this._campaign = campaign
    this._uiState = { ...uiState }
    if (this._context && this._input && !this._viewModel) {
      this.initializeFromCampaign()
      this.render()
    }
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
  }

  private initializeFromCampaign(): void {
    if (!this._campaign || !this._input) return
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
    this._members = vm.partyMembers.map((m) => ({ ...m }))
    const enemy = buildMainQuestEnemy(vm.threatId)
    this._monsterMaxHp = enemy.maxHp
    this._monsterHp = enemy.maxHp
    this._monsterName = vm.monsterName
    this._nameById = new Map(this._members.map((m) => [m.id, m.name]))
    this._nameById.set(enemy.id, vm.monsterName)
    this._stepIndex = -1
    this._log = ['タップして戦闘の様子を見る']
    this._finished = false
  }

  private clearUi(): void {
    if (!this._root) return
    for (const child of this._root.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  private handleRootTap = (): void => {
    this.advance()
  }

  private advance(): void {
    if (!this._viewModel) return
    if (this._finished) {
      this.returnToPrevious()
      return
    }
    this._stepIndex += 1
    if (this._stepIndex >= this._viewModel.plan.steps.length) {
      this._finished = true
      this.pushLog('タップして終了')
      this.render()
      return
    }
    this.applyStep(this._viewModel.plan.steps[this._stepIndex])
    this.render()
  }

  private nameFor(id: string): string {
    return this._nameById.get(id) ?? id
  }

  private memberById(
    id: string,
  ): MainQuestBattlePartyMemberSnapshot | undefined {
    return this._members.find((m) => m.id === id)
  }

  private pushLog(text: string): void {
    this._log.push(text)
    if (this._log.length > MAX_LOG_LINES) {
      this._log = this._log.slice(this._log.length - MAX_LOG_LINES)
    }
  }

  private applyStep(step: MainQuestPlaybackStep): void {
    if (step.kind === 'dialogue') {
      this.pushLog(`${step.cue.speakerName}「${step.cue.text}」`)
      return
    }

    const event = step.event
    switch (event.type) {
      case 'battleStarted':
        this.pushLog(`${event.monsterName}との戦闘が始まった`)
        break
      case 'roundStarted':
        this.pushLog(`--- 第${event.round}ラウンド ---`)
        break
      case 'actionStarted':
        this.pushLog(`${this.nameFor(event.actorId)}の${event.actionType}`)
        break
      case 'hit':
        this.pushLog(
          `${this.nameFor(event.actorId)}の攻撃が${this.nameFor(event.targetId)}に命中`,
        )
        break
      case 'miss':
        this.pushLog(
          `${this.nameFor(event.actorId)}の攻撃を${this.nameFor(event.targetId)}が回避`,
        )
        break
      case 'damage': {
        const member = this.memberById(event.targetId)
        if (member) {
          member.hp = Math.max(0, member.hp - event.amount)
        } else {
          this._monsterHp = Math.max(0, this._monsterHp - event.amount)
        }
        this.pushLog(
          `${this.nameFor(event.targetId)}に${event.amount}のダメージ`,
        )
        break
      }
      case 'healing': {
        const member = this.memberById(event.targetId)
        if (member) {
          member.hp = Math.min(member.maxHp, member.hp + event.amount)
        } else {
          this._monsterHp = Math.min(
            this._monsterMaxHp,
            this._monsterHp + event.amount,
          )
        }
        this.pushLog(`${this.nameFor(event.targetId)}のHPが${event.amount}回復`)
        break
      }
      case 'statusApplied':
        this.pushLog(
          `${this.nameFor(event.targetId)}は${event.status}状態になった`,
        )
        break
      case 'statusRemoved':
        this.pushLog(
          `${this.nameFor(event.targetId)}の${event.status}状態が解けた`,
        )
        break
      case 'incapacitated': {
        const member = this.memberById(event.memberId)
        if (member) member.alive = false
        this.pushLog(`${this.nameFor(event.memberId)}が戦闘不能になった`)
        break
      }
      case 'death': {
        const member = this.memberById(event.memberId)
        if (member) member.alive = false
        this.pushLog(`${this.nameFor(event.memberId)}が倒れた`)
        break
      }
      case 'monsterReactionAnchor':
        break
      case 'retreat':
        this.pushLog('パーティは撤退した')
        break
      case 'monsterDefeated':
        this._monsterHp = 0
        this.pushLog(`${this._monsterName}を討伐した！`)
        break
      case 'battleEnded':
        this.pushLog(event.outcome === 'victory' ? '勝利した' : '敗北した')
        break
    }
  }

  private render(): void {
    if (!this._root || !this._context || !this._viewModel) return
    this.clearUi()
    const { theme } = this._context

    const bg = new Graphics()
    bg.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: theme.colors.background,
    })
    this._root.addChild(bg)

    // Monster.
    const silhouette = new Graphics()
    silhouette.circle(MONSTER_X, MONSTER_Y, MONSTER_RADIUS).fill({
      color:
        this._monsterHp > 0 ? theme.colors.danger : theme.colors.textDisabled,
    })
    this._root.addChild(silhouette)

    const monsterNameLabel = new GameLabel(this._monsterName, theme, 'heading')
    monsterNameLabel.anchor.set(0.5, 0.5)
    monsterNameLabel.x = MONSTER_X
    monsterNameLabel.y = MONSTER_Y - MONSTER_RADIUS - 30
    this._root.addChild(monsterNameLabel)

    this.renderHpBar(
      MONSTER_X - 160,
      MONSTER_Y + MONSTER_RADIUS + 16,
      320,
      this._monsterHp,
      this._monsterMaxHp,
      theme,
    )

    // Party panel.
    const partyPanel = new GamePanel({
      width: 420,
      height: PARTY_ROW_HEIGHT * this._members.length + 32,
      theme,
      title: '同行パーティ',
      alpha: 0.82,
    })
    partyPanel.x = PARTY_PANEL_X
    partyPanel.y = PARTY_PANEL_Y
    this._root.addChild(partyPanel)

    this._members.forEach((member, index) => {
      const rowY = PARTY_PANEL_Y + 40 + index * PARTY_ROW_HEIGHT
      const statusText = member.alive ? '' : '（戦闘不能）'
      const nameLabel = new GameLabel(
        `${member.name}${statusText}`,
        theme,
        'body',
      )
      nameLabel.x = PARTY_PANEL_X + 16
      nameLabel.y = rowY
      nameLabel.alpha = member.alive ? 1 : 0.5
      this._root!.addChild(nameLabel)

      this.renderHpBar(
        PARTY_PANEL_X + 16,
        rowY + 24,
        220,
        member.hp,
        member.maxHp,
        theme,
        member.alive,
      )

      const hpLabel = new GameLabel(
        `HP ${member.hp}/${member.maxHp}`,
        theme,
        'caption',
      )
      hpLabel.x = PARTY_PANEL_X + 250
      hpLabel.y = rowY + 20
      this._root!.addChild(hpLabel)
    })

    // Battle message log.
    const logPanel = new GamePanel({
      width: VIRTUAL_WIDTH - PARTY_PANEL_X * 2,
      height: LOG_PANEL_HEIGHT,
      theme,
      title: '戦況',
      alpha: 0.9,
    })
    logPanel.x = PARTY_PANEL_X
    logPanel.y = LOG_PANEL_Y
    this._root.addChild(logPanel)

    this._log.forEach((line, index) => {
      const label = new GameLabel(line, theme, 'body', {
        maxWidth: VIRTUAL_WIDTH - PARTY_PANEL_X * 2 - 32,
      })
      label.x = PARTY_PANEL_X + 16
      label.y = LOG_PANEL_Y + 40 + index * 22
      this._root!.addChild(label)
    })

    const advanceButton = new GameButton({
      width: 160,
      height: 44,
      theme,
      label: this._finished ? '終了する' : '次へ',
    })
    advanceButton.x = VIRTUAL_WIDTH - PARTY_PANEL_X - 160
    advanceButton.y = 24
    advanceButton.onActivate = () => this.advance()
    this._root.addChild(advanceButton)
  }

  private renderHpBar(
    x: number,
    y: number,
    width: number,
    value: number,
    max: number,
    theme: GameSceneContext['theme'],
    alive = true,
  ): void {
    if (!this._root) return
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
    const bg = new Graphics()
    bg.roundRect(x, y, width, 14, 4).fill({ color: theme.colors.panelPressed })
    this._root.addChild(bg)

    if (ratio > 0) {
      const fillColor = alive ? theme.colors.accent : theme.colors.textDisabled
      const fg = new Graphics()
      fg.roundRect(x, y, width * ratio, 14, 4).fill({ color: fillColor })
      this._root.addChild(fg)
    }
  }

  private returnToPrevious(): void {
    this._context?.canvasGame.sceneManager?.pop()
  }
}
