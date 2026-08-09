# Phase 6.3 roster-aware requests テスト計画

## 目的

`devin/phase6-3-roster-aware-requests` ブランチで、`generateTavernRequestsForDay` が滞在パーティの等級構成を考慮した `planRequestRanksForDay` を使うようになり、かつ `advanceCampaignDay` が `availablePartyRanks` 計算から療養中パーティを除外することを、`酒場キャンペーン` UI の end-to-end で検証する。

参考コード：

- `src/core/tavern/campaign/generators.ts` L162-214 `planRequestRanksForDay`
- `src/core/tavern/campaign/generators.ts` L241-265 `generateTavernRequestsForDay`
- `src/core/tavern/campaign/campaign.ts` L222-229 `availablePartyRanks` に `!isRecoveringOnDay` フィルタ
- `src/core/tavern/dayGenerator.ts` L43-50 スタンドアローン `generateTavernDay` でも `planRequestRanksForDay` を使用
- `src/ui/tavern/PartyCard.tsx` L19-34 療養中パーティは `disabled`
- `src/ui/tavern/ExpeditionPredictionPanel.tsx` L39-93 予測計算・stale 防止・キャッシュ

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-3-roster-aware-requests`
- サーバー: `npm run build && npm run preview -- --host` → `http://localhost:4173/`
- ブラウザ: 既存 Chrome
- Campaign seed: 既定 `tavern-campaign-001`

## 事前シミュレーション結果

既定 seed `tavern-campaign-001` を以下の通りに進めたときの各日ボード（スクリプト `/tmp/sim-full7-planned.ts` による）:

| 日    | 評判 | 全パーティ | 療養中 | 受諾可能 | 依頼等級 | 備考                                                        |
| ----- | ---- | ---------- | ------ | -------- | -------- | ----------------------------------------------------------- |
| Day 1 | 10   | D,E,E,E    | -      | D,E,E,E  | E,E,D    | `街道周辺の魔物排除(E)` × `《黒曜の斧》(D)` → forcedRetreat |
| Day 2 | 9    | D,E,E,E    | D      | E,E,E    | E,E,D    | `《黒曜の斧》` 療養中。D 依頼は E+1 の open スロット        |
| Day 3 | 9    | D,E,E,E    | -      | D,E,E,E  | D,E,D    | `《黒曜の斧》` 復帰                                         |
| Day 4 | 9    | E,E,E,E    | -      | E,E,E,E  | E,E,E    | E-only 日                                                   |
| Day 5 | 9    | E,E,E,C    | -      | E,E,E,C  | E,E,E    | `洞窟の魔物討伐(E)` × `《森影》(C)` → success               |
| Day 6 | 11   | E,E,E,C    | -      | E,E,E,C  | E,D,D    | 遠征後 `《森影》` HP/MP 全快、Morale +10                    |
| Day 7 | 11   | E,E,E,C    | -      | E,E,E,C  | E,E,E    | さらに Morale +10                                           |

## テストフロー

### A. 静的検証

1. `npm run typecheck` → 成功
2. `npm run lint` → 成功
3. `npm run test` → すべて pass
4. `rm -rf dist && npm run build` → 成功（Node.js 20.18.1 の Vite 警告のみ無視）
5. `npm run preview -- --host` を起動し `http://localhost:4173/` が応答することを確認

### B. 酒場キャンペーン起動

1. Chrome で `http://localhost:4173/` を開く。
2. `酒場キャンペーン` タブをクリック。
3. `Campaign Seed` が `tavern-campaign-001` であることを確認。違う場合は入力し `新しいキャンペーン` をクリック。
4. ブラウザウインドウを最大化する。
5. 録画を開始する。

### C. Day 1 — 遠征を実行し回復を発生させる

1. **Precondition**: ボードに依頼 3 件（等級 E,E,D）、パーティ 4 件（D,E,E,E）が表示される。
2. `RequestBoard` 内で 1 枚目の依頼カード（`街道周辺の魔物排除`、等級 E）をクリック。
3. `PartyBoard` 内で 1 枚目のパーティカード `《黒曜の斧》`（等級 D）をクリック。
4. `BrokeragePanel` の `この依頼を紹介する` ボタンをクリック。
5. **Pass**: リーダー判断が表示され、`accept`（受諾）になる。
6. `本日の仲介を確定` ボタンをクリック。
7. **Pass**: `TavernResultDetail` に `forcedRetreat` の実遠征結果が表示され、`ExpeditionPredictionPanel` は非表示になる。
8. `翌日へ` をクリックして Day 2 に進む。

### D. Day 2 — 療養中パーティを除外した依頼等級生成

1. **Precondition**: `《黒曜の斧》` のパーティカードに `療養中` と表示され、`disabled` 状態になっている。
2. **Precondition**: 残り 3 パーティの等級はすべて E。
3. `依頼板` の各依頼カードの等級を確認する。期待値：E, E, D。
4. **Pass**: いずれの依頼も等級 C/B/A/S を含まず、最高等級 D は `受諾可能` パーティの最高 E +1 以下である。
5. **Pass**: E 依頼が 2 件以上存在する（serviceable スロット）。
6. `本日の仲介を確定` をクリックし（紹介なし）、`翌日へ` をクリック。

### E. Day 3 — Day 4 — 等級上限の連続確認

1. Day 3: パーティ D,E,E,E が `受諾可能`、依頼等級 D,E,D。**Pass**: 最高等級 D = 最高パーティ D +0。
2. `本日の仲介を確定` → `翌日へ`。
3. Day 4: 全パーティ等級 E。依頼等級 E,E,E。**Pass**: E-only 日に D 以上の依頼が出現しない。
4. `本日の仲介を確定` → `翌日へ`。

### F. Day 5 — Prediction panel で stale/cache と等級差を確認

1. **Precondition**: パーティ `《黒曜の斧》` E、`《石楠の棘》` E、`《流水の滴》` E、`《森影》` C。依頼はすべて等級 E。
2. 依頼カード 1 枚目 `洞窟の魔物討伐` をクリック。
3. パーティカード 1 枚目 `《黒曜の斧》`（E）をクリック。
4. **Pass**: `ExpeditionPredictionPanel` に `推定依頼達成率 77%` と `有望`（`getPredictionLabel` による）が表示される（スクリプト `/tmp/day5-predictions.ts` 確認済み）。
5. パーティカード 4 枚目 `《森影》`（C）をクリック。
6. **Pass**: `推定依頼達成率` が 100% に更新され、`非常に有望` になる。古い 77% が一瞬でも `《森影》` に残らない。
7. 再び `《黒曜の斧》`（E）をクリック。
8. **Pass**: 同じ 77% が即座に再表示される（キャッシュ再利用）。
9. 依頼カード 2 枚目 `未踏洞窟の経路測量` をクリック（パーティ `《森影》` は選択されたまま）。
10. **Pass**: 達成率が 98% に更新され、古い 100% が残らない。
11. 依頼カード 1 枚目 `洞窟の魔物討伐` に戻す。
12. **Pass**: `《森影》` 選択状態で 100% が即座に再表示される。
13. `この依頼を紹介する` をクリック。
14. **Pass**: `appropriate` 受諾が表示される（予測 100% と独立した Acceptance）。
15. `本日の仲介を確定` をクリック。
16. **Pass**: `TavernResultDetail` に `success` の実遠征結果が表示され、予測パネルは非表示のままである。
17. `翌日へ` をクリック。

### G. Day 6 — 遠征後状態と新しい依頼等級

1. **Precondition**: `《森影》` が `受諾可能` で HP/MP 全快、Morale が前日より +10 されている。
2. キャンペーン履歴を開き、Day 5 の結果が `洞窟の魔物討伐: 成功 — 《森影》`、評判 `9 → 11` であることを確認する。
3. `依頼板` の等級を確認。**Pass**: E,D,D。最高パーティ C に対し、最高依頼 D = C+1。E 依頼が 2 件以上ある。
4. `本日の仲介を確定` → `翌日へ`。

### H. Day 7 — 新規到着・滞在満了と最終状態

1. **Precondition**: `《森影》` Morale が前日よりさらに +10 されている（例: 80/93/89/75）。
2. 必要に応じて `キャンペーン履歴` を確認し、これまで 6 日分以上の結果が記録されていることを確認する。
3. `本日の仲介を確定`（紹介なし）→ 録画を停止する。

### I. Console エラー

- ブラウザ console に error / unhandled rejection がないこと。Vite HMR や React DevTools の info メッセージのみ許容。

## Pass/FAIL 基準

- `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` がすべて通過：PASS
- 酒場キャンペーンが `tavern-campaign-001` で Day 1 を表示：PASS
- Day 1 `街道周辺の魔物排除(E)` × `《黒曜の斧》(D)` が forcedRetreat になり、翌日 `療養中` になる：PASS
- Day 2 `《黒曜の斧》` が `療養中` で、`disabled`、予測パネルで `療養中のため遠征予測できません`：PASS
- Day 2 依頼等級 [E,E,D] で最高 D（E+1）、かつ E 依頼が 2 件以上：PASS
- Day 4 E-only 日に全依頼等級 E：PASS
- Day 5 予測パネルが same-rank 77% → +2 rank 100% → same-rank 77% キャッシュ → 依頼切り替え 98% → 再選択 100% と更新される：PASS
- Day 5 `本日の仲介を確定` 後、予測パネルが非表示で実遠征結果 `success` が表示される：PASS
- Day 6 `《森影》` の HP/MP 全快、Morale 上昇、評判 9→11、履歴記録が更新される：PASS
- Day 6 依頼等級 [E,D,D] で最高 D = C+1、かつ E 依頼が 2 件以上：PASS
- 7 日分以上 advanced：PASS
- Console エラーなし：PASS
