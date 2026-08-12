# Phase 8.4 DOM → Canvas Parity Audit

## 目的

Canvas 版 Tavern UI において、Player が「どの Party にどの Quest を任せるか」を判断するために必要な情報が DOM 版と同等に表示されているかを棚卸しする。

## Matrix

| Field / Feature             | DOM (Legacy) | Canvas before 8.4 | Canvas after 8.4 | Source                                                  | Notes                                                        |
| --------------------------- | ------------ | ----------------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Quest title                 | yes          | yes               | yes              | `TavernRequestOffer.title`                              | 一覧／詳細双方                                               |
| Quest rank                  | yes          | yes               | yes              | `TavernRequestOffer.rank`                               | 一覧は右端バッジ、詳細は `Rank E` 形式                       |
| Quest objective type        | yes          | yes               | yes              | `OBJECTIVE_LABELS`                                      | 一覧サブタイトル／詳細                                       |
| Quest terrain               | yes          | yes               | yes              | `TavernRequestOffer.environment` + `ENVIRONMENT_LABELS` | DOM では `plains` 等の raw 表示あり；Canvas 8.4 では日本語化 |
| Quest description           | yes          | no                | yes              | `TavernRequestOffer.briefing`                           | 詳細パネルに全文表示                                         |
| Combat flag                 | yes          | no                | yes              | `TavernRequestOffer.expeditionRequest.battle`           | 詳細に `戦闘：あり／なし`                                    |
| Quest tags                  | yes          | no                | yes              | `TavernRequestOffer.publicTags`                         | 詳細にタグ列挙                                               |
| Offer status                | yes          | yes               | yes              | `questStatusLabel`                                      | 一覧／詳細                                                   |
| Party name                  | yes          | yes               | yes              | `TavernParty.party.name`                                | 一覧／詳細                                                   |
| Party rank                  | yes          | no                | yes              | `TavernParty.party.rank`                                | 詳細に `Rank C` 等                                           |
| Party status                | yes          | yes               | yes              | `TavernParty.availability`                              | 詳細に目立たせる                                             |
| Party member list           | yes          | yes               | yes              | `TavernParty.party.members`                             | 詳細に一覧                                                   |
| Party injury summary        | yes          | no                | yes              | member `currentHp` / `statusEffects`                    | 詳細に `負傷：なし／あり`                                    |
| Prediction success rate     | yes          | no                | yes              | `predictExpeditionOutcome`                              | 共有 Service 経由                                            |
| Prediction risk label       | yes          | no                | yes              | `getPredictionLabel`                                    | 同上                                                         |
| Prediction sample count     | yes          | no                | yes              | `EXPEDITION_PREDICTION_SAMPLES`                         | `200`                                                        |
| Prediction disclaimer       | yes          | no                | yes              | 固定文言                                                | 詳細に表示                                                   |
| Prediction breakdown        | yes          | no                | yes              | `ExpeditionPrediction.counts`                           | モーダル「内訳を見る」                                       |
| Recovering party selectable | yes          | no                | yes              | `TavernParty.availability`                              | 選択は可能、紹介のみ不可                                     |
| Offer disabled reason       | yes          | no                | yes              | `getOfferErrors`                                        | 詳細に理由表示                                               |

## 未 Parity 項目

- DOM の `RequestCard` では `environment` が `plains` 等のまま表示されている。Phase 8.4 では Canvas 側だけを日本語化し、DOM は既存表示を維持する（#16 の scope）。
- DOM の `PartyCard` は関係傾向／節目／酒場評判等の豊富な情報を表示している。Phase 8.4 では「Quest 判断に必要な最小限」に絞り、Character Detail 等は後続 Phase とする。

## 情報階層

```
Quest List        → 選択だけを促すコンパクト表示
    ↓
Quest Detail      → 依頼の詳細（目的／地形／戦闘／説明／タグ）
    ↓
Party × Quest     → 選択 Party の要約
    ↓
Prediction        → 推定達成率 / 危険度 / サンプル数 / 内訳
    ↓
Offer             → 「この依頼を紹介する」（disabled + 理由表示）
```
