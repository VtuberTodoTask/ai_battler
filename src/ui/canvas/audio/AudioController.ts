const VOLUME_KEY = 'ai_battler_volume'

export type BgmTrackId =
  | 'tavern'
  | 'expeditionReports'
  | 'soundNovelDaily'
  | 'soundNovelTension'
  | 'soundNovelSad'

export type SeTrackId = 'successJingle' | 'newParty'

const BGM_URLS: Record<BgmTrackId, string> = {
  tavern: '/bgm/untitled.mp3',
  expeditionReports: '/bgm/expedition_reports.mp3',
  soundNovelDaily: '/bgm/wooden_cup_afternoon.mp3',
  soundNovelTension: '/bgm/forest_alert.mp3',
  soundNovelSad: '/bgm/quiet_return_path.mp3',
}

const SE_URLS: Record<SeTrackId, string> = {
  successJingle: '/bgm/return_of_ale.mp3',
  newParty: '/bgm/new_comrade.mp3',
}

const FADE_MS = 300

function canUseAudio(): boolean {
  if (typeof document === 'undefined' || typeof Audio === 'undefined')
    return false
  if (
    typeof window !== 'undefined' &&
    /jsdom/i.test(window.navigator?.userAgent ?? '')
  )
    return false
  return typeof Audio.prototype.play === 'function'
}

function loadStoredVolume(): number {
  if (typeof localStorage === 'undefined') return 1
  const raw = localStorage.getItem(VOLUME_KEY)
  if (raw === null) return 1
  const value = Number.parseFloat(raw)
  if (Number.isNaN(value)) return 1
  return Math.max(0, Math.min(1, value))
}

function saveVolume(value: number): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, value))))
}

class AudioControllerImpl {
  private _volume = loadStoredVolume()
  private _bgm: HTMLAudioElement | null = null
  private _bgmFadeRaf: ReturnType<typeof requestAnimationFrame> | null = null
  private _outgoing: HTMLAudioElement | null = null
  private _outgoingFadeRaf: ReturnType<typeof requestAnimationFrame> | null =
    null
  private _currentBgmId: BgmTrackId | null = null
  private _outgoingId: BgmTrackId | null = null

  constructor() {
    if (typeof document !== 'undefined') {
      const resume = () => this.resumeBgmIfNeeded()
      document.addEventListener('pointerdown', resume, { once: true })
      document.addEventListener('keydown', resume, { once: true })
    }
  }

  get volume(): number {
    return this._volume
  }

  setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(1, value))
    this._volume = clamped
    saveVolume(clamped)

    this.stopFade(this._bgm)
    if (this._bgm) {
      this._bgm.volume = clamped
    }

    if (this._outgoing) {
      this.stopFade(this._outgoing)
      this.fadeElement(this._outgoing, 0, FADE_MS, () => this.stopOutgoing())
    }
  }

  playBgm(trackId: BgmTrackId, options?: { loop?: boolean }): void {
    if (!canUseAudio()) return
    if (this._currentBgmId === trackId && this._bgm && !this._bgm.paused) return

    this.stopOutgoing()
    const outgoing = this._bgm
    const outgoingId = this._currentBgmId

    if (outgoing) {
      this._outgoing = outgoing
      this._outgoingId = outgoingId
      this.fadeElement(this._outgoing, 0, FADE_MS, () => this.stopOutgoing())
    }

    const audio = new Audio(BGM_URLS[trackId])
    audio.loop = options?.loop ?? true
    audio.volume = 0
    audio.play().catch(() => {
      // Browsers may block playback until user interaction.
    })

    this._bgm = audio
    this._currentBgmId = trackId
    this.fadeElement(this._bgm, this._volume, FADE_MS)
  }

  stopBgm(): void {
    this.stopFade(this._bgm)
    this.stopFade(this._outgoing)
    if (this._bgm) {
      this._bgm.pause()
      this._bgm.src = ''
      this._bgm = null
    }
    if (this._outgoing) {
      this._outgoing.pause()
      this._outgoing.src = ''
      this._outgoing = null
    }
    this._currentBgmId = null
    this._outgoingId = null
  }

  fadeOut(durationMs = FADE_MS): Promise<void> {
    return new Promise((resolve) => {
      if (!this._bgm || !canUseAudio()) {
        resolve()
        return
      }
      this.fadeElement(this._bgm, 0, durationMs, () => {
        this.stopBgm()
        resolve()
      })
    })
  }

  playSe(trackId: SeTrackId): void {
    if (!canUseAudio()) return
    const audio = new Audio(SE_URLS[trackId])
    audio.volume = this._volume
    audio.play().catch(() => {
      // Browsers may block playback until user interaction.
    })
  }

  resumeBgmIfNeeded(): void {
    if (this._bgm && this._bgm.paused) {
      this._bgm.play().catch(() => {})
    }
    if (this._outgoing && this._outgoing.paused) {
      this._outgoing.play().catch(() => {})
    }
  }

  private stopOutgoing(): void {
    this.stopFade(this._outgoing)
    if (this._outgoing) {
      this._outgoing.pause()
      this._outgoing.src = ''
      this._outgoing = null
      this._outgoingId = null
    }
  }

  private stopFade(audio: HTMLAudioElement | null): void {
    if (!audio) return
    if (audio === this._bgm && this._bgmFadeRaf !== null) {
      cancelAnimationFrame(this._bgmFadeRaf)
      this._bgmFadeRaf = null
    }
    if (audio === this._outgoing && this._outgoingFadeRaf !== null) {
      cancelAnimationFrame(this._outgoingFadeRaf)
      this._outgoingFadeRaf = null
    }
  }

  private fadeElement(
    audio: HTMLAudioElement,
    targetVolume: number,
    durationMs: number,
    onComplete?: () => void,
  ): void {
    if (!canUseAudio()) {
      onComplete?.()
      return
    }

    this.stopFade(audio)

    const startVolume = audio.volume
    const startTime = performance.now()

    const tick = (now: number): void => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / Math.max(1, durationMs))
      const value = startVolume + (targetVolume - startVolume) * progress
      audio.volume = Math.max(0, Math.min(1, value))

      if (progress >= 1) {
        if (audio === this._bgm) this._bgmFadeRaf = null
        if (audio === this._outgoing) this._outgoingFadeRaf = null
        onComplete?.()
        return
      }

      const raf = requestAnimationFrame(tick)
      if (audio === this._bgm) this._bgmFadeRaf = raf
      if (audio === this._outgoing) this._outgoingFadeRaf = raf
    }

    const raf = requestAnimationFrame(tick)
    if (audio === this._bgm) this._bgmFadeRaf = raf
    if (audio === this._outgoing) this._outgoingFadeRaf = raf
  }
}

export const AudioController = new AudioControllerImpl()
