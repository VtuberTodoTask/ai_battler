# Phase 8.2 — Game Feedback & Expedition Reports Report

## 1. 目的

Phase 8.1.1 までの Canvas 酒場 UI に、ゲームイベントをプレイヤーが必ず把握できる統合フィードバック層を追加する。

Core Game Rule は Canvas 側に再実装せず、既存の `TavernDayRecord` / `CampaignRelationshipEvent` / `DowntimeEvent` / 遠征結果 / 紹介結果を投影して、通知・Activity・遠征報告・物語ビューアを提供する。

主な達成項目:

- 遠征帰還・パーティ到着・出発・療養完了・滞在延長・依頼拒否・受諾 などの Core イベントを、プレイヤーに見逃さず伝える
- 遠征帰還には構造化された「遠征報告」を提供し、成功/失敗を最初に表示（Result First）
- 遠征報告に対する AI 物語ビューアを追加。初回生成で 1 AI call、再表示は 0 AI call
- 通知キュー・重複防止・Modal Flood 防止
- 旧セーブからの報告投影にも対応（欠損フィールドは「不明」「記録なし」）

## 2. 主な変更

### 2.1 型と橋渡し

- `src/ui/canvas/types.ts`
  - `GameUiActions` に `openExpeditionNarrative?: (candidateId) => Promise<UiActionResult<string>>` を追加（既存テスト用 mock を壊さないよう optional）
  - `OfferRequestActionData` を `decision: 'accepted' | 'declined'` + `reasonText` 構造化に変更

- `src/ui/canvas/CanvasGame.ts`
  - `createNoopActions` で `openExpeditionNarrative` も noop を返すように更新

- `src/ui/canvas/GameCanvasHost.tsx`
  - `onOpenExpeditionNarrative` prop を受け取り、`openExpeditionNarrative` action を実装
  - 既存 `onOpenActivity` と同じく `UiActionResult<string>` 形式

- `src/ui/tavern/TavernSimulator.tsx`
  - `handleOfferRequest` が `decision` と `reasonText` を含む `OfferRequestActionData` を返す
  - `handleOpenExpeditionNarrative` を追加。`NarrativeCandidate` を探し、Fake/HTTP provider で生成
  - `handleOpenActivity` と同様に `generatedText` をマージして `UiActionResult<string>` を返す

### 2.2 ViewModel / Feedback 投影

- `src/ui/canvas/viewModel/tavernFeedbackViewModel.ts`（新規）
  - `TavernFeedbackItem` / `FeedbackImportance` / `TavernFeedbackKind` を定義
  - Core イベントから以下の `kind` を生成:
    - `expedition_return` / `quest_rejected` / `quest_accepted` / `party_arrival` / `party_departure` / `recovery_complete` / `stay_extension` / `downtime` / `other`
  - 重要度: `high`（遠征帰還・新規パーティ・出発・死亡） / `medium`（拒否・受諾・回復完了・滞在延長） / `low`（downtime・flavor）
  - `AcceptanceReasonCode` → 構造化ラベル `OFFER_REASON_LABELS` を導入
  - `buildOfferFeedback` は `理由：${label} — ${roleplay quote}` を summary に含む
  - `pushUniqueFeedback` + `seen` Set で同一 id の重複フィードバックを排除
  - `sortFeedbackItems` で重要度降順 → 未読優先 → 発生順

- `src/ui/canvas/viewModel/expeditionReportViewModel.ts`（新規）
  - `ExpeditionReportViewModel` 型を定義
  - `outcome` / `outcomeLabel` / `objectiveSummary` / `casualties` / `injuries` / `rewards` / `majorEvents` / `narrativeStatus` / `canGenerateNarrative` を提供
  - 各 Objective タイプ（investigation / elimination / rescue / escort / retrieval / survey）から `objectiveSummary` を構造化生成
  - `buildExpeditionReportViewModels` は `currentDay.results` と `campaign.history[*].results` の両方を投影
  - `narrativeStatusForCandidate` で `narrativeCandidates` と `narrativeGenerations` を紐付け、未生成/生成済/閲覧済を判定
  - 報酬が不明な場合は `記録なし` を表示

- `src/ui/canvas/viewModel/tavernScreenViewModel.ts`
  - `TavernHeaderViewModel` に `unreadReportCount` を追加
  - `TavernPartyListItemViewModel` に `unreadEventCount` を追加
  - `buildActivities` で `tavernFeedbackViewModel` から `TavernActivityItemViewModel` 一覧を生成
  - Quest 一覧の `statusLabel` に「拒否済」「成立」を表示

### 2.3 Canvas UI

- `src/ui/canvas/scenes/tavern/TavernHeader.ts`
  - ヘッダー右に「報告」ボタンを追加
  - 未読報告数をバッジとして表示

- `src/ui/canvas/scenes/tavern/TavernScene.ts`
  - `mount` 時に `_shownHighFeedbackIds` Set を初期化
  - `applyCampaign` / `updateViewModel` で `showHighImportanceSummary` を呼び出し、high 重要度イベントを 1 枚のモーダルにまとめて表示（Modal Flood 防止）
  - `handleResolve` / `handleAdvance` 後に再度 `showHighImportanceSummary` を実行
  - `openReportArchiveModal`：「最近の報告」モーダル。報告行をクリックで `openReportModal`
  - `openReportModal`：遠征報告詳細。結果・パーティ・目的・生還・負傷・殉職・報酬・主な出来事を縦に表示
  - `openNarrativeModal`：「物語として読む」ボタン処理。
    - `generatedText` がある場合は 0 AI call で再表示
    - ない場合は `openExpeditionNarrative` を 1 回だけ呼び出し、生成中は「生成中…」
    - 失敗時はフォールバックメッセージを表示
  - `markReportViewed`：報告を開いたら `viewedReportIds` に追加
  - `handleOfferRequest`：受諾/拒否を `setActionMessage` に表示

## 3. テスト

- `src/ui/canvas/__tests__/tavernFeedbackViewModel.test.ts`
  - `feedbackImportance`：high/medium/low の並び順と未読優先
  - `feedbackDeduplication`：同一 downtime id の重複排除
  - `questRejectionFeedback`：拒否理由ラベルが `理由：` 形式で含まれる

- `src/ui/canvas/__tests__/expeditionReportViewModel.test.ts`
  - `expeditionReportHistory`：`advanceCampaignDay` 後も報告が残り、異なる日の報告が混在する

- `src/ui/canvas/__tests__/phase8-2-game-feedback-smoke.test.ts`（新規）
  - A: 遠征解決で報告と未読バッジができる
  - B: 日解決後に重要イベントサマリーモーダルが開く
  - C: 依頼拒否が Quest 一覧と Activity に表示される
  - D: 報告アーカイブと物語アクションが動作する
  - E: 報告開封で `viewedReportIds` が更新される
  - F: 物語生成失敗がエラーとして表示される
  - G: 翌日進行後もアーカイブが保持される
  - H: 通知キューで同一 high イベントの重複サマリーが防止される
  - I: 遠征物語はキャッシュされたテキストを再表示する
  - J: 報告詳細モーダルに結果・目的要約が含まれる
  - K: 滞在延長フィードバックに primary/secondary reason が含まれる
  - L: 療養完了フィードバックが Activity に現れ、パーティステータスが「待機中」になる
  - M: 依頼受諾で Quest 一覧に「成立」、Activity に受諾フィードバックが現れる

## 4. 検証

- `npm run typecheck` PASS
- `npm run lint` PASS
- `npm run test` PASS（1043 tests）
- `npm run test:coverage` PASS
  - Statements 89.85% / Branches 81.31% / Functions 91.7% / Lines 91.53%
- `npm run build` PASS
- `npm run test:expedition-regression` 22/22 PASS
- `npx vitest run src/ui/canvas/__tests__/phase8-2-game-feedback-smoke.test.ts` 13/13 PASS
- `phase8-0-canvas-ui-foundation-smoke` / `phase8-1-tavern-main-screen-smoke` / `phase8-1-1-tavern-integration-smoke` PASS
- 30-day zero-call audit PASS（`narrative.test.ts` with `--testTimeout 20000`）
- 圧縮 audit / タイムライン漏洩 audit PASS（`scripts/phase7-0-3-compression-audit.ts` / `scripts/phase7-1-timeline-audit.ts`）
- `NARRATIVE_PROMPT_VERSION` / `DOWNTIME_PROMPT_VERSION` 変更なし

## 5. 制約・留意事項

- 本 Phase では Core Game Rule を追加・変更していない。既存イベントの Canvas 投影のみを行っている。
- 報酬情報は Core 側に保存されていないため、遠征報告の `rewards` は `記録なし` を表示する。
- 旧セーブで欠損しているフィールドは `不明` / `記録なし` を表示し、推測しない。
- ブラウザ E2E は手動で Canvas UI を起動し、「報告」→「本日の重要な出来事」モーダルまで到達済み。Quest 拒否→日進行→遠征帰還→報告閲覧→物語生成の完全手動 E2E は、冒烟テストで網羅している。
