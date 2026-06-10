import { describe, expect, test } from 'bun:test'
import { cutStrokeByEraser, strokeIntersectsEraser } from '../src/whiteboard/eraser'
import type { CanvasStroke, Point } from '../src/whiteboard/types'

type DrawingStroke = Extract<CanvasStroke, { points: Point[] }>

function makeStroke(points: Point[], width = 4): DrawingStroke {
  return { points, color: '#000', width, tool: 'pen' }
}

const horizontal = () => makeStroke([
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 100, y: 0 },
])

describe('strokeIntersectsEraser', () => {
  test('hits a stroke crossed by the eraser path', () => {
    expect(strokeIntersectsEraser(horizontal(), { x: 50, y: -10 }, { x: 50, y: 10 }, 5)).toBe(true)
  })

  test('misses a stroke far from the eraser path', () => {
    expect(strokeIntersectsEraser(horizontal(), { x: 50, y: 100 }, { x: 60, y: 100 }, 5)).toBe(false)
  })

  test('accounts for stroke width in the hit threshold', () => {
    // Path passes 10 world units above; radius 5 + width/2 = 7 → miss.
    expect(strokeIntersectsEraser(makeStroke(horizontal().points, 4), { x: 50, y: 10 }, { x: 60, y: 10 }, 5)).toBe(false)
    // Fat stroke (width 12): 5 + 6 = 11 ≥ 10 → hit.
    expect(strokeIntersectsEraser(makeStroke(horizontal().points, 12), { x: 50, y: 10 }, { x: 60, y: 10 }, 5)).toBe(true)
  })
})

describe('cutStrokeByEraser', () => {
  test('returns null when nothing is erased', () => {
    expect(cutStrokeByEraser(horizontal(), { x: 50, y: 100 }, { x: 60, y: 100 }, 5)).toBeNull()
  })

  test('cutting the middle yields two segments', () => {
    const segments = cutStrokeByEraser(horizontal(), { x: 50, y: -20 }, { x: 50, y: 20 }, 5)
    expect(segments).not.toBeNull()
    expect(segments!.length).toBe(2)
    const [left, right] = segments!
    // Left segment stays left of the cut, right segment right of it.
    expect(Math.max(...left.map(p => p.x))).toBeLessThan(50)
    expect(Math.min(...right.map(p => p.x))).toBeGreaterThan(50)
  })

  test('erasing the whole stroke yields an empty list', () => {
    const stroke = makeStroke([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const segments = cutStrokeByEraser(stroke, { x: -10, y: 0 }, { x: 20, y: 0 }, 20)
    expect(segments).toEqual([])
  })

  test('erasing one end keeps a single trimmed segment', () => {
    const segments = cutStrokeByEraser(horizontal(), { x: 100, y: -10 }, { x: 100, y: 10 }, 8)
    expect(segments).not.toBeNull()
    expect(segments!.length).toBe(1)
    expect(Math.max(...segments![0].map(p => p.x))).toBeLessThan(100)
  })
})
