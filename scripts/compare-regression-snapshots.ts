import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE_DIR = join(
  import.meta.dirname ?? '.',
  '../regression-snapshots/baseline',
)
const CUR_DIR = join(
  import.meta.dirname ?? '.',
  '../regression-snapshots/current',
)

const files = readdirSync(BASE_DIR).filter((f) => f.endsWith('.json'))
let allOk = true

for (const file of files) {
  const baseline = JSON.parse(readFileSync(join(BASE_DIR, file), 'utf8'))
  const currentPath = join(CUR_DIR, file)
  let current: unknown
  try {
    current = JSON.parse(readFileSync(currentPath, 'utf8'))
  } catch {
    console.error(`Missing current snapshot: ${file}`)
    allOk = false
    continue
  }
  const baselineJson = JSON.stringify(baseline)
  const currentJson = JSON.stringify(current)
  if (baselineJson === currentJson) {
    console.log(`OK ${file}`)
  } else {
    console.error(`MISMATCH ${file}`)
    allOk = false
  }
}

if (!allOk) {
  process.exit(1)
}

console.log('All regression snapshots match.')
