# Phase 7.0 AI 物語生成 UI E2E テスト計画

## 目的

`devin/phase7-0-ai-narrative-mvp` ブランチで、酒場キャンペーン画面に追加された AI 物語生成 UI（NarrativeSettings / NarrativeQueue / NarrativeCandidateCard）の動作を end-to-end 検証する。

## ブランチ・環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase7-0-ai-narrative-mvp`
- サーバー: `npm run dev` → `http://localhost:5173/`
- ブラウザ: Chrome
- Campaign seed: `phase7-search-155`（14 日までの日程で `becameRegular`/`becameFavorite`/`weakObjectiveSuccess`/`farewell`/`partyArrival`/`recoveryFinished`/`stayExtended` が自然に発生するシード）

## 静的検証（実行前 green）

| コマンド            | 結果 |
| ------------------- | ---- |
| `npm run typecheck` | PASS |
| `npm run lint`      | PASS |
| `npm run test`      | PASS |
| `npm run build`     | PASS |

## 前提 / 準備

1. `npm run dev` で Vite サーバーを起動し `http://localhost:5173/` を開く。
2. `酒場キャンペーン` タブを選択する。
3. `Campaign Seed` 入力欄を `phase7-search-155` に変更し、`新しいキャンペーン` をクリックする。
4. ページを `phase7-search-155` の Day 1 にする。

## シナリオ

### 1. Cost Control — プロバイダ未接続で AI 呼び出しが発生しない

**目的**: プレイヤーが生成操作をしない限り、勝手に AI API が呼ばれないことを確認する。

**手順**:

1. Day 1 開始直後、NarrativeSettings を確認。
2. `状態: AI未接続` が表示されていることを確認。
3. NarrativeQueue を確認。`候補: 0件`、`AI呼び出し: 0回`。
4. 依頼 `洞窟の魔物討伐 [E]`、パーティ `灰狼の牙` を選択し `この依頼を紹介する` → 受諾。
5. `本日の仲介を確定` をクリック。
6. `翌日へ` をクリック。

**Pass 基準**:

- 確定後も `AI呼び出し: 0回` のまま。
- `状態: AI未接続` のまま。
- 候補は増えるが、生成済みになっていない（全て `未生成`）。

### 2. Expedition 生成 — Fake Provider 接続と初回生成

**目的**: 遠征レポート候補を Fake Provider で生成し、生成テキストとカウントが更新されることを確認する。

**手順**:

1. NarrativeSettings で `開発用 Fake Provider を使う` をクリック。
2. `状態` が `fake` に変わることを確認。
3. NarrativeQueue で Day 1 の候補 `遠征レポート：洞窟の魔物討伐`（または `苦手分野の成功：灰狼の牙`）のチェックボックスをオン。
4. `生成` ボタンをクリック。

**Pass 基準**:

- 候補の `未生成` が `生成済み` に変わる。
- 生成テキストが表示され、`【Fake生成 #1】` で始まる。
- `model: fake-model` / `provider: fake` / `tokens` が表示される。
- `AI呼び出し: 1回` に変わる。

### 3. Character Event 生成 — partyArrival / becameRegular 等

**目的**: キャラクターイベント候補も生成できることを確認する。

**手順**:

1. Day 2 〜 Day 5 を進める（毎日最も上の依頼を `灰狼の牙` に紹介し受諾させ、`本日の仲介を確定` → `翌日へ`）。
2. Day 2 advance 後、`新しい顔：...` 候補が増えることを確認。
3. そのうち `新しい顔：砂塵の露` など `partyArrival` 候補を選択し `生成`。
4. Day 5 resolve 後、`常連になった：灰狼の牙`（`becameRegular`）候補が出現することを確認し、`生成`。

**Pass 基準**:

- `partyArrival` 候補生成後、`AI呼び出し` が 1 増える。
- `becameRegular` 候補生成後、`AI呼び出し` がさらに 1 増える。
- 生成テキストに `【Fake生成 #N】` と `Event Type: partyArrival` / `becameRegular` が含まれる。

### 4. Bulk 生成

**目的**: 複数候補を一括生成すると指定件数だけ AI 呼び出しカウントが増えることを確認する。

**手順**:

1. Day 5 進行後、NarrativeQueue に複数の未生成候補（`partyArrival` 2 件 + `遠征レポート` + `becameRegular` など）がある状態にする。
2. 2 つの未生成候補にチェックを入れる。
3. `選択中2件を生成（AIを2回呼び出し）` ボタンをクリック。

**Pass 基準**:

- 2 つの候補が `生成済み` になる。
- `AI呼び出し` がクリック前から `+2` される。
- 残りの未選択候補は `未生成` のまま。

### 5. Dismiss / Restore

**目的**: 非表示にしても AI 呼び出しが発生せず、復元できることを確認する。

**手順**:

1. 未生成の `partyArrival` 候補（例: `新しい顔：炎獅子団`）の `非表示` ボタンをクリック。
2. `AI呼び出し` カウントが変わらないことを確認。
3. 候補が `非表示` 状態になることを確認。
4. `復元` ボタンをクリック。

**Pass 基準**:

- `AI呼び出し` は増えない。
- 候補が `非表示` → `未生成` に戻る。

### 6. Provider エラー — 無効な HTTP エンドポイント

**目的**: AI 生成失敗後もキャンペーンを翌日に進められることを確認する。

**手順**:

1. NarrativeSettings で `エンドポイント` に `http://localhost:5173/invalid`、`モデル` に `none` を入力。
2. `HTTP Provider で接続` をクリック。
3. 未生成の候補を選択し `生成`。
4. 赤いエラーメッセージ `AI文章の生成に失敗しました。` が表示されることを確認。
5. `AI呼び出し` カウントが増えていないことを確認。
6. `開発用 Fake Provider を使う` に切り替える。
7. `翌日へ` をクリックして次の日に進む。

**Pass 基準**:

- エラーメッセージが表示される。
- `AI呼び出し` は変わらない。
- `翌日へ` で Day N+1 に進行し、新しい依頼/パーティ/候補が表示される。

### 7. Farewell 生成 — 好感度 60 以上でパーティ離脱

**目的**: `affinity >= 60` のパーティが滞在期間満了で離脱すると `farewell` 候補が生成されることを確認する。

**手順**:

1. Day 6 〜 Day 13 を進める（毎日最も上の依頼を受諾可能なパーティに紹介し、`本日の仲介を確定` → `翌日へ`）。
2. Day 13 の `本日の仲介を確定` → `翌日へ` で Day 14 に進む。
3. Day 14 の候補に `別れの挨拶：灰狼の牙`（`eventType: farewell`）が出現することを確認。
4. `灰狼の牙` が滞在パーティからいなくなっていることを確認。
5. `別れの挨拶：灰狼の牙` を選択し `生成`。

**Pass 基準**:

- `farewell` 候補が表示され、生成後 `生成済み` になる。
- 生成テキストに `Event Type: farewell` と `Party: 灰狼の牙` が含まれる。
- `AI呼び出し` が 1 増える。

### 8. Console エラー確認

**手順**:

- DevTools Console を開いたまま全シナリオを実行する。

**Pass 基準**:

- `error` / `unhandled rejection` が 1 件もない。
- Vite HMR 再接続ログ、React DevTools info は許容。

## 操作方法（フォールバック）

テストハーネス上で下部ボタン/カードのクリックが反応しない場合はブラウザコンソールから以下を実行してもよい。

```js
// 依頼選択（0起点）
document.querySelectorAll('.request-card')[0].click()
// パーティ選択（0起点）
document.querySelectorAll('.party-card')[0].click()
// 紹介
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('紹介する'))
  ?.click()
// 確定 / 翌日へ
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('確定'))
  ?.click()
Array.from(document.querySelectorAll('button'))
  .find((b) => b.textContent.includes('翌日へ'))
  ?.click()
```

## Pass/Fail 基準

- 上記 8 項目すべてが期待値を満たす: PASS
- いずれかのカウント・表示・エラー条件が満たせない: FAIL
