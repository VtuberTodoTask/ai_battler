# Phase 8.8 / 8.8.1 レポート：PartyDetailScene ビジュアル統合

## 目的

Canvas/PixiJS 版の酒場 UI に、パーティ詳細画面（`PartyDetailScene`）を追加し、
`Phase 8.8.1` のビジュアル・レイアウト統合を完了する。
`TavernScene` からパーティを選択して詳細を開き、メンバー一覧・プロフィール・関係・履歴の閲覧、
元の酒場画面への復帰を行えるようにする。

## 主な変更

### 1. `PartyDetailScene` レイアウト統合

- `src/ui/canvas/scenes/partyDetail/PartyDetailScene.ts` を全面改修
- 画面上部にヘッダーパネル、右端に `酒場へ戻る` ボタンを配置
- 大きなフッター／`height: 10000` の背景グラフィックを削除
- 背景は `public/party-detail-bg.jpg`（本とメガネ）のまま
- キャラクター詳細エリアは単一の半透明 `GamePanel(alpha 0.82)`
- タブ上配置、テキストエリアは左 68%、立ち絵エリアは右 32% の固定配置

### 2. プロフィール / 関係 / 履歴 タブ

- 3 タブを実装
- 全タブで立ち絵が右側に表示される（`alpha 1`、下端中央基準）
- プロフィールタブ：名前、種族/国/性別/役割、国文化、能力値（STR–SOC）、状態（HP/MP/士気）、負傷、回復日、人物傾向
- 関係タブ：パーティ内他メンバーとの関係をスクロール表示
- 履歴タブ：最近の出来事・遠征履歴をスクロール表示

### 3. 種族別全身シルエット

- `public/characters/*.png`（9種族）を並列プリロード
- `GameAssetManager.ensureCharacterSilhouettes()` は `Promise.allSettled` で非ブロック読み込み
- `getCharacterVisual(speciesId?)` は `ready` / `loading` / `missing` を返す
- 読み込み失敗は dev コンソールに warn、欠損時は `立ち絵なし` プレースホルダ
- `Texture.WHITE` や `human` フォールバックは使用しない

### 4. `partyDetailViewModel.ts` 整備

- `CharacterCountryViewModel { name, culture }` を追加
- `CharacterDetailViewModel.speciesId?: SpeciesId` を追加
- 能力値は `STAT_ORDER` / `STAT_LABELS`（STR–SOC）のみ
- HP/MP/士気は `condition` セクションに分離
- 状態効果・スキル上昇・負傷タイプ・国 ID・関係ラベルを `characterLabels.ts` 経由で日本語化
- `characterLabels.ts` は `roleLabel` / `injuryTypeLabel` / `statusEffectLabel` / `skillLabel` / `relationshipPresentationLabel` を提供

### 5. テスト整備

- `characterSilhouetteAssets.test.ts`：9種族マッピング、並列読み込み、失敗処理、欠損種族、複数回呼び出し
- `characterPortraitLayout.test.ts`：下端中央基準、 contain スケーリング、明示的マスク、キャラ切替スケール安定、欠損プレースホルダ
- `partyDetailScrollBounds.test.ts`：スクロール高さ < 10000、巨大矩形なし
- `phase8-8-party-character-detail-smoke.test.ts`：P–U ケースで種族テクスチャ解決・全タブ表示・切替スケール安定・巨大背景なしを検証
- `partyDetailViewModel.test.ts`：スキル名 `scouting` → `偵察`、能力値/状態分離、種族 ID・国身份処理、ローカライズ状態効果を追加

### 6. BGM / SE

- `PartyDetailScene` マウント時に `party_detail.mp3` を再生
- シーン遷移トランジション＋BGM フェードは引き続き有効

### 7. その他

- `CanvasGame.ts` のシルエットプリロードを非ブロック化
- `src/test/canvasSetup.ts` を追加し、`vitest` の `setupFiles` で `HTMLCanvasElement.prototype.getContext('2d')` をモック、jsdom/Pixi 警告を抑制
- コア側の重いテスト（`battle.test.ts`, `narrative.test.ts`, `campaign-smoke.test.ts`, `enemyGenerator.test.ts`）に対して CI タイムアウトを防ぐため個別の `timeout` 引数を追加

## 検証

- `npm run typecheck`：OK
- `npm run lint`：OK
- `npm run build`：OK
- `npm run test`：112 ファイル / 1187 テスト PASS
- `npm run test:expedition-regression`：22/22 PASS
- `npx vitest run src/ui/canvas/viewModel/__tests__/partyDetailViewModel.test.ts src/ui/canvas/__tests__/phase8-8-party-character-detail-smoke.test.ts src/ui/canvas/__tests__/characterPortraitLayout.test.ts src/ui/canvas/__tests__/partyDetailScrollBounds.test.ts src/ui/canvas/assets/__tests__/characterSilhouetteAssets.test.ts --testTimeout 15000`：PASS
- ブラウザ E2E：
  - タイトル → ニューゲーム → 酒場 → パーティ詳細
  - プロフィール / 関係 / 履歴 の各タブ切替
  - 複数種族のキャラクター切替
  - `console.error = 0`、`pageerror = 0`、`unhandled rejection = 0`
  - スクリーンショット証拠を取得

## 制約

- 本フェーズでは AI 生成ポートレートは追加しない。汎用シルエットを使用。
- 装備・関係操作・成長操作は含まない。

## マージ先

`main` ブランチへ PR #46 を作成し、Phase 8.8.1 完了までマージしない。
