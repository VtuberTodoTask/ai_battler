import { describe, expect, it } from 'vitest'
import { paginateSoundNovelSegments } from '../SoundNovelPaginator.ts'
import type { SoundNovelSegment } from '../types.ts'

function makeSeg(text: string, id: number): SoundNovelSegment {
  return {
    id: `seg-${id}`,
    text,
    kind: 'narration',
  }
}

function measureText(text: string): { width: number; height: number } {
  return { width: text.length * 10, height: 10 + text.length * 2 }
}

describe('SoundNovelPaginator', () => {
  it('puts all segments on one page when they fit', () => {
    const segments = [makeSeg('A', 0), makeSeg('B', 1)]
    const pages = paginateSoundNovelSegments(segments, {
      maxWidth: 100,
      maxHeight: 100,
      segmentSpacing: 4,
      measureText,
    })

    expect(pages.length).toBe(1)
    expect(pages[0]!.segments.length).toBe(2)
    expect(pages[0]!.segments[0]!.id).toBe('seg-0')
  })

  it('splits into multiple pages when content overflows', () => {
    const segments = [
      makeSeg('A fairly long block of text.', 0),
      makeSeg('Another fairly long block.', 1),
      makeSeg('Short.', 2),
    ]
    const pages = paginateSoundNovelSegments(segments, {
      maxWidth: 100,
      maxHeight: 40,
      segmentSpacing: 4,
      measureText,
    })

    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pages[0]!.segments.length).toBe(1)
  })

  it('keeps deterministic page ordering', () => {
    const segments = [makeSeg('First', 0), makeSeg('Second', 1)]
    const pages = paginateSoundNovelSegments(segments, {
      maxWidth: 100,
      maxHeight: 100,
      segmentSpacing: 4,
      measureText,
    })

    expect(pages[0]!.id).toBe('page-0')
    expect(pages[0]!.segments.map((s) => s.text)).toEqual(['First', 'Second'])
  })
})
