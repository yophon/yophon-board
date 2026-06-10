import { describe, expect, test } from 'bun:test'
import {
  clampTextFontSize,
  getTextFont,
  getTextLineHeight,
  getTextPadding,
  measureTextBox,
  wrapTextLines,
} from '../src/whiteboard/textLayout'

// Fixed-advance measurement stand-in: every character is 10px wide.
const fakeCtx = {
  measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
  save: () => {},
  restore: () => {},
  set font(_value: string) {},
} as unknown as CanvasRenderingContext2D

describe('textLayout', () => {
  test('clampTextFontSize bounds to [8, 160]', () => {
    expect(clampTextFontSize(1)).toBe(8)
    expect(clampTextFontSize(40)).toBe(40)
    expect(clampTextFontSize(900)).toBe(160)
  })

  test('getTextFont composes style, weight and family', () => {
    expect(getTextFont(20)).toStartWith('20px')
    expect(getTextFont(20, true)).toStartWith('700 20px')
    expect(getTextFont(20, true, true)).toStartWith('italic 700 20px')
  })

  test('wrapTextLines wraps at maxWidth and keeps empty paragraphs', () => {
    // 10px per char, max 30px → 3 chars per line.
    expect(wrapTextLines(fakeCtx, 'abcdefg', 30)).toEqual(['abc', 'def', 'g'])
    expect(wrapTextLines(fakeCtx, 'ab\n\ncd', 100)).toEqual(['ab', '', 'cd'])
  })

  test('measureTextBox without a context falls back to a one-line box', () => {
    const box = measureTextBox(undefined, 'whatever', 28, 280)
    expect(box.width).toBe(280)
    expect(box.height).toBe(Math.ceil(getTextLineHeight(28) + getTextPadding(28) * 2))
  })

  test('measureTextBox grows with wrapped lines', () => {
    const oneLine = measureTextBox(fakeCtx, 'abc', 28, 280)
    const threeLines = measureTextBox(fakeCtx, 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz', 28, 280)
    expect(threeLines.height).toBeGreaterThan(oneLine.height)
  })
})
