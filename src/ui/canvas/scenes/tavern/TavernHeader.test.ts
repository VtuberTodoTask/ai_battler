import { describe, expect, it } from 'vitest'
import { TavernHeader } from './TavernHeader.ts'
import { DEFAULT_GAME_THEME } from '../../theme/gameTheme.ts'
import type { TavernHeaderViewModel } from '../../viewModel/tavernScreenViewModel.ts'

function baseViewModel(
  overrides: Partial<TavernHeaderViewModel> = {},
): TavernHeaderViewModel {
  return {
    day: 8,
    reputationScore: 12,
    tavernRank: 1,
    reputationLabel: '酒場ランク 1 / 評判 12',
    canAdvanceDay: false,
    canResolveDay: true,
    unreadReportCount: 0,
    ...overrides,
  }
}

describe('Phase 9.7.1 TavernHeader — World Event banner presentation', () => {
  it('renders the event title, response progress, and remaining days when an event is active', () => {
    const header = new TavernHeader({ theme: DEFAULT_GAME_THEME, width: 1600 })
    header.update(
      baseViewModel({
        worldEventBanner: {
          eventTitle: '魔獣群の移動',
          statusProgressLabel: '対応状況 2 / 4',
          remainingDaysLabel: '残り 2日',
        },
      }),
    )
    const banner = header.getWorldEventBannerStateForTest()
    expect(banner.visible).toBe(true)
    expect(banner.text).toContain('魔獣群の移動')
    expect(banner.text).toContain('対応状況 2 / 4')
    expect(banner.text).toContain('残り 2日')
  })

  it('hides the banner entirely when there is no active event', () => {
    const header = new TavernHeader({ theme: DEFAULT_GAME_THEME, width: 1600 })
    header.update(baseViewModel({ worldEventBanner: undefined }))
    const banner = header.getWorldEventBannerStateForTest()
    expect(banner.visible).toBe(false)
  })

  it('never leaks a raw eventId/definitionId into the rendered banner text', () => {
    const header = new TavernHeader({ theme: DEFAULT_GAME_THEME, width: 1600 })
    header.update(
      baseViewModel({
        worldEventBanner: {
          eventTitle: '世界情勢（詳細を確認できません）',
          statusProgressLabel: '対応状況 0 / 4',
          remainingDaysLabel: '残り 1日',
        },
      }),
    )
    const banner = header.getWorldEventBannerStateForTest()
    expect(banner.text).not.toContain('world-event:')
    expect(banner.text).not.toMatch(
      /monster_migration|flooded_routes|exposed_ruins|missing_caravans/,
    )
  })
})
