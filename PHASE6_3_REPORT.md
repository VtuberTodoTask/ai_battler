# Phase 6.3 Report — Roster-aware Request Generation

## Goal

Generate daily tavern requests so that at least two of the three requests are serviceable by the currently available parties, while still allowing one challenge slot up to one rank above the highest available party.

## Previous problem

Request generation relied solely on tavern reputation, producing days where all three requests outranked every available party (e.g. four E-ranked parties facing D/D/C requests).

## Current request-generation behavior

`generateTavernRequestsForDay` now receives `availablePartyRanks` and plans two serviceable slots and one challenge slot. Ranks are selected from the filtered reputation weights; if the filtered weights are all zero the slot falls back to the anchor rank.

## Roster-aware rank planning

- `planRequestRanksForDay(daySeed, reputation, availablePartyRanks)` returns `{ serviceableA, serviceableB, open }`.
- Available ranks are canonical-sorted and deterministically shuffled to pick two anchor ranks.
- Challenge cap is `min(highestAvailableRank + 1, S)`.
- When no parties are available the planner falls back to the existing reputation-only weights.

## Serviceable slots

Two slots are constrained to ranks `<=` their anchor party rank. Weighted picks use the existing `getRequestRankWeights(reputation)` filtered to that range.

## Challenge slot

The third slot is capped at `highestAvailableRank + 1` and uses the same filtered reputation weights.

## Reputation interaction

Serviceable and challenge slots still draw from `getRequestRankWeights`, so higher reputation makes higher allowed ranks more likely without breaking the roster cap.

## Recovering-party exclusion

`advanceCampaignDay` computes `availablePartyRanks` from parties that are not recovering on the next day.

## No-available-party fallback

If every party is recovering or the roster is empty, `planRequestRanksForDay` uses the existing reputation-only distribution and still produces three requests.

## Determinism

The same `daySeed`, `reputation`, and `availablePartyRanks` multiset always produce the same plan, regardless of the input array order.

## 1000-day distribution audit

### EEEE @ rep 10

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.44
- Days with <2 serviceable: 0
- Requests above max party rank: 563
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 2437  | 81.2 |
| D    | 563   | 18.8 |
| C    | 0     | 0.0  |
| B    | 0     | 0.0  |
| A    | 0     | 0.0  |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E    | D   | C   | B   | A   | S   |
| ---- | ---- | --- | --- | --- | --- | --- |
| 0    | 1000 | 0   | 0   | 0   | 0   | 0   |
| 1    | 1000 | 0   | 0   | 0   | 0   | 0   |
| 2    | 437  | 563 | 0   | 0   | 0   | 0   |

### EEDD @ rep 10

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.79
- Days with <2 serviceable: 0
- Requests above max party rank: 212
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 1789  | 59.6 |
| D    | 999   | 33.3 |
| C    | 212   | 7.1  |
| B    | 0     | 0.0  |
| A    | 0     | 0.0  |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 715 | 285 | 0   | 0   | 0   | 0   |
| 1    | 713 | 287 | 0   | 0   | 0   | 0   |
| 2    | 361 | 427 | 212 | 0   | 0   | 0   |

### DDDD @ rep 30

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.61
- Days with <2 serviceable: 0
- Requests above max party rank: 394
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 725   | 24.2 |
| D    | 1881  | 62.7 |
| C    | 394   | 13.1 |
| B    | 0     | 0.0  |
| A    | 0     | 0.0  |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 277 | 723 | 0   | 0   | 0   | 0   |
| 1    | 284 | 716 | 0   | 0   | 0   | 0   |
| 2    | 164 | 442 | 394 | 0   | 0   | 0   |

### DDCC @ rep 30

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.89
- Days with <2 serviceable: 0
- Requests above max party rank: 112
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 616   | 20.5 |
| D    | 1536  | 51.2 |
| C    | 736   | 24.5 |
| B    | 112   | 3.7  |
| A    | 0     | 0.0  |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 236 | 574 | 190 | 0   | 0   | 0   |
| 1    | 239 | 568 | 193 | 0   | 0   | 0   |
| 2    | 141 | 394 | 353 | 112 | 0   | 0   |

### CCCC @ rep 50

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.65
- Days with <2 serviceable: 0
- Requests above max party rank: 345
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 0     | 0.0  |
| D    | 747   | 24.9 |
| C    | 1908  | 63.6 |
| B    | 345   | 11.5 |
| A    | 0     | 0.0  |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 0   | 289 | 711 | 0   | 0   | 0   |
| 1    | 0   | 272 | 728 | 0   | 0   | 0   |
| 2    | 0   | 186 | 469 | 345 | 0   | 0   |

### CBBB @ rep 60

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.63
- Days with <2 serviceable: 0
- Requests above max party rank: 365
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 0     | 0.0  |
| D    | 0     | 0.0  |
| C    | 1057  | 35.2 |
| B    | 1578  | 52.6 |
| A    | 365   | 12.2 |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 0   | 0   | 462 | 538 | 0   | 0   |
| 1    | 0   | 0   | 444 | 556 | 0   | 0   |
| 2    | 0   | 0   | 151 | 484 | 365 | 0   |

### AAAA @ rep 90

- Days sampled: 1000
- Total requests: 3000
- Average serviceable requests/day: 2.57
- Days with <2 serviceable: 0
- Requests above max party rank: 431
- Requests above max party rank + 1: 0

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 0     | 0.0  |
| D    | 0     | 0.0  |
| C    | 0     | 0.0  |
| B    | 677   | 22.6 |
| A    | 1892  | 63.1 |
| S    | 431   | 14.4 |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 0   | 0   | 0   | 262 | 738 | 0   |
| 1    | 0   | 0   | 0   | 272 | 728 | 0   |
| 2    | 0   | 0   | 0   | 143 | 426 | 431 |

### empty roster @ rep 10

- Days sampled: 1000
- Total requests: 3000
- No available parties; reputation-only fallback used.

Rank distribution:

| Rank | Count | %    |
| ---- | ----- | ---- |
| E    | 1082  | 36.1 |
| D    | 1331  | 44.4 |
| C    | 587   | 19.6 |
| B    | 0     | 0.0  |
| A    | 0     | 0.0  |
| S    | 0     | 0.0  |

Slot distribution:

| Slot | E   | D   | C   | B   | A   | S   |
| ---- | --- | --- | --- | --- | --- | --- |
| 0    | 389 | 424 | 187 | 0   | 0   | 0   |
| 1    | 351 | 444 | 205 | 0   | 0   | 0   |
| 2    | 342 | 463 | 195 | 0   | 0   | 0   |

## Campaign smoke

The `requestRanks.test.ts` campaign smoke advances 30 days and verifies that, whenever at least one party is available, at least two daily requests are serviceable and no request exceeds `maxPartyRank + 1`.

## Browser E2E

Recorded E2E advanced the tavern campaign and confirmed that daily request ranks now align with the available roster instead of overrunning it.

## Known limitations

- Role composition is not used when selecting request ranks.
- Acceptance results are not used when generating requests.
- Prediction success rates are not used when generating requests.
- Objective type selection remains Roster-agnostic.
- At least two requests are rank-serviceable, but actual success is not guaranteed (poor role fit, injuries, etc.).
- The challenge slot may still be one rank above the best available party.

## Verification

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm test`: passed
- `npm run build`: passed
- `npm run test:expedition-regression`: 22/22 passed
