import {
  getNextTierThreshold,
  getReputationTier,
  getReputationTierLabel,
} from '../../core/tavern/campaign/reputation.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'

export interface CampaignHeaderProps {
  campaign: TavernCampaignState
}

export function CampaignHeader({ campaign }: CampaignHeaderProps) {
  const tier = getReputationTier(campaign.reputation)
  const tierLabel = getReputationTierLabel(tier)
  const nextThreshold = getNextTierThreshold(campaign.reputation)

  return (
    <div className="campaign-header" data-testid="campaign-header">
      <div className="campaign-title">
        <h2>酒場キャンペーン — Day {campaign.dayNumber}</h2>
        <span className="campaign-seed">Seed: {campaign.seed}</span>
      </div>
      <div className="reputation-bar" data-testid="reputation-bar">
        <div className="reputation-label">
          <span>酒場評判</span>
          <span>
            {campaign.reputation} / 100 「{tierLabel}」
          </span>
        </div>
        <progress max={100} value={campaign.reputation} />
        {nextThreshold !== null && (
          <span className="reputation-next">
            次のTierまで {nextThreshold - campaign.reputation}
          </span>
        )}
      </div>
    </div>
  )
}
