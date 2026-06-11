import { degreesToRadians, rotatePoint } from './geometry'
import type { MindMapEdgeData, MindMapElementData, MindMapNodeData, Point } from './types'

export const MINDMAP_MAX_NODES = 80
export const MINDMAP_ROOT_ID = 'root'
export const MINDMAP_MIN_SCALE = 0.5
export const MINDMAP_MAX_SCALE = 3

const ROOT_WIDTH = 168
const ROOT_HEIGHT = 62
const NODE_WIDTH = 138
const NODE_HEIGHT = 44
const H_GAP = 104
const ROOT_GAP = 118
const V_GAP = 28
const CANVAS_PADDING = 36
const ROOT_COLOR = '#202124'
const LEFT_COLOR = '#f4f8ff'
const RIGHT_COLOR = '#f3fbf6'
const LEFT_STROKE = '#5b8def'
const RIGHT_STROKE = '#37a86b'
/** Pointer must be within this (scaled) distance of a node to drop onto it. */
const DROP_RANGE = 150

type BranchSide = 'left' | 'right'

export interface MindMapNodeVisualStyle {
  fill: string
  /** Stroke color; `hasBorder` tells whether to stroke at all (root has none by default). */
  border: string
  hasBorder: boolean
  /** True when the border color is a user override (drawn slightly thicker). */
  customBorder: boolean
  text: string
  fontWeight: number
  italic: boolean
}

/**
 * Effective visual style of a node: user overrides first, then the
 * branch/theme defaults the renderer always used.
 */
export function getMindMapNodeStyle(node: MindMapNodeData): MindMapNodeVisualStyle {
  const isRoot = node.id === MINDMAP_ROOT_ID
  const customBorder = !!node.borderColor
  return {
    fill: node.fillColor || node.color || (isRoot ? ROOT_COLOR : '#ffffff'),
    border: node.borderColor || (node.branch === 'left' ? 'rgba(91,141,239,.35)' : 'rgba(55,168,107,.34)'),
    hasBorder: customBorder || !isRoot,
    customBorder,
    text: node.textColor || (isRoot ? '#ffffff' : '#202124'),
    fontWeight: node.bold === undefined ? (isRoot ? 700 : 600) : node.bold ? 700 : 400,
    italic: node.italic === true,
  }
}

/** Font shorthand for measuring/drawing a node's text. */
export function getMindMapNodeFont(element: MindMapElementData, node: MindMapNodeData, fontFamily: string): string {
  const style = getMindMapNodeStyle(node)
  const fontSize = node.id === MINDMAP_ROOT_ID ? element.fontSize + 1 : element.fontSize
  return `${style.italic ? 'italic ' : ''}${style.fontWeight} ${fontSize}px ${fontFamily}`
}

export interface MindMapDropTarget {
  parentId: string
  /** Insertion index among the parent's (branch-filtered for root) children, dragged node excluded. */
  index: number
  branch: BranchSide
}

interface SubtreeLayout {
  node: MindMapNodeData
  width: number
  height: number
  children: SubtreeLayout[]
}

/**
 * All layout constants are multiplied by the element's `nodeScale`, so a
 * resized mind map keeps its proportions through later re-layouts instead
 * of snapping back to the defaults.
 */
export function getMindMapScale(element: MindMapElementData): number {
  const scale = Number(element.nodeScale)
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(MINDMAP_MAX_SCALE, Math.max(MINDMAP_MIN_SCALE, scale))
}

/** Centered on (centerX, centerY): a root plus one starter child. */
export function createDrawnixMindMapTemplate(centerX: number, centerY: number): MindMapElementData {
  const mindmap: MindMapElementData = {
    type: 'mindmap',
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    rotation: 0,
    fontSize: 17,
    layout: 'mind',
    theme: 'drawnix',
    nodes: [
      createMindMapNode(MINDMAP_ROOT_ID, '中心主题', 'right', true),
      createMindMapNode('right-1', '子主题', 'right'),
    ],
    edges: [
      createMindMapEdge(MINDMAP_ROOT_ID, 'right-1', 'right'),
    ],
  }
  layoutMindMap(mindmap)
  mindmap.x = centerX - mindmap.width / 2
  mindmap.y = centerY - mindmap.height / 2
  return mindmap
}

export function createMindMapNode(id: string, text = '新节点', branch: BranchSide = 'right', root = false, scale = 1): MindMapNodeData {
  return {
    id,
    text,
    x: 0,
    y: 0,
    width: (root ? ROOT_WIDTH : NODE_WIDTH) * scale,
    height: (root ? ROOT_HEIGHT : NODE_HEIGHT) * scale,
    color: root ? ROOT_COLOR : branch === 'left' ? LEFT_COLOR : RIGHT_COLOR,
    branch,
  }
}

export function createMindMapEdge(from: string, to: string, branch: BranchSide = 'right'): MindMapEdgeData {
  return {
    from,
    to,
    stroke: branch === 'left' ? LEFT_STROKE : RIGHT_STROKE,
  }
}

export function getMindMapChildren(element: MindMapElementData, nodeId: string): MindMapNodeData[] {
  const nodes = new Map(element.nodes.map(node => [node.id, node]))
  return element.edges
    .filter(edge => edge.from === nodeId)
    .map(edge => nodes.get(edge.to))
    .filter((node): node is MindMapNodeData => !!node)
}

export function findMindMapParentId(element: MindMapElementData, nodeId: string): string | null {
  return element.edges.find(edge => edge.to === nodeId)?.from || null
}

export function getMindMapDescendantIds(element: MindMapElementData, nodeId: string): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => {
    ids.add(id)
    for (const child of getMindMapChildren(element, id)) visit(child.id)
  }
  visit(nodeId)
  return ids
}

/** Descendant count excluding the node itself (shown in the collapse badge). */
export function countMindMapDescendants(element: MindMapElementData, nodeId: string): number {
  return getMindMapDescendantIds(element, nodeId).size - 1
}

export function getVisibleMindMapNodeIds(element: MindMapElementData): Set<string> {
  const ids = new Set<string>()
  const root = getMindMapRoot(element)
  if (!root) return ids
  const visit = (node: MindMapNodeData) => {
    ids.add(node.id)
    if (node.collapsed) return
    for (const child of getMindMapChildren(element, node.id)) visit(child)
  }
  visit(root)
  return ids
}

export function createMindMapNodeId(element: MindMapElementData): string {
  const used = new Set(element.nodes.map(node => node.id))
  let id = `node-${Date.now().toString(36)}`
  while (used.has(id)) id = `node-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`
  return id
}

export function addMindMapChildNode(element: MindMapElementData, parentId: string, text = '新节点', branch?: BranchSide): MindMapNodeData | null {
  if (element.nodes.length >= MINDMAP_MAX_NODES) return null
  const parent = element.nodes.find(node => node.id === parentId)
  if (!parent) return null
  branch = branch || resolveNodeBranch(parent)
  const node = createMindMapNode(createMindMapNodeId(element), text, branch, false, getMindMapScale(element))
  element.nodes.push(node)
  element.edges.push(createMindMapEdge(parent.id, node.id, branch))
  parent.collapsed = false
  layoutMindMap(element)
  return node
}

export function addMindMapSiblingNode(element: MindMapElementData, nodeId: string, text = '新节点'): MindMapNodeData | null {
  if (nodeId === MINDMAP_ROOT_ID) return null
  const parentId = findMindMapParentId(element, nodeId) || MINDMAP_ROOT_ID
  // A sibling inherits the reference node's branch, so adding next to a
  // right-side root child never lands the new node on the left.
  const reference = element.nodes.find(node => node.id === nodeId)
  const sibling = addMindMapChildNode(element, parentId, text, reference?.branch || 'right')
  const targetIndex = element.edges.findIndex(edge => edge.to === nodeId)
  const siblingIndex = sibling ? element.edges.findIndex(edge => edge.to === sibling.id) : -1
  if (targetIndex >= 0 && siblingIndex >= 0) {
    const [edge] = element.edges.splice(siblingIndex, 1)
    element.edges.splice(targetIndex + 1, 0, edge)
    layoutMindMap(element)
  }
  return sibling
}

export function deleteMindMapNodeById(element: MindMapElementData, nodeId: string): string {
  if (nodeId === MINDMAP_ROOT_ID) return MINDMAP_ROOT_ID
  const parentId = findMindMapParentId(element, nodeId) || MINDMAP_ROOT_ID
  const removeIds = getMindMapDescendantIds(element, nodeId)
  element.nodes = element.nodes.filter(node => !removeIds.has(node.id))
  element.edges = element.edges.filter(edge => !removeIds.has(edge.from) && !removeIds.has(edge.to))
  layoutMindMap(element)
  return parentId
}

export function toggleMindMapNodeCollapsed(element: MindMapElementData, nodeId: string): boolean {
  const node = element.nodes.find(item => item.id === nodeId)
  if (!node || getMindMapChildren(element, node.id).length === 0) return false
  node.collapsed = !node.collapsed
  layoutMindMap(element)
  return true
}

/**
 * Drag-to-reattach: where would the dragged node land if dropped at
 * `local` (element-local coordinates)? Returns null when the pointer is
 * too far from any valid parent. Pure preview — nothing is mutated.
 */
export function resolveMindMapDropTarget(element: MindMapElementData, draggedId: string, local: Point): MindMapDropTarget | null {
  const excluded = getMindMapDescendantIds(element, draggedId)
  const visible = getVisibleMindMapNodeIds(element)
  const s = getMindMapScale(element)

  let best: { node: MindMapNodeData; distSq: number } | null = null
  for (const node of element.nodes) {
    if (excluded.has(node.id) || !visible.has(node.id)) continue
    const dx = Math.max(node.x - local.x, 0, local.x - (node.x + node.width))
    const dy = Math.max(node.y - local.y, 0, local.y - (node.y + node.height))
    const distSq = dx * dx + dy * dy
    if (!best || distSq < best.distSq) best = { node, distSq }
  }
  const range = DROP_RANGE * s
  if (!best || best.distSq > range * range) {
    // Empty-space fallback: dropping into open space around the map
    // re-hangs the node under the root on the pointer's side, so moving a
    // child between the left and right branches is a plain drag. The zone
    // extends generously sideways (that's where the empty side lives) and
    // modestly vertically; dragging far off still cancels.
    const root = getMindMapRoot(element)
    if (!root || excluded.has(root.id)) return null
    const padX = 360 * s
    const padY = 120 * s
    if (local.x < -padX || local.y < -padY || local.x > element.width + padX || local.y > element.height + padY) return null
    const branch: BranchSide = local.x < root.x + root.width / 2 ? 'left' : 'right'
    return { parentId: root.id, index: dropIndexByY(element, root.id, branch, draggedId, local), branch }
  }

  const parent = best.node
  const branch: BranchSide = parent.id === MINDMAP_ROOT_ID
    ? (local.x < parent.x + parent.width / 2 ? 'left' : 'right')
    : (parent.branch || 'right')

  return { parentId: parent.id, index: dropIndexByY(element, parent.id, branch, draggedId, local), branch }
}

function dropIndexByY(element: MindMapElementData, parentId: string, branch: BranchSide, draggedId: string, local: Point): number {
  const siblings = getDropSiblings(element, parentId, branch, draggedId)
  for (let i = 0; i < siblings.length; i++) {
    if (local.y < siblings[i].y + siblings[i].height / 2) return i
  }
  return siblings.length
}

/**
 * Re-hang `nodeId` under `parentId` at `index` on `branch`. Returns false
 * for invalid moves (root, cycles, unknown ids) and no-op moves so callers
 * can skip persisting/undo-recording.
 */
export function reattachMindMapNode(element: MindMapElementData, nodeId: string, parentId: string, index: number, branch: BranchSide): boolean {
  if (nodeId === MINDMAP_ROOT_ID || parentId === nodeId) return false
  if (getMindMapDescendantIds(element, nodeId).has(parentId)) return false
  const node = element.nodes.find(item => item.id === nodeId)
  const parent = element.nodes.find(item => item.id === parentId)
  if (!node || !parent) return false
  const oldEdgeIndex = element.edges.findIndex(edge => edge.to === nodeId)
  if (oldEdgeIndex < 0) return false

  const oldParentId = element.edges[oldEdgeIndex].from
  if (oldParentId === parentId && (node.branch || 'right') === branch) {
    const siblings = getDropSiblings(element, parentId, branch, nodeId)
    const all = getDropSiblings(element, parentId, branch, '')
    const currentIndex = all.findIndex(item => item.id === nodeId)
    if (currentIndex >= 0 && Math.min(index, siblings.length) === Math.min(currentIndex, siblings.length)) return false
  }

  element.edges.splice(oldEdgeIndex, 1)

  // Find where the new edge slots in among the parent's (branch-scoped
  // for root) child edges so sibling order matches the drop indicator.
  const nodeMap = new Map(element.nodes.map(item => [item.id, item]))
  const isRoot = parentId === MINDMAP_ROOT_ID
  const childEdgeIndexes: number[] = []
  element.edges.forEach((edge, i) => {
    if (edge.from !== parentId) return
    if (isRoot) {
      const target = nodeMap.get(edge.to)
      if ((target?.branch || 'right') !== branch) return
    }
    childEdgeIndexes.push(i)
  })
  const insertAt = index < childEdgeIndexes.length
    ? childEdgeIndexes[index]
    : childEdgeIndexes.length
      ? childEdgeIndexes[childEdgeIndexes.length - 1] + 1
      : element.edges.length
  element.edges.splice(insertAt, 0, createMindMapEdge(parentId, nodeId, branch))

  node.branch = branch
  applyBranchToDescendants(element, node, branch)
  parent.collapsed = false
  layoutMindMap(element)
  return true
}

function getDropSiblings(element: MindMapElementData, parentId: string, branch: BranchSide, draggedId: string): MindMapNodeData[] {
  let children = getMindMapChildren(element, parentId).filter(child => child.id !== draggedId)
  if (parentId === MINDMAP_ROOT_ID) children = children.filter(child => (child.branch || 'right') === branch)
  return children
}

/** Collapse badge hit-test in element-local coordinates. */
export function getMindMapBadgeNodeId(element: MindMapElementData, local: Point): string | null {
  const s = getMindMapScale(element)
  const visible = getVisibleMindMapNodeIds(element)
  const radius = 9 * s + 3
  for (const node of element.nodes) {
    if (!visible.has(node.id)) continue
    if (getMindMapChildren(element, node.id).length === 0) continue
    const branch = node.branch || 'right'
    const cx = branch === 'left' ? node.x - 10 * s : node.x + node.width + 10 * s
    const cy = node.y + node.height / 2
    const dx = local.x - cx
    const dy = local.y - cy
    if (dx * dx + dy * dy <= radius * radius) return node.id
  }
  return null
}

export function getNearestMindMapNodeId(element: MindMapElementData, nodeId: string, direction: 'left' | 'right' | 'up' | 'down'): string | null {
  const current = element.nodes.find(node => node.id === nodeId)
  if (!current) return null
  const visible = getVisibleMindMapNodeIds(element)
  if (direction === 'left' || direction === 'right') {
    const currentCenter = nodeCenter(current)
    const candidates = element.nodes
      .filter(node => visible.has(node.id) && node.id !== nodeId)
      .filter(node => direction === 'left' ? nodeCenter(node).x < currentCenter.x - 8 : nodeCenter(node).x > currentCenter.x + 8)
      .map(node => ({ node, score: Math.abs(nodeCenter(node).y - currentCenter.y) * 3 + Math.abs(nodeCenter(node).x - currentCenter.x) }))
      .sort((a, b) => a.score - b.score)
    return candidates[0]?.node.id || null
  }

  const siblings = getSiblingNodes(element, nodeId).filter(node => visible.has(node.id))
  const index = siblings.findIndex(node => node.id === nodeId)
  if (index < 0) return null
  const next = direction === 'up' ? siblings[index - 1] : siblings[index + 1]
  return next?.id || null
}

export function normalizeMindMap(element: MindMapElementData) {
  element.layout = element.layout || 'mind'
  element.theme = element.theme || 'drawnix'
  const root = getMindMapRoot(element)
  if (root) {
    root.branch = root.branch || 'right'
    root.color = ROOT_COLOR
  }
  // Free-position drag is gone; legacy manual nodes return to auto layout.
  for (const node of element.nodes) {
    if (node.manualPosition) node.manualPosition = undefined
  }
  const rootChildren = root ? getMindMapChildren(element, root.id) : []
  rootChildren.forEach((child, index) => {
    child.branch = child.branch || (child.x + child.width / 2 < element.width / 2 || index % 2 === 1 ? 'left' : 'right')
    applyBranchToDescendants(element, child, child.branch)
  })
  layoutMindMap(element)
}

/**
 * Re-layout, then translate the element so the ROOT NODE keeps its world
 * position. Without this every structural change (reattach, collapse,
 * add/delete, text growth) re-flows from the element's fixed top-left and
 * the whole map visually jumps.
 */
export function layoutMindMap(element: MindMapElementData) {
  const anchor = getMindMapRootWorldCenter(element)
  layoutMindMapCore(element)
  if (!anchor) return
  const moved = getMindMapRootWorldCenter(element)
  if (!moved) return
  element.x += anchor.x - moved.x
  element.y += anchor.y - moved.y
}

/** World position of the root node's center, honoring element rotation. */
function getMindMapRootWorldCenter(element: MindMapElementData): Point | null {
  const root = getMindMapRoot(element)
  if (!root) return null
  const local = {
    x: root.x + root.width / 2 - element.width / 2,
    y: root.y + root.height / 2 - element.height / 2,
  }
  const rotated = rotatePoint(local, degreesToRadians(element.rotation ?? 0))
  return {
    x: element.x + element.width / 2 + rotated.x,
    y: element.y + element.height / 2 + rotated.y,
  }
}

function layoutMindMapCore(element: MindMapElementData) {
  const root = getMindMapRoot(element)
  if (!root) return
  const s = getMindMapScale(element)
  element.layout = 'mind'
  element.theme = 'drawnix'
  root.width = Math.max(ROOT_WIDTH * s, root.width || 0)
  root.height = Math.max(ROOT_HEIGHT * s, root.height || 0)
  root.color = ROOT_COLOR
  root.branch = 'right'

  const rootChildren = getMindMapChildren(element, root.id)
  const leftChildren: MindMapNodeData[] = []
  const rightChildren: MindMapNodeData[] = []
  rootChildren.forEach((child, index) => {
    let branch = child.branch
    if (!branch) {
      branch = child.x + child.width / 2 < element.width / 2 || (leftChildren.length < rightChildren.length && index > 0) ? 'left' : 'right'
      child.branch = branch
    }
    if (branch === 'left') leftChildren.push(child)
    else rightChildren.push(child)
  })
  // No auto-balancing: which side a child sits on is the user's choice
  // (made by dragging); the layout only honors it.

  for (const child of leftChildren) applyBranchToDescendants(element, child, 'left')
  for (const child of rightChildren) applyBranchToDescendants(element, child, 'right')

  const leftLayouts = leftChildren.map(node => buildSubtreeLayout(element, node, 'left', s))
  const rightLayouts = rightChildren.map(node => buildSubtreeLayout(element, node, 'right', s))
  const leftWidth = maxLayoutWidth(leftLayouts)
  const leftHeight = stackHeight(leftLayouts, s)
  const rightHeight = stackHeight(rightLayouts, s)
  const rootX = CANVAS_PADDING * s + leftWidth + (leftWidth > 0 ? ROOT_GAP * s : 0)
  const rootY = CANVAS_PADDING * s + Math.max(leftHeight, rightHeight, root.height) / 2 - root.height / 2

  root.x = rootX
  root.y = rootY

  placeLayoutStack(element, leftLayouts, 'left', root.x - ROOT_GAP * s, root.y + root.height / 2 - leftHeight / 2, s)
  placeLayoutStack(element, rightLayouts, 'right', root.x + root.width + ROOT_GAP * s, root.y + root.height / 2 - rightHeight / 2, s)

  const visibleIds = getVisibleMindMapNodeIds(element)
  const bounds = getNodeBounds(element.nodes.filter(node => visibleIds.has(node.id)))
  element.width = Math.max(320 * s, bounds.maxX + CANVAS_PADDING * s)
  element.height = Math.max(220 * s, bounds.maxY + CANVAS_PADDING * s, root.y + root.height + CANVAS_PADDING * s)
  updateEdgeStrokes(element)
}

function buildSubtreeLayout(element: MindMapElementData, node: MindMapNodeData, branch: BranchSide, s: number): SubtreeLayout {
  node.branch = branch
  node.color = branch === 'left' ? LEFT_COLOR : RIGHT_COLOR
  node.width = Math.max(96 * s, Math.min(260 * s, node.width || NODE_WIDTH * s))
  // No max clamp: node height adapts to wrapped text lines.
  node.height = Math.max(38 * s, node.height || NODE_HEIGHT * s)
  const childLayouts = node.collapsed ? [] : getMindMapChildren(element, node.id).map(child => buildSubtreeLayout(element, child, branch, s))
  const childHeight = stackHeight(childLayouts, s)
  const height = Math.max(node.height, childHeight)
  const width = node.width + (childLayouts.length ? H_GAP * s + maxLayoutWidth(childLayouts) : 0)
  return { node, width, height, children: childLayouts }
}

function placeLayoutStack(element: MindMapElementData, layouts: SubtreeLayout[], branch: BranchSide, anchorX: number, startY: number, s: number) {
  let cursor = startY
  for (const layout of layouts) {
    placeSubtreeLayout(element, layout, branch, anchorX, cursor, s)
    cursor += layout.height + V_GAP * s
  }
}

function placeSubtreeLayout(element: MindMapElementData, layout: SubtreeLayout, branch: BranchSide, anchorX: number, top: number, s: number) {
  const node = layout.node
  node.x = branch === 'left' ? anchorX - node.width : anchorX
  node.y = top + layout.height / 2 - node.height / 2

  if (layout.children.length === 0) return
  const childAnchorX = branch === 'left' ? node.x - H_GAP * s : node.x + node.width + H_GAP * s
  let cursor = top + layout.height / 2 - stackHeight(layout.children, s) / 2
  for (const child of layout.children) {
    placeSubtreeLayout(element, child, branch, childAnchorX, cursor, s)
    cursor += child.height + V_GAP * s
  }
}

function applyBranchToDescendants(element: MindMapElementData, node: MindMapNodeData, branch: BranchSide) {
  node.branch = branch
  node.color = branch === 'left' ? LEFT_COLOR : RIGHT_COLOR
  for (const child of getMindMapChildren(element, node.id)) applyBranchToDescendants(element, child, branch)
}

function updateEdgeStrokes(element: MindMapElementData) {
  const nodeMap = new Map(element.nodes.map(node => [node.id, node]))
  for (const edge of element.edges) {
    const to = nodeMap.get(edge.to)
    edge.stroke = (to?.branch || 'right') === 'left' ? LEFT_STROKE : RIGHT_STROKE
  }
}

function getMindMapRoot(element: MindMapElementData): MindMapNodeData | null {
  return element.nodes.find(node => node.id === MINDMAP_ROOT_ID) || element.nodes[0] || null
}

/**
 * New root children always start on the right (no auto-balancing — the
 * user moves nodes left by dragging); other nodes keep their own branch.
 */
function resolveNodeBranch(node: MindMapNodeData): BranchSide {
  if (node.id !== MINDMAP_ROOT_ID) return node.branch || 'right'
  return 'right'
}

function getSiblingNodes(element: MindMapElementData, nodeId: string): MindMapNodeData[] {
  const parentId = findMindMapParentId(element, nodeId)
  if (!parentId) return element.nodes.filter(node => node.id === nodeId)
  return getMindMapChildren(element, parentId)
}

function stackHeight(layouts: SubtreeLayout[], s: number) {
  if (layouts.length === 0) return 0
  return layouts.reduce((sum, item) => sum + item.height, 0) + V_GAP * s * (layouts.length - 1)
}

function maxLayoutWidth(layouts: SubtreeLayout[]) {
  return layouts.reduce((max, item) => Math.max(max, item.width), 0)
}

function nodeCenter(node: MindMapNodeData) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function getNodeBounds(nodes: MindMapNodeData[]) {
  return nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxX: Math.max(bounds.maxX, node.x + node.width),
    maxY: Math.max(bounds.maxY, node.y + node.height),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}
