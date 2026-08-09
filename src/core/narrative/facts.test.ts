import { describe, expect, it } from 'vitest'
import {
  buildExpeditionNarrativeFacts,
  buildPersonalityHints,
} from './facts.ts'
import type {
  ExpeditionNarrativeContext,
  NarrativeAcceptanceInfo,
  NarrativeMemberSnapshot,
} from './types.ts'
import type {
  DispatchObjectiveSummary,
  DispatchReport,
} from '../tavern/types.ts'

function makeMember(
  overrides?: Partial<NarrativeMemberSnapshot>,
): NarrativeMemberSnapshot {
  return {
    id: 'm1',
    name: 'テスト',
    role: 'vanguard',
    rank: 'D',
    personality: {
      bravery: 0,
      caution: 0,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
    },
    ...overrides,
  }
}

function makeContext(
  report: DispatchReport,
  acceptance?: NarrativeAcceptanceInfo,
): ExpeditionNarrativeContext {
  return {
    kind: 'expedition',
    request: {
      id: 'r1',
      title: 'テスト依頼',
      briefing: 'テスト用の依頼内容',
      rank: 'E',
      objectiveType: report.objectiveType,
      environment: 'forest',
      publicTags: ['テスト'],
    },
    party: {
      id: 'p1',
      name: 'テスト団',
      rank: 'D',
      leaderId: 'm1',
      leaderName: 'テスト',
      members: [makeMember()],
      missionSpecialization: {
        strongObjective: 'investigation',
        weakObjective: 'survey',
      },
      affinity: 30,
      financialPressure: 40,
      riskTolerance: 'balanced',
      growthMilestones: 0,
      trainingDays: 0,
      stats: {
        totalExpeditions: 0,
        completeSuccesses: 0,
        successes: 0,
        partialSuccesses: 0,
        failures: 0,
        retreats: 0,
      },
      arrivalDay: 1,
      plannedDepartureDay: 2,
    },
    acceptance,
    report,
  }
}

function baseReport(
  outcome: DispatchReport['outcome'],
  objective: DispatchObjectiveSummary,
  overrides?: Partial<DispatchReport>,
): DispatchReport {
  return {
    requestId: 'r1',
    objectiveType: objective.type,
    outcome,
    objectiveCompleted: outcome === 'completeSuccess' || outcome === 'success',
    objectiveProgress: 40,
    elapsedTime: 10,
    party: [
      {
        adventurerId: 'm1',
        name: 'テスト',
        role: 'vanguard',
        rank: 'D',
        finalHp: 60,
        maxHp: 60,
        finalMp: 10,
        maxMp: 10,
        finalMorale: 50,
        incapacitated: false,
        dead: false,
      },
    ],
    casualties: [],
    incapacitated: [],
    keyFacts: ['テスト'],
    objective,
    ...overrides,
  }
}

describe('buildPersonalityHints', () => {
  it('returns only traits with |value| >= 2 as Japanese hints', () => {
    const hints = buildPersonalityHints({
      bravery: 2,
      caution: -3,
      cooperation: 0,
      discipline: -1,
      altruism: 3,
      greed: 1,
    })
    expect(hints).toContain('大胆で、危険を過度には恐れない')
    expect(hints).toContain('慎重さより行動を優先しやすい')
    expect(hints).toContain('他者への配慮が強い')
    expect(hints).not.toContain('金銭的利益への執着は弱い')
    expect(hints).not.toContain('規律や手順を重視する')
  })

  it('does not include raw trait names or numbers', () => {
    const hints = buildPersonalityHints({
      bravery: 3,
      caution: -2,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
    })
    for (const h of hints) {
      expect(h).not.toMatch(
        /bravery|caution|cooperation|discipline|altruism|greed/,
      )
      expect(h).not.toMatch(/-?\d/)
    }
  })
})

describe('survey facts', () => {
  it('describes partial coverage with acceptable quality as natural language', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'survey',
      areaName: '未踏洞窟',
      coveragePercent: 33.333,
      averageQuality: 100,
      minimumAcceptableQuality: 70,
      reportReturned: true,
      surveyedSectorCount: 1,
      completed: false,
    }
    const report = baseReport('failedObjective', objective)
    const { confirmedFacts, unknownDetails } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('依頼の目的を達成できなかった')
    expect(confirmedFacts).toContain('予定された範囲の一部を測量した')
    expect(confirmedFacts).toContain(
      '測量できた範囲の記録品質は依頼の基準を満たした',
    )
    expect(confirmedFacts).toContain('測量記録を酒場まで持ち帰った')
    expect(unknownDetails).toContain(
      '測量が限定された具体的な原因は記録されていない',
    )

    const all = [...confirmedFacts, ...unknownDetails].join('\n')
    expect(all).not.toContain('33.333')
    expect(all).not.toContain('AverageQuality')
    expect(all).not.toContain('coveragePercent')
    expect(all).not.toContain('Objective Progress')
    expect(all).not.toContain('failedObjective')
  })

  it('describes complete survey success', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'survey',
      areaName: '未踏洞窟',
      coveragePercent: 100,
      averageQuality: 90,
      minimumAcceptableQuality: 70,
      reportReturned: true,
      surveyedSectorCount: 3,
      completed: true,
    }
    const report = baseReport('completeSuccess', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )
    expect(confirmedFacts).toContain('依頼は完全な成功に終わった')
    expect(confirmedFacts).toContain('予定された範囲をすべて測量した')
  })
})

describe('investigation facts', () => {
  it('does not invent concrete discoveries or retreat causes', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'investigation',
      progress: 40,
      completed: false,
      discoveredInformationCount: 2,
      completeInformationCount: 0,
      battleIntelCount: 0,
    }
    const report = baseReport('forcedRetreat', objective)
    const { confirmedFacts, unknownDetails } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('Partyは依頼を完遂できず、途中で撤退した')
    expect(confirmedFacts).toContain('調査によっていくつかの情報を得た')
    expect(unknownDetails).toContain('撤退した具体的原因は記録されていない')
    expect(unknownDetails).toContain(
      '得られた情報の具体的内容は記録されていない',
    )

    const all = [...confirmedFacts, ...unknownDetails].join('\n')
    expect(all).not.toContain('DiscoveryCount')
    expect(all).not.toContain('魔物の痕跡')
    expect(all).not.toContain('闇の獣')
    expect(all).not.toContain('forcedRetreat')
  })

  it('mentions complete information and battle intel when present', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'investigation',
      progress: 80,
      completed: true,
      discoveredInformationCount: 3,
      completeInformationCount: 1,
      battleIntelCount: 1,
    }
    const report = baseReport('success', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )
    expect(confirmedFacts).toContain('依頼は成功した')
    expect(confirmedFacts).toContain(
      '得られた情報の中には、十分な内容まで判明したものもある',
    )
    expect(confirmedFacts).toContain('戦闘に関係する情報も得られた')
  })
})

describe('elimination facts', () => {
  it('distinguishes defeated and escaped targets', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'elimination',
      requiredTargetCount: 4,
      defeatedCount: 3,
      escapedCount: 1,
      survivingCount: 0,
      unknownCount: 0,
      confirmedCount: 4,
      progress: 100,
      completed: true,
    }
    const report = baseReport('success', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('依頼対象を3体撃破した')
    expect(confirmedFacts).toContain('一部の対象は逃走した')
    expect(confirmedFacts).toContain('依頼目的を達成した')
    expect(confirmedFacts).not.toContain('依頼対象はすべて撃破された')
  })

  it('reports surviving and unknown targets', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'elimination',
      requiredTargetCount: 4,
      defeatedCount: 1,
      escapedCount: 0,
      survivingCount: 2,
      unknownCount: 1,
      confirmedCount: 1,
      progress: 40,
      completed: false,
    }
    const report = baseReport('failedObjective', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )
    expect(confirmedFacts).toContain('依頼対象を1体撃破した')
    expect(confirmedFacts).toContain('依頼対象の一部が残っている')
    expect(confirmedFacts).toContain('一部対象の最終状態を確認できていない')
  })
})

describe('rescue facts', () => {
  it('states only reached facts and does not invent why stabilization failed', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'rescue',
      targetName: '行商人ルイ',
      finalHp: 30,
      maxHp: 50,
      located: true,
      reached: true,
      stabilized: false,
      evacuated: false,
      returned: false,
      abandoned: false,
      completed: false,
    }
    const report = baseReport('failedObjective', objective)
    const { confirmedFacts, unknownDetails } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('行商人ルイを発見した')
    expect(confirmedFacts).toContain('行商人ルイのもとへ到達した')
    expect(unknownDetails).toContain(
      '到達したにもかかわらず安定させられなかった具体的原因は記録されていない',
    )

    const all = [...confirmedFacts, ...unknownDetails].join('\n')
    expect(all).not.toContain('崖')
    expect(all).not.toContain('怪物')
    expect(all).not.toContain('30/50')
  })

  it('describes a full rescue', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'rescue',
      targetName: '行商人ルイ',
      finalHp: 50,
      maxHp: 50,
      located: true,
      reached: true,
      stabilized: true,
      evacuated: true,
      returned: true,
      abandoned: false,
      completed: true,
    }
    const report = baseReport('completeSuccess', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )
    expect(confirmedFacts).toContain('行商人ルイを発見した')
    expect(confirmedFacts).toContain('行商人ルイのもとへ到達した')
    expect(confirmedFacts).toContain('行商人ルイを安定させた')
    expect(confirmedFacts).toContain('行商人ルイを退避させた')
    expect(confirmedFacts).toContain('行商人ルイとともに帰還した')
  })
})

describe('escort facts', () => {
  it('describes escort success without raw stress or route progress', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'escort',
      targetName: '学者エルナ',
      finalHp: 40,
      maxHp: 40,
      stress: 67,
      routeProgress: 80,
      destinationReached: true,
      handoffStatus: 'completed',
      delivered: true,
      returnedToOrigin: true,
      stranded: false,
      completed: true,
    }
    const report = baseReport('success', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('学者エルナを目的地へ到達させた')
    expect(confirmedFacts).toContain('学者エルナを引き渡した')
    expect(confirmedFacts).toContain('護衛を終えて酒場まで戻った')

    const all = confirmedFacts.join('\n')
    expect(all).not.toContain('stress: 67')
    expect(all).not.toContain('routeProgress')
    expect(all).not.toContain('80%')
    expect(all).not.toContain('40/40')
  })
})

describe('retrieval facts', () => {
  it('compares integrity to threshold without leaking raw numbers', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'retrieval',
      targetName: '古代の石板',
      finalIntegrity: 30,
      minimumAcceptableIntegrity: 70,
      secured: true,
      extracted: true,
      returned: false,
      completed: false,
    }
    const report = baseReport('failedObjective', objective)
    const { confirmedFacts } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('古代の石板を確保した')
    expect(confirmedFacts).toContain('古代の石板を回収地点から運び出した')
    expect(confirmedFacts).toContain(
      '回収物の状態は依頼の許容基準に届かなかった',
    )

    const all = confirmedFacts.join('\n')
    expect(all).not.toContain('finalIntegrity: 30')
    expect(all).not.toContain('30/70')
  })
})

describe('battle and causality facts', () => {
  it('reports battle outcome but does not claim it caused retreat', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'investigation',
      progress: 20,
      completed: false,
      discoveredInformationCount: 1,
      completeInformationCount: 0,
      battleIntelCount: 0,
    }
    const report = baseReport('forcedRetreat', objective, {
      battleOutcome: 'retreat',
    })
    const { confirmedFacts, unknownDetails } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('遠征中に戦闘が発生した')
    expect(confirmedFacts).toContain('戦闘結果は撤退だった')
    expect(unknownDetails).toContain('撤退した具体的原因は記録されていない')

    const all = [...confirmedFacts, ...unknownDetails].join('\n')
    expect(all).not.toContain('戦闘に負けたから撤退した')
    expect(all).not.toContain('retreat')
  })
})

describe('member condition facts', () => {
  it('describes member states with bands, not raw hp/mp/morale', () => {
    const objective: DispatchObjectiveSummary = {
      type: 'survey',
      areaName: '未踏洞窟',
      coveragePercent: 100,
      averageQuality: 90,
      minimumAcceptableQuality: 70,
      reportReturned: true,
      surveyedSectorCount: 3,
      completed: true,
    }
    const report: DispatchReport = {
      ...baseReport('success', objective),
      party: [
        {
          adventurerId: 'm1',
          name: 'リーダー',
          role: 'vanguard',
          rank: 'D',
          finalHp: 25,
          maxHp: 60,
          finalMp: 10,
          maxMp: 10,
          finalMorale: 20,
          incapacitated: false,
          dead: false,
        },
        {
          adventurerId: 'm2',
          name: 'サポート',
          role: 'support',
          rank: 'D',
          finalHp: 0,
          maxHp: 60,
          finalMp: 0,
          maxMp: 10,
          finalMorale: 0,
          incapacitated: false,
          dead: true,
        },
      ],
      casualties: ['m2'],
      incapacitated: [],
    }
    const { confirmedFacts, unknownDetails } = buildExpeditionNarrativeFacts(
      makeContext(report),
    )

    expect(confirmedFacts).toContain('死亡したMember: サポート')
    expect(confirmedFacts).toContain(
      '帰還時の状態: リーダー: 帰還時の消耗が大きい',
    )
    expect(unknownDetails).toContain(
      'Memberが消耗した具体的な原因は記録されていない',
    )

    const all = [...confirmedFacts, ...unknownDetails].join('\n')
    expect(all).not.toContain('HP ')
    expect(all).not.toContain('MP ')
    expect(all).not.toContain('Morale ')
    expect(all).not.toContain('30/60')
  })
})
