# Phase 6.6 Report — Party Mission Specialization

## 1. 目的

各 Party に「得意な依頼分野 ×1」「苦手な依頼分野 ×1」を設定し、それが単なる UI 表示ではなく
実際の `runExpedition` → 成功率 → Phase 6.1 Prediction → Phase 6.5 Acceptance に自然に反映されるようにした。

## 2. 変更概要

### 2.1 新規モデルと生成

- `PartyMissionSpecialization`（`strongObjective`, `weakObjective`）を追加
- `generateAdventurerParty()` で専用 RNG stream から決定的に生成
- `AdventurerParty` に `missionSpecialization` フィールドを追加
- `src/core/tavern/specialization.ts` に `getMissionSpecializationMatch()` と定数を追加

```ts
export const MISSION_SPECIALIZATION_CHECK_MODIFIER = {
  strong: 8,
  neutral: 0,
  weak: -8,
}
export const ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER = {
  strong: 0.92,
  neutral: 1.0,
  weak: 1.08,
}
```

### 2.2 遠征実行への統合

- `runExpedition(request, party, options?)` に `ExpeditionExecutionOptions` を追加
- `state.metadata.missionSpecializationMatch` を設定（明示的に渡されたときのみ）
- `resolveSkillCheck()` で `+ specializationModifier` を 1 回だけ適用
- `runExpeditionBattle()` で `elimination` の場合だけ `requestPartyThreat` に倍率を適用
- デフォルト `runExpedition(request, party)` は Phase 6.2 regression と同一結果を維持

### 2.3 Prediction / Acceptance

- `predictExpeditionOutcome()` は依頼/objective から `missionSpecializationMatch` を計算し、
  200 samples すべてに同じ match を渡す
- `buildPredictionCacheKey` に `missionSpecialization` を含める
- `evaluateOffer()` の modifiers に `specialization: +8/0/-8` を追加
- 新 reason code `specialtyMatch` / `specialtyMismatch` を追加
- `+2` hard gate は specialization によらず維持

### 2.4 UI

- `PartyCard` に `得意：討伐 · 苦手：護衛` 形式で表示
- `BrokeragePanel` の依頼適性表示とスコア内訳に `専門分野` を追加

## 3. 監査結果

`scripts/phase6-6-specialization-audit.ts` を実行。

| 監査                                             | 結果                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| Distribution（1000 seeds × 8 templates）         | PASS: 各 Objective の strong/weak 出現頻度が期待値 ±30% 以内 |
| Role independence                                | PASS: archetype 間で偏りなし                                 |
| Paired success（6 objectives × 100 seeds）       | PASS: strong >= neutral >= weak                              |
| Acceptance score shift                           | PASS: strong vs neutral = +8.00, neutral vs weak = +8.00     |
| Acceptance rate（same-rank / +1 / +2 hard gate） | PASS: スコア差 ~±8、+2 hard gate 0% acceptance               |
| 30-day campaign smoke                            | PASS: 30 日間、70 件の遠征をエラーなく実行                   |

詳細は `reports/phase6_6_specialization_audit.json` を参照。

## 4. Verification

```text
npm run typecheck          PASS
npm run lint               PASS
npm test                   PASS (742 tests)
npm run build              PASS
npm run test:expedition-regression  PASS (22/22)
```

## 5. Browser E2E

TBD — recorded E2E will be appended after PR creation.
