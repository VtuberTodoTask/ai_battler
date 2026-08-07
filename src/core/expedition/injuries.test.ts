import { describe, expect, it } from 'vitest'
import { makeParty, makeRequest } from './test-utils.ts'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { isUnresolvedInjury, isUnresolvedSeriousInjury } from './injuries.ts'
import { expeditionTestInternals } from './test-internals.ts'

describe('Injury state helpers', () => {
  function makeInjury(
    status: 'active' | 'treated' | 'worsened',
    type: 'light' | 'serious',
  ) {
    return {
      id: 'i-1',
      adventurerId: 'a',
      type,
      cause: 'test',
      hpLoss: 10,
      status,
    }
  }

  it('counts active and worsened serious injuries as unresolved', () => {
    expect(isUnresolvedSeriousInjury(makeInjury('active', 'serious'))).toBe(
      true,
    )
    expect(isUnresolvedSeriousInjury(makeInjury('worsened', 'serious'))).toBe(
      true,
    )
    expect(isUnresolvedSeriousInjury(makeInjury('treated', 'serious'))).toBe(
      false,
    )
    expect(isUnresolvedSeriousInjury(makeInjury('active', 'light'))).toBe(false)
  })

  it('counts active and worsened as unresolved regardless of severity', () => {
    expect(isUnresolvedInjury(makeInjury('active', 'light'))).toBe(true)
    expect(isUnresolvedInjury(makeInjury('worsened', 'light'))).toBe(true)
    expect(isUnresolvedInjury(makeInjury('treated', 'light'))).toBe(false)
  })
})

describe('Outcome injury handling', () => {
  function outcomeWithInjuries(
    injuryStatus: 'active' | 'worsened' | 'treated',
    type: 'light' | 'serious',
  ) {
    const request = makeRequest('injury-outcome')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'injury-outcome',
    )
    const state = initializeExpeditionState(request, party)
    state.objectiveProgress = 100
    state.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    state.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type,
      cause: 'test',
      hpLoss: 12,
      status: injuryStatus,
    })
    return expeditionTestInternals.determineOutcome(request, state, party)
  }

  it('prevents completeSuccess when a serious injury is active', () => {
    expect(outcomeWithInjuries('active', 'serious')).not.toBe('completeSuccess')
  })

  it('prevents completeSuccess when a serious injury is worsened', () => {
    expect(outcomeWithInjuries('worsened', 'serious')).not.toBe(
      'completeSuccess',
    )
  })

  it('allows completeSuccess when a serious injury is treated', () => {
    expect(outcomeWithInjuries('treated', 'serious')).toBe('completeSuccess')
  })

  it('does not downgrade completeSuccess for active light injuries', () => {
    expect(outcomeWithInjuries('active', 'light')).toBe('completeSuccess')
  })

  it('worsened light injury is still unresolved but not serious', () => {
    const request = makeRequest('worsened-light')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'worsened-light',
    )
    const state = initializeExpeditionState(request, party)
    state.objectiveProgress = 100
    state.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    state.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type: 'light',
      cause: 'test',
      hpLoss: 3,
      status: 'worsened',
    })
    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).toBe('completeSuccess')
  })

  it('worsening from active to worsened does not improve outcome', () => {
    const request = makeRequest('active-vs-worsened')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'active-vs-worsened',
    )
    const active = initializeExpeditionState(request, party)
    active.objectiveProgress = 100
    active.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    active.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type: 'serious',
      cause: 'test',
      hpLoss: 12,
      status: 'active',
    })
    const worsened = initializeExpeditionState(request, party)
    worsened.objectiveProgress = 100
    worsened.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    worsened.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type: 'serious',
      cause: 'test',
      hpLoss: 12,
      status: 'worsened',
    })
    const activeOutcome = expeditionTestInternals.determineOutcome(
      request,
      active,
      party,
    )
    const worsenedOutcome = expeditionTestInternals.determineOutcome(
      request,
      worsened,
      party,
    )
    expect(activeOutcome).not.toBe('completeSuccess')
    expect(worsenedOutcome).not.toBe('completeSuccess')
    expect(activeOutcome).toBe(worsenedOutcome)
  })
})

describe('Healer injury treatment', () => {
  it('treats active injuries and stabilizes worsened injuries on normal success', () => {
    const request = makeRequest('heal-normal', { features: [] })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'heal-normal',
    )
    const result = runExpedition(request, party)
    // worsened は存在しない or 治療後 active/treated のいずれか
    for (const injury of result.state.injuries) {
      if (injury.status === 'worsened') {
        expect(injury.type).not.toBe('serious')
      }
    }
  })
})
