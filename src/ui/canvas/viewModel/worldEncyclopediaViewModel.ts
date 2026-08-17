import {
  getDefaultWorldLoreEntry,
  getWorldLoreEntries,
  getWorldLoreEntry,
  type WorldEncyclopediaCategory,
} from '../../../world/lore/worldLoreIndex.ts'

export interface WorldEncyclopediaReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface WorldEncyclopediaSceneInput {
  initialCategory?: WorldEncyclopediaCategory
  initialEntryId?: string
  returnTarget: WorldEncyclopediaReturnTarget
}

export interface WorldEncyclopediaCategoryViewModel {
  id: WorldEncyclopediaCategory
  label: string
}

export interface WorldEncyclopediaEntrySummaryViewModel {
  id: string
  title: string
  shortDescription: string
  selected: boolean
}

export interface WorldEncyclopediaSectionViewModel {
  id: string
  heading: string
  body: string
}

export interface WorldEncyclopediaEntryViewModel {
  id: string
  title: string
  shortDescription: string
  category: WorldEncyclopediaCategory
  sections: WorldEncyclopediaSectionViewModel[]
}

export interface WorldEncyclopediaViewModel {
  category: WorldEncyclopediaCategory
  categories: WorldEncyclopediaCategoryViewModel[]
  entryList: WorldEncyclopediaEntrySummaryViewModel[]
  article: WorldEncyclopediaEntryViewModel
  returnTarget: WorldEncyclopediaReturnTarget
}

export const WORLD_ENCYCLOPEDIA_CATEGORIES: WorldEncyclopediaCategoryViewModel[] =
  [
    { id: 'world', label: '世界について' },
    { id: 'countries', label: '国家' },
    { id: 'species', label: '種族' },
  ]

export function createWorldEncyclopediaSceneInput(
  returnTarget: WorldEncyclopediaReturnTarget,
  initialCategory?: WorldEncyclopediaCategory,
  initialEntryId?: string,
): WorldEncyclopediaSceneInput {
  return {
    initialCategory,
    initialEntryId,
    returnTarget,
  }
}

export function buildWorldEncyclopediaViewModel(
  category: WorldEncyclopediaCategory,
  entryId: string,
  returnTarget: WorldEncyclopediaReturnTarget,
): WorldEncyclopediaViewModel {
  const allEntries = getWorldLoreEntries(category)
  let current = getWorldLoreEntry(category, entryId)
  if (!current) {
    current = getDefaultWorldLoreEntry(category)
  }

  return {
    category,
    categories: WORLD_ENCYCLOPEDIA_CATEGORIES.map((c) => ({
      ...c,
      selected: c.id === category,
    })),
    entryList: allEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      shortDescription: entry.shortDescription,
      selected: entry.id === current.id,
    })),
    article: {
      id: current.id,
      title: current.title,
      shortDescription: current.shortDescription,
      category: current.category,
      sections: current.sections.map((section) => ({
        id: section.id,
        heading: section.heading,
        body: section.body,
      })),
    },
    returnTarget,
  }
}

export function resolveInitialEntry(
  input: WorldEncyclopediaSceneInput | undefined,
): { category: WorldEncyclopediaCategory; entryId: string } {
  const category = input?.initialCategory ?? 'world'
  if (input?.initialEntryId) {
    const entry = getWorldLoreEntry(category, input.initialEntryId)
    if (entry) {
      return { category, entryId: entry.id }
    }
  }
  const fallback = getDefaultWorldLoreEntry(category)
  return { category, entryId: fallback.id }
}
