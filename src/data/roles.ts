import { AdventurerRole, SkillName, StatName } from '../core/models/types.ts'

export interface RoleDefinition {
  id: AdventurerRole
  name: string
  stats: {
    mostImportant: StatName
    good: StatName[]
    standard: StatName[]
    weak: StatName
    fatal: StatName
  }
  expertSkills: SkillName[]
  trainedSkills: SkillName[]
  weaponId: string
  armorId: string
  position: 'front' | 'back'
}

export const ROLES: RoleDefinition[] = [
  {
    id: 'vanguard',
    name: '前衛戦士',
    stats: {
      mostImportant: 'str',
      good: ['con', 'dex'],
      standard: ['per', 'wil'],
      weak: 'soc',
      fatal: 'int',
    },
    expertSkills: ['melee', 'defense'],
    trainedSkills: ['tactics', 'survival', 'leadership'],
    weaponId: 'longsword',
    armorId: 'leather',
    position: 'front',
  },
  {
    id: 'guardian',
    name: '守護役',
    stats: {
      mostImportant: 'con',
      good: ['str', 'wil'],
      standard: ['dex', 'per'],
      weak: 'int',
      fatal: 'soc',
    },
    expertSkills: ['defense', 'melee'],
    trainedSkills: ['tactics', 'survival', 'firstAid'],
    weaponId: 'spear',
    armorId: 'heavy',
    position: 'front',
  },
  {
    id: 'scout',
    name: '斥候',
    stats: {
      mostImportant: 'dex',
      good: ['per', 'int'],
      standard: ['str', 'wil'],
      weak: 'con',
      fatal: 'soc',
    },
    expertSkills: ['stealth', 'scouting'],
    trainedSkills: ['trapDetection', 'trapDisarm', 'survival'],
    weaponId: 'dagger',
    armorId: 'light',
    position: 'front',
  },
  {
    id: 'ranger',
    name: '射手',
    stats: {
      mostImportant: 'dex',
      good: ['per', 'wil'],
      standard: ['int', 'soc'],
      weak: 'str',
      fatal: 'con',
    },
    expertSkills: ['ranged', 'scouting'],
    trainedSkills: ['stealth', 'survival', 'firstAid'],
    weaponId: 'shortbow',
    armorId: 'light',
    position: 'back',
  },
  {
    id: 'mage',
    name: '魔術師',
    stats: {
      mostImportant: 'int',
      good: ['wil', 'per'],
      standard: ['dex', 'soc'],
      weak: 'str',
      fatal: 'con',
    },
    expertSkills: ['attackMagic', 'defenseMagic'],
    trainedSkills: ['monsterKnowledge', 'tactics', 'scouting'],
    weaponId: 'staff',
    armorId: 'robe',
    position: 'back',
  },
  {
    id: 'healer',
    name: '治療役',
    stats: {
      mostImportant: 'wil',
      good: ['int', 'soc'],
      standard: ['per', 'dex'],
      weak: 'str',
      fatal: 'con',
    },
    expertSkills: ['healing', 'firstAid'],
    trainedSkills: ['defenseMagic', 'leadership', 'monsterKnowledge'],
    weaponId: 'mace',
    armorId: 'cloth',
    position: 'back',
  },
  {
    id: 'support',
    name: '支援役',
    stats: {
      mostImportant: 'soc',
      good: ['int', 'wil'],
      standard: ['per', 'dex'],
      weak: 'str',
      fatal: 'con',
    },
    expertSkills: ['leadership', 'tactics'],
    trainedSkills: ['firstAid', 'defenseMagic', 'scouting'],
    weaponId: 'wand',
    armorId: 'cloth',
    position: 'back',
  },
]

export const ROLE_MAP: Record<AdventurerRole, RoleDefinition> = ROLES.reduce(
  (acc, role) => {
    acc[role.id] = role
    return acc
  },
  {} as Record<AdventurerRole, RoleDefinition>,
)
