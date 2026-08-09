# Phase 7.0 — Player-Selected AI Narrative MVP

## Goal

Add player-selected AI narrative generation to the tavern campaign simulator.
The AI is never called automatically; it only runs when the player explicitly
chooses 生成 for a `NarrativeCandidate`. AI output is pure presentation and
never changes gameplay state (Reputation, Affinity, Financial Pressure, Growth,
Skills, HP, MP, Morale, Recovery, Stay, Acceptance, Request Generation, Party Rank).

## Why player-selected generation

- Keeps the simulation deterministic and fully playable without any AI provider.
- Lets the player decide which moments deserve narrative polish.
- Makes cost and API-call volume transparent before a single token is spent.
- Avoids the risk of an AI hallucination silently rewriting game facts.

## Narrative architecture

```text
src/core/narrative/
  types.ts      — candidate, context, snapshot and generation record types
  candidates.ts — derive expedition/character-event candidates from campaign state
  context.ts    — build party/request snapshots and recent highlights
  prompt.ts     — build v1 system/user prompts
  generation.ts — single call + archive helper

src/ai/narrative/
  types.ts       — provider abstraction
  fakeProvider.ts — deterministic test provider with call counter
  httpProvider.ts — runtime HTTP chat-completion adapter
```

Candidate derivation is RNG-free and idempotent. It is invoked from
`resolveCampaignDay` and `advanceCampaignDay` and merged into
`TavernCampaignState.narrativeCandidates` by deterministic ID.

## Candidate model

```ts
type NarrativeCandidateCategory = 'expedition' | 'characterEvent'

type CharacterNarrativeEventType =
  | 'partyArrival'
  | 'riskyRequestAccepted'
  | 'weakObjectiveSuccess'
  | 'recoveryFinished'
  | 'stayExtended'
  | 'becameRegular'
  | 'becameFavorite'
  | 'farewell'
  | 'casualtyDeparture'
```

`NarrativeCandidate` carries `id`, `version: 1`, `category`, optional `eventType`,
`dayNumber`, `partyId`, `partyName`, optional `requestId`/`requestTitle`, `priority`,
`title`, `context: NarrativeContext`, `state: 'available' | 'generated' | 'dismissed'`,
and `activeGenerationId`.

ID format: `narrative:v1:<dayNumber>:<category>:<eventType or expedition>:<partyId>[:<requestId>]`.

## Expedition candidates

One candidate is created for every resolved dispatch (`status === 'resolved'`).
The context is `ExpeditionNarrativeContext` and contains the party snapshot,
request info, optional acceptance reason, and the full `DispatchReport`.

## Character event candidates

Resolve timing:

- `riskyRequestAccepted` — accepted offer with `rankGap === +1`
- `weakObjectiveSuccess` — party's weak objective matches request objective and
  outcome is `completeSuccess` or `success`
- `becameRegular` — affinity crosses `< 60` → `>= 60` for the first time
- `becameFavorite` — affinity crosses `< 80` → `>= 80` for the first time

Advance timing:

- `partyArrival` — from `CampaignPartyEvent.type === 'arrived'`
- `recoveryFinished` — from `CampaignPartyEvent.type === 'finishedRecovery'`
- `stayExtended` — from `CampaignRelationshipEvent.type === 'stayExtended'`
- `farewell` — `departedScheduled` with departure affinity `>= 60`
- `casualtyDeparture` — `departedCasualty`, regardless of affinity

At most one character-event candidate is emitted per party per day. The highest
priority event becomes the primary; lower-priority events for the same party are
stored in `secondaryTriggers`.

Priority order:

| Priority | Event                |
| -------- | -------------------- |
| 100      | casualtyDeparture    |
| 90       | farewell             |
| 80       | becameFavorite       |
| 70       | becameRegular        |
| 60       | stayExtended         |
| 50       | recoveryFinished     |
| 40       | weakObjectiveSuccess |
| 30       | riskyRequestAccepted |
| 10       | partyArrival         |

## Context snapshots

`NarrativePartySnapshot` captures:

- `id`, `name`, `rank`, `leaderId`, `leaderName`
- `members` with `id`, `name`, `role`, `rank`, `personality`, `incapacitated?`, `dead?`
- `missionSpecialization`
- `affinity`, `financialPressure`, `riskTolerance`
- `growthMilestones`, `trainingDays`
- `stats`
- `arrivalDay`, `plannedDepartureDay`

`ExpeditionNarrativeContext` adds request info, acceptance info (`reason`,
`rankGap`, `specializationMatch`), and the `DispatchReport`.

`CharacterEventNarrativeContext` adds `eventType`, `secondaryTriggers`, `eventFacts`,
and up to 3 `recentHighlights` drawn from campaign history.

### Context sample — expedition

```json
{
  "kind": "expedition",
  "party": { "name": "《赤鴉団》", "rank": "D", ... },
  "request": { "title": "森の遺跡調査", "objectiveType": "investigation", ... },
  "acceptance": { "reason": "challengingButSuitable", "rankGap": 0, "specializationMatch": "neutral" },
  "report": { "outcome": "success", "objectiveCompleted": true, "keyFacts": [...] }
}
```

### Context sample — partyArrival

```json
{
  "kind": "characterEvent",
  "eventType": "partyArrival",
  "party": { "name": "《碧の狼》", "arrivalDay": 2, "plannedDepartureDay": 4, ... },
  "eventFacts": { "arrivalDay": 2, "plannedDepartureDay": 4 }
}
```

### Context sample — riskyRequestAccepted

```json
{
  "kind": "characterEvent",
  "eventType": "riskyRequestAccepted",
  "party": { "name": "《鉄の爪》", "rank": "D", ... },
  "eventFacts": {
    "requestTitle": "廃坑の魔物討伐",
    "requestRank": "C",
    "partyRank": "D",
    "rankGap": 1,
    "acceptanceReason": "boldChallenge"
  }
}
```

### Context sample — becameRegular

```json
{
  "kind": "characterEvent",
  "eventType": "becameRegular",
  "party": { "name": "《白銀の盾》", "affinity": 67, ... },
  "eventFacts": { "before": 59, "after": 67, "outcome": "success" }
}
```

### Context sample — farewell

```json
{
  "kind": "characterEvent",
  "eventType": "farewell",
  "party": { "name": "《赤鴉団》", "affinity": 60, ... },
  "eventFacts": {
    "arrivalDay": 1,
    "departureDay": 1,
    "stayDays": 1,
    "finalAffinity": 60,
    "totalExpeditions": 0,
    "completeSuccesses": 0
  },
  "recentHighlights": []
}
```

## Farewell event

Farewell snapshots the party before removal. Even after the party leaves
`campaign.parties`, the candidate retains the full `NarrativePartySnapshot`
(members, affinity, stats, highlights), so the AI can still be called later and
produce a coherent goodbye.

## Prompt contract

`NARRATIVE_PROMPT_VERSION = 'v1'`.

The system prompt instructs the AI that all supplied FACTS are immutable and
forbids inventing new game state. It explicitly forbids return-date guarantees,
new destinations, family/backstory/debt creation, new injuries or illnesses,
romance, new NPCs, rewards, items, or new requests. Personality values may
influence speech and reactions, but they must not be used to invent a character's
past, family, debt, or employment history.

### Expedition output

- Length: 400–800 Japanese characters.
- Scene: the party returns to the tavern and reports the result to the owner.
- Include important events in natural prose, short member dialogue, and do not read
  HP/MP/Morale numbers verbatim.
- Do not change the outcome.

### Character event output

- Length: 300–700 Japanese characters.
- Scene: a short tavern conversation focusing on the primary event.
- `secondaryTriggers` may be touched on naturally but do not need to be included all.
- Do not invent the owner's name, gender, or age.

### Event-specific guidance

A `characterEventInstruction(eventType)` helper appends tailored writing guidance
for every supported event:

- `partyArrival` — first impression and leader greeting; use party name, rank,
  and strong/weak objectives; do not invent past adventures or visit reasons.
- `riskyRequestAccepted` — the moment just before accepting a higher-rank request;
  respect `acceptanceReason`; express confidence for `specializationMatch`, trust
  for `trustedBroker`, or financial need for `needsIncome`; do not invent
  circumstances.
- `weakObjectiveSuccess` — the party succeeded in their weak field this time, but
  do not declare "fully overcome" their weakness.
- `recoveryFinished` — recovery ends and the party can act again; do not invent
  disease names, treatments, or doctors.
- `stayExtended` — the party tells the owner they are extending their stay; do
  not become permanent residents.
- `becameRegular` — the party has settled in as regulars; generic "usual seat"
  references are fine, but do not fabricate specific dishes or order history.
- `becameFavorite` — strong trust or favor toward the owner; do not escalate to
  family/best-friend/romance.
- `farewell` — a high-affinity goodbye; use `stayDays`, expedition history,
  growth, and recent highlights; do not promise a return date or invent a
  destination.
- `casualtyDeparture` — respect `deadMemberNames` and `survivorNames` exactly; do
  not resurrect the dead, kill survivors, or invent funerals, bereaved
  relatives, or revenge quests.

## Expedition prompt example

```text
【遠征レポート】
依頼タイトル: 未踏洞窟の経路測量
依頼ランク: E
目的: survey
環境: mountain
Public Tags: 測量, 山岳, 3区画
依頼内容: 未踏洞窟の内部経路と危険箇所を測量する。

Party: 流水の滴 (Rank C)
Leader: チェルシー クォーツ
Affinity: 10
Financial Pressure: 43
Risk Tolerance: balanced
Specialization Match: neutral
Strong Objective: elimination
Weak Objective: escort
Leader Personality: bravery 1, caution 0, cooperation -3, discipline -2, altruism -2, greed 0
Members:
  - チェルシー クォーツ (C vanguard)
      Personality: bravery 1, caution 0, cooperation -3, discipline -2, altruism -2, greed 0
  - ...

Acceptance Reason: appropriate
Rank Gap: -2
Outcome: success
Objective Completed: Yes
Objective Progress: 80%

Member Final States:
  - チェルシー クォーツ (vanguard C) — HP 68/68, MP 8/8, Morale 46
  - ...

Key Facts:
  - 未踏洞窟の経路測量を完了
  - 全員無事に帰還

WRITING INSTRUCTIONS:
- 400～800字程度の日本語
- Partyが酒場へ帰還し、店主へ結果を報告する短編
- 重要な出来事を自然な文章にする
- Party Memberの短い会話を含めてよい
- HP/MP/Morale等の数値をそのまま読み上げない
- Outcomeを変更しない
```

## Farewell prompt example

System:

```text
あなたはファンタジー世界の酒場を舞台とするゲームのナレーターです。

提供されたFACTSはゲームエンジンが確定した事実です。FACTSと矛盾する内容を書いてはいけません。
結果、人物名、Party名、Rank、負傷、死亡、依頼内容、成功・失敗、関係値などを変更してはいけません。
FACTSに存在しない新しい事件、NPC、依頼、報酬、アイテム、過去、約束、恒久的な人間関係、家族設定、故郷設定、借金額を事実として追加してはいけません。

再訪や戻ってくる日付を確約させないでください。「必ず戻る」「来月戻る」などは避け、「近くへ来たら寄る」「機会があれば」程度にとどめてください。
目的地を新しく創作しないでください。生存者を死亡させたり、死者を生き返らせたりしないでください。新しい怪我や病気、恋愛関係を捏造しないでください。

Personality値（勇敢さ、慎重さ、協調性、規律、利他、貪欲）は話し方や反応の参考にしてよいです。ただし、それを根拠に人物の過去、家族、借金、職歴等の新しい設定を作らないでください。

ただし、物語表現としての一時的な表情、仕草、口調、空気、短い会話などは創作して構いません。それらは新たなゲーム上の事実を作らない範囲にしてください。

ゲームシステムの数値をそのまま読み上げるのではなく、自然な日本語の物語として描写してください。
```

User (farewell fixture):

```text
【キャラクターイベント】
Event Type: farewell
Party: 玻璃の鏡 (Rank C)
Leader: ロイド ムーン
Leader Personality: bravery -1, caution -2, cooperation -1, discipline -2, altruism 3, greed 0
Affinity: 60
Financial Pressure: 54
Risk Tolerance: balanced
Growth Milestones: 0
Training Days: 0
Strong Objective: survey
Weak Objective: investigation
Members:
  - ロイド ムーン (C vanguard)
      Personality: bravery -1, caution -2, cooperation -1, discipline -2, altruism 3, greed 0
  - ティア サンド (C vanguard)
      Personality: bravery 2, caution -2, cooperation 3, discipline -1, altruism -3, greed -3
  - エルナ クォーツ (C guardian)
      Personality: bravery 2, caution 1, cooperation 1, discipline -1, altruism -2, greed 0
  - ロイド ドラグナー (C healer)
      Personality: bravery 0, caution -1, cooperation -1, discipline -3, altruism 0, greed 3

Recent Highlights:
なし

Event Facts:
  - arrivalDay: 1
  - departureDay: 1
  - stayDays: 1
  - finalAffinity: 60
  - totalExpeditions: 0
  - completeSuccesses: 0

WRITING INSTRUCTIONS:
- 300～700字程度の日本語
- 酒場を舞台とする短い会話シーン
- Primary Eventを中心に描写する
- secondaryTriggersは自然なら触れてよいが、全部入れる必要はない
- 店主の名前・性別・年齢を捏造しない

farewell:
- 高Affinity Partyとの別れを中心にする
- stayDays / actual expedition history / growth / recentHighlightsを利用する
- 実際に紹介した依頼を振り返ってよい
- 再訪予定は存在しない
- 「必ず戻る」「来月戻る」等を確約させない
- 「また近くへ来たら寄る」「機会があれば」程度は可
- 新しい目的地を確定しない
```

## Creative freedom boundary

- ✅ Expressions, gestures, tone, tavern atmosphere, short improvised dialogue,
  and Personality-influenced speech.
- ❌ Unknown NPCs, romance, rewards, items, backstory, debts, fixed destinations,
  return guarantees, raising the dead, inventing injuries/illnesses, family
  settings, hometown settings.

## Provider abstraction

```ts
interface NarrativeProvider {
  id: string
  generate(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationResponse>
}
```

- `FakeNarrativeProvider` — test/development provider with a public `callCount`.
- `HttpNarrativeProvider` — runtime chat-completion adapter configured by
  `endpoint`, `model`, optional `apiKey`. No hardcoded endpoint. API key lives
  only in React runtime state and is lost on reload.

## Cost control UI

- Default state: `AI未接続`; generate buttons are disabled.
- Candidate list shows: total, available, selected, and AI calls so far.
- Bulk generate button reads the exact number of provider calls that will be made.
- Manual per-candidate generate / regenerate.
- Dismiss / restore without any provider call.

## AI call count guarantees

- `resolveCampaignDay`, `advanceCampaignDay`, `offerRequestToParty`, and all
  candidate derivation functions never call `NarrativeProvider`.
- The UI only calls the provider inside `handleGenerate` / `handleBulkGenerate`.
- A 30-day campaign audit with `FakeNarrativeProvider` produced:
  - **Candidates: 69**
  - **AI calls: 0**
- Manually selecting and generating 3 candidates produced:
  - **AI calls: 3**
  - **Generation records: 3**

## Generation archive

Every successful call creates a `NarrativeGenerationRecord` appended to
`TavernCampaignState.narrativeGenerations`. The candidate's `activeGenerationId`
points to the newest record; older records are kept so regenerations are fully
auditable.

## 30-day candidate audit

Run `npx tsx scripts/phase7-0-narrative-audit.ts`.

Result:

```text
30-day zero-call audit
  Candidates: 69
  AI calls: 0
  Generations: 0
After manual 3-call generation
  AI calls: 3
  Generations: 3
```

## Browser E2E

A recorded 14-day `酒場キャンペーン` run exercised the narrative UI on the Vite
React app at `http://localhost:5173/` with the Fake Provider.

Verified:

- **Cost Control**: `AI呼び出し: 0回` and `状態: AI未接続` after Day 1 resolve
  and advance.
- **Expedition generation**: generated `遠征レポート：洞窟の魔物討伐`; output showed
  `【Fake生成 #1】`, `model: fake-model`, `tokens: 156`, and call count updated to 1.
- **Character event**: generated `partyArrival` (新しい顔) and `becameRegular` (常連).
- **Bulk**: selected two `partyArrival` candidates and generated them; call count
  increased from 3 to 5.
- **Dismiss / Restore**: dismissed then restored a candidate with no call increase.
- **Provider error**: configured an invalid HTTP endpoint, saw
  `AI文章の生成に失敗しました。HTTP 404:`, then switched back to Fake Provider and
  continued to the next day.
- **Farewell**: on Day 14, `別れの挨拶：灰狼の牙` appeared, was generated, and call
  count became 6. The party left the roster while the candidate stayed in the queue.
- **Console**: 0 `console.error`, 0 unhandled rejections.

Recordings and detailed screenshots are in `test-report-phase7-0-rerun.md`.

## Existing regression

- `npm run test:expedition-regression` — 22/22 passing, baseline unchanged.
- `npm run test` — all existing tests pass.

## Known limitations

- The HTTP provider expects an OpenAI-compatible chat-completion shape.
- API key is not persisted; the player must re-enter it after a reload.
- Character event `recentHighlights` are based on the current party's mission
  specialization and may not reflect historical context if the specialization
  changed (specialization is currently static).
