import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import {
  deriveTavernRank,
  tavernRankLabel,
} from '../../../core/tavern/campaign/reputation.ts'
import type { TavernParty } from '../../../core/tavern/types.ts'

export interface PartyListItemViewModel {
  id: string
  name: string
  memberNames: string[]
  statusLabel: string
  unreadEventCount: number
}

export interface GameUiViewModel {
  day: number
  reputation: number
  reputationLabel: string
  parties: PartyListItemViewModel[]
}

export function buildPartyListItemViewModel(
  party: TavernParty,
): PartyListItemViewModel {
  const memberNames = party.party.members.map((m) => m.name)

  let statusLabel = '滞在中'
  if (party.availability === 'recovering') {
    statusLabel = `回復中（残り${party.recoveryDaysRemaining ?? 0}日）`
  } else if (party.acceptedRequestId) {
    statusLabel = '依頼受諾済み'
  }

  return {
    id: party.id,
    name: party.party.name,
    memberNames,
    statusLabel,
    unreadEventCount:
      party.downtimeEvents?.filter(
        (event) => event.narrativeStatus !== 'viewed',
      ).length ?? 0,
  }
}

export function buildGameUiViewModel(
  campaign: TavernCampaignState,
): GameUiViewModel {
  return {
    day: campaign.dayNumber,
    reputation: campaign.reputation.score,
    reputationLabel: tavernRankLabel(
      deriveTavernRank(campaign.reputation.peakScore),
    ),
    parties: campaign.currentDay.parties.map((p) =>
      buildPartyListItemViewModel(p),
    ),
  }
}
