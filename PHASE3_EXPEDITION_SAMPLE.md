# Phase 3.2 討伐依頼（elimination）サンプル出力

elimination 依頼で最大1回の戦闘を発生させ、討伐対象の撃破・確認・遠征結果を分離した決定論的シミュレーション結果。

## A. 完全討伐

- 依頼等級: S
- パーティ: vanguard / guardian / mage / healer（S級）
- 依頼シード: s37
- 敵編成: undeadx4
- 必須対象ID: B-undead-swarm-standard-s37:battle:0:encounter:enemy:0, A-undead-swarm-standard-s37:battle:0:encounter:enemy:1, S-undead-swarm-standard-s37:battle:0:encounter:enemy:2, A-undead-swarm-standard-s37:battle:0:encounter:enemy:3
- 戦闘結果: victory
- 撃破対象: B-undead-swarm-standard-s37:battle:0:encounter:enemy:0, A-undead-swarm-standard-s37:battle:0:encounter:enemy:1, S-undead-swarm-standard-s37:battle:0:encounter:enemy:2, A-undead-swarm-standard-s37:battle:0:encounter:enemy:3
- 逃亡対象: なし
- 生存対象: なし
- 確認済み対象: B-undead-swarm-standard-s37:battle:0:encounter:enemy:0, A-undead-swarm-standard-s37:battle:0:encounter:enemy:1, S-undead-swarm-standard-s37:battle:0:encounter:enemy:2, A-undead-swarm-standard-s37:battle:0:encounter:enemy:3
- 討伐進捗: 100%
- 討伐完了: はい
- 遠征結果: completeSuccess
- 生存者: トール ジェム, ヴァン エルウィン, ユリ サンド, ドラン ハインド
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- トール ジェム（vanguard） HP=80/80, MP=7/7, 士気=65, 状態異常=[なし]
- ヴァン エルウィン（guardian） HP=92/92, MP=7/7, 士気=69, 状態異常=[なし]
- ユリ サンド（mage） HP=66/66, MP=65/65, 士気=67, 状態異常=[なし]
- ドラン ハインド（healer） HP=72/72, MP=56/56, 士気=67, 状態異常=[なし]

### 2. 戦闘直前

- トール ジェム（vanguard） HP=80/80, MP=7/7, 士気=63, 状態異常=[なし]
- ヴァン エルウィン（guardian） HP=92/92, MP=7/7, 士気=70, 状態異常=[なし]
- ユリ サンド（mage） HP=66/66, MP=65/65, 士気=65, 状態異常=[なし]
- ドラン ハインド（healer） HP=70/72, MP=56/56, 士気=65, 状態異常=[なし]

### 3. 戦闘直後

- トール ジェム（vanguard） HP=63/80, MP=7/7, 士気=63, 状態異常=[guarded(2)]
- ヴァン エルウィン（guardian） HP=92/92, MP=7/7, 士気=70, 状態異常=[guarded(2)]
- ユリ サンド（mage） HP=66/66, MP=15/65, 士気=65, 状態異常=[なし]
- ドラン ハインド（healer） HP=70/72, MP=56/56, 士気=65, 状態異常=[なし]

### 4. 帰還後

- トール ジェム（vanguard） HP=80/80, MP=7/7, 士気=68, 状態異常=[guarded(2)]
- ヴァン エルウィン（guardian） HP=92/92, MP=7/7, 士気=75, 状態異常=[guarded(2)]
- ユリ サンド（mage） HP=66/66, MP=15/65, 士気=70, 状態異常=[なし]
- ドラン ハインド（healer） HP=72/72, MP=56/56, 士気=70, 状態異常=[なし]

### 構造化facts

- type=battleSummary
  - 戦闘が10ラウンドでvictoryとなった
  - 接敵結果: failure
- type=eliminationTargetsAssigned
  - 討伐対象として4体が指定された
  - 戦闘で4体を撃破した
  - 討伐進捗は100%となった
  - effect: eliminationTargets=4
  - effect: eliminationDefeated=4
  - effect: eliminationEscaped=0
  - effect: eliminationSurviving=0
  - effect: eliminationProgress=100
- type=eliminationConfirmation
  - 撃破した4体の討伐を確認した
  - 討伐対象として4体が指定された。戦闘で4体を撃破した。討伐進捗は100%となった。撃破した4体のうち4体の討伐を確認した。全対象の討伐を確認した
  - effect: eliminationConfirmed=4
  - effect: eliminationCompleted=1

## B. 討伐成功だが損害大

- 依頼等級: C
- パーティ: vanguard / guardian / mage / healer（C級）
- 依頼シード: s325
- 敵編成: constructx4
- 必須対象ID: C-construct-assault-standard-s325:battle:0:encounter:enemy:0, C-construct-assault-standard-s325:battle:0:encounter:enemy:1, B-construct-assault-standard-s325:battle:0:encounter:enemy:2, C-construct-assault-standard-s325:battle:0:encounter:enemy:3
- 戦闘結果: victory
- 撃破対象: C-construct-assault-standard-s325:battle:0:encounter:enemy:0, C-construct-assault-standard-s325:battle:0:encounter:enemy:1, B-construct-assault-standard-s325:battle:0:encounter:enemy:2, C-construct-assault-standard-s325:battle:0:encounter:enemy:3
- 逃亡対象: なし
- 生存対象: なし
- 確認済み対象: C-construct-assault-standard-s325:battle:0:encounter:enemy:0, C-construct-assault-standard-s325:battle:0:encounter:enemy:1, B-construct-assault-standard-s325:battle:0:encounter:enemy:2, C-construct-assault-standard-s325:battle:0:encounter:enemy:3
- 討伐進捗: 100%
- 討伐完了: はい
- 遠征結果: success
- 生存者: マルチナ サンド, ベル ヴァレス, フェイ ジェム, チェルシー クォーツ
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- マルチナ サンド（vanguard） HP=80/80, MP=6/6, 士気=49, 状態異常=[なし]
- ベル ヴァレス（guardian） HP=71/71, MP=0/0, 士気=62, 状態異常=[なし]
- フェイ ジェム（mage） HP=50/50, MP=43/43, 士気=54, 状態異常=[なし]
- チェルシー クォーツ（healer） HP=47/47, MP=43/43, 士気=60, 状態異常=[なし]

### 2. 戦闘直前

- マルチナ サンド（vanguard） HP=80/80, MP=6/6, 士気=33, 状態異常=[なし]
- ベル ヴァレス（guardian） HP=71/71, MP=0/0, 士気=46, 状態異常=[なし]
- フェイ ジェム（mage） HP=40/50, MP=43/43, 士気=38, 状態異常=[なし]
- チェルシー クォーツ（healer） HP=46/47, MP=43/43, 士気=44, 状態異常=[なし]

### 3. 戦闘直後

- マルチナ サンド（vanguard） HP=71/80, MP=6/6, 士気=33, 状態異常=[guarded(2)]
- ベル ヴァレス（guardian） HP=71/71, MP=0/0, 士気=46, 状態異常=[guarded(2)]
- フェイ ジェム（mage） HP=40/50, MP=3/43, 士気=38, 状態異常=[なし]
- チェルシー クォーツ（healer） HP=46/47, MP=37/43, 士気=44, 状態異常=[なし]

### 4. 帰還後

- マルチナ サンド（vanguard） HP=80/80, MP=6/6, 士気=32, 状態異常=[guarded(2)]
- ベル ヴァレス（guardian） HP=71/71, MP=0/0, 士気=45, 状態異常=[guarded(2)]
- フェイ ジェム（mage） HP=50/50, MP=3/43, 士気=37, 状態異常=[なし]
- チェルシー クォーツ（healer） HP=47/47, MP=37/43, 士気=43, 状態異常=[なし]

### 構造化facts

- type=battleSummary
  - 戦闘が12ラウンドでvictoryとなった
  - 接敵結果: failure
- type=eliminationTargetsAssigned
  - 討伐対象として4体が指定された
  - 戦闘で4体を撃破した
  - 討伐進捗は100%となった
  - effect: eliminationTargets=4
  - effect: eliminationDefeated=4
  - effect: eliminationEscaped=0
  - effect: eliminationSurviving=0
  - effect: eliminationProgress=100
- type=eliminationConfirmation
  - 撃破した4体の討伐を確認した
  - 討伐対象として4体が指定された。戦闘で4体を撃破した。討伐進捗は100%となった。撃破した4体のうち4体の討伐を確認した。全対象の討伐を確認した
  - effect: eliminationConfirmed=4
  - effect: eliminationCompleted=1

## C. 一部撃破して撤退

- 依頼等級: C
- パーティ: vanguard / guardian / mage / healer（C級）
- 依頼シード: s1
- 敵編成: insectx4
- 必須対象ID: C-insect-swarm-standard-s1:battle:0:encounter:enemy:1, C-insect-ambusher-standard-s1:battle:0:encounter:enemy:2, C-insect-swarm-standard-s1:battle:0:encounter:enemy:0, C-insect-swarm-standard-s1:battle:0:encounter:enemy:3
- 戦闘結果: victory
- 撃破対象: C-insect-swarm-standard-s1:battle:0:encounter:enemy:0, C-insect-swarm-standard-s1:battle:0:encounter:enemy:3
- 逃亡対象: C-insect-swarm-standard-s1:battle:0:encounter:enemy:1, C-insect-ambusher-standard-s1:battle:0:encounter:enemy:2
- 生存対象: なし
- 確認済み対象: C-insect-swarm-standard-s1:battle:0:encounter:enemy:0, C-insect-swarm-standard-s1:battle:0:encounter:enemy:3
- 討伐進捗: 50%
- 討伐完了: いいえ
- 遠征結果: partialSuccess
- 生存者: トール スカイ, オルム アイヴィー, フェイ アイヴィー, レイラ ノース
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=56, 状態異常=[なし]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=60, 状態異常=[なし]
- フェイ アイヴィー（mage） HP=47/47, MP=43/43, 士気=59, 状態異常=[なし]
- レイラ ノース（healer） HP=66/66, MP=42/42, 士気=53, 状態異常=[なし]

### 2. 戦闘直前

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=52, 状態異常=[なし]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=56, 状態異常=[なし]
- フェイ アイヴィー（mage） HP=47/47, MP=43/43, 士気=55, 状態異常=[なし]
- レイラ ノース（healer） HP=65/66, MP=42/42, 士気=49, 状態異常=[なし]

### 3. 戦闘直後

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=52, 状態異常=[guarded(1)]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=56, 状態異常=[guarded(1)]
- フェイ アイヴィー（mage） HP=39/47, MP=18/43, 士気=55, 状態異常=[なし]
- レイラ ノース（healer） HP=65/66, MP=36/42, 士気=49, 状態異常=[なし]

### 4. 帰還後

- トール スカイ（vanguard） HP=68/68, MP=9/9, 士気=52, 状態異常=[guarded(1)]
- オルム アイヴィー（guardian） HP=71/71, MP=4/4, 士気=56, 状態異常=[guarded(1)]
- フェイ アイヴィー（mage） HP=46/47, MP=18/43, 士気=55, 状態異常=[なし]
- レイラ ノース（healer） HP=66/66, MP=36/42, 士気=49, 状態異常=[なし]

### 構造化facts

- type=battleSummary
  - 戦闘が6ラウンドでvictoryとなった
  - 接敵結果: failure
- type=eliminationTargetsAssigned
  - 討伐対象として4体が指定された
  - 戦闘で2体を撃破した
  - 2体が逃亡した
  - 討伐進捗は50%となった
  - effect: eliminationTargets=4
  - effect: eliminationDefeated=2
  - effect: eliminationEscaped=2
  - effect: eliminationSurviving=0
  - effect: eliminationProgress=50
- type=eliminationConfirmation
  - 撃破した2体の討伐を確認した
  - 討伐対象として4体が指定された。戦闘で2体を撃破した。2体が逃亡した。討伐進捗は50%となった。撃破した2体のうち2体の討伐を確認した。討伐対象が残っているため依頼目的は未完了
  - effect: eliminationConfirmed=2
  - effect: eliminationCompleted=0

## D. 戦闘勝利だが確認失敗

- 依頼等級: S
- パーティ: vanguard / guardian / mage / healer（S級）
- 依頼シード: s45
- 敵編成: constructx4
- 必須対象ID: A-construct-tank-standard-s45:battle:0:encounter:enemy:0, S-construct-tank-standard-s45:battle:0:encounter:enemy:1, S-construct-tank-standard-s45:battle:0:encounter:enemy:2, S-construct-tank-standard-s45:battle:0:encounter:enemy:3
- 戦闘結果: victory
- 撃破対象: A-construct-tank-standard-s45:battle:0:encounter:enemy:0, S-construct-tank-standard-s45:battle:0:encounter:enemy:1, S-construct-tank-standard-s45:battle:0:encounter:enemy:2, S-construct-tank-standard-s45:battle:0:encounter:enemy:3
- 逃亡対象: なし
- 生存対象: なし
- 確認済み対象: なし
- 討伐進捗: 100%
- 討伐完了: いいえ
- 遠征結果: failedObjective
- 生存者: ベル ジェム, ユリ クォーツ, カイン フォレスト, グスタフ ハインド
- 戦闘不能者: なし
- 死亡者: なし

### 1. 遠征開始時

- ベル ジェム（vanguard） HP=83/83, MP=14/14, 士気=57, 状態異常=[なし]
- ユリ クォーツ（guardian） HP=92/92, MP=12/12, 士気=70, 状態異常=[なし]
- カイン フォレスト（mage） HP=79/79, MP=55/55, 士気=72, 状態異常=[なし]
- グスタフ ハインド（healer） HP=73/73, MP=53/53, 士気=66, 状態異常=[なし]

### 2. 戦闘直前

- ベル ジェム（vanguard） HP=83/83, MP=14/14, 士気=52, 状態異常=[なし]
- ユリ クォーツ（guardian） HP=91/92, MP=12/12, 士気=65, 状態異常=[なし]
- カイン フォレスト（mage） HP=79/79, MP=55/55, 士気=67, 状態異常=[なし]
- グスタフ ハインド（healer） HP=73/73, MP=53/53, 士気=61, 状態異常=[なし]

### 3. 戦闘直後

- ベル ジェム（vanguard） HP=83/83, MP=14/14, 士気=52, 状態異常=[なし]
- ユリ クォーツ（guardian） HP=63/92, MP=12/12, 士気=65, 状態異常=[なし]
- カイン フォレスト（mage） HP=52/79, MP=0/55, 士気=67, 状態異常=[なし]
- グスタフ ハインド（healer） HP=48/73, MP=35/53, 士気=61, 状態異常=[なし]

### 4. 帰還後

- ベル ジェム（vanguard） HP=83/83, MP=14/14, 士気=60, 状態異常=[なし]
- ユリ クォーツ（guardian） HP=76/92, MP=12/12, 士気=70, 状態異常=[なし]
- カイン フォレスト（mage） HP=65/79, MP=0/55, 士気=72, 状態異常=[なし]
- グスタフ ハインド（healer） HP=61/73, MP=35/53, 士気=66, 状態異常=[なし]

### 構造化facts

- type=battleSummary
  - 戦闘が16ラウンドでvictoryとなった
  - 接敵結果: failure
- type=eliminationTargetsAssigned
  - 討伐対象として4体が指定された
  - 戦闘で4体を撃破した
  - 討伐進捗は100%となった
  - effect: eliminationTargets=4
  - effect: eliminationDefeated=4
  - effect: eliminationEscaped=0
  - effect: eliminationSurviving=0
  - effect: eliminationProgress=100
- type=eliminationConfirmation
  - 討伐確認に失敗した
  - 討伐対象として4体が指定された。戦闘で4体を撃破した。討伐進捗は100%となった。全対象を撃破したが討伐確認が未完了のため依頼目的は未完了
  - effect: eliminationConfirmed=0
  - effect: eliminationCompleted=0
