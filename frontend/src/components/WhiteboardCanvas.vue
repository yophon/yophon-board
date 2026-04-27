<template>
  <div class="whiteboard-wrap" :class="{ 'web-fullscreen': isWebFullscreen }" ref="wrapRef">
    <canvas
      ref="canvasRef"
      :style="{ cursor: currentTool === 'drag' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
    ></canvas>
    <canvas
      ref="miniMapRef"
      class="wb-minimap"
      width="180"
      height="120"
      @pointerdown="onMiniMapPointer"
      title="小地图"
    ></canvas>

    <Transition name="wb-panel">
      <div v-if="currentTool === 'pen' || currentTool === 'eraser'" class="wb-settings">
        <template v-if="currentTool === 'pen'">
          <div class="wb-color-col">
            <button
              v-for="c in paletteColors"
              :key="c"
              class="wb-color-btn"
              :class="{ active: presets[activePresetIndex].color === c }"
              @click="updatePreset('color', c)"
            >
              <span class="wb-color-fill" :style="{ background: c }"></span>
            </button>
            <label
              class="wb-color-btn wb-color-custom"
              :class="{ active: !paletteColors.includes(presets[activePresetIndex].color) }"
            >
              <input
                type="color"
                :value="presets[activePresetIndex].color"
                @input="updatePreset('color', ($event.target as HTMLInputElement).value)"
              />
              <span
                class="wb-color-fill wb-color-custom-fill"
                :style="{
                  background: paletteColors.includes(presets[activePresetIndex].color)
                    ? 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)'
                    : presets[activePresetIndex].color
                }"
              ></span>
            </label>
          </div>
          <div class="wb-sep"></div>
        </template>

        <div class="wb-width-slider-wrap">
          <span class="wb-width-label">{{ currentTool === 'eraser' ? eraserWidth : presets[activePresetIndex].width }}px</span>
          <input
            type="range"
            min="1"
            max="60"
            :value="currentTool === 'eraser' ? eraserWidth : presets[activePresetIndex].width"
            @input="onWidthInput(Number(($event.target as HTMLInputElement).value))"
            class="wb-range-v"
          />
          <div
            class="wb-width-preview"
            :style="{
              width: Math.min(Math.max(currentTool === 'eraser' ? eraserWidth : presets[activePresetIndex].width, 2), 28) + 'px',
              height: Math.min(Math.max(currentTool === 'eraser' ? eraserWidth : presets[activePresetIndex].width, 2), 28) + 'px',
              background: currentTool === 'eraser' ? 'var(--color-muted)' : presets[activePresetIndex].color,
              borderRadius: '50%'
            }"
          ></div>
        </div>
      </div>
    </Transition>

    <div class="wb-toolbar">
      <span class="wb-live-dot" :class="wsState" :title="wsTitle"></span>
      <button
        v-for="(p, i) in presets"
        :key="i"
        class="wb-pen-btn"
        :class="{ active: currentTool === 'pen' && activePresetIndex === i }"
        @click="selectPreset(i)"
      >
        <span class="wb-pen-indicator" :style="{ background: p.color }">
          <span
            class="wb-pen-tip"
            :style="{
              width: Math.min(Math.max(p.width * 0.6, 3), 14) + 'px',
              height: Math.min(Math.max(p.width * 0.6, 3), 14) + 'px'
            }"
          ></span>
        </span>
      </button>
      <span class="wb-toolbar-sep"></span>
      <button class="wb-tool-btn" :disabled="currentPage === 0" @click="goToPage(currentPage - 1)" title="上一页">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="wb-page-label">第 {{ currentPage }} 页</span>
      <button class="wb-tool-btn" @click="goToPage(currentPage + 1)" title="下一页">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <span class="wb-toolbar-sep"></span>
      <button class="wb-tool-btn" :class="{ active: currentTool === 'eraser' }" @click="currentTool = 'eraser'; currentWidth = eraserWidth" title="橡皮擦">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 20H7L3 16l9-9 8 8-4 4z"/><path d="M6.5 13.5L15 5"/></svg>
      </button>
      <button class="wb-tool-btn" :class="{ active: currentTool === 'drag' }" @click="currentTool = 'drag'" title="拖拽画布">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
      </button>
      <button class="wb-tool-btn" @click="resetView" title="重置视图">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
      <button
        class="wb-tool-btn"
        @pointerdown="startFullscreenPress"
        @pointerup="finishFullscreenPress"
        @pointerleave="cancelFullscreenPress"
        :title="fullscreenTitle"
      >
        <svg v-if="!isWebFullscreen && !isFullscreen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M20 8V5a1 1 0 0 0-1-1h-3"/><path d="M4 16v3a1 1 0 0 0 1 1h3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M9 12h6"/></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v3a1 1 0 0 1-1 1H4"/><path d="M16 4v3a1 1 0 0 0 1 1h3"/><path d="M8 20v-3a1 1 0 0 0-1-1H4"/><path d="M16 20v-3a1 1 0 0 1 1-1h3"/><path d="M9 12h6"/></svg>
      </button>
      <button class="wb-tool-btn" :disabled="!canUndo" @click="undoLastStroke" title="撤销本次绘制">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></svg>
      </button>
      <button class="wb-tool-btn" @click="exportPng" title="导出 PNG">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
      </button>
      <button class="wb-tool-btn" @click="copyShareLink" title="复制当前页链接">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </button>
      <button v-if="failedCount > 0" class="wb-tool-btn wb-alert-btn" @click="retryFailedSaves" title="重试保存失败的笔画">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
      </button>
      <button v-if="authStore.authed" class="wb-tool-btn wb-danger-btn" @click="clearBoard" title="清空白板">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
      </button>
    </div>

    <div v-if="statusMessage" class="wb-toast">{{ statusMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../composables/useApi'
import { useAuthStore } from '../stores/auth'
import { ensureLegacyClientId, loadPendingStrokes, savePendingStrokes } from '../whiteboard/pendingStorage'
import {
  applySavedRow,
  createLocalStroke,
  getCenter,
  getDistance,
  parseStrokeRow,
  persistableStroke,
} from '../whiteboard/strokeModel'
import type {
  CanvasStroke,
  Point,
  StrokeData,
  StrokeRow,
  WhiteboardWsMessage,
  WsState,
} from '../whiteboard/types'

const props = withDefaults(defineProps<{
  boardSlug?: string
}>(), {
  boardSlug: 'main',
})

const canvasRef = ref<HTMLCanvasElement>()
const miniMapRef = ref<HTMLCanvasElement>()
const wrapRef = ref<HTMLDivElement>()
const authStore = useAuthStore()

const offsetX = ref(0)
const offsetY = ref(0)
const scale = ref(1)

const isDrawing = ref(false)
const isPanning = ref(false)
const currentPage = ref(0)
const currentStroke = ref<StrokeData | null>(null)
const allStrokes = ref<CanvasStroke[]>([])
const localUndoStack = ref<CanvasStroke[]>([])
const lastSyncedId = ref(0)

const currentColor = ref('#202124')
const currentWidth = ref(3)
const currentTool = ref<'pen' | 'eraser' | 'drag'>('pen')
const spaceHeld = ref(false)
const saveError = ref('')
const wsState = ref<WsState>('offline')
const retryTimer = ref<number | null>(null)
const isFullscreen = ref(false)
const isWebFullscreen = ref(false)
const fullscreenPressTimer = ref<number | null>(null)
const fullscreenLongPressHandled = ref(false)
const touchPointers = new Map<number, Point>()
let ws: WebSocket | null = null
let reconnectTimer: number | null = null
let reconnectAttempts = 0
let frameRequest: number | null = null
let unmounted = false
let previousBodyOverflow = ''
let pinchDistance = 0
let pinchCenter: Point | null = null
let pinchActive = false
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]

const paletteColors = ['#202124', '#ea4335', '#4285f4', '#34a853']

const presets = ref([
  { color: '#202124', width: 3, opacity: 1, blend: 'normal' as const },
  { color: '#ea4335', width: 3, opacity: 1, blend: 'normal' as const },
  { color: '#4285f4', width: 6, opacity: 1, blend: 'normal' as const },
  { color: '#34a853', width: 18, opacity: 0.35, blend: 'multiply' as const },
])
const activePresetIndex = ref(0)
const eraserWidth = ref(20)

const failedCount = computed(() => allStrokes.value.filter(s => s.failed && !s.id).length)
const canUndo = computed(() => localUndoStack.value.length > 0)
const wsTitle = computed(() => {
  if (wsState.value === 'online') return '实时同步已连接'
  if (wsState.value === 'connecting') return '实时同步连接中'
  return '实时同步已断开'
})
const statusMessage = computed(() => {
  if (failedCount.value > 0) return `${failedCount.value} 笔未保存`
  if (saveError.value) return saveError.value
  if (wsState.value !== 'online') return '实时同步重连中'
  return ''
})
const fullscreenTitle = computed(() => {
  if (isFullscreen.value) return '退出屏幕全屏'
  if (isWebFullscreen.value) return '退出网页全屏'
  return '网页全屏；长按进入屏幕全屏'
})

function selectPreset(i: number) {
  activePresetIndex.value = i
  currentColor.value = presets.value[i].color
  currentWidth.value = presets.value[i].width
  currentTool.value = 'pen'
}

function updatePreset(key: 'color' | 'width', value: string | number) {
  const p = presets.value[activePresetIndex.value]
  if (key === 'color') p.color = value as string
  else p.width = value as number
  currentColor.value = p.color
  currentWidth.value = p.width
}

function onWidthInput(val: number) {
  if (currentTool.value === 'eraser') {
    eraserWidth.value = val
    currentWidth.value = val
  } else {
    updatePreset('width', val)
  }
}

function screenToWorld(sx: number, sy: number): Point {
  const rect = canvasRef.value!.getBoundingClientRect()
  const cx = sx - rect.left
  const cy = sy - rect.top
  return {
    x: (cx - offsetX.value) / scale.value,
    y: (cy - offsetY.value) / scale.value,
  }
}

function screenToCanvas(sx: number, sy: number): Point {
  const rect = canvasRef.value!.getBoundingClientRect()
  return {
    x: sx - rect.left,
    y: sy - rect.top,
  }
}

function getPinchPoints(): Point[] {
  return Array.from(touchPointers.values()).slice(0, 2)
}

function beginPinchGesture() {
  const points = getPinchPoints()
  if (points.length < 2) return

  isDrawing.value = false
  isPanning.value = false
  currentStroke.value = null
  pinchActive = true
  pinchDistance = Math.max(1, getDistance(points[0], points[1]))
  pinchCenter = getCenter(points[0], points[1])
}

function updatePinchGesture() {
  const points = getPinchPoints()
  if (!pinchActive || !pinchCenter || points.length < 2) return

  const nextDistance = Math.max(1, getDistance(points[0], points[1]))
  const nextCenter = getCenter(points[0], points[1])
  const nextScale = Math.max(0.1, Math.min(5, scale.value * (nextDistance / pinchDistance)))

  const worldX = (pinchCenter.x - offsetX.value) / scale.value
  const worldY = (pinchCenter.y - offsetY.value) / scale.value
  offsetX.value = nextCenter.x - worldX * nextScale
  offsetY.value = nextCenter.y - worldY * nextScale
  scale.value = nextScale

  pinchDistance = nextDistance
  pinchCenter = nextCenter
  renderFrame()
}

function endPinchGestureIfNeeded() {
  if (touchPointers.size < 2) {
    pinchActive = false
    pinchDistance = 0
    pinchCenter = null
  } else {
    beginPinchGesture()
  }
}

function renderFrame() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = rect.width
  const h = rect.height

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  const gridSize = 40
  const startX = Math.floor(-offsetX.value / scale.value / gridSize) * gridSize - gridSize
  const startY = Math.floor(-offsetY.value / scale.value / gridSize) * gridSize - gridSize
  const endX = startX + w / scale.value + gridSize * 2
  const endY = startY + h / scale.value + gridSize * 2
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  for (let x = startX; x < endX; x += gridSize) {
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath()
      ctx.arc(x, y, 1.2 / scale.value, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  const allToDraw = [...allStrokes.value]
  if (currentStroke.value) allToDraw.push(currentStroke.value)

  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)

  drawStrokes(ctx, allToDraw)
  ctx.restore()
  renderMiniMap()
}

function scheduleRender() {
  if (frameRequest !== null) return
  frameRequest = window.requestAnimationFrame(() => {
    frameRequest = null
    renderFrame()
  })
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: (StrokeData & { failed?: boolean })[]) {
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    ctx.beginPath()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = stroke.width
    ctx.globalAlpha = stroke.opacity ?? 1

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = stroke.blend === 'multiply' ? 'multiply' : 'source-over'
      ctx.strokeStyle = stroke.failed ? 'rgba(234,67,53,.45)' : stroke.color
    }

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    if (stroke.points.length === 2) {
      ctx.lineTo(stroke.points[1].x, stroke.points[1].y)
    } else {
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2
        const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY)
      }
      const last = stroke.points[stroke.points.length - 1]
      ctx.lineTo(last.x, last.y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function onPointerDown(e: PointerEvent) {
  const canvas = canvasRef.value!
  canvas.setPointerCapture(e.pointerId)

  if (e.pointerType === 'touch') {
    touchPointers.set(e.pointerId, screenToCanvas(e.clientX, e.clientY))
    if (touchPointers.size >= 2) {
      beginPinchGesture()
      return
    }
  }

  if (e.button === 1 || (e.button === 0 && (spaceHeld.value || currentTool.value === 'drag'))) {
    isPanning.value = true
    return
  }

  if (e.button !== 0) return

  isDrawing.value = true
  const pt = screenToWorld(e.clientX, e.clientY)
  const drawTool: StrokeData['tool'] = currentTool.value === 'eraser' ? 'eraser' : 'pen'
  currentStroke.value = {
    points: [pt],
    color: currentColor.value,
    width: currentWidth.value,
    tool: drawTool,
    opacity: drawTool === 'pen' ? presets.value[activePresetIndex.value].opacity : 1,
    blend: drawTool === 'pen' ? presets.value[activePresetIndex.value].blend : 'normal',
  }
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch' && touchPointers.has(e.pointerId)) {
    touchPointers.set(e.pointerId, screenToCanvas(e.clientX, e.clientY))
    if (touchPointers.size >= 2) {
      updatePinchGesture()
      return
    }
  }

  if (isPanning.value) {
    offsetX.value += e.movementX
    offsetY.value += e.movementY
    renderFrame()
    return
  }

  if (!isDrawing.value || !currentStroke.value) return
  const pt = screenToWorld(e.clientX, e.clientY)
	  currentStroke.value.points.push(pt)
	  scheduleRender()
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerType === 'touch' && touchPointers.has(e.pointerId)) {
    touchPointers.delete(e.pointerId)
    if (pinchActive) {
      endPinchGestureIfNeeded()
      return
    }
  }

  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (!isDrawing.value || !currentStroke.value) return
  isDrawing.value = false

  if (currentStroke.value.points.length >= 2) {
    const stroke = createLocalStroke(currentStroke.value, currentPage.value)
    allStrokes.value.push(stroke)
    localUndoStack.value.push(stroke)
    void saveStroke(stroke)
  }
  currentStroke.value = null
  renderFrame()
}

function onWheel(e: WheelEvent) {
  const rect = canvasRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(0.1, Math.min(5, scale.value * factor))

  offsetX.value = mx - (mx - offsetX.value) * (newScale / scale.value)
  offsetY.value = my - (my - offsetY.value) * (newScale / scale.value)
  scale.value = newScale
  renderFrame()
}

function resetView() {
  offsetX.value = 0
  offsetY.value = 0
  scale.value = 1
  renderFrame()
}

function getStrokeBounds(strokes: StrokeData[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -200
    minY = -120
    maxX = 200
    maxY = 120
  }

  const viewport = getViewportWorldBounds()
  minX = Math.min(minX, viewport.minX)
  minY = Math.min(minY, viewport.minY)
  maxX = Math.max(maxX, viewport.maxX)
  maxY = Math.max(maxY, viewport.maxY)

  const padding = 80
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding }
}

function getViewportWorldBounds() {
  const canvas = canvasRef.value
  const rect = canvas?.getBoundingClientRect()
  const width = rect?.width || 1
  const height = rect?.height || 1
  return {
    minX: -offsetX.value / scale.value,
    minY: -offsetY.value / scale.value,
    maxX: (width - offsetX.value) / scale.value,
    maxY: (height - offsetY.value) / scale.value,
  }
}

function renderMiniMap() {
  const mini = miniMapRef.value
  if (!mini) return
  const ctx = mini.getContext('2d')!
  const w = mini.width
  const h = mini.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(0, 0, w, h)

  const bounds = getStrokeBounds(allStrokes.value)
  const bw = Math.max(1, bounds.maxX - bounds.minX)
  const bh = Math.max(1, bounds.maxY - bounds.minY)
  const mapScale = Math.min((w - 16) / bw, (h - 16) / bh)
  const ox = (w - bw * mapScale) / 2
  const oy = (h - bh * mapScale) / 2

  ctx.save()
  ctx.translate(ox - bounds.minX * mapScale, oy - bounds.minY * mapScale)
  ctx.scale(mapScale, mapScale)
  drawStrokes(ctx, allStrokes.value)
  ctx.restore()

  const view = getViewportWorldBounds()
  ctx.strokeStyle = '#202124'
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    ox + (view.minX - bounds.minX) * mapScale,
    oy + (view.minY - bounds.minY) * mapScale,
    (view.maxX - view.minX) * mapScale,
    (view.maxY - view.minY) * mapScale,
  )
}

function onMiniMapPointer(e: PointerEvent) {
  const mini = miniMapRef.value
  const canvas = canvasRef.value
  if (!mini || !canvas) return
  const rect = mini.getBoundingClientRect()
  const bounds = getStrokeBounds(allStrokes.value)
  const bw = Math.max(1, bounds.maxX - bounds.minX)
  const bh = Math.max(1, bounds.maxY - bounds.minY)
  const mapScale = Math.min((mini.width - 16) / bw, (mini.height - 16) / bh)
  const ox = (mini.width - bw * mapScale) / 2
  const oy = (mini.height - bh * mapScale) / 2
  const worldX = bounds.minX + ((e.clientX - rect.left) / rect.width * mini.width - ox) / mapScale
  const worldY = bounds.minY + ((e.clientY - rect.top) / rect.height * mini.height - oy) / mapScale
  const canvasRect = canvas.getBoundingClientRect()
  offsetX.value = canvasRect.width / 2 - worldX * scale.value
  offsetY.value = canvasRect.height / 2 - worldY * scale.value
  renderFrame()
}

function scheduleResizeCanvas() {
  void nextTick(() => {
    window.requestAnimationFrame(() => {
      resizeCanvas()
      window.setTimeout(resizeCanvas, 80)
    })
  })
}

function setWebFullscreen(next: boolean) {
  if (isWebFullscreen.value === next) return

  isWebFullscreen.value = next
  if (next) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = previousBodyOverflow
  }
  scheduleResizeCanvas()
}

function toggleWebFullscreen() {
  setWebFullscreen(!isWebFullscreen.value)
}

async function toggleFullscreen() {
  const wrap = wrapRef.value
  if (!wrap) return

  try {
    if (document.fullscreenElement === wrap) {
      await document.exitFullscreen()
    } else {
      setWebFullscreen(false)
      await wrap.requestFullscreen()
    }
  } catch {
    saveError.value = '全屏切换失败'
  }
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === wrapRef.value
  scheduleResizeCanvas()
}

function startFullscreenPress() {
  fullscreenLongPressHandled.value = false
  fullscreenPressTimer.value = window.setTimeout(() => {
    fullscreenLongPressHandled.value = true
    fullscreenPressTimer.value = null
    void toggleFullscreen()
  }, 450)
}

function finishFullscreenPress() {
  if (fullscreenPressTimer.value) {
    window.clearTimeout(fullscreenPressTimer.value)
    fullscreenPressTimer.value = null
  }

  if (fullscreenLongPressHandled.value) {
    fullscreenLongPressHandled.value = false
    return
  }

  if (isFullscreen.value) {
    void toggleFullscreen()
    return
  }

  toggleWebFullscreen()
}

function cancelFullscreenPress() {
  if (fullscreenPressTimer.value) {
    window.clearTimeout(fullscreenPressTimer.value)
    fullscreenPressTimer.value = null
  }
}

function resizeCanvas() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(wrap.clientWidth * dpr))
  canvas.height = Math.max(1, Math.floor(wrap.clientHeight * dpr))
  canvas.style.width = wrap.clientWidth + 'px'
  canvas.style.height = wrap.clientHeight + 'px'
  renderFrame()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') {
    e.preventDefault()
    spaceHeld.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    spaceHeld.value = false
  }
}

async function saveStroke(stroke: CanvasStroke) {
  if (stroke.id || stroke.pending) return
  stroke.pending = true
  stroke.failed = false
  saveError.value = ''

  try {
    const row = await api<StrokeRow>(`/api/projects/${props.boardSlug}/strokes`, {
      method: 'POST',
      body: JSON.stringify({
        stroke_data: JSON.stringify(persistableStroke(stroke)),
        local_id: stroke.localId,
        page: stroke.page ?? currentPage.value,
      }),
    })
    applySavedRow(stroke, row)
    if (row.id > lastSyncedId.value) lastSyncedId.value = row.id
  } catch {
    stroke.failed = true
    stroke.retryCount = (stroke.retryCount || 0) + 1
    saveError.value = '保存失败'
    scheduleStrokeRetry(stroke)
  } finally {
    stroke.pending = false
    savePendingStrokes(props.boardSlug, allStrokes.value)
    renderFrame()
  }
}

function scheduleStrokeRetry(stroke: CanvasStroke) {
  if (stroke.id || stroke.retryTimer) return
  const retryCount = stroke.retryCount || 1
  const delay = Math.min(30000, 1200 * 2 ** Math.min(retryCount - 1, 5))
  stroke.retryTimer = window.setTimeout(() => {
    stroke.retryTimer = undefined
    void saveStroke(stroke)
  }, delay)
}

async function retryFailedSaves() {
  if (retryTimer.value) return
  const failed = allStrokes.value.filter(stroke => stroke.failed && !stroke.id)
  for (const stroke of failed) {
    if (stroke.retryTimer) {
      window.clearTimeout(stroke.retryTimer)
      stroke.retryTimer = undefined
    }
    await saveStroke(stroke)
  }
  retryTimer.value = window.setTimeout(() => {
    retryTimer.value = null
  }, 600)
}

async function undoLastStroke() {
  const target = localUndoStack.value.pop()
  if (!target) return
  if (!target.id) {
    allStrokes.value = allStrokes.value.filter(stroke => stroke !== target)
    if (target.retryTimer) window.clearTimeout(target.retryTimer)
    renderFrame()
    return
  }

  try {
    await api(`/api/projects/${props.boardSlug}/strokes/${target.id}?page=${target.page ?? currentPage.value}`, {
      method: 'DELETE',
    })
    allStrokes.value = allStrokes.value.filter(stroke => stroke.id !== target.id)
    renderFrame()
  } catch {
    saveError.value = '撤销失败'
  }
}

async function clearBoard() {
  if (!authStore.authed) return
  if (!window.confirm(`确定清空第 ${currentPage.value} 页？`)) return
  try {
    await api(`/api/projects/${props.boardSlug}/strokes?page=${currentPage.value}`, { method: 'DELETE' })
    allStrokes.value = allStrokes.value.filter(stroke => (stroke.pending || stroke.failed) && (stroke.page ?? currentPage.value) === currentPage.value)
    localUndoStack.value = []
    saveError.value = ''
    renderFrame()
  } catch {
    saveError.value = '清空失败'
  }
}

async function loadExistingStrokes(incremental = false) {
  const page = currentPage.value
  const since = incremental ? lastSyncedId.value : 0
  try {
    const url = `/api/projects/${props.boardSlug}/strokes?page=${page}${since > 0 ? `&since=${since}` : ''}`
    const rows = await api<StrokeRow[]>(url)
    if (page !== currentPage.value) return
    const parsed = rows.map(parseStrokeRow).filter((stroke): stroke is CanvasStroke => !!stroke)

    if (incremental) {
      const knownIds = new Set(allStrokes.value.map(stroke => stroke.id).filter((v): v is number => !!v))
      for (const stroke of parsed) {
        if (stroke.id && !knownIds.has(stroke.id)) allStrokes.value.push(stroke)
      }
    } else {
      const unsaved = allStrokes.value.filter(stroke => !stroke.id && (stroke.pending || stroke.failed) && (stroke.page ?? page) === page)
      allStrokes.value = [...parsed, ...unsaved]
    }

    const maxId = parsed.reduce((m, s) => (s.id && s.id > m ? s.id : m), lastSyncedId.value)
    lastSyncedId.value = maxId
    renderFrame()
  } catch {
    saveError.value = '加载失败'
  }
}

async function goToPage(page: number) {
  const nextPage = Math.max(0, Math.min(9999, page))
  if (nextPage === currentPage.value) return
  currentPage.value = nextPage
  updatePageUrl()
  currentStroke.value = null
  isDrawing.value = false
  isPanning.value = false
  localUndoStack.value = []
  lastSyncedId.value = 0
  resetView()
  await loadExistingStrokes()
}

function updatePageUrl() {
  const url = new URL(window.location.href)
  if (currentPage.value === 0) url.searchParams.delete('page')
  else url.searchParams.set('page', String(currentPage.value))
  window.history.replaceState({}, '', url)
}

function readInitialPage() {
  const page = Number(new URLSearchParams(window.location.search).get('page') || 0)
  currentPage.value = Number.isInteger(page) && page >= 0 ? Math.min(page, 9999) : 0
}

async function copyShareLink() {
  const url = new URL(window.location.href)
  if (currentPage.value === 0) url.searchParams.delete('page')
  else url.searchParams.set('page', String(currentPage.value))
  try {
    await navigator.clipboard.writeText(url.toString())
    saveError.value = '链接已复制'
    window.setTimeout(() => {
      if (saveError.value === '链接已复制') saveError.value = ''
    }, 1600)
  } catch {
    saveError.value = '复制失败'
  }
}

function exportPng() {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.toBlob((blob) => {
    if (!blob) {
      saveError.value = '导出失败'
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `graffiti-page-${currentPage.value}.png`
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function handleSocketMessage(event: MessageEvent) {
  let message: WhiteboardWsMessage
  try {
    message = JSON.parse(String(event.data))
  } catch {
    return
  }

  if (message.type === 'stroke-created') {
    if ((message.page ?? message.stroke.page ?? 0) !== currentPage.value) return
    const parsed = parseStrokeRow(message.stroke)
    if (!parsed) return

    if (parsed.id && parsed.id > lastSyncedId.value) lastSyncedId.value = parsed.id

    if (message.local_id) {
      const local = allStrokes.value.find(stroke => stroke.localId === message.local_id)
      if (local) {
        applySavedRow(local, message.stroke)
        savePendingStrokes(props.boardSlug, allStrokes.value)
        renderFrame()
        return
      }
    }

    if (allStrokes.value.some(stroke => stroke.id === parsed.id)) return
    allStrokes.value.push(parsed)
    renderFrame()
    return
  }

  if (message.type === 'strokes-cleared') {
    if ((message.page ?? 0) !== currentPage.value) return
    allStrokes.value = allStrokes.value.filter(stroke => stroke.pending || stroke.failed)
    localUndoStack.value = []
    renderFrame()
    return
  }

  if (message.type === 'stroke-deleted') {
    if ((message.page ?? 0) !== currentPage.value) return
    allStrokes.value = allStrokes.value.filter(stroke => stroke.id !== message.id)
    localUndoStack.value = localUndoStack.value.filter(stroke => stroke.id !== message.id)
    renderFrame()
  }
}

function connectSocket() {
  if (ws) {
    ws.close()
    ws = null
  }
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  wsState.value = 'connecting'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${window.location.host}/api/projects/${props.boardSlug}/ws`)

  ws.onopen = () => {
    wsState.value = 'online'
    reconnectAttempts = 0
    void loadExistingStrokes(lastSyncedId.value > 0)
    void flushPendingStrokes()
  }
  ws.onmessage = handleSocketMessage
  ws.onerror = () => {
    wsState.value = 'offline'
  }
  ws.onclose = () => {
    if (unmounted) return
    wsState.value = 'offline'
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)]
    reconnectAttempts += 1
    reconnectTimer = window.setTimeout(connectSocket, delay)
  }
}

async function flushPendingStrokes() {
  const pending = allStrokes.value.filter(stroke => !stroke.id && stroke.failed)
  for (const stroke of pending) {
    if (stroke.retryTimer) {
      window.clearTimeout(stroke.retryTimer)
      stroke.retryTimer = undefined
    }
    await saveStroke(stroke)
  }
}

onMounted(async () => {
  await nextTick()
  ensureLegacyClientId()
  readInitialPage()
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  await authStore.check()

  const restored = loadPendingStrokes(props.boardSlug).filter(stroke => (stroke.page ?? 0) === currentPage.value)
  if (restored.length) allStrokes.value.push(...restored)

  await loadExistingStrokes()
  connectSocket()
})

onBeforeUnmount(() => {
  unmounted = true
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  if (retryTimer.value) window.clearTimeout(retryTimer.value)
  if (fullscreenPressTimer.value) window.clearTimeout(fullscreenPressTimer.value)
  if (frameRequest !== null) window.cancelAnimationFrame(frameRequest)
  for (const stroke of allStrokes.value) {
    if (stroke.retryTimer) {
      window.clearTimeout(stroke.retryTimer)
    }
  }
  if (isWebFullscreen.value) {
    document.body.style.overflow = previousBodyOverflow
  }
  if (ws) ws.close()
})
</script>
