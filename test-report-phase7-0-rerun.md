# Phase 7.0 AI 物語生成 UI E2E 再テストレポート（console 修正後）

## 概要

- ブランチ: `devin/phase7-0-ai-narrative-mvp`
- サーバー: `npm run dev` → `http://localhost:5173/`
- テストツール: Playwright ヘッドフル Chromium
- Campaign seed: `phase7-search-155`
- 録画: `/home/ubuntu/screencasts/phase7-0-narrative-e2e-rerun/phase7-0-narrative-e2e-rerun-edited.mp4`
- 目的: `NarrativeCandidateCard` の checkbox 制御/非制御修正後、console エラーが完全に消えたことを確認する。

## 静的検証

| コマンド            | 結果                                                      |
| ------------------- | --------------------------------------------------------- |
| `npm run typecheck` | PASS                                                      |
| `npm run lint`      | PASS                                                      |
| `npm run test`      | PASS（761 tests）                                         |
| `npm run build`     | PASS（前回実施済み、今回 typecheck/lint/test で問題なし） |

## テスト手順と結果

### 1. Cost Control — プロバイダ未接続で AI 呼び出しが発生しない

- Day 1 確定・翌日進行後の NarrativeQueue サマリー: `AI呼び出し: 0回` / `状態: AI未接続`
- **PASS**

![cost-control](https://app.devin.ai/attachments/5d9d9ddd-9e85-4820-b9c0-e206eeb0fece/ss_02-cost-control-summary.png)

### 2. Expedition 生成 — Fake Provider 接続と初回生成

- `開発用 Fake Provider を使う` 接続後、`遠征レポート：洞窟の魔物討伐` を生成
- 生成テキスト: `【Fake生成 #1】` / `model: fake-model` / `provider: fake` / `tokens: 156`
- `AI呼び出し: 1回` に更新
- **PASS**

![fake-provider](https://app.devin.ai/attachments/9dc605ae-e0ce-4733-a4b9-710fece7e9fc/ss_03-fake-provider-connected.png)
![expedition](https://app.devin.ai/attachments/56d205e7-a102-4ee6-a29c-5ffe77890845/ss_04-expedition-generated.png)

### 3. Character Event 生成 — `partyArrival` と `becameRegular`

- Day 5 に `新しい顔：砂塵の露`（`partyArrival`）を生成
- Day 6 に `常連になった：灰狼の牙`（`becameRegular`）を生成
- 各生成テキストに `Event Type: partyArrival` / `becameRegular` が含まれる
- **PASS**

![party-arrival](https://app.devin.ai/attachments/867c1bbb-ef07-48f4-add3-b7736ea0c7d5/ss_06-party-arrival-generated.png)
![became-regular](https://app.devin.ai/attachments/52703f90-088f-4c78-919d-52b2f2f0ddba/ss_10-became-regular.png)

### 4. Bulk 生成

- 未生成の `partyArrival` 候補を 2 件選択し、一括生成ボタンを実行
- 2 件とも `生成済み` に変化し、`AI呼び出し` が 3 → 5 に増加
- **PASS**

![bulk](https://app.devin.ai/attachments/39ffa76b-9805-403a-abb6-54ae790e7ca3/ss_11-bulk-generated.png)

### 5. Dismiss / Restore

- 未生成の `weakObjectiveSuccess` 候補を `非表示` → `復元`
- `AI呼び出し` カウントは変化せず
- **PASS**

![dismissed](https://app.devin.ai/attachments/ca850787-0439-4ae7-af33-7507c0a5bc55/ss_07-dismissed.png)
![restored](https://app.devin.ai/attachments/3f0368f9-a08e-450d-8600-3155cbbff352/ss_08-restored.png)

### 6. Provider エラー — 無効な HTTP エンドポイント

- エンドポイント `http://localhost:5173/invalid`、モデル `none` で HTTP Provider 接続
- 生成実行後、`AI文章の生成に失敗しました。HTTP 404:` と赤文字表示
- `AI呼び出し` カウント増加なし
- `開発用 Fake Provider を使う` に切り替えて翌日進行可能
- **PASS**

![provider-error](https://app.devin.ai/attachments/e3bf59af-36ba-4a71-9028-26339a1c9ff3/ss_09-provider-error.png)

### 7. Farewell 生成 — 好感度 60 以上でパーティ離脱

- Day 13 まで進行し、Day 14 開始時に `別れの挨拶：灰狼の牙`（`farewell`）が出現
- 生成後、`AI呼び出し` が 5 → 6 に増加
- 生成テキストに `Event Type: farewell` / `Party: 灰狼の牙` を含む
- **PASS**

![day14-queue](https://app.devin.ai/attachments/2a22d086-bf95-4b22-a798-c3307639f043/ss_12-day14-queue.png)
![farewell](https://app.devin.ai/attachments/c2899381-4945-4508-b16c-861da61be273/ss_13-farewell-generated.png)

### 8. Console エラー確認

- `console.error` から React 制御/非制御 input 警告は完全に消滅
- `Failed to load resource: the server responded with a status of 404` は Provider エラーテストで意図的に発生させたネットワークエラーのみ
- Page Error / Unhandled Rejection / その他 JS ランタイムエラーなし
- **PASS**

![final](https://app.devin.ai/attachments/1d124690-2c4e-49fa-8bcd-c73babcc005d/ss_14-final.png)

## 総括

- Phase 7.0 の全受け入れ条件（Cost Control、Expedition 生成、Character Event 生成、Farewell 生成、Bulk 生成、Dismiss/Restore、Provider エラー後の翌日進行、console エラー 0 件）を満たしました。
- `NarrativeCandidateCard` の checkbox 修正により、前回あった React 制御/非制御切り替え警告が解消されました。

## 成果物パス

- 録画: `/home/ubuntu/screencasts/phase7-0-narrative-e2e-rerun/phase7-0-narrative-e2e-rerun-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase7-0-rerun.md`
- コンソールログ: `/home/ubuntu/screenshots/phase7-0-console-rerun.log`
- 主なスクリーンショット: `/home/ubuntu/screenshots/ss_02-cost-control-summary.png` など

## 提案 PR コメント

```markdown
## Phase 7.0 AI 物語生成 UI E2E 再テスト結果（console 修正後）

- `npm run typecheck` / `npm run lint` / `npm run test`（761 tests）がすべて通過しました。
- `npm run dev` で `http://localhost:5173/` を起動し、seed `phase7-search-155` で 14 日進行させる録画付きブラウザ E2E を再実施しました。
- `NarrativeCandidateCard` の checkbox 修正後、前回の React 制御/非制御 input 警告は完全に消え、console エラー 0 件（Provider エラーテストの意図的 404 を除く）を確認しました。

### 確認できたこと

1. **Cost Control**: Day1 確定・翌日進行後も `AI呼び出し: 0回` / `状態: AI未接続`。
2. **Expedition 生成**: Fake Provider で `遠征レポート：洞窟の魔物討伐` を生成。`【Fake生成 #1】` / `model: fake-model` / `tokens: 156` / `AI呼び出し: 1回`。
3. **Character Event**: `partyArrival`（新しい顔）と `becameRegular`（常連）を生成。
4. **Bulk 生成**: 未生成 `partyArrival` 2 件を選択して一括生成。`AI呼び出し` が 3 → 5 に増加。
5. **Dismiss / Restore**: 候補を `非表示` → `復元` しても `AI呼び出し` カウント変化なし。
6. **Provider エラー**: `http://localhost:5173/invalid` で `AI文章の生成に失敗しました。HTTP 404:` を表示。Fake Provider に戻して翌日進行可能。
7. **Farewell**: Day14 開始時に `別れの挨拶：灰狼の牙` が出現し、生成後 `AI呼び出し` は 5 → 6 に増加。

### キー証拠

<details open>
<summary>Cost Control: AI呼び出し 0回 / AI未接続</summary>

![cost-control](https://app.devin.ai/attachments/5d9d9ddd-9e85-4820-b9c0-e206eeb0fece/ss_02-cost-control-summary.png)

</details>

<details>
<summary>Expedition 生成（Fake Provider）</summary>

![expedition](https://app.devin.ai/attachments/56d205e7-a102-4ee6-a29c-5ffe77890845/ss_04-expedition-generated.png)

</details>

<details>
<summary>partyArrival / becameRegular 生成</summary>

![party-arrival](https://app.devin.ai/attachments/867c1bbb-ef07-48f4-add3-b7736ea0c7d5/ss_06-party-arrival-generated.png)

![became-regular](https://app.devin.ai/attachments/52703f90-088f-4c78-919d-52b2f2f0ddba/ss_10-became-regular.png)

</details>

<details>
<summary>Bulk 生成</summary>

![bulk](https://app.devin.ai/attachments/39ffa76b-9805-403a-abb6-54ae790e7ca3/ss_11-bulk-generated.png)

</details>

<details>
<summary>Provider エラー（HTTP 404）</summary>

![provider-error](https://app.devin.ai/attachments/e3bf59af-36ba-4a71-9028-26339a1c9ff3/ss_09-provider-error.png)

</details>

<details>
<summary>Farewell 生成</summary>

![farewell](https://app.devin.ai/attachments/c2899381-4945-4508-b16c-861da61be273/ss_13-farewell-generated.png)

</details>

- 録画: `/home/ubuntu/screencasts/phase7-0-narrative-e2e-rerun/phase7-0-narrative-e2e-rerun-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase7-0-rerun.md`
```

## SKILL.md / Blueprint 更新

- 新規 SKILL.md 作成/更新はなし。
- Blueprint 変更権限がないため、`npm run dev` / Vite ローカルサーバー起動手順は既存 blueprint でカバーされています。Playwright ヘッドフル E2E 環境は `/tmp/pw-e2e` へ手動インストールしたため、継続利用時は `npm install -D @playwright/test` + `npx playwright install` の追加を検討してください。
