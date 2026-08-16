# Phase 8.5 Report — Day Resolution / Expedition Results Scene

## Summary

Phase 8.5 では、`一日を終える` 後に遠征結果が返ってきた場合、TavernScene 上に留まるのではなく独立した `ExpeditionResultsScene` へ遷移する体験を実装した。Player が「前日の決着を受け取る時間」と「新しい依頼を割り振る時間」を明確に感じられるよう、日進行 → 結果確認 → 酒場復帰の流れを切り離した。

## Deliverables

- `src/ui/canvas/scenes/expeditionResults/ExpeditionResultsScene.ts` — 独立した遠征結果確認 Scene（list + detail、構造化報告 overlay、物語導線、前後件移動、酒場復帰）
- `src/ui/canvas/scenes/expeditionResults/expeditionResultsViewModel.ts` — `ExpeditionResultsSceneInput` / `ExpeditionResultItemViewModel` / `buildExpeditionResultsSceneViewModel`
- `src/ui/canvas/scenes/GameSceneManager.ts` — `push`/`pop` で scene 入力値を保存・復元
- `src/ui/canvas/scenes/tavern/TavernScene.ts` — 日進行後に遠征結果があれば `ExpeditionResultsScene` へ遷移
- `src/ui/canvas/CanvasGame.ts` — `ExpeditionResultsScene` を scene レジストリに登録
- `src/ui/canvas/__tests__/phase8-5-expedition-results-scene-smoke.test.ts` — Smoke A-J

## Verification

| Check                                 | Status                |
| ------------------------------------- | --------------------- |
| `npm run typecheck`                   | green                 |
| `npm run lint`                        | green                 |
| `npm run test`                        | 1118/1118 PASS        |
| `npm run test:expedition-regression`  | 22/22 PASS            |
| `npm run test:coverage`               | green                 |
| `npm run build`                       | green                 |
| PR CI `build-and-test`                | pending               |
| Browser E2E (phase8-5-day-resolution) | pending user approval |

## Architecture

```
TavernScene
  ↓ 一日を終える (advanceCampaignDay)
  ↓ campaign.dayNumber 増加 & history に前日 record
TavernScene.applyCampaign()
  ↓ previousDayNumber > 0 かつ dayNumber 増加を検出
  ↓ previousRecord.results から表示対象を抽出
  ↓ 1 件以上あれば GameSceneManager.push('expeditionResults', input)
ExpeditionResultsScene
  ├ 左カラム：帰還した Party 一覧（未読ドット / outcome label）
  ├ 右カラム：選択中の結果詳細（summary lines / 構造化報告 / 物語）
  └ 下部：前へ / 次へ / 酒場へ戻る
  → 物語として読む → SoundNovelScene
  → SoundNovelScene 戻る → GameSceneManager.pop() で ExpeditionResultsScene 復帰
```

## Day Resolution Bundle

`ExpeditionResultsSceneInput` として渡すのは最小限のみ。

```ts
export interface ExpeditionResultsSceneInput {
  campaign: TavernCampaignState
  dayNumber: number
  selectedResultId?: string
}
```

`campaign.history` 内の該当 `TavernDayRecord` を source of truth とし、既存 `buildReportFromResult` を流用して構造化サマリーを生成する。新しい report データは作らない。

## Result List + Detail

- 一覧は `TavernListRow` を再利用。タイトル = Party 名、サブタイトル = Quest 名、右端 = outcome ラベル。
- 未読は `viewedReportIds`（`GameUiState`）と連動。選択 / 構造化報告 / 物語を開くと既読化。
- 詳細は `GamePanel` 内に `summaryLines` を表示。`buildSummaryLines` は report から決定論的に生成（AI 不使用）。

## Structured Summary Projection

`buildSummaryLines` は `ExpeditionReportViewModel` から以下を生成。

- 結果ラベル
- 目的達成状況
- 生還状況
- 報酬（記録なしの場合も明示）
- 死亡・行方不明者
- 負傷者（記録があれば）

## Report / Narrative Integration

- `構造化報告を見る`：既存 `OverlayManager.openModal` を使い、モーダル内 `GameScrollView` で summary lines を表示。
- `物語として読む`：`openExpeditionNarrative` action を呼び、生成済であれば即 `SoundNovelScene` へ遷移。未生成なら AI 1 回呼び出し後遷移。再開は AI 0。
- `SoundNovelScene.returnTarget.sceneId = 'expeditionResults'` により、戻る先が結果画面になる。

## SoundNovel Return Flow

`GameSceneManager` において `push` 時に入力値を `_stackInputs` に保存し、`pop` 時に元の scene をその入力値で `mount` し直す。これにより `SoundNovelScene` から `ExpeditionResultsScene` へ正しく復帰する。

## Seen / Unread Policy

- `ExpeditionResultsScene` 内では `viewedReportIds` を既読マーカーとして使用。
- 結果を選択 / 構造化報告を開く / 物語を開くと `viewedReportIds` に追加。
- TavernScene の報告 archive unread count と矛盾しないよう、`GameUiState.viewedReportIds` を単一 source of truth とする。

## AI Zero-call Policy

- `ExpeditionResultsScene` を開くだけでは AI 呼び出しは発生しない。
- `buildExpeditionResultsSceneViewModel` および `buildSummaryLines` は既存 structured data のみを使用。
- `物語として読む` 初回のみ `openExpeditionNarrative` action を発行。キャッシュ済みの場合は 0。

## State Safety

- `TavernScene.applyCampaign` は日進行を検出した時点で `ExpeditionResultsScene` へ `push` して即座に return する。
- 復帰時は `GameSceneManager.show('tavern')` により `TavernScene` を再 mount、`onMount` コールバックで最新 `campaign` が `setCampaign` される。
- `applyCampaign` は復帰時も stale な selectedPartyId / selectedQuestId を新しい `currentDay` に対して再同期する。

## Tests

Smoke A-J を `phase8-5-expedition-results-scene-smoke.test.ts` に実装。

- A: 日進行 + 1 結果で `ExpeditionResultsScene` 遷移
- B: 複数結果の順序が安定
- C: 結果 0 件で遷移しない
- D: structured summary が決定論的に生成される
- E: 構造化報告 overlay の表示
- F: 初回物語生成で AI 呼び出し + `SoundNovelScene` 遷移
- G: キャッシュ済み物語では AI 0
- H: `GameSceneManager.pop` が `ExpeditionResultsScene` の入力を復元
- I: 酒場へ戻るボタンで `TavernScene` 表示
- J: view model 生成で AI 0

## Known Limitations

- 今回の scope は遠征結果に限定。新規 Party 来訪・療養完了・滞在延長などの通知は引き続き TavernScene の feedback 領域に表示される。
- BGM / SE の自動切り替えは未対応。`ExpeditionResultsScene` では `expeditionReports` BGM を再生するが、遷移演出はフェード等を含まない。
- 専用背景アセットは未追加。既存パネル半透明 + 背景色を使用。
- 強制的に 1 件ずつ結果を送り出す cinematic 表示は未実装。

## Future Extensions

- 新規 Party 到着 / 療養完了 / 滞在延終了などを `ExpeditionResultsScene` 系の派生 Scene で扱えるよう `DayResolutionBundle` を拡張可能。
- 結果ごとに背景・ムードを切り替える cinematic 演出。
- `ExpeditionResultsScene` → `SoundNovelScene` 間の専用トランジション。
