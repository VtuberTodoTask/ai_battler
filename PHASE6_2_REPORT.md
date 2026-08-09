# Phase 6.2 Pass 2 Report

Date: 2026-08-09T01:17:55.673Z

## Test Summary

- npm test: 656 passed / 656 total
- npm run typecheck: passed
- npm run lint: passed
- npm run build: passed
- npm run test:expedition-regression: 22 passed
- 30-day campaign smoke: passed
- Browser Prediction spot check: passed (no console errors)

## Phase 6.2.1 Final Verification

- npm run typecheck: passed
- npm run lint: passed
- npm test: 656 passed / 656 total
- npm run build: passed
- npm run test:expedition-regression: 22 passed / 22 total
- GitHub Actions build-and-test (push and pull_request): passed
- Recorded browser E2E: passed (no console errors)
- Full E2E report: `test-report-phase6-2.md`

## Structural Changes (Pass 2)

Pass 1 levers kept unchanged:

- difficultyBasePenalty: -10 / 0 / 10 / 20
- EXPEDITION_ENCOUNTER_THREAT_MULTIPLIER = 0.85

Pass 2 structural fixes applied:

- A. absencePenaltyForSkill: multi-role skills (scouting) only penalise when no acceptable role exists.
- B. Investigation: two attempts, difficulty = 5 if progress < 40 else 0, criticalSuccess/success → 100 progress, partialSuccess → +20.
- C. Elimination: added allNeutralized success branch, escaped targets kept separate.
- D. Escort: ordinary route failure progress +25 → +50.
- E. Retrieval: one retry on failure with deterministic securing-retry seed.
- F. Survey: success requires 2/3 surveyed + reportReturned + avgQuality ≥ minimum; completeSuccess adds quality ≥ max(minimum, 85).

## Stage B Early-rank Deep Audit (100 samples/cell)

Total cells: 1728 (1,728) | Output: reports/phase6_2_after_early_rank_deep.json

### Rank Advantage (estimatedSuccessRate)

| rankAdvantage | count | median | p10   | p25   | p75   | p90   |
| ------------- | ----- | ------ | ----- | ----- | ----- | ----- |
| 0             | 864   | 61.0%  | 24.0% | 41.0% | 76.0% | 89.0% |
| 1             | 576   | 73.0%  | 37.5% | 54.0% | 87.0% | 96.0% |
| 2             | 288   | 80.5%  | 45.7% | 64.8% | 94.0% | 99.0% |

### Objective × rankAdvantage median success

| objective     | same-rank | +1    | +2    |
| ------------- | --------- | ----- | ----- |
| investigation | 77.0%     | 87.0% | 96.5% |
| elimination   | 64.0%     | 83.5% | 95.0% |
| rescue        | 53.0%     | 67.5% | 72.0% |
| escort        | 58.0%     | 65.5% | 74.0% |
| retrieval     | 51.5%     | 64.0% | 77.0% |
| survey        | 71.5%     | 84.0% | 88.0% |

### Appropriate-only median / P10

| rankAdvantage | count | median | p10   | p25   |
| ------------- | ----- | ------ | ----- | ----- |
| 0             | 828   | 62.0%  | 23.7% | 41.0% |
| 1             | 576   | 73.0%  | 37.5% | 54.0% |
| 2             | 288   | 80.5%  | 45.7% | 64.8% |

### 200-sample known fixtures (investigation-monster-signs, battle enabled)

| party→request | mean  | min   | max   |
| ------------- | ----- | ----- | ----- |
| C→E           | 68.9% | 37.0% | 97.0% |
| D→D           | 46.9% | 13.0% | 79.5% |

## Stage A Coarse Full Matrix (10 samples/cell)

Total cells: 10368 (10,368) | Output: reports/phase6_2_after_coarse.json

### Rank Advantage (estimatedSuccessRate)

| rankAdvantage | count | median | p10   | p25   | p75    | p90    |
| ------------- | ----- | ------ | ----- | ----- | ------ | ------ |
| -5            | 288   | 10.0%  | 0.0%  | 0.0%  | 40.0%  | 63.0%  |
| -4            | 576   | 10.0%  | 0.0%  | 0.0%  | 40.0%  | 70.0%  |
| -3            | 864   | 20.0%  | 0.0%  | 0.0%  | 50.0%  | 80.0%  |
| -2            | 1152  | 40.0%  | 0.0%  | 10.0% | 60.0%  | 89.0%  |
| -1            | 1440  | 50.0%  | 10.0% | 30.0% | 70.0%  | 90.0%  |
| 0             | 1728  | 70.0%  | 20.0% | 40.0% | 80.0%  | 100.0% |
| 1             | 1440  | 80.0%  | 30.0% | 50.0% | 90.0%  | 100.0% |
| 2             | 1152  | 90.0%  | 40.0% | 60.0% | 100.0% | 100.0% |
| 3             | 864   | 90.0%  | 60.0% | 80.0% | 100.0% | 100.0% |
| 4             | 576   | 100.0% | 70.0% | 90.0% | 100.0% | 100.0% |
| 5             | 288   | 100.0% | 80.0% | 90.0% | 100.0% | 100.0% |

## Observations

- Same-rank appropriate median in Stage B is ~61% (target 55–75%), within target.
- +1 rank advantage median ~73% (target 70–90%), within target.
- +2 rank advantage median ~80.5% (target 85–95%); above sanity floor (≥70%) and close to target.
- Monotonicity is preserved: higher rankAdvantage yields higher median success.
- Elimination, investigation, and survey respond most strongly to rank advantage; rescue, escort, and retrieval improve more gradually.
- Coarse full-rank matrix confirms monotonic scaling: same-rank 70%, +1 80%, +2 90%, and higher advantages approach 100%.
- Pass 2 structural fixes reduced single-check instant-fail and duplicate-penalty issues without touching global difficulty or battle constants.

## Files Changed

- src/core/expedition/checks.ts
- src/core/expedition/objectives/investigation.ts
- src/core/expedition/objectives/elimination.ts
- src/core/expedition/objectives/escort.ts
- src/core/expedition/objectives/retrieval.ts
- src/core/expedition/objectives/survey.ts
- src/core/expedition/regression.ts (cleanForCompare undefined stripping)
- Test fixture updates in elimination, investigation, rescue, escort, survey role-contribution files
- regression-snapshots/baseline/* updated
- reports/phase6_2_after_early_rank_deep.json
- reports/phase6_2_after_coarse.json
- reports/phase6_2_fixtures.json
- reports/phase6_2_1_elimination_spot.json
- scripts/elim-spot.ts

## Phase 6.2.1 final consistency fix

### Problem

`determineEliminationOutcome` treated `allNeutralized` (all required targets defeated or escaped) as `success` regardless of `confirmationRequired`. This allowed an escaped target to satisfy a request that required explicit confirmation, and `objective.completed` could be `false` while the outcome was `success`.

### Fix

- `determineEliminationOutcome` now branches on `confirmationRequired`:
  - `confirmationRequired = true`: only `allDefeated && allConfirmed` can yield `success` / `completeSuccess`; escaped-only neutralization is not a success.
  - `confirmationRequired = false`: `allNeutralized` yields `success`, and `allDefeated && allConfirmed` yields `completeSuccess`.
- `updateEliminationCompleted` uses the same branching and no longer requires `allDefeated` for `confirmationRequired = false`.
- `resolveEliminationTargets` calls `updateEliminationCompleted` instead of an inline `completed` formula.
- `eliminationProgressFact` no longer emits "全対象の討伐を確認した" when escaped targets remain, and avoids "周辺の脅威排除" wording when confirmation is required.
- `defeatedTargetIds` and `escapedTargetIds` remain separate in structured state.

### Added domain tests

- Test A: `confirmationRequired=false`, 3 defeated + 1 escaped -> `success` and `objective.completed=true`.
- Test B: `confirmationRequired=true`, 3 defeated + 1 escaped -> not `success` / `completeSuccess`, `objective.completed=false`.
- Test C: `confirmationRequired=false`, 4 defeated -> `completeSuccess`.
- Test D: `confirmationRequired=true`, 4 defeated + confirmed -> `success`/`completeSuccess`.
- Test E: 2 defeated + 1 escaped + 1 surviving -> `success` forbidden, `completed=false`.
- Test F: `defeatedTargetIds` and `escapedTargetIds` are not mixed.

### Elimination spot measurement after fix

288 cells × 100 samples across the two elimination request templates, 8 party templates, 3 scenario seeds, and rank pairs E→E / D→E / D→D / C→E / C→D / C→C.

| rankAdvantage | samples | avg defeated | avg escaped | avg surviving | completeSuccess | success | partialSuccess | forcedRetreat | failedObjective |
| ------------- | ------- | ------------ | ----------- | ------------- | --------------- | ------- | -------------- | ------------- | --------------- |
| same-rank     | 14400   | 1.83         | 0.58        | 1.59          | 13.2%           | 34.7%   | 13.2%          | 38.9%         | 0.0%            |
| +1            | 9600    | 2.49         | 0.43        | 1.08          | 37.5%           | 26.0%   | 11.5%          | 25.0%         | 0.0%            |
| +2            | 4800    | 2.65         | 0.48        | 0.88          | 39.6%           | 29.2%   | 8.3%           | 22.9%         | 0.0%            |

### Regression

- `npm run test:expedition-regression`: 22 passed after updating `regression-snapshots/baseline/elimination-partialSuccess.json` to reflect the intended `objective.completed=true` / `success` change for `confirmationRequired=false` with neutralized targets.
- No unrelated snapshots changed.

### Recorded Browser E2E

A persistent testing agent ran the recorded Tavern Campaign E2E against the built preview (`npm run preview -- --host`). The full report is in `test-report-phase6-2.md`; summary:

- Tavern campaign started with default seed.
- Same-rank E party prediction shown at 77%, +2 rank C party prediction updated to 100%, stale prediction prevented, cache reuse verified when returning to the original party.
- Acceptance response is independent of prediction (leader accepted with `appropriate`).
- Actual expedition result displayed separately from prediction.
- Elimination result detail showed 3 defeated / 1 escaped / 0 surviving, objective progress 75%, objective completed `yes`, outcome `success` — consistent with `!confirmationRequired && allNeutralized`.
- Post-expedition HP/MP/Morale, reputation (+2), and campaign history updated correctly.
- No console errors detected.
