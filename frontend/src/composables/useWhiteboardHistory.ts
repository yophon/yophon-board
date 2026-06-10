import { computed, ref } from 'vue'
import { elementKey } from '../whiteboard/selection'
import type { CanvasStroke } from '../whiteboard/types'

/**
 * Local undo stack for elements created in this session (strokes, text,
 * images, PDFs, mind maps). Undo pops the most recent creation; the caller
 * is responsible for removing it from the board (and the server when it
 * already has an id).
 */
export function useWhiteboardHistory() {
  const undoStack = ref<CanvasStroke[]>([])
  const canUndo = computed(() => undoStack.value.length > 0)

  function push(stroke: CanvasStroke) {
    undoStack.value.push(stroke)
  }

  function pop(): CanvasStroke | undefined {
    return undoStack.value.pop()
  }

  /** Drop entries that were erased so undo doesn't resurrect deleted work. */
  function removeByKeys(keys: ReadonlySet<string>) {
    if (keys.size === 0) return
    undoStack.value = undoStack.value.filter(stroke => !keys.has(elementKey(stroke)))
  }

  function removeById(id: number) {
    undoStack.value = undoStack.value.filter(stroke => stroke.id !== id)
  }

  function clear() {
    undoStack.value = []
  }

  return { undoStack, canUndo, push, pop, removeByKeys, removeById, clear }
}
