import type { SoundNovelPage, SoundNovelSegment } from './types.ts'

export interface SoundNovelPaginatorOptions {
  /** Maximum width for each segment before wrapping. */
  maxWidth: number
  /** Maximum height for the accumulated page content. */
  maxHeight: number
  /** Vertical spacing between segments. */
  segmentSpacing: number
  /** Function that returns the measured {width, height} for a text block. */
  measureText: (text: string) => { width: number; height: number }
}

/**
 * Distributes segments into pages based on their measured layout height.
 * This is deterministic for a fixed virtual resolution and fixed text style.
 */
export function paginateSoundNovelSegments(
  segments: readonly SoundNovelSegment[],
  options: SoundNovelPaginatorOptions,
): SoundNovelPage[] {
  const { maxHeight, segmentSpacing, measureText } = options
  const pages: SoundNovelPage[] = []
  let currentSegments: SoundNovelSegment[] = []
  let currentHeight = 0
  let pageIndex = 0

  for (const segment of segments) {
    const text = segment.text.trim().length === 0 ? '' : segment.text
    const { height } = measureText(text)
    const segmentHeight =
      height === 0 && text.length === 0 ? segmentSpacing : height
    const extra = currentSegments.length > 0 ? segmentSpacing : 0
    const projected = currentHeight + extra + segmentHeight

    if (
      currentSegments.length > 0 &&
      projected > maxHeight &&
      currentHeight > 0
    ) {
      pages.push({
        id: `page-${pageIndex++}`,
        segments: currentSegments,
      })
      currentSegments = [segment]
      currentHeight = segmentHeight
    } else {
      currentSegments.push(segment)
      currentHeight = currentSegments.length === 1 ? segmentHeight : projected
    }
  }

  if (currentSegments.length > 0) {
    pages.push({
      id: `page-${pageIndex++}`,
      segments: currentSegments,
    })
  }

  return pages
}
