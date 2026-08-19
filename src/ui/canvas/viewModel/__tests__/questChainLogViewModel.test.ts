import { describe, expect, it } from 'vitest'
import {
  buildQuestChainLogViewModel,
  questChainStatusLabel,
} from '../questChainLogViewModel.ts'
import { createTavernCampaign } from '../../../../core/tavern/campaign/campaign.ts'
import type {
  QuestChainState,
  QuestChainStatus,
} from '../../../../core/tavern/campaign/types.ts'

function buildFakeChain(
  overrides: Partial<QuestChainState> = {},
): QuestChainState {
  return {
    id: 'quest-chain:1:tavern-request-0-seed',
    definitionId: 'chain-a',
    status: 'active',
    startedDay: 1,
    rankCeiling: 'D',
    steps: [
      {
        stepNumber: 1,
        scheduledDay: 1,
        status: 'resolved',
        outcome: 'success',
        partyId: 'party-1',
        request: {
          id: 'tavern-request-0-seed',
          title: '旧坑道の異変調査',
          briefing: '',
          objectiveType: 'investigation',
          rank: 'D',
          environment: 'ruins',
          publicTags: [],
          recommendedPartySize: 4,
          expeditionRequest: {} as never,
          rewardTerms: {} as never,
        },
      },
    ],
    ...overrides,
  }
}

describe('Phase 9.6 quest chain log viewModel', () => {
  it('maps every chain status to a player-facing label', () => {
    const cases: [QuestChainStatus, string][] = [
      ['active', '進行中'],
      ['completed', '完了'],
      ['failed', '失敗'],
      ['abandoned', '見送り'],
    ]
    for (const [status, label] of cases) {
      expect(questChainStatusLabel(status)).toBe(label)
    }
  })

  it('never shows raw chainId/definitionId, even for a chain with an unknown definition', () => {
    const campaign = createTavernCampaign('chain-log-vm-fallback')
    campaign.questChains = [
      buildFakeChain({
        // @ts-expect-error intentionally invalid for this fallback test
        definitionId: 'chain-does-not-exist',
      }),
    ]
    const vm = buildQuestChainLogViewModel(campaign, { sceneId: 'tavern' })
    expect(vm.rows).toHaveLength(1)
    const row = vm.rows[0]
    expect(row.definitionTitle).not.toContain('chain-does-not-exist')
    expect(row.definitionTitle).not.toContain('quest-chain:')
    expect(row.definitionTitle).toContain('記録を確認できません')
  })

  it('builds a readable row for a known, active chain', () => {
    const campaign = createTavernCampaign('chain-log-vm-active')
    campaign.questChains = [
      buildFakeChain({
        steps: [
          buildFakeChain().steps[0],
          {
            stepNumber: 2,
            scheduledDay: 2,
            status: 'scheduled',
            request: {
              ...buildFakeChain().steps[0].request,
              id: 'quest-chain-request:quest-chain:1:tavern-request-0-seed:2',
            },
          },
        ],
      }),
    ]
    const vm = buildQuestChainLogViewModel(campaign, { sceneId: 'tavern' })
    expect(vm.rows).toHaveLength(1)
    const row = vm.rows[0]
    expect(row.definitionTitle).toBe('痕跡の先へ')
    expect(row.statusLabel).toBe('進行中')
    expect(row.startedDayLabel).toBe('DAY 1')
    expect(row.steps).toHaveLength(2)
    expect(row.steps[0].title).toBe('旧坑道の異変調査')
    expect(row.steps[0].statusLabel).toBe('成功')
    expect(row.steps[1].statusLabel).toBe('掲示中')
  })
})
