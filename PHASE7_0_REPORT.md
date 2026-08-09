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

`NARRATIVE_PROMPT_VERSION = 'v3'`.

The v3 bump reflects a meaningful contract change: the prompt now sends a
`NarrativeFactBundle` (`confirmedFacts`, `unknownDetails`, `presentationHints`)
from the deterministic `src/core/narrative/facts.ts` builder instead of raw
engine values. The tavernkeeper remains explicitly defined as the player, not an
NPC the AI can act for.

### Player-owned tavernkeeper

The system prompt contains a dedicated `【店主＝プレイヤーについて】` section:

- The tavernkeeper is not an NPC; the tavernkeeper is the player operating the game.
- The AI must not decide the tavernkeeper's personality, speech, emotions,
  thoughts, decisions, promises, or course of action.
- The AI must not infer or state the player's feelings
  (e.g. `プレイヤーは期待した`, `プレイヤーは喜んだ`, `プレイヤーは不安を感じた`).
- Unless provided as a FACT, the AI must not invent the tavernkeeper's name,
  gender, age, appearance, personality, past, feelings, tone, or lines.
- If no tavernkeeper name is given as a FACT, refer to them only as `店主`.
  Do not assign proper names like "アルフレッド" or "マリナ".
- The narrative camera is placed with the adventurer party; do not enter the
  tavernkeeper's interior perspective.
- Avoid phrases such as `店主は満足げに頷いた`, `店主は寂しそうに笑った`,
  `店主は彼らを誇らしく思った`, etc.
- Party-to-tavernkeeper actions and dialogue are allowed (e.g. reporting,
  greeting, saying goodbye). Tavernkeeper-to-party actions or dialogue are
  forbidden unless explicitly listed in FACTS.

### Other fact constraints

- All supplied FACTS are immutable.
- Do not change outcomes, names, ranks, injuries, deaths, request content,
  success/failure, or relationship values.
- Do not invent new incidents, NPCs, requests, rewards, items, past events,
  promises, permanent relationships, family settings, hometowns, or debts.
- Do not promise return dates or invent fixed destinations.
- Do not resurrect the dead, kill survivors, invent new injuries/illnesses, or
  create romances.
- Do not invent the causes of failure, retreat, injury, depletion, low progress,
  or success when those causes are not listed in CONFIRMED FACTS.
- Do not infer equipment, spells, weapons, or actions from a member's `role`
  (e.g., `mage` casting magic, `guardian` using a shield, `scout` finding traps)
  unless the FACTS explicitly record them.

### Personality usage

Personality values (bravery, caution, cooperation, discipline, altruism, greed)
are translated by `buildPersonalityHints` into Japanese narrative hints when
`|value| >= 2`. The AI receives hints such as `大胆で、危険を過度には恐れない` or
`他者への配慮が強い`, never raw trait names or numbers. Hints may influence
speech style but must not be used to invent backstory, family, debt, or
employment history.

### Expedition output

- Length: 400–800 Japanese characters.
- Scene: the party returns to the tavern and reports the result to the player.
- Tell the story in natural prose, include short party-member dialogue, and do
  not read HP/MP/Morale numbers verbatim.
- Dialogue should come from the party members, not from the tavernkeeper.
- Do not write the tavernkeeper's reaction; advance the scene without it.
- Do not change the outcome.

### Character event output

- Length: 300–700 Japanese characters.
- Scene: a short tavern conversation focused on the primary event.
- `secondaryTriggers` may be touched on naturally but do not need to be included.
- The tavernkeeper is the player; do not invent their name, gender, age,
  appearance, personality, lines, feelings, thoughts, judgments, promises, or
  actions.
- Party-to-tavernkeeper address is allowed; tavernkeeper-to-party address is not.

### Event-specific guidance

A `characterEventInstruction(eventType)` helper appends tailored writing guidance
for every supported event:

- `partyArrival` — the newly arrived party is the subject; the leader may
  introduce themselves to the tavernkeeper; describe the first impression from
  the party's side; the tavernkeeper must not introduce themselves, offer
  welcome lines, or have a fixed first impression.
- `riskyRequestAccepted` — moment just before accepting a higher-rank request;
  party may say "we'll take it"; do not make the tavernkeeper ask
  "are you sure?"; respect `acceptanceReason`; express confidence for
  `specializationMatch`, trust for `trustedBroker`, or financial need for
  `needsIncome` from the party's side only.
- `weakObjectiveSuccess` — the party succeeded in their weak field this time;
  the party may report it to the tavernkeeper; do not say they "fully overcame"
  the weakness; do not invent praising lines from the tavernkeeper.
- `recoveryFinished` — recovery ends and the party can act again; party may say
  "we can move now"; do not make the tavernkeeper say "don't overdo it"; do not
  invent disease names, treatments, or doctors.
- `stayExtended` — the party informs the tavernkeeper they are extending their
  stay; do not write the tavernkeeper's reply; do not make them permanent
  residents.
- `becameRegular` — the party has settled in as regulars; generic "usual seat"
  references are fine; do not state the tavernkeeper thinks of them as family.
- `becameFavorite` — describe strong trust from the party toward the
  tavernkeeper (e.g. "if you bring it, it's worth listening to"); do not
  infer equivalent feelings from the tavernkeeper's side; do not escalate to
  family/best-friend/romance.
- `farewell` — high-affinity goodbye; the party tells the tavernkeeper they are
  leaving, reflects on their time, offers thanks/farewell words, then leaves;
  do not write the tavernkeeper's response; do not promise a return date or
  invent a destination.
- `casualtyDeparture` — respect `deadMemberNames` and `survivorNames` exactly;
  do not resurrect the dead or kill survivors; do not invent funerals,
  bereaved relatives, or revenge quests; party grief is allowed; do not make
  the tavernkeeper cry, rage, comfort, or swear revenge.

## Expedition prompt example

```text
=== CURRENT REQUEST ===
依頼タイトル: 洞窟の魔物討伐
依頼ランク: D
今回の依頼種別: elimination（討伐）
環境: cave（洞窟）
Public Tags: 討伐, 洞窟, 戦闘あり
依頼内容: 洞窟に潜む魔物を掃討する。

=== PARTY ===
Party: 雷鳴の足跡 (Rank D)
Leader: リナ ジェム
関係性: まだ馴染みが薄い
リスクへの姿勢: バランス型
受諾理由: 適切な内容の依頼だった
今回の依頼との専門適性: 今回の依頼は得意・苦手のどちらでもない

Members:
  - ナナリー アイヴィー（D guardian）: 大胆で、危険を過度には恐れない / 慎重さより行動を優先しやすい / 仲間と歩調を合わせやすい / 形式や手順にはあまり拘らない
  - ユリ オーシャン（D ranger）: 危険には慎重な姿勢を取りやすい
  - リナ ジェム（D mage）: 慎重さより行動を優先しやすい / 自分の判断を優先しやすい / 他者より自分側の利益を優先しやすい / 金銭的利益への執着は弱い
  - レオ アイヴィー（D support）: 特に目立った傾向は記録されていない

=== CONFIRMED FACTS ===
- Partyは依頼を完遂できず、途中で撤退した
- 遠征中に戦闘が発生した
- 戦闘結果は撤退だった
- 依頼対象の一部が残っている
- 帰還時の状態: ナナリー アイヴィー: 目立った消耗はない / ユリ オーシャン: 目立った消耗はない / リナ ジェム: 帰還時の消耗が大きい / レオ アイヴィー: 目立った消耗はない

=== DETAILS NOT RECORDED ===
- Memberが消耗した具体的な原因は記録されていない
- 撤退した具体的原因は記録されていない

=== NARRATIVE HINTS ===
- 関係性: まだ馴染みが薄い
- リスクへの姿勢: バランス型
- 今回の依頼は得意・苦手のどちらでもない
- 受諾理由: 適切な内容の依頼だった

=== WRITING INSTRUCTIONS ===
- 400～800字程度の日本語
- Partyが酒場へ帰還し、店主へ結果を報告する短編
- 重要な出来事を自然な文章にする
- Party Memberの短い会話を含めてよい
- 会話を入れる場合は原則Party Member側の台詞にする
- 店主はプレイヤー本人なので、店主の台詞・感情・判断を作らない
- 店主の反応を必要とする場面では、反応そのものを書かずに場面を進める
- HP/MP/Morale等の数値をそのまま読み上げない
- 最終文章にenum名、内部フィールド名、ゲームシステムの注釈、FACTS一覧の引用、注意書き、解説、括弧書きのメタコメントを出力してはいけません
- 最終本文は自然な日本語だけで書いてください
- Outcomeを変更しない
- 次の冒険、新たな依頼、新しい目的地へ勝手につなげない
```

## Farewell prompt example

System:

```text
あなたはファンタジー世界の酒場を舞台とするゲームのナレーターです。

【店主＝プレイヤーについて】
この酒場の店主はNPCではありません。店主は、このゲームを操作しているプレイヤー本人です。
店主の人格や意思をAIが代わりに決定してはいけません。
FACTSに明示されていない限り、店主について以下を創作してはいけません。

- 名前
- 性別
- 年齢
- 外見
- 性格
- 過去
- 感情
- 思考
- 口調
- 台詞
- 約束
- 判断
- 行動方針

店主の名前がFACTSとして与えられていない場合、必ず「店主」とだけ表記してください。
「アルフレッド」「マリナ」など、店主へ新しい固有名を与えてはいけません。

FACTSとして店主の発言内容が明示されている場合を除き、店主の台詞を新しく作ってはいけません。
店主はプレイヤー本人であるため、AIがプレイヤーに代わって発言してはいけません。

店主の内面を描写しないでください。次のような表現を避けてください。
- 店主は満足げに頷いた。
- 店主は寂しそうに笑った。
- 店主は驚いて目を見開いた。
- 店主は彼らを誇らしく思った。
- 店主は失敗に落胆した。

物語のカメラは主に冒険者Party側へ置いてください。店主の内面を描写する視点には入らないでください。

【その他の事実制約】
提供されたFACTSはゲームエンジンが確定した事実です。FACTSと矛盾する内容を書いてはいけません。
結果、人物名、Party名、Rank、負傷、死亡、依頼内容、成功・失敗、関係値などを変更してはいけません。
FACTSに存在しない新しい事件、NPC、依頼、報酬、アイテム、過去、約束、恒久的な人間関係、家族設定、故郷設定、借金額を事実として追加してはいけません。

再訪や戻ってくる日付を確約させないでください。「必ず戻る」「来月戻る」などは避け、「近くへ来たら寄る」「機会があれば」程度にとどめてください。
目的地を新しく創作しないでください。生存者を死亡させたり、死者を生き返らせたりしないでください。新しい怪我や病気、恋愛関係を捏造しないでください。

Personality値（勇敢さ、慎重さ、協調性、規律、利他、貪欲）は話し方や反応の参考にしてよいです。ただし、それを根拠に人物の過去、家族、借金、職歴等の新しい設定を作らないでください。

ただし、物語表現としての一時的な表情、仕草、口調、空気、短い会話などは創作して構いません。それらは新たなゲーム上の事実を作らない範囲にしてください。ただし、店主の感情、思考、台詞、意思決定を創作してはいけません。

ゲームシステムの数値をそのまま読み上げるのではなく、自然な日本語の物語として描写してください。
```

User (farewell fixture):

```text
【キャラクターイベント】
Event Type: farewell
Party: 赤鴉団 (Rank D)
Leader: フェイ アイヴィー
Leader Personality: bravery -3, caution -1, cooperation 3, discipline -2, altruism 3, greed -1
Affinity: 60
Financial Pressure: 38
Risk Tolerance: cautious
Growth Milestones: 0
Training Days: 0
Strong Objective: retrieval
Weak Objective: investigation
Members:
  - フェイ アイヴィー (D scout)
      Personality: bravery -3, caution -1, cooperation 3, discipline -2, altruism 3, greed -1
  - オルム クォーツ (D ranger)
      Personality: bravery -2, caution 3, cooperation -1, discipline 1, altruism -3, greed 2
  - シエラ アイヴィー (D mage)
      Personality: bravery -3, caution 3, cooperation 3, discipline -1, altruism 2, greed -3
  - チェルシー アイヴィー (D support)
      Personality: bravery 0, caution -1, cooperation 2, discipline 2, altruism -2, greed -1

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
- 店主はNPCではなくプレイヤー本人である
- 店主の名前・性別・年齢・外見・性格を創作しない
- 店主の台詞を作らない
- 店主の感情・思考を決めない
- 店主に新しい判断・約束・行動方針を与えない
- Party側から店主へ話しかける描写は可
- 店主からPartyへの新規行動・発話は原則禁止（FACTSに明示されている場合を除く）
farewell:
- 高Affinity Partyが店主へ旅立ちを告げる場面
- stayDays / actual expedition history / growth / recentHighlightsを利用する
- 実際に紹介した依頼を振り返ってよい
- Party側から感謝・別れの言葉を告げる
- 最後にPartyが酒場を去る
- 店主の返答を作らない
- 再訪予定は存在しない
- 「必ず戻る」「来月戻る」等を確約させない
- 「また近くへ来たら寄る」「機会があれば」程度は可
- 新しい目的地を確定しない
```

## Creative freedom boundary

- ✅ Party-side expressions, gestures, tone, tavern atmosphere, short improvised
  dialogue, and Personality-influenced speech.
- ❌ Tavernkeeper proper names, gender, age, appearance, personality, emotions,
  thoughts, speech, decisions, promises, or actions unless provided as FACTS.
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

## Phase 7.0.3 — Narrative Fact Fidelity / Context Compression

Phase 7.0.3 stops feeding raw engine values into the LLM and instead sends a
deterministic `NarrativeFactBundle` produced by `src/core/narrative/facts.ts`.

### New module: `src/core/narrative/facts.ts`

- `NarrativeFactBundle { confirmedFacts, unknownDetails, presentationHints }`
- `buildExpeditionNarrativeFacts(context)` returns the bundle deterministically
  (no RNG; same context always yields the same bundle).
- `buildPersonalityHints(personality)` maps traits with `|value| >= 2` to Japanese
  narrative hints (e.g. `大胆で、危険を過度には恐れない`, `他者への配慮が強い`).
- Helper label functions:
  - `objectiveLabel`
  - `environmentLabel`
  - `outcomeLabel`
  - `battleOutcomeLabel`
  - `riskToleranceLabel`
  - `affinityBand`
  - `specializationMatchText`
  - `acceptanceReasonText`

### Prompt version bump

`NARRATIVE_PROMPT_VERSION = 'v3'`.

The new contract is a clean break: the LLM translates confirmed facts into
prose, but it does not invent new events, causes, NPCs, equipment, items, or
destinations.

### Expedition prompt sections

```text
=== CURRENT REQUEST ===
=== PARTY ===
=== CONFIRMED FACTS ===
=== DETAILS NOT RECORDED ===
=== NARRATIVE HINTS ===
=== WRITING INSTRUCTIONS ===
```

`CURRENT REQUEST` contains only existing request fields (`title`, `rank`,
`objectiveType` with a Japanese label, `environment` with a label, `publicTags`,
`briefing`). No new information is generated.

### Removed from the AI-facing prompt

- `Outcome: failedObjective`
- `Objective Progress: 30%`
- `Objective Completed`
- `elapsedTime`
- `HP 45/65`, `MP`, `Morale`
- Raw `keyFacts` listing
- `Strong Objective` / `Weak Objective` in expedition prompts
- Raw enum names and internal field names

`Strong`/`Weak Objective` is still kept for character-event prompts where it is
narratively useful.

### Natural-language transformations

- Outcome labels:
  - `completeSuccess` → `依頼は完全な成功に終わった`
  - `success` → `依頼は成功した`
  - `partialSuccess` → `依頼は一部成果を得たが、完全な成功には至らなかった`
  - `failedObjective` → `依頼の目的を達成できなかった`
  - `forcedRetreat` → `Partyは依頼を完遂できず、途中で撤退した`
  - `lostExpedition` → `遠征は壊滅的な結果に終わった`
- Battle outcomes are reported as `遠征中に戦闘が発生した` + `戦闘結果は...だった`.
- HP condition bands:
  - ratio `>= 0.9` → `目立った消耗はない`
  - `0.5–0.9` → `帰還時に消耗が見られる`
  - `< 0.5` → `帰還時の消耗が大きい`
- Affinity banded as 0–19, 20–39, 40–59, 60–79, 80–100.
- Risk tolerance, specialization match, and acceptance reason are all rendered
  as Japanese prose.

### Objective-specific fact builders

All six objective types have dedicated builders:

- `investigationFacts`
- `eliminationFacts`
- `rescueFacts`
- `escortFacts`
- `retrievalFacts`
- `surveyFacts`

Each builder emits `confirmedFacts` from the `DispatchReport` objective summary and
adds `unknownDetails` for missing causal facts. For example, a partial survey
states that only part of the area was surveyed and that the record quality met
the threshold, but marks the reason coverage was limited as unknown.

### Causality and role-hallucination guards

The v3 system prompt adds:

- Cause Fidelity Rule: when a cause is not in `CONFIRMED FACTS`, the LLM must not
  invent one; it must describe the outcome while leaving the cause unknown.
- Role-hallucination guard: a member's `role` is not a license to invent actions
  (`mage` casting magic, `guardian` using a shield, `scout` finding traps, etc.)
  unless the FACTS explicitly record them.
- Equipment creation is forbidden unless the FACTS list the item.
- NPC creation is forbidden except for confirmed people in `CONFIRMED FACTS` and
  the tavernkeeper.
- Player emotion inference is explicitly forbidden (`プレイヤーは期待した`, etc.).
- Meta output is forbidden: no enum names, internal field names, annotations,
  fact lists, or parenthetical meta comments in the final prose.
- Future actions and next destinations may not be invented.

### Creativity boundary

Allowed:

- Facial expressions, glances, tone, posture, pauses, short lines, and light
  reactions among party members.

Forbidden:

- New events, obstacles, enemies, people, items, causes, information, promises,
  or future plans.

### UI prompt preview

`NarrativeCandidateCard.tsx` now shows two expandable blocks:

- `AIへ送る内容（compressed v3 prompt）を見る` — the actual v3 system + user prompt.
- `Raw Narrative Contextを見る` — the full JSON context retained for audit and
  debug.

### Tests added

- `src/core/narrative/facts.test.ts`
  - `buildPersonalityHints` for positive/negative traits, raw-name exclusion.
  - Fact bundles for all six objective types.
  - Battle outcome reporting without causal inference.
  - Member condition bands without raw HP/MP/Morale.
- `src/core/narrative/narrative.test.ts` updated for v3 prompt sections and
  contents, player-contract regression, role/equipment hallucination guards,
  meta-output guard, and Japanese-only output.

### Audits

**30-day zero-call audit** (`npx tsx scripts/phase7-0-narrative-audit.ts`):

```text
30-day zero-call audit
  Candidates: 69
  AI calls: 0
  Generations: 0
After manual 3-call generation
  AI calls: 3
  Generations: 3
```

**Compression audit** (`npx tsx scripts/phase7-0-3-compression-audit.ts`):

```text
Prompt compression audit
  Expedition candidates: 30
  Avg prompt characters: 3597
  Avg estimated tokens:  5396
  Avg raw context chars:   4943
  Total prompt chars:      107913
  Total estimated tokens:  161877
  Total raw context chars: 148283
```

The v3 prompt is shorter than the raw JSON context and focuses on facts rather
than numbers, improving fidelity while keeping token use reasonable.

### LM Studio smoke test

Not available in this environment, so no manual LLM generation was run.
The prompt contract and deterministic fact builder are the deliverables for
Phase 7.0.3.

### Verification

- `npm run typecheck` — green
- `npm run lint` — green
- `npm test` — green
- `npm run build` — green
- `npm run test:expedition-regression` — 22/22 passing
- `npx tsx scripts/phase7-0-narrative-audit.ts` — 69 candidates, 0 AI calls
- `npx tsx scripts/phase7-0-3-compression-audit.ts` — completed
