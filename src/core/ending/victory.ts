import { NATIONAL_THREAT_IDS } from '../mainQuest/threats.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

/**
 * The single, authoritative Victory selector (Phase 9.9 item 3) — pure,
 * derived strictly from canonical Main Quest state, never from Narrative or
 * Presentation lifecycle. Checks each Threat's OWN canonical `status`
 * individually (never a bare defeated-count) so a corrupted/tampered save
 * with the right count but the wrong Threats cannot read as victorious.
 */
export function isCampaignVictoryAchieved(
  campaign: TavernCampaignState,
): boolean {
  const { threats, playerCurseStatus } = campaign.mainQuest
  const allNationalThreatsDefeated = NATIONAL_THREAT_IDS.every(
    (id) => threats[id].status === 'defeated',
  )
  const nosferatuDefeated = threats.nosferatu.status === 'defeated'
  return (
    allNationalThreatsDefeated &&
    nosferatuDefeated &&
    playerCurseStatus === 'lifted'
  )
}
