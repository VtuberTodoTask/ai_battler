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
