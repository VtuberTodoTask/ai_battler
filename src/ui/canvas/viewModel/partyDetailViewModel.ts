import type {
  Adventurer,
  AdventurerRole,
  BaseStats,
} from '../../../core/models/types.ts'
import type { CharacterRelationship } from '../../../core/narrative/types.ts'
import { downtimeEventSummary } from '../../../core/narrative/downtime.ts'
import { milestoneSummary } from '../../../core/narrative/milestones.ts'
import type {
  TavernCampaignState,
  CampaignParty,
} from '../../../core/tavern/campaign/types.ts'
import type { TavernParty } from '../../../core/tavern/types.ts'
import { isUnresolvedInjury } from '../../../core/expedition/injuries.ts'
import { OUTCOME_LABELS } from '../../expedition/labels.ts'
import {
  countryLabel,
  genderLabel,
  speciesLabel,
} from '../../../core/identity/labels.ts'
import { COUNTRY_WORLD_PROFILES } from '../../../core/identity/worldData.ts'
import { buildExpeditionReportId } from './expeditionReportViewModel.ts'

export interface PartyDetailReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface PartyDetailSceneInput {
  partyId: string
  initialCharacterId?: string
  returnTarget: PartyDetailReturnTarget
}

export interface PartyDetailHeaderViewModel {
  id: string
  name: string
  rankLabel: string
  statusLabel: string
  memberCount: number
  stayLabel?: string
  currentQuestLabel?: string
}

export interface PartyMemberListItemViewModel {
  id: string
  name: string
  roleLabel: string
  conditionLabel: string
  selected: boolean
}

export interface CharacterAbilityViewModel {
  name: string
  value: number
}

export interface CharacterConditionInjuryViewModel {
  type: string
  cause?: string
}

export interface CharacterConditionViewModel {
  status: string
  hp: string
  mp: string
  morale: string
  injuries: CharacterConditionInjuryViewModel[]
  recoveryDaysRemaining?: number
}

export interface CharacterPersonalityViewModel {
  lines: string[]
}

export interface CharacterRelationshipMemoryViewModel {
  day?: number
  summary: string
}

export interface CharacterRelationshipViewModel {
  targetId: string
  targetName: string
  label: string
  sharedExpeditions: number
  recentMemories: CharacterRelationshipMemoryViewModel[]
  milestones: { day: number; label: string }[]
}

export interface CharacterRecentEventViewModel {
  day?: number
  summary: string
}

export interface CharacterExpeditionHistoryViewModel {
  day: number
  title: string
  outcomeLabel: string
  reportId?: string
}

export interface CharacterDetailViewModel {
  id: string
  name: string
  speciesId: string
  speciesLabel: string
  countryLabel: string
  countrySummary: string
  genderLabel: string
  roleLabel: string
  abilities: CharacterAbilityViewModel[]
  condition: CharacterConditionViewModel
  personality: CharacterPersonalityViewModel
  relationships: CharacterRelationshipViewModel[]
  recentEvents: CharacterRecentEventViewModel[]
  expeditions: CharacterExpeditionHistoryViewModel[]
}

export interface PartyDetailSceneViewModel {
  party: PartyDetailHeaderViewModel
  members: PartyMemberListItemViewModel[]
  selectedCharacter?: CharacterDetailViewModel
  emptyMessage?: string
}

const ROLE_LABELS: Record<AdventurerRole, string> = {
  vanguard: '前衛',
  guardian: '護衛',
  scout: '偵察',
  ranger: '射手',
  mage: '魔術師',
  healer: '治療師',
  support: '支援',
}

const INJURY_TYPE_LABELS: Record<'light' | 'serious', string> = {
  light: '軽傷',
  serious: '重症',
}

const STAT_ORDER: (keyof BaseStats)[] = [
  'str',
  'con',
  'dex',
  'int',
  'per',
  'wil',
  'soc',
]
const STAT_LABELS: Record<keyof BaseStats, string> = {
  str: 'STR',
  con: 'CON',
  dex: 'DEX',
  int: 'INT',
  per: 'PER',
  wil: 'WIL',
  soc: 'SOC',
}

function countrySummaryText(countryId: string | undefined): string {
  if (!countryId) return '出身：記録なし'
  const profile =
    COUNTRY_WORLD_PROFILES[countryId as keyof typeof COUNTRY_WORLD_PROFILES]
  if (!profile) return `出身：${countryId}`
  const values = profile.culturalValues.slice(0, 3).join('・')
  const history = profile.historicalContext[0] ?? ''
  const parts = [profile.nameJa, history, values].filter((s) => s.length > 0)
  return parts.join(' / ')
}

function roleLabel(role: AdventurerRole | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role
}

function memberStatusText(
  member: Adventurer,
  party: CampaignParty,
  dayNumber: number,
): string {
  const incapacitated = party.condition.incapacitatedIds.includes(member.id)
  if (incapacitated && member.currentHp <= 0) {
    return '死亡'
  }

  if (
    party.recoveringThroughDay !== undefined &&
    dayNumber <= party.recoveringThroughDay
  ) {
    const remaining = Math.max(0, party.recoveringThroughDay - dayNumber)
    return `療養中（あと${remaining}日）`
  }

  const activeInjuries = party.condition.injuries.filter(
    (i) => i.adventurerId === member.id && isUnresolvedInjury(i),
  )
  if (activeInjuries.length > 0) {
    const types = activeInjuries.map(
      (i) => INJURY_TYPE_LABELS[i.type] ?? i.type,
    )
    return `負傷：${types.join('・')}`
  }

  if (member.statusEffects.length > 0) {
    const names = member.statusEffects.map((e) => e.type).join('・')
    return `状態：${names}`
  }

  return '健康'
}

function memberConditionLabel(
  member: Adventurer,
  party: CampaignParty,
  dayNumber: number,
): string {
  const status = memberStatusText(member, party, dayNumber)
  return `${status} / HP ${member.currentHp}/${member.maxHp} / MP ${member.currentMp}/${member.maxMp}`
}

function formatPersonality(profile: Adventurer['narrativeProfile']): string[] {
  if (!profile) {
    return ['特筆すべき人物傾向は記録されていない']
  }
  const lines: string[] = []
  if (profile.temperament) lines.push(`気質：${profile.temperament}`)
  if (profile.socialStyle) lines.push(`対人：${profile.socialStyle}`)
  if (profile.values && profile.values.length > 0) {
    lines.push(`重視：${profile.values.join('・')}`)
  }
  if (profile.flaws && profile.flaws.length > 0) {
    lines.push(`欠点：${profile.flaws.join('・')}`)
  }
  if (profile.fears && profile.fears.length > 0) {
    lines.push(`恐れ：${profile.fears.join('・')}`)
  }
  if (profile.habits && profile.habits.length > 0) {
    lines.push(`癖：${profile.habits.join('・')}`)
  }
  if (profile.speechStyle) lines.push(`口調：${profile.speechStyle}`)
  if (profile.beliefs && profile.beliefs.length > 0) {
    lines.push(`信念：${profile.beliefs.join('・')}`)
  }
  if (profile.attitudes && profile.attitudes.length > 0) {
    lines.push(`文化的態度：${profile.attitudes.join('；')}`)
  }
  if (profile.contradictions && profile.contradictions.length > 0) {
    const c = profile.contradictions[0]
    lines.push(`矛盾：${c.sideA}／${c.sideB}`)
  }

  if (lines.length === 0) {
    return ['特筆すべき人物傾向は記録されていない']
  }
  return lines
}

function relationshipLabel(rel: CharacterRelationship | undefined): string {
  if (!rel) return 'まだ特筆すべき関係はない'
  const parts: string[] = []
  if (rel.affinity >= 60) parts.push('親密')
  else if (rel.affinity <= 40) parts.push('一定の距離がある')
  if (rel.trust >= 60) parts.push('強く信頼している')
  else if (rel.trust <= 40) parts.push('信頼が薄い')
  if (rel.respect >= 60) parts.push('尊敬している')
  if (rel.tension >= 60) parts.push('意見が衝突しやすい')
  if (parts.length === 0) return 'まだ特筆すべき関係はない'
  return parts.join('・')
}

function memberNameMap(party: CampaignParty): Map<string, string> {
  return new Map(party.party.members.map((m) => [m.id, m.name]))
}

function buildCharacterInjuries(
  member: Adventurer,
  party: CampaignParty,
): CharacterConditionInjuryViewModel[] {
  return party.condition.injuries
    .filter((i) => i.adventurerId === member.id && isUnresolvedInjury(i))
    .map((i) => ({
      type: INJURY_TYPE_LABELS[i.type] ?? i.type,
      cause: i.cause,
    }))
}

function buildCharacterCondition(
  member: Adventurer,
  party: CampaignParty,
  dayNumber: number,
): CharacterConditionViewModel {
  const status = memberStatusText(member, party, dayNumber)
  const injuries = buildCharacterInjuries(member, party)
  const recoveryDaysRemaining =
    party.recoveringThroughDay !== undefined &&
    dayNumber <= party.recoveringThroughDay
      ? Math.max(0, party.recoveringThroughDay - dayNumber)
      : undefined

  return {
    status,
    hp: `${member.currentHp}/${member.maxHp}`,
    mp: `${member.currentMp}/${member.maxMp}`,
    morale: `${member.morale}`,
    injuries,
    recoveryDaysRemaining,
  }
}

function buildCharacterAbilities(
  member: Adventurer,
): CharacterAbilityViewModel[] {
  const base = STAT_ORDER.map((key) => ({
    name: STAT_LABELS[key],
    value: member.stats[key],
  }))
  base.push(
    { name: 'HP', value: member.currentHp },
    { name: 'MP', value: member.currentMp },
    { name: '士気', value: member.morale },
  )
  return base
}

function buildRelationshipViewModel(
  member: Adventurer,
  target: Adventurer,
  party: CampaignParty,
): CharacterRelationshipViewModel {
  const rel = party.memberRelationships?.[`${member.id}:${target.id}`]
  const names = memberNameMap(party)
  const recent: CharacterRelationshipMemoryViewModel[] =
    rel?.recentEvents?.slice(0, 5).map((e) => ({
      day: e.day,
      summary: e.summary,
    })) ?? []

  const milestones: { day: number; label: string }[] = []
  if (party.relationshipMilestones) {
    for (const m of party.relationshipMilestones) {
      if (!m.characterIds.includes(member.id)) continue
      if (!m.characterIds.includes(target.id)) continue
      if (m.sourceCharacterId && m.sourceCharacterId !== member.id) continue
      milestones.push({
        day: m.achievedDay,
        label: milestoneSummary(m, names),
      })
    }
  }
  milestones.sort((a, b) => b.day - a.day)

  return {
    targetId: target.id,
    targetName: target.name,
    label: relationshipLabel(rel),
    sharedExpeditions: rel?.sharedExpeditions ?? 0,
    recentMemories: recent,
    milestones,
  }
}

function buildCharacterRecentEvents(
  member: Adventurer,
  party: CampaignParty,
  campaign: TavernCampaignState,
): CharacterRecentEventViewModel[] {
  const events: CharacterRecentEventViewModel[] = []
  const seen = new Set<string>()
  const add = (day: number | undefined, summary: string) => {
    const key = `${day ?? 0}:${summary}`
    if (seen.has(key)) return
    seen.add(key)
    events.push({ day, summary })
  }

  const characterMemories = party.characterMemories?.[member.id] ?? []
  for (const m of characterMemories) {
    add(m.day, m.summary)
  }

  if (party.memberRelationships) {
    for (const key of Object.keys(party.memberRelationships)) {
      const rel = party.memberRelationships[key]
      if (!rel || rel.sourceCharacterId !== member.id) continue
      const target = party.party.members.find(
        (m) => m.id === rel.targetCharacterId,
      )
      for (const ev of rel.recentEvents?.slice(0, 3) ?? []) {
        const summary = target ? `${target.name}：${ev.summary}` : ev.summary
        add(ev.day, summary)
      }
    }
  }

  for (const event of party.downtimeEvents ?? []) {
    if (!event.participantIds.includes(member.id)) continue
    add(event.day, downtimeEventSummary(event, party.party.members))
  }

  for (const record of campaign.history) {
    for (const ev of record.progressionEvents) {
      if (ev.type === 'skillImproved' && ev.memberId === member.id) {
        add(ev.dayNumber, `${ev.skill} ${ev.before} → ${ev.after}`)
      }
    }
  }

  events.sort((a, b) => (b.day ?? 0) - (a.day ?? 0))
  return events.slice(0, 8)
}

function buildCharacterExpeditions(
  member: Adventurer,
  campaign: TavernCampaignState,
): CharacterExpeditionHistoryViewModel[] {
  const expeditions: CharacterExpeditionHistoryViewModel[] = []
  const seen = new Set<string>()

  for (const record of campaign.history) {
    for (const result of record.results) {
      if (!result.memberIds.includes(member.id)) continue
      if (!result.result) continue
      const id = buildExpeditionReportId(
        record.dayNumber,
        result.partyId,
        result.requestId,
      )
      if (seen.has(id)) continue
      seen.add(id)
      expeditions.push({
        day: record.dayNumber,
        title: result.request.title,
        outcomeLabel:
          OUTCOME_LABELS[result.result.outcome] ?? result.result.outcome,
        reportId: id,
      })
    }
  }

  expeditions.sort((a, b) => b.day - a.day)
  return expeditions.slice(0, 10)
}

function buildCharacterDetail(
  member: Adventurer,
  party: CampaignParty,
  campaign: TavernCampaignState,
): CharacterDetailViewModel {
  const identity = member.identity
  const otherMembers = party.party.members.filter((m) => m.id !== member.id)

  return {
    id: member.id,
    name: member.name,
    speciesId: identity?.species ?? 'human',
    speciesLabel: identity ? speciesLabel(identity.species) : '記録なし',
    countryLabel: identity
      ? countryLabel(identity.countryOfOrigin)
      : '記録なし',
    countrySummary: countrySummaryText(identity?.countryOfOrigin),
    genderLabel: identity ? genderLabel(identity.gender) : '記録なし',
    roleLabel: roleLabel(member.role),
    abilities: buildCharacterAbilities(member),
    condition: buildCharacterCondition(member, party, campaign.dayNumber),
    personality: { lines: formatPersonality(member.narrativeProfile) },
    relationships: otherMembers.map((m) =>
      buildRelationshipViewModel(member, m, party),
    ),
    recentEvents: buildCharacterRecentEvents(member, party, campaign),
    expeditions: buildCharacterExpeditions(member, campaign),
  }
}

function findTavernParty(
  campaign: TavernCampaignState,
  partyId: string,
): TavernParty | undefined {
  return campaign.currentDay.parties.find((p) => p.id === partyId)
}

export function buildPartyDetailHeader(
  party: CampaignParty,
  campaign: TavernCampaignState,
): PartyDetailHeaderViewModel {
  const tavernParty = findTavernParty(campaign, party.id)
  const recovering =
    party.recoveringThroughDay !== undefined &&
    campaign.dayNumber <= party.recoveringThroughDay

  let statusLabel = '待機中'
  let stayLabel: string | undefined
  let currentQuestLabel: string | undefined

  if (recovering && party.recoveringThroughDay !== undefined) {
    const remaining = Math.max(
      0,
      party.recoveringThroughDay - campaign.dayNumber,
    )
    statusLabel = '療養中'
    stayLabel = `療養残り${remaining}日`
  } else if (tavernParty?.acceptedRequestId) {
    const request = campaign.currentDay.requests.find(
      (r) => r.id === tavernParty.acceptedRequestId,
    )
    statusLabel = '遠征中'
    currentQuestLabel = request ? request.title : tavernParty.acceptedRequestId
  } else if (party.plannedDepartureDay !== undefined) {
    const remaining = Math.max(
      0,
      party.plannedDepartureDay - campaign.dayNumber + 1,
    )
    stayLabel = `滞在残り${remaining}日`
  }

  return {
    id: party.id,
    name: party.party.name,
    rankLabel: `Rank ${party.party.rank}`,
    statusLabel,
    memberCount: party.party.members.length,
    stayLabel,
    currentQuestLabel,
  }
}

export function buildPartyDetailSceneViewModel(
  campaign: TavernCampaignState,
  input: PartyDetailSceneInput,
): PartyDetailSceneViewModel {
  const party = campaign.parties.find((p) => p.id === input.partyId)
  if (!party) {
    return {
      party: {
        id: input.partyId,
        name: '不明なパーティ',
        rankLabel: '—',
        statusLabel: '—',
        memberCount: 0,
      },
      members: [],
      emptyMessage: 'このパーティの情報を表示できません。',
    }
  }

  const members: PartyMemberListItemViewModel[] = party.party.members.map(
    (m) => ({
      id: m.id,
      name: m.name,
      roleLabel: roleLabel(m.role),
      conditionLabel: memberConditionLabel(m, party, campaign.dayNumber),
      selected: false,
    }),
  )

  let selectedId = input.initialCharacterId
  if (!selectedId || !party.party.members.some((m) => m.id === selectedId)) {
    selectedId = party.party.members[0]?.id
  }

  for (const m of members) {
    m.selected = m.id === selectedId
  }

  const selectedMember = party.party.members.find((m) => m.id === selectedId)

  return {
    party: buildPartyDetailHeader(party, campaign),
    members,
    selectedCharacter: selectedMember
      ? buildCharacterDetail(selectedMember, party, campaign)
      : undefined,
  }
}
