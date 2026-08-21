import type {
  MainQuestBattleDialogueCue,
  MainQuestBattleEvent,
  MainQuestBattleTrace,
  MainQuestNarrativeScript,
} from './types.ts'

export type MainQuestPlaybackStep =
  | { kind: 'battleEvent'; event: MainQuestBattleEvent }
  | { kind: 'dialogue'; cue: MainQuestBattleDialogueCue }

export interface MainQuestBattlePlaybackPlan {
  steps: MainQuestPlaybackStep[]
}

/**
 * Pure function: `MainQuestBattleTrace` (+ optional pre-generated
 * `MainQuestNarrativeScript`) -> a flat, ordered Playback Plan for
 * `MainQuestBattleScene` — zero RNG (items 83/84/161), so the same Trace
 * always yields the same Playback event order (item 84's determinism
 * requirement) regardless of how many times the Attempt is replayed from
 * its stored Save data. Never re-simulates Combat and never invents an
 * event the Trace doesn't already contain (item 80) — this only inserts
 * pre-generated Dialogue Cues at the `monsterReactionAnchor` step whose
 * `anchorId` they were written against, so the AI's dialogue interrupts
 * Battle playback exactly where it anchors (item 101), never elsewhere.
 * Anchors with no matching Cue (or when `narrative` is omitted, e.g. a
 * pure Battle Trace determinism check) simply produce no dialogue step.
 */
export function buildMainQuestBattlePlaybackPlan(
  trace: MainQuestBattleTrace,
  narrative?: MainQuestNarrativeScript,
): MainQuestBattlePlaybackPlan {
  const cuesByAnchor = new Map<string, MainQuestBattleDialogueCue[]>()
  for (const cue of narrative?.battleInterludes ?? []) {
    const list = cuesByAnchor.get(cue.anchorId)
    if (list) {
      list.push(cue)
    } else {
      cuesByAnchor.set(cue.anchorId, [cue])
    }
  }

  const steps: MainQuestPlaybackStep[] = []
  for (const event of trace.events) {
    steps.push({ kind: 'battleEvent', event })
    if (event.type === 'monsterReactionAnchor') {
      const cues = cuesByAnchor.get(event.anchorId)
      if (cues) {
        for (const cue of cues) {
          steps.push({ kind: 'dialogue', cue })
        }
      }
    }
  }

  return { steps }
}
