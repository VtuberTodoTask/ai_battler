import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { evaluateMainQuestDispatch } from '../../../core/mainQuest/dispatch.ts'
import {
  buildMainQuestBattlePlaybackPlan,
  type MainQuestBattlePlaybackPlan,
} from '../../../core/mainQuest/playback.ts'
import {
  MAIN_QUEST_THREAT_DEFINITIONS,
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  isNosferatuUnlocked,
} from '../../../core/mainQuest/threats.ts'
import type {
  MainQuestAttemptRecord,
  MainQuestThreatId,
  MainQuestThreatStatus,
} from '../../../core/mainQuest/types.ts'

export interface MainQuestReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export type MainQuestPresentationStep = 'preBattle' | 'battle' | 'postBattle'

export interface MainQuestSceneInput {
  returnTarget: MainQuestReturnTarget
  /** Mutated in place by MainQuestScene itself to drive the Presentation
   * sequence across pushes/pops of SoundNovel/Battle scenes — never
   * Campaign-persisted (see MainQuestScene's own docs). */
  presentationStep?: MainQuestPresentationStep
}

export function createMainQuestSceneInput(
  returnTarget: MainQuestReturnTarget,
): MainQuestSceneInput {
  return { returnTarget }
}

export interface MainQuestThreatRowViewModel {
  id: MainQuestThreatId
  name: string
  title: string
  status: MainQuestThreatStatus
  statusLabel: string
}

const STATUS_LABELS: Record<MainQuestThreatStatus, string> = {
  locked: '未開放',
  available: '挑戦可能',
  defeated: '撃破済み',
}

export interface MainQuestPartyEligibilityRowViewModel {
  partyId: string
  partyName: string
  rankLabel: string
  rankOk: boolean
  affinityLabel: string
  affinityOk: boolean
  feeLabel: string
  feeOk: boolean
  statusOk: boolean
  eligible: boolean
  blockReasons: string[]
}

export interface MainQuestPendingPresentationViewModel {
  attemptId: string
  threatName: string
  presentationStatus: MainQuestAttemptRecord['presentationStatus']
}

export interface MainQuestLogRowViewModel {
  attemptId: string
  threatName: string
  dayLabel: string
  partyName: string
  resultLabel: string
  feeLabel: string
}

export interface MainQuestViewModel {
  threats: MainQuestThreatRowViewModel[]
  selectedThreatId: MainQuestThreatId | null
  eligibility: MainQuestPartyEligibilityRowViewModel[]
  pending?: MainQuestPendingPresentationViewModel
  log: MainQuestLogRowViewModel[]
  returnTarget: MainQuestReturnTarget
}

function partyName(campaign: TavernCampaignState, partyId: string): string {
  const party =
    campaign.parties.find((p) => p.id === partyId) ??
    campaign.awayParties.find((p) => p.id === partyId) ??
    campaign.retiredParties.find((p) => p.id === partyId)
  return party?.party.name ?? '名称不明のパーティ'
}

export function buildMainQuestViewModel(
  campaign: TavernCampaignState,
  selectedThreatId: MainQuestThreatId | null,
  returnTarget: MainQuestReturnTarget,
): MainQuestViewModel {
  const nosferatuUnlocked = isNosferatuUnlocked(campaign.mainQuest)

  const threats: MainQuestThreatRowViewModel[] =
    MAIN_QUEST_THREAT_DEFINITIONS.map((definition) => {
      const state = campaign.mainQuest.threats[definition.id]
      const status: MainQuestThreatStatus =
        definition.id === 'nosferatu' &&
        !nosferatuUnlocked &&
        state.status !== 'defeated'
          ? 'locked'
          : state.status
      return {
        id: definition.id,
        name: definition.name,
        title: definition.title,
        status,
        statusLabel: STATUS_LABELS[status],
      }
    })

  const eligibility: MainQuestPartyEligibilityRowViewModel[] = []
  if (selectedThreatId) {
    for (const tavernParty of campaign.currentDay.parties) {
      if (tavernParty.availability === 'recovering') continue
      const evaluation = evaluateMainQuestDispatch(
        campaign,
        selectedThreatId,
        tavernParty.id,
      )
      const blockReasons: string[] = []
      if (!evaluation.rankSufficient) blockReasons.push('実力が不足しています')
      if (!evaluation.affinitySufficient)
        blockReasons.push('信頼関係が足りません')
      if (!evaluation.fundsSufficient) blockReasons.push('資金が不足しています')
      if (!evaluation.notAcceptedNormalRequest)
        blockReasons.push('本日は既に他の依頼へ同行しています')
      if (!evaluation.notAlreadyOnMainQuestToday)
        blockReasons.push('本日は既に主依頼へ同行しています')
      if (!evaluation.noMainQuestDispatchedToday)
        blockReasons.push('本日は既に別のパーティが主依頼へ同行しています')

      eligibility.push({
        partyId: tavernParty.id,
        partyName: tavernParty.party.name,
        rankLabel: `${tavernParty.party.rank}級`,
        rankOk: evaluation.rankSufficient,
        affinityLabel: `${evaluation.partyAffinity} / ${evaluation.requiredAffinity}`,
        affinityOk: evaluation.affinitySufficient,
        feeLabel: `${evaluation.fee}`,
        feeOk: evaluation.fundsSufficient,
        statusOk:
          evaluation.threatAvailable &&
          evaluation.partyLifecycleStaying &&
          evaluation.partyPresentToday &&
          evaluation.notRecovering,
        eligible: evaluation.eligible,
        blockReasons,
      })
    }
  }

  const pendingAttemptId = campaign.mainQuest.pendingPresentationAttemptId
  let pending: MainQuestPendingPresentationViewModel | undefined
  if (pendingAttemptId) {
    const attempt = campaign.mainQuest.attempts.find(
      (a) => a.id === pendingAttemptId,
    )
    if (attempt && attempt.presentationStatus !== 'completed') {
      const definition = MAIN_QUEST_THREAT_DEFINITIONS.find(
        (d) => d.id === attempt.threatId,
      )
      pending = {
        attemptId: attempt.id,
        threatName: definition?.name ?? '不明な脅威',
        presentationStatus: attempt.presentationStatus,
      }
    }
  }

  const log: MainQuestLogRowViewModel[] = [...campaign.mainQuest.attempts]
    .sort((a, b) => b.dayNumber - a.dayNumber)
    .map((attempt) => {
      const definition = MAIN_QUEST_THREAT_DEFINITIONS.find(
        (d) => d.id === attempt.threatId,
      )
      const resultLabel = !attempt.result
        ? '結果待ち'
        : attempt.result.monsterDefeated
          ? '勝利'
          : '敗北・撤退'
      return {
        attemptId: attempt.id,
        threatName: definition?.name ?? '不明な脅威',
        dayLabel: `DAY ${attempt.dayNumber}`,
        partyName: partyName(campaign, attempt.partyId),
        resultLabel,
        feeLabel: `${attempt.fee}`,
      }
    })

  return {
    threats,
    selectedThreatId,
    eligibility,
    pending,
    log,
    returnTarget,
  }
}

// --- Battle Scene (Phase 9.8 items 86-107): a pure snapshot + Playback
// Plan for MainQuestBattleScene. HP/MP are presented starting at max — the
// exact pre-battle HP isn't stored anywhere in the Save (only the
// authoritative final state is), so the Presentation layer approximates
// full-health combatants at Battle start. This is a Presentation-layer
// simplification only: the Simulation itself already used each member's
// true HP internally, and the approximation never feeds back into it.

export interface MainQuestBattleSceneInput {
  attemptId: string
  returnTarget: MainQuestReturnTarget
}

export interface MainQuestBattlePartyMemberSnapshot {
  id: string
  name: string
  maxHp: number
  hp: number
  maxMp: number
  mp: number
  alive: boolean
}

export interface MainQuestBattleViewModel {
  attemptId: string
  threatId: MainQuestThreatId
  monsterName: string
  monsterAssetKey: string
  partyMembers: MainQuestBattlePartyMemberSnapshot[]
  plan: MainQuestBattlePlaybackPlan
  returnTarget: MainQuestReturnTarget
}

export function buildMainQuestBattleViewModel(
  campaign: TavernCampaignState,
  attemptId: string,
  returnTarget: MainQuestReturnTarget,
): MainQuestBattleViewModel | null {
  const attempt = campaign.mainQuest.attempts.find((a) => a.id === attemptId)
  if (!attempt || !attempt.battleTrace) return null

  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[attempt.threatId]
  const campaignParty =
    campaign.parties.find((p) => p.id === attempt.partyId) ??
    campaign.awayParties.find((p) => p.id === attempt.partyId) ??
    campaign.retiredParties.find((p) => p.id === attempt.partyId)

  const partyMembers: MainQuestBattlePartyMemberSnapshot[] =
    campaignParty?.party.members.map((member) => ({
      id: member.id,
      name: member.name,
      maxHp: member.maxHp,
      hp: member.maxHp,
      maxMp: member.maxMp,
      mp: member.maxMp,
      alive: true,
    })) ?? []

  const plan = buildMainQuestBattlePlaybackPlan(
    attempt.battleTrace,
    attempt.narrative,
  )

  return {
    attemptId: attempt.id,
    threatId: attempt.threatId,
    monsterName: definition.uniqueMonster.name,
    monsterAssetKey: definition.uniqueMonster.visualProfile.assetKey,
    partyMembers,
    plan,
    returnTarget,
  }
}
