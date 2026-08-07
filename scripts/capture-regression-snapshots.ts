import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  captureScenario,
  cleanForCompare,
  regressionScenarios,
} from '../src/core/expedition/regression.ts'

const OUT_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../regression-snapshots/baseline',
)

mkdirSync(OUT_DIR, { recursive: true })

for (const scenario of regressionScenarios) {
  const snapshot = captureScenario(scenario)
  const filePath = join(OUT_DIR, `${scenario.name}.json`)
  writeFileSync(filePath, JSON.stringify(cleanForCompare(snapshot), null, 2))
  console.log(`Captured ${scenario.name} -> ${filePath}`)
}
