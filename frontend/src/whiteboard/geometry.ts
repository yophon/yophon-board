import type { Point } from './types'

export function getDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function getCenter(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

export function distanceSq(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function distanceToSegmentSq(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return distanceSq(point, a)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
  const projected = { x: a.x + t * dx, y: a.y + t * dy }
  return distanceSq(point, projected)
}

export function segmentDistanceSq(a: Point, b: Point, c: Point, d: Point) {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(
    distanceToSegmentSq(a, c, d),
    distanceToSegmentSq(b, c, d),
    distanceToSegmentSq(c, a, b),
    distanceToSegmentSq(d, a, b),
  )
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

export function rotatePoint(point: Point, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

export function degreesToRadians(degrees: number) {
  return degrees * Math.PI / 180
}

export function radiansToDegrees(radians: number) {
  return radians * 180 / Math.PI
}

export function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
}
