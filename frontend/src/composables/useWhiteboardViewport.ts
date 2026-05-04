import { ref, type Ref } from 'vue'
import type { Point } from '../whiteboard/types'

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_FACTOR_IN = 1.1
const ZOOM_FACTOR_OUT = 0.9

interface UseWhiteboardViewportOptions {
  canvasRef: Ref<HTMLCanvasElement | undefined>
  /** Called whenever the viewport changes; canvas owners use it to schedule a re-render. */
  onChange: () => void
}

export interface ViewportBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Pan + zoom state for the canvas. The viewport is `worldPoint = (canvasPoint - offset) / scale`,
 * so `offsetX/Y` are in canvas-pixel space and `scale` is the world→canvas multiplier.
 *
 * State refs (`offsetX`, `offsetY`, `scale`) are exposed directly so callers
 * can write to them when it's natural — e.g. the pan handler does
 * `offsetX.value += e.movementX` rather than going through a wrapper.
 *
 * Higher-level operations (`zoomAtCanvasPoint`, `centerOnWorldPoint`,
 * `reset`) are provided for the cases where the math is non-trivial.
 *
 * The composable does NOT call `onChange` on direct ref writes; callers
 * must trigger a re-render after mutating refs (the original component
 * already does this). `zoomAtCanvasPoint` / `centerOnWorldPoint` /
 * `reset` DO call `onChange`.
 */
export function useWhiteboardViewport(options: UseWhiteboardViewportOptions) {
  const offsetX = ref(0)
  const offsetY = ref(0)
  const scale = ref(1)

  function getCanvasRect(): DOMRect | undefined {
    return options.canvasRef.value?.getBoundingClientRect()
  }

  function clientToCanvas(sx: number, sy: number): Point {
    const rect = options.canvasRef.value!.getBoundingClientRect()
    return { x: sx - rect.left, y: sy - rect.top }
  }

  function clientToWorld(sx: number, sy: number): Point {
    const c = clientToCanvas(sx, sy)
    return {
      x: (c.x - offsetX.value) / scale.value,
      y: (c.y - offsetY.value) / scale.value,
    }
  }

  /** Zoom keeping the given canvas-space point fixed. Used by wheel zoom and pinch zoom. */
  function zoomAtCanvasPoint(canvasPoint: Point, factor: number) {
    const nextScale = clamp(scale.value * factor, MIN_SCALE, MAX_SCALE)
    if (nextScale === scale.value) return
    offsetX.value = canvasPoint.x - (canvasPoint.x - offsetX.value) * (nextScale / scale.value)
    offsetY.value = canvasPoint.y - (canvasPoint.y - offsetY.value) * (nextScale / scale.value)
    scale.value = nextScale
    options.onChange()
  }

  /** Wheel handler: zoom in / out at the cursor position. */
  function onWheel(e: WheelEvent) {
    const canvasPoint = clientToCanvas(e.clientX, e.clientY)
    zoomAtCanvasPoint(canvasPoint, e.deltaY > 0 ? ZOOM_FACTOR_OUT : ZOOM_FACTOR_IN)
  }

  /** Re-center the viewport on a world-space point, keeping current scale. */
  function centerOnWorldPoint(world: Point) {
    const rect = getCanvasRect()
    if (!rect) return
    offsetX.value = rect.width / 2 - world.x * scale.value
    offsetY.value = rect.height / 2 - world.y * scale.value
    options.onChange()
  }

  function reset() {
    offsetX.value = 0
    offsetY.value = 0
    scale.value = 1
    options.onChange()
  }

  /** World-space rectangle currently visible in the canvas. Used by the mini-map. */
  function getViewportWorldBounds(): ViewportBounds {
    const rect = getCanvasRect()
    const width = rect?.width || 1
    const height = rect?.height || 1
    return {
      minX: -offsetX.value / scale.value,
      minY: -offsetY.value / scale.value,
      maxX: (width - offsetX.value) / scale.value,
      maxY: (height - offsetY.value) / scale.value,
    }
  }

  return {
    offsetX,
    offsetY,
    scale,
    clientToWorld,
    clientToCanvas,
    zoomAtCanvasPoint,
    onWheel,
    centerOnWorldPoint,
    reset,
    getViewportWorldBounds,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
