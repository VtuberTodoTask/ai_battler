import { OPENING_SCRIPT } from '../../../../data/opening.ts'
import type { SoundNovelSceneInput } from '../soundNovel/types.ts'

/**
 * Builds the `SoundNovelSceneInput` for the Opening — New Game shows this
 * directly as its initial Scene (no intermediate "始める/スキップ" Scene,
 * per the PR #60 "Opening Flow & Canonical Script" review). `returnTarget`
 * is set to 'tavern' for structural completeness only; `SoundNovelScene`
 * never actually pops back through it for `source === 'opening'` — it
 * calls `sceneManager.show('tavern')` directly instead, both on finishing
 * the script and on Skip, so there is never an Opening entry left on the
 * scene stack to return to.
 */
export function createOpeningSoundNovelInput(): SoundNovelSceneInput {
  return {
    narrativeId: 'opening',
    source: 'opening',
    title: 'プロローグ',
    text: OPENING_SCRIPT,
    visualContext: {
      backgroundId: 'generic',
    },
    returnTarget: { sceneId: 'tavern' },
    mood: 'tension',
  }
}
