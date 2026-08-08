import type { AdventurerRank, EncounterShape } from '../models/types.ts'
import type {
  EnvironmentType,
  ExpeditionBattleConfig,
  ExpeditionFeature,
  ExpeditionRequest,
  HiddenInformation,
  ObjectiveType,
} from '../expedition/types.ts'
import type { TavernRequestOffer, TavernRequestTemplate } from './types.ts'

function baseRequest(
  seed: string,
  requestId: string,
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
    id: requestId,
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

function buildOffer(
  requestId: string,
  seed: string,
  rank: AdventurerRank,
  objectiveType: ObjectiveType,
  title: string,
  environment: EnvironmentType,
  briefing: string,
  features: ExpeditionFeature[],
  publicTags: string[],
  request: ExpeditionRequest,
): TavernRequestOffer {
  return {
    id: requestId,
    title,
    briefing,
    objectiveType,
    rank,
    environment,
    publicTags,
    recommendedPartySize: 4,
    expeditionRequest: request,
  }
}

export const TAVERN_REQUEST_TEMPLATES: TavernRequestTemplate[] = [
  {
    id: 'investigation-ruins',
    objectiveType: 'investigation',
    title: '遺跡の異変調査',
    environment: 'ruins',
    briefing: '古い遺跡で確認された異変の原因を調査する。',
    features: ['traps', 'poorVisibility'],
    publicTags: ['調査', '遺跡', '罠の可能性'],
    battleChance: 30,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'investigation',
          this.environment,
          this.features,
          [
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
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'investigation',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'investigation-monster-signs',
    objectiveType: 'investigation',
    title: '魔物出没原因の調査',
    environment: 'forest',
    briefing: '街道沿いで増えている魔物の出没理由を探る。',
    features: ['ambushRisk', 'poorVisibility'],
    publicTags: ['調査', '森林', '待ち伏せの可能性'],
    battleChance: 40,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'investigation',
          this.environment,
          this.features,
          [
            {
              id: 'info-1',
              name: '魔物の足跡',
              description: '複数の足跡が確認された',
              difficulty: 10,
              requiredSkill: 'scouting',
            },
            {
              id: 'info-2',
              name: '荷車の残骸',
              description: '襲われた行商人の荷車',
              difficulty: 15,
            },
            {
              id: 'info-3',
              name: '異常な魔素',
              description: '魔物を引き寄せている痕跡',
              difficulty: 20,
              requiredSkill: 'monsterKnowledge',
            },
          ],
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'investigation',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'elimination-cave',
    objectiveType: 'elimination',
    title: '洞窟の魔物討伐',
    environment: 'cave',
    briefing: '洞窟に潜む魔物を掃討する。',
    features: ['ambushRisk', 'unstableTerrain'],
    publicTags: ['討伐', '洞窟', '戦闘あり'],
    battleChance: 100,
    build({ requestId, seed, rank }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'elimination',
          this.environment,
          this.features,
          [],
        ),
        battle: battleConfig(seed, 'standard', true),
        elimination: { mode: 'allEnemies', confirmationRequired: false },
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'elimination',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'elimination-road-bandits',
    objectiveType: 'elimination',
    title: '街道周辺の魔物排除',
    environment: 'plains',
    briefing: '街道周辺に出現する魔物を排除し、安全を確保する。',
    features: ['ambushRisk', 'limitedSupplies'],
    publicTags: ['討伐', '平原', '戦闘あり'],
    battleChance: 100,
    build({ requestId, seed, rank }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'elimination',
          this.environment,
          this.features,
          [],
        ),
        battle: battleConfig(seed, 'standard', true),
        elimination: { mode: 'allEnemies', confirmationRequired: false },
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'elimination',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'rescue-injured',
    objectiveType: 'rescue',
    title: '負傷した冒険者の救出',
    environment: 'forest',
    briefing: '負傷し行方不明になった冒険者を救出する。',
    features: ['poorVisibility', 'limitedSupplies'],
    publicTags: ['救出', '森林', '負傷者1名'],
    battleChance: 60,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'rescue',
          this.environment,
          this.features,
          [],
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
      return buildOffer(
        requestId,
        seed,
        rank,
        'rescue',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'rescue-missing-researcher',
    objectiveType: 'rescue',
    title: '行方不明調査員の救出',
    environment: 'swamp',
    briefing: '沼地で行方不明になった調査員を救出する。',
    features: ['poisonRisk', 'poorVisibility'],
    publicTags: ['救出', '沼地', '行方不明者1名'],
    battleChance: 55,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'rescue',
          this.environment,
          this.features,
          [],
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        rescue: {
          target: {
            id: 'target-1',
            name: '調査員',
            maxHp: 35,
            initialHp: 20,
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
      return buildOffer(
        requestId,
        seed,
        rank,
        'rescue',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'escort-scholar',
    objectiveType: 'escort',
    title: '学者の護衛',
    environment: 'plains',
    briefing: '学者を目的地まで護衛する。',
    features: ['longDuration', 'retreatDifficulty'],
    publicTags: ['護衛', '平原', '移動困難'],
    battleChance: 70,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'escort',
          this.environment,
          this.features,
          [],
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
      return buildOffer(
        requestId,
        seed,
        rank,
        'escort',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'escort-merchant',
    objectiveType: 'escort',
    title: '商人の護衛',
    environment: 'mountain',
    briefing: '山道を通る商人の馬車を護衛する。',
    features: ['unstableTerrain', 'longDuration'],
    publicTags: ['護衛', '山岳', '移動困難'],
    battleChance: 65,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'escort',
          this.environment,
          this.features,
          [],
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        escort: {
          target: {
            id: 'target-1',
            name: '商人',
            maxHp: 35,
            initialHp: 35,
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
            name: '宿場町',
            handoffRequirement: 'standard',
            handoffDifficulty: 15,
          },
        },
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'escort',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'retrieval-ancient-core',
    objectiveType: 'retrieval',
    title: '古代魔導核の回収',
    environment: 'ruins',
    briefing: '古代遺跡で眠る魔導核を回収する。',
    features: ['traps', 'unstableTerrain'],
    publicTags: ['回収', '遺跡', '壊れやすい'],
    battleChance: 60,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'retrieval',
          this.environment,
          this.features,
          [],
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
      return buildOffer(
        requestId,
        seed,
        rank,
        'retrieval',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'retrieval-lost-equipment',
    objectiveType: 'retrieval',
    title: '冒険者装備の回収',
    environment: 'cave',
    briefing: '以前の遠征隊が置いていった装備を回収する。',
    features: ['poorVisibility', 'traps'],
    publicTags: ['回収', '洞窟', '重量物'],
    battleChance: 55,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'retrieval',
          this.environment,
          this.features,
          [],
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        retrieval: {
          target: {
            id: 'target-1',
            name: '遺失装備',
            initialIntegrity: 70,
            minimumAcceptableIntegrity: 50,
            bulk: 'heavy',
            handling: 'standard',
            fragility: 'rugged',
            locationKnown: false,
            discoveryDifficulty: 15,
            accessDifficulty: 15,
            securingDifficulty: 15,
            protectionDifficulty: 15,
            extractionDifficulty: 15,
          },
        },
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'retrieval',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'survey-old-mine-east',
    objectiveType: 'survey',
    title: '旧坑道東部の測量',
    environment: 'cave',
    briefing: '旧坑道東部の3区画を測量する。',
    features: ['poorVisibility', 'unstableTerrain'],
    publicTags: ['測量', '洞窟', '3区画'],
    battleChance: 50,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'survey',
          this.environment,
          this.features,
          [],
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
      return buildOffer(
        requestId,
        seed,
        rank,
        'survey',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
  {
    id: 'survey-unexplored-cave',
    objectiveType: 'survey',
    title: '未踏洞窟の経路測量',
    environment: 'mountain',
    briefing: '未踏洞窟の内部経路と危険険箇所を測量する。',
    features: ['unstableTerrain', 'poorVisibility'],
    publicTags: ['測量', '山岳', '3区画'],
    battleChance: 45,
    build({ requestId, seed, rank, battleEnabled }) {
      const request: ExpeditionRequest = {
        ...baseRequest(
          seed,
          requestId,
          rank,
          'survey',
          this.environment,
          this.features,
          [],
        ),
        battle: battleConfig(seed, undefined, battleEnabled),
        survey: {
          area: {
            id: 'area-1',
            name: '未踏洞窟',
            minimumAcceptableQuality: 70,
            sectors: [
              {
                id: 'sector-1',
                name: '入口通路',
                focus: 'route',
                difficulty: 15,
              },
              {
                id: 'sector-2',
                name: '中腹大広間',
                focus: 'hazard',
                difficulty: 15,
              },
              {
                id: 'sector-3',
                name: '奥部結晶窟',
                focus: 'arcane',
                difficulty: 15,
              },
            ],
          },
        },
      }
      return buildOffer(
        requestId,
        seed,
        rank,
        'survey',
        this.title,
        this.environment,
        this.briefing,
        this.features,
        this.publicTags,
        request,
      )
    },
  },
]

export const TEMPLATES_BY_OBJECTIVE_TYPE: Readonly<
  Record<ObjectiveType, TavernRequestTemplate[]>
> = {
  investigation: TAVERN_REQUEST_TEMPLATES.filter(
    (t) => t.objectiveType === 'investigation',
  ),
  elimination: TAVERN_REQUEST_TEMPLATES.filter(
    (t) => t.objectiveType === 'elimination',
  ),
  rescue: TAVERN_REQUEST_TEMPLATES.filter((t) => t.objectiveType === 'rescue'),
  escort: TAVERN_REQUEST_TEMPLATES.filter((t) => t.objectiveType === 'escort'),
  retrieval: TAVERN_REQUEST_TEMPLATES.filter(
    (t) => t.objectiveType === 'retrieval',
  ),
  survey: TAVERN_REQUEST_TEMPLATES.filter((t) => t.objectiveType === 'survey'),
}
