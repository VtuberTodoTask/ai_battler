import { SeededRng } from '../rng/seededRng.ts'
import {
  Adventurer,
  Enemy,
  EnemyArchetype,
  EnemyRank,
  EnemySpecies,
  EnemyTier,
  EncounterGenerationOptions,
} from '../models/types.ts'
import { zEncounterGenerationOptions } from '../models/types.ts'
import { SPECIES, SPECIES_MAP } from '../../data/enemyData.ts'
import {
  ADVENTURER_THREAT,
  DIFFICULTY_BUDGET_MULTIPLIER,
} from '../balance/constants.ts'
import { round } from '../util.ts'
import { generateEnemy } from './enemyGenerator.ts'

const RANKS: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const RANK_THREATS = [1, 2, 4, 7, 11, 16]

function rankFromBudget(remaining: number, rng: SeededRng): EnemyRank {
  const suitable = RANKS.filter((_, i) => RANK_THREATS[i] <= remaining * 1.1)
  if (suitable.length === 0) return 'E'
  const weights = suitable.map((_, i) => 1 / RANK_THREATS[i])
  const total = weights.reduce((a, b) => a + b, 0)
  let value = rng.next() * total
  for (let i = 0; i < suitable.length; i++) {
    value -= weights[i]
    if (value <= 0) return suitable[i]
  }
  return suitable[suitable.length - 1]
}

function pickSpecies(
  rng: SeededRng,
  existingSpecies: EnemySpecies[],
  allowedSpecies?: EnemySpecies[],
): EnemySpecies {
  const pool = allowedSpecies ?? (SPECIES.map((s) => s.id) as EnemySpecies[])
  if (existingSpecies.length === 0) return rng.pick(pool)
  const sameSpecies = existingSpecies[0]
  if (rng.chance(80) && pool.includes(sameSpecies)) return sameSpecies
  const different = pool.filter((s) => s !== sameSpecies)
  if (different.length > 0) return rng.pick(different)
  return rng.pick(pool)
}

function pickTier(
  remaining: number,
  hasBoss: boolean,
  rng: SeededRng,
): EnemyTier {
  const tiers: EnemyTier[] = ['minion', 'standard', 'elite', 'boss']
  const maxTier: EnemyTier =
    remaining >= 12 && !hasBoss
      ? 'boss'
      : remaining >= 6
        ? 'elite'
        : remaining >= 2
          ? 'standard'
          : 'minion'
  const available = tiers.filter((t) =>
    t === 'boss'
      ? maxTier === 'boss'
      : tiers.indexOf(t) <= tiers.indexOf(maxTier),
  )
  const weights = available.map((t) => {
    if (t === 'boss') return 0.2
    if (t === 'elite') return remaining >= 6 ? 1.2 : 0.3
    if (t === 'minion') return remaining <= 2 ? 3 : 1.5
    return 3
  })
  return rng.weightedPick(available, weights)
}

function createEnemyForEncounter(
  seed: string,
  rank: EnemyRank,
  species: EnemySpecies,
  tier: EnemyTier,
  archetype: EnemyArchetype,
): Enemy {
  return generateEnemy(seed, { rank, species, archetype, tier })
}

export function generateEncounter(
  options: EncounterGenerationOptions,
): Enemy[] {
  const parsed = zEncounterGenerationOptions.parse(options)
  const rng = new SeededRng(parsed.seed)
  const maxCount = parsed.maxEnemyCount ?? 12
  const budget = round(
    parsed.partyThreat * DIFFICULTY_BUDGET_MULTIPLIER[parsed.difficulty],
  )
  const bossAllowed = parsed.bossAllowed ?? true

  let attempt = 0
  while (attempt < 50) {
    const enemies: Enemy[] = []
    let currentBudget = 0
    let hasBoss = false
    const speciesSet: EnemySpecies[] = []

    while (enemies.length < maxCount) {
      const remainingBudget = budget - currentBudget
      const remainingSlots = maxCount - enemies.length
      if (remainingBudget < 0.5 && enemies.length > 0) break
      if (remainingBudget <= 0) break
      if (remainingSlots === 0) break

      if (
        remainingBudget < 1 &&
        enemies.length > 0 &&
        currentBudget >= budget * 0.6
      )
        break

      const species = pickSpecies(rng, speciesSet, parsed.allowedSpecies)
      const target = remainingBudget / remainingSlots
      const rank = rankFromBudget(target, rng)
      const tier = pickTier(remainingBudget, hasBoss || !bossAllowed, rng)
      const archetype = rng.pick(SPECIES_MAP[species].preferredArchetypes)

      const seed = `${parsed.seed}-enc-${enemies.length}-${attempt}`
      const enemy = createEnemyForEncounter(
        seed,
        rank,
        species,
        tier,
        archetype,
      )

      if (tier === 'boss') hasBoss = true
      if (!speciesSet.includes(species)) speciesSet.push(species)
      enemies.push(enemy)
      currentBudget += enemy.threatCost

      if (currentBudget >= budget * 0.8 && currentBudget <= budget * 1.2) break
    }

    const ratio = currentBudget / budget
    if (ratio >= 0.8 && ratio <= 1.2) {
      return enemies
    }
    if (ratio >= 0.6 && ratio <= 1.4) {
      return enemies
    }
    attempt++
  }

  return [
    createEnemyForEncounter(
      `${parsed.seed}-fallback`,
      'E',
      'humanoid',
      'minion',
      'assault',
    ),
  ]
}

export function calculatePartyThreat(
  adventurers: { rank: Adventurer['rank'] }[],
): number {
  return adventurers.reduce((sum, a) => sum + ADVENTURER_THREAT[a.rank], 0)
}
