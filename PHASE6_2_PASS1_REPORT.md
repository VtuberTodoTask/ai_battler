# Phase 6.2 Calibration Pass 1 Report

## Selected levers

- **Lever A**: `difficultyBasePenalty` difficulty base shifted from `0/10/20/30` to `-10/0/10/20` (a flat -10 to all skill-check difficulty baselines, preserving relative gaps).
- **Lever B**: `EXPEDITION_ENCOUNTER_THREAT_MULTIPLIER = 0.85` applied only in `battleIntegration.ts` encounter generation, reducing expedition-only enemy threat budget by 15%.

No other balance constants were changed.

## Why A was selected

Stage B showed that, even with an appropriate party, same-rank success was far below the 55–75% target (0.22). The bottleneck was widespread skill-check failures: route planning, travel, exploration, access, stabilization, securing, and investigation checks all suffered from a heavy base penalty. Shifting the base penalty by -10 raises the baseline without changing feature/role/absence/equipment bonuses or the relative spacing between difficulty labels.

## Why expedition-only B was selected

Stage B conditional battle favorable rates were low for same-rank fights (~0.42–0.46) while +2 fights were already high (~0.75), suggesting the encounter budget built from `ADVENTURER_THREAT[request.rank] * partySize` was too large for expeditions. Reducing only the expedition encounter budget keeps Phase 1 battle calibration intact and lets rank advantage express itself through the party's actual stats/skills rather than scaling enemies to the party.

## Rejected / deferred levers

- **C (retreat thresholds)**: Not needed in Pass 1; with lower enemy threat, forced retreat should fall naturally.
- **D (objective-specific gates)**: Deferred to Pass 2 if single objectives remain outliers after common scaling.
- **E (elimination semantics)**: `requiredTargetCount` and routed-enemy completion semantics unchanged per instruction.
- **F (adventurer stat scaling)**: Rank stat generation untouched per instruction.

## Rank bands before / after

Measured on acceptance `appropriate` cells in the Stage B exact corpus (6 objectives × all request templates × all party templates × 3 scenarios, 100 samples/cell).

| Band      | Baseline                      | A only                        | B only                        | A + B                         |
| --------- | ----------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| same-rank | 22.0% / p10 6.0% / p90 50.0%  | 33.0% / p10 8.0% / p90 68.0%  | 25.0% / p10 8.0% / p90 51.0%  | 36.0% / p10 12.0% / p90 68.0% |
| +1        | 32.0% / p10 11.0% / p90 62.0% | 45.0% / p10 16.0% / p90 78.0% | 34.0% / p10 13.0% / p90 62.0% | 47.0% / p10 21.0% / p90 79.0% |
| +2        | 43.0% / p10 18.7% / p90 73.0% | 58.5% / p10 27.0% / p90 86.0% | 44.0% / p10 20.0% / p90 73.0% | 59.0% / p10 28.0% / p90 86.0% |

## Isolated A-only results

| Metric                         | Value |
| ------------------------------ | ----- |
| same-rank appropriate median   | 33.0% |
| +1 appropriate median          | 45.0% |
| +2 appropriate median          | 58.5% |
| same-rank failedObjective rate | 26.2% |
| same-rank forcedRetreat rate   | 23.5% |

## Isolated B-only results

| Metric                                                     | Value |
| ---------------------------------------------------------- | ----- |
| same-rank conditional battle favorable                     | 47.7% |
| D->D conditional battle favorable                          | 59.5% |
| C->C conditional battle favorable                          | 60.5% |
| C->E conditional battle favorable                          | 77.6% |
| Elimination same-rank appropriate median                   | 22.0% |
| Optional battle objective same-rank median (investigation) | 28.0% |

## Combined A+B results

| Metric                         | Value |
| ------------------------------ | ----- |
| same-rank appropriate median   | 36.0% |
| +1 appropriate median          | 47.0% |
| +2 appropriate median          | 59.0% |
| Overall mean estimated success | 44.0% |

## Objective before / after (same-rank appropriate)

| Objective     | Baseline | A only | B only | A + B |
| ------------- | -------- | ------ | ------ | ----- |
| investigation | 25.5%    | 34.5%  | 28.0%  | 39.0% |
| elimination   | 11.5%    | 12.0%  | 22.0%  | 22.0% |
| rescue        | 32.5%    | 49.5%  | 34.0%  | 50.5% |
| escort        | 17.0%    | 29.0%  | 17.0%  | 29.5% |
| retrieval     | 25.0%    | 39.0%  | 28.0%  | 42.0% |
| survey        | 30.0%    | 46.0%  | 31.5%  | 46.5% |

## Objective +1 before / after (appropriate)

| Objective     | Baseline | A only | B only | A + B |
| ------------- | -------- | ------ | ------ | ----- |
| investigation | 35.0%    | 45.0%  | 36.0%  | 49.0% |
| elimination   | 23.0%    | 23.0%  | 31.0%  | 30.5% |
| rescue        | 48.5%    | 64.0%  | 49.5%  | 64.5% |
| escort        | 24.0%    | 39.0%  | 26.0%  | 39.5% |
| retrieval     | 38.0%    | 55.0%  | 39.5%  | 57.0% |
| survey        | 37.5%    | 55.0%  | 39.0%  | 55.0% |

## Objective +2 before / after (appropriate)

| Objective     | Baseline | A only | B only | A + B |
| ------------- | -------- | ------ | ------ | ----- |
| investigation | 48.0%    | 60.0%  | 48.0%  | 60.0% |
| elimination   | 31.5%    | 32.0%  | 37.0%  | 37.0% |
| rescue        | 55.5%    | 71.0%  | 55.5%  | 71.0% |
| escort        | 33.5%    | 53.5%  | 33.0%  | 53.5% |
| retrieval     | 55.0%    | 73.5%  | 55.0%  | 73.0% |
| survey        | 47.0%    | 62.5%  | 47.5%  | 65.0% |

## Outcome failure distribution (appropriate same-rank)

### Baseline

| Objective     | completeSuccess | success | partialSuccess | failedObjective | forcedRetreat | lostExpedition |
| ------------- | --------------- | ------- | -------------- | --------------- | ------------- | -------------- |
| investigation | 26.7%           | 1.7%    | 6.6%           | 39.1%           | 21.6%         | 4.3%           |
| elimination   | 12.6%           | 0.9%    | 37.1%          | 2.9%            | 46.5%         | 0.1%           |
| rescue        | 23.8%           | 11.0%   | 0.0%           | 46.9%           | 18.2%         | 0.1%           |
| escort        | 11.0%           | 6.7%    | 6.3%           | 47.7%           | 28.2%         | 0.1%           |
| retrieval     | 12.8%           | 12.6%   | 0.2%           | 56.8%           | 17.6%         | 0.1%           |
| survey        | 7.9%            | 24.1%   | 37.9%          | 10.8%           | 19.2%         | 0.0%           |

### A only

| Objective     | completeSuccess | success | partialSuccess | failedObjective | forcedRetreat | lostExpedition |
| ------------- | --------------- | ------- | -------------- | --------------- | ------------- | -------------- |
| investigation | 34.4%           | 2.6%    | 10.6%          | 29.1%           | 19.5%         | 3.8%           |
| elimination   | 13.1%           | 0.7%    | 37.7%          | 2.9%            | 45.5%         | 0.1%           |
| rescue        | 36.0%           | 14.3%   | 0.0%           | 34.4%           | 15.2%         | 0.1%           |
| escort        | 18.5%           | 11.2%   | 8.4%           | 38.5%           | 23.2%         | 0.2%           |
| retrieval     | 20.7%           | 16.6%   | 0.1%           | 45.0%           | 17.4%         | 0.1%           |
| survey        | 12.4%           | 32.7%   | 30.8%          | 5.0%            | 19.0%         | 0.0%           |

### B only

| Objective     | completeSuccess | success | partialSuccess | failedObjective | forcedRetreat | lostExpedition |
| ------------- | --------------- | ------- | -------------- | --------------- | ------------- | -------------- |
| investigation | 28.5%           | 1.8%    | 7.0%           | 41.8%           | 17.8%         | 3.0%           |
| elimination   | 19.5%           | 1.2%    | 41.5%          | 2.1%            | 35.8%         | 0.0%           |
| rescue        | 25.2%           | 10.7%   | 0.0%           | 49.5%           | 14.6%         | 0.0%           |
| escort        | 12.8%           | 5.4%    | 6.7%           | 53.1%           | 22.0%         | 0.0%           |
| retrieval     | 13.2%           | 13.4%   | 0.2%           | 59.1%           | 14.1%         | 0.0%           |
| survey        | 8.1%            | 25.3%   | 39.5%          | 11.4%           | 15.6%         | 0.0%           |

### A + B

| Objective     | completeSuccess | success | partialSuccess | failedObjective | forcedRetreat | lostExpedition |
| ------------- | --------------- | ------- | -------------- | --------------- | ------------- | -------------- |
| investigation | 36.7%           | 2.7%    | 10.9%          | 30.9%           | 16.0%         | 2.7%           |
| elimination   | 20.0%           | 0.9%    | 42.1%          | 2.1%            | 34.9%         | 0.0%           |
| rescue        | 38.2%           | 13.5%   | 0.0%           | 36.1%           | 12.2%         | 0.0%           |
| escort        | 21.5%           | 9.1%    | 8.7%           | 42.8%           | 17.9%         | 0.0%           |
| retrieval     | 21.5%           | 17.8%   | 0.2%           | 46.8%           | 13.8%         | 0.0%           |
| survey        | 12.8%           | 34.1%   | 32.2%          | 5.3%            | 15.6%         | 0.0%           |

## Battle before / after

Conditional battle favorable rate (given a battle occurred).

| Pair | Baseline | A only | B only | A + B |
| ---- | -------- | ------ | ------ | ----- |
| E->E | 42.0%    | 43.7%  | 47.7%  | 49.3% |
| D->E | 66.8%    | 67.3%  | 71.1%  | 71.5% |
| D->D | 46.3%    | 46.7%  | 59.5%  | 60.0% |
| C->E | 75.3%    | 75.4%  | 77.6%  | 77.8% |
| C->D | 60.8%    | 61.1%  | 70.8%  | 71.0% |
| C->C | 45.2%    | 45.3%  | 60.5%  | 60.7% |

### Battle outcome distribution (A+B)

| Outcome        | Share |
| -------------- | ----- |
| costlyVictory  | 1.5%  |
| defeat         | 0.1%  |
| partialVictory | 4.3%  |
| retreat        | 29.3% |
| stalemate      | 5.8%  |
| victory        | 59.0% |

## Battle favorable → expedition failure rate

| Pair | Baseline | A only | B only | A + B |
| ---- | -------- | ------ | ------ | ----- |
| E->E | 36.8%    | 29.1%  | 35.6%  | 27.8% |
| D->E | 29.0%    | 21.0%  | 28.1%  | 20.3% |
| D->D | 44.6%    | 34.8%  | 43.7%  | 34.2% |
| C->E | 22.9%    | 15.4%  | 22.3%  | 15.1% |
| C->D | 35.3%    | 25.5%  | 34.8%  | 25.3% |
| C->C | 43.1%    | 32.5%  | 40.4%  | 30.0% |

## Elimination analysis

| Config   | completed | defeatedCount | surviving | escaped | partialSuccess | forcedRetreat | conditionalBattleFavorable |
| -------- | --------- | ------------- | --------- | ------- | -------------- | ------------- | -------------------------- |
| Baseline | 19.6%     | 1.907         | 1.492     | 0.601   | 41.4%          | 36.5%         | 57.7%                      |
| A only   | 19.8%     | 1.928         | 1.466     | 0.606   | 41.9%          | 35.8%         | 58.3%                      |
| B only   | 25.7%     | 2.185         | 1.164     | 0.652   | 43.4%          | 28.7%         | 67.8%                      |
| A + B    | 25.9%     | 2.206         | 1.136     | 0.659   | 43.9%          | 28.0%         | 68.4%                      |

## Other objective bottlenecks (A+B)

### investigation

| Metric                     | Mean  |
| -------------------------- | ----- |
| objectiveCompleted         | 43.6% |
| objectiveProgress          | 57.0% |
| discoveredInformationCount | 1.721 |
| completeInformationCount   | 1.217 |
| discoveredThreatsCount     | 1.600 |

### rescue

| Metric             | Mean   |
| ------------------ | ------ |
| objectiveCompleted | 59.3%  |
| located            | 90.2%  |
| reached            | 74.0%  |
| stabilized         | 60.0%  |
| evacuated          | 59.3%  |
| returned           | 59.3%  |
| abandoned          | 14.7%  |
| targetFinalHp      | 27.919 |

### escort

| Metric             | Mean   |
| ------------------ | ------ |
| objectiveCompleted | 38.0%  |
| routeProgress      | 84.3%  |
| destinationReached | 55.3%  |
| delivered          | 38.0%  |
| returnedToOrigin   | 53.1%  |
| stranded           | 0.0%   |
| stress             | 23.2%  |
| targetFinalHp      | 35.072 |

### retrieval

| Metric             | Mean  |
| ------------------ | ----- |
| objectiveCompleted | 47.2% |
| located            | 88.0% |
| secured            | 61.6% |
| extracted          | 47.4% |
| returned           | 47.4% |
| abandoned          | 14.3% |
| lostDuringReturn   | 0.0%  |
| finalIntegrity     | 72.5% |

### survey

| Metric                   | Mean  |
| ------------------------ | ----- |
| objectiveCompleted       | 50.3% |
| coveragePercent          | 78.2% |
| averageQuality           | 77.5% |
| minimumAcceptableQuality | 70.0% |
| reportReturned           | 98.3% |
| reportPrepared           | 98.3% |
| surveyedSectorCount      | 2.347 |
| totalSectorCount         | 3.000 |

## Objective funnel before / after

### investigation

| Config   | objectiveCompleted | objectiveProgress | discoveredInformationCount | completeInformationCount | discoveredThreatsCount |
| -------- | ------------------ | ----------------- | -------------------------- | ------------------------ | ---------------------- |
| Baseline | 32.6%              | 45.2%             | 1.384                      | 0.845                    | 1.599                  |
| A only   | 41.7%              | 55.4%             | 1.721                      | 1.217                    | 1.599                  |
| B only   | 34.2%              | 46.6%             | 1.385                      | 0.846                    | 1.600                  |
| A + B    | 43.6%              | 57.0%             | 1.721                      | 1.217                    | 1.600                  |

### rescue

| Config   | objectiveCompleted | located | reached | stabilized | evacuated | returned | abandoned | targetFinalHp |
| -------- | ------------------ | ------- | ------- | ---------- | --------- | -------- | --------- | ------------- |
| Baseline | 42.8%              | 84.5%   | 60.8%   | 46.2%      | 42.8%     | 42.8%    | 18.0%     | 26.142        |
| A only   | 58.3%              | 89.8%   | 73.1%   | 57.7%      | 58.3%     | 58.3%    | 14.7%     | 27.634        |
| B only   | 43.7%              | 85.1%   | 61.9%   | 48.1%      | 43.8%     | 43.8%    | 18.1%     | 26.359        |
| A + B    | 59.3%              | 90.2%   | 74.0%   | 60.0%      | 59.3%     | 59.3%    | 14.7%     | 27.919        |

### escort

| Config   | objectiveCompleted | routeProgress | destinationReached | delivered | returnedToOrigin | stranded | stress | targetFinalHp |
| -------- | ------------------ | ------------- | ------------------ | --------- | ---------------- | -------- | ------ | ------------- |
| Baseline | 23.3%              | 78.4%         | 39.7%              | 23.3%     | 69.2%            | 0.0%     | 29.9%  | 33.933        |
| A only   | 37.4%              | 84.0%         | 54.6%              | 37.4%     | 53.8%            | 0.0%     | 24.2%  | 34.977        |
| B only   | 23.7%              | 78.7%         | 40.4%              | 23.7%     | 68.6%            | 0.0%     | 28.9%  | 34.047        |
| A + B    | 38.0%              | 84.3%         | 55.3%              | 38.0%     | 53.1%            | 0.0%     | 23.2%  | 35.072        |

### retrieval

| Config   | objectiveCompleted | located | secured | extracted | returned | abandoned | lostDuringReturn | finalIntegrity |
| -------- | ------------------ | ------- | ------- | --------- | -------- | --------- | ---------------- | -------------- |
| Baseline | 32.8%              | 81.1%   | 49.2%   | 32.9%     | 32.9%    | 16.3%     | 0.0%             | 72.7%          |
| A only   | 45.8%              | 87.5%   | 59.8%   | 46.0%     | 46.0%    | 13.9%     | 0.0%             | 72.6%          |
| B only   | 33.6%              | 81.7%   | 50.6%   | 33.8%     | 33.8%    | 16.8%     | 0.0%             | 72.7%          |
| A + B    | 47.2%              | 88.0%   | 61.6%   | 47.4%     | 47.4%    | 14.3%     | 0.0%             | 72.5%          |

### survey

| Config   | objectiveCompleted | coveragePercent | averageQuality | minimumAcceptableQuality | reportReturned | reportPrepared | surveyedSectorCount | totalSectorCount |
| -------- | ------------------ | --------------- | -------------- | ------------------------ | -------------- | -------------- | ------------------- | ---------------- |
| Baseline | 36.1%              | 70.5%           | 74.6%          | 70.0%                    | 96.4%          | 96.4%          | 2.114               | 3.000            |
| A only   | 49.4%              | 77.2%           | 77.4%          | 70.0%                    | 98.1%          | 98.1%          | 2.317               | 3.000            |
| B only   | 36.8%              | 71.4%           | 74.9%          | 70.0%                    | 96.7%          | 96.7%          | 2.142               | 3.000            |
| A + B    | 50.3%              | 78.2%           | 77.5%          | 70.0%                    | 98.3%          | 98.3%          | 2.347               | 3.000            |

## Bottleneck resolution assessment (A+B vs Baseline)

- **Survey all-sector**: Baseline 2.114 / 3.000 → A+B 2.347 / 3.000 (remaining).
- **Escort route**: Baseline 39.7% → A+B 55.3% (remaining).
- **Escort delivery**: Baseline 23.3% → A+B 38.0% (remaining).
- **Retrieval secure**: Baseline 49.2% → A+B 61.6% (remaining).
- **Rescue stabilize**: Baseline 46.2% → A+B 60.0% (remaining).
- **Investigation check**: Baseline 32.6% → A+B 43.6% (remaining).

## Rank scaling diagnosis

Median estimated success rate by rank pair (all appropriate cells).

### Baseline

| Pair | Median |
| ---- | ------ |
| E->E | 19.0%  |
| D->E | 31.0%  |
| D->D | 21.0%  |
| C->E | 43.0%  |
| C->D | 34.0%  |
| C->C | 25.5%  |

### A only

| Pair | Median |
| ---- | ------ |
| E->E | 31.0%  |
| D->E | 44.0%  |
| D->D | 31.0%  |
| C->E | 58.5%  |
| C->D | 48.0%  |
| C->C | 37.5%  |

### B only

| Pair | Median |
| ---- | ------ |
| E->E | 21.0%  |
| D->E | 33.0%  |
| D->D | 24.0%  |
| C->E | 44.0%  |
| C->D | 36.0%  |
| C->C | 29.0%  |

### A + B

| Pair | Median |
| ---- | ------ |
| E->E | 31.0%  |
| D->E | 45.0%  |
| D->D | 34.5%  |
| C->E | 59.0%  |
| C->D | 50.0%  |
| C->C | 42.0%  |

## Request difficulty diagnosis

Median appropriate success by fixed party rank across request ranks.

### Baseline

| Party Rank | E->E  | E->D | E->C | D->E  | D->D  | D->C | C->E  | C->D  | C->C  |
| ---------- | ----- | ---- | ---- | ----- | ----- | ---- | ----- | ----- | ----- |
| E          | 19.0% | N/A  | N/A  | N/A   | N/A   | N/A  | N/A   | N/A   | N/A   |
| D          | N/A   | N/A  | N/A  | 31.0% | 21.0% | N/A  | N/A   | N/A   | N/A   |
| C          | N/A   | N/A  | N/A  | N/A   | N/A   | N/A  | 43.0% | 34.0% | 25.5% |

### A only

| Party Rank | E->E  | E->D | E->C | D->E  | D->D  | D->C | C->E  | C->D  | C->C  |
| ---------- | ----- | ---- | ---- | ----- | ----- | ---- | ----- | ----- | ----- |
| E          | 31.0% | N/A  | N/A  | N/A   | N/A   | N/A  | N/A   | N/A   | N/A   |
| D          | N/A   | N/A  | N/A  | 44.0% | 31.0% | N/A  | N/A   | N/A   | N/A   |
| C          | N/A   | N/A  | N/A  | N/A   | N/A   | N/A  | 58.5% | 48.0% | 37.5% |

### B only

| Party Rank | E->E  | E->D | E->C | D->E  | D->D  | D->C | C->E  | C->D  | C->C  |
| ---------- | ----- | ---- | ---- | ----- | ----- | ---- | ----- | ----- | ----- |
| E          | 21.0% | N/A  | N/A  | N/A   | N/A   | N/A  | N/A   | N/A   | N/A   |
| D          | N/A   | N/A  | N/A  | 33.0% | 24.0% | N/A  | N/A   | N/A   | N/A   |
| C          | N/A   | N/A  | N/A  | N/A   | N/A   | N/A  | 44.0% | 36.0% | 29.0% |

### A + B

| Party Rank | E->E  | E->D | E->C | D->E  | D->D  | D->C | C->E  | C->D  | C->C  |
| ---------- | ----- | ---- | ---- | ----- | ----- | ---- | ----- | ----- | ----- |
| E          | 31.0% | N/A  | N/A  | N/A   | N/A   | N/A  | N/A   | N/A   | N/A   |
| D          | N/A   | N/A  | N/A  | 45.0% | 34.5% | N/A  | N/A   | N/A   | N/A   |
| C          | N/A   | N/A  | N/A  | N/A   | N/A   | N/A  | 59.0% | 50.0% | 42.0% |

## Monotonicity

### Baseline

- C->E > C->D > C->C: 43.0% >= 34.0% >= 25.5% (OK)
- D->E > D->D: 31.0% >= 21.0% (OK)
- +2 > +1 > 0: 43.0% >= 32.0% >= 22.0% (OK)

### A only

- C->E > C->D > C->C: 58.5% >= 48.0% >= 37.5% (OK)
- D->E > D->D: 44.0% >= 31.0% (OK)
- +2 > +1 > 0: 58.5% >= 45.0% >= 33.0% (OK)

### B only

- C->E > C->D > C->C: 44.0% >= 36.0% >= 29.0% (OK)
- D->E > D->D: 33.0% >= 24.0% (OK)
- +2 > +1 > 0: 44.0% >= 34.0% >= 25.0% (OK)

### A + B

- C->E > C->D > C->C: 59.0% >= 50.0% >= 42.0% (OK)
- D->E > D->D: 45.0% >= 34.5% (OK)
- +2 > +1 > 0: 59.0% >= 47.0% >= 36.0% (OK)

## Template differentiation (+2 appropriate)

### Baseline

| Template           | Median | P10   | P90   |
| ------------------ | ------ | ----- | ----- |
| arcane             | 28.5%  | 11.0% | 48.5% |
| arcane-exploration | 48.0%  | 13.0% | 80.5% |
| assault            | 27.5%  | 4.0%  | 49.5% |
| balanced           | 45.5%  | 25.5% | 76.5% |
| exploration        | 54.5%  | 31.0% | 74.0% |
| ranged             | 49.0%  | 34.5% | 72.0% |
| support-heavy      | 47.5%  | 32.5% | 70.0% |
| versatile          | 43.5%  | 24.5% | 71.0% |

### A only

| Template           | Median | P10   | P90   |
| ------------------ | ------ | ----- | ----- |
| arcane             | 42.0%  | 21.0% | 62.5% |
| arcane-exploration | 65.0%  | 14.5% | 93.5% |
| assault            | 40.5%  | 13.0% | 59.5% |
| balanced           | 59.5%  | 33.0% | 89.0% |
| exploration        | 71.0%  | 39.5% | 86.0% |
| ranged             | 64.5%  | 39.0% | 86.5% |
| support-heavy      | 68.0%  | 38.5% | 86.0% |
| versatile          | 64.0%  | 27.0% | 82.5% |

### B only

| Template           | Median | P10   | P90   |
| ------------------ | ------ | ----- | ----- |
| arcane             | 32.5%  | 11.5% | 49.0% |
| arcane-exploration | 48.0%  | 18.5% | 80.5% |
| assault            | 27.5%  | 4.0%  | 47.5% |
| balanced           | 46.0%  | 27.0% | 76.5% |
| exploration        | 54.5%  | 34.0% | 73.5% |
| ranged             | 49.0%  | 32.5% | 71.5% |
| support-heavy      | 47.0%  | 35.5% | 70.5% |
| versatile          | 44.0%  | 27.5% | 71.0% |

### A + B

| Template           | Median | P10   | P90   |
| ------------------ | ------ | ----- | ----- |
| arcane             | 44.0%  | 24.5% | 62.5% |
| arcane-exploration | 65.0%  | 19.5% | 93.5% |
| assault            | 41.0%  | 13.0% | 59.5% |
| balanced           | 59.5%  | 35.0% | 89.5% |
| exploration        | 71.0%  | 42.5% | 86.0% |
| ranged             | 64.0%  | 41.0% | 86.5% |
| support-heavy      | 68.0%  | 40.0% | 87.0% |
| versatile          | 64.0%  | 30.5% | 82.5% |

## Overshoot check (+2 appropriate)

- Baseline: P10 18.7%, median 43.0%, P90 73.0%, max 92.0%
- A only: P10 27.0%, median 58.5%, P90 86.0%, max 97.0%
- B only: P10 20.0%, median 44.0%, P90 73.0%, max 92.0%
- A + B: P10 28.0%, median 59.0%, P90 86.0%, max 97.0%

## 200-sample known-problem fixtures

### C->E (investigation-monster-signs, assault, scenario 2)

| Phase    | estimatedSuccessRate | completeSuccessRate | failedObjectiveRate | forcedRetreatRate | battleFavorableRate | conditionalBfThenFail |
| -------- | -------------------- | ------------------- | ------------------- | ----------------- | ------------------- | --------------------- |
| baseline | 0.5%                 | 0.5%                | 90.0%               | 1.0%              | 98.5%               | 96.4%                 |
| A+B      | 8.0%                 | 7.5%                | 82.5%               | 1.0%              | 99.0%               | 85.9%                 |

### D->D (investigation-monster-signs, assault, scenario 1)

| Phase    | estimatedSuccessRate | completeSuccessRate | failedObjectiveRate | forcedRetreatRate | battleFavorableRate | conditionalBfThenFail |
| -------- | -------------------- | ------------------- | ------------------- | ----------------- | ------------------- | --------------------- |
| baseline | 0.5%                 | 0.5%                | 64.0%               | 26.0%             | 70.5%               | 99.3%                 |
| A+B      | 0.5%                 | 0.5%                | 79.0%               | 14.5%             | 82.5%               | 99.4%                 |

## Regression diff

Regression scenarios with snapshot changes: 22 / 22

Category counts among changed scenarios:

| Category          | Scenarios |
| ----------------- | --------- |
| partyHp           | 22        |
| partyMp           | 22        |
| partyMorale       | 22        |
| battleState       | 18        |
| objectiveProgress | 6         |
| outcome           | 6         |
| battleOutcome     | 6         |

Outcome changed scenarios: rescue-success, escort-completeSuccess, escort-partialSuccess, survey-completeSuccess, survey-success, survey-failedObjective

## Candidate Pass 2 work

Based on Pass 1 results:

- If elimination same-rank remains below 40%, review `requiredTargetCount` and routed-enemy completion semantics (Lever E).
- If survey still fails mostly because `surveyedSectorCount < totalSectorCount` despite quality, review the all-surveyed gate (Lever D).
- If escort route failures dominate, review `routeDifficulty` / stress progression (Lever D).
- If retrieval `located → secured` drop remains large, review securing difficulty or theft/integrity loss (Lever D).
- If rescue `reached → stabilized` drop remains, review stabilization gate (Lever D).
- Continue to avoid touching Phase 1 battle constants, acceptance weights, rank stat scaling, or campaign mechanics.

## Verification

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm test`: 31 failed / 618 passed (649 total). 23 regression snapshot diffs from balance changes + 8 objective threshold tests calibrated to pre-Pass-1 outcomes.
- Regression baseline intentionally not updated per instruction; diff count captured above.
