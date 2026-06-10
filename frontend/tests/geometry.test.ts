import { describe, expect, test } from 'bun:test'
import {
  degreesToRadians,
  distanceSq,
  distanceToSegmentSq,
  getCenter,
  getDistance,
  normalizeDegrees,
  radiansToDegrees,
  rotatePoint,
  segmentDistanceSq,
  segmentsIntersect,
} from '../src/whiteboard/geometry'

describe('geometry', () => {
  test('getDistance / getCenter / distanceSq', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(getCenter({ x: 0, y: 0 }, { x: 4, y: 6 })).toEqual({ x: 2, y: 3 })
    expect(distanceSq({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(25)
  })

  test('degree/radian conversions round-trip', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI)
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90)
    expect(radiansToDegrees(degreesToRadians(123.4))).toBeCloseTo(123.4)
  })

  test('normalizeDegrees wraps into [0, 360)', () => {
    expect(normalizeDegrees(0)).toBe(0)
    expect(normalizeDegrees(370)).toBe(10)
    expect(normalizeDegrees(-90)).toBe(270)
    expect(normalizeDegrees(720)).toBe(0)
  })

  test('rotatePoint rotates around the origin', () => {
    const rotated = rotatePoint({ x: 1, y: 0 }, Math.PI / 2)
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(1)

    const back = rotatePoint(rotated, -Math.PI / 2)
    expect(back.x).toBeCloseTo(1)
    expect(back.y).toBeCloseTo(0)
  })

  test('distanceToSegmentSq clamps to segment endpoints', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    // Perpendicular projection inside the segment.
    expect(distanceToSegmentSq({ x: 5, y: 3 }, a, b)).toBeCloseTo(9)
    // Beyond endpoint b: distance to b itself.
    expect(distanceToSegmentSq({ x: 13, y: 4 }, a, b)).toBeCloseTo(25)
    // Degenerate segment.
    expect(distanceToSegmentSq({ x: 3, y: 4 }, a, a)).toBeCloseTo(25)
  })

  test('segmentsIntersect detects crossing and non-crossing pairs', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true)
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 6, y: 6 })).toBe(false)
    // Parallel segments never intersect.
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false)
  })

  test('segmentDistanceSq is zero for intersecting segments', () => {
    expect(segmentDistanceSq({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0)
    expect(segmentDistanceSq({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 })).toBeCloseTo(16)
  })
})
