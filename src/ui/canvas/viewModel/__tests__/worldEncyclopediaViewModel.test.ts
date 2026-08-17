import { describe, expect, it } from 'vitest'
import {
  buildWorldEncyclopediaViewModel,
  resolveInitialEntry,
  WORLD_ENCYCLOPEDIA_CATEGORIES,
} from '../worldEncyclopediaViewModel.ts'

describe('worldEncyclopediaViewModel', () => {
  it('exposes the three categories', () => {
    const ids = WORLD_ENCYCLOPEDIA_CATEGORIES.map((c) => c.id)
    expect(ids).toContain('world')
    expect(ids).toContain('countries')
    expect(ids).toContain('species')
    expect(WORLD_ENCYCLOPEDIA_CATEGORIES.length).toBe(3)
  })

  it('defaults to world category and 七国世界 entry', () => {
    const input = { returnTarget: { sceneId: 'tavern' } }
    const initial = resolveInitialEntry(input)
    expect(initial.category).toBe('world')
    expect(initial.entryId).toBe('seven-kingdoms-world')
  })

  it('falls back to the first entry of the requested category when initialEntryId is missing', () => {
    const input = {
      initialCategory: 'countries' as const,
      returnTarget: { sceneId: 'tavern' },
    }
    const initial = resolveInitialEntry(input)
    expect(initial.category).toBe('countries')
    expect(initial.entryId).toBe('alden')
  })

  it('falls back to the first valid entry when initialEntryId is invalid', () => {
    const input = {
      initialCategory: 'world' as const,
      initialEntryId: 'no-such-entry',
      returnTarget: { sceneId: 'tavern' },
    }
    const initial = resolveInitialEntry(input)
    expect(initial.entryId).toBe('seven-kingdoms-world')
  })

  it('builds a view model with the requested entry selected', () => {
    const vm = buildWorldEncyclopediaViewModel('countries', 'celesta', {
      sceneId: 'tavern',
    })
    expect(vm.category).toBe('countries')
    expect(vm.article.title).toBe('セレスタ交易共和国')
    expect(vm.article.id).toBe('celesta')
    expect(
      vm.entryList.some((entry) => entry.id === 'celesta' && entry.selected),
    ).toBe(true)
  })

  it('lists all entries for the current category', () => {
    const vm = buildWorldEncyclopediaViewModel('species', 'human', {
      sceneId: 'tavern',
    })
    expect(vm.entryList.length).toBe(9)
    expect(vm.entryList.every((entry) => entry.title.length > 0)).toBe(true)
  })

  it('carries the return target from input', () => {
    const returnTarget = {
      sceneId: 'tavern',
      selectedPartyId: 'party-1',
      selectedQuestId: 'quest-2',
    }
    const vm = buildWorldEncyclopediaViewModel(
      'world',
      'seven-kingdoms-world',
      returnTarget,
    )
    expect(vm.returnTarget).toEqual(returnTarget)
  })
})
