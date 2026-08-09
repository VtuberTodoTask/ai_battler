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

録画付き E2E を `tavern-campaign-324` で実施。`npm run build && npx vite preview` → `http://localhost:4173/` 上で `酒場キャンペーン` Day 1-3 を操作した。

| 確認項目                                           | 結果 |
| -------------------------------------------------- | ---- |
| PartyCard に `得意：… · 苦手：…` 表示              | PASS |
| BrokeragePanel `依頼適性` / `専門分野: ±8` 表示    | PASS |
| 得意パーティ `specialtyMatch (54/50)` 受諾         | PASS |
| 苦手パーティ `tooDangerous` 辞退（`専門分野: -8`） | PASS |
| パーティ切替で予測更新、戻すとキャッシュ再利用     | PASS |
| `本日の仲介を確定` 後、予測と実遠征結果が分離      | PASS |
| HP/MP/Morale / 評判 / 回復 / CampaignHistory 更新  | PASS |
| Console error なし                                 | PASS |

### キー証拠

- 得意パーティ `黒曜の斧`（`得意：調査`）で `specialtyMatch` / `専門分野: 8`
  ![specialtyMatch](https://app.devin.ai/attachments/52b6d160-fdec-49e2-9468-2661df6bcf8c/ss_8d2ca993.png)
- 苦手パーティ `炎獅子団`（`苦手：調査`）で `専門分野: -8` / `tooDangerous` 辞退
  ![weak fit](https://app.devin.ai/attachments/5d67b09f-ec54-4fcc-a9f6-826f5cb3b229/ss_c72f01ef.png)
- 実遠征結果 `completeSuccess` / `Objective completed: はい` / `Objective progress: 100%`
  ![result](https://app.devin.ai/attachments/b8dff3a1-920a-419c-af95-29effff0f35a/ss_c3e3a1ca.png)
- CampaignHistory の Relationship / 成長 / 鍛錬 / 療養
  ![history](https://app.devin.ai/attachments/24aa3927-920a-406d-9e96-9855da61dd82/ss_e310346d.png)

- 録画: `/home/ubuntu/screencasts/phase6-6-tavern-clean/phase6-6-tavern-clean-edited.mp4`
- 詳細レポート: `test-report-phase6-6.md`
