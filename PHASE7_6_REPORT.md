# Phase 7.6 Report — Relationship Milestones & Narrative Identity Guards

## Overview

Phase 7.6 adds deterministic relationship milestone detection on top of Phase 7.5 arc signals. A milestone is an achieved intermediate relationship state backed by persistent history, not a social label such as 親友, 恋人, or 宿敵. It is derived entirely from structured memory, relationship state, and shared expedition history. Phase 7.6 also hardens narrative identity guards and suppresses abstract relationship summaries.

## Architecture

```
Expedition
  → Structured Events
    → Relationship Update
      → Persistent Memory
        → Arc Evidence
          → Arc Signals
            → Milestone Candidate Detection
              → Milestone Promotion
                → Persistent Relationship Milestones
                  → Narrative / UI Context
```

Milestones are not parsed from LLM narrative output. They are not generated from single events, and they do not feed back into relationship stats, gameplay bonuses, or personality changes.

## Core Types

New types in `src/core/narrative/types.ts`:

- `RelationshipMilestoneStatus`: `active` | `legacy`.
- `RelationshipMilestoneType`: `established_mutual_reliance`, `established_directional_reliance`, `established_working_rhythm`, `established_reciprocal_support`, `established_trusted_friction`, `established_decision_friction`, `established_strained_trust`, `established_shared_resilience`, `persistent_romantic_interest`.
- `RelationshipMilestone`: `id`, `type`, `characterIds`, optional `sourceCharacterId`/`targetCharacterId`, `achievedDay`, `status`, `strength`, `confidence`, `supportingArcSignalIds`, `supportingMemoryIds`, `deactivatedDay`.
- `RelationshipMilestoneCandidate`: transient candidate with `score`, `confidence`, `eligible` flag.
- `NarrativeRelationshipMilestone`: lightweight projection with `summary`.

`CampaignParty` and `TavernParty` gain optional `relationshipMilestones` for backward compatibility. Old saves load with an empty array.

## Milestone Detection

`updateRelationshipMilestones(party, day)` in `src/core/narrative/milestones.ts` recomputes candidates from:

- Existing `CharacterArcSignal`s.
- Directional `memberRelationships` and `recentEvents`.
- `sharedExpeditionCounts`.
- Relationship stats (`trust`, `tension`, `romanticAttraction`, `affinity`).

Promotion thresholds are configurable in `MilestoneThresholdConfig` (default `minSignalStrength = 55`, `minSignalConfidence = 60`, `minSharedExpeditions = 3`, `minSupportingMemories = 2`). Major events can reduce the shared-expedition requirement but do not bypass the multi-memory requirement.

### Milestone Logic Examples

| Milestone                          | Trigger                                                                               | Direction       |
| ---------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| `established_mutual_reliance`      | both `growing_reliance` signals established, shared expeditions sufficient            | mutual          |
| `established_directional_reliance` | one `growing_reliance` established, reverse not established                           | source → target |
| `established_working_rhythm`       | `comfortable_familiarity` established + repeated cooperation + no dominant conflict   | pair            |
| `established_reciprocal_support`   | `reciprocal_support` established + multiple support memories                          | pair            |
| `established_trusted_friction`     | `growing_reliance` + `recurring_conflict` both established, high trust + high tension | pair            |
| `established_decision_friction`    | `decision_friction` or repeated conflict/disagreement memories                        | pair            |
| `established_strained_trust`       | `eroding_trust` established, trust still moderate/high, negative memories             | pair/source     |
| `established_shared_resilience`    | `shared_failure_bond` established + later cooperation + affinity maintained           | pair            |
| `persistent_romantic_interest`     | `romantic_interest_possible` established + `romanticAttraction` ≥ 60 + shared history | source → target |

Multiple milestones for the same pair can coexist, and `active` / `legacy` are tracked separately.

## Legacy / Deactivation

When an existing active milestone no longer has supporting evidence, it transitions to `legacy` and records `deactivatedDay`. The achievement history is preserved. Counter-evidence requires a sustained pattern rather than a single event.

## Idempotency & Duplicate Prevention

Milestone keys combine `type` + `sourceCharacterId`/`targetCharacterId` (or sorted `characterIds`) so the same campaign state re-evaluated on a later day does not create duplicates. Existing active milestones are updated in place if still supported.

## Narrative Projection

`projectRelationshipMilestonesForNarrative` selects at most one milestone per pair/direction and at most three total, prioritizing scene-character overlap, recency, strength, confidence, and token overlap with the narrative focus. It returns `NarrativeRelationshipMilestone` summaries.

## Prompt v11

`NARRATIVE_PROMPT_VERSION` is now `'v11'`. Changes:

- New `=== RELATIONSHIP MILESTONES ===` section with behavioral guidance and the rule that milestones are not exposition.
- `CHARACTER BACKGROUND` header now explicitly states that `name`, `gender`, `species`, and `country of origin` are immutable and authoritative.
- Character context lines now include `name` and `gender` explicitly.
- Writing instructions add:
  - `CHARACTER IDENTITY IS IMMUTABLE`.
  - `JAPANESE PRONOUNS` rule (prefer name or omission; avoid conflicting 彼/彼女; respect nonbinary/other).
  - `DO NOT SUMMARIZE RELATIONSHIP DEVELOPMENT` with explicit banned Japanese and English phrases.
  - `MILESTONES ARE NOT EXPOSITION`.
  - Gender is not personality.
  - Romantic interest is not relationship status.

## Narrative Quality Audit

`src/core/narrative/qualityAudit.ts` provides non-fatal, warning-only audits:

- `auditNarrativeIdentityConsistency(text, contexts)` detects mismatched gendered pronouns (`彼`/`彼女`) relative to supplied character name/gender in the same or immediately preceding sentence.
- `auditAbstractArcSummary(text)` flags forbidden abstract relationship summary phrases.

These are warnings, not hard failures, to avoid false positives on Japanese `彼女` (which can also mean girlfriend) and legitimate contextual uses.

## UI

`PartyCard.tsx` shows a minimal "関係の節目" section with up to three active milestones per party, using deterministic summaries. No labels such as 親友, 恋人, 宿敵, or 恋人候補 are used.

## Integration

- `campaign.ts` calls `updateRelationshipMilestones(party, dayNumber)` after `updateArcSignals`.
- `context.ts` calls `projectRelationshipMilestonesForNarrative` and attaches `relationshipMilestones`.
- `generators.ts` maps `CampaignParty.relationshipMilestones` into `TavernParty`.
- Prompt section output uses `milestoneSummary` for deterministic Japanese text.

## Examples

### Example A: growing_reliance → established_directional_reliance

A receives repeated support from B, but B does not show the same pattern. With shared expedition history, A → B `established_directional_reliance` is promoted.

### Example B: growing_reliance + recurring_conflict → established_trusted_friction

A and B both rely on each other but also clash repeatedly. Trust and tension remain high, producing `established_trusted_friction` alongside `established_mutual_reliance`.

### Example C: persistent_romantic_interest without relationship status change

A → B `romanticAttraction` is high and `romantic_interest_possible` is established across shared history. `persistent_romantic_interest` is promoted for A → B only. B → A has no such milestone. Neither character's `relationshipStatus` changes to `partnered`.

## Verification

| Check                                                    | Result                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run typecheck`                                      | PASS                                                                      |
| `npm run lint`                                           | PASS                                                                      |
| `npm run test`                                           | 882 tests PASS                                                            |
| `npm run test:coverage`                                  | PASS (statements 89.64%, branches 81.46%, functions 91.08%, lines 91.33%) |
| `npm run build`                                          | PASS                                                                      |
| `npm run test:expedition-regression`                     | 22/22 PASS                                                                |
| 30-day zero-call audit                                   | 69 candidates / 0 AI calls                                                |
| Compression audit                                        | PASS                                                                      |
| Timeline audit                                           | 0 leakage violations                                                      |
| Phase 7.2 / 7.2.1 / 7.2.2 / 7.3 / 7.4 / 7.5 / 7.6 smokes | PASS                                                                      |

## Known Limitations

- `auditNarrativeIdentityConsistency` is a heuristic quality warning. It may miss ambiguous or long-distance anaphora and may produce false positives if `彼女` is used as "girlfriend" rather than a pronoun.
- `established_decision_friction` currently relies on `decision_friction` / `recurring_conflict` arc signals and conflict/disagreement memory counts; it does not yet classify decision topics (retreat, route, resource, command) separately.
- Romance milestones stop at `persistent_romantic_interest`; confession, dating, breakup, marriage, jealousy, and love-triangle mechanics are intentionally left for later phases.

## Future Relationship States

Phase 7.6 deliberately leaves the following for later work: actual relationship status changes, explicit romance events, social-label assignment, gameplay/stat bonuses from milestones, and party-disbandment arcs.
