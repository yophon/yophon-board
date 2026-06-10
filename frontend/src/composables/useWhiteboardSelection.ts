import { ref, type Ref } from 'vue'
import { layoutMindMap } from '../whiteboard/mindmap'
import {
  applyElementTransform,
  cloneElement,
  elementIntersectsBox,
  elementKey,
  getInteractiveGeometry,
  getSelectionGeometry,
  hitTestElements as hitTestSelectionElements,
  isDrawingStroke,
  worldToMindMapLocal,
  type ElementTransformState,
  type TransformMode,
} from '../whiteboard/selection'
import type { CanvasStroke, MindMapElementData, MindMapNodeData, Point } from '../whiteboard/types'

export interface MindMapNodeDragState {
  element: MindMapElementData & CanvasStroke
  nodeId: string
  startPointer: Point
  startNode: MindMapNodeData
}

interface UseWhiteboardSelectionOptions {
  strokes: Ref<CanvasStroke[]>
  scale: Ref<number>
}

/**
 * Selection state machine: which elements are selected, plus the three
 * mutually exclusive pointer interactions that operate on the selection —
 * group transform (move/resize/rotate), mind-map node drag, and box select.
 *
 * Transforms keep a cloned snapshot of the elements at gesture start, so
 * `cancelTransform()` (Escape) can restore them losslessly.
 */
export function useWhiteboardSelection(options: UseWhiteboardSelectionOptions) {
  const { strokes, scale } = options

  const selectedElementKeys = ref<string[]>([])
  const selectedMindMapNodeId = ref<string | null>(null)
  const isElementTransforming = ref(false)
  const isMindMapNodeDragging = ref(false)
  const isBoxSelecting = ref(false)
  const selectionBoxStart = ref<Point | null>(null)
  const selectionBoxEnd = ref<Point | null>(null)
  let elementTransform: ElementTransformState | null = null
  let mindMapNodeDrag: MindMapNodeDragState | null = null

  function getSelectedElements(): CanvasStroke[] {
    const keys = new Set(selectedElementKeys.value)
    if (keys.size === 0) return []
    return strokes.value.filter(stroke => keys.has(elementKey(stroke)))
  }

  function setSelectedElements(elements: CanvasStroke[]) {
    selectedElementKeys.value = elements.map(elementKey)
    if (elements.length !== 1 || elements[0].type !== 'mindmap') selectedMindMapNodeId.value = null
    else if (selectedMindMapNodeId.value && !elements[0].nodes.some(node => node.id === selectedMindMapNodeId.value)) {
      selectedMindMapNodeId.value = null
    } else if (!selectedMindMapNodeId.value) {
      selectedMindMapNodeId.value = 'root'
    }
  }

  function isElementSelected(element: CanvasStroke) {
    return selectedElementKeys.value.includes(elementKey(element))
  }

  function clearSelection() {
    selectedElementKeys.value = []
    selectedMindMapNodeId.value = null
    isElementTransforming.value = false
    isMindMapNodeDragging.value = false
    isBoxSelecting.value = false
    selectionBoxStart.value = null
    selectionBoxEnd.value = null
    elementTransform = null
    mindMapNodeDrag = null
  }

  /** Rename a selection key after a stroke's identity changed (local → id). */
  function remapKey(previousKey: string, nextKey: string) {
    if (previousKey === nextKey) return
    selectedElementKeys.value = selectedElementKeys.value.map(key => (key === previousKey ? nextKey : key))
  }

  function dropKey(key: string) {
    selectedElementKeys.value = selectedElementKeys.value.filter(item => item !== key)
  }

  function hitTest(point: Point) {
    return hitTestSelectionElements(point, strokes.value, getSelectedElements(), scale.value)
  }

  // —— group transform ——

  function beginTransform(mode: TransformMode, worldPoint: Point) {
    const selected = getSelectedElements()
    if (selected.length === 0) return
    const geometry = getInteractiveGeometry(getSelectionGeometry(selected), scale.value)
    isElementTransforming.value = true
    elementTransform = {
      mode,
      startPointer: worldPoint,
      startElements: selected.map(cloneElement),
      startGeometry: geometry,
      startAngle: Math.atan2(worldPoint.y - geometry.center.y, worldPoint.x - geometry.center.x),
    }
  }

  function updateTransform(worldPoint: Point) {
    if (!isElementTransforming.value || !elementTransform) return
    applyElementTransform(worldPoint, elementTransform, strokes.value)
  }

  /** Finish the gesture and return the elements that need persisting. */
  function endTransform(): CanvasStroke[] {
    if (!isElementTransforming.value) return []
    isElementTransforming.value = false
    elementTransform = null
    return getSelectedElements()
  }

  /** Abort the gesture and restore the pre-gesture geometry. Returns whether a gesture was active. */
  function cancelTransform(): boolean {
    if (!isElementTransforming.value || !elementTransform) return false
    for (const start of elementTransform.startElements) {
      const live = strokes.value.find(stroke => elementKey(stroke) === elementKey(start))
      if (live) Object.assign(live, cloneElement(start))
    }
    isElementTransforming.value = false
    elementTransform = null
    return true
  }

  // —— mind-map node drag ——

  function beginNodeDrag(element: MindMapElementData & CanvasStroke, nodeId: string, worldPoint: Point) {
    const node = element.nodes.find(item => item.id === nodeId)
    if (!node) return
    selectedMindMapNodeId.value = nodeId
    if (!isElementSelected(element)) setSelectedElements([element])
    isMindMapNodeDragging.value = true
    mindMapNodeDrag = {
      element,
      nodeId,
      startPointer: worldToMindMapLocal(worldPoint, element),
      startNode: { ...node },
    }
  }

  function updateNodeDrag(worldPoint: Point) {
    if (!mindMapNodeDrag || mindMapNodeDrag.element.type !== 'mindmap') return
    const element = mindMapNodeDrag.element
    const node = element.nodes.find(item => item.id === mindMapNodeDrag?.nodeId)
    if (!node) return
    const local = worldToMindMapLocal(worldPoint, element)
    const dx = local.x - mindMapNodeDrag.startPointer.x
    const dy = local.y - mindMapNodeDrag.startPointer.y
    node.x = Math.max(8, mindMapNodeDrag.startNode.x + dx)
    node.y = Math.max(8, mindMapNodeDrag.startNode.y + dy)
    node.manualPosition = true
    if (node.id !== 'root') {
      const root = element.nodes.find(item => item.id === 'root')
      if (root) node.branch = node.x + node.width / 2 < root.x + root.width / 2 ? 'left' : 'right'
    }
    layoutMindMap(element)
    selectedMindMapNodeId.value = node.id
  }

  /** Finish the drag and return the element that needs persisting (if any). */
  function endNodeDrag(): CanvasStroke | null {
    const element = mindMapNodeDrag?.element ?? null
    isMindMapNodeDragging.value = false
    mindMapNodeDrag = null
    return element
  }

  /** Abort the drag and restore the node's pre-drag position. Returns whether a drag was active. */
  function cancelNodeDrag(): boolean {
    if (!isMindMapNodeDragging.value || !mindMapNodeDrag) return false
    const element = mindMapNodeDrag.element
    const node = element.nodes.find(item => item.id === mindMapNodeDrag?.nodeId)
    if (node) {
      Object.assign(node, mindMapNodeDrag.startNode)
      layoutMindMap(element)
    }
    isMindMapNodeDragging.value = false
    mindMapNodeDrag = null
    return true
  }

  /** Whether the given element is in the middle of a transform or node drag. */
  function isElementInteracting(element: CanvasStroke): boolean {
    if (isElementTransforming.value && isElementSelected(element)) return true
    if (isMindMapNodeDragging.value && mindMapNodeDrag?.element === element) return true
    return false
  }

  // —— box selection ——

  function beginBoxSelect(worldPoint: Point) {
    clearSelection()
    isBoxSelecting.value = true
    selectionBoxStart.value = worldPoint
    selectionBoxEnd.value = worldPoint
  }

  function updateBoxSelect(worldPoint: Point) {
    selectionBoxEnd.value = worldPoint
  }

  function endBoxSelect() {
    if (!isBoxSelecting.value) return
    isBoxSelecting.value = false
    const start = selectionBoxStart.value
    const end = selectionBoxEnd.value
    selectionBoxStart.value = null
    selectionBoxEnd.value = null
    if (!start || !end) return
    const left = Math.min(start.x, end.x)
    const right = Math.max(start.x, end.x)
    const top = Math.min(start.y, end.y)
    const bottom = Math.max(start.y, end.y)
    const minSize = 4 / scale.value

    if (right - left < minSize && bottom - top < minSize) {
      clearSelection()
      return
    }

    const selected = strokes.value.filter(stroke => {
      if (isDrawingStroke(stroke) && stroke.tool === 'eraser') return false
      return elementIntersectsBox(stroke, { left, right, top, bottom }, scale.value)
    })
    setSelectedElements(selected)
  }

  /** Escape handler: cancel the active gesture, else drop the selection. Returns true when something changed. */
  function cancelActiveInteraction(): boolean {
    if (cancelTransform()) return true
    if (cancelNodeDrag()) return true
    if (isBoxSelecting.value || selectedElementKeys.value.length > 0) {
      clearSelection()
      return true
    }
    return false
  }

  return {
    selectedElementKeys,
    selectedMindMapNodeId,
    isElementTransforming,
    isMindMapNodeDragging,
    isBoxSelecting,
    selectionBoxStart,
    selectionBoxEnd,
    getSelectedElements,
    setSelectedElements,
    isElementSelected,
    clearSelection,
    remapKey,
    dropKey,
    hitTest,
    beginTransform,
    updateTransform,
    endTransform,
    cancelTransform,
    beginNodeDrag,
    updateNodeDrag,
    endNodeDrag,
    cancelNodeDrag,
    isElementInteracting,
    beginBoxSelect,
    updateBoxSelect,
    endBoxSelect,
    cancelActiveInteraction,
  }
}
