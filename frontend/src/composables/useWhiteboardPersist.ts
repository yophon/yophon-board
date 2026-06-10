import { computed, onBeforeUnmount, type Ref } from 'vue'
import { api } from './useApi'
import { savePendingStrokes } from '../whiteboard/pendingStorage'
import { elementKey } from '../whiteboard/selection'
import { applySavedRow, persistableStroke } from '../whiteboard/strokeModel'
import type { CanvasStroke, StrokeRow } from '../whiteboard/types'

interface UseWhiteboardPersistOptions {
  boardSlug: () => string
  currentPage: Ref<number>
  strokes: Ref<CanvasStroke[]>
  lastSyncedId: Ref<number>
  setStatus: (message: string) => void
  /** Stroke data changed — invalidate render caches and repaint. */
  notifyStrokesChanged: () => void
  /** A stroke's identity moved from `local:` to `id:` — remap selection keys etc. */
  onStrokeKeyChanged: (previousKey: string, nextKey: string) => void
}

const TRANSFORM_RETRY_DELAY = 3000
const ERASE_RETRY_DELAY = 3000

/**
 * Persistence pipeline for the whiteboard. Owns every API write and its
 * failure handling:
 *
 * - stroke creation (POST) with exponential-backoff retry and a
 *   localStorage mirror for offline recovery,
 * - element transforms (PATCH) with per-element in-flight coalescing so a
 *   transform made while a save is flying is never silently dropped, and
 *   the server echo never clobbers newer local edits,
 * - erase batches (per-page id queues) that survive request failures and
 *   retry instead of silently reverting the user's erase,
 * - discard bookkeeping for unsaved strokes removed locally (undo/erase)
 *   while their POST may still land server-side.
 */
export function useWhiteboardPersist(options: UseWhiteboardPersistOptions) {
  const { strokes, currentPage, lastSyncedId } = options

  // Unsaved strokes erased/undone locally while their POST may be in flight,
  // keyed by `local:<localId>`. When the create lands we delete it remotely.
  const erasedPendingKeys = new Set<string>()
  // Server ids we deleted before their `stroke-created` broadcast arrived;
  // the sync layer uses this to avoid resurrecting them.
  const discardedIds = new Set<number>()
  // Elements transformed before their creation POST finished.
  const transformResaveQueue = new Set<CanvasStroke>()
  // PATCH coalescing.
  const inFlightTransforms = new Set<CanvasStroke>()
  const queuedTransforms = new Set<CanvasStroke>()
  // Erase queues.
  const pendingEraseUpdateKeys = new Set<string>()
  const pendingEraseIdsByPage = new Map<number, Set<number>>()
  let eraseFlushInFlight = false
  let eraseFlushAgain = false
  let eraseRetryTimer: number | null = null
  let retryCooldownTimer: number | null = null

  const failedCount = computed(() => strokes.value.filter(s => s.failed && !s.id).length)

  function persistPendingMirror() {
    savePendingStrokes(options.boardSlug(), strokes.value, currentPage.value)
  }

  // —— creation (POST) ——

  async function saveStroke(stroke: CanvasStroke) {
    if (stroke.id || stroke.pending) return
    stroke.pending = true
    stroke.failed = false
    options.setStatus('')
    const previousKey = elementKey(stroke)

    try {
      const row = await api<StrokeRow>(`/api/projects/${options.boardSlug()}/strokes`, {
        method: 'POST',
        body: JSON.stringify({
          stroke_data: JSON.stringify(persistableStroke(stroke)),
          local_id: stroke.localId,
          page: stroke.page ?? currentPage.value,
        }),
      })
      applySavedRow(stroke, row)
      if (row.id > lastSyncedId.value) lastSyncedId.value = row.id
      options.onStrokeKeyChanged(previousKey, elementKey(stroke))
      if (erasedPendingKeys.delete(previousKey)) {
        // Erased/undone while the create was in flight: remove locally and
        // delete the freshly created server row.
        strokes.value = strokes.value.filter(item => item !== stroke)
        queueEraseId(row.id, stroke.page ?? currentPage.value)
        void flushPendingEraseChanges()
      } else if (transformResaveQueue.delete(stroke)) {
        void saveElementTransform(stroke)
      }
    } catch {
      stroke.failed = true
      stroke.retryCount = (stroke.retryCount || 0) + 1
      options.setStatus('保存失败，自动重试中')
      scheduleStrokeRetry(stroke)
    } finally {
      stroke.pending = false
      persistPendingMirror()
      options.notifyStrokesChanged()
    }
  }

  function scheduleStrokeRetry(stroke: CanvasStroke) {
    if (stroke.id || stroke.retryTimer) return
    const retryCount = stroke.retryCount || 1
    const delay = Math.min(30000, 1200 * 2 ** Math.min(retryCount - 1, 5))
    stroke.retryTimer = window.setTimeout(() => {
      stroke.retryTimer = undefined
      // The stroke may have been undone/erased while waiting.
      if (!strokes.value.includes(stroke)) return
      void saveStroke(stroke)
    }, delay)
  }

  async function retryFailedSaves() {
    if (retryCooldownTimer) return
    const failed = strokes.value.filter(stroke => stroke.failed && !stroke.id)
    for (const stroke of failed) {
      if (stroke.retryTimer) {
        window.clearTimeout(stroke.retryTimer)
        stroke.retryTimer = undefined
      }
      await saveStroke(stroke)
    }
    retryCooldownTimer = window.setTimeout(() => {
      retryCooldownTimer = null
    }, 600)
  }

  async function flushPendingStrokes() {
    const pending = strokes.value.filter(stroke => !stroke.id && stroke.failed)
    for (const stroke of pending) {
      if (stroke.retryTimer) {
        window.clearTimeout(stroke.retryTimer)
        stroke.retryTimer = undefined
      }
      await saveStroke(stroke)
    }
  }

  /**
   * The caller removed an unsaved stroke from the board (undo or erase).
   * Cancels its retry and, if a POST is in flight, remembers to delete the
   * server row once that POST lands.
   */
  function markUnsavedStrokeDiscarded(stroke: CanvasStroke) {
    if (stroke.retryTimer) {
      window.clearTimeout(stroke.retryTimer)
      stroke.retryTimer = undefined
    }
    transformResaveQueue.delete(stroke)
    if (stroke.pending) erasedPendingKeys.add(elementKey(stroke))
    persistPendingMirror()
  }

  /** Sync layer: a broadcast `stroke-created` matches a stroke we already discarded. */
  function consumeDiscardedLocalId(localId: string): boolean {
    return erasedPendingKeys.delete(`local:${localId}`)
  }

  function isIdDiscarded(id: number): boolean {
    return discardedIds.has(id)
  }

  // —— transforms (PATCH) ——

  async function saveElementTransform(element: CanvasStroke) {
    persistPendingMirror()
    if (!element.id) {
      // Creation not confirmed yet — resave the transform once it is.
      if (strokes.value.includes(element)) transformResaveQueue.add(element)
      options.notifyStrokesChanged()
      return
    }
    if (inFlightTransforms.has(element)) {
      queuedTransforms.add(element)
      return
    }
    if (element.transformRetryTimer) {
      window.clearTimeout(element.transformRetryTimer)
      element.transformRetryTimer = undefined
    }
    inFlightTransforms.add(element)
    try {
      do {
        queuedTransforms.delete(element)
        await api<StrokeRow>(`/api/projects/${options.boardSlug()}/strokes/${element.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            stroke_data: JSON.stringify(persistableStroke(element)),
            page: element.page ?? currentPage.value,
          }),
        })
        // Local state stays authoritative for geometry: applying the echo
        // here would clobber edits made while the request was in flight.
      } while (queuedTransforms.has(element))
    } catch {
      options.setStatus('元素更新失败，自动重试中')
      scheduleTransformRetry(element)
    } finally {
      inFlightTransforms.delete(element)
      options.notifyStrokesChanged()
    }
  }

  function scheduleTransformRetry(element: CanvasStroke) {
    if (element.transformRetryTimer) return
    element.transformRetryTimer = window.setTimeout(() => {
      element.transformRetryTimer = undefined
      if (!strokes.value.includes(element)) return
      void saveElementTransform(element)
    }, TRANSFORM_RETRY_DELAY)
  }

  /** Whether this element has unsynced local edits (in-flight or queued PATCH). */
  function isElementSyncBusy(element: CanvasStroke): boolean {
    return (
      inFlightTransforms.has(element) ||
      queuedTransforms.has(element) ||
      transformResaveQueue.has(element) ||
      !!element.transformRetryTimer
    )
  }

  // —— erase ——

  function queueEraseId(id: number, page: number) {
    discardedIds.add(id)
    let set = pendingEraseIdsByPage.get(page)
    if (!set) {
      set = new Set()
      pendingEraseIdsByPage.set(page, set)
    }
    set.add(id)
  }

  function queueEraseUpdate(key: string) {
    pendingEraseUpdateKeys.add(key)
  }

  function hasQueuedEraseIds(): boolean {
    for (const set of pendingEraseIdsByPage.values()) {
      if (set.size > 0) return true
    }
    return false
  }

  async function flushPendingEraseChanges() {
    // Trimmed strokes (cut-mode erase): self-retrying PATCH saves.
    if (pendingEraseUpdateKeys.size > 0) {
      const keys = Array.from(pendingEraseUpdateKeys)
      pendingEraseUpdateKeys.clear()
      for (const key of keys) {
        const element = strokes.value.find(stroke => elementKey(stroke) === key)
        if (element?.id) void saveElementTransform(element)
      }
    }

    if (!hasQueuedEraseIds()) return
    if (eraseFlushInFlight) {
      eraseFlushAgain = true
      return
    }
    eraseFlushInFlight = true
    try {
      for (const [page, ids] of pendingEraseIdsByPage) {
        if (ids.size === 0) continue
        const batch = Array.from(ids)
        try {
          await api(`/api/projects/${options.boardSlug()}/strokes/erase`, {
            method: 'POST',
            body: JSON.stringify({ ids: batch, page }),
          })
          for (const id of batch) ids.delete(id)
        } catch {
          // Keep the ids queued; retry instead of reverting the user's erase.
          options.setStatus('擦除同步失败，自动重试中')
          scheduleEraseRetry()
        }
      }
    } finally {
      eraseFlushInFlight = false
      if (eraseFlushAgain) {
        eraseFlushAgain = false
        void flushPendingEraseChanges()
      }
    }
  }

  function scheduleEraseRetry() {
    if (eraseRetryTimer !== null) return
    eraseRetryTimer = window.setTimeout(() => {
      eraseRetryTimer = null
      void flushPendingEraseChanges()
    }, ERASE_RETRY_DELAY)
  }

  onBeforeUnmount(() => {
    if (eraseRetryTimer !== null) window.clearTimeout(eraseRetryTimer)
    if (retryCooldownTimer !== null) window.clearTimeout(retryCooldownTimer)
    for (const stroke of strokes.value) {
      if (stroke.retryTimer) window.clearTimeout(stroke.retryTimer)
      if (stroke.transformRetryTimer) window.clearTimeout(stroke.transformRetryTimer)
    }
  })

  return {
    failedCount,
    saveStroke,
    retryFailedSaves,
    flushPendingStrokes,
    saveElementTransform,
    isElementSyncBusy,
    markUnsavedStrokeDiscarded,
    consumeDiscardedLocalId,
    isIdDiscarded,
    queueEraseId,
    queueEraseUpdate,
    flushPendingEraseChanges,
    persistPendingMirror,
  }
}
