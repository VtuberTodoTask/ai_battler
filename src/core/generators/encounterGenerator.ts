import { SeededRng } from '../rng/seededRng.ts'
import {
  type Adventurer,
  type Difficulty,
  type Enemy,
  type EnemyArchetype,
  type EnemyRank,
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
  ENEMY_BASE_THREAT,
  TIER_THREAT_MULTIPLIER,
} from '../balance/constants.ts'
import { clamp } from '../util.ts'
import { generateEnemy } from './enemyGenerator.ts'

const RANKS: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const ALL_TIERS: EnemyTier[] = ['minion', 'standard', 'elite', 'boss']
const RANK_DISTANCE_WEIGHT = 1.5

interface RankTierCombo {
  rank: EnemyRank
  tier: EnemyTier
  baseCost: number
}

function getRankTierCombos(): RankTierCombo[] {
  const combos: RankTierCombo[] = []
  for (const rank of RANKS) {
    for (const tier of ALL_TIERS) {
      combos.push({
        rank,
        tier,
        baseCost: ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier],
      })
    }
  }
  return combos
}

function expectedEnemyRankIndex(targetRaw: number): number {
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < RANKS.length; i++) {
    const distance = Math.abs(ENEMY_BASE_THREAT[RANKS[i]] - targetRaw)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

function candidateScore(
  baseCost: number,
  rank: EnemyRank,
  targetRaw: number,
): number {
  const rankIndex = RANKS.indexOf(rank)
  const expectedRank = expectedEnemyRankIndex(targetRaw)
  const rankDistance = Math.abs(rankIndex - expectedRank)
  const costDistance = Math.abs(baseCost - targetRaw)
  return rankDistance * RANK_DISTANCE_WEIGHT + costDistance
}

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

function weightedPick<T>(rng: SeededRng, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

interface ShapePlan {
  shape: EncounterShape
  count: number
}

function countRangeForShape(shape: EncounterShape): [number, number] {
  switch (shape) {
    case 'standard':
      return [3, 5]
    case 'eliteGroup':
      return [2, 4]
    case 'swarm':
      return [6, 8]
    case 'boss':
      return [2, 4]
  }
}

function adventurerRankIndex(averageThreat: number): number {
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < RANKS.length; i++) {
    const rank = RANKS[i] as 'E' | 'D' | 'C' | 'B' | 'A' | 'S'
    const distance = Math.abs(ADVENTURER_THREAT[rank] - averageThreat)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

function pickCountForBudget(
  shape: EncounterShape,
  budget: number,
  partySize: number,
  expectedCost: number,
  rng: SeededRng,
): number {
  const [min, max] = countRangeForShape(shape)
  let bestCount = min
  let bestDistance = Infinity
  for (let count = min; count <= max; count++) {
    const mult = actionEconomyMultiplier(count, partySize)
    const targetRaw = budget / mult / count
    const distance = Math.abs(targetRaw - expectedCost)
    if (distance < bestDistance) {
      bestDistance = distance
      bestCount = count
    }
  }
  return bestCount
}

function chooseShape(
  rng: SeededRng,
  budget: number,
  partySize: number,
  averageAdventurerThreat: number,
  difficulty: Difficulty,
  requestedShape?: EncounterShape,
): ShapePlan {
  const rankIndex = adventurerRankIndex(averageAdventurerThreat)
  const expectedCost = ENEMY_BASE_THREAT[RANKS[rankIndex]]
  if (requestedShape) {
    return {
      shape: requestedShape,
      count: pickCountForBudget(
        requestedShape,
        budget,
        partySize,
        expectedCost,
        rng,
      ),
    }
  }

  const shapeWeights: Record<Difficulty, Record<EncounterShape, number>> = {
    easy: { standard: 0.55, eliteGroup: 0.25, swarm: 0.15, boss: 0.05 },
    normal: { standard: 0.65, eliteGroup: 0.25, swarm: 0.07, boss: 0.03 },
    hard: { standard: 0.45, eliteGroup: 0.35, swarm: 0.05, boss: 0.15 },
    deadly: { standard: 0.25, eliteGroup: 0.35, swarm: 0.05, boss: 0.35 },
  }
  const shapes: EncounterShape[] = ['standard', 'eliteGroup', 'swarm', 'boss']
  const weights = shapes.map((s) => shapeWeights[difficulty][s])
  const shape = weightedPick(rng, shapes, weights)
  return {
    shape,
    count: pickCountForBudget(shape, budget, partySize, expectedCost, rng),
  }
}

interface SlotPlan {
  tier: EnemyTier
  species?: EnemySpecies
  archetype?: EnemyArchetype
}

function allowedTiersForSlot(
  shape: EncounterShape,
  primaryTier: EnemyTier,
  isFirst: boolean,
  bossAllowed: boolean,
): EnemyTier[] {
  if (shape === 'boss' && isFirst && bossAllowed) return ['boss']

  const map: Record<EncounterShape, EnemyTier[]> = {
    standard: ['standard', 'minion', 'elite'],
    eliteGroup: ['elite', 'standard', 'minion'],
    swarm: ['minion', 'standard'],
    boss: ['standard', 'elite'],
  }
  const base = map[shape]
  // Put the planned primary tier first, then the rest without duplicates.
  const ordered = [primaryTier, ...base.filter((t) => t !== primaryTier)]
  return bossAllowed ? ordered : ordered.filter((t) => t !== 'boss')
}

function buildSlots(
  shape: EncounterShape,
  count: number,
  species: EnemySpecies,
  archetype: EnemyArchetype,
  rng: SeededRng,
): SlotPlan[] {
  const slots: SlotPlan[] = []
  for (let i = 0; i < count; i++) {
    let tier: EnemyTier
    if (shape === 'boss') {
      tier = i === 0 ? 'boss' : (rng.next() < 0.6 ? 'standard' : 'elite')
    } else if (shape === 'swarm') {
      tier = rng.next() < 0.75 ? 'minion' : 'standard'
    } else if (shape === 'eliteGroup') {
      tier = rng.next() < 0.6 ? 'elite' : 'standard'
    } else {
      // standard
      tier = 'standard'
    }
    slots.push({ tier, species, archetype })
  }
  return slots
}

interface SlotGenerationOptions {
  partySize: number
  budget: number
  rawSoFar: number
  currentCount: number
  allowBoss: boolean
  maxEnemyCount: number
}

function generateEnemyForSlot(
  seed: string,
  targetRaw: number,
  slot: SlotPlan,
  options: SlotGenerationOptions,
  attempt: number,
): Enemy | undefined {
  const isFirst = options.currentCount === 0
  const tiers = allowedTiersForSlot(
    // shape is not stored on slot; infer from primary tier for boss first slot
    slot.tier === 'boss' ? 'boss' : 'standard',
    slot.tier,
    isFirst,
    options.allowBoss,
  )

  const maxCost = options.budget * 1.2 - options.rawSoFar
  if (maxCost <= 0) return undefined

  // Build a unified candidate list across all allowed tiers, sorted by a
  // score that prefers the expected rank and a cost close to the target.
  const candidates = getRankTierCombos()
    .filter(
      (c) =>
        tiers.includes(c.tier) &&
        c.baseCost <= maxCost * 1.5 &&
        (options.allowBoss || c.tier !== 'boss'),
    )
    .map((c) => ({
      ...c,
      score: candidateScore(c.baseCost, c.rank, targetRaw),
    }))
    .sort((a, b) => a.score - b.score || a.baseCost - b.baseCost)

  for (let i = 0; i < Math.min(candidates.length, 12); i++) {
    const c = candidates[i]
    const enemy = generateEnemy(`${seed}-try-${c.tier}-${c.rank}-${attempt}`, {
      rank: c.rank,
      species: slot.species ?? 'beast',
      archetype: slot.archetype ?? 'assault',
      tier: c.tier,
    })

    const newRaw = options.rawSoFar + enemy.threatCost
    const newCount = options.currentCount + 1
    const newEffective = effectiveEncounterThreat(
      newRaw,
      newCount,
      options.partySize,
    )
    if (
      newEffective <= options.budget * 1.2 &&
      enemy.threatCost <= maxCost * 1.05 &&
      newCount <= options.maxEnemyCount
    ) {
      return enemy
    }
  }

  return undefined
}

function generateEnemyForBudget(
  seed: string,
  targetRaw: number,
  species: EnemySpecies,
  archetype: EnemyArchetype,
  allowedTiers: EnemyTier[],
  bossAllowed: boolean,
): Enemy | undefined {
  const candidates = getRankTierCombos()
    .filter(
      (c) =>
        allowedTiers.includes(c.tier) &&
        (bossAllowed || c.tier !== 'boss'),
    )
    .map((c) => ({
      ...c,
      score: candidateScore(c.baseCost, c.rank, targetRaw),
    }))
    .sort((a, b) => a.score - b.score || a.baseCost - b.baseCost)

  for (let i = 0; i < Math.min(candidates.length, 8); i++) {
    const c = candidates[i]
    const enemy = generateEnemy(`${seed}-${c.rank}-${c.tier}`, {
      rank: c.rank,
      species,
      archetype,
      tier: c.tier,
    })
    return enemy
  }

  return undefined
}

function pickSpeciesForFill(
  seed: string,
  existing: Enemy[],
  allowedSpecies?: EnemySpecies[],
): EnemySpecies {
  const rng = new SeededRng(seed)
  return pickSpecies(
    rng,
    existing.map((e) => e.species),
    allowedSpecies,
  )
}

function fallbackEnemy(
  seed: string,
  budget: number,
  partySize: number,
  bossAllowed: boolean,
  allowedSpecies?: EnemySpecies[],
  maxEnemyCount = 12,
): Enemy[] {
  const rng = new SeededRng(seed)
  const species = pickSpecies(rng, [], allowedSpecies)
  const archetype = randomArchetypeForSpecies(rng, species)

  // Try one-enemy solutions first.
  const targetRaw = budget / actionEconomyMultiplier(1, partySize)
  for (let a = 0; a < 30; a++) {
    const enemy = generateEnemyForBudget(
      `${seed}-fallback-1-${a}`,
      targetRaw,
      species,
      archetype,
      bossAllowed ? ['standard', 'elite', 'boss'] : ['standard', 'elite'],
      bossAllowed,
    )
    if (!enemy) break
    const effective = effectiveEncounterThreat(
      enemy.threatCost,
      1,
      partySize,
    )
    if (effective >= budget * 0.8 && effective <= budget * 1.2) {
      return [enemy]
    }
  }

  // Build up from the cheapest single enemy.
  const enemy = generateEnemyForBudget(
    `${seed}-fallback`,
    targetRaw,
    species,
    archetype,
    ['standard'],
    bossAllowed,
  ) ?? generateEnemy(`${seed}-fallback-minion`, {
    rank: 'E',
    species,
    archetype,
    tier: 'minion',
  })

  const enemies: Enemy[] = [enemy]
  let rawSoFar = enemy.threatCost
  while (enemies.length < maxEnemyCount) {
    const currentCount = enemies.length
    const targetRawNext =
      budget / actionEconomyMultiplier(currentCount + 1, partySize) - rawSoFar
    if (targetRawNext <= 0) break
    const nextSpecies = pickSpeciesForFill(
      `${seed}-fill-${currentCount}`,
      enemies,
      allowedSpecies,
    )
    const nextArchetype = archetype
    const minion = generateEnemyForBudget(
      `${seed}-fill-${currentCount}`,
      targetRawNext,
      nextSpecies,
      nextArchetype,
      ['minion', 'standard'],
      false,
    )
    if (!minion) break
    const newRaw = rawSoFar + minion.threatCost
    const newEff = effectiveEncounterThreat(newRaw, currentCount + 1, partySize)
    if (newEff > budget * 1.2) break
    enemies.push(minion)
    rawSoFar = newRaw
    if (newEff >= budget * 0.8) break
  }

  return enemies
}

export function generateEncounter(
  options: EncounterGenerationOptions,
): Enemy[] {
  const parsed = zEncounterGenerationOptions.parse(options)
  const rng = new SeededRng(parsed.seed)
  const planRng = new SeededRng(parsed.planSeed ?? parsed.seed)
  const partySize = parsed.partySize ?? 4
  const budget =
    parsed.partyThreat * DIFFICULTY_BUDGET_MULTIPLIER[parsed.difficulty]
  const maxEnemyCount = parsed.maxEnemyCount ?? 12
  const bossAllowed = parsed.bossAllowed ?? true

  if (budget < 0.5) {
    return fallbackEnemy(
      parsed.seed,
      budget,
      partySize,
      bossAllowed,
      parsed.allowedSpecies,
      maxEnemyCount,
    )
  }

  const averageAdventurerThreat = partySize > 0 ? parsed.partyThreat / partySize : 1
  const { shape, count } = chooseShape(
    planRng,
    budget,
    partySize,
    averageAdventurerThreat,
    parsed.difficulty,
    parsed.shape,
  )
  const species = parsed.allowedSpecies
    ? planRng.pick(parsed.allowedSpecies)
    : pickSpecies(planRng, [], undefined)
  const archetype = randomArchetypeForSpecies(planRng, species)
  const slots = buildSlots(shape, count, species, archetype, planRng)

  for (let attempt = 0; attempt < 100; attempt++) {
    const slotRng = new SeededRng(`${parsed.seed}-enc-${attempt}`)
    const enemies: Enemy[] = []
    let rawSoFar = 0

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const remainingSlots = slots.length - i
      const targetTotalRaw =
        budget / actionEconomyMultiplier(slots.length, partySize)
      const targetRaw = (targetTotalRaw - rawSoFar) / remainingSlots
      if (targetRaw <= 0) break

      const existingSpecies = enemies.map((e) => e.species)
      const slotSpecies =
        slot.species ??
        (enemies.length > 0 && slotRng.chance(80)
          ? enemies[0].species
          : pickSpecies(slotRng, existingSpecies, parsed.allowedSpecies))
      const slotArchetype = slot.archetype ?? randomArchetypeForSpecies(slotRng, slotSpecies)

      const allowBoss =
        bossAllowed && (shape === 'boss' ? i === 0 : slot.tier === 'boss')

      const enemy = generateEnemyForSlot(
        `${parsed.seed}-slot-${attempt}-${i}`,
        targetRaw,
        { ...slot, species: slotSpecies, archetype: slotArchetype },
        {
          partySize,
          budget,
          rawSoFar,
          currentCount: enemies.length,
          allowBoss,
          maxEnemyCount,
        },
        attempt,
      )

      if (!enemy) break

      enemies.push(enemy)
      rawSoFar += enemy.threatCost

      const currentEffective = effectiveEncounterThreat(
        rawSoFar,
        enemies.length,
        partySize,
      )
      if (
        currentEffective >= budget * 0.8 &&
        currentEffective <= budget * 1.2
      ) {
        // Hitting the target range early avoids overshooting.
        break
      }
    }

    // If the planned shape is under-budget, pad with minions without
    // exceeding the safety cap.
    while (enemies.length < maxEnemyCount) {
      const currentEffective = effectiveEncounterThreat(
        rawSoFar,
        enemies.length,
        partySize,
      )
      if (
        currentEffective >= budget * 0.8 &&
        currentEffective <= budget * 1.2
      ) {
        break
      }
      if (currentEffective > budget * 1.2) break

      const targetRaw =
        budget / actionEconomyMultiplier(enemies.length + 1, partySize) -
        rawSoFar
      if (targetRaw <= 0) break

      const fillSpecies = pickSpeciesForFill(
        `${parsed.seed}-fill-${attempt}-${enemies.length}`,
        enemies,
        parsed.allowedSpecies,
      )
      const fillArchetype =
        enemies[0]?.archetype ?? randomArchetypeForSpecies(
          new SeededRng(`${parsed.seed}-fill`),
          fillSpecies,
        )
      const minion = generateEnemyForBudget(
        `${parsed.seed}-fill-${attempt}-${enemies.length}`,
        targetRaw,
        fillSpecies,
        fillArchetype,
        ['minion', 'standard'],
        false,
      )
      if (!minion) break
      const newRaw = rawSoFar + minion.threatCost
      const newEffective = effectiveEncounterThreat(
        newRaw,
        enemies.length + 1,
        partySize,
      )
      if (newEffective > budget * 1.2) break
      enemies.push(minion)
      rawSoFar = newRaw
      if (newEffective >= budget * 0.8) break
    }

    const finalEffective = effectiveEncounterThreat(
      rawSoFar,
      enemies.length,
      partySize,
    )
    if (finalEffective >= budget * 0.8 && finalEffective <= budget * 1.2) {
      return enemies
    }
  }

  return fallbackEnemy(
    parsed.seed,
    budget,
    partySize,
    bossAllowed,
    parsed.allowedSpecies,
    maxEnemyCount,
  )
}

export function calculatePartyThreat(
  adventurers: { rank: Adventurer['rank'] }[],
): number {
  return adventurers.reduce((sum, a) => sum + ADVENTURER_THREAT[a.rank], 0)
}
