# Phase 7.2 — Character-Driven Narrative Direction

## Goal

Make generated expedition prose feel like a story about the actual adventurers
rather than a digest of events, while keeping every simulation fact immutable.

This is done with three new deterministic layers:

1. `CharacterNarrativeProfile` per adventurer (optional; backward compatible).
2. Directional `CharacterRelationship` / `RelationshipMemory` between party members
   (optional; updated only by game logic, never by the LLM).
3. `NarrativeDirector` that selects `mainScenes`, `secondaryScenes`, and
   `montageBeatIds` from the precomputed `NarrativeTimeline`.

One expedition candidate = one AI generation call.

## Scope

Only the narrative presentation layer and the deterministic relationship
projection layer changed.

- `src/core/models/types.ts`
- `src/core/narrative/types.ts`
- `src/core/narrative/characterProfile.ts` (new)
- `src/core/narrative/characterRelationships.ts` (new)
- `src/core/narrative/director.ts` (new)
- `src/core/narrative/context.ts`
- `src/core/narrative/prompt.ts`
- `src/core/narrative/characterProfile.test.ts` (new)
- `src/core/narrative/relationships.test.ts` (new)
- `src/core/narrative/director.test.ts` (new)
- `src/core/narrative/narrative.test.ts` (v5 prompt assertions)
- `src/core/tavern/campaign/types.ts`
- `src/core/tavern/campaign/campaign.ts`
- `src/core/tavern/campaign/generators.ts`
- `scripts/phase7-2-narrative-smoke.ts` (new)

No gameplay, simulation, provider, candidate trigger, priority, or cost-control
changes were made.

## Character Narrative Profile

```ts
export interface CharacterNarrativeProfile {
  temperament?: string
  socialStyle?: string
  values?: string[]
  flaws?: string[]
  fears?: string[]
  habits?: string[]
  speechStyle?: string
}
```

- Stored as an optional field on `Adventurer.narrativeProfile`.
- If absent, `deriveCharacterNarrativeProfile(member)` builds a deterministic
  fallback from `role`, `personality`, and `traits`.
- The fallback never invents past, family, or concrete actions; it only turns
  existing stats into narrative cues (`守るべき者を失うこと`, `孤立して囲まれること`,
  `金銭に弱い`, etc.).
- `formatNarrativeProfile` renders a single Japanese line for the prompt.

## Party Character Relationships

```ts
export interface CharacterRelationship {
  sourceCharacterId: string
  targetCharacterId: string
  affinity: number // 0-100
  trust: number
  respect: number
  tension: number
  tags?: string[]
  recentEvents?: RelationshipMemory[]
}

export interface RelationshipMemory {
  expeditionId?: string
  type?: string
  summary: string
  importance?: number
}
```

- Stored as an optional `CampaignParty.memberRelationships` map keyed
  `sourceId:targetId`.
- `initializePartyMemberRelationships` creates default 50/50/50/50 records for
  every ordered pair when a party is generated.
- `buildRelationshipSnapshot` converts the map into prompt-ready
  `CharacterRelationshipSnapshot` objects that include source/target names and
  at most three recent memories.
- Relationship values are **not** read or written by the LLM; they are computed
  deterministically from expedition logs and outcomes.

## Relationship Event Projection

`projectRelationshipEvents(state, outcome)` scans `ExpeditionState` and the final
outcome to build a list of `RelationshipEvent`s:

- `healed` — `firstAid` log with `hpHeal` effects.
- `rescued` — place for future rescue-of-party-member mechanics.
- `protected` — place for future protection mechanics.
- `conflict` — `retreatDiagnostic` where a retreat proposal was rejected.
- `shared_success` — all ordered pairs of survivors on `completeSuccess`/`success`.
- `shared_failure` — all ordered pairs of survivors on `failedObjective`/
  `forcedRetreat`/`lostExpedition`.
- `casualty` — death / serious injury / incapacitation from `casualty` logs,
  battle records, and the final `casualties` list.

`applyRelationshipEvents` mutates the `memberRelationships` map with small,
bounded deltas (clamped 0-100) and appends a `RelationshipMemory` to each affected
pair. `applyCharacterRelationshipChanges` is called from
`resolveCampaignDay` after the expedition result is applied, so relationships
persist across days but never affect the simulation outcome.

## Narrative Director

`determineNarrativeDirection(timeline, members, relationships)` scores every
`NarrativeTimelineBeat`:

- Starts with `beat.importance`.
- Adds profile-keyword matches (fear, flaw, value, habit, temperament, etc.)
  when the beat text contains a character's profile term.
- Adds relationship-band boosts when the beat involves a pair with notable
  affinity/trust/respect/tension (`>=60` or `<=40`).

Then it walks the timeline once and assigns beats to:

- `mainScenes` (top-scored beats, up to 2, up to 2 consecutive beats each).
- `secondaryScenes` (next tier, up to 2, up to 2 consecutive beats each).
- `montageBeatIds` (remaining beats with `importance >= 40`).

This gives the LLM explicit guidance on which moments to expand and which to
compress into a montage.

## Prompt v5

`NARRATIVE_PROMPT_VERSION = 'v5'`.

User prompt sections for expeditions:

```text
=== EXPEDITION SUMMARY ===
=== CURRENT REQUEST ===
=== PARTY ===
=== CHARACTERS ===
=== PARTY RELATIONSHIPS ===
=== NARRATIVE DIRECTION ===
=== EXPEDITION TIMELINE ===
=== CONFIRMED OUTCOME FACTS ===
=== DETAILS NOT RECORDED ===
=== NARRATIVE HINTS ===
=== WRITING INSTRUCTIONS ===
```

- `EXPEDITION SUMMARY` is a short headline; the outcome is rendered with the
  Japanese label from `CONFIRMED OUTCOME FACTS`, not the raw enum string.
- `CHARACTERS` lists every member with `Personality Hints` and the
  `Narrative Profile`.
- `PARTY RELATIONSHIPS` prints one directed line per pair using qualitative
  bands (`高い` / `普通` / `低い`) plus recent memory summaries.
- `NARRATIVE DIRECTION` lists `Main Scenes`, `Secondary Scenes`, and
  `Montage Beat IDs`.

System prompt additions:

- Three-tier information model:
  - Tier 1: Immutable Facts (`EXPEDITION SUMMARY`, `CONFIRMED OUTCOME FACTS`,
    `EXPEDITION TIMELINE`) — must not be changed.
  - Tier 2: Character Interpretation (`CHARACTERS` profiles, `PARTY
RELATIONSHIPS`) — reference for reaction, speech, and relationship staging.
  - Tier 3: Narrative Embellishment — temporary expressions, gestures, pacing.
- Explicit `Allowed Invention` and `Forbidden Invention` lists.
- Writing instructions now tell the model to expand `MAIN SCENES`, touch
  `SECONDARY SCENES` briefly, and skip `MONTAGE` in one sentence.

Character event prompts also include the new `Members:` and `Party Relationships:`
sections when available.

## Backward Compatibility

- `narrativeProfile` is optional on `Adventurer`; parties without it receive the
  deterministic fallback.
- `memberRelationships` is optional on `CampaignParty`; older parties that lack
  it are initialised on first relationship update.
- Existing `NarrativeCandidate` and `ExpeditionNarrativeContext` consumers are
  unaffected because all new fields are optional.

## Test coverage

`src/core/narrative/characterProfile.test.ts` verifies:

- Profile fallback does not mutate the adventurer.
- Explicit `narrativeProfile` is used when present.
- Role-based fear mapping.
- Bravery/caution temperament mapping.
- `formatNarrativeProfile` output.

`src/core/narrative/relationships.test.ts` verifies:

- `healed`, `casualty`, `shared_success`, `shared_failure` event projection.
- `healed`, `rescued`, `shared_success`, `shared_failure`, `casualty`
  relationship updates.
- `applyCharacterRelationshipChanges` initialises and updates a party.

`src/core/narrative/director.test.ts` verifies:

- Casualty beats become main scenes.
- Healing/rescue beats become main or secondary scenes.
- Trivial movement beats are deprioritised to montage.
- Relationship-relevant beats score higher than neutral beats.
- Beats matching a character fear score higher.

`narrative.test.ts` was updated for v5 prompt sections and version.

`scripts/phase7-2-narrative-smoke.ts` prints a complete v5 expedition prompt
with explicit profiles, directed relationships, and a `NarrativeDirection`
(no AI call).

## Verification results

```text
npm run typecheck                     PASS
npm run lint                          PASS
npm run test                          58 files / 835 tests PASS
npm run build                         PASS
npm run test:expedition-regression    22/22 PASS
npx tsx scripts/phase7-0-narrative-audit.ts   69 candidates / 0 AI calls PASS
npx tsx scripts/phase7-0-3-compression-audit.ts   PASS
npx tsx scripts/phase7-1-timeline-audit.ts   0 leakage violations PASS
npx tsx scripts/phase7-1-smoke.ts       PASS
npx tsx scripts/phase7-2-narrative-smoke.ts   PASS
```

## Out of scope (per spec)

- Romance system, relationship breakup, party disband, tavern internal events,
  automatically generated personalities, AI-updated relationships, long-term
  story arcs, character-specific quests, narrative-output parsing that updates
  game state, and gameplay/combat balance changes.
