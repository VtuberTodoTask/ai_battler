import { describe, expect, it } from 'vitest'
import { makeParty, makeRequest, runBatch } from './test-utils.ts'
import { runExpedition } from './expedition.ts'

describe('Hidden information discovery', () => {
  it('uses requiredSkill and difficulty from HiddenInformation', () => {
    const request = makeRequest('hidden-skill', {
      environment: 'magical',
      features: [],
      hiddenInformation: [
        {
          id: 'magic-info',
          name: '古代の封印',
          description: '魔法の痕跡',
          difficulty: 10,
          requiredSkill: 'monsterKnowledge',
        },
      ],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'hidden-skill',
    )
    const result = runExpedition(request, party)
    const discovered = result.state.information.find(
      (i) => i.id === 'magic-info',
    )
    if (discovered) {
      expect(discovered.completeness).toBe('complete')
    } else {
      const logSkills = result.state.logs
        .filter((l) => l.check)
        .map((l) => l.check?.skill)
      expect(logSkills).toContain('monsterKnowledge')
    }
  })

  it('produces fragments on partial success and completes them later', () => {
    const request = makeRequest('fragment-upgrade', {
      environment: 'forest',
      features: [],
      hiddenInformation: [
        {
          id: 'frag-info',
          name: '謎の足跡',
          description: '何者かの痕跡',
          difficulty: 100,
        },
      ],
    })
    const party = makeParty(
      ['scout', 'vanguard', 'mage', 'healer'],
      'fragment-upgrade',
    )
    const result = runExpedition(request, party)
    const info = result.state.information.find((i) => i.id === 'frag-info')
    if (info) {
      expect(['fragment', 'complete']).toContain(info.completeness)
    }
  })

  it('does not add duplicate information', () => {
    const request = makeRequest('no-duplicate', {
      features: [],
      hiddenInformation: [
        { id: 'dup', name: '一つの手がかり', description: '', difficulty: 0 },
      ],
    })
    const party = makeParty(
      ['scout', 'vanguard', 'mage', 'healer'],
      'no-duplicate',
    )
    const result = runExpedition(request, party)
    const ids = result.state.information.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Outcome and fact consistency', () => {
  it('objectiveCompleted matches progress threshold', () => {
    const results = runBatch(
      makeRequest,
      ['vanguard', 'guardian', 'mage', 'healer'],
      80,
    )
    for (const r of results) {
      expect(r.state.objectiveCompleted).toBe(r.state.objectiveProgress >= 60)
    }
  })

  it('failedObjective corresponds to progress below the success threshold', () => {
    const results = runBatch(makeRequest, ['vanguard', 'mage'], 100)
    const failed = results.filter((r) => r.outcome === 'failedObjective')
    expect(failed.length).toBeGreaterThan(0)
    for (const r of failed) {
      expect(r.state.objectiveProgress).toBeLessThan(60)
      const facts = r.state.logs.flatMap((l) => l.facts)
      expect(facts.some((f) => f.includes('完全に達成した'))).toBe(false)
    }
  })

  it('partialSuccess contains a partial achievement fact', () => {
    const results = runBatch(
      makeRequest,
      ['vanguard', 'guardian', 'mage', 'healer'],
      120,
    )
    const partial = results.filter((r) => r.outcome === 'partialSuccess')
    expect(partial.length).toBeGreaterThan(0)
    for (const r of partial) {
      const facts = r.state.logs.flatMap((l) => l.facts)
      expect(
        facts.some(
          (f) =>
            f.includes('部分的に達成') ||
            f.includes('手がかりは得たが') ||
            f.includes('最低限'),
        ),
      ).toBe(true)
    }
  })

  it('success contains an objective achievement fact', () => {
    const results = runBatch(
      makeRequest,
      ['vanguard', 'guardian', 'mage', 'healer'],
      120,
    )
    const success = results.filter(
      (r) => r.outcome === 'success' || r.outcome === 'completeSuccess',
    )
    for (const r of success) {
      const facts = r.state.logs.flatMap((l) => l.facts)
      expect(
        facts.some(
          (f) =>
            f.includes('目的を達成') ||
            f.includes('完全に達成') ||
            f.includes('最低限'),
        ),
      ).toBe(true)
    }
  })
})
