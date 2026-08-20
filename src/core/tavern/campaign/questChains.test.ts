import { describe, expect, it } from 'vitest'
import {
  QUEST_CHAIN_CONFIG,
  buildChainRequestId,
  buildQuestChainId,
  collectDueChainRequests,
  planQuestChainStepRank,
  resolveQuestChainsForDay,
} from './questChains.ts'
import type { ResolvedDispatch, TavernRequestOffer } from '../types.ts'
import type { QuestChainState } from './types.ts'

const CAMPAIGN_SEED = 'quest-chain-unit'

function fakeRequest(
  overrides: Partial<TavernRequestOffer> = {},
): TavernRequestOffer {
  return {
    id: 'fake-request',
    title: 'テスト依頼',
    briefing: '',
    objectiveType: 'investigation',
    rank: 'D',
    environment: 'ruins',
    publicTags: [],
    recommendedPartySize: 4,
    expeditionRequest: {} as never,
    rewardTerms: {} as never,
    ...overrides,
  }
}

function buildResolvedDispatch(
  overrides: Partial<Omit<ResolvedDispatch, 'request'>> & {
    requestId: string
    request?: Partial<TavernRequestOffer>
  },
): ResolvedDispatch {
  const { request: requestOverrides, ...rest } = overrides
  return {
    request: fakeRequest({ id: overrides.requestId, ...requestOverrides }),
    partyId: 'party-1',
    partyName: 'テストパーティ',
    leaderName: 'リーダー',
    memberIds: ['member-1'],
    status: 'resolved',
    result: { outcome: 'completeSuccess' } as never,
    ...rest,
  }
}

/** Finds a requestId (within a bounded search) whose deterministic Start
 * Roll succeeds for the given day, so start-path tests are fast and
 * reliable without depending on real gameplay RNG. */
function findWinningRequestId(dayNumber: number): string {
  for (let i = 0; i < 200; i++) {
    const requestId = `tavern-request-${i}-day-${dayNumber}`
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber,
      currentChains: [],
      results: [buildResolvedDispatch({ requestId })],
      afterTavernRank: 1,
    })
    if (chains.length > 0) return requestId
  }
  throw new Error('no winning start-roll requestId found within budget')
}

/** Finds a requestId whose Start Roll fails, for negative-path tests. */
function findLosingRequestId(dayNumber: number): string {
  for (let i = 0; i < 200; i++) {
    const requestId = `tavern-request-losing-${i}-day-${dayNumber}`
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber,
      currentChains: [],
      results: [buildResolvedDispatch({ requestId })],
      afterTavernRank: 1,
    })
    if (chains.length === 0) return requestId
  }
  throw new Error('no losing start-roll requestId found within budget')
}

describe('Phase 9.6 resolveQuestChainsForDay (unit)', () => {
  it('starts a chain from an eligible investigation success on a winning roll', () => {
    const requestId = findWinningRequestId(1)
    const { chains, events } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: [],
      results: [buildResolvedDispatch({ requestId })],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(1)
    expect(chains[0].status).toBe('active')
    expect(chains[0].id).toBe(buildQuestChainId(1, requestId))
    expect(chains[0].steps).toHaveLength(2)
    expect(chains[0].steps[0].stepNumber).toBe(1)
    expect(chains[0].steps[0].status).toBe('resolved')
    expect(chains[0].steps[1].stepNumber).toBe(2)
    expect(chains[0].steps[1].status).toBe('scheduled')
    expect(chains[0].steps[1].scheduledDay).toBe(2)
    expect(chains[0].steps[1].request.chain).toEqual({
      chainId: chains[0].id,
      stepNumber: 2,
      totalSteps: 3,
    })
    expect(events).toEqual([
      { type: 'started', chainId: chains[0].id, dayNumber: 1 },
    ])
  })

  it('does not start a chain on a losing roll, even for an eligible success', () => {
    const requestId = findLosingRequestId(1)
    const { chains, events } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: [],
      results: [buildResolvedDispatch({ requestId })],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  it('does not start a chain from a partialSuccess standalone result', () => {
    const requestId = findWinningRequestId(2)
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: [],
      results: [
        buildResolvedDispatch({
          requestId,
          result: { outcome: 'partialSuccess' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(0)
  })

  it('does not start a chain from an ineligible objective (elimination/escort)', () => {
    const requestId = findWinningRequestId(3)
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: [],
      results: [
        buildResolvedDispatch({
          requestId,
          request: { objectiveType: 'elimination' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(0)
  })

  it('starts at most one new chain per day even with several eligible winning successes', () => {
    const idA = findWinningRequestId(10)
    const idB = findWinningRequestId(11)
    const { chains, events } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: [],
      results: [
        buildResolvedDispatch({ requestId: idA }),
        buildResolvedDispatch({ requestId: idB }),
      ],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(1)
    expect(events.filter((e) => e.type === 'started')).toHaveLength(1)
  })

  it('starts no new chain when already at the active cap', () => {
    const requestId = findWinningRequestId(20)
    const existingChains: QuestChainState[] = Array.from(
      { length: QUEST_CHAIN_CONFIG.maxActiveChains },
      (_, i): QuestChainState => ({
        id: `existing-chain-${i}`,
        definitionId: 'chain-a',
        status: 'active',
        startedDay: 1,
        rankCeiling: 'D',
        steps: [
          {
            stepNumber: 2,
            scheduledDay: 5,
            status: 'scheduled',
            request: fakeRequest({
              id: `existing-request-${i}`,
              objectiveType: 'elimination',
            }),
          },
        ],
      }),
    )
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: existingChains,
      results: [buildResolvedDispatch({ requestId })],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(existingChains.length)
  })

  it('rejects the origin objective if it does not belong to any chain definition (elimination/escort excluded)', () => {
    const requestId = findWinningRequestId(30)
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 1,
      currentChains: [],
      results: [
        buildResolvedDispatch({
          requestId,
          request: { objectiveType: 'escort' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains).toHaveLength(0)
  })

  function makeActiveChainAtStep(
    stepNumber: 2 | 3,
    scheduledDay: number,
    originRank: 'D' = 'D',
  ): QuestChainState {
    const chainId = 'chain-under-test'
    return {
      id: chainId,
      definitionId: 'chain-a',
      status: 'active',
      startedDay: scheduledDay - (stepNumber - 1),
      rankCeiling: 'S',
      steps: [
        {
          stepNumber: 1,
          scheduledDay: scheduledDay - (stepNumber - 1),
          status: 'resolved',
          outcome: 'completeSuccess',
          partyId: 'party-1',
          request: fakeRequest({
            id: 'origin-request',
            title: '起点の依頼',
            objectiveType: 'investigation',
            rank: originRank,
          }),
        },
        ...(stepNumber === 3
          ? [
              {
                stepNumber: 2 as const,
                scheduledDay: scheduledDay - 1,
                status: 'resolved' as const,
                outcome: 'success' as const,
                partyId: 'party-1',
                request: fakeRequest({
                  id: buildChainRequestId(chainId, 2),
                  title: 'Step2',
                  objectiveType: 'elimination',
                  rank: originRank,
                  chain: { chainId, stepNumber: 2, totalSteps: 3 },
                }),
              },
            ]
          : []),
        {
          stepNumber,
          scheduledDay,
          status: 'scheduled',
          request: fakeRequest({
            id: buildChainRequestId(chainId, stepNumber),
            title: `Step${stepNumber}`,
            objectiveType: stepNumber === 2 ? 'elimination' : 'retrieval',
            rank: originRank,
            chain: { chainId, stepNumber, totalSteps: 3 },
          }),
        },
      ],
    }
  }

  it('advances Step 2 success to a scheduled Step 3', () => {
    const chain = makeActiveChainAtStep(2, 5)
    const step2 = chain.steps[1]
    const { chains, events } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 5,
      currentChains: [chain],
      results: [
        buildResolvedDispatch({
          requestId: step2.request.id,
          request: step2.request,
          result: { outcome: 'success' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains[0].status).toBe('active')
    expect(chains[0].steps).toHaveLength(3)
    expect(chains[0].steps[2].stepNumber).toBe(3)
    expect(chains[0].steps[2].status).toBe('scheduled')
    expect(chains[0].steps[2].scheduledDay).toBe(6)
    expect(events).toEqual([
      {
        type: 'advanced',
        chainId: chain.id,
        dayNumber: 5,
        completedStep: 2,
        nextStep: 3,
      },
    ])
  })

  it('advances Step 2 partialSuccess too (continuation, not failure)', () => {
    const chain = makeActiveChainAtStep(2, 5)
    const step2 = chain.steps[1]
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 5,
      currentChains: [chain],
      results: [
        buildResolvedDispatch({
          requestId: step2.request.id,
          request: step2.request,
          result: { outcome: 'partialSuccess' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains[0].status).toBe('active')
    expect(chains[0].steps).toHaveLength(3)
  })

  it('fails the chain on Step 2 failedObjective/forcedRetreat/lostExpedition', () => {
    for (const outcome of [
      'failedObjective',
      'forcedRetreat',
      'lostExpedition',
    ] as const) {
      const chain = makeActiveChainAtStep(2, 5)
      const step2 = chain.steps[1]
      const { chains, events } = resolveQuestChainsForDay({
        campaignSeed: CAMPAIGN_SEED,
        dayNumber: 5,
        currentChains: [chain],
        results: [
          buildResolvedDispatch({
            requestId: step2.request.id,
            request: step2.request,
            result: { outcome } as never,
          }),
        ],
        afterTavernRank: 1,
      })
      expect(chains[0].status).toBe('failed')
      expect(chains[0].steps.every((s) => s.status !== 'scheduled')).toBe(true)
      expect(events).toEqual([
        { type: 'failed', chainId: chain.id, dayNumber: 5, outcome },
      ])
    }
  })

  it('abandons the chain when the due step is notBrokered', () => {
    const chain = makeActiveChainAtStep(2, 5)
    const step2 = chain.steps[1]
    const { chains, events } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 5,
      currentChains: [chain],
      results: [
        {
          requestId: step2.request.id,
          request: step2.request,
          memberIds: [],
          status: 'notBrokered',
        },
      ],
      afterTavernRank: 1,
    })
    expect(chains[0].status).toBe('abandoned')
    expect(events).toEqual([
      { type: 'abandoned', chainId: chain.id, dayNumber: 5 },
    ])
  })

  it('completes the chain on Step 3 success', () => {
    const chain = makeActiveChainAtStep(3, 6)
    const step3 = chain.steps[2]
    const { chains, events } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 6,
      currentChains: [chain],
      results: [
        buildResolvedDispatch({
          requestId: step3.request.id,
          request: step3.request,
          result: { outcome: 'success' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains[0].status).toBe('completed')
    expect(events).toEqual([
      { type: 'completed', chainId: chain.id, dayNumber: 6 },
    ])
  })

  it('completes the chain on Step 3 partialSuccess too', () => {
    const chain = makeActiveChainAtStep(3, 6)
    const step3 = chain.steps[2]
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 6,
      currentChains: [chain],
      results: [
        buildResolvedDispatch({
          requestId: step3.request.id,
          request: step3.request,
          result: { outcome: 'partialSuccess' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains[0].status).toBe('completed')
  })

  it('fails the chain on Step 3 failure', () => {
    const chain = makeActiveChainAtStep(3, 6)
    const step3 = chain.steps[2]
    const { chains } = resolveQuestChainsForDay({
      campaignSeed: CAMPAIGN_SEED,
      dayNumber: 6,
      currentChains: [chain],
      results: [
        buildResolvedDispatch({
          requestId: step3.request.id,
          request: step3.request,
          result: { outcome: 'failedObjective' } as never,
        }),
      ],
      afterTavernRank: 1,
    })
    expect(chains[0].status).toBe('failed')
  })
})

describe('Phase 9.6 planQuestChainStepRank (unit)', () => {
  it('Step 3 tiers up from the origin rank, clamped to the rank ceiling', () => {
    expect(planQuestChainStepRank('D', 3, 'C')).toBe('C')
  })

  it('Step 3 clamps to the ceiling when the tier-up would exceed it', () => {
    expect(planQuestChainStepRank('D', 3, 'D')).toBe('D')
  })

  it('Step 3 at S stays S (already at the top of the rank scale)', () => {
    expect(planQuestChainStepRank('S', 3, 'S')).toBe('S')
  })

  it('Step 1/2 always use the origin rank (clamped defensively to the ceiling)', () => {
    expect(planQuestChainStepRank('D', 1, 'S')).toBe('D')
    expect(planQuestChainStepRank('D', 2, 'S')).toBe('D')
  })
})

describe('Phase 9.6 collectDueChainRequests (unit)', () => {
  it('throws (does not silently truncate) when more requests are due than the configured max', () => {
    const chains: QuestChainState[] = Array.from(
      { length: QUEST_CHAIN_CONFIG.maxChainRequestsPerDay + 1 },
      (_, i): QuestChainState => ({
        id: `chain-${i}`,
        definitionId: 'chain-a',
        status: 'active',
        startedDay: 1,
        rankCeiling: 'D',
        steps: [
          {
            stepNumber: 2,
            scheduledDay: 5,
            status: 'scheduled',
            request: fakeRequest({
              id: `req-${i}`,
              objectiveType: 'elimination',
            }),
          },
        ],
      }),
    )
    expect(() => collectDueChainRequests(chains, 5)).toThrow()
  })
})
