# Phase 5.5 酒場仲介フロー テストレポート

## Overview

Phase 5.5 では、`酒場MVP` タブに **仲介（brokerage）/ 受諾判定（acceptance）エンジン** が導入された。

- 依頼板から 3 件の依頼を表示し、滞在パーティから 4 編成のパーティを表示する。
- 依頼とパーティを選択して `この依頼を紹介する` を実行すると、受諾 / 辞退が決まる。
- 受諾理由として `appropriate` / `challengingButSuitable` / `tooDangerous` / `poorFit` の 4 種類がある。
- 1 組以上のマッチが成立した後、`本日の仲介を確定` を押すと遠征が解決され、`本日の仲介結果` と `.result-detail`（`受諾パーティ` + HP など）が表示される。

このレポートは、ブラウザ E2E テストで確認した内容、サンプル日、および既知の制限をまとめたものである。

## Acceptance Engine

判定ロジックは `src/core/tavern/acceptance.ts` で実装されている。

- `rankGap = requestRank - partyRank`
  - `rankGap >= 2` → `declined` / `tooDangerous`
  - `rankGap == 1` かつ `relevantRoleCount >= 3` かつ `leaderJudgment >= 55` → `accepted` / `challengingButSuitable`
  - `rankGap == 1` かつ `relevantRoleCount < 3` → `declined` / `poorFit`
  - `rankGap == 1` かつ `relevantRoleCount >= 3` かつ `leaderJudgment < 55` → `declined` / `tooDangerous`
  - `rankGap == 0` かつ `relevantRoleCount >= 1` → `accepted` / `appropriate`
  - `rankGap == 0` かつ `relevantRoleCount == 0` → `declined` / `poorFit`
  - `rankGap < 0` → `accepted` / `appropriate`
- 関連 Role は依頼の `objectiveType` と `environment` から決まる。
- リーダー判断力は `(int + per + leadership) / 3` を四捨五入した値（0–100）。

UI 上では `BrokeragePanel.tsx` が `acceptanceReasonText(reason)` で各理由に対応した flavor テキストを表示する。

## Acceptance Statistics

Evaluated 1000 day seeds × 12 pairs = 12000 request-party pairs.

### Overall

| Metric                | Count | Percentage |
| --------------------- | ----- | ---------- |
| Total evaluated pairs | 12000 | 100.00     |
| Accepted              | 8641  | 72.01      |
| Declined              | 3359  | 27.99      |
| Acceptance rate       | —     | 72.01      |

### By reason

| Reason                 | Count | Percentage |
| ---------------------- | ----- | ---------- |
| appropriate            | 8243  | 68.69      |
| challengingButSuitable | 398   | 3.32       |
| tooDangerous           | 1953  | 16.28      |
| poorFit                | 1406  | 11.72      |

### By rankGap

| rankGap | Offers | Accepted | Declined | Acceptance rate |
| ------- | ------ | -------- | -------- | --------------- |
| <= -2   | 1922   | 1922     | 0        | 100.00          |
| -1      | 2976   | 2976     | 0        | 100.00          |
| 0       | 3494   | 3345     | 149      | 95.74           |
| 1       | 2467   | 398      | 2069     | 16.13           |
| >= 2    | 1141   | 0        | 1141     | 0.00            |

### rankGap = 1 breakdown

| Decision               | Count | Percentage within rankGap=1 |
| ---------------------- | ----- | --------------------------- |
| Total rankGap=1        | 2467  | 100.00                      |
| challengingButSuitable | 398   | 16.13                       |
| poorFit                | 1257  | 50.95                       |
| tooDangerous           | 812   | 32.91                       |

### By objective

| Objective     | Evaluated | Accepted | Declined | Acceptance rate |
| ------------- | --------- | -------- | -------- | --------------- |
| investigation | 1992      | 1437     | 555      | 72.14           |
| elimination   | 1968      | 1443     | 525      | 73.32           |
| rescue        | 2064      | 1476     | 588      | 71.51           |
| escort        | 2020      | 1481     | 539      | 73.32           |
| retrieval     | 1944      | 1377     | 567      | 70.83           |
| survey        | 2012      | 1427     | 585      | 70.92           |

### By party template

| Template           | Offers | Accepted | Declined | Acceptance rate |
| ------------------ | ------ | -------- | -------- | --------------- |
| arcane             | 1482   | 1125     | 357      | 75.91           |
| arcane-exploration | 1530   | 1106     | 424      | 72.29           |
| assault            | 1557   | 971      | 586      | 62.36           |
| balanced           | 1455   | 1020     | 435      | 70.10           |
| exploration        | 1434   | 1054     | 380      | 73.50           |
| ranged             | 1494   | 1113     | 381      | 74.50           |
| support-heavy      | 1497   | 1036     | 461      | 69.21           |
| versatile          | 1551   | 1216     | 335      | 78.40           |

### Invariant checks

- rankGap >= 2 → accepted = 0: PASS
- rankGap < 0 → declined = 0: PASS
- challengingButSuitable → rankGap == 1, relevantRoleCount >= 3, leaderJudgment >= 55: PASS

Acceptance engine code was not modified; these statistics are observational only.

## Day Generation

`src/core/tavern/dayGenerator.ts` は `generateTavernDay(seed)` を提供する。

- 6 種類の `objectiveType`（investigation / elimination / rescue / escort / retrieval / survey）から重複なく 3 種類を選択。
- 依頼 rank は `E/D/C/B` の重み付き抽選（weights `[20,35,35,10]`）。
- 4 編成のパーティプールを生成。`partyGenerator.ts` は 8 種類のテンプレートから 4 つをシャッフルで選び、rank も `E/D/C/B` の重み付き抽選で決定。
- すべての生成は `SeededRng` によって決定的。

## UI/UX

`src/ui/tavern/TavernSimulator.tsx` を中心に以下のコンポーネントが構成されている。

- `TavernControls`：Day Seed 入力、`このSeedで生成`、`新しい日`。
- `RequestBoard` / `RequestCard`：3 件の依頼、`objectiveType` ラベル、rank、environment、publicTags、紹介状態を表示。
- `PartyBoard` / `PartyCard`：4 編成のパーティ、リーダー、メンバー（rank/role）、受諾状態を表示。
- `BrokeragePanel`：依頼紹介 UI。`この依頼を紹介する` ボタン、受諾/辞退結果、判定詳細、紹介履歴、`本日の仲介を確定` ボタンを表示。
- `DispatchResults` / `TavernResultDetail`：仲介確定後の結果一覧と詳細。詳細には `受諾パーティ`、HP、`重要facts`、遠征結果、戦闘結果、Objective summary が含まれる。

## Determinism

同じ seed で同じ（依頼, パーティ）を紹介すると、受諾/辞退と reason が同一になることを確認した。

- `tavern-005` の「旧坑道東部の測量（C）」を「森影（E）」に紹介すると、`辞退 / tooDangerous`（`Rank差: 2`）。
- 同 seed を再生成して同じ組み合わせを紹介しても、同じ `辞退 / tooDangerous` が得られた。

## Recorded E2E

実行内容と結果を以下に示す。

| 項目                           | 結果                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`            | 成功                                                                                                                           |
| `npm run lint`                 | 成功                                                                                                                           |
| `npm run test`                 | 607 tests passed                                                                                                               |
| `rm -rf dist && npm run build` | 成功（Vite Node バージョン警告のみ）                                                                                           |
| 酒場MVP タブ起動               | `http://localhost:5173`                                                                                                        |
| `tavern-005` 生成              | 3 request / 4 party 確認                                                                                                       |
| Mismatch（tooDangerous）       | 森影(E) → 旧坑道東部の測量(C) で `辞退: tooDangerous`                                                                          |
| Determinism                    | 再生成後も同じ結果                                                                                                             |
| Basic brokerage                | 洞窟の魔物討伐(D) を蒼穹の槍(C) に紹介し `appropriate` で受諾                                                                  |
| challengingButSuitable         | 旧坑道東部の測量(C) を鉄梟(D) に紹介し `challengingButSuitable` で受諾（`Rank差: 1`、`関連Role数: 3/4`、`リーダー判断力: 57`） |
| 本日の仲介を確定               | 結果一覧と `result-detail` に `受諾パーティ` + HP が表示                                                                       |
| 全6目的 smoke                  | `tavern-001/002/005` で調査・護衛・救出・討伐・回収・測量を確認                                                                |
| Console エラー                 | `window.__errors` 空、DevTools でもエラーなし                                                                                  |

録画ファイル: `/home/ubuntu/screencasts/rec-25fdff56-e3dc-451a-91d0-1fd75f3ea2ec/rec-25fdff56-e3dc-451a-91d0-1fd75f3ea2ec-edited.mp4`

## Sample Day: `tavern-005`

以下は `tavern-005` で生成された実際の 3 依頼と 4 編成、および上記のマッチで仲介確定した結果である。

```json
{
  "seed": "tavern-005",
  "requests": [
    {
      "id": "tavern-request-0-tavern-005",
      "title": "洞窟の魔物討伐",
      "objectiveType": "elimination",
      "rank": "D",
      "environment": "cave"
    },
    {
      "id": "tavern-request-1-tavern-005",
      "title": "旧坑道東部の測量",
      "objectiveType": "survey",
      "rank": "C",
      "environment": "cave"
    },
    {
      "id": "tavern-request-2-tavern-005",
      "title": "行方不明調査員の救出",
      "objectiveType": "rescue",
      "rank": "B",
      "environment": "swamp"
    }
  ],
  "parties": [
    {
      "id": "tavern-party-0-tavern-005",
      "name": "森影",
      "rank": "E",
      "members": [
        { "name": "レオ ノース", "role": "guardian", "rank": "E" },
        { "name": "レイラ エルウィン", "role": "ranger", "rank": "E" },
        { "name": "ゴウ リーフ", "role": "ranger", "rank": "E" },
        { "name": "カイン クロム", "role": "healer", "rank": "E" }
      ]
    },
    {
      "id": "tavern-party-1-tavern-005",
      "name": "鉄梟",
      "rank": "D",
      "members": [
        { "name": "ガルド クレスト", "role": "guardian", "rank": "D" },
        { "name": "ハロルド ハインド", "role": "ranger", "rank": "D" },
        { "name": "レイラ ハインド", "role": "mage", "rank": "D" },
        { "name": "レオ ムーン", "role": "support", "rank": "D" }
      ]
    },
    {
      "id": "tavern-party-2-tavern-005",
      "name": "蒼穹の槍",
      "rank": "C",
      "members": [
        { "name": "ロイド オーシャン", "role": "vanguard", "rank": "C" },
        { "name": "エルナ クォーツ", "role": "vanguard", "rank": "C" },
        { "name": "ティア ノース", "role": "guardian", "rank": "C" },
        { "name": "ティア ハインド", "role": "healer", "rank": "C" }
      ]
    },
    {
      "id": "tavern-party-3-tavern-005",
      "name": "山猫の爪",
      "rank": "D",
      "members": [
        { "name": "フレイア リバー", "role": "vanguard", "rank": "D" },
        { "name": "ティア クォーツ", "role": "guardian", "rank": "D" },
        { "name": "ベル オーシャン", "role": "scout", "rank": "D" },
        { "name": "ベル エルウィン", "role": "healer", "rank": "D" }
      ]
    }
  ]
}
```

仲介確定結果（マッチ：洞窟の魔物討伐 → 蒼穹の槍、旧坑道東部の測量 → 鉄梟）：

| 依頼                 | 受諾パーティ | outcome              | battle           | objective progress    |
| -------------------- | ------------ | -------------------- | ---------------- | --------------------- |
| 洞窟の魔物討伐       | 蒼穹の槍     | 撤退 (forcedRetreat) | 撤退 (retreat)   | 25%                   |
| 旧坑道東部の測量     | 鉄梟         | 撤退 (forcedRetreat) | 膠着 (stalemate) | 50%（Coverage 33.3%） |
| 行方不明調査員の救出 | なし         | 仲介不成立           | —                | —                     |

受諾パーティ HP（蒼穹の槍）：

- ロイド オーシャン (vanguard C) — HP 7/68
- エルナ クォーツ (vanguard C) — HP 17/68
- ティア ノース (guardian C) — HP 83/87
- ティア ハインド (healer C) — HP 0/52 [死亡]

受諾パーティ HP（鉄梟）：

- ガルド クレスト (guardian D) — HP 7/73
- ハロルド ハインド (ranger D) — HP 43/50
- レイラ ハインド (mage D) — HP 54/61
- レオ ムーン (support D) — HP 44/52

## Known Limitations

- テストハーネス上では、画面下部のボタンや座標ベースの入力がネイティブクリックで反応しないことがある。`browser_console` から `document.querySelector(...).click()` や `input.focus()` + `computer` ツールの `type` を併用することで回避した。UI ハンドラ自体に問題はない。
- `npm run build` / `npm run dev` 実行時に Node.js 20.18.1 に対する Vite バージョン警告が出力されるが、ビルド・dev server ともに成功する。
- `BrokeragePanel` の判定詳細 `<details>` 要素はデフォルトで折りたたまれており、録画では `▼ 判定詳細` をクリックして展開する必要がある。
- Party は毎日生成し直される。
- Party 永続化はない。
- Party 実績はない。
- Party Rank 成長はない。
- Member 加入/脱退はない。
- 性格や人間関係はない。
- 報酬による受諾判断はない。
- 酒場評判の影響はない。
- 複数日 campaign はない。
- Acceptance は deterministic rule-based である。
- AI 会話や LLM 受諾判断はない。
- 未来の遠征結果は参照しない。

## 参考ファイル

- `src/core/tavern/acceptance.ts`
- `src/core/tavern/brokerage.ts`
- `src/core/tavern/dayGenerator.ts`
- `src/core/tavern/partyGenerator.ts`
- `src/ui/tavern/TavernSimulator.tsx`
- `src/ui/tavern/BrokeragePanel.tsx`
- `src/ui/tavern/TavernResultDetail.tsx`
