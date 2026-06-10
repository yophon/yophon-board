/**
 * Wire-format types shared between the Bun backend (src/) and the Vue
 * frontend (frontend/src/). Anything serialized over REST or WebSocket
 * belongs here so the two sides cannot drift apart silently.
 */

/** REST: a stroke row as serialized to clients (`toPublicStroke`). */
export interface PublicStrokeRow {
  id: number
  stroke_data: string
  created_at: number
  page?: number
}

/** REST: a project/board as serialized to clients (`toPublicBoard`). */
export interface PublicBoard {
  id: number
  slug: string
  title: string
  visibility: string
  created_at: number
}

/** REST: response of the asset upload endpoint. */
export interface UploadedAsset {
  asset_id: string
  url: string
  mime: string
  size: number
  /** Newer backends tag assets by kind; older clients default to "image". */
  kind?: 'image' | 'pdf'
}

/** WebSocket fan-out messages broadcast per board. */
export type BoardWsMessage =
  | { type: 'connected'; board?: string }
  | { type: 'stroke-created'; stroke: PublicStrokeRow; local_id?: string; page?: number }
  | { type: 'stroke-updated'; stroke: PublicStrokeRow; page?: number }
  | { type: 'stroke-deleted'; id: number; page?: number }
  | { type: 'strokes-cleared'; page?: number }
