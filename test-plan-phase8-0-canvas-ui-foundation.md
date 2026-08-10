# Phase 8.0.1 Canvas UI Foundation ブラウザ E2E テスト計画

## 目的

`devin/phase8-0-canvas-ui-foundation`（PR #37、Phase 8.0.1 修正版）で追加された PixiJS v8 ベースの Canvas 表示層が、Legacy DOM UI からの切り替え・1 枚だけの `<canvas>` 管理・BootScene→FoundationDemoScene 遷移・基礎 UI プリミティブ動作・ウィンドウリサイズ対応・クリーンなアンマウントを end-to-end で満たしているか検証する。特に「Canvas UI を何度切り替えても canvas/Pixi Application/ticker が重複しない」「console に Pixi / React / app からのエラー・警告が出ない」を重視する。

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase8-0-canvas-ui-foundation`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome（Playwright ヘッドフル）
- Campaign seed: デフォルト `tavern-campaign-001`（AI Provider 未接続で操作する）

## 静的検証（E2E 実施前に green）

| コマンド            | 期待結果 |
| ------------------- | -------- |
| `npm run typecheck` | exit 0   |
| `npm run lint`      | exit 0   |
| `npm run test`      | 全 PASS  |
| `npm run build`     | exit 0   |

## シナリオ

### 1. Legacy UI ロードと Canvas UI 切り替え

**手順**:

1. `http://localhost:5173/` を開く。
2. `酒場キャンペーン` タブをクリック。
3. Legacy DOM UI に右上の `Canvas UI` ボタンが表示されることを確認する。
4. `Canvas UI` ボタンをクリックする。
5. BootScene の `Loading...` が Canvas 上に表示され、約 1.2 秒後に FoundationDemoScene に自動遷移するまで待つ。

**Pass 基準**:

- `.game-canvas-host` 内に `<canvas>` が **1 枚だけ**追加される（`querySelectorAll('canvas').length === 1`）。
- Canvas の width/height（CSS bounding box）が 0 ではない。
- FoundationDemoScene 遷移後、画面上に `DAY 1`、`酒場評判`、`PARTIES` パネル、`TAVERN` パネル、下部ボタン `Panel`/`Tooltip`/`Modal`/`Scroll`/`Legacy UI` が確認できる。
- `F12` Console に `error`/`pageerror`/`unhandled rejection` および Pixi / React / app の警告が出ない。

### 2. プリミティブ UI 動作（Tooltip / Modal / Scroll）

**手順**:

1. 下部 `Panel` ボタンをクリックする。
2. `閉じる` ボタンをクリックする。
3. `Tooltip` ボタンにマウスオーバーし、ツールチップが表示されるのを確認する。
4. マウスを別の場所へ移動しツールチップが消えることを確認する。
5. `Modal` ボタンをクリックする。
6. `閉じる` ボタンをクリックする。
7. `Scroll` ボタンをクリックする。
8. スクロール可能エリアでマウスホイールを下方向へ動かす。
9. `閉じる` ボタンをクリックする。

**Pass 基準**:

- `Panel` クリックで `Panel Test` モーダルが開く（タイトル + 閉じるボタン）。
- `Tooltip` ホバーで日本語ツールチップテキストが表示される。
- `Modal` クリックで `Modal Test` モーダルが開く。
- `Scroll` クリックで 40 件の `スクロールアイテム #N` が入ったモーダルが開き、ホイールで内容がスクロールする。
- 各操作で `error`/`warning`/`pageerror` が発生しない。

### 3. Legacy UI 切り戻しと Canvas UI 再切替（重複チェック）

**手順**:

1. Canvas 下部 `Legacy UI` ボタンをクリックする。
2. Legacy DOM UI に戻り、右上に `Canvas UI` ボタンが再表示されることを確認する。
3. `.game-canvas-host` 内に `<canvas>` が **0 枚**であることを確認する。
4. もう一度 `Canvas UI` ボタンをクリックする。
5. 再び FoundationDemoScene が表示されるまで待つ。

**Pass 基準**:

- Legacy UI 復帰時、`document.querySelectorAll('.game-canvas-host canvas').length === 0`。
- 再度 Canvas UI に切り替えた後、`.game-canvas-host canvas` は **1 枚**。
- 2 度目の Canvas UI でも `DAY 1`/`酒場評判`/各パネル/ボタンが最初と同じように表示される。
- `error`/`warning`/`pageerror` なし。特に「ticker already added」「canvas already initialized」「multiple Pixi applications」類の警告がない。

### 4. ウィンドウリサイズでアスペクト比維持

**手順**:

1. Canvas UI 表示中、ブラウザ viewport を 1024×600 に変更する。
2. スクリーンショットを取得する。
3. viewport を 1600×900 に変更する。
4. スクリーンショットを取得する。
5. viewport を 2560×1080 に変更する。
6. スクリーンショットを取得する。

**Pass 基準**:

- いずれのサイズでも Canvas 内の UI レイアウトが歪まず、中央に 16:9 領域が表示される（極端な縦横比では上下または左右に黒帯が入る）。
- 文字・ボタンが潰れたり引き伸ばされたりしない。
- `error`/`warning`/`pageerror` なし。

### 5. AI 呼び出しゼロの確認

**手順**:

1. 全シナリオを通じて `NarrativeSettings` の Provider を選択・接続しない。
2. Canvas UI の `NEXT DAY` や Legacy UI の `本日の仲介を確定` ボタンを操作しない（または、操作しないまま Canvas UI のみ検証する）。

**Pass 基準**:

- Legacy UI の `NarrativeQueue` サマリーに `AI呼び出し: 0回` と表示され続ける。
- Network タブや console に LLM / narrative 生成系の HTTP リクエストが出ない。
- `error`/`pageerror` なし。

## 操作方法（フォールバック）

Canvas 内のボタンは CSS ではなく PixiJS 内部でヒット判定を行う。座標は仮想解像度 1600×900 から `GameViewport` の scale/offset に変換してクリックする。Playwright 内のヘルパーは以下のように計算する。

```js
const host = document.querySelector('.game-canvas-host')
const rect = host.getBoundingClientRect()
const scale = Math.min(rect.width / 1600, rect.height / 900)
const offsetX = (rect.width - 1600 * scale) / 2
const offsetY = (rect.height - 900 * scale) / 2
const screenX = rect.left + offsetX + virtualX * scale
const screenY = rect.top + offsetY + virtualY * scale
```

主なボタンの仮想座標中央（参考値）:

- `Panel` : `(102, 844)`
- `Tooltip` : `(252, 844)`
- `Modal` : `(418, 844)`
- `Scroll` : `(584, 844)`
- `Legacy UI` : `(750, 844)`
- `閉じる`（モーダル右上）: `(1016, 586)`
- `PARTIES` 先頭パーティ: `(188, 158)`

もしネイティブクリックが反応しない場合、ブラウザコンソールで `document.querySelector('.game-canvas-host canvas').dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, bubbles: true }))` 等でフォールバックする。

## Pass / Fail 基準

- 上記 5 項目すべてが期待値を満たし、console に `error` / `warning` / `pageerror` / `unhandled rejection` が 1 件もない: PASS
- 以下のいずれかが発生した場合: FAIL
  - `Canvas UI` 切り替え時に `<canvas>` が 2 枚以上生成される、または canvas のサイズが 0
  - Legacy UI 復帰後も canvas が残る
  - BootScene から FoundationDemoScene に遷移しない
  - ボタン・モーダル・スクロール・ツールチップが動作しない
  - リサイズで UI が歪む / 黒帯が正しく入らない
  - `console.error` や Pixi の警告が発生する
  - AI 呼び出しが発生する
