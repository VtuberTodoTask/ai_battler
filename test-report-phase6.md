# Phase 6 酒場キャンペーン 短縮 E2E 再実行レポート

## テスト環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-campaign`
- Dev server: `http://localhost:5173`
- Campaign seed: `tavern-campaign-001`
- 録画: `/home/ubuntu/screencasts/rec-08d8beec-2b82-4ae7-b77b-d0bf1320639a/rec-08d8beec-2b82-4ae7-b77b-d0bf1320639a-edited.mp4`
- 対象コミット: `8ffc1c2`（request card クリック後も result detail を保持する修正）

## 静的検証

| コマンド                       | 結果                                                |
| ------------------------------ | --------------------------------------------------- |
| `npm run typecheck`            | 成功                                                |
| `npm run lint`                 | 成功                                                |
| `npm run test`                 | 625 tests passed（30 日間キャンペーンスモーク含む） |
| `rm -rf dist && npm run build` | 成功（Node.js 20.18.1 の警告のみ）                  |

## シナリオ実行サマリー

1. `酒場キャンペーン` タブを開き、`tavern-campaign-001` で Day 1 を表示。
2. Day 1 を紹介なしで `本日の仲介を確定` → 3 件 `仲介不成立`、評判 +0 → `翌日へ`。
3. Day 2: `魔物出没原因の調査` を `《黒曜の斧》` に紹介し `appropriate` で受諾 → `本日の仲介を確定` → `forcedRetreat`。
4. result detail を開き、`受諾パーティ` リストに各メンバーの `HP/MP/Morale` が表示されることを確認。
5. resolved 状態のまま別の request card をクリック → **result detail が消えない**ことを確認（`8ffc1c2` の修正）。
6. `翌日へ` で Day 3 へ。元 `《黒曜の斧》` は `療養中（あと1日）`。紹介なしで確定。
7. `翌日へ` で Day 4 へ。元 `《黒曜の斧》` は滞在期間満了で離脱、新しい `NEW 《黒曜の斧》`（滞在 4〜9日）が到着。`魔物出没原因の調査` を新 `《黒曜の斧》` に紹介 → `failedObjective`。
8. Day 5: 新 `《黒曜の斧》` は `療養中（あと1日）`、HP/MP 全快、Morale 低下（18/18/12/19）。紹介なしで確定。
9. Day 6: 新 `《黒曜の斧》` が `受諾可能` に回復、HP/MP 最大、Morale 全員 70。

## 検証項目と結果

| #   | 項目                                                                    | 結果 | 備考                                                                                            |
| --- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| 1   | `酒場キャンペーン` タブ表示 / seed `tavern-campaign-001`                | PASS | Day 1、評判 10/100、「駆け出し」                                                                |
| 2   | 4 人構成パーティカードが表示される                                      | PASS | 滞在パーティに 4 件表示、各 4 メンバー                                                          |
| 3   | 依頼を選択→パーティを選択→紹介→受諾                                     | PASS | Day 2 / Day 4 で受諾確認                                                                        |
| 4   | `本日の仲介を確定` で派遣実行                                           | PASS | 各日で resolve 成功                                                                             |
| 5   | 結果詳細を開き、メンバー行に `HP/MP/Morale` が表示される                | PASS | `TavernResultDetail.tsx` L50–52 で表示確認                                                      |
| 6   | 負傷者がいる場合、最終 HP が表示される                                  | PASS | Day 2 result detail: レオ サンド HP 31/69、ヴァン サンド HP 39/47                               |
| 7   | 解決後のパーティカードが編集不能                                        | PASS | `PartyBoard disabled={day.status === 'resolved'}` / `PartyCard isDisabled` でクリック無効       |
| 8   | **resolve 後に依頼カードをクリックしても result detail が消えない**     | PASS | `TavernSimulator.tsx` L46–48 で `day.status === 'resolved'` 時は `handleSelectRequest` が no-op |
| 9   | 回復完了後にパーティが `available`、HP/MP 全快、Morale `max(old+20,70)` | PASS | Day 6 新 `《黒曜の斧》` HP/MP 全快、Morale 70（回復前 18/18/12/19 → 70）                        |
| 10  | `翌日へ` で正常に次のボードへ移行                                       | PASS | Day 1→2→3→4→5→6 すべて正常遷移                                                                  |
| 11  | ブラウザ console error / unhandled rejection なし                       | PASS | Vite HMR / React DevTools info のみ、error なし                                                 |

## 注意事項

- **回復と滞在満了の優先順位**: `advanceCampaignDay` では `plannedDepartureDay < nextDayNumber` の判定が `applyRecoveryCompletion` より先に実行されるため、回復期間中に滞在期限が来た元 `《黒曜の斧》`（滞在 1〜3日）は回復せずに `滞在期間満了で離脱` となった。これは Phase 6.0.1 で意図された挙動（scheduled departure priority）として記録する。

## スクリーンショット

| 項目                                                             | スクリーンショット                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Day 2 result detail（受諾パーティ HP/MP/Morale 表示）            | ![day2-result-detail](https://app.devin.ai/attachments/2e339ecd-4cf8-42ba-88cb-97f51b2fce84/ss_7e1d6907.png)         |
| resolve 後の request card クリック → result detail 保持          | ![request-click-keeps-detail](https://app.devin.ai/attachments/ddfd77f9-d34f-4171-9506-45309b3e33fd/ss_4c694916.png) |
| Day 5 新 `《黒曜の斧》` の回復中（あと1日）                      | ![day5-recovering](https://app.devin.ai/attachments/15eca869-e923-4a7e-9e50-885bac32b3d2/ss_f8156e49.png)            |
| Day 6 回復完了（HP/MP 全快、Morale 70）                          | ![day6-recovered](https://app.devin.ai/attachments/d1f6cb93-d0ae-4596-8a30-b04861602179/ss_154b7a37.png)             |
| Day 4 新 `NEW 《黒曜の斧》` 到着と元 `《黒曜の斧》` 滞在満了離脱 | ![day4-departure-arrival](https://app.devin.ai/attachments/ba762bb8-f2e4-4e09-922c-cdd2df175347/ss_bcac0eb3.png)     |

## PASS/FAIL まとめ

- **PASS**: result detail の `HP/MP/Morale` 表示、resolve 後の request card クリックで result detail が保持される、回復完了後の `available` / 全快 / Morale 70、4 人構成、派遣実行、翌日へ遷移、console エラーなし、負傷者の最終 HP 表示。
- **注意**: 回復中パーティの滞在満了が回復完了より優先される挙動は Phase 6.0.1 の意図動作として確認。
