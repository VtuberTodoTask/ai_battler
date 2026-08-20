import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { buildLedgerEntryId } from '../economy/finance.ts'
import { computeQuestSettlement } from '../economy/questReward.ts'
import { computeQuestReputationDelta } from '../tavern/campaign/reputation.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

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

/** Finds a campaign with an active Quest Chain (Step 1 resolved, Step 2
 * scheduled for the current planning day) within a bounded search. */
function fixtureSaveWithActiveChain(seedPrefix: string) {
  for (let s = 0; s < 40; s++) {
    let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
    for (let day = 0; day < 20; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      if (campaign.questChains.some((c) => c.status === 'active')) {
        return {
          save: clone(serializeGameSave({ campaign })),
          chainId: campaign.questChains.find((c) => c.status === 'active')!.id,
        }
      }
    }
  }
  throw new Error(`no active chain found for seed prefix ${seedPrefix}`)
}

describe('save validation: quest chains (Phase 9.6)', () => {
  it('accepts a fresh campaign (no quest chains)', () => {
    const save = clone(
      serializeGameSave({ campaign: createTavernCampaign('chain-fresh') }),
    )
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts a genuinely-generated save with an active quest chain', () => {
    const { save } = fixtureSaveWithActiveChain('chain-valid')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects an unknown quest chain definition id', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-unknown-def')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    // @ts-expect-error intentionally corrupting for the test
    chain.definitionId = 'chain-does-not-exist'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a duplicate quest chain id', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-dup-id')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    save.campaign.questChains.push(clone(chain))
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake origin (Step 1 whose outcome never occurred in history)', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-fake-origin')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    chain.steps[0].outcome = 'success'
    chain.steps[0].partyId = 'not-a-real-party'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a chain whose origin outcome was actually a failure/partial (not a Chain-Start-eligible success)', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-wrong-outcome')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const original = chain.steps[0].outcome
    chain.steps[0].outcome =
      original === 'completeSuccess' ? 'success' : 'completeSuccess'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a wrong step objective on a scheduled follow-up request', () => {
    const { save, chainId } = fixtureSaveWithActiveChain(
      'chain-wrong-objective',
    )
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    step2.request.objectiveType =
      step2.request.objectiveType === 'elimination' ? 'escort' : 'elimination'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a wrong step rank on a scheduled follow-up request', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-wrong-rank')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    step2.request.rank = step2.request.rank === 'S' ? 'E' : 'S'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a wrong scheduled day on a follow-up step', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-wrong-day')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    step2.scheduledDay += 1
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an active chain whose scheduled follow-up is missing from currentDay.requests', () => {
    const { save, chainId } = fixtureSaveWithActiveChain(
      'chain-missing-current',
    )
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    save.campaign.currentDay.requests =
      save.campaign.currentDay.requests.filter((r) => r.id !== step2.request.id)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an orphan chain-tagged request in currentDay.requests with no matching active chain', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-orphan-current')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    const fake = clone(step2.request)
    fake.id = `${fake.id}-orphan`
    fake.chain = {
      chainId: 'quest-chain:9999:nonexistent',
      stepNumber: 2,
      totalSteps: 3,
    }
    save.campaign.currentDay.requests.push(fake)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects wrong chain metadata (stepNumber) on the currentDay request', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-wrong-meta')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    const step2 = chain.steps.find((s) => s.stepNumber === 2)!
    const boardRequest = save.campaign.currentDay.requests.find(
      (r) => r.id === step2.request.id,
    )!
    boardRequest.chain = { ...boardRequest.chain!, stepNumber: 3 }
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake completion (status forced to completed without a real completed event)', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-fake-complete')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    chain.status = 'completed'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake failure (status forced to failed without a real failed event)', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-fake-failed')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    chain.status = 'failed'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake abandonment (status forced to abandoned without a real abandoned event)', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-fake-abandon')
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    chain.status = 'abandoned'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a completed chain that still has a scheduled step', () => {
    const { save, chainId } = fixtureSaveWithActiveChain(
      'chain-completed-scheduled',
    )
    const chain = save.campaign.questChains.find((c) => c.id === chainId)!
    chain.status = 'completed'
    // Leave the scheduled step in place — a genuinely completed chain never
    // has one, so this must be rejected regardless of the status change above.
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a missing QuestChainEvent (started event deleted from history)', () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-missing-event')
    const record = save.campaign.history.find((h) =>
      h.questChainEvents.some(
        (e) => e.type === 'started' && e.chainId === chainId,
      ),
    )!
    record.questChainEvents = record.questChainEvents.filter(
      (e) => !(e.type === 'started' && e.chainId === chainId),
    )
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an extra fabricated QuestChainEvent', () => {
    const { save } = fixtureSaveWithActiveChain('chain-extra-event')
    const record = save.campaign.history[0]
    record.questChainEvents.push({
      type: 'started',
      chainId: 'quest-chain:9999:fake-request',
      dayNumber: record.dayNumber,
    })
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a QuestChainEvent with the wrong dayNumber field', () => {
    const { save, chainId } = fixtureSaveWithActiveChain(
      'chain-wrong-event-day',
    )
    const record = save.campaign.history.find((h) =>
      h.questChainEvents.some(
        (e) => e.type === 'started' && e.chainId === chainId,
      ),
    )!
    const event = record.questChainEvents.find(
      (e) => e.type === 'started' && e.chainId === chainId,
    )!
    event.dayNumber += 1
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  /** Finds a campaign whose history contains at least one already-RESOLVED
   * Quest Chain follow-up result (i.e. a day where `resolveQuestChainsForDay`
   * actually advanced/failed/completed a chain), returning that day and
   * requestId so a test can tamper the frozen historical request. */
  function fixtureSaveWithResolvedChainFollowUp(seedPrefix: string) {
    for (let s = 0; s < 60; s++) {
      let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
      for (let day = 0; day < 25; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
        const record = campaign.history[campaign.history.length - 1]
        const chainResult = record.results.find(
          (r) =>
            r.status === 'resolved' &&
            r.request.chain !== undefined &&
            r.settlement !== undefined &&
            r.settlement.tavernCommission > 0,
        )
        if (chainResult && chainResult.status === 'resolved') {
          return {
            save: clone(serializeGameSave({ campaign })),
            dayNumber: record.dayNumber,
            requestId: chainResult.requestId,
            partyId: chainResult.partyId,
            outcome: chainResult.result!.outcome,
          }
        }
      }
    }
    throw new Error(
      `no resolved chain follow-up found for seed prefix ${seedPrefix}`,
    )
  }

  /** Finds a campaign whose history contains a `notBrokered` Quest Chain
   * follow-up (the day's board request was never offered to any party). */
  function fixtureSaveWithNotBrokeredChainFollowUp(seedPrefix: string) {
    for (let s = 0; s < 60; s++) {
      let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
      for (let day = 0; day < 20; day++) {
        if (campaign.questChains.some((c) => c.status === 'active')) {
          const resolved = resolveCampaignDay(campaign)
          const record = resolved.history[resolved.history.length - 1]
          const nbResult = record.results.find(
            (r) => r.status === 'notBrokered' && r.request.chain !== undefined,
          )
          if (nbResult) {
            const advanced = advanceCampaignDay(resolved)
            return {
              save: clone(serializeGameSave({ campaign: advanced })),
              dayNumber: record.dayNumber,
              requestId: nbResult.requestId,
            }
          }
        }
        campaign = advanceOneDayAcceptingAll(campaign)
      }
    }
    throw new Error(
      `no notBrokered chain follow-up found for seed prefix ${seedPrefix}`,
    )
  }

  function findHistoryResult(
    save: ReturnType<typeof serializeGameSave>,
    dayNumber: number,
    requestId: string,
  ) {
    const record = save.campaign.history.find((h) => h.dayNumber === dayNumber)!
    const result = record.results.find((r) => r.requestId === requestId)!
    return { record, result }
  }

  describe('historical follow-up <-> frozen request integrity (Phase 9.6.1)', () => {
    it('accepts a genuinely-resolved historical chain follow-up unmodified', () => {
      const { save } = fixtureSaveWithResolvedChainFollowUp('chain-hist-ok')
      expect(() => validateGameSave(save)).not.toThrow()
    })

    it('accepts a genuinely-notBrokered historical chain follow-up unmodified', () => {
      const { save } =
        fixtureSaveWithNotBrokeredChainFollowUp('chain-hist-nb-ok')
      expect(() => validateGameSave(save)).not.toThrow()
    })

    it('rejects a tampered historical follow-up reward, even with settlement/ledger kept internally consistent', () => {
      const { save, dayNumber, requestId, partyId, outcome } =
        fixtureSaveWithResolvedChainFollowUp('chain-hist-reward')
      const { result } = findHistoryResult(save, dayNumber, requestId)

      result.request.rewardTerms = {
        ...result.request.rewardTerms,
        promisedReward: result.request.rewardTerms.promisedReward + 500,
      }
      const newSettlement = computeQuestSettlement(
        result.request.rewardTerms,
        outcome,
      )
      result.settlement = newSettlement
      if (result.report?.settlement) {
        result.report.settlement = newSettlement
      }
      const ledgerId = buildLedgerEntryId(dayNumber, requestId, partyId!)
      const ledgerEntry = save.campaign.finance.ledgerEntries.find(
        (e) => e.id === ledgerId,
      )
      if (ledgerEntry) {
        const delta = newSettlement.tavernCommission - ledgerEntry.amount
        ledgerEntry.amount = newSettlement.tavernCommission
        save.campaign.finance.funds += delta
      }

      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a tampered historical follow-up rank, even with the reputation event kept internally consistent', () => {
      const { save, dayNumber, requestId, partyId, outcome } =
        fixtureSaveWithResolvedChainFollowUp('chain-hist-rank')
      const { result } = findHistoryResult(save, dayNumber, requestId)

      const newRank = result.request.rank === 'S' ? 'E' : 'S'
      result.request.rank = newRank
      const newDelta = computeQuestReputationDelta(newRank, outcome)
      const reputationEvent = save.campaign.reputation.events.find(
        (e) => e.source.requestId === requestId && e.source.partyId === partyId,
      )
      if (reputationEvent) {
        reputationEvent.delta = newDelta
      }

      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a tampered historical follow-up objective', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedChainFollowUp('chain-hist-objective')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.objectiveType =
        result.request.objectiveType === 'elimination'
          ? 'escort'
          : 'elimination'
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects tampered historical chain metadata (stepNumber)', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedChainFollowUp('chain-hist-meta')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.chain = {
        ...result.request.chain!,
        stepNumber: result.request.chain!.stepNumber === 2 ? 3 : 2,
      }
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects an inner request.id that disagrees with the outer requestId', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedChainFollowUp('chain-hist-innerid')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.id = `${requestId}-tampered`
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a historical orphan chain result (fake chain metadata on a standalone result)', () => {
      const { save, chainId } = fixtureSaveWithActiveChain('chain-hist-orphan')
      const chain = save.campaign.questChains.find((c) => c.id === chainId)!
      const originRequestId = chain.steps[0].request.id
      const record = save.campaign.history.find(
        (h) => h.dayNumber === chain.startedDay,
      )!
      const originResult = record.results.find(
        (r) => r.requestId === originRequestId,
      )!
      originResult.request.chain = {
        chainId: 'quest-chain:9999:fake-origin-not-a-real-chain',
        stepNumber: 2,
        totalSteps: 3,
      }
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a genuine follow-up result with its chain metadata stripped', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedChainFollowUp('chain-hist-strip')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      delete (result.request as { chain?: unknown }).chain
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })
  })

  describe('current-day request id uniqueness (Phase 9.6.1)', () => {
    it('rejects a duplicated current-day chain request', () => {
      const { save, chainId } = fixtureSaveWithActiveChain('chain-dup-board')
      const chain = save.campaign.questChains.find((c) => c.id === chainId)!
      const scheduledStep = chain.steps.find((s) => s.status === 'scheduled')!
      const boardRequest = save.campaign.currentDay.requests.find(
        (r) => r.id === scheduledStep.request.id,
      )!
      save.campaign.currentDay.requests.push(clone(boardRequest))
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a duplicated current-day normal request', () => {
      const save = clone(
        serializeGameSave({
          campaign: createTavernCampaign('chain-dup-normal'),
        }),
      )
      expect(save.campaign.currentDay.requests.length).toBeGreaterThan(0)
      save.campaign.currentDay.requests.push(
        clone(save.campaign.currentDay.requests[0]),
      )
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })
  })

  it('atomic load: a malformed quest chain save is rejected without mutating stored raw data', async () => {
    const { save, chainId } = fixtureSaveWithActiveChain('chain-atomic')
    const bad = clone(save)
    const chain = bad.campaign.questChains.find((c) => c.id === chainId)!
    chain.status = 'completed'

    const { InMemorySaveRepository } =
      await import('./inMemorySaveRepository.ts')
    const { loadFromSlot } = await import('./serializer.ts')
    const repo = new InMemorySaveRepository()
    repo.seed('slot-corrupt-chain', bad as never)

    await expect(loadFromSlot(repo, 'slot-corrupt-chain')).rejects.toThrow(
      SaveValidationErrorClass,
    )
    expect(repo.getRaw('slot-corrupt-chain')).toEqual(bad)
  })
})
