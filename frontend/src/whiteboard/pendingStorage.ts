import type { CanvasStroke } from './types'

const PENDING_STORAGE_KEY = 'yophon_board_pending_v1'
const LEGACY_CLIENT_ID_KEY = 'yophon_graffiti_client_id'

export function ensureLegacyClientId() {
  try {
    const existing = localStorage.getItem(LEGACY_CLIENT_ID_KEY)
    if (existing) return existing
    const next = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(LEGACY_CLIENT_ID_KEY, next)
    return next
  } catch {
    return ''
  }
}

function readStoredStrokes(boardSlug: string): CanvasStroke[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as { boardSlug?: string; strokes?: CanvasStroke[] }
    if (data.boardSlug !== boardSlug) return []
    return data.strokes || []
  } catch {
    return []
  }
}

/** Unsaved strokes previously persisted for the given page of this board. */
export function loadPendingStrokes(boardSlug: string, page: number): CanvasStroke[] {
  return readStoredStrokes(boardSlug)
    .filter(stroke => (stroke.page ?? 0) === page)
    .map(stroke => ({ ...stroke, pending: false, failed: true, retryTimer: undefined, transformRetryTimer: undefined }))
}

/**
 * Persist the unsaved strokes from the in-memory array. Only entries for
 * `page` are replaced — strokes saved for other pages stay untouched, so
 * switching pages doesn't drop another page's offline backlog.
 */
export function savePendingStrokes(boardSlug: string, strokes: CanvasStroke[], page: number) {
  try {
    const fresh = strokes
      .filter(stroke => !stroke.id && (stroke.failed || stroke.pending))
      .map(serializePendingStroke)
    const freshIds = new Set(fresh.map(stroke => stroke.localId))
    const others = readStoredStrokes(boardSlug)
      .filter(stroke => (stroke.page ?? 0) !== page && !freshIds.has(stroke.localId))
    const all = [...others, ...fresh]
    if (all.length === 0) localStorage.removeItem(PENDING_STORAGE_KEY)
    else localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify({ boardSlug, strokes: all }))
  } catch {
    // localStorage might be full or disabled; non-fatal.
  }
}

function serializePendingStroke(stroke: CanvasStroke) {
  if (stroke.type === 'image') {
    return {
      type: 'image' as const,
      src: stroke.src,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation,
      mime: stroke.mime,
      page: stroke.page,
      localId: stroke.localId,
      retryCount: stroke.retryCount,
    }
  }

  if (stroke.type === 'text') {
    return {
      type: 'text' as const,
      text: stroke.text,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation,
      fontSize: stroke.fontSize,
      color: stroke.color,
      align: stroke.align,
      bold: stroke.bold,
      italic: stroke.italic,
      page: stroke.page,
      localId: stroke.localId,
      retryCount: stroke.retryCount,
    }
  }

  if (stroke.type === 'pdf') {
    return {
      type: 'pdf' as const,
      src: stroke.src,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation,
      pageCount: stroke.pageCount,
      pageGap: stroke.pageGap,
      pageHeights: stroke.pageHeights,
      currentPageIndex: stroke.currentPageIndex,
      page: stroke.page,
      localId: stroke.localId,
      retryCount: stroke.retryCount,
    }
  }

  if (stroke.type === 'mindmap') {
    return {
      type: 'mindmap' as const,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation,
      fontSize: stroke.fontSize,
      layout: stroke.layout,
      theme: stroke.theme,
      nodes: stroke.nodes.map(node => ({ ...node })),
      edges: stroke.edges.map(edge => ({ ...edge })),
      page: stroke.page,
      localId: stroke.localId,
      retryCount: stroke.retryCount,
    }
  }

  return {
    points: stroke.points,
    color: stroke.color,
    width: stroke.width,
    tool: stroke.tool,
    opacity: stroke.opacity,
    blend: stroke.blend,
    page: stroke.page,
    localId: stroke.localId,
    retryCount: stroke.retryCount,
  }
}
