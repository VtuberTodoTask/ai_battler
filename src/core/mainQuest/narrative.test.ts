import { describe, expect, it } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { dispatchMainQuest } from './dispatch.ts'
import {
  MAIN_QUEST_NARRATIVE_PROMPT_VERSION,
  MAIN_QUEST_PLAYER_DISPLAY_NAME,
  buildMainQuestNarrativePrompt,
  generateMainQuestNarrative,
  parseMainQuestNarrativeScript,
  resolveMainQuestSpeakerName,
} from './narrative.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from './threats.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { MainQuestAttemptRecord, MainQuestThreatId } from './types.ts'

function resolvedFixture(threatId: MainQuestThreatId, seed: string) {
  const campaign = createTavernCampaign(seed)
  if (threatId === 'nosferatu') {
    campaign.mainQuest.threats.nosferatu = {
      ...campaign.mainQuest.threats.nosferatu,
      status: 'available',
    }
  }
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const party = campaign.parties[0]
  party.party.rank = definition.requiredPartyRank
  party.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === party.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  campaign.finance.funds = definition.fee + 1000
  const dispatch = dispatchMainQuest(campaign, threatId, party.id)
  if (!dispatch.ok) throw new Error('setup: dispatch failed')
  const resolved = resolveCampaignDay(dispatch.campaign)
  const attempt = resolved.mainQuest.attempts.find(
    (a) => a.id === dispatch.attemptId,
  )!
  const campaignParty = resolved.parties.find((p) => p.id === party.id)!
  return { definition, attempt, campaignParty }
}

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-mainquest',
    async generate() {
      return { text }
    },
  }
}

describe('Phase 9.8 Main Quest Narrative Prompt', () => {
  it('injects the current Unique Monster Profile, the Threat name, and the immutable Player facts', () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'kared',
      'mainquest-narrative-prompt-001',
    )
    const { system, user } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: false,
    })

    expect(system).toContain('戦えない')
    expect(system).toContain('主人公が剣や魔法で敵を攻撃した')
    expect(user).toContain(definition.name)
    expect(user).toContain(definition.uniqueMonster.motivation)
    expect(user).toContain(definition.uniqueMonster.communicationStyle)
    expect(user).toContain(definition.uniqueMonster.attitudeTowardHumans)
    for (const trait of definition.uniqueMonster.personalityTraits) {
      expect(user).toContain(trait)
    }
    expect(user).toContain(attempt.result!.monsterDefeated ? '勝利' : '敗北')
  })

  it('injects Affinity context (current + required) and instructs the AI not to speak the raw number', () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-prompt-005',
    )
    const { system, user } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: false,
    })
    expect(user).toContain(String(campaignParty.relationship.affinity))
    expect(user).toContain(String(definition.requiredAffinity))
    expect(system).toContain('数値をそのまま')
  })

  it("injects each Party member's narrative profile (temperament/values) when present", () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-prompt-006',
    )
    const { user } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: false,
    })
    for (const member of campaignParty.party.members) {
      expect(user).toContain(member.name)
      const profile = member.narrativeProfile
      if (profile?.values && profile.values.length > 0) {
        expect(user).toContain(profile.values[0])
      }
    }
  })

  it('includes a Previous Main Quest Participation section only when previousAttempts is non-empty', () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-prompt-007',
    )
    const { user: withoutHistory } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: false,
    })
    expect(withoutHistory).not.toContain('過去の主依頼参加歴')

    const priorAttempt: MainQuestAttemptRecord = {
      ...attempt,
      id: 'prior-attempt',
      dayNumber: attempt.dayNumber - 5,
    }
    const { user: withHistory } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: false,
      previousAttempts: [priorAttempt],
    })
    expect(withHistory).toContain('過去の主依頼参加歴')
    expect(withHistory).toContain(String(priorAttempt.dayNumber))
  })

  it('injects Nosferatu-specific context (former hero, curse, hero ideology, relationship to player) only for the Nosferatu Attempt', () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'nosferatu',
      'mainquest-narrative-prompt-002',
    )
    const { user: withNosferatu } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: true,
    })
    expect(withNosferatu).toContain('呪いをかけた本人')
    expect(withNosferatu).toContain('勇者')
    expect(withNosferatu).toContain('英雄')

    const {
      definition: alden,
      attempt: aldenAttempt,
      campaignParty: aldenParty,
    } = resolvedFixture('alden', 'mainquest-narrative-prompt-003')
    const { user: withoutNosferatu } = buildMainQuestNarrativePrompt({
      definition: alden,
      attempt: aldenAttempt,
      campaignParty: aldenParty,
      isNosferatu: false,
    })
    expect(withoutNosferatu).not.toContain('呪いをかけた本人')
  })

  it('only lists anchors that actually occurred, as the allowed BATTLE marker vocabulary', () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'eldia',
      'mainquest-narrative-prompt-004',
    )
    const { user } = buildMainQuestNarrativePrompt({
      definition,
      attempt,
      campaignParty,
      isNosferatu: false,
    })
    for (const anchor of attempt.battleTrace!.occurredAnchors) {
      expect(user).toContain(anchor)
    }
  })
})

describe('Phase 9.8 Main Quest Narrative parser', () => {
  it('parses PRE-BATTLE / BATTLE:<anchor> / POST-BATTLE markers', () => {
    const text = `===PRE-BATTLE===
戦いの前の物語。

===BATTLE:battle_start speaker=monster===
「来るがいい」

===POST-BATTLE===
戦いの後の物語。`

    const parsed = parseMainQuestNarrativeScript(text, ['battle_start'], [])
    expect(parsed.preBattle).toBe('戦いの前の物語。')
    expect(parsed.postBattle).toBe('戦いの後の物語。')
    expect(parsed.battleInterludes).toEqual([
      {
        anchorId: 'battle_start',
        speakerId: 'monster',
        text: '「来るがいい」',
      },
    ])
  })

  it('drops a BATTLE cue whose anchor never actually occurred', () => {
    const text = `===PRE-BATTLE===
前。

===BATTLE:monster_defeated speaker=monster===
「まだだ」

===POST-BATTLE===
後。`
    const parsed = parseMainQuestNarrativeScript(text, ['battle_start'], [])
    expect(parsed.battleInterludes).toEqual([])
  })

  it('drops a BATTLE cue from a speaker outside the given roster', () => {
    const text = `===PRE-BATTLE===
前。

===BATTLE:battle_start speaker=unknown-member===
「誰？」

===POST-BATTLE===
後。`
    const parsed = parseMainQuestNarrativeScript(
      text,
      ['battle_start'],
      ['adv-1'],
    )
    expect(parsed.battleInterludes).toEqual([])
  })

  it('accepts a cue from a known roster member', () => {
    const text = `===PRE-BATTLE===
前。

===BATTLE:battle_start speaker=adv-1===
「行くぞ」

===POST-BATTLE===
後。`
    const parsed = parseMainQuestNarrativeScript(
      text,
      ['battle_start'],
      ['adv-1'],
    )
    expect(parsed.battleInterludes).toHaveLength(1)
    expect(parsed.battleInterludes[0].speakerId).toBe('adv-1')
  })

  it('throws when PRE-BATTLE is missing', () => {
    const text = `===POST-BATTLE===\n後。`
    expect(() => parseMainQuestNarrativeScript(text, [], [])).toThrow()
  })

  it('throws when POST-BATTLE is missing', () => {
    const text = `===PRE-BATTLE===\n前。`
    expect(() => parseMainQuestNarrativeScript(text, [], [])).toThrow()
  })
})

describe('Phase 9.8 generateMainQuestNarrative', () => {
  it('returns a script stamped with MAIN_QUEST_NARRATIVE_PROMPT_VERSION and the provider id', async () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-gen-001',
    )
    const text = `===PRE-BATTLE===
物語前半。

===POST-BATTLE===
物語後半。`

    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      fakeProvider(text),
    )
    expect(script.promptVersion).toBe(MAIN_QUEST_NARRATIVE_PROMPT_VERSION)
    expect(script.providerId).toBe('fake-mainquest')
    expect(script.preBattle).toBe('物語前半。')
    expect(script.postBattle).toBe('物語後半。')
  })

  it('throws (does not resimulate) when the Attempt has no result yet', async () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-gen-002',
    )
    const pending: MainQuestAttemptRecord = {
      ...attempt,
      result: undefined,
      battleTrace: undefined,
    }
    await expect(
      generateMainQuestNarrative(
        definition,
        pending,
        campaignParty,
        fakeProvider('anything'),
      ),
    ).rejects.toThrow()
  })

  it('throws on an empty AI response', async () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-gen-003',
    )
    await expect(
      generateMainQuestNarrative(
        definition,
        attempt,
        campaignParty,
        fakeProvider(''),
      ),
    ).rejects.toThrow()
  })

  it('throws on a malformed AI response missing required markers', async () => {
    const { definition, attempt, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-narrative-gen-004',
    )
    await expect(
      generateMainQuestNarrative(
        definition,
        attempt,
        campaignParty,
        fakeProvider('just some prose with no markers at all'),
      ),
    ).rejects.toThrow()
  })
})

describe('Phase 9.8.1 resolveMainQuestSpeakerName', () => {
  it('resolves "monster" to the Unique Monster Profile name, never the raw id', () => {
    const { definition, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-speaker-001',
    )
    const name = resolveMainQuestSpeakerName(
      'monster',
      definition.uniqueMonster,
      campaignParty.party.members,
    )
    expect(name).toBe(definition.uniqueMonster.name)
    expect(name).not.toBe('monster')
  })

  it("resolves a roster member id to that Character's canonical name, never the raw id", () => {
    const { definition, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-speaker-002',
    )
    const member = campaignParty.party.members[0]
    const name = resolveMainQuestSpeakerName(
      member.id,
      definition.uniqueMonster,
      campaignParty.party.members,
    )
    expect(name).toBe(member.name)
    expect(name).not.toBe(member.id)
  })

  it('resolves "player" to the fixed Player-facing label', () => {
    const { definition, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-speaker-003',
    )
    const name = resolveMainQuestSpeakerName(
      'player',
      definition.uniqueMonster,
      campaignParty.party.members,
    )
    expect(name).toBe(MAIN_QUEST_PLAYER_DISPLAY_NAME)
  })

  it('never echoes an unknown raw id back as a display name', () => {
    const { definition, campaignParty } = resolvedFixture(
      'alden',
      'mainquest-speaker-004',
    )
    const name = resolveMainQuestSpeakerName(
      'not-a-real-participant-id',
      definition.uniqueMonster,
      campaignParty.party.members,
    )
    expect(name).not.toBe('not-a-real-participant-id')
  })
})
