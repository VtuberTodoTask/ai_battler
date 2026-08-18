import {
  deriveTavernRank,
  getNextTavernRankThreshold,
  isMaxTavernRank,
} from '../../core/tavern/campaign/reputation.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'

export interface CampaignHeaderProps {
  campaign: TavernCampaignState
}

export function CampaignHeader({ campaign }: CampaignHeaderProps) {
  const { score, peakScore } = campaign.reputation
  const tavernRank = deriveTavernRank(peakScore)
  const nextThreshold = getNextTavernRankThreshold(tavernRank)

  return (
    <div className="campaign-header" data-testid="campaign-header">
      <div className="campaign-title">
        <h2>酒場キャンペーン — Day {campaign.dayNumber}</h2>
        <span className="campaign-seed">Seed: {campaign.seed}</span>
      </div>
      <div className="reputation-bar" data-testid="reputation-bar">
        <div className="reputation-label">
          <span>酒場ランク {tavernRank}</span>
          <span>評判 {score}</span>
        </div>
        {!isMaxTavernRank(tavernRank) && nextThreshold !== null && (
          <span className="reputation-next">
            次のランクまで 評判 {nextThreshold}
          </span>
        )}
      </div>
    </div>
  )
}
