# Phase 7.5 Report — Character Arc & Relationship Evolution

## Overview

Phase 7.5 adds deterministic, evidence-driven relationship arc signal detection on top of the persistent memory and relationship layer built in Phase 7.4. Arc signals are observations of long-term trends, not relationship facts or labels. They are derived entirely from structured memory and relationship data, never from LLM narrative output, and they do not feed back into gameplay stats.

## Architecture

```
Expedition Simulation
  → Structured Events
    → Relationship Events
      → Relationship Update
        → Persistent Memories
          → Arc Evidence Projection
            → Arc Signal Detection
              → Persistent Arc Signals
                → Narrative Context Projection
                  → Prompt v10 (RELATIONSHIP ARCS)
```

- **Arc Evidence**: counts, memory IDs, relationship stats, and shared expedition history per character pair.
- **Arc Signal**: a typed, weighted, directional observation (`growing_reliance`, `recurring_conflict`, `shared_failure_bond`, `romantic_interest_possible`, etc.).
- **Narrative Arc**: a selected, scene-relevant summary passed to the prompt with strict "show, don't explain" guards.

## Core Types

New types in `src/core/narrative/types.ts`:

- `CharacterArcSignalType`: `growing_reliance`, `growing_trust`, `recurring_support`, `comfortable_familiarity`, `comfortable_teasing`, `protective_pattern`, `recurring_conflict`, `decision_friction`, `eroding_trust`, `growing_tension`, `avoidance_pattern`, `shared_failure_bond`, `shared_success_bond`, `unresolved_debt`, `reciprocal_support`, `romantic_interest_possible`, `repeated_injury`, `repeated_success`, `repeated_failure`, `other`.
- `ArcSignalStatus`: `emerging` | `established` | `fading`.
- `ArcSignalDirection`: `positive` | `negative` | `mixed` | `neutral`.
- `CharacterArcSignal`: `id`, `type`, `sourceCharacterId?`, `targetCharacterId?`, `characterIds[]`, `strength` (0–100), `confidence` (0–100), `supportingMemoryIds`, `firstDetectedDay`, `lastUpdatedDay`, `status`, `direction`.
- `NarrativeArcSignal`: lightweight projection containing `type`, `summary`, `strength`, `confidence`, `status`, `direction`, and character IDs.

`CampaignParty` and `TavernParty` gain an optional `arcSignals: CharacterArcSignal[]` array for backward compatibility.

## Arc Signal Detection

`updateArcSignals(party, day)` in `src/core/narrative/arcSignals.ts` recomputes candidate signals from:

- `party.characterMemories` (personal repeated injury / success / failure).
- `party.memberRelationships[*].recentEvents` (directional relationship memories).
- `party.sharedExpeditionCounts` and relationship stats (`affinity`, `trust`, `tension`, `romanticAttraction`).

It merges fresh candidates with the existing `party.arcSignals` array to preserve `firstDetectedDay`, support `fading` status when counter-evidence reduces strength, and avoid duplicate IDs.

### Signal Logic Examples

| Signal                                                      | Trigger                                                                                | Direction       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| `growing_reliance`                                          | source receives 2+ positive memories from target and trust/shared expeditions are high | source → target |
| `recurring_support`                                         | target repeatedly supports source but reliance trend is not strong enough              | source → target |
| `growing_trust`                                             | repeated positive experience + high trust + low tension                                | source → target |
| `protective_pattern`                                        | 2+ rescue/protect events or one high-importance rescue                                 | source → target |
| `recurring_conflict`                                        | 2+ conflict/disagreement memories or bilateral conflict                                | negative        |
| `decision_friction`                                         | single conflict with no later positive counter-evidence                                | mixed/negative  |
| `eroding_trust`                                             | repeated negative events from target + low trust + high tension                        | source → target |
| `growing_tension`                                           | high tension + conflict history                                                        | negative        |
| `shared_success_bond`                                       | 2+ shared successes + trust ≥ 55 + low tension                                         | positive        |
| `shared_failure_bond`                                       | shared failure followed by continued cooperation or affinity ≥ 55                      | positive        |
| `unresolved_debt`                                           | target helped source 2+ times, source never reciprocated, trust/affinity high          | mixed/positive  |
| `romantic_interest_possible`                                | source → target `romanticAttraction` ≥ 45 and shared positive history exists           | source → target |
| `repeated_injury` / `repeated_success` / `repeated_failure` | 2+ personal memories of the corresponding type                                         | personal        |

`strength` is capped at 100 and scaled by memory importance, recency, relationship stats, and shared expedition count. `confidence` is separate and grows with the number of supporting memories and repeated pairing.

## Fading and Counter-Evidence

When an existing signal is recomputed with lower strength, it transitions to `fading` if the drop is large enough and strength remains above the emerging threshold. Signals that fall below the threshold or age beyond the fading window are dropped. New positive memories after a conflict, for example, can cause a `recurring_conflict` signal to fade.

## Narrative Projection

`projectArcSignalsForNarrative` selects signals that involve the current scene characters. It enforces:

- at most 2 signals per pair/direction,
- a party total of 3–5 signals,
- sorting by a relevance score combining strength, confidence, token overlap with focus/request, scene-character involvement, and recency.

Selected signals are exposed as `NarrativeArcSignal` summaries in `ExpeditionNarrativeContext.relationshipArcs`.

## Prompt v10

`NARRATIVE_PROMPT_VERSION` is now `'v10'`. The prompt includes a new `=== RELATIONSHIP ARCS ===` section:

- Each signal is printed as a Japanese trend sentence plus `status / strength / confidence` metadata.
- The writing instructions include:
  - "Arc signals describe long-term relationship trends, not facts to announce."
  - "Do not state an arc label or relationship development directly."
  - "Let arcs influence who a character listens to, who they look toward first, how quickly they accept advice, how disagreement is phrased, and how familiar routine coordination feels."
  - "Do not force the arc into every scene."

## UI

`PartyCard.tsx` displays a minimal "最近の関係傾向" section. It shows up to 4 established/emerging arc summaries per party, using deterministic `arcSignalSummary` labels. No relationship titles such as 親友 / 恋人 / 宿敵 are used.

## Integration

- `campaign.ts` calls `updateArcSignals(party, dayNumber)` immediately after `applyExpeditionMemory`.
- `context.ts` calls `projectArcSignalsForNarrative` during context building and attaches `relationshipArcs`.
- `generators.ts` maps `CampaignParty.arcSignals` into the `TavernParty` snapshot.
- Old saves load with `arcSignals = []` because the field is optional.

## Determinism & Constraints

- Arc signals are derived from structured data only; no LLM output is parsed or stored.
- Arc signals do not modify relationship stats, gameplay, or simulation behavior.
- Directionality is preserved per character pair.
- A single event cannot establish a strong arc; repeated evidence is required.
- No labels like 親友, 恋人, or 宿敵 are assigned.

## Verification

| Check                                     | Result                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `npm run typecheck`                       | PASS                                                                      |
| `npm run lint`                            | PASS                                                                      |
| `npm run test`                            | 874 tests PASS                                                            |
| `npm run test:coverage`                   | PASS (statements 90.37%, branches 82.42%, functions 92.33%, lines 92.08%) |
| `npm run build`                           | PASS                                                                      |
| `npm run test:expedition-regression`      | 22/22 PASS                                                                |
| 30-day zero-call audit                    | 69 candidates / 0 AI calls                                                |
| Compression audit                         | PASS                                                                      |
| Timeline audit                            | 0 leakage violations                                                      |
| Phase 7.2/7.2.1/7.2.2 smoke               | PASS                                                                      |
| Phase 7.3 character generation smoke      | PASS                                                                      |
| Phase 7.4 memory smoke                    | PASS                                                                      |
| Phase 7.5 character arc smoke (cases A–J) | PASS                                                                      |

## Files Changed

- `src/core/narrative/types.ts` — arc signal types and context fields.
- `src/core/narrative/arcSignals.ts` — new detection, projection, and summary logic.
- `src/core/narrative/arcSignals.test.ts` — unit tests.
- `src/core/narrative/context.ts` — attaches `relationshipArcs` to narrative context.
- `src/core/narrative/prompt.ts` — v10 prompt with RELATIONSHIP ARCS section.
- `src/core/narrative/narrative.test.ts` — prompt version expectation updated to v10.
- `src/core/tavern/campaign/campaign.ts` — calls `updateArcSignals` after memory application.
- `src/core/tavern/campaign/types.ts` — `CampaignParty.arcSignals`.
- `src/core/tavern/types.ts` — `TavernParty.arcSignals`.
- `src/core/tavern/campaign/generators.ts` — maps `arcSignals` into tavern day state.
- `src/ui/tavern/PartyCard.tsx` — minimal "最近の関係傾向" display.
- `scripts/phase7-5-character-arc-smoke.ts` — smoke test cases A–J.
- `PHASE7_5_REPORT.md` — this report.
