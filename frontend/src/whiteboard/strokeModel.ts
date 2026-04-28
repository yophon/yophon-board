import type { CanvasStroke, Point, StrokeData, StrokeRow, TextElementData } from './types'

export function createLocalStroke(stroke: StrokeData, page: number): CanvasStroke {
  if (stroke.type === 'image') {
    return {
      type: 'image',
      src: stroke.src,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation ?? 0,
      mime: stroke.mime,
      page,
      localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }
  }

  if (stroke.type === 'text') {
    return {
      type: 'text',
      text: stroke.text,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation ?? 0,
      fontSize: stroke.fontSize,
      color: stroke.color,
      align: stroke.align ?? 'left',
      bold: stroke.bold ?? false,
      italic: stroke.italic ?? false,
      page,
      localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }
  }

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
  if (stroke.type === 'image') {
    return {
      type: 'image',
      src: stroke.src,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation ?? 0,
      mime: stroke.mime,
    }
  }

  if (stroke.type === 'text') {
    return {
      type: 'text',
      text: stroke.text,
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: stroke.rotation ?? 0,
      fontSize: stroke.fontSize,
      color: stroke.color,
      align: stroke.align ?? 'left',
      bold: stroke.bold ?? false,
      italic: stroke.italic ?? false,
    }
  }

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
    if (stroke.type === 'image') {
      const image = {
        id: row.id,
        created_at: row.created_at,
        type: 'image' as const,
        src: typeof stroke.src === 'string' ? stroke.src : '',
        x: Number(stroke.x),
        y: Number(stroke.y),
        width: Number(stroke.width),
        height: Number(stroke.height),
        rotation: Number.isFinite(Number(stroke.rotation)) ? Number(stroke.rotation) : 0,
        mime: typeof stroke.mime === 'string' ? stroke.mime : undefined,
        page: row.page ?? 0,
      }
      if (!image.src || !Number.isFinite(image.x) || !Number.isFinite(image.y) || !Number.isFinite(image.width) || !Number.isFinite(image.height)) return null
      return image
    }

    if (stroke.type === 'text') {
      const align: TextElementData['align'] = stroke.align === 'center' || stroke.align === 'right' ? stroke.align : 'left'
      const text = {
        id: row.id,
        created_at: row.created_at,
        type: 'text' as const,
        text: typeof stroke.text === 'string' ? stroke.text : '',
        x: Number(stroke.x),
        y: Number(stroke.y),
        width: Number(stroke.width),
        height: Number(stroke.height),
        rotation: Number.isFinite(Number(stroke.rotation)) ? Number(stroke.rotation) : 0,
        fontSize: Number.isFinite(Number(stroke.fontSize)) ? Number(stroke.fontSize) : 28,
        color: typeof stroke.color === 'string' ? stroke.color : '#202124',
        align,
        bold: stroke.bold === true,
        italic: stroke.italic === true,
        page: row.page ?? 0,
      }
      if (!text.text || !Number.isFinite(text.x) || !Number.isFinite(text.y) || !Number.isFinite(text.width) || !Number.isFinite(text.height)) return null
      return text
    }

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
