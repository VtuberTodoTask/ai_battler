import type { BgmTrackId } from '../../audio/AudioController.ts'
import type { SoundNovelSceneInput } from './types.ts'

const TENSE_ENVIRONMENTS = new Set([
  'forest',
  'cave',
  'ruins',
  'dungeon',
  'mountain',
  'wetland',
  'swamp',
])

export function resolveSoundNovelBgm(input: SoundNovelSceneInput): BgmTrackId {
  if (input.mood === 'sad') return 'soundNovelSad'
  if (input.mood === 'tension') return 'soundNovelTension'
  if (input.mood === 'daily') return 'soundNovelDaily'

  if (input.source === 'downtime' || input.source === 'stay_extension') {
    return 'soundNovelDaily'
  }

  const env = (
    input.visualContext.environment ??
    input.visualContext.locationId ??
    ''
  ).toLowerCase()
  if (TENSE_ENVIRONMENTS.has(env)) return 'soundNovelTension'
  if (Array.from(TENSE_ENVIRONMENTS).some((value) => env.includes(value))) {
    return 'soundNovelTension'
  }

  return 'soundNovelDaily'
}
