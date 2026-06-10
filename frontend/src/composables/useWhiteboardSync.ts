import type { Ref } from 'vue'
import { api } from './useApi'
import { elementKey } from '../whiteboard/selection'
import { applySavedRow, parseStrokeRow } from '../whiteboard/strokeModel'
import type { CanvasStroke, StrokeRow, WhiteboardWsMessage } from '../whiteboard/types'

interface UseWhiteboardSyncOptions {
  boardSlug: () => string
  currentPage: Ref<number>
  strokes: Ref<CanvasStroke[]>
  lastSyncedId: Ref<number>
  /** Domain normalization applied to every stroke entering the board (e.g. mind-map layout). */
  prepareStroke: (stroke: CanvasStroke) => CanvasStroke
  /**
   * True when the element has local edits the server doesn't know about yet
   * (in-flight PATCH, active transform, open editor). Remote updates for it
   * are skipped — our own save will win once it lands.
   */
  isElementSyncBlocked: (element: CanvasStroke) => boolean
  /** True when this server id was deleted locally before its broadcast arrived. */
  isIdDiscarded: (id: number) => boolean
  /** A broadcast `stroke-created` matches a stroke we already discarded locally. */
  consumeDiscardedLocalId: (localId: string) => boolean
  /** Ask the persist layer to delete a server row we never want (discarded create). */
  eraseRemoteId: (id: number, page: number) => void
  onPendingMirrorChanged: () => void
  onStrokesCleared: () => void
  onStrokeDeleted: (id: number) => void
  notifyStrokesChanged: () => void
  setStatus: (message: string) => void
}

/**
 * Applies server state to the local board: WebSocket fan-out messages and
 * the REST load (full or incremental). All conflict policy between remote
 * rows and local in-progress edits lives here.
 */
export function useWhiteboardSync(options: UseWhiteboardSyncOptions) {
  const { strokes, currentPage, lastSyncedId } = options

  function handleSocketMessage(event: MessageEvent) {
    let message: WhiteboardWsMessage
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }

    if (message.type === 'stroke-created') {
      if ((message.page ?? message.stroke.page ?? 0) !== currentPage.value) return
      const parsed = parseStrokeRow(message.stroke)
      if (!parsed) return
      options.prepareStroke(parsed)

      if (parsed.id && parsed.id > lastSyncedId.value) lastSyncedId.value = parsed.id

      if (message.local_id) {
        const local = strokes.value.find(stroke => stroke.localId === message.local_id)
        if (local) {
          applySavedRow(local, message.stroke)
          options.onPendingMirrorChanged()
          options.notifyStrokesChanged()
          return
        }
        // Our own stroke, but we discarded it (undo/erase) before the
        // create landed — delete the server row instead of resurrecting it.
        if (options.consumeDiscardedLocalId(message.local_id) && parsed.id) {
          options.eraseRemoteId(parsed.id, message.page ?? currentPage.value)
          return
        }
      }

      if (parsed.id && options.isIdDiscarded(parsed.id)) return
      if (strokes.value.some(stroke => stroke.id === parsed.id)) return
      strokes.value.push(parsed)
      options.notifyStrokesChanged()
      return
    }

    if (message.type === 'strokes-cleared') {
      if ((message.page ?? 0) !== currentPage.value) return
      strokes.value = strokes.value.filter(stroke => stroke.pending || stroke.failed)
      options.onStrokesCleared()
      options.notifyStrokesChanged()
      return
    }

    if (message.type === 'stroke-updated') {
      if ((message.page ?? message.stroke.page ?? 0) !== currentPage.value) return
      const parsed = parseStrokeRow(message.stroke)
      if (!parsed) return
      options.prepareStroke(parsed)
      const existing = strokes.value.find(stroke => stroke.id === parsed.id)
      if (existing) {
        // Don't clobber an element the user is editing or whose newer state
        // is still on its way to the server.
        if (options.isElementSyncBlocked(existing)) return
        const localId = existing.localId
        Object.assign(existing, parsed, { localId })
      } else {
        if (parsed.id && options.isIdDiscarded(parsed.id)) return
        strokes.value.push(parsed)
      }
      options.notifyStrokesChanged()
      return
    }

    if (message.type === 'stroke-deleted') {
      if ((message.page ?? 0) !== currentPage.value) return
      strokes.value = strokes.value.filter(stroke => stroke.id !== message.id)
      options.onStrokeDeleted(message.id)
      options.notifyStrokesChanged()
    }
  }

  async function loadExistingStrokes(incremental = false) {
    const page = currentPage.value
    const since = incremental ? lastSyncedId.value : 0
    try {
      const url = `/api/projects/${options.boardSlug()}/strokes?page=${page}${since > 0 ? `&since=${since}` : ''}`
      const rows = await api<StrokeRow[]>(url)
      if (page !== currentPage.value) return
      const parsed = rows
        .map(parseStrokeRow)
        .filter((stroke): stroke is CanvasStroke => !!stroke)
        .map(options.prepareStroke)

      if (incremental) {
        const knownIds = new Set(strokes.value.map(stroke => stroke.id).filter((v): v is number => !!v))
        for (const stroke of parsed) {
          if (stroke.id && !knownIds.has(stroke.id) && !options.isIdDiscarded(stroke.id)) {
            strokes.value.push(stroke)
          }
        }
      } else {
        // Keep local objects for rows the user is still editing (or whose
        // edits are still syncing) so a reconnect doesn't revert them.
        const byId = new Map(
          strokes.value
            .filter(stroke => stroke.id)
            .map(stroke => [stroke.id as number, stroke]),
        )
        const merged = parsed
          .filter(row => !(row.id && options.isIdDiscarded(row.id)))
          .map(row => {
            const local = row.id ? byId.get(row.id) : undefined
            return local && options.isElementSyncBlocked(local) ? local : row
          })
        const unsaved = strokes.value.filter(
          stroke => !stroke.id && (stroke.pending || stroke.failed) && (stroke.page ?? page) === page,
        )
        strokes.value = [...merged, ...unsaved]
      }

      const maxId = parsed.reduce((m, s) => (s.id && s.id > m ? s.id : m), lastSyncedId.value)
      lastSyncedId.value = maxId
      options.notifyStrokesChanged()
    } catch {
      options.setStatus('加载失败')
    }
  }

  return { handleSocketMessage, loadExistingStrokes }
}
