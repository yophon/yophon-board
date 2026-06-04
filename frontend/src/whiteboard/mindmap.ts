import type { MindMapEdgeData, MindMapElementData, MindMapNodeData } from './types'

export const MINDMAP_MAX_NODES = 80
export const MINDMAP_ROOT_ID = 'root'

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

type BranchSide = 'left' | 'right'

interface SubtreeLayout {
  node: MindMapNodeData
  width: number
  height: number
  children: SubtreeLayout[]
}

export function createDrawnixMindMapTemplate(x: number, y: number, width: number, height: number): MindMapElementData {
  const mindmap: MindMapElementData = {
    type: 'mindmap',
    x,
    y,
    width,
    height,
    rotation: 0,
    fontSize: 17,
    layout: 'mind',
    theme: 'drawnix',
    nodes: [
      createMindMapNode(MINDMAP_ROOT_ID, '中心主题', 'right', true),
      createMindMapNode('right-1', '关键想法', 'right'),
      createMindMapNode('right-2', '行动项', 'right'),
      createMindMapNode('left-1', '背景资料', 'left'),
      createMindMapNode('left-2', '风险问题', 'left'),
    ],
    edges: [
      createMindMapEdge(MINDMAP_ROOT_ID, 'right-1', 'right'),
      createMindMapEdge(MINDMAP_ROOT_ID, 'right-2', 'right'),
      createMindMapEdge(MINDMAP_ROOT_ID, 'left-1', 'left'),
      createMindMapEdge(MINDMAP_ROOT_ID, 'left-2', 'left'),
    ],
  }
  layoutMindMap(mindmap)
  return mindmap
}

export function createMindMapNode(id: string, text = '新节点', branch: BranchSide = 'right', root = false): MindMapNodeData {
  return {
    id,
    text,
    x: 0,
    y: 0,
    width: root ? ROOT_WIDTH : NODE_WIDTH,
    height: root ? ROOT_HEIGHT : NODE_HEIGHT,
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

export function addMindMapChildNode(element: MindMapElementData, parentId: string, text = '新节点'): MindMapNodeData | null {
  if (element.nodes.length >= MINDMAP_MAX_NODES) return null
  const parent = element.nodes.find(node => node.id === parentId)
  if (!parent) return null
  const branch = resolveNodeBranch(element, parent)
  const node = createMindMapNode(createMindMapNodeId(element), text, branch)
  element.nodes.push(node)
  element.edges.push(createMindMapEdge(parent.id, node.id, branch))
  parent.collapsed = false
  layoutMindMap(element)
  return node
}

export function addMindMapSiblingNode(element: MindMapElementData, nodeId: string, text = '新节点'): MindMapNodeData | null {
  if (nodeId === MINDMAP_ROOT_ID) return null
  const parentId = findMindMapParentId(element, nodeId) || MINDMAP_ROOT_ID
  const sibling = addMindMapChildNode(element, parentId, text)
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

export function getNearestMindMapNodeId(element: MindMapElementData, nodeId: string, direction: 'left' | 'right' | 'up' | 'down'): string | null {
  const current = element.nodes.find(node => node.id === nodeId)
  if (!current) return null
  if (direction === 'left' || direction === 'right') {
    const currentCenter = nodeCenter(current)
    const candidates = element.nodes
      .filter(node => getVisibleMindMapNodeIds(element).has(node.id) && node.id !== nodeId)
      .filter(node => direction === 'left' ? nodeCenter(node).x < currentCenter.x - 8 : nodeCenter(node).x > currentCenter.x + 8)
      .map(node => ({ node, score: Math.abs(nodeCenter(node).y - currentCenter.y) * 3 + Math.abs(nodeCenter(node).x - currentCenter.x) }))
      .sort((a, b) => a.score - b.score)
    return candidates[0]?.node.id || null
  }

  const siblings = getSiblingNodes(element, nodeId).filter(node => getVisibleMindMapNodeIds(element).has(node.id))
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
  const rootChildren = root ? getMindMapChildren(element, root.id) : []
  rootChildren.forEach((child, index) => {
    child.branch = child.branch || (child.x + child.width / 2 < element.width / 2 || index % 2 === 1 ? 'left' : 'right')
    applyBranchToDescendants(element, child, child.branch)
  })
  layoutMindMap(element)
}

export function layoutMindMap(element: MindMapElementData) {
  const root = getMindMapRoot(element)
  if (!root) return
  element.layout = 'mind'
  element.theme = 'drawnix'
  root.width = Math.max(ROOT_WIDTH, root.width || ROOT_WIDTH)
  root.height = Math.max(ROOT_HEIGHT, root.height || ROOT_HEIGHT)
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
  if (leftChildren.length === 0 && rightChildren.length > 2) {
    const moved = rightChildren.splice(1, 1)[0]
    moved.branch = 'left'
    leftChildren.push(moved)
  }
  if (rightChildren.length === 0 && leftChildren.length > 1) {
    const moved = leftChildren.splice(0, 1)[0]
    moved.branch = 'right'
    rightChildren.push(moved)
  }

  for (const child of leftChildren) applyBranchToDescendants(element, child, 'left')
  for (const child of rightChildren) applyBranchToDescendants(element, child, 'right')

  const leftLayouts = leftChildren.map(node => buildSubtreeLayout(element, node, 'left'))
  const rightLayouts = rightChildren.map(node => buildSubtreeLayout(element, node, 'right'))
  const leftWidth = maxLayoutWidth(leftLayouts)
  const rightWidth = maxLayoutWidth(rightLayouts)
  const leftHeight = stackHeight(leftLayouts)
  const rightHeight = stackHeight(rightLayouts)
  const rootX = CANVAS_PADDING + leftWidth + (leftWidth > 0 ? ROOT_GAP : 0)
  const rootY = CANVAS_PADDING + Math.max(leftHeight, rightHeight, root.height) / 2 - root.height / 2

  if (!root.manualPosition) {
    root.x = rootX
    root.y = rootY
  }

  placeLayoutStack(element, leftLayouts, 'left', root.x - ROOT_GAP, root.y + root.height / 2 - leftHeight / 2)
  placeLayoutStack(element, rightLayouts, 'right', root.x + root.width + ROOT_GAP, root.y + root.height / 2 - rightHeight / 2)

  const visibleIds = getVisibleMindMapNodeIds(element)
  const bounds = getNodeBounds(element.nodes.filter(node => visibleIds.has(node.id)))
  element.width = Math.max(320, bounds.maxX + CANVAS_PADDING)
  element.height = Math.max(220, bounds.maxY + CANVAS_PADDING, root.y + root.height + CANVAS_PADDING)
  updateEdgeStrokes(element)
}

function buildSubtreeLayout(element: MindMapElementData, node: MindMapNodeData, branch: BranchSide): SubtreeLayout {
  node.branch = branch
  node.color = branch === 'left' ? LEFT_COLOR : RIGHT_COLOR
  node.width = Math.max(96, Math.min(220, node.width || NODE_WIDTH))
  node.height = Math.max(38, Math.min(78, node.height || NODE_HEIGHT))
  const childLayouts = node.collapsed ? [] : getMindMapChildren(element, node.id).map(child => buildSubtreeLayout(element, child, branch))
  const childHeight = stackHeight(childLayouts)
  const height = Math.max(node.height, childHeight)
  const width = node.width + (childLayouts.length ? H_GAP + maxLayoutWidth(childLayouts) : 0)
  return { node, width, height, children: childLayouts }
}

function placeLayoutStack(element: MindMapElementData, layouts: SubtreeLayout[], branch: BranchSide, anchorX: number, startY: number) {
  let cursor = startY
  for (const layout of layouts) {
    placeSubtreeLayout(element, layout, branch, anchorX, cursor)
    cursor += layout.height + V_GAP
  }
}

function placeSubtreeLayout(element: MindMapElementData, layout: SubtreeLayout, branch: BranchSide, anchorX: number, top: number) {
  const node = layout.node
  if (!node.manualPosition) {
    node.x = branch === 'left' ? anchorX - node.width : anchorX
    node.y = top + layout.height / 2 - node.height / 2
  }

  if (layout.children.length === 0) return
  const childAnchorX = branch === 'left' ? node.x - H_GAP : node.x + node.width + H_GAP
  let cursor = top + layout.height / 2 - stackHeight(layout.children) / 2
  for (const child of layout.children) {
    placeSubtreeLayout(element, child, branch, childAnchorX, cursor)
    cursor += child.height + V_GAP
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

function resolveNodeBranch(element: MindMapElementData, node: MindMapNodeData): BranchSide {
  if (node.id !== MINDMAP_ROOT_ID) return node.branch || 'right'
  const rootChildren = getMindMapChildren(element, node.id)
  const left = rootChildren.filter(child => child.branch === 'left').length
  const right = rootChildren.length - left
  return right <= left ? 'right' : 'left'
}

function getSiblingNodes(element: MindMapElementData, nodeId: string): MindMapNodeData[] {
  const parentId = findMindMapParentId(element, nodeId)
  if (!parentId) return element.nodes.filter(node => node.id === nodeId)
  return getMindMapChildren(element, parentId)
}

function stackHeight(layouts: SubtreeLayout[]) {
  if (layouts.length === 0) return 0
  return layouts.reduce((sum, item) => sum + item.height, 0) + V_GAP * (layouts.length - 1)
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
