import { describe, expect, it } from 'vitest'
import { parseSoundNovelText } from '../SoundNovelParser.ts'

describe('SoundNovelParser', () => {
  it('splits paragraphs into segments preserving order and text', () => {
    const text = '一つ目の段落。\n\n二つ目の段落。'
    const segments = parseSoundNovelText(text)

    expect(segments.length).toBe(2)
    expect(segments[0]!.text).toBe('一つ目の段落。')
    expect(segments[1]!.text).toBe('二つ目の段落。')
    expect(segments[0]!.kind).toBe('narration')
    expect(segments[1]!.kind).toBe('narration')
  })

  it('detects dialogue wrapped in Japanese quotation marks', () => {
    const text = '誰かが言った。「こんにちは」と挨拶した。'
    const segments = parseSoundNovelText(text)

    expect(segments.length).toBe(3)
    expect(segments[0]!.text).toBe('誰かが言った。')
    expect(segments[0]!.kind).toBe('narration')
    expect(segments[1]!.text).toBe('「こんにちは」')
    expect(segments[1]!.kind).toBe('dialogue')
    expect(segments[2]!.text).toBe('と挨拶した。')
    expect(segments[2]!.kind).toBe('narration')
  })

  it('treats an entire paragraph as narration when dialogue detection is disabled', () => {
    const text = '「これはセリフです」'
    const segments = parseSoundNovelText(text, { detectDialogue: false })

    expect(segments.length).toBe(1)
    expect(segments[0]!.text).toBe('「これはセリフです」')
    expect(segments[0]!.kind).toBe('narration')
  })

  it('produces a blank segment for leading empty paragraphs', () => {
    const text = '\n\n最初。\n\n最後。'
    const segments = parseSoundNovelText(text)

    expect(segments[0]!.text).toBe('')
    expect(segments[0]!.kind).toBe('blank')
    expect(segments.some((s) => s.text === '最初。')).toBe(true)
  })

  it('does not invent or reorder text', () => {
    const text = 'A\n\nB「C」D\n\nE'
    const segments = parseSoundNovelText(text)
    const joined = segments.map((s) => s.text).join('')
    expect(joined).toBe('AB「C」DE')
  })
})
