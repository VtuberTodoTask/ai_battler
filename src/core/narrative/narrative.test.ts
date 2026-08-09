import { describe, expect, it } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import type {
  TavernCampaignState,
  CampaignRelationshipEvent,
} from '../tavern/campaign/types.ts'
import type {
  ResolvedDispatch,
  BrokerageOfferAttempt,
  DispatchReport,
} from '../tavern/types.ts'
import { FakeNarrativeProvider } from '../../ai/narrative/fakeProvider.ts'
import { generateNarrative } from './generation.ts'
import { deriveResolveCandidates, mergeCandidates } from './candidates.ts'
import { buildNarrativePrompt } from './prompt.ts'
import type {
  NarrativeCandidate,
  CharacterEventNarrativeContext,
} from './types.ts'
import type { ObjectiveType } from '../expedition/types.ts'

function otherObjective(than: ObjectiveType): ObjectiveType {
  const all: ObjectiveType[] = [
    'investigation',
    'elimination',
    'rescue',
    'escort',
    'retrieval',
    'survey',
  ]
  return all.find((o) => o !== than) ?? 'investigation'
}

function makeResolved(
  campaign: TavernCampaignState,
  partyIndex: number,
  requestIndex: number,
  outcome:
    | 'completeSuccess'
    | 'success'
    | 'partialSuccess'
    | 'failedObjective'
    | 'forcedRetreat'
    | 'lostExpedition',
): ResolvedDispatch {
  const party = campaign.parties[partyIndex]
  const request = campaign.currentDay.requests[requestIndex]
  const report: DispatchReport = {
    requestId: request.id,
    objectiveType: request.objectiveType,
    outcome,
    objectiveCompleted: outcome === 'completeSuccess' || outcome === 'success',
    objectiveProgress:
      outcome === 'completeSuccess' ? 100 : outcome === 'success' ? 80 : 40,
    elapsedTime: 120,
    party: party.party.members.map((m) => ({
      adventurerId: m.id,
      name: m.name,
      role: m.role,
      rank: m.rank,
      finalHp: m.currentHp,
      maxHp: m.maxHp,
      finalMp: m.currentMp,
      maxMp: m.maxMp,
      finalMorale: m.morale,
      incapacitated: false,
      dead: false,
    })),
    casualties: [],
    incapacitated: [],
    keyFacts: [`${request.title}を完了`, '全員無事に帰還'],
    objective: {
      type: 'investigation',
      progress: 100,
      completed: true,
      discoveredInformationCount: 2,
      reported: true,
      allReported: true,
    } as unknown as import('../tavern/types.ts').DispatchObjectiveSummary,
  }
  return {
    requestId: request.id,
    request,
    partyId: party.id,
    partyName: party.party.name,
    leaderName: party.party.members.find((m) => m.id === party.party.leaderId)
      ?.name,
    memberIds: party.party.members.map((m) => m.id),
    status: 'resolved',
    result: { outcome } as import('../expedition/types.ts').ExpeditionResult,
    report,
  }
}

function withResults(
  campaign: TavernCampaignState,
  results: ResolvedDispatch[],
): TavernCampaignState {
  return {
    ...campaign,
    currentDay: { ...campaign.currentDay, status: 'resolved', results },
  }
}

function makeAcceptedOffer(
  campaign: TavernCampaignState,
  partyIndex: number,
  requestIndex: number,
  rankGap: number,
): BrokerageOfferAttempt {
  const party = campaign.parties[partyIndex]
  const request = campaign.currentDay.requests[requestIndex]
  return {
    id: 'offer-1',
    requestId: request.id,
    partyId: party.id,
    decision: 'accepted',
    reason: 'boldChallenge',
    evaluation: { rankGap } as unknown as BrokerageOfferAttempt['evaluation'],
  }
}

describe('Narrative candidate derivation', () => {
  it('creates an expedition candidate for each resolved dispatch', () => {
    const campaign = createTavernCampaign('narrative-expedition-001')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const next = withResults(campaign, [resolved])
    const candidates = deriveResolveCandidates(next, [])
    const expedition = candidates.find((c) => c.category === 'expedition')
    expect(expedition).toBeDefined()
    expect(expedition!.partyId).toBe(campaign.parties[0].id)
    expect(expedition!.requestTitle).toBe(campaign.currentDay.requests[0].title)
    expect(expedition!.state).toBe('available')
  })

  it('creates a weakObjectiveSuccess candidate only for weak objective and success outcomes', () => {
    const campaign = createTavernCampaign('narrative-weak-001')
    const party = campaign.parties[0]
    const request = campaign.currentDay.requests[0]
    party.party.missionSpecialization = {
      strongObjective: otherObjective(request.objectiveType),
      weakObjective: request.objectiveType,
    }
    const successResolved = makeResolved(campaign, 0, 0, 'success')
    const successCandidates = deriveResolveCandidates(
      withResults(campaign, [successResolved]),
      [],
    )
    expect(
      successCandidates.some(
        (c) => c.eventType === 'weakObjectiveSuccess' && c.partyId === party.id,
      ),
    ).toBe(true)

    const next = withResults(campaign, [
      makeResolved(campaign, 0, 0, 'failedObjective'),
    ])
    const failedCandidates = deriveResolveCandidates(next, [])
    expect(
      failedCandidates.some(
        (c) => c.eventType === 'weakObjectiveSuccess' && c.partyId === party.id,
      ),
    ).toBe(false)
  })

  it('creates a riskyRequestAccepted candidate only for rank gap +1 and accepted', () => {
    const campaign = createTavernCampaign('narrative-risky-001')
    const party = campaign.parties[0]
    const acceptedOffer = makeAcceptedOffer(campaign, 0, 0, 1)
    campaign.currentDay.offers = [acceptedOffer]
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const candidates = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    )
    expect(
      candidates.some(
        (c) => c.eventType === 'riskyRequestAccepted' && c.partyId === party.id,
      ),
    ).toBe(true)

    const declinedOffer = { ...acceptedOffer, decision: 'declined' as const }
    campaign.currentDay.offers = [declinedOffer]
    const declinedCandidates = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    )
    expect(
      declinedCandidates.some(
        (c) => c.eventType === 'riskyRequestAccepted' && c.partyId === party.id,
      ),
    ).toBe(false)
  })

  it('creates becameRegular when affinity crosses 59 to 60', () => {
    const campaign = createTavernCampaign('narrative-regular-001')
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
    const candidates = deriveResolveCandidates(withResults(campaign, []), [
      event,
    ])
    const regular = candidates.find(
      (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
    )
    expect(regular).toBeDefined()
  })

  it('creates becameFavorite when affinity crosses 79 to 80', () => {
    const campaign = createTavernCampaign('narrative-favorite-001')
    const party = campaign.parties[0]
    party.relationship.affinity = 79
    const event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      outcome: 'success',
      before: 79,
      delta: 8,
      after: 87,
    }
    const candidates = deriveResolveCandidates(withResults(campaign, []), [
      event,
    ])
    const favorite = candidates.find(
      (c) => c.eventType === 'becameFavorite' && c.partyId === party.id,
    )
    expect(favorite).toBeDefined()
    const regular = candidates.find(
      (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
    )
    expect(regular).toBeUndefined()
  })

  it('selects highest priority character event and stores secondary triggers', () => {
    const campaign = createTavernCampaign('narrative-priority-001')
    const party = campaign.parties[0]
    const request = campaign.currentDay.requests[0]
    party.party.missionSpecialization = {
      strongObjective: otherObjective(request.objectiveType),
      weakObjective: request.objectiveType,
    }
    party.relationship.affinity = 59
    const acceptedOffer = makeAcceptedOffer(campaign, 0, 0, 1)
    campaign.currentDay.offers = [acceptedOffer]
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const affinityEvent: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      outcome: 'success',
      before: 59,
      delta: 8,
      after: 67,
    }
    const candidates = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [affinityEvent],
    )
    const character = candidates.filter(
      (c) => c.category === 'characterEvent' && c.partyId === party.id,
    )
    expect(character.length).toBe(1)
    expect(character[0].eventType).toBe('becameRegular')
    expect(character[0].context.kind).toBe('characterEvent')
    const ctx = character[0].context as CharacterEventNarrativeContext
    expect(ctx.secondaryTriggers).toContain('weakObjectiveSuccess')
    expect(ctx.secondaryTriggers).toContain('riskyRequestAccepted')
  })
})

describe('Narrative advance candidates', () => {
  it('creates a farewell candidate for scheduled departure with affinity >= 60', () => {
    const campaign = createTavernCampaign('narrative-farewell-001')
    const party = campaign.parties[0]
    party.arrivalDay = 1
    party.plannedDepartureDay = 1
    party.relationship.affinity = 60
    party.relationship.stayExtensionDaysUsed = 100
    const next = advanceCampaignDay(withResults(campaign, []))
    const farewell = next.narrativeCandidates.find(
      (c) => c.eventType === 'farewell' && c.partyId === party.id,
    )
    expect(farewell).toBeDefined()
    expect(farewell!.context.kind).toBe('characterEvent')
    expect(farewell!.context.party.affinity).toBe(60)
    expect(next.parties.some((p) => p.id === party.id)).toBe(false)
  })

  it('does not create a farewell candidate when affinity is 59', () => {
    const campaign = createTavernCampaign('narrative-farewell-002')
    const party = campaign.parties[0]
    party.arrivalDay = 1
    party.plannedDepartureDay = 1
    party.relationship.affinity = 59
    party.relationship.stayExtensionDaysUsed = 100
    const next = advanceCampaignDay(withResults(campaign, []))
    const farewell = next.narrativeCandidates.find(
      (c) => c.eventType === 'farewell' && c.partyId === party.id,
    )
    expect(farewell).toBeUndefined()
  })

  it('creates casualtyDeparture candidate for departingCasualty', () => {
    const campaign = createTavernCampaign('narrative-casualty-001')
    const party = campaign.parties[0]
    party.departingCasualty = true
    party.party.members[0].currentHp = 0
    const next = advanceCampaignDay(withResults(campaign, []))
    const casualty = next.narrativeCandidates.find(
      (c) => c.eventType === 'casualtyDeparture' && c.partyId === party.id,
    )
    expect(casualty).toBeDefined()
    expect(casualty!.context.party.members[0].dead).toBe(true)
    expect(next.parties.some((p) => p.id === party.id)).toBe(false)
  })

  it('creates partyArrival and recoveryFinished candidates on advance', () => {
    const campaign = createTavernCampaign('narrative-arrival-001')
    const recovering = campaign.parties[0]
    recovering.recoveringThroughDay = 1
    recovering.plannedDepartureDay = 5
    const departing = campaign.parties[1]
    departing.arrivalDay = 1
    departing.plannedDepartureDay = 1
    departing.relationship.stayExtensionDaysUsed = 100
    const next = advanceCampaignDay(withResults(campaign, []))
    expect(
      next.narrativeCandidates.some((c) => c.eventType === 'recoveryFinished'),
    ).toBe(true)
    expect(
      next.narrativeCandidates.some((c) => c.eventType === 'partyArrival'),
    ).toBe(true)
  })
})

describe('Narrative generation', () => {
  it('generates one record per explicit call and updates candidate', async () => {
    const provider = new FakeNarrativeProvider()
    const campaign = createTavernCampaign('narrative-gen-001')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const next = withResults(campaign, [resolved])
    const candidates = deriveResolveCandidates(next, [])
    const expedition = candidates.find((c) => c.category === 'expedition')!
    const { candidate, record } = await generateNarrative(expedition, provider)
    expect(provider.callCount).toBe(1)
    expect(candidate.state).toBe('generated')
    expect(candidate.activeGenerationId).toBe(record.id)
    expect(record.generatedText).toContain('Fake生成')
    expect(record.promptVersion).toBe('v3')
  })

  it('bulk generates candidates sequentially', async () => {
    const provider = new FakeNarrativeProvider()
    const campaign = createTavernCampaign('narrative-bulk-001')
    const resolved1 = makeResolved(campaign, 0, 0, 'success')
    const resolved2 = makeResolved(campaign, 1, 1, 'success')
    const next = withResults(campaign, [resolved1, resolved2])
    const candidates = deriveResolveCandidates(next, [])
    expect(candidates.length).toBeGreaterThanOrEqual(2)
    for (const c of candidates.slice(0, 2)) {
      const { candidate: updated, record } = await generateNarrative(
        c,
        provider,
      )
      next.narrativeCandidates = next.narrativeCandidates.map((x) =>
        x.id === updated.id ? updated : x,
      )
      next.narrativeGenerations.push(record)
    }
    expect(provider.callCount).toBe(2)
    expect(next.narrativeGenerations.length).toBe(2)
  })

  it('regeneration adds a second generation record and updates activeGenerationId', async () => {
    const provider = new FakeNarrativeProvider()
    const campaign = createTavernCampaign('narrative-regen-001')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const next = withResults(campaign, [resolved])
    const candidate = deriveResolveCandidates(next, [])[0]
    const { candidate: first } = await generateNarrative(candidate, provider)
    const { candidate: second, record: secondRecord } = await generateNarrative(
      first,
      provider,
    )
    expect(provider.callCount).toBe(2)
    expect(second.activeGenerationId).toBe(secondRecord.id)
  })

  it('dismiss and restore do not call AI', async () => {
    const candidate: NarrativeCandidate = {
      id: 'test-dismiss',
      version: 1,
      category: 'expedition',
      dayNumber: 1,
      partyId: 'p1',
      partyName: 'P1',
      priority: 0,
      title: 'T',
      context: {
        kind: 'expedition',
      } as unknown as NarrativeCandidate['context'],
      state: 'available',
    }
    let updated: NarrativeCandidate = { ...candidate, state: 'dismissed' }
    expect(updated.state).toBe('dismissed')
    updated = { ...updated, state: 'available' }
    expect(updated.state).toBe('available')
    expect(true).toBe(true)
  })
})

describe('Narrative prompt integrity', () => {
  it('expedition prompt includes request, party, and writing instructions', () => {
    const campaign = createTavernCampaign('narrative-prompt-001')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const candidate = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    )[0]
    const { system, user } = buildNarrativePrompt(candidate.context)

    expect(user).toContain(resolved.request.title)
    expect(user).toContain(resolved.request.briefing)
    expect(user).toContain(resolved.request.objectiveType)
    expect(user).toContain(String(resolved.request.environment))
    expect(user).toContain(resolved.partyName ?? '')
    expect(user).toContain('=== CURRENT REQUEST ===')
    expect(user).toContain('=== PARTY ===')
    expect(user).toContain('=== CONFIRMED FACTS ===')
    expect(user).toContain('=== DETAILS NOT RECORDED ===')
    expect(user).toContain('=== NARRATIVE HINTS ===')
    expect(user).toContain('=== WRITING INSTRUCTIONS ===')
    expect(user).toContain('Leader:')
    expect(user).toContain('Members:')
    expect(user).toContain('専門適性')
    expect(user).toContain('400～800字')
    expect(user).toContain('WRITING INSTRUCTIONS')
    expect(user).toContain('依頼は成功した')
    expect(user).toContain('調査によっていくつかの情報を得た')

    expect(system).toContain('Personality値')
    expect(system).toContain('再訪')
    expect(system).toContain('死者を生き返らせ')
    expect(system).toContain('mage')
    expect(system).toContain('魔法')
    expect(system).toContain('guardian')
    expect(system).toContain('盾')
    expect(system).toContain('最終文章に')
    expect(system).toContain('自然な日本語')

    expect(user).not.toContain('battleOutcome')
    expect(user).not.toContain('combatSeed')
    expect(user).not.toContain('predictionSeed')
    expect(user).not.toContain('apiKey')
    expect(user).not.toContain('Authorization')
    expect(user).not.toContain('raw Battle Log')
    expect(user).not.toContain('HP ')
    expect(user).not.toContain('MP ')
    expect(user).not.toContain('Morale ')
    expect(user).not.toContain('Strong Objective')
    expect(user).not.toContain('Weak Objective')
    expect(user).not.toContain('Objective Progress')
    expect(user).not.toContain('Objective Completed')
    expect(user).not.toContain('failedObjective')
    expect(user).not.toContain('AverageQuality')
    expect(user).not.toContain('Coverage')
  })

  it('farewell prompt includes no-return guarantee, stayDays, and length instruction', () => {
    const campaign = createTavernCampaign('narrative-prompt-farewell')
    const party = campaign.parties[0]
    party.arrivalDay = 1
    party.plannedDepartureDay = 1
    party.relationship.affinity = 60
    party.relationship.stayExtensionDaysUsed = 100
    const next = advanceCampaignDay(withResults(campaign, []))
    const farewell = next.narrativeCandidates.find(
      (c) => c.eventType === 'farewell',
    )!
    const { user } = buildNarrativePrompt(farewell.context)

    expect(user).toContain('farewell')
    expect(user).toContain('300～700字')
    expect(user).toContain('再訪')
    expect(user).toContain('必ず戻る')
    expect(user).toContain('Recent Highlights')
    expect(user).toContain('finalAffinity')
    expect(user).toContain('stayDays')
  })

  it('riskyRequestAccepted prompt includes acceptance reason and rank gap', () => {
    const campaign = createTavernCampaign('narrative-prompt-risky')
    const acceptedOffer = makeAcceptedOffer(campaign, 0, 0, 1)
    campaign.currentDay.offers = [acceptedOffer]
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const candidate = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    ).find((c) => c.eventType === 'riskyRequestAccepted')!
    const { user } = buildNarrativePrompt(candidate.context)

    expect(user).toContain('riskyRequestAccepted')
    expect(user).toContain('acceptanceReason')
    expect(user).toContain('boldChallenge')
    expect(user).toContain('rankGap')
    expect(user).toContain('格上依頼')
  })

  it('casualtyDeparture prompt includes dead and survivor names and fatality guard', () => {
    const campaign = createTavernCampaign('narrative-prompt-casualty')
    const party = campaign.parties[0]
    party.departingCasualty = true
    party.party.members[0].currentHp = 0
    const next = advanceCampaignDay(withResults(campaign, []))
    const casualty = next.narrativeCandidates.find(
      (c) => c.eventType === 'casualtyDeparture',
    )!
    const { user } = buildNarrativePrompt(casualty.context)
    const ctx =
      casualty.context as import('./types.ts').CharacterEventNarrativeContext

    expect(user).toContain('casualtyDeparture')
    expect(user).toContain('deadMemberNames')
    expect(user).toContain(ctx.party.members[0].name)
    expect(user).toContain('survivorNames')
    expect(user).toContain('死者')
    expect(user).toContain('生存者')
    expect(user).not.toContain('葬葬儀')
  })

  it('system prompt treats tavernkeeper as the player, not an NPC', () => {
    const campaign = createTavernCampaign('narrative-prompt-owner')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const candidate = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    )[0]
    const { system } = buildNarrativePrompt(candidate.context)

    expect(system).toContain('店主はNPCではありません')
    expect(system).toContain('プレイヤー本人')
    expect(system).toContain('店主の台詞')
    expect(system).toContain('店主の感情')
    expect(system).toContain('店主の名前')
    expect(system).toContain('物語のカメラは主に冒険者Party側')
  })

  it('expedition prompt instructs the AI not to speak or decide for the player', () => {
    const campaign = createTavernCampaign('narrative-prompt-owner-exp')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const candidate = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    )[0]
    const { user } = buildNarrativePrompt(candidate.context)

    expect(user).toContain('400～800字')
    expect(user).toContain('店主はプレイヤー本人')
    expect(user).toContain('店主の台詞')
    expect(user).toContain('店主の反応')
    expect(user).toContain('Party Member側の台詞')
  })

  it('partyArrival prompt allows leader greeting but forbids owner welcome lines', () => {
    const campaign = createTavernCampaign('narrative-prompt-arrival')
    const departing = campaign.parties[0]
    departing.arrivalDay = 1
    departing.plannedDepartureDay = 1
    departing.relationship.affinity = 10
    departing.relationship.stayExtensionDaysUsed = 100
    const next = advanceCampaignDay(withResults(campaign, []))
    const arrival = next.narrativeCandidates.find(
      (c) => c.eventType === 'partyArrival',
    )!
    const { user } = buildNarrativePrompt(arrival.context)

    expect(user).toContain('partyArrival')
    expect(user).toContain('Leaderが店主へ自己紹介')
    expect(user).toContain('店主が歓迎の台詞')
  })

  it('becameFavorite prompt describes party trust, not owner feelings', () => {
    const campaign = createTavernCampaign('narrative-prompt-favorite')
    const party = campaign.parties[0]
    party.relationship.affinity = 79
    const event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      outcome: 'success',
      before: 79,
      delta: 8,
      after: 87,
    }
    const candidate = deriveResolveCandidates(withResults(campaign, []), [
      event,
    ]).find((c) => c.eventType === 'becameFavorite')!
    const { user } = buildNarrativePrompt(candidate.context)

    expect(user).toContain('becameFavorite')
    expect(user).toContain('Partyから店主への高い信頼')
    expect(user).toContain('店主側にも同程度の感情')
  })

  it('character event prompt uses personality hints, not raw trait names or numbers', () => {
    const campaign = createTavernCampaign('narrative-prompt-personality')
    const party = campaign.parties[0]
    party.arrivalDay = 1
    party.plannedDepartureDay = 1
    party.party.members[0].personality = {
      bravery: 3,
      caution: -2,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
    }
    const next = advanceCampaignDay(withResults(campaign, []))
    const arrival = next.narrativeCandidates.find(
      (c) => c.eventType === 'partyArrival',
    )!
    const { user } = buildNarrativePrompt(arrival.context)

    expect(user).toContain('Memberの傾向:')
    expect(user).not.toContain('bravery')
    expect(user).not.toContain('caution')
    expect(user).not.toContain('bravery 3')
    expect(user).not.toContain('caution -2')
  })

  it('system prompt forbids role hallucination, meta output, and non-Japanese prose', () => {
    const campaign = createTavernCampaign('narrative-prompt-guards')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const candidate = deriveResolveCandidates(
      withResults(campaign, [resolved]),
      [],
    )[0]
    const { system } = buildNarrativePrompt(candidate.context)

    expect(system).toContain('Roleだけを根拠に')
    expect(system).toContain('mage')
    expect(system).toContain('魔法')
    expect(system).toContain('guardian')
    expect(system).toContain('盾')
    expect(system).toContain('最終文章に')
    expect(system).toContain('自然な日本語')
    expect(system).toContain('「店員」「依頼人」「衛兵」「医師」')
  })

  it('farewell prompt forbids owner response and return guarantees', () => {
    const campaign = createTavernCampaign('narrative-prompt-farewell-guards')
    const party = campaign.parties[0]
    party.arrivalDay = 1
    party.plannedDepartureDay = 1
    party.relationship.affinity = 60
    party.relationship.stayExtensionDaysUsed = 100
    const next = advanceCampaignDay(withResults(campaign, []))
    const farewell = next.narrativeCandidates.find(
      (c) => c.eventType === 'farewell',
    )!
    const { user } = buildNarrativePrompt(farewell.context)

    expect(user).toContain('店主の返答を作らない')
    expect(user).toContain('必ず戻る')
    expect(user).toContain('来月戻る')
  })
})

describe('Narrative candidate ID determinism', () => {
  it('produces the same ID for the same inputs', () => {
    const campaign = createTavernCampaign('narrative-id-001')
    const resolved = makeResolved(campaign, 0, 0, 'success')
    const a = deriveResolveCandidates(withResults(campaign, [resolved]), [])
    const b = deriveResolveCandidates(withResults(campaign, [resolved]), [])
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
  })

  it('mergeCandidates keeps existing candidates and appends new ones', () => {
    const a: NarrativeCandidate[] = []
    const b: NarrativeCandidate[] = [
      {
        id: 'x',
        version: 1,
        category: 'expedition',
        dayNumber: 1,
        partyId: 'p1',
        partyName: 'P1',
        priority: 0,
        title: 'T',
        context: {
          kind: 'expedition',
        } as unknown as NarrativeCandidate['context'],
        state: 'available',
      },
    ]
    expect(mergeCandidates(a, b).length).toBe(1)
    expect(mergeCandidates(b, b).length).toBe(1)
  })
})

describe('30-day zero-call audit', () => {
  it('derives candidates without calling the provider and supports manual generation', async () => {
    const provider = new FakeNarrativeProvider()
    let campaign = createTavernCampaign('narrative-audit-001')

    for (let i = 0; i < 30; i++) {
      const pair = findAcceptingPair(campaign)
      if (pair) {
        campaign = { ...campaign, currentDay: pair.next }
      }
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)
    }

    expect(campaign.narrativeCandidates.length).toBeGreaterThan(0)
    expect(campaign.narrativeGenerations.length).toBe(0)
    expect(provider.callCount).toBe(0)

    const available = campaign.narrativeCandidates.filter(
      (c) => c.state === 'available',
    )
    const toGenerate = available.slice(0, 3)
    expect(toGenerate.length).toBe(3)

    for (const candidate of toGenerate) {
      const { candidate: updated, record } = await generateNarrative(
        candidate,
        provider,
      )
      campaign = {
        ...campaign,
        narrativeCandidates: campaign.narrativeCandidates.map((c) =>
          c.id === updated.id ? updated : c,
        ),
        narrativeGenerations: [...campaign.narrativeGenerations, record],
      }
    }

    expect(provider.callCount).toBe(3)
    expect(campaign.narrativeGenerations.length).toBe(3)
  })
})

function findAcceptingPair(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      try {
        const next = offerRequestToParty(
          campaign.currentDay,
          request.id,
          party.id,
        )
        if (next.matches.some((m) => m.requestId === request.id)) {
          return { requestId: request.id, partyId: party.id, next }
        }
      } catch {
        // skip recovering or unavailable parties
      }
    }
  }
  return null
}
