# Phase 6.5 関係性・受諾・仲介 E2E テストレポート

## 概要

`devin/phase6-5-relationship-acceptance` ブランチの `酒場キャンペーン` UI を `http://localhost:5173` で 14 日進行させる録画付きブラウザ E2E を実施しました。`CampaignParty` の `relationship`（お気に入り / 懐事情 / 危険志向 / 滞在延長）が `BrokeragePanel` の受諾判定・CampaignHistory の関係性イベント・遠征後の状態更新に正しく反映されることを確認しました。

## 静的検証（CI green）

| コマンド            | 結果                                                     |
| ------------------- | -------------------------------------------------------- |
| `npm run typecheck` | PASS                                                     |
| `npm run lint`      | PASS（`test-plan-phase6-5.md` を `prettier --write` 後） |
| `npm run test`      | PASS（729 tests）                                        |
| `npm run build`     | PASS（Node.js 20.18.1 警告、chunk size 警告のみ）        |

## E2E 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-5-relationship-acceptance`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome
- Campaign seed: `tavern-campaign-001`
- 録画: `/home/ubuntu/screencasts/phase6-5-clean/phase6-5-clean-edited.mp4`

## 実行したシナリオと結果

### Day 1：遠征予測パネル・stale 防止・キャッシュ再利用

- `未踏洞窟の経路測量(E)` + `《鋼の絆》(E)` → `推定依頼達成率 65% 五分以上` が表示された。
- `《黒曜の斧》(D)` に切り替えると `94% 非常に有望` に更新され、古い 65% が一瞬も残らなかった。
- 再び `《鋼の絆》(E)` に戻すと同じ `65%` が即座に再表示され、予測キャッシュが再利用された。
- 別依頼 `街道周辺の魔物排除(E)` + `《鋼の絆》(E)` に切り替えると `32% 非常に危険` に更新された。

### 受諾判定と実遠征結果の分離

- 予測 `32%` の状態で `この依頼を紹介する` を実行。`《鋼の絆》` リーダーは `appropriate` で受諾（`72/50`）。
- `BrokeragePanel` の `判定詳細` を展開し、`依頼Rank: E / パーティRank: E / Rank差: 0`、`お気に入り: 10`, `懐事情: 47`, `危険志向: 標準`, スコア内訳（ベース / 適性 / リーダー判断 / 実力認識 / 信頼 / 懐事情 / Morale状態など）を確認した。
- `本日の仲介を確定` 後、遠征予測パネルは非表示になり、`本日の結果` / `TavernResultDetail` に実遠征結果 `completeSuccess`、最終 HP/MP/Morale、評判変化 `10 → 13 (+3)` が別途表示された。

### 14 日進行と状態更新

- Day 1 から Day 14 まで毎日 `本日の仲介を確定` → `翌日へ` を実行。
- 評判は `10 → 43` と更新され、Day 5 に `-1`（`forcedRetreat`）、Day 11 に `+0`（`partialSuccess`）を含む自然な変動を確認。
- 遠征後のパーティは `PartyCard` において `お気に入り` / `懐事情` / `成長 XP` / `成長回数` / `鍛錬日数` が更新された。例：Day 14 の `《石楠の棘》` は `お気に入り 54/100（信頼）`, `懐事情 0/100（余裕あり）`, `成長 XP 3/4 · 成長4回 · 鍛錬4日`。
- 回復中のパーティは `療養中（あとN日）` と表示され、回復完了後に HP/MP 全快、Morale 上昇を確認。

### 関係性イベント（CampaignHistory）

- `CampaignHistory` を各日に展開し、`Relationship:` セクションに以下が含まれることを確認。
  - `affinityChanged`：`お気に入り 10 → 22（完全成功）` など。
  - `financialPressureChanged`：遠征結果で `懐事情 47 → 22`、仕事なしで `懐事情 45 → 53`、療養中で `懐事情 22 → 26` など。
  - `stayExtended`：`《黒曜の斧》 滞在延長 Day 3 → 5（+2日）`, `《鋼の絆》 滞在延長 Day 4 → 6（+2日）`, `《星読み》 滞在延長 Day 4 → 6（+2日）` など。

### 自然発生した Elimination リクエスト

- Day 5 で `洞窟の魔物討伐`（elimination）が発生。`《鋼の絆》` に紹介したところ `forcedRetreat` となった。
- `TavernResultDetail` の対象表で `対象数 4`, `撃破 0`, `逃走 0`, `生存 0`, `未確認 0`, `Progress 0%`, `Completed いいえ` を確認。`依頼結果: 撤退 (forcedRetreat)` / `戦闘結果: 撤退 (retreat)` と整合していた。

## ブラウザ console エラー

- テスト中、ブラウザ console に `error` または `unhandled rejection` は検出されなかった（Vite HMR 接続ログと React DevTools info のみ）。

## 成果物

- 録画: `/home/ubuntu/screencasts/phase6-5-clean/phase6-5-clean-edited.mp4`
- 主要スクリーンショット:
  - ![Day1 予測と判定詳細](https://app.devin.ai/attachments/2c6dddbd-65da-443f-8b8e-ad831933f026/ss_4b4f5b63.png)
  - ![Day14 最終状態 / 関係性・成長・遠征結果](https://app.devin.ai/attachments/cbe963bd-ef2f-4816-bfd0-abc1907e3683/ss_b6e189ac.png)
  - ![Day4 CampaignHistory Relationship と滞在延長](https://app.devin.ai/attachments/c66a04c6-4dae-4676-8baf-9b1d6dec064f/ss_cfe6e949.png)
  - ![Day1 実遠征結果 / 対象数・撃破・Progress](https://app.devin.ai/attachments/66620aef-3b6c-4124-a7e4-b110d056c3c6/ss_60b0f0fe.png)
  - ![Day14 CampaignHistory Relationship](https://app.devin.ai/attachments/79407067-62ee-4491-be0c-e975f2a5c0da/ss_65d9f031.png)

## 提案 PR コメント

```markdown
## Phase 6.5 関係性・受諾・仲介 UI E2E テスト結果

- `npm run typecheck`、`npm run lint`、`npm run test`（729 tests）、`npm run build` がすべて通過しました。
- `npm run dev` で `http://localhost:5173` を起動し、seed `tavern-campaign-001` で 14 日進行させる録画付きブラウザ E2E を実施しました。
- ブラウザ console エラー / unhandled rejection は検出されませんでした。

### 確認できたこと

1. **遠征予測パネル・stale 防止・キャッシュ再利用**
   - `未踏洞窟の経路測量(E)` + `《鋼の絆》(E)` = `65% 五分以上`。
   - `《黒曜の斧》(D)` に切り替えると `94% 非常に有望` に更新され、旧値が残りませんでした。
   - 元の `《鋼の絆》` に戻すと同じ `65%` が即座に再表示（キャッシュ再利用）。

2. **受諾判定と relationship ファクター**
   - `街道周辺の魔物排除(E)` + `《鋼の絆》(E)` は予測 `32% 非常に危険` でも、リーダーは `appropriate (72/50)` で受諾。
   - `判定詳細` / `Score breakdown` に `お気に入り`, `懐事情`, `危険志向`, `Rank差`, `リーダー判断` が表示されました。

3. **予測と実遠征結果の分離**
   - `本日の仲介を確定` 後、予測パネルは非表示になり、`TavernResultDetail` に `completeSuccess` と最終 HP/MP/Morale、評判 `10 → 13 (+3)` が別途表示されました。

4. **14 日間の関係性・回復・成長の更新**
   - `PartyCard` で `お気に入り` / `懐事情` / `成長 XP / 成長回数 / 鍛錬日数` が更新されました。
   - 遠征後の回復中パーティは `療養中（あとN日）` を経て HP/MP 全快、Morale 上昇しました。

5. **CampaignHistory の Relationship イベント**
   - `affinityChanged`（`お気に入り 10 → 22 完全成功` など）、`financialPressureChanged`（遠征結果・仕事なし・療養）、`stayExtended`（`滞在延長 Day 3 → 5 (+2日)` など）が記録されました。

6. **Elimination ブレイクダウン（自然発生）**
   - Day 5 `洞窟の魔物討伐` で `forcedRetreat`。`対象数 4 / 撃破 0 / 逃走 0 / 生存 0 / Progress 0% / Completed いいえ` で `依頼結果: 撤退` と整合しました。

### キー証拠

<details open>
<summary>Day 1: 予測 65% / 94% の切り替えと判定詳細（お気に入り・懐事情・危険志向）</summary>

![day1-prediction-brokerage](https://app.devin.ai/attachments/2c6dddbd-65da-443f-8b8e-ad831933f026/ss_4b4f5b63.png)

</details>

<details>
<summary>Day 14: 最終状態（関係性、成長、遠征結果）</summary>

![day14-final](https://app.devin.ai/attachments/cbe963bd-ef2f-4816-bfd0-abc1907e3683/ss_b6e189ac.png)

</details>

<details>
<summary>Day 4 CampaignHistory: Relationship + 滞在延長イベント</summary>

![day4-relationship](https://app.devin.ai/attachments/c66a04c6-4dae-4676-8baf-9b1d6dec064f/ss_cfe6e949.png)

</details>

<details>
<summary>Day 5 Elimination: forcedRetreat ブレイクダウン</summary>

![day5-elimination](https://app.devin.ai/attachments/66620aef-3b6c-4124-a7e4-b110d056c3c6/ss_60b0f0fe.png)

</details>

- 録画: `/home/ubuntu/screencasts/phase6-5-clean/phase6-5-clean-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase6-5.md`
```

## Verdict

**PASS**。Phase 6.5 の `relationship` 駆動受諾判定、関係性イベントの CampaignHistory 表示、遠征後のパーティ状態更新、予測パネルのキャッシュ動作、実遠征結果の分離、自然な elimination ブレイクダウンを含むすべての確認項目が期待通り動作しました。
