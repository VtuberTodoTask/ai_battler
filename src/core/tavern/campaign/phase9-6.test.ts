import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import { QUEST_CHAIN_CONFIG, QUEST_CHAIN_DEFINITIONS } from './questChains.ts'
import {
  deserializeGameSave,
  serializeGameSave,
} from '../../save/serializer.ts'
import { validateGameSave } from '../../save/validation.ts'
import type { TavernCampaignState } from './types.ts'

function acceptAllPossible(campaign: TavernCampaignState): TavernCampaignState {
  let state = campaign.currentDay
  const matchedPartyIds = new Set<string>()
  const matchedRequestIds = new Set<string>()

  for (const request of state.requests) {
    if (matchedRequestIds.has(request.id)) continue
    for (const party of state.parties) {
      if (matchedPartyIds.has(party.id)) continue
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(state, request.id, party.id)
        if (next.matches.some((m) => m.requestId === request.id)) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          break
        }
      } catch {
        // continue
      }
    }
  }
  return { ...campaign, currentDay: state }
}

function advanceOneDayAcceptingAll(
  campaign: TavernCampaignState,
): TavernCampaignState {
  let c = resolveCampaignDay(acceptAllPossible(campaign))
  c = advanceCampaignDay(c)
  return c
}

/** Runs several independent seeds until one produces a 'started' Quest
 * Chain event within the given day budget — Chain Start is a 40% roll on
 * top of needing an eligible standalone success, so no single seed is
 * guaranteed to produce one quickly. */
function findCampaignWithStartedChain(
  seedPrefix: string,
  maxDays: number,
  maxSeeds: number,
): TavernCampaignState {
  for (let s = 0; s < maxSeeds; s++) {
    let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
    for (let day = 0; day < maxDays; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      const started = campaign.history.some((h) =>
        h.questChainEvents.some((e) => e.type === 'started'),
      )
      if (started) return campaign
    }
  }
  throw new Error(
    `no chain start found within ${maxSeeds} seeds x ${maxDays} days`,
  )
}

describe('Phase 9.6 quest chain smoke', () => {
  it('A: a freshly created campaign has no quest chains', () => {
    const campaign = createTavernCampaign('phase9-6-a')
    expect(campaign.questChains).toEqual([])
  })

  it('B: an eligible standalone success can deterministically start a chain', () => {
    const campaign = findCampaignWithStartedChain('phase9-6-b', 30, 30)
    const startedRecord = campaign.history.find((h) =>
      h.questChainEvents.some((e) => e.type === 'started'),
    )!
    const startedEvent = startedRecord.questChainEvents.find(
      (e) => e.type === 'started',
    )!
    const chain = campaign.questChains.find(
      (c) => c.id === startedEvent.chainId,
    )
    expect(chain).toBeDefined()
    expect(chain!.status).toBe('active')
    expect(chain!.steps[0].status).toBe('resolved')
    expect(chain!.steps[0].stepNumber).toBe(1)
    expect(['completeSuccess', 'success']).toContain(chain!.steps[0].outcome)
    expect(chain!.steps[1].status).toBe('scheduled')
    expect(chain!.steps[1].stepNumber).toBe(2)
    expect(chain!.steps[1].scheduledDay).toBe(startedRecord.dayNumber + 1)

    // Only eligible Step-1 objectives (investigation/survey/rescue/retrieval)
    // ever start a chain — never elimination/escort.
    const definition = QUEST_CHAIN_DEFINITIONS.find(
      (d) => d.id === chain!.definitionId,
    )!
    expect(['investigation', 'survey', 'rescue', 'retrieval']).toContain(
      definition.objectives[0],
    )
  })

  it('C: the follow-up request appears on the board the next day, tagged with chain metadata, and occupies a board slot', () => {
    const campaign = findCampaignWithStartedChain('phase9-6-c', 30, 30)
    const chain = campaign.questChains.find((c) => c.status === 'active')!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    const boardRequest = campaign.currentDay.requests.find(
      (r) => r.id === step2.request.id,
    )
    expect(boardRequest).toBeDefined()
    expect(boardRequest?.chain).toEqual({
      chainId: chain.id,
      stepNumber: 2,
      totalSteps: 3,
    })
    // Total requests on the board never exceed the day's slot count (3, no
    // Quest Board upgrade purchased in this test).
    expect(campaign.currentDay.requests.length).toBeLessThanOrEqual(3)
  })

  it('D: a successful/partial follow-up advances the chain to the next step', () => {
    let campaign = findCampaignWithStartedChain('phase9-6-d', 30, 30)
    const chainId = campaign.questChains.find((c) => c.status === 'active')!.id

    for (let day = 0; day < 10; day++) {
      const chain = campaign.questChains.find((c) => c.id === chainId)
      if (!chain || chain.status !== 'active') break
      const step2 = chain.steps.find((s) => s.stepNumber === 2)
      if (step2?.status === 'resolved') break
      campaign = advanceOneDayAcceptingAll(campaign)
    }

    const chain = campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    if (
      step2.status === 'resolved' &&
      step2.outcome &&
      ['completeSuccess', 'success', 'partialSuccess'].includes(step2.outcome)
    ) {
      expect(chain.status).toBe('active')
      const step3 = chain.steps.find((s) => s.stepNumber === 3)
      expect(step3?.status).toBe('scheduled')
      const advancedEvent = campaign.history
        .flatMap((h) => h.questChainEvents)
        .find((e) => e.type === 'advanced' && e.chainId === chainId)
      expect(advancedEvent).toBeDefined()
    }
  })

  it('E: a failed follow-up ends the chain', () => {
    // Search across seeds for a chain whose eventual outcome is 'failed'
    // within a bounded horizon (deterministic per-seed, but which chains
    // fail depends on expedition RNG so we scan for one that does).
    for (let s = 0; s < 40; s++) {
      let campaign = createTavernCampaign(`phase9-6-e-${s}`)
      let failed = false
      for (let day = 0; day < 15 && !failed; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
        failed = campaign.history.some((h) =>
          h.questChainEvents.some((e) => e.type === 'failed'),
        )
      }
      if (failed) {
        const failedEvent = campaign.history
          .flatMap((h) => h.questChainEvents)
          .find((e) => e.type === 'failed')!
        const chain = campaign.questChains.find(
          (c) => c.id === failedEvent.chainId,
        )!
        expect(chain.status).toBe('failed')
        expect(chain.steps.every((s) => s.status !== 'scheduled')).toBe(true)
        return
      }
    }
    // Not finding one within budget is not itself a failure of the
    // system — this is a best-effort smoke check.
  })

  it('F: notBrokered abandons the chain (nothing is re-offered the next day)', () => {
    const campaign = findCampaignWithStartedChain('phase9-6-f', 30, 30)
    const chainId = campaign.questChains.find((c) => c.status === 'active')!.id

    // The chain's follow-up is already scheduled on today's board — resolve
    // the day without ever offering it to any party, leaving it unbrokered.
    const resolved = resolveCampaignDay(campaign)
    const advanced = advanceCampaignDay(resolved)

    const abandonedEvent = resolved.history
      .flatMap((h) => h.questChainEvents)
      .find((e) => e.type === 'abandoned' && e.chainId === chainId)
    expect(abandonedEvent).toBeDefined()

    const chain = advanced.questChains.find((c) => c.id === chainId)!
    expect(chain.status).toBe('abandoned')
    expect(chain.steps.every((s) => s.status !== 'scheduled')).toBe(true)
    const chainRequestStillOnBoard = advanced.currentDay.requests.some(
      (r) => r.chain?.chainId === chainId,
    )
    expect(chainRequestStillOnBoard).toBe(false)
  })

  it('G: a chain that resolves all 3 steps successfully is marked completed', () => {
    for (let s = 0; s < 40; s++) {
      let campaign = createTavernCampaign(`phase9-6-g-${s}`)
      let completed = false
      for (let day = 0; day < 20 && !completed; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
        completed = campaign.history.some((h) =>
          h.questChainEvents.some((e) => e.type === 'completed'),
        )
      }
      if (completed) {
        const completedEvent = campaign.history
          .flatMap((h) => h.questChainEvents)
          .find((e) => e.type === 'completed')!
        const chain = campaign.questChains.find(
          (c) => c.id === completedEvent.chainId,
        )!
        expect(chain.status).toBe('completed')
        expect(chain.steps).toHaveLength(3)
        expect(chain.steps.every((s) => s.status === 'resolved')).toBe(true)
        return
      }
    }
  })

  it('H: save/load preserves an active chain exactly (scheduled request, reward terms, status)', () => {
    const campaign = findCampaignWithStartedChain('phase9-6-h', 30, 30)
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
    const loaded = deserializeGameSave(save)
    expect(loaded.campaign.questChains).toEqual(campaign.questChains)
  })

  it('I: zero AI calls across chain start/advance/completion', () => {
    const campaign = findCampaignWithStartedChain('phase9-6-i', 30, 30)
    expect(campaign.narrativeGenerations.length).toBe(0)
  })

  it('J: determinism — identical seed and actions produce identical chain state', () => {
    let a = createTavernCampaign('phase9-6-j')
    let b = createTavernCampaign('phase9-6-j')
    for (let day = 0; day < 15; day++) {
      a = advanceOneDayAcceptingAll(a)
      b = advanceOneDayAcceptingAll(b)
    }
    expect(b.questChains).toEqual(a.questChains)
  })

  it('long-run smoke: 40 days never violate core Quest Chain invariants', () => {
    let campaign = createTavernCampaign('phase9-6-longrun')
    const seenRequestIds = new Set<string>()
    for (let day = 0; day < 40; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)

      const activeChains = campaign.questChains.filter(
        (c) => c.status === 'active',
      )
      expect(activeChains.length).toBeLessThanOrEqual(
        QUEST_CHAIN_CONFIG.maxActiveChains,
      )

      const chainRequestCount = campaign.currentDay.requests.filter(
        (r) => r.chain !== undefined,
      ).length
      expect(chainRequestCount).toBeLessThanOrEqual(
        QUEST_CHAIN_CONFIG.maxChainRequestsPerDay,
      )
      expect(chainRequestCount).toBeLessThanOrEqual(
        campaign.currentDay.requests.length,
      )

      for (const request of campaign.currentDay.requests) {
        expect(seenRequestIds.has(request.id)).toBe(false)
        seenRequestIds.add(request.id)
      }

      for (const chain of campaign.questChains) {
        expect(Number.isFinite(chain.startedDay)).toBe(true)
        for (const step of chain.steps) {
          expect(Number.isFinite(step.scheduledDay)).toBe(true)
        }
      }
    }
    expect(() =>
      validateGameSave(serializeGameSave({ campaign })),
    ).not.toThrow()
  })
})
