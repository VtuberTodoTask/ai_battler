# Phase 7.2.1 Narrative UI Flow E2E テスト計画

## 目的

`devin/phase7-2-1-narrative-quality`（PR #29）で追加された `NarrativeFocus` / `NarrativeDirection` / `NarrativeInteractionHint` が UI から Fake Provider 生成・表示される一連の流れを end-to-end で検証する。特に以下を確認する。

1. 遠征が酒場 UI から通常通り実行できる。
2. 遠征結果から Narrative Candidate が生成される。
3. Fake Provider で物語生成が成功する。
4. 生成結果（テキスト / prompt v6 / Raw Context）が UI に表示される。
5. 新しい `NarrativeDirection`（Focus / Main Scenes / Secondary Scenes / Montage / Interaction Hints）でレンダリングが壊れない。
6. 物語未生成 / 生成失敗時の既存フォールバック UI が動作する。
7. Provider 未選択時のゼロコール経路が動作する。
8. ブラウザ console にエラー / unhandled rejection がない。

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase7-2-1-narrative-quality`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome（Playwright ヘッドフル）
- Campaign seed: `tavern-005`

## 前提 / 準備

1. `npm install` を実行済み。
2. `npm run dev` をバックグラウンドで起動済み。
3. 録画は E2E 開始直前に開始する。

## シナリオ

### 1. Zero-call / Empty Queue（Provider 未接続）

**手順**:

1. `http://localhost:5173/` を開く。
2. `酒場キャンペーン` タブをクリック。
3. Campaign Seed 入力欄を `tavern-005` に変更し、`新しいキャンペーン` をクリック。
4. `NarrativeQueue` セクションを確認（スクロール）。

**Pass 基準**:

- `AI文章候補はありません。` と表示される。
- `AI呼び出し: 0回` と `状態: AI未接続` と表示される。

### 2. 遠征実行と Candidate 生成

**手順**:

1. 最上位の依頼カードをクリック。
2. 受諾可能な最初のパーティカードをクリック。
3. `この依頼を紹介する` ボタンをクリック。
4. `本日の仲介を確定` ボタンをクリック。
5. `NarrativeQueue` をスクロールして確認。

**Pass 基準**:

- `遠征レポート：...` 候補が `未生成` 状態で追加される。
- `AI呼び出し: 0回` のまま（Provider 未接続なので自動生成しない）。
- Console エラーがない。

### 3. Fake Provider での遠征物語生成

**手順**:

1. `NarrativeSettings` で `開発用 Fake Provider を使う` をクリック。
2. `遠征レポート：...` 候補の `遠征物語を生成` ボタンをクリック。
3. 生成完了を待つ。
4. 生成結果セクションをスクロールして確認。

**Pass 基準**:

- 候補の状態が `生成済み` に変わる。
- 生成テキストが `【Fake生成 #1】` で始まる。
- `model: fake-model | provider: fake | tokens: ...` が表示される。
- `AI呼び出し: 1回` に更新される。
- Console エラーがない。

### 4. Prompt v6 / NarrativeDirection 表示確認

**手順**:

1. 生成済み候補の `AIへ送る内容（compressed v4 prompt）を見る` 詳細をクリックして展開。
2. `Raw Narrative Contextを見る` 詳細をクリックして展開。

**Pass 基準**:

- Prompt 内に以下のセクションが含まれる:
  - `=== NARRATIVE DIRECTION ===`
  - `Focus:`
  - `Main Scenes:`
  - `Secondary Scenes:`
  - `Montage Beat IDs:`
  - `Narrative Interaction Hints:`
- Raw JSON 内に `"direction"` オブジェクトがあり、`mainScenes`、`secondaryScenes`、`montageBeatIds`、`focus`、`interactionHints` を含む。
- Console エラーがない。

### 5. Provider エラー / フォールバック

**手順**:

1. `NarrativeSettings` の `エンドポイント` に `http://localhost:5173/invalid`、`モデル` に `none` を入力。
2. `HTTP Provider で接続` をクリック。
3. 未生成の `weakObjectiveSuccess` または別の候補の `生成` ボタンをクリック。

**Pass 基準**:

- `AI文章の生成に失敗しました。HTTP 404:` と赤文字でエラーが表示される。
- `AI呼び出し` カウントが増えない。
- `NarrativeSettings` を `開発用 Fake Provider を使う` に切り替え、`翌日へ` をクリックして次の日に進行できる。
- Console エラー（React 例外 / unhandled rejection）がない。

## 操作方法（フォールバック）

テストハーネス上でネイティブクリックが反応しない場合、ブラウザコンソールから以下を実行してもよい。

```js
// タブ切り替え
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('酒場キャンペーン'))
  ?.click()

// 依頼 / パーティ選択（0起点）
document.querySelectorAll('.request-card')[0].click()
document.querySelectorAll('.party-card:not(.disabled)')[0].click()

// 紹介 / 確定 / 翌日へ
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('紹介する'))
  ?.click()
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('確定'))
  ?.click()
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('翌日へ'))
  ?.click()
```

## Pass / Fail 基準

- 上記 5 項目すべてが期待値を満たし、console に `error` / `unhandled rejection` が 1 件もない: PASS
- いずれかの表示・カウント・エラー条件が満たせない、または console エラーが発生する: FAIL
