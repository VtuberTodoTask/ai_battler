# Phase 7.2.2 — Narrative Restraint & Relationship Differentiation

## Goal

Reduce AI-generated narrative "checklisting", suppress negative/absence narration,
allow beats to be fully omitted, tighten the scene budget, and improve
relationship contrast. Gameplay, simulation, provider, cost-control, and
candidate derivation remain unchanged; only the deterministic narrative layer is
tuned.

## Observed narrative problems

- **Checklist prose**: the model was treating `TIMELINE` as a list to be covered,
  expanding every beat to meet a target word count.
- **Absence-as-event narration**: phrases like "手当ては行われなかった" or
  "目立った消耗はなかった" were being generated because the prompt did not
  explicitly forbid describing things that did not happen.
- **Status roster summaries**: the prompt listed every member's condition,
  including healthy members, encouraging mechanical enumeration.
- **Generic relationship beats**: hints often reduced to "心配する" or "様子を見る",
  giving every pair the same interaction.
- **Scene bloat**: even routine preparation or movement beats could become
  secondary scenes because no omission path existed.

## Changes

### `NarrativeDirection` — explicit omission

`NarrativeDirection` now carries `omittedBeatIds`:

```ts
export interface NarrativeDirection {
  focus?: NarrativeFocus
  mainScenes: NarrativeSceneSelection[]
  secondaryScenes: NarrativeSceneSelection[]
  montageBeatIds: string[]
  omittedBeatIds?: string[]
  interactionHints?: NarrativeInteractionHint[]
}
```

`NarrativeDirector` splits unassigned beats into `montageBeatIds` and
`omittedBeatIds` after the tighter budget:

- max `mainScenes = 1`
- max `secondaryScenes = 1`
- max `montageBeatIds = 3`
- max scene length = 2 consecutive beats, **same phase only**

Low-importance routine beats that do not make the montage cut are now explicitly
omitted rather than implicitly compressed.

### Relationship differentiation

`relationshipHintSummary` now builds a contrast-aware summary from trust,
tension, affinity, and respect. Examples from the smoke tests:

```text
A+B (high trust, high tension): 信頼が厚い・緊張がある・背中を預け合う。言葉には気安さと棘が混在しやすい
A+C (high trust, low tension):  親密度が高い・信親密度が高い・信頼が厚い・緊張は低い・歩調が合う
```

`buildInteractionHints` also assigns a different `suggestedDynamic` depending on
the tension/trust pair and the scene theme (`injury`, `combat`, `route`, etc.).

### Negative/absence suppression

- `timelineProjection.ts`: the `noHealer` beat no longer emits a narrative line
  ("手当てが行われなかった"). Absence of a healer is not treated as an event.
- `facts.ts`: `hpCondition` now returns `undefined` for members with no notable
  HP loss (`ratio >= 0.9`). `memberConditionFacts` only lists injured or
  incapacitated members, removing the roster-style "目立った消耗はない" summary.

### Prompt v7 (`NARRATIVE_PROMPT_VERSION = 'v7'`)

New system-prompt sections:

- **UI responsibility boundary**: narrative handles characters/events/reverberation;
  UI handles success/failure, rewards, damage, quest grade, etc.
- **FACT PRESERVATION vs FACT COVERAGE**: facts must not be contradicted, but may be
  omitted if they are not important to the narrative focus.
- **不在は出来事ではない** (absence is not an event): forbids phrases like
  "手当ては行われなかった", "目立った消耗はなかった".
- **キャラクター特性は傾向である** (traits are tendencies): speech style and
  personality are not mandates; the model must not deform every line.
- **関係性の差異化** (relationship differentiation): prefer reactions that only
  appear toward that specific person; avoid generic care.
- **キャラクター技法はチェックリストではない**: dialogue, habit, human noise,
  non-verbal interaction should only be used when the scene naturally calls for
  them.

Writing-instruction updates:

- Short narrative is the normal case: `重大事件が 1 つなら MAIN 1 つ、SECONDARY 0、
MONTAGE 1 文程度、ENDING 短いシーンで終えてよい`.
- Explicitly allow full omission of low-importance events.
- Forbid status enumeration (`Character の状態を roster summary のように列挙しない`).
- Routine preparation may be omitted if it has no character relevance.
- Opening should be short: who, where, what.
- Do not list objective result, rewards, damage, remaining targets like the UI.

Prompt section order is now:

```text
=== EXPEDITION SUMMARY ===
=== CURRENT REQUEST ===
=== PARTY ===
=== NARRATIVE DIRECTION ===
  (Focus / Main Scenes / Secondary Scenes / Montage Beat IDs / Omitted Beat IDs / Narrative Interaction Hints)
=== CHARACTERS ===
=== PARTY RELATIONSHIPS ===
=== EXPEDITION TIMELINE ===
=== CONFIRMED OUTCOME FACTS ===
=== DETAILS NOT RECORDED ===
=== NARRATIVE HINTS ===
=== WRITING INSTRUCTIONS ===
```

`directionLines` now renders `Omitted Beat IDs:`.

### Tests

- `src/core/narrative/director.test.ts` — added tests for:
  - omitted routine beats
  - different interaction hints for `high trust + high tension` vs `high trust + low tension`
- `src/core/narrative/narrative.test.ts` — updated for v7 prompt integrity:
  - `FACT PRESERVATION`, `FACT COVERAGE`, `不在は出来事ではない`,
    `キャラクター特性は傾向である`, `関係性の差異化`, `Omitted Beat IDs:`,
    `短い Narrative が正常系`, absence-rule examples.

### Smoke script

`scripts/phase7-2-2-narrative-restraint-smoke.ts` covers cases A–E:

- **A: Missing Healing Event** — asserts the prompt does not contain
  "手当てが行われなかった" / "手当ては行われなかった".
- **B: Mixed Status** — one member heavily wounded, others fine; asserts the
  prompt lists the wounded member only and does not contain "目立った消耗はない".
- **C: Strong Character Trait** — asserts the trait-reference is present and
  the tendency rule is in the system prompt.
- **D: Relationship Contrast** — A+B high trust/high tension vs A+C high trust/low
  tension; asserts the two pairs receive different summaries and dynamics.
- **E: Routine Timeline** — many low-importance beats; asserts
  `mainScenes <= 1`, `secondaryScenes <= 1`, `montageBeatIds <= 3`, and
  `omittedBeatIds` is populated.

## Smoke / Audit Results

| Check                                                     | Result                          |
| --------------------------------------------------------- | ------------------------------- |
| `npm run typecheck`                                       | PASS                            |
| `npm run lint`                                            | PASS                            |
| `npm test`                                                | 58 files / 841 tests PASS       |
| `npm run build`                                           | PASS                            |
| `npm run test:expedition-regression`                      | 22/22 PASS                      |
| `npx tsx scripts/phase7-0-narrative-audit.ts`             | 69 candidates / 0 AI calls PASS |
| `npx tsx scripts/phase7-0-3-compression-audit.ts`         | PASS                            |
| `npx tsx scripts/phase7-1-timeline-audit.ts`              | 0 leakage violations PASS       |
| `npx tsx scripts/phase7-2-narrative-smoke.ts`             | PASS                            |
| `npx tsx scripts/phase7-2-1-narrative-quality-smoke.ts`   | PASS                            |
| `npx tsx scripts/phase7-2-2-narrative-restraint-smoke.ts` | PASS                            |

## Phase 7.2.2 Smoke sample output

```text
=== A: Missing Healing Event ===
mainScenes: [["a3"]]
secondaryScenes: [["a4"]]
omittedBeatIds: 0
focus: 「アルドを気にかける仲間たちと、アルドが傷を負いながらも前に進む場面」

=== B: Mixed Status ===
mainScenes: [["b2"]]
secondaryScenes: [["b3"]]
omittedBeatIds: 0

=== D: Relationship Contrast ===
mainScenes: [["d2"]]
secondaryScenes: [["d3"]]
hint: a+b — 信頼が厚い・緊張がある。言葉には気安さと棘が混在しやすい
hint: a+c — 親密度が高い・信密度が高い・信頼が厚い・緊張は低い

=== E: Routine Timeline ===
mainScenes: []
secondaryScenes: [["e8"]]
montageBeatIds: 3
omittedBeatIds: 6
focus: 「帰路で予定を外れたアルドの反応」
```

## Known Limitations

- `NarrativeFocus` central-member selection is still keyword-distance based; it can
  pick the wrong subject when two names appear equally close to a theme word.
- Scene budget caps are hard thresholds. An expedition with many strong character
  moments is limited to one main and one secondary scene; everything else becomes
  montage or omitted.
- `buildInteractionHints` only produces hints for pairs that already have a
  notable relationship; very weak or brand-new relationships are not forced.
- The `noHealer` beat is suppressed from the timeline, but the fact that no
  healing occurred is still derivable from the absence of a `healing`/`firstAid`
  beat. The prompt instructs the model not to narrate the absence.

## Out of Scope

As specified, the following are **not** included:

- New relationship stats or combat bonuses.
- Tavern conversation events.
- Long-term story arcs or LLM memory generation.
- Romance, rivalry, or party breakup mechanics.
- Dynamic personality evolution.
- Narrative-output parsing or UI redesign.
- Gameplay, simulation, provider, cost-control, or candidate-priority changes.
