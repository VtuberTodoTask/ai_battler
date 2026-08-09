import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  captureScenario,
  cleanForCompare,
  regressionScenarios,
} from '../src/core/expedition/regression.ts'

const baselineDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../regression-snapshots/baseline',
)

function classifyChange(
  name: string,
  baseline: unknown,
  actual: unknown,
): string[] {
  const cats: string[] = []
  if (!baseline || !actual) return ['missing']
  const b = baseline as Record<string, unknown>
  const a = actual as Record<string, unknown>
  if (b.outcome !== a.outcome) cats.push('outcome')
  const bState = b.state as Record<string, unknown> | undefined
  const aState = a.state as Record<string, unknown> | undefined
  if (bState && aState) {
    if (bState.objectiveProgress !== aState.objectiveProgress)
      cats.push('objectiveProgress')
    if (JSON.stringify(bState.partyHp) !== JSON.stringify(aState.partyHp))
      cats.push('partyHp')
    if (JSON.stringify(bState.partyMp) !== JSON.stringify(aState.partyMp))
      cats.push('partyMp')
    if (
      JSON.stringify(bState.partyMorale) !== JSON.stringify(aState.partyMorale)
    )
      cats.push('partyMorale')
    const bBattles = (bState.battles ?? []) as unknown[]
    const aBattles = (aState.battles ?? []) as unknown[]
    if (bBattles.length !== aBattles.length) {
      cats.push('battleCount')
    } else if (bBattles.length > 0) {
      const b0 = bBattles[0] as Record<string, unknown>
      const a0 = aBattles[0] as Record<string, unknown>
      if (b0.outcome !== a0.outcome) cats.push('battleOutcome')
      const bResult = b0.result as Record<string, unknown> | undefined
      const aResult = a0.result as Record<string, unknown> | undefined
      if (
        JSON.stringify(bResult?.finalAdventurerStates) !==
        JSON.stringify(aResult?.finalAdventurerStates)
      ) {
        cats.push('battleState')
      }
    }
  }
  return cats
}

const summary: Record<string, { changed: boolean; categories: string[] }> = {}
let changedCount = 0
const categoriesCounts: Record<string, number> = {}
for (const scenario of regressionScenarios) {
  const baselinePath = join(baselineDir, `${scenario.name}.json`)
  let baseline: unknown
  if (existsSync(baselinePath)) {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  }
  const actual = captureScenario(scenario)
  const bClean = baseline ? cleanForCompare(baseline) : null
  const aClean = cleanForCompare(actual)
  const eq = JSON.stringify(bClean) === JSON.stringify(aClean)
  const cats = baseline ? classifyChange(scenario.name, baseline, actual) : []
  for (const c of cats) categoriesCounts[c] = (categoriesCounts[c] ?? 0) + 1
  summary[scenario.name] = { changed: !eq, categories: cats }
  if (!eq) changedCount++
}

console.log(
  `Regression scenarios changed: ${changedCount} / ${regressionScenarios.length}`,
)
console.log('Category counts:', categoriesCounts)
writeFileSync(
  'reports/phase6_2_pass1_regression_diff.json',
  JSON.stringify(
    {
      changedCount,
      total: regressionScenarios.length,
      categoryCounts: categoriesCounts,
      perScenario: summary,
    },
    null,
    2,
  ),
)
