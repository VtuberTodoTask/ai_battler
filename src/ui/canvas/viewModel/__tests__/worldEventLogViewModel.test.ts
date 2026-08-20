import { describe, expect, it } from 'vitest'
import {
  buildWorldEventLogViewModel,
  worldEventStatusLabel,
} from '../worldEventLogViewModel.ts'
import { createTavernCampaign } from '../../../../core/tavern/campaign/campaign.ts'
import type {
  WorldEventState,
  WorldEventStatus,
} from '../../../../core/tavern/campaign/types.ts'

function buildFakeEvent(
  overrides: Partial<WorldEventState> = {},
): WorldEventState {
  return {
    id: 'world-event:8:monster_migration',
    definitionId: 'monster_migration',
    status: 'active',
    startedDay: 8,
    plannedEndDay: 10,
    requestRank: 'E',
    responsePoints: 2,
    ...overrides,
  }
}

describe('Phase 9.7 world event log viewModel', () => {
  it('maps every world event status to a player-facing label', () => {
    const cases: [WorldEventStatus, string][] = [
      ['active', '発生中'],
      ['contained', '収束'],
      ['unresolved', '対応未達'],
    ]
    for (const [status, label] of cases) {
      expect(worldEventStatusLabel(status)).toBe(label)
    }
  })

  it('never shows a raw eventId/definitionId, even for an unknown definition', () => {
    const campaign = createTavernCampaign('world-event-vm-fallback')
    campaign.worldEvents = [
      buildFakeEvent({
        // @ts-expect-error intentionally invalid for this fallback test
        definitionId: 'definition-does-not-exist',
      }),
    ]
    const vm = buildWorldEventLogViewModel(campaign, { sceneId: 'tavern' })
    expect(vm.rows).toHaveLength(1)
    const row = vm.rows[0]
    expect(row.eventTitle).not.toContain('definition-does-not-exist')
    expect(row.eventTitle).not.toContain('world-event:')
    expect(row.eventTitle).toContain('詳細を確認できません')
  })

  it('builds a readable row for a known, active event', () => {
    const campaign = createTavernCampaign('world-event-vm-active')
    campaign.worldEvents = [buildFakeEvent()]
    const vm = buildWorldEventLogViewModel(campaign, { sceneId: 'tavern' })
    expect(vm.rows).toHaveLength(1)
    const row = vm.rows[0]
    expect(row.eventTitle).toBe('魔獣群の移動')
    expect(row.statusLabel).toBe('発生中')
    expect(row.startedDayLabel).toBe('DAY 8 発生')
    expect(row.progressLabel).toBe('2 / 4')
    expect(row.periodLabel).toBe('DAY 8 ～ DAY 10')
    expect(row.endedLabel).toBeUndefined()
  })

  it('shows a contained event with its ended-day label', () => {
    const campaign = createTavernCampaign('world-event-vm-contained')
    campaign.worldEvents = [
      buildFakeEvent({
        status: 'contained',
        endedDay: 9,
        responsePoints: 4,
      }),
    ]
    const vm = buildWorldEventLogViewModel(campaign, { sceneId: 'tavern' })
    const row = vm.rows[0]
    expect(row.statusLabel).toBe('収束')
    expect(row.endedLabel).toBe('DAY 9 収束')
    expect(row.progressLabel).toBe('4 / 4')
  })

  it('shows an unresolved event with its ended-day label', () => {
    const campaign = createTavernCampaign('world-event-vm-unresolved')
    campaign.worldEvents = [
      buildFakeEvent({
        status: 'unresolved',
        endedDay: 10,
        responsePoints: 2,
      }),
    ]
    const vm = buildWorldEventLogViewModel(campaign, { sceneId: 'tavern' })
    const row = vm.rows[0]
    expect(row.statusLabel).toBe('対応未達')
    expect(row.endedLabel).toBe('DAY 10 対応期間終了')
  })

  it('orders active first, then by endedDay descending', () => {
    const campaign = createTavernCampaign('world-event-vm-order')
    campaign.worldEvents = [
      buildFakeEvent({
        id: 'a',
        status: 'contained',
        startedDay: 4,
        plannedEndDay: 6,
        endedDay: 5,
      }),
      buildFakeEvent({
        id: 'b',
        status: 'unresolved',
        startedDay: 15,
        plannedEndDay: 17,
        endedDay: 17,
      }),
      buildFakeEvent({
        id: 'c',
        status: 'active',
        startedDay: 22,
        plannedEndDay: 24,
      }),
    ]
    const vm = buildWorldEventLogViewModel(campaign, { sceneId: 'tavern' })
    expect(vm.rows.map((r) => r.startedDayLabel)).toEqual([
      'DAY 22 発生', // active first
      'DAY 15 発生', // then endedDay descending (17 > 5)
      'DAY 4 発生',
    ])
  })
})
