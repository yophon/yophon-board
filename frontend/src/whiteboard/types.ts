export interface Point {
  x: number
  y: number
}

export interface DrawingStrokeData {
  type?: 'stroke'
  points: Point[]
  color: string
  width: number
  tool: 'pen' | 'eraser'
  opacity?: number
  blend?: 'normal' | 'multiply'
}

export interface ImageElementData {
  type: 'image'
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  mime?: string
}

export interface PdfElementData {
  type: 'pdf'
  src: string
  x: number
  y: number
  width: number
  /**
   * In single-page mode the element's height equals
   * `pageHeights[currentPageIndex]`. We re-assign on every page flip so
   * pages with different aspect ratios keep their natural shape.
   */
  height: number
  rotation?: number
  pageCount: number
  /**
   * Legacy: in the old vertical-stack layout this was the spacing
   * between pages. Single-page mode ignores it but the field is kept on
   * the wire so a downgrade doesn't break older clients reading new
   * data.
   */
  pageGap: number
  /**
   * Per-page heights (world units) AFTER scaling all pages to the
   * element's full width. Used to resize the element when the user
   * flips pages.
   */
  pageHeights: number[]
  /**
   * 0-based index of the page currently shown. Defaults to 0 when
   * absent (legacy multi-page elements).
   */
  currentPageIndex?: number
}

export interface TextElementData {
  type: 'text'
  text: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  fontSize: number
  color: string
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  italic?: boolean
}

export type StrokeData = DrawingStrokeData | ImageElementData | TextElementData | PdfElementData

export type CanvasStroke = StrokeData & {
  id?: number
  localId?: string
  created_at?: number
  page?: number
  pending?: boolean
  failed?: boolean
  retryCount?: number
  retryTimer?: number
}

export interface UploadedImageAsset {
  asset_id: string
  url: string
  mime: string
  size: number
  /** New backend tags assets by kind; older clients can default to "image". */
  kind?: 'image' | 'pdf'
}

export interface StrokeRow {
  id: number
  stroke_data: string
  created_at: number
  page?: number
}

export type WsState = 'offline' | 'connecting' | 'online'

export type WhiteboardWsMessage =
  | { type: 'connected' }
  | { type: 'stroke-created'; stroke: StrokeRow; local_id?: string; page?: number }
  | { type: 'stroke-updated'; stroke: StrokeRow; page?: number }
  | { type: 'stroke-deleted'; id: number; page?: number }
  | { type: 'strokes-cleared'; page?: number }
