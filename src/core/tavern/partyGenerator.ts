import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type { AdventurerRank } from '../models/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { PARTY_TEMPLATES } from './partyTemplates.ts'
import type { AdventurerParty, TavernParty } from './types.ts'

const PARTY_NAMES = [
  '灰狼の牙',
  '銀灯',
  '赤鴉団',
  '星読み',
  '鉄靴団',
  '蒼穹の槍',
  '白銀の盾',
  '翠葉の風',
  '黒曜の斧',
  '静寂の矢',
  '鋼の絆',
  '夜明の鈴',
  '炎獅子団',
  '流水の滴',
  '風鳴り',
  '雷鳴の足跡',
  '森影',
  '砂塵の露',
  '月灯',
  '石楠の棘',
  '虹橋',
  '鉄梟',
  '玻璃の鏡',
  '山猫の爪',
]

const PARTY_RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B']
const PARTY_RANK_WEIGHTS = [15, 35, 35, 15]

export function generateAdventurerParty(
  seed: string,
  index: number,
  name: string,
  rank: AdventurerRank,
  templateId: string,
): AdventurerParty {
  const template = PARTY_TEMPLATES.find((t) => t.id === templateId)!
  const members = template.roles.map((role, slot) =>
    generateAdventurer({
      seed: `${seed}:party:${index}:member:${slot}`,
      rank,
      role,
    }),
  )
  const leader = members[template.leaderSlot]
  return {
    id: `tavern-party-${index}-${seed}`,
    name,
    rank,
    leaderId: leader.id,
    members,
    archetypeId: templateId,
  }
}

export function generatePartyPool(seed: string): TavernParty[] {
  const templateRng = new SeededRng(`${seed}:party-template-shuffle`)
  const nameRng = new SeededRng(`${seed}:party-name`)
  const rankRng = new SeededRng(`${seed}:party-ranks`)

  const templates = templateRng.shuffle([...PARTY_TEMPLATES]).slice(0, 4)
  const names = nameRng.shuffle([...PARTY_NAMES]).slice(0, 4)

  return Array.from({ length: 4 }, (_, index) => {
    const rank = rankRng.weightedPick(PARTY_RANKS, PARTY_RANK_WEIGHTS)
    const party = generateAdventurerParty(
      seed,
      index,
      names[index],
      rank,
      templates[index].id,
    )
    return {
      id: party.id,
      party,
    }
  })
}
