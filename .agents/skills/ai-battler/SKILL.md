---
name: ai-battler-local-testing
description: |
  How to set up and run end-to-end UI tests for the ai_battler Vite + React MVP.
---

# AI Battler local testing

## Devin Secrets Needed

None.

## Repository & dependencies

- Repo path: `/home/ubuntu/repos/ai_battler`
- Install: `npm install`
  - If the rolldown native binding fails, install
    `@rolldown/binding-linux-x64-gnu@1.2.3` explicitly.

## Static verification commands

Run from a clean state:

```bash
npm run typecheck
npm run lint
npm run test
rm -rf dist && npm run build
```

`build` may print a Node.js version warning but still exits `0` on Node 20.18.

## Dev server

```bash
npm run dev
```

Default URL: `http://localhost:5173`

## UI structure

The landing page has six sections in this order:

1. `冒険者生成` (adventurer generation)
2. `パーティ生成` (party generation)
3. `敵生成` (enemy generation)
4. `遭遇生成` (encounter generation)
5. `自動戦闘` (auto battle)
6. `シミュレーション` (100-battle simulation)

## Key behaviours

- The `戦闘実行` button is disabled until both a party and an encounter exist.
- All generation is deterministic: the same seed + options produce identical
  output.
- `パーティ生成` does not accept a rank/role; it generates `count` adventurers
  with random ranks/roles derived from the seed.
- Battle logs are rendered inside a `<details>` element and can be expanded/
  collapsed.

## Phase 4 Expedition simulator (`遠征シミュレーター`)

A second tab, `遠征シミュレーター`, renders the expedition flow:

- Preset select uses `OBJECTIVE_LABELS` with objectiveType (`investigation`,
  `elimination`, `rescue`, `escort`, `retrieval`, `survey`).
- UI is a three-column layout: timeline list, event detail, party/objective/battle
  panel. Below those is the final result summary and a togglable Raw JSON panel.
- `遠征開始` runs `runExpedition(request, party)`; results include `request`,
  `outcome`, `state`, and `party`.
- `Seedを変更して再実行` regenerates `expeditionSeed` and `partySeed` and re-runs
  the expedition.
- `同じ条件でもう一度` re-runs with the current seeds.
- Timeline controls: `最初へ`, `前へ`, `再生`/`停止`, `次へ`, `最後へ`.
- `判定` blocks in `イベント詳細` are only shown when an event has a check.
- Objective panels are per-type (e.g. rescue shows target HP/progress, retrieval
  shows integrity/carrier/extracted/returned, survey shows coverage/sector
  quality/report).

## Phase 5 Tavern simulator (`酒場MVP`)

A third tab, `酒場MVP`, renders the tavern dispatch flow:

- Controls: `Day Seed` text input, `このSeedで生成`, `新しい日`.
- `generateTavernDay(seed)` produces 3 `.request-card` elements and 8
  `.adventurer-card` elements deterministically.
- Click a `.request-card` to select it; click `.adventurer-card` elements to
  assign/remove them from the selected request.
- Each dispatched request needs exactly 4 adventurers. Adventurers already
  assigned to another request show `...へ編成済み` and are disabled for other
  requests.
- `本日の派遣を実行` resolves all assignments; unstaffed requests are labelled
  `未派遣`.
- After resolve, click a `.result-card` to open `.result-detail` showing
  `派遣メンバー`, `重要facts`, expedition outcome, battle outcome, and objective
  summary.

## Phase 5.5 Tavern brokerage (`酒場MVP`)

The `酒場MVP` tab now uses a brokerage/acceptance engine:

- 3 `.request-card` elements and 4 `.party-card` elements per generated day.
- Select a `.request-card`, then a `.party-card`, then click
  `この依頼を紹介する`.
- The `brokerage-panel` shows the party's response (`受諾` or `辞退`) and a
  flavor reason.
- Acceptance reasons include `appropriate`, `challengingButSuitable`,
  `tooDangerous`, and `poorFit`. Expand `判定詳細` to see `rankGap`,
  `relevantRoleCount`, and `leaderJudgment`.
- Once at least one match exists, `本日の仲介を確定` runs expeditions and renders
  `本日の仲介結果`. Click a `.result-card` to open `.result-detail` and see
  `受諾パーティ` with `HP {finalHp}/{maxHp}`.
- Useful sample seeds:
  - `tavern-005`: includes `elimination`, `survey`, and `rescue` requests, plus
    a `D` ranked party (`鉄梟`) that accepts the `C` ranked `survey` as
    `challengingButSuitable` and an `E` ranked party (`森影`) that declines the
    same `survey` as `tooDangerous`.

## Test-harness notes

Native mouse clicks sometimes did not register on lower-page buttons (e.g.
`4人パーティ生成`, `戦闘実行`, `実行`) in this harness. As a fallback, the
button handlers can be triggered from the browser console:

```js
const buttons = document.querySelectorAll('button')
// 0: 冒険者生成 生成
// 1: 4人パーティ生成
// 2: 敵生成 生成
// 3: 遭遇生成 生成
// 4: 戦闘実行
// 5: シミュレーション 実行
buttons[1].click() // for example
```

Use this only when native clicks fail; the UI buttons are correct and respond
normally to real user input.

## Phase 6 Campaign simulator (`酒場キャンペーン`)

A fourth tab, `酒場キャンペーン`, renders a multi-day campaign:

- Default seed `tavern-campaign-001`; `新しいキャンペーン` regenerates the seed.
- The day board shows 3 `.request-card` elements and 4 `.party-card` elements.
- `本日の仲介を確定` resolves matched offers; `翌日へ` advances to the next day.
- After resolve, `本日の仲介結果` / `本日の結果` cards appear; click a result to
  open `TavernResultDetail` with `受諾パーティ` HP/MP/Morale.
- Parties can enter `療養中` status; after `advanceCampaignDay` they recover to
  full HP/MP and `Morale = max(old + 20, 70)` when their recovery window ends.

## Phase 6.1 Expedition success prediction (`遠征予測`)

- `ExpeditionPredictionPanel` appears while `day.status === 'planning'` once a
  request and a non-recovering party are selected.
- It shows a transient `遠征見込みを計算中…` message, then `推定依頼達成率 N%`,
  a danger label (`非常に有望` / `有望` / `五分以上` / `危険` / `非常に危険`),
  and an expandable `内訳を見る` with six outcome rates.
- The prediction runs `runExpedition()` 200 times with seed
  `prediction:v1:<requestId>:<partyId>:<index>`. It takes ~100–120 ms in
  Chrome on this machine.
- The panel caches predictions by request id + party id + member state; selecting
  a previously viewed pair reuses the cache and displays the same rate
  immediately.
- Selecting a recovering party shows `療養中のため遠征予測できません`.
- Prediction is computed from the raw `requestOffer` + `AdventurerParty` and is
  independent of the leader `Acceptance` decision shown in `BrokeragePanel`.

## Phase 6.2 Rank calibration (`devin/phase6-2-rank-calibration`)

- Balance changes affect `ADVENTURER_THREAT`, `ENEMY_BASE_THREAT`,
  `EXPEDITION_ENCOUNTER_THREAT_MULTIPLIER`, `DIFFICULTY_BUDGET_MULTIPLIER`,
  `DIFFICULTY_TARGET_WINRATE`, `EXPEDITION_RANK_PENALTY`, and the effective
  skill-check formula in `src/core/expedition/checks.ts`.
- A natural rank-calibration E2E scenario requires a request and parties whose
  ranks differ by the same fixture. With seed `tavern-campaign-001`, advance to
  Day 5: `洞窟の魔物討伐` (rank E) is paired with same-rank E parties and the
  `《森影》` party (rank C, +2), so the prediction panel should update across the
  rank gap without stale values.
- Build and preview for this branch: `npm run build && npm run preview -- --host`
  serves `http://localhost:4173/`; `npm run dev` is not required.
- When verifying elimination consistency, scroll the `TavernResultDetail` panel
  to view the target table (`対象数`, `撃破`, `逃走`, `生存`, `Progress`,
  `Completed`) and confirm it matches the displayed outcome and facts.

## Phase 6.3 Roster-aware request ranks (`devin/phase6-3-roster-aware-requests`)

- `planRequestRanksForDay` in `src/core/tavern/campaign/generators.ts` now
  plans two serviceable slots and one challenge slot from the available party
  ranks.
- `advanceCampaignDay` excludes recovering parties when computing
  `availablePartyRanks` for the next day's requests.
- The standalone `generateTavernDay` in `src/core/tavern/dayGenerator.ts` also
  uses the planner with the generated party pool.
- With seed `tavern-campaign-001`, Day 1 `街道周辺の魔物排除` (E) x `《黒曜の斧》`
  (D) causes `forcedRetreat`; on Day 2 `《黒曜の斧》` is `療養中` and the request
  board shows `[E, E, D]` for an otherwise E-only available roster, which is the
  `highest available (E) + 1` challenge slot.
- Use `document.querySelectorAll('.request-card')` and
  `document.querySelectorAll('.party-card')` for reliable JS clicks when native
  clicks on lower-page elements do not register.

## Test-harness notes for Phase 6.x

- For Phase 6.1 the user requested `npm run dev -- --host` so the dev server
  binds `0.0.0.0`; `http://localhost:5173` still works locally.
- `.request-card` and `.party-card` are `<div>` elements with React `onClick`.
  If native clicks miss, trigger them from the browser console:

  ```js
  document.querySelectorAll('.request-card')[0].click()
  document.querySelectorAll('.party-card')[2].click()
  document
    .querySelectorAll('button')
    .find((b) => b.textContent.trim() === 'この依頼を紹介する')
    ?.click()
  document
    .querySelectorAll('button')
    .find((b) => b.textContent.trim() === '本日の仲介を確定')
    ?.click()
  document
    .querySelectorAll('button')
    .find((b) => b.textContent.trim() === '翌日へ')
    ?.click()
  ```

## Phase 6.4 Party growth, idle training, and skill growth (`devin/phase6-4-party-growth`)

- `awardPartyGrowthXp` in `src/core/tavern/campaign/progression.ts` grants
  `EXPEDITION_GROWTH_XP[outcome]` to resolved parties (4 for `completeSuccess`,
  3 for `success`, etc.) and `TRAINING_GROWTH_XP` (1) to non-dispatched,
  non-recovering, non-departing parties at day resolution.
- When `growthXp` reaches `PARTY_GROWTH_XP_THRESHOLD` (4), `applyGrowthMilestones`
  awards one milestone, improves one role-relevant skill by
  `SKILL_GROWTH_PER_MILESTONE` (2), and resets `growthXp`.
- `resolveCampaignDay` skips recovering parties entirely (`isRecoveringOnDay`),
  so they gain neither expedition XP nor training XP.
- `syncCurrentDayParties` writes grown progression/skills back to
  `currentDay.parties`, so the UI sees updated values immediately.
- `buildPredictionCacheKey` includes each member's `skills`, `currentHp`,
  `currentMp`, `morale`, `statusEffects`, and `stats`; selecting the same
  `request + party` after a milestone/skill change produces a fresh prediction
  instead of reusing a stale cached value.

### Natural E2E scenario with `tavern-campaign-001`

- Day 1: dispatch `街道周辺の魔物排除(E)` to `《鋼の絆》(E)` and resolve.
  - Outcome is `completeSuccess`; reputation `10 → 13`.
  - `《鋼の絆》` gains `+4 XP`, reaches the first milestone, and all four
    members improve a skill by 2.
  - Other available parties each gain `自主鍛錬 +1 XP (計 1)`.
- Day 2: `《鋼の絆》` is `療養中` and gains no XP/training; the other parties
  gain another `+1 XP`.
- Day 4: `《鋼の絆》` has recovered and its skills have grown. Selecting the
  same request + party again should recompute the prediction; for this seed it
  drops from ~65% to ~33%, proving the cache invalidation works.
- Day 6+: dispatch another available party (e.g. `《森影》(C)` on an `E` escort)
  and continue advancing. After each successful expedition, confirm reputation
  and final HP/MP/Morale update, and that idle parties continue gaining training
  XP until they hit the next milestone.

### UI checks

- `PartyCard` shows `成長 XP {growthXp}/4 · 成長 {milestones}回 · 鍛錬 {days}日`.
- `CampaignHistory` expands to show `成長 / 鍛錬:` events, including
  `完全成功 +4 XP (計 4)`, per-member `skill 46 → 48`, and
  `自主鍛錬 +1 XP (計 N)`.
- `TavernResultDetail` shows final per-member `HP {finalHp}/{maxHp}`
  `MP {finalMp}/{maxMp} Morale {morale}`.
- `CampaignHeader` shows `酒場評判 {reputation} / 100`.

## Phase 6.5 Relationship-driven acceptance and history (`devin/phase6-5-relationship-acceptance`)

- `CampaignParty` now carries a `relationship` object with `affinity`
  (お気に入り), `financialPressure` (懐事情), `riskTolerance` (危険志向:
  `cautious` / `balanced` / `bold`), and `stayExtensionDaysUsed`.
- `evaluateOffer` in `src/core/tavern/acceptance.ts` builds an acceptance
  score from the request/party fit, the leader's `leaderJudgment`, and the
  relationship context. The `BrokeragePanel` shows the response message,
  score/threshold, and an expandable `判定詳細` with `お気に入り`,
  `懐事情`, `危険志向`, and a full score breakdown.
- `relationship.ts` updates `affinity` and `financialPressure` after every
  expedition outcome, during idle/recovery turns, and before scheduled
  departure via `tryExtendStay`. When a stay is extended, the campaign day
  record carries a `stayExtended` relationship event.
- `CampaignHistory` renders a `Relationship:` section for each expanded day
  with `affinityChanged`, `financialPressureChanged`, and `stayExtended`
  entries.

### Natural E2E scenario with `tavern-campaign-001`

- Day 1: select `未踏洞窟の経路測量(E)` and `《鋼の絆》(E)`. Prediction is
  ~65% (`五分以上`). Switch to `《黒曜の斧》(D)`; prediction updates to
  ~94% (`非常に有望`) and the old value does not linger. Switch back to
  `《鋼の絆》`; the same 65% reappears immediately (cache reuse).
- Select `街道周辺の魔物排除(E)` and `《鋼の絆》(E)`. Prediction drops to
  ~32% (`非常に危険`), but the leader still accepts (`appropriate`,
  `72/50`). Resolve: `completeSuccess`; reputation `10 → 13`. The
  `BrokeragePanel` displays the relationship factors and score breakdown.
- Continue through Days 2–14. `PartyCard` updates `お気に入り` and
  `懐事情` after each expedition; recovering parties show `療養中（あとN日）`
  and skip growth/training. `CampaignHistory` expands to show
  `Relationship:` events such as `滞在延長 Day 4 → 6（+2日）`.
- Day 5 naturally produces an elimination request (`洞窟の魔物討伐`) that
  ends in `forcedRetreat`. The `TavernResultDetail` target table shows
  `対象数 4`, `撃破 0`, `逃走 0`, `生存 0`, `Progress 0%`,
  `Completed いいえ`, matching the `forcedRetreat` outcome.

### UI checks

- `PartyCard` shows `お気に入り {affinity}/100（{tier}）`,
  `懐事情 {financialPressure}/100（{tier}）`, and `危険志向：` labels.
- `BrokeragePanel` shows `判断: 受諾（{score}/{threshold}）` and expands to
  `判定詳細` + `Score breakdown` including `お気に入り`, `懐事情`, and
  `危険志向`.
- `CampaignHistory` expands per day to show `Relationship:` entries:
  `affinityChanged`, `financialPressureChanged`, and `stayExtended`.
- `TavernResultDetail` still separates the prediction (hidden after resolve)
  from the actual `依頼結果`, `戦闘結果`, per-member HP/MP/Morale, and
  the target/defeated/escaped/surviving breakdown for elimination requests.

### Test-harness notes for Phase 6.5

- Use `npm run dev` on `http://localhost:5173` for Phase 6.5; the branch
  does not require `preview`.
- Native clicks can be unreliable in the test harness; use console helpers:

  ```js
  document.querySelectorAll('.request-card')[0].click()
  document.querySelectorAll('.party-card')[2].click()
  Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === 'この依頼を紹介する')
    ?.click()
  Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === '本日の仲介を確定')
    ?.click()
  Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === '翌日へ')
    ?.click()
  ```

- If multiple Chrome windows are open, `browser_console` may attach to a
  different window than `computer` captures. Verify the active window by
  setting `document.title = 'UNIQUE'` and using `wmctrl -l | grep UNIQUE`;
  then raise that window with `wmctrl -i -a <window-id>` before recording.

## Phase 6.6 Mission specialization (`devin/phase6-6-mission-specialization`)

- Every `AdventurerParty` now has `missionSpecialization` with one `strongObjective`
  and one `weakObjective` drawn from the six objective types.
- `PartyCard` shows `得意：{label} · 苦手：{label}`.
- `BrokeragePanel` shows `依頼適性：得意（{label}）`, `苦手（{label}）`, or `通常`,
  and `Score breakdown` includes `専門分野: {+8 / -8 / 0}`.
- `runExpedition` and `predictExpeditionOutcome` apply
  `MISSION_SPECIALIZATION_CHECK_MODIFIER` (`strong: +8`, `weak: -8`) and, for
  `elimination` requests, an `ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER`
  (`strong: 0.92`, `weak: 1.08`).
- Acceptance reason codes include `specialtyMatch` (positive modifier pushed the
  party over the threshold) and `specialtyMismatch` (negative modifier pushed it
  under).
- `buildPredictionCacheKey` includes `missionSpecialization`, so predictions are
  invalidated when a party's specialization-relevant state changes.

### Natural E2E scenario with `tavern-campaign-324`

- Day 1 board has three requests including `遺跡の異変調査 [C] 調査`.
- Parties include `黒曜の斧 [D]` (`得意：調査 · 苦手：回収`) and
  `炎獅子団 [E]` (`得意：護衛 · 苦手：調査`).
- Select `遺跡の異変調査` and `黒曜の斧`:
  - `依頼適性：得意（調査）`, prediction `90% 非常に有望`.
  - `この依頼を紹介する` → `specialtyMatch`, `受諾（54 / 50）`, `専門分野: 8`.
- Switch to `炎獅子団`:
  - `依頼適性：苦手（調査）`, prediction `100% 非常に有望`.
  - `この依頼を紹介する` → `tooDangerous (-3 / 50)`, `専門分野: -8` in the
    `Score breakdown`.
- Switch back to `黒曜の斧` to confirm the cached `90%` reappears.
- `本日の仲介を確定` → result detail shows `completeSuccess`, `Objective 100%`,
  per-member HP/MP/Morale, and reputation `10 → 13`.
- Day 2: `黒曜の斧` is `療養中（あと1日）`.
- Day 3: `黒曜の斧` is `受諾可能` with full HP/MP and increased Morale.
- `CampaignHistory` Day 1 expands to show Relationship, growth/training, and
  `療養開始` party events.

### UI checks

- `PartyCard` displays `得意：… / 苦手：…` labels.
- `BrokeragePanel` displays `依頼適性` and `Score breakdown` `専門分野`.
- Acceptance response may use `specialtyMatch` / `specialtyMismatch`.
- `ExpeditionPredictionPanel` updates correctly across party switches and reuses
  cached values when returning to a previously selected pair.
- `TavernResultDetail` shows the actual outcome separately from the prediction.

## Phase 7.2.1 Narrative quality tuning (`devin/phase7-2-1-narrative-quality`)

- UI changes live in the existing `AI文章候補` / `NarrativeQueue` / `NarrativeCandidateCard`
  flow; no new top-level tab is introduced.
- `NarrativeDirector` now produces `NarrativeDirection` with a single `focus`,
  `mainScenes[]`, `secondaryScenes[]`, `montageBeatIds[]`, and
  `interactionHints[]`.
- `buildExpeditionPrompt` falls back to `determineNarrativeDirection` when the
  context does not already carry one, and the rendered prompt is now version `v6`.
- In the UI, expand a candidate's `AIへ送る内容` details to verify the v6
  prompt contains `=== NARRATIVE DIRECTION ===`, `Focus:`, `Main Scenes:`,
  `Secondary Scenes:`, `Montage Beat IDs:`, and `Narrative Interaction Hints:`.
- Expand `Raw Narrative Context` to verify the JSON contains `"direction"` with
  `mainScenes`, `secondaryScenes`, `montageBeatIds`, `focus`, and
  `interactionHints`.
- The `遠征物語を生成` button is used for expedition candidates; other
  character-event candidates still use `生成`.
- A quick deterministic E2E scenario uses seed `tavern-005`:
  1. Open the `酒場キャンペーン` tab and start campaign with `tavern-005`.
  2. Confirm `AI文章候補` is empty, `AI呼び出し: 0回`, `状態: AI未接続`.
  3. Select the first `.request-card` and the first non-disabled `.party-card`,
     click `この依頼を紹介する`, then `本日の仲介を確定`.
  4. Check that a `遠征レポート：...` candidate appears with state `未生成`
     and `AI呼び出し` is still `0`.
  5. Set an invalid HTTP endpoint (`http://localhost:5173/invalid`) and try
     to generate; expect `AI文章の生成に失敗しました。HTTP 404:` and no
     call-count increase.
  6. Switch to `開発用 Fake Provider を使う` and generate the expedition
     candidate; expect `【Fake生成 #1】`, `model: fake-model`, and
     `AI呼び出し: 1回`.
  7. Expand the prompt and raw-context details to confirm the new v6
     `NarrativeDirection` fields.
  8. Click `翌日へ` and confirm the campaign advances without console errors.
- Console checks should allow the expected `Failed to load resource: 404` from
  the provider-error test, but otherwise require zero `error` / `pageerror` /
  unhandled rejection output.

## Phase 8.0 Canvas UI Foundation (`devin/phase8-0-canvas-ui-foundation`)

- A new `Canvas UI` toggle appears in the top-right of the `酒場キャンペーン` Legacy UI.
- Clicking it lazy-loads `GameCanvasHost` and starts a PixiJS v8 `Application`
  (BootScene → FoundationDemoScene after ~1.2 s).
- Virtual resolution is 1600×900; `GameViewport` scales with
  `min(availableWidth/1600, availableHeight/900)` and letterbox/pillarbox
  offsets to keep the UI centered.
- FoundationDemoScene layout:
  - Top bar: `DAY N`, `酒場評判`, `NEXT DAY` (disabled until day resolved).
  - Left panel: `PARTIES` list (one `GameButton` per party).
  - Main panel: `TAVERN` title, `Phase 8.0 Canvas Foundation` subtitle.
  - Bottom bar: `Panel`, `Tooltip`, `Modal`, `Scroll`, `Legacy UI` buttons.
- Clicking `Panel`/`Modal` opens a `GameModal`; `Scroll` opens a modal with a
  `GameScrollView`; hovering `Tooltip` and party buttons shows a `GameTooltip`.
- The bottom `Legacy UI` button unmounts the Canvas and returns to the DOM UI.
- Repeated toggles should leave at most **one** `<canvas>` inside
  `.game-canvas-host`; more than one indicates duplicate Pixi
  Applications/tickers.

### Playwright E2E notes for Canvas UI

- PixiJS buttons are not DOM elements; click them by converting the virtual
  1600×900 coordinates to the canvas bounding-box:

  ```js
  const box = await page
    .locator('.game-canvas-host canvas')
    .first()
    .boundingBox()
  const scale = Math.min(box.width / 1600, box.height / 900)
  const offsetX = (box.width - 1600 * scale) / 2
  const offsetY = (box.height - 900 * scale) / 2
  const screenX = box.x + offsetX + virtualX * scale
  const screenY = box.y + offsetY + virtualY * scale
  await page.mouse.click(screenX, screenY)
  ```

- Useful virtual button centers:
  - `Panel`: (102, 844)
  - `Tooltip`: (252, 844)
  - `Modal`: (418, 844)
  - `Scroll`: (584, 844)
  - `Legacy UI`: (750, 844)
  - Modal close `閉じる`: (1016, 586)
  - First party button: (188, 158)
  - `NEXT DAY`: (1484, 32)

- `page.mouse.move(screenX, screenY)` can be used to hover tooltips. Move the
  cursor from an empty area onto the target so `pointerover` fires.
- Maximize via `wmctrl -r <title>` is unreliable in the harness; set the
  Playwright viewport to a large fixed size instead.
- `npm run test` may print `HTMLCanvasElement.prototype.getContext` errors from
  jsdom tests that import `pixi.js` directly; the tests still pass, but adding
  the `canvas` npm package or mocking `pixi.js` in those tests removes the noise.
- In Chrome on the NVIDIA driver, the first Canvas render may log one-time
  `[.WebGL-...] GPU stall due to ReadPixels` performance warnings. These are
  driver-level, not app `console.warn` calls, but they still appear in the
  Console tab. Count them as a note rather than a functional failure unless the
  project strictly requires zero console output.
