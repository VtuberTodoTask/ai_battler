# Phase 7.0 AI 物語生成 UI E2E テストレポート

## 概要

- ブランチ: `devin/phase7-0-ai-narrative-mvp`
- サーバー: `npm run dev` → `http://localhost:5173/`
- テストツール: Playwright ヘッドフル Chromium
- Campaign seed: `phase7-search-155`（14 日までの自然なシナリオで `farewell`/`becameRegular`/`partyArrival`/`weakObjectiveSuccess`/`stayExtended` が発生）
- 録画: `/home/ubuntu/screencasts/phase7-0-narrative-e2e-clean/phase7-0-narrative-e2e-clean-edited.mp4`

## 静的検証

| コマンド            | 結果 |
| ------------------- | ---- |
| `npm run typecheck` | PASS |
| `npm run lint`      | PASS |
| `npm run test`      | PASS |
| `npm run build`     | PASS |

## テスト手順と結果

### 1. Cost Control — プロバイダ未接続で AI 呼び出しが発生しない

**手順**: `phase7-search-155` でキャンペーン開始 → Day 1 を 1 日確定・翌日進行しても NarrativeSettings を触らない。

**結果**: NarrativeQueue サマリーが `候補: 2件 | 未生成: 2件 | 選択中: 0件 | AI呼び出し: 0回 | 状態: AI未接続` のままであった。

**結果**: ✅ PASS

![cost-control](https://app.devin.ai/attachments/ed596485-7d83-47e2-a4fc-f49f2ee09915/ss_02-cost-control-summary.png)

### 2. Expedition 生成 — Fake Provider 接続と初回生成

**手順**: NarrativeSettings の `開発用 Fake Provider を使う` をクリック → Day 1 の `遠征レポート：洞窟の魔物討伐` 候補を生成。

**結果**:

- 状態が `接続済み (fake)` に変化
- 候補が `生成済み` に変化
- 生成テキストに `【Fake生成 #1】` が含まれる
- `model: fake-model | provider: fake | tokens: 156` を表示
- `AI呼び出し: 1回` に更新

**結果**: ✅ PASS

![fake-provider](https://app.devin.ai/attachments/0228fc59-0e15-4373-9669-2a746cc61556/ss_03-fake-provider-connected.png)
![expedition-generated](https://app.devin.ai/attachments/513b2829-76ee-447d-89f2-257a1aa791be/ss_04-expedition-generated.png)

### 3. Character Event 生成 — `partyArrival` と `becameRegular`

**手順**: Day 5 開始時に `新しい顔：砂塵の露`（`partyArrival`）を生成。Day 6 開始時に `常連になった：灰狼の牙`（`becameRegular`）を生成。

**結果**:

- `partyArrival` 候補が `生成済み` になり、`Event Type: partyArrival` が表示
- `becameRegular` 候補が `生成済み` になり、`Event Type: becameRegular` が表示
- `AI呼び出し` がそれぞれ 1 増加

**結果**: ✅ PASS

![party-arrival](https://app.devin.ai/attachments/c6119f95-2f05-4883-976d-ba4606c5bb42/ss_06-party-arrival-generated.png)
![became-regular](https://app.devin.ai/attachments/368eecb1-7588-48e5-82ac-dc37358f07c1/ss_10-became-regular.png)

### 4. Bulk 生成

**手順**: Day 6 時点で未生成の `partyArrival` 候補を 2 件チェックし、`選択中2件を生成（AIを2回呼び出し）` をクリック。

**結果**: 2 件とも `生成済み` に変わり、`AI呼び出し` が 2 増加（3 → 5）。

**結果**: ✅ PASS

![bulk](https://app.devin.ai/attachments/0742381c-8dfc-46bc-8bc4-648696bf3458/ss_11-bulk-generated.png)

### 5. Dismiss / Restore

**手順**: 未生成の `弱ObjectiveSuccess` 候補を `非表示` → `復元`。

**結果**:

- `AI呼び出し` カウントが変化しない
- 候補が `非表示` → `未生成` に戻る
- Before/After サマリーは `AI呼び出し: 1回` で同値を維持

**結果**: ✅ PASS

![dismissed](https://app.devin.ai/attachments/b329dc39-481c-4dae-a1fd-8636beae3175/ss_07-dismissed.png)
![restored](https://app.devin.ai/attachments/db2b0ee9-8089-4fc0-b0e3-5374d35a0eb2/ss_08-restored.png)

### 6. Provider エラー — 無効な HTTP エンドポイント

**手順**: `エンドポイント` に `http://localhost:5173/invalid`、`モデル` に `none` を入力して `HTTP Provider で接続` → 未生成候補を生成。

**結果**:

- `AI文章の生成に失敗しました。HTTP 404:` と赤文字で表示
- `AI呼び出し` カウントが増えない
- `開発用 Fake Provider を使う` に切り替えて翌日進行可能

**結果**: ✅ PASS

![provider-error](https://app.devin.ai/attachments/a40e6679-4d71-4649-9d81-63a7e4c3182c/ss_09-provider-error.png)

### 7. Farewell 生成 — 好感度 60 以上でパーティ離脱

**手順**: Day 13 まで進行 → Day 14 開始時に `別れの挨拶：灰狼の牙` 候補が出現 → 生成。

**結果**:

- `別れの挨拶：灰狼の牙` 候補が `未生成` → `生成済み` に変化
- 生成テキストに `Event Type: farewell` / `Party: 灰狼の牙` が含まれる
- `AI呼び出し` が 5 → 6 に増加

**結果**: ✅ PASS

![day14-queue](https://app.devin.ai/attachments/f6b72929-3c04-4e15-88d4-4e6c14538ba4/ss_12-day14-queue.png)
![farewell-generated](https://app.devin.ai/attachments/f00122c1-a6f9-4e52-b1ba-2faaafd7de67/ss_13-farewell-generated.png)

### 8. Console エラー確認

**結果**: ❌ FAIL（警告あり）

- `console.error` に React 制御/非制御 input 切り替え警告が 2 件発生
  - `A component is changing a controlled input to be uncontrolled.`
  - `A component is changing an uncontrolled input to be controlled.`
- `Failed to load resource: the server responded with a status of 404 (Not Found)` が 1 件発生（Provider エラーテストで意図的に無効エンドポイントを叩いたため、UI 側は `HTTP 404` をキャッチして表示した）

Unhandled rejection / page error / その他の JS ランタイムエラーは検出されなかった。

詳細: `/home/ubuntu/screenshots/phase7-0-console.log`

## 総括

- Phase 7.0 の受け入れ条件である「Cost Control」「Expedition 生成」「Character Event 生成」「Farewell 生成」「Bulk 生成」「Dismiss/Restore」「Provider エラー後の翌日進行」はすべて期待通りに動作した。
- ただし、`NarrativeCandidateCard`（または `NarrativeSettings`）の checkbox/入力コンポーネントが制御/非制御間で切り替わっており、`console.error` が 2 件残存している。これは spec の「console エラー 0 件」に抵触するため、マージ前に修正が必要。

## 成果物パス

- 録画: `/home/ubuntu/screencasts/phase7-0-narrative-e2e-clean/phase7-0-narrative-e2e-clean-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase7-0.md`
- コンソールログ: `/home/ubuntu/screenshots/phase7-0-console.log`
- 主要スクリーンショット: `/home/ubuntu/screenshots/ss_02-cost-control-summary.png` など（`/tmp/pw-e2e/` 内にも同ファイルあり）

## 提案 PR コメント

```markdown
## Phase 7.0 AI 物語生成 UI E2E テスト結果

- `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` がすべて通過しました。
- `npm run dev` で `http://localhost:5173/` を起動し、seed `phase7-search-155` で 14 日進行させる録画付きブラウザ E2E を実施しました。
- Fake Provider を使って **AI 未接続 / 遠征生成 / Character Event / Farewell / Bulk / Dismiss-Restore / Provider エラー** の各シナリオを確認しました。

### 確認できたこと

1. **Cost Control**: Day1 確定・翌日進行後も `AI呼び出し: 0回` / `状態: AI未接続` でした。
2. **Expedition 生成**: Fake Provider 接続後、`遠征レポート：洞窟の魔物討伐` を生成。`【Fake生成 #1】` / `model: fake-model` / `tokens: 156` が表示され、`AI呼び出し: 1回` に更新。
3. **Character Event**: `partyArrival`（新しい顔）と `becameRegular`（常連）を生成。`Event Type: partyArrival` / `becameRegular` が生成テキストに含まれました。
4. **Bulk 生成**: 未生成 `partyArrival` 2 件を選択して一括生成。`AI呼び出し` が 3 → 5 に増加。
5. **Dismiss / Restore**: 候補を `非表示` → `復元` しても `AI呼び出し` カウントは変化せず。
6. **Provider エラー**: `http://localhost:5173/invalid` を HTTP Provider に設定して生成。`AI文章の生成に失敗しました。HTTP 404:` が表示され、Fake Provider に戻して翌日進行可能。
7. **Farewell**: Day14 開始時に `別れの挨拶：灰狼の牙` が出現し、生成後 `AI呼び出し` は 5 → 6 に増加。

### 発見した問題

- ブラウザ console に React の制御/非制御 input 切り替え警告が 2 件 (`console.error`) 残存しています。`NarrativeCandidateCard` の checkbox、または `NarrativeSettings` の入力フィールドで `undefined` ↔ 値の切り替えが発生している可能性があります。spec の「console エラー 0 件」を満たすため、修正が必要です。
- `Failed to load resource: 404` は Provider エラーテストで意図的に発生させたネットワークエラーです。UI はキャッチしてエラーメッセージを表示しています。

### キー証拠

<details open>
<summary>Cost Control: AI呼び出し 0回 / AI未接続</summary>

![cost-control](https://app.devin.ai/attachments/ed596485-7d83-47e2-a4fc-f49f2ee09915/ss_02-cost-control-summary.png)

</details>

<details>
<summary>Expedition 生成（Fake Provider）</summary>

![expedition](https://app.devin.ai/attachments/513b2829-76ee-447d-89f2-257a1aa791be/ss_04-expedition-generated.png)

</details>

<details>
<summary>partyArrival / becameRegular 生成</summary>

![party-arrival](https://app.devin.ai/attachments/c6119f95-2f05-4883-976d-ba4606c5bb42/ss_06-party-arrival-generated.png)

![became-regular](https://app.devin.ai/attachments/368eecb1-7588-48e5-82ac-dc37358f07c1/ss_10-became-regular.png)

</details>

<details>
<summary>Bulk 生成</summary>

![bulk](https://app.devin.ai/attachments/0742381c-8dfc-46bc-8bc4-648696bf3458/ss_11-bulk-generated.png)

</details>

<details>
<summary>Provider エラー（HTTP 404）</summary>

![provider-error](https://app.devin.ai/attachments/a40e6679-4d71-4649-9d81-63a7e4c3182c/ss_09-provider-error.png)

</details>

<details>
<summary>Farewell 生成</summary>

![farewell](https://app.devin.ai/attachments/f00122c1-a6f9-4e52-b1ba-2faaafd7de67/ss_13-farewell-generated.png)

</details>

- 録画: `/home/ubuntu/screencasts/phase7-0-narrative-e2e-clean/phase7-0-narrative-e2e-clean-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase7-0.md`
```

## SKILL.md / Blueprint 更新

- SKILL.md: `/home/ubuntu/repos/ai_battler/.agents/skills/ai-battler/SKILL.md` は既存の UI テスト・Vite dev サーバー手順を網羅しています。今回新たに `NarrativeQueue`/`NarrativeSettings` の `data-testid` ベースの Playwright シナリオを追加する価値がありますが、コード変更ではないため未更新とします。
- Blueprint: 既存 blueprint は `npm run dev`（ポート 5173）をカバーしています。今回使用した Playwright ヘッドフルドライバは `/tmp/pw-e2e` に手動インストールしたものであり、blueprint には未記載です。継続的に Playwright E2E を行う場合は `npm install -D @playwright/test` と `npx playwright install` を追加するとよいでしょう。
