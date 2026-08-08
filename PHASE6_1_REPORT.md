# Phase 6.1 Report

## Goal

選択した依頼 × 選択した既成パーティの組み合わせについて、実際の `runExpedition()` を予測専用 Seed で 200 回シミュレートし、その組み合わせで依頼を達成できる見込みをプレイヤーへ表示する。

## Why prediction is needed

これまではリーダーが受けるかどうかは分かるが、遠征そのものがどの程度危険かが分かりにくかった。プレイヤーが「なぜ失敗したのか」を、

- この組み合わせはそもそも危険だった
- 高確率だったが今回は運悪く失敗した

のどちらかで判断できる状態にする。

## Prediction architecture

- `src/core/tavern/prediction/types.ts`：サンプル数・モデルバージョン・予測結果の型
- `src/core/tavern/prediction/predictionSeed.ts`：`prediction:v1:<requestId>:<partyId>:<index>` 形式の Seed 生成
- `src/core/tavern/prediction/prediction.ts`：`predictExpeditionOutcome` 本体
- `src/ui/tavern/ExpeditionPredictionPanel.tsx`：予測 UI
- `src/ui/tavern/predictionLabels.ts`：危険度ラベルと結果ラベル

## Monte Carlo simulation

`runExpedition()` を 200 回実行し、各 Outcome の出現回数を集計する。独自の成功率計算式は使用せず、既存エンジンの出力をそのまま利用する。

## Prediction seed isolation

各試行の Seed は

```
prediction:v1:<requestId>:<partyId>:0
prediction:v1:<requestId>:<partyId>:1
...
prediction:v1:<requestId>:<partyId>:199
```

であり、本番の `expeditionRequest.seed` および `expeditionRequest.battle.seed` とは完全に分離している。

## Selected-request semantics

予測対象は「現在ボードに出ているこの依頼」と「このパーティ」のみである。予測のたびに新しい Request template を生成し直さない。Objective、Rank、Environment、hidden difficulty、target config、battle chance などの静的設定は維持し、変更するのは実行時乱数 Seed のみである。

## Hidden request configuration

`TavernRequestOffer.expeditionRequest` に含まれる内部難易度を予測へ使用するが、UI には `discoveryDifficulty = 64` などの個別値は表示しない。集約された予測値（例：68%）のみを表示する。

## Current party condition

予測にはパーティの現在 HP / MP / Morale / status effects を含めた現在状態を使用する。満タン状態に戻して再生成しない。負傷した状態であればそのまま予測に入るため、昨日の負傷が今日の成功見込みへ影響する。

## Outcome aggregation

既存の `ExpeditionOutcome` をそのまま使用する。

- `completeSuccess`
- `success`
- `partialSuccess`
- `failedObjective`
- `forcedRetreat`
- `lostExpedition`

各 Outcome の出現回数をカウントし、合計は常に `sampleCount`（200）になる。

## Estimated success rate

```typescript
estimatedSuccessRate = (counts.completeSuccess + counts.success) / sampleCount
```

`partialSuccess` は成功率に含めない。

## UI

- 依頼とパーティの両方が選択されると `ExpeditionPredictionPanel` が表示される
- `推定依頼達成率 XX%` と危険度ラベルを表示
- `200回の仮想遠征による推定` と「実際の遠征結果を保証するものではありません」を表示
- `内訳を見る` で 6 Outcome ごとの割合を展開表示
- 療養中パーティを選択すると `療養中のため遠征予測できません`
- 依頼またはパーティを切り替えると古い予測を残さず再計算する

## Danger labels

| 推定達成率 | ラベル     |
| ---------- | ---------- |
| 80〜100%   | 非常に有望 |
| 65〜79%    | 有望       |
| 50〜64%    | 五分以上   |
| 35〜49%    | 危険       |
| 0〜34%     | 非常に危険 |

## Determinism

同じ Request、同じ Party 状態、同じモデルバージョン、同じ sampleCount であれば、Prediction 結果は完全一致する。Unit test で同一 fixture を 2 回実行し deep equal を確認している。

## Mutation safety

- 予測前後で `request.expeditionRequest.seed` および `request.expeditionRequest.battle.seed` が不変
- 予測前後で Party の HP / MP / Morale / status effects が不変
- Campaign state、`TavernDayState`、`CampaignParty` も deep equal で不変
- 200 回の実行が Party statistics や reputation へ影響しない

## Acceptance independence

`predictExpeditionOutcome()` は `evaluateOffer()` とは独立しており、Prediction 結果を Acceptance Engine へ渡さない。リーダーが受諾しても Prediction が低い場合や、リーダーが辞退しても Prediction が高い場合があるが、それは正常である。

## Actual seed independence

Prediction 200 回実行後に本番 Seed で `runExpedition()` した結果は、Prediction を実行しなかった場合と一致する。本番 Seed は上書きされていない。

## Six-objective seed audit

`investigation`、`elimination`、`rescue`、`escort`、`retrieval`、`survey` すべての Objective について、Prediction 用 request clone が異なる sample seed を使用することを確認している。各 Objective ごとに `request.expeditionRequest.seed` が `prediction:v1:<requestId>:<partyId>:<index>` 形式になっている。

## Performance

ブラウザ上で 5 回連続実行した結果（Vite dev build、個人 PC）。

| 指標   | 時間      |
| ------ | --------- |
| min    | 100.90 ms |
| median | 105.40 ms |
| max    | 119.00 ms |

体感上明らかな UI freeze は確認されなかったため、Web Worker 化は Phase 6.1 では行わない。

## Browser E2E

実施した手順：

1. 酒場キャンペーンを開始
2. 依頼を選択
3. 利用可能なパーティを選択
4. 遠征予測パネルが表示されることを確認
5. 推定依頼達成率・危険度ラベル・200回のディスクレーマーを確認
6. 内訳展開を確認
7. 依頼を紹介し、リーダー返答を確認
8. 本日の仲介を確定し、遠征結果を確認
9. Day 進行、Party HP / MP / Morale 変化、Reputation 変化、履歴を確認
10. 別の依頼・パーティで予測を切り替え、旧予測が残らないことを確認
11. 全操作でブラウザ console エラーなし

## Prediction samples

実際に観測された例を以下に示す。seed `tavern-campaign-001` Day 1 の例：

| 依頼                             | パーティ     | 推定達成率 | 危険度     | 実際の結果    |
| -------------------------------- | ------------ | ---------- | ---------- | ------------- |
| 街道周辺の魔物排除 (elimination) | 《黒曜の斧》 | 10%        | 非常に危険 | forcedRetreat |

高評判シードで観測された受諾・実施例：

| 依頼                             | パーティ | 推定達成率 | 受諾判定    | 実際の結果      |
| -------------------------------- | -------- | ---------- | ----------- | --------------- |
| 冒険者装備の回収 (retrieval)     | 鉄靴団   | 12%        | appropriate | completeSuccess |
| 行方不明調査員の救出 (rescue)    | 石楠の棘 | 43.5%      | appropriate | completeSuccess |
| 旧坑道東部の測量 (survey)        | 鉄靴団   | 52%        | appropriate | completeSuccess |
| 商人の護衛 (escort)              | 鉄梟     | 19.5%      | appropriate | failedObjective |
| 街道周辺の魔物排除 (elimination) | 銀灯     | 11.5%      | appropriate | forcedRetreat   |
| 遺跡の異変調査 (investigation)   | 静寂の矢 | 18%        | appropriate | forcedRetreat   |

同じ依頼を複数パーティで比較した例（seed `seed-a`、依頼「負傷した冒険者の救出」）：

| パーティ | 推定達成率 |
| -------- | ---------- |
| 月灯     | 20%        |
| 炎獅子団 | 49.5%      |
| 鉄梟     | 53%        |

## Existing regression

- 既存の 22 expedition regression baseline：diff 0
- Phase 6 キャンペーン 30-day smoke：維持
- `npm run update:expedition-regression` で差分なしを確認

## Known limitations

- Prediction は推定値であり、実際の結果を保証しない
- サンプル数は 200 回固定
- Prediction 自身は Acceptance、Reputation、Campaign state へ影響しない
- Prediction は保存されず UI memory 上のみで保持される
- 成功率の根拠説明機能はない
- 同一依頼に対する Party 一括比較やおすすめ Party 表示はない
- 成功率順ソートはない
- 信頼区間表示はない
- AI による自然文予測説明はない
- バランス調整は行っていない
