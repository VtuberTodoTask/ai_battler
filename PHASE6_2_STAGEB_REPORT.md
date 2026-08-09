# Phase 6.2 Stage B：Early-rank Deep Audit Report

**Date:** 2026-08-08
**Branch:** `devin/phase6-2-rank-calibration`
**Balance-constant changes:** 0

## 1. Method

- Target rank pairs (party → request): `E→E`, `D→E`, `D→D`, `C→E`, `C→D`, `C→C`.
- Coverage: all 6 Objective types, all request templates, all 8 party templates, 3 scenario seeds.
- Samples per cell: **100**.
- Paired battle ablation: for each optional-battle objective (`investigation`, `rescue`, `escort`, `retrieval`, `survey`), the same `(request, party, seed)` was run with battle forced off and compared to the default battle-enabled case.
- Party determinism: each `(scenarioSeed, partyTemplate, partyRank)` reused the same deterministic party for every request condition.
- Raw data: `reports/phase6_2_before_early_rank_deep.json`.

## 2. Workload / runtime

| Metric                                          | Value    |
| ----------------------------------------------- | -------- |
| Total cells                                     | 1,728    |
| Samples per cell                                | 100      |
| Estimated `runExpedition` calls (with ablation) | ~316,800 |
| Actual runtime                                  | ~95.4 s  |
| Output file size                                | ~5.8 MB  |

## 3. Top-line success rates (estimated = completeSuccess + success)

### 3.1 By rank pair (all cells)

| Pair | Median | Mean  | P10   | P25   | P75   | P90   |
| ---- | ------ | ----- | ----- | ----- | ----- | ----- |
| E→E  | 0.190  | 0.214 | 0.030 | 0.110 | 0.310 | 0.440 |
| D→E  | 0.310  | 0.331 | 0.110 | 0.220 | 0.440 | 0.580 |
| D→D  | 0.210  | 0.248 | 0.070 | 0.120 | 0.340 | 0.510 |
| C→E  | 0.430  | 0.445 | 0.180 | 0.300 | 0.600 | 0.730 |
| C→D  | 0.340  | 0.359 | 0.110 | 0.190 | 0.510 | 0.650 |
| C→C  | 0.250  | 0.271 | 0.050 | 0.110 | 0.400 | 0.540 |

### 3.2 By rank pair, `accepted` + `appropriate` only

| Pair | n   | Median | P10   | P25   | P75   | P90   |
| ---- | --- | ------ | ----- | ----- | ----- | ----- |
| E→E  | 276 | 0.190  | 0.040 | 0.120 | 0.310 | 0.440 |
| D→E  | 288 | 0.310  | 0.110 | 0.220 | 0.440 | 0.580 |
| D→D  | 276 | 0.210  | 0.080 | 0.130 | 0.360 | 0.510 |
| C→E  | 288 | 0.430  | 0.180 | 0.300 | 0.600 | 0.730 |
| C→D  | 288 | 0.340  | 0.110 | 0.190 | 0.510 | 0.650 |
| C→C  | 276 | 0.260  | 0.060 | 0.120 | 0.410 | 0.550 |

### 3.3 Same-rank appropriate, by objective

| Objective     | Median | P10   | P25   |
| ------------- | ------ | ----- | ----- |
| investigation | 0.260  | 0.060 | 0.130 |
| elimination   | 0.120  | 0.020 | 0.070 |
| rescue        | 0.330  | 0.170 | 0.240 |
| escort        | 0.170  | 0.090 | 0.130 |
| retrieval     | 0.250  | 0.020 | 0.060 |
| survey        | 0.300  | 0.080 | 0.170 |

### 3.4 +1 / +2 appropriate, by objective

| Objective     | +1 Median | +1 P10 | +1 P25 | +2 Median | +2 P10 | +2 P25 |
| ------------- | --------- | ------ | ------ | --------- | ------ | ------ |
| investigation | 0.350     | 0.020  | 0.240  | 0.480     | 0.110  | 0.380  |
| elimination   | 0.230     | 0.070  | 0.150  | 0.320     | 0.130  | 0.260  |
| rescue        | 0.510     | 0.310  | 0.360  | 0.560     | 0.350  | 0.460  |
| escort        | 0.240     | 0.140  | 0.190  | 0.340     | 0.240  | 0.280  |
| retrieval     | 0.390     | 0.050  | 0.130  | 0.550     | 0.100  | 0.220  |
| survey        | 0.380     | 0.160  | 0.260  | 0.470     | 0.200  | 0.360  |

**Target bands (fresh, appropriate party):**

- same-rank (0): 55–75%
- +1: 70–90%
- +2: 85–95%

Every median in Stage B is below target; same-rank appropriate medians range 12–33%.

## 4. Objective × rank pair estimated success rate (median)

| Objective     | E→E   | D→E   | D→D   | C→E   | C→D   | C→C   |
| ------------- | ----- | ----- | ----- | ----- | ----- | ----- |
| investigation | 0.225 | 0.345 | 0.165 | 0.480 | 0.350 | 0.330 |
| elimination   | 0.150 | 0.270 | 0.140 | 0.315 | 0.185 | 0.095 |
| rescue        | 0.270 | 0.430 | 0.325 | 0.555 | 0.530 | 0.425 |
| escort        | 0.140 | 0.220 | 0.160 | 0.335 | 0.270 | 0.215 |
| retrieval     | 0.255 | 0.355 | 0.270 | 0.550 | 0.470 | 0.235 |
| survey        | 0.240 | 0.350 | 0.325 | 0.470 | 0.400 | 0.235 |

## 5. Outcome breakdown (mean rate per rank pair)

| Pair | completeSuccess | success | partialSuccess | failedObjective | forcedRetreat | lostExpedition |
| ---- | --------------- | ------- | -------------- | --------------- | ------------- | -------------- |
| E→E  | 0.136           | 0.079   | 0.141          | 0.425           | 0.214         | 0.005          |
| D→E  | 0.232           | 0.100   | 0.171          | 0.377           | 0.117         | 0.003          |
| D→D  | 0.155           | 0.093   | 0.157          | 0.343           | 0.238         | 0.014          |
| C→E  | 0.321           | 0.123   | 0.171          | 0.298           | 0.086         | 0.001          |
| C→D  | 0.239           | 0.120   | 0.173          | 0.298           | 0.166         | 0.005          |
| C→C  | 0.169           | 0.103   | 0.141          | 0.290           | 0.293         | 0.005          |

### 5.1 Outcome breakdown by objective

| Objective     | completeSuccess | success | partialSuccess | failedObjective | forcedRetreat | lostExpedition |
| ------------- | --------------- | ------- | -------------- | --------------- | ------------- | -------------- |
| investigation | 0.303           | 0.021   | 0.081          | 0.401           | 0.164         | 0.030          |
| elimination   | 0.186           | 0.009   | 0.414          | 0.025           | 0.365         | 0.001          |
| rescue        | 0.316           | 0.112   | 0.000          | 0.440           | 0.132         | 0.000          |
| escort        | 0.176           | 0.057   | 0.075          | 0.501           | 0.191         | 0.001          |
| retrieval     | 0.176           | 0.151   | 0.001          | 0.542           | 0.128         | 0.000          |
| survey        | 0.094           | 0.267   | 0.384          | 0.122           | 0.133         | 0.000          |

- `elimination` produces a large partialSuccess rate; the party often defeats some targets but not all.
- `escort` / `retrieval` / `rescue` are dominated by `failedObjective`, not by forced retreat.
- `survey` has the highest partialSuccess rate because coverage/quality often fall short of the strict completion threshold.

## 6. Objective progress (mean per rank pair)

| Pair | investigation | elimination | rescue | escort | retrieval | survey |
| ---- | ------------- | ----------- | ------ | ------ | --------- | ------ |
| E→E  | 36.7          | 39.1        | 43.5   | 61.7   | 39.9      | 70.0   |
| D→E  | 49.4          | 57.4        | 57.0   | 67.4   | 50.0      | 77.9   |
| D→D  | 34.1          | 43.4        | 48.7   | 64.1   | 43.6      | 77.2   |
| C→E  | 60.1          | 63.7        | 68.1   | 74.1   | 61.9      | 83.5   |
| C→D  | 46.8          | 52.5        | 62.1   | 70.2   | 55.3      | 82.4   |
| C→C  | 44.0          | 40.1        | 53.2   | 66.5   | 44.5      | 70.7   |

Progress is monotonic with party rank for the same request rank, but the absolute level is low for many objectives.

## 7. Battle diagnosis

### 7.1 Battle occurrence and conditional outcome distribution

| Pair | occurred | cond_favorable | victory | costlyVictory | partialVictory | retreat | defeat | stalemate |
| ---- | -------- | -------------- | ------- | ------------- | -------------- | ------- | ------ | --------- |
| E→E  | 0.417    | 0.420          | 0.367   | 0.013         | 0.040          | 0.484   | 0.005  | 0.091     |
| D→E  | 0.417    | 0.668          | 0.606   | 0.017         | 0.046          | 0.265   | 0.001  | 0.066     |
| D→D  | 0.528    | 0.463          | 0.411   | 0.014         | 0.038          | 0.407   | 0.006  | 0.124     |
| C→E  | 0.417    | 0.753          | 0.698   | 0.010         | 0.045          | 0.222   | 0.000  | 0.025     |
| C→D  | 0.528    | 0.608          | 0.543   | 0.018         | 0.048          | 0.319   | 0.001  | 0.072     |
| C→C  | 0.639    | 0.452          | 0.404   | 0.012         | 0.035          | 0.433   | 0.003  | 0.113     |

`cond_favorable` = (victory + costlyVictory + partialVictory) / battles that actually occurred.

### 7.2 Battle outcome distribution by objective

| Objective     | battles | victory | costly | partial | retreat | defeat | stalemate | cond_fav |
| ------------- | ------- | ------- | ------ | ------- | ------- | ------ | --------- | -------- |
| investigation | 12,800  | 0.480   | 0.014  | 0.039   | 0.370   | 0.003  | 0.094     | 0.534    |
| elimination   | 28,800  | 0.517   | 0.015  | 0.045   | 0.354   | 0.003  | 0.067     | 0.577    |
| rescue        | 10,400  | 0.477   | 0.013  | 0.038   | 0.378   | 0.002  | 0.092     | 0.528    |
| escort        | 16,000  | 0.477   | 0.013  | 0.042   | 0.364   | 0.004  | 0.101     | 0.531    |
| retrieval     | 8,000   | 0.481   | 0.015  | 0.041   | 0.369   | 0.004  | 0.091     | 0.536    |
| survey        | 8,800   | 0.513   | 0.014  | 0.038   | 0.342   | 0.002  | 0.092     | 0.565    |

### 7.3 Battle favorable → expedition failure

| Pair | P(battle favorable) | P(expedition failure | battle favorable) |
|------|---------------------|-------------------------------------------|
| E→E | 0.175 | 0.368 |
| D→E | 0.279 | 0.290 |
| D→D | 0.244 | 0.446 |
| C→E | 0.314 | 0.229 |
| C→D | 0.321 | 0.353 |
| C→C | 0.289 | 0.431 |

| Objective | P(favorable) | P(failure | favorable) |
|-----------|----------------|--------------------------|
| investigation | 0.237 | 0.542 |
| elimination | 0.577 | 0.043 |
| rescue | 0.191 | 0.492 |
| escort | 0.295 | 0.654 |
| retrieval | 0.149 | 0.642 |
| survey | 0.173 | 0.162 |

Interpretation: when an actual battle ends favorably, `elimination` almost always converts. For `escort`, `retrieval`, `rescue`, and `investigation`, a favorable battle still leaves a 50–65% chance of overall failure, so the non-battle objective stages are the dominant bottleneck.

### 7.4 Pre / post battle HP totals

| Pair | pre-battle HP | final HP | avg casualties | avg incapacitated |
| ---- | ------------- | -------- | -------------- | ----------------- |
| E→E  | 206.7         | 194.6    | 0.048          | 0.028             |
| D→E  | 223.2         | 211.8    | 0.028          | 0.025             |
| D→D  | 222.8         | 203.3    | 0.067          | 0.057             |
| C→E  | 240.8         | 231.0    | 0.009          | 0.013             |
| C→D  | 240.3         | 222.4    | 0.034          | 0.040             |
| C→C  | 239.8         | 215.5    | 0.058          | 0.072             |

HP attrition from pre-battle to final state is modest (typically <10%). Post-battle attrition is not the dominant failure driver.

## 8. Paired battle ablation

For each optional-battle objective, the same `(request, party, seed)` was run with `battle.enabled = false` and compared to the default.

| Objective     | cells | enabled mean | disabled mean | Δ mean | Δ median |
| ------------- | ----- | ------------ | ------------- | ------ | -------- |
| investigation | 288   | 0.324        | 0.419         | -0.095 | 0.000    |
| rescue        | 288   | 0.428        | 0.458         | -0.030 | 0.000    |
| escort        | 288   | 0.233        | 0.247         | -0.015 | 0.000    |
| retrieval     | 288   | 0.328        | 0.379         | -0.051 | -0.000   |
| survey        | 288   | 0.361        | 0.417         | -0.056 | 0.000    |

Negative Δ means disabling battle improves success. The effect is largest for `investigation` (up to -0.15 at D→D / C→C) and `retrieval` / `survey`. The median Δ is 0 because many cells already had battle disabled by `battleChance`; for cells where a battle was actually toggled, the penalty is clear. This confirms optional battles are currently over-tuned relative to the objective reward they provide.

## 9. Elimination failure decomposition

Decomposition over 288 elimination cells (100 samples each):

| Category                                              | Evidence rule                                                                   | Cells |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| A. Battle itself unwinnable                           | `battleFavorableRate < 0.5`                                                     | 108   |
| B. Battle favorable but required targets not defeated | `battleFavorableRate ≥ 0.5` and `defeatedCount.mean < requiredTargetCount.mean` | 180   |
| C. Targets defeated but confirmation failed           | —                                                                               | 0     |
| D. Forced retreat dominant                            | —                                                                               | 0     |
| E. Other                                              | —                                                                               | 0     |

Elimination is almost entirely dominated by **B**: the party survives the battle but does not kill all required targets, yielding `partialSuccess` or `forcedRetreat`.

### 9.1 Elimination per rank pair

| Pair | completed | defeated | surviving | escaped | forcedRetreat | failed |
| ---- | --------- | -------- | --------- | ------- | ------------- | ------ |
| E→E  | 0.137     | 1.51     | 2.03      | 0.45    | 0.496         | 0.021  |
| D→E  | 0.252     | 2.22     | 1.08      | 0.70    | 0.264         | 0.025  |
| D→D  | 0.140     | 1.68     | 1.78      | 0.54    | 0.434         | 0.021  |
| C→E  | 0.314     | 2.46     | 0.82      | 0.72    | 0.203         | 0.023  |
| C→D  | 0.203     | 2.03     | 1.33      | 0.64    | 0.330         | 0.016  |
| C→C  | 0.127     | 1.54     | 1.91      | 0.55    | 0.464         | 0.044  |

Required target count is always 4. Even at C→E only 2.46 are defeated on average. This is a DPS / target-count / retreat threshold issue, not a survival issue.

## 10. Other 5 objectives failure decomposition

All Stage B cells included. Each row is a failure-stage share among the same-rank appropriate cells (or all cells when noted).

### 10.1 Rescue

| Failure stage                                    | Share |
| ------------------------------------------------ | ----- |
| Discovery failure (not located)                  | 15.5% |
| Access failure (located → not reached)           | 23.7% |
| Stabilization failure (reached → not stabilized) | 14.6% |
| Evacuation failure (stabilized → not evacuated)  | 3.4%  |
| Return failure (evacuated → not returned)        | 0.0%  |
| Abandoned                                        | 18.0% |

Rescue loses the most samples between **located** and **reached**, and again between **reached** and **stabilized**.

### 10.2 Escort

| Failure stage                                            | Share |
| -------------------------------------------------------- | ----- |
| Route failure (not destinationReached)                   | 60.3% |
| Handoff / delivery failure (destination → not delivered) | 16.5% |
| Stranded                                                 | ~0%   |

Escort is dominated by the route/stress stage; `routeProgress` averages 78% but only ~40% actually reach the destination.

### 10.3 Retrieval

| Failure stage                                | Share |
| -------------------------------------------- | ----- |
| Discovery failure (not located)              | 18.9% |
| Securing failure (located → not secured)     | 31.9% |
| Extraction failure (secured → not extracted) | 16.3% |
| Return failure (extracted → not returned)    | 0.0%  |
| Abandoned                                    | 16.3% |

Retrieval loses the most samples between **located** and **secured**.

### 10.4 Survey

| Metric                          | Value      |
| ------------------------------- | ---------- |
| reportPrepared / reportReturned | 96.4%      |
| coveragePercent                 | 70.5%      |
| averageQuality                  | 74.6%      |
| minimumAcceptableQuality        | 70.0       |
| surveyedSectorCount             | 2.11 / 3.0 |
| objectiveCompleted              | 36.1%      |

`reportReturned` is very high, but `objectiveCompleted` is only 36% because completion requires **all sectors surveyed** plus `averageQuality >= minimumAcceptableQuality`. The average coverage is ~70% (2.1 of 3 sectors), so the `allSurveyed` gate is the main bottleneck.

### 10.5 Investigation

| Metric                   | Value |
| ------------------------ | ----- |
| objectiveCompleted       | 32.6% |
| objectiveProgress        | 45.2% |
| completeInformationCount | 0.85  |
| discoveredThreatsCount   | 1.60  |

Investigation is a single skill check after optional exploration. `objectiveCompleted = progress >= 60`. The success rate is low because the effective skill value is reduced by multiple stacked penalties (`difficultyBasePenalty`, rank penalty, feature penalty, and an extra +10 when progress < 40).

## 11. Rank scaling diagnosis

Comparing `E→E`, `D→E`, `C→E` for the same request rank `E` isolates the effect of raising party rank.

| Metric                       | E→E   | D→E   | C→E   | Monotonic?               |
| ---------------------------- | ----- | ----- | ----- | ------------------------ |
| estimatedSuccessRate median  | 0.190 | 0.310 | 0.430 | Yes                      |
| battleOccurred               | 0.417 | 0.417 | 0.417 | Flat (same battleChance) |
| conditional battle favorable | 0.420 | 0.668 | 0.753 | Yes                      |
| avg objectiveProgress        | 48.5  | 59.9  | 68.6  | Yes                      |
| forcedRetreat rate           | 0.214 | 0.117 | 0.086 | Yes                      |
| failedObjective rate         | 0.425 | 0.377 | 0.298 | Yes                      |

Rank is working in the right direction, but the absolute level is too low:

- Even a **+2 C→E** party only reaches ~43% median success (target 85–95%).
- The conditional battle favorable rate rises from 42% to 75%, but objective completion does not follow proportionally because the non-battle objective stages remain hard.

## 12. Request difficulty diagnosis

### 12.1 D party across request ranks

| Pair | estimatedSuccessRate median |
| ---- | --------------------------- |
| D→E  | 0.310                       |
| D→D  | 0.210                       |

### 12.2 C party across request ranks

| Pair | estimatedSuccessRate median |
| ---- | --------------------------- |
| C→E  | 0.430                       |
| C→D  | 0.340                       |
| C→C  | 0.250                       |

Request difficulty is monotonic with request rank for a fixed party rank. The gap between `C→E` and `C→C` is 18 percentage points, which is reasonable, but the base `C→C` is far below the 55–75% target.

## 13. Comparison to Phase 1 battle baseline

Phase 1 normal standard party reported `favorable` rates around **55–80%**. Stage B same-rank conditional favorable rates are much lower:

| Pair | Stage B cond_fav | Phase 1 normal standard (approx) |
| ---- | ---------------- | -------------------------------- |
| E→E  | 0.420            | 0.64                             |
| D→D  | 0.463            | 0.63                             |
| C→C  | 0.452            | 0.58                             |

Key condition differences between Phase 1 and expedition battles:

1. **Encounter scaling**: Phase 1 `generateEncounter` uses `calculatePartyThreat(party)`; expedition `battleIntegration.ts` uses `ADVENTURER_THREAT[request.rank] * partySize`.
2. **Battle start state**: Phase 1 starts fresh; expedition battles occur after `preparation`, `approach`, and `exploration` with accumulated HP/MP/morale attrition and possible disadvantageous contact.
3. **Encounter shape**: Phase 1 `standard` tests used fixed-shape fixed-rank parties; expedition randomizes shape/elite/swarm/boss.
4. **Party composition**: Phase 1 standard used `vanguard/ranger/mage/healer`; expedition party templates include non-combat roles (`scout`, `guardian`, `support`) and no fixed ranged DPS.
5. **Intel / weakness**: Phase 1 tests had no intel dependency; expedition can miss matched weakness/ability intel.
6. **Environment effects**: expedition passes `lighting`, `noise`, `water`, `smoke` into battle context.
7. **Retreat thresholds**: expedition uses morale/HP thresholds and `enemyThreat >= partyThreat * 2` triggers; Phase 1 had different proposal/retreat dynamics.

## 14. Calibration lever candidates

No constants changed in Stage B. The following are candidates for Calibration Pass 1, with evidence for/against.

### A. Common expedition skill-check scaling (`checks.ts`)

- **For**: every non-battle objective relies on `resolveSkillCheck`. Multiple stacked penalties (`difficultyBasePenalty=10`, `rankPenalty`, feature penalty, +10 on low progress) push effective values below 40 for E/C parties, causing high failure and partialSuccess rates.
- **Against**: lowering difficulty too much flattens party composition and role differences.
- **Affected objectives**: all six, especially `investigation`, `rescue`, `retrieval`.
- **Expected side effects**: higher same-rank success, but `completeSuccess` may still be gated by casualty/morale thresholds.

### B. Expedition battle encounter scaling (`battleIntegration.ts`)

- **For**: `requestPartyThreat = ADVENTURER_THREAT[request.rank] * partySize` decouples enemy power from actual party rank. Switching to `calculatePartyThreat(party)` would make over-rank parties face stronger enemies and under-rank parties face weaker ones. However, same-rank remains identical, so it does not fix `C→C`.
- **Against**: over-rank `C→E` would become harder if party threat is used; request-rank scaling intentionally makes higher-party-rank runs easier.
- **Affected objectives**: `elimination` primarily; others via optional battles.
- **Expected side effects**: needs pairing with `DIFFICULTY_BUDGET_MULTIPLIER` or encounter shape adjustments to avoid over-correcting.

### C. Post-battle attrition / retreat interaction (`battle.ts`, `morale.ts`)

- **For**: `forcedRetreat` is 12–29% across pairs and is a major `elimination` / `escort` outcome. Retreat thresholds (`enemyThreat >= partyThreat * 2`, low morale, low HP) trigger before all enemies are killed.
- **Against**: retreats are an intended risk expression; removing them would remove tactical trade-offs.
- **Affected objectives**: `elimination` (partialSuccess instead of complete), `escort`, `rescue`.
- **Expected side effects**: higher completion but possibly more casualties.

### D. Objective-specific difficulty gates

- **For**: objective-specific data show clear bottlenecks (rescue `located→reached`, retrieval `located→secured`, escort route, survey `allSurveyed`, investigation single-check difficulty).
- **Against**: per-objective tuning is more work and risks over-fitting one template.
- **Affected objectives**: all non-elimination objectives.
- **Expected side effects**: may require updating `objectiveCompleted` thresholds and `determineXOutcome` completeSuccess thresholds together.

### E. Elimination-specific completion semantics

- **For**: `requiredTargetCount` is always 4 but average defeated is 1.5–2.5. Lowering required targets or treating "defeated + enemies routed" as success would raise completion.
- **Against**: may undermine "eliminate all enemies" semantics.
- **Affected objectives**: `elimination`.
- **Expected side effects**: more `completeSuccess`, less `partialSuccess`.

### F. Adventurer rank stat scaling / skill base values

- **For**: E/C parties have low effective skill values after penalties. Raising base skills or rank bonuses would lift all objectives and battles.
- **Against**: global stat buffs compress party-template and role differentiation.
- **Affected objectives**: all.
- **Expected side effects**: battle favorable rates also rise, changing Phase 1 balance if constants are shared.

## 15. Stopping condition

- Stage B report created.
- Raw matrix saved to `reports/phase6_2_before_early_rank_deep.json`.
- No balance constants, battle constants, or expedition constants were modified.
- Awaiting review before Calibration Pass 1.
