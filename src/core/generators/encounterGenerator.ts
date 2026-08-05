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
  ENEMY_BASE_THREAT,
  TIER_THREAT_MULTIPLIER,
} from '../balance/constants.ts'
import { round } from '../util.ts'
import { generateEnemy } from './enemyGenerator.ts'

const RANKS: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

interface RankTierCombo {
  rank: EnemyRank
  tier: EnemyTier
  baseCost: number
}

function baseCost(rank: EnemyRank, tier: EnemyTier): number {
  return ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier]
}

function allRankTierCombos(): RankTierCombo[] {
  const tiers: EnemyTier[] = ['minion', 'standard', 'elite', 'boss']
  const combos: RankTierCombo[] = []
  for (const rank of RANKS) {
    for (const tier of tiers) {
      combos.push({ rank, tier, baseCost: baseCost(rank, tier) })
    }
  }
  return combos
}

const RANK_TIER_COMBOS = allRankTierCombos()

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

function generateEnemyForTarget(
  seed: string,
  remaining: number,
  remainingSlots: number,
  species: EnemySpecies,
  archetype: EnemyArchetype,
  _rng: SeededRng,
): Enemy | undefined {
  if (remaining <= 0 || remainingSlots <= 0) return undefined
  const target = remaining / remainingSlots
  const maxCost = remaining * 1.05

  const candidates = RANK_TIER_COMBOS.filter((c) => c.baseCost <= maxCost)
    .map((c) => ({ ...c, distance: Math.abs(c.baseCost - target) }))
    .sort((a, b) => a.distance - b.distance || b.baseCost - a.baseCost)

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const enemy = generateEnemy(`${seed}-fit-${i}`, {
      rank: c.rank,
      species,
      archetype,
      tier: c.tier,
    })
    if (enemy.threatCost <= maxCost) return enemy
  }

  // Fallback to the cheapest possible enemy.
  const cheapest = RANK_TIER_COMBOS[RANK_TIER_COMBOS.length - 1]
  const enemy = generateEnemy(`${seed}-cheapest`, {
    rank: cheapest.rank,
    species,
    archetype,
    tier: cheapest.tier,
  })
  if (enemy.threatCost <= remaining) return enemy
  return undefined
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

function tryDowngradeLast(
  enemies: Enemy[],
  budget: number,
  seed: string,
  rng: SeededRng,
): Enemy[] | undefined {
  if (enemies.length === 0) return undefined
  const lastIndex = enemies.length - 1
  const last = enemies[lastIndex]
  const current = enemies.reduce((sum, e) => sum + e.threatCost, 0)
  const othersCost = current - last.threatCost
  const maxCost = budget * 1.2 - othersCost

  const species = last.species
  const archetype = last.archetype
  const replacement = generateEnemyForTarget(
    `${seed}-downgrade-${lastIndex}`,
    maxCost,
    1,
    species,
    archetype,
    rng,
  )
  if (!replacement) return undefined

  const next = [...enemies]
  next[lastIndex] = replacement
  return next
}

function tryAddMinion(
  enemies: Enemy[],
  budget: number,
  seed: string,
  speciesSet: EnemySpecies[],
  allowedSpecies: EnemySpecies[] | undefined,
  rng: SeededRng,
): Enemy[] | undefined {
  if (enemies.length >= 12) return undefined
  const current = enemies.reduce((sum, e) => sum + e.threatCost, 0)
  const remaining = budget * 1.2 - current
  if (remaining < 0.3) return undefined

  const species = pickSpecies(rng, speciesSet, allowedSpecies)
  const archetype = rng.pick(SPECIES_MAP[species].preferredArchetypes)
  const minion = createEnemyForEncounter(
    `${seed}-fill`,
    'E',
    species,
    'minion',
    archetype,
  )
  if (current + minion.threatCost > budget * 1.2) return undefined
  return [...enemies, minion]
}

export function generateEncounter(
  options: EncounterGenerationOptions,
): Enemy[] {
  const parsed = zEncounterGenerationOptions.parse(options)
  const rng = new SeededRng(parsed.seed)
  const maxCount = parsed.maxEnemyCount ?? 12
  const rawBudget =
    parsed.partyThreat * DIFFICULTY_BUDGET_MULTIPLIER[parsed.difficulty]

  // Exception for extremely small budgets: a single cheap minion is the best we can do.
  if (rawBudget < 1) {
    return [
      createEnemyForEncounter(
        `${parsed.seed}-small-budget`,
        'E',
        'insect',
        'minion',
        'swarm',
      ),
    ]
  }

  const budget = round(rawBudget)
  const _bossAllowed = parsed.bossAllowed ?? true
  void _bossAllowed

  for (let attempt = 0; attempt < 100; attempt++) {
    const enemies: Enemy[] = []
    let currentBudget = 0
    let _hasBoss = false
    const speciesSet: EnemySpecies[] = []

    while (enemies.length < maxCount) {
      const remaining = budget - currentBudget
      const remainingSlots = maxCount - enemies.length
      if (remaining <= 0) break
      if (remainingSlots <= 0) break
      if (enemies.length > 0 && currentBudget >= budget * 0.8) break

      const species = pickSpecies(rng, speciesSet, parsed.allowedSpecies)
      const archetype = rng.pick(SPECIES_MAP[species].preferredArchetypes)

      const seed = `${parsed.seed}-enc-${enemies.length}-${attempt}`
      const enemy = generateEnemyForTarget(
        seed,
        remaining,
        remainingSlots,
        species,
        archetype,
        rng,
      )

      if (!enemy) break

      if (currentBudget + enemy.threatCost > budget * 1.2) {
        // Try to find a smaller fit for this slot instead of breaking.
        const tighter = generateEnemyForTarget(
          `${seed}-tight`,
          budget * 1.2 - currentBudget,
          1,
          species,
          archetype,
          rng,
        )
        if (
          tighter &&
          currentBudget + tighter.threatCost <= budget * 1.2 &&
          tighter.threatCost <= remaining
        ) {
          enemies.push(tighter)
          currentBudget += tighter.threatCost
          if (tighter.tier === 'boss') _hasBoss = true
          if (!speciesSet.includes(species)) speciesSet.push(species)
        }
        break
      }

      enemies.push(enemy)
      currentBudget += enemy.threatCost
      if (enemy.tier === 'boss') _hasBoss = true
      if (!speciesSet.includes(species)) speciesSet.push(species)

      if (currentBudget >= budget * 0.8 && currentBudget <= budget * 1.2) break
    }

    const ratio = currentBudget / budget
    if (ratio >= 0.8 && ratio <= 1.2) {
      return enemies
    }

    if (ratio > 1.2) {
      let adjusted = enemies
      for (let i = 0; i < enemies.length && adjusted.length > 0; i++) {
        const next = tryDowngradeLast(adjusted, budget, parsed.seed, rng)
        if (!next) break
        adjusted = next
        const newRatio =
          adjusted.reduce((sum, e) => sum + e.threatCost, 0) / budget
        if (newRatio <= 1.2) {
          if (newRatio >= 0.8) return adjusted
          break
        }
      }
      const finalRatio =
        adjusted.reduce((sum, e) => sum + e.threatCost, 0) / budget
      if (finalRatio >= 0.8 && finalRatio <= 1.2) return adjusted
    }

    if (ratio < 0.8) {
      let filled = enemies
      while (filled.length < maxCount) {
        const next = tryAddMinion(
          filled,
          budget,
          parsed.seed,
          speciesSet,
          parsed.allowedSpecies,
          rng,
        )
        if (!next) break
        filled = next
        const newRatio =
          filled.reduce((sum, e) => sum + e.threatCost, 0) / budget
        if (newRatio >= 0.8) {
          if (newRatio <= 1.2) return filled
          break
        }
      }
      const finalRatio =
        filled.reduce((sum, e) => sum + e.threatCost, 0) / budget
      if (finalRatio >= 0.8 && finalRatio <= 1.2) return filled
    }
  }

  // Fallback: single enemy tuned to the budget.
  for (let attempt = 0; attempt < 50; attempt++) {
    const species = rng.pick(
      parsed.allowedSpecies ?? (SPECIES.map((s) => s.id) as EnemySpecies[]),
    )
    const archetype = rng.pick(SPECIES_MAP[species].preferredArchetypes)
    const enemy = generateEnemyForTarget(
      `${parsed.seed}-fallback-${attempt}`,
      budget * 1.2,
      1,
      species,
      archetype,
      rng,
    )
    if (enemy) {
      const ratio = enemy.threatCost / budget
      if (ratio >= 0.8 && ratio <= 1.2) return [enemy]
    }
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
