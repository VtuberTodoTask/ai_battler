# Phase 7.7.1 Report: Minor Event Narrative Diversity

## 1. Objective

Implement a deterministic Narrative Presentation layer for minor events (especially stay extensions and downtime events) so that the same game event type produces different narrative "camera angles" on each occurrence, without changing game outcomes.

## 2. What Changed

### 2.1 New types (`src/core/narrative/types.ts`)

- `StayExtensionReason` – 8 deterministic reasons (training, recovery, equipment_preparation, party_coordination, resource_preparation, waiting_for_work, personal_preference, mixed).
- `MinorSceneOpeningCategory` / `MinorSceneEndingStyle` – typed opening/ending categories.
- `MinorScenePresentationPlan` – structured per-event camera plan (framing, focal/speaking/background characters, direct decision flag, mention-extension-days flag, emphasis flags, ending style).
- `MinorNarrativeFingerprint` – lightweight per-event record for repetition penalties and diversity audits.
- `DowntimeEvent.presentationPlan` – optional for backward compatibility.

### 2.2 New module (`src/core/narrative/minorScenes.ts`)

- `selectStayExtensionReason` – seeded, state-biased reason selection using `REASON_BASE_WEIGHTS` + party condition (injuries, training, conflict arcs, financial pressure, etc.).
- `buildMinorScenePresentationPlan` – deterministic plan builder:
  - framing selection with distribution, recent-window penalty, and hard repeat guard (no same framing twice in a row)
  - opening category tied to framing
  - focal/speaker/background character selection with leader boost and focal repetition penalty
  - speaker budget (1-4, usually 1-2)
  - ending style with last-style penalty
  - stay-extension flags: `communicateDecisionDirectly`, `mentionExtensionDays`, `emphasizeReason`, `emphasizeRelationship`
- `minorSceneFingerprintFromPlan` / `updatePartyMinorNarrativeFingerprints` – deterministic fingerprint tracking per party.
- `auditMinorScenePhrases` / `auditMinorSceneDiversity` – phrase-stock and distribution audit helpers.

### 2.3 Stay extension integration (`src/core/tavern/campaign/relationship.ts`, `campaign.ts`, `types.ts`)

- `CampaignRelationshipEvent.stayExtended` now carries `primaryReason`, `secondaryReason`, `relevantCharacterIds`, and `presentationPlan`.
- `tryExtendStay` uses a seeded `SeededRng` to select reason and plan deterministically from party state.
- `advanceCampaignDay` passes the campaign seed to `tryExtendStay`.
- `CampaignParty.minorNarrativeFingerprints` persists per-party fingerprints.
- `candidates.ts` exposes reason/presentation facts to narrative candidates.

### 2.4 Downtime event integration (`src/core/narrative/downtime.ts`)

- `DOWNTIME_PROMPT_VERSION` bumped to `v2`.
- `createDowntimeEvent` builds a `MinorScenePresentationPlan` with a seeded RNG and attaches it to the event.
- `buildDowntimePrompt` emits `=== SCENE PRESENTATION ===` and `=== MINOR EVENT NARRATIVE RULES ===` sections.
- Prompt target length reduced to 200-500 characters for minor events.

### 2.5 Character event prompt (`src/core/narrative/prompt.ts`)

- `buildCharacterEventPrompt` for `stayExtended` now renders `SCENE PRESENTATION` with plan fields and `MINOR EVENT NARRATIVE RULES`.
- Rules emphasize focal character, speaker budget, decision/duration repetition guards, ending style diversity, and the 200-500 character target.

### 2.6 UI (`src/ui/tavern/CampaignHistory.tsx`)

- Stay-extension relationship label now shows `滞在 +N日 / 理由：<label>（Day A → B）`.
- Added `stayExtensionReasonLabel` mapping to Japanese labels.

### 2.7 Tests and smoke

- `src/core/narrative/minorEventNarrative.test.ts` – prompt sections, downtime plan generation, cache isolation, zero-call, provider failure fallback, old save, reason determinism, framing variety, speaker budget, phrase audit.
- `src/core/narrative/stayExtensionNarrative.test.ts` – stay extension reason/plan determinism, recovery and conflict-arc bias, direct decision and duration guards, ending/focal diversity, prompt structure.
- `scripts/phase7-7-1-minor-narrative-diversity-smoke.ts` – cases A-L plus prompt and audit checks (cache isolation, reopen cache, framing variety, speaker budget, reason bias, direct decision guard, duration repetition guard, ending diversity, zero calls, provider failure fallback, old save compatibility).

## 3. Verification Results

| Command                                              | Result                                                 |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `npm run typecheck`                                  | PASS                                                   |
| `npm run lint`                                       | PASS                                                   |
| `npm run test`                                       | 924/924 PASS                                           |
| `npm run test:coverage`                              | PASS (89.73% statements)                               |
| `npm run build`                                      | PASS                                                   |
| `npm run test:expedition-regression`                 | 22/22 PASS                                             |
| `npx tsx scripts/phase7-0-narrative-audit.ts`        | 30-day zero-call audit: 69 candidates, 0 AI calls PASS |
| `npx tsx scripts/phase7-0-3-compression-audit.ts`    | PASS                                                   |
| `npx tsx scripts/phase7-1-timeline-audit.ts`         | 0 leakage violations PASS                              |
| `npm run phase7-7-downtime-relationship-smoke`       | PASS                                                   |
| `npm run phase7-4-memory-smoke`                      | PASS                                                   |
| `npm run phase7-7-1-minor-narrative-diversity-smoke` | PASS                                                   |

## 4. Backward Compatibility

- Old `DowntimeEvent` objects without `presentationPlan` still generate a prompt and fallback; the new section is omitted only when the plan is absent.
- Old `stayExtended` events without `primaryReason`/`presentationPlan` are not re-generated from game state (they are game facts), but the narrative pipeline treats missing plan fields as optional.

## 5. Design Notes

- Game results are unchanged; the presentation layer only affects narrative prompt construction.
- All selection is deterministic from the campaign/party seed and day numbers; no new AI calls occur by default.
- Cache isolation and zero-call semantics are preserved; `generateDowntimeNarrative` returns cached text and falls back on provider failure.
