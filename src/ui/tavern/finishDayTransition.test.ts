import { describe, expect, it } from 'vitest'
import { resolveFinishDayTransition } from './finishDayTransition.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../../core/mainQuest/dispatch.ts'
import { generateMainQuestNarrative } from '../../core/mainQuest/narrative.ts'
import {
  applyMainQuestNarrative,
  completeMainQuestPresentation,
  startMainQuestPresentation,
} from '../../core/mainQuest/presentation.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from '../../core/mainQuest/threats.ts'
import { saveToSlot } from '../../core/save/serializer.ts'
import { InMemorySaveRepository } from '../../core/save/inMemorySaveRepository.ts'
import { TAVERN_ECONOMY_CONFIG } from '../../core/economy/economyConfig.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type { MainQuestThreatId } from '../../core/mainQuest/types.ts'

// A real save's `funds` must always equal its Ledger total, so the fixture
// Campaign needs enough starting funds to afford the Main Quest fee.
// Scoped to this file only (Vitest isolates each test file's module graph).
;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-finish-day-transition',
    async generate() {
      return { text }
    },
  }
}

const FAKE_NARRATIVE_TEXT = `===PRE-BATTLE===
出発前の物語。

===POST-BATTLE===
戦いの後の物語。`

function dispatchEligibleParty(
  campaign: TavernCampaignState,
  threatId: MainQuestThreatId,
): { campaign: TavernCampaignState; attemptId: string } {
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const party = campaign.parties[0]
  party.party.rank = definition.requiredPartyRank
  party.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === party.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  const dispatch = dispatchMainQuest(campaign, threatId, party.id)
  if (!dispatch.ok || !dispatch.attemptId) {
    throw new Error('test setup: dispatch failed')
  }
  return { campaign: dispatch.campaign, attemptId: dispatch.attemptId }
}

// `TavernSimulator.handleFinishDay()` only autosaves once
// `next.currentDay.status === 'planning'` — `saveToSlot` itself hard-rejects
// anything else, and a resolved-but-pending Main Quest Presentation means
// the day never reaches 'planning' inside that same call. These tests run
// the SAME `resolveFinishDayTransition` helper the production handler uses
// (not a re-implementation of its logic) against the real `saveToSlot`, to
// prove the autosave gate matches what the Save contract actually accepts,
// for all three points in the day/Presentation cycle it can be invoked from.
describe('resolveFinishDayTransition: planning-only autosave contract', () => {
  it('a normal day (no Main Quest) reaches planning within one call, and autosave succeeds', async () => {
    const campaign = createTavernCampaign('mainquest-autosave-normal')
    const next = resolveFinishDayTransition(campaign)
    expect(next.currentDay.status).toBe('planning')

    const repo = new InMemorySaveRepository()
    await expect(
      saveToSlot(repo, 'autosave', { campaign: next }),
    ).resolves.toBeUndefined()
  })

  it('a Main Quest day stays resolved (pending Presentation) within one call, and would be rejected by saveToSlot', async () => {
    const campaign = createTavernCampaign('mainquest-autosave-pending')
    const { campaign: dispatched } = dispatchEligibleParty(campaign, 'alden')
    const next = resolveFinishDayTransition(dispatched)
    // This is exactly the state handleFinishDay's autosave gate must skip —
    // still 'resolved', with a Presentation pending.
    expect(next.currentDay.status).toBe('resolved')
    expect(next.mainQuest.pendingPresentationAttemptId).toBeDefined()

    const repo = new InMemorySaveRepository()
    await expect(
      saveToSlot(repo, 'autosave', { campaign: next }),
    ).rejects.toThrow('保存できません。翌日へ進んでから保存してください')
  })

  it('once Presentation completes, the next call reaches planning, and autosave succeeds', async () => {
    const campaign = createTavernCampaign('mainquest-autosave-completed')
    const { campaign: dispatched, attemptId } = dispatchEligibleParty(
      campaign,
      'velga',
    )
    const resolved = resolveCampaignDay(dispatched)
    const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.velga
    const campaignParty = resolved.parties.find(
      (p) => p.id === attempt.partyId,
    )!
    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      fakeProvider(FAKE_NARRATIVE_TEXT),
    )
    let completed = applyMainQuestNarrative(resolved, attemptId, script)
    completed = startMainQuestPresentation(completed, attemptId)
    completed = completeMainQuestPresentation(completed, attemptId)
    // Presentation is already 'completed' and pendingPresentationAttemptId
    // cleared, but the day itself is still 'resolved' — mirrors calling
    // handleFinishDay again after the redirect back from MainQuestScene.
    expect(completed.currentDay.status).toBe('resolved')
    expect(completed.mainQuest.pendingPresentationAttemptId).toBeUndefined()

    const next = resolveFinishDayTransition(completed)
    expect(next.currentDay.status).toBe('planning')

    const repo = new InMemorySaveRepository()
    await expect(
      saveToSlot(repo, 'autosave', { campaign: next }),
    ).resolves.toBeUndefined()
  })
})
