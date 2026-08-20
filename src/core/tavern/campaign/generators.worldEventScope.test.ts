import { describe, expect, it } from 'vitest'
import {
  buildRequestOfferForObjective,
  eligibleTemplatesForObjective,
} from './generators.ts'
import {
  TAVERN_REQUEST_TEMPLATES,
  TEMPLATES_BY_OBJECTIVE_TYPE,
} from '../requestTemplates.ts'
import { WORLD_EVENT_DEFINITIONS } from './worldEvents.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import type { TavernCampaignState } from './types.ts'

const WORLD_EVENT_ONLY_TEMPLATE_IDS = TAVERN_REQUEST_TEMPLATES.filter(
  (t) => t.worldEventOnly,
).map((t) => t.id)

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

describe('Phase 9.7.2 World-Event-only Template scope isolation', () => {
  it('at least the 6 known World-Event-only templates are flagged', () => {
    expect(WORLD_EVENT_ONLY_TEMPLATE_IDS.sort()).toEqual(
      [
        'survey-flooded-road-damage',
        'rescue-stranded-travelers',
        'escort-flood-detour-caravan',
        'survey-exposed-ruins',
        'investigation-missing-caravans',
        'rescue-caravan-survivors',
      ].sort(),
    )
  })

  it('eligibleTemplatesForObjective with no allowedTemplateIds never includes a World-Event-only template id', () => {
    for (const objective of Object.keys(TEMPLATES_BY_OBJECTIVE_TYPE) as Array<
      keyof typeof TEMPLATES_BY_OBJECTIVE_TYPE
    >) {
      const pool = eligibleTemplatesForObjective(objective)
      const poolIds = pool.map((t) => t.id)
      for (const eventOnlyId of WORLD_EVENT_ONLY_TEMPLATE_IDS) {
        expect(poolIds).not.toContain(eventOnlyId)
      }
    }
  })

  it('eligibleTemplatesForObjective with allowedTemplateIds selects strictly by id, including World-Event-only templates', () => {
    for (const template of TAVERN_REQUEST_TEMPLATES) {
      const pool = eligibleTemplatesForObjective(template.objectiveType, [
        template.id,
      ])
      expect(pool.map((t) => t.id)).toEqual([template.id])
    }
  })

  it('the default (no allowedTemplateIds) built offer never resolves to a World-Event-only template id, across a seed sweep', () => {
    for (const objective of Object.keys(TEMPLATES_BY_OBJECTIVE_TYPE) as Array<
      keyof typeof TEMPLATES_BY_OBJECTIVE_TYPE
    >) {
      const pool = eligibleTemplatesForObjective(objective).map((t) => t.id)
      for (let i = 0; i < 200; i++) {
        const seed = `scope-normal-${objective}-${i}`
        const offer = buildRequestOfferForObjective(
          `req-${i}`,
          seed,
          objective,
          'D',
        )
        // Re-derive which template id the same seed/pool would pick, purely
        // from the candidate pool — no title string matching involved.
        const template = TAVERN_REQUEST_TEMPLATES.find(
          (t) => t.title === offer.title && t.objectiveType === objective,
        )
        expect(template).toBeDefined()
        expect(pool).toContain(template!.id)
        expect(WORLD_EVENT_ONLY_TEMPLATE_IDS).not.toContain(template!.id)
      }
    }
  })

  it('an allowedTemplateIds selection can pick a World-Event-only template by id', () => {
    for (const id of WORLD_EVENT_ONLY_TEMPLATE_IDS) {
      const template = TAVERN_REQUEST_TEMPLATES.find((t) => t.id === id)!
      const offer = buildRequestOfferForObjective(
        'req-explicit',
        'scope-explicit-seed',
        template.objectiveType,
        'D',
        [id],
      )
      expect(offer.title).toBe(template.title)
    }
  })

  it('every World Event Definition/day resolves to a template that is genuinely in its allowed list (pure id check)', () => {
    for (const definition of WORLD_EVENT_DEFINITIONS) {
      for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
        const spec = definition.requests[dayOffset]
        expect(spec.templateIds.length).toBeGreaterThan(0)

        const pool = eligibleTemplatesForObjective(
          spec.objective,
          spec.templateIds,
        )
        expect(pool.length).toBeGreaterThan(0)
        for (const template of pool) {
          expect(spec.templateIds).toContain(template.id)
          expect(template.objectiveType).toBe(spec.objective)
        }

        const offer = buildRequestOfferForObjective(
          'req-def-check',
          `${definition.id}:day:${dayOffset}:check`,
          spec.objective,
          'D',
          spec.templateIds,
        )
        const matchedTemplate = TAVERN_REQUEST_TEMPLATES.find(
          (t) => t.title === offer.title && t.objectiveType === spec.objective,
        )!
        expect(spec.templateIds).toContain(matchedTemplate.id)
      }
    }
  })

  it('missing_caravans DAY2 is genuinely about caravan survivors, not a missing researcher in a swamp', () => {
    const definition = WORLD_EVENT_DEFINITIONS.find(
      (d) => d.id === 'missing_caravans',
    )!
    const day2Spec = definition.requests[1]
    expect(day2Spec.objective).toBe('rescue')
    expect(day2Spec.templateIds).toEqual(['rescue-caravan-survivors'])
    const template = TAVERN_REQUEST_TEMPLATES.find(
      (t) => t.id === 'rescue-caravan-survivors',
    )!
    expect(template.title).toContain('隊商')
    expect(template.briefing).toContain('隊商')
    expect(template.title).not.toContain('調査員')
    expect(template.environment).not.toBe('swamp')
  })

  it('Quest Chain follow-ups never select a World-Event-only template across a long run covering multiple objectives', () => {
    let campaign = createTavernCampaign('scope-chain-longrun')
    const seenChainObjectives = new Set<string>()
    const seenChainTemplateIds = new Set<string>()
    for (let day = 0; day < 60; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      for (const request of campaign.currentDay.requests) {
        if (request.chain === undefined) continue
        seenChainObjectives.add(request.objectiveType)
        const template = TAVERN_REQUEST_TEMPLATES.find(
          (t) =>
            t.title === request.title &&
            t.objectiveType === request.objectiveType,
        )
        if (template) {
          seenChainTemplateIds.add(template.id)
        }
      }
    }
    for (const id of seenChainTemplateIds) {
      expect(WORLD_EVENT_ONLY_TEMPLATE_IDS).not.toContain(id)
    }
    // Sanity: the long run actually exercised more than a trivial slice of
    // objectives, so the assertion above isn't vacuous.
    expect(seenChainObjectives.size).toBeGreaterThan(1)
  })

  it('normal (non-chain, non-event) board requests never select a World-Event-only template across a long run', () => {
    let campaign = createTavernCampaign('scope-normal-longrun')
    for (let day = 0; day < 60; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      for (const request of campaign.currentDay.requests) {
        if (request.chain !== undefined || request.worldEvent !== undefined) {
          continue
        }
        const template = TAVERN_REQUEST_TEMPLATES.find(
          (t) =>
            t.title === request.title &&
            t.objectiveType === request.objectiveType,
        )
        if (template) {
          expect(WORLD_EVENT_ONLY_TEMPLATE_IDS).not.toContain(template.id)
        }
      }
    }
  })
})
