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

export type StrokeData = DrawingStrokeData | ImageElementData | TextElementData

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
