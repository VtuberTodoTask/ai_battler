# Phase 6.2 Pass 2 Report

Date: 2026-08-09T01:17:55.673Z

## Test Summary

- npm test: 650 passed / 650 total
- npm run typecheck: passed
- npm run lint: passed
- npm run build: passed
- npm run test:expedition-regression: 22 passed
- 30-day campaign smoke: passed
- Browser Prediction spot check: passed (no console errors)

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
