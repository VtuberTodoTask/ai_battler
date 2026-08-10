import { describe, expect, it, vi } from 'vitest'
import type { ExpeditionNarrativeContext } from './types.ts'
import type { ExpeditionResult } from '../expedition/types.ts'
import { buildDispatchReport } from '../tavern/report.ts'
import {
  buildExpeditionNarrativeTimeline,
  formatNarrativeTimeline,
} from './timeline.ts'
import { buildNarrativePrompt } from './prompt.ts'
import { logEntry } from '../expedition/logs.ts'
import { runExpedition } from '../expedition/expedition.ts'

import {
  makeEliminationRequest,
  makeEscortRequest,
  makeParty,
  makeRequest,
  makeRescueRequest,
  makeRetrievalRequest,
  makeSurveyRequest,
} from '../expedition/test-utils.ts'

const PHASE_ORDER: string[] = [
  'departure',
  'approach',
  'exploration',
  'objective',
  'battle',
  'return',
  'aftermath',
]

function buildTestContext(
  result: ExpeditionResult,
): ExpeditionNarrativeContext {
  const report = buildDispatchReport(result.request.id, result)
  return {
    kind: 'expedition',
    party: {
      id: 'party-1',
      name: 'Test Party',
      rank: result.party[0]?.rank ?? 'E',
      leaderId: result.party[0]?.id ?? 'leader',
      leaderName: result.party[0]?.name ?? 'Leader',
      members: result.party.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        rank: a.rank,
        personality: a.personality,
      })),
      missionSpecialization: {
        strongObjective: 'investigation',
        weakObjective: 'elimination',
      },
      affinity: 0,
      financialPressure: 0,
      riskTolerance: 'balanced',
      growthMilestones: 0,
      trainingDays: 0,
      stats: {
        totalExpeditions: 0,
        completeSuccesses: 0,
        successes: 0,
        partialSuccesses: 0,
        failures: 0,
        retreats: 0,
      },
      arrivalDay: 1,
      plannedDepartureDay: 1,
    },
    request: {
      id: result.request.id,
      title: 'Test Request',
      briefing: 'Test briefing',
      rank: result.request.rank,
      objectiveType: result.request.objectiveType,
      environment: result.request.environment,
      publicTags: [],
    },
    report,
    state: result.state,
  }
}

function runObjective(objectiveType: string): ExpeditionResult {
  const party = makeParty(
    ['vanguard', 'guardian', 'mage', 'healer'],
    `${objectiveType}-seed`,
    'C',
  )
  let request
  switch (objectiveType) {
    case 'investigation':
      request = makeRequest(`${objectiveType}-seed`)
      break
    case 'elimination':
      request = makeEliminationRequest(`${objectiveType}-seed`)
      break
    case 'rescue':
      request = makeRescueRequest(`${objectiveType}-seed`)
      break
    case 'escort':
      request = makeEscortRequest(`${objectiveType}-seed`)
      break
    case 'retrieval':
      request = makeRetrievalRequest(`${objectiveType}-seed`)
      break
    case 'survey':
      request = makeSurveyRequest(`${objectiveType}-seed`)
      break
    default:
      request = makeRequest(`${objectiveType}-seed`)
  }
  return runExpedition(request, party)
}

describe('buildExpeditionNarrativeTimeline', () => {
  it('produces deterministic output for the same context', () => {
    const result = runObjective('investigation')
    const context = buildTestContext(result)
    const first = buildExpeditionNarrativeTimeline(context)
    for (let i = 0; i < 99; i++) {
      const next = buildExpeditionNarrativeTimeline(context)
      expect(next).toEqual(first)
    }
  })

  it('preserves source event ordering in phase sequence', () => {
    const result = runObjective('investigation')
    const context = buildTestContext(result)
    const timeline = buildExpeditionNarrativeTimeline(context)
    const phaseIndices = timeline.map((b) => PHASE_ORDER.indexOf(b.phase))
    for (let i = 1; i < phaseIndices.length; i++) {
      expect(phaseIndices[i]).toBeGreaterThanOrEqual(phaseIndices[i - 1])
    }
    expect(timeline[0].phase).toBe('departure')
    expect(timeline[timeline.length - 1].phase).toBe('aftermath')
  })

  it('includes beats for all six objective types', () => {
    for (const objectiveType of [
      'investigation',
      'elimination',
      'rescue',
      'escort',
      'retrieval',
      'survey',
    ]) {
      const result = runObjective(objectiveType)
      const context = buildTestContext(result)
      const timeline = buildExpeditionNarrativeTimeline(context)
      expect(timeline.length).toBeGreaterThan(0)
      expect(timeline.some((b) => b.phase === 'departure')).toBe(true)
      expect(
        timeline.some((b) => b.phase === 'return' || b.phase === 'aftermath'),
      ).toBe(true)
      for (const beat of timeline) {
        expect(beat.text).toBeTruthy()
        expect(beat.id).toBeTruthy()
        expect(typeof beat.importance).toBe('number')
      }
    }
  })

  it('compresses long battle logs into a limited number of narrative beats', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'long-battle',
      'C',
    )
    const request = {
      ...makeEliminationRequest('long-battle', 'C', false, 'swarm'),
      difficulty: 'hard' as const,
    }
    const result = runExpedition(request, party)
    const context = buildTestContext(result)
    const timeline = buildExpeditionNarrativeTimeline(context)
    const battleBeats = timeline.filter((b) => b.phase === 'battle')
    const battleRecord = result.state.battles[0]
    expect(battleRecord).toBeDefined()
    const sourceEvents = battleRecord.result.logs.length
    expect(sourceEvents).toBeGreaterThan(battleBeats.length)
    expect(battleBeats.length).toBeLessThanOrEqual(15)
  })

  it('preserves mandatory battle events', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'casualty',
      'C',
    )
    const request = {
      ...makeEliminationRequest('casualty', 'C', false, 'standard'),
      difficulty: 'deadly' as const,
    }
    const result = runExpedition(request, party)
    const context = buildTestContext(result)
    const timeline = buildExpeditionNarrativeTimeline(context)
    const battleBeats = timeline.filter((b) => b.phase === 'battle')
    const texts = battleBeats.map((b) => b.text).join('\n')
    expect(texts).toContain('遠征中に戦闘が発生した')
    expect(texts).toContain('戦闘結果は')
    if (result.state.casualties.length > 0) {
      expect(texts).toContain('命を落とした')
    }
    if (result.outcome === 'forcedRetreat') {
      expect(texts).toContain('撤退')
    }
  })

  it('does not invent weapons or wounds from generic attack logs', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'weapon-check',
      'C',
    )
    const request = makeEliminationRequest('weapon-check', 'C', false, 'swarm')
    const result = runExpedition(request, party)
    const context = buildTestContext(result)
    const timeline = buildExpeditionNarrativeTimeline(context)
    const texts = timeline.map((b) => b.text).join('\n')
    const forbidden = [
      '剣',
      '槍',
      '弓',
      '盾',
      '刀',
      '斧',
      '傷口',
      '骨折',
      '出血',
      '火傷',
    ]
    for (const word of forbidden) {
      expect(texts).not.toContain(word)
    }
  })

  it('uses canonical Japanese ability names from ABILITY_MAP', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-check',
      'C',
    )
    const request = makeEliminationRequest(
      'ability-check',
      'C',
      false,
      'standard',
    )
    const result = runExpedition(request, party)
    const context = buildTestContext(result)

    const record = result.state.battles[0]
    const baseline = buildExpeditionNarrativeTimeline(context)
    const baseTexts = baseline.map((b) => b.text).join('\n')
    expect(baseTexts).not.toContain('summon')
    expect(baseTexts).not.toContain('Fireball')

    if (record) {
      const member = result.party[0]
      record.result.logs.push({
        round: 1,
        phase: 'combat',
        actionType: 'ability',
        result: 'test',
        actorId: member.id,
        targetIds: [],
        metadata: { abilityId: 'summon' },
      })
    }

    const withAbility = buildExpeditionNarrativeTimeline(context)
    const texts = withAbility.map((b) => b.text).join('\n')
    expect(texts).toContain('仲間召喚')
    expect(texts).not.toContain('summon')
  })

  it('omits unknown ability ids from the Japanese timeline', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'unknown-ability',
      'C',
    )
    const request = makeEliminationRequest(
      'unknown-ability',
      'C',
      false,
      'standard',
    )
    const result = runExpedition(request, party)
    const context = buildTestContext(result)
    const record = result.state.battles[0]
    if (record) {
      const member = result.party[0]
      record.result.logs.push({
        round: 1,
        phase: 'combat',
        actionType: 'ability',
        result: 'test',
        actorId: member.id,
        targetIds: [],
        metadata: { abilityId: 'Fireball' },
      })
    }
    const timeline = buildExpeditionNarrativeTimeline(context)
    const texts = timeline.map((b) => b.text).join('\n')
    expect(texts).not.toContain('Fireball')
    expect(texts).not.toContain('Fireballを使用した')
  })

  it('is independent of global RNG and Date.now', () => {
    const result = runObjective('investigation')
    const context = buildTestContext(result)
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random should not be called')
    })
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now should not be called')
    })
    try {
      buildExpeditionNarrativeTimeline(context)
    } finally {
      randomSpy.mockRestore()
      dateSpy.mockRestore()
    }
  })
})

describe('v4 prompt integration', () => {
  it('includes EXPEDITION TIMELINE and CONFIRMED OUTCOME FACTS sections', () => {
    const result = runObjective('investigation')
    const context = buildTestContext(result)
    const { system, user } = buildNarrativePrompt(context)
    expect(user).toContain('=== EXPEDITION TIMELINE ===')
    expect(user).toContain('=== CONFIRMED OUTCOME FACTS ===')
    expect(user).toContain('=== DETAILS NOT RECORDED ===')
    expect(user).toContain('=== NARRATIVE HINTS ===')
    expect(user).toContain('=== WRITING INSTRUCTIONS ===')
    expect(user).toContain('1600～2600字')
    expect(system).toContain('TIMELINEは出来事の順序を示します')
    expect(system).toContain('TIMELINEに書かれていない')
  })

  it('does not leak raw system values into the user prompt', () => {
    const result = runObjective('elimination')
    const context = buildTestContext(result)
    const { user } = buildNarrativePrompt(context)
    const forbidden = [
      'battleOutcome',
      'combatSeed',
      'predictionSeed',
      'apiKey',
      'Authorization',
      'HP ',
      'MP ',
      'Morale ',
      'Strong Objective',
      'Weak Objective',
    ]
    for (const word of forbidden) {
      expect(user).not.toContain(word)
    }
  })
})

describe('structured timeline projection', () => {
  it('does not copy raw log.facts strings into timeline beats', () => {
    const result = runObjective('investigation')
    const poisonedFact = 'POISONED_RAW_FACT_7f8a9b'
    result.state.logs.push(
      logEntry(
        'exploration',
        'poisonedDiagnostic',
        [],
        [poisonedFact, 'Another raw leak: 123'],
        [],
      ),
    )
    const context = buildTestContext(result)
    const texts = buildExpeditionNarrativeTimeline(context)
      .map((b) => b.text)
      .join('\n')
    expect(texts).not.toContain(poisonedFact)
    expect(texts).not.toContain('Another raw leak')
  })

  it('produces no beats for unknown log types', () => {
    const result = runObjective('investigation')
    result.state.logs.push(
      logEntry(
        'exploration',
        'unknownCustomType',
        [],
        ['custom fact leak'],
        [],
      ),
    )
    const context = buildTestContext(result)
    const texts = buildExpeditionNarrativeTimeline(context)
      .map((b) => b.text)
      .join('\n')
    expect(texts).not.toContain('custom fact leak')
  })

  it('does not leak numeric damage, supply counts, or check enum labels', () => {
    for (const objectiveType of [
      'investigation',
      'elimination',
      'rescue',
      'escort',
      'retrieval',
      'survey',
    ]) {
      const result = runObjective(
        objectiveType as
          | 'investigation'
          | 'elimination'
          | 'rescue'
          | 'escort'
          | 'retrieval'
          | 'survey',
      )
      const context = buildTestContext(result)
      const texts = buildExpeditionNarrativeTimeline(context)
        .map((b) => b.text)
        .join('\n')
      const forbidden = [
        'criticalSuccess',
        'partialSuccess',
        'failure',
        'success',
        'HP',
        'MP',
        'Morale',
        'medicine',
        'tools',
        'food',
        '%',
        'progress',
        'quality',
        'AverageQuality',
        'ReportReturned',
        'roll',
        'difficulty',
      ]
      for (const word of forbidden) {
        expect(texts).not.toContain(word)
      }
      expect(texts).not.toMatch(/\d+の(ダメージ|被害|損傷|回復|消費|負傷|傷)/)
      expect(texts).not.toMatch(/\d+(HP|MP| morale)/i)
      expect(texts).not.toMatch(/roll[ =:]*\d+/i)
    }
  })

  it('keeps world-facing counts for elimination targets', () => {
    const result = runObjective('elimination')
    const context = buildTestContext(result)
    const texts = buildExpeditionNarrativeTimeline(context)
      .map((b) => b.text)
      .join('\n')
    expect(texts).toMatch(/討伐対象として\d+体が指定された/)
  })
})

describe('formatNarrativeTimeline', () => {
  it('groups beats by phase and renders as a bullet list', () => {
    const result = runObjective('investigation')
    const context = buildTestContext(result)
    const timeline = buildExpeditionNarrativeTimeline(context)
    const text = formatNarrativeTimeline(timeline)
    expect(text).toContain('[出発]')
    expect(text).toContain('- ')
    expect(text.length).toBeGreaterThan(0)
  })
})
