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
  NarrativeMemberSnapshot,
  RelationshipMemory,
} from './types.ts'

export type RelationshipEventType =
  | 'rescued'
  | 'healed'
  | 'protected'
  | 'conflict'
  | 'shared_success'
  | 'shared_failure'
  | 'casualty'
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
const MEMORY_LIMIT = 3

function clampRelationship(value: number): number {
  return Math.max(MIN_RELATIONSHIP, Math.min(MAX_RELATIONSHIP, value))
}

function ensureRelationship(
  relationships: Record<string, CharacterRelationship>,
  sourceId: string,
  targetId: string,
): CharacterRelationship {
  const key = `${sourceId}:${targetId}`
  if (!relationships[key]) {
    relationships[key] = {
      sourceCharacterId: sourceId,
      targetCharacterId: targetId,
      affinity: DEFAULT_VALUE,
      trust: DEFAULT_VALUE,
      respect: DEFAULT_VALUE,
      tension: DEFAULT_VALUE,
      tags: [],
      recentEvents: [],
    }
  }
  return relationships[key]!
}

function addMemory(
  rel: CharacterRelationship,
  type: string,
  summary: string,
  importance: number,
  expeditionId?: string,
): void {
  const memory: RelationshipMemory = {
    expeditionId,
    type,
    summary,
    importance,
  }
  rel.recentEvents ??= []
  rel.recentEvents.unshift(memory)
  if (rel.recentEvents.length > MEMORY_LIMIT) {
    rel.recentEvents = rel.recentEvents.slice(0, MEMORY_LIMIT)
  }
}

function memberNameById(
  members: NarrativeMemberSnapshot[],
  id: string,
): string | undefined {
  return members.find((m) => m.id === id)?.name
}

export function initializePartyMemberRelationships(
  members: { id: string }[],
): Record<string, CharacterRelationship> {
  const relationships: Record<string, CharacterRelationship> = {}
  for (const source of members) {
    for (const target of members) {
      if (source.id === target.id) continue
      ensureRelationship(relationships, source.id, target.id)
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

export function applyRelationshipEvents(
  relationships: Record<string, CharacterRelationship>,
  members: { id: string }[],
  events: RelationshipEvent[],
  state?: ExpeditionState,
): void {
  const memberSet = new Set(members.map((m) => m.id))

  for (const event of events) {
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
          addMemory(rel, 'healed', '負傷者の手当て', 5, event.expeditionId)
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
          addMemory(rel, 'rescued', '仲間を救った行動', 6, event.expeditionId)
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
          addMemory(rel, 'protected', '防御的な庇い', 4, event.expeditionId)
        }
        break
      }
      case 'conflict': {
        if (event.actorId && event.targetId && memberSet.has(event.targetId)) {
          const rel = ensureRelationship(
            relationships,
            event.actorId,
            event.targetId,
          )
          rel.tension = clampRelationship(rel.tension + 5)
          rel.affinity = clampRelationship(rel.affinity - 2)
          rel.trust = clampRelationship(rel.trust - 1)
          addMemory(rel, 'conflict', '意見の対立', 6, event.expeditionId)
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
          addMemory(
            rel,
            'shared_success',
            '遠征の成功を共にした',
            5,
            event.expeditionId,
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
          addMemory(
            rel,
            'shared_failure',
            '遠征の失敗を共にした',
            6,
            event.expeditionId,
          )
        }
        break
      }
      case 'casualty': {
        if (event.targetId && memberSet.has(event.targetId)) {
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
            addMemory(
              rel,
              'casualty',
              '仲間の死を目撃した',
              8,
              event.expeditionId,
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
    result.state,
  )
}
