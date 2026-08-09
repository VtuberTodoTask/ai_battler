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
forbids inventing new game state. Allowed creative freedom: expressions,
gestures, tone, tavern atmosphere. Forbidden creative freedom: unknown NPCs,
romance, new requests, rewards, items, backstory, debts, fixed destinations,
return guarantees, raising the dead, inventing injuries.

Expedition output target: ~400–800 Japanese characters.
Character event output target: ~300–700 Japanese characters.

## Farewell prompt example

System:

```text
あなたはファンタジー世界の酒場を舞台とするゲームのナレーターです。

提供されたFACTSはゲームエンジンが確定した事実です。FACTSと矛盾する内容を書いてはいけません。
結果、人物名、Party名、Rank、負傷、死亡、依頼内容、成功・失敗、関係値などを変更してはいけません。
FACTSに存在しない新しい事件、NPC、依頼、報酬、アイテム、過去、約束、恒久的な人間関係を事実として追加してはいけません。

ただし、物語表現としての一時的な表情、仕草、口調、空気、短い会話などは創作して構いません。それらは新たなゲーム上の事実を作らない範囲にしてください。

ゲームシステムの数値をそのまま読み上げるのではなく、自然な日本語の物語として描写してください。
```

User (farewell fixture):

```text
【キャラクターイベント】
Event Type: farewell
Party: 赤鴉団 (Rank D)
Leader: フェイ アイヴィー
Affinity: 60
Financial Pressure: 38
Risk Tolerance: cautious
Growth Milestones: 0
Training Days: 0
Strong Objective: retrieval
Weak Objective: investigation
Members:
  - フェイ アイヴィー (D scout)
  - オルム クォーツ (D ranger)
  - シエラ アイヴィー (D mage)
  - チェルシー アイヴィー (D support)
Recent Highlights:
なし
Event Facts:
  - arrivalDay: 1
  - departureDay: 1
  - stayDays: 1
  - finalAffinity: 60
  - totalExpeditions: 0
  - completeSuccesses: 0
```

## Creative freedom boundary

- ✅ Expressions, gestures, tone, tavern atmosphere, short improvised dialogue.
- ❌ Unknown NPCs, romance, rewards, items, backstory, debts, fixed destinations,
  return guarantees, raising dead, inventing injuries.

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
