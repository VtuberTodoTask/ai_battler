import type {
  ExpeditionBattleRecord,
  ExpeditionLogEntry,
  ExpeditionPhase,
  ExpeditionState,
} from '../expedition/types.ts'
import type {
  ExpeditionNarrativeContext,
  NarrativeMemberSnapshot,
  NarrativeTimelineBeat,
  NarrativeTimelineBeatKind,
  NarrativeTimelinePhase,
} from './types.ts'
import { battleOutcomeLabel, environmentLabel } from './facts.ts'

export type {
  NarrativeTimelineBeat,
  NarrativeTimelineBeatKind,
  NarrativeTimelinePhase,
} from './types.ts'

const PHASE_MAP: Record<ExpeditionPhase, NarrativeTimelinePhase> = {
  preparation: 'departure',
  approach: 'approach',
  contact: 'approach',
  exploration: 'exploration',
  objective: 'objective',
  battle: 'battle',
  return: 'return',
  aftermath: 'aftermath',
}

const PHASE_LABELS: Record<NarrativeTimelinePhase, string> = {
  departure: '出発',
  approach: '接近',
  exploration: '探索',
  objective: '目標',
  battle: '戦闘',
  return: '帰還',
  aftermath: '決着',
}

export function formatNarrativeTimeline(
  beats: NarrativeTimelineBeat[],
): string {
  const lines: string[] = []
  let lastPhase: NarrativeTimelinePhase | undefined
  for (const beat of beats) {
    if (beat.phase !== lastPhase) {
      if (lines.length > 0) lines.push('')
      lines.push(`[${PHASE_LABELS[beat.phase]}]`)
      lastPhase = beat.phase
    }
    lines.push(`- ${beat.text}`)
  }
  return lines.join('\n').trim()
}

function memberName(
  id: string,
  members: NarrativeMemberSnapshot[],
): string | undefined {
  return members.find((m) => m.id === id)?.name
}

function makeBeat(
  index: number,
  phase: NarrativeTimelinePhase,
  kind: NarrativeTimelineBeatKind,
  text: string,
  importance: number,
  actorIds?: string[],
  targetIds?: string[],
): NarrativeTimelineBeat {
  return {
    id: `beat-${phase}-${index}-${kind}`,
    phase,
    kind,
    text,
    actorIds,
    targetIds,
    importance,
  }
}

function buildBattleTimeline(
  record: ExpeditionBattleRecord,
  members: NarrativeMemberSnapshot[],
  startIndex: number,
): NarrativeTimelineBeat[] {
  const beats: NarrativeTimelineBeat[] = []
  let i = startIndex

  beats.push(
    makeBeat(
      i++,
      'battle',
      'battle',
      '遠征中に戦闘が発生した',
      100,
      members.map((m) => m.id),
    ),
  )

  const contact = record.result.contactResult
  if (contact && contact.type) {
    const contactText =
      contact.type === 'greatSuccess' || contact.type === 'success'
        ? 'Partyは有利な形で敵と接敵した'
        : contact.type === 'failure' || contact.type === 'greatFailure'
          ? '敵に先制された状態で戦闘が始まった'
          : '双方がほぼ同時に敵を認識して戦闘が始まった'
    beats.push(makeBeat(i++, 'battle', 'battle', contactText, 90))
  }

  const rounds = record.rounds
  if (rounds > 0) {
    const durationText =
      rounds <= 3
        ? '短い激突だった'
        : rounds <= 8
          ? '戦闘がしばらく続いた'
          : '戦闘は長引いた'
    beats.push(makeBeat(i++, 'battle', 'battle', durationText, 60))
  }

  const genericAbilityIds = new Set(['attack'])
  const abilityIds = new Set<string>()
  for (const log of record.result.logs) {
    const abilityId =
      typeof log.metadata?.abilityId === 'string'
        ? log.metadata.abilityId
        : undefined
    if (
      abilityId &&
      !genericAbilityIds.has(abilityId) &&
      !abilityIds.has(abilityId)
    ) {
      abilityIds.add(abilityId)
      const actorName = log.actorId
        ? (memberName(log.actorId, members) ?? '一人の冒険者')
        : 'Party'
      beats.push(
        makeBeat(
          i++,
          'battle',
          'battle',
          `${actorName}が${abilityId}を使用した`,
          65,
          log.actorId ? [log.actorId] : undefined,
        ),
      )
    }
  }

  const deadIds = record.deadAdventurerIds ?? []
  const incapacitatedIds = record.incapacitatedAdventurerIds ?? []
  const survivingIds = record.survivingAdventurerIds ?? []

  for (const id of deadIds) {
    const name = memberName(id, members) ?? '一人の冒険者'
    beats.push(
      makeBeat(i++, 'battle', 'battle', `${name}は戦闘で命を落とした`, 95, [
        id,
      ]),
    )
  }

  for (const id of incapacitatedIds) {
    if (deadIds.includes(id)) continue
    const name = memberName(id, members) ?? '一人の冒険者'
    beats.push(
      makeBeat(i++, 'battle', 'battle', `${name}は戦闘不能になった`, 90, [id]),
    )
  }

  for (const injury of record.injuries ?? []) {
    if (deadIds.includes(injury.adventurerId)) continue
    const name = memberName(injury.adventurerId, members) ?? '一人の冒険者'
    const severityText =
      injury.type === 'serious' ? '大きな負傷を負った' : '負傷を負った'
    beats.push(
      makeBeat(i++, 'battle', 'battle', `${name}は${severityText}`, 85, [
        injury.adventurerId,
      ]),
    )
  }

  if (record.outcome === 'retreat') {
    beats.push(
      makeBeat(
        i++,
        'battle',
        'battle',
        'Partyは戦闘から撤退した',
        92,
        survivingIds,
      ),
    )
  }

  beats.push(
    makeBeat(
      i++,
      'battle',
      'outcome',
      `戦闘結果は${battleOutcomeLabel(record.outcome)}だった`,
      95,
    ),
  )

  if (record.result.discoveredWeaknesses.length > 0) {
    beats.push(
      makeBeat(i++, 'battle', 'battle', '敵の弱点をいくつか確認した', 70),
    )
  }

  // Cap battle beats to a reasonable maximum while preserving mandatory beats.
  const mandatory = new Set<number>()
  beats.forEach((b, idx) => {
    if (
      b.text === '遠征中に戦闘が発生した' ||
      b.text === 'Partyは戦闘から撤退した' ||
      b.kind === 'outcome' ||
      b.importance >= 95
    ) {
      mandatory.add(idx)
    }
  })

  const maxBattleBeats = 12
  if (beats.length > maxBattleBeats) {
    const sorted = beats
      .map((b, idx) => ({ b, idx }))
      .filter(({ idx }) => mandatory.has(idx) || beats[idx].importance >= 80)
    // Keep all mandatory + high importance first, then fill by importance up to cap.
    const kept = new Set<number>()
    for (const { idx } of sorted) kept.add(idx)
    const remaining = beats
      .map((b, idx) => ({ b, idx }))
      .filter(({ idx }) => !kept.has(idx))
      .sort((a, b) => b.b.importance - a.b.importance)
    let slots = maxBattleBeats - kept.size
    for (const { idx } of remaining) {
      if (slots <= 0) break
      kept.add(idx)
      slots--
    }
    // Preserve original order.
    return beats.filter((_, idx) => kept.has(idx))
  }

  return beats
}

export function buildExpeditionNarrativeTimeline(
  context: ExpeditionNarrativeContext,
): NarrativeTimelineBeat[] {
  const members = context.party.members
  const beats: NarrativeTimelineBeat[] = []
  const seenTexts = new Set<string>()
  let index = 0

  function addBeat(
    phase: NarrativeTimelinePhase,
    kind: NarrativeTimelineBeatKind,
    text: string,
    importance: number,
    actorIds?: string[],
    targetIds?: string[],
  ): void {
    if (seenTexts.has(text)) return
    seenTexts.add(text)
    beats.push(
      makeBeat(index++, phase, kind, text, importance, actorIds, targetIds),
    )
  }

  // Departure beat
  addBeat(
    'departure',
    'transition',
    `${context.party.name}は依頼を引き受け、${environmentLabel(context.request.environment)}へ向かった`,
    90,
    members.map((m) => m.id),
  )

  const state: ExpeditionState | undefined = context.state
  if (state) {
    let battleIndex = 0
    for (const log of state.logs) {
      if (log.type === 'battleSummary') {
        const record = state.battles[battleIndex]
        if (record) {
          const battleBeats = buildBattleTimeline(record, members, index)
          index += battleBeats.length
          beats.push(...battleBeats)
        }
        battleIndex++
        continue
      }

      const phase = PHASE_MAP[log.phase] ?? 'exploration'
      for (const fact of log.facts) {
        if (!fact.trim()) continue
        addBeat(
          phase,
          'event',
          fact,
          importanceForLog(log),
          log.actorIds,
          log.targetIds,
        )
      }
    }

    // Ensure a return beat exists for non-lost expeditions.
    const hasReturn = beats.some((b) => b.phase === 'return')
    const hasAftermath = beats.some((b) => b.phase === 'aftermath')
    if (!hasReturn && context.report.outcome !== 'lostExpedition') {
      addBeat(
        'return',
        'return',
        'Partyは酒場へ帰還した',
        80,
        survivingMemberIds(context),
      )
    }
    if (!hasAftermath && context.report.outcome !== 'lostExpedition') {
      addBeat(
        'aftermath',
        'outcome',
        'Partyは酒場で店主へ結果を報告した',
        85,
        survivingMemberIds(context),
      )
    }
  } else {
    // Fallback timeline when full state is not available.
    addBeat(
      'exploration',
      'event',
      `${objectiveLabel(context.report.objectiveType)}を進めた`,
      50,
    )
    if (context.report.battleOutcome) {
      addBeat('battle', 'battle', '遠征中に戦闘が発生した', 100)
      addBeat(
        'battle',
        'outcome',
        `戦闘結果は${battleOutcomeLabel(context.report.battleOutcome)}だった`,
        95,
      )
    }
    if (context.report.outcome !== 'lostExpedition') {
      addBeat('return', 'return', 'Partyは酒場へ帰還した', 80)
      addBeat('aftermath', 'outcome', 'Partyは酒場で店主へ結果を報告した', 85)
    }
  }

  return beats
}

function importanceForLog(log: ExpeditionLogEntry): number {
  switch (log.type) {
    case 'escortTargetDeath':
    case 'targetDeath':
    case 'casualty':
      return 95
    case 'retreat':
      return 90
    case 'objectiveComplete':
      return 85
    case 'escortDeparture':
    case 'rescueLocate':
    case 'retrievalLocate':
    case 'surveySectorComplete':
      return 75
    default:
      return 50
  }
}

function survivingMemberIds(context: ExpeditionNarrativeContext): string[] {
  const dead = new Set(context.report.casualties)
  return context.party.members.filter((m) => !dead.has(m.id)).map((m) => m.id)
}

function objectiveLabel(objectiveType: string): string {
  const labels: Record<string, string> = {
    investigation: '調査',
    elimination: '討伐',
    rescue: '救出',
    escort: '護衛',
    retrieval: '回収',
    survey: '測量',
  }
  return labels[objectiveType] ?? objectiveType
}
