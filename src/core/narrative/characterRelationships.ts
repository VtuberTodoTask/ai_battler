import type { CampaignParty } from '../tavern/campaign/types.ts'
import type {
  ExpeditionBattleRecord,
  ExpeditionOutcome,
  ExpeditionResult,
  ExpeditionState,
} from '../expedition/types.ts'
import type {
  CharacterRelationship,
  CharacterRelationshipSnapshot,
  MemoryValence,
  NarrativeMemberSnapshot,
  RelationshipMemory,
  RelationshipMemoryType,
} from './types.ts'
import type { CharacterRomanticProfile, GenderId } from '../identity/types.ts'
import { SeededRng } from '../rng/seededRng.ts'

export type RelationshipEventType =
  | 'rescued'
  | 'healed'
  | 'protected'
  | 'abandoned'
  | 'supported'
  | 'conflict'
  | 'disagreement'
  | 'shared_success'
  | 'shared_failure'
  | 'retreat'
  | 'casualty'
  | 'trust_event'
  | 'other'

export interface RelationshipEvent {
  type: RelationshipEventType
  actorId?: string
  targetId?: string
  magnitude?: number
  reason: string
  expeditionId?: string
}

const DEFAULT_VALUE = 50
const MAX_RELATIONSHIP = 100
const MIN_RELATIONSHIP = 0
const RELATIONSHIP_MEMORY_LIMIT = 20

function clampRelationship(value: number): number {
  return Math.max(MIN_RELATIONSHIP, Math.min(MAX_RELATIONSHIP, value))
}

function relationshipKey(sourceId: string, targetId: string): string {
  return `${sourceId}:${targetId}`
}

function ensureRelationship(
  relationships: Record<string, CharacterRelationship>,
  sourceId: string,
  targetId: string,
): CharacterRelationship {
  const key = relationshipKey(sourceId, targetId)
  if (!relationships[key]) {
    relationships[key] = {
      sourceCharacterId: sourceId,
      targetCharacterId: targetId,
      affinity: DEFAULT_VALUE,
      trust: DEFAULT_VALUE,
      respect: DEFAULT_VALUE,
      tension: DEFAULT_VALUE,
      sharedExpeditions: 0,
      tags: [],
      recentEvents: [],
    }
  }
  return relationships[key]!
}

function memoryValence(type: RelationshipMemoryType): MemoryValence {
  switch (type) {
    case 'rescued':
    case 'healed':
    case 'protected':
    case 'supported':
    case 'shared_success':
    case 'trust_event':
      return 'positive'
    case 'conflict':
    case 'disagreement':
    case 'shared_failure':
    case 'casualty':
    case 'abandoned':
      return 'negative'
    case 'retreat':
      return 'mixed'
    case 'romantic_moment':
    case 'other':
      return 'neutral'
  }
}

function addRelationshipMemory(
  rel: CharacterRelationship,
  type: RelationshipMemoryType,
  summary: string,
  importance: number,
  options: {
    expeditionId?: string
    day?: number
    relatedFactIds?: string[]
    relatedBeatIds?: string[]
  } = {},
): void {
  const { expeditionId, day, relatedFactIds, relatedBeatIds } = options
  const existingCount = rel.recentEvents?.length ?? 0
  const id = `${expeditionId ?? 'local'}:memory:${rel.sourceCharacterId}:${rel.targetCharacterId}:${type}:${existingCount}`
  const memory: RelationshipMemory = {
    id,
    sourceCharacterId: rel.sourceCharacterId,
    targetCharacterId: rel.targetCharacterId,
    expeditionId,
    day,
    type,
    summary,
    importance,
    valence: memoryValence(type),
    relatedFactIds,
    relatedBeatIds,
    createdAtDay: day,
    lastReferencedDay: day,
  }
  rel.recentEvents ??= []
  rel.recentEvents.unshift(memory)
  if (rel.recentEvents.length > RELATIONSHIP_MEMORY_LIMIT) {
    rel.recentEvents = rel.recentEvents.slice(0, RELATIONSHIP_MEMORY_LIMIT)
  }
}

function memberNameById(
  members: NarrativeMemberSnapshot[],
  id: string,
): string | undefined {
  return members.find((m) => m.id === id)?.name
}

interface RomanceAwareMember {
  id: string
  seed?: string
  gender?: GenderId
  identity?: { gender?: GenderId }
  romanticProfile?: CharacterRomanticProfile
}

function memberGender(m: RomanceAwareMember): GenderId | undefined {
  return m.gender ?? m.identity?.gender
}

function computeInitialRomanticAttraction(
  source: RomanceAwareMember,
  target: RomanceAwareMember,
  rng: SeededRng,
): number | undefined {
  const attraction = source.romanticProfile?.attraction
  if (!attraction) return undefined
  const genders = attraction.genders
  if (genders === undefined || genders.length === 0) return undefined
  const targetGender = memberGender(target)
  if (targetGender !== undefined && !genders.includes(targetGender)) {
    return undefined
  }
  const base = attraction.openness ?? 50
  const variation = rng.integer(-15, 15)
  const value = Math.max(0, Math.min(100, base + variation))
  return value > 0 ? value : undefined
}

export function initializePartyMemberRelationships(
  members: RomanceAwareMember[],
): Record<string, CharacterRelationship> {
  const relationships: Record<string, CharacterRelationship> = {}
  for (const source of members) {
    for (const target of members) {
      if (source.id === target.id) continue
      const rel = ensureRelationship(relationships, source.id, target.id)
      const seed = source.seed ?? source.id
      const rng = new SeededRng(`${seed}:romance:${target.id}`)
      rel.romanticAttraction = computeInitialRomanticAttraction(
        source,
        target,
        rng,
      )
    }
  }
  return relationships
}

export function buildRelationshipSnapshot(
  members: NarrativeMemberSnapshot[],
  relationships: Record<string, CharacterRelationship> | undefined,
): CharacterRelationshipSnapshot[] {
  if (!relationships) return []
  const result: CharacterRelationshipSnapshot[] = []
  const keys = Object.keys(relationships).sort()
  for (const key of keys) {
    const rel = relationships[key]
    if (!rel) continue
    const sourceName = memberNameById(members, rel.sourceCharacterId) ?? '—'
    const targetName = memberNameById(members, rel.targetCharacterId) ?? '—'
    result.push({
      sourceCharacterId: rel.sourceCharacterId,
      sourceName,
      targetCharacterId: rel.targetCharacterId,
      targetName,
      affinity: rel.affinity,
      trust: rel.trust,
      respect: rel.respect,
      tension: rel.tension,
      romanticAttraction: rel.romanticAttraction,
      sharedExpeditions: rel.sharedExpeditions,
      tags: rel.tags ? [...rel.tags] : [],
      recentEvents: rel.recentEvents
        ? rel.recentEvents.map((m) => ({ ...m }))
        : [],
    })
  }
  return result
}

function survivingMemberIds(state: ExpeditionState): string[] {
  return Object.keys(state.partyHp).filter(
    (id) => !state.casualties.includes(id) && state.partyHp[id] > 0,
  )
}

function isMemberTarget(
  state: ExpeditionState,
  id: string | undefined,
): boolean {
  return (
    id !== undefined && id in state.partyHp && !state.casualties.includes(id)
  )
}

export function projectRelationshipEvents(
  state: ExpeditionState,
  outcome: ExpeditionOutcome,
  expeditionId?: string,
): RelationshipEvent[] {
  const events: RelationshipEvent[] = []
  const casualtyTargets = new Set<string>()

  for (const log of state.logs) {
    switch (log.type) {
      case 'firstAid': {
        const actorId = log.actorIds[0]
        if (actorId) {
          for (const effect of log.effects) {
            if (
              effect.type === 'hpHeal' &&
              typeof effect.value === 'number' &&
              isMemberTarget(state, effect.targetId)
            ) {
              events.push({
                type: 'healed',
                actorId,
                targetId: effect.targetId,
                magnitude: effect.value,
                reason: '帰還中の手当て',
                expeditionId,
              })
            }
          }
        }
        break
      }
      case 'casualty': {
        const targetId = log.targetIds?.[0]
        if (
          targetId &&
          targetId in state.partyHp &&
          !casualtyTargets.has(targetId)
        ) {
          const effect = log.effects.find((e) => e.type === 'hpDamage')
          const magnitude =
            effect && typeof effect.value === 'number'
              ? effect.value
              : undefined
          events.push({
            type: 'casualty',
            targetId,
            magnitude,
            reason: '遠征中の死亡',
            expeditionId,
          })
          casualtyTargets.add(targetId)
        }
        break
      }
      default:
        break
    }
  }

  for (const battle of state.battles) {
    processBattleRecord(battle, state, events, casualtyTargets, expeditionId)
  }

  // Add any casualties not already logged (e.g. battle aftermath).
  for (const id of state.casualties) {
    if (casualtyTargets.has(id)) continue
    if (id in state.partyHp) {
      events.push({
        type: 'casualty',
        targetId: id,
        reason: '遠征中の戦闘死',
        expeditionId,
      })
      casualtyTargets.add(id)
    }
  }

  // Shared outcome events for surviving members.
  const survivors = survivingMemberIds(state)
  if (outcome === 'completeSuccess' || outcome === 'success') {
    for (const actor of survivors) {
      for (const target of survivors) {
        if (actor === target) continue
        events.push({
          type: 'shared_success',
          actorId: actor,
          targetId: target,
          reason: `遠征成功（${outcome}）`,
          expeditionId,
        })
      }
    }
  } else if (
    outcome === 'failedObjective' ||
    outcome === 'forcedRetreat' ||
    outcome === 'lostExpedition'
  ) {
    for (const actor of survivors) {
      for (const target of survivors) {
        if (actor === target) continue
        events.push({
          type: 'shared_failure',
          actorId: actor,
          targetId: target,
          reason: `遠征失敗（${outcome}）`,
          expeditionId,
        })
      }
    }
  }

  return events
}

function processBattleRecord(
  battle: ExpeditionBattleRecord,
  state: ExpeditionState,
  events: RelationshipEvent[],
  casualtyTargets: Set<string>,
  expeditionId?: string,
): void {
  const result = battle.result
  if (!result) return

  for (const id of result.deadAdventurers ?? []) {
    if (casualtyTargets.has(id)) continue
    if (id in state.partyHp) {
      events.push({
        type: 'casualty',
        targetId: id,
        reason: '戦闘で死亡',
        expeditionId,
      })
      casualtyTargets.add(id)
    }
  }

  for (const id of result.incapacitatedAdventurers ?? []) {
    if (casualtyTargets.has(id)) continue
    if (id in state.partyHp) {
      events.push({
        type: 'casualty',
        targetId: id,
        reason: '戦闘不能',
        expeditionId,
      })
      casualtyTargets.add(id)
    }
  }

  for (const injury of battle.injuries ?? []) {
    if (casualtyTargets.has(injury.adventurerId)) continue
    if (injury.adventurerId in state.partyHp) {
      events.push({
        type: 'casualty',
        targetId: injury.adventurerId,
        magnitude: injury.type === 'serious' ? 10 : 5,
        reason: injury.type === 'serious' ? '重傷' : '負傷',
        expeditionId,
      })
      casualtyTargets.add(injury.adventurerId)
    }
  }

  const diagnostic = result.retreatDiagnostic
  if (
    diagnostic?.proposerId &&
    diagnostic.leaderId &&
    diagnostic.approved === false
  ) {
    events.push({
      type: 'conflict',
      actorId: diagnostic.proposerId,
      targetId: diagnostic.leaderId,
      reason: '撤退提案が拒否された',
      expeditionId,
    })
  }
}

function memberNameByIdFromMembers(
  members: { id: string; name?: string }[],
  id: string,
): string | undefined {
  return members.find((m) => m.id === id)?.name
}

function casualtyImportance(magnitude?: number): number {
  if (magnitude === undefined) return 10
  if (magnitude >= 8) return 8
  if (magnitude >= 5) return 5
  return 3
}

function casualtySummary(targetName: string, magnitude?: number): string {
  if (magnitude === undefined) return `${targetName}が死んだ場面を目撃した`
  if (magnitude >= 8) return `${targetName}が重傷を負った場面を目撃した`
  if (magnitude >= 5) return `${targetName}が負傷した場面を目撃した`
  return `${targetName}が軽傷を負った場面を目撃した`
}

export function applyRelationshipEvents(
  relationships: Record<string, CharacterRelationship>,
  members: { id: string; name?: string }[],
  events: RelationshipEvent[],
  options: {
    state?: ExpeditionState
    day?: number
  } = {},
): void {
  const memberSet = new Set(members.map((m) => m.id))

  for (const event of events) {
    const memoryOptions = {
      expeditionId: event.expeditionId,
      day: options.day,
    }
    switch (event.type) {
      case 'healed': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          const delta =
            typeof event.magnitude === 'number'
              ? Math.min(3, Math.max(1, event.magnitude / 3))
              : 1
          rel.trust = clampRelationship(rel.trust + delta)
          rel.affinity = clampRelationship(rel.affinity + 1)
          rel.respect = clampRelationship(rel.respect + 1)
          const targetName =
            memberNameByIdFromMembers(members, event.targetId) ?? '仲間'
          const importance =
            typeof event.magnitude === 'number'
              ? Math.min(7, 4 + Math.floor(event.magnitude / 3))
              : 5
          addRelationshipMemory(
            rel,
            'healed',
            `${targetName}の手当てを行った`,
            importance,
            memoryOptions,
          )
          const reverse = ensureRelationship(
            relationships,
            event.targetId,
            event.actorId,
          )
          const actorName =
            memberNameByIdFromMembers(members, event.actorId) ?? '仲間'
          addRelationshipMemory(
            reverse,
            'healed',
            `${actorName}に手当てしてもらった`,
            importance,
            memoryOptions,
          )
        }
        break
      }
      case 'rescued': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.trust = clampRelationship(rel.trust + 3)
          rel.affinity = clampRelationship(rel.affinity + 2)
          rel.respect = clampRelationship(rel.respect + 1)
          const targetName =
            memberNameByIdFromMembers(members, event.targetId) ?? '仲間'
          addRelationshipMemory(
            rel,
            'rescued',
            `危険な状況で${targetName}を救った`,
            8,
            memoryOptions,
          )
          const reverse = ensureRelationship(
            relationships,
            event.targetId,
            event.actorId,
          )
          const actorName =
            memberNameByIdFromMembers(members, event.actorId) ?? '仲間'
          addRelationshipMemory(
            reverse,
            'rescued',
            `危険な状況で${actorName}に助けられた`,
            8,
            memoryOptions,
          )
        }
        break
      }
      case 'protected': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.trust = clampRelationship(rel.trust + 2)
          rel.affinity = clampRelationship(rel.affinity + 1)
          const targetName =
            memberNameByIdFromMembers(members, event.targetId) ?? '仲間'
          addRelationshipMemory(
            rel,
            'protected',
            `${targetName}を敵から庇った`,
            4,
            memoryOptions,
          )
          const reverse = ensureRelationship(
            relationships,
            event.targetId,
            event.actorId,
          )
          const actorName =
            memberNameByIdFromMembers(members, event.actorId) ?? '仲間'
          addRelationshipMemory(
            reverse,
            'protected',
            `${actorName}に敵から庇われた`,
            4,
            memoryOptions,
          )
        }
        break
      }
      case 'supported': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.affinity = clampRelationship(rel.affinity + 1)
          rel.respect = clampRelationship(rel.respect + 1)
          const targetName =
            memberNameByIdFromMembers(members, event.targetId) ?? '仲間'
          addRelationshipMemory(
            rel,
            'supported',
            `${targetName}を支援した`,
            3,
            memoryOptions,
          )
        }
        break
      }
      case 'abandoned': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.affinity = clampRelationship(rel.affinity - 3)
          rel.trust = clampRelationship(rel.trust - 3)
          rel.tension = clampRelationship(rel.tension + 3)
          const targetName =
            memberNameByIdFromMembers(members, event.targetId) ?? '仲間'
          addRelationshipMemory(
            rel,
            'abandoned',
            `${targetName}を見捨てた`,
            7,
            memoryOptions,
          )
          const reverse = ensureRelationship(
            relationships,
            event.targetId,
            event.actorId,
          )
          const actorName =
            memberNameByIdFromMembers(members, event.actorId) ?? '仲間'
          addRelationshipMemory(
            reverse,
            'abandoned',
            `${actorName}に見捨てられた`,
            7,
            memoryOptions,
          )
        }
        break
      }
      case 'conflict':
      case 'disagreement': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.tension = clampRelationship(rel.tension + 5)
          rel.affinity = clampRelationship(rel.affinity - 2)
          rel.trust = clampRelationship(rel.trust - 1)
          const targetName =
            memberNameByIdFromMembers(members, event.targetId) ?? '相手'
          const importance = event.type === 'conflict' ? 6 : 4
          addRelationshipMemory(
            rel,
            event.type,
            `${targetName}と意見が対立した`,
            importance,
            memoryOptions,
          )
        }
        break
      }
      case 'shared_success': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.affinity = clampRelationship(rel.affinity + 2)
          rel.trust = clampRelationship(rel.trust + 1)
          rel.respect = clampRelationship(rel.respect + 1)
          addRelationshipMemory(
            rel,
            'shared_success',
            '遠征の成功を共にした',
            2,
            memoryOptions,
          )
        }
        break
      }
      case 'shared_failure': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.affinity = clampRelationship(rel.affinity - 2)
          rel.trust = clampRelationship(rel.trust - 1)
          rel.tension = clampRelationship(rel.tension + 1)
          addRelationshipMemory(
            rel,
            'shared_failure',
            '遠征の失敗を共にした',
            5,
            memoryOptions,
          )
        }
        break
      }
      case 'retreat': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.tension = clampRelationship(rel.tension + 1)
          addRelationshipMemory(
            rel,
            'retreat',
            '撤退判断を共にした',
            4,
            memoryOptions,
          )
        }
        break
      }
      case 'trust_event': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.trust = clampRelationship(rel.trust + 2)
          addRelationshipMemory(
            rel,
            'trust_event',
            event.reason || '信頼できる行動を見せた',
            5,
            memoryOptions,
          )
        }
        break
      }
      case 'casualty': {
        if (event.targetId && memberSet.has(event.targetId)) {
          const { state } = options
          const survivors = state?.partyHp
            ? Object.keys(state.partyHp).filter(
                (id) =>
                  id !== event.targetId &&
                  !state.casualties.includes(id) &&
                  state.partyHp[id] > 0,
              )
            : members.map((m) => m.id).filter((id) => id !== event.targetId)
          const sources = event.actorId ? [event.actorId] : survivors
          for (const sourceId of sources) {
            if (sourceId === event.targetId || !memberSet.has(sourceId))
              continue
            const rel = ensureRelationship(
              relationships,
              sourceId,
              event.targetId,
            )
            rel.affinity = clampRelationship(rel.affinity - 2)
            rel.trust = clampRelationship(rel.trust - 1)
            rel.tension = clampRelationship(rel.tension + 2)
            const targetName =
              memberNameByIdFromMembers(members, event.targetId) ?? '仲間'
            addRelationshipMemory(
              rel,
              'casualty',
              casualtySummary(targetName, event.magnitude),
              casualtyImportance(event.magnitude),
              memoryOptions,
            )
          }
        }
        break
      }
      case 'other':
      default:
        break
    }
  }
}

export function applyCharacterRelationshipChanges(
  party: CampaignParty,
  result: ExpeditionResult,
  dayNumber: number,
  expeditionId?: string,
): void {
  if (!result.state) return
  if (!party.memberRelationships) {
    party.memberRelationships = initializePartyMemberRelationships(
      party.party.members,
    )
  }
  const events = projectRelationshipEvents(
    result.state,
    result.outcome,
    expeditionId,
  )
  applyRelationshipEvents(
    party.memberRelationships,
    party.party.members,
    events,
    {
      state: result.state,
      day: dayNumber,
    },
  )
}
