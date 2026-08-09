# Phase 6.3 roster-aware request rank テストレポート

## 概要

`devin/phase6-3-roster-aware-requests`（PR #19）の変更を、`npm run build && npm run preview -- --host` の `http://localhost:4173/` で録画付き end-to-end テストしました。`tavern-campaign-001` を 7 日間進行させ、依頼等級が滞在パーティ（療養中を除く）に応じて制限されること、Prediction パネルの stale/cache 動作、派遣後の HP/MP/Morale・評判・履歴更新を確認しました。

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-3-roster-aware-requests`
- サーバー: `npm run build && npm run preview -- --host` → `http://localhost:4173/`
- Campaign seed: `tavern-campaign-001`
- 録画: `/home/ubuntu/screencasts/phase6-3-e2e/phase6-3-e2e-edited.mp4`

## 静的検証

| コマンド                       | 結果                                     |
| ------------------------------ | ---------------------------------------- |
| `npm run typecheck`            | 成功                                     |
| `npm run lint`                 | 成功                                     |
| `npm run test`                 | 667 tests passed                         |
| `rm -rf dist && npm run build` | 成功（Node.js 20.18.1 の Vite 警告のみ） |

## 実行シナリオと結果

### Day 1 — 遠征で回復を発生させる

- 依頼 `街道周辺の魔物排除` (E) とパーティ `《黒曜の斧》` (D) を選択。
- 遠征予測は `23% 非常に危険` を表示。
- `この依頼を紹介する` → リーダー受諾（`appropriate`）。
- `本日の仲介を確定` → 実遠征結果 `forcedRetreat`、戦闘 `retreat`、レオ サンド HP 69→28。
- 評判 `10 → 9`、履歴に `Day 1 — 評判 10 →9 (-1)` を記録。
- **結果: PASS**

### Day 2 — 療養中パーティを除外した依頼等級生成

- `《黒曜の斧》` が `療養中（あと1日）` になり、カードが `disabled`。
- 受諾可能パーティは E ランク 3 件のみ。
- 依頼等級は `[E, E, D]`。最高依頼 D = 最高受諾可能等級 E + 1（challenge slot）。
- いずれも C/B/A/S ではなく、E 依頼が 2 件以上ある。
- **結果: PASS**

![Day2 recovering and request ranks](https://app.devin.ai/attachments/fb0f6a75-8c15-40d7-bc35-a866cde8cbc6/ss_3d8b7e35.png)

### Day 3 — 回復完了と等級上限の継続確認

- `《黒曜の斧》` が `受諾可能` に戻り、HP/MP 全快、Morale 上昇。
- 依頼等級 `[D, E, D]`、最高 D = 最高パーティ D + 0。
- **結果: PASS**

### Day 4 — E-only 日の依頼等級

- 全パーティ E、全依頼等級 E。
- 新規到着 `《黒曜の斧》` (E) を確認。
- **結果: PASS**

![Day4 E-only roster and E-only requests](https://app.devin.ai/attachments/de46b879-9358-4ccc-80eb-84c7069b79e6/ss_839fc8cb.png)

### Day 5 — Prediction パネルの stale/cache と等級差

- 依頼 `洞窟の魔物討伐` (E) を選択。
- `《黒曜の斧》` (E) 選択 → `推定依頼達成率 77% 有望`。
- `《森影》` (C) 選択 → `100% 非常に有望` に更新。古い 77% が一瞬も残らない。
- `《黒曜の斧》` (E) に戻す → 同じ 77% が即座に再表示（キャッシュ再利用）。
- 別依頼 `未踏洞窟の経路測量` (E) を `《森影》` (C) で選択 → `98%` に更新。
- 再び `洞窟の魔物討伐` + `《森影》` → `100%` キャッシュ再表示。
- `この依頼を紹介する` → リーダー `appropriate` で受諾。
- `本日の仲介を確定` → 予測パネルが非表示、実遠征結果 `success` / 戦闘 `victory`、評判 `9 → 11 (+2)`。
- **結果: PASS**

| 同依頼 E → C                                                                                        | 元の組み合わせに戻る（キャッシュ）                                                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ![77 to 100](https://app.devin.ai/attachments/994884af-cd5d-408c-8213-0c938a930adc/ss_b002e8b2.png) | ![100 cached](https://app.devin.ai/attachments/91dce7e7-f570-43ea-baa2-8cf8cb47d30a/ss_788945c5.png) |

| 別依頼切り替え 98%                                                                                                | resolve 後、実遠征結果 `success`                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ![98 on different request](https://app.devin.ai/attachments/19ce4c96-4202-4492-ac39-4931cc6bb02b/ss_516b9960.png) | ![resolve success detail](https://app.devin.ai/attachments/00d19af8-284d-4a38-96d9-5ce40b585d41/ss_5cf6d31b.png) |

### Day 6 — 遠征後状態と新しい依頼等級

- `《森影》` が `受諾可能` で HP/MP 全快、Morale `70 / 83 / 79 / 65`。
- 依頼等級 `[E, D, D]`、最高 D = 最高パーティ C + 1。
- **結果: PASS**

![Day6 post-expedition and E,D,D requests](https://app.devin.ai/attachments/47477ad7-ce25-4df5-8e99-c582ace699ab/ss_952c49c5.png)

### Day 7 — 最終日の継続確認

- `《森影》` Morale さらに `80 / 93 / 89 / 75`、HP/MP 全快。
- 全依頼等級 E（E-only から C パーティありの状態でも高ランク依頼は出現せず）。
- キャンペーン履歴に 6 日分が記録されている。
- **結果: PASS**

![Day7 final state](https://app.devin.ai/attachments/39e5b867-64ce-4bc2-a2d6-fa0b630f5f19/ss_cb7f7a96.png)

### Console エラー

- ブラウザ console に error / unhandled rejection は検出されなかった。
- Vite HMR 再接続ログと React DevTools info のみ。
- **結果: PASS**

## 録画

`/home/ubuntu/screencasts/phase6-3-e2e/phase6-3-e2e-edited.mp4`

https://app.devin.ai/attachments/eb8426f5-27bc-4961-9c0f-2afbc088798e/phase6-3-e2e-edited.mp4

## 提案 PR コメント

```markdown
## Phase 6.3 roster-aware request rank テスト結果

- `npm run typecheck`、`npm run lint`、`npm run test`（667 tests）、`npm run build` がすべて通過しました。
- `npm run build && npm run preview -- --host` で `http://localhost:4173` を起動し、`tavern-campaign-001` を 7 日間進行させて `酒場キャンペーン` UI を録画付き E2E で検証しました。

### 確認できたこと

1. **療養中パーティを除外した依頼等級生成**
   - Day 1 `《黒曜の斧》` (D) + `街道周辺の魔物排除` (E) で `forcedRetreat`、Day 2 には `療養中（あと1日）`。
   - Day 2 の受諾可能パーティは E のみ。依頼等級は `[E, E, D]` で、D は `最高受諾可能等級 E + 1` の challenge slot。C/B/A/S は出現しない。
2. **E-only 日の依頼等級**
   - Day 4 は全パーティ E、全依頼等級 E。
3. **Prediction パネルの更新・stale 防止・キャッシュ**
   - `洞窟の魔物討伐` (E) + `《黒曜の斧》` (E) → 77% 有望。
   - 同じ依頼 + `《森影》` (C) → 100% 非常に有望。古い値が一瞬も残らない。
   - 元の E パーティに戻すと同じ 77% が即座に再表示。
   - 別依頼 + `《森影》` (C) → 98% に更新。
4. **予測と実遠征結果の分離**
   - `本日の仲介を確定` 後、予測パネルは非表示、実際の遠征結果 `success` / `victory`、評判 `9 → 11 (+2)` が表示される。
5. **遠征後の状態更新**
   - Day 6 `《森影》` HP/MP 全快、Morale `70 / 83 / 79 / 65`、依頼等級 `[E, D, D]` は最高パーティ C + 1 以下。
   - Day 7 でも `《森影》` Morale `80 / 93 / 89 / 75`、全依頼 E、履歴に 6 日分記録。
6. **Console エラーなし**

### キー証拠

<details open>
<summary>Day 2: 療養中パーティを除外しつつ challenge slot D</summary>

![Day2](https://app.devin.ai/attachments/fb0f6a75-8c15-40d7-bc35-a866cde8cbc6/ss_3d8b7e35.png)

</details>

<details>
<summary>Day 5: prediction 77% → 100% → cached 100%</summary>

| E party 77%                                                                                  | C party 100%                                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ![77](https://app.devin.ai/attachments/994884af-cd5d-408c-8213-0c938a930adc/ss_b002e8b2.png) | ![100](https://app.devin.ai/attachments/91dce7e7-f570-43ea-baa2-8cf8cb47d30a/ss_788945c5.png) |

</details>

<details>
<summary>Day 5 resolve: 予測と実遠征結果の分離</summary>

![resolve](https://app.devin.ai/attachments/00d19af8-284d-4a38-96d9-5ce40b585d41/ss_5cf6d31b.png)

</details>

<details>
<summary>Day 6: 遠征後 HP/MP 全快と roster-aware 依頼等級</summary>

![Day6](https://app.devin.ai/attachments/47477ad7-ce25-4df5-8e99-c582ace699ab/ss_952c49c5.png)

</details>

- 録画: `/home/ubuntu/screencasts/phase6-3-e2e/phase6-3-e2e-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase6-3.md`
```

## SKILL.md / Blueprint 更新

- SKILL.md: `/home/ubuntu/repos/ai_battler/.agents/skills/ai-battler/SKILL.md` に Phase 6.3 の自然なテストシナリオと JS selector フォールバックのメモを追加しました。
- Blueprint: 既存 blueprint は `npm run typecheck` / `lint` / `test` / `build` / `dev` を網羅しています。今回 `npm run build && npm run preview -- --host` を使用したため、preview 起動手順も blueprint に含めることを推奨します。

## ユーザー側で必要な対応

- なし。認証情報や追加環境設定は不要でした。

## 補足・テスト運用メモ

- 初回 `preview` 起動時、`node_modules/.vite` キャッシュの影響か古い dist が表示されたため、`rm -rf node_modules/.vite && rm -rf dist && npm run build` し直したところ最新ビルドが反映されました。
- ページ下部のボタンはテストハーネス上でネイティブクリックが反応しない場合があるため、`document.querySelectorAll('.request-card')[n].click()` 等の JS フォールバックを使用しました。UI ハンドラ自体は正常に動作しました。

## 総括

Phase 6.3 の主要な受け入れ条件はすべて満たしました。

- 7 日以上 advanced。
- 依頼等級が受諾可能パーティの最高等級 +1 を超えない（療養中は除外）。
- E-only / ほぼ E の日に D 以上の依頼が出現しない、または challenge slot で +1 のみ。
- Prediction パネルが正しく更新され、stale にならず、キャッシュが再利用される。
- 予測と実遠征結果が別々に表示される。
- 遠征後の HP/MP/Morale、評判、履歴が正常に更新される。
- Console エラーなし。
