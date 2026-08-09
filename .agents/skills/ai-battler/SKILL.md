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
