import { Armor, Weapon } from '../core/models/types.ts'

export const WEAPONS: Record<string, Weapon> = {
  longsword: {
    id: 'longsword',
    name: 'ロングソード',
    kind: 'melee',
    damage: 6,
    element: 'physical',
  },
  spear: {
    id: 'spear',
    name: 'スピア',
    kind: 'melee',
    damage: 5,
    element: 'physical',
  },
  dagger: {
    id: 'dagger',
    name: 'ダガー',
    kind: 'melee',
    damage: 4,
    element: 'physical',
  },
  shortbow: {
    id: 'shortbow',
    name: 'ショートボウ',
    kind: 'ranged',
    damage: 5,
    element: 'physical',
  },
  staff: {
    id: 'staff',
    name: '魔術師の杖',
    kind: 'magic',
    damage: 7,
    element: 'dark',
  },
  mace: {
    id: 'mace',
    name: 'メイス',
    kind: 'melee',
    damage: 5,
    element: 'physical',
  },
  wand: {
    id: 'wand',
    name: 'ワンド',
    kind: 'magic',
    damage: 4,
    element: 'holy',
  },
}

export const ARMORS: Record<string, Armor> = {
  heavy: {
    id: 'heavy',
    name: '重装鎧',
    reduction: 4,
  },
  leather: {
    id: 'leather',
    name: '革鎧',
    reduction: 2,
  },
  light: {
    id: 'light',
    name: '軽装鎧',
    reduction: 1,
  },
  robe: {
    id: 'robe',
    name: '魔術師のローブ',
    reduction: 1,
  },
  cloth: {
    id: 'cloth',
    name: '布の衣',
    reduction: 0,
  },
}
