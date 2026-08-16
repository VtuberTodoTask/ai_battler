# Phase 8.5.1 — Day Transition Flow Refinement

## Overview

Phase 8.5.1 refines the daily game loop so that finishing a day is a clear, scene-based transition:

```text
DAY N TavernScene
↓ [翌日へ]
DayResultsScene — STEP 1: DAY N の重要な出来事
↓ [次へ]
DayResultsScene — STEP 2: DAY N の依頼結果
↓ [翌日へ]
DAY N+1 TavernScene
```

The previous flow mixed `本日を確定`, modal notifications, and the expedition-results scene, making the day boundary hard to read. This change turns the day-end receipt into a first-class `DayResultsScene` with two internal steps.

## Problem With Previous Day Flow

- `TavernScene` exposed both `[本日を確定]` and `[翌日へ]`.
- High-importance events popped up as a modal after resolve / advance.
- Expedition results were already a separate scene, but important events were not, so the day-end presentation was split across a modal and a scene.
- Players had to close a modal to continue, which trained them to treat day-end content as interruptive rather than as the main phase of the day.

## New Daily Game Loop

1. Player plans the day in `TavernScene`.
2. Player presses `[翌日へ]`.
3. `TavernSimulator.handleFinishDay` performs resolve + advance once.
4. `TavernScene` detects that the day advanced and pushes `DayResultsScene`.
5. `DayResultsScene` starts at `important_events`.
6. Player presses `[次へ]` to switch to `expedition_results` in the same scene.
7. Player presses `[翌日へ]` to pop back to `TavernScene` for `DAY N+1`.

Day resolution runs exactly once. The final `[翌日へ]` only leaves the results presentation.

## Removal of "本日を確定"

- `TavernHeader` now has a single primary action button labeled `[翌日へ]`.
- `TavernScene.handleResolve` was removed.
- `TavernScene.handleAdvance` is the only day-advance handler and triggers the combined `advanceDay` action from `TavernSimulator.handleFinishDay`.
- The `canResolveDay` / `canAdvanceDay` distinction is still used internally, but the player sees one enabled button.

## DayResultsScene

- `id = 'dayResults'`.
- Reuses the old `ExpeditionResultsScene` layout for the expedition-results step.
- Adds a new `ImportantEventsPanel` for the first step.
- Footer switches based on step:
  - `important_events` → `[次へ]`
  - `expedition_results` → `[前へ] [前の結果] [次の結果] [翌日へ]`
- Step transitions are internal state changes, not scene pushes.
- Empty states are preserved for both steps:
  - important events: `"今日は特に大きな出来事はありませんでした。"`
  - expedition results: `"本日帰還したパーティはありません。"`

## Important Events Step

- Events are projected from existing sources only:
  - `TavernDayRecord.partyEvents` (arrivals, departures, recovery start, casualty)
  - `TavernDayRecord.relationshipEvents` (stay extensions, large affinity/financial pressure swings)
  - `TavernDayRecord.progressionEvents` (skill improvements, progression skipped)
  - `campaign.currentDay.partyEvents` filtered to `nextDay` (overnight recovery completions, scheduled departures, next-day arrivals)
- No new event system was introduced.
- Events are rendered as the main scene content, not as a modal.
- Each event can have a `[物語として読む]` button if a narrative candidate exists.

## Expedition Results Step

- Reuses `buildReportFromResult`, `buildExpeditionReportId`, and `buildSummaryLines` from the old `expeditionReportViewModel.ts`.
- List + inline detail layout.
- `[物語として読む]` is available; the `[報告を見る]` structured-report overlay was removed from the results scene per request, so summary lines remain inline.

## No-Modal Policy

```text
Important Events are rendered as a primary DayResultsScene step,
not as a modal.

Expedition Results are rendered as a primary DayResultsScene step,
not as a modal.
```

- The old `TavernScene.showHighImportanceSummary` modal was removed.
- `Feedback` / `Notification` infrastructure is preserved but no longer used for the day-end presentation.
- Only detail/auxiliary overlays (structured report, LOG) are permitted.

## Day Number Semantics

`DayResultsScene` keeps two explicit day numbers:

```ts
resolvedDay: number // the day whose results are being shown
nextDay: number // the new day that starts after leaving the scene
```

This avoids confusion even though `campaign.dayNumber` already advanced to `nextDay`.

## Advance-Day Execution Semantics

- `TavernScene.handleAdvance` sets a busy guard (`_advancing = true`) and disables the header button.
- `TavernSimulator.handleFinishDay` runs `resolveCampaignDay` then `advanceCampaignDay` inside a single state update.
- `DayResultsScene` final `[翌日へ]` calls `sceneManager.pop()` and does **not** call `resolveCampaignDay` or `advanceCampaignDay` again.
- `lastDayResultsStep` and `lastSelectedResultId` are cleared on exit.

## Feedback / Unread Integration

- `viewedReportIds` and `viewedActivityIds` continue to work.
- `DayResultsScene` passes `seenResultIds` to the view model builder so expedition result rows show the correct read state.
- Narrative unread state is independent; narrative candidates are not auto-marked as read just by being displayed.

## SoundNovel Return Flow

- `GameUiState` was extended with:
  - `lastDayResultsStep?: 'important_events' | 'expedition_results'`
  - `lastSelectedResultId?: string`
- Before pushing `soundNovel`, `DayResultsScene` stores the current step and selected result id in `GameUiState`.
- `CanvasGame.onMount` restores the previous scene input plus the full `GameUiState`.
- `DayResultsScene.setCampaign` restores `_step` and selection from `GameUiState`.
- `SoundNovelScene.returnToPrevious` simply calls `sceneManager.pop()`; `DayResultsScene` reappears at the correct step.

## AI Zero-call

The normal daily flow:

```text
Tavern → DayResults → important events → expedition results → next day
```

performs **zero** AI calls. AI is only triggered when the player explicitly presses `[物語として読む]`. This is covered by the new smoke test `I` and the view-model unit tests.

## Tests

New files:

- `src/ui/canvas/scenes/dayResults/DayResultsScene.ts`
- `src/ui/canvas/scenes/dayResults/dayResultsViewModel.ts`
- `src/ui/canvas/scenes/dayResults/dayResultsViewModel.test.ts`
- `src/ui/canvas/__tests__/phase8-5-1-day-transition-flow-smoke.test.ts`

Updated tests:

- `src/ui/canvas/__tests__/phase8-1-tavern-main-screen-smoke.test.ts` — adjusted for single `[翌日へ]` button and `dayResults` push.
- `src/ui/canvas/__tests__/phase8-2-game-feedback-smoke.test.ts` — removed high-importance modal expectations; added `dayResults` push assertions.

Removed:

- `src/ui/canvas/scenes/expeditionResults/ExpeditionResultsScene.ts`
- `src/ui/canvas/scenes/expeditionResults/expeditionResultsViewModel.ts`
- `src/ui/canvas/__tests__/phase8-5-expedition-results-scene-smoke.test.ts`

### Verification Results

| Check                        | Command                                                                  | Result                                                      |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Type check                   | `npm run typecheck`                                                      | green                                                       |
| Lint / Prettier              | `npm run lint`                                                           | green                                                       |
| Unit tests                   | `npm run test`                                                           | 1122 / 1122 PASS                                            |
| Coverage                     | `npm run test:coverage`                                                  | 89.85% stmts / 81.32% branch / 91.7% funcs / 91.53% lines   |
| Build                        | `npm run build`                                                          | green                                                       |
| Expedition regression        | `npm run test:expedition-regression`                                     | 22 / 22 PASS                                                |
| 30-day campaign smoke        | `vitest run src/core/tavern/campaign/campaign-smoke.test.ts`             | PASS                                                        |
| Campaign progression smoke   | `vitest run src/core/tavern/campaign/campaign-progression-smoke.test.ts` | PASS                                                        |
| Compression audit            | `npx tsx scripts/phase7-0-3-compression-audit.ts`                        | PASS (30 candidates, leakage 0)                             |
| Timeline audit               | `npx tsx scripts/phase7-1-timeline-audit.ts`                             | PASS (leakage 0)                                            |
| Narrative audit              | `npx tsx scripts/phase7-0-narrative-audit.ts`                            | 30-day zero-call: 0 calls before manual generation, 3 after |
| Phase 7 smokes               | `scripts/phase7-1-smoke.ts` through `phase7-7-1-*.ts`                    | all PASS                                                    |
| Phase 8.0–8.4 + 8.5.1 smokes | `vitest run phase8-*-smoke.test.ts`                                      | 76 / 76 PASS                                                |

## Browser E2E

Browser E2E (A–R) is the final step for PR #43 and is intended to run after Phase 8.5.1 is complete. It will be executed before merging PR #43.

## Known Limitations

- Result-scene background image is a placeholder; the structure is ready for a dedicated background asset.
- BGM hooks are in place, but Phase 8.5.1 does not add new BGM for `DayResultsScene`.
- A `前へ` button from expedition results back to important events is implemented; returning from `important_events` to `tavern` is not supported because the flow expects the player to continue to results before finishing the day.
