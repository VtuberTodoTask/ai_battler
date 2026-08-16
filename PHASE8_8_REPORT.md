# Phase 8.8 レポート：PartyDetailScene & BGM

## 目的

Canvas/PixiJS 版の酒場 UI に、パーティ詳細画面（`PartyDetailScene`）を追加する。
`TavernScene` からパーティを選択して詳細を開き、メンバー一覧・プロフィール・関係・履歴の閲覧、
そして元の酒場画面への復帰を行えるようにする。

## 主な変更

### 1. 新規 `PartyDetailScene`

- `src/ui/canvas/scenes/partyDetail/PartyDetailScene.ts` を追加
- 左側にパーティヘッダー＋メンバー一覧、右側にキャラクター詳細を2ペイン表示
- プロフィール / 関係 / 履歴 の3タブ
- `酒場へ戻る` ボタンで `TavernScene` に復帰
- 無効なパーティ/キャラのフォールバック処理

### 2. プロフィールタブに種族別立ち絵

- `public/characters/*.png`（9種族）を追加
- `GameAssetManager.loadCharacterSilhouettes()` でプリロード
- `CharacterDetailViewModel.speciesId` に応じて `Sprite` として表示
- 9種族マッピングは `speciesLabel` と同じ ID 体系を利用

### 3. `PartyDetailScene` 専用 BGM

- 添付の `party_detail.mp3` を `public/bgm/party_detail.mp3` に配置
- `AudioController` の BGM トラックに `partyDetail` を追加
- `PartyDetailScene` の `mount` で `AudioController.playBgm('partyDetail', { loop: true })` を再生

### 4. `TavernScene` からの遷移

- `DecisionPanel` に `パーティ詳細` ボタンを追加
- パーティが選択されている場合のみ有効化
- ボタン押下で `sceneManager.push('partyDetail', input)` して `PartyDetailScene` を開く
- 復帰時に `selectedPartyId` / `selectedQuestId` を保持

### 5. 依存ビューモデル

- `partyDetailViewModel.ts`：キャンペーン＋partyId＋characterId から読み取り専用 VM を構築
- 種族ラベル・出身国ラベル・性別ラベル・役割ラベルなど既存ヘルパーを再利用
- 遠征履歴には `buildExpeditionReportViewModels` を利用

### 6. その他の修正

- `DecisionPanel.draw` をリファクタリングし、依頼未選択でもパーティが選択されていれば
  `パーティ詳細` ボタンとパーティ要約が表示されるようにした
- `PartyDetailScene` / `SaveLoadScene` で非推奨の `Container.name` / `getChildByName` を
  `label` / `getChildByLabel` に置き換え
- `PartyDetailScene` の `酒場へ戻る` ボタンをフッター中央に配置

## 検証

- `npm run typecheck`：OK
- `npm run lint`：OK
- `npm run build`：OK
- `npx vitest run src/ui/canvas/scenes/partyDetail/__tests__/partyDetailSceneLifecycle.test.ts src/ui/canvas/viewModel/__tests__/partyDetailViewModel.test.ts src/ui/canvas/__tests__/phase8-8-party-character-detail-smoke.test.ts --testTimeout 15000`：27/27 合格
- `npm run test:expedition-regression`：22/22 合格

## 未対応・制約

- ブラウザ E2E（`phase8-8-party-character-detail`）は未実行（ユーザ承認待ち）
- 全テストスイートで `src/core/tavern/campaign/campaign-smoke.test.ts` の30日 smoke が
  環境によるタイムアウト（60s）で失敗することがある。UI 変更とは無関係なコア側の重いテストであり、
  今回の修正範囲外とする。
- `jsdom` 環境で `pixi.js` が `HTMLCanvasElement.prototype.getContext` を要求する警告が出るが、
  テスト結果には影響しない。

## マージ先

`main` ブランチへ PR を作成する。
