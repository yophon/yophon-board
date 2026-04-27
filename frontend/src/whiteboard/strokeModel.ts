import type { CanvasStroke, Point, StrokeData, StrokeRow } from './types'

export function getDistance(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export function getCenter(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

export function createLocalStroke(stroke: StrokeData, page: number): CanvasStroke {
  return {
    points: simplifyPoints(stroke.points, stroke.width),
    color: stroke.color,
    width: stroke.width,
    tool: stroke.tool,
    opacity: stroke.opacity ?? 1,
    blend: stroke.blend ?? 'normal',
    page,
    localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  }
}

export function persistableStroke(stroke: StrokeData): StrokeData {
  return {
    points: stroke.points,
    color: stroke.color,
    width: stroke.width,
    tool: stroke.tool,
    opacity: stroke.opacity ?? 1,
    blend: stroke.blend ?? 'normal',
  }
}

export function parseStrokeRow(row: StrokeRow): CanvasStroke | null {
  try {
    const stroke = JSON.parse(row.stroke_data) as StrokeData
    if (!Array.isArray(stroke.points) || stroke.points.length < 2) return null
    if (stroke.tool !== 'pen' && stroke.tool !== 'eraser') return null
    return {
      id: row.id,
      created_at: row.created_at,
      points: stroke.points
        .map(point => ({ x: Number(point.x), y: Number(point.y) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)),
      color: typeof stroke.color === 'string' ? stroke.color : '#202124',
      width: Number.isFinite(Number(stroke.width)) ? Number(stroke.width) : 3,
      tool: stroke.tool,
      opacity: Number.isFinite(Number(stroke.opacity)) ? Number(stroke.opacity) : 1,
      blend: stroke.blend === 'multiply' ? 'multiply' : 'normal',
      page: row.page ?? 0,
    }
  } catch {
    return null
  }
}

export function applySavedRow(stroke: CanvasStroke, row: StrokeRow) {
  stroke.id = row.id
  stroke.created_at = row.created_at
  stroke.page = row.page ?? stroke.page
  stroke.pending = false
  stroke.failed = false
  stroke.retryCount = 0
  if (stroke.retryTimer) {
    window.clearTimeout(stroke.retryTimer)
    stroke.retryTimer = undefined
  }
}

function simplifyPoints(points: Point[], width: number): Point[] {
  const minDistance = Math.max(2, width * 0.15)
  const thresholdSq = minDistance * minDistance
  const simplified: Point[] = [points[0]]

  for (let i = 1; i < points.length - 1; i++) {
    const prev = simplified[simplified.length - 1]
    if (distanceSq(prev, points[i]) >= thresholdSq) {
      simplified.push(points[i])
    }
  }
  simplified.push(points[points.length - 1])

  if (simplified.length <= 800) return simplified

  const sampled: Point[] = [simplified[0]]
  const step = (simplified.length - 2) / 798
  for (let i = 1; i < 799; i++) {
    sampled.push(simplified[Math.round(i * step)])
  }
  sampled.push(simplified[simplified.length - 1])
  return sampled
}

function distanceSq(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
