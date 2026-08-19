import type { Adventurer, BaseStats } from '../../../core/models/types.ts'
import { downtimeEventSummary } from '../../../core/narrative/downtime.ts'
import { milestoneSummary } from '../../../core/narrative/milestones.ts'
import type {
  TavernCampaignState,
  CampaignParty,
} from '../../../core/tavern/campaign/types.ts'
import type { TavernParty } from '../../../core/tavern/types.ts'
import { isUnresolvedInjury } from '../../../core/expedition/injuries.ts'
import { MORALE_MAX } from '../../../core/balance/constants.ts'
import { OUTCOME_LABELS } from '../../expedition/labels.ts'
import { COUNTRY_WORLD_PROFILES } from '../../../core/identity/worldData.ts'
import type { CountryId, SpeciesId } from '../../../core/identity/types.ts'
import { buildExpeditionReportId } from './expeditionReportViewModel.ts'
import { PARTY_GROWTH_XP_THRESHOLD } from '../../../core/tavern/campaign/progression.ts'
import {
  genderLabel,
  injuryTypeLabel,
  lifecycleStatusLabel,
  relationshipPresentationLabel,
  roleLabel,
  skillLabel,
  speciesLabel,
  statusEffectLabel,
} from './characterLabels.ts'

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
  /** Longer explanatory note shown for away/retired parties (e.g. "現在は旅の途中です。"). */
  lifecycleNote?: string
  firstArrivalDayLabel: string
  visitCountLabel: string
  currentArrivalDayLabel: string
  lastDepartureDayLabel?: string
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

export interface CharacterResourceViewModel {
  current: number
  max: number
}

export interface CharacterConditionViewModel {
  status: string
  hp: string
  mp: string
  morale: string
  hpValue: CharacterResourceViewModel
  mpValue: CharacterResourceViewModel
  moraleValue: CharacterResourceViewModel
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

export interface CharacterCountryViewModel {
  name: string
  culture: string
}

export interface CharacterDetailViewModel {
  id: string
  name: string
  speciesId?: SpeciesId
  speciesLabel: string
  country: CharacterCountryViewModel
  genderLabel: string
  roleLabel: string
  abilities: CharacterAbilityViewModel[]
  condition: CharacterConditionViewModel
  personality: CharacterPersonalityViewModel
  relationships: CharacterRelationshipViewModel[]
  recentEvents: CharacterRecentEventViewModel[]
  expeditions: CharacterExpeditionHistoryViewModel[]
}

export interface PartyGrowthSummaryViewModel {
  growthXpLabel: string
  totalGrowthXpLabel: string
  growthMilestonesLabel: string
  trainingDaysLabel: string
}

export interface MemberSkillGrowthViewModel {
  skillLabel: string
  currentValue: number
  delta: number
}

export interface MemberGrowthViewModel {
  memberId: string
  memberName: string
  skills: MemberSkillGrowthViewModel[]
  emptyMessage?: string
}

export interface PartyGrowthViewModel {
  summary: PartyGrowthSummaryViewModel
  members: MemberGrowthViewModel[]
  emptyMessage?: string
}

export interface PartyDetailSceneViewModel {
  party: PartyDetailHeaderViewModel
  members: PartyMemberListItemViewModel[]
  growth: PartyGrowthViewModel
  selectedCharacter?: CharacterDetailViewModel
  emptyMessage?: string
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

function buildCountryInfo(
  countryId: CountryId | undefined,
): CharacterCountryViewModel {
  if (!countryId) {
    return { name: '記録なし', culture: '' }
  }
  const profile =
    COUNTRY_WORLD_PROFILES[countryId as keyof typeof COUNTRY_WORLD_PROFILES]
  if (!profile) {
    return { name: '記録なし', culture: '' }
  }
  const values = profile.culturalValues.slice(0, 3).join('・')
  return {
    name: profile.nameJa,
    culture: values,
  }
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
    const types = activeInjuries.map((i) => injuryTypeLabel(i.type))
    return `負傷：${types.join('・')}`
  }

  if (member.statusEffects.length > 0) {
    const names = member.statusEffects.map((e) => statusEffectLabel(e.type))
    return `状態：${names.join('・')}`
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
      type: injuryTypeLabel(i.type),
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
    hpValue: { current: member.currentHp, max: member.maxHp },
    mpValue: { current: member.currentMp, max: member.maxMp },
    moraleValue: { current: member.morale, max: MORALE_MAX },
    injuries,
    recoveryDaysRemaining,
  }
}

function buildCharacterAbilities(
  member: Adventurer,
): CharacterAbilityViewModel[] {
  return STAT_ORDER.map((key) => ({
    name: STAT_LABELS[key],
    value: member.stats[key],
  }))
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
    label: relationshipPresentationLabel(rel),
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
        const label = skillLabel(ev.skill)
        add(ev.dayNumber, `${label} ${ev.before} → ${ev.after}`)
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

  const speciesId = identity?.species
  const species = speciesId ? speciesLabel(speciesId) : '記録なし'
  const country = buildCountryInfo(identity?.countryOfOrigin)

  return {
    id: member.id,
    name: member.name,
    speciesId,
    speciesLabel: species,
    country,
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

/**
 * Aggregates this campaign's skillImproved history into a per-member,
 * per-skill total delta. The displayed *current* value always comes from
 * the authoritative party.party.members[].skills — history is only used to
 * derive how much each skill has grown, never to reconstruct a value.
 */
function buildMemberGrowth(
  member: Adventurer,
  party: CampaignParty,
  campaign: TavernCampaignState,
): MemberGrowthViewModel {
  const deltaBySkill = new Map<string, number>()
  for (const record of campaign.history) {
    for (const ev of record.progressionEvents) {
      if (
        ev.type === 'skillImproved' &&
        ev.partyId === party.id &&
        ev.memberId === member.id
      ) {
        deltaBySkill.set(
          ev.skill,
          (deltaBySkill.get(ev.skill) ?? 0) + (ev.after - ev.before),
        )
      }
    }
  }

  const skills: MemberSkillGrowthViewModel[] = [...deltaBySkill.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([skill, delta]) => ({
      skillLabel: skillLabel(skill),
      currentValue: member.skills[skill as keyof typeof member.skills],
      delta,
    }))

  return {
    memberId: member.id,
    memberName: member.name,
    skills,
    emptyMessage:
      skills.length === 0
        ? 'この酒場での技能成長記録はまだありません。'
        : undefined,
  }
}

export function buildPartyGrowthViewModel(
  party: CampaignParty,
  campaign: TavernCampaignState,
): PartyGrowthViewModel {
  const p = party.progression
  const members = party.party.members.map((m) =>
    buildMemberGrowth(m, party, campaign),
  )

  return {
    summary: {
      growthXpLabel: `成長経験 ${p.growthXp} / ${PARTY_GROWTH_XP_THRESHOLD}`,
      totalGrowthXpLabel: `累積経験 ${p.totalGrowthXp}`,
      growthMilestonesLabel: `成長回数 ${p.growthMilestones}回`,
      trainingDaysLabel: `訓練日数 ${p.trainingDays}日`,
    },
    members,
    emptyMessage:
      p.totalGrowthXp === 0
        ? 'この酒場での技能成長記録はまだありません。'
        : undefined,
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
  const lifecycle = party.lifecycle
  let statusLabel: string
  let stayLabel: string | undefined
  let currentQuestLabel: string | undefined
  let lifecycleNote: string | undefined

  if (lifecycle.status === 'away') {
    statusLabel = lifecycleStatusLabel('away')
    lifecycleNote = '現在は旅の途中です。'
  } else if (lifecycle.status === 'retired') {
    statusLabel = lifecycleStatusLabel('retired')
    lifecycleNote = 'このパーティは冒険者としての活動を終えています。'
  } else {
    const tavernParty = findTavernParty(campaign, party.id)
    const recovering =
      party.recoveringThroughDay !== undefined &&
      campaign.dayNumber <= party.recoveringThroughDay

    statusLabel = '待機中'
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
      currentQuestLabel = request
        ? request.title
        : tavernParty.acceptedRequestId
    } else if (party.plannedDepartureDay !== undefined) {
      const remaining = Math.max(
        0,
        party.plannedDepartureDay - campaign.dayNumber + 1,
      )
      stayLabel = `滞在残り${remaining}日`
    }
  }

  return {
    id: party.id,
    name: party.party.name,
    rankLabel: `Rank ${party.party.rank}`,
    statusLabel,
    memberCount: party.party.members.length,
    stayLabel,
    currentQuestLabel,
    lifecycleNote,
    firstArrivalDayLabel: `初回来訪 DAY ${lifecycle.firstArrivalDay}`,
    visitCountLabel: `来訪回数 ${lifecycle.visitCount}回`,
    currentArrivalDayLabel: `${
      lifecycle.status === 'staying' ? '今回の来訪' : '最終来訪'
    } DAY ${party.arrivalDay}`,
    lastDepartureDayLabel:
      lifecycle.lastDepartureDay !== undefined
        ? `前回の旅立ち DAY ${lifecycle.lastDepartureDay}`
        : undefined,
  }
}

function findCampaignPartyAcrossLifecycle(
  campaign: TavernCampaignState,
  partyId: string,
): CampaignParty | undefined {
  return (
    campaign.parties.find((p) => p.id === partyId) ??
    campaign.awayParties.find((p) => p.id === partyId) ??
    campaign.retiredParties.find((p) => p.id === partyId)
  )
}

export function buildPartyDetailSceneViewModel(
  campaign: TavernCampaignState,
  input: PartyDetailSceneInput,
): PartyDetailSceneViewModel {
  const party = findCampaignPartyAcrossLifecycle(campaign, input.partyId)
  if (!party) {
    return {
      party: {
        id: input.partyId,
        name: '不明なパーティ',
        rankLabel: '—',
        statusLabel: '—',
        memberCount: 0,
        firstArrivalDayLabel: '—',
        visitCountLabel: '—',
        currentArrivalDayLabel: '—',
      },
      members: [],
      growth: {
        summary: {
          growthXpLabel: '—',
          totalGrowthXpLabel: '—',
          growthMilestonesLabel: '—',
          trainingDaysLabel: '—',
        },
        members: [],
        emptyMessage: 'このパーティの情報を表示できません。',
      },
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
    growth: buildPartyGrowthViewModel(party, campaign),
    selectedCharacter: selectedMember
      ? buildCharacterDetail(selectedMember, party, campaign)
      : undefined,
  }
}
