import { computed, ref } from 'vue'
import { elementKey } from '../whiteboard/selection'
import type { CanvasStroke } from '../whiteboard/types'

/**
 * Local undo stack. Two kinds of entries:
 *
 * - `create`: an element created in this session — undo deletes it.
 * - `mutate`: an in-place edit of an existing element (mind-map structure
 *   changes, node text edits, reattaches) — undo restores the `before`
 *   snapshot. The live element is referenced by object identity, which
 *   stays stable across the local→server id transition.
 */
export type HistoryEntry =
  | { kind: 'create'; stroke: CanvasStroke }
  | { kind: 'mutate'; element: CanvasStroke; before: CanvasStroke }

export function useWhiteboardHistory() {
  const undoStack = ref<HistoryEntry[]>([])
  const canUndo = computed(() => undoStack.value.length > 0)

  function push(stroke: CanvasStroke) {
    undoStack.value.push({ kind: 'create', stroke })
  }

  function pushMutation(element: CanvasStroke, before: CanvasStroke) {
    undoStack.value.push({ kind: 'mutate', element, before })
  }

  function pop(): HistoryEntry | undefined {
    return undoStack.value.pop()
  }

  function entryKey(entry: HistoryEntry): string {
    return elementKey(entry.kind === 'create' ? entry.stroke : entry.element)
  }

  /** Drop entries for erased elements so undo doesn't resurrect deleted work. */
  function removeByKeys(keys: ReadonlySet<string>) {
    if (keys.size === 0) return
    undoStack.value = undoStack.value.filter(entry => !keys.has(entryKey(entry)))
  }

  function removeById(id: number) {
    undoStack.value = undoStack.value.filter(entry => (entry.kind === 'create' ? entry.stroke.id : entry.element.id) !== id)
  }

  function clear() {
    undoStack.value = []
  }

  return { undoStack, canUndo, push, pushMutation, pop, removeByKeys, removeById, clear }
}
