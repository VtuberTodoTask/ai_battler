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
- 保護担当: ジーク ハインド（guardian）
- 戦闘結果: victory（6ラウンド）
- 敵編成: beastx4
- 戦闘被害: 0
- 搬出状態: 搬出済み
- 帰還状態: 帰還済み
- 置き去り状態: なし
- 進捗: 100%
- 遠征結果: completeSuccess
- 冒険者生存者: ヴァン リーフ（vanguard）, ジーク ハインド（guardian）, ジーク アイヴィー（mage）, ジーク オーシャン（healer）
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- ヴァン リーフ（vanguard） HP=71/71, MP=5/5, 士気=62
- ジーク ハインド（guardian） HP=73/73, MP=4/4, 士気=53
- ジーク アイヴィー（mage） HP=52/52, MP=44/44, 士気=54
- ジーク オーシャン（healer） HP=50/50, MP=54/54, 士気=47

### 2. 戦闘直前

- ヴァン リーフ（vanguard） HP=71/71, MP=5/5, 士気=63
- ジーク ハインド（guardian） HP=73/73, MP=4/4, 士気=51
- ジーク アイヴィー（mage） HP=52/52, MP=44/44, 士気=52
- ジーク オーシャン（healer） HP=47/50, MP=54/54, 士気=45

### 3. 戦闘直後

- ヴァン リーフ（vanguard） HP=71/71, MP=5/5, 士気=63, 状態異常=[guarded(1)]
- ジーク ハインド（guardian） HP=73/73, MP=4/4, 士気=51, 状態異常=[guarded(1)]
- ジーク アイヴィー（mage） HP=52/52, MP=19/44, 士気=52
- ジーク オーシャン（healer） HP=47/50, MP=54/54, 士気=45

### 4. 帰還後

- ヴァン リーフ（vanguard） HP=71/71, MP=5/5, 士気=65, 状態異常=[guarded(1)]
- ジーク ハインド（guardian） HP=73/73, MP=4/4, 士気=53, 状態異常=[guarded(1)]
- ジーク アイヴィー（mage） HP=52/52, MP=19/44, 士気=54
- ジーク オーシャン（healer） HP=50/50, MP=54/54, 士気=47

### 構造化facts

- type=rescueSearch
  - ジーク アイヴィーが救出対象の位置を特定した
  - effect: rescueLocated=1
  - effect: rescueProgress=20
- type=rescueProtectorAssigned
  - ジーク ハインド（guardian）が救出対象の保護担当になった
  - effect: rescueProtector=1, targetId=C-guardian-s23-guardian-1
- type=battleSummary
  - 戦闘が6ラウンドでvictoryとなった
  - 接敵結果: failure
- type=rescueBattleExposure
  - ジーク ハインドが救出対象を戦闘から守り切った
  - effect: rescueTargetDamage=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=40
- type=rescueStabilization
  - ジーク オーシャンが救出対象を安定化した
  - 医薬品を1消費した
  - effect: supplyConsume=1, targetId=medicine
  - effect: rescueStabilized=1
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=rescueEvacuation
  - ヴァン リーフが救出対象を危険地帯から搬出した
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
  - ジーク オーシャンが負傷者の治療を行った
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
- 安定化状態: 未安定化
- 保護担当: ハロルド ノース（guardian）
- 戦闘結果: retreat（5ラウンド）
- 敵編成: humanoidx4
- 戦闘被害: 0
- 搬出状態: 搬出済み
- 帰還状態: 帰還済み
- 置き去り状態: なし
- 進捗: 80%
- 遠征結果: success
- 冒険者生存者: カイン クロム（vanguard）, ハロルド ノース（guardian）, アメリア ムーン（mage）
- 戦闘不能者: なし
- 死亡者: シエラ フォレスト

### 1. 遠征開始時

- カイン クロム（vanguard） HP=69/69, MP=1/1, 士気=48
- ハロルド ノース（guardian） HP=71/71, MP=2/2, 士気=54
- アメリア ムーン（mage） HP=50/50, MP=43/43, 士気=53
- シエラ フォレスト（healer） HP=49/49, MP=44/44, 士気=54

### 2. 戦闘直前

- カイン クロム（vanguard） HP=69/69, MP=1/1, 士気=46
- ハロルド ノース（guardian） HP=71/71, MP=2/2, 士気=52
- アメリア ムーン（mage） HP=47/50, MP=43/43, 士気=51
- シエラ フォレスト（healer） HP=49/49, MP=44/44, 士気=52

### 3. 戦闘直後

- カイン クロム（vanguard） HP=26/69, MP=1/1, 士気=26
- ハロルド ノース（guardian） HP=71/71, MP=2/2, 士気=32
- アメリア ムーン（mage） HP=47/50, MP=23/43, 士気=31
- シエラ フォレスト（healer） HP=0/49, MP=41/44, 士気=52

### 4. 帰還後

- カイン クロム（vanguard） HP=26/69, MP=1/1, 士気=19
- ハロルド ノース（guardian） HP=71/71, MP=2/2, 士気=25
- アメリア ムーン（mage） HP=44/50, MP=23/43, 士気=24
- シエラ フォレスト（healer） HP=0/49, MP=41/44, 士気=52

### 構造化facts

- type=rescueSearch
  - アメリア ムーンが救出対象の位置をぎりぎりで特定した
  - effect: rescueLocated=1
  - effect: rescueProgress=20
- type=rescueProtectorAssigned
  - ハロルド ノース（guardian）が救出対象の保護担当になった
  - effect: rescueProtector=1, targetId=C-guardian-s43-guardian-1
- type=battleSummary
  - 戦闘が5ラウンドでretreatとなった
  - 接敵結果: failure
  - 戦闘で死亡者: C-healer-s43-healer-3
- type=rescueBattleExposure
  - ハロルド ノースが救出対象を戦闘から守り切った
  - effect: rescueTargetDamage=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=40
- type=rescueEvacuation
  - ハロルド ノースが救出対象を危険地帯から搬出した
  - effect: rescueEvacuated=1
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=rescueReturn
  - 救出対象を拠点まで連れ帰った
  - 救出対象は帰還中に状態を維持した
  - effect: rescueReturned=1
  - effect: rescueAbandoned=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=80
- type=summary
  - 犠牲者: C-healer-s43-healer-3
  - 救出対象は発見済み・接近済み・未安定化・搬出済み・帰還済み。救出進捗は80%
  - effect: moraleChange=-10
  - effect: moraleChange=3

## C. 搬出に手間取ったが救出成功

- 依頼等級: C
- 環境: forest
- 救出対象名: 救出対象
- 初期HP: 40
- 最終HP: 38
- 移動能力: mobile
- 発見状態: 発見済み
- 到達状態: 到達済み
- 安定化状態: 未安定化
- 保護担当: ベル リバー（guardian）
- 戦闘結果: retreat（5ラウンド）
- 敵編成: aberrationx6
- 戦闘被害: 0
- 搬出状態: 搬出済み
- 帰還状態: 帰還済み
- 置き去り状態: なし
- 進捗: 80%
- 遠征結果: success
- 冒険者生存者: フェイ ムーン（vanguard）, ベル リバー（guardian）, チェルシー リバー（healer）
- 戦闘不能者: なし
- 死亡者: レオ スカイ

### 1. 遠征開始時

- フェイ ムーン（vanguard） HP=69/69, MP=5/5, 士気=48
- ベル リバー（guardian） HP=77/77, MP=8/8, 士気=52
- レオ スカイ（mage） HP=52/52, MP=41/41, 士気=60
- チェルシー リバー（healer） HP=50/50, MP=54/54, 士気=57

### 2. 戦闘直前

- フェイ ムーン（vanguard） HP=67/69, MP=5/5, 士気=44
- ベル リバー（guardian） HP=77/77, MP=8/8, 士気=48
- レオ スカイ（mage） HP=52/52, MP=41/41, 士気=56
- チェルシー リバー（healer） HP=50/50, MP=54/54, 士気=53

### 3. 戦闘直後

- フェイ ムーン（vanguard） HP=67/69, MP=5/5, 士気=34
- ベル リバー（guardian） HP=77/77, MP=8/8, 士気=38
- レオ スカイ（mage） HP=0/52, MP=31/41, 士気=56
- チェルシー リバー（healer） HP=29/50, MP=48/54, 士気=43

### 4. 帰還後

- フェイ ムーン（vanguard） HP=69/69, MP=5/5, 士気=24
- ベル リバー（guardian） HP=77/77, MP=8/8, 士気=28
- レオ スカイ（mage） HP=0/52, MP=31/41, 士気=56
- チェルシー リバー（healer） HP=49/50, MP=48/54, 士気=33

### 構造化facts

- type=rescueSearch
  - レオ スカイが救出対象の位置をぎりぎりで特定した
  - effect: rescueLocated=1
  - effect: rescueProgress=20
- type=rescueProtectorAssigned
  - ベル リバー（guardian）が救出対象の保護担当になった
  - effect: rescueProtector=1, targetId=C-guardian-s136-guardian-1
- type=battleSummary
  - 戦闘が5ラウンドでretreatとなった
  - 接敵結果: failure
  - 戦闘で死亡者: C-mage-s136-mage-2
- type=rescueBattleExposure
  - ベル リバーが救出対象を戦闘から守り切った
  - effect: rescueTargetDamage=0
  - effect: rescueTargetHp=40
  - effect: rescueAlive=1
  - effect: rescueProgress=40
- type=rescueEvacuation
  - ベル リバーが救出対象を搬出したが、2のダメージを負わせた
  - 搬出に手間取り、帰還に余分な時間がかかる
  - effect: returnTimeBonus=1
  - effect: rescueEvacuated=1
  - effect: rescueTargetHp=38
  - effect: rescueAlive=1
  - effect: rescueProgress=60
- type=rescueReturn
  - 救出対象を拠点まで連れ帰った
  - 救出対象は帰還中に状態を維持した
  - effect: rescueReturned=1
  - effect: rescueAbandoned=0
  - effect: rescueTargetHp=38
  - effect: rescueAlive=1
  - effect: rescueProgress=80
- type=summary
  - 犠牲者: C-mage-s136-mage-2
  - 救出対象は発見済み・接近済み・未安定化・搬出済み・帰還済み。救出進捗は80%
  - 医薬品を2消費した
  - チェルシー リバーが負傷者の治療を行った
  - effect: moraleChange=-10
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
- type=summary
  - 救出対象は未発見・未接近・未安定化・未搬出・未帰還。救出進捗は0%
  - 医薬品を2消費した
  - レイラ ノースが負傷者の治療を行った
  - effect: moraleChange=-5
