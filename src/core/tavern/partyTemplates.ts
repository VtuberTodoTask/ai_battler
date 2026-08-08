import type { PartyTemplate } from './types.ts'

export const PARTY_TEMPLATES: PartyTemplate[] = [
  {
    id: 'balanced',
    roles: ['vanguard', 'guardian', 'scout', 'healer'],
    leaderSlot: 0,
  },
  {
    id: 'exploration',
    roles: ['scout', 'ranger', 'support', 'healer'],
    leaderSlot: 0,
  },
  {
    id: 'arcane',
    roles: ['vanguard', 'mage', 'mage', 'support'],
    leaderSlot: 1,
  },
  {
    id: 'assault',
    roles: ['vanguard', 'vanguard', 'guardian', 'healer'],
    leaderSlot: 0,
  },
  {
    id: 'versatile',
    roles: ['guardian', 'ranger', 'mage', 'support'],
    leaderSlot: 2,
  },
  {
    id: 'support-heavy',
    roles: ['vanguard', 'scout', 'healer', 'support'],
    leaderSlot: 0,
  },
  {
    id: 'ranged',
    roles: ['guardian', 'ranger', 'ranger', 'healer'],
    leaderSlot: 1,
  },
  {
    id: 'arcane-exploration',
    roles: ['scout', 'ranger', 'mage', 'support'],
    leaderSlot: 0,
  },
]
