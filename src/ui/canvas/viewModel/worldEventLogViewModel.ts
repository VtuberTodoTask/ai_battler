import type {
  TavernCampaignState,
  WorldEventState,
  WorldEventStatus,
} from '../../../core/tavern/campaign/types.ts'
import {
  WORLD_EVENT_CONFIG,
  getWorldEventDefinition,
} from '../../../core/tavern/campaign/worldEvents.ts'

export interface WorldEventLogReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface WorldEventLogSceneInput {
  returnTarget: WorldEventLogReturnTarget
}

export interface WorldEventLogRowViewModel {
  /** UI-local row identity only — never rendered, never a raw event/save ID. */
  rowId: string
  eventTitle: string
  description: string
  statusLabel: string
  startedDayLabel: string
  endedLabel?: string
  progressLabel: string
  periodLabel: string
}

export interface WorldEventLogViewModel {
  rows: WorldEventLogRowViewModel[]
  returnTarget: WorldEventLogReturnTarget
}

const STATUS_LABELS: Record<WorldEventStatus, string> = {
  active: '発生中',
  contained: '収束',
  unresolved: '対応未達',
}

export function worldEventStatusLabel(status: WorldEventStatus): string {
  return STATUS_LABELS[status] ?? status
}

const FALLBACK_EVENT_TITLE = '世界情勢（詳細を確認できません）'

function buildRow(
  event: WorldEventState,
  index: number,
): WorldEventLogRowViewModel {
  const definition = getWorldEventDefinition(event.definitionId)
  const eventTitle = definition?.title ?? FALLBACK_EVENT_TITLE
  const description = definition?.description ?? ''

  let endedLabel: string | undefined
  if (event.status === 'contained' && event.endedDay !== undefined) {
    endedLabel = `DAY ${event.endedDay} 収束`
  } else if (event.status === 'unresolved' && event.endedDay !== undefined) {
    endedLabel = `DAY ${event.endedDay} 対応期間終了`
  }

  return {
    rowId: `world-event-row-${index}`,
    eventTitle,
    description,
    statusLabel: worldEventStatusLabel(event.status),
    startedDayLabel: `DAY ${event.startedDay} 発生`,
    endedLabel,
    progressLabel: `${event.responsePoints} / ${WORLD_EVENT_CONFIG.responseTarget}`,
    periodLabel: `DAY ${event.startedDay} ～ DAY ${event.plannedEndDay}`,
  }
}

/** Active event first, then by endedDay descending (most recently ended
 * first) — matches how players naturally think about "what's happening
 * now" vs. "history". */
export function buildWorldEventLogViewModel(
  campaign: TavernCampaignState,
  returnTarget: WorldEventLogReturnTarget,
): WorldEventLogViewModel {
  const sorted = [...campaign.worldEvents].sort((a, b) => {
    const aActive = a.status === 'active'
    const bActive = b.status === 'active'
    if (aActive !== bActive) return aActive ? -1 : 1
    return (b.endedDay ?? 0) - (a.endedDay ?? 0)
  })
  return {
    rows: sorted.map((event, index) => buildRow(event, index)),
    returnTarget,
  }
}

export function createWorldEventLogSceneInput(
  returnTarget: WorldEventLogReturnTarget,
): WorldEventLogSceneInput {
  return { returnTarget }
}
