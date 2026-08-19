import type {
  CampaignParty,
  TavernCampaignState,
} from '../../../core/tavern/campaign/types.ts'
import { lifecycleStatusLabel } from './characterLabels.ts'

export interface VisitorRegistryReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface VisitorRegistrySceneInput {
  returnTarget: VisitorRegistryReturnTarget
}

export interface VisitorRegistryRowViewModel {
  id: string
  name: string
  statusLabel: string
  visitCountLabel: string
  lastArrivalDayLabel: string
}

export interface VisitorRegistryViewModel {
  rows: VisitorRegistryRowViewModel[]
  returnTarget: VisitorRegistryReturnTarget
}

const STATUS_ORDER = { staying: 0, away: 1, retired: 2 } as const

function buildRow(party: CampaignParty): VisitorRegistryRowViewModel {
  return {
    id: party.id,
    name: party.party.name,
    statusLabel: lifecycleStatusLabel(party.lifecycle.status),
    visitCountLabel: `来訪回数 ${party.lifecycle.visitCount}回`,
    lastArrivalDayLabel: `最終来訪 DAY ${party.arrivalDay}`,
  }
}

export function buildVisitorRegistryViewModel(
  campaign: TavernCampaignState,
  returnTarget: VisitorRegistryReturnTarget,
): VisitorRegistryViewModel {
  const all = [
    ...campaign.parties,
    ...campaign.awayParties,
    ...campaign.retiredParties,
  ]

  const sorted = [...all].sort((a, b) => {
    const statusDelta =
      STATUS_ORDER[a.lifecycle.status] - STATUS_ORDER[b.lifecycle.status]
    if (statusDelta !== 0) return statusDelta
    return b.arrivalDay - a.arrivalDay
  })

  return {
    rows: sorted.map(buildRow),
    returnTarget,
  }
}

export function createVisitorRegistrySceneInput(
  returnTarget: VisitorRegistryReturnTarget,
): VisitorRegistrySceneInput {
  return { returnTarget }
}
