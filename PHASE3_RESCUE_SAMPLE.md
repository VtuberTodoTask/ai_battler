# Phase 3.3 救出依頼（rescue）サンプル出力

rescue 依頼で最大1回の戦闘を発生させ、救出対象の発見・接近・安定化・搬出・帰還を分離した決定論的シミュレーション結果。

## A. 完全救出

- 依頼等級: C
- 環境: forest
- 救出対象名: 救出対象
- 初期HP: 40
- 最終HP: 40
- 移動能力: mobile
- 発見状態: 発見済み
- 到達状態: 到達済み
- 安定化状態: 安定化済み
- 保護担当: フェイ ドラグナー（guardian）
- 戦闘結果: victory（9ラウンド）
- 敵編成: insectx4
- 戦闘被害: 0
- 搬出状態: 搬出済み
- 帰還状態: 帰還済み
- 置き去り状態: なし
- 進捗: 100%
- 遠征結果: completeSuccess
- 冒険者生存者: ハロルド ピーク（vanguard）, フェイ ドラグナー（guardian）, アメリア アイヴィー（mage）, ソフィア オーシャン（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- ハロルド ピーク（vanguard） HP=72/72, MP=16/16, 士気=57
- フェイ ドラグナー（guardian） HP=74/74, MP=1/1, 士気=40
- アメリア アイヴィー（mage） HP=54/54, MP=45/45, 士気=44
- ソフィア オーシャン（healer） HP=53/53, MP=42/42, 士気=58

### 2. 戦闘直前

- ハロルド ピーク（vanguard） HP=72/72, MP=16/16, 士気=55
- フェイ ドラグナー（guardian） HP=74/74, MP=1/1, 士気=38
- アメリア アイヴィー（mage） HP=54/54, MP=45/45, 士気=42
- ソフィア オーシャン（healer） HP=53/53, MP=42/42, 士気=56

### 3. 戦闘直後

- ハロルド ピーク（vanguard） HP=64/72, MP=16/16, 士気=55
- フェイ ドラグナー（guardian） HP=74/74, MP=1/1, 士気=38
- アメリア アイヴィー（mage） HP=54/54, MP=5/45, 士気=42
- ソフィア オーシャン（healer） HP=53/53, MP=30/42, 士気=56

### 4. 帰還後

- ハロルド ピーク（vanguard） HP=72/72, MP=16/16, 士気=58
- フェイ ドラグナー（guardian） HP=74/74, MP=1/1, 士気=41
- アメリア アイヴィー（mage） HP=54/54, MP=5/45, 士気=45
- ソフィア オーシャン（healer） HP=53/53, MP=30/42, 士気=59

### 構造化facts

- type=rescueSearch
  - アメリア アイヴィーが救出対象の位置をぎりぎりで特定した
  - effect: rescueLocated=1
  - effect: rescueProgress=20
- type=rescueProtectorAssigned
  - フェイ ドラグナー（guardian）が救出対象の保護担当になった
  - effect: rescueProtector=1, targetId=C-guardian-s2-guardian-1
- type=battleSummary
  - 戦闘が9ラウンドでvictoryとなった
  - 接敵結果: failure
- type=rescueBattleExposure
  - フェイ ドラグナーが救出対象を戦闘から守り切った
  - effect: rescueTargetDamage=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=40
- type=rescueStabilization
  - ソフィア オーシャンが救出対象を安定化した
  - 医薬品を1消費した
  - effect: supplyConsume=1, targetId=medicine
  - effect: rescueStabilized=1
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=rescueEvacuation
  - フェイ ドラグナーが救出対象を危険地帯から搬出した
  - effect: rescueEvacuated=1
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=80
- type=rescueReturn
  - 救出対象を拠点まで連れ帰った
  - effect: rescueReturned=1
  - effect: rescueAbandoned=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=100
- type=summary
  - 救出対象は発見済み・接近済み・安定化済み・搬出済み・帰還済み。救出進捗は100%
  - 医薬品を2消費した
  - ソフィア オーシャンが負傷者の治療を行った
  - effect: moraleChange=5

## B. 救出成功だが損害大

- 依頼等級: C
- 環境: forest
- 救出対象名: 救出対象
- 初期HP: 40
- 最終HP: 40
- 移動能力: mobile
- 発見状態: 発見済み
- 到達状態: 到達済み
- 安定化状態: 安定化済み
- 保護担当: なし
- 戦闘結果: costlyVictory（7ラウンド）
- 敵編成: aberrationx6
- 戦闘被害: 0
- 搬出状態: 搬出済み
- 帰還状態: 帰還済み
- 置き去り状態: なし
- 進捗: 100%
- 遠征結果: success
- 冒険者生存者: ロイド ピーク（vanguard）, ルーカス グレイ（guardian）, ユリ ノース（healer）
- 戦闘不能者: なし
- 死亡者: ジーク ノース

### 1. 遠征開始時

- ロイド ピーク（vanguard） HP=66/66, MP=19/19, 士気=45
- ルーカス グレイ（guardian） HP=78/78, MP=19/19, 士気=49
- ジーク ノース（mage） HP=52/52, MP=43/43, 士気=57
- ユリ ノース（healer） HP=63/63, MP=44/44, 士気=56

### 2. 戦闘直前

- ロイド ピーク（vanguard） HP=66/66, MP=19/19, 士気=38
- ルーカス グレイ（guardian） HP=78/78, MP=19/19, 士気=42
- ジーク ノース（mage） HP=52/52, MP=43/43, 士気=50
- ユリ ノース（healer） HP=63/63, MP=44/44, 士気=49

### 3. 戦闘直後

- ロイド ピーク（vanguard） HP=19/66, MP=19/19, 士気=28
- ルーカス グレイ（guardian） HP=78/78, MP=19/19, 士気=32
- ジーク ノース（mage） HP=0/52, MP=23/43, 士気=50
- ユリ ノース（healer） HP=3/63, MP=44/44, 士気=49

### 4. 帰還後

- ロイド ピーク（vanguard） HP=32/66, MP=19/19, 士気=23
- ルーカス グレイ（guardian） HP=78/78, MP=19/19, 士気=27
- ジーク ノース（mage） HP=0/52, MP=23/43, 士気=50
- ユリ ノース（healer） HP=16/63, MP=44/44, 士気=44

### 構造化facts

- type=rescueSearch
  - ジーク ノースが救出対象の位置を特定した
  - effect: rescueLocated=1
  - effect: rescueProgress=20
- type=battleSummary
  - 戦闘が7ラウンドでcostlyVictoryとなった
  - 接敵結果: success
  - 戦闘で死亡者: C-mage-s195-mage-2
  - 戦闘中に弱点を発見: discoverer=C-mage-s195-mage-2,enemy=B-aberration-ambusher-standard-s195:battle:0:encounter:enemy:2,weakness=magic,name=魔術
- type=rescueStabilization
  - ユリ ノースが救出対象を一時的に安定化させた
  - effect: rescueStabilized=1
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=rescueEvacuation
  - ルーカス グレイが救出対象を危険地帯から搬出した
  - effect: rescueEvacuated=1
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=80
- type=rescueReturn
  - 救出対象を拠点まで連れ帰った
  - effect: rescueReturned=1
  - effect: rescueAbandoned=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=100
- type=summary
  - 犠牲者: C-mage-s195-mage-2
  - 救出対象は発見済み・接近済み・安定化済み・搬出済み・帰還済み。救出進捗は100%
  - 医薬品を2消費した
  - ユリ ノースが負傷者の治療を行った
  - effect: moraleChange=-10
  - effect: moraleChange=5

## C. 危険地帯から搬出したが未帰還

- 依頼等級: C
- 環境: forest
- 救出対象名: 救出対象
- 初期HP: 40
- 最終HP: 34
- 移動能力: mobile
- 発見状態: 発見済み
- 到達状態: 到達済み
- 安定化状態: 未安定化
- 保護担当: ミレイ サンド（guardian）
- 戦闘結果: retreat（3ラウンド）
- 敵編成: insectx4
- 戦闘被害: 4
- 搬出状態: 搬出済み
- 帰還状態: 未帰還
- 置き去り状態: なし
- 進捗: 60%
- 遠征結果: partialSuccess
- 冒険者生存者: オルム クレスト（vanguard）, ミレイ サンド（guardian）, グスタフ クォーツ（mage）, ゴウ スカイ（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- オルム クレスト（vanguard） HP=72/72, MP=6/6, 士気=46
- ミレイ サンド（guardian） HP=72/72, MP=6/6, 士気=69
- グスタフ クォーツ（mage） HP=67/67, MP=43/43, 士気=38
- ゴウ スカイ（healer） HP=50/50, MP=43/43, 士気=61

### 2. 戦闘直前

- オルム クレスト（vanguard） HP=72/72, MP=6/6, 士気=41
- ミレイ サンド（guardian） HP=72/72, MP=6/6, 士気=64
- グスタフ クォーツ（mage） HP=67/67, MP=43/43, 士気=33
- ゴウ スカイ（healer） HP=45/50, MP=43/43, 士気=56

### 3. 戦闘直後

- オルム クレスト（vanguard） HP=67/72, MP=6/6, 士気=41, 状態異常=[guarded(1)]
- ミレイ サンド（guardian） HP=69/72, MP=6/6, 士気=64, 状態異常=[guarded(1)]
- グスタフ クォーツ（mage） HP=52/67, MP=33/43, 士気=33
- ゴウ スカイ（healer） HP=43/50, MP=40/43, 士気=56

### 4. 帰還後

- オルム クレスト（vanguard） HP=72/72, MP=6/6, 士気=44, 状態異常=[guarded(1)]
- ミレイ サンド（guardian） HP=72/72, MP=6/6, 士気=67, 状態異常=[guarded(1)]
- グスタフ クォーツ（mage） HP=65/67, MP=33/43, 士気=36
- ゴウ スカイ（healer） HP=50/50, MP=40/43, 士気=59

### 構造化facts

- type=rescueSearch
  - グスタフ クォーツが救出対象の位置を特定した
  - effect: rescueLocated=1
  - effect: rescueProgress=20
- type=rescueProtectorAssigned
  - ミレイ サンド（guardian）が救出対象の保護担当になった
  - effect: rescueProtector=1, targetId=C-guardian-s5-guardian-1
- type=battleSummary
  - 戦闘が3ラウンドでretreatとなった
  - 接敵結果: failure
- type=rescueBattleExposure
  - ミレイ サンドは救出対象を守ったが、4のダメージを負わせてしまった
  - effect: rescueTargetDamage=4
  - effect: rescueTargetHp=36
  - effect: rescueAlive=1
  - effect: rescueProgress=40
- type=rescueEvacuation
  - オルム クレストが救出対象を搬出したが、2のダメージを負わせた
  - 搬出に手間取り、帰還に余分な時間がかかる
  - effect: returnTimeBonus=1
  - effect: rescueEvacuated=1
  - effect: rescueTargetHp=34
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=rescueReturn
  - 救出対象を危険地帯から離れたが、拠点までは連れ帰れなかった
  - 搬出は成功したが、完全な帰還には至らなかった
  - 救出対象は帰還中に状態を維持した
  - effect: rescueReturned=0
  - effect: rescueAbandoned=0
  - effect: rescueTargetHp=34
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=summary
  - 救出対象は発見済み・接近済み・未安定化・搬出済み・未帰還。救出進捗は60%
  - 医薬品を2消費した
  - ゴウ スカイが負傷者の治療を行った
  - effect: moraleChange=3

## D. 救出失敗

- 依頼等級: C
- 環境: forest
- 救出対象名: 救出対象
- 初期HP: 40
- 最終HP: 40
- 移動能力: mobile
- 発見状態: 未発見
- 到達状態: 未到達
- 安定化状態: 未安定化
- 保護担当: なし
- 戦闘結果: victory（8ラウンド）
- 敵編成: insectx4
- 戦闘被害: 0
- 搬出状態: 未搬出
- 帰還状態: 未帰還
- 置き去り状態: なし
- 進捗: 0%
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

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=47, 状態異常=[guarded(1)]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=51, 状態異常=[guarded(1)]
- フェイ アイヴィー（mage） HP=40/47, MP=3/43, 士気=50
- レイラ ノース（healer） HP=66/66, MP=39/42, 士気=44

### 構造化facts

- type=rescueSearch
  - フェイ アイヴィーは救出対象の位置を見つけられなかった
  - effect: rescueLocated=0
  - effect: rescueProgress=0
- type=battleSummary
  - 戦闘が8ラウンドでvictoryとなった
  - 接敵結果: failure
- type=rescueSearch
  - フェイ アイヴィーは救出対象の位置を見つけられなかった
  - effect: rescueLocated=0
  - effect: rescueProgress=0
- type=rescueReturn
  - 救出対象は帰還中に状態を維持した
  - effect: rescueReturned=0
  - effect: rescueAbandoned=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=0
- type=summary
  - 救出対象は未発見・未接近・未安定化・未搬出・未帰還。救出進捗は0%
  - 医薬品を2消費した
  - レイラ ノースが負傷者の治療を行った
  - effect: moraleChange=-5
