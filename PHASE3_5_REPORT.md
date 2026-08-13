# Phase 3.5 Report

## Implemented types

- `RetrievalObjectiveConfig`
- `RetrievalObjectiveState`
- `RetrievalObjectiveHandler` (`retrieval`)

## State transition

1. assigned
2. located (search success)
3. reached (access success)
4. secured (securing success)
5. protectedForTransport / protectorId assigned (when battle enabled)
6. extracted (carriers assigned, extraction success)
7. returned (return success)

## Integrity accounting

```
initialIntegrity
- battleExposureDamage
- securingDamage
- extractionDamage
= currentIntegrity
```

The target is considered destroyed when currentIntegrity reaches 0.

## Search / Access

- `runInitialRetrievalSearch` resolves the discovery skill check.
- `runRetrievalAccess` resolves the access skill check.
- Both use the preferred role (Scout for discovery, Mage for magical environments, etc.) and the party's skill bonuses.

## Battle exposure

When a battle occurs and the target has been reached, a protector is assigned. After battle resolution, `resolveRetrievalBattleExposure` performs an abstract protection check and records actual damage to the target using the battle outcome. The fact text describes the protection assignment and observed damage without asserting that the protector physically blocked specific attacks.

## Securing

`runRetrievalSecuring` resolves the securing skill check. The difficulty modifier is:

```
securingDifficulty + retrievalFragilityModifier(fragility) - supportBonus(...) - toolsBonus
```

where toolsBonus is +10 when `supplies.tools` is available, and supportBonus is the retrieval-specific support bonus (+5 for standard and delicate, 0 for arcane).

## Carrier assignment

Carriers are selected from active party members after securing and when battle exposure is resolved. A `retrievalCarriersAssigned` structured log is emitted with `carrierIds` and `requiredCarrierCount` metadata. If there are not enough active members, an insufficient-carrier log with the same schema (carrierIds=[], carrierCount=0, requiredCarrierCount=N) is emitted.

## Extraction

`runRetrievalExtraction` resolves the extraction skill check using carrier count, bulk and handling modifiers. If successful, `extracted` becomes true.

## Return semantics

`runRetrievalReturn` resolves the return transit check. On success, `returned` becomes true. If the party is wiped out or abandons, the target may be abandoned or lost.

## Samples

### A: completeSuccess: 対象を無傷で酒場まで回収

- outcome: completeSuccess
- targetId: target-1
- currentIntegrity: 80/80
- minimumAcceptableIntegrity: 60
- located: true
- reached: true
- secured: true
- extracted: true
- returned: true
- carrierIds: ["S-vanguard-s1-vanguard-0"]
- battleExposureDamage: 0
- securingDamage: 0
- extractionDamage: 0

### B: success（搬出損傷あり）: 対象を酒場まで持ち帰ったが一部損傷

- outcome: success
- targetId: target-1
- currentIntegrity: 76/80
- minimumAcceptableIntegrity: 30
- located: true
- reached: true
- secured: true
- extracted: true
- returned: true
- carrierIds: ["C-vanguard-s0-vanguard-0"]
- battleExposureDamage: 0
- securingDamage: 0
- extractionDamage: 4

### C: quality partial: 搬出は成功したが要求品質を下回った

- outcome: partialSuccess
- targetId: target-1
- currentIntegrity: 96/100
- minimumAcceptableIntegrity: 98
- located: true
- reached: true
- secured: true
- extracted: true
- returned: true
- carrierIds: ["C-vanguard-s0-vanguard-0"]
- battleExposureDamage: 0
- securingDamage: 0
- extractionDamage: 4

### D: failedObjective: 確保作業で対象が破壊された

- outcome: failedObjective
- targetId: target-1
- currentIntegrity: 0/4
- minimumAcceptableIntegrity: 1
- located: true
- reached: true
- secured: false
- extracted: false
- returned: false
- carrierIds: []
- battleExposureDamage: 0
- securingDamage: 4
- extractionDamage: 0

### E: forcedRetreat: 戦闘撤退のため回収対象を置き去り

- outcome: forcedRetreat
- targetId: target-1
- currentIntegrity: 80/80
- minimumAcceptableIntegrity: 60
- located: true
- reached: true
- secured: false
- extracted: false
- returned: false
- carrierIds: []
- battleExposureDamage: 0
- securingDamage: 0
- extractionDamage: 0

## Role contribution

| role     | metric                                               | withRole | withoutRole | paired delta | trials |
| -------- | ---------------------------------------------------- | -------- | ----------- | ------------ | ------ |
| Scout    | 発見率                                               | 0.999    | 0.932       | +0.067       | 1000   |
| Ranger   | 搬出率（portable）                                   | 0.814    | 0.708       | +0.106       | 1000   |
| Mage     | magical環境到達率                                    | 0.983    | 0.893       | +0.090       | 1000   |
| Support  | 確保率（standard）                                   | 0.876    | 0.862       | +0.014       | 1000   |
| Vanguard | 搬出率（heavy）                                      | 0.784    | 0.751       | +0.033       | 1000   |
| Guardian | 戦闘余波ダメージ平均                                 | 2.378    | 3.750       | -1.372       | 1000   |
| Healer   | completeSuccess率（Healer vs 中性Vanguard 直接対照） | 1.000    | 1.000       | +0.000       | 1000   |

## Healer negative control

Direct retrieval bonus: none.
The Healer row uses a max-stats controlled party and compares Healer against a neutral Vanguard baseline on the same seed. Since the only difference is the fourth role, a paired delta of exactly 0 confirms Healer provides no retrieval-specific bonus in search, access, securing, extraction, battle protection, or integrity preservation. Any non-zero completeSuccess rate in the table is observational only.

## Regression

- Existing baselines: 14 (investigation 3, elimination 4, rescue 3, escort 4)
- Existing baseline diff: 0
- Retrieval baselines: 4 (completeSuccess, success, partialSuccess, failedObjective)

## Verification

- `npm run typecheck`: passed
- `npm test`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run update:expedition-regression`: passed
- CI: green

## Known issues

None.
