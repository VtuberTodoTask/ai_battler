import { generateAdventurer } from '../../core/generators/adventurerGenerator.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  EncounterShape,
} from '../../core/models/types.ts'
import type {
  EnvironmentType,
  ExpeditionBattleConfig,
  ExpeditionFeature,
  ExpeditionRequest,
  HiddenInformation,
  ObjectiveType,
} from '../../core/expedition/types.ts'

export interface ExpeditionPreset {
  id: string
  objectiveType: ObjectiveType
  name: string
  description: string
  environment: EnvironmentType
  defaultRank: AdventurerRank
  defaultPartyRoles: AdventurerRole[]
  defaultBattleEnabled: boolean
  features: ExpeditionFeature[]
  hiddenInformation: HiddenInformation[]
  buildRequest(
    seed: string,
    rank: AdventurerRank,
    battleEnabled: boolean,
  ): ExpeditionRequest
}

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

export function makeRandomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const ALL_ROLES: AdventurerRole[] = [
  'vanguard',
  'guardian',
  'scout',
  'ranger',
  'mage',
  'healer',
  'support',
]

export function isValidRank(rank: string): rank is AdventurerRank {
  return RANKS.includes(rank as AdventurerRank)
}

export function isValidRole(role: string): role is AdventurerRole {
  return ALL_ROLES.includes(role as AdventurerRole)
}

export function buildParty(
  roles: AdventurerRole[],
  partySeed: string,
  rank: AdventurerRank,
): Adventurer[] {
  return roles.map((role, slotIndex) =>
    generateAdventurer({
      seed: `${partySeed}:slot:${slotIndex}`,
      rank,
      role,
    }),
  )
}

function baseRequest(
  seed: string,
  rank: AdventurerRank,
  objectiveType: ObjectiveType,
  environment: EnvironmentType,
  features: ExpeditionFeature[],
  hiddenInformation: HiddenInformation[],
): Omit<
  ExpeditionRequest,
  'battle' | 'elimination' | 'rescue' | 'escort' | 'retrieval' | 'survey'
> {
  return {
    id: `expedition-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType,
    environment,
    distance: 3,
    features,
    knownInformation: [],
    hiddenInformation,
  }
}

function battleConfig(
  seed: string,
  shape?: EncounterShape,
  enabled = true,
): ExpeditionBattleConfig | undefined {
  if (!enabled) return undefined
  return {
    enabled: true,
    seed: `${seed}:battle:0`,
    triggerPhase: 'afterExploration',
    shape,
  }
}

export const EXPEDITION_PRESETS: ExpeditionPreset[] = [
  {
    id: 'investigation-ruins',
    objectiveType: 'investigation',
    name: '遺跡の異変調査',
    description: '複数の隠された情報を調べる調査依頼',
    environment: 'ruins',
    defaultRank: 'C',
    defaultPartyRoles: ['scout', 'ranger', 'mage', 'healer'],
    defaultBattleEnabled: false,
    features: ['traps', 'poorVisibility'],
    hiddenInformation: [
      {
        id: 'info-1',
        name: '敵の痕跡',
        description: '敵が近くにいる証拠',
        difficulty: 5,
      },
      {
        id: 'info-2',
        name: '古い地図',
        description: '遺跡の配置がわかる',
        difficulty: 15,
        requiredSkill: 'scouting',
      },
      {
        id: 'info-3',
        name: '魔力の残滓',
        description: '魔法の気配',
        difficulty: 20,
        requiredSkill: 'monsterKnowledge',
      },
    ],
    buildRequest(seed, rank, battleEnabled) {
      return {
        ...baseRequest(
          seed,
          rank,
          'investigation',
          this.environment,
          this.features,
          this.hiddenInformation,
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
      }
    },
  },
  {
    id: 'elimination-cave',
    objectiveType: 'elimination',
    name: '魔物の巣の討伐',
    description: '洞窟に潜む魔物を討伐する',
    environment: 'cave',
    defaultRank: 'C',
    defaultPartyRoles: ['vanguard', 'guardian', 'mage', 'healer'],
    defaultBattleEnabled: true,
    features: ['ambushRisk', 'unstableTerrain'],
    hiddenInformation: [],
    buildRequest(seed, rank) {
      return {
        ...baseRequest(
          seed,
          rank,
          'elimination',
          this.environment,
          this.features,
          this.hiddenInformation,
        ),
        battle: battleConfig(seed, 'standard', true),
        elimination: { mode: 'allEnemies', confirmationRequired: false },
      }
    },
  },
  {
    id: 'rescue-injured',
    objectiveType: 'rescue',
    name: '負傷した冒険者の救出',
    description: '負傷し行方不明になった冒険者を救出する',
    environment: 'forest',
    defaultRank: 'C',
    defaultPartyRoles: ['scout', 'guardian', 'healer', 'vanguard'],
    defaultBattleEnabled: true,
    features: ['poorVisibility', 'limitedSupplies'],
    hiddenInformation: [],
    buildRequest(seed, rank, battleEnabled) {
      return {
        ...baseRequest(
          seed,
          rank,
          'rescue',
          this.environment,
          this.features,
          this.hiddenInformation,
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        rescue: {
          target: {
            id: 'target-1',
            name: '救出対象',
            maxHp: 40,
            initialHp: 24,
            mobility: 'assisted',
            initialStatusEffects: [],
            locationKnown: false,
            discoveryDifficulty: 15,
            accessDifficulty: 15,
            stabilizationDifficulty: 15,
            evacuationDifficulty: 15,
          },
        },
      }
    },
  },
  {
    id: 'escort-scholar',
    objectiveType: 'escort',
    name: '学者の護衛',
    description: '学者を目的地まで護衛する',
    environment: 'plains',
    defaultRank: 'C',
    defaultPartyRoles: ['support', 'ranger', 'guardian', 'healer'],
    defaultBattleEnabled: true,
    features: ['longDuration', 'retreatDifficulty'],
    hiddenInformation: [],
    buildRequest(seed, rank, battleEnabled) {
      return {
        ...baseRequest(
          seed,
          rank,
          'escort',
          this.environment,
          this.features,
          this.hiddenInformation,
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        escort: {
          target: {
            id: 'target-1',
            name: '護衛対象',
            maxHp: 40,
            initialHp: 40,
            mobility: 'mobile',
            initialStatusEffects: [],
            initialStress: 0,
            coordinationDifficulty: 15,
            routeDifficulty: 15,
            protectionDifficulty: 15,
            careDifficulty: 15,
          },
          destination: {
            id: 'destination-1',
            name: '目的地',
            handoffRequirement: 'standard',
            handoffDifficulty: 15,
          },
        },
      }
    },
  },
  {
    id: 'retrieval-ancient-core',
    objectiveType: 'retrieval',
    name: '古代魔導核の回収',
    description: '古代の魔導核を回収する',
    environment: 'ruins',
    defaultRank: 'C',
    defaultPartyRoles: ['scout', 'vanguard', 'support', 'guardian'],
    defaultBattleEnabled: true,
    features: ['traps', 'unstableTerrain'],
    hiddenInformation: [],
    buildRequest(seed, rank, battleEnabled) {
      return {
        ...baseRequest(
          seed,
          rank,
          'retrieval',
          this.environment,
          this.features,
          this.hiddenInformation,
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        retrieval: {
          target: {
            id: 'target-1',
            name: '回収対象',
            initialIntegrity: 80,
            minimumAcceptableIntegrity: 60,
            bulk: 'bulky',
            handling: 'delicate',
            fragility: 'standard',
            locationKnown: false,
            discoveryDifficulty: 15,
            accessDifficulty: 15,
            securingDifficulty: 15,
            protectionDifficulty: 15,
            extractionDifficulty: 15,
          },
        },
      }
    },
  },
  {
    id: 'survey-old-mine-east',
    objectiveType: 'survey',
    name: '旧坑道東部の測量',
    description: '旧坑道東部の3区画を測量する',
    environment: 'cave',
    defaultRank: 'C',
    defaultPartyRoles: ['scout', 'ranger', 'mage', 'support'],
    defaultBattleEnabled: true,
    features: ['poorVisibility', 'unstableTerrain'],
    hiddenInformation: [],
    buildRequest(seed, rank, battleEnabled) {
      return {
        ...baseRequest(
          seed,
          rank,
          'survey',
          this.environment,
          this.features,
          this.hiddenInformation,
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        survey: {
          area: {
            id: 'area-1',
            name: '旧坑道東部',
            minimumAcceptableQuality: 70,
            sectors: [
              {
                id: 'sector-1',
                name: '東一区画',
                focus: 'route',
                difficulty: 15,
              },
              {
                id: 'sector-2',
                name: '東二区画',
                focus: 'terrain',
                difficulty: 15,
              },
              {
                id: 'sector-3',
                name: '東三区画',
                focus: 'arcane',
                difficulty: 15,
              },
            ],
          },
        },
      }
    },
  },
]

export const PRESET_BY_ID: Readonly<Record<string, ExpeditionPreset>> =
  Object.fromEntries(EXPEDITION_PRESETS.map((p) => [p.id, p]))
