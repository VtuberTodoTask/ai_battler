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
npm run test        547 passed (34 test files)
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
