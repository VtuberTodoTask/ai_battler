# Phase 6.2 rank-calibration Tavern Campaign E2E テストレポート

## テスト環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-2-rank-calibration`
- Dev server: `npm run preview -- --host` → `http://localhost:4173/`
- Campaign seed: `tavern-campaign-001`（既定値）
- ブラウザ: 既存 Chrome
- 録画: `/home/ubuntu/screencasts/phase6-2-rank-calibration/phase6-2-rank-calibration-edited.mp4`

## 静的検証

| コマンド            | 結果                                     |
| ------------------- | ---------------------------------------- |
| `npm run typecheck` | PASS                                     |
| `npm run lint`      | PASS                                     |
| `npm run test`      | 656 tests passed                         |
| `npm run build`     | PASS（Node.js 20.18.1 の Vite 警告のみ） |

## E2E シナリオ概要

Day 1 から `新しいキャンペーン` を使い、紹介なしで Day 5 まで進行しました。Day 5 の依頼 `洞窟の魔物討伐`（等級 E、elimination）を題材に、same-rank E パーティと +2 等級の C パーティ `《森影》` で予測パネルの振る舞いを確認し、そのまま紹介・確定して遠征結果を確認しました。result detail の可視化のため、予測確認後に一度リセットして同じ Day 5 フローを再実行して resolve まで行っています（録画内で 2 回目の run として記録）。

## 検証結果

### 1. 予測パネル rank 差

- 依頼 `洞窟の魔物討伐`（E）+ same-rank E パーティ `《黒曜の斧》` → `推定依頼達成率 77% 有望` を表示：PASS
- +2 等級 C パーティ `《森影》` に切り替え → `推定依頼達成率 100% 非常に有望` に更新。旧 77% が一瞬も残らなかった：PASS
- 再び `《黒曜の斧》` に戻す → 同じ 77% が即座に再表示され、200 回再計算せずキャッシュ再利用：PASS
- 別依頼 `未踏洞窟の経路測量`（D）に切り替え、`《森影》` 選択 → `推定依頼達成率 97%` に更新。旧値が残らなかった：PASS

### 2. Acceptance の独立性

- 依頼 E + `《森影》` C（予測 100%）で `この依頼を紹介する` を実行 → リーダーは `appropriate` で受諾：PASS
- 予測値と受諾判断は独立に表示されている（高予測でも受諾確定ではなく、Acceptance エンジンの理由を別途表示）

### 3. 遠征結果と予測の分離

- `本日の仲介を確定` 後、`遠征予測` パネルは非表示になり、`本日の結果` / `本日の仲介結果` / `TavernResultDetail` が表示された：PASS
- 実際の遠征結果 `success`（victory）は、予測 100% とは別物として表示された：PASS

### 4. elimination result detail の一貫性

- 依頼タイプ: elimination
- 依頼結果: success
- Objective completed: はい / Objective progress: 75%
- 戦闘結果: victory 勝利
- 対象数 4 / 撃破 3 / 逃走 1 / 生存 なし / 未確認 なし
- 生存者数 4 / 戦闘不能 0 / 死亡 0 / 負傷一覧 なし
- Progress 75% / Completed はい

これは `determineEliminationOutcome` の `!confirmationRequired && allNeutralized` パス（defeated + escaped === required）で `success` になり、`completed=true` となる挙動と整合。outcome、defeated/escaped/surviving、completed の各表示に矛盾なし：PASS

### 5. 遠征後の状態更新

- `翌日へ` で Day 6 へ進行：PASS
- `《森影》` の HP/MP は全快、Morale は 60/73/69/55 → 70/83/79/65（+10 上昇）で `受諾可能` に戻った：PASS
- 酒場評判は 10 → 12（+2）に更新：PASS
- `キャンペーン履歴` に `Day 5 — 評判 10 → 12 (+2)` と `洞窟の魔物討伐: 成功 — 《森影》` が記録された：PASS

### 6. Console エラー

- ブラウザ console に error / unhandled rejection は検出されず、Vite 再接続ログと React DevTools info のみ：PASS

## 注意点

- 予測 200 回実行はブラウザ内で約 100–120 ms で完了し、UI ブロッキングは観測されなかった。
- テストハーネス上で下部ボタン類のネイティブマウスクリックが反応しない場合があったため、`document.querySelectorAll(...).click()` 等でフォールバックした。UI ハンドラ自体は正常に動作した。
- result detail の全体を画面上に収めるためスクロールを複数回行った。録画にはスクロールによる表示変化も含まれている。

## キー証拠

| same-rank E party 77% 有望                                                                            | +2 rank C party 100% 非常に有望                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ![same-rank-e](https://app.devin.ai/attachments/845c9972-494d-440f-a0fd-7a7cd4faffdb/ss_fdcb2d3f.png) | ![plus2-c](https://app.devin.ai/attachments/ad2b4fe7-886a-4379-a905-05becbcfa94a/ss_3df270ea.png) |

| 戻すと同じ 77% がキャッシュ再利用                                                                   | 別依頼（D）+ C party で 97% に更新                                                                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![cached-77](https://app.devin.ai/attachments/8daff43c-a98d-4fda-b36c-70bf2158be53/ss_0408b3de.png) | ![switch-request-97](https://app.devin.ai/attachments/102be6ab-b4ac-4954-9513-2b290c1bd838/ss_23c55c59.png) |

| resolve 後の result detail（最終結果・受諾パーティ）                                                    | result detail（重要 facts / 戦闘結果）                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ![result-detail](https://app.devin.ai/attachments/96b40d07-75db-4c00-bc62-17fdd138cb61/ss_a81b2cd6.png) | ![result-detail-facts](https://app.devin.ai/attachments/9bfd710e-8637-4bf1-a7e7-1f8311866dbb/ss_ed873ef3.png) |

| 対象数 / 撃破 / 逃走 / 生存                                                                             | Progress 75% / Completed はい                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ![targets-table](https://app.devin.ai/attachments/ecf4fe50-8a56-4327-8347-6e2381479134/ss_48943584.png) | ![progress-completed](https://app.devin.ai/attachments/b4447a28-1eb3-4d40-9c16-23a822b446b4/ss_2bba8121.png) |

| 遠征後 Day 6: HP/MP/Morale 更新                                                                                |
| -------------------------------------------------------------------------------------------------------------- |
| ![post-expedition-day6](https://app.devin.ai/attachments/0533d822-ee37-4e38-a10e-3d4a2d657fe5/ss_77ce7436.png) |

## PASS/FAIL サマリ

- 予測パネル rank 差表示：PASS
- stale prediction 防止（party 切り替え）：PASS
- キャッシュ再利用：PASS
- 依頼切り替え stale 防止：PASS
- Acceptance の独立性：PASS
- 予測結果と実遠征結果の分離：PASS
- elimination result detail 一貫性：PASS
- 遠征後 HP/MP/Morale・評判・履歴更新：PASS
- console エラーなし：PASS

**総合結果：PASS**
