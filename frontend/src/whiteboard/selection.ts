import {
  degreesToRadians,
  distanceToSegmentSq,
  normalizeDegrees,
  radiansToDegrees,
  rotatePoint,
  segmentsIntersect,
} from './geometry'
import type { CanvasStroke, Point, StrokeData } from './types'

export type ImageStroke = Extract<CanvasStroke, { type: 'image' }>
export type TextStroke = Extract<CanvasStroke, { type: 'text' }>
export type RectElementStroke = ImageStroke | TextStroke
export type DrawingStroke = Extract<CanvasStroke, { points: Point[] }>
export type TransformMode = 'move' | 'resize-n' | 'resize-ne' | 'resize-e' | 'resize-se' | 'resize-s' | 'resize-sw' | 'resize-w' | 'resize-nw' | 'rotate'

export interface ElementGeometry {
  center: Point
  width: number
  height: number
  rotation: number
}

export interface ElementTransformState {
  mode: TransformMode
  startPointer: Point
  startElements: CanvasStroke[]
  startGeometry: ElementGeometry
  startAngle: number
}

export interface SelectionBox {
  left: number
  right: number
  top: number
  bottom: number
}

export function elementKey(element: CanvasStroke): string {
  return element.id ? `id:${element.id}` : `local:${element.localId || ''}`
}

export function isDrawingStroke(element: CanvasStroke | StrokeData): element is DrawingStroke {
  return 'points' in element
}

export function isRectElement(element: CanvasStroke | StrokeData): element is RectElementStroke {
  return element.type === 'image' || element.type === 'text'
}

export function cloneElement(element: CanvasStroke): CanvasStroke {
  if (isRectElement(element)) return { ...element }
  return {
    ...element,
    points: element.points.map(point => ({ ...point })),
  }
}

export function getHandleSize(scale: number) {
  return Math.max(10 / scale, 8)
}

export function getMinSelectionSize(scale: number) {
  return Math.max(56 / scale, 28)
}

export function getInteractiveGeometry(geometry: ElementGeometry, scale: number): ElementGeometry {
  const minSize = getMinSelectionSize(scale)
  return {
    ...geometry,
    width: Math.max(geometry.width, minSize),
    height: Math.max(geometry.height, minSize),
  }
}

export function getElementHandlePoints(geometry: ElementGeometry, scale: number) {
  const w = geometry.width
  const h = geometry.height
  const rotateOffset = 34 / scale
  return [
    { mode: 'resize-nw' as const, local: { x: -w / 2, y: -h / 2 } },
    { mode: 'resize-n' as const, local: { x: 0, y: -h / 2 } },
    { mode: 'resize-ne' as const, local: { x: w / 2, y: -h / 2 } },
    { mode: 'resize-e' as const, local: { x: w / 2, y: 0 } },
    { mode: 'resize-se' as const, local: { x: w / 2, y: h / 2 } },
    { mode: 'resize-s' as const, local: { x: 0, y: h / 2 } },
    { mode: 'resize-sw' as const, local: { x: -w / 2, y: h / 2 } },
    { mode: 'resize-w' as const, local: { x: -w / 2, y: 0 } },
    { mode: 'rotate' as const, local: { x: 0, y: -h / 2 - rotateOffset } },
  ]
}

export function hitTestElements(
  point: Point,
  elements: CanvasStroke[],
  selected: CanvasStroke[],
  scale: number,
): { element: CanvasStroke; mode: TransformMode } | null {
  if (selected.length > 0) {
    const geometry = getInteractiveGeometry(getSelectionGeometry(selected), scale)
    const handleMode = hitTestGeometryHandle(point, geometry, scale)
    if (handleMode) return { element: selected[0], mode: handleMode }
    if (isPointInsideGeometry(point, geometry)) return { element: selected[0], mode: 'move' }
  }

  for (let i = elements.length - 1; i >= 0; i--) {
    const stroke = elements[i]
    if (isDrawingStroke(stroke) && stroke.tool === 'eraser') continue
    if (isPointInsideElement(point, stroke, scale)) return { element: stroke, mode: 'move' }
  }

  return null
}

export function hitTestGeometryHandle(point: Point, geometry: ElementGeometry, scale: number): TransformMode | null {
  const local = worldToElementCenteredLocal(point, geometry)
  const hitSize = getHandleSize(scale) * 1.5
  for (const handle of getElementHandlePoints(geometry, scale)) {
    if (Math.abs(local.x - handle.local.x) <= hitSize / 2 && Math.abs(local.y - handle.local.y) <= hitSize / 2) {
      return handle.mode
    }
  }
  return null
}

export function isPointInsideGeometry(point: Point, geometry: ElementGeometry) {
  const local = worldToElementCenteredLocal(point, geometry)
  return Math.abs(local.x) <= geometry.width / 2 && Math.abs(local.y) <= geometry.height / 2
}

export function isPointInsideElement(point: Point, element: CanvasStroke, scale: number) {
  if (isRectElement(element)) {
    const geometry = getElementGeometry(element)
    return isPointInsideGeometry(point, geometry)
  }

  return isPointNearDrawingStroke(point, element, scale)
}

export function isPointNearDrawingStroke(point: Point, stroke: DrawingStroke, scale: number) {
  const tolerance = Math.max(8 / scale, stroke.width / 2 + 4 / scale)
  const thresholdSq = tolerance * tolerance
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (distanceToSegmentSq(point, stroke.points[i], stroke.points[i + 1]) <= thresholdSq) return true
  }
  return false
}

export function worldToElementCenteredLocal(point: Point, geometry: ElementGeometry): Point {
  return rotatePoint({
    x: point.x - geometry.center.x,
    y: point.y - geometry.center.y,
  }, -degreesToRadians(geometry.rotation))
}

export function elementLocalToWorld(local: Point, geometry: ElementGeometry): Point {
  const rotated = rotatePoint({
    x: local.x - geometry.width / 2,
    y: local.y - geometry.height / 2,
  }, degreesToRadians(geometry.rotation))
  return { x: geometry.center.x + rotated.x, y: geometry.center.y + rotated.y }
}

export function getElementGeometry(element: CanvasStroke): ElementGeometry {
  if (isRectElement(element)) {
    return {
      center: { x: element.x + element.width / 2, y: element.y + element.height / 2 },
      width: element.width,
      height: element.height,
      rotation: element.rotation ?? 0,
    }
  }

  const bounds = getDrawingStrokeBounds(element)
  return {
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
    rotation: 0,
  }
}

export function getSelectionGeometry(elements: CanvasStroke[]): ElementGeometry {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    for (const corner of getElementWorldCorners(element)) {
      minX = Math.min(minX, corner.x)
      minY = Math.min(minY, corner.y)
      maxX = Math.max(maxX, corner.x)
      maxY = Math.max(maxY, corner.y)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 1
    maxY = 1
  }
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    rotation: 0,
  }
}

export function getDrawingStrokeBounds(stroke: DrawingStroke) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

export function getElementWorldCorners(element: CanvasStroke): Point[] {
  const geometry = getElementGeometry(element)
  return [
    elementLocalToWorld({ x: 0, y: 0 }, geometry),
    elementLocalToWorld({ x: geometry.width, y: 0 }, geometry),
    elementLocalToWorld({ x: geometry.width, y: geometry.height }, geometry),
    elementLocalToWorld({ x: 0, y: geometry.height }, geometry),
  ]
}

export function elementIntersectsBox(element: CanvasStroke, box: SelectionBox, scale: number) {
  if (isRectElement(element)) {
    const corners = getElementWorldCorners(element)
    if (corners.some(point => pointInBox(point, box))) return true
    const boxCorners = [
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.right, y: box.bottom },
      { x: box.left, y: box.bottom },
    ]
    return boxCorners.some(point => isPointInsideElement(point, element, scale))
  }

  if (element.points.some(point => pointInBox(point, box))) return true
  const edges: Array<[Point, Point]> = [
    [{ x: box.left, y: box.top }, { x: box.right, y: box.top }],
    [{ x: box.right, y: box.top }, { x: box.right, y: box.bottom }],
    [{ x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }],
    [{ x: box.left, y: box.bottom }, { x: box.left, y: box.top }],
  ]
  for (let i = 0; i < element.points.length - 1; i++) {
    if (edges.some(([a, b]) => segmentsIntersect(element.points[i], element.points[i + 1], a, b))) return true
  }
  return false
}

export function pointInBox(point: Point, box: SelectionBox) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
}

export function applyElementTransform(pointer: Point, transform: ElementTransformState, elements: CanvasStroke[]) {
  const startGeometry = transform.startGeometry

  if (transform.mode === 'move') {
    const delta = {
      x: pointer.x - transform.startPointer.x,
      y: pointer.y - transform.startPointer.y,
    }
    for (const start of transform.startElements) {
      const element = findElementByKey(elements, elementKey(start))
      if (element) moveElement(element, start, delta)
    }
    return
  }

  if (transform.mode === 'rotate') {
    const center = startGeometry.center
    const nextAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x)
    const degrees = radiansToDegrees(nextAngle - transform.startAngle)
    for (const start of transform.startElements) {
      const element = findElementByKey(elements, elementKey(start))
      if (element) rotateElement(element, start, startGeometry, degrees)
    }
    return
  }

  resizeElementGroupFromHandle(transform.startElements, startGeometry, pointer, transform.mode, elements)
}

export function moveElement(element: CanvasStroke, start: CanvasStroke, delta: Point) {
  if (isRectElement(element) && isRectElement(start)) {
    element.x = start.x + delta.x
    element.y = start.y + delta.y
    return
  }

  if (isDrawingStroke(element) && isDrawingStroke(start)) {
    element.points = start.points.map(point => ({ x: point.x + delta.x, y: point.y + delta.y }))
  }
}

export function rotateElement(element: CanvasStroke, start: CanvasStroke, startGeometry: ElementGeometry, degrees: number) {
  if (isRectElement(element) && isRectElement(start)) {
    const center = getElementGeometry(start).center
    const rotatedCenter = rotatePoint({ x: center.x - startGeometry.center.x, y: center.y - startGeometry.center.y }, degreesToRadians(degrees))
    element.rotation = normalizeDegrees((start.rotation ?? 0) + degrees)
    element.x = startGeometry.center.x + rotatedCenter.x - start.width / 2
    element.y = startGeometry.center.y + rotatedCenter.y - start.height / 2
    return
  }

  if (isDrawingStroke(element) && isDrawingStroke(start)) {
    const radians = degreesToRadians(degrees)
    element.points = start.points.map(point => {
      const rotated = rotatePoint({ x: point.x - startGeometry.center.x, y: point.y - startGeometry.center.y }, radians)
      return { x: startGeometry.center.x + rotated.x, y: startGeometry.center.y + rotated.y }
    })
  }
}

export function resizeElementGroupFromHandle(
  startElements: CanvasStroke[],
  startGeometry: ElementGeometry,
  pointer: Point,
  mode: TransformMode,
  elements: CanvasStroke[],
) {
  const rect = getResizedSelectionRect(startGeometry, pointer, mode)
  for (const start of startElements) {
    const element = findElementByKey(elements, elementKey(start))
    if (element) applyElementResize(element, start, startGeometry, rect)
  }
}

export function getResizedSelectionRect(startGeometry: ElementGeometry, pointer: Point, mode: TransformMode) {
  const localCentered = worldToElementCenteredLocal(pointer, startGeometry)
  const p = { x: localCentered.x + startGeometry.width / 2, y: localCentered.y + startGeometry.height / 2 }
  const minSize = 24
  let left = 0
  let right = startGeometry.width
  let top = 0
  let bottom = startGeometry.height
  const isCorner = mode === 'resize-nw' || mode === 'resize-ne' || mode === 'resize-se' || mode === 'resize-sw'

  if (isCorner) {
    const anchor = getResizeAnchor(startGeometry, mode)
    const scaleX = Math.abs(p.x - anchor.x) / startGeometry.width
    const scaleY = Math.abs(p.y - anchor.y) / startGeometry.height
    const nextScale = Math.max(minSize / startGeometry.width, minSize / startGeometry.height, scaleX, scaleY)
    const nextWidth = startGeometry.width * nextScale
    const nextHeight = startGeometry.height * nextScale

    if (mode === 'resize-se') {
      right = nextWidth
      bottom = nextHeight
    } else if (mode === 'resize-sw') {
      left = startGeometry.width - nextWidth
      right = startGeometry.width
      bottom = nextHeight
    } else if (mode === 'resize-ne') {
      top = startGeometry.height - nextHeight
      right = nextWidth
      bottom = startGeometry.height
    } else {
      left = startGeometry.width - nextWidth
      top = startGeometry.height - nextHeight
      right = startGeometry.width
      bottom = startGeometry.height
    }
  } else {
    if (mode === 'resize-w') left = Math.min(startGeometry.width - minSize, p.x)
    if (mode === 'resize-e') right = Math.max(minSize, p.x)
    if (mode === 'resize-n') top = Math.min(startGeometry.height - minSize, p.y)
    if (mode === 'resize-s') bottom = Math.max(minSize, p.y)
  }

  const width = Math.max(minSize, right - left)
  const height = Math.max(minSize, bottom - top)
  return {
    left,
    top,
    width,
    height,
    center: elementLocalToWorld({ x: (left + right) / 2, y: (top + bottom) / 2 }, startGeometry),
  }
}

export function applyElementResize(
  element: CanvasStroke,
  start: CanvasStroke,
  startGeometry: ElementGeometry,
  rect: { left: number; top: number; width: number; height: number; center: Point },
) {
  const sx = rect.width / startGeometry.width
  const sy = rect.height / startGeometry.height
  if (isRectElement(element) && isRectElement(start)) {
    const startCenter = getElementGeometry(start).center
    const localCenter = worldToElementCenteredLocal(startCenter, startGeometry)
    const nextLocalCenter = {
      x: rect.left + (localCenter.x + startGeometry.width / 2) * sx,
      y: rect.top + (localCenter.y + startGeometry.height / 2) * sy,
    }
    const nextCenter = elementLocalToWorld(nextLocalCenter, { ...startGeometry, center: rect.center, width: rect.width, height: rect.height })
    element.width = Math.max(1, start.width * Math.abs(sx))
    element.height = Math.max(1, start.height * Math.abs(sy))
    element.x = nextCenter.x - element.width / 2
    element.y = nextCenter.y - element.height / 2
    element.rotation = start.rotation ?? 0
    if (element.type === 'text' && start.type === 'text') {
      element.fontSize = Math.max(8, Math.min(160, start.fontSize * ((Math.abs(sx) + Math.abs(sy)) / 2)))
    }
    return
  }

  if (isDrawingStroke(element) && isDrawingStroke(start)) {
    element.points = start.points.map(point => {
      const local = worldToElementCenteredLocal(point, startGeometry)
      const nextLocal = {
        x: rect.left + (local.x + startGeometry.width / 2) * sx,
        y: rect.top + (local.y + startGeometry.height / 2) * sy,
      }
      return elementLocalToWorld(nextLocal, { ...startGeometry, center: rect.center, width: rect.width, height: rect.height })
    })
    element.width = Math.max(1, start.width * ((Math.abs(sx) + Math.abs(sy)) / 2))
  }
}

export function getResizeAnchor(geometry: ElementGeometry, mode: TransformMode): Point {
  if (mode === 'resize-se') return { x: 0, y: 0 }
  if (mode === 'resize-sw') return { x: geometry.width, y: 0 }
  if (mode === 'resize-ne') return { x: 0, y: geometry.height }
  return { x: geometry.width, y: geometry.height }
}

function findElementByKey(elements: CanvasStroke[], key: string) {
  return elements.find(stroke => elementKey(stroke) === key)
}
