export type SoundNovelSource = 'expedition' | 'downtime' | 'stay_extension'

export type SoundNovelBackgroundId =
  | 'tavern'
  | 'forest'
  | 'road'
  | 'ruins'
  | 'cave'
  | 'mountain'
  | 'wetland'
  | 'generic'

export interface SoundNovelVisualContext {
  locationId?: string
  environment?: string
  timeOfDay?: string
  participantIds?: string[]
  focusCharacterIds?: string[]
  backgroundId?: SoundNovelBackgroundId
}

export interface SoundNovelReturnTarget {
  sceneId: string
  reportId?: string
  activityId?: string
  partyId?: string
}

export interface SoundNovelSceneInput {
  narrativeId: string
  source: SoundNovelSource
  title?: string
  text: string
  visualContext: SoundNovelVisualContext
  returnTarget: SoundNovelReturnTarget
}

export interface SoundNovelPresentationCue {
  backgroundId?: SoundNovelBackgroundId
  focusCharacterIds?: string[]
  characterIds?: string[]
  transition?: string
  effectId?: string
}

export type SoundNovelSegmentKind = 'narration' | 'dialogue' | 'blank' | 'other'

export interface SoundNovelSegment {
  id: string
  text: string
  kind: SoundNovelSegmentKind
  speakerName?: string
  presentationCue?: SoundNovelPresentationCue
}

export interface SoundNovelPage {
  id: string
  segments: SoundNovelSegment[]
}

export interface SoundNovelDocument {
  id: string
  title?: string
  pages: SoundNovelPage[]
}

export type SoundNovelPlaybackState =
  'typing' | 'waiting' | 'page_wait' | 'finished' | 'closed'

export interface SoundNovelPlayerState {
  pageIndex: number
  segmentIndex: number
  visibleGraphemeCount: number
  playbackState: SoundNovelPlaybackState
  autoMode: boolean
  textSpeedMs: number
}

export interface SoundNovelBacklogEntry {
  segmentId: string
  text: string
  speakerName?: string
}

export interface SoundNovelSceneCue {
  backgroundId?: SoundNovelBackgroundId
  characters?: unknown[]
  transition?: 'none' | 'fade'
  effectId?: string
}

export interface SoundNovelAudioCue {
  bgmId?: string
  seId?: string
}

export interface SoundNovelTimingConfig {
  textSpeedMs: number
  punctuationPauseMs: Record<string, number>
  autoBaseMs: number
  autoPerCharMs: number
  autoMinMs: number
  autoMaxMs: number
  autoPageEndExtraMs: number
}

export const DEFAULT_SOUND_NOVEL_TIMING: SoundNovelTimingConfig = {
  textSpeedMs: 35,
  punctuationPauseMs: {
    '、': 80,
    '。': 180,
    '！': 150,
    '!': 150,
    '？': 150,
    '?': 150,
    '…': 120,
  },
  autoBaseMs: 700,
  autoPerCharMs: 35,
  autoMinMs: 1200,
  autoMaxMs: 4000,
  autoPageEndExtraMs: 500,
}
