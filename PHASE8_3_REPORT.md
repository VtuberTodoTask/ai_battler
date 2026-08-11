# Phase 8.3 — Sound Novel Scene Runtime

## Overview

Phase 8.3 replaced the TavernScene's full-screen narrative modal with a dedicated, independent `SoundNovelScene`. The goal was not merely to display narrative text on Canvas, but to build a reusable **Sound Novel Scene Runtime** that can later host backgrounds, character portraits, effects, BGM, and scene transitions without rewriting Tavern or narrative generation logic.

## Why a Dedicated SoundNovelScene

Narrative was previously shown inside `TavernScene` as a large modal. This made it impossible to layer background/character/effect visuals independently and forced the scene to mix tavern-management concerns with narrative presentation. A dedicated scene keeps:

- `TavernScene`: tavern management, report lists, activity lists
- `SoundNovelScene`: narrative presentation, pagination, typewriter, controls

Transitions use `GameSceneManager.push/pop`, preserving `TavernScene` state.

## Visual Scene Runtime Architecture

```text
TavernScene
    ↓ push
SoundNovelScene
    ├─ backgroundLayer   (placeholder background / future images)
    ├─ characterBackLayer
    ├─ characterFrontLayer
    ├─ effectLayer
    ├─ dimLayer
    ├─ textLayer
    ├─ indicatorLayer
    ├─ controlsLayer
    └─ overlayLayer
    ↓ pop
TavernScene / Report
```

Layers are intentionally empty where Phase 8.3 does not require art, but their containers exist so future work only touches `SoundNovelScene` presentation code.

## Scene Transition / Return

`SoundNovelSceneInput` carries a `SoundNovelReturnTarget` describing where to return:

- `sceneId`: target scene (`tavern`)
- optional `reportId`, `activityId`, `partyId` for future deep-linking

The `戻る` button and `Escape` key call `sceneManager.pop()`, which unmounts `SoundNovelScene` and remounts the previous scene from the manager's stack. Tavern selection state lives in `GameUiState` and is not destroyed by the scene change.

## Scene Graph Layers

All layers are `PIXI.Container` instances created in `SoundNovelScene.mount()` and destroyed on `unmount()`:

- `backgroundLayer`: filled with a color derived from `resolveSoundNovelBackground`
- `characterBackLayer` / `characterFrontLayer`: reserved for future portraits/silhouettes
- `effectLayer`: reserved for rain, fog, flash, shake, fade
- `dimLayer`: dark overlay to keep text readable
- `textLayer`: holds per-segment `GameLabel` text objects
- `indicatorLayer`: shows `▼` when waiting for input
- `controlsLayer`: AUTO, LOG, 戻る buttons
- `overlayLayer`: used by LOG/backlog

## Visual Context

`SoundNovelVisualContext` is built from structured campaign data rather than by parsing the narrative:

```ts
interface SoundNovelVisualContext {
  locationId?: string
  environment?: string
  timeOfDay?: string
  participantIds?: string[]
  focusCharacterIds?: string[]
  backgroundId?: SoundNovelBackgroundId
}
```

For expedition reports, environment comes from the request. For downtime and stay extension, it defaults to `tavern`. Character IDs come from the party record; focus characters default to the leader and first member.

## Background Resolver

`resolveSoundNovelBackground(source, visualContext)` deterministically selects a `SoundNovelBackgroundId`:

- `stay_extension` / `downtime` → `tavern`
- expedition with explicit `backgroundId` / `environment` → `forest`, `ruins`, `cave`, `mountain`, `road`, `wetland`
- unknown → `generic`

The resolver never uses AI or natural-language parsing.

## Future Character Layer

No portraits or silhouettes are drawn in Phase 8.3. `SoundNovelVisualContext` already carries `participantIds` and `focusCharacterIds`, and `SoundNovelSceneCue`/`SoundNovelAudioCue` types are defined for future scene/BGM/SE hooks.

## Narrative Parser

`SoundNovelParser` splits raw narrative text into `SoundNovelSegment`s without rewriting text. It:

- splits on blank lines to form paragraphs
- detects dialogue wrapped in `「...」` or `『...』` and separates it from surrounding narration
- never invents speakers or reorders text
- falls back to a single segment if parsing fails

## Segment Model

```ts
interface SoundNovelSegment {
  id: string
  text: string
  kind: 'narration' | 'dialogue' | 'blank' | 'other'
  speakerName?: string
  presentationCue?: SoundNovelPresentationCue
}
```

`kind` is conservative: only explicit quotation wrappers are marked `dialogue`.

## Page Model

```ts
interface SoundNovelPage {
  id: string
  segments: SoundNovelSegment[]
}

interface SoundNovelDocument {
  id: string
  title?: string
  pages: SoundNovelPage[]
}
```

A page accumulates segments until the measured text area would overflow; the next click/page end clears the text area and starts the next page.

## Pagination

`SoundNovelPaginator` uses an injected `measureText` callback so it can use real Pixi Text metrics in the browser and deterministic stubs in unit tests. Layout is computed once when the document is created and reused for the scene lifetime.

Text area for this phase: roughly `x: 170, y: 120, width: 1260, height: 620` on the 1600×900 virtual canvas.

## Typewriter

`SoundNovelPlayer` drives the typewriter with `deltaMS` from the Pixi ticker:

- `Intl.Segmenter('ja', { granularity: 'grapheme' })` when available, `Array.from(text)` fallback
- graphemes are segmented once per segment, not every frame
- per-grapheme reveal time = `textSpeedMs` + punctuation pause
- punctuation pauses: `、 +80ms`, `。 +180ms`, `！/！/？/？ +150ms`, `… +120ms`
- initial speed `35ms`

## Playback States

```ts
type SoundNovelPlaybackState =
  | 'typing'
  | 'waiting'
  | 'page_wait'
  | 'finished'
  | 'closed'
```

- `typing`: revealing the current segment
- `waiting`: current segment fully revealed; awaiting click/AUTO to advance
- `page_wait`: last segment of page fully revealed; next click/AUTO advances page
- `finished`: all pages done
- `closed`: scene closing / return

Click behavior:
- typing → complete current segment
- waiting → start next segment typewriter
- page_wait → clear page and start next page
- finished → close / return

## AUTO

AUTO toggles on/off with the `AUTO` button. When on:

- after a segment completes, wait based on grapheme count
- after the last segment of a page, add an extra `500ms`
- wait is clamped between `1200ms` and `4000ms`
- manual clicks still complete/reveal text but do **not** disable AUTO

## LOG

The `LOG` button opens a `GameScrollView` overlay showing completed segments. While LOG is open:

- playback stops
- AUTO timer stops
- closing LOG resumes from the same position

LOG is implemented in `overlayLayer` and requires no AI calls.

## Input

```ts
interface SoundNovelSceneInput {
  narrativeId: string
  source: 'expedition' | 'downtime' | 'stay_extension'
  title?: string
  text: string
  visualContext: SoundNovelVisualContext
  returnTarget: SoundNovelReturnTarget
}
```

`TavernScene` builds this input when the user presses `物語として読む` for an expedition report, downtime event, or stay extension event.

## AI Call Policy

- generated narrative reopen → 0 AI calls
- ungenerated narrative → uses the existing `generateNarrative` / `generateDowntimeNarrative` pipeline exactly once, then caches the result, then launches `SoundNovelScene`
- provider failure → stays on the report/activity detail modal with an error, never enters `SoundNovelScene`
- prompt versions remain frozen: `NARRATIVE_PROMPT_VERSION = v11`, `DOWNTIME_PROMPT_VERSION = v2`

## Scene Lifecycle

- `mount(context, input)`: create layers, build document, start typewriter, attach keyboard listener
- `update(dt)`: advance typewriter / AUTO timers / indicator blink
- `unmount()`: remove keyboard listener, destroy display objects, clear backlog, release scene root

No global assets are destroyed, and the Pixi ticker callback lives only on the active scene.

## Performance

- one `GameLabel` per visible segment; existing labels are updated rather than recreated
- pagination is computed once at document creation
- grapheme arrays and cumulative reveal times are precomputed per segment
- no per-frame full page rebuild

## Tests

Added:

- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelParser.test.ts`
- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelPaginator.test.ts`
- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelPlayer.test.ts`
- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelAutoMode.test.ts`
- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelBacklog.test.ts`
- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelSceneLifecycle.test.ts`
- `src/ui/canvas/scenes/soundNovel/__tests__/soundNovelBackgroundResolver.test.ts`
- `src/ui/canvas/__tests__/phase8-3-sound-novel-scene-smoke.test.ts`
- `npm run phase8-3-sound-novel-scene-smoke` script in `package.json`

Also updated existing TavernScene test helpers to provide a `sceneManager` mock now that narrative paths push `soundNovel` instead of opening modals.

## Browser E2E

Browser E2E for Phase 8.3 covers:

- report → `物語として読む` → `SoundNovelScene`
- background + text layout
- grapheme-by-grapheme typewriter
- click to complete
- next segment / segment persistence on page
- page clear on overflow
- AUTO on/off
- LOG overlay and resume
- return to tavern with state preserved
- downtime and stay extension paths
- resize stability
- repeated open/close without event duplication or console errors

E2E will be run with the persistent testing agent upon user request.

## Known Limitations

- Background images are placeholders (colored fills with a label)
- Character layers are empty
- No BGM, SE, voice, rain, fog, flash, or shake effects
- No speaker name display; dialogue is shown as-is from the narrative text
- No choice/branching, skip, or resume
- No segment-level background changes (one background per narrative)
- `SoundNovelSceneCue` and `SoundNovelAudioCue` are type-only foundations

## Future Background / Character Expansion

Because the scene graph, visual context, and cue types are already defined, future phases can add:

- background sprite assets loaded by `backgroundId`
- character portraits/silhouettes in `characterBackLayer` / `characterFrontLayer`
- effects in `effectLayer`
- per-segment `presentationCue` and `sceneCue`
- audio cues without changing `TavernScene` or narrative generation

## Verification

- `npm run typecheck`: green
- `npm run lint`: green
- `npm run test -- --run`: 1098 tests passing
- `npm run build`: green
- `npm run phase8-3-sound-novel-scene-smoke`: 14/14 passing
- `NARRATIVE_PROMPT_VERSION` and `DOWNTIME_PROMPT_VERSION` unchanged
- zero unrequested AI calls: opening the scene, toggling AUTO, or opening LOG never calls an LLM
