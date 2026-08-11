# Phase 8.1.1 — Tavern Canvas Integration Fixes Report

## 1. 目的

Phase 8.1 で構築した Tavern Main Screen Canvas UI と、既存の Core / Application ロジックを正しく接続し、一日の基本ゲームループを Canvas 上だけで安全に完遂できるようにする。

Core Game Rule を Canvas 側に再実装することなく、以下を達成する。

- `offerRequest` 引数順の統一
- Core action 失敗を Canvas 上に表示
- Stay Extension を Today's Activity に投影
- generated / viewed 状態の遷移を正しく扱う
- Lazy Narrative 中の stale campaign overwrite を防ぐ
- recovering Party の選択と割当不可を分離
- Tavern UI state の source of truth を統一
- `extensionDaysRemaining` を現在日基準に修正

## 2. 主な変更

### 2.1 型と橋渡し

- `src/ui/canvas/types.ts`
  - `UiActionResult<T>` を追加。`ok`, `message`, `data` を運ぶ。
  - `GameUiActions` の `advanceDay`, `resolveDay`, `offerRequest`, `openActivity` を `UiActionResult` ベースに変更。
  - `GameUiState` に `actionMessage` と `viewedActivityIds` を追加。

- `src/ui/canvas/GameCanvasHost.tsx`
  - 各 action を try/catch でラップし、`UiActionResult` を返す。
  - `onOpenActivity` の結果をそのまま `openActivity` action 経由で返却。

- `src/ui/canvas/CanvasGame.ts`
  - `createNoopActions` も `UiActionResult` を返すように更新。

### 2.2 Application 側

- `src/ui/tavern/TavernSimulator.tsx`
  - `handleOfferRequest` の引数順を `(partyId, requestId)` に統一。
  - `handleOfferRequest`, `handleResolve`, `handleAdvance` が `UiActionResult` を返す。
  - `handleOpenActivity` が `Promise<UiActionResult<string>>` を返す。
    - `generated` 状態なら AI 呼び出し 0 で `viewed` マーク。
    - `unseen` なら `generateDowntimeNarrative` を 1 回だけ呼び、最新の campaign state に functional update で target event だけ merge。
    - event が消失していれば stale 結果を安全に discard。
  - Legacy `BrokeragePanel` の `onOffer` 呼び出しを `(selectedPartyId, selectedRequestId)` に修正。

### 2.3 Canvas 側

- `src/ui/canvas/scenes/tavern/TavernHeader.ts`
  - `statusMessage` をヘッダー左下に表示。`TavernHeaderViewModel` 経由で更新。

- `src/ui/canvas/scenes/tavern/TavernScene.ts`
  - `handleResolve` / `handleAdvance` / `handleAssign` で `UiActionResult` を受け、失敗時に `actionMessage` を表示。
  - `setActionMessage` / `clearActionMessage` で `CanvasGame._uiState` を source of truth として更新。
  - `handleOpenActivity` を見直し：
    - `viewed` → サマリー直接表示、AI 0。
    - `generated` → `openActivity` を 1 回呼んで `viewed` 化、AI 0。
    - `unseen` → lazy 生成、in-flight guard で重複防止。
  - `_activityGenerationInFlight` で同一 event の並列生成を防ぐ。
  - `applyCampaign` で selected party / quest が存在しなくなったら `null` にクリアし、`CanvasGame.setUiState` に同期。

- `src/ui/canvas/scenes/tavern/PartyListPanel.ts`
  - recovering party の行を `disabled: false` にし、選択可能にする。

- `src/ui/canvas/scenes/tavern/QuestListPanel.ts`
  - Quest 行を常に選択可能にする。assignability は `PartySummaryPanel` のボタン側で判定。

### 2.4 ViewModel

- `src/ui/canvas/viewModel/tavernScreenViewModel.ts`
  - `TavernHeaderViewModel` に `statusMessage` を追加。
  - `buildActivities` で `campaign.history[*].relationshipEvents` から `type: 'stayExtended'` かつ `event.dayNumber === campaign.dayNumber` のイベントを `Today's Activity` に投影。
  - `stay_extension` アクティビティの summary に延長日数と `primaryReason` / `secondaryReason` のラベルを表示。
  - `buildPartyListItem` の `extensionDaysRemaining` を `Math.max(0, party.plannedDepartureDay - dayNumber + 1)` に修正。

### 2.5 テスト

- `src/ui/canvas/__tests__/phase8-1-1-tavern-integration-smoke.test.ts`（新規）
  - A: `offerRequest` 引数順 `(partyId, requestId)`
  - B: 失敗 action の error message 表示
  - C: stay extension の Today's Activity 投影
  - D: generated → viewed、AI 0
  - E: unseen lazy 生成は 1 回だけ
  - F: recovering party 選択可能 & assign disabled reason
  - G: 選択 reconciliation（advance で party/quest 消失時にクリア）
  - H: `extensionDaysRemaining` が現在日基準

- `src/ui/canvas/__tests__/phase8-1-tavern-main-screen-smoke.test.ts`
  - mock actions を `UiActionResult` 返却に更新。
  - reopen test を新しい state machine に合わせて調整。

- `src/ui/canvas/__tests__/canvasLifecycle.test.tsx`
  - `GameCanvasHost` props の戻り値を `UiActionResult` に合わせる。

- `package.json`
  - `phase8-1-1-tavern-integration-smoke` スクリプト追加。

## 3. アーキテクチャメモ

- UI 状態の source of truth: `CanvasGame._uiState`。
- `TavernScene` は UI ローカル変更を必ず `context.canvasGame.setUiState(...)` 経由で反映。
- `applyCampaign` は `TavernCampaignState` の変化に対して selection を reconcile し、source of truth へ書き戻す。
- Core action の結果は `UiActionResult` で Canvas へ伝播。失敗は header 上の `statusMessage` 表示。

## 4. 検証結果

| 検証項目                                                | 結果                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run typecheck`                                     | PASS                                                                      |
| `npm run lint`                                          | PASS                                                                      |
| `npm run test`                                          | 1019 tests PASS                                                           |
| `npm run test:coverage`                                 | PASS（statements 89.79%, branches 81.22%, functions 91.7%, lines 91.47%） |
| `npm run build`                                         | PASS                                                                      |
| `npm run test:expedition-regression`                    | 22/22 PASS                                                                |
| `npm run phase8-0-canvas-ui-foundation-smoke`           | 12 PASS                                                                   |
| `npm run phase8-1-tavern-main-screen-smoke`             | 15 PASS                                                                   |
| `npm run phase8-1-1-tavern-integration-smoke`           | 8 PASS                                                                    |
| Campaign 30-day smoke                                   | 5 seeds PASS（timeout 20s）                                               |
| `scripts/phase7-0-3-compression-audit.ts`               | PASS                                                                      |
| `scripts/phase7-1-timeline-audit.ts`                    | Leakage 0                                                                 |
| `scripts/phase7-4-memory-smoke.ts`                      | ALL PASS                                                                  |
| `scripts/phase7-7-downtime-relationship-smoke.ts`       | ALL PASS                                                                  |
| `scripts/phase7-7-1-minor-narrative-diversity-smoke.ts` | ALL PASS                                                                  |

## 5. 未対応・既知の制限

- 本 Issue では Narrative Provider 未接続時の fallback は Core 側の既存ロジックをそのまま利用。
- Accessibility foundation（ARIA/キーボード/スクリーンリーダー）は引き続き未実装。
- 本 Phase では prompt version は `NARRATIVE_PROMPT_VERSION = v11`、`DOWNTIME_PROMPT_VERSION = v2` のまま変更なし。
