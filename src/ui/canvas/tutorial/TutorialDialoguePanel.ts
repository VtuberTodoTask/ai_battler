import { Container } from 'pixi.js'
import { GameButton } from '../components/GameButton.ts'
import { GameLabel } from '../components/GameLabel.ts'
import { GamePanel } from '../components/GamePanel.ts'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import type { TutorialPresentationSnapshot } from './types.ts'

export interface TutorialDialoguePanelOptions {
  theme: GameUiTheme
  width: number
  height: number
  onAdvance: () => void
  onChoice: (optionId: string) => void
}

const MARGIN = 16
const CHOICE_BUTTON_WIDTH = 160
const CHOICE_BUTTON_HEIGHT = 44
const NEXT_BUTTON_WIDTH = 120
const NEXT_BUTTON_HEIGHT = 40

/**
 * Bottom-of-screen dialogue box for the 妖精 Tutorial Guide — speaker
 * name, body text, and either a [次へ] button (`message` steps) or one
 * button per choice option (`choice` steps). No portraits yet (item 39).
 * Renders nothing for `wait_for_action` steps beyond the carried-over
 * last message text — `TutorialRuntime.getSnapshot()` already resolves
 * that, so this component only ever reflects the given snapshot.
 */
export class TutorialDialoguePanel extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _onAdvance: () => void
  private readonly _onChoice: (optionId: string) => void
  private readonly _speakerLabel: GameLabel
  private readonly _textLabel: GameLabel
  private readonly _nextButton: GameButton
  private _choiceButtons: GameButton[] = []

  constructor(options: TutorialDialoguePanelOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onAdvance = options.onAdvance
    this._onChoice = options.onChoice

    const panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme: this._theme,
      color: this._theme.colors.panelTitle,
      borderColor: this._theme.colors.brass,
      radius: this._theme.radius.large,
      alpha: 0.95,
    })
    this.addChild(panel)

    this._speakerLabel = new GameLabel('', this._theme, 'heading')
    this._speakerLabel.x = MARGIN
    this._speakerLabel.y = MARGIN
    this.addChild(this._speakerLabel)

    this._textLabel = new GameLabel('', this._theme, 'body', {
      maxWidth: this._width - MARGIN * 2,
      breakWords: true,
    })
    this._textLabel.x = MARGIN
    this._textLabel.y = MARGIN + 40
    this.addChild(this._textLabel)

    this._nextButton = new GameButton({
      width: NEXT_BUTTON_WIDTH,
      height: NEXT_BUTTON_HEIGHT,
      theme: this._theme,
      label: '次へ',
    })
    this._nextButton.x = this._width - NEXT_BUTTON_WIDTH - MARGIN
    this._nextButton.y = this._height - NEXT_BUTTON_HEIGHT - MARGIN
    this._nextButton.onActivate = () => this._onAdvance()
    this.addChild(this._nextButton)
  }

  update(snapshot: TutorialPresentationSnapshot): void {
    this.visible = snapshot.visible
    if (!snapshot.visible) return

    this._speakerLabel.text = snapshot.speaker
    this._textLabel.text = snapshot.text
    this._nextButton.visible = snapshot.showNextButton

    this.clearChoiceButtons()
    if (snapshot.choices && snapshot.choices.length > 0) {
      let x = MARGIN
      const y = this._height - CHOICE_BUTTON_HEIGHT - MARGIN
      for (const choice of snapshot.choices) {
        const button = new GameButton({
          width: CHOICE_BUTTON_WIDTH,
          height: CHOICE_BUTTON_HEIGHT,
          theme: this._theme,
          label: choice.label,
        })
        button.x = x
        button.y = y
        button.onActivate = () => this._onChoice(choice.id)
        this.addChild(button)
        this._choiceButtons.push(button)
        x += CHOICE_BUTTON_WIDTH + 12
      }
    }
  }

  private clearChoiceButtons(): void {
    for (const button of this._choiceButtons) {
      this.removeChild(button)
      button.destroy({ children: true })
    }
    this._choiceButtons = []
  }
}
