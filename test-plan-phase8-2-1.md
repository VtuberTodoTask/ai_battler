# Phase 8.2.1 Canvas Tavern UI ブラウザ E2E テスト計画

## 目的

PR #39 `devin/phase8-2-game-feedback-and-reports`（Phase 8.2 / 8.2.1）の Canvas Tavern UI における

- 遠征報告の重複排除
- 構造化負傷表示
- Activity / 報告の未読状態
- 滞在延長 narrative の AI 呼び出しキャッシュ
- 重要通知モーダルのアクション
- 構造化読み出し時の AI 呼び出し 0 件
- 報酬「記録なし」表示
  をブラウザで end-to-end 検証する。

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase8-2-game-feedback-and-reports`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome（Playwright ヘッドフル）
- キャンバス仮想解像度: 1600×900（`GameViewport` letterbox/pillarbox スケール）
- テスト用 seeds:
  - `e2e-2`：Day1 で負傷を含む `completeSuccess`、約 Day7 に滞在延長イベント
  - `phase8-2-report`：Day1 で `星読み` の依頼拒否、`流水の滴` の依頼受諾、遠征帰還報告

## 静的検証（E2E 実施前）

| コマンド            | 期待結果 |
| ------------------- | -------- |
| `npm run typecheck` | exit 0   |
| `npm run lint`      | exit 0   |
| `npm run test`      | 全 PASS  |
| `npm run build`     | exit 0   |

## 準備

1. `http://localhost:5173/` を開く。
2. Legacy UI の `Campaign Seed` 入力欄に seed を入力し、`新しいキャンペーン` をクリックする。
3. Legacy UI の `AI 接続設定` で `開発用 Fake Provider を使う` をクリックする（narrative 生成確認用）。
4. Legacy UI 右上の `Canvas UI` ボタンをクリックして Canvas Tavern UI に切り替える。
5. BootScene から TavernScene が表示されるまで待つ。

## クリック座標変換

```js
const c = document.querySelector('.game-canvas-host canvas')
const rect = c.getBoundingClientRect()
const scale = Math.min(rect.width / 1600, rect.height / 900)
const offsetX = (rect.width - 1600 * scale) / 2
const offsetY = (rect.height - 900 * scale) / 2
function click(virtualX, virtualY) {
  const clientX = rect.left + offsetX + virtualX * scale
  const clientY = rect.top + offsetY + virtualY * scale
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    c.dispatchEvent(
      new PointerEvent(type, { clientX, clientY, bubbles: true, pointerId: 1 }),
    )
  }
}
```

主要 UI 部品の仮想座標（中央をクリック）。

| 部品                                             | 仮想 X    | 仮想 Y                | 備考                         |
| ------------------------------------------------ | --------- | --------------------- | ---------------------------- |
| ヘッダー `報告` ボタン                           | 1260–1380 | 10–54                 | 右上、未読時 `報告 ●N`       |
| ヘッダー アクションボタン（本日を確定 / 翌日へ） | 1388–1568 | 10–54                 | 状態に応じて切替             |
| PARTY リスト 1 行目                              | 28–356    | 128–184               | 左パネル内                   |
| QUEST リスト 1 行目                              | 1236–1564 | 128–192               | 右パネル内                   |
| `依頼を割り当てる` ボタン                        | 約 100    | 約 PARTY SUMMARY 下部 | 仮想 X≈100、Y≈MAIN_HEIGHT-20 |
| TODAY'S ACTIVITY 1 行目                          | 28–1568   | 732–768               | 下パネル内、行高 36、gap 6   |
| モーダル `閉じる`                                | 956–1076  | 566–606               | モーダル右下                 |
| モーダル内アクションボタン                       | 524 付近  | 382 付近              | 幅 140、高さ 32              |
| 報告詳細 `物語として読む`                        | 約 600    | スクロール下端        | 幅 180、高さ 40              |
| 滞在延長 `物語として読む`                        | 約 600    | 400 付近              | 幅 180、高さ 40              |

> `PARTY SUMMARY` 内の `依頼を割り当てる` ボタンは `PartySummaryPanel` 内で `x = s16`、`y = _height - 60`（Panel 高さ - 60）。仮想概算 X≈28、Y≈MAIN_Y + MAIN_HEIGHT - 30 ≈ 680。実際のレイアウトは `MAIN_HEIGHT = 900 - 64 - 200 - 48 = 588`、`MAIN_Y = 80`、Panel Y=80、高さ 588、ボタン Y=588-60=528（Panel 内相対）=> 絶対 Y≈80+528+20=628。調整可能。

## テストシナリオ

### A. 静的検証

1. `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` を実行。
2. すべて exit 0 / PASS であることを確認する。

**Pass 基準**: 静的コマンドが全て成功。

### B. 依頼拒否・受諾と quest リスト表示（`phase8-2-report`）

前提: 新規キャンペーン `phase8-2-report` を Canvas UI で開く。

1. `星読み`（PARTY リスト 2 行目）を選択する。
2. `未踏洞窟の経路測量`（QUEST リスト 1 行目）を選択する。
3. `依頼を割り当てる` をクリックする。
4. ヘッダー下部に `星読みは依頼を断りました`（`poorFit` 理由）が表示され、QUEST リストで `未踏洞窟の経路測量` が `拒否済`（`星読み` 選択時）になることを確認する。
5. `流水の滴`（PARTY リスト 1 行目）を選択する。
6. `未踏洞窟の経路測量`（QUEST リスト 1 行目）を選択したまま `依頼を割り当てる` をクリックする。
7. 依頼が `成立` になり、PARTY SUMMARY に `依頼：未踏洞窟の経路測量` が表示されることを確認する。
8. `TODAY'S ACTIVITY` に `流水の滴が依頼を引き受けました` と `星読みは依頼を断りました` の行があり、未読ドットが付いていることを確認する。

**Pass 基準**: 拒否・受諾が正しく quest リストと Activity リストに反映され、Activity に未読ドットがある。

### C. 報告の重複排除（`phase8-2-report`）

前提: B の状態から続ける。

1. 右上アクションボタン `本日を確定` をクリックする。
2. 右上ボタンが `翌日へ` に変わるのを確認する。
3. ヘッダー `報告` ボタンをクリックする。
4. `最近の報告` モーダルに `Day 1  未踏洞窟の経路測量  流水の滴  完全成功` が **1 行だけ**表示されることを確認する。
5. モーダルを閉じ、右上 `翌日へ` をクリックして Day 2 に進める。
6. 再び `報告` ボタンを開き、同じ遠征報告が **1 行だけ**（重複なし）残っていることを確認する。

**Pass 基準**: resolve 後・advance 後ともに、同じ遠征が 1 回しか表示されない。

### D. 重要通知モーダルとアクション（`phase8-2-report`）

前提: C の advance 後、Day 2。

1. Day 1 resolve 時に `本日の重要な出来事` モーダルが自動で開かれ、遠征帰還に `報告を見る` ボタンがあることを確認する（必要に応じてモーダルをスクロール）。
2. `報告を見る` をクリックし、遠征報告モーダルに遷移することを確認する。
3. 報告を閉じ、`翌日へ` 進むと、Day 2 の新規パーティ到着で `本日の重要な出来事` モーダルが開き、`選択する` ボタンがあることを確認する。
4. `選択する` をクリックし、PARTY SUMMARY がそのパーティの内容に切り替わることを確認する。

**Pass 基準**: `expedition_return` 通知の `報告を見る` で報告モーダル、`party_arrival` 通知の `選択する` でパーティ選択が動作する。

### E. 構造化未読と重要通知の非自動既読（`phase8-2-report`）

前提: B/C 後、`本日の重要な出来事` モーダルを閉じた状態。

1. `TODAY'S ACTIVITY` の `星読みは依頼を断りました` 行（未読ドット付き）をクリックする。
2. モーダルに `理由：相性不良 — ...` と表示されることを確認する。
3. モーダルを閉じる。
4. `TODAY'S ACTIVITY` の同じ行の未読ドットが消えたことを確認する。
5. `本日の重要な出来事` 通知を開いて `閉じる` のみを繰り返し、対応する Activity 行の未読ドットが **消えない**ことを確認する。

**Pass 基準**: Activity 開閉で未読ドットが消える。重要通知モーダルを閉じるだけでは Activity が既読にならない。

### F. 構造化読み出しで AI 呼び出し 0 件（`phase8-2-report`）

前提: Fake Provider を未接続にするか、Legacy UI の `AI 接続設定` で `切断` する。

1. Legacy UI の `AI文章候補` サマリーで `AI呼び出し: 0回` を確認する。
2. Canvas UI で `星読みは依頼を断りました` Activity を開く。
3. Legacy UI に戻り、`AI呼び出し` が 0 のままであることを確認する。
4. 同様に `報告` アーカイブから報告を開く（narrative ボタンはまだ押さない）。
5. Legacy UI で `AI呼び出し` が 0 のままであることを確認する。

**Pass 基準**: quest 拒否 / 報告詳細の開封だけでは `narrativeGenerations` が増えない。

### G. 負傷表示（`e2e-2`）

前提: 新規キャンペーン `e2e-2` を Canvas UI で開く。

1. PARTY リスト 1 行目 `月灯` を選択し、QUEST リスト 1 行目 `行方不明調査員の救出` を選択して `依頼を割り当てる` をクリックする。
2. `本日を確定` → `翌日へ` はまだせず、`報告` ボタンを開く。
3. 報告行 `Day 1  行方不明調査員の救出  月灯  完全成功` をクリックする。
4. 報告詳細に以下が含まれることを確認する：
   - `結果：完全成功`
   - `目的：...`
   - `生還：4 / 4 生還`
   - `負傷：ゴウ ジェム：軽傷`（構造化 `state.injuries` 由来、HP 比ではない）
   - `殉職：なし`
   - `報酬：記録なし`
   - `主な出来事` 数行

**Pass 基準**: 負傷行に `軽傷`/`重傷` の構造化ラベルが表示され、記録なし時は `報酬：記録なし` となる。

### H. 遠征報告 narrative の AI 呼び出し・キャッシュ（`e2e-2`）

前提: G の報告詳細を開いている、Fake Provider 接続済み。

1. Legacy UI `AI呼び出し` を `0` または既存値を記録する。
2. 報告詳細の `物語として読む` をクリックする。
3. モーダルに `【Fake生成 #1】...` が表示され、Legacy UI `AI呼び出し` が `+1` 増えることを確認する。
4. `閉じる` で閉じる。
5. 同じ報告を再度開き、`物語として読む` を再度クリックする。
6. 今度は `生成中…` が表示されず、即座に同じ内容が表示され、`AI呼び出し` が増えないことを確認する。

**Pass 基準**: 1 回目 narrative 生成は 1 AI コール、2 回目は 0 AI コールでキャッシュ表示。

### I. 滞在延長 narrative の AI 呼び出し・キャッシュ（`e2e-2`）

前提: G の Day1 resolve 後、`翌日へ` を繰り返し約 Day7 まで進める。途中追加の依頼割当は行わない。

1. `TODAY'S ACTIVITY` に `滞在延長：月灯` が表示された日を確認する（約 Day7）。
2. その行をクリックする。
3. 滞在延長詳細モーダルに `滞在を...日延長しました（...）` と `物語として読む` ボタンがあることを確認する。
4. Legacy UI `AI呼び出し` を記録し、`物語として読む` をクリック。
5. `【Fake生成 #N】...` が表示され、`AI呼び出し` が +1 増えることを確認する。
6. `閉じる`。
7. 同じ滞在延長 Activity を再度開き `物語として読む` をクリック。
8. 即座に同じ内容が表示され、`AI呼び出し` が増えないことを確認する。

**Pass 基準**: 滞在延長 narrative も 1 回目 1 AI コール、再開 0 AI コール。

### J. レガシー / Canvas 切り替えと console エラー

1. Legacy UI に戻り、`Canvas UI` ボタンをクリックする。
2. Canvas TavernScene が再表示され、`<canvas>` が 1 枚だけであることを確認する。
3. DevTools Console を開き、操作全体を通して `console.error` / `pageerror` / `unhandledrejection` がないことを確認する。WebGL ドライバー由来の `GPU stall` 警告は環境起因として除外できるが、出来れば注記する。

**Pass 基準**: Canvas UI 切り替えで canvas が重複せず、console エラーがない。

## 判定基準

- A〜J のすべての Pass 基準を満たし、console に新規のエラー/未処理 rejection がない → PASS
- いずれかで期待と異なる表示・動作・console エラーが発生した場合 → FAIL
- 特に以下は FAIL:
  - 報告アーカイブに同じ遠征が 2 行以上表示される
  - 負傷行が HP 比（例 `HP 11/12`）で表示される、または `軽傷`/`重傷` ラベルがない
  - Activity を開いても未読ドットが消えない、または重要通知を閉じただけで既読になる
  - `物語として読む` 2 回目に AI コールが発生する
  - 重要通知アクション（`報告を見る` / `選択する`）が正しく遷移しない
  - 報告詳細 / 依頼拒否 / 滞在延長詳細の表示で AI コールが発生する
  - `報酬：記録なし` が表示されない
