# Phase 3.4 護衛依頼（escort）実装レポート

## 1. 実装概要

- `escort` 依頼タイプを追加。
- 護衛対象を「パーティ HP とは別の対象 HP」として管理。
- 出発地点から目的地までの移動を `route:leg-1` と `route:leg-2` の2区間に分け、それぞれ独立した RNG シードで判定。
- 戦闘発生時は保護担当を選出し、護衛対象への戦闘余波ダメージを算出。
- 必要に応じて `care` 判定で治療を実施。
- 目的地到達後に `handoff` 判定で引き渡しを実施。
- 引き渡し失敗時は、護衛対象を出発地点へ連れ戻す。

## 2. 状態・フック一覧

### 管理対象の独立事実

- `accompanying`：護衛対象がパーティに同行している
- `departed`：出発済み
- `coordinated`：出発準備が完了した
- `routeProgress`：移動経路の進行状況
- `travelStress`：移動中の対象のストレス
- `protectorId`：戦闘時の保護担当
- `travelDamage`：移動中の対象へのダメージ
- `battleExposureDamage`：戦闘余波ダメージ
- `careProvided` / `careHealing`：治療実施と回復量
- `destinationReached`：目的地到達
- `handoffStatus`：引き渡し状態
- `delivered`：受取人へ引き渡し完了
- `returnedToOrigin`：出発地点へ連れ戻した
- `stranded`：置き去り

### 同一視しない事実

- `戦闘に勝利した` ≠ `目的地へ到達した` ≠ `対象を引き渡した` ≠ `護衛依頼に成功した`

## 3. ハンドラフック

`ExpeditionObjectiveHandler` に以下を追加：

- `afterPreparation`：出発準備（`runEscortDeparture`）
- `beforeBattle`：`route:leg-1` + 保護担当選出
- `onBattleResolved`：戦闘余波ダメージ
- `runObjective`：治療 + `route:leg-2` + 目的地到達 + 引き渡し
- `beforeReturn`：帰還準備
- `afterReturn`：出発地点への連れ戻し判定

`ExpeditionFlowDefinition` に `objectiveAfterForcedBattleRetreat: false` を設定し、escort では戦闘撤退後も `runObjective` を継続して `route:leg-2` / `handoff` を実施する。

## 4. RNG シード

escort 専用の RNG ステージ：

```
<request.seed>:escort:coordination
<request.seed>:escort:route:leg-1
<request.seed>:escort:battle-exposure:<battleId>
<request.seed>:escort:care
<request.seed>:escort:route:leg-2
<request.seed>:escort:handoff
```

## 5. 経路技能・環境対応

| 環境                                        | 経路技能     | 優先役割       |
| ------------------------------------------- | ------------ | -------------- |
| magical                                     | defenseMagic | mage           |
| cave / ruins / urban                        | scouting     | scout → ranger |
| forest / mountain / plains / swamp / desert | survival     | ranger → scout |

## 6. サンプル

`PHASE3_ESCORT_SAMPLE.md` に以下の 5 ケースを生成：

| ケース                                    | seed | 結果            | 特徴                                      |
| ----------------------------------------- | ---- | --------------- | ----------------------------------------- |
| A. 完全護衛成功                           | s6   | completeSuccess | 戦闘 costyVictory、対象軽傷、引き渡し完了 |
| B. 護衛成功だが対象が負傷                 | s80  | success         | 戦闘 retreat、対象 HP 22/40               |
| C. 目的地到達だが引き渡し保留             | s9   | partialSuccess  | handoff pending、目的地に留まる           |
| D. 護衛失敗（対象を出発地点へ連れ戻した） | s1   | failedObjective | route 未達、対象生存、帰還                |
| E. 戦闘撤退後も護衛成功                   | s21  | completeSuccess | 戦闘 retreat だが護衛成功                 |

## 7. 役割寄与（paired 1000 試行）

`PHASE3_4_ROLE_CONTRIBUTION.md` より：

| 役割     | 指標           | withRole | withoutRole | pairedDelta | 試行数 |
| -------- | -------------- | -------- | ----------- | ----------- | ------ |
| Scout    | cave到達率     | 0.6900   | 0.2800      | 0.4100      | 1000   |
| Ranger   | forest到達率   | 0.4070   | 0.3290      | 0.0780      | 1000   |
| Mage     | magical到達率  | 0.7700   | 0.4640      | 0.3060      | 1000   |
| Vanguard | immobile到達率 | 0.2920   | 0.1840      | 0.1080      | 1000   |
| Support  | 引き渡し成功率 | 0.7360   | 0.4840      | 0.2520      | 1000   |
| Guardian | 戦闘被害平均   | 4.4420   | 8.6140      | -4.1720     | 1000   |
| Healer   | 治療回復量平均 | 17.7450  | 14.6610     | 3.0840      | 1000   |

すべての役割で期待される方向への寄与を確認。

## 8. 回帰スナップショット

- 既存 10 件の baseline（investigation 3、elimination 4、rescue 3）は diff なし。
- escort 専用の baseline を 4 件追加：
  - `escort-completeSuccess`
  - `escort-success`
  - `escort-partialSuccess`
  - `escort-failedObjective`
- 合計 14 件の baseline。

## 9. テスト・CI

- `npm run typecheck`：成功
- `npm test`：388 tests 成功
- `npm run lint`：成功（`lint:fix` 実行済み）
- `npm run build`：成功
- `npm run update:expedition-regression`：14 baseline 生成、既存 10 件の diff なし

## 10. 変更禁止事項の遵守

- 戦闘定数・AI・敵生成・脅威点・難易度倍率は未変更。
- investigation / elimination / rescue の振る舞い・ファクト・RNG 消費は未変更。
- 報酬・酒場評判・AI 文章生成は未変更。
- retrieval / survey は未実装（明示的に拒否）。
