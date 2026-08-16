# Phase 8.4 Report — Quest & Party Decision UI

## Summary

Phase 8.4 では、Canvas 版 Tavern UI において Player が「どの Party にどの Quest を任せるか」を情報を見て判断できる UI を完成させた。Legacy DOM UI と比較し、Quest 詳細、Party 要約、遠征予測、紹介判定の情報を Canvas へ復元した。

## Deliverables

- `PHASE8_4_DOM_CANVAS_PARITY.md` — DOM → Canvas 情報パリティ棚卸しマトリクス
- `src/ui/shared/expeditionPredictionService.ts` — DOM/Canvas 共用の予測サービス（キャッシュ + Promise de-duplication + 非同期実行）
- `src/ui/canvas/scenes/tavern/DecisionPanel.ts` — Quest 詳細 / Party 要約 / 遠征予測 / 紹介ボタンを統合した中央パネル
- `src/ui/canvas/viewModel/tavernScreenViewModel.ts` — `TavernQuestDetailViewModel` / `TavernDecisionViewModel` 追加
- `src/ui/canvas/components/TavernListRow.ts` — 右端 `trailing` ラベル対応
- `src/ui/canvas/scenes/tavern/QuestListPanel.ts` — コンパクトな Quest 一覧表示
- `src/ui/canvas/scenes/tavern/TavernScene.ts` — `DecisionPanel` 統合、予測内訳モーダル追加
- `src/ui/tavern/ExpeditionPredictionPanel.tsx` — 共用サービスを利用するよう変更
- `src/ui/expedition/labels.ts` — `ENVIRONMENT_LABELS` 追加
- Phase 8.4 smoke test: `src/ui/canvas/__tests__/phase8-4-quest-party-decision-smoke.test.ts`
- Shared prediction service unit test: `src/ui/shared/__tests__/expeditionPredictionService.test.ts`

## Verification

| Check                                       | Status                |
| ------------------------------------------- | --------------------- |
| `npm run typecheck`                         | green                 |
| `npm run lint`                              | green                 |
| `npm run test`                              | 1108/1108 PASS        |
| `npm run test:expedition-regression`        | 22/22 PASS            |
| `npm run test:coverage`                     | green                 |
| `npm run build`                             | green                 |
| PR CI `build-and-test`                      | green                 |
| Browser E2E (phase8-4-quest-party-decision) | pending user approval |

## Constraints Observed

- 予測計算は既存 `predictExpeditionOutcome` をそのまま使用。新規 Canvas 専用計算ロジックは作成していない。
- 同じ Party × Quest の再選択時はモジュールレベルキャッシュがヒットし、200 回シミュレーションを再実行しない。
- 選択中の Party/Quest が変わった場合、遅延して届く古い予測結果は `DecisionPanel` 内シーケンス番号で無視する。
- `predictExpeditionOutcome` はキャンペーン状態を変更しない（member snapshot をクローンして使用）。
- Legacy DOM UI は削除していない。

## Notes

- 地形ラベルは `ENVIRONMENT_LABELS` により日本語化。DOM の `RequestCard.tsx` については既存の raw 表示を維持し、Canvas 側のみ Phase 8.4 の scope で対応した。
- `DecisionPanel` では `recovering` な Party でも選択・予測表示は可能とし、紹介ボタンだけを `getOfferErrors` により無効化している。これにより「推定達成率は表示されるが紹介不可」という状態が表現できる。
