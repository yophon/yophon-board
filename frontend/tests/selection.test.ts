import { describe, expect, test } from 'bun:test'
import {
  applyElementResize,
  applyElementTransform,
  cloneElement,
  elementIntersectsBox,
  elementKey,
  elementLocalToWorld,
  getElementGeometry,
  getSelectionGeometry,
  isDrawingStroke,
  isPointInsideElement,
  isRectElement,
  mindMapLocalToWorld,
  worldToElementCenteredLocal,
  worldToMindMapLocal,
  type ElementTransformState,
} from '../src/whiteboard/selection'
import type { CanvasStroke } from '../src/whiteboard/types'

function makeImage(overrides: Partial<Extract<CanvasStroke, { type: 'image' }>> = {}): CanvasStroke {
  return {
    type: 'image',
    src: '/a.png',
    x: 10,
    y: 20,
    width: 100,
    height: 60,
    rotation: 0,
    localId: 'img-1',
    ...overrides,
  }
}

function makeDrawing(): CanvasStroke {
  return {
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }],
    color: '#000',
    width: 4,
    tool: 'pen',
    localId: 'pen-1',
  }
}

describe('elementKey / type guards', () => {
  test('prefers server id over local id', () => {
    expect(elementKey({ ...makeImage(), id: 7 })).toBe('id:7')
    expect(elementKey(makeImage())).toBe('local:img-1')
  })

  test('isRectElement / isDrawingStroke partition the union', () => {
    expect(isRectElement(makeImage())).toBe(true)
    expect(isDrawingStroke(makeImage())).toBe(false)
    expect(isDrawingStroke(makeDrawing())).toBe(true)
    expect(isRectElement(makeDrawing())).toBe(false)
  })
})

describe('cloneElement', () => {
  test('deep-copies drawing points', () => {
    const original = makeDrawing() as Extract<CanvasStroke, { points: { x: number; y: number }[] }>
    const clone = cloneElement(original) as typeof original
    clone.points[0].x = 999
    expect(original.points[0].x).toBe(0)
  })

  test('deep-copies mind map nodes', () => {
    const mindmap: CanvasStroke = {
      type: 'mindmap',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      fontSize: 18,
      nodes: [{ id: 'root', text: '中心', x: 150, y: 130, width: 100, height: 40 }],
      edges: [],
      localId: 'mm-1',
    }
    const clone = cloneElement(mindmap) as typeof mindmap
    clone.nodes[0].x = 999
    expect(mindmap.nodes[0].x).toBe(150)
  })
})

describe('coordinate transforms', () => {
  test('centered local ↔ world round-trips with rotation', () => {
    const geometry = { center: { x: 60, y: 50 }, width: 100, height: 60, rotation: 30 }
    const world = { x: 80, y: 35 }
    const local = worldToElementCenteredLocal(world, geometry)
    // elementLocalToWorld takes top-left-origin local coordinates.
    const back = elementLocalToWorld({ x: local.x + geometry.width / 2, y: local.y + geometry.height / 2 }, geometry)
    expect(back.x).toBeCloseTo(world.x)
    expect(back.y).toBeCloseTo(world.y)
  })

  test('mind-map local ↔ world round-trips with rotation', () => {
    const mindmap = makeImage({ rotation: 45 })
    const world = { x: 42, y: 33 }
    const local = worldToMindMapLocal(world, mindmap)
    const back = mindMapLocalToWorld(mindmap, local)
    expect(back.x).toBeCloseTo(world.x)
    expect(back.y).toBeCloseTo(world.y)
  })

  test('unrotated element: local origin maps to element top-left', () => {
    const element = makeImage()
    const world = mindMapLocalToWorld(element, { x: 0, y: 0 })
    expect(world.x).toBeCloseTo(10)
    expect(world.y).toBeCloseTo(20)
  })
})

describe('geometry helpers', () => {
  test('getElementGeometry of a rect element', () => {
    const geometry = getElementGeometry(makeImage())
    expect(geometry.center).toEqual({ x: 60, y: 50 })
    expect(geometry.width).toBe(100)
    expect(geometry.height).toBe(60)
  })

  test('getSelectionGeometry unions multiple elements', () => {
    const a = makeImage()
    const b = makeImage({ x: 200, y: 100, width: 50, height: 50, localId: 'img-2' })
    const geometry = getSelectionGeometry([a, b])
    expect(geometry.width).toBeCloseTo(240) // 10..250
    expect(geometry.height).toBeCloseTo(130) // 20..150
  })

  test('isPointInsideElement honors rotation', () => {
    const element = makeImage({ x: -50, y: -10, width: 100, height: 20, rotation: 90 })
    // After 90° rotation around (0,0) the box occupies roughly x∈[-10,10], y∈[-50,50].
    expect(isPointInsideElement({ x: 0, y: 40 }, element, 1)).toBe(true)
    expect(isPointInsideElement({ x: 40, y: 0 }, element, 1)).toBe(false)
  })
})

describe('applyElementTransform', () => {
  function makeTransform(element: CanvasStroke, mode: ElementTransformState['mode'], startPointer = { x: 0, y: 0 }): ElementTransformState {
    const geometry = getSelectionGeometry([element])
    return {
      mode,
      startPointer,
      startElements: [cloneElement(element)],
      startGeometry: geometry,
      startAngle: Math.atan2(startPointer.y - geometry.center.y, startPointer.x - geometry.center.x),
    }
  }

  test('move shifts rect elements by the pointer delta', () => {
    const element = makeImage()
    const elements = [element]
    const transform = makeTransform(element, 'move')
    applyElementTransform({ x: 15, y: -5 }, transform, elements)
    expect(element).toMatchObject({ x: 25, y: 15 })
    // Moving back to the start pointer restores the original position.
    applyElementTransform({ x: 0, y: 0 }, transform, elements)
    expect(element).toMatchObject({ x: 10, y: 20 })
  })

  test('move shifts drawing stroke points', () => {
    const stroke = makeDrawing() as Extract<CanvasStroke, { points: { x: number; y: number }[] }>
    const transform = makeTransform(stroke, 'move')
    applyElementTransform({ x: 5, y: 7 }, transform, [stroke])
    expect(stroke.points[0]).toEqual({ x: 5, y: 7 })
    expect(stroke.points[2]).toEqual({ x: 25, y: 17 })
  })

  test('rotate updates rotation by the pointer angle delta', () => {
    const element = makeImage()
    // Start pointer directly right of center, then move it directly below → +90°.
    const transform = makeTransform(element, 'rotate', { x: 160, y: 50 })
    applyElementTransform({ x: 60, y: 150 }, transform, [element])
    expect((element as Extract<CanvasStroke, { type: 'image' }>).rotation).toBeCloseTo(90)
  })
})

describe('applyElementResize on mind maps', () => {
  function makeMindMap(): CanvasStroke {
    return {
      type: 'mindmap',
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      fontSize: 17,
      nodes: [{ id: 'root', text: '中心', x: 100, y: 80, width: 168, height: 62 }],
      edges: [],
      localId: 'mm-resize',
    }
  }

  function resizeBy(element: CanvasStroke, fx: number, fy: number) {
    const start = cloneElement(element)
    const geometry = getElementGeometry(start)
    applyElementResize(element, start, geometry, {
      left: 0,
      top: 0,
      width: geometry.width * fx,
      height: geometry.height * fy,
      center: geometry.center,
    })
  }

  test('uniform 2× resize scales nodes and records nodeScale', () => {
    const element = makeMindMap()
    resizeBy(element, 2, 2)
    if (element.type !== 'mindmap') throw new Error('expected mindmap')
    expect(element.nodeScale).toBeCloseTo(2)
    expect(element.width).toBeCloseTo(800)
    expect(element.height).toBeCloseTo(400)
    expect(element.fontSize).toBeCloseTo(34)
    const root = element.nodes[0]
    expect(root.width).toBeCloseTo(336)
    expect(root.x).toBeCloseTo(200)
  })

  test('non-uniform handles still resize uniformly (average factor)', () => {
    const element = makeMindMap()
    resizeBy(element, 3, 1)
    if (element.type !== 'mindmap') throw new Error('expected mindmap')
    expect(element.nodeScale).toBeCloseTo(2)
    expect(element.width).toBeCloseTo(800)
    expect(element.height).toBeCloseTo(400)
  })

  test('nodeScale clamps at 3× and geometry follows the clamp', () => {
    const element = makeMindMap()
    resizeBy(element, 8, 8)
    if (element.type !== 'mindmap') throw new Error('expected mindmap')
    expect(element.nodeScale).toBe(3)
    expect(element.width).toBeCloseTo(1200)
  })
})

describe('elementIntersectsBox', () => {
  test('detects rect overlap and miss', () => {
    const element = makeImage()
    expect(elementIntersectsBox(element, { left: 0, right: 30, top: 0, bottom: 30 }, 1)).toBe(true)
    expect(elementIntersectsBox(element, { left: 500, right: 600, top: 0, bottom: 30 }, 1)).toBe(false)
  })

  test('detects stroke segment crossing the box edge', () => {
    const stroke = makeDrawing()
    expect(elementIntersectsBox(stroke, { left: 5, right: 6, top: -10, bottom: 10 }, 1)).toBe(true)
  })
})
