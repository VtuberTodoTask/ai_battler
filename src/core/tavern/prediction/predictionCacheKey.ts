import type { TavernParty, TavernRequestOffer } from '../types.ts'

export function buildPredictionCacheKey(
  requestOffer: TavernRequestOffer,
  tavernParty: TavernParty,
  sampleCount: number,
): string {
  const members = tavernParty.party.members.map((m) => ({
    id: m.id,
    currentHp: m.currentHp,
    currentMp: m.currentMp,
    morale: m.morale,
    statusEffects: m.statusEffects,
    stats: m.stats,
    skills: m.skills,
  }))
  return JSON.stringify({
    requestId: requestOffer.id,
    partyId: tavernParty.id,
    sampleCount,
    members,
  })
}
