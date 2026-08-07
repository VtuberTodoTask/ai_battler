# Phase 3.4 護衛依頼（escort）サンプル出力

escort 依頼で最大1回の戦闘を発生させ、護衛対象の同行・移動・保護・治療・引き渡し・帰還を分離した決定論的シミュレーション結果。

## A. 完全護衛成功

- 依頼等級: C
- 環境: forest
- 護衛対象名: 護衛対象
- 目的地: 目的地
- 初期HP: 40
- 最終HP: 38
- 移動能力: mobile
- 移動ストレス: 0
- 同行状態: 分離済み
- 行動調整: 済み
- 移動進捗: 100%
- 目的地到達: 到達
- 保護担当: アリス クォーツ（guardian）
- 引き渡し状態: completed
- 治療実施: あり
- 治療回復量: 8
- 戦闘結果: costlyVictory（13ラウンド）
- 敵編成: constructx7
- 戦闘被害: 10
- 移動被害: 0
- 出発地点へ帰還: なし
- 置き去り: なし
- 進捗: 100%
- 遠征結果: completeSuccess
- 冒険者生存者: レイラ クロム（vanguard）, アリス クォーツ（guardian）, トール ノース（mage）, ナナリー クロム（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- レイラ クロム（vanguard） HP=70/70, MP=4/4, 士気=33
- アリス クォーツ（guardian） HP=73/73, MP=6/6, 士気=59
- トール ノース（mage） HP=53/53, MP=46/46, 士気=59
- ナナリー クロム（healer） HP=50/50, MP=46/46, 士気=58

### 2. 戦闘直前

- レイラ クロム（vanguard） HP=70/70, MP=4/4, 士気=31
- アリス クォーツ（guardian） HP=73/73, MP=6/6, 士気=60
- トール ノース（mage） HP=53/53, MP=46/46, 士気=57
- ナナリー クロム（healer） HP=50/50, MP=46/46, 士気=56

### 3. 戦闘直後

- レイラ クロム（vanguard） HP=0/70, MP=4/4, 士気=31
- アリス クォーツ（guardian） HP=28/73, MP=6/6, 士気=50
- トール ノース（mage） HP=53/53, MP=1/46, 士気=47
- ナナリー クロム（healer） HP=50/50, MP=43/46, 士気=46

### 4. 帰還後

- レイラ クロム（vanguard） HP=18/70, MP=4/4, 士気=36
- アリス クォーツ（guardian） HP=46/73, MP=6/6, 士気=55
- トール ノース（mage） HP=53/53, MP=1/46, 士気=52
- ナナリー クロム（healer） HP=50/50, MP=43/46, 士気=51

### 構造化facts

- type=escortDeparture
  - ナナリー クロムが護衛対象との行動を調整した
  - effect: escortCoordinated=1
  - effect: escortStress=0
  - effect: escortTargetHp=40
- type=escortRouteProgress
  - アリス クォーツが移動経路を切り開いた
  - effect: escortRouteProgress=50
  - effect: escortTargetHp=40
  - effect: escortStress=0
- type=escortProtectorAssigned
  - アリス クォーツ（guardian）が護衛対象の保護担当になった
  - effect: escortProtectorAssigned=1, targetId=C-guardian-s6-guardian-1
  - effect: escortTargetHp=40
- type=battleSummary
  - 戦闘が13ラウンドでcostlyVictoryとなった
  - 接敵結果: greatSuccess
  - 戦闘負傷者: C-vanguard-s6-vanguard-0
- type=escortBattleExposure
  - アリス クォーツが護衛対象の保護を担当した
  - 護衛対象が戦闘の余波で10のダメージを負った
  - effect: escortBattleExposureDamage=10
  - effect: escortTargetHp=30
  - effect: escortStress=10
- type=escortCare
  - 医薬品を1消費した
  - ナナリー クロムが護衛対象の傷を手当てした
  - effect: supplyConsume=1, targetId=medicine
  - effect: escortCareHealing=8
  - effect: escortTargetHp=38
- type=escortRouteProgress
  - アリス クォーツが移動経路を素早く切り開いた
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=38
  - effect: escortStress=0
- type=escortDestinationReached
  - 護衛対象は目的地へ到着した
  - effect: escortDestinationReached=1
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=38
- type=escortHandoff
  - ナナリー クロムが目的地で引き渡しを完了した
  - effect: escortHandoffStatus=2
  - effect: escortDelivered=1
  - effect: escortTargetHp=38
- type=summary
  - 護衛対象は出発済み・行動調整済み・移動進捗100%・目的地到達・引き渡し完了。護衛進捗は100%
  - 医薬品を2消費した
  - ナナリー クロムが負傷者の治療を行った
  - effect: moraleChange=5

## B. 護衛成功だが対象が負傷

- 依頼等級: C
- 環境: forest
- 護衛対象名: 護衛対象
- 目的地: 目的地
- 初期HP: 40
- 最終HP: 22
- 移動能力: mobile
- 移動ストレス: 30
- 同行状態: 分離済み
- 行動調整: 済み
- 移動進捗: 100%
- 目的地到達: 到達
- 保護担当: ロイド リーフ（guardian）
- 引き渡し状態: completed
- 治療実施: なし
- 治療回復量: 0
- 戦闘結果: retreat（16ラウンド）
- 敵編成: humanoidx7
- 戦闘被害: 18
- 移動被害: 0
- 出発地点へ帰還: なし
- 置き去り: なし
- 進捗: 100%
- 遠征結果: success
- 冒険者生存者: ガルド ドラグナー（vanguard）, ロイド リーフ（guardian）
- 戦闘不能者: なし
- 死亡者: ユリ グレイ, オルム スカイ

### 1. 遠征開始時

- ガルド ドラグナー（vanguard） HP=68/68, MP=12/12, 士気=35
- ロイド リーフ（guardian） HP=73/73, MP=8/8, 士気=62
- ユリ グレイ（mage） HP=50/50, MP=42/42, 士気=56
- オルム スカイ（healer） HP=68/68, MP=43/43, 士気=56

### 2. 戦闘直前

- ガルド ドラグナー（vanguard） HP=68/68, MP=12/12, 士気=30
- ロイド リーフ（guardian） HP=69/73, MP=8/8, 士気=60
- ユリ グレイ（mage） HP=50/50, MP=42/42, 士気=51
- オルム スカイ（healer） HP=62/68, MP=43/43, 士気=51

### 3. 戦闘直後

- ガルド ドラグナー（vanguard） HP=29/68, MP=12/12, 士気=0, 状態異常=[guarded(1)]
- ロイド リーフ（guardian） HP=69/73, MP=8/8, 士気=30, 状態異常=[guarded(1)]
- ユリ グレイ（mage） HP=0/50, MP=32/42, 士気=51
- オルム スカイ（healer） HP=0/68, MP=40/43, 士気=41, 状態異常=[guarded(1)]

### 4. 帰還後

- ガルド ドラグナー（vanguard） HP=28/68, MP=12/12, 士気=5, 状態異常=[guarded(1)]
- ロイド リーフ（guardian） HP=69/73, MP=8/8, 士気=22, 状態異常=[guarded(1)]
- ユリ グレイ（mage） HP=0/50, MP=32/42, 士気=51
- オルム スカイ（healer） HP=0/68, MP=40/43, 士気=41, 状態異常=[guarded(1)]

### 構造化facts

- type=escortDeparture
  - オルム スカイが護衛対象との行動を調整した
  - effect: escortCoordinated=1
  - effect: escortStress=0
  - effect: escortTargetHp=40
- type=escortRouteProgress
  - ロイド リーフが移動経路を素早く切り開いた
  - effect: escortRouteProgress=50
  - effect: escortTargetHp=40
  - effect: escortStress=0
- type=escortProtectorAssigned
  - ロイド リーフ（guardian）が護衛対象の保護担当になった
  - effect: escortProtectorAssigned=1, targetId=C-guardian-s80-guardian-1
  - effect: escortTargetHp=40
- type=battleSummary
  - 戦闘が16ラウンドでretreatとなった
  - 接敵結果: failure
  - 戦闘で死亡者: C-mage-s80-mage-2, C-healer-s80-healer-3
- type=escortBattleExposure
  - ロイド リーフが護衛対象の保護を担当した
  - 護衛対象が戦闘の余波で18のダメージを負った
  - effect: escortBattleExposureDamage=18
  - effect: escortTargetHp=22
  - effect: escortStress=20
- type=escortCare
  - ガルド ドラグナーは護衛対象の手当てに失敗した
  - effect: escortCareHealing=0
  - effect: escortTargetHp=22
- type=escortRouteProgress
  - ロイド リーフは移動経路を何とか進んだが、護衛対象に負担がかかった
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=22
  - effect: escortStress=30
- type=escortDestinationReached
  - 護衛対象は目的地へ到着した
  - effect: escortDestinationReached=1
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=22
- type=escortHandoff
  - ガルド ドラグナーが目的地で引き渡しを完了した
  - effect: escortHandoffStatus=2
  - effect: escortDelivered=1
  - effect: escortTargetHp=22
- type=summary
  - 犠牲者: C-mage-s80-mage-2, C-healer-s80-healer-3
  - 護衛対象は出発済み・行動調整済み・移動進捗100%・目的地到達・引き渡し完了。護衛進捗は100%
  - effect: moraleChange=-10
  - effect: moraleChange=5

## C. 目的地到達だが引き渡し保留

- 依頼等級: C
- 環境: forest
- 護衛対象名: 護衛対象
- 目的地: 目的地
- 初期HP: 40
- 最終HP: 30
- 移動能力: mobile
- 移動ストレス: 20
- 同行状態: 分離済み
- 行動調整: 未調整
- 移動進捗: 100%
- 目的地到達: 到達
- 保護担当: リナ スカイ（guardian）
- 引き渡し状態: pending
- 治療実施: あり
- 治療回復量: 8
- 戦闘結果: victory（8ラウンド）
- 敵編成: beastx4
- 戦闘被害: 18
- 移動被害: 0
- 出発地点へ帰還: なし
- 置き去り: なし
- 進捗: 80%
- 遠征結果: partialSuccess
- 冒険者生存者: ヴァン ピーク（vanguard）, リナ スカイ（guardian）, フェイ ヴァレス（mage）, シエラ ピーク（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- ヴァン ピーク（vanguard） HP=73/73, MP=9/9, 士気=48
- リナ スカイ（guardian） HP=72/72, MP=6/6, 士気=49
- フェイ ヴァレス（mage） HP=56/56, MP=45/45, 士気=53
- シエラ ピーク（healer） HP=50/50, MP=44/44, 士気=41

### 2. 戦闘直前

- ヴァン ピーク（vanguard） HP=73/73, MP=9/9, 士気=46
- リナ スカイ（guardian） HP=71/72, MP=6/6, 士気=47
- フェイ ヴァレス（mage） HP=56/56, MP=45/45, 士気=51
- シエラ ピーク（healer） HP=50/50, MP=44/44, 士気=39

### 3. 戦闘直後

- ヴァン ピーク（vanguard） HP=73/73, MP=9/9, 士気=46, 状態異常=[guarded(1)]
- リナ スカイ（guardian） HP=71/72, MP=6/6, 士気=47, 状態異常=[guarded(1)]
- フェイ ヴァレス（mage） HP=49/56, MP=10/45, 士気=51
- シエラ ピーク（healer） HP=50/50, MP=38/44, 士気=39

### 4. 帰還後

- ヴァン ピーク（vanguard） HP=73/73, MP=9/9, 士気=49, 状態異常=[guarded(1)]
- リナ スカイ（guardian） HP=72/72, MP=6/6, 士気=53, 状態異常=[guarded(1)]
- フェイ ヴァレス（mage） HP=56/56, MP=10/45, 士気=54
- シエラ ピーク（healer） HP=50/50, MP=38/44, 士気=42

### 構造化facts

- type=escortDeparture
  - シエラ ピークは護衛対象との行動調整に失敗した
  - effect: escortCoordinated=0
  - effect: escortStress=15
  - effect: escortTargetHp=40
- type=escortRouteProgress
  - リナ スカイは移動経路を何とか進んだが、護衛対象に負担がかかった
  - effect: escortRouteProgress=50
  - effect: escortTargetHp=40
  - effect: escortStress=25
- type=escortProtectorAssigned
  - リナ スカイ（guardian）が護衛対象の保護担当になった
  - effect: escortProtectorAssigned=1, targetId=C-guardian-s9-guardian-1
  - effect: escortTargetHp=40
- type=battleSummary
  - 戦闘が8ラウンドでvictoryとなった
  - 接敵結果: failure
- type=escortBattleExposure
  - リナ スカイが護衛対象の保護を担当した
  - 護衛対象が戦闘の余波で18のダメージを負った
  - effect: escortBattleExposureDamage=18
  - effect: escortTargetHp=22
  - effect: escortStress=30
- type=escortCare
  - 医薬品を1消費した
  - シエラ ピークが護衛対象の傷を手当てした
  - effect: supplyConsume=1, targetId=medicine
  - effect: escortCareHealing=8
  - effect: escortTargetHp=30
- type=escortRouteProgress
  - リナ スカイが移動経路を素早く切り開いた
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=30
  - effect: escortStress=20
- type=escortDestinationReached
  - 護衛対象は目的地へ到着した
  - effect: escortDestinationReached=1
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=30
- type=escortHandoff
  - シエラ ピークは目的地へ到着したが、正式な引き渡し手続きが保留となった
  - effect: escortHandoffStatus=1
  - effect: escortDelivered=0
  - effect: escortTargetHp=30
- type=summary
  - 護衛対象は出発済み・移動進捗100%・目的地到達・引き渡し保留。護衛進捗は80%
  - 医薬品を2消費した
  - シエラ ピークが負傷者の治療を行った
  - effect: moraleChange=3

## D. 護衛失敗（対象を出発地点へ連れ戻した）

- 依頼等級: C
- 環境: forest
- 護衛対象名: 護衛対象
- 目的地: 目的地
- 初期HP: 40
- 最終HP: 40
- 移動能力: mobile
- 移動ストレス: 25
- 同行状態: 分離済み
- 行動調整: 済み
- 移動進捗: 75%
- 目的地到達: 未到達
- 保護担当: オルム アイヴィー（guardian）
- 引き渡し状態: notStarted
- 治療実施: あり
- 治療回復量: 4
- 戦闘結果: victory（8ラウンド）
- 敵編成: insectx4
- 戦闘被害: 0
- 移動被害: 4
- 出発地点へ帰還: 帰還済み
- 置き去り: なし
- 進捗: 60%
- 遠征結果: failedObjective
- 冒険者生存者: トール スカイ（vanguard）, オルム アイヴィー（guardian）, フェイ アイヴィー（mage）, レイラ ノース（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=56
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=60
- フェイ アイヴィー（mage） HP=47/47, MP=43/43, 士気=59
- レイラ ノース（healer） HP=66/66, MP=42/42, 士気=53

### 2. 戦闘直前

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=52
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=56
- フェイ アイヴィー（mage） HP=47/47, MP=43/43, 士気=55
- レイラ ノース（healer） HP=65/66, MP=42/42, 士気=49

### 3. 戦闘直後

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=52, 状態異常=[guarded(1)]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=56, 状態異常=[guarded(1)]
- フェイ アイヴィー（mage） HP=33/47, MP=3/43, 士気=55
- レイラ ノース（healer） HP=65/66, MP=39/42, 士気=49

### 4. 帰還後

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=55, 状態異常=[guarded(1)]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=59, 状態異常=[guarded(1)]
- フェイ アイヴィー（mage） HP=40/47, MP=3/43, 士気=58
- レイラ ノース（healer） HP=66/66, MP=39/42, 士気=52

### 構造化facts

- type=escortDeparture
  - レイラ ノースが護衛対象との行動を何とか調整した
  - effect: escortCoordinated=1
  - effect: escortStress=0
  - effect: escortTargetHp=40
- type=escortRouteProgress
  - トール スカイは移動経路で迷い、護衛対象が怪我をした
  - effect: escortRouteProgress=25
  - effect: escortTargetHp=36
  - effect: escortStress=20
  - effect: escortTargetDamage=4
- type=escortProtectorAssigned
  - オルム アイヴィー（guardian）が護衛対象の保護担当になった
  - effect: escortProtectorAssigned=1, targetId=C-guardian-s1-guardian-1
  - effect: escortTargetHp=36
- type=battleSummary
  - 戦闘が8ラウンドでvictoryとなった
  - 接敵結果: failure
- type=escortBattleExposure
  - オルム アイヴィーが護衛対象の保護を担当した
  - 戦闘中、護衛対象への追加被害は発生しなかった
  - effect: escortBattleExposureDamage=0
  - effect: escortTargetHp=36
  - effect: escortStress=25
- type=escortCare
  - 医薬品を1消費した
  - レイラ ノースが護衛対象の傷を手当てした
  - effect: supplyConsume=1, targetId=medicine
  - effect: escortCareHealing=4
  - effect: escortTargetHp=40
- type=escortRouteProgress
  - トール スカイが移動経路を切り開いた
  - effect: escortRouteProgress=75
  - effect: escortTargetHp=40
  - effect: escortStress=25
- type=escortReturnResult
  - 護衛任務は完了しなかったが、護衛対象は出発地点まで連れ戻された
  - effect: escortReturnedToOrigin=1
  - effect: escortTargetHp=40
- type=summary
  - 護衛対象は出発済み・行動調整済み・移動進捗75%・出発地点へ帰還。護衛進捗は60%
  - 医薬品を2消費した
  - レイラ ノースが負傷者の治療を行った
  - effect: moraleChange=3

## E. 戦闘撤退後も護衛成功

- 依頼等級: C
- 環境: forest
- 護衛対象名: 護衛対象
- 目的地: 目的地
- 初期HP: 40
- 最終HP: 40
- 移動能力: mobile
- 移動ストレス: 45
- 同行状態: 分離済み
- 行動調整: 未調整
- 移動進捗: 100%
- 目的地到達: 到達
- 保護担当: グスタフ フォレスト（guardian）
- 引き渡し状態: completed
- 治療実施: なし
- 治療回復量: 0
- 戦闘結果: retreat（1ラウンド）
- 敵編成: humanoidx4
- 戦闘被害: 0
- 移動被害: 0
- 出発地点へ帰還: なし
- 置き去り: なし
- 進捗: 100%
- 遠征結果: completeSuccess
- 冒険者生存者: ガルド ハインド（vanguard）, グスタフ フォレスト（guardian）, ユリ ヴァレス（mage）, ベル クロム（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- ガルド ハインド（vanguard） HP=68/68, MP=7/7, 士気=46
- グスタフ フォレスト（guardian） HP=71/71, MP=14/14, 士気=50
- ユリ ヴァレス（mage） HP=50/50, MP=43/43, 士気=43
- ベル クロム（healer） HP=53/53, MP=43/43, 士気=54

### 2. 戦闘直前

- ガルド ハインド（vanguard） HP=68/68, MP=7/7, 士気=39
- グスタフ フォレスト（guardian） HP=71/71, MP=14/14, 士気=43
- ユリ ヴァレス（mage） HP=41/50, MP=43/43, 士気=36
- ベル クロム（healer） HP=53/53, MP=43/43, 士気=47

### 3. 戦闘直後

- ガルド ハインド（vanguard） HP=68/68, MP=7/7, 士気=39
- グスタフ フォレスト（guardian） HP=71/71, MP=14/14, 士気=43
- ユリ ヴァレス（mage） HP=41/50, MP=43/43, 士気=36
- ベル クロム（healer） HP=53/53, MP=43/43, 士気=47

### 4. 帰還後

- ガルド ハインド（vanguard） HP=68/68, MP=7/7, 士気=44
- グスタフ フォレスト（guardian） HP=71/71, MP=14/14, 士気=48
- ユリ ヴァレス（mage） HP=41/50, MP=43/43, 士気=41
- ベル クロム（healer） HP=53/53, MP=43/43, 士気=52

### 構造化facts

- type=escortDeparture
  - ベル クロムは護衛対象との行動調整に大きく失敗した
  - effect: escortCoordinated=0
  - effect: escortStress=25
  - effect: escortTargetHp=40
- type=escortRouteProgress
  - グスタフ フォレストが移動経路を素早く切り開いた
  - effect: escortRouteProgress=50
  - effect: escortTargetHp=40
  - effect: escortStress=15
- type=escortProtectorAssigned
  - グスタフ フォレスト（guardian）が護衛対象の保護担当になった
  - effect: escortProtectorAssigned=1, targetId=C-guardian-s21-guardian-1
  - effect: escortTargetHp=40
- type=battleSummary
  - 戦闘が1ラウンドでretreatとなった
  - 接敵結果: failure
- type=escortBattleExposure
  - グスタフ フォレストが護衛対象の保護を担当した
  - 戦闘中、護衛対象への追加被害は発生しなかった
  - effect: escortBattleExposureDamage=0
  - effect: escortTargetHp=40
  - effect: escortStress=35
- type=escortRouteProgress
  - グスタフ フォレストは移動経路を何とか進んだが、護衛対象に負担がかかった
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=40
  - effect: escortStress=45
- type=escortDestinationReached
  - 護衛対象は目的地へ到着した
  - effect: escortDestinationReached=1
  - effect: escortRouteProgress=100
  - effect: escortTargetHp=40
- type=escortHandoff
  - ベル クロムが目的地で引き渡しを完了した
  - effect: escortHandoffStatus=2
  - effect: escortDelivered=1
  - effect: escortTargetHp=40
- type=summary
  - 護衛対象は出発済み・移動進捗100%・目的地到達・引き渡し完了。護衛進捗は100%
  - 治療は不十分だった
  - effect: moraleChange=5
