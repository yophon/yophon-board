import {
  distanceSq,
  distanceToSegmentSq,
  getDistance,
  segmentDistanceSq,
} from './geometry'
import type { CanvasStroke, Point } from './types'

type DrawingStroke = Extract<CanvasStroke, { points: Point[] }>

export function strokeIntersectsEraser(stroke: DrawingStroke, from: Point, to: Point, radius: number) {
  const threshold = radius + stroke.width / 2
  const thresholdSq = threshold * threshold
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (segmentDistanceSq(from, to, stroke.points[i], stroke.points[i + 1]) <= thresholdSq) return true
  }
  return false
}

export function cutStrokeByEraser(stroke: DrawingStroke, from: Point, to: Point, radius: number): Point[][] | null {
  const threshold = radius + stroke.width / 2
  const thresholdSq = threshold * threshold
  const sampleSpacing = Math.max(2, threshold / 2)
  const segments: Point[][] = []
  let current: Point[] = []
  let removedAny = false

  for (let i = 0; i < stroke.points.length - 1; i++) {
    const a = stroke.points[i]
    const b = stroke.points[i + 1]
    const steps = Math.max(1, Math.ceil(getDistance(a, b) / sampleSpacing))
    for (let step = 0; step <= steps; step++) {
      if (i > 0 && step === 0) continue
      const t = step / steps
      const point = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      }
      const erased = distanceToSegmentSq(point, from, to) <= thresholdSq
      if (erased) {
        removedAny = true
        if (current.length >= 2) segments.push(current)
        current = []
        continue
      }
      if (current.length === 0 || distanceSq(current[current.length - 1], point) > 0.01) {
        current.push(point)
      }
    }
  }

  if (current.length >= 2) segments.push(current)
  return removedAny ? segments : null
}
