# Phase 6.4 Report — Party Experience / Idle Training / Skill Growth

## Goal

Add deterministic, seed-driven progression to campaign parties so that:

- Parties dispatched on expeditions gain experience based on the expedition outcome.
- Parties that remain available but are not dispatched perform idle training.
- Recovering parties and casualty-departing parties do not progress.
- Growth is expressed as skill improvements in role-relevant skills, capped by existing skill caps.

## Previous behavior

Parties had no persistent growth. A party's stats and skills were fixed from the moment it was generated until it left the campaign. Success or failure only affected HP, MP, morale, injuries, and reputation.

## Growth XP model

A new `CampaignPartyProgression` snapshot tracks:

- `growthXp`: current XP toward the next milestone.
- `totalGrowthXp`: cumulative XP earned over the campaign.
- `growthMilestones`: number of milestones consumed.
- `trainingDays`: number of days the party spent in idle training.

Constants (fixed for Phase 6.4):

- `PARTY_GROWTH_XP_THRESHOLD = 4`
- `EXPEDITION_GROWTH_XP = { completeSuccess: 4, success: 3, partialSuccess: 2, failedObjective: 1, forcedRetreat: 1, lostExpedition: 0 }`
- `TRAINING_GROWTH_XP = 1`
- `SKILL_GROWTH_PER_MILESTONE = 2`

## Expedition XP

When a day is resolved, each dispatched party receives XP from `EXPEDITION_GROWTH_XP` based on the actual expedition outcome. The order is:

```text
completeSuccess (4) > success (3) > partialSuccess (2) > failedObjective / forcedRetreat (1) > lostExpedition (0)
```

This ordering is intentionally stricter than or equal to training, so sending a party on a dangerous expedition and failing is never better than leaving it to train.

## Idle training

After all expeditions for the day are resolved, every remaining party that is:

- available,
- not dispatched,
- not departing due to casualty,
- not recovering,

receives `TRAINING_GROWTH_XP = 1`. `trainingDays` is incremented for the party.

## Growth milestones

Whenever `growthXp >= 4`, a milestone is consumed and `growthXp` is reduced by `4`. Each milestone applies `+2` to one role-relevant skill for every party member. Expert skills are weighted twice as heavily as trained skills. If a skill is already at the cap, it is excluded from selection. If a member has no uncapped role-relevant skills, that member gains nothing for that milestone, but the milestone is still consumed.

## Skill growth

Skill growth is deterministic and uses a per-member seed:

```text
growth:v1:<campaignSeed>:<partyArrivalSerial>:<milestoneIndex>:<memberId>
```

This avoids iteration-order dependencies and ensures the same campaign always produces the same skill improvements.

## Skill caps

- Normal-rank members: `MAX_SKILL_NORMAL = 95`
- S-rank members: `MAX_SKILL_S = 100`

Actual `member.skills` is updated directly, so battle, expedition checks, and predictions naturally use the grown values.

## Recovery interaction

Recovering parties gain no XP and do not train. When recovery completes, the party is again eligible for training if it is not dispatched.

## Casualty interaction

A party flagged with `departingCasualty = true` receives no XP and is removed from the roster at the start of the next day. The day history records `progressionSkipped: casualty departure` for debugging.

## Prediction cache invalidation

The prediction cache key for the UI now includes `member.stats` and `member.skills` in addition to `id`, `currentHp`, `currentMp`, `morale`, and `statusEffects`. This prevents stale predictions after a party grows.

## Campaign history

Each `TavernDayRecord` now stores `progressionEvents`. The campaign history UI displays growth/training events when a day is expanded, e.g.:

```text
《銀灯》 完全成功 +4 XP (計 4)
アレン: scouting 58 → 60
```

## Party card UI

Campaign party cards display a compact progression line:

```text
成長 XP 3/4 · 成長 2回 · 鍛錬 5日
```

## 30-day audit

`scripts/phase6-4-progression-audit.ts` runs a 30-day campaign over 5 seeds and writes `reports/phase6_4_progression_audit.json`.

Combined results from the audit:

- Total expedition XP: 407
- Total training XP: 383
- Average XP per outcome:
  - completeSuccess: 4.0
  - success: 3.0
  - partialSuccess: 2.0
  - failedObjective: 1.0
  - forcedRetreat: 1.0
  - training: 1.0
- Estimated total milestones: 138 (from `totalSkillImprovements / 4`)
- Total skill increase: 1101
- Max single skill increase: 2
- Final parties with at least one milestone: 45%
- Final parties with zero growth: 0%

The failure-farming guard holds: even over many days, `completeSuccess > success > partialSuccess >= training` and `failedObjective / forcedRetreat` are never better than training.

## Verification

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm test`: 692 passed
- `npm run build`: passed
- `npm run test:expedition-regression`: 22/22 passed
- Browser E2E: passed (seed `tavern-campaign-001`, 8 days)

## Known limitations

- Party Rank does not increase.
- Member Rank does not increase.
- Existing `level` does not grow.
- Base stats (STR/CON/DEX/INT/PER/WIL/SOC) do not grow.
- Max HP/MP do not grow.
- Traits do not increase.
- Equipment does not grow.
- Departing parties cannot return in this phase.
- The player cannot influence which skill trains or how training is conducted.

## Browser E2E

Recorded browser E2E was performed on the built preview (`npm run build && npm run preview -- --host`) with campaign seed `tavern-campaign-001`, advancing 8 days. See `test-report-phase6-4.md` and the video at `/home/ubuntu/screencasts/phase64-tavern-campaign/phase64-tavern-campaign-edited.mp4` for the full run.

Key checks:

- Day 1: `未踏洞窟の経路測量(E)` + `《鋼の絆》(E)` predicted **65%**. Switching to `街道周辺の魔物排除(E)` updated the prediction to **32%**; no stale prediction remained.
- Day 1 resolve: `completeSuccess` / `victory`, reputation `10 → 13 (+3)`. `《鋼の絆》` received `+4 XP`, reached the first milestone, and all members gained `+2` in one role-relevant skill. Other available parties each received `自主鍛錬 +1 XP`.
- Day 2: `《鋼の絆》` was `療養中` and gained no progression; other parties continued training.
- Day 4: after recovery, the same `未踏洞窟の経路測量(E)` + `《鋼の絆》(E)` recomputed to **33%** because `buildPredictionCacheKey` now includes `skills` and `stats`.
- Day 6: `商人の護衛(E)` + `《森影》(C)` predicted **90%** and resolved `completeSuccess`, reputation `13 → 16 (+3)`.
- Day 8: all request ranks stayed within the highest available party rank + 1, and idle training XP continued for non-recovering, non-dispatched parties.
- Browser console: no errors or unhandled rejections.

All checked scenarios passed.
