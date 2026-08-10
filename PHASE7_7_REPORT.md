# Phase 7.7 Report — Downtime Relationship Events

## Overview

Phase 7.7 adds deterministic downtime relationship events for parties and characters that are **not** on expedition. The system simulates small, everyday tavern life interactions and applies tiny, deterministic relationship deltas. Events are independent of the player-selected AI narrative layer and do not require AI calls unless the player explicitly opens a scene. When a scene is opened, a short narrative is generated lazily from structured event facts; generated text is cached and never feeds back into game state.

## Architecture

```
Campaign Day Resolution
  → Expedition processing
    → Downtime resolution for non-dispatched parties
      → Seeded pair/event selection
        → Relationship delta application
          → Optional relationship memory creation
            → Arc signal update
              → Relationship milestone update
                → UI snapshot (today's events only)
```

Downtime events are driven entirely by `SeededRng` with seeds derived from `campaignSeed:day:partyId:downtime`. The same campaign state reprocessed on the same day produces identical results and no duplicates.

## Core Types

New types in `src/core/narrative/types.ts`:

- `DowntimeEventType`: shared_meal, casual_conversation, quiet_company, equipment_help, planning_together, shared_chore, minor_argument, annoying_habit, misunderstanding, resource_disagreement, competitive_activity, mixed_working_session, recovery_assistance, personal_space, no_notable_event, plus solo flavor types.
- `DowntimeEventCategory`: `relationship` | `flavor`.
- `DowntimeRelationshipDelta`: source/target, optional affinity/trust/respect/tension/romanticAttraction.
- `DowntimeEvent`: id, day, type, participants, valence, importance, relationshipDeltas, memory eligibility, narrative key, narrativeStatus (`unseen` | `generated` | `viewed`), generatedText, fallbackSummary.

`CampaignParty` and `TavernParty` gain optional `downtimeEvents`. Old saves load with the field absent and are treated as empty.

## Event Definitions

Event definitions live in `src/core/narrative/downtime.ts`:

| Type                                                 | Category     | Valence  | Memory | Delta                                                         |
| ---------------------------------------------------- | ------------ | -------- | ------ | ------------------------------------------------------------- |
| `shared_meal`                                        | relationship | positive | no     | affinity +1 (mutual)                                          |
| `casual_conversation`                                | relationship | positive | no     | affinity +1 (mutual)                                          |
| `quiet_company`                                      | relationship | positive | no     | affinity +1 (mutual)                                          |
| `equipment_help`                                     | relationship | positive | yes    | helper→helped affinity +1; helped→helper trust +1, respect +1 |
| `planning_together`                                  | relationship | positive | yes    | trust +1, respect +1 (mutual)                                 |
| `shared_chore`                                       | relationship | positive | no     | affinity +1, trust +1 (mutual)                                |
| `minor_argument`                                     | relationship | negative | yes    | tension +2, affinity -1 (mutual)                              |
| `annoying_habit`                                     | relationship | negative | no     | annoyed→annoyer tension +1; annoyer→annoyed affinity -1       |
| `misunderstanding`                                   | relationship | negative | yes    | trust -1, tension +1 (mutual)                                 |
| `resource_disagreement`                              | relationship | negative | yes    | tension +2, respect -1 (mutual)                               |
| `competitive_activity`                               | relationship | mixed    | yes    | respect +1, tension +1 (mutual)                               |
| `mixed_working_session`                              | relationship | mixed    | yes    | trust +1, tension +1 (mutual)                                 |
| `recovery_assistance`                                | relationship | positive | yes    | helper→helped respect +1; helped→helper trust +2, affinity +1 |
| `unexpected_common_ground`                           | relationship | positive | yes    | affinity +1, respect +1 (mutual)                              |
| `personal_space` / `no_notable_event` / solo flavors | flavor       | neutral  | no     | no delta                                                      |

Deltas are clamped to `[0, 100]`. Romantic attraction is never changed by downtime events in Phase 7.7 (`romanticDeltaEnabled` defaults to `false`).

## Selection Algorithm

`resolveDowntimeForParty(party, dayNumber, campaignSeed, config)`:

1. Returns `[]` if downtime events already exist for `dayNumber` (idempotency).
2. Budget: at most one relationship-changing event per party per day (`relationshipEventChance`).
3. If a relationship event occurs:
   - Build all ordered pairs of eligible members (incapacitated members excluded).
   - Compute per-pair weight from current relationship stats, recent pair selection penalty (`pairRepetitionWindowDays`), and active arc signals / milestones.
   - `weightedPick` selects one pair.
   - Compute per-event weights for relationship types using base weight, valence fit, relationship stats, active arc/milestone hints, event cooldown (`eventCooldownDays`), and state (`idle`/`recovering`).
   - `weightedPick` selects one type.
4. Flavor events: if `flavorEventChance` succeeds, `rng.integer(0, maxFlavorEvents)` solo or small-group flavor events are selected. At most `maxFlavorEvents` (default 2).

All rolls use `SeededRng`. Weights can be overridden for tests, but production uses the defaults.

## Arc / Milestone Integration

After downtime deltas and optional memories are applied, `resolveDowntimeForCampaign` calls `updateArcSignals` and `updateRelationshipMilestones` for the party if any relationship event occurred. This means repeated small tavern support can feed `growing_reliance`, `recurring_support`, etc., and ultimately promote milestones such as `established_mutual_reliance` when combined with shared expedition history.

Arcs and milestones never directly produce relationship deltas; only memories and pre-existing stats do.

## Narrative Generation

`DOWNTIME_PROMPT_VERSION = "v1"` lives in `src/core/narrative/downtime.ts` and is completely separate from `NARRATIVE_PROMPT_VERSION`.

`buildDowntimePrompt(event, party)` produces:

- `=== DOWNTIME EVENT ===`: type, participants, valence.
- `=== CHARACTERS ===`: name, role, rank, gender, species, country of origin.
- `=== RELATIONSHIP CONTEXT ===`: directional affinity/trust/respect/tension for the pair.
- `=== NARRATIVE RULES ===`: short scene (300–700 Japanese chars), immutable identity, no fact invention, show don't explain, no abstract relationship summaries, gendered pronoun guard.

`generateDowntimeNarrative(event, party, provider)`:

- Returns cached `generatedText` if `narrativeStatus === 'generated'`.
- Calls the provider only on first open.
- On provider absence or failure, uses a deterministic `fallbackSummary`.
- Never writes generated text back into stats, memories, or events.

## UI

`PartyCard.tsx` shows a `今日の様子` block when `party.downtimeEvents` contains entries. `TavernParty.downtimeEvents` is filtered to the current day during `syncCurrentDayParties` and `buildTavernDay`, so the UI displays only today's events. Events are marked `viewed` on opening; unopened events remain `unseen`.

## Integration Points

- `src/core/tavern/campaign/campaign.ts`: `resolveCampaignDay` calls `resolveDowntimeForCampaign` after expedition processing and before syncing the current day snapshot.
- `src/core/tavern/campaign/campaign.ts`: `syncCurrentDayParties` now copies `characterMemories`, `memberRelationships`, `arcSignals`, `relationshipMilestones`, and `downtimeEvents` (filtered to `dayNumber`) into `TavernParty`.
- `src/core/tavern/campaign/generators.ts`: `buildTavernDay` filters `downtimeEvents` to `dayNumber` when constructing planning-day snapshots.

## Verification

### Unit Tests

`src/core/narrative/downtime.test.ts` covers:

- Expedition exclusion (delegated to smoke), idempotency, determinism, budget.
- Positive (`shared_meal`), negative (`minor_argument`), and mixed (`competitive_activity`) deltas.
- No romantic attraction change by default.
- Memory eligibility (`shared_meal` no memory, `equipment_help` memory).
- Arc integration from repeated support.
- Milestone integration from downtime-driven arcs + shared history.
- Prompt contains `DOWNTIME_PROMPT_VERSION` and required sections/guards.
- Lazy narrative generation, caching, and fallback on provider failure.

### Smoke Script

`scripts/phase7-7-downtime-relationship-smoke.ts` validates cases **A–T**:

A. Dispatched party excluded.  
B. Idle party eligible.  
C. Recovering party eligible (with physical-event exclusion).  
D. Deterministic selection.  
E. Idempotent re-resolution.  
F. Positive event.  
G. Negative event.  
H. Mixed event.  
I. Event budget (≤1 relationship, ≤2 flavor).  
J. No-event is normal.  
K. Minor shared meal is not memory-ized.  
L. Important downtime event becomes memory.  
M. Downtime support feeds arc signal.  
N. Downtime-driven arc + shared history promotes milestone.  
O. Zero AI calls when scene unseen.  
P. Lazy generation on first open.  
Q. Reopen uses cached text.  
R. Provider failure uses fallback.  
S. Romance guard: shared meal with compatible profile does not auto-raise romanticAttraction.  
T. Old save without `downtimeEvents` loads and resolves.

### Regression Suite

Run with `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:coverage`, `npm run build`, `npm run test:expedition-regression`, 30-day zero-call audit, compression/timeline audits, and Phase 7.2–7.6 smoke scripts.

## Acceptance Criteria Summary

- Non-expedition parties are downtime targets; expedition parties are not.
- Resting / idle / recovering parties are handled; recovering parties skip physically excluded events.
- Selection is deterministic and idempotent on day reprocessing.
- Event budget exists (≤1 relationship, ≤2 flavor, no-event normal).
- Positive / negative / mixed / no-event / flavor-only outcomes exist.
- Downtime deltas are smaller than expedition deltas (±1–3).
- Pair weights vary by relationship state and arc/milestone context; no universal pair roll.
- High trust still allows negative events; high tension still allows positive events.
- Repeated pair / event penalties and cooldowns exist.
- Minor events are not over-memoryized.
- Downtime memories can feed arc evidence and milestones through normal routes.
- RomanticProfile alone does not generate romantic deltas.
- RelationshipStatus is not changed by downtime.
- Game state is determined and applied before scene viewing; AI calls are zero by default.
- Lazy narrative is generated once, cached, and falls back on failure.
- Downtime prompt is separate from expedition prompt and includes identity + abstract-summary guards.
- Old saves without `downtimeEvents` remain compatible.
- UI exposes unopened downtime events without forcing viewing.
