# Phase 4: 遠征ビジュアルシミュレーター

## 概要

Phase 4では、既存の決定論的 `runExpedition()` エンジンを変更せず、ブラウザ上で遠征結果を可視化・再生する UI を `src/ui/expedition/` に追加した。

- `runExpedition(request, party)` は 1 回の呼び出しで `ExpeditionResult` を生成する。
- UI は `result.state.logs` を `buildReplayEvents(result)` で時系列イベントに変換し、タイムラインとして再生する。
- 既存の戦闘シミュレーター UI は維持し、`App.tsx` のタブ `[戦闘シミュレーター] [遠征シミュレーター]` で切り替える。

## 追加ファイル

- `src/ui/expedition/presets.ts` — 6 種類の依頼プリセットと `buildRequest`/`buildParty`
- `src/ui/expedition/labels.ts` — 日本語ラベルマップ
- `src/ui/expedition/names.ts` — 小型マップヘルパー
- `src/ui/expedition/replay.ts` — `buildReplayEvents` / `buildReplayItems`
- `src/ui/expedition/expeditionSimulator.css` — 遠征 UI 用スタイル
- `src/ui/expedition/ExpeditionControls.tsx` — 設定フォーム・パーティプレビュー
- `src/ui/expedition/ExpeditionTimeline.tsx` — タイムライン・操作ボタン
- `src/ui/expedition/ExpeditionEventDetail.tsx` — イベント詳細・判定表示
- `src/ui/expedition/ExpeditionPartyPanel.tsx` — パーティ最終状態
- `src/ui/expedition/ExpeditionObjectivePanel.tsx` — 6 種類の Objective パネル
- `src/ui/expedition/ExpeditionBattlePanel.tsx` — 戦闘結果パネル
- `src/ui/expedition/ExpeditionResultSummary.tsx` — 最終結果
- `src/ui/expedition/RawJsonPanel.tsx` — 生 JSON 表示
- `src/ui/expedition/ExpeditionSimulator.tsx` — メインオーケストレータ
- `src/App.tsx`（変更）, `src/App.css`（変更） — タブ切り替え
- テスト:
  - `src/ui/expedition/replay.test.ts`
  - `src/ui/expedition/presets.test.ts`
  - `src/ui/expedition/determinism.test.ts`
  - `src/ui/expedition/ExpeditionSimulator.test.tsx`
  - `src/ui/expedition/ExpeditionObjectivePanel.test.tsx`

## 主な機能

- 6 種類の Objective プリセットを選択可能
- ランク・遠征 Seed・Party Seed・戦闘 ON/OFF・4 スロットのロールを変更可能
- パーティプレビュー（名前 / ロール / HP / MP / ステータス / 技能）を即時表示
- 遠征開始後は `result.state.logs` をタイムラインとして再生
- 最初へ / 次へ / 前へ / 最後へ / 再生 のナビゲーション
- イベント詳細でフェーズ・タイプ・アクター・対象・Facts・判定・効果を表示
- 6 種類の Objective パネル（investigation / elimination / rescue / escort / retrieval / survey）
- 戦闘結果パネル：敵編成、戦闘 outcome、ラウンド、接敵、生存者/戦闘不能/戦死、弱点一致/不一致
- 最終結果：依頼タイプ、依頼結果、Objective completed / progress、戦闘結果、経過時間、消費資源、負傷一覧
- Raw JSON 表示

## スクリーンショット

### 遠征設定画面

![遠征設定画面](https://app.devin.ai/attachments/ec2a9430-5da6-4478-b819-4ce4d6fb83/ss_f1548ee1.png)

### Investigation

![investigation](https://app.devin.ai/attachments/9ee83053-0f2f-4c20-8eb6-01d4a596d25b/ss_15384065.png)

### Elimination

![elimination](https://app.devin.ai/attachments/cfb146fa-b8cd-45db-a0e7-f0caf78cdc31/ss_6a0bb745.png)

### Rescue

![rescue](https://app.devin.ai/attachments/62cbd370-4e14-4f7d-8c31-52415dc8bc38/ss_2d99476a.png)

### Escort

![escort](https://app.devin.ai/attachments/ccc71058-96db-48a9-902a-ff0e57d5d634/ss_8c50034d.png)

### Retrieval

![retrieval](https://app.devin.ai/attachments/e8de86cd-d3e9-4567-a363-5269184122b9/ss_0c11fe1e.png)

### Survey

![survey](https://app.devin.ai/attachments/2a3fa1d4-a257-4698-9167-7d4f7efac9ce/ss_0b785fa3.png)

### 最終結果例（Survey）

![survey-final](https://app.devin.ai/attachments/2528978c-51b1-4280-bd0f-69ef398fa234/ss_58e9d5da.png)

## ブラウザスモークテスト

- `npm run dev` で `http://localhost:5173` を起動
- 各 Objective を順に選択し「遠征開始」ボタンをクリック
- 全 6 種類でタイムライン・イベント詳細・Objective パネル・最終結果が表示されることを確認
- ブラウザコンソールにエラーが発生しないことを確認

## 検証結果

```text
npm run typecheck   0 errors
npm run test        550 passed (34 test files)
npm run lint        passed
npm run build       passed
npm run update:expedition-regression  passed, existing baseline diff: 0
```

## 制約遵守事項

- `src/core/expedition/`、`src/core/battle/`、`src/core/generators/` は変更していない。
- `runExpedition()` は 1 回の呼び出しで `ExpeditionResult` を生成し、UI はそれを再生するだけである。
- 既存の戦闘シミュレーター UI を維持し、`App.tsx` に最小限のタブ切り替えのみ追加した。
- 外部 UI ライブラリは追加していない。
- AI 文章生成機能は追加していない。

## 録画付き E2E テスト

`npm run dev` で `http://localhost:5173` を起動し、Chrome で Phase 4 遠征シミュレーターの A–D フローを録画付きで実施した。

- テスト対象コミット: `0d3bac13fbe0a3a1f91268b2ac1c3263edacf0f0`
- テストブラウザ: Chrome（最大化、80% ズーム）
- 録画: `/home/ubuntu/screencasts/ai_battler_phase4_test/ai_battler_phase4_test-edited.mp4`

### A. Rescue

- 遠征シミュレーター タブに切り替え、`救出：負傷した冒険者の救出` を選択し `遠征開始`。
- タイムラインを数イベント進め、`routePlanning` / `hazard` の判定詳細（使用技能、有効値、Roll、結果）を確認。
- 戦闘結果パネル（`victory 勝利`）と遠征最終結果（`依頼失敗 failedObjective`）が別々に表示された。
- Objective パネルで救出対象の HP、発見、到達、Progress、Completed を確認。
- Raw JSON を開き、`request.objectiveType === "rescue"`、`request.seed` / `party[*].seed`、最終 `outcome` が画面表示と一致することを確認。

### B. Retrieval

- `回収：古代魔導核の回収` を選択し、Slot 1 の役割を `scout` → `ranger` に変更。
- `Seedを変更して再実行` をクリックし、遠征 Seed / Party Seed が更新されたことを確認。
- Raw JSON の `request.seed` と `party[*].seed` も新しい Seed に基づいていることを確認。
- Objective パネルで Integrity（75/80）、運搬者なし、回収未完了、最終 outcome `forcedRetreat` を確認。

### C. Survey

- `測量：旧坑道東部の測量` を選択し `遠征開始`。
- タイムラインの `再生` で自動再生し、最後の `最終結果` で正常停止（再生ボタン disabled）したことを確認。
- Objective パネルで Coverage `33.3%`、平均品質 `80.0`、最低品質 `70`、報告書作成/帰還済み、東一区画 quality `80` を確認。

### D. 全 6 Objective スモークテスト

| 目的                  | 最終結果                    | Objective パネル確認          |
| --------------------- | --------------------------- | ----------------------------- |
| 調査（investigation） | `依頼失敗(failedObjective)` | `Type: investigation`         |
| 討伐（elimination）   | `完全成功(completeSuccess)` | 対象数 4、撃破、Progress 100% |
| 護衛（escort）        | `撤退(forcedRetreat)`       | 対象/目的地、HP 36/40         |
| 救出（rescue）        | `依頼失敗(failedObjective)` | Flow A で実施                 |
| 回収（retrieval）     | `撤退(forcedRetreat)`       | Flow B で実施                 |
| 測量（survey）        | `撤退(forcedRetreat)`       | Flow C で実施                 |

全目的でブラウザ console エラーは発生しなかった。

### E2E 確認事項

- 設定と表示結果が一致している
- 戦闘結果と依頼結果が別表示
- タイムライン選択とイベント詳細が一致
- Objective パネルが選択した Objective と一致
- 前へ / 次へ / 最初 / 最後が正常に動作
- autoplay が最後で正常停止
- Raw JSON と画面表示が矛盾しない

## 既知の制約

- `runExpedition()` は one-shot 呼び出しであり、リアルタイムの逐次エンジンではない。
- UI は `runExpedition()` で生成済みのログを再生しているだけである。
- 中間 party HP（遠征中の各イベント時点での HP）を完全に再構築していない。
- 戦闘ラウンドの自動再生はない。
- 遠征 request の全項目を編集する UI はない。
- 本番酒場 UI ではない。
- AI による文章生成は行っていない。
- persistence（保存/読み込み/履歴）機能はない。
