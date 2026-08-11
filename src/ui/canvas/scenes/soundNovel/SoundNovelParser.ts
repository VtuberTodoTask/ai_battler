import type { SoundNovelSegment, SoundNovelSegmentKind } from './types.ts'

const DIALOGUE_START = /^(?:[「『])/
const DIALOGUE_END = /[」』]$/

export interface SoundNovelParserOptions {
  /** Dialogue lines are detected by leading 「 or 『 and trailing 」 or 』. */
  detectDialogue?: boolean
}

function segmentKind(
  text: string,
  detectDialogue: boolean,
): SoundNovelSegmentKind {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 'blank'
  if (!detectDialogue) return 'narration'
  if (DIALOGUE_START.test(trimmed) || DIALOGUE_END.test(trimmed))
    return 'dialogue'
  return 'narration'
}

function createSegment(
  text: string,
  index: number,
  detectDialogue: boolean,
): SoundNovelSegment {
  return {
    id: `seg-${index}`,
    text,
    kind: segmentKind(text, detectDialogue),
  }
}

/**
 * Splits a narrative into logical segments.
 *
 * - Preserves the original order and text.
 * - Does not summarize, paraphrase, or invent speakers.
 * - Splits on blank lines; a paragraph is one segment unless it contains an
 *   obvious dialogue wrapper, in which case each dialogue wrapper becomes a
 *   separate segment.
 */
export function parseSoundNovelText(
  text: string,
  options?: SoundNovelParserOptions,
): SoundNovelSegment[] {
  const detectDialogue = options?.detectDialogue ?? true
  const paragraphs = text.split(/\n\s*\n/)
  const segments: SoundNovelSegment[] = []
  let index = 0

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (trimmed.length === 0) {
      segments.push(createSegment('', index++, detectDialogue))
      continue
    }

    if (!detectDialogue || !containsDialogue(trimmed)) {
      segments.push(createSegment(trimmed, index++, detectDialogue))
      continue
    }

    // Split dialogue within the paragraph while keeping narration prefixes.
    const lines = splitParagraphByDialogue(trimmed)
    for (const line of lines) {
      segments.push(createSegment(line, index++, detectDialogue))
    }
  }

  return segments
}

function containsDialogue(text: string): boolean {
  return /[「『]/.test(text) && /[」』]/.test(text)
}

const DIALOGUE_CLOSE: Record<string, string> = {
  '「': '」',
  '『': '』',
}

function splitParagraphByDialogue(paragraph: string): string[] {
  const result: string[] = []
  let i = 0
  let start = 0

  while (i < paragraph.length) {
    const char = paragraph[i]
    if (char === '「' || char === '『') {
      if (i > start) {
        const narration = paragraph.slice(start, i).trim()
        if (narration.length > 0) result.push(narration)
      }
      const close = DIALOGUE_CLOSE[char]
      const end = paragraph.indexOf(close, i + 1)
      if (end === -1) {
        i++
        continue
      }
      result.push(paragraph.slice(i, end + 1).trim())
      i = end + 1
      start = i
    } else {
      i++
    }
  }

  if (start < paragraph.length) {
    const tail = paragraph.slice(start).trim()
    if (tail.length > 0) result.push(tail)
  }

  if (result.length === 0) {
    result.push(paragraph)
  }

  return result
}
