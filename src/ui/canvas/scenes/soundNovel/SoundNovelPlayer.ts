import { parseSoundNovelText } from './SoundNovelParser.ts'
import { paginateSoundNovelSegments } from './SoundNovelPaginator.ts'
import {
  DEFAULT_SOUND_NOVEL_TIMING,
  type SoundNovelBacklogEntry,
  type SoundNovelDocument,
  type SoundNovelPage,
  type SoundNovelPlayerState,
  type SoundNovelSegment,
  type SoundNovelTimingConfig,
} from './types.ts'

export interface SoundNovelPlayerOptions {
  maxWidth: number
  maxHeight: number
  segmentSpacing: number
  measureText: (text: string) => { width: number; height: number }
  timing?: SoundNovelTimingConfig
  onChange?: () => void
  initialAutoMode?: boolean
}

export class SoundNovelPlayer {
  private _document: SoundNovelDocument | null = null
  private _state: SoundNovelPlayerState
  private _timing: SoundNovelTimingConfig
  private _measureText: (text: string) => { width: number; height: number }
  private _options: SoundNovelPlayerOptions
  private _graphemes: string[][][] = [] // [page][segment]
  private _cumulativeTimes: number[][][] = [] // [page][segment] of cumulative ms
  private _elapsedSegmentMs = 0
  private _autoWaitRemaining = 0
  private _backlog: SoundNovelBacklogEntry[] = []
  private _logOpen = false
  private _onChange?: () => void

  constructor(options: SoundNovelPlayerOptions) {
    this._options = options
    this._measureText = options.measureText
    this._timing = options.timing ?? DEFAULT_SOUND_NOVEL_TIMING
    this._state = {
      pageIndex: 0,
      segmentIndex: 0,
      visibleGraphemeCount: 0,
      playbackState: 'closed',
      autoMode: options.initialAutoMode ?? false,
      textSpeedMs: this._timing.textSpeedMs,
    }
    this._onChange = options.onChange
  }

  get state(): SoundNovelPlayerState {
    return { ...this._state }
  }

  get document(): SoundNovelDocument | null {
    return this._document
  }

  get currentPage(): SoundNovelPage | null {
    return this._document?.pages[this._state.pageIndex] ?? null
  }

  get currentSegment(): SoundNovelSegment | null {
    const page = this.currentPage
    return page?.segments[this._state.segmentIndex] ?? null
  }

  get visibleText(): string {
    const seg = this.currentSegment
    if (!seg) return ''
    const graphemes =
      this._graphemes[this._state.pageIndex]?.[this._state.segmentIndex] ?? []
    return graphemes.slice(0, this._state.visibleGraphemeCount).join('')
  }

  get backlog(): readonly SoundNovelBacklogEntry[] {
    return this._backlog
  }

  get logOpen(): boolean {
    return this._logOpen
  }

  get isPlaying(): boolean {
    return (
      this._state.playbackState !== 'closed' &&
      this._state.playbackState !== 'finished'
    )
  }

  start(text: string, title?: string): void {
    const segments = parseSoundNovelText(text)
    const pages = paginateSoundNovelSegments(segments, {
      maxWidth: this._options.maxWidth,
      maxHeight: this._options.maxHeight,
      segmentSpacing: this._options.segmentSpacing,
      measureText: this._measureText,
    })

    this._document = { id: this.generateId(), title, pages }
    this._graphemes = pages.map((page) =>
      page.segments.map((segment) => this.segmentGraphemes(segment.text)),
    )
    this._cumulativeTimes = this._graphemes.map((page) =>
      page.map((graphemes) => this.computeCumulativeTimes(graphemes)),
    )

    this._state = {
      pageIndex: 0,
      segmentIndex: 0,
      visibleGraphemeCount: 0,
      playbackState: 'typing',
      autoMode: this._state.autoMode,
      textSpeedMs: this._timing.textSpeedMs,
    }
    this._elapsedSegmentMs = 0
    this._autoWaitRemaining = 0
    this._backlog = []
    this._logOpen = false
    this._emitChange()
  }

  update(dt: number): void {
    if (
      this._state.playbackState === 'closed' ||
      this._state.playbackState === 'finished'
    ) {
      return
    }
    if (this._logOpen) return

    if (this._state.playbackState === 'typing') {
      this.advanceTyping(dt)
    } else if (
      this._state.playbackState === 'waiting' ||
      this._state.playbackState === 'page_wait'
    ) {
      if (this._state.autoMode) {
        this._autoWaitRemaining -= dt
        if (this._autoWaitRemaining <= 0) {
          if (this._state.playbackState === 'waiting') {
            this.nextSegment()
          } else {
            this.nextPage()
          }
        }
      }
    }
  }

  click(): void {
    if (this._state.playbackState === 'typing') {
      const graphemes = this.currentGraphemes()
      this._state.visibleGraphemeCount = graphemes.length
      this._elapsedSegmentMs = 0
      this.finishTypingSegment()
      this._emitChange()
      return
    }
    if (this._state.playbackState === 'waiting') {
      this.nextSegment()
      return
    }
    if (this._state.playbackState === 'page_wait') {
      this.nextPage()
      return
    }
    if (this._state.playbackState === 'finished') {
      this.close()
    }
  }

  nextSegment(): void {
    const page = this.currentPage
    if (!page) return

    this.pushBacklog(this._state.segmentIndex)

    if (this._state.segmentIndex >= page.segments.length - 1) {
      this._state.playbackState = 'page_wait'
      this.startAutoWait(true)
    } else {
      this._state.segmentIndex++
      this._state.visibleGraphemeCount = 0
      this._elapsedSegmentMs = 0
      this._state.playbackState = 'typing'
    }
    this._emitChange()
  }

  nextPage(): void {
    if (!this._document) return

    if (this._state.pageIndex >= this._document.pages.length - 1) {
      this._state.playbackState = 'finished'
      this._autoWaitRemaining = 0
    } else {
      this._state.pageIndex++
      this._state.segmentIndex = 0
      this._state.visibleGraphemeCount = 0
      this._elapsedSegmentMs = 0
      this._state.playbackState = 'typing'
    }
    this._emitChange()
  }

  toggleAuto(): void {
    this._state.autoMode = !this._state.autoMode
    if (
      this._state.autoMode &&
      (this._state.playbackState === 'waiting' ||
        this._state.playbackState === 'page_wait')
    ) {
      this.startAutoWait(this._state.playbackState === 'page_wait')
    }
    this._emitChange()
  }

  setLogOpen(open: boolean): void {
    this._logOpen = open
    this._emitChange()
  }

  close(): void {
    this._state.playbackState = 'closed'
    this._emitChange()
  }

  private advanceTyping(dt: number): void {
    const times = this.currentCumulativeTimes()
    if (times.length === 0) {
      this.finishTypingSegment()
      this._emitChange()
      return
    }

    this._elapsedSegmentMs += dt
    let target = this._state.visibleGraphemeCount
    while (target < times.length && this._elapsedSegmentMs >= times[target]) {
      target++
    }

    if (target !== this._state.visibleGraphemeCount) {
      this._state.visibleGraphemeCount = target
      this._emitChange()
    }

    if (target >= times.length) {
      this.finishTypingSegment()
    }
  }

  private finishTypingSegment(): void {
    const page = this.currentPage
    if (!page) return

    const times = this.currentCumulativeTimes()
    this._state.visibleGraphemeCount = times.length

    if (this._state.segmentIndex >= page.segments.length - 1) {
      this._state.playbackState = 'page_wait'
      this.startAutoWait(true)
    } else {
      this._state.playbackState = 'waiting'
      this.startAutoWait(false)
    }
    this._emitChange()
  }

  private currentGraphemes(): string[] {
    return (
      this._graphemes[this._state.pageIndex]?.[this._state.segmentIndex] ?? []
    )
  }

  private currentCumulativeTimes(): number[] {
    return (
      this._cumulativeTimes[this._state.pageIndex]?.[
        this._state.segmentIndex
      ] ?? []
    )
  }

  private startAutoWait(pageEnd: boolean): void {
    const graphemes = this.currentGraphemes()
    const charCount = Math.max(graphemes.length, 1)
    let wait = this._timing.autoBaseMs + charCount * this._timing.autoPerCharMs
    wait = Math.max(
      this._timing.autoMinMs,
      Math.min(this._timing.autoMaxMs, wait),
    )
    if (pageEnd) wait += this._timing.autoPageEndExtraMs
    this._autoWaitRemaining = wait
  }

  private pushBacklog(segmentIndex: number): void {
    const page = this.currentPage
    if (!page) return
    const segment = page.segments[segmentIndex]
    if (!segment) return
    this._backlog.push({
      segmentId: segment.id,
      text: segment.text,
      speakerName: segment.speakerName,
    })
  }

  private segmentGraphemes(text: string): string[] {
    try {
      const Segmenter = (globalThis as { Segmenter?: typeof Intl.Segmenter })
        .Segmenter
      if (Segmenter) {
        const segmenter = new Segmenter('ja', { granularity: 'grapheme' })
        return Array.from(segmenter.segment(text)).map((s) => s.segment)
      }
    } catch {
      // fall through
    }
    return Array.from(text)
  }

  private computeCumulativeTimes(graphemes: string[]): number[] {
    const result: number[] = []
    let cumulative = 0
    for (const g of graphemes) {
      const pause = this._timing.punctuationPauseMs[g] ?? 0
      cumulative += this._timing.textSpeedMs + pause
      result.push(cumulative)
    }
    return result
  }

  private generateId(): string {
    return `snd-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  }

  private _emitChange(): void {
    this._onChange?.()
  }
}
