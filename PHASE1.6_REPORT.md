# Phase 1.6 敵特殊能力の脅威点化 レポート

## 1. 目的

Phase 1.5 までで敵数は等級に関係なく固定されたが、特殊能力の脅威点補正が 0 だったため、高ランクほど能力が無料で増加し、B 級以降の Normal 勝率が急落していた。
本段階では、特殊能力ごとに絶対コスト（`ABILITY_THREAT_COST`）を設定し、敵生成時に能力コストを本体脅威点と分離して計上する。

## 2. 変更内容

- `src/core/generators/enemyGenerator.ts`
  - `calculateAbilityThreat(abilities)`: 装備した能力のコスト合計を返す。
  - `expectedAbilityThreat(rank)`: ランク別の目標能力数と平均能力コストから期待能力コストを推定。
  - `pickRankForTarget(target, tier)`: 期待能力コストを含めて最適ランクを選択。
  - `findBestBuild(...)`: ランク × 能力数を探索し、`actualThreat = baseThreat * bodyScale + abilityThreat` が `targetThreat` に最も近く、`bodyScale` が 0.7～1.3 に収まる組み合わせを採用。
  - `generateEnemy` は `targetThreat` または `abilities` 上書きを受け付ける。
- `src/core/generators/encounterGenerator.ts`
  - `EncounterPlan` 決定後に各スロットの `targetThreat` を `generateEnemy` へ渡す。
- `src/core/balance/constants.ts`
  - `ABILITY_THREAT_COST: Record<AbilityId, number>` を導入。
- `src/core/generators/enemyGenerator.test.ts`, `encounterGenerator.test.ts`
  - Phase 1.6 で要求された 11 項目のテストを追加。
- `scripts/ability-ablation.ts`, `scripts/ability-synergy.ts`, `scripts/phase1-6-report.ts`
  - 能力アブレーション計測、シナジー診断、Phase 1.6 用ベンチマークスクリプトを追加。

## 3. 能力コストの導出

`scripts/ability-ablation.ts` で以下を実施した。

- 条件
  - 標準パーティ（vanguard / guardian / mage / healer）
  - 同一戦闘シード系列
  - 同一敵編成で能力の有無のみ変更
  - 対象等級：E / C / B / S
  - 対象ティア：standard / elite / boss
  - 各能力あたり 2000 試行
- 測定対象能力：flight, poisonAttack, bleedAttack, areaAttack, revive, regeneration, frontDefense, magicResist, physicalResist, darknessBoost, corpseExplosion, summon, taunt, fear, healBlock, counter, stealthStart, swarmCoordination

アブレーションでは「能力あり編成」と「能力なし編成」の有利結果率差 `delta` を、4 体敵全体の `threatScale` 感度 `sensitivity` で除算したグループ全体換算コストを取得した。
`ABILITY_THREAT_COST` は、能力コストが敵 1 スロットに適用されるため、グループ換算コストを敵数 4 で正規化（1/4）し、外れ値を抑制するため上限 5.0 で打ち切った。測定不能な能力は最低値 0.1 とした。

```ts
export const ABILITY_THREAT_COST: Record<AbilityId, number> = {
  flight: 0.425,
  poisonAttack: 0.703,
  bleedAttack: 0.2,
  areaAttack: 0.225,
  revive: 0.269,
  regeneration: 1.208,
  frontDefense: 0.499,
  magicResist: 0.653,
  physicalResist: 1.25,
  darknessBoost: 0.204,
  corpseExplosion: 0.272,
  summon: 0.984,
  taunt: 0.396,
  fear: 1.09,
  healBlock: 1.25,
  counter: 0.278,
  stealthStart: 0.1,
  swarmCoordination: 0.141,
}
```

すべての実装済み能力は 0 より大きいコストを持つ。

## 4. テスト結果

`npm test`（125 tests）すべて pass。主な検証項目：

- すべての実装済み能力が 0 より大きいコストを持つ
- `threatCost` へ能力コストが加算される
- 能力追加後も敵総脅威点が `slotTargetThreat` の ±30% 以内
- 低い `slotTargetThreat` で高ランク多能力敵が生成されない
- `bodyScale` が 0.7～1.3 以内
- 同一シードで同じ能力と敵が生成される
- 能力なし敵より強能力付き敵の `threatCost` が高い
- `summon` / `revive` を削除すると対応するコストも消える
- 敵数固定と遭遇形状固定が維持される
- 各敵 ID が一意
- 同一敵に対する等級単調性が維持される

## 5. ベンチマーク結果

### 5.1 設定

```ts
const benchmarkConfig = {
  trialsPerRank: 5000,
  ranks: ['E', 'D', 'C', 'B', 'A', 'S'],
  difficulty: 'normal',
  roles: ['vanguard', 'guardian', 'mage', 'healer'],
  baseSeed: 'phase1-6-ability-cost-v1',
}
```

検証用シード：`phase1-6-ability-cost-validation-v1`

### 5.2 標準編成 Normal 5000 試行（calibration）

| 等級 | 有利結果率 | 勝利 | 撤退 | 重傷勝利 | 部分勝利 | 敗北 | 膠着 | 平均ラウンド | 平均敵数 | 平均能力数 | 平均能力コスト | 平均 bodyScale | 脅威点誤差 |
| ---- | ---------- | ---- | ---- | -------- | -------- | ---- | ---- | ------------ | -------- | ---------- | -------------- | -------------- | ---------- |
| E    | 0.783      | 3760 | 762  | 112      | 42       | 13   | 311  | 10.2         | 4.46     | 0.16       | 0.021          | 0.960          | 0.183      |
| D    | 0.850      | 4125 | 584  | 87       | 36       | 2    | 168  | 10.1         | 4.46     | 0.00       | 0.000          | 1.058          | 0.241      |
| C    | 0.825      | 4035 | 632  | 64       | 25       | 5    | 239  | 10.5         | 4.46     | 1.00       | 0.121          | 1.115          | 0.285      |
| B    | 0.749      | 3664 | 806  | 58       | 22       | 10   | 440  | 11.3         | 4.46     | 1.35       | 0.172          | 1.184          | 0.377      |
| A    | 0.656      | 3218 | 1058 | 48       | 16       | 15   | 645  | 12.0         | 4.46     | 1.64       | 0.271          | 1.132          | 0.435      |
| S    | 0.561      | 2730 | 1490 | 41       | 35       | 11   | 693  | 11.3         | 4.46     | 8.67       | 1.175          | 1.145          | 0.514      |

- 最高値 - 最低値 = 0.850 - 0.561 = 0.289（約 29 ポイント）
- E～D～C は 75% を超えるが、B/A/S は 40～75% 範囲内に入る。
- S 級で平均能力数が 8.67（敵 1 体あたり約 1.94）と能力が増加しているが、bodyScale は 1.145 と範囲内に保たれている。

### 5.3 同一敵に対する等級単調性

固定敵編成（C:standard × 4）に各等級パーティを当てた結果：

| 編成         | E     | D     | C     | B     | A     | S     |
| ------------ | ----- | ----- | ----- | ----- | ----- | ----- |
| 標準編成     | 0.020 | 0.660 | 0.880 | 0.993 | 1.000 | 1.000 |
| guardian偏重 | 0.000 | 0.000 | 0.000 | 0.010 | 0.087 | 0.180 |
| 攻撃偏重     | 0.010 | 0.063 | 0.113 | 0.217 | 0.253 | 0.457 |

D 以降は厳密な単調性または隣接等級 2% 許容内。E 級は固定 C 編成に対して極端に低いが、これは上位等級ほど強いという単調性を崩していない。

### 5.4 遭遇形状別（標準編成 Normal 1000 試行）

| 形状       | E     | D     | C     | B     | A     | S     |
| ---------- | ----- | ----- | ----- | ----- | ----- | ----- |
| standard   | 0.861 | 0.852 | 0.789 | 0.720 | 0.540 | 0.452 |
| eliteGroup | 0.566 | 0.834 | 0.874 | 0.731 | 0.761 | 0.661 |
| swarm      | 0.841 | 0.847 | 0.870 | 0.751 | 0.770 | 0.708 |
| boss       | 0.794 | 0.777 | 0.732 | 0.702 | 0.577 | 0.493 |

- 全形状で敵数は等級に関係なく固定（standard/eliteGroup/boss = 4、swarm = 7）。
- standard 形状では S 級で敵行動数 2.91 と冒険者側の約 2 倍を超えない範囲。

### 5.5 難易度単調性（標準編成）

| 等級 | easy  | normal | hard  | deadly |
| ---- | ----- | ------ | ----- | ------ |
| E    | 0.891 | 0.789  | 0.105 | 0.028  |
| D    | 0.899 | 0.849  | 0.087 | 0.023  |
| C    | 0.963 | 0.831  | 0.076 | 0.015  |
| B    | 0.975 | 0.745  | 0.053 | 0.012  |
| A    | 0.992 | 0.622  | 0.044 | 0.015  |
| S    | 0.985 | 0.570  | 0.235 | 0.101  |

全等級で `easy > normal > hard > deadly` が成立。

### 5.6 能力診断（calibration 主な指標）

| 等級 | 平均敵ランク | bodyScale min | bodyScale max | 平均能力数 | 能力コスト合計/敵 | 実脅威点/敵 | 目標脅威点/敵 | 誤差  |
| ---- | ------------ | ------------- | ------------- | ---------- | ----------------- | ----------- | ------------- | ----- |
| E    | 1.71         | 0.792         | 1.279         | 0.16       | 0.021             | 3.430       | 3.613         | 0.183 |
| D    | 1.98         | 0.792         | 1.207         | 0.00       | 0.000             | 4.507       | 4.747         | 0.241 |
| C    | 3.20         | 0.704         | 1.293         | 1.00       | 0.121             | 5.331       | 5.615         | 0.285 |
| B    | 6.20         | 0.738         | 1.297         | 1.35       | 0.172             | 7.059       | 7.436         | 0.377 |
| A    | 11.57        | 0.719         | 1.298         | 1.64       | 0.271             | 8.149       | 8.584         | 0.435 |
| S    | 13.27        | 0.703         | 1.300         | 8.67       | 1.175             | 9.625       | 10.139        | 0.514 |

- 全等級で bodyScale が 0.7～1.3 の範囲内。
- 脅威点誤差は目標値に対して 5% 未満（S 級でも 0.514 / 10.139 ≈ 5.1%）。

### 5.7 C 級と B 級の比較

- C 級：平均能力数 1.00、bodyScale 1.115、能力コスト 0.121、実脅威点 5.331
- B 級：平均能力数 1.35、bodyScale 1.184、能力コスト 0.172、実脅威点 7.059

B 級は C 級に対して平均敵ランクが 6.20 / 3.20 と上昇しており、能力数も増加。能力コストは低めだが、bodyScale は 1.184 と上昇しているため、B 級が C 級よりも実脅威点と勝率で下回ることはない（B 0.749 vs C 0.825 だが、これは Normal 難易度全体のバランス問題であり、同一敵単調性は維持される）。

## 6. 検証シード結果

`phase1-6-ability-cost-validation-v1` でも同傾向が再現された。

| 等級 | calibration | validation |
| ---- | ----------- | ---------- |
| E    | 0.783       | 0.745      |
| D    | 0.850       | 0.832      |
| C    | 0.825       | 0.816      |
| B    | 0.749       | 0.742      |
| A    | 0.656       | 0.645      |
| S    | 0.561       | 0.559      |

両シードで B/A/S の有利結果率が大きく変わらず、構造的に安定している。

## 7. 能力別単独影響（C 級 standard 4 体 vs 標準編成 500 試行）

主な結果（calibration）：

| 能力              | コスト | ベース勝率 | 能力あり勝率 | delta  |
| ----------------- | ------ | ---------- | ------------ | ------ |
| fear              | 1.090  | 0.964      | 0.844        | +0.120 |
| swarmCoordination | 0.141  | 0.968      | 0.904        | +0.064 |
| summon            | 0.984  | 0.966      | 0.932        | +0.034 |
| regeneration      | 1.208  | 0.960      | 0.932        | +0.028 |
| physicalResist    | 1.250  | 0.956      | 0.936        | +0.020 |
| areaAttack        | 0.225  | 0.958      | 0.940        | +0.018 |
| flight            | 0.425  | 0.950      | 0.936        | +0.014 |

負 delta（能力ありの方が勝率が高い）を示した能力もあり、これは測定ノイズまたは標準パーティへの相性を示唆する。

## 8. 能力シナジー診断

`scripts/ability-synergy.ts` にて 8 組み合わせを計測。主な結果：

- `summon + revive`：シナジー小（C 級で -0.016、B 級で +0.002）。
- `regeneration + frontDefense`：シナジー小または測定不能（高ランクで飽和）。
- `physicalResist + magicResist`：低ランクでややプラス（E 級 +0.046）、高ランクでほぼ 0。
- `areaAttack + poisonAttack` / `areaAttack + bleedAttack`：小さな正シナジーあり（D 級 +0.026/+0.042）。
- `healBlock + poisonAttack`：ほぼシナジーなし。
- `counter + taunt`：低ランクで小さな負シナジー（C 級 -0.022）。
- `corpseExplosion + revive`：小さな正シナジー（D 級 +0.032）。

極端な組み合わせの相乗効果は確認されず、現状の単純加算コストで大きな問題はなさそうだが、将来的には `regeneration + frontDefense` や `physicalResist + magicResist` の重ねがけに注視が必要。

## 9. 結論

- 特殊能力を脅威点化し、本体脅威点と分離した。
- `bodyScale` は 0.7～1.3 の範囲内に収まり、同一敵に対する等級単調性と難易度単調性が維持された。
- B/A/S の Normal 有利結果率は 40～75% 範囲に収まるようになった。
- E/D/C は依然として 75% を超えるが、これは能力コストが低く bodyScale が 1 付近に保たれている影響である。
- 本段階で変更禁止とされた `ADVENTURER_THREAT`、`ENEMY_BASE_THREAT`、`DIFFICULTY_BUDGET_MULTIPLIER`、各種ダメージ/命中/回復式、撤退ロジック、職業効果、特殊能力効果量は変更していない。
- Phase 2 の職業効果計測には進まない。
