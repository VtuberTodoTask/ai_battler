import { describe, expect, it } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { dispatchMainQuest } from './dispatch.ts'
import { buildMainQuestBattlePlaybackPlan } from './playback.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from './threats.ts'
import type { MainQuestBattleTrace, MainQuestNarrativeScript } from './types.ts'

function resolvedAttempt() {
  const campaign = createTavernCampaign('mainquest-playback-001')
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.alden
  const party = campaign.parties[0]
  party.party.rank = definition.requiredPartyRank
  party.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === party.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  campaign.finance.funds = definition.fee + 1000

  const dispatch = dispatchMainQuest(campaign, 'alden', party.id)
  if (!dispatch.ok) throw new Error('setup: dispatch failed')
  const resolved = resolveCampaignDay(dispatch.campaign)
  const attempt = resolved.mainQuest.attempts.find(
    (a) => a.id === dispatch.attemptId,
  )!
  return attempt.battleTrace!
}

describe('Phase 9.8 Main Quest Battle Playback Plan', () => {
  it('is deterministic for the same Trace', () => {
    const trace = resolvedAttempt()
    const first = buildMainQuestBattlePlaybackPlan(trace)
    const second = buildMainQuestBattlePlaybackPlan(trace)
    expect(second).toEqual(first)
  })

  it('every battleEvent step corresponds 1:1, in order, to trace.events', () => {
    const trace = resolvedAttempt()
    const plan = buildMainQuestBattlePlaybackPlan(trace)
    const battleEventSteps = plan.steps.filter((s) => s.kind === 'battleEvent')
    expect(battleEventSteps.map((s) => s.event)).toEqual(trace.events)
  })

  it('with no narrative, produces zero dialogue steps', () => {
    const trace = resolvedAttempt()
    const plan = buildMainQuestBattlePlaybackPlan(trace)
    expect(plan.steps.some((s) => s.kind === 'dialogue')).toBe(false)
  })

  it('inserts a dialogue step immediately after its anchor event, and only for anchors that occurred', () => {
    const trace: MainQuestBattleTrace = {
      seed: 'x',
      monsterId: 'alden',
      initialSnapshot: {
        partyMembers: [
          {
            characterId: 'a',
            currentHp: 50,
            maxHp: 50,
            currentMp: 20,
            maxMp: 20,
            statuses: [],
          },
        ],
        monster: { currentHp: 100, maxHp: 100, statuses: [] },
      },
      events: [
        {
          type: 'battleStarted',
          monsterId: 'alden',
          monsterName: 'X',
          partyMemberIds: ['a'],
        },
        { type: 'monsterReactionAnchor', round: 1, anchorId: 'battle_start' },
        { type: 'roundStarted', round: 1 },
      ],
      occurredAnchors: ['battle_start'],
    }
    const narrative: MainQuestNarrativeScript = {
      preBattle: '',
      postBattle: '',
      battleInterludes: [
        {
          anchorId: 'battle_start',
          speakerId: 'monster',
          text: 'hello',
        },
        {
          // Not in occurredAnchors — must never appear in the plan.
          anchorId: 'monster_defeated',
          speakerId: 'monster',
          text: 'should not appear',
        },
      ],
      promptVersion: 'v1',
      providerId: 'fake',
      createdAt: new Date().toISOString(),
    }

    const plan = buildMainQuestBattlePlaybackPlan(trace, narrative)
    expect(plan.steps).toEqual([
      { kind: 'battleEvent', event: trace.events[0] },
      { kind: 'battleEvent', event: trace.events[1] },
      { kind: 'dialogue', cue: narrative.battleInterludes[0] },
      { kind: 'battleEvent', event: trace.events[2] },
    ])
  })
})
