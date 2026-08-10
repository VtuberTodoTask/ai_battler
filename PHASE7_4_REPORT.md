# Phase 7.4 Report — Persistent Relationships & Character Memory

## Overview

Phase 7.4 adds deterministic, persistent character and relationship memory to the expedition narrative layer. Memories are generated only from structured simulation events, are directional, carry importance/valence, and are projected into narrative context only when relevant. The player-selected AI narrative layer remains constrained by confirmed facts; memories influence behavior but cannot be freely invented or rewritten by the generator.

## Memory Architecture

- **Source**: structured simulation events (`RelationshipEvent` projection, expedition outcome, injuries, casualties, rescue objective state).
- **Pipeline**: `Simulation → Structured Events → Deterministic Relationship Update → Relationship Memory Projection → Persistent Character / Relationship Memory → Next Narrative Context`.
- **Determinism**: memory IDs, summaries, importance, and valence are computed from deterministic inputs (character IDs, event type, magnitude, day, expedition ID). No LLM output is stored as memory.
- **Storage**: persistent arrays on `CampaignParty`:
  - `characterMemories: Record<string, CharacterMemory[]>` per member.
  - `sharedExpeditionCounts: Record<string, number>` per unordered member pair.
  - `memberRelationships` already stores directional `RelationshipMemory[]` in `recentEvents`.

## Character Memory

- `CharacterMemory` includes `id`, `characterId`, `expeditionId`, `day`, `type`, `summary`, `importance`, `valence`, `relatedCharacterIds`, `createdAtDay`, `lastReferencedDay`.
- Types: `major_success`, `major_failure`, `injury`, `critical_injury`, `retreat`, `rescue`, `casualty`, `objective_failure`, `objective_success`, `other`.
- Generated per surviving member after each expedition:
  - outcome memory (`major_success` / `objective_success` / `objective_failure` / `retreat` / `major_failure`).
  - injury memory (`critical_injury` or `injury`) for each `state.injuries` entry.
  - witnessed casualty memory if any party member died.
  - rescue memory when a rescue target is successfully returned.
- Persistent limit: `CHARACTER_MEMORY_LIMIT = 20` per character.
- Per-expedition budget: `PER_EXPEDITION_CHARACTER_MEMORY_BUDGET = 3` (top by importance).
- Does **not** modify personality in Phase 7.4.

## Relationship Memory

- `RelationshipMemory` includes `id`, `sourceCharacterId`, `targetCharacterId`, `expeditionId`, `day`, `type`, `summary`, `importance`, `valence`, `relatedFactIds`, `relatedBeatIds`, `createdAtDay`, `lastReferencedDay`.
- Types align with `RelationshipEventType`: `rescued`, `healed`, `protected`, `abandoned`, `supported`, `conflict`, `disagreement`, `shared_success`, `shared_failure`, `retreat`, `casualty`, `trust_event`, `other`. `romantic_moment` exists in the type but is not generated from any event in Phase 7.4.
- Directional: the same event produces different summaries for `A → B` and `B → A` (e.g. active “手当てを行った” vs passive “手当てしてもらった”).
- Generated inside `applyRelationshipEvents` from `RelationshipEvent` projections.
- Persistent limit: `RELATIONSHIP_MEMORY_LIMIT = 20` per pair.

## Directional Memory

Directionality is preserved at two levels:

1. Relationship stat updates remain directional (`A → B` affinity/trust/respect/tension differ from `B → A`).
2. Memory summaries are generated from the source character's perspective and stored under the source → target relationship.

For `rescued` and `healed` events, both directions are stored so the rescuer and the rescued each have a distinct memory.

## Importance

Approximate scale:

- 1–3: minor (e.g. `shared_success` with importance 2).
- 4–6: remembered (e.g. `healed` with magnitude 6 → importance 6).
- 7–8: important (e.g. `rescue`, `critical_injury`, `abandoned`).
- 9–10: strongly retained (e.g. `casualty` death, `major_failure` with party death).

`casualty` importance scales with `magnitude` (death = 10, serious injury = 8, injury = 5). `healed` importance scales with heal amount.

## Recency / Relevance

`projectMemoriesForNarrative` scores each memory as:

```
score = importance + (token overlap with focus × 2) + recency bonus + involved-character bonus
```

- **Token overlap**: summary tokens matched against focus + request title + briefing + public tags.
- **Recency bonus**: up to `1.5` for events within the last few days.
- **Involved-character bonus**: `+2` if the memory belongs to a scene character (character memory) or both source/target are in the scene (relationship memory).

## Memory Projection

- Character context budget: `CHARACTER_MEMORY_CONTEXT_BUDGET = 2` per scene character.
- Pair context budget: `RELATIONSHIP_MEMORY_CONTEXT_BUDGET_PER_PAIR = 2`.
- `buildExpeditionNarrativeContext` calls `projectMemoriesForNarrative` when `dayNumber` is supplied (from `deriveResolveCandidates`).
- Selected memories are attached to:
  - `ExpeditionNarrativeContext.characterMemories` and `relationshipMemories`.
  - `CharacterNarrativeContext.memories` for per-character background display.
- `NarrativeCandidate` remains lightweight: only selected `NarrativeMemoryContextItem` summaries are stored.

## Memory Persistence

- `applyExpeditionMemory` is called from `resolveCampaignDay` after relationship updates.
- `CampaignParty.characterMemories`, `sharedExpeditionCounts`, and `memberRelationships[].sharedExpeditions` are persisted in campaign save state.
- `buildTavernDay` copies `characterMemories` and `memberRelationships` into `TavernParty` for UI display.
- Old saves without these fields load as empty (`??` fallback) and are initialized on first update.

## Narrative Prompt Integration

- `NARRATIVE_PROMPT_VERSION` bumped to `v9`.
- Added `=== RELEVANT MEMORIES ===` section after `PARTY RELATIONSHIPS`.
- Memory guard added:
  - “Relevant memories describe confirmed past events.”
  - “Do not invent additional details about those past events.”
  - “Do not rewrite or expand the memory into a new backstory.”
  - “Do not force characters to discuss a memory explicitly.”
  - “Avoid repeated ‘we did this before’ dialogue.”
- Per-character `CHARACTER BACKGROUND` now includes `関連記憶` (selected memory summaries).
- `PARTY RELATIONSHIPS` line also shows shared expedition count and limits recent events to 3.

## Memory Noise Control

- Routine travel logs do not generate `RelationshipEvent`s or memories.
- `shared_success` is kept at low importance (2) so it does not crowd out high-importance events.
- Per-character and per-pair context budgets prevent memory spam in the prompt.
- `RELEVANT MEMORIES` are selected by current scene relevance, not dumped in bulk.

## Save Compatibility

- Old saves missing `characterMemories`, `sharedExpeditionCounts`, or `memberRelationships` load without errors.
- `applyExpeditionMemory` and `applyCharacterRelationshipChanges` initialize missing structures.
- `TavernParty` receives optional `characterMemories` and `memberRelationships` for backward compatibility.

## Tests

- `src/core/narrative/memory.test.ts` (6 tests):
  - directional rescue memory with high importance.
  - old-save initialisation.
  - shared expedition counts.
  - relevant relationship memory projection.
  - irrelevant memory exclusion.
  - old high-importance memory outranking recent low-importance memory.
- `scripts/phase7-4-memory-smoke.ts` covers the eight acceptance cases (A–H):
  - A: rescue memory B → A is high importance.
  - B: directionality of summaries.
  - C: conflict memory is negative/mixed.
  - D: routine travel produces no memory.
  - E: relevant projection for injured character.
  - F: irrelevant memory not projected.
  - G: old high-importance outranks recent low-importance.
  - H: old save without memory loads normally.

## Smoke Results

```text
$ npx tsx scripts/phase7-4-memory-smoke.ts
Case A PASS: B -> A rescue memory is high importance
Case B PASS: directional memories differ
Case C PASS: conflict memory is negative/mixed
Case D PASS: routine travel produces no memory
Case E PASS: relevant memories projected for current scene
Case F PASS: irrelevant memories not projected
Case G PASS: old high-importance memory outranks recent low-importance memory
Case H PASS: old save without memory loads normally
```

## Known Limitations

- `rescued` relationship events are currently generated from synthetic/manual `RelationshipEvent` inputs. The existing `projectRelationshipEvents` does not yet extract member-to-member rescue actions from battle logs; the architecture accepts them once such events are emitted.
- Full memory consolidation/compression of repeated minor `shared_success` memories is implemented only via per-pair limits and importance scoring; explicit coalescence into derived summaries is future work.
- Active vs archived memory tiers are simplified: persistent arrays are capped at 20 and context selection filters at 2 per pair. A future phase can add explicit archival and decay.

## Future Character Arc Work

- Phase 7.4 intentionally observes memories only. Phase 7.5+ may derive slow-burn character arcs from repeated memory patterns, but must still avoid deterministic personality or romance auto-progression.
- Romantic attraction is stored as a directional optional stat and may be referenced in narrative context, but it is not automatically changed by rescue/heal/familiarity events.

## Verification Summary

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test` — 866 tests pass
- `npm run build` — pass
- `npm run test:expedition-regression` — 22/22 pass
- 30-day zero-call audit — 69 candidates / 0 AI calls
- `npx tsx scripts/phase7-0-3-compression-audit.ts` — pass
- `npx tsx scripts/phase7-1-timeline-audit.ts` — 0 leakage
- Phase 7.2 / 7.2.1 / 7.2.2 / 7.3 smokes — pass
- `npx tsx scripts/phase7-4-memory-smoke.ts` — pass
