# Phase 6.1 遠征成功率予測・危険度可視化 E2E テストレポート

## 概要

PR #17 (`devin/phase6-1-prediction`) で追加された `ExpeditionPredictionPanel` を `酒場キャンペーン` UI 上で end-to-end に検証しました。

- 依頼+パーティ選択時に「推定依頼達成率」「危険度ラベル」「200回の仮想遠征による推定」「内訳展開」が表示されることを確認
- Party / Request 切り替え時の stale prediction 防止を確認
- 同一組み合わせへの復帰でキャッシュが再利用されることを確認
- リーダーの Acceptance 判断が予測値とは独立して動作することを確認
- 仲介確定後、予測パネルが非表示になり、実遠征結果が別途表示されることを確認
- 遠征後の HP/MP/Morale・評判・療養・履歴更新を確認
- console エラーなしを確認

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-1-prediction`
- Dev server: `npm run dev -- --host` → `http://localhost:5173/`
- Campaign seed: `tavern-campaign-001`
- ブラウザ: Chrome（既存）

## 静的検証

| コマンド | 結果 |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | 648 tests passed |
| `npm run build` | PASS（Node.js 20.18.1 バージョン警告のみ） |

## E2E 検証結果

### 1. 予測パネルの基本表示

- 依頼 A（`街道周辺の魔物排除` D）+ パーティ X（`《黒曜の斧》` D）を選択
- 「遠征見込みを計算中…」が経た後、`推定依頼達成率 10%`、`非常に危険`、`200回の仮想遠征による推定`、内訳（完全成功 10% / 成功 0% / 部分成功 7% / 依頼失敗 0% / 撤退 84% / 遠征隊壊滅 0%）が表示された
- **結果: PASS**

![prediction breakdown](https://app.devin.ai/attachments/c819888e-1523-4c23-bec9-e0709f02f224/ss_86bcb309.png)

### 2. Party 切り替え時の stale prediction 防止

- 同じ依頼 A のままパーティ X → パーティ Y（`《蒼穹の槍》` E）へ切り替え
- 古い X の予測値（10%）が Y のパネルに残らず、新しい Y の予測（`0% 非常に危険`）に更新された
- **結果: PASS**

![party switch stale prevention](https://app.devin.ai/attachments/4633395e-9d7a-42f1-b92d-02e41551593f/ss_bd6b8a12.png)

### 3. Request 切り替え時の stale prediction 防止

- パーティ選択が解除され、予測パネルがヒント（「パーティを選択すると…」）に戻る
- 別の依頼を選択し直すと、その組み合わせの新しい予測が表示される
- **結果: PASS**

### 4. キャッシュ再利用

- 一度見た依頼 A + パーティ X（10%）、依頼 B（`未踏洞窟の経路測量` E）+ パーティ Y（`《蒼穹の槍》` E、78% 有望）へ戻した際、同じ値が即座に再表示された
- 200 回の仮想遠征を再計算せず、キャッシュが再利用されている
- **結果: PASS**

![cached prediction 78%](https://app.devin.ai/attachments/e4639dcd-390f-4986-bd80-03243b5d6994/ss_523bef53.png)

### 5. 予測値と Acceptance の独立性

- 依頼 A + パーティ `《鋼の絆》`（E）の予測は `0% 非常に危険`
- それでも `この依頼を紹介する` を実行すると、リーダーは `challengingButSuitable` で **受諾**した
- 予測値（200 回仮想遠征の達成率）と Acceptance Engine（リーダー判断 / 適性評価）は独立して動作している
- **結果: PASS**

![prediction 0%](https://app.devin.ai/attachments/d8e22490-469b-438b-afd2-c863fdb78d0f/ss_b355d263.png)

![acceptance despite 0%](https://app.devin.ai/attachments/a24f4b78-9af2-4d6f-b63f-e4f937db008b/ss_e06edfe4.png)

### 6. 予測結果と実遠征結果の分離

- `本日の仲介を確定` 後、予測パネルは非表示になり、`本日の結果` / `本日の仲介結果` / `TavernResultDetail` が表示される
- 依頼 A + `《鋼の絆》` の実遠征結果は `撤退 (forcedRetreat)`、メンバーの最終 HP/MP/Morale が表示された
- 予測は 0% だったが、実際には生存者 4 名で負傷のみ、別物として表示されている
- **結果: PASS**

![resolve result detail](https://app.devin.ai/attachments/7c9f06bb-05b3-4521-b505-df8f93701b6d/ss_2556c540.png)

### 7. 実遠征後の HP/MP/Morale・評判・療養・履歴更新

- `翌日へ` で Day 2 へ進行。`《蒼穹の槍》` と `《鋼の絆》` が `療養中（あと1日）` となった
- さらに `翌日へ` で Day 3 へ進行。両パーティの HP/MP が全快し、Morale が `max(old + 20, 70)`（70–77）に回復完了
- 履歴パネルに `Day 1 — 評判 10 → 7 (-3)`、`Day 2 — 評判 7 → 7 (+0)` が記録された
- **結果: PASS**

![recovery status Day 2](https://app.devin.ai/attachments/22e45332-19da-40e2-b61a-062407f56a92/ss_6188406d.png)

![recovery complete Day 3](https://app.devin.ai/attachments/890d309c-843f-49dc-9867-c4502968fe1a/ss_868f4b10.png)

### 8. Console エラー

- ブラウザ console に error / unhandled rejection は検出されず
- Vite HMR の reconnect ログと React DevTools の info のみ
- **結果: PASS**

## エスカレーション・発見事項

- 特になし。予測パネル、stale 防止、キャッシュ、Acceptance 分離、遠征後状態更新のすべてが期待通り動作しました。

## 総合判定

**PASS**

## 成果物

- 録画: `/home/ubuntu/screencasts/phase6-1-prediction/phase6-1-prediction-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report.md`
- SKILL.md 更新: `/home/ubuntu/repos/ai_battler/.agents/skills/ai-battler/SKILL.md`
