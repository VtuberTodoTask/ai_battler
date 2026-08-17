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
- 左テキストエリアに暗い背景を追加し可読性を確保

### 2. プロフィール / 関係 / 履歴 タブ

- 3 タブを実装
- 全タブで立ち絵が右側に表示される（`alpha 1`、下端中央基準）
- プロフィールタブ：名前、種族/国/性別/役割、国文化、能力値、状態、負傷、回復日、人物傾向
- 能力値は `CharacterAbilityRadar` で 7 軸（STR / CON / DEX / INT / PER / WIL / SOC）のレーダーチャートとして表示。固定スケール 0–100、数値ラベル付き
- 状態は HP / MP / 士気を `StatusGauge` 横棒ゲージで表示。`MORALE_MAX = 100` を `core/balance/constants.ts` に集約
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
- HP/MP/士気は `condition` セクションに分離し、ゲージ用数値 `hpValue` / `mpValue` / `moraleValue { current, max }` を追加
- 状態効果・スキル上昇・負傷タイプ・国 ID・関係ラベルを `characterLabels.ts` 経由で日本語化
- `characterLabels.ts` は `roleLabel` / `injuryTypeLabel` / `statusEffectLabel` / `skillLabel` / `relationshipPresentationLabel` を提供

### 5. テスト整備

- `characterSilhouetteAssets.test.ts`：9種族マッピング、並列読み込み、失敗処理、欠損種族、複数回呼び出し
- `characterPortraitLayout.test.ts`：下端中央基準、 contain スケーリング、明示的マスク、キャラ切替スケール安定、欠損プレースホルダ
- `partyDetailScrollBounds.test.ts`：スクロール高さ < 10000、巨大矩形なし
- `phase8-8-party-character-detail-smoke.test.ts`：P–Z ケースでプロフィールタブのレーダー・ゲージ表示、キャラ切替によるレーダー形状変化、全タブ表示、切替スケール安定、巨大背景なしを検証
- `characterAbilityRadarProjection.test.ts`：`projectAbilityToRadarRatio` の min/mid/max、クランプ、無効入力を検証
- `characterAbilityRadarGeometry.test.ts`：`CharacterAbilityRadar` の 7 軸・7 多角形頂点・同一入力同一形状・無効値安全を検証
- `statusGaugeProjection.test.ts`：`projectStatusGauge` の 0/50/100% クランプ、NaN、max=0 を検証
- `partyDetailViewModel.test.ts`：スキル名 `scouting` → `偵察`、能力値/状態分離、数値 HP/MP/Morale、種族 ID・国身份処理、ローカライズ状態効果を追加

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
- `npm run test`：115 ファイル / 1210 テスト PASS
- `npm run test:coverage`：OK（Statements 89.51 / Branches 81.11 / Functions 90.67 / Lines 91.21）
- `npm run test:expedition-regression`：22/22 PASS
- Phase 8.0–8.8 Canvas smokes：PASS
- ブラウザ E2E：
  - タイトル → ニューゲーム → 酒場 → パーティ詳細
  - プロフィール（レーダー＋HP/MP/士気ゲージ＋全身シルエット）
  - 関係 / 履歴（ポートレート残存、レーダー・ゲージ非表示）
  - キャラクター A ↔ B ↔ A 切替（種族シルエット変化、同一キャラ再選択でレイアウトずれなし）
  - `console.error = 0`、`pageerror = 0`、`unhandled rejection = 0`
  - スクリーンショット証拠を取得

## 制約

- 本フェーズでは AI 生成ポートレートは追加しない。汎用シルエットを使用。
- 装備・関係操作・成長操作は含まない。

## マージ先

`main` ブランチへ PR #46 を作成し、Phase 8.8.1 完了までマージしない。
