import { generateEndingNarrative } from '../../core/ending/narrative.ts'
import { applyEndingNarrative } from '../../core/ending/presentation.ts'
import { findEndingCampaignParty } from '../../core/ending/facts.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { UiActionResult } from '../canvas/types.ts'

export interface EndingNarrativeGenerationDeps {
  /** Always read AFTER the `await` below, never the value captured at call
   * start — mirrors `mainQuestNarrativeGeneration.ts`'s
   * `runMainQuestNarrativeGeneration` exactly (Phase 9.9 item 21/22). */
  campaignRef: { current: TavernCampaignState | null }
  /** Must update `campaignRef.current` and the rendered Campaign state in
   * the SAME synchronous call — `TavernSimulator`'s `commitCampaign`. */
  commitCampaign: (next: TavernCampaignState) => void
  narrativeProvider: NarrativeProvider | null
}

/**
 * The async Ending Narrative generation flow — a Phase 9.9 sibling of
 * `runMainQuestNarrativeGeneration`, following the exact same discipline:
 * read the latest Campaign via `campaignRef` AFTER the `await` (never the
 * snapshot captured before it), apply the Core transition synchronously
 * outside any React state-updater, and commit the outcome directly so
 * `UiActionResult` always reflects exactly what was (or was not) written.
 * A stale response — the Campaign having moved on to a New Game, a Loaded
 * save, or a different Ending state during the `await` — is rejected by
 * `applyEndingNarrative`'s own Core invariants, never silently applied.
 */
export async function runEndingNarrativeGeneration(
  deps: EndingNarrativeGenerationDeps,
): Promise<UiActionResult> {
  const { campaignRef, commitCampaign, narrativeProvider } = deps
  const startCampaign = campaignRef.current
  if (!startCampaign) {
    return { ok: false, message: 'キャンペーンが開始されていません' }
  }
  const { ending } = startCampaign
  const startTriggerAttemptId = ending.triggerAttemptId
  if (ending.narrative) {
    return { ok: true }
  }
  if (ending.status !== 'narrative_pending') {
    return { ok: false, message: 'エピローグを生成できる状態ではありません' }
  }
  if (!narrativeProvider) {
    return { ok: false, message: 'AI provider not connected' }
  }
  if (!ending.facts) {
    return { ok: false, message: 'Ending Factsが存在しません' }
  }
  const triggerAttempt = startCampaign.mainQuest.attempts.find(
    (a) => a.id === ending.triggerAttemptId,
  )
  if (!triggerAttempt) {
    return { ok: false, message: 'Endingの起点となる試行が見つかりません' }
  }
  const finalCampaignParty = findEndingCampaignParty(
    startCampaign,
    triggerAttempt.partyId,
  )
  if (!finalCampaignParty) {
    return { ok: false, message: 'パーティが見つかりません' }
  }

  try {
    const { script } = await generateEndingNarrative(
      ending.facts,
      finalCampaignParty,
      narrativeProvider,
    )

    const latestCampaign = campaignRef.current
    if (!latestCampaign) {
      return { ok: false, message: 'キャンペーンが開始されていません' }
    }
    // The Campaign may have moved on to a New Game, a Loaded save, or a
    // different Ending altogether while awaiting the AI response —
    // `applyEndingNarrative`'s own invariants only check that SOME Ending is
    // `narrative_pending`, which a different (but structurally valid)
    // Campaign could also satisfy. Bind the response back to the exact
    // Ending it was generated for via `triggerAttemptId` before applying.
    if (latestCampaign.ending.triggerAttemptId !== startTriggerAttemptId) {
      return {
        ok: false,
        message: 'エピローグの生成対象が変化したため破棄しました',
      }
    }
    const next = applyEndingNarrative(latestCampaign, script)
    commitCampaign(next)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : '物語の生成に失敗しました'
    return { ok: false, message }
  }
}
