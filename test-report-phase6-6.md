# Phase 6.6 専門分野（missionSpecialization）E2E テストレポート

## 概要

`devin/phase6-6-mission-specialization` ブランチで、パーティの `missionSpecialization`（得意/苦手の目的Type）が `酒場キャンペーン` UI と遠征結果に正しく反映されることを end-to-end に検証しました。

- すべての `PartyCard` に `得意：… / 苦手：…` が表示されることを確認
- 依頼Type に対する得意/苦手パーティで `BrokeragePanel` の `依頼適性` と `Score breakdown` の `専門分野` が `+8 / -8` になることを確認
- 得意パーティで `specialtyMatch` 受諾、苦手パーティで `tooDangerous` 辞退（`専門分野：-8` が含まれる）ことを確認
- パーティ切り替えで予測が更新され、元に戻すとキャッシュ値が再表示されることを確認
- 予測パネルと実遠征結果が分離して表示されることを確認
- HP/MP/Morale、評判、回復、CampaignHistory（Relationship / 成長 / 鍛錬 / 療養）の更新を確認
- ブラウザ console エラーなしを確認

## 環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase6-6-mission-specialization`
- サーバー: `npm run build && npx vite preview` → `http://localhost:4173/`
- ブラウザ: Chrome
- Campaign seed: `tavern-campaign-324`
- 録画: `/home/ubuntu/screencasts/phase6-6-tavern-clean/phase6-6-tavern-clean-edited.mp4`

## 静的検証

| コマンド            | 結果                                       |
| ------------------- | ------------------------------------------ |
| `npm run typecheck` | PASS                                       |
| `npm run lint`      | PASS                                       |
| `npm run test`      | 742 tests passed                           |
| `npm run build`     | PASS（Node.js 20.18.1 バージョン警告のみ） |

## E2E 検証結果

### 1. PartyCard の専門分野ラベル

- 全滞在パーティに `得意：… · 苦手：…` が表示された
- `[D] 黒曜の斧` は `得意：調査 · 苦手：回収`
- `[E] 炎獅子団` は `得意：護衛 · 苦手：調査`
- **結果: PASS**

![Day3 party cards with specialization labels](https://app.devin.ai/attachments/153566c3-5528-41a7-be05-7e44bbe20ce8/ss_fd33d5cd.png)

### 2. BrokeragePanel の `依頼適性` と `専門分野`

#### 得意パーティ

- 依頼 `遺跡の異変調査 [C] 調査` + `[D] 黒曜の斧` を選択
- `BrokeragePanel` に `依頼適性：得意（調査）` と表示
- `判定詳細` の `Score breakdown` に `専門分野: 8` が含まれた
- **結果: PASS**

![specialtyMatch strong fit with 専門分野: 8](https://app.devin.ai/attachments/52b6d160-fdec-49e2-9468-2661df6bcf8c/ss_8d2ca993.png)

#### 苦手パーティ

- 同じ依頼 `[C] 調査` + `[E] 炎獅子団` を選択
- `BrokeragePanel` に `依頼適性：苦手（調査）` と表示
- `判定詳細` の `Score breakdown` に `専門分野: -8` が含まれた
- 判断は `辞退（-3 / 50）`、理由は `tooDangerous`
- **結果: PASS**

![weak fit with 専門分野: -8](https://app.devin.ai/attachments/5d67b09f-ec54-4fcc-a9f6-826f5cb3b229/ss_c72f01ef.png)

### 3. パーティ切り替えとキャッシュ再利用

- `遺跡の異変調査 [C] 調査` を選択
- `黒曜の斧` → `90% 非常に有望`
- `炎獅子団` → `100% 非常に有望` に更新、古い `90%` が残らなかった
- 再び `黒曜の斧` に戻すと同じ `90%` が即座に再表示（キャッシュ再利用）
- **結果: PASS**

![prediction cache reuse 90%](https://app.devin.ai/attachments/3fde82b1-a626-428a-84c7-7c85c12e0c84/ss_55471b76.png)

### 4. `specialtyMatch` 受諾

- `黒曜の斧` + `遺跡の異変調査 [C] 調査` で `この依頼を紹介する` を実行
- リーダー台詞：`「格上ではあるが、この手の仕事は俺たちの得意分野だ。引き受けよう」`
- 判断：`受諾（54 / 50）`
- 理由：`specialtyMatch`
- `Score breakdown`：`専門分野: 8`
- **結果: PASS**

### 5. 本日の仲介を確定 → 実遠征結果の分離

- `本日の仲介を確定` 後、遠征予測パネルが非表示になった
- `本日の結果` に `遺跡の異変調査: 完全成功 (completeSuccess) +3 — 《黒曜の斧》`
- 評判が `10 → 13 (+3)` に更新
- `TavernResultDetail` に実遠征結果が表示
  - 依頼タイプ: `investigation`
  - 依頼結果: `完全成功 (completeSuccess)`
  - Objective completed: `はい`
  - Objective progress: `100%`
  - 生存者数: `4` / 戦闘不能: `0` / 死亡: `0`
- **結果: PASS**

![actual expedition result completeSuccess](https://app.devin.ai/attachments/b8dff3a1-920a-419c-af95-29effff0f35a/ss_c3e3a1ca.png)

### 6. HP/MP/Morale / 評判 / 回復 / 履歴の更新

- 遠征後 `《黒曜の斧》` の Morale が上昇（ガルド 33→48、トール 47→62、ティア サンド 48→63、ティア エルウィン 54→69）
- Day 2 で `《黒曜の斧》` が `療養中（あと1日）` に
- Day 3 で `《黒曜の斧》` が `受諾可能` に戻り、HP/MP 全快、Morale 70/82/83/89
- `CampaignHistory` Day 1 を展開すると以下が表示された
  - Relationship: `《黒曜の斧》 お気に入り 10 → 22 (完全成功)`、`《黒曜の斧》 懐事情 36 → 11 (遠征結果)`、`... 仕事なし` 等
  - 成長 / 鍛錬: `《黒曜の斧》 完全成功 +4 XP`、各メンバーのスキル `+2`、他パーティ `自主鍛錬 +1 XP`
  - Party events: `療養開始: 《黒曜の斧》`
- **結果: PASS**

![campaign history relationship growth recovery](https://app.devin.ai/attachments/24aa3927-920a-406d-9e96-9855da61dd82/ss_e310346d.png)

![Day2 recovery state](https://app.devin.ai/attachments/d72ecbd9-691d-4bca-babd-47dc181dc469/ss_1473d8b3.png)

### 7. Console エラー確認

- ブラウザ DevTools Console で `error` / `unhandled rejection` は検出されなかった
- **結果: PASS**

## エスカレーション

- なし。
- 録画開始後、タブ切り替えで `TavernSimulator` が再マウントされキャンペーンがリセットされたため、クリーンな録画に取り直しました（`phase6-6-tavern-clean`）。UI ハンドラ自体は正常でした。
- 下部ボタン/カードのネイティブマウスクリックが反応しない場合があり、`document.querySelectorAll(...).click()` でフォールバックしました。

## 結論

Phase 6.6 の `missionSpecialization` 変更は UI と遠征シミュレーションの両方で正しく動作しています。得意/苦手目的の表示、`specialtyMatch` / `専門分野` スコア補正、予測キャッシュ、実遠征結果の分離、回復・履歴更新、console エラーなしを確認しました。

---

## 提案 PR コメント

```markdown
## Phase 6.6 専門分野（missionSpecialization）酒場キャンペーン E2E テスト結果

- `npm run typecheck`、`npm run lint`、`npm run test`（742 tests）、`npm run build` がすべて通過しました。
- `npm run build && npx vite preview` で `http://localhost:4173/` を起動し、`tavern-campaign-324` で `酒場キャンペーン` Day 1-3 を録画付き E2E しました。
- ブラウザ console エラー / unhandled rejection は検出されませんでした。

### 確認できたこと

1. **PartyCard の専門分野ラベル**
   - 全パーティに `得意：… · 苦手：…` が表示された。
   - `黒曜の斧` は `得意：調査 · 苦手：回収`、`炎獅子団` は `得意：護衛 · 苦手：調査`。

2. **BrokeragePanel の `依頼適性` と `専門分野`**
   - `遺跡の異変調査 [C] 調査` + `黒曜の斧` → `依頼適性：得意（調査）`、`専門分野: 8`。
   - 同じ依頼 + `炎獅子団` → `依頼適性：苦手（調査）`、`専門分野: -8`。

3. **`specialtyMatch` 受諾**
   - `黒曜の斧` には `「格上ではあるが、この手の仕事は俺たちの得意分野だ。引き受けよう」` と `specialtyMatch (54/50)` で受諾した。

4. **予測の切り替えとキャッシュ再利用**
   - `黒曜の斧` で `90%`、切り替えて `炎獅子団` で `100%`、再び `黒曜の斧` で同じ `90%` が即座に再表示された。

5. **予測と実遠征結果の分離**
   - `本日の仲介を確定` 後、予測パネルは非表示になり、実結果として `完全成功 (completeSuccess)`、`Objective completed: はい`、`Objective progress: 100%` が別途表示された。

6. **HP/MP/Morale / 評判 / 回復 / 履歴**
   - 遠征後 `黒曜の斧` の Morale が上昇し、Day 2 は `療養中`、Day 3 は `受諾可能` に戻り HP/MP 全快。
   - `CampaignHistory` に Relationship、成長/鍛錬、`療養開始` イベントが記録された。

### キー証拠

<details open>
<summary>得意パーティの specialtyMatch と 専門分野: 8</summary>

![specialtyMatch](https://app.devin.ai/attachments/52b6d160-fdec-49e2-9468-2661df6bcf8c/ss_8d2ca993.png)

</details>

<details>
<summary>苦手パーティの 専門分野: -8 と tooDangerous 辞退</summary>

![weak fit](https://app.devin.ai/attachments/5d67b09f-ec54-4fcc-a9f6-826f5cb3b229/ss_c72f01ef.png)

</details>

<details>
<summary>実遠征結果（completeSuccess / Objective 100%）</summary>

![result](https://app.devin.ai/attachments/b8dff3a1-920a-419c-af95-29effff0f35a/ss_c3e3a1ca.png)

</details>

<details>
<summary>CampaignHistory の Relationship / 成長 / 療養</summary>

![history](https://app.devin.ai/attachments/24aa3927-920a-406d-9e96-9855da61dd82/ss_e310346d.png)

</details>

- 録画: `/home/ubuntu/screencasts/phase6-6-tavern-clean/phase6-6-tavern-clean-edited.mp4`
- レポート: `/home/ubuntu/repos/ai_battler/test-report-phase6-6.md`
```

## SKILL.md / Blueprint 更新

- SKILL.md: `/home/ubuntu/repos/ai_battler/.agents/skills/ai-battler/SKILL.md` に Phase 6.6 の `missionSpecialization` 確認ポイント（得意/苦手の目的Type、`依頼適性`、`専門分野`、`specialtyMatch`、決定的シード `tavern-campaign-324`）を追加済み。
- Blueprint: 既存 blueprint は `typecheck` / `lint` / `test` / `build` / `dev` を網羅しているが、今回使用した `npm run build && npx vite preview`（ポート 4173）が明示されていない。追加を推奨。

## ユーザー側で必要な対応

- なし。認証情報や追加環境設定は不要でした。
