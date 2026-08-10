import type {
  ExpeditionEffect,
  ExpeditionLogEntry,
} from '../expedition/types.ts'
import type {
  ExpeditionNarrativeContext,
  NarrativeMemberSnapshot,
  NarrativeTimelineBeatKind,
  NarrativeTimelinePhase,
} from './types.ts'

export interface NarrativeTimelineBeatDraft {
  phase: NarrativeTimelinePhase
  kind: NarrativeTimelineBeatKind
  text: string
  importance: number
  actorIds?: string[]
  targetIds?: string[]
}

type ExpeditionPhase = ExpeditionLogEntry['phase']

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

const IMPORTANCE_MAP: Record<string, number> = {
  casualty: 95,
  escortTargetDeath: 95,
  rescueTargetDeath: 95,
  rescueFailed: 95,
  retrievalTargetDestroyed: 95,
  retrievalFailed: 95,
  eliminationTargetsAssigned: 90,
  eliminationConfirmation: 85,
  objectiveSummary: 85,
  surveyCompleted: 85,
  surveyFailed: 85,
  rescueReturn: 85,
  retrievalReturned: 85,
  escortDestinationReached: 80,
  escortHandoff: 80,
  escortReturnResult: 80,
  rescueEvacuation: 80,
  rescueBattleExposure: 80,
  escortBattleExposure: 80,
  retrievalBattleExposure: 80,
  surveyReportReturned: 80,
  surveyReportLost: 80,
  retrievalTargetLost: 80,
  retrievalTargetAbandoned: 80,
  summary: 80,
  timeLimit: 85,
  routePlanning: 75,
  rescueTargetReached: 75,
  retrievalAccess: 75,
  surveyReportPrepared: 75,
  firstAid: 65,
  healing: 65,
  rescueSearch: 65,
  rescueStabilization: 70,
  rescueTargetHeal: 70,
  escortDeparture: 65,
  escortRouteProgress: 70,
  escortCare: 70,
  escortTargetHeal: 70,
  retrievalSearch: 65,
  retrievalSecuring: 70,
  retrievalExtraction: 80,
  retrievalCarriersAssigned: 70,
  surveySectorResult: 65,
  surveyAreaAssigned: 70,
  rescueTargetLocated: 70,
  retrievalTargetLocated: 70,
  rescueProtectorAssigned: 60,
  escortProtectorAssigned: 60,
  retrievalProtectorAssigned: 60,
  hazard: 60,
  explore: 55,
  objectiveCheck: 70,
  travel: 55,
  foodShortage: 55,
  noHealer: 60,
  escortTargetAssigned: 70,
  retrievalTargetAssigned: 70,
}

function memberName(
  members: NarrativeMemberSnapshot[],
  id: string | undefined,
): string | undefined {
  if (!id) return undefined
  return members.find((m) => m.id === id)?.name
}

function firstActorName(
  log: ExpeditionLogEntry,
  members: NarrativeMemberSnapshot[],
): string | undefined {
  for (const id of log.actorIds) {
    const name = memberName(members, id)
    if (name) return name
  }
  return undefined
}

function firstTargetName(
  log: ExpeditionLogEntry,
  members: NarrativeMemberSnapshot[],
): string | undefined {
  if (!log.targetIds) return undefined
  for (const id of log.targetIds) {
    const name = memberName(members, id)
    if (name) return name
  }
  return undefined
}

function findEffect(
  log: ExpeditionLogEntry,
  type: string,
  targetId?: string,
): ExpeditionEffect | undefined {
  return log.effects.find(
    (e) =>
      e.type === type && (targetId === undefined || e.targetId === targetId),
  )
}

function effectValue(
  log: ExpeditionLogEntry,
  type: string,
  targetId?: string,
): number | undefined {
  const e = findEffect(log, type, targetId)
  return typeof e?.value === 'number' ? e.value : undefined
}

function objectiveName(
  context: ExpeditionNarrativeContext,
): string | undefined {
  const state = context.state
  if (!state?.objectiveState) return undefined
  const obj = state.objectiveState
  if (
    obj.type === 'rescue' ||
    obj.type === 'escort' ||
    obj.type === 'retrieval'
  ) {
    return obj.targetName
  }
  if (obj.type === 'survey') {
    return obj.areaName
  }
  return undefined
}

function escortDestinationName(
  context: ExpeditionNarrativeContext,
): string | undefined {
  const state = context.state
  if (state?.objectiveState?.type === 'escort') {
    return state.objectiveState.destinationName
  }
  return undefined
}

function objectiveProgressText(progress: number): string {
  if (progress <= 0) return '目的に関する成果を得られなかった'
  if (progress < 40) return '手がかりは得たが、依頼目的は達成できなかった'
  if (progress < 60) return '依頼目的を部分的に達成した'
  if (progress < 100) return '最低限の目的を達成した'
  return '依頼目的を完全に達成した'
}

function addSupplyBeats(
  drafts: NarrativeTimelineBeatDraft[],
  log: ExpeditionLogEntry,
  phase: NarrativeTimelinePhase,
): void {
  for (const e of log.effects) {
    if (e.type !== 'supplyConsume') continue
    const targetId = e.targetId
    let text: string | undefined
    if (targetId === 'medicine') {
      text = '医薬品を使用した'
    } else if (targetId === 'tools') {
      if (log.type === 'surveySectorResult') {
        text = '測量用具を使用した'
      } else if (log.type === 'retrievalSecuring') {
        text = '用具を使用して回収作業を助けた'
      } else {
        text = '用具を使用した'
      }
    } else if (targetId === 'food') {
      text = '食糧を消費した'
    } else {
      text = '物資を消費した'
    }
    if (text) {
      drafts.push({
        phase,
        kind: 'event',
        text,
        importance: 55,
      })
    }
  }
}

function addDamageBeats(
  drafts: NarrativeTimelineBeatDraft[],
  log: ExpeditionLogEntry,
  context: ExpeditionNarrativeContext,
  phase: NarrativeTimelinePhase,
): void {
  const state = context.state
  for (const e of log.effects) {
    if (e.type !== 'hpDamage' || !e.targetId) continue
    if (state?.casualties.includes(e.targetId)) continue
    const name = memberName(context.party.members, e.targetId)
    if (!name) continue
    const hasInjury =
      state?.injuries.some((i) => i.adventurerId === e.targetId) ?? false
    const text = hasInjury ? `${name}は負傷した` : `${name}は被害を受けた`
    drafts.push({
      phase,
      kind: 'event',
      text,
      importance: 85,
      targetIds: [e.targetId],
    })
  }
}

export function projectExpeditionLogToNarrativeBeats(
  log: ExpeditionLogEntry,
  context: ExpeditionNarrativeContext,
): NarrativeTimelineBeatDraft[] {
  const phase = PHASE_MAP[log.phase] ?? 'exploration'
  const importance = IMPORTANCE_MAP[log.type] ?? 55
  const result = log.check?.result
  const actor = firstActorName(log, context.party.members) ?? 'Party'
  const drafts: NarrativeTimelineBeatDraft[] = []

  const push = (
    text: string,
    opts?: {
      kind?: NarrativeTimelineBeatKind
      importance?: number
      actorIds?: string[]
      targetIds?: string[]
    },
  ): void => {
    drafts.push({
      phase,
      kind: opts?.kind ?? 'event',
      text,
      importance: opts?.importance ?? importance,
      actorIds: opts?.actorIds,
      targetIds: opts?.targetIds,
    })
  }

  switch (log.type) {
    case 'routePlanning': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が効率的なルートと補給計画を立てた`)
      } else if (result === 'partialSuccess') {
        push('準備は整ったが、計画に若干の無理があった')
      } else {
        push('出発準備が遅れ、初期士気が低下した')
      }
      break
    }

    case 'foodShortage': {
      push('食糧が不足し、士気が低下した')
      break
    }

    case 'travel': {
      const direction = log.phase === 'return' ? '帰還' : '接近'
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が安全な${direction}経路を確保した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が経路を確保したが、多少の遅延が発生した`)
      } else {
        push(`${actor}が${direction}経路を見失い、迂回した`)
      }
      break
    }

    case 'hazard': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が周囲の危険を事前に察知・回避した`)
      } else {
        push('周囲の危険に遭遇した')
      }
      break
    }

    case 'explore': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が調査対象に関する手がかりを発見した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が断片的な手がかりを得た`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は調査に大きく失敗した`)
      } else {
        push('調査に手間取った')
      }
      break
    }

    case 'objectiveCheck': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が目標となる情報を確認した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が調査を進めた`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は調査に大きく失敗し、時間を失った`)
      } else {
        push(`${actor}は調査の手がかりを得られなかった`)
      }
      break
    }

    case 'timeLimit': {
      push('制限時間を超過した')
      break
    }

    case 'objectiveSummary': {
      const progress = context.state?.objectiveProgress ?? 0
      push(objectiveProgressText(progress), { kind: 'outcome' })
      break
    }

    case 'casualty': {
      const name = firstTargetName(log, context.party.members)
      if (name) {
        push(`${name}は命を落とした`, {
          kind: 'outcome',
          importance: 95,
          targetIds: log.targetIds,
        })
      } else {
        push('一人の冒険者が命を落とした', {
          kind: 'outcome',
          importance: 95,
        })
      }
      break
    }

    case 'firstAid': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が帰還中の負傷者を手当てした`)
      } else {
        push('帰還中の負傷者手当てが不十分だった')
      }
      break
    }

    case 'noHealer': {
      push('手当てが行われなかった')
      break
    }

    case 'healing': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が負傷者の治療を行った`)
      } else {
        push('負傷者の治療は不十分だった')
      }
      break
    }

    case 'summary': {
      push('遠征は決着を迎えた', { kind: 'outcome' })
      break
    }

    case 'eliminationTargetsAssigned': {
      const required = effectValue(log, 'eliminationTargets') ?? 0
      const defeated = effectValue(log, 'eliminationDefeated') ?? 0
      const escaped = effectValue(log, 'eliminationEscaped') ?? 0
      const surviving = effectValue(log, 'eliminationSurviving') ?? 0
      const unknown = effectValue(log, 'eliminationUnknown') ?? 0
      if (required <= 0) break
      const parts: string[] = [`討伐対象として${required}体が指定された`]
      if (defeated > 0) parts.push(`${defeated}体を撃破した`)
      if (escaped > 0) parts.push(`${escaped}体が逃走した`)
      if (surviving > 0) parts.push(`${surviving}体が残っている`)
      if (unknown > 0) parts.push(`${unknown}体の最終状態を確認できなかった`)
      push(parts.join('。'), { kind: 'event', importance: 90 })
      break
    }

    case 'eliminationConfirmation': {
      const completed = effectValue(log, 'eliminationCompleted') === 1
      const confirmed = effectValue(log, 'eliminationConfirmed') ?? 0
      if (completed) {
        push('討伐対象の討伐を確認し、依頼目的を達成した', {
          kind: 'outcome',
          importance: 85,
        })
      } else if (confirmed > 0) {
        push(`討伐を${confirmed}体確認した`)
      } else {
        push('討伐確認は行われなかった')
      }
      break
    }

    case 'rescueTargetLocated': {
      push('救出対象の位置は事前情報から判明していた')
      break
    }

    case 'rescueSearch': {
      if (result === 'criticalSuccess') {
        push(`${actor}が即座に救出対象の位置を特定した`)
      } else if (result === 'success') {
        push(`${actor}が救出対象の位置を特定した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}は救出対象の位置をようやく特定した`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は救出対象の位置を特定できず、大きな時間を失った`)
      } else {
        push(`${actor}は救出対象の位置を特定できなかった`)
      }
      break
    }

    case 'rescueTargetReached': {
      if (result === 'criticalSuccess') {
        push(`${actor}が難なく救出対象のもとへ到達した`)
      } else if (result === 'success') {
        push(`${actor}が救出対象のもとへ到達した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}は救出対象のもとへ到達したが、多少の遅延が生じた`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は救出対象への接近に失敗した`)
      } else {
        push(`${actor}は救出対象のもとへ到達できなかった`)
      }
      break
    }

    case 'rescueProtectorAssigned': {
      push(`${actor}が救出対象の保護担当になった`)
      break
    }

    case 'rescueBattleExposure': {
      const alive = effectValue(log, 'rescueAlive') === 1
      const damage = effectValue(log, 'rescueTargetDamage') ?? 0
      if (!alive) {
        push(`${actor}は救出対象を守れなかった`, { importance: 95 })
      } else if (damage > 0) {
        if (result === 'partialSuccess') {
          push(`${actor}が救出対象を守ったが、被害が出た`)
        } else if (result === 'criticalFailure') {
          push(`${actor}は救出対象を守れず、大きな被害を負わせた`)
        } else {
          push(`${actor}は救出対象を守りきれず、被害が出た`)
        }
      } else {
        push(`${actor}が救出対象を戦闘から守り切った`)
      }
      break
    }

    case 'rescueStabilization': {
      const alive = effectValue(log, 'rescueAlive') === 1
      const stabilized = effectValue(log, 'rescueStabilized') === 1
      const damage = effectValue(log, 'rescueTargetDamage') ?? 0
      if (!alive) {
        push('救出対象は手当て中に命を失った', {
          kind: 'outcome',
          importance: 95,
        })
      } else if (stabilized) {
        if (result === 'criticalSuccess' || result === 'success') {
          push(`${actor}が救出対象を安定化させた`)
        } else {
          push(`${actor}が救出対象を一時的に安定化させた`)
        }
      } else if (damage > 0) {
        push(`${actor}は救出対象の手当てを誤り、被害が出た`)
      } else {
        push(`${actor}は救出対象の状態を安定化できなかった`)
      }
      break
    }

    case 'rescueEvacuation': {
      const alive = effectValue(log, 'rescueAlive') === 1
      const evacuated = effectValue(log, 'rescueEvacuated') === 1
      const damage = effectValue(log, 'rescueTargetDamage') ?? 0
      const returnTimeBonus = effectValue(log, 'returnTimeBonus') ?? 0
      if (!alive) {
        push('救出対象は搬出中に命を失った', {
          kind: 'outcome',
          importance: 95,
        })
      } else if (evacuated) {
        if (damage > 0) {
          push(`${actor}が救出対象を搬出したが、被害が出た`)
        } else {
          push(`${actor}が救出対象を危険地帯から搬出した`)
        }
      } else if (damage > 0) {
        push(`${actor}は搬出に失敗し、救出対象に被害が出た`)
      } else {
        push(`${actor}は救出対象を搬出できなかった`)
      }
      if (returnTimeBonus > 0) {
        push('搬出に手間取り、帰還に余分な時間がかかる', { importance: 55 })
      }
      break
    }

    case 'rescueReturn': {
      const returned = effectValue(log, 'rescueReturned') === 1
      const alive = effectValue(log, 'rescueAlive') === 1
      const abandoned = effectValue(log, 'rescueAbandoned') === 1
      if (returned && !alive) {
        push('救出対象の遺体を拠点まで運んだ')
      } else if (returned) {
        push('救出対象を拠点まで連れ帰った')
      } else if (abandoned) {
        push('救出対象を置き去りにした')
      }
      break
    }

    case 'rescueFailed': {
      push('救出対象は救出前に息を引き取った', {
        kind: 'outcome',
        importance: 95,
      })
      break
    }

    case 'rescueTargetDeath': {
      push('救出対象は命を落とした', { kind: 'outcome', importance: 95 })
      break
    }

    case 'rescueTargetHeal': {
      push('救出対象の状態を手当てした')
      break
    }

    case 'escortTargetAssigned': {
      const targetName = objectiveName(context)
      const destination = escortDestinationName(context)
      const prefix =
        targetName && destination
          ? `護衛対象「${targetName}」を「${destination}」まで`
          : '護衛対象を'
      push(`${prefix}護衛する任務を開始した`)
      break
    }

    case 'escortDeparture': {
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が護衛対象との行動を調整した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が護衛対象との行動を何とか調整した`)
      } else {
        push(`${actor}は護衛対象との行動調整に失敗した`)
      }
      break
    }

    case 'escortRouteProgress': {
      const alive = effectValue(log, 'escortAlive') === 1
      const damage = effectValue(log, 'escortTargetDamage') ?? 0
      if (!alive) {
        push('護衛対象に重大な被害が出た', { kind: 'outcome', importance: 95 })
      } else if (result === 'criticalSuccess') {
        push(`${actor}が移動経路を素早く切り開いた`)
      } else if (result === 'success') {
        push(`${actor}が移動経路を切り開いた`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が移動経路を何とか進んだ`)
      } else if (result === 'criticalFailure') {
        push(`${actor}が移動経路を大きく誤り、護衛対象に大きな被害が出た`)
      } else if (damage > 0) {
        push(`${actor}が道を大きく外れ、護衛対象に被害が出た`)
      } else {
        push(`${actor}が移動に苦戦した`)
      }
      break
    }

    case 'escortProtectorAssigned': {
      push(`${actor}が護衛対象の保護担当になった`)
      break
    }

    case 'escortBattleExposure': {
      const alive = effectValue(log, 'escortAlive') === 1
      const damage = effectValue(log, 'escortBattleExposureDamage') ?? 0
      if (!alive) {
        push(`${actor}は護衛対象を守れなかった`, { importance: 95 })
      } else if (damage > 0) {
        if (result === 'partialSuccess') {
          push(`${actor}が護衛対象を守ったが、被害が出た`)
        } else if (result === 'criticalFailure') {
          push(`${actor}は護衛対象を守れず、大きな被害を負わせた`)
        } else {
          push(`${actor}は護衛対象を守りきれず、被害が出た`)
        }
      } else {
        push(`${actor}が護衛対象を戦闘から守り切った`)
      }
      break
    }

    case 'escortTargetDeath': {
      push('護衛対象は命を失った', { kind: 'outcome', importance: 95 })
      break
    }

    case 'escortTargetHeal': {
      push('護衛対象の状態を手当てした')
      break
    }

    case 'escortCare': {
      const alive = effectValue(log, 'escortAlive') === 1
      const careDamage = effectValue(log, 'escortCareDamage') ?? 0
      if (!alive) {
        push('護衛対象は手当て中に命を失った', {
          kind: 'outcome',
          importance: 95,
        })
      } else if (careDamage > 0) {
        push(`${actor}は護衛対象の手当てを誤り、被害が出た`)
      } else if (result === 'criticalSuccess') {
        push(`${actor}が護衛対象の傷を完全に手当てした`)
      } else if (result === 'success') {
        push(`${actor}が護衛対象の傷を手当てした`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が護衛対象の傷を一時的に手当てした`)
      } else {
        push(`${actor}は護衛対象の手当てに失敗した`)
      }
      break
    }

    case 'escortHandoff': {
      if (!log.check) {
        push('護衛対象は目的地へ到着し、引き渡し手続きなしで護衛完了となった', {
          kind: 'outcome',
          importance: 85,
        })
      } else if (
        result === 'criticalSuccess' ||
        result === 'success' ||
        effectValue(log, 'escortHandoffStatus') === 2
      ) {
        push(`${actor}が目的地で引き渡しを完了した`, { kind: 'outcome' })
      } else if (
        result === 'partialSuccess' ||
        effectValue(log, 'escortHandoffStatus') === 1
      ) {
        push(`${actor}は目的地へ到着したが、正式な引き渡し手続きが保留となった`)
      } else {
        push(`${actor}は目的地での引き渡しに失敗した`)
      }
      break
    }

    case 'escortDestinationReached': {
      push('護衛対象は目的地へ到着した', { kind: 'outcome', importance: 80 })
      break
    }

    case 'escortReturnResult': {
      if (effectValue(log, 'escortReturnedToOrigin') === 1) {
        push('護衛対象を出発地点まで連れ戻した', { kind: 'return' })
      } else if (effectValue(log, 'escortStranded') === 1) {
        push('護衛対象は出発地点へ戻ることができなかった')
      }
      break
    }

    case 'retrievalTargetAssigned': {
      const target = objectiveName(context) ?? '回収対象'
      push(`${target}の回収依頼を引き受けた`)
      break
    }

    case 'retrievalSearch': {
      if (result === 'criticalSuccess') {
        push(`${actor}が即座に回収対象の位置を特定した`)
      } else if (result === 'success') {
        push(`${actor}が回収対象の位置を特定した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}は回収対象の位置をようやく特定した`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は回収対象の位置を特定できず、大きな時間を失った`)
      } else {
        push(`${actor}は回収対象の位置を特定できなかった`)
      }
      break
    }

    case 'retrievalTargetLocated': {
      push('回収対象の位置は事前情報から判明していた')
      break
    }

    case 'retrievalAccess': {
      if (result === 'criticalSuccess') {
        push(`${actor}が難なく回収対象のもとへ到達した`)
      } else if (result === 'success') {
        push(`${actor}が回収対象のもとへ到達した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}は回収対象のもとへ到達したが、多少の遅延が生じた`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は回収対象への接近に失敗した`)
      } else {
        push(`${actor}は回収対象のもとへ到達できなかった`)
      }
      break
    }

    case 'retrievalProtectorAssigned': {
      push(`${actor}が回収対象の保護担当になった`)
      break
    }

    case 'retrievalBattleExposure': {
      const integrity = effectValue(log, 'retrievalIntegrity') ?? 0
      const damage = effectValue(log, 'retrievalDamage') ?? 0
      if (integrity === 0 && damage > 0) {
        push('回収対象に大きな損傷が出た', { importance: 95 })
      } else if (damage > 0) {
        if (result === 'partialSuccess') {
          push(`${actor}が回収対象を守ったが、損傷が出た`)
        } else if (result === 'criticalFailure') {
          push(`${actor}は回収対象を守れず、大きな損傷を与えた`)
        } else {
          push(`${actor}は回収対象を守りきれず、損傷が出た`)
        }
      } else {
        push(`${actor}が回収対象を戦闘から守り切った`)
      }
      break
    }

    case 'retrievalSecuring': {
      const integrity = effectValue(log, 'retrievalIntegrity') ?? 0
      const damage = effectValue(log, 'retrievalDamage') ?? 0
      const secured = effectValue(log, 'retrievalSecured') === 1
      const protectedFor =
        effectValue(log, 'retrievalProtectedForTransport') === 1
      if (integrity === 0 && damage > 0) {
        push('回収対象に大きな損傷が出た', { importance: 95 })
      } else if (secured && protectedFor && damage === 0) {
        push(`${actor}が回収対象を確保し、運搬可能な状態にした`)
      } else if (secured) {
        push(`${actor}が回収対象を確保した`)
      } else if (damage > 0) {
        push(`${actor}は回収対象の確保に失敗し、損傷を与えた`)
      } else {
        push(`${actor}は回収対象を確保できなかった`)
      }
      break
    }

    case 'retrievalTargetDestroyed': {
      push('回収対象は破壊された', { kind: 'outcome', importance: 95 })
      break
    }

    case 'retrievalCarriersAssigned': {
      const carrierCount = effectValue(log, 'retrievalCarrierCount') ?? 0
      if (carrierCount > 0) {
        push('数人を回収対象の運搬担当に指定した')
      } else {
        push('回収対象を運搬できるだけの人数が確保できなかった')
      }
      break
    }

    case 'retrievalExtraction': {
      const integrity = effectValue(log, 'retrievalIntegrity') ?? 0
      const extracted = effectValue(log, 'retrievalExtracted') === 1
      const damage = effectValue(log, 'retrievalDamage') ?? 0
      if (integrity === 0 && damage > 0) {
        push('回収対象に大きな損傷が出た', { importance: 95 })
      } else if (extracted) {
        if (damage > 0) {
          push(`${actor}が回収対象を搬出したが、損傷を受けた`)
        } else {
          push(`${actor}が回収対象を危険地帯から搬出した`)
        }
      } else if (damage > 0) {
        push(`${actor}は回収対象の搬出に失敗し、損傷を与えた`)
      } else {
        push(`${actor}は回収対象を搬出できなかった`)
      }
      break
    }

    case 'retrievalReturned': {
      push('回収対象を酒場まで持ち帰った', { kind: 'return' })
      break
    }

    case 'retrievalTargetLost': {
      push('回収対象の行方がわからなくなった')
      break
    }

    case 'retrievalTargetAbandoned': {
      push('回収対象を現場に置き去りにした')
      break
    }

    case 'retrievalFailed': {
      push('回収対象は確保前に破壊された', { kind: 'outcome', importance: 95 })
      break
    }

    case 'surveyAreaAssigned': {
      const areaName = objectiveName(context) ?? '指定区域'
      push(`「${areaName}」の数区画を測量する任務を開始した`)
      break
    }

    case 'surveySectorResult': {
      const sectorResult = log.effects.find(
        (e) => e.type === 'surveySectorResult',
      )
      const meta = sectorResult?.metadata as
        { sectorName?: string; surveyed?: boolean } | undefined
      const sectorName = meta?.sectorName ?? '区画'
      if (result === 'criticalSuccess' || result === 'success') {
        push(`${actor}が${sectorName}の測量を完了した`)
      } else if (result === 'partialSuccess') {
        push(`${actor}が${sectorName}について不完全ながら測量記録を得た`)
      } else if (result === 'criticalFailure') {
        push(`${actor}は${sectorName}の測量に大きく失敗した`)
      } else {
        push(`${actor}は${sectorName}の測量を完了できなかった`)
      }
      break
    }

    case 'surveyReportPrepared': {
      if (effectValue(log, 'surveyReportPrepared') === 1) {
        push('測量記録を整理し、持ち帰る準備を行った')
      } else {
        push('測量記録を作成できなかった')
      }
      break
    }

    case 'surveyReportReturned': {
      push('測量記録を酒場まで持ち帰った', { kind: 'return' })
      break
    }

    case 'surveyReportLost': {
      push('測量記録を持ち帰ったことを確認できなかった')
      break
    }

    case 'surveyCompleted': {
      push('依頼の測量目標を達成した', { kind: 'outcome' })
      break
    }

    case 'surveyFailed': {
      push('依頼の測量目標は達成できなかった', { kind: 'outcome' })
      break
    }

    case 'diagnostic':
    case 'battleSummary':
      // Diagnostic logs are intentionally omitted; battleSummary is handled by buildBattleTimeline.
      break

    default:
      // Unknown log types default to no beats per Phase 7.1.1 spec.
      break
  }

  addSupplyBeats(drafts, log, phase)
  addDamageBeats(drafts, log, context, phase)
  return drafts
}
