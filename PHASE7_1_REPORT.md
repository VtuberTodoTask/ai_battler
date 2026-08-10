# Phase 7.1 — Full Expedition Story / Narrative Timeline

## Goal

Transform the expedition narrative prompt from a fragment of facts into a single
continuous short story by building a deterministic, source-event-driven
`NarrativeTimeline` that the AI expands into prose without inventing events.

One expedition candidate = one AI generation call.

## Scope

Only the narrative presentation layer changed.

- `src/core/narrative/timeline.ts` (new)
- `src/core/narrative/timelineProjection.ts` (new)
- `src/core/narrative/prompt.ts`
- `src/core/narrative/types.ts`
- `src/core/narrative/context.ts`
- `src/core/narrative/candidates.ts`
- `src/core/narrative/timeline.test.ts` (new)
- `src/ui/tavern/NarrativeCandidateCard.tsx`
- `scripts/phase7-1-timeline-audit.ts` (updated)
- `scripts/phase7-1-smoke.ts` (updated)

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
- For each non-battle log, calls `projectExpeditionLogToNarrativeBeats(log,
context)` to derive beats from `log.type`, `log.effects`, `log.check`,
  `log.actorIds`, and `log.targetIds`.
  - `log.facts` is never copied or parsed; it is only used by the legacy engine
    code and is ignored by the projection layer.
  - Unknown `log.type` defaults to no beats.
- When it sees a `battleSummary` log, it inserts a compressed battle timeline
  built from the matching `ExpeditionBattleRecord`.
- Ensures `return` and `aftermath` beats exist for non-lost expeditions.
- De-duplicates exact text strings to avoid repeated identical beats.
- Falls back to a report-only timeline when `context.state` is unavailable.

`projectExpeditionLogToNarrativeBeats` lives in
`src/core/narrative/timelineProjection.ts` and implements the per-log mapping.
It:

- Maps `CheckResult` values to Japanese narrative labels for treatment, care,
  survey, investigation, etc.; raw enum strings (`criticalSuccess`,
  `partialSuccess`, `failure`, `success`) never reach the timeline.
- Emits supply beats (`医薬品を使用した`, `測量用具を使用した`, etc.) without
  numeric counts.
- Emits member damage beats (`{name}は負傷した` / `{name}は被害を受けた`)
  without raw HP/MP/Morale or damage numbers.
- Emits world-facing counts only where structurally confirmed (e.g.
  `討伐対象として4体が指定された`, `4体を撃破した`).
- Uses canonical Japanese ability names from `ABILITY_MAP` for battle abilities;
  unknown English IDs are omitted.

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
  a recorded `metadata.abilityId` and a matching entry in `ABILITY_MAP`; unknown
  IDs are omitted.
- Target 4-12 beats per battle, hard cap ~15.
- Uses `battleOutcomeLabel` and `environmentLabel` from `facts.ts`.

To give the builder full access to the deterministic trace, an optional `state`
field was added to `ExpeditionNarrativeContext` and `resolved.result` is now
threaded through `buildExpeditionNarrativeContext` in `candidates.ts`. Optional
`timeline` and `battleMetrics` fields were also added so the narrative candidate
can carry the precomputed, compact timeline and audit counts without rebuilding
them at prompt time and without storing the full simulation state.

## Structured Timeline Projection

Phase 7.1.1 replaced the previous `for (const fact of log.facts)` copy loop with
a structured projection function.

```ts
function projectExpeditionLogToNarrativeBeats(
  log: ExpeditionLogEntry,
  context: ExpeditionNarrativeContext,
): NarrativeTimelineBeatDraft[]
```

Rules:

- Source of truth: `log.type`, `log.effects`, `log.check`, `log.actorIds`,
  `log.targetIds`, and `context.state` / `context.party`.
- `log.facts` is never read by production narrative code.
- No string re-parsing or regex extraction from fact strings.
- Unknown `log.type` defaults to no beats.
- No raw numeric leakage: HP/MP/Morale, damage/healing amounts, roll/difficulty,
  progress %, quality, supply counts, seeds, internal IDs.
- World-facing counts are allowed when structurally confirmed
  (`討伐対象4体`, `4体を撃破した`; sector counts use `数区画` to avoid
  arbitrary digits).
- Battle abilities use `ABILITY_MAP` Japanese display names or are omitted; raw
  English IDs (`summon`, `fireball`, `heal`, `guard`) do not appear in the
  Japanese timeline.
- `CheckResult` enum strings never appear in the final timeline; they are mapped
  to Japanese labels (`成功`, `一部成功`, `失敗`, etc.).

The projection is covered by `src/core/narrative/timeline.test.ts` and the
`phase7-1-timeline-audit.ts` leakage scan.

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
- Named abilities only appear when recorded in battle logs and are rendered as
  canonical Japanese names from `ABILITY_MAP`.
- Unknown ability IDs (`Fireball`, etc.) are omitted from the Japanese timeline.
- No `Math.random` or `Date.now` dependency.
- v4 prompt sections (`=== EXPEDITION TIMELINE ===`,
  `=== CONFIRMED OUTCOME FACTS ===`, length guidance, TIMELINE contract).
- No raw system value leakage (`battleOutcome`, `HP`, `MP`, `Morale`, etc.).
- Structured projection: `log.facts` strings are never copied into timeline
  beats; poisoned raw facts and unknown `log.type` values produce no leakage.
- No raw numeric leakage across all six objective types (damage, supply counts,
  progress %, quality, roll/difficulty, internal IDs).

`src/core/narrative/narrative.test.ts` was updated for v4 prompt expectations.

## Verification results

```text
npm run typecheck          PASS
npm run lint               PASS
npm test                   808 passed
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
Avg prompt characters:      4764
Avg estimated tokens:       7146
Avg raw context chars:      8709
Total prompt chars:         142913
Total estimated tokens:     214377
Total raw context chars:    261258
```

### Phase 7.1 timeline audit

```text
Candidate count:                   30
Average timeline beat count:     20
Max timeline beat count:         28
Average prompt chars:            4787
Max prompt chars:                5063
Average battle source events:    61
Average battle narrative beats:  5
Compression ratio:               0.0833
Leakage violations:              0
```

## Manual smoke scenarios

`scripts/phase7-1-smoke.ts` now covers all six objective types plus a casualty
scenario. It asserts no leaked `log.facts` strings, no raw numeric values, no
`CheckResult` enum strings, no internal IDs, and canonical Japanese ability names
only. It passed on the current projection.

Scenarios:

- A. Investigation + Battle + Retreat
- B. Elimination completeSuccess
- C. Survey partial failure
- D. Rescue success
- E. Expedition with casualty
- F. Escort success
- G. Retrieval success

Example: Elimination completeSuccess timeline (no raw facts, no numeric leakage):

```text
[出発]
- Test Partyは依頼を引き受け、森林へ向かった
- ベル リーフが効率的なルートと補給計画を立てた

[接近]
- ベル リーフが経路を確保したが、多少の遅延が発生した
- シエラ オーシャンが周囲の危険を事前に察知・回避した

[探索]
- 調査に手間取った

[戦闘]
- 遠征中に戦闘が発生した
- Partyは有利な形で敵と接敵した
- 戦闘は長引いた
- 戦闘結果は勝利だった
- 討伐対象として4体が指定された。4体を撃破した

[目標]
- 討伐対象の討伐を確認し、依頼目的を達成した

[帰還]
- ベル リーフが安全な帰還経路を確保した
- 周囲の危険に遭遇した
- ドラン クレストは負傷した
- ユリ グレイが帰還中の負傷者を手当てした
- 医薬品を使用した

[決着]
- ユリ グレイが負傷者の治療を行った
- 遠征は決着を迎えた
```

```text
- 依頼は完全な成功に終わった
- 遠征中に戦闘が発生した
- 戦闘結果は勝利だった
- 依頼対象はすべて撃破された
- 依頼目的を達成した
- 帰還時の状態: ドラン クレスト: 目立った消耗はない / ベル リーフ: 目立った消耗はない / シエラ オーシャン: 目立った消耗はない / ユリ グレイ: 目立った消耗はない
```

The casualty scenario shows canonical ability naming:

```text
[戦闘]
...
- 一人の冒険者が仲間召喚を使用した
- ベル ハインドは戦闘で命を落とした
```

## Known limitations

- Some secondary descriptions that were previously carried by free-form
  `log.facts` are intentionally dropped because they cannot be derived safely
  from structured data. Examples include hidden information names discovered by
  `attemptInformationDiscovery`, `Support` role morale bonuses, and feature labels
  for generic hazard events. The timeline still captures the event outcome and
  mechanical impact.
- `escortTargetAssigned` and `retrievalTargetAssigned` show the target/area
  names stored in the expedition state; test fixtures may use placeholder names.
- Feature-specific hazard descriptions are intentionally generic (`周囲の危険`)
  because the projection avoids reconstructing feature labels from the
  `state.discoveredThreats` ordering, which is not a reliable per-log source.
- Battle ability names rely on `ABILITY_MAP`; enemy abilities that are not in the
  map are omitted rather than guessed.

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

## Phase 7.1 / 7.1.1 stopped conditions

- `NarrativeTimeline` type and `buildExpeditionNarrativeTimeline` implemented.
- `projectExpeditionLogToNarrativeBeats` in `timelineProjection.ts` derives beats
  from `log.type`, `log.effects`, `log.check`, `log.actorIds`, `log.targetIds`,
  and structured state; `log.facts` is never copied or parsed.
- Unknown `log.type` defaults to no beats.
- No raw numeric leakage (HP/MP/Morale, damage/healing, roll/difficulty,
  progress %, quality, supply counts, seeds, internal IDs).
- World-facing counts are allowed when structurally confirmed
  (`討伐対象4体`, `4体を撃破した`).
- Battle abilities use canonical Japanese names from `ABILITY_MAP`; unknown
  English IDs are omitted.
- All six objective types mapped to timeline beats.
- Battle compression (4-12 beats, cap ~15, mandatory event preservation).
- Deterministic, no RNG, no `Date.now`, source ordering preserved.
- `NARRATIVE_PROMPT_VERSION` remains `v4`.
- v4 user prompt sections and system instructions in place.
- `timeline.test.ts` covers poisoned facts, unknown types, leakage, ability
  display rules, and all six objectives.
- `phase7-1-timeline-audit.ts` includes leakage scan and passes with 0
  violations.
- `phase7-1-smoke.ts` covers all six objectives plus casualty and asserts no
  leakage.
- `NarrativeCandidateCard` UI updated.
- `PHASE7_1_REPORT.md` updated with Structured Timeline Projection and Known
  Limitations sections.
- `typecheck`, `lint`, `test`, `build`, `expedition-regression`, 30-day
  zero-call audit, compression audit, and timeline audit all green.
