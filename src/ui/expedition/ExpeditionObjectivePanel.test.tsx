// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpeditionObjectivePanel } from './ExpeditionObjectivePanel.tsx'
import type {
  EliminationObjectiveState,
  EscortObjectiveState,
  InvestigationObjectiveState,
  RescueObjectiveState,
  RetrievalObjectiveState,
  SurveyObjectiveState,
} from '../../core/expedition/types.ts'

describe('ExpeditionObjectivePanel', () => {
  it('renders investigation fields', () => {
    const obj: InvestigationObjectiveState = { type: 'investigation' }
    render(<ExpeditionObjectivePanel objective={obj} />)
    expect(screen.getByText(/investigation/)).toBeTruthy()
  })

  it('renders elimination fields', () => {
    const obj: EliminationObjectiveState = {
      type: 'elimination',
      mode: 'allEnemies',
      confirmationRequired: false,
      requiredTargetIds: ['e1', 'e2'],
      defeatedTargetIds: ['e1'],
      escapedTargetIds: [],
      survivingTargetIds: [],
      unknownTargetIds: ['e2'],
      confirmedTargetIds: ['e1'],
      progress: 50,
      completed: false,
    }
    render(<ExpeditionObjectivePanel objective={obj} />)
    expect(screen.getByText('対象数')).toBeTruthy()
    expect(screen.getByText('撃破')).toBeTruthy()
  })

  it('renders rescue fields', () => {
    const obj: RescueObjectiveState = {
      type: 'rescue',
      targetId: 't1',
      targetName: '救出対象',
      maxHp: 40,
      currentHp: 24,
      mobility: 'assisted',
      statusEffects: [],
      located: true,
      reached: false,
      stabilized: true,
      evacuated: false,
      returned: false,
      abandoned: false,
      battleExposureDamage: 0,
      returnDamage: 0,
      progress: 50,
      completed: false,
    }
    render(<ExpeditionObjectivePanel objective={obj} />)
    expect(screen.getByText('救出対象')).toBeTruthy()
    expect(screen.getByText('HP')).toBeTruthy()
  })

  it('renders escort fields', () => {
    const obj: EscortObjectiveState = {
      type: 'escort',
      targetId: 't1',
      targetName: '護衛対象',
      destinationId: 'd1',
      destinationName: '目的地',
      maxHp: 40,
      currentHp: 40,
      mobility: 'mobile',
      statusEffects: [],
      travelStress: 0,
      accompanying: true,
      departed: true,
      coordinated: false,
      routeProgress: 0,
      travelDamage: 0,
      battleExposureDamage: 0,
      careProvided: false,
      careHealing: 0,
      careDamage: 0,
      destinationReached: false,
      handoffStatus: 'notStarted',
      delivered: false,
      returnedToOrigin: false,
      stranded: false,
      progress: 25,
      completed: false,
    }
    render(<ExpeditionObjectivePanel objective={obj} />)
    expect(screen.getByText('護衛対象')).toBeTruthy()
    expect(screen.getAllByText('目的地').length).toBeGreaterThan(0)
  })

  it('renders retrieval fields', () => {
    const obj: RetrievalObjectiveState = {
      type: 'retrieval',
      targetId: 't1',
      targetName: '回収対象',
      initialIntegrity: 80,
      minimumAcceptableIntegrity: 60,
      currentIntegrity: 55,
      bulk: 'bulky',
      handling: 'delicate',
      fragility: 'standard',
      located: true,
      reached: true,
      secured: true,
      protectedForTransport: false,
      extracted: false,
      returned: false,
      abandoned: false,
      lostDuringReturn: false,
      carrierIds: ['a', 'b'],
      battleExposureDamage: 0,
      securingDamage: 5,
      extractionDamage: 0,
      progress: 50,
      completed: false,
    }
    render(<ExpeditionObjectivePanel objective={obj} />)
    expect(screen.getByText('回収対象')).toBeTruthy()
    expect(screen.getByText('Integrity')).toBeTruthy()
  })

  it('renders survey fields', () => {
    const obj: SurveyObjectiveState = {
      type: 'survey',
      areaId: 'a1',
      areaName: '旧坑道東部',
      minimumAcceptableQuality: 70,
      sectors: [
        {
          id: 's1',
          name: '東一区画',
          focus: 'route',
          difficulty: 15,
          attempted: true,
          surveyed: true,
          result: 'success',
          quality: 80,
          responsibleMemberIds: ['a'],
          assistanceMemberIds: [],
        },
        {
          id: 's2',
          name: '東二区画',
          focus: 'terrain',
          difficulty: 15,
          attempted: true,
          surveyed: false,
          quality: 0,
          responsibleMemberIds: [],
          assistanceMemberIds: [],
        },
        {
          id: 's3',
          name: '東三区画',
          focus: 'arcane',
          difficulty: 15,
          attempted: false,
          surveyed: false,
          quality: 0,
          responsibleMemberIds: [],
          assistanceMemberIds: [],
        },
      ],
      coveragePercent: 33,
      averageQuality: 80,
      reportPrepared: true,
      reportReturned: false,
      reportLostDuringReturn: false,
      progress: 50,
      completed: false,
    }
    render(<ExpeditionObjectivePanel objective={obj} />)
    expect(screen.getByText('旧坑道東部')).toBeTruthy()
    expect(screen.getByText('東一区画')).toBeTruthy()
  })
})
