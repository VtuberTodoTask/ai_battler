import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  captureScenario,
  cleanForCompare,
  regressionScenarios,
} from './regression.ts'

const baselineDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../regression-snapshots/baseline',
)

describe('expedition regression snapshots', () => {
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
