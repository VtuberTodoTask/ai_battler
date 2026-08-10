import type { CampaignParty } from '../tavern/campaign/types.ts'
import type {
  ExpeditionOutcome,
  ExpeditionResult,
  ExpeditionState,
  RescueObjectiveState,
} from '../expedition/types.ts'
import type {
  CharacterMemory,
  CharacterMemoryType,
  MemoryValence,
  NarrativeMemoryContextItem,
  NarrativeRequestInfo,
  RelationshipMemory,
} from './types.ts'

const CHARACTER_MEMORY_LIMIT = 20
const PER_EXPEDITION_CHARACTER_MEMORY_BUDGET = 3
const RELATIONSHIP_MEMORY_CONTEXT_BUDGET_PER_PAIR = 2
const CHARACTER_MEMORY_CONTEXT_BUDGET = 2

function defaultCharacterMemoryValence(
  type: CharacterMemoryType,
): MemoryValence {
  switch (type) {
    case 'major_success':
    case 'rescue':
    case 'objective_success':
      return 'positive'
    case 'major_failure':
    case 'injury':
    case 'critical_injury':
    case 'casualty':
    case 'objective_failure':
      return 'negative'
    case 'retreat':
      return 'mixed'
    case 'other':
      return 'neutral'
  }
}

function memoryId(
  prefix: string,
  characterId: string,
  type: string,
  index: number,
  expeditionId?: string,
): string {
  return `${expeditionId ?? 'local'}:${prefix}:${characterId}:${type}:${index}`
}

function addCharacterMemory(
  list: CharacterMemory[],
  characterId: string,
  type: CharacterMemoryType,
  summary: string,
  importance: number,
  options: {
    expeditionId?: string
    day?: number
    valence?: MemoryValence
    relatedCharacterIds?: string[]
    relatedBeatIds?: string[]
  } = {},
): void {
  const { expeditionId, day, valence, relatedCharacterIds, relatedBeatIds } =
    options
  const id = memoryId('cm', characterId, type, list.length, expeditionId)
  const memory: CharacterMemory = {
    id,
    characterId,
    expeditionId,
    day,
    type,
    summary,
    importance,
    valence: valence ?? defaultCharacterMemoryValence(type),
    relatedCharacterIds,
    relatedBeatIds,
    createdAtDay: day,
    lastReferencedDay: day,
  }
  list.unshift(memory)
  if (list.length > CHARACTER_MEMORY_LIMIT) {
    list.length = CHARACTER_MEMORY_LIMIT
  }
}

function formatCharacterNames(
  ids: string[],
  members: { id: string; name?: string }[],
): string {
  const names = ids
    .map((id) => members.find((m) => m.id === id)?.name ?? id)
    .filter(Boolean)
  if (names.length === 0) return '仲間'
  if (names.length === 1) return names[0] as string
  return `${names.slice(0, -1).join('、')}と${names[names.length - 1]}`
}

function survivingMemberIds(state: ExpeditionState): string[] {
  return Object.keys(state.partyHp).filter(
    (id) => !state.casualties.includes(id) && state.partyHp[id] > 0,
  )
}

function sortedPairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

function updateSharedExpeditionCounts(party: CampaignParty): void {
  const members = party.party.members
  party.sharedExpeditionCounts ??= {}
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const key = sortedPairKey(members[i]!.id, members[j]!.id)
      party.sharedExpeditionCounts[key] =
        (party.sharedExpeditionCounts[key] ?? 0) + 1
    }
  }

  if (party.memberRelationships) {
    for (let i = 0; i < members.length; i++) {
      for (let j = 0; j < members.length; j++) {
        if (i === j) continue
        const key = relationshipKey(members[i]!.id, members[j]!.id)
        const rel = party.memberRelationships[key]
        if (rel) {
          rel.sharedExpeditions =
            party.sharedExpeditionCounts[
              sortedPairKey(members[i]!.id, members[j]!.id)
            ] ?? 0
        }
      }
    }
  }
}

function relationshipKey(sourceId: string, targetId: string): string {
  return `${sourceId}:${targetId}`
}

function outcomeMemory(
  outcome: ExpeditionOutcome,
  casualties: string[],
): {
  type: CharacterMemoryType
  summary: string
  importance: number
  valence: MemoryValence
} {
  if (casualties.length > 0) {
    return {
      type: 'major_failure',
      summary: '遠征で仲間を失った',
      importance: 10,
      valence: 'negative',
    }
  }
  switch (outcome) {
    case 'completeSuccess':
      return {
        type: 'major_success',
        summary: '遠征を完全成功させた',
        importance: 7,
        valence: 'positive',
      }
    case 'success':
      return {
        type: 'major_success',
        summary: '遠征を成功させた',
        importance: 6,
        valence: 'positive',
      }
    case 'partialSuccess':
      return {
        type: 'objective_success',
        summary: '遠征の目的を部分的に達成した',
        importance: 4,
        valence: 'positive',
      }
    case 'failedObjective':
      return {
        type: 'objective_failure',
        summary: '遠征の目的を達成できなかった',
        importance: 7,
        valence: 'negative',
      }
    case 'forcedRetreat':
      return {
        type: 'retreat',
        summary: '遠征から撤退した',
        importance: 6,
        valence: 'mixed',
      }
    case 'lostExpedition':
      return {
        type: 'retreat',
        summary: '遠征から全滅して帰還できなかった',
        importance: 9,
        valence: 'negative',
      }
  }
}

export function applyExpeditionMemory(
  party: CampaignParty,
  result: ExpeditionResult,
  dayNumber: number,
  expeditionId?: string,
): void {
  if (!result.state) return

  const state = result.state
  const members = party.party.members
  const survivors = new Set(survivingMemberIds(state))

  party.characterMemories ??= {}
  updateSharedExpeditionCounts(party)

  for (const member of members) {
    if (state.casualties.includes(member.id)) continue
    const list = (party.characterMemories[member.id] ??= [])
    const candidates: CharacterMemory[] = []

    // Outcome memory.
    const outcome = outcomeMemory(result.outcome, state.casualties)
    candidates.push({
      id: memoryId(
        'cm',
        member.id,
        outcome.type,
        list.length + candidates.length,
        expeditionId,
      ),
      characterId: member.id,
      expeditionId,
      day: dayNumber,
      ...outcome,
      relatedCharacterIds: members
        .map((m) => m.id)
        .filter((id) => id !== member.id),
      createdAtDay: dayNumber,
      lastReferencedDay: dayNumber,
    })

    // Injury memory.
    const memberInjuries = state.injuries.filter(
      (i) => i.adventurerId === member.id,
    )
    for (const injury of memberInjuries) {
      const type = injury.type === 'serious' ? 'critical_injury' : 'injury'
      const summary = injury.type === 'serious' ? '重傷を負った' : '負傷した'
      const importance = injury.type === 'serious' ? 7 : 4
      candidates.push({
        id: memoryId(
          'cm',
          member.id,
          type,
          list.length + candidates.length,
          expeditionId,
        ),
        characterId: member.id,
        expeditionId,
        day: dayNumber,
        type,
        summary,
        importance,
        valence: 'negative',
        relatedCharacterIds: members
          .map((m) => m.id)
          .filter((id) => id !== member.id),
        createdAtDay: dayNumber,
        lastReferencedDay: dayNumber,
      })
    }

    // Witnessed casualty memory for survivors.
    if (survivors.has(member.id) && state.casualties.length > 0) {
      const deadNames = formatCharacterNames(state.casualties, members)
      candidates.push({
        id: memoryId(
          'cm',
          member.id,
          'casualty',
          list.length + candidates.length,
          expeditionId,
        ),
        characterId: member.id,
        expeditionId,
        day: dayNumber,
        type: 'casualty',
        summary: `${deadNames}の死を目撃した`,
        importance: 9,
        valence: 'negative',
        relatedCharacterIds: state.casualties,
        createdAtDay: dayNumber,
        lastReferencedDay: dayNumber,
      })
    }

    // Rescue memory.
    if (state.objectiveState?.type === 'rescue') {
      const objective = state.objectiveState as RescueObjectiveState
      if (objective.returned && survivors.has(member.id)) {
        candidates.push({
          id: memoryId(
            'cm',
            member.id,
            'rescue',
            list.length + candidates.length,
            expeditionId,
          ),
          characterId: member.id,
          expeditionId,
          day: dayNumber,
          type: 'rescue',
          summary: `${objective.targetName}を救助した`,
          importance: 8,
          valence: 'positive',
          relatedCharacterIds: members
            .map((m) => m.id)
            .filter((id) => id !== member.id),
          createdAtDay: dayNumber,
          lastReferencedDay: dayNumber,
        })
      } else if (objective.abandoned && survivors.has(member.id)) {
        candidates.push({
          id: memoryId(
            'cm',
            member.id,
            'objective_failure',
            list.length + candidates.length,
            expeditionId,
          ),
          characterId: member.id,
          expeditionId,
          day: dayNumber,
          type: 'objective_failure',
          summary: `${objective.targetName}を置き去りにした`,
          importance: 7,
          valence: 'negative',
          relatedCharacterIds: members
            .map((m) => m.id)
            .filter((id) => id !== member.id),
          createdAtDay: dayNumber,
          lastReferencedDay: dayNumber,
        })
      }
    }

    // Keep top memories by importance for this expedition.
    candidates.sort((a, b) => b.importance - a.importance)
    const selected = candidates.slice(0, PER_EXPEDITION_CHARACTER_MEMORY_BUDGET)
    for (const memory of selected) {
      addCharacterMemory(
        list,
        member.id,
        memory.type,
        memory.summary,
        memory.importance,
        {
          expeditionId: memory.expeditionId,
          day: memory.day,
          valence: memory.valence,
          relatedCharacterIds: memory.relatedCharacterIds,
        },
      )
    }
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
}

function relevanceScore(
  memory: CharacterMemory | RelationshipMemory,
  focus: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  day: number,
): number {
  const tokens = new Set(
    tokenize(
      `${focus} ${request.title} ${request.briefing} ${request.publicTags.join(' ')}`,
    ),
  )
  const memoryText = memory.summary
  const memoryTokens = tokenize(memoryText)
  let overlap = 0
  for (const t of memoryTokens) {
    if (tokens.has(t)) overlap += 1
  }
  const recencyBonus =
    memory.day !== undefined ? Math.max(0, 3 - (day - memory.day)) * 0.5 : 0
  const involvedBonus =
    ('characterId' in memory &&
      sceneCharacterIds.includes(memory.characterId)) ||
    ('sourceCharacterId' in memory &&
      sceneCharacterIds.includes(memory.sourceCharacterId) &&
      sceneCharacterIds.includes(memory.targetCharacterId))
      ? 2
      : 0
  return (memory.importance ?? 5) + overlap * 2 + recencyBonus + involvedBonus
}

export interface ProjectedMemoryContext {
  characterMemories: Record<string, NarrativeMemoryContextItem[]>
  relationshipMemories: Record<string, NarrativeMemoryContextItem[]>
}

export function projectMemoriesForNarrative(
  party: CampaignParty,
  focus: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  day: number,
): ProjectedMemoryContext {
  const characterMemories: Record<string, NarrativeMemoryContextItem[]> = {}
  const relationshipMemories: Record<string, NarrativeMemoryContextItem[]> = {}

  for (const member of party.party.members) {
    if (!sceneCharacterIds.includes(member.id)) continue
    const list = party.characterMemories?.[member.id] ?? []
    if (list.length === 0) continue
    const scored = list.map((m) => ({
      memory: m,
      score: relevanceScore(m, focus, request, sceneCharacterIds, day),
    }))
    scored.sort((a, b) => b.score - a.score)
    characterMemories[member.id] = scored
      .slice(0, CHARACTER_MEMORY_CONTEXT_BUDGET)
      .map(({ memory }) => ({
        summary: memory.summary,
        type: memory.type,
        importance: memory.importance,
        valence: memory.valence,
      }))
  }

  if (party.memberRelationships) {
    const seenPairs = new Set<string>()
    for (const key of Object.keys(party.memberRelationships)) {
      const rel = party.memberRelationships[key]
      if (!rel || !rel.recentEvents || rel.recentEvents.length === 0) continue
      if (
        !sceneCharacterIds.includes(rel.sourceCharacterId) ||
        !sceneCharacterIds.includes(rel.targetCharacterId)
      ) {
        continue
      }
      const pairKey = sortedPairKey(
        rel.sourceCharacterId,
        rel.targetCharacterId,
      )
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      // Gather events from both directions.
      const events: RelationshipMemory[] = []
      const forward =
        party.memberRelationships[
          relationshipKey(rel.sourceCharacterId, rel.targetCharacterId)
        ]?.recentEvents ?? []
      const reverse =
        party.memberRelationships[
          relationshipKey(rel.targetCharacterId, rel.sourceCharacterId)
        ]?.recentEvents ?? []
      events.push(...forward, ...reverse)
      if (events.length === 0) continue
      const scored = events.map((m) => ({
        memory: m,
        score: relevanceScore(m, focus, request, sceneCharacterIds, day),
      }))
      scored.sort((a, b) => b.score - a.score)
      relationshipMemories[pairKey] = scored
        .slice(0, RELATIONSHIP_MEMORY_CONTEXT_BUDGET_PER_PAIR)
        .map(({ memory }) => ({
          summary: memory.summary,
          type: memory.type,
          importance: memory.importance,
          valence: memory.valence,
        }))
    }
  }

  return { characterMemories, relationshipMemories }
}

export function selectedCharacterMemorySummaries(
  characterId: string,
  context: ProjectedMemoryContext,
): NarrativeMemoryContextItem[] {
  return context.characterMemories[characterId] ?? []
}
