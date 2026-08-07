import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExpeditionOutcome } from './types.ts'
import {
  captureScenario,
  cleanForCompare,
  regressionScenarios,
} from './regression.ts'

function expectedOutcomeFromScenarioName(
  name: string,
): ExpeditionOutcome | undefined {
  const outcomes: ExpeditionOutcome[] = [
    'completeSuccess',
    'success',
    'partialSuccess',
    'failedObjective',
    'forcedRetreat',
    'lostExpedition',
  ]

  return outcomes.find((outcome) => name.endsWith(`-${outcome}`))
}

const baselineDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../regression-snapshots/baseline',
)

describe('expedition regression snapshots', () => {
  it('regression scenario names match their actual outcomes', () => {
    for (const scenario of regressionScenarios) {
      const expected = expectedOutcomeFromScenarioName(scenario.name)
      if (expected !== undefined) {
        expect(captureScenario(scenario).outcome, scenario.name).toBe(expected)
      }
    }
  })

  for (const scenario of regressionScenarios) {
    it(`matches ${scenario.name}`, () => {
      const baselinePath = join(baselineDir, `${scenario.name}.json`)
      expect(
        existsSync(baselinePath),
        `missing baseline for ${scenario.name}`,
      ).toBe(true)
      const expected = JSON.parse(readFileSync(baselinePath, 'utf-8'))
      const actual = captureScenario(scenario)
      expect(cleanForCompare(actual)).toEqual(cleanForCompare(expected))
    })
  }
})
