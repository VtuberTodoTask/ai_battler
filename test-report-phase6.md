# Phase 6 酒場キャンペーン 短縮 E2E テストレポート

## テスト環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-campaign`
- Dev server: `http://localhost:5173`
- Campaign seed: `tavern-campaign-001`
- 録画: `/home/ubuntu/screencasts/rec-55c3e6c5-c363-406a-9e39-de29eda35e94/rec-55c3e6c5-c363-406a-9e39-de29eda35e94-edited.mp4`

## 静的検証

| コマンド                       | 結果                                                |
| ------------------------------ | --------------------------------------------------- |
| `npm run typecheck`            | 成功                                                |
| `npm run lint`                 | 成功                                                |
| `npm run test`                 | 625 tests passed（30 日間キャンペーンスモーク含む） |
| `rm -rf dist && npm run build` | 成功（Node.js 20.18.1 の警告のみ）                  |

## シナリオ実行サマリー

1. `酒場キャンペーン` タブを開き、`tavern-campaign-001` で Day 1 を表示。
2. Day 1 を紹介なしで `本日の仲介を確定` → 3 件 `仲介不成立`、評判 +0。
3. Day 2: `魔物出没原因の調査` を `《黒曜の斧》` に紹介し `appropriate` で受諾 → `本日の仲介を確定` → `forcedRetreat`。
4. Day 3: `《黒曜の斧》` が `療養中（あと1日）` になったことを確認。紹介なしで確定。
5. Day 4: 元の `《黒曜の斧》` は滞在期間満了で離脱し、新しい `NEW 《黒曜の斧》` が到着。`魔物出没原因の調査` を新 `《黒曜の斧》` に紹介 → `failedObjective`。
6. Day 5: 新 `《黒曜の斧》` が `療養中（あと1日）`、HP/MP 全快、Morale 低下（18/18/12/19）。紹介なしで確定。
7. Day 6: 新 `《黒曜の斧》` が `受諾可能` に回復し、HP/MP 最大、Morale 全員 70。`商人の護衛` を `《森影》` に紹介 → `failedObjective`。

## 検証項目と結果

| #   | 項目                                                                    | 結果 | 備考                                                                                      |
| --- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| 1   | `酒場キャンペーン` タブ表示 / seed `tavern-campaign-001`                | PASS | Day 1、評判 10/100、「駆け出し」                                                          |
| 2   | 4 人構成パーティカードが表示される                                      | PASS | 滞在パーティに 4 件表示、各 4 メンバー                                                    |
| 3   | 依頼を選択→パーティを選択→紹介→受諾                                     | PASS | Day 2 / Day 4 / Day 6 で受諾確認                                                          |
| 4   | `本日の仲介を確定` で派遣実行                                           | PASS | 各日で resolve 成功                                                                       |
| 5   | 結果詳細を開き、メンバー行に `HP/MP/Morale` が表示される                | PASS | `TavernResultDetail.tsx` L50–52 で表示確認                                                |
| 6   | 負傷者がいる場合、最終 HP が表示される                                  | PASS | Day 2 result detail: レオ サンド HP 31/69、ヴァン サンド HP 39/47                         |
| 7   | 解決後のパーティカードが編集不能                                        | PASS | PartyCard `isDisabled` + PartyBoard `disabled={day.status === 'resolved'}` でクリック無効 |
| 8   | 回復完了後にパーティが `available`、HP/MP 全快、Morale `max(old+20,70)` | PASS | Day 6 新 `《黒曜の斧》` HP/MP 全快、Morale 70（回復前 18/18/12/19 → 70）                  |
| 9   | `翌日へ` で正常に次のボードへ移行                                       | PASS | Day 1→2→3→4→5→6 すべて正常遷移                                                            |
| 10  | ブラウザ console error / unhandled rejection なし                       | PASS | Console logs empty、Vite HMR / React DevTools info のみ                                   |

## 失敗 / 注意事項

- **依頼カードの読み取り専用化**: resolve 後に依頼カードをクリックすると `handleSelectRequest` が `selectedResultId` を `null` にし、`TavernResultDetail` が消えてしまう。`RequestBoard` も `day.status === 'resolved'` で disabled にするか、`handleSelectRequest` で `selectedResultId` をリセットしない修正が必要。
- **回復と滞在満了の優先順位**: Day 3 で回復中だった元 `《黒曜の斧》`（滞在 1〜3日）が Day 4 になった瞬間に `滞在期間満了で離脱` として退場し、回復完了が確認できなかった。`advanceCampaignDay` では `plannedDepartureDay < nextDayNumber` の判定が `applyRecoveryCompletion` より先に行われているため、回復期間中に滞在期限が来たパーティは回復せずに离队する。これが意図かどうか要確認。

## スクリーンショット

| 項目                                                      | スクリーンショット                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Day 6 result detail（受諾パーティ HP/MP/Morale 表示）     | ![day6-result-detail](https://app.devin.ai/attachments/4ad36ae9-12c9-4ce0-8f89-f0c8a5758048/ss_bc9425eb.png)         |
| Day 6 回復完了（HP/MP 全快、Morale 70）                   | ![day6-recovered](https://app.devin.ai/attachments/fdef48b7-a7e6-4a6f-b1a6-33a69090bd54/ss_6df5c5f0.png)             |
| resolve 後の party board（party カードは disabled）       | ![post-resolve-readonly](https://app.devin.ai/attachments/e8f4255c-eebf-4205-963e-7e23880c372f/ss_2a577a87.png)      |
| resolve 後に依頼カードをクリック → result detail が消える | ![request-click-hides-detail](https://app.devin.ai/attachments/a69ab535-45fa-45b8-b6cb-481506dad44e/ss_d19ff434.png) |
| Day 2 result detail（負傷あり、最終 HP 表示）             | ![day2-injured-hp](https://app.devin.ai/attachments/9ca7427f-9a07-41b7-ab6f-4f14cfd2ffcd/ss_65a35481.png)            |

## PASS/FAIL まとめ

- **PASS**: result detail の `HP/MP/Morale` 表示、回復完了後の `available` / 全快 / Morale 70、4 人構成、派遣実行、翌日へ遷移、console エラーなし、負傷者の最終 HP 表示。
- **FAIL / 要修正**: resolve 後の依頼カードクリックで result detail が消える（`RequestBoard` の disabled 制御 or `handleSelectRequest` の `selectedResultId` リセットの見直し）。
- **要確認**: 回復中パーティの滞在満了処理が回復完了より優先される挙動。
