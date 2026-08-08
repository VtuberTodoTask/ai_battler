# Phase 5 Report: 酒場仲介ボード MVP

## Goal

`VtuberTodoTask/ai_battler` に、日次の「酒場仲介ボード」垂直スライスを追加する。

- 1 日に 3 件の依頼と 8 人の冒険者が出現
- プレイヤーは 0 または 4 人のパーティを最大 2 派遣まで編成
- 同じ冒険者を複数の依頼に派遣できない
- 派遣結果を閲覧できる
- 戦闘・遠征コア、既存 baseline、バランス定数は一切変更しない

## Tavern architecture

新しい層は以下の 2 つのみで構成する。

- `src/core/tavern/` — 酒場ドメイン（型、生成、派遣、レポート）
- `src/ui/tavern/` — 酒場 UI（`TavernSimulator` および各種カード/パネル）

`src/core/expedition/`, `src/core/battle/`, `src/core/generators/` は変更していない。
`src/App.tsx` には既存 2 タブに加えて `酒場MVP` タブを追加している。

## TavernDay

`TavernDayState` は以下を保持する。

| フィールド    | 内容                         |
| ------------- | ---------------------------- |
| `id`          | 日 ID（`tavern-day-<seed>`） |
| `seed`        | 日シード                     |
| `requests`    | 3 件の依頼オファー           |
| `adventurers` | 8 人の冒険者                 |
| `assignments` | 派遣編成                     |
| `status`      | `planning` / `resolved`      |
| `results`     | 解決済み派遣結果             |

すべての RNG は日シードから導出される。

- 依頼の目的タイプ選択: `<seed>:objectives`
- 各依頼のテンプレート/ランク/戦闘有無: `<seed>:request:<i>:selection`
- 各依頼の遠征 RNG: `<seed>:request:<i>:expedition`
- 冒険者ロール配分: `<seed>:adventurer-roles`
- 冒険者ランク: `<seed>:adventurer-ranks`
- 個別冒険者: `<seed>:adventurer:<slot>`

## Request generation

`src/core/tavern/requestTemplates.ts` に 12 件の `TavernRequestTemplate` を定義し、
目的タイプあたり 2 件ずつカバーしている。

| 目的            | テンプレート例                               |
| --------------- | -------------------------------------------- |
| `investigation` | 魔物出没原因の調査、遺跡内の不気味な痕跡     |
| `elimination`   | 洞窟の魔物排除、街道周辺の魔物排除           |
| `rescue`        | 負傷した冒険者の救出、行方不明の研究者の救出 |
| `escort`        | 学者の護衛、商人の護衛                       |
| `retrieval`     | 古代コアの回収、遺失装備の回収               |
| `survey`        | 旧坑道東部の測量、未踏洞窟の測量             |

生成時にランクは `E 20% / D 35% / C 35% / B 10%` の重みで `SeededRng.weightedPick` により選ばれる。
戦闘発生はテンプレートの `battleChance` に基づく。

## Adventurer pool

`generateTavernDay` は 8 人の冒険者を生成する。

- 7 ロール（`vanguard / ranger / mage / healer / support / scout / guardian`）を必ず 1 人ずつ含む
- 残り 1 枠はロールをシャッフルして重複許可で追加
- 各冒険者のランクは `E/D/C/B` 重みで選ばれる
- ID とパラメータは日シードから再現される

## Dispatch assignment

`src/core/tavern/dispatch.ts` の `validateAssignments` で以下を検証する。

- 依頼 ID と冒険者 ID が存在すること
- 各編成が 0 人または 4 人であること
- 同じ冒険者が複数の依頼に含まれていないこと
- 割り当て総数が 8 人を超えていないこと（最大 2 派遣）

UI では `TavernSimulator` が編成状態を保持し、
選択中の依頼に対して冒険者カードをクリックして追加/解除する。
選択済み依頼ではない冒険者や既に 4 人に達している依頼への追加は無視される。

## Validation

テスト `dispatch.test.ts` で以下をカバーしている。

- 重複した冒険者の割り当てはエラー
- 1/2/3 人の編成は無効
- 4 人編成は有効
- 0 人編成は `notDispatched`
- 3 件とも 4 人（計 12 人）の割り当ては 8 人超過でエラー
- 依頼 0 の編成を変更しても依頼 1/2 の生成オブジェクトに影響しない
- 解決順序 `0→1` と `1→0` で結果が同じ

## Expedition resolution

`resolveTavernDay` は検証後、各依頼について以下を行う。

- 編成が 0 人の場合 `notDispatched` とする
- 4 人編成の場合、冒険者を `deepClone` して `runExpedition` を呼ぶ
- `buildDispatchReport` により `DispatchReport` を生成

`runExpedition` は読み取り専用ではないため、
`deepClone` により元の酒場冒険者プールが変化しないようにしている。

## DispatchReport

`src/core/tavern/report.ts` の `buildDispatchReport` は、
`ExpeditionResult.state.objectiveState` の型に対して網羅的な `switch` を行い、
6 目的それぞれのサマリーを構築する。

- `investigation` → 発見情報数、完全情報達成数、戦闘情報数、進行率
- `elimination` → 討伐対象名、目標標討伐数、討伐数、全滅フラグ
- `rescue` → 救出対象名、発見/治療/搬出/帰還フラグ、最終 HP
- `escort` → 護衛対象名、ルート進行、目的地到達、手渡し状態、配達/帰還フラグ
- `retrieval` → 回収対象名、発見/確保/搬出/帰還、各種ダメージ、破棄/紛失
- `survey` → セクター進行、品質、カバレッジ、報告書作成/搬出

`keyFacts` は `outcome`, `battleOutcome`, `objectiveProgress`, 目的固有フィールドから構築し、
fact 文字列の正規表現解析は行わない。

## Six objective summaries

`report.test.ts` にて、すべての目的タイプで `buildDispatchReport` が
`DispatchReport`（`type` 判別可能な `objective` ユニオン）を返し、
`ExpeditionResult` を変更しないことを検証している。

## UI

新規コンポーネントを `src/ui/tavern/` に配置した。

- `TavernSimulator.tsx` — 状態管理、日生成、編成、派遣実行
- `TavernControls.tsx` — シード入力、「このSeedで生成」「新しい日」ボタン
- `RequestBoard.tsx` / `RequestCard.tsx` — 3 件の依頼カード
- `AdventurerBoard.tsx` / `AdventurerCard.tsx` — 8 人の冒険者カード
- `DispatchPanel.tsx` — 選択中の依頼と編成中パーティ表示
- `DispatchResults.tsx` — 派遣結果一覧
- `TavernResultDetail.tsx` — 結果の詳細（`ExpeditionResultSummary`, `ExpeditionBattlePanel`, `ExpeditionObjectivePanel` を再利用）
- `tavern.css` — 2 カラム + 下部パネルのレイアウト

`App.tsx` には `mode` 状態を `battle | expedition | tavern` に拡張し、
`酒場MVP` タブを追加した。既存タブは維持している。

## Determinism

`dayGenerator.test.ts` で以下を確認している。

- `generateTavernDay(seed)` を 2 回呼んでも deep equal
- 1000 シードで常に 3 件の依頼、目的重複なし、有効なランク、ユニーク ID
- 1000 シードで常に 8 人の冒険者、ユニーク ID、7 ロール揃い、8 人目も有効

## Real day sample

### Seed `tavern-001`（生成直後）

依頼一覧:

| #   | タイトル             | 目的          | ランク | 環境   |
| --- | -------------------- | ------------- | ------ | ------ |
| 0   | 魔物出没原因の調査   | investigation | D      | forest |
| 1   | 学者の護衛           | escort        | D      | plains |
| 2   | 負傷した冒険者の救出 | rescue        | E      | forest |

冒険者一覧（8 人）:

| 名前                | ロール   | ランク |
| ------------------- | -------- | ------ |
| レオ アイヴィー     | ranger   | C      |
| シエラ アッシュ     | vanguard | D      |
| ヴァン ドラグナー   | mage     | D      |
| レオ リーフ         | guardian | C      |
| アリス ドラグナー   | support  | E      |
| リナ サンド         | scout    | C      |
| ハロルド アイヴィー | healer   | B      |
| ゴウ グレイ         | support  | C      |

### 派遣例（依頼 0 に 0-3 番目、依頼 1 に 4-7 番目、依頼 2 は未派遣）

```json
[
  {
    "requestId": "tavern-request-0-tavern-001",
    "status": "resolved",
    "outcome": "forcedRetreat",
    "objective": {
      "type": "investigation",
      "progress": 10,
      "completed": false,
      "discoveredInformationCount": 2,
      "completeInformationCount": 0,
      "battleIntelCount": 0
    }
  },
  {
    "requestId": "tavern-request-1-tavern-001",
    "status": "resolved",
    "outcome": "failedObjective",
    "objective": {
      "type": "escort",
      "targetName": "護衛対象",
      "finalHp": 36,
      "maxHp": 40,
      "stress": 40,
      "routeProgress": 50,
      "destinationReached": false,
      "handoffStatus": "notStarted",
      "delivered": false,
      "returnedToOrigin": true,
      "stranded": false,
      "completed": false
    }
  },
  {
    "requestId": "tavern-request-2-tavern-001",
    "status": "notDispatched"
  }
]
```

## E2E

ブラウザ上で `酒場MVP` タブを開き、以下を確認した。

- `tavern-001` で 3 件の依頼と 8 人の冒険者が表示される
- 依頼 0 を選択し冒険者 4 人を編成 → `編成: 4 / 4` になる
- 依頼 1 を選択し残り 4 人を編成 → `編成: 4 / 4` になる
- 依頼 2 を選択して既存冒険者をクリックしても編成に追加されない（8 人全員が他に割り当て済み）
- 「本日の派遣を実行」をクリックして結果画面に遷移
- 依頼 0/1 は結果を持ち、依頼 2 は `未派遣`
- 結果カードをクリックすると `派遣メンバー` / `重要facts` / `遠征 outcome` / `戦闘 outcome` / `Objective summary` が表示される
- 「新しい日」をクリックすると新しいシード (`ngv3q4x9`) と新しい依頼・冒険者セットが表示される

実行中のブラウザコンソールにエラーは出ていない。

## Existing regression

`npm run update:expedition-regression` を実行した結果、
`regression-snapshots/baseline` の既存 22 件すべてで diff は発生しなかった。

## Tests

追加したテストファイル:

- `src/core/tavern/dayGenerator.test.ts`
- `src/core/tavern/dispatch.test.ts`
- `src/core/tavern/report.test.ts`
- `src/ui/tavern/TavernSimulator.test.tsx`

検証結果:

| コマンド                               | 結果                 |
| -------------------------------------- | -------------------- |
| `npm run typecheck`                    | 成功                 |
| `npm test`                             | 588 tests passed     |
| `npm run lint`                         | 成功                 |
| `npm run build`                        | 成功                 |
| `npm run update:expedition-regression` | 既存 baseline diff 0 |

## Known limitations

- 酒場 UI は MVP 版であり、立ち絵やアートはない
- 派遣パーティサイズは固定 4 人、最大 2 派遣まで
- 報酬、評判、金、永続的な冒険者プール、傷の持ち越し、日進行キャンペーンは未実装
- AI 文章生成、自動おすすめ編成、成功率表示は未実装
- 依頼個別の編集 UI はない
- 保存/読み込みは未実装
