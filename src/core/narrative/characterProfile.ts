import type { Adventurer, CharacterNarrativeProfile } from '../models/types.ts'

export function deriveCharacterNarrativeProfile(
  member: Adventurer,
): CharacterNarrativeProfile {
  if (member.narrativeProfile) {
    return member.narrativeProfile
  }
  const { role, personality, traits } = member
  const { bravery, caution, cooperation, discipline, altruism, greed } =
    personality

  let temperament = 'バランスの取れた型'
  if (bravery > 1 && caution <= 0) {
    temperament = '猪突猛進で勇敢'
  } else if (bravery > 1 && caution > 0) {
    temperament = '大胆だが計画的'
  } else if (caution > 1 && bravery <= 0) {
    temperament = '慎重で用心深い'
  } else if (caution > 1 && bravery > 0) {
    temperament = '慎重だが決断力がある'
  } else if (bravery <= 0 && caution <= 0) {
    temperament = '楽観的で柔軟'
  }

  let socialStyle = '協調的'
  if (cooperation >= 2 && discipline >= 1) {
    socialStyle = 'チームを重んじる'
  } else if (cooperation >= 2 && discipline < 1) {
    socialStyle = '気安く世話焼き'
  } else if (cooperation < 0 && discipline >= 1) {
    socialStyle = '実利主義で淡白'
  } else if (cooperation < 0 && discipline < 0) {
    socialStyle = '独立独歩'
  }

  const values: string[] = []
  if (altruism >= 2) values.push('仲間の安全')
  if (greed >= 2) values.push('報酬と評価')
  if (altruism <= -2) values.push('自己保存')
  if (values.length === 0) values.push('依頼の成功')

  const flaws: string[] = []
  if (bravery >= 2) flaws.push('無謀になりがち')
  if (caution >= 2) flaws.push('優柔断になりがち')
  if (greed >= 2) flaws.push('金銭に弱い')
  if (discipline <= -2) flaws.push('規律を欠く')
  if (cooperation <= -2) flaws.push('協調性に欠ける')
  if (flaws.length === 0 && altruism >= 2) flaws.push('犠牲を顧みない')

  const fears: string[] = []
  switch (role) {
    case 'vanguard':
      fears.push('孤立して囲まれること')
      break
    case 'guardian':
      fears.push('守るべき者を失うこと')
      break
    case 'scout':
      fears.push('見落とした脅威')
      break
    case 'ranger':
      fears.push('獲物を逃すこと')
      break
    case 'mage':
      fears.push('魔力の枯渇')
      break
    case 'healer':
      fears.push('手の届かない傷')
      break
    case 'support':
      fears.push('後方の崩壊')
      break
  }

  const traitNames = traits.map((t) => t.name).join('・')
  const habits: string[] = []
  switch (role) {
    case 'vanguard':
      habits.push('先陣を切る前に息を整える')
      break
    case 'guardian':
      habits.push('防具をこまめに確認する')
      break
    case 'scout':
      habits.push('周囲を素早く見回す')
      break
    case 'ranger':
      habits.push('武器の手入れを欠かさない')
      break
    case 'mage':
      habits.push('呪文の詠唱を口ずさむ')
      break
    case 'healer':
      habits.push('医薬品の位置を確認する')
      break
    case 'support':
      habits.push('仲間の様子を窺う')
      break
  }
  if (traitNames) {
    habits.push(`${traitNames}の傾向が強い`)
  }

  let speechStyle = '普通'
  if (bravery > 1) speechStyle = '短く力強い'
  else if (caution > 1) speechStyle = '丁寧で控えめ'
  else if (cooperation > 1) speechStyle = '優しく寄り添う'
  else if (discipline > 1) speechStyle = '簡潔で事務的'
  else if (altruism > 1) speechStyle = '励ましの言葉を好む'
  else if (greed > 1) speechStyle = '条件や報酬を気にする'

  return {
    temperament,
    socialStyle,
    values,
    flaws: flaws.slice(0, 2),
    fears,
    habits,
    speechStyle,
  }
}

export function formatNarrativeProfile(
  profile: CharacterNarrativeProfile | undefined,
): string {
  if (!profile) return '特筆すべきプロフィールは記録されていない'
  const parts: string[] = []
  if (profile.temperament) parts.push(`気質: ${profile.temperament}`)
  if (profile.socialStyle) parts.push(`対人: ${profile.socialStyle}`)
  if (profile.values && profile.values.length > 0)
    parts.push(`重視: ${profile.values.join('・')}`)
  if (profile.flaws && profile.flaws.length > 0)
    parts.push(`欠点: ${profile.flaws.join('・')}`)
  if (profile.fears && profile.fears.length > 0)
    parts.push(`恐れ: ${profile.fears.join('・')}`)
  if (profile.habits && profile.habits.length > 0)
    parts.push(`癖: ${profile.habits.join('・')}`)
  if (profile.speechStyle) parts.push(`口調: ${profile.speechStyle}`)
  return parts.join(' / ') || '特筆すべきプロフィールは記録されていない'
}
