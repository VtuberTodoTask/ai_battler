# Phase 4 遠征シミュレーター E2E テストレポート

## 概要

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- テスト対象コミット: `0d3bac13fbe0a3a1f91268b2ac1c3263edacf0f0`
- テスト日時: 2025-08-08
- 実行環境: Vite dev server `http://localhost:5173`、Chrome（最大化、80% ズーム）
- 録画: `/home/ubuntu/screencasts/ai_battler_phase4_test/ai_battler_phase4_test-edited.mp4`
- 録画 URL: https://app.devin.ai/attachments/d473f13f-b172-4c90-a2da-353f4fab863d/ai_battler_phase4_test-edited.mp4

## 静的チェック結果

以下をクリーン状態で実行し、すべて通過した。

| コマンド                       | 結果                                         |
| ------------------------------ | -------------------------------------------- |
| `npm run typecheck`            | 成功                                         |
| `npm run lint`                 | 成功                                         |
| `npm run test`                 | 550 tests passed                             |
| `rm -rf dist && npm run build` | 成功（Node.js 20.18.1 での警告あり、exit 0） |

## テストフロー結果

### A. 救出（Rescue）

- 遠征シミュレーター タブに切り替え、`救出：負傷した冒険者の救出` を選択、`遠征開始` を実行。
- タイムラインを数回進め、`routePlanning` / `hazard` イベントの判定ブロック（使用技能、有効値、Roll、結果）が表示された。
- サイドパネルに戦闘結果（`victory 勝利`）と遠征の最終結果（`依頼失敗 failedObjective`）が別々に表示された。
- 救出対象の objective 状態（対象、HP、発見、到達、避到達、避難、帰還、Progress、Completed）が表示された。
- `Raw JSONを表示` を開き、`request.objectiveType === 'rescue'`、`request.seed` / `party[*].seed` が画面上の Seed と一致、`outcome` が最終結果と一致することを確認した。

![Rescue 結果全体](https://app.devin.ai/attachments/4635686c-8fca-4c4c-a5d1-f57213d013b0/ss_78f8c124.png)

![Rescue Raw JSON](https://app.devin.ai/attachments/43cad2f1-be6c-4a20-9490-43a7d897759b/ss_37ed0fae.png)

![Rescue タイムライン進行](https://app.devin.ai/attachments/d345dfb8-910f-41af-acf3-bb9451abdcca/ss_51fa3b6f.png)

### B. 回収（Retrieval）

- `回収：古代魔導核の回収` を選択し、Slot 1 の役割を `scout` から `ranger` に変更。
- `Seedを変更して再実行` をクリックし、遠征Seed / Party Seed が更新されたことを確認。
- Raw JSON の `request.seed` と `party[*].seed` が更新された Seed に基づくことを確認。
- objective パネルで Integrity（`75 / 80`、94%）、運搬者（なし）、回収未完了、Completed: いいえ、最終 outcome `forcedRetreat` を確認。

![Retrieval 結果](https://app.devin.ai/attachments/c45046f6-85d9-4c01-8dc4-247753e71ea5/ss_cdbc7fd0.png)

### C. 測量（Survey）

- `測量：旧坑道東部の測量` を選択し、`遠征開始`。
- タイムラインの `再生` をクリックして自動再生。最後の `最終結果` まで進み、再生ボタンが `disabled` 付きの停止状態になったことを確認。
- objective パネルで Coverage `33.3%`、平均品質 `80.0`、最低品質 `70`、報告書作成/帰還済み、東一区画 quality `80` を確認。

![Survey 自動再生開始直後](https://app.devin.ai/attachments/73cc6f97-63c3-4664-aec3-b6793502ffd9/ss_f130263d.png)

![Survey 自動再生終了後](https://app.devin.ai/attachments/d7c02cc0-3f8a-4332-805c-9e2ad767b7f3/ss_acadcd86.png)

### D. 全6目的スモークテスト

以下の6目的を順番に選択・開始し、それぞれ `依頼タイプ` と objective パネルが目的に対応した内容を表示、console エラーなし。

| 目的                  | 最終結果                    | 備考                                     |
| --------------------- | --------------------------- | ---------------------------------------- |
| 調査（investigation） | `依頼失敗(failedObjective)` | objective パネルに `Type: investigation` |
| 討伐（elimination）   | `完全成功(completeSuccess)` | 対象数4、撃破、Progress 100%             |
| 護衛（escort）        | `撤退(forcedRetreat)`       | 対象/目的地、HP 36/40、Progress 60%      |
| 救出（rescue）        | `依頼失敗(failedObjective)` | Flow A で実施                            |
| 回収（retrieval）     | `撤退(forcedRetreat)`       | Flow B で実施                            |
| 測量（survey）        | `撤退(forcedRetreat)`       | Flow C で実施                            |

![調査（investigation）](https://app.devin.ai/attachments/a6a4c04a-d787-46a1-ba53-e8f4368ebcb6/ss_af29c581.png)

![討伐（elimination）](https://app.devin.ai/attachments/cdb56a5f-2275-48e2-ad42-447cc2ce899f/ss_f0231c9d.png)

![護衛（escort）](https://app.devin.ai/attachments/fd485821-ef6a-4123-8af2-0cfb7a378bef/ss_1e03aca4.png)

## Console エラー

ブラウザ console および `window.onerror` / `unhandledrejection` リスナーでエラーは検出されなかった。

## 備考・制約

- 一部のボタン（`遠征開始`、`Seedを変更して再実行`、`再生` など）がテストハーネスのネイティブマウスクリックに反応しない事象が継続している。これは MVP テスト時と同じ現象で、UI ハンドラ自体は正常に動作している。必要に応じて `document.querySelectorAll('button')[n].click()` やテキスト検索による `.click()` でフォールバックした。
- 画面幅の関係で長い `生存者` ID などが横にはみ出るため、録画は 80% ズームで実施している。

## 追加成果物

- 録画: `/home/ubuntu/screencasts/ai_battler_phase4_test/ai_battler_phase4_test-edited.mp4`
- 録画 URL: https://app.devin.ai/attachments/d473f13f-b172-4c90-a2da-353f4fab863d/ai_battler_phase4_test-edited.mp4
- スクリーンショット: `/home/ubuntu/screenshots/` 内の `ss_*.png`
- テスト計画: `/home/ubuntu/test-plan-phase4.md`
