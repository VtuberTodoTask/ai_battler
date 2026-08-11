# Phase 8.1 — Tavern Main Screen Canvas UI Report

## 1. 目的

FoundationDemoScene とは別に、実際のゲームプレイに使用する `TavernScene` を Canvas 上に構築する。
一枚の Canvas 画面から、一日の状況 → Party → Quest → Party/Quest 選択 → 休養/待機状態 → 今日の酒場イベント → 一日を進める、という基本操作を行えるようにする。

- `FoundationDemoScene` は UI primitive / debug シーンとして残す。
- `TavernScene` を Canvas 起動後のデフォルトシーンとする。
- Core / Application ロジックを再利用し、Canvas 側で新しいゲームルールを作らない。
- Canvas 側で直接 `day += 1` しない。
- ViewModel 層で Core Domain Model を表示モデルへ投影する。
- Legacy DOM UI は引き続き利用可能（`uiMode: 'legacy' | 'canvas'`）。

## 2. 導入・変更概要

### 2.1 新規ファイル

```
src/ui/canvas/scenes/tavern/
  TavernScene.ts            # 本番酒場メインシーン
  TavernHeader.ts           # ヘッダー（DAY, reputation, 本日を確定 / 翌日へ）
  PartyListPanel.ts         # 左カラム：PARTIES リスト
  PartySummaryPanel.ts      # 中央：選択中 Party の概要・Assign ボタン
  QuestListPanel.ts         # 右カラム：TODAY'S QUESTS
  ActivityPanel.ts          # 下段：今日の酒場イベント

src/ui/canvas/components/
  TavernListRow.ts          # Party / Quest / Activity 共通の選択可能リスト行

src/ui/canvas/viewModel/
  tavernScreenViewModel.ts  # TavernScreenViewModel ビルダー

src/ui/canvas/__tests__/
  phase8-1-tavern-main-screen-smoke.test.ts
  tavernScreenViewModel.test.ts
  tavernPartyList.test.ts
  tavernQuestList.test.ts
  tavernSceneState.test.ts
  tavernActivityViewModel.test.ts
```

### 2.2 変更ファイル

- `src/ui/canvas/CanvasGame.ts`
  - `TavernScene` を登録。
  - `BootScene` の遷移先を `'tavern'` に変更。
- `src/ui/canvas/scenes/BootScene.ts`
  - 次シーン名をコンストラクタ引数に取るように変更。
- `src/ui/canvas/types.ts`
  - `GameUiActions` に `resolveDay`, `offerRequest`, `openActivity` を追加。
  - `GameUiState` に `selectedQuestId` を追加。
  - デフォルト UI ステートを `DEFAULT_GAME_UI_STATE` として追加。
- `src/ui/canvas/GameCanvasHost.tsx`
  - `onResolveDay`, `onOfferRequest`, `onOpenActivity` コールバックを受け取り、`actions` に橋渡し。
- `src/ui/tavern/TavernSimulator.tsx`
  - `handleOfferRequest(requestId, partyId)`, `handleOpenActivity(partyId, eventId)` を実装。
  - `openActivity` は campaign clone → `generateDowntimeNarrative` → `narrativeStatus = 'viewed'` → `setCampaign`。
- `src/ui/canvas/__tests__/canvasGame.test.ts` / `canvasLifecycle.test.tsx` / `phase8-0-canvas-ui-foundation-smoke.test.ts`
  - 新しい `GameUiActions` フィールドに対応。
- `package.json`
  - `phase8-1-tavern-main-screen-smoke` スクリプト追加。

## 3. アーキテクチャ

```
React (TavernSimulator)
  └── GameCanvasHost (lazy)
        └── CanvasGame
              ├── Application (PixiJS v8)
              ├── GameViewport (1600x900)
              ├── GameSceneManager
              │     ├── BootScene('tavern')
              │     ├── FoundationDemoScene
              │     └── TavernScene  ← default
              ├── OverlayManager
              ├── GameAssetManager
              └── GameUiActions (bridge to TavernSimulator)

TavernScene
  ├── TavernHeader       (resolve / advance day)
  ├── PartyListPanel     (select party)
  ├── PartySummaryPanel  (view status, members, assign)
  ├── QuestListPanel     (select quest)
  └── ActivityPanel      (open today's tavern events)
```

- `buildTavernScreenViewModel(campaign, uiState)` が純粋関数としてヘッダー / Party リスト / Quest リスト / 選択中 Party 概要 / Activity リストを生成する。
- `TavernScene` は ViewModel を受け取り、各パネルに `update()` を dispatch するのみ。
- Pixi コンポーネントは `party.relationships` などの Core 内部構造を直接触らない。

## 4. 主要コンポーネント

### 4.1 TavernScene

- 仮想解像度 1600×900 に対し、ヘッダー高 64px、下段 96px、中央 3 カラム構成。
- `setCampaign(campaign, uiState)` → 選択を reconcile → 自動選択（初回のみ） → ViewModel 構築 → 描画。
- `setUiState(uiState)` → ViewModel 再構築のみ。
- 休養中 / 療養中 Party は選択可能だが、`assign` 不可。
- 一日の進行は `actions.resolveDay()` → core で `currentDay.status = 'resolved'` → `actions.advanceDay()` → core で `advanceCampaignDay`。

### 4.2 TavernScreenViewModel

- `TavernHeaderViewModel`: `day`, `reputationLabel`, `canResolveDay`, `canAdvanceDay`, `advanceDayDisabledReason`。
- `TavernPartyListItemViewModel`: `id`, `name`, `status`, `statusLabel`, `memberCount`, `selected`, `unreadEventCount`, `extensionDaysRemaining`。
- `TavernPartySummaryViewModel`: name, status, members, stay/departure, current request, rest/recovery, `canAssignQuest`, `assignDisabledReason`。
- `TavernQuestListItemViewModel`: `id`, `title`, `rankLabel`, `difficultyLabel`, `objectiveLabel`, `rewardLabel`, `statusLabel`, `selected`, `assignable`, `disabledReason`。
- `TavernActivityItemViewModel`: `id`, `partyId`, `partyName`, `title`, `summary`, `unread`, `narrativeStatus`, `kind`, `canOpen`。

### 4.3 UI 状態

- `TavernSceneState` は `selectedPartyId`, `selectedQuestId`, `activityModalEventId` などを UI ローカルに保持。
- セーブ対象外。
- 日付進行後に選択対象が消えた場合、`applyCampaign` で自動的にクリアする。

### 4.4 Lazy Narrative Generation

- Activity 行を開いたとき、初回のみ `actions.openActivity(partyId, eventId)` を呼び出す。
- `TavernActivityItemViewModel.narrativeStatus === 'unseen'` かつ未 open な場合のみ AI 呼び出し。
- 再 open や未 open の場合は呼び出し 0。
- `TavernScene` 内部で `_openedActivityEventIds` を使い、同一セッション内の重複生成を防止。

### 4.5 Rest / Recovery

- Core に手動 rest コマンドが存在しないため、`PartySummaryPanel` は `canRest: false` として回復状態を表示するのみ。
- 回復中 Party の Activity は個別の `recovering` ステータスとしてリストに表示される。

## 5. 検証結果

### 5.1 typecheck / lint / test / coverage / build

| 項目                                          | 結果                                                         |
| --------------------------------------------- | ------------------------------------------------------------ |
| `npm run typecheck`                           | PASS                                                         |
| `npm run lint`                                | PASS                                                         |
| `npm run test`                                | 1011 tests PASS                                              |
| `npm run test:coverage`                       | PASS (Stmt 89.79%, Branch 81.22%, Funcs 91.7%, Lines 91.47%) |
| `npm run build`                               | PASS                                                         |
| `npm run test:expedition-regression`          | 22/22 PASS                                                   |
| `npm run phase8-0-canvas-ui-foundation-smoke` | 12/12 PASS                                                   |
| `npm run phase8-1-tavern-main-screen-smoke`   | 15/15 PASS                                                   |

### 5.2 Phase 8.1 Smoke (A–O)

```
A: TavernScene is the production tavern scene
B: header reflects day, reputation and resolve/advance state
C: party selection updates summary and quest assignability
D: quest selection works independently from party selection
E: assign button calls offerRequest action when both selections are set
F: assign button is disabled when quest selection is missing
G: recovery state is displayed and no rest command is invented
H: today activity panel lists downtime events
I: opening an activity generates narrative exactly once
J: reopening the same activity makes zero additional AI calls
K: not opening an activity keeps AI call count at zero
L: resolve and advance day use core actions, not direct day mutation
M: selection is reconciled after the selected party disappears on advance
N: virtual resolution stays 1600x900 after resize
O: legacy UI fallback remains available and the same core sequence yields the same day state
```

すべて PASS。

### 5.3 その他監査・Smoke

| スクリプト                                      | 結果                            |
| ----------------------------------------------- | ------------------------------- |
| `phase7-0-3-compression-audit.ts`               | PASS                            |
| `phase7-1-timeline-audit.ts`                    | Leakage 0 PASS                  |
| `phase7-0-narrative-audit.ts` (30日 zero-call)  | 69 candidates / 0 AI calls PASS |
| `phase7-2-2-narrative-restraint-smoke.ts`       | ALL PASS                        |
| `phase7-3-character-generation-smoke.ts`        | ALL PASS                        |
| `phase7-4-memory-smoke.ts`                      | ALL PASS                        |
| `phase7-5-character-arc-smoke.ts`               | ALL PASS                        |
| `phase7-6-relationship-milestone-smoke.ts`      | ALL PASS                        |
| `phase7-7-downtime-relationship-smoke.ts`       | ALL PASS                        |
| `phase7-7-1-minor-narrative-diversity-smoke.ts` | ALL PASS                        |

## 6. Bundle Size 記録

ビルド結果（vite production build, gzip 済みサイズ抜粋）：

```
dist/assets/index-DwFnm5O-.css                     16.98 kB │ gzip:   3.84 kB
/dist/assets/GameCanvasHost-DHYj-bNs.js             82.56 kB │ gzip:  24.64 kB
/dist/assets/index-sbTYKGTt.js                     702.59 kB │ gzip: 209.34 kB
```

- `GameCanvasHost` は dynamic import により別 chunk 化。`TavernScene` 関連コードも同 chunk に含まれる。
- Legacy UI 初回ロードへの影響は最小限。

## 7. 制約・今後の拡張

- キーボード・Gamepad 操作の完全対応は 8.x で実装予定。現在は pointer イベント中心。
- 最終アート・Web Font 導入は後続 Phase。
- Narrative full reader（8.4）は lazy 生成結果を simple modal で表示。
- Accessibility（ARIA / スクリーンリーダー）は Canvas レンダラーの性質上追加対応が必要。

## 8. 重要な未変更項目

- `NARRATIVE_PROMPT_VERSION`（v11）および `DOWNTIME_PROMPT_VERSION`（v2）は変更していない。
- Core シミュレーション、expedition、narrative、downtime、relationship、memory、arc、milestone、seed determinism、save/load に一切変更なし。
- 新しいゲームルール（manual rest command 等）は追加していない。
