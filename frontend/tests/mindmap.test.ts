import { describe, expect, test } from 'bun:test'
import {
  addMindMapChildNode,
  countMindMapDescendants,
  createDrawnixMindMapTemplate,
  deleteMindMapNodeById,
  getMindMapBadgeNodeId,
  getMindMapChildren,
  getMindMapNodeStyle,
  getMindMapScale,
  layoutMindMap,
  normalizeMindMap,
  reattachMindMapNode,
  resolveMindMapDropTarget,
  toggleMindMapNodeCollapsed,
} from '../src/whiteboard/mindmap'
import type { MindMapElementData } from '../src/whiteboard/types'

/** root → (a, b on the right; c on the left); a → a1. */
function makeTree(): MindMapElementData {
  const element = createDrawnixMindMapTemplate(0, 0)
  element.nodes = [
    { id: 'root', text: '中心', x: 0, y: 0, width: 168, height: 62, branch: 'right' },
    { id: 'a', text: 'A', x: 0, y: 0, width: 138, height: 44, branch: 'right' },
    { id: 'b', text: 'B', x: 0, y: 0, width: 138, height: 44, branch: 'right' },
    { id: 'c', text: 'C', x: 0, y: 0, width: 138, height: 44, branch: 'left' },
    { id: 'a1', text: 'A1', x: 0, y: 0, width: 138, height: 44, branch: 'right' },
  ]
  element.edges = [
    { from: 'root', to: 'a' },
    { from: 'root', to: 'b' },
    { from: 'root', to: 'c' },
    { from: 'a', to: 'a1' },
  ]
  layoutMindMap(element)
  return element
}

describe('getMindMapScale', () => {
  test('defaults to 1 and clamps to [0.5, 3]', () => {
    const element = makeTree()
    expect(getMindMapScale(element)).toBe(1)
    element.nodeScale = 2
    expect(getMindMapScale(element)).toBe(2)
    element.nodeScale = 99
    expect(getMindMapScale(element)).toBe(3)
    element.nodeScale = 0.01
    expect(getMindMapScale(element)).toBe(0.5)
  })
})

describe('layoutMindMap with nodeScale', () => {
  test('scaled layout keeps node sizes proportional (no snap-back)', () => {
    const base = makeTree()
    const scaled = makeTree()
    scaled.nodeScale = 2
    for (const node of scaled.nodes) {
      node.x *= 2
      node.y *= 2
      node.width *= 2
      node.height *= 2
    }
    layoutMindMap(base)
    layoutMindMap(scaled)
    const baseA = base.nodes.find(n => n.id === 'a')!
    const scaledA = scaled.nodes.find(n => n.id === 'a')!
    expect(scaledA.width).toBeCloseTo(baseA.width * 2)
    expect(scaledA.height).toBeCloseTo(baseA.height * 2)
    expect(scaled.width).toBeCloseTo(base.width * 2, 0)
  })

  test('node height above the old 78px cap survives layout', () => {
    const element = makeTree()
    const a = element.nodes.find(n => n.id === 'a')!
    a.height = 140 // three lines of text
    layoutMindMap(element)
    expect(element.nodes.find(n => n.id === 'a')!.height).toBe(140)
  })
})

describe('layoutMindMap branch freedom', () => {
  test('keeps all children on one side without auto-balancing', () => {
    const element = makeTree()
    for (const node of element.nodes) {
      if (node.id !== 'root') node.branch = 'right'
    }
    layoutMindMap(element)
    const rootChildren = getMindMapChildren(element, 'root')
    expect(rootChildren.every(node => node.branch === 'right')).toBe(true)
  })
})

describe('normalizeMindMap', () => {
  test('clears legacy manualPosition flags so nodes rejoin auto layout', () => {
    const element = makeTree()
    element.nodes[1].manualPosition = true
    normalizeMindMap(element)
    expect(element.nodes.every(node => !node.manualPosition)).toBe(true)
  })
})

describe('layoutMindMap root anchoring', () => {
  /** Root center in world coordinates (tests use rotation 0). */
  function rootWorldCenter(element: MindMapElementData) {
    const root = element.nodes.find(n => n.id === 'root')!
    return { x: element.x + root.x + root.width / 2, y: element.y + root.y + root.height / 2 }
  }

  test('collapsing and expanding keeps the root node world position', () => {
    const element = makeTree()
    const before = rootWorldCenter(element)
    toggleMindMapNodeCollapsed(element, 'a')
    expect(rootWorldCenter(element).x).toBeCloseTo(before.x)
    expect(rootWorldCenter(element).y).toBeCloseTo(before.y)
    toggleMindMapNodeCollapsed(element, 'a')
    expect(rootWorldCenter(element).x).toBeCloseTo(before.x)
    expect(rootWorldCenter(element).y).toBeCloseTo(before.y)
  })

  test('reattaching a node keeps the root node world position', () => {
    const element = makeTree()
    const before = rootWorldCenter(element)
    expect(reattachMindMapNode(element, 'b', 'a', 1, 'right')).toBe(true)
    expect(rootWorldCenter(element).x).toBeCloseTo(before.x)
    expect(rootWorldCenter(element).y).toBeCloseTo(before.y)
    // Flipping a whole subtree across the root grows the left side.
    expect(reattachMindMapNode(element, 'a', 'root', 0, 'left')).toBe(true)
    expect(rootWorldCenter(element).x).toBeCloseTo(before.x)
    expect(rootWorldCenter(element).y).toBeCloseTo(before.y)
  })

  test('adding and deleting nodes keeps the root node world position', () => {
    const element = makeTree()
    const before = rootWorldCenter(element)
    const added = addMindMapChildNode(element, 'c')
    expect(added).not.toBeNull()
    expect(rootWorldCenter(element).x).toBeCloseTo(before.x)
    expect(rootWorldCenter(element).y).toBeCloseTo(before.y)
    deleteMindMapNodeById(element, 'a')
    expect(rootWorldCenter(element).x).toBeCloseTo(before.x)
    expect(rootWorldCenter(element).y).toBeCloseTo(before.y)
  })
})

describe('getMindMapNodeStyle', () => {
  test('falls back to theme defaults', () => {
    const element = makeTree()
    layoutMindMap(element)
    const root = element.nodes.find(n => n.id === 'root')!
    const rootStyle = getMindMapNodeStyle(root)
    expect(rootStyle.fill).toBe('#202124')
    expect(rootStyle.text).toBe('#ffffff')
    expect(rootStyle.fontWeight).toBe(700)
    expect(rootStyle.hasBorder).toBe(false)
    const child = element.nodes.find(n => n.id === 'a')!
    const childStyle = getMindMapNodeStyle(child)
    expect(childStyle.fontWeight).toBe(600)
    expect(childStyle.hasBorder).toBe(true)
    expect(childStyle.italic).toBe(false)
  })

  test('honors user overrides and survives re-layout', () => {
    const element = makeTree()
    const node = element.nodes.find(n => n.id === 'a')!
    node.fillColor = '#ffe0e0'
    node.borderColor = '#ff0000'
    node.textColor = '#003366'
    node.bold = false
    node.italic = true
    layoutMindMap(element)
    const style = getMindMapNodeStyle(element.nodes.find(n => n.id === 'a')!)
    expect(style.fill).toBe('#ffe0e0')
    expect(style.border).toBe('#ff0000')
    expect(style.customBorder).toBe(true)
    expect(style.text).toBe('#003366')
    expect(style.fontWeight).toBe(400)
    expect(style.italic).toBe(true)
  })
})

describe('reattachMindMapNode', () => {
  test('reparents a node under a new parent', () => {
    const element = makeTree()
    expect(reattachMindMapNode(element, 'b', 'a', 1, 'right')).toBe(true)
    expect(getMindMapChildren(element, 'a').map(n => n.id)).toEqual(['a1', 'b'])
    expect(getMindMapChildren(element, 'root').map(n => n.id)).toEqual(['a', 'c'])
  })

  test('reorders within the same parent', () => {
    const element = makeTree()
    // Move 'a' after 'b' among the root's right-branch children.
    expect(reattachMindMapNode(element, 'a', 'root', 1, 'right')).toBe(true)
    const rightChildren = getMindMapChildren(element, 'root').filter(n => n.branch === 'right')
    expect(rightChildren.map(n => n.id)).toEqual(['b', 'a'])
  })

  test('rejects cycles and the root', () => {
    const element = makeTree()
    expect(reattachMindMapNode(element, 'a', 'a1', 0, 'right')).toBe(false) // own descendant
    expect(reattachMindMapNode(element, 'a', 'a', 0, 'right')).toBe(false)
    expect(reattachMindMapNode(element, 'root', 'a', 0, 'right')).toBe(false)
  })

  test('no-op moves return false (no undo noise)', () => {
    const element = makeTree()
    const before = JSON.stringify(element.edges)
    expect(reattachMindMapNode(element, 'a', 'root', 0, 'right')).toBe(false)
    expect(JSON.stringify(element.edges)).toBe(before)
  })

  test('moving to the other side of the root flips branch for the subtree', () => {
    const element = makeTree()
    expect(reattachMindMapNode(element, 'a', 'root', 0, 'left')).toBe(true)
    expect(element.nodes.find(n => n.id === 'a')!.branch).toBe('left')
    expect(element.nodes.find(n => n.id === 'a1')!.branch).toBe('left')
  })

  test('expands a collapsed target parent', () => {
    const element = makeTree()
    toggleMindMapNodeCollapsed(element, 'a')
    expect(element.nodes.find(n => n.id === 'a')!.collapsed).toBe(true)
    expect(reattachMindMapNode(element, 'b', 'a', 0, 'right')).toBe(true)
    expect(element.nodes.find(n => n.id === 'a')!.collapsed).toBe(false)
  })
})

describe('resolveMindMapDropTarget', () => {
  test('dropping on a node targets it as parent', () => {
    const element = makeTree()
    const a = element.nodes.find(n => n.id === 'a')!
    const target = resolveMindMapDropTarget(element, 'b', { x: a.x + a.width / 2, y: a.y + a.height / 2 })
    expect(target?.parentId).toBe('a')
    expect(target?.branch).toBe('right')
  })

  test('far away from any node yields null', () => {
    const element = makeTree()
    expect(resolveMindMapDropTarget(element, 'b', { x: -5000, y: -5000 })).toBeNull()
  })

  test('empty space around the map falls back to a root child on the pointer side', () => {
    const element = makeTree()
    const root = element.nodes.find(n => n.id === 'root')!
    const rootMidY = root.y + root.height / 2
    // Beyond the leftmost node (c) by more than the drop range, but inside
    // the horizontal fallback zone.
    const farLeft = resolveMindMapDropTarget(element, 'b', { x: -170, y: rootMidY })
    expect(farLeft).toMatchObject({ parentId: 'root', branch: 'left' })
    // Past the right edge of the element.
    const farRight = resolveMindMapDropTarget(element, 'b', { x: element.width + 200, y: rootMidY })
    expect(farRight).toMatchObject({ parentId: 'root', branch: 'right' })
    // Way off vertically still cancels.
    expect(resolveMindMapDropTarget(element, 'b', { x: -170, y: element.height + 500 })).toBeNull()
  })

  test('the dragged subtree is never a drop target', () => {
    const element = makeTree()
    const a1 = element.nodes.find(n => n.id === 'a1')!
    const target = resolveMindMapDropTarget(element, 'a', { x: a1.x + a1.width / 2, y: a1.y + a1.height / 2 })
    expect(target?.parentId).not.toBe('a1')
    expect(target?.parentId).not.toBe('a')
  })

  test('dropping on the root picks the branch by pointer side', () => {
    const element = makeTree()
    const root = element.nodes.find(n => n.id === 'root')!
    const left = resolveMindMapDropTarget(element, 'b', { x: root.x + 2, y: root.y + root.height / 2 })
    expect(left).toMatchObject({ parentId: 'root', branch: 'left' })
    const right = resolveMindMapDropTarget(element, 'b', { x: root.x + root.width - 2, y: root.y + root.height / 2 })
    expect(right).toMatchObject({ parentId: 'root', branch: 'right' })
  })
})

describe('getMindMapBadgeNodeId', () => {
  test('hits the collapse badge next to a node with children', () => {
    const element = makeTree()
    const a = element.nodes.find(n => n.id === 'a')!
    // Badge sits 10px right of a right-branch node, radius 9 (+3 slack).
    expect(getMindMapBadgeNodeId(element, { x: a.x + a.width + 10, y: a.y + a.height / 2 })).toBe('a')
    // Leaf nodes have no badge.
    const b = element.nodes.find(n => n.id === 'b')!
    expect(getMindMapBadgeNodeId(element, { x: b.x + b.width + 10, y: b.y + b.height / 2 })).toBeNull()
  })
})

describe('counts and structure helpers', () => {
  test('countMindMapDescendants excludes the node itself', () => {
    const element = makeTree()
    expect(countMindMapDescendants(element, 'a')).toBe(1)
    expect(countMindMapDescendants(element, 'root')).toBe(4)
  })

  test('addMindMapChildNode scales new nodes by nodeScale', () => {
    const element = makeTree()
    element.nodeScale = 2
    const node = addMindMapChildNode(element, 'b')
    expect(node).not.toBeNull()
    // New node sized 138×44 at scale 1 → 276×88 at scale 2 (layout may
    // clamp width into [96*s, 260*s]).
    expect(node!.width).toBeGreaterThanOrEqual(192)
    expect(node!.height).toBeGreaterThanOrEqual(76)
  })

  test('deleteMindMapNodeById removes the whole subtree', () => {
    const element = makeTree()
    deleteMindMapNodeById(element, 'a')
    expect(element.nodes.map(n => n.id).sort()).toEqual(['b', 'c', 'root'])
    expect(element.edges.every(edge => edge.from !== 'a' && edge.to !== 'a')).toBe(true)
  })
})
