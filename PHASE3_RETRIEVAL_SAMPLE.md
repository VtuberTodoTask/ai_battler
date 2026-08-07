# Phase 3.5 回収依頼（retrieval）サンプル

## ケース A: completeSuccess: 対象を無傷で酒場まで回収

- **seed**: s1
- **rank**: S
- **battle**: disabled
- **遠征結果**: completeSuccess
- **targetId**: target-1
- **対象**: 回収対象
- **bulk**: portable
- **handling**: standard
- **fragility**: standard
- **initialIntegrity**: 80
- **minimumAcceptableIntegrity**: 60
- **currentIntegrity**: 80
- **carrierIds**: [S-vanguard-s1-vanguard-0]
- **状態**: located=true, reached=true, secured=true, extracted=true, returned=true
- **進捗**: 100%
- **retrievalTargetAssigned index**: 1
- **retrievalTargetAssigned structured metadata**:
  - targetId: target-1
  - targetName: 回収対象
  - bulk: portable
  - handling: standard
  - fragility: standard
- **主要ログ**:
- preparation: retrievalTargetAssigned / 回収対象「回収対象」の回収依頼を引き受けた
- approach: travel / トール スカイが安全な接近経路を確保した
- contact: retrievalTargetLocated / 事前情報から回収対象の位置は既に判明していた
- contact: retrievalAccess / トール スカイが回収対象のもとへ到達した
- objective: retrievalSecuring / フェイ アイヴィーは回収対象を確保し、運搬可能な状態にした
- return: retrievalCarriersAssigned / 1名を回収対象の運搬担当に指定した
- return: retrievalExtraction / 運搬担当: トール スカイ（vanguard）
- return: travel / トール スカイが帰還経路を見失い、迂回した
- return: retrievalReturned / 回収対象を酒場まで持ち帰った
- **retrieval effects**: retrievalTargetAssigned=1, retrievalIntegrity=80, retrievalInitialIntegrity=80, retrievalMinimumIntegrity=60, retrievalLocated=1, retrievalReached=0, retrievalProgress=15, retrievalLocated=1, retrievalProgress=15, retrievalReached=1, retrievalProgress=30, retrievalSecured=1, retrievalProtectedForTransport=1, retrievalSecuringDamage=0, retrievalIntegrity=80, retrievalProgress=55, retrievalCarrierCount=1, retrievalExtracted=1, retrievalExtractionDamage=0, retrievalIntegrity=80, retrievalProgress=75, retrievalReturned=1, retrievalIntegrity=80, retrievalProgress=100

---

## ケース B: success（搬出損傷あり）: 対象を酒場まで持ち帰ったが一部損傷

- **seed**: s0
- **rank**: C
- **battle**: disabled
- **遠征結果**: success
- **targetId**: target-1
- **対象**: 回収対象
- **bulk**: portable
- **handling**: standard
- **fragility**: standard
- **initialIntegrity**: 80
- **minimumAcceptableIntegrity**: 30
- **currentIntegrity**: 76
- **carrierIds**: [C-vanguard-s0-vanguard-0]
- **状態**: located=true, reached=true, secured=true, extracted=true, returned=true
- **進捗**: 100%
- **retrievalTargetAssigned index**: 1
- **retrievalTargetAssigned structured metadata**:
  - targetId: target-1
  - targetName: 回収対象
  - bulk: portable
  - handling: standard
  - fragility: standard
- **主要ログ**:
- preparation: retrievalTargetAssigned / 回収対象「回収対象」の回収依頼を引き受けた
- approach: travel / マルチナ サンドが安全な接近経路を確保した
- contact: retrievalTargetLocated / 事前情報から回収対象の位置は既に判明していた
- contact: retrievalAccess / マルチナ サンドは回収対象のもとへ到達したが、多少の遅延が生じた
- objective: retrievalSecuring / チェルシー グレイは回収対象を確保し、運搬可能な状態にした
- return: retrievalCarriersAssigned / 1名を回収対象の運搬担当に指定した
- return: retrievalExtraction / 運搬担当: ベル ムーン（vanguard）
- return: travel / マルチナ サンドが経路を確保したが、多少の遅延が発生した
- return: retrievalReturned / 回収対象を酒場まで持ち帰った
- **retrieval effects**: retrievalTargetAssigned=1, retrievalIntegrity=80, retrievalInitialIntegrity=80, retrievalMinimumIntegrity=30, retrievalLocated=1, retrievalReached=0, retrievalProgress=15, retrievalLocated=1, retrievalProgress=15, retrievalReached=1, retrievalProgress=30, retrievalSecured=1, retrievalProtectedForTransport=1, retrievalSecuringDamage=0, retrievalIntegrity=80, retrievalProgress=55, retrievalCarrierCount=1, retrievalDamage=4, retrievalExtracted=1, retrievalExtractionDamage=4, retrievalIntegrity=76, retrievalProgress=75, retrievalReturned=1, retrievalIntegrity=76, retrievalProgress=100

---

## ケース C: quality partial: 搬出は成功したが要求品質を下回った

- **seed**: s0
- **rank**: C
- **battle**: disabled
- **遠征結果**: partialSuccess
- **targetId**: target-1
- **対象**: 回収対象
- **bulk**: portable
- **handling**: standard
- **fragility**: standard
- **initialIntegrity**: 100
- **minimumAcceptableIntegrity**: 98
- **currentIntegrity**: 96
- **carrierIds**: [C-vanguard-s0-vanguard-0]
- **状態**: located=true, reached=true, secured=true, extracted=true, returned=true
- **進捗**: 100%
- **retrievalTargetAssigned index**: 1
- **retrievalTargetAssigned structured metadata**:
  - targetId: target-1
  - targetName: 回収対象
  - bulk: portable
  - handling: standard
  - fragility: standard
- **主要ログ**:
- preparation: retrievalTargetAssigned / 回収対象「回収対象」の回収依頼を引き受けた
- approach: travel / マルチナ サンドが安全な接近経路を確保した
- contact: retrievalTargetLocated / 事前情報から回収対象の位置は既に判明していた
- contact: retrievalAccess / マルチナ サンドは回収対象のもとへ到達したが、多少の遅延が生じた
- objective: retrievalSecuring / チェルシー グレイは回収対象を確保し、運搬可能な状態にした
- return: retrievalCarriersAssigned / 1名を回収対象の運搬担当に指定した
- return: retrievalExtraction / 運搬担当: ベル ムーン（vanguard）
- return: travel / マルチナ サンドが経路を確保したが、多少の遅延が発生した
- return: retrievalReturned / 回収対象を酒場まで持ち帰った
- **retrieval effects**: retrievalTargetAssigned=1, retrievalIntegrity=100, retrievalInitialIntegrity=100, retrievalMinimumIntegrity=98, retrievalLocated=1, retrievalReached=0, retrievalProgress=15, retrievalLocated=1, retrievalProgress=15, retrievalReached=1, retrievalProgress=30, retrievalSecured=1, retrievalProtectedForTransport=1, retrievalSecuringDamage=0, retrievalIntegrity=100, retrievalProgress=55, retrievalCarrierCount=1, retrievalDamage=4, retrievalExtracted=1, retrievalExtractionDamage=4, retrievalIntegrity=96, retrievalProgress=75, retrievalReturned=1, retrievalIntegrity=96, retrievalProgress=100

---

## ケース D: failedObjective: 確保作業で対象が破壊された

- **seed**: s0
- **rank**: C
- **battle**: disabled
- **遠征結果**: failedObjective
- **targetId**: target-1
- **対象**: 回収対象
- **bulk**: portable
- **handling**: standard
- **fragility**: standard
- **initialIntegrity**: 4
- **minimumAcceptableIntegrity**: 1
- **currentIntegrity**: 0
- **carrierIds**: []
- **状態**: located=true, reached=true, secured=false, extracted=false, returned=false
- **進捗**: 30%
- **retrievalTargetAssigned index**: 1
- **retrievalTargetAssigned structured metadata**:
  - targetId: target-1
  - targetName: 回収対象
  - bulk: portable
  - handling: standard
  - fragility: standard
- **主要ログ**:
- preparation: retrievalTargetAssigned / 回収対象「回収対象」の回収依頼を引き受けた
- approach: travel / マルチナ サンドが安全な接近経路を確保した
- contact: retrievalTargetLocated / 事前情報から回収対象の位置は既に判明していた
- contact: retrievalAccess / マルチナ サンドは回収対象のもとへ到達したが、多少の遅延が生じた
- objective: retrievalTargetDestroyed / 回収対象が確保作業の失敗で破壊された
- objective: retrievalSecuring / チェルシー グレイは回収対象を確保したが、4の損傷を受けた
- return: travel / マルチナ サンドが経路を確保したが、多少の遅延が発生した
- **retrieval effects**: retrievalTargetAssigned=1, retrievalIntegrity=4, retrievalInitialIntegrity=4, retrievalMinimumIntegrity=1, retrievalLocated=1, retrievalReached=0, retrievalProgress=15, retrievalLocated=1, retrievalProgress=15, retrievalReached=1, retrievalProgress=30, retrievalIntegrity=0, retrievalDestroyed=1, retrievalDamage=4, retrievalSecured=0, retrievalProtectedForTransport=0, retrievalSecuringDamage=4, retrievalIntegrity=0, retrievalProgress=30

---

## ケース E: forcedRetreat: 戦闘撤退のため回収対象を置き去り

- **seed**: s3
- **rank**: E
- **battle**: enabled
- **遠征結果**: forcedRetreat
- **targetId**: target-1
- **対象**: 回収対象
- **bulk**: portable
- **handling**: standard
- **fragility**: standard
- **initialIntegrity**: 80
- **minimumAcceptableIntegrity**: 60
- **currentIntegrity**: 75
- **carrierIds**: []
- **状態**: located=true, reached=true, secured=false, extracted=false, returned=false
- **進捗**: 30%
- **retrievalTargetAssigned index**: 1
- **retrievalTargetAssigned structured metadata**:
  - targetId: target-1
  - targetName: 回収対象
  - bulk: portable
  - handling: standard
  - fragility: standard
- **主要ログ**:
- preparation: retrievalTargetAssigned / 回収対象「回収対象」の回収依頼を引き受けた
- approach: travel / フェイ ノースが安全な接近経路を確保した
- contact: retrievalTargetLocated / 事前情報から回収対象の位置は既に判明していた
- contact: retrievalAccess / フェイ ノースが回収対象のもとへ到達した
- contact: retrievalProtectorAssigned / フェイ ノース（guardian）が回収対象の保護担当になった
- battle: retrievalBattleExposure / フェイ ノースが回収対象の保護を担当した。戦闘中に回収対象へ5の追加損傷が記録された
- return: travel / フェイ ノースが帰還経路を見失い、迂回した
- **retrieval effects**: retrievalTargetAssigned=1, retrievalIntegrity=80, retrievalInitialIntegrity=80, retrievalMinimumIntegrity=60, retrievalLocated=1, retrievalReached=0, retrievalProgress=15, retrievalLocated=1, retrievalProgress=15, retrievalReached=1, retrievalProgress=30, retrievalProtector=1, retrievalDamage=5, retrievalIntegrity=75, retrievalBattleExposureDamage=5, retrievalProgress=30
