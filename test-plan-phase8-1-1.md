# Phase 8.1.1 Canvas Tavern UI ブラウザ E2E テスト計画

## 目的

PR #38 `devin/phase8-1-tavern-main-screen`（Phase 8.1.1）の Canvas Tavern UI 統合修正を、dev ビルドでブラウザから end-to-end 検証する。特に以下を確認する。

- `offerRequest` の引数順 `(partyId, requestId)`
- `GameUiActions` の `UiActionResult` によるエラー表示（ヘッダー）
- 滞在延長イベントが Today's Activity に理由ラベル付きで投影されること
- Activity の未読/生成済/閲覧済 状態遷移と AI 呼び出し回数
- 療養中パーティは選択可能だが割り当て不可で理由が表示されること
- `CanvasGame._uiState` を source of truth とした選択再同期
- 通常プレイで AI 呼び出しが発生しないこと
- legacy/canvas 切り替え
- ブラウザ console のエラー/未処理 rejection がないこと

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase8-1-tavern-main-screen`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome（Playwright ヘッドフル）
- Campaign seed: `tavern-campaign-009`（Day1 の受諾・Day2 療養・Day4 滞在延長が発生する確定的 seed）
- AI Provider: 必要に応じて `開発用 Fake Provider を使う`（ダウンタイム narrative 生成確認用）

## 静的検証（E2E 実施前）

| コマンド            | 期待結果 |
| ------------------- | -------- |
| `npm run typecheck` | exit 0   |
| `npm run lint`      | exit 0   |
| `npm run test`      | 全 PASS  |
| `npm run build`     | exit 0   |

## テスト準備

1. `http://localhost:5173/` を開く。
2. `酒場キャンペーン` タブを選択する。
3. Legacy UI の `Campaign Seed` 入力欄に `tavern-campaign-009` を入力し、`新しいキャンペーン` をクリックする。
4. 必要に応じて `AI 接続設定` の `開発用 Fake Provider を使う` をクリックしておく（ダウンタイム narrative 生成確認用）。
5. Legacy UI 右上の `Canvas UI` ボタンをクリックして Canvas Tavern UI に切り替える。
6. BootScene の `Loading...` から約 1.2 s 後に `TavernScene` が表示されるまで待つ。

## 画面レイアウトとクリック座標

Canvas の仮想解像度は 1600×900。`GameViewport` が letterbox/pillarbox スケールを行うため、画面上のクリック座標は以下の式で変換する。

```js
const host = document.querySelector('.game-canvas-host')
const rect = host.getBoundingClientRect()
const scale = Math.min(rect.width / 1600, rect.height / 900)
const offsetX = (rect.width - 1600 * scale) / 2
const offsetY = (rect.height - 900 * scale) / 2
const screenX = rect.left + offsetX + virtualX * scale
const screenY = rect.top + offsetY + virtualY * scale
```

主要 UI 部品の仮想座標（中央をクリック）。

| 部品                                             | 仮想 X | 仮想 Y | 備考                             |
| ------------------------------------------------ | ------ | ------ | -------------------------------- |
| PARTY リスト 1 行目                              | 186    | 156    | 左パネル内。行高 56、gap 8       |
| PARTY リスト 2 行目                              | 186    | 220    |                                  |
| QUEST リスト 1 行目                              | 1394   | 160    | 右パネル内。行高 64、gap 8       |
| QUEST リスト 2 行目                              | 1394   | 232    |                                  |
| `依頼を割り当てる`                               | 482    | 630    | PARTY SUMMARY パネル下部         |
| ヘッダー アクションボタン（本日を確定 / 翌日へ） | 1478   | 32     | 右上。状態に応じてラベル変化     |
| TODAY'S ACTIVITY 1 行目                          | 798    | 756    | 下パネル内。行高 48、gap 6       |
| TODAY'S ACTIVITY 2 行目                          | 798    | 810    |                                  |
| モーダル `閉じる`                                | 1088   | 586    | モーダル右上（GameModal 計算値） |

> 上記座標は 1600×900 仮想キャンバス上の値。Playwright では実画面座標に変換して `pointerdown/up` または `click` する。

## シナリオ

### A. TavernScene 表示確認

1. `Canvas UI` ボタンクリック後、`.game-canvas-host` 内に `<canvas>` が 1 枚だけ存在することを確認する。
2. `DAY 1`、`酒場評判`、`PARTIES`、`PARTY SUMMARY`、`QUESTS`、`TODAY'S ACTIVITY`、右上アクションボタンが表示されていることを確認する。
3. ブラウザ Console に `error` / `pageerror` / `unhandledrejection` がないことを確認する。

**Pass 基準**: TavernScene が正しくレンダリングされ、console エラーがない。

### B. 依頼を紹介・割り当て（正常系）

前提: `tavern-campaign-009` の Day1 では PARTY リスト 1 番目 `山猫の爪` と QUEST リスト 1 番目 `魔物出没原因の調査` が受諾可能。

1. PARTY リスト 1 行目をクリックして `山猫の爪` を選択する（または自動選択されている場合はそのまま）。
2. QUEST リスト 1 行目をクリックして `魔物出没原因の調査` を選択する。
3. `依頼を割り当てる` ボタンをクリックする。
4. 選択された QUEST の status label が `成立` に変わり、PARTY SUMMARY の `依頼：` 欄に `魔物出没原因の調査` が表示されることを確認する。

**Pass 基準**: `offerRequest` が正しいパラメータ順で呼ばれ、依頼が正常に割り当てられる。

### C. 療養中パーティの割り当て失敗

1. B の状態で `本日を確定` をクリックし、遠征結果を確定する。
2. `翌日へ` をクリックして Day 2 に進める。
3. Day2 の PARTY リストで `山猫の爪`（1 行目）が `療養中` であることを確認する。
4. `山猫の爪` をクリックして選択する。
5. 任意の QUEST を選択する。
6. `依頼を割り当てる` ボタンをクリックする（ボタンが `このパーティは療養中です` などの理由ラベルで無効化されていてもクリックを試みる）。
7. ヘッダー下部またはボタンラベルに `このパーティは療養中です` というエラー/無効理由が表示されることを確認する。

**Pass 基準**: 療養中パーティに対する割り当てが失敗し、視覚的なエラー/理由が表示される。

### D. 本日を確定 → 翌日へ進行

1. 再び Day2 状態にする（必要に応じて B の後に `翌日へ`）。
2. 任意の有効な PARTY/QUEST を選択して `依頼を割り当てる`（Day2 の有効パーティから選ぶ）。
3. `本日を確定` をクリックする。
4. 右上ボタンが `翌日へ` に変わることを確認する。
5. `翌日へ` をクリックする。
6. ヘッダーの `DAY` が `2` → `3` に変わり、各パネルが更新されることを確認する。

**Pass 基準**: `resolveDay` / `advanceDay` の結果が UI に反映され、日付が進む。

### E. 選択の再同期

1. Day2 終了後、Day3 進行前に PARTY/QUEST を選択しておく。
2. `翌日へ` をクリックして Day3 に進める。
3. Day3 の PARTY/QUEST リストが更新された後、前日に選択していた PARTY/QUEST が Day3 に存在しない場合、PARTY SUMMARY の選択表示がリセットされる（`パーティを選択してください`）ことを確認する。
4. Console/表示に stale selection 由来のエラーがないことを確認する。

**Pass 基準**: 進行後も `CanvasGame._uiState` が source of truth で、存在しない選択はクリアされる。

### F. 滞在延長イベントの Today's Activity 表示

1. `tavern-campaign-009` で B/D を繰り返し Day4 まで進める。
2. Day4 の `TODAY'S ACTIVITY` を確認する。
3. `滞在延長：山猫の爪` のような項目があり、サマリーに `滞在を2日延長しました（装備準備）` のように **理由ラベル**（`訓練`/`回復`/`装備準備` 等）が含まれていることを確認する。

**Pass 基準**: `stayExtended` イベントが Activity リストに理由ラベル付きで表示される。

### G. 未生成 Activity の開閉と Lazy Narrative

1. Day1 で B を実行した後、`本日を確定` する**前**に `TODAY'S ACTIVITY` を開く。未派遣パーティ（翠葉の風、夜明の鈴、雷鳴の足跡）のダウンタイムイベントが表示される。
2. 未生成（未読ドット付き）の Activity 行をクリックする。
3. モーダルに `生成中…` が表示された後、Fake Provider 接続時は `【Fake生成 #N】...` で始まる narrative、未接続時は fallback summary が表示されることを確認する。
4. モーダルを `閉じる` で閉じる。
5. 同じ Activity 行をもう一度クリックする。
6. 今度は `生成中…` が表示されず即座に内容が表示されることを確認する（2 回目は AI 呼び出しなし）。

**Pass 基準**: 未生成 Activity は 1 回だけ生成・閲覧済みになり、再開時は即座に表示される。

### H. 生成済 Activity の即時表示

1. G で既に閲覧済みになった Activity に対し、もう一度クリックする。
2. モーダルがすぐに開き、同じ内容が表示されることを確認する。
3. `AI呼び出し` カウントが増加していないことを確認する（Legacy UI `AI文章候補` サマリー、`AI呼び出し: 0回`）。

**Pass 基準**: 閲覧済み Activity を開いても AI は呼ばれない。

### I. 通常プレイ中の AI 呼び出し 0 件

1. AI Provider を切断（`AI 接続設定` の `切断`）して `tavern-campaign-009` を最初からやり直す。
2. B〜D（依頼選択・確定・翌日進行）を行う。
3. Activity を開いても fallback テキストが表示され、`AI呼び出し` は `0回` のままであることを確認する。

**Pass 基準**: ダウンタイム narrative 生成なし / Provider 未接続時に AI 呼び出しが発生しない。

### J. Legacy / Canvas 切り替えと Console チェック

1. Legacy UI の `Canvas UI` ボタンをクリックして Canvas に切り替える（`<canvas>` が 1 枚増える）。
2. ブラウザをリロードし、再度 `Canvas UI` をクリックする（重複 canvas がないことを確認）。
3. Legacy UI への切り替えが可能な場合は切り替える。`TavernScene` 内に `Legacy UI` ボタンがない場合は、Legacy UI からの `Canvas UI` 切り替えのみを確認する。
4. DevTools Console を開き、操作全体を通して `error` / `warning` / `unhandledrejection` / `pageerror` がないことを確認する。WebGL ドライバー由来の `GPU stall` 警告は環境起因として除外できるが、出来れば注記する。

**Pass 基準**: 切り替え時に `<canvas>` が 2 枚以上にならず、console エラーがない。

## 判定基準

- 上記 A〜J のすべての Pass 基準を満たし、console に新規のエラー/未処理 rejection がない → PASS
- いずれかの手順で期待と異なる表示・動作・console エラーが発生した場合 → FAIL
- 特に以下は FAIL:
  - `依頼を割り当てる` で正しくないパラメータ順で呼ばれる
  - エラー発生時にヘッダーやボタンに表示されない
  - 滞在延長イベントが `TODAY'S ACTIVITY` に理由ラベルなしで表示される、または表示されない
  - Activity 開閉で AI が複数回呼ばれる / 閲覧済みでも再生成される
  - 療養中パーティに依頼が割り当てられてしまう
  - 日付進行後に stale な PARTY/QUEST 選択が残りエラーになる
  - Canvas / Legacy 切り替えで canvas が重複する、またはアンマウントでエラー
