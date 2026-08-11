# Phase 8.0 — Canvas Game UI Foundation Report

## 1. 目的

Phase 7 系の Core ロジックを変更せず、PixiJS v8 を用いた Canvas 表示層の基盤を構築する。

- Core Game Logic を Canvas へ移行しない。
- React は application bootstrap / Canvas host DOM / legacy DOM UI / settings / error boundary に使用。
- Legacy DOM UI を即削除せず、`uiMode: 'legacy' | 'canvas'` で切り替え可能にする。
- 論理解像度 1600×900、16:9 アスペクト比維持、letterbox/pillarbox 許容。
- ViewModel 層で Core Domain Model を Canvas 用の表示モデルへ投影する。

## 2. 導入・変更概要

### 2.1 依存

- `pixi.js` `^8.19.0` を `dependencies` に追加。
- `@pixi/react` は Phase 8.0 では導入していない。

### 2.2 新規ディレクトリ

```
src/ui/canvas/
  CanvasGame.ts                 # Pixi Application lifecycle、viewport、layer、cleanup
  GameCanvasHost.tsx            # React host（lazy import、StrictMode対応）
  GameViewport.ts               # 1600x900 virtual resolution math
  types.ts                      # GameSceneContext, GameUiActions, GameUiState
  components/
    GamePanel.ts
    GameButton.ts
    GameLabel.ts
    GameScrollView.ts
    GameTooltip.ts
    GameModal.ts
  scenes/
    GameScene.ts
    GameSceneManager.ts
    BootScene.ts
    FoundationDemoScene.ts
  overlays/
    OverlayManager.ts
  theme/
    gameTheme.ts
    typography.ts
  assets/
    GameAssetManager.ts
  viewModel/
    gameUiViewModel.ts
  __tests__/
    gameViewport.test.ts
    gameSceneManager.test.ts
    gameUiViewModel.test.ts
    gameButton.test.ts
    gameModal.test.ts
    gameScrollView.test.ts
    canvasGame.test.ts
    canvasLifecycle.test.tsx
    phase8-0-canvas-ui-foundation-smoke.test.ts
```

### 2.3 既存ファイル変更

- `src/ui/tavern/TavernSimulator.tsx`
  - `uiMode` 状態を追加。
  - `GameCanvasHost` を `React.lazy` で読み込み、Canvas/Legacy 切り替えを実装。
  - Legacy UI 上に「Canvas UI」切り替えボタンを追加。
- `src/ui/tavern/tavern.css`
  - `.ui-mode-switch`, `.tavern-canvas-shell`, `.game-canvas-host`, `.game-canvas-error`, `.canvas-loading` スタイルを追加。
- `package.json`
  - `phase8-0-canvas-ui-foundation-smoke` スクリプトを追加。

## 3. アーキテクチャ

```
React (TavernSimulator)
  └── GameCanvasHost (lazy)
        └── CanvasGame
              ├── Application (PixiJS v8)
              ├── GameViewport (1600x900 virtual resolution)
              ├── GameSceneManager
              │     ├── BootScene
              │     └── FoundationDemoScene
              ├── OverlayManager
              │     ├── GameTooltip
              │     └── GameModal
              ├── GameAssetManager
              └── GameUiActions (bridge from Canvas to React)
```

- `CanvasGame` は React の外で `Application` ライフサイクルを管理。
- `GameScene` は `mount(context)` / `unmount()` / `update(dt)` / `setCampaign()` / `setUiState()` インターフェースを持つ。
- `FoundationDemoScene` は `gameUiViewModel.ts` から投影された ViewModel を表示する。
- Core 内部構造を直接読み込まず、ViewModel 経由で `dayNumber`, `reputation`, `party name`, `member names`, `status label` などのみ使用。

## 4. 主要コンポーネント

### 4.1 GameViewport

- 固定仮想解像度 1600×900。
- `availableWidth / availableHeight` から `scale = min(...)` を計算。
- `offsetX / offsetY` で pillarbox / letterbox 対応。
- `devicePixelRatio` は `Application` 初期化時に `Math.min(devicePixelRatio, 2)` で cap。
- `toVirtualX/Y`, `toScreenX/Y` でスケール後の座標変換を提供。

### 4.2 CanvasGame

- `Application.init({ resizeTo: host, background, antialias, resolution, autoDensity, preference: ['webgl','webgpu','canvas'] })`
- 7 層の layer container: `background`, `content`, `ui`, `overlay`, `modal`, `transition`, `debug`
- `ResizeObserver` + `renderer.on('resize')` による両方向のリサイズ対応。
- `destroy()` で `ResizeObserver` 切断、`renderer.off('resize')`、`sceneManager.unmountCurrent()`、`app.destroy()` の完全クリーンアップ。
- React StrictMode 対応：host 上の canvas は `app.canvas` を `host.appendChild` せず `resizeTo` 経由で自動配置。Cleanup で重複 canvas は発生しない。

### 4.3 UI primitives

- `GamePanel`: 丸角矩形 + タイトル、テーマ color/border/radius 使用。
- `GameButton`: normal / hover / pressed / disabled / focused の状態遷移。`eventMode='static'`、`hitArea` 設定、`pointerover/out/down/up/tap` 対応。disabled 時はイベント発火なし・visual disabled。double activation guard は `onActivate` コールバックを 1 回のみ呼ぶことで保証。
- `GameLabel`: PixiJS `Text` ラッパー。日本語フォント fallback を theme typography で一元管理。`textWidth`/`textHeight` は jsdom 環境でも fallback 0 を返す。
- `GameScrollView`: コンテンツコンテナ + `Graphics` マスク + `wheel` イベント。overflow 時の clamp 処理。
- `GameTooltip`: 表示位置を virtual 座標で指定、overlay レイヤーで描画。
- `GameModal`: 背景 dim + パネル + タイトル + 本文 + 閉じるボタン。背景はイベントを受け、modal 下の操作をブロック。

### 4.4 Theme

- `gameTheme.ts` に colors / typography / spacing / radius を集約。
- 色のハードコーディングを避け、spacing scale は `4,8,12,16,24,32,48`。
- 日本語フォントは `Noto Sans JP` → `Hiragino Kaku Gothic ProN` → `Meiryo` → `sans-serif` の fallback。

### 4.5 Asset Manager

- `Assets.init` + `Assets.loadBundle` を薄くラップ。
- missing asset fallback として `Texture.WHITE` を返す `getTexture(alias)`。
- Phase 8.0 では実画像読み込みは行わず、placeholder bundle 構成。

### 4.6 ViewModel

- `buildGameUiViewModel(campaign)` → `{ day, reputation, reputationLabel, parties }`
- `buildPartyListItemViewModel(party)` → `{ id, name, memberNames, statusLabel, unreadEventCount }`
- Core の `seed`, `currentDay`, `narrativeCandidates` などの内部構造を Canvas 側に漏らさない。

### 4.7 FoundationDemoScene

- 画面上部：`DAY N` / 酒場評判 / `NEXT DAY` ボタン
- 左パネル：`PARTIES` リスト（スクロール対応基盤）
- メインパネル：`TAVERN` / Phase 8.0 Canvas Foundation 表示
- 下部：Panel / Tooltip / Modal / Scroll / Legacy UI の動作確認ボタン
- `setCampaign(campaign, uiState)` で ViewModel 再構築し、label やボタンを更新。
- `setUiState` で選択パーティの詳細を更新。

## 5. 検証結果

### 5.1 typecheck / lint / test / coverage / build

| 項目                                          | 結果                                                        |
| --------------------------------------------- | ----------------------------------------------------------- |
| `npm run typecheck`                           | PASS                                                        |
| `npm run lint`                                | PASS                                                        |
| `npm run test`                                | 978 tests PASS                                              |
| `npm run test:coverage`                       | PASS (Stmt 89.73%, Branch 81.14%, Funcs 91.7%, Lines 91.4%) |
| `npm run build`                               | PASS                                                        |
| `npm run test:expedition-regression`          | 22/22 PASS                                                  |
| `npm run phase8-0-canvas-ui-foundation-smoke` | 12/12 PASS                                                  |

### 5.2 Phase 8.0 Smoke

```
A: virtual resolution 1600x900 and scale preserves aspect ratio
B: letterbox and pillarbox produce black-bar offsets
C: scene manager transitions from BootScene to FoundationDemoScene
D: FoundationDemoScene mounts and accepts a real campaign
E: disabled GameButton does not activate
F: GameButton action fires exactly once
G: GameScrollView supports content, masking, and viewport resize
H: GameTooltip show/hide
I: GameModal open/close
J: gameUiViewModel projects real campaign without exposing core internals
K: CanvasGame class can be constructed without starting an Application
L: canvas foundation smoke uses zero AI calls
```

すべて PASS。

### 5.3 その他監査・Smoke

| スクリプト                                      | 結果                            |
| ----------------------------------------------- | ------------------------------- |
| `phase7-0-3-compression-audit.ts`               | PASS                            |
| `phase7-1-timeline-audit.ts`                    | Leakage 0 PASS                  |
| `phase7-0-narrative-audit.ts` (30日 zero-call)  | 69 candidates / 0 AI calls PASS |
| `phase7-4-memory-smoke.ts`                      | ALL PASS                        |
| `phase7-5-character-arc-smoke.ts`               | ALL PASS                        |
| `phase7-6-relationship-milestone-smoke.ts`      | ALL PASS                        |
| `phase7-7-downtime-relationship-smoke.ts`       | ALL PASS                        |
| `phase7-7-1-minor-narrative-diversity-smoke.ts` | ALL PASS                        |

## 6. Bundle Size 記録

ビルド結果（vite production build, gzip 済みサイズ抜粋）：

```
dist/assets/index-Da4HtH4R.css                     16.92 kB │ gzip:   3.82 kB
dist/assets/GameCanvasHost-GxWQp5PZ.js             62.13 kB │ gzip:  19.91 kB
dist/assets/index-DStw1-C3.js                     697.97 kB │ gzip: 207.39 kB
```

- `GameCanvasHost` は dynamic import により別 chunk 化。`pixi.js` 関連コードは `GameCanvasHost` chunk に含まれる。
- `index` chunk は既存アプリケーション本体。`GameCanvasHost` を lazy 化したため、legacy UI 初回ロードへの影響は最小限。

## 7. 制約・今後の拡張

- Phase 8.0 では Tavern/Quest/Party/Character/Narrative 各画面は FoundationDemoScene のみ。本格的な画面遷移は後続 Phase で実装。
- WebGL/Canvas レンダリングの実機確認はブラウザ smoke で実施予定。jsdom 環境では `Application.init` を実行せず、`Container`/`Graphics`/`Text` の構築とイベントの単体テストを実施。
- フォントファイルは Phase 8.0 では必須とせず、system font fallback を使用。最終品質は後続で Web Font 導入を検討。
- キーボード・Gamepad 対応は interface のみ準備し、Phase 8.0 では pointer イベント中心。

## 8. 重要な未変更項目

- `NARRATIVE_PROMPT_VERSION`（v11）および `DOWNTIME_PROMPT_VERSION`（v2）は変更していない。
- Core シミュレーション、expedition、narrative、downtime、relationship、memory、arc、milestone、seed determinism、save/load に一切変更なし。
- `package-lock.json` は `pixi.js` 追加に伴う更新のみ。

## 9. Phase 8.0.1 Canvas Runtime 安定化

PR #37 レビューで指摘された Canvas runtime の安定性問題に対し、以下を修正した。

### 9.1 Canvas append / ticker 接続 / ライフサイクル

- `CanvasGame`
  - `app.init()` 完了後に `host.contains(app.canvas)` で重複 append を防止し、なければ `host.appendChild(app.canvas)` で明示的に追加。
  - Pixi `app.ticker.add(this.handleTick)` で `GameSceneManager.update(deltaMS)` を駆動。`destroy()` では `ticker.remove(this.handleTick)` を呼び出し。
  - `this._destroyRequested` フラグを導入。`init()` 中に React unmount 等で `destroy()` が呼ばれた場合、初期化完了後にアプリを破棄し、ホストに canvas を残さない。
  - `this._initializing` フラグを導入し、`init()` の二重呼び出しを防止。
  - `ResizeObserver` / `renderer.on('resize')` / `ticker` / `sceneManager.unmountCurrent()` の cleanup 順序を整理。
- `GameCanvasHost`
  - `mounted` フラグを導入。unmount 後は `setError` および `setCampaign` を呼ばない。

### 9.2 UI プリミティブの初期描画とクリーンアップ

- `GameButton`
  - コンストラクタで `_isEnabled` / `_state` / `cursor` を設定し、`draw()` と `centerLabel()` をイベント登録前に実行。
- `FoundationDemoScene`
  - シーンが `backgroundRoot` / `uiRoot` / `partyListRoot` を所有し、`unmount()` で layer から `removeChild` して `destroy({ children: true })`。
  - グローバル layer コンテナ自体は破棄せず、シーンが作った DisplayObject のみ破棄。
- `destroyChildren(container)` ヘルパーを追加。`removeChildren()` 後に各 child を `destroy({ children: true })`。
- `FoundationDemoScene.rebuildPartyList` で古い party ボタンを `destroyChildren` してから再構築。
- `GameModal`
  - `open()` 時に既存 body content を `destroyChildren` してから新しい content を追加。
- `GameAssetManager`
  - `loadFoundation()` を no-op 化。Phase 8.0.1 では空の `src` manifest および `Assets.loadBundle()` を実行しない。
- `GameScrollView`
  - `viewport.eventMode = 'static'` および `viewport.hitArea = new Rectangle(0, 0, width, height)` を設定。
  - `setViewportSize()` でも `hitArea` を更新。
- `gameUiViewModel`
  - `unreadEventCount` を `narrativeStatus !== 'viewed'` のイベント件数に変更（`unseen` / `generated` 両方を含む）。

### 9.3 追加・更新された単体テスト

- `src/ui/canvas/__tests__/canvasGame.test.ts`（新規）：canvas append、二重 init 防止、`destroy()` クリーンアップ、unmount 中の init キャンセル、`ticker` から `GameSceneManager.update` への接続、`setCampaign` 後の scene 状態反映。
- `src/ui/canvas/__tests__/gameButton.test.ts`：enabled / disabled 初期 visual 状態を追加。
- `src/ui/canvas/__tests__/gameScrollView.test.ts`（新規）：viewport `eventMode` / `hitArea` を検証。
- `src/ui/canvas/__tests__/gameModal.test.ts`（新規）：`open()` 時の body content 破棄と string content 展開を検証。
- `src/ui/canvas/__tests__/gameUiViewModel.test.ts`：`unreadEventCount` 計算を追加。

## 10. ブラウザ E2E 検証結果

`npm run dev` で `http://localhost:5173/` を起動し、Chrome + Playwright で録画付き E2E を実施した。Canvas runtime および UI プリミティブは期待通り動作した。

| シナリオ                                                                                                                                     | 結果     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Legacy DOM UI ロード（console error なし）                                                                                                   | PASS     |
| `Canvas UI` ボタンで Canvas 表示切替。`.game-canvas-host` 内に `<canvas>` が **1 枚**、bounding box サイズ 0 ではない                        | PASS     |
| BootScene の `Loading...` 表示後、約 1.2 s で FoundationDemoScene へ自動遷移                                                                 | PASS     |
| FoundationDemoScene に `DAY 1` / `酒場評判` / `PARTIES` リスト / `TAVERN` / 下部 `Panel` `Tooltip` `Modal` `Scroll` `Legacy UI` ボタンが表示 | PASS     |
| `Panel` クリックで `Panel Test` モーダル、`Modal` クリックで `Modal Test` モーダルが開閉                                                     | PASS     |
| `Tooltip` ホバーで日本語ツールチップ表示                                                                                                     | PASS     |
| `Scroll` クリックで 40 アイテムのスクロールモーダル、ホイールで内容がスクロール                                                              | PASS     |
| ウィンドウリサイズ（1024×600 / 1600×900 / 2560×1080）で 16:9 中央配置が維持され、極端なアスペクト比では黒帯                                  | PASS     |
| `Legacy UI` ボタンで DOM UI に復帶。`<canvas>` は 0 枚                                                                                       | PASS     |
| 再度 `Canvas UI` 切替えでも `<canvas>` は **1 枚**、重複なし                                                                                 | PASS     |
| Legacy UI で Day1 を解決後に Canvas UI へ切り替え、`NEXT DAY` で `DAY 2` に進行。Legacy UI 復帰でも `Day 2` 保持                             | PASS     |
| Provider 未接続・Narrative 未操作で AI 呼び出し 0 件                                                                                         | PASS     |
| `console.error` / `pageerror` / `unhandled rejection`                                                                                        | 検出なし |

### 留意事項

- Chrome / NVIDIA ドライバーから `[.WebGL-...] GL Driver Message ... GPU stall due to ReadPixels` というパフォーマンス警告が Canvas 初期化時に 4 件出力された。これはアプリコードではなく WebGL / ドライバー層のメッセージであり、機能には影響しない。
- jsdom ベースの `npm run test` では `pixi.js` を直接 import するテストで `HTMLCanvasElement.prototype.getContext` 未実装の `Error:` ログが多数出るが、すべて catch されてテストは PASS する。`canvas` npm パッケージ導入または `pixi.js` の完全 mock 化で消すことができる。

## 11. 既知の制約

- **Accessibility foundation は Phase 8.0.1 では未実装**。Canvas 内のボタン・スクロール・モーダルは Pixi DisplayObject イベントで駆動され、ARIA 属性 / キーボードフォーカス / スクリーンリーダー対応は今後の Phase で構築する。本 Phase では pointer イベント中心の動作確認に留まっている。
