import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { runExpedition } from '../expedition/expedition.ts'
import { buildDispatchReport } from './report.ts'
import { TAVERN_REQUEST_TEMPLATES } from './requestTemplates.ts'
import { generateTavernDay } from './dayGenerator.ts'
import { deepClone } from '../util.ts'
import type { Adventurer, AdventurerRole } from '../models/types.ts'
import type { ObjectiveType } from '../expedition/types.ts'

const ROLES: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']

function buildParty(seed: string, rank = 'C' as const): Adventurer[] {
  return ROLES.map((role, slot) =>
    generateAdventurer({ seed: `${seed}:party:${slot}`, rank, role }),
  )
}

function findTemplate(type: ObjectiveType) {
  return TAVERN_REQUEST_TEMPLATES.find((t) => t.objectiveType === type)!
}

function runFor(type: ObjectiveType) {
  const template = findTemplate(type)
  const request = template.build({
    requestId: `report-test-${type}`,
    seed: `report-test-${type}`,
    rank: 'C',
    battleEnabled: false,
  }).expeditionRequest
  const party = buildParty(`report-test-${type}`)
  const result = runExpedition(request, party)
  const report = buildDispatchReport(`report-test-${type}`, result)
  return { result, report }
}

describe('buildDispatchReport', () => {
  it('does not mutate the expedition result', () => {
    const { result } = runFor('investigation')
    const before = JSON.stringify(result)
    buildDispatchReport('test', result)
    expect(JSON.stringify(result)).toBe(before)
  })

  it('produces a report for investigation', () => {
    const { report } = runFor('investigation')
    expect(report.objectiveType).toBe('investigation')
    expect(report.objective.type).toBe('investigation')
    if (report.objective.type !== 'investigation')
      throw new Error('type mismatch')
    expect(typeof report.objective.discoveredInformationCount).toBe('number')
    expect(typeof report.objective.completeInformationCount).toBe('number')
    expect(typeof report.objective.battleIntelCount).toBe('number')
  })

  it('produces a report for elimination', () => {
    const { report } = runFor('elimination')
    expect(report.objectiveType).toBe('elimination')
    expect(report.objective.type).toBe('elimination')
    if (report.objective.type !== 'elimination')
      throw new Error('type mismatch')
    expect(typeof report.objective.defeatedCount).toBe('number')
    expect(typeof report.objective.survivingCount).toBe('number')
  })

  it('produces a report for rescue', () => {
    const { report } = runFor('rescue')
    expect(report.objectiveType).toBe('rescue')
    expect(report.objective.type).toBe('rescue')
    if (report.objective.type !== 'rescue') throw new Error('type mismatch')
    expect(report.objective.targetName).toBeTruthy()
    expect(typeof report.objective.finalHp).toBe('number')
    expect(typeof report.objective.maxHp).toBe('number')
  })

  it('produces a report for escort', () => {
    const { report } = runFor('escort')
    expect(report.objectiveType).toBe('escort')
    expect(report.objective.type).toBe('escort')
    if (report.objective.type !== 'escort') throw new Error('type mismatch')
    expect(report.objective.targetName).toBeTruthy()
    expect(typeof report.objective.routeProgress).toBe('number')
  })

  it('produces a report for retrieval', () => {
    const { report } = runFor('retrieval')
    expect(report.objectiveType).toBe('retrieval')
    expect(report.objective.type).toBe('retrieval')
    if (report.objective.type !== 'retrieval') throw new Error('type mismatch')
    expect(report.objective.targetName).toBeTruthy()
    expect(typeof report.objective.finalIntegrity).toBe('number')
    expect(typeof report.objective.minimumAcceptableIntegrity).toBe('number')
  })

  it('produces a report for survey', () => {
    const { report } = runFor('survey')
    expect(report.objectiveType).toBe('survey')
    expect(report.objective.type).toBe('survey')
    if (report.objective.type !== 'survey') throw new Error('type mismatch')
    expect(report.objective.areaName).toBeTruthy()
    expect(typeof report.objective.coveragePercent).toBe('number')
    expect(typeof report.objective.averageQuality).toBe('number')
  })

  it('reconstructs state without parsing fact strings', () => {
    const { report } = runFor('rescue')
    if (report.objective.type !== 'rescue') throw new Error('type mismatch')
    expect(report.objective.located !== undefined).toBe(true)
    expect(report.objective.reached !== undefined).toBe(true)
    expect(report.objective.stabilized !== undefined).toBe(true)
    expect(report.objective.evacuated !== undefined).toBe(true)
    expect(report.objective.returned !== undefined).toBe(true)
    expect(report.objective.abandoned !== undefined).toBe(true)
  })

  it('uses final party state from ExpeditionState', () => {
    const day = generateTavernDay('tavern-001')
    const request = day.requests[0].expeditionRequest
    const party = day.parties[0].party.members.map((m) => deepClone(m))
    const result = runExpedition(request, party)
    const report = buildDispatchReport(request.id, result)

    let changed = false
    for (const member of report.party) {
      expect(member.finalHp).toBe(result.state.partyHp[member.adventurerId])
      expect(member.finalMp).toBe(result.state.partyMp[member.adventurerId])
      expect(member.finalMorale).toBe(
        result.state.partyMorale[member.adventurerId],
      )
      if (
        member.finalHp <
        (result.party.find((a) => a.id === member.adventurerId)?.maxHp ??
          member.maxHp)
      ) {
        changed = true
      }
    }
    expect(changed).toBe(true)
  })

  it('matches DispatchReport invariants to ExpeditionResult state', () => {
    const { result, report } = runFor('investigation')
    expect(report.outcome).toBe(result.outcome)
    expect(report.objectiveCompleted).toBe(result.state.objectiveCompleted)
    expect(report.objectiveProgress).toBe(result.state.objectiveProgress)
    expect(report.elapsedTime).toBe(result.state.elapsedTime)
    expect(report.battleOutcome).toBe(result.state.battleOutcome)
    expect(report.casualties).toEqual(result.state.casualties)
    expect(report.incapacitated).toEqual(result.state.incapacitated)
  })
})
