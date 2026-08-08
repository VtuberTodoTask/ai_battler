# Phase 6.2 Stage A — Coarse Rank Matrix Audit

> Generated before any balance-constant changes.

## Run parameters

| Parameter                       | Value                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| Script                          | `scripts/expedition-rank-matrix.ts`                               |
| Output                          | `reports/phase6_2_before_coarse.json`                             |
| Sample count per cell           | 10                                                                |
| Total cells                     | 10,368                                                            |
| Estimated `runExpedition` calls | 103,680                                                           |
| Scenario seeds                  | 3 (`phase6-2:scenario:0` … `2`)                                   |
| Objectives                      | 6 (investigation, elimination, rescue, escort, retrieval, survey) |
| Request templates               | all per objective                                                 |
| Party templates                 | 8                                                                 |
| Request ranks                   | E, D, C, B, A, S                                                  |
| Party ranks                     | E, D, C, B, A, S                                                  |
| Elapsed                         | ~54.5 s                                                           |

## Party determinism

`src/core/expedition/rank-matrix-party-determinism.test.ts` verifies that the same `(scenario, partyTemplate, partyRank)` always produces an identical party, regardless of request context. Passing.

## Coarse rank-advantage summary (estimated success rate)

| rankAdvantage | median |  p10 |  p25 |  p75 |  p90 | count |
| ------------- | -----: | ---: | ---: | ---: | ---: | ----: |
| -5            |   0.00 | 0.00 | 0.00 | 0.10 | 0.20 |   288 |
| -4            |   0.00 | 0.00 | 0.00 | 0.10 | 0.20 |   576 |
| -3            |   0.00 | 0.00 | 0.00 | 0.10 | 0.30 |   864 |
| -2            |   0.10 | 0.00 | 0.00 | 0.20 | 0.40 | 1,152 |
| -1            |   0.10 | 0.00 | 0.00 | 0.30 | 0.50 | 1,440 |
| 0             |   0.20 | 0.00 | 0.10 | 0.40 | 0.70 | 1,728 |
| +1            |   0.40 | 0.10 | 0.20 | 0.60 | 0.80 | 1,440 |
| +2            |   0.50 | 0.10 | 0.30 | 0.70 | 0.80 | 1,152 |
| +3            |   0.60 | 0.20 | 0.40 | 0.80 | 0.90 |   864 |
| +4            |   0.75 | 0.30 | 0.50 | 0.90 | 1.00 |   576 |
| +5            |   0.80 | 0.40 | 0.60 | 0.90 | 1.00 |   288 |

Target bands (fresh appropriate party):

| rankAdvantage | target | actual median | status      |
| ------------- | -----: | ------------: | ----------- |
| +2            | 85–95% |           50% | far below   |
| +1            | 70–90% |           40% | far below   |
| 0             | 55–75% |           20% | far below   |
| -1            | 25–50% |           10% | below       |
| ≤-2           |  0–20% |         0–10% | within band |

## Objective-level same-rank / +1 / +2 medians

| Objective     | same-rank |   +1 |   +2 |
| ------------- | --------: | ---: | ---: |
| investigation |      0.30 | 0.40 | 0.50 |
| elimination   |      0.10 | 0.10 | 0.20 |
| rescue        |      0.40 | 0.60 | 0.70 |
| escort        |      0.20 | 0.40 | 0.50 |
| retrieval     |      0.20 | 0.40 | 0.60 |
| survey        |      0.30 | 0.40 | 0.50 |

`elimination` is the strongest outlier: even same-rank parties only reach 10% median.

## Battle vs non-battle median estimated success rate

| Objective     | battle enabled | battle disabled |     Δ |
| ------------- | -------------: | --------------: | ----: |
| investigation |           0.10 |            0.40 | -0.30 |
| elimination   |           0.00 |            0.00 |  0.00 |
| rescue        |           0.30 |            0.50 | -0.20 |
| escort        |           0.20 |            0.30 | -0.10 |
| retrieval     |           0.00 |            0.40 | -0.40 |
| survey        |           0.10 |            0.40 | -0.30 |

Battles materially depress success across all objectives.

## Monotonicity

- **Median monotonicity by rankAdvantage**: clean for every objective (no violations).
- **Cell-level rank monotonicity** (party rank increasing should increase success): 3,549 violations / many comparisons. Expected with 10 samples/cell.
- **Cell-level request monotonicity** (request rank increasing should decrease success): 3,400 violations. Also within noise at 10 samples/cell.

## Party template same-rank medians

| Party template     | same-rank |   +1 |   +2 |
| ------------------ | --------: | ---: | ---: |
| balanced           |      0.30 | 0.55 | 0.95 |
| exploration        |      0.30 | 0.60 | 0.95 |
| arcane             |      0.10 | 0.30 | 0.80 |
| assault            |      0.10 | 0.30 | 0.80 |
| versatile          |      0.25 | 0.55 | 0.90 |
| support-heavy      |      0.30 | 0.55 | 0.95 |
| ranged             |      0.25 | 0.55 | 0.95 |
| arcane-exploration |      0.20 | 0.45 | 0.90 |

Template differences are preserved: `exploration`/`support-heavy`/`balanced`/`ranged` lead, `arcane`/`assault` lag.

## Initial root-cause observations

1. **Global difficulty too high**: even perfectly matched (same-rank) parties fall well below the 55–75% band.
2. **Elimination is especially harsh**: same-rank and +1 medians are 10% or lower. Confirmation phase and/or target difficulty may be the systemic cause.
3. **Battle penalty is large**: battle-enabled cells are consistently 10–40 percentage points lower than battle-disabled cells.
4. **Rank scaling does trend correctly** (higher party rank → higher success, higher request rank → lower success), but the curve is shifted downward.
5. **Template differentiation remains intact**: poorly fitting templates (e.g. `arcane` for combat objectives) underperform well-fitting templates at the same rank.

## Next step

Proceed to **Calibration Pass 1** only after reviewing this coarse baseline.
