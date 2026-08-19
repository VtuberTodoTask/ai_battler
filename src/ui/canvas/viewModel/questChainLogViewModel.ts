import type {
  QuestChainState,
  QuestChainStatus,
  QuestChainStepState,
  TavernCampaignState,
} from '../../../core/tavern/campaign/types.ts'
import { getQuestChainDefinition } from '../../../core/tavern/campaign/questChains.ts'
import { OUTCOME_LABELS } from '../../expedition/labels.ts'

export interface QuestChainLogReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface QuestChainLogSceneInput {
  returnTarget: QuestChainLogReturnTarget
}

export interface QuestChainLogStepRowViewModel {
  progressLabel: string
  dayLabel: string
  title: string
  statusLabel: string
}

export interface QuestChainLogRowViewModel {
  /** UI-local row identity only — never rendered, never a raw chain/save ID. */
  rowId: string
  definitionTitle: string
  statusLabel: string
  startedDayLabel: string
  progressLabel: string
  steps: QuestChainLogStepRowViewModel[]
}

export interface QuestChainLogViewModel {
  rows: QuestChainLogRowViewModel[]
  returnTarget: QuestChainLogReturnTarget
}

const STATUS_LABELS: Record<QuestChainStatus, string> = {
  active: '進行中',
  completed: '完了',
  failed: '失敗',
  abandoned: '見送り',
}

export function questChainStatusLabel(status: QuestChainStatus): string {
  return STATUS_LABELS[status] ?? status
}

const FALLBACK_DEFINITION_TITLE = '連続依頼（記録を確認できません）'

function buildStepRow(
  step: QuestChainStepState,
  totalSteps: number,
): QuestChainLogStepRowViewModel {
  const progressLabel = `${step.stepNumber} / ${totalSteps}`
  const dayLabel = `DAY ${step.scheduledDay}`

  if (step.status === 'scheduled') {
    return { progressLabel, dayLabel, title: '', statusLabel: '掲示中' }
  }
  if (step.status === 'notBrokered') {
    return {
      progressLabel,
      dayLabel,
      title: step.request.title,
      statusLabel: '見送り',
    }
  }
  return {
    progressLabel,
    dayLabel,
    title: step.request.title,
    statusLabel: step.outcome ? OUTCOME_LABELS[step.outcome] : '',
  }
}

function buildRow(
  chain: QuestChainState,
  index: number,
): QuestChainLogRowViewModel {
  const definition = getQuestChainDefinition(chain.definitionId)
  const resolvedSteps = chain.steps.filter(
    (s) => s.status !== 'scheduled',
  ).length
  const totalSteps =
    chain.steps.length > 0 ? chain.steps[chain.steps.length - 1].stepNumber : 0

  return {
    rowId: `chain-row-${index}`,
    definitionTitle: definition?.title ?? FALLBACK_DEFINITION_TITLE,
    statusLabel: questChainStatusLabel(chain.status),
    startedDayLabel: `DAY ${chain.startedDay}`,
    progressLabel: `${resolvedSteps} / ${Math.max(totalSteps, resolvedSteps)}`,
    steps: chain.steps.map((s) =>
      buildStepRow(s, Math.max(totalSteps, s.stepNumber)),
    ),
  }
}

export function buildQuestChainLogViewModel(
  campaign: TavernCampaignState,
  returnTarget: QuestChainLogReturnTarget,
): QuestChainLogViewModel {
  const sorted = [...campaign.questChains].sort(
    (a, b) => b.startedDay - a.startedDay,
  )
  return {
    rows: sorted.map((chain, index) => buildRow(chain, index)),
    returnTarget,
  }
}

export function createQuestChainLogSceneInput(
  returnTarget: QuestChainLogReturnTarget,
): QuestChainLogSceneInput {
  return { returnTarget }
}
