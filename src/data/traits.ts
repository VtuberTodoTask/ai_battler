import { TraitDefinition } from '../core/models/types.ts'

export const POSITIVE_TRAITS: TraitDefinition[] = [
  {
    id: 'firstStrike',
    name: '先制攻撃',
    positive: true,
    effects: { initiativeBonus: 5, firstThreeRoundsAttackBonus: 10 },
  },
  {
    id: 'robust',
    name: '頑健',
    positive: true,
    effects: { conBonus: 5, poisonResist: 10, maxHpBonus: 10 },
  },
  {
    id: 'calm',
    name: '冷静',
    positive: true,
    effects: { moraleBonus: 10, fearResist: 10, retreatThresholdModifier: 10 },
    excludes: ['reckless', 'cowardly'],
  },
  {
    id: 'caring',
    name: '仲間思い',
    positive: true,
    effects: { healingBonus: 10, aidPriority: 1 },
  },
  {
    id: 'magicAptitude',
    name: '魔術適性',
    positive: true,
    effects: { attackMagicBonus: 15, maxMpBonus: 10 },
  },
  {
    id: 'trapper',
    name: '罠師',
    positive: true,
    effects: { trapDetectionBonus: 10, trapDisarmBonus: 10, stealthBonus: 10 },
  },
  {
    id: 'commander',
    name: '指揮官',
    positive: true,
    effects: { leadershipBonus: 15, moraleBonus: 5 },
  },
  {
    id: 'monsterScholar',
    name: '怪物研究家',
    positive: true,
    effects: { monsterKnowledgeBonus: 15, weaknessRevealChance: 0.2 },
  },
  {
    id: 'firstAidMaster',
    name: '応急処置の達人',
    positive: true,
    effects: { firstAidBonus: 15, bleedingCureChance: 0.5 },
  },
  {
    id: 'retreatMaster',
    name: '撤退の達人',
    positive: true,
    effects: { retreatThresholdModifier: 15, retreatBonus: 15 },
  },
]

export const NEGATIVE_TRAITS: TraitDefinition[] = [
  {
    id: 'reckless',
    name: '無謀',
    positive: false,
    effects: {
      firstThreeRoundsAttackBonus: 10,
      defensePenalty: 10,
      retreatThresholdModifier: -15,
    },
    excludes: ['calm'],
  },
  {
    id: 'cowardly',
    name: '臆病',
    positive: false,
    effects: { moralePenalty: 15, retreatThresholdModifier: -20 },
    excludes: ['calm', 'firstStrike'],
  },
  {
    id: 'lootObsessed',
    name: '戦利品への執着',
    positive: false,
    effects: { retreatThresholdModifier: -10, lootDelay: 1 },
  },
  {
    id: 'headstrong',
    name: '独断的',
    positive: false,
    effects: { tacticsPenalty: 10, cooperationPenalty: 1 },
  },
  {
    id: 'frail',
    name: '虚弱',
    positive: false,
    effects: { conPenalty: 5, maxHpPenalty: 10, poisonResist: -10 },
    excludes: ['robust'],
  },
  {
    id: 'magicFear',
    name: '魔術恐怖',
    positive: false,
    effects: { defenseMagicPenalty: 15, magicFear: 1 },
  },
  {
    id: 'claustrophobia',
    name: '閉所恐怖',
    positive: false,
    effects: { moralePenalty: 10 },
  },
  {
    id: 'loyal',
    name: '仲間を見捨てられない',
    positive: false,
    effects: { retreatThresholdModifier: -10 },
  },
  {
    id: 'healerHunter',
    name: '治療役を優先して狙う',
    positive: false,
    effects: { targetHealerBonus: 1 },
  },
  {
    id: 'lateRetreat',
    name: '撤退判断が遅い',
    positive: false,
    effects: { retreatThresholdModifier: -15 },
  },
]

export const TRAITS = [...POSITIVE_TRAITS, ...NEGATIVE_TRAITS]

export const TRAIT_MAP: Record<string, TraitDefinition> = TRAITS.reduce(
  (acc, t) => {
    acc[t.id] = t
    return acc
  },
  {} as Record<string, TraitDefinition>,
)
