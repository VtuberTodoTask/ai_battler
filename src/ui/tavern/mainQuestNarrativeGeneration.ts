import { generateMainQuestNarrative } from '../../core/mainQuest/narrative.ts'
import { applyMainQuestNarrative } from '../../core/mainQuest/presentation.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from '../../core/mainQuest/threats.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { UiActionResult } from '../canvas/types.ts'

export interface MainQuestNarrativeGenerationDeps {
  /** Always read AFTER the `await` below, never the value captured at call
   * start — this is what lets a stale AI response be detected instead of
   * silently applied to whatever Campaign happens to be current later. */
  campaignRef: { current: TavernCampaignState | null }
  /**
   * Must update `campaignRef.current` and the rendered Campaign state in
   * the SAME synchronous call (e.g. `TavernSimulator`'s `commitCampaign`).
   * A `campaignRef` that only catches up later (a `useEffect` synced from
   * `campaign` state, for instance) reopens exactly the stale-write window
   * this function exists to close.
   */
  commitCampaign: (next: TavernCampaignState) => void
  narrativeProvider: NarrativeProvider | null
  attemptId: string
}

/**
 * The async Main Quest Narrative generation flow, factored out of
 * `TavernSimulator` so it can be exercised directly (stale-response and
 * retry behavior included) without rendering the whole Canvas UI tree, and
 * so `TavernSimulator.tsx` stays a component-only export (Fast Refresh).
 * Deliberately takes explicit deps instead of closing over component state:
 * a `setCampaign((current) => ...)` state-updater must never be the place
 * an async result's success/failure is decided (the updater can re-run,
 * e.g. under Strict Mode, and its timing is not `await`-ordered relative to
 * the calling code) — this reads the latest Campaign via `campaignRef`
 * AFTER the `await`, applies the Core transition synchronously, and commits
 * the outcome directly, so `UiActionResult` always reflects exactly what
 * was (or was not) written.
 */
export async function runMainQuestNarrativeGeneration(
  deps: MainQuestNarrativeGenerationDeps,
): Promise<UiActionResult> {
  const { campaignRef, commitCampaign, narrativeProvider, attemptId } = deps
  const startCampaign = campaignRef.current
  if (!startCampaign) {
    return { ok: false, message: 'キャンペーンが開始されていません' }
  }
  const attempt = startCampaign.mainQuest.attempts.find(
    (a) => a.id === attemptId,
  )
  if (!attempt) {
    return { ok: false, message: '主依頼の試行が見つかりません' }
  }
  if (attempt.narrative) {
    return { ok: true }
  }
  if (!narrativeProvider) {
    return { ok: false, message: 'AI provider not connected' }
  }
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[attempt.threatId]
  const campaignParty = startCampaign.parties.find(
    (p) => p.id === attempt.partyId,
  )
  if (!campaignParty) {
    return { ok: false, message: 'パーティが見つかりません' }
  }

  try {
    const previousAttempts = startCampaign.mainQuest.attempts.filter(
      (a) => a.partyId === campaignParty.id && a.id !== attempt.id,
    )
    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      narrativeProvider,
      previousAttempts,
    )

    // The Campaign may have moved on while awaiting the AI response (a
    // new/loaded game, or the pending Attempt/Presentation state changed)
    // — always re-validate against the LATEST Campaign via
    // `applyMainQuestNarrative`'s own Core invariants (never the snapshot
    // captured before the `await`), synchronously, outside any
    // state-updater. A stale response is never written to a Campaign it
    // was not generated against.
    const latestCampaign = campaignRef.current
    if (!latestCampaign) {
      return { ok: false, message: 'キャンペーンが開始されていません' }
    }
    const next = applyMainQuestNarrative(latestCampaign, attemptId, script)
    commitCampaign(next)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : '物語の生成に失敗しました'
    return { ok: false, message }
  }
}
