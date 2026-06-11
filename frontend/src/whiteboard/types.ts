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

export interface MindMapNodeData {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
  /** Auto branch/theme color, rewritten on every layout. User overrides live in `fillColor`. */
  color?: string
  branch?: 'left' | 'right'
  collapsed?: boolean
  /** @deprecated Free-position drag was removed; kept on the wire for old rows. */
  manualPosition?: boolean
  /** User style overrides; unset fields fall back to the branch/theme defaults. */
  fillColor?: string
  borderColor?: string
  textColor?: string
  bold?: boolean
  italic?: boolean
}

export interface MindMapEdgeData {
  from: string
  to: string
  stroke?: string
}

export interface MindMapElementData {
  type: 'mindmap'
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  fontSize: number
  /**
   * Uniform scale applied to all layout constants (node sizes, gaps,
   * padding). Set by element resize so the map keeps its proportions
   * through later re-layouts. Defaults to 1; clamped to [0.5, 3].
   */
  nodeScale?: number
  layout?: 'mind'
  theme?: 'drawnix'
  nodes: MindMapNodeData[]
  edges: MindMapEdgeData[]
}

export type StrokeData = DrawingStrokeData | ImageElementData | TextElementData | PdfElementData | MindMapElementData

export type CanvasStroke = StrokeData & {
  id?: number
  localId?: string
  created_at?: number
  page?: number
  pending?: boolean
  failed?: boolean
  retryCount?: number
  retryTimer?: number
  /** Retry timer for failed PATCH (transform) saves; creation retries use `retryTimer`. */
  transformRetryTimer?: number
}

// Wire-format types live in shared/types.ts so the backend and frontend
// cannot drift apart; re-exported here under their historical names.
export type {
  PublicStrokeRow as StrokeRow,
  UploadedAsset as UploadedImageAsset,
  BoardWsMessage as WhiteboardWsMessage,
} from '../../../shared/types'

export type WsState = 'offline' | 'connecting' | 'online'
