import type {
  SoundNovelBackgroundId,
  SoundNovelSource,
  SoundNovelVisualContext,
} from './types.ts'

const ENVIRONMENT_MAP: Record<string, SoundNovelBackgroundId> = {
  forest: 'forest',
  mountain: 'mountain',
  cave: 'cave',
  ruins: 'ruins',
  plains: 'generic',
}

export function resolveSoundNovelBackground(
  source: SoundNovelSource,
  context: SoundNovelVisualContext,
): SoundNovelBackgroundId {
  if (context.backgroundId) return context.backgroundId

  if (source === 'stay_extension' || source === 'downtime') {
    return 'tavern'
  }

  const env = (context.environment ?? context.locationId ?? '').toLowerCase()

  if (ENVIRONMENT_MAP[env]) return ENVIRONMENT_MAP[env]

  if (env.includes('forest')) return 'forest'
  if (env.includes('ruin') || env.includes('ancient')) return 'ruins'
  if (env.includes('cave') || env.includes('dungeon')) return 'cave'
  if (env.includes('mountain') || env.includes('hill')) return 'mountain'
  if (env.includes('road') || env.includes('path')) return 'road'
  if (env.includes('wetland') || env.includes('swamp')) return 'wetland'

  return 'generic'
}
