import { SeededRng } from '../rng/seededRng.ts'
import {
  type Adventurer,
  type Difficulty,
  type Enemy,
  type EnemyArchetype,
  type EnemySpecies,
  type EnemyTier,
  type EncounterGenerationOptions,
  type EncounterShape,
} from '../models/types.ts'
import { zEncounterGenerationOptions } from '../models/types.ts'
import { SPECIES, SPECIES_MAP } from '../../data/enemyData.ts'
import {
  ADVENTURER_THREAT,
  DIFFICULTY_BUDGET_MULTIPLIER,
} from '../balance/constants.ts'
import { generateEnemy } from './enemyGenerator.ts'

export function actionEconomyMultiplier(
  enemyCount: number,
  partySize: number,
): number {
  const difference = enemyCount - partySize

  if (difference <= -2) return 0.8
  if (difference === -1) return 0.9
  if (difference <= 0) return 1.0
  if (difference === 1) return 1.15
  if (difference === 2) return 1.3
  if (difference <= 4) return 1.5
  return 1.75
}

export function effectiveEncounterThreat(
  rawThreat: number,
  enemyCount: number,
  partySize: number,
): number {
  return rawThreat * actionEconomyMultiplier(enemyCount, partySize)
}

export interface EncounterPlan {
  shape: EncounterShape
  count: number
  slots: EncounterSlot[]
}

interface EncounterSlot {
  tier: EnemyTier
  species?: EnemySpecies
  archetype?: EnemyArchetype
  targetThreat: number
}

function fixedCountForShape(shape: EncounterShape): number {
  switch (shape) {
    case 'standard':
      return 4
    case 'eliteGroup':
      return 4
    case 'swarm':
      return 7
    case 'boss':
      return 4
  }
}

function tierForSlot(shape: EncounterShape, slotIndex: number): EnemyTier {
  switch (shape) {
    case 'standard':
      return 'standard'
    case 'eliteGroup':
      return 'elite'
    case 'swarm':
      return 'minion'
    case 'boss':
      return slotIndex === 0 ? 'boss' : 'standard'
  }
}

function shapeWeightsForDifficulty(
  difficulty: Difficulty,
  bossAllowed: boolean,
): Record<EncounterShape, number> {
  const weights: Record<Difficulty, Record<EncounterShape, number>> = {
    easy: { standard: 0.5, eliteGroup: 0.25, swarm: 0.15, boss: 0.1 },
    normal: { standard: 0.5, eliteGroup: 0.25, swarm: 0.15, boss: 0.1 },
    hard: { standard: 0.35, eliteGroup: 0.3, swarm: 0.1, boss: 0.25 },
    deadly: { standard: 0.2, eliteGroup: 0.3, swarm: 0.05, boss: 0.45 },
  }
  const result = { ...weights[difficulty] }
  if (!bossAllowed) result.boss = 0
  return result
}

function weightedPick<T>(rng: SeededRng, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return items[0] as T
  let r = rng.next() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
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

function randomArchetypeForSpecies(
  rng: SeededRng,
  species: EnemySpecies,
): EnemyArchetype {
  return rng.pick(SPECIES_MAP[species].preferredArchetypes)
}

function chooseShape(
  rng: SeededRng,
  difficulty: Difficulty,
  requestedShape: EncounterShape | undefined,
  bossAllowed: boolean,
): EncounterShape {
  if (requestedShape) {
    if (requestedShape === 'boss' && !bossAllowed) return 'standard'
    return requestedShape
  }
  const weights = shapeWeightsForDifficulty(difficulty, bossAllowed)
  const shapes: EncounterShape[] = ['standard', 'eliteGroup', 'swarm', 'boss']
  return weightedPick(
    rng,
    shapes,
    shapes.map((s) => weights[s]),
  )
}

function buildPlan(
  planSeed: string,
  shape: EncounterShape,
  count: number,
  slotTarget: number,
  allowedSpecies?: EnemySpecies[],
): EncounterPlan {
  const slots: EncounterSlot[] = []
  let firstSpecies: EnemySpecies | undefined
  let firstArchetype: EnemyArchetype | undefined

  for (let i = 0; i < count; i++) {
    const slotRng = new SeededRng(`${planSeed}:slot:${i}`)
    const tier = tierForSlot(shape, i)
    const species =
      i === 0 || !firstSpecies
        ? pickSpecies(slotRng, [], allowedSpecies)
        : slotRng.chance(80) && firstSpecies
          ? firstSpecies
          : pickSpecies(slotRng, [firstSpecies], allowedSpecies)

    const archetype =
      i === 0 || !firstArchetype
        ? randomArchetypeForSpecies(slotRng, species)
        : slotRng.chance(80) && species === firstSpecies
          ? firstArchetype
          : randomArchetypeForSpecies(slotRng, species)

    if (i === 0) {
      firstSpecies = species
      firstArchetype = archetype
    }

    slots.push({
      tier,
      species,
      archetype,
      targetThreat: slotTarget,
    })
  }

  return { shape, count, slots }
}

export function generateEncounter(
  options: EncounterGenerationOptions,
): Enemy[] {
  const parsed = zEncounterGenerationOptions.parse(options)
  const partySize = parsed.partySize ?? 4
  const bossAllowed = parsed.bossAllowed ?? true
  const planSeed = parsed.planSeed ?? parsed.seed

  const shapeRng = new SeededRng(`${planSeed}:shape`)
  const shape = chooseShape(
    shapeRng,
    parsed.difficulty,
    parsed.shape,
    bossAllowed,
  )
  const count = fixedCountForShape(shape)

  const budget =
    parsed.partyThreat * DIFFICULTY_BUDGET_MULTIPLIER[parsed.difficulty]
  const mult = actionEconomyMultiplier(count, partySize)
  const slotTarget = budget / count / mult

  const plan = buildPlan(
    planSeed,
    shape,
    count,
    slotTarget,
    parsed.allowedSpecies,
  )

  const enemies: Enemy[] = []
  for (let i = 0; i < plan.slots.length; i++) {
    const slot = plan.slots[i]
    const enemy = generateEnemy(`${parsed.seed}:enemy:${i}`, {
      tier: slot.tier,
      species: slot.species,
      archetype: slot.archetype,
      targetThreat: slot.targetThreat,
    })
    enemies.push(enemy)
  }

  return enemies
}

export function calculatePartyThreat(
  adventurers: { rank: Adventurer['rank'] }[],
): number {
  return adventurers.reduce((sum, a) => sum + ADVENTURER_THREAT[a.rank], 0)
}
