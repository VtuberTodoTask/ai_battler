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

| 項目                                 | 結果                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| `npm run typecheck`                  | PASS                                                        |
| `npm run lint`                       | PASS                                                        |
| `npm run test`                       | 964 tests PASS                                              |
| `npm run test:coverage`              | PASS (Stmt 89.73%, Branch 81.14%, Funcs 91.7%, Lines 91.4%) |
| `npm run build`                      | PASS                                                        |
| `npm run test:expedition-regression` | 22/22 PASS                                                  |

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
dist/assets/GameCanvasHost-FSWSRaks.js            231.91 kB │ gzip:  67.06 kB
dist/assets/index-CcgdoVQs.js                     698.11 kB │ gzip: 207.47 kB
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
