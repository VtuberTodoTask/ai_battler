# Phase 5 酒場MVP E2E テストレポート

## 概要

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase5-tavern`
- テスト対象コミット: `b059f3eccc2c10e75eefabdcf9a177c666a1aba0`
- PR: `https://github.com/VtuberTodoTask/ai_battler/pull/14`
- テスト日時: 2025-08-08
- 実行環境: Vite dev server `http://localhost:5173`（Node.js 20.18.1 警告あり）
- 録画: `/home/ubuntu/screencasts/ai_battler_phase5_test/ai_battler_phase5_test-edited.mp4`

## 静的チェック結果

```bash
npm run typecheck && npm run lint && npm run test && rm -rf dist && npm run build
```

すべて通過。

| コマンド                       | 結果                                         |
| ------------------------------ | -------------------------------------------- |
| `npm run typecheck`            | 成功                                         |
| `npm run lint`                 | 成功                                         |
| `npm run test`                 | 588 tests passed                             |
| `rm -rf dist && npm run build` | 成功（Vite Node バージョン警告あり、exit 0） |

## テストフロー結果

### 1. 酒場MVP タブを開く

- `http://localhost:5173` を開き、3 番目のタブ `酒場MVP` をクリック。
- 酒場シミュレーター UI が表示され、`Day Seed` 入力欄と `このSeedで生成` / `新しい日` ボタンが表示された。

![酒場MVP 初期表示](https://app.devin.ai/attachments/230aa37e-12da-489b-b669-78e59f9a2bb3/ss_df7c92b9.png)

### 2. 固定 Seed で日付を生成

- `Day Seed` を `tavern-001` にして `このSeedで生成` をクリック。
- 依頼カードが 3 枚、冒険者カードが 8 枚表示された。
- `Day: tavern-001` になった。

### 3. 依頼 A に 4 人を編成

- 1 枚目の依頼 `魔物出没原因の調査` を選択。
- 冒険者 0〜3 をクリックして編成。
- `編成: 4 / 4` となり、派遣編成パネルに 4 人の名前・役割が表示された。

![依頼A 4人編成](https://app.devin.ai/attachments/35dca213-200c-4156-8f32-1101833f2f80/ss_a1e2b018.png)

### 4. 依頼 B に残り 4 人を編成

- 2 枚目の依頼 `学者の護衛` を選択。
- 残りの冒険者 4〜7 をクリックして編成。
- `編成: 4 / 4` となり、A とは異なる 4 人が B に割り当てられた。

![依頼B 4人編成](https://app.devin.ai/attachments/25596333-bc6d-41c2-bde1-97cbc7f83062/ss_f7625aa3.png)

### 5. 依頼 C は編成不可

- 3 枚目の依頼 `負傷した冒険者の救出` を選択。
- 既に A/B に割り当て済みの冒険者カードをクリックしても、C の編成に追加されなかった。
- 依頼 C は `編成: 0 / 4` のままだった。

![依頼C 編成不可](https://app.devin.ai/attachments/4cbd85bc-7eb5-4dfb-aee3-966410b586c6/ss_4fb303c4.png)

### 6. 派遣実行と結果確認

- `本日の派遣を実行` をクリック。
- 結果一覧に A/B/C の 3 枚が表示された。
  - A `魔物出没原因の調査`: `撤退 (forcedRetreat)`
  - B `学者の護衛`: `依頼失敗 (failedObjective)`
  - C `負傷した冒険者の救出`: `未派遣`

![派遣結果](https://app.devin.ai/attachments/43300ec4-f258-4487-90af-c81bbcfc1e47/ss_2b27a6dc.png)

### 7. 結果詳細を開く

- A の結果カードが選択され、詳細パネルが表示された。
- `派遣メンバー`、`重要facts`、`最終結果`（依頼結果・Objective progress）、`戦闘結果`、`Objective summary` が確認できた。

![結果詳細](https://app.devin.ai/attachments/d10f50bb-ced1-460d-9782-46a5d663f928/ss_b44fab01.png)

### 8. 新しい日を生成

- `新しい日` ボタンをクリック。
- `Day Seed` と `Day:` 表示が `tavern-001` から `7zofdkg9` に変更された。
- 依頼タイトルと冒険者名が異なる内容に更新された。
- 依頼カードは 3 枚、冒険者カードは 8 枚、編成はリセットされた。

![新しい日](https://app.devin.ai/attachments/9707106a-5cfc-4ea9-84f9-adf63ee92137/ss_bc84d40a.png)

### 9. Console エラー

- ブラウザ console と `window.onerror` / `unhandledrejection` リスナーでエラーは検出されなかった。

## 注意事項

- テストハーネス上で、一部ボタン（`本日の派遣を実行` など）のネイティブマウスクリックが反応しないことがあった。MVP/Phase 4 と同様の現象で、UI ハンドラ自体は正常に動作しており、`document.querySelectorAll('button').find(...).click()` でフォールバックした。
- Node.js 20.18.1 では `npm run build` / `npm run dev` で Vite バージョン警告が表示されるが、ビルド・dev server ともに成功している。
