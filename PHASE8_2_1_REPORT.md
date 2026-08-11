# Phase 8.2.1 — Feedback Accuracy & Report Consistency Fixes

## Scope

Review-driven patch for PR #39 (`Phase 8.2: Game Feedback & Expedition Reports`).
Corrects four inconsistencies found in the 8.2 feedback/report layer without changing
any narrative prompt contract or adding new economy features.

## Changes

1. **Expedition report deduplication**
   - `buildExpeditionReportViewModels` now collects reports into a `Map` keyed by a
     stable id (`expedition-report:<day>:<partyId>:<requestId>`).
   - `currentDay.results` and `history[*].results` no longer produce duplicate UIs;
     the history copy is treated as canonical and overwrites the current-day copy.
   - `unreadReportCount` is derived from the deduplicated set.

2. **Authoritative injury projection**
   - Removed all HP-ratio inference for injuries.
   - `ExpeditionReportViewModel` now reads from `ResolvedDispatch.result.state.injuries`.
   - Severity mapping: `light` → 軽傷, `serious` → 重傷.
   - Casualties (`report.casualties`) take precedence; injuries are never shown for dead characters.
   - Multiple injuries on one character collapse to the most severe in the summary.
   - Old saves with no `state.injuries` display `負傷記録なし` instead of guessing.

3. **Structured feedback unread state**
   - `buildTavernFeedbackItems(campaign, viewedActivityIds)` now derives `unread` from
     `viewedActivityIds` for `party_arrival`, `recovery_complete`, `stay_extension`,
     `quest_rejected`, `quest_accepted`, and `expedition_return`.
   - Downtime events continue to use their persistent `narrativeStatus`.
   - `TavernScene.markActivityViewed` adds the opened activity id to `viewedActivityIds`;
     showing a High notification modal does **not** auto-mark the activity as read.
   - `GameUiState` defaults include `viewedReportIds: []` and `viewedActivityIds: []`.

4. **Stay-extension narrative UI connection**
   - Stay-extension feedback resolves its `NarrativeCandidate` by `partyId` + `dayNumber`
     and exposes `narrativeTargetId`.
   - `TavernScene.openStayExtensionDetail` shows structured summary + `[物語として読む]`.
   - First narrative click uses the existing `actions.openExpeditionNarrative` (1 AI call);
     reopening reads the cached `NarrativeGenerationRecord` (0 AI calls).
   - Stale-merge guard is applied: the scene reads `candidate.state` from the current
     `campaign` rather than a captured old object.

5. **High notification actions**
   - `TavernScene.showHighImportanceSummary` adds a primary action button:
     - `expedition_return` → `[報告を見る]` (opens report + marks activity viewed)
     - `party_arrival` → `[選択する]` (selects party)
   - Notification queue continues after the modal is closed.

6. **Feedback sorting**
   - `TavernScreenViewModel` applies `sortFeedbackItems` to the activity list so unread
     high/medium/low items appear before read items while preserving stable order.
   - Downtime `importance` is now derived from `DowntimeEvent.importance` (3→high,
     2→medium, 1→low) instead of always `low`.

## Narrative prompt versions (unchanged)

- `NARRATIVE_PROMPT_VERSION = v11`
- `DOWNTIME_PROMPT_VERSION = v2`

## Verification

- `typecheck` — pass
- `lint` — pass
- `test` — 1052/1052 pass
- `test:coverage` — 89.85% statements
- `build` — pass
- `test:expedition-regression` — 22/22 pass
- `phase8-0-canvas-ui-foundation-smoke` — 12/12 pass
- `phase8-1-tavern-main-screen-smoke` — 15/15 pass
- `phase8-1-1-tavern-integration-smoke` — 8/8 pass
- `phase8-2-game-feedback-smoke` — 13/13 pass
- `campaign-smoke.test.ts` & `campaign-progression-smoke.test.ts` — pass

## Known limitations (out of scope)

- Reward/economy system is not implemented. Report UI shows `報酬：記録なし` when no
  authoritative reward record exists.
- `viewedActivityIds` is UI state only; reloading the game resets all structured
  feedback to unread. This is acceptable for Phase 8.2.1.

## PR

https://github.com/VtuberTodoTask/ai_battler/pull/39
