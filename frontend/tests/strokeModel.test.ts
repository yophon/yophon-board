import { beforeAll, describe, expect, test } from 'bun:test'
import { applySavedRow, createLocalStroke, parseStrokeRow, persistableStroke } from '../src/whiteboard/strokeModel'
import type { CanvasStroke, StrokeRow } from '../src/whiteboard/types'

beforeAll(() => {
  // applySavedRow clears retry timers through `window`.
  ;(globalThis as Record<string, unknown>).window = globalThis
})

function row(strokeData: unknown, overrides: Partial<StrokeRow> = {}): StrokeRow {
  return {
    id: 1,
    stroke_data: typeof strokeData === 'string' ? strokeData : JSON.stringify(strokeData),
    created_at: 1700000000,
    page: 0,
    ...overrides,
  }
}

describe('createLocalStroke', () => {
  test('assigns a localId and the page', () => {
    const stroke = createLocalStroke({
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      color: '#111',
      width: 3,
      tool: 'pen',
    }, 2)
    expect(stroke.localId).toBeTruthy()
    expect(stroke.page).toBe(2)
  })

  test('simplifies dense drawing points', () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ x: i * 0.1, y: 0 }))
    const stroke = createLocalStroke({ points, color: '#111', width: 10, tool: 'pen' }, 0)
    if (!('points' in stroke)) throw new Error('expected drawing stroke')
    expect(stroke.points.length).toBeLessThan(points.length)
    // Endpoints survive simplification.
    expect(stroke.points[0]).toEqual(points[0])
    expect(stroke.points[stroke.points.length - 1]).toEqual(points[points.length - 1])
  })

  test('pdf element height snaps to the current page height', () => {
    const stroke = createLocalStroke({
      type: 'pdf',
      src: '/a.pdf',
      x: 0,
      y: 0,
      width: 100,
      height: 999,
      pageCount: 2,
      pageGap: 24,
      pageHeights: [120, 150],
      currentPageIndex: 1,
    }, 0)
    if (stroke.type !== 'pdf') throw new Error('expected pdf stroke')
    expect(stroke.height).toBe(150)
  })
})

describe('persistableStroke', () => {
  test('strips runtime-only fields from drawing strokes', () => {
    const stroke: CanvasStroke = {
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      color: '#111',
      width: 3,
      tool: 'pen',
      localId: 'x',
      pending: true,
      failed: true,
      retryCount: 2,
    }
    const persisted = persistableStroke(stroke) as unknown as Record<string, unknown>
    expect(persisted.localId).toBeUndefined()
    expect(persisted.pending).toBeUndefined()
    expect(persisted.failed).toBeUndefined()
    expect(persisted.points).toEqual(stroke.points)
  })
})

describe('parseStrokeRow', () => {
  test('parses a valid drawing stroke', () => {
    const parsed = parseStrokeRow(row({
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      color: '#123456',
      width: 4,
      tool: 'pen',
      opacity: 0.5,
      blend: 'multiply',
    }))
    expect(parsed).not.toBeNull()
    if (!parsed || !('points' in parsed)) throw new Error('expected drawing stroke')
    expect(parsed.id).toBe(1)
    expect(parsed.blend).toBe('multiply')
    expect(parsed.opacity).toBe(0.5)
  })

  test('rejects malformed JSON and bad shapes', () => {
    expect(parseStrokeRow(row('not json'))).toBeNull()
    expect(parseStrokeRow(row({ points: [{ x: 0, y: 0 }], color: '#111', width: 3, tool: 'pen' }))).toBeNull() // < 2 points
    expect(parseStrokeRow(row({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#111', width: 3, tool: 'spray' }))).toBeNull() // unknown tool
  })

  test('rejects an image element without src or with non-finite bounds', () => {
    expect(parseStrokeRow(row({ type: 'image', src: '', x: 0, y: 0, width: 10, height: 10 }))).toBeNull()
    expect(parseStrokeRow(row({ type: 'image', src: '/a.png', x: 'NaN?', y: 0, width: 10, height: 10 }))).toBeNull()
  })

  test('legacy pdf rows without currentPageIndex migrate to single-page mode', () => {
    const parsed = parseStrokeRow(row({
      type: 'pdf',
      src: '/a.pdf',
      x: 0,
      y: 0,
      width: 100,
      height: 999, // legacy stacked height — must be replaced
      pageCount: 2,
      pageGap: 24,
      pageHeights: [120, 150],
    }))
    expect(parsed).not.toBeNull()
    if (!parsed || parsed.type !== 'pdf') throw new Error('expected pdf stroke')
    expect(parsed.currentPageIndex).toBe(0)
    expect(parsed.height).toBe(120)
  })

  test('mindmap rows drop edges that reference missing nodes', () => {
    const parsed = parseStrokeRow(row({
      type: 'mindmap',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      fontSize: 18,
      nodes: [{ id: 'root', text: '中心', x: 10, y: 10, width: 100, height: 40 }],
      edges: [
        { from: 'root', to: 'ghost' },
      ],
    }))
    expect(parsed).not.toBeNull()
    if (!parsed || parsed.type !== 'mindmap') throw new Error('expected mindmap stroke')
    expect(parsed.edges).toEqual([])
  })
})

describe('applySavedRow', () => {
  test('adopts the server identity and clears retry state', () => {
    const stroke: CanvasStroke = {
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      color: '#111',
      width: 3,
      tool: 'pen',
      localId: 'x',
      pending: true,
      failed: true,
      retryCount: 3,
    }
    applySavedRow(stroke, row({}, { id: 42, created_at: 123, page: 1 }))
    expect(stroke.id).toBe(42)
    expect(stroke.page).toBe(1)
    expect(stroke.pending).toBe(false)
    expect(stroke.failed).toBe(false)
    expect(stroke.retryCount).toBe(0)
  })
})
