# Phase 3.6 Report

## Implemented types

- `SurveyObjectiveConfig`
- `SurveyObjectiveState`
- `SurveyObjectiveHandler` (`survey`)

## State transition

1. area assigned
2. sector 1 surveyed (before battle)
3. optional battle
4. sector 2/3 surveyed (objective phase, skipped after forced battle retreat)
5. report prepared (before return)
6. report returned / lost (after return)
7. completion determined (aftermath)

## Quality and coverage accounting

- Quality per sector: criticalSuccess=100, success=80, partialSuccess=55, failure=0, criticalFailure=0
- Coverage: surveyed count / 3 * 100
- Average quality: over surveyed sectors only
- Progress: 25 per surveyed sector + 25 if report returned

## Sector flow

- Sector 1 runs in `beforeBattle`
- Sectors 2/3 run in `runObjective`
- Each sector uses a dedicated RNG seed: `${request.seed}:survey:sector:${sectorId}`

## Support / tools bonus

- Active Support: +5 effective skill to all sectors
- Tools (supplies.tools >= 1): +10 effective skill
- Tools consumed only on criticalSuccess/success/partialSuccess

## Outcome priority

1. `lostExpedition`
2. `completeSuccess`
3. `success`
4. `partialSuccess`
5. `forcedRetreat`
6. `failedObjective`

## Samples

### A: completeSuccess: 全3区画を高品質で測量し酒場まで報告

- outcome: completeSuccess
- areaId: area-1
- areaName: 測量地域
- minimumAcceptableQuality: 70
- coveragePercent: 100.00%
- averageQuality: 86.67
- reportPrepared: true
- reportReturned: true
- reportLostDuringReturn: false
- progress: 100%
- sectors:
- 北区画 (route): surveyed=true, quality=80, result=success
- 中央区画 (terrain): surveyed=true, quality=100, result=criticalSuccess
- 南区画 (arcane): surveyed=true, quality=80, result=success

### B: success: 全3区画を測量し報告したがcomplete閾値には至らない

- outcome: success
- areaId: area-1
- areaName: 測量地域
- minimumAcceptableQuality: 70
- coveragePercent: 100.00%
- averageQuality: 71.67
- reportPrepared: true
- reportReturned: true
- reportLostDuringReturn: false
- progress: 100%
- sectors:
- 北区画 (route): surveyed=true, quality=80, result=success
- 中央区画 (terrain): surveyed=true, quality=55, result=partialSuccess
- 南区画 (arcane): surveyed=true, quality=80, result=success

### C: partialSuccess: 2区画の測量記録を持ち帰ったが1区画の測量に失敗した

- outcome: partialSuccess
- areaId: area-1
- areaName: 測量地域
- minimumAcceptableQuality: 70
- coveragePercent: 66.67%
- averageQuality: 100.00
- reportPrepared: true
- reportReturned: true
- reportLostDuringReturn: false
- progress: 75%
- sectors:
- 北区画 (route): surveyed=true, quality=100, result=criticalSuccess
- 中央区画 (terrain): surveyed=false, quality=0, result=failure
- 南区画 (arcane): surveyed=true, quality=100, result=criticalSuccess

### D: failedObjective: 全ての区画で測量に失敗し報告も作成できない

- outcome: failedObjective
- areaId: area-1
- areaName: 測量地域
- minimumAcceptableQuality: 70
- coveragePercent: 0.00%
- averageQuality: 0.00
- reportPrepared: false
- reportReturned: false
- reportLostDuringReturn: false
- progress: 0%
- sectors:
- 北区画 (route): surveyed=false, quality=0, result=failure
- 中央区画 (terrain): surveyed=false, quality=0, result=failure
- 南区画 (arcane): surveyed=false, quality=0, result=failure

### E: forcedRetreat: 最初の区画は測量できたが、戦闘から撤退したため残りの測量を中止。取得済みの測量記録だけを持ち帰った

- outcome: forcedRetreat
- areaId: area-1
- areaName: 測量地域
- minimumAcceptableQuality: 70
- coveragePercent: 33.33%
- averageQuality: 100.00
- reportPrepared: true
- reportReturned: true
- reportLostDuringReturn: false
- progress: 50%
- sectors:
- 北区画 (route): surveyed=true, quality=100, result=criticalSuccess
- 中央区画 (terrain): surveyed=false, quality=0, result=none
- 南区画 (arcane): surveyed=false, quality=0, result=none

## Role contribution

| role     | metric                                         | withRole | withoutRole | paired delta | trials |
| -------- | ---------------------------------------------- | -------- | ----------- | ------------ | ------ |
| Scout    | 平均quality（route/hazard主体）                | 76.992   | 64.341      | +12.651      | 1000   |
| Ranger   | 平均quality（terrain主体）                     | 71.727   | 69.737      | +1.991       | 1000   |
| Mage     | 平均quality（arcane主体）                      | 77.092   | 72.790      | +4.302       | 1000   |
| Support  | 平均quality（mixed: route/terrain/arcane）     | 74.941   | 73.712      | +1.229       | 1000   |
| Vanguard | 平均quality（mixed: route/terrain/arcane）     | 76.301   | 76.381      | -0.080       | 1000   |
| Guardian | 平均quality（mixed: route/terrain/arcane）     | 75.944   | 75.933      | +0.011       | 1000   |
| Healer   | 平均quality（Healer vs 中性Vanguard 直接対照） | 82.375   | 82.375      | +0.000       | 1000   |

## Healer negative control

Direct survey bonus: none.
The Healer row uses a max-stats controlled party and compares Healer against a neutral Vanguard baseline on the same seed. Since the only difference is the fourth role, a paired delta of exactly 0 confirms Healer provides no survey-specific bonus in any sector focus.

## Regression

- Existing baselines: 18 (investigation 3, elimination 4, rescue 3, escort 4, retrieval 4)
- Escort regression fixture seeds were adjusted so that scenario name suffixes match their actual outcomes; the new outcome-name guard in Phase 3.6.1 revealed the prior mismatch (escort-completeSuccess, escort-success, and escort-partialSuccess did not match their captured outcomes).
- Survey baselines: 4 (completeSuccess, success, partialSuccess, failedObjective)
- All regression scenario names now match their captured outcomes.

## Verification

- `npm run typecheck`: passed
- `npm test`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run update:expedition-regression`: passed
- CI: green

## Known issues

None.
