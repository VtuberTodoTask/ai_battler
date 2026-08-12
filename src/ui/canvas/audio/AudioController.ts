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
  private _currentBgmId: BgmTrackId | null = null

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
    if (this._bgm) {
      this._bgm.volume = clamped
    }
  }

  playBgm(trackId: BgmTrackId, options?: { loop?: boolean }): void {
    if (!canUseAudio()) return
    if (this._currentBgmId === trackId && this._bgm && !this._bgm.paused) return

    this.stopBgm()
    const audio = new Audio(BGM_URLS[trackId])
    audio.loop = options?.loop ?? true
    audio.volume = this._volume
    audio.play().catch(() => {
      // Browsers may block playback until user interaction.
    })
    this._bgm = audio
    this._currentBgmId = trackId
  }

  stopBgm(): void {
    if (this._bgm) {
      this._bgm.pause()
      this._bgm.src = ''
      this._bgm = null
      this._currentBgmId = null
    }
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
  }
}

export const AudioController = new AudioControllerImpl()
