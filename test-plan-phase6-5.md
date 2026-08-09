# Phase 6.5 関係性・受諾・仲介 E2E テスト計画

## 目的

`devin/phase6-5-relationship-acceptance` ブランチで、`CampaignParty` の `relationship`（お気に入りaffinity、懐事情financialPressure、危険志向riskTolerance、滞在延長stayExtensionDaysUsed）が受諾判定と遠征後の関係性イベントに反映され、UI（PartyCard / BrokeragePanel / CampaignHistory）に正しく表示・更新されることを、ブラウザ E2E で検証する。

## 検証対象

- `src/core/tavern/campaign/relationship.ts` — affinity/financialPressure 更新、滞在延長判定
- `src/core/tavern/acceptance.ts` — `AcceptanceContext` による決定論的受諾スコア
- `src/core/tavern/campaign/campaign.ts` — resolve / advance での関係性イベント生成
- `src/ui/tavern/PartyCard.tsx` — 関係性情報表示
- `src/ui/tavern/BrokeragePanel.tsx` — 受諾スコア・内訳・関係性表示
- `src/ui/tavern/CampaignHistory.tsx` — 関係性イベント（Relationship）表示
- `src/core/tavern/prediction/predictionCacheKey.ts` — 予測キャッシュ

## 静的検証（実行前）

| コマンド            | 結果                                                      |
| ------------------- | --------------------------------------------------------- |
| `npm run typecheck` | PASS                                                      |
| `npm run lint`      | PASS                                                      |
| `npm run test`      | 729 tests passed                                          |
| `npm run build`     | PASS（Node.js 20.18.1 の Vite 警告、chunk size 警告のみ） |

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-5-relationship-acceptance`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome
- Campaign seed: `tavern-campaign-001`

## シナリオ概要

1. `酒場キャンペーン` タブを開き、`tavern-campaign-001` でキャンペーン開始。
2. Day 1 で **予測パネル・stale/cache 動作**を確認する。
3. Day 1 から Day 14 まで、毎日受諾可能な依頼とパーティを選択し、仲介を確定して翌日へ進む。
4. Day 9 頃に **+2 等級差の予測更新**も確認する。
5. 各日の遠征後に **HP/MP/Morale、評判、回復状態、関係性イベント、滞在延長イベント**を確認する。
6. ブラウザコンソールにエラーがないことを確認する。

## 予測パネル・キャッシュ確認（Day 1）

Day 1 ボード：

- REQ 0: 街道周辺の魔物排除 [E]
- REQ 1: 未踏洞窟の経路測量 [E]
- REQ 2: 古代魔導核の回収 [D]
- PTY 0: 黒曜の斧 [D]
- PTY 1: 蒼穹の槍 [E]
- PTY 2: 鋼の絆 [E]
- PTY 3: 星読み [E]

### Day 1 手順

1. `未踏洞窟の経路測量 [E]`（REQ 1）を選択する。
2. `鋼の絆 [E]`（PTY 2、same-rank）を選択する。
   - Pass: 予測パネルに `推定依頼達成率 64.5%` 程度（許容範囲 ±1%）が表示される。
3. `黒曜の斧 [D]`（PTY 0、依頼に対して +1 等級）を選択する。
   - Pass: 予測値が更新される（`93.5%` 程度）。古い `鋼の絆` の値が一瞬も残らない。
4. 再び `鋼の絆 [E]`（PTY 2）を選択する。
   - Pass: 同じ `64.5%` が即座に再表示され、キャッシュ再利用であることが示唆される。
5. `街道周辺の魔物排除 [E]`（REQ 0）を選択し、`鋼の絆 [E]`（PTY 2）を再度選択する。
   - Pass: 予測値が `31.5%` 程度に変わる。
6. `この依頼を紹介する` をクリックする。
   - Pass: BrokeragePanel に `「この依頼なら対応できる。引き受けよう」` などの受諾メッセージ、受諾スコア `72/50`、判定詳細（Rank差 0、お気に入り、懐事情、危険志向）が表示される。
7. `本日の仲介を確定` をクリックする。
   - Pass: 遠征予測パネルが非表示になり、`TavernResultDetail` / `CampaignResultSummary` に実遠征結果 `completeSuccess`、最終 HP/MP/Morale、評判 `10 → 13 (+3)` が表示される。予測と実結果が別々に表示される。
8. `鋼の絆` の PartyCard を確認する。
   - Pass: `お気に入り 22/100`、`懐事情 22/100` など、関係性が更新されている。
9. キャンペーン履歴を展開する。
   - Pass: Day 1 に `affinityChanged`（お気に入り上昇）、`financialPressureChanged`（遠征結果で懐事情低下）、他パーティの `financialPressureChanged`（idle）が記録されている。

## +2 等級差の予測確認（Day 9）

Day 9 まで Day 1–8 の進行後、ボード例：

- REQ 0: 魔物出没原因の調査 [D]
- REQ 1: 古代魔導核の回収 [E]
- REQ 2: 負傷した冒険者の救出 [C]
- PTY 1: 石楠の棘 [D]
- PTY 2: 流水の滴 [D]
- PTY 3: 森影 [C]

### Day 9 手順

1. `古代魔導核の回収 [E]`（REQ 1）を選択する。
2. `石楠の棘 [D]`（PTY 1、+1 等級）を選択する。
   - Pass: 予測値 `62.0%` 程度が表示される。
3. `森影 [C]`（PTY 3、+2 等級）を選択する。
   - Pass: 予測値が `76.0%` 程度に更新される。旧値が残らない。
4. 再び `石楠の棘 [D]` を選択する。
   - Pass: `62.0%` が即座に再表示される（キャッシュ再利用）。
5. `森影 [C]` で `この依頼を紹介する` → `本日の仲介を確定` する。
   - Pass: 受諾（appropriate）、実遠征結果 `completeSuccess`、評判 `33 → 36 (+3)`。

## 14 日進行計画（シミュレーション確定値）

下記の選択を毎日実行する。予測値・結果はシミュレーション上の確定値（参考値）。

| Day | 依頼（index）                  | パーティ（index）  | 等級差 | 予測達成率 | 実遠征結果      | 評判    |
| --- | ------------------------------ | ------------------ | ------ | ---------- | --------------- | ------- |
| 1   | REQ 0 街道周辺の魔物排除 [E]   | PTY 2 鋼の絆 [E]   | 0      | 31.5%      | completeSuccess | 10 → 13 |
| 2   | REQ 0 魔物出没原因の調査 [E]   | PTY 0 黒曜の斧 [D] | -1     | 25.0%      | completeSuccess | 13 → 16 |
| 3   | REQ 0 行方不明調査員の救出 [E] | PTY 3 星読み [E]   | 0      | 66.5%      | completeSuccess | 16 → 19 |
| 4   | REQ 0 学者の護衛 [E]           | PTY 0 黒曜の斧 [D] | -1     | 65.0%      | completeSuccess | 19 → 22 |
| 5   | REQ 1 未踏洞窟の経路測量 [E]   | PTY 3 玻璃の鏡 [D] | -1     | 91.0%      | success         | 22 → 24 |
| 6   | REQ 0 商人の護衛 [D]           | PTY 3 石楠の棘 [D] | 0      | 73.5%      | completeSuccess | 24 → 27 |
| 7   | REQ 0 街道周辺の魔物排除 [D]   | PTY 3 森影 [C]     | -1     | 92.5%      | completeSuccess | 27 → 30 |
| 8   | REQ 0 負傷した冒険者の救出 [E] | PTY 0 玻璃の鏡 [D] | -1     | 86.5%      | completeSuccess | 30 → 33 |
| 9   | REQ 1 古代魔導核の回収 [E]     | PTY 3 森影 [C]     | -2     | 76.0%      | completeSuccess | 33 → 36 |
| 10  | REQ 0 未踏洞窟の経路測量 [E]   | PTY 0 玻璃の鏡 [D] | -1     | 88.5%      | completeSuccess | 36 → 39 |
| 11  | REQ 2 洞窟の魔物討伐 [C]       | PTY 3 森影 [C]     | 0      | 87.0%      | success         | 39 → 41 |
| 12  | REQ 0 魔物出没原因の調査 [D]   | PTY 3 森影 [C]     | -1     | 88.0%      | completeSuccess | 41 → 44 |
| 13  | REQ 0 街道周辺の魔物排除 [D]   | PTY 2 森影 [C]     | -1     | 92.5%      | completeSuccess | 44 → 47 |
| 14  | REQ 0 負傷した冒険者の救出 [D] | PTY 1 森影 [C]     | -1     | 84.0%      | completeSuccess | 47 → 50 |

※ 等級差は `依頼Rank - パーティRank`。負の値はパーティが依頼より高ランク（簡易）を示す。

## 各日共通の確認項目

1. **BrokeragePanel の受諾表示**
   - 受諾メッセージが表示される。
   - 受諾スコア / 閾値（例 `72/50`）が表示される。
   - 判定詳細を展開して `依頼Rank`、`パーティRank`、`Rank差`、`お気に入り`、`懐事情`、`危険志向`、スコア内訳（ベース / 適性 / リーダー判断 / 実力認識 / 成長 / 信頼 / 懐事情 / 危険志向 / HP状態 / Morale状態）が表示される。

2. **遠征結果と予測の分離**
   - `本日の仲介を確定` 後、遠征予測パネルが非表示になる。
   - `本日の結果` / `TavernResultDetail` に実遠征結果（outcome、各メンバーの HP/MP/Morale、撃破/逃走/生存など）が表示される。

3. **パーティカードの更新**
   - 遠征後、派遣したパーティの `成長 XP` / `成長回数` / `鍛錬日数` が更新される。
   - 派遣したパーティの `お気に入り` / `懐事情` / `危険志向` が更新される。
   - 回復中のパーティは `療養中（あとN日）` と表示され、HP/MP/Morale が回復完了後に更新される。

4. **キャンペーン履歴（CampaignHistory）の更新**
   - 各日の `Relationship` セクションに `affinityChanged`、`financialPressureChanged`、`stayExtended` イベントが含まれることを確認する。
   - 期待される滞在延長イベント（参考値）：
     - Day 3 → Day 4 進行時: 黒曜の斧 滞在延長 3 → 5 日（+2）
     - Day 4 → Day 5 進行時: 鋼の絆 4 → 6 日（+2）, 星読み 4 → 6 日（+2）
     - Day 10 → Day 11 進行時: 玻璃の鏡 10 → 14 日（+4）, 森影 10 → 12 日（+2）
     - Day 11 → Day 12 進行時: 石楠の棘 11 → 13 日（+2）
     - Day 12 → Day 13 進行時: 森影 12 → 14 日（+2）

5. **評判更新**
   - `CampaignHeader` の評判が `X / 100` 形式で更新される（例: Day 1 `10 → 13`）。

6. **回復 / パーティ状態**
   - 遠征後に `startedRecovery` イベントが発生したパーティは翌日以降 `療養中` と表示される。
   - `finishedRecovery` 後、HP/MP 全快、Morale が回復する。

## Console エラー確認

- ブラウザ DevTools Console で `error` または `unhandled rejection` が発生していないこと。
- Vite HMR の再接続ログ、React DevTools の info は許容する。

## 録画・成果物

- ブラウザを最大化してから `recording_start` を実行する。
- `annotate_recording` で setup、各 `test_start`、`assertion` を日本語で記録する。
- 実行後 `recording_stop` で録画を停止する。
- レポート `/home/ubuntu/repos/ai_battler/test-report-phase6-5.md` を作成する。

## Pass/Fail 基準

- 静的検証（typecheck / lint / test / build）がすべて通過する: PASS
- Day 1 で予測パネルが表示され、パーティ切り替えで更新され、元のパーティに戻すとキャッシュ値が即座に再表示される: PASS
- Day 1 / 各日で `この依頼を紹介する` 後、受諾メッセージと判定詳細が表示される: PASS
- `本日の仲介を確定` 後、実遠征結果が遠征予測と別に表示される: PASS
- 14 日進行し、各日の評判・HP/MP/Morale・関係性が更新される: PASS
- CampaignHistory に `affinityChanged`、`financialPressureChanged`、`stayExtended` イベントが含まれる: PASS
- ブラウザ console に error / unhandled rejection がない: PASS
