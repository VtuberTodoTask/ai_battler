import { describe, expect, it, vi } from 'vitest'
import { runBondConversationGeneration } from './bondConversationGeneration.ts'
import { createTavernCampaign } from '../../core/tavern/campaign/campaign.ts'
import {
  deriveResolveCandidates,
  mergeCandidates,
} from '../../core/narrative/candidates.ts'
import type {
  CampaignRelationshipEvent,
  TavernCampaignState,
} from '../../core/tavern/campaign/types.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-bond-conversation-async-test',
    async generate() {
      return { text }
    },
  }
}

/** A Campaign with exactly one pending Bond Conversation candidate
 * (`becameRegular`, not yet generated) for `campaign.parties[0]`. */
function campaignWithPendingBondCandidate(seed: string): {
  campaign: TavernCampaignState
  candidateId: string
} {
  const campaign = createTavernCampaign(seed)
  const party = campaign.parties[0]
  party.relationship.affinity = 59
  const event: CampaignRelationshipEvent = {
    type: 'affinityChanged',
    partyId: party.id,
    partyName: party.party.name,
    dayNumber: campaign.dayNumber,
    outcome: 'success',
    before: 59,
    delta: 8,
    after: 67,
  }
  const derived = deriveResolveCandidates(
    {
      ...campaign,
      currentDay: { ...campaign.currentDay, status: 'resolved', results: [] },
    },
    [event],
  )
  const candidate = derived.find(
    (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
  )!
  const next: TavernCampaignState = {
    ...campaign,
    narrativeCandidates: mergeCandidates(campaign.narrativeCandidates, [
      candidate,
    ]),
  }
  return { campaign: next, candidateId: candidate.id }
}

function makeCommitHarness(initial: TavernCampaignState): {
  campaignRef: { current: TavernCampaignState | null }
  commitCampaign: (next: TavernCampaignState) => void
  committedHistory: TavernCampaignState[]
} {
  const campaignRef: { current: TavernCampaignState | null } = {
    current: initial,
  }
  const committedHistory: TavernCampaignState[] = []
  const commitCampaign = (next: TavernCampaignState) => {
    campaignRef.current = next
    committedHistory.push(next)
  }
  return { campaignRef, commitCampaign, committedHistory }
}

describe('runBondConversationGeneration', () => {
  it('generates and commits a Bond Conversation Narrative via the atomic commit path', async () => {
    const { campaign, candidateId } =
      campaignWithPendingBondCandidate('bond-ui-gen-001')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)
    const text = 'よく来たな、というBond Conversationの短い場面。'

    const result = await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider(text),
      candidateId,
    })

    expect(result.ok).toBe(true)
    expect(result.data).toBe(text)
    expect(committedHistory).toHaveLength(1)
    const updatedCandidate = committedHistory[0].narrativeCandidates.find(
      (c) => c.id === candidateId,
    )
    expect(updatedCandidate?.state).toBe('generated')
    const record = committedHistory[0].narrativeGenerations.find(
      (g) => g.id === updatedCandidate?.activeGenerationId,
    )
    expect(record?.generatedText).toBe(text)
  })

  it('returns ok:true without calling the provider when the candidate is already generated', async () => {
    const { campaign, candidateId } =
      campaignWithPendingBondCandidate('bond-ui-gen-002')
    const { campaignRef, commitCampaign } = makeCommitHarness(campaign)
    const text = '既存の生成済みテキスト。'
    await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider(text),
      candidateId,
    })

    const generateSpy = vi.fn()
    const result = await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: { id: 'unused', generate: generateSpy },
      candidateId,
    })

    expect(result.ok).toBe(true)
    expect(result.data).toBe(text)
    expect(generateSpy).not.toHaveBeenCalled()
  })

  it('never applies a stale AI response once the candidate has disappeared (e.g. New Game started) while the AI call was in flight', async () => {
    const { campaign, candidateId } =
      campaignWithPendingBondCandidate('bond-ui-gen-003')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const provider: NarrativeProvider = {
      id: 'fake-new-game-mid-flight',
      async generate() {
        commitCampaign(createTavernCampaign('bond-ui-gen-003-new-game'))
        return { text: 'stale text' }
      },
    }

    const result = await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
      candidateId,
    })

    expect(result.ok).toBe(false)
    expect(committedHistory).toHaveLength(1)
    expect(
      committedHistory[0].narrativeCandidates.some((c) => c.id === candidateId),
    ).toBe(false)
  })

  it('reuses a concurrently-generated result instead of overwriting it, when the candidate is generated mid-flight by another caller', async () => {
    const { campaign, candidateId } =
      campaignWithPendingBondCandidate('bond-ui-gen-004')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)
    const concurrentText = '別の呼び出しが先に生成したテキスト。'

    const provider: NarrativeProvider = {
      id: 'fake-concurrent-generation',
      async generate() {
        const other = await runBondConversationGeneration({
          campaignRef,
          commitCampaign,
          narrativeProvider: fakeProvider(concurrentText),
          candidateId,
        })
        expect(other.ok).toBe(true)
        return { text: 'this response should never be committed' }
      },
    }

    const result = await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
      candidateId,
    })

    expect(result.ok).toBe(true)
    expect(result.data).toBe(concurrentText)
    // Only the concurrent call's own commit landed.
    expect(committedHistory).toHaveLength(1)
  })

  it('returns ok:false when no AI provider is connected', async () => {
    const { campaign, candidateId } =
      campaignWithPendingBondCandidate('bond-ui-gen-005')
    const { campaignRef, commitCampaign } = makeCommitHarness(campaign)

    const result = await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: null,
      candidateId,
    })

    expect(result.ok).toBe(false)
  })

  it('returns ok:false for a candidate that is not a Bond Conversation eventType', async () => {
    const { campaign } = campaignWithPendingBondCandidate('bond-ui-gen-006')
    const { campaignRef, commitCampaign } = makeCommitHarness(campaign)
    const expeditionCandidate = campaign.narrativeCandidates.find(
      (c) => c.category === 'expedition',
    )

    const result = await runBondConversationGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider('unused'),
      candidateId: expeditionCandidate?.id ?? 'nonexistent-candidate-id',
    })

    expect(result.ok).toBe(false)
  })
})
