# Phase 7.1 — Full Expedition Story / Narrative Timeline

## Goal

Transform the expedition narrative prompt from a fragment of facts into a single
continuous short story by building a deterministic, source-event-driven
`NarrativeTimeline` that the AI expands into prose without inventing events.

One expedition candidate = one AI generation call.

## Scope

Only the narrative presentation layer changed.

- `src/core/narrative/timeline.ts` (new)
- `src/core/narrative/prompt.ts`
- `src/core/narrative/types.ts`
- `src/core/narrative/context.ts`
- `src/core/narrative/candidates.ts`
- `src/core/narrative/timeline.test.ts` (new)
- `src/ui/tavern/NarrativeCandidateCard.tsx`
- `scripts/phase7-1-timeline-audit.ts` (new)
- `scripts/phase7-1-smoke.ts` (new, manual smoke harness)

A small utility change (`src/core/util.ts`) switched `deepClone` from
`JSON.parse(JSON.stringify())` to `structuredClone`.

No gameplay, simulation, provider, candidate trigger, priority, or cost-control
changes were made.

## NarrativeTimeline design

`NarrativeTimelineBeat` represents one deterministic fact from the expedition.

```ts
export interface NarrativeTimelineBeat {
  id: string
  phase: NarrativeTimelinePhase
  kind: NarrativeTimelineBeatKind
  text: string
  actorIds?: string[]
  targetIds?: string[]
  importance: number
}
```

Phases reuse the `ExpeditionPhase` concept but are mapped to narrative phases:
`departure`, `approach`, `exploration`, `objective`, `battle`, `return`,
`aftermath`.

`buildExpeditionNarrativeTimeline(context)`:

- Starts with a deterministic departure beat.
- Walks `state.logs` in engine order.
- Maps each non-battle log fact to a timeline beat using `PHASE_MAP`.
- When it sees a `battleSummary` log, it inserts a compressed battle timeline
  built from the matching `ExpeditionBattleRecord`.
- Ensures `return` and `aftermath` beats exist for non-lost expeditions.
- De-duplicates exact text strings to avoid repeated identical beats.
- Falls back to a report-only timeline when `context.state` is unavailable.

`buildExpeditionNarrativeContext` precomputes the timeline when `result.state`
is available and attaches it to the context. `buildExpeditionPrompt` prefers
`context.timeline` and falls back to building from `context.state` if needed.

`candidates.ts` stores only the compact `timeline` and `battleMetrics` on the
persisted `NarrativeCandidate`; the full `state` is dropped from the campaign
snapshot to keep daily `deepClone` fast.

Battle timeline compression (`buildBattleTimeline`):

- Mandatory beats preserved: start, contact, casualties, incapacitation,
  injuries, retreat, outcome, discovered weaknesses.
- Repetitive attack logs are replaced by duration and generic outcome beats.
- Named abilities are emitted only when they appear in `record.result.logs` with
  a recorded `metadata.abilityId`.
- Target 4-12 beats per battle, hard cap ~15.
- Uses `battleOutcomeLabel` and `environmentLabel` from `facts.ts`.

To give the builder full access to the deterministic trace, an optional `state`
field was added to `ExpeditionNarrativeContext` and `resolved.result` is now
threaded through `buildExpeditionNarrativeContext` in `candidates.ts`. Optional
`timeline` and `battleMetrics` fields were also added so the narrative candidate
can carry the precomputed, compact timeline and audit counts without rebuilding
them at prompt time and without storing the full simulation state.

## Prompt v4 changes

`NARRATIVE_PROMPT_VERSION = 'v4'`.

User prompt sections for expeditions:

```text
=== CURRENT REQUEST ===
=== PARTY ===
=== EXPEDITION TIMELINE ===
=== CONFIRMED OUTCOME FACTS ===
=== DETAILS NOT RECORDED ===
=== NARRATIVE HINTS ===
=== WRITING INSTRUCTIONS ===
```

System prompt additions:

- `【TIMELINEの扱い】`: TIMELINE is only event ordering; do not add events not
  listed, do not invent causality.
- Tavernkeeper remains player-owned; no tavernkeeper subject sentences.
- `CONFIRMED OUTCOME FACTS` and `TIMELINE` text must not be read verbatim as
  character dialogue.
- Personality hints are only for speech/attitude reference, not facts.

Writing instructions:

- 1600-2600 Japanese characters (may be shorter, down to ~1200, if the timeline
  is short).
- Continuous short story, no chapter headings.
- Departure → approach → exploration → objective → battle → return → report.
- Party reports to the tavernkeeper; no tavernkeeper dialogue, emotion, or
  decisions invented.

## UI

`NarrativeCandidateCard` now shows `compressed v4 prompt` in the prompt preview
and renders the generate button as `遠征物語を生成` for expedition candidates.

## Test coverage

`src/core/narrative/timeline.test.ts` verifies:

- Determinism: same context always produces the same timeline.
- Phase ordering is monotonic and starts/ends at the correct narrative phases.
- All six objective types (`investigation`, `elimination`, `rescue`, `escort`,
  `retrieval`, `survey`) produce beats.
- Battle compression: source events exceed timeline battle beats and battle
  beats never exceed 15.
- Mandatory battle events (start, outcome, casualty, incapacitation, retreat,
  objective-impacting result) are preserved.
- Generic attacks never invent weapons or wound descriptions.
- Named abilities only appear when recorded in battle logs.
- No `Math.random` or `Date.now` dependency.
- v4 prompt sections (`=== EXPEDITION TIMELINE ===`,
  `=== CONFIRMED OUTCOME FACTS ===`, length guidance, TIMELINE contract).
- No raw system value leakage (`battleOutcome`, `HP`, `MP`, `Morale`, etc.).

`src/core/narrative/narrative.test.ts` was updated for v4 prompt expectations.

## Verification results

```text
npm run typecheck          PASS
npm run lint               PASS
npm test                   803 passed
npm run build              PASS
npm run test:expedition-regression  22/22 PASS
```

### 30-day zero-call audit

```text
Candidates: 69
AI calls:   0
Generations: 0
After 3 manual generations: AI calls = 3
```

### Prompt compression audit

```text
Expedition candidates:      30
Avg prompt characters:      4957
Avg estimated tokens:       7435
Avg raw context chars:      48359
```

### Phase 7.1 timeline audit

```text
Candidate count:                   30
Average timeline beat count:     25
Max timeline beat count:         35
Average prompt chars:            4957
Max prompt chars:                5323
Average battle source events:    61
Average battle narrative beats:  6
Compression ratio:               0.0989
```

## Manual smoke scenarios

The harness `scripts/phase7-1-smoke.ts` runs five requested scenarios and prints
the `EXPEDITION TIMELINE` and `CONFIRMED OUTCOME FACTS` sections of the v4
prompt. All examples contain no invented events and no tavernkeeper dialogue.

### A. Investigation + Battle + Retreat (outcome: forcedRetreat)

```text
[出発]
- Test Partyは依頼を引き受け、森林へ向かった
- オルム リーフが効率的なルートと補給計画を立てた
- Support不在のため、出発時の士気が低めである

[接近]
- オルム リーフが経路を確保したが、多少の遅延が発生した
- 視界不良に遭遇した
- Guardianがオルム リーフの被害を軽減した
- オルム リーフが7のダメージを受けた

[探索]
- 調査に手間取った
- オルム リーフが2のダメージを受けた

[戦闘]
- 遠征中に戦闘が発生した
- 敵に先制された状態で戦闘が始まった
- 短い激突だった
- Partyは戦闘から撤退した
- 戦闘結果は撤退だった

[帰還]
- オルム リーフが安全な帰還経路を確保した
- Guardianがジーク グレイの被害を軽減した
- ジーク グレイが1のダメージを受けた
- 医薬品を1消費した
- ジーク グレイが帰還中の負傷者を手当てした

[決着]
- ジーク グレイによる治療判定: success
- 目的に関する成果を得られなかった
- 医薬品を2消費した
- ジーク グレイが負傷者の治療を行った
```

```text
- Partyは依頼を完遂できず、途中で撤退した
- 遠征中に戦闘が発生した
- 戦闘結果は撤退だった
- 調査によって具体的な情報を得ることはできなかった
```

### B. Elimination completeSuccess (outcome: completeSuccess)

```text
[戦闘]
- 遠征中に戦闘が発生した
- Partyは有利な形で敵と接敵した
- 戦闘は長引いた
- 戦闘結果は勝利だった
- 討伐対象として4体が指定された
- 戦闘で4体を撃破した
- 討伐進捗は100%となった

[目標]
- 撃破した4体の討伐を自動確認した
- 討伐対象として4体が指定された。戦闘で4体を撃破した。討伐進捗は100%となった。撃破した4体のうち4体の討伐を確認した。全対象の討伐を確認した
```

```text
- 依頼は完全な成功に終わった
- 遠征中に戦闘が発生した
- 戦闘結果は勝利だった
- 依頼対象はすべて撃破された
- 依頼目的を達成した
```

### C. Survey partial failure (outcome: partialSuccess)

```text
[目標]
- 中央区画の測量を完了できなかった
- 南区画について不完全ながら測量記録を取得した。測量精度は55だった

[帰還]
- 2区画分の測量記録を整理し、持ち帰る準備を行った
- ミレイ ノースが帰還経路を見失い、迂回した
- 視界不良に遭遇した
- Guardianがミレイ ノースの被害を軽減した
- ミレイ ノースが3のダメージを受けた
- 医薬品を1消費した
- ヴァン アイヴィーが帰還中の負傷者を手当てした
- 測量記録を酒場まで持ち帰った

[決着]
- 測量地域の測量進捗: 75% (2/3区画, 平均精度55)
- ヴァン アイヴィーによる治療判定: criticalSuccess
- 医薬品を2消費した
- ヴァン アイヴィーが負傷者の治療を行った
```

```text
- 依頼は一部成果を得たが、完全な成功には至らなかった
- 遠征中に戦闘が発生した
- 戦闘結果は勝利だった
- 予定された範囲の大半を測量した
- 測量記録の品質は依頼の基準に届かなかった
- 測量記録を酒場まで持ち帰った
```

### D. Rescue success (outcome: completeSuccess)

```text
[接近]
- ロイド オーシャンが救出対象の位置をぎりぎりで特定した
- ナナリー ドラグナーが救出対象のもとへ到達した
- ナナリー ドラグナー（guardian）が救出対象の保護担当になった

[戦闘]
- 遠征中に戦闘が発生した
- 敵に先制された状態で戦闘が始まった
- 戦闘がしばらく続いた
- 戦闘結果は勝利だった
- ナナリー ドラグナーが救出対象を戦闘から守り切った

[目標]
- 救出対象のHPが0回復した（healing success）
- エルナ クロムが救出対象を安定化した
- 医薬品を1消費した
- ナナリー ドラグナーが救出対象を危険地帯から搬出した

[帰還]
- ナナリー ドラグナーが安全な帰還経路を確保した
- エルナ クロムが帰還中の負傷者を手当てした
- 救出対象を拠点まで連れ帰った

[決着]
- エルナ クロムによる治療判定: success
- 救出対象は発見済み・接近済み・安定化済み・搬出済み・帰還済み。救出進捗は100%
- 医薬品を2消費した
- エルナ クロムが負傷者の治療を行った
```

```text
- 依頼は完全な成功に終わった
- 遠征中に戦闘が発生した
- 戦闘結果は勝利だった
- 救出対象を発見した
- 救出対象のもとへ到達した
- 救出対象を安定させた
- 救出対象を退避させた
- 救出対象とともに帰還した
- 依頼目的を達成した
```

### E. Expedition with casualty (outcome: forcedRetreat)

```text
[戦闘]
- 遠征中に戦闘が発生した
- 敵に先制された状態で戦闘が始まった
- 戦闘がしばらく続いた
- 一人の冒険者がsummonを使用した
- ベル ハインドは戦闘で命を落とした
- Partyは戦闘から撤退した
- 戦闘結果は撤退だった
- 討伐対象として4体が指定された
- 戦闘で0体を撃破した
- 4体が生存している
- 討伐進捗は0%となった

[目標]
- 撃破対象が存在しないため、討伐確認は行われなかった
- 討伐対象として4体が指定された。戦闘で0体を撃破した。4体が生存している。討伐進捗は0%となった。討伐対象が残っているため依頼目的は未完了

[決着]
- ジーク ジェムによる治療判定: partialSuccess
- 犠牲者: C-mage-smoke-19-mage-2
- 治療は不十分だった
```

```text
- Partyは依頼を完遂できず、途中で撤退した
- 遠征中に戦闘が発生した
- 戦闘結果は撤退だった
- 依頼対象の一部が残っている
- 死亡したMember: ベル ハインド
```

## LM Studio smoke test

No local LM Studio environment was available in this session, so the
Qwen3-Swallow-8B-RL-v0.2 smoke generation was not run. The prompt contract,
harness, and v4 prompt sections are in place for manual verification.

## Not implemented / out of scope

- Player Character Profile / player dialogue input
- Semantic hallucination validator
- RAG / vector DB / long-term AI memory
- New gameplay encounters, AI-generated expedition events, AI battle/objective
  decisions
- Provider, model, sampling, candidate trigger, or cost-control changes

## Phase 7.1 stopped conditions

- `NarrativeTimeline` type and `buildExpeditionNarrativeTimeline` implemented.
- All six objective types mapped to timeline beats.
- Battle compression (4-12 beats, cap ~15, mandatory event preservation).
- Deterministic, no RNG, no `Date.now`, source ordering preserved.
- `NARRATIVE_PROMPT_VERSION` bumped to `v4`.
- v4 user prompt sections and system instructions added.
- `timeline.test.ts` added and passing.
- `phase7-1-timeline-audit.ts` added and passing.
- `NarrativeCandidateCard` UI updated.
- `PHASE7_1_REPORT.md` created.
- `typecheck`, `lint`, `test`, `build`, `expedition-regression`, 30-day
  zero-call audit, compression audit, and timeline audit all green.
