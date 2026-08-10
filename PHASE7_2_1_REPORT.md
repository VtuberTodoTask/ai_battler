# Phase 7.2.1 — Narrative Quality Tuning

## Goal

Refine the narrative layer so generated prose feels like a story about the actual
adventurers, not a chronological digest of expedition events. The simulation
facts remain immutable; only the deterministic guidance sent to the AI
narrator is tuned.

## Observed narrative problems

- **Event-digest tone**: previous prompts listed `Main Scenes`, `Secondary
  Scenes`, and `Montage Beat IDs` but gave the model no single focal idea, so
  output often read as "and then ... and then ..." summaries.
- **Mechanical outcome priority**: generic `outcome` beats ("依頼の目的を達成した")
  could dominate scenes because no penalty distinguished them from character
  drama beats.
- **Repetitive expansion**: multiple similar movement or combat beats were all
  treated as independent scene candidates, producing bloated prose.
- **Weak relationship integration**: relationships existed in the prompt but were
  not tied to specific beats, so the model had to guess where to stage
  character dynamics.

## Narrative Focus

`NarrativeDirector` now deterministically selects a single `NarrativeFocus`:

```ts
export interface NarrativeFocus {
  summary: string
  characterIds?: string[]
  relatedBeatIds?: string[]
  reason?: string
}
```

`buildFocus` derives the focus from the main/secondary scenes, the central
character (name closest to the dominant theme keyword), and a theme
(`injury`, `surround`, `route`, `combat`, `objective`, `event`). The summary is
a short Japanese sentence that tells the model what the story is *about*, e.g.

```text
「ゼファーとリナ、アルンを気にかける仲間たちと、ゼファーが傷を負いながらも前に進む場面」
```

## Scene Budget Changes

Scoring thresholds and caps are now tighter:

- `MAIN_THRESHOLD = 90`
- `SECONDARY_THRESHOLD = 70`
- `MONTAGE_THRESHOLD = 40`
- max `mainScenes = 2`
- max `secondaryScenes = 2`
- max scene length = 2 consecutive beats

A generic `outcome` beat with no `actorIds`/`targetIds` receives a `-12`
penalty, so plain objective/combat success does not automatically become the
main scene. Character-injury, fear, and relationship beats can still cross the
`90` threshold.

## Montage Compression

Consecutive generic beats of the same phase and kind (no actor or target IDs)
receive a `-10` repetitive penalty per repetition, capped at `-30`. This
keeps movement and routine action in the montage while still allowing one or
two representative beats to reach secondary status.

## Relationship Interaction Hints

`NarrativeDirector` emits `NarrativeInteractionHint[]` for pairs that appear
together in a selected scene and have a notable relationship:

```ts
export interface NarrativeInteractionHint {
  characterIds: string[]
  beatIds: string[]
  relationshipSummary?: string
  suggestedDynamic?: string
}
```

The hint is a *suggestion*, not a script. It gives the model a concrete
relationship dynamic to stage in a specific scene, e.g.

```text
リナがアルンの背中を預け、無言で呼吸を合わせる
リナとゼファーが攻撃の順番を巡って張り合いながらも連携する
```

## Character-Drama Scoring

`computeBeatScore` adds:

- `+8` per profile keyword (value / flaw / fear / temperament / habit / speech
  style) that appears in the beat text.
- relationship-band boosts when a beat involves a notable pair.
- `+8` character-drama boost when 2+ members and a relationship are present,
  plus an extra `+8` if a profile keyword collides.
- `profileThematicBonus` for fear/value/flaw themes even when the exact word
  is not in the beat text.

This makes a character fear collision (`孤立して囲まれること` vs
`敵に囲まれた`) push a beat into main-scene territory.

## Dialogue / Show-vs-Explain Tuning

Prompt `v6` adds explicit writing rules:

- `NARRATIVE FOCUS` and `MAIN SCENES` are the center; `SECONDARY SCENES` are
  brief; `MONTAGE` is compressed to 1–3 sentences.
- `TIMELINE` is not a checklist — do not explain every event in order.
- Show character and relationship through action, dialogue, silence, gesture,
  and atmosphere; never directly label personality or relationship stats.
- Allowed human noise: hunger, fatigue, banter, complaints, awkward silence,
  jokes, equipment checks, concern for others, requests for food.
- Allowed non-verbal interaction: passing a water bottle, slowing pace,
  checking gear, worrying about a wound, sitting down.
- Forbidden mechanical invention: healing, HP recovery, protection that blocks
  damage, spell use, or new item gifts unless they are in `CONFIRMED FACTS`.

## Prompt Changes

`NARRATIVE_PROMPT_VERSION = 'v6'`.

`=== NARRATIVE DIRECTION ===` now renders:

```text
Focus:
  Summary: ...
  Characters: ...
  Related Beats: ...
  Reason: ...
Main Scenes:
  - Focus: ...
    Beat IDs: ...
    Reason: ...
    Characters: ...
Secondary Scenes:
  - ...
Montage Beat IDs: ...
Narrative Interaction Hints:
  - Characters: ...
    Beats: ...
    Relationship Summary: ...
    Suggested Dynamic: ...
```

`buildExpeditionPrompt` falls back to `determineNarrativeDirection` when the
context does not already carry one, so old fixtures and compact campaign
snapshots still receive focus/hint guidance.

## Before / After Example

**Before (v5 prompt excerpt)**

```text
=== NARRATIVE DIRECTION ===
Main Scenes:
  - Focus: 遺跡の守護者との戦闘と負傷者の手当て
    Beat IDs: b3, b4
    Reason: 戦闘における命綱のやり取り
Secondary Scenes:
  - Focus: リナの警戒と先陣
    Beat IDs: b2
    Reason: リーダーの気質を示す場面
Montage Beat IDs: b1, b6
Narrative Interaction Hints:
  - なし
```

**After (v6 prompt excerpt)**

```text
=== NARRATIVE DIRECTION ===
Focus:
  Summary: 「ゼファーが傷を負いながらも前に進む場面」
  Characters: ゼファー, リナ, アルン
  Related Beats: a3, a4, a5
  Reason: MAIN SCENEのテーマ「injury」から生成
Main Scenes:
  - Focus: アルンはリナの装備をそっと直した → 遺跡の守護者と遭遇し、ゼファーが孤立しかけた
    Beat IDs: a2, a3
    Reason: approachの連続した出来事（重要度 60）
    Characters: m1, m2, m3
  - Focus: ゼファーは深い傷を負い、リナが前に出て守った → 遺跡の最深部に到達し、古代の刻印を確認した
    Beat IDs: a4, a5
    Reason: battleの連続した出来事（重要度 95）
    Characters: m1, m3
Secondary Scenes: なし
Montage Beat IDs: a1, a6
Narrative Interaction Hints:
  - Characters: リナ, アルン
    Beats: a2, a3
    Relationship Summary: 背中を預け合う
    Suggested Dynamic: リナがアルンの背中を預け、無言で呼吸を合わせる
  - Characters: リナ, ゼファー
    Beats: a2, a3
    Relationship Summary: 言い合いが多い
    Suggested Dynamic: リナとゼファーが攻撃の順番を巡って張り合いながらも連携する
```

## Tests

- `src/core/narrative/director.test.ts` — focus, interaction hints, scene
  budget, repetitive penalty, character-drama scoring, fear/value/flaw
  collision.
- `src/core/narrative/narrative.test.ts` — prompt integrity for v6 sections and
  quality rules (`NARRATIVE FOCUS`, `MONTAGEは1～3文程度`,
  `TIMELINEのすべての出来事を順番に説明しない`, `同じ結果を繰り返し説明しない`,
  `水筒を渡す`).
- `scripts/phase7-2-1-narrative-quality-smoke.ts` — cases A–E:
  - A: injury + strong relationship
  - B: route failure
  - C: routine success
  - D: multiple combats (repetitive penalty)
  - E: character fear collision

## Smoke / Audit Results

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 58 files / 839 tests PASS |
| `npm run build` | PASS |
| `npm run test:expedition-regression` | 22/22 PASS |
| `npx tsx scripts/phase7-0-narrative-audit.ts` | 69 candidates / 0 AI calls PASS |
| `npx tsx scripts/phase7-0-3-compression-audit.ts` | PASS |
| `npx tsx scripts/phase7-1-timeline-audit.ts` | 0 leakage violations PASS |
| `npx tsx scripts/phase7-2-narrative-smoke.ts` | PASS |
| `npx tsx scripts/phase7-2-1-narrative-quality-smoke.ts` | PASS |

## Known Limitations

- `NarrativeFocus` central-member selection is keyword-distance based; it can
  pick the wrong subject if two names appear equally close to a theme word.
  The current tiebreak (`nameBeforeKeyword` with a small bonus) handles the
  common Japanese `Xは傷を負った` pattern but is not syntactic.
- `buildInteractionHints` only produces hints for pairs that already have a
  notable relationship. New or very weak relationships will not generate
  hints; they must develop through gameplay first.
- Repetitive penalty is applied only to consecutive generic beats. A single
  isolated generic beat of the same kind later in the timeline is not
  penalised.
- The scene-budget caps are hard thresholds. An expedition with many strong
  character moments will still be limited to at most two main and two
  secondary scenes, with the rest in montage.

## Out of Scope

As specified, the following are **not** included:

- New relationship stats or combat bonuses.
- Tavern conversation events.
- Long-term story arcs or LLM memory generation.
- Romance, rivalry, or party breakup mechanics.
- Dynamic personality evolution.
- Narrative-output parsing or UI redesign.
- Gameplay, simulation, provider, cost-control, or candidate-priority changes.
