export interface Point {
  x: number
  y: number
}

export interface StrokeData {
  points: Point[]
  color: string
  width: number
  tool: 'pen' | 'eraser'
  opacity?: number
  blend?: 'normal' | 'multiply'
}

export interface CanvasStroke extends StrokeData {
  id?: number
  localId?: string
  created_at?: number
  page?: number
  pending?: boolean
  failed?: boolean
  retryCount?: number
  retryTimer?: number
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
  | { type: 'stroke-deleted'; id: number; page?: number }
  | { type: 'strokes-cleared'; page?: number }
