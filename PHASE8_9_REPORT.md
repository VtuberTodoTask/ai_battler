# Phase 8.9 レポート：世界資料室 / World Encyclopedia

## 目的

Canvas/PixiJS 版の酒場 UI に、いつでも閲覧できる世界資料室（資料室）を追加する。
`TavernScene` から独立した `WorldEncyclopediaScene` として実装し、世界・国家・種族に関する
既知の設定を AI 呼び出しなしで参照できるようにする。

## 主な変更

### 1. 資料データ層

- `src/world/lore/worldLoreTypes.ts`
  - `WorldEncyclopediaCategory`, `WorldLoreSection`, `WorldLoreEntry`,
    `CountryLoreEntry`, `SpeciesLoreEntry` を定義
- `src/world/lore/worldLore.ts`
  - 12 件の世界エントリ（七国世界・冒険者・冒険者の酒場・ダンジョン・マナ・
    内燃と昇華・技術と生活・交通と物流・宗教とマナ観・魔族・七国の共通社会・
    暦・時間・距離感）
- `src/world/lore/countryLore.ts`
  - 7 件の国家エントリ（アルデン王国・ヴェルガ自治連邦・カレド山岳国・
    セレスタ交易共和国・エルディア森林領邦・ラグナ辺境侯国・ハルマ草原諸国）
- `src/world/lore/speciesLore.ts`
  - 9 件の種族エントリ（人族・長耳族・山人族・小人族・牙人族・小鬼族・
    鱗人族・羽人族・鰭人族）
  - 各種族末尾に「身体的・歴史的背景であり、個人の性格・価値観・職業を
    決定するものではない」注記を含む `COMMON_NOTE`
- `src/world/lore/worldLoreIndex.ts`
  - 全データの一元的な export、整合性検証ヘルパー、カテゴリ/ID 検索関数を提供

### 2. `WorldEncyclopediaScene`

- `src/ui/canvas/scenes/worldEncyclopedia/WorldEncyclopediaScene.ts`
- `GameScene` として実装（独立 Scene、非モーダル）
- 背景は既存 `public/party-detail-bg.jpg` を再利用
- 上部ヘッダーに「資料室」タイトルと「酒場へ戻る」`GameButton`
- カテゴリタブ：`世界について` / `国家` / `種族`
- 左カラム：エントリ一覧（`TavernListRow` プール）
- 右カラム：記事ビューアー（タイトル・短説明・セクション見出しと本文）
- 右カラムは `GameScrollView` でスクロール可能
- カテゴリ切り替えで一覧先頭を自動選択・記事スクロールを先頭に戻す
- 冒頭カテゴリは `world`、初期エントリは `七国世界`
- `WorldEncyclopediaReturnTarget` で `selectedPartyId` / `selectedQuestId` を
  `TavernScene` に返す

### 3. ナビゲーション統合

- `src/ui/canvas/scenes/tavern/TavernHeader.ts`
  - 右上ボタン群に `資料室` ボタンを追加（`セーブ` と `翌日へ` の間）
- `src/ui/canvas/scenes/tavern/TavernScene.ts`
  - `openWorldEncyclopedia()` を追加し、現在の `selectedPartyId` / `selectedQuestId` を
    `WorldEncyclopediaSceneInput.returnTarget` に含めて `push`
- `src/ui/canvas/CanvasGame.ts`
  - `WorldEncyclopediaScene` をシーンマネージャに登録

### 4. UI コンポーネント補強

- `src/ui/canvas/components/GameScrollView.ts`
  - `scrollToTop()` を追加
  - `_contentY === 0` のとき `-0` にならないよう `this._content.y` を調整
- `src/ui/canvas/viewModel/worldEncyclopediaViewModel.ts`
  - `WorldEncyclopediaSceneInput`, `WorldEncyclopediaReturnTarget`,
    `buildWorldEncyclopediaViewModel`, `resolveInitialEntry` を提供

### 5. 制約遵守

- AI は一切呼び出さない（資料の閲覧・切り替え・スクロール・復帰時も 0 コール）
- キャンペーン/RNG/キャラクター/パーティ/依頼/関係/世界状態を変更しない
- 選択中の記事・カテゴリ・スクロール位置をセーブデータに保存しない
- ナラティブプロンプトに資料全文を注入しない（`NARRATIVE_PROMPT_VERSION` 等は未変更）

## 検証結果

### 静的検証

- `npx tsc --noEmit` 0 エラー
- `npm run lint` PASS（eslint + prettier）
- `npm run build` PASS（Vite production build 成功）

### ユニットテスト

- `npx vitest run src/world/lore/__tests__` ... PASS
- `npx vitest run src/ui/canvas/viewModel/__tests__/worldEncyclopediaViewModel.test.ts` ... PASS
- `npx vitest run src/ui/canvas/scenes/worldEncyclopedia/__tests__` ... PASS
- `npx vitest run src/ui/canvas/__tests__/phase8-9-world-encyclopedia-smoke.test.ts` ... PASS
- `npm run test` 全体 ... 1251 / 1251 PASS
- `npm run test:coverage` ... 89.51% statements / 81.11% branches / 90.67% functions
- `npm run test:expedition-regression` ... 22 / 22 PASS

### ブラウザ E2E（A–Q チェック）

- タイトル → ニューゲーム → `TavernScene`
- `資料室` ボタン → `WorldEncyclopediaScene`（独立 Scene、非モーダル）
- 初期表示：世界について / 七国世界
- カテゴリ切り替え：世界 → 国家 → 種族（自動で先頭エントリ選択）
- 国家一覧 7 件・種族一覧 9 件を確認
- エントリ切り替え：種族 → 鱗人族（右記事更新、スクロール先頭リセット）
- 長文記事を `wheel` でスクロール可能
- `酒場へ戻る` → `TavernScene` へ復帰、翌日へ進行しないことを確認
- エラー/未処理 Promise/AI コールはすべて 0

| チェック | 結果 |
|---|---|
| タイトル → 酒場 → 資料室遷移 | PASS |
| 資料室がモーダルでない | PASS |
| 初期カテゴリ「世界について」 | PASS |
| 初期エントリ「七国世界」 | PASS |
| カテゴリ切り替え | PASS |
| 国家 7 件 | PASS |
| 種族 9 件 | PASS |
| エントリ切り替え | PASS |
| 長文スクロール | PASS |
| 酒場へ戻る | PASS |
| BGM 変化（partyDetail ↔ tavern） | PASS（コード上） |
| console.error | 0 |
| pageerror | 0 |
| unhandled rejection | 0 |
| AI コール | 0 |

### スクリーンショット

| 画面 | ファイル |
|---|---|
| 世界について / 七国世界 | `.github/screenshots/encyclopedia_world_seven_kingdoms.png` |
| 国家 / アルデン王国 | `.github/screenshots/encyclopedia_country_alden.png` |
| 種族 / 鱗人族 | `.github/screenshots/encyclopedia_species_scalefolk.png` |
| 酒場へ戻る後の TavernScene | `.github/screenshots/encyclopedia_return_to_tavern.png` |

## 注意点

- ブラウザ E2E は Canvas 座標変換後の `PointerEvent` を `canvas` 要素に dispatch して実施。
- `GameButton` は `pointerdown`/`pointerup` を受けて `pointertap` を発行するため、
  入力イベントは `clientX`/`clientY` を正確に計算したうえで `pointerType='mouse'`、`pointerId` 固定で
  発行している。
