# Phase 5.0.1 酒場MVP 短縮 E2E テストレポート

## 概要

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase5-tavern`
- テスト対象コミット: `9e4fd7e1e74d6254e7a33bcbe76a44495a7e19d3`
- PR: `https://github.com/VtuberTodoTask/ai_battler/pull/14`
- テスト日時: 2025-08-08
- 実行環境: Vite dev server `http://localhost:5173`（Node.js 20.18.1 警告あり）
- 録画: `/home/ubuntu/screencasts/ai_battler_phase5_01_test/ai_battler_phase5_01_test-edited.mp4`

## 修正対象

- `src/core/tavern/report.ts`: `DispatchReport.party` を `result.state.partyHp/Mp/Morale` から構築
- `src/core/tavern/dispatch.ts`: 重複依頼割り当て拒否、解決済み日の再解決 throw
- `src/ui/tavern/AdventurerBoard.tsx` / `TavernSimulator.tsx`: 解決後の冒険者ボード read-only
- `src/core/tavern/types.ts`: `EscortDispatchSummary.handoffStatus` の型絞り込み
- テスト追加/更新: `report.test.ts`, `dispatch.test.ts`, `TavernSimulator.test.tsx`

## 静的チェック結果

```bash
npm run typecheck && npm run lint && npm run test && rm -rf dist && npm run build
```

すべて通過。

| コマンド                       | 結果                                         |
| ------------------------------ | -------------------------------------------- |
| `npm run typecheck`            | 成功                                         |
| `npm run lint`                 | 成功                                         |
| `npm run test`                 | 594 tests passed                             |
| `rm -rf dist && npm run build` | 成功（Vite Node バージョン警告あり、exit 0） |

## テストフロー結果

### 1. 酒場MVP タブを開く

- `http://localhost:5173` を開き、3 番目のタブ `酒場MVP` をクリック。
- 酒場 UI が表示され、`Day Seed` 入力とボタンが表示された。

![酒場MVP 初期表示](https://app.devin.ai/attachments/2fc050b6-2596-47db-a38e-deae20c331fd/ss_37f87be1.png)

### 2. 固定 Seed で日付を生成

- `Day Seed: tavern-001` で `このSeedで生成` をクリック。
- 依頼カード 3 枚、冒険者カード 8 枚が表示された。

### 3. 依頼 A/B に 4 人ずつ編成

- 依頼 A `魔物出没原因の調査` に冒険者 0〜3 を割り当て、`編成: 4 / 4` となった。

![依頼A 4人編成](https://app.devin.ai/attachments/b9ea43a8-18c8-43ca-aa78-03a2c983e499/ss_47b8be56.png)

- 依頼 B `学者の護衛` に残り 4 人を割り当て、`編成: 4 / 4` となった。

![依頼B 4人編成](https://app.devin.ai/attachments/6e254bfe-4eca-4c13-851a-370f55065dd0/ss_e1e19a94.png)

### 4. 派遣実行

- `本日の派遣を実行` をクリック。
- A は `撤退 (forcedRetreat)`、B は `依頼失敗 (failedObjective)`、C は `未派遣` で結果が表示された。

### 5. 結果詳細で final HP を確認

- A の結果詳細を開く。
- `派遣メンバー` に `result.state.partyHp` 由来の final HP が表示された。
  - レオ アイヴィー (ranger C) — HP `56/56`
  - シエラ アッシュ (vanguard D) — HP `20/76`（max から減少）
  - ヴァン ドラグナー (mage D) — HP `45/45`
  - レオ リーフ (guardian C) — HP `64/71`（max から減少）

![結果詳細 final HP](https://app.devin.ai/attachments/2cf9e001-1d9e-42cc-b34d-9c10626544e5/ss_5568ac3b.png)

### 6. 解決後の read-only 確認

- 日が `resolved` になった後、冒険者カードをクリックしても編成が変化しなかった。
- `本日の派遣を実行` ボタンは disabled のままで、結果一覧・詳細が維持された。

### 7. 新しい日を生成

- `新しい日` ボタンをクリック。
- `Day Seed` と `Day:` が `tavern-001` から `tg3qkjkw` に変更された。
- 依頼タイトルと冒険者名が異なる内容に更新され、編成と結果がリセットされた。
- 依頼カード 3 枚、冒険者カード 8 枚が表示された。

![新しい日](https://app.devin.ai/attachments/aa8e115f-d444-45eb-91d2-1b2117443647/ss_dfbfb43d.png)

### 8. Console エラー

- ブラウザ console と `window.onerror` / `unhandledrejection` リスナーでエラーは検出されなかった。

## 注意事項

- テストハーネス上で、下部ボタンのネイティブマウスクリックが反応しないことがあった。以前のテストと同様に `document.querySelectorAll('button').find(...).click()` でフォールバックした。UI ハンドラ自体は正常に動作した。
- Node.js 20.18.1 では Vite のバージョン警告が出るが、dev server / build は成功している。
