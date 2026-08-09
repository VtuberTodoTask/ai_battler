# Phase 6.5 Report — Party Affinity / Financial Pressure / Dynamic Acceptance / Stay Extension

## 1. Goal

酒場主人・依頼・Party が循環する次の輪を実装する。

> 酒場主人が良い仕事を紹介する → Party が成功する → Party が成長する →
> 酒場への信頼が高まる → 長く滞在する → 多少難しい仕事でも主人を信頼して受ける。

この Phase では Prediction、Expedition Balance、Request Generation、Party Rank Up には手を入れず、
**Relationship（Affinity / Financial Pressure / Risk Tolerance）**、
**Stay Extension**、**Dynamic Acceptance** の3概念を接続する。

## 2. Design

### 2.1 新しいデータモデル

- `CampaignParty` に `relationship` を追加した。
  - `affinity: number` — 酒場／主人への信頼（0–100、初期10）
  - `financialPressure: number` — 懐事情（0–100、専用seedで20–60）
  - `riskTolerance: 'cautious' | 'balanced' | 'bold'` — リーダー人格から決定
  - `stayExtensionDaysUsed: number` — 累積滞在延長日数
- `TavernParty` に `relationship` / `stats` snapshot を追加し、UIはsnapshotを参照する。
- `TavernDayRecord` に `relationshipEvents` を追加した。
- `AcceptanceContext` / 拡張 `OfferEvaluation` を追加し、`acceptanceScore`、`acceptanceThreshold`、`modifiers` を UI に露出する。

### 2.2 関係性の更新ルール

| トリガー          | affinity | financialPressure | 備考                   |
| ----------------- | -------- | ----------------- | ---------------------- |
| `completeSuccess` | +12      | -25               | 依頼成功で信頼↑・懐窘↓ |
| `success`         | +8       | -20               |                        |
| `partialSuccess`  | +3       | -8                |                        |
| `failedObjective` | -5       | +5                |                        |
| `forcedRetreat`   | -8       | +10               |                        |
| `lostExpedition`  | -12      | +15               |                        |
| 非派遣 / 待機     | —        | +8                | idle                   |
| 療養中            | —        | +4                | recovery               |
| 依頼辞退 / 鍛錬   | 変更なし | 変更なし          |                        |

`financialPressure` は 0–100 に clamp する。

### 2.3 Risk Tolerance

`riskTolerance = bravery - caution + round(greed / 2)` で算出し、信号値 ≤-2 で `cautious`、≥2 で `bold`、それ以外で `balanced` とした。

### 2.4 Stay Extension

`plannedDepartureDay` が到来した時点で、
`getMaxStayExtensionDays(affinity)`（0/2/4/6/8）から `stayExtensionDaysUsed` を引いた残り日数だけ延長する。

- casualty パーティは延長不可
- 延長上限は8日
- 延長できなかったパーティは通常通り離脱

### 2.5 Dynamic Acceptance Score

`evaluateOffer(request, party, context?)` は従来の「rank gap + role fit + leader judgment」に加えて、
context から以下の modifier を加味する。

| modifier             | 計算例                                                       |
| -------------------- | ------------------------------------------------------------ |
| `base`               | same-rank +60、+1 +30、上位（≤-1）は即 accept                |
| `roleFit`            | 関連role 0 -25 / 1 -10 / 2 0 / 3 +10 / 4 +15                 |
| `leaderJudgment`     | `clamp(round((judgment - 50) / 5), -10, +10)`                |
| `relevantCapability` | 関連roleのexpertSkill平均：≥80 +8 / ≥70 +5 / ≥60 +2 / <45 -5 |
| `growth`             | `min(milestones * 3, 12)`                                    |
| `affinity`           | <20 -5 / 20-39 0 / 40-59 +6 / 60-79 +12 / 80-100 +18         |
| `financialPressure`  | <20 -5 / 20-39 0 / 40-59 +5 / 60-79 +10 / 80-100 +15         |
| `risk`               | `cautious -10` / `balanced 0` / `bold +10`                   |
| `hpReadiness`        | average HP% <50 -15 / <75 -5 / それ以外 0                    |
| `moraleReadiness`    | average morale <40 -10 / <60 -5 / ≥80 +3 / それ以外 0        |

Threshold は通常50、**+1 かつ relevantRoleCount === 0** だけ 65 にする。
`rankGap >= 2` は `tooDangerous` で hard decline。

受諾理由は最大 positive modifier から決定する：`trustedBroker`（affinity 主導）、`needsIncome`（financial pressure 主導）、`boldChallenge`（risk 主導）、`challengingButSuitable`（それ以外）。
辞退理由には `cautious`、`notReady`、`poorFit`、`tooDangerous` を追加した。

## 3. Verification

### 3.1 静的検証

```bash
npm run typecheck  # PASS
npm run lint       # PASS
npm test           # PASS (729 tests)
npm run build      # PASS
npm run test:expedition-regression  # PASS (22/22)
```

### 3.2 Unit / Integration Tests

- `src/core/tavern/campaign/relationship.test.ts`（20 tests）
  - 初期化・seed 独立・risk tolerance 導出
  - affinity / financial pressure の outcome / idle / recovery 更新
  - clamp と double update 防止
  - stay extension budget / accumulation / cap / casualty priority
- `src/core/tavern/acceptance.test.ts` 拡張
  - rank gap >=2 hard gate
  - same-rank 受諾
  - +1 poor-fit + affinity/risk での受諾
  - `trustedBroker` / `needsIncome` / `boldChallenge` / `cautious` / `notReady`
  - HP / morale / growth 影響
  - score / threshold / modifier breakdown 露出
- `src/core/tavern/campaign/campaign.test.ts` 拡張
  - resolve 後の affinity / pressure イベント
  - 非派遣 party の idle pressure / 派遣 party の除外
  - recovery pressure
  - stay extension 履歴反映
  - relationship snapshot sync
- `src/core/tavern/prediction/predictionCacheKey.test.ts` 拡張
  - relationship / progression / stats snapshot が prediction cache key に影響しないことを確認

### 3.3 Acceptance Audit

`scripts/phase6-5-acceptance-audit.ts` を実行し `reports/phase6_5_acceptance_audit.json` を生成した。

```text
records: 216 (3 seeds × 3 requests × 4 parties × 6 contexts)
deterministic: true
```

| rankGap | total | accepted |
| ------- | ----- | -------- |
| 0       | 60    | 58       |
| 1       | 24    | 18       |
| -1      | 66    | 66       |
| -2      | 48    | 48       |
| -3      | 18    | 18       |

| context       | total | accepted |
| ------------- | ----- | -------- |
| neutral       | 36    | 31       |
| high-affinity | 36    | 36       |
| needs-income  | 36    | 36       |
| bold          | 36    | 36       |
| cautious      | 36    | 33       |
| grown         | 36    | 36       |

### 3.4 30-Day Campaign Audit

`scripts/phase6-5-campaign-audit.ts`（30日 × 3 seeds）を実行し `reports/phase6_5_campaign_audit.json` を生成した。

```text
accepted offers: 90
declined offers: 0
affinity changes: 90
financial pressure changes: 360
stay extensions: 0
final affinity average: ~41
final pressure average: ~62
outcome counts:
  completeSuccess: 43
  success: 21
  partialSuccess: 2
  failedObjective: 12
  forcedRetreat: 12
  lostExpedition: 0
```

30日シミュレーションでは affinity が早期に上がりきらないため stay extension は自然発生しなかったが、
`CampaignHistory` レンダリングと `tryExtendStay` 単体テストで延長ロジックは検証済み。

### 3.5 Recorded Browser E2E

`tavern-campaign-001` seed で `http://localhost:5173` を 14 日進行させる録画付きブラウザ E2E を実施した。
詳細は `test-report-phase6-5.md` および録画 `/home/ubuntu/screencasts/phase6-5-clean/phase6-5-clean-edited.mp4` を参照。

確認した主な動作：

- **Prediction パネル**: 同一依頼で E→E（65%）から D→E（94%）へ切り替えが即座に更新され、元の party に戻すと同じ値がキャッシュ再利用された。
- **Dynamic Acceptance**: 予測32%の依頼でも `appropriate (72/50)` で受諾。`BrokeragePanel` の `判定詳細` に `お気に入り`、`懐事情`、`危険志向`、`Score breakdown` が表示された。
- **実遠征結果の分離**: `本日の仲介を確定` 後、予測は非表示になり `TavernResultDetail` に `completeSuccess`、最終 HP/MP/Morale、評判 `10 → 13 (+3)` が別途表示された。
- **14日間の更新**: `PartyCard` の `お気に入り` / `懐事情` / 成長情報、`療養中` 表示からの HP/MP 全快・Morale 上昇を確認。
- **CampaignHistory Relationship イベント**: `affinityChanged`、`financialPressureChanged`（遠征結果 / 仕事なし / 療養）、`stayExtended`（`滞在延長 Day 4 → 6 (+2日)` 等）を確認。
- **自然な Elimination**: Day 5 `洞窟の魔物討伐` で `forcedRetreat`。`対象数 4 / 撃破 0 / 逃走 0 / 生存 0 / Progress 0% / Completed いいえ` で `依頼結果: 撤退` と整合。
- **Console**: エラー / unhandled rejection なし。

## 4. Files Added / Changed

- `src/core/tavern/campaign/relationship.ts` — 定数と relationship 更新ヘルパー
- `src/core/tavern/campaign/relationship.test.ts` — 20 tests
- `src/core/tavern/acceptance.ts` — score-based 受諾判定
- `src/core/tavern/acceptance.test.ts` — dynamic modifier tests
- `src/core/tavern/campaign/campaign.ts` — resolve/advance に relationship 更新・滞在延長を組み込み
- `src/core/tavern/campaign/campaign.test.ts` — relationship integration tests
- `src/core/tavern/campaign/generators.ts` — relationship 初期化と tavern snapshot マッピング
- `src/core/tavern/campaign/types.ts` / `src/core/tavern/types.ts` — 型追加
- `src/core/tavern/brokerage.ts` — relationship context を `evaluateOffer` へ渡す
- `src/ui/tavern/PartyCard.tsx` / `BrokeragePanel.tsx` / `CampaignHistory.tsx` — relationship UI
- `src/core/tavern/prediction/predictionCacheKey.test.ts` — relationship cache independence test
- `scripts/phase6-5-acceptance-audit.ts` / `reports/phase6_5_acceptance_audit.json`
- `scripts/phase6-5-campaign-audit.ts` / `reports/phase6_5_campaign_audit.json`
- `test-report-phase6-5.md` / `test-plan-phase6-5.md` / `.agents/skills/ai-battler/SKILL.md`

## 5. Stopping Condition

Phase 6.5 のみを実装した。以下は**未実装**であり、この PR では触れていない。

- Returning Party / Full Economy / Request Rewards / Player Spending / Tavern Facilities
- Phase 6.6 以降

## 6. Conclusion

`relationship` によって Party の受諾動機が定量的に表現され、
`stayExtension` によって信頼が滞在期間に反映され、
`CampaignHistory` ではその変化がイベントとして見えるようになった。
動的スコア判定は既存の `rankGap` hard gate を維持しつつ、
affinity・financial pressure・risk tolerance・成長・HP/morale を受諾判断に組み込み、
酒場主人と Party の循環を実装した。
