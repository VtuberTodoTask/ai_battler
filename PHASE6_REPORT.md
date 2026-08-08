# Phase 6 レポート: 継続キャンペーン・酒場評判・パーティ永続化

## 概要

Phase 6 では、1日単位の酒場仲介 MVP を「今日の仲介結果が明日の酒場に影響する継続ゲーム」へ拡張した。

- `TavernCampaignState` による日付進行・パーティ永続化・酒場評判の導入
- `runExpedition()`・遠征エンジン・戦闘エンジンは変更せず、campaign 層でラップ
- `resolveCampaignDay()` / `advanceCampaignDay()` による確定的なキャンペーン周期
- 酒場 UI を `酒場MVP` から `酒場キャンペーン` へ移行

## 主要ドメイン

| ファイル                                  | 役割                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/core/tavern/campaign/types.ts`       | `TavernCampaignState`, `CampaignParty`, `CampaignPartyStats`, `TavernDayRecord`, `ReputationChangeSummary` |
| `src/core/tavern/campaign/reputation.ts`  | `REPUTATION_DELTA`, `getReputationTier`, `computeReputationChange`                                         |
| `src/core/tavern/campaign/rankWeights.ts` | `getPartyRankWeights`, `getRequestRankWeights`                                                             |
| `src/core/tavern/campaign/partyState.ts`  | 遠征後の party 状態更新、回復日数計算、翌日回復・回復完了                                                  |
| `src/core/tavern/campaign/generators.ts`  | 評判依存の party/request 生成、`buildTavernDay`                                                            |
| `src/core/tavern/campaign/campaign.ts`    | `createTavernCampaign`, `resolveCampaignDay`, `advanceCampaignDay`                                         |

## 評判ティア

| 評判   | ティア    | ラベル         | 備考                  |
| ------ | --------- | -------------- | --------------------- |
| 0–19   | unknown   | 駆け出し       | 開始時の初期値 10     |
| 20–39  | local     | 地元で知られる | E/D/C/B まで          |
| 40–59  | trusted   | 信頼される     | A パーティ/依頼が出現 |
| 60–79  | renowned  | 名高い         | S パーティ/依頼が出現 |
| 80–100 | legendary | 伝説級         | 高ランク重視          |

`getReputationTier` は純粋関数であり、`REPUTATION_DELTA` は `0` 起点ではなく `0–100` をそのままティア判定に使用する。

## 遠征結果による評判変化

```ts
REPUTATION_DELTA = {
  completeSuccess: 3,
  success: 2,
  partialSuccess: 0,
  failedObjective: -2,
  forcedRetreat: -1,
  lostExpedition: -5,
}
```

- `notBrokered` および辞退された offer は ±0
- 戦闘勝敗・受諾/辞退自体は評判に影響しない
- 評判は `clamp(..., 0, 100)` で制限される

## パーティ状態と回復

### CampaignParty

```ts
interface CampaignParty {
  id: string
  party: AdventurerParty
  arrivalSerial: number
  arrivalDay: number
  plannedDepartureDay: number
  recoveringThroughDay?: number
  condition: CampaignPartyCondition
  stats: CampaignPartyStats
}
```

### 回復ルール

- 2 日: 気絶、未解決の重傷、または HP 比率 ≤ 25%
- 1 日: 負傷あり、または HP 比率 < 70%（2 日条件でない場合）
- 0 日: 負傷なし・気絶なし・全員 HP ≥ 70%

回復中のパーティは `getOfferErrors` で「このパーティは療養中です」と拒否される。

### 回復完了

- HP/MP 全回復
- morale: `max(current + 20, 70)`、上限 100
- 状態異常・負傷・気絶をクリア

### 翌日回復

- HP: `current + maxHp * 0.2`（切り上げ、上限 maxHp）
- MP: 全回復
- morale: `+10`（上限 100）

## パーティ滞在

- 滞在日数: 3–6 日、seed `<campaignSeed>:arrival:<serial>:stay`
- `plannedDepartureDay` 到着日を超えた日、または死亡者が発生した日に離脱
- 4 パーティを維持。離脱後は新規パーティが補充される

## ランク分布（評判依存）

### Party rank weights

| 評判ティア | E   | D   | C   | B   | A   | S   |
| ---------- | --- | --- | --- | --- | --- | --- |
| unknown    | 45  | 40  | 15  | 0   | 0   | 0   |
| local      | 20  | 40  | 30  | 10  | 0   | 0   |
| trusted    | 5   | 20  | 40  | 25  | 10  | 0   |
| renowned   | 0   | 5   | 20  | 40  | 25  | 10  |
| legendary  | 0   | 0   | 5   | 20  | 40  | 35  |

### Request rank weights

| 評判ティア | E   | D   | C   | B   | A   | S   |
| ---------- | --- | --- | --- | --- | --- | --- |
| unknown    | 35  | 45  | 20  | 0   | 0   | 0   |
| local      | 15  | 40  | 35  | 10  | 0   | 0   |
| trusted    | 0   | 15  | 40  | 30  | 15  | 0   |
| renowned   | 0   | 0   | 15  | 40  | 30  | 15  |
| legendary  | 0   | 0   | 0   | 15  | 45  | 40  |

## 7日間サンプルキャンペーン

Seed: `campaign-report-sample`

### Day 1

- 評判: 10 → 10（駆け出し）
- 街道周辺の魔物排除: partialSuccess — 雷鳴の足跡
- 行方不明調査員の救出: notBrokered
- 冒険者装備の回収: notBrokered
- イベント: 4 パーティ到着、雷鳴の足跡が回復開始

### Day 2

- 評判: 10 → 10（駆け出し）
- 洞窟の魔物討伐: partialSuccess — 白銀の盾
- 遺跡の異変調査: notBrokered
- 未踏洞窟の経路測量: notBrokered

### Day 3

- 評判: 10 → 10（駆け出し）
- 未踏洞窟の経路測量: partialSuccess — 雷鳴の足跡
- 行方不明調査員の救出: notBrokered
- 商人の護衛: notBrokered
- イベント: 雷鳴の足跡の回復完了、同日に再び回復開始

### Day 4

- 評判: 10 → 13（駆け出し）
- 負傷した冒険者の救出: completeSuccess — 白銀の盾
- 旧坑道東部の測量: notBrokered
- 魔物出没原因の調査: notBrokered

### Day 5

- 評判: 13 → 11（駆け出し）
- 冒険者装備の回収: failedObjective — 玻璃の鏡
- 未踏洞窟の経路測量: notBrokered
- 行方不明調査員の救出: notBrokered
- イベント: 2 パーティ到着、雷鳴の足跡 / 星読みが滞在満了で離脱、玻璃の鏡が回復開始

### Day 6

- 評判: 11 → 11（駆け出し）
- 街道周辺の魔物排除: partialSuccess — 鋼の絆
- 古代魔導核の回収: notBrokered
- 商人の護衛: notBrokered
- イベント: 鋼の絆 / 鉄梟が到着、玻璃の鏡 / 白銀の盾が滞在満了で離脱、鋼の絆が回復開始

### Day 7

- 評判: 11 → 9（駆け出し）
- 商人の護衛: failedObjective — 夜明の鈴
- 負傷した冒険者の救出: notBrokered
- 未踏洞窟の経路測量: notBrokered
- イベント: 夜明の鈴が回復開始

## 30 日間スモークテスト

`src/core/tavern/campaign/campaign-smoke.test.ts` にて 5 つの異なる seed で各 30 日間をシミュレート。

確認した不変条件:

- 毎日 `parties.length === 4`
- 毎日 `requests.length === 3`
- `currentDay.status` は resolve 前 `planning`、resolve 後 `resolved`
- `reputation` は常に `0 <= reputation <= 100`
- 各日のメンバー ID は 16 名で重複なし
- `history.length === 30` で最終日が 30 日目
- 各 `CampaignParty.stats` で排他的アウトカムカテゴリの合計が `totalExpeditions` と一致
- active roster に scheduled departure 済みパーティが残留しない

## 20×20 観察

`scripts/campaign-simulation.ts` にて 20 キャンペーン × 20 日を観察。

- 平均最終評判変化: -5.30
- 平均受諾遠征数: 19.40
- 平均回復開始回数: 14.80
- 平均死亡離脱数: 0.85

（初期評判 10、未知の依頼に対してパーティが負傷しやすいため、序盤はやや評判が低下する傾向がある。）

## 検証コマンド

```text
npm run typecheck
npm run test
npm run lint
npm run build
npm run update:expedition-regression
```

結果:

- `typecheck`: 成功
- `test`: 全 624 テスト passed
- `lint`: 成功
- `build`: 成功
- `update:expedition-regression`: 既存 22 スナップショット diff 0

## 停止条件との対応

Phase 6 の停止条件として以下は未実装 / 本 PR では対象外:

- セーブなし（ページリロードでリセット、意図的）
- 報酬 / 所持金なし
- 報酬による Acceptance なし
- 酒場経営費なし
- Party Rank 成長なし
- Member 加入/脱退なし
- 死亡者補充なし
- Party 性格なし
- Party reputation なし
- AI 日報 / AI 会話なし
- ゲームクリア / Game Over なし
- 日付上限なし
- 仲介不成立への評判 penalty なし
- 待つだけで party/request を更新できない（日付を進める必要がある）

## 変更対象外

- `src/core/expedition/` および `src/core/battle/` は変更していない
- `runExpedition()` は変更していない
- Phase 5.5 Acceptance Engine は維持
- 既存 22 expedition regression baseline は diff 0
