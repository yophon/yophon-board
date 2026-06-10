import { beforeEach, describe, expect, test } from 'bun:test'
import { loadPendingStrokes, savePendingStrokes } from '../src/whiteboard/pendingStorage'
import type { CanvasStroke } from '../src/whiteboard/types'

// Minimal localStorage stand-in for the bun test environment.
function installLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  }
  return store
}

function unsavedStroke(localId: string, page: number): CanvasStroke {
  return {
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    color: '#111',
    width: 3,
    tool: 'pen',
    localId,
    page,
    failed: true,
  }
}

describe('pendingStorage', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  test('round-trips unsaved strokes per page', () => {
    savePendingStrokes('main', [unsavedStroke('a', 0)], 0)
    const restored = loadPendingStrokes('main', 0)
    expect(restored.length).toBe(1)
    expect(restored[0].localId).toBe('a')
    // Restored strokes are marked failed so the retry pipeline picks them up.
    expect(restored[0].failed).toBe(true)
    expect(restored[0].pending).toBe(false)
  })

  test('saved strokes are excluded from the mirror', () => {
    savePendingStrokes('main', [{ ...unsavedStroke('a', 0), id: 5, failed: false }], 0)
    expect(loadPendingStrokes('main', 0)).toEqual([])
  })

  test('saving one page keeps another page\'s backlog', () => {
    savePendingStrokes('main', [unsavedStroke('p0', 0)], 0)
    // Simulate switching to page 1 and saving its (empty) state.
    savePendingStrokes('main', [], 1)
    expect(loadPendingStrokes('main', 0).map(s => s.localId)).toEqual(['p0'])

    // Page 1 gains a stroke; page 0's backlog still survives.
    savePendingStrokes('main', [unsavedStroke('p1', 1)], 1)
    expect(loadPendingStrokes('main', 0).map(s => s.localId)).toEqual(['p0'])
    expect(loadPendingStrokes('main', 1).map(s => s.localId)).toEqual(['p1'])
  })

  test('saving a page replaces that page\'s previous entries', () => {
    savePendingStrokes('main', [unsavedStroke('old', 0)], 0)
    savePendingStrokes('main', [unsavedStroke('new', 0)], 0)
    expect(loadPendingStrokes('main', 0).map(s => s.localId)).toEqual(['new'])
  })

  test('an empty save on the only page clears storage', () => {
    savePendingStrokes('main', [unsavedStroke('a', 0)], 0)
    savePendingStrokes('main', [], 0)
    expect(loadPendingStrokes('main', 0)).toEqual([])
  })

  test('a different board slug does not leak strokes', () => {
    savePendingStrokes('main', [unsavedStroke('a', 0)], 0)
    expect(loadPendingStrokes('other', 0)).toEqual([])
  })
})
