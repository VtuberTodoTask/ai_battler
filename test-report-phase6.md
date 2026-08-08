# Phase 6 酒場キャンペーン 7 日間 E2E テストレポート

## テスト環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-campaign`
- Dev server: `http://localhost:5174`（Vite 5173 フォールバック）
- テスト対象 seed: `tavern-campaign-001`
- 録画: `/home/ubuntu/screencasts/rec-d4bd4756-a368-4c62-9cdd-e46e2a169cec/rec-d4bd4756-a368-4c62-9cdd-e46e2a169cec-edited.mp4`

## 静的検証

| コマンド                       | 結果                                                |
| ------------------------------ | --------------------------------------------------- |
| `npm run typecheck`            | 成功                                                |
| `npm run lint`                 | 成功                                                |
| `npm run test`                 | 624 tests passed（30 日間キャンペーンスモーク含む） |
| `rm -rf dist && npm run build` | 成功（Node.js 20.18.1 の警告のみ）                  |

## E2E 実行サマリー

| Day | 選択した依頼       | 選択したパーティ | 受諾理由               | 遠征結果         | 評判変化   |
| --- | ------------------ | ---------------- | ---------------------- | ---------------- | ---------- |
| 1   | なし               | なし             | —                      | 3 件 notBrokered | +0 (10→10) |
| 2   | 魔物出没原因の調査 | 《黒曜の斧》     | appropriate            | forcedRetreat    | -1 (10→9)  |
| 3   | 遺跡の異変調査     | 《鋼の絆》       | challengingButSuitable | forcedRetreat    | -1 (9→8)   |
| 4   | 魔物出没原因の調査 | 《蒼穹の槍》     | appropriate            | success          | +2 (8→10)  |
| 5   | 洞窟の魔物討伐     | 《黒曜の斧》     | appropriate            | partialSuccess   | +0 (10→10) |
| 6   | 商人の護衛         | 《森影》         | appropriate            | failedObjective  | -2 (10→8)  |
| 7   | なし               | なし             | —                      | 3 件 notBrokered | +0 (8→8)   |

## 検証項目と結果

- キャンペーン初期状態：Day 1、評判 10/100、「駆け出し」、seed `tavern-campaign-001`、依頼 3 件、滞在パーティ 4 件（すべて NEW）、滞在期間・HP/MP/Morale 表示：PASS
- Day 1 紹介なしで `本日の仲介を確定`：3 件 `仲介不成立`、評判 +0：PASS
- Day 2–6 の受諾/遠征/確定：`本日の結果`、`本日の仲介結果`、各 result detail に `受諾パーティ` と最終 HP が表示：PASS
- 翌日への進行：Day 数更新、パーティ数 4 を維持、NEW 到着バッジ・回復中/受諾済みステータス更新：PASS
- Day 7 紹介なしで確定し 7 日目終了：3 件 `仲介不成立`、評判 +0：PASS
- キャンペーン履歴パネル：7 日分の評判変化、アウトカム、Party events を表示：PASS
- ブラウザ console：error / unhandled rejection なし（Vite HMR log と React DevTools info のみ）：PASS

## 注意・未満たし事項

- Phase 6.0.1 修正後、`TavernResultDetail` の `受諾パーティ` リストには **最終 HP / MP / Morale** が表示されるようになり、それらの値が `report.party` の `finalHp` / `finalMp` / `finalMorale` と一致することを確認しました。
- テストハーネス上で一部下部ボタンのネイティブクリックが反応しないため、`document.querySelectorAll(...)` / `document.querySelector(...).click()` でフォールバックしました。UI ハンドラ自体は正常に動作しました。

## スクリーンショット

| Day 1 初期                                                                                             | Day 1 確定（notBrokered ×3）                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| ![day1-initial](https://app.devin.ai/attachments/a244a456-7ee7-4772-9a86-72e5ac53e9fc/ss_f7372586.png) | ![day1-resolved](https://app.devin.ai/attachments/9f685197-5913-4fd5-b404-84e1af15724a/ss_5972693a.png) |

| Day 2 結果詳細（受諾パーティ HP）                                                                     | Day 3 回復中ステータス                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ![day2-detail](https://app.devin.ai/attachments/f556cab0-56b3-44ae-8093-fb586e6df242/ss_0bf51302.png) | ![day3-recovery](https://app.devin.ai/attachments/2cfc6932-343a-424b-ad28-9a9dc6fa8e38/ss_9fef79f1.png) |

| Day 4 NEW 到着                                                                                     | Day 6 Escort 結果詳細                                                                                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ![day4-new](https://app.devin.ai/attachments/54b02f26-dd52-4a3b-b9bb-615267f516f9/ss_1f32a82a.png) | ![day6-detail](https://app.devin.ai/attachments/ac10ff6d-a53c-4d29-b5ff-830d1c9ec904/ss_25c5641b.png) |

| Day 7 最終状態                                                                                       | キャンペーン履歴展開                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ![day7-final](https://app.devin.ai/attachments/0fe682e0-c25a-4374-acc8-90c100280d55/ss_5029a20a.png) | ![history](https://app.devin.ai/attachments/b2a3184a-deb7-4071-8335-9b52dd3f38f9/ss_1d8c4f35.png) |
