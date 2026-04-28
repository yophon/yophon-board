<template>
  <div class="whiteboard-wrap" :class="{ 'web-fullscreen': isWebFullscreen }" ref="wrapRef">
    <input ref="fileInputRef" class="wb-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="onImageFileChange" />
    <canvas
      ref="canvasRef"
      :style="{ cursor: canvasCursor }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @dragover.prevent
      @drop.prevent="onImageDrop"
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
      <div class="wb-tool-popover">
        <button class="wb-tool-btn" :class="{ active: currentTool === 'eraser' }" @click.stop="toggleEraserMenu" title="橡皮擦">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 20H7L3 16l9-9 8 8-4 4z"/><path d="M6.5 13.5L15 5"/></svg>
        </button>
      </div>
      <button class="wb-tool-btn" :class="{ active: currentTool === 'drag' }" @click="setTool('drag')" title="拖拽画布">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
      </button>
      <button class="wb-tool-btn" :class="{ active: currentTool === 'select' }" @click="setTool('select')" title="手指模式">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 12V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V7.5a1.5 1.5 0 0 1 3 0V14"/><path d="M17 14v-2.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2.6a5 5 0 0 1-3.8-1.8L4 15.2a1.7 1.7 0 0 1 2.4-2.4L8 14"/></svg>
      </button>
      <button class="wb-tool-btn" @click="resetView" title="重置视图">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
      <button class="wb-tool-btn" @click="chooseImage" title="添加图片">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg>
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

    <div v-if="eraserMenuOpen" class="wb-tool-menu wb-eraser-menu">
      <button class="wb-tool-menu-item" :class="{ active: eraserMode === 'mask' }" @click="selectEraserMode('mask')">覆盖擦除</button>
      <button class="wb-tool-menu-item" :class="{ active: eraserMode === 'delete' }" @click="selectEraserMode('delete')">整笔删除</button>
      <button class="wb-tool-menu-item" :class="{ active: eraserMode === 'cut' }" @click="selectEraserMode('cut')">切段擦除</button>
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
  DrawingStrokeData,
  Point,
  StrokeData,
  StrokeRow,
  UploadedImageAsset,
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
const fileInputRef = ref<HTMLInputElement>()
const wrapRef = ref<HTMLDivElement>()
const authStore = useAuthStore()

const offsetX = ref(0)
const offsetY = ref(0)
const scale = ref(1)

const isDrawing = ref(false)
const isPanning = ref(false)
const isErasing = ref(false)
const currentPage = ref(0)
const currentStroke = ref<DrawingStrokeData | null>(null)
const allStrokes = ref<CanvasStroke[]>([])
const localUndoStack = ref<CanvasStroke[]>([])
const lastSyncedId = ref(0)

const currentColor = ref('#202124')
const currentWidth = ref(3)
const currentTool = ref<WhiteboardTool>('pen')
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
let lastErasePoint: Point | null = null
const pendingEraseIds = new Set<number>()
const pendingEraseUpdateKeys = new Set<string>()
const erasedPendingKeys = new Set<string>()
const imageCache = new Map<string, HTMLImageElement | 'loading' | 'error'>()
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
const eraserMode = ref<EraserMode>('mask')
const eraserMenuOpen = ref(false)

type ImageStroke = Extract<CanvasStroke, { type: 'image' }>
type DrawingStroke = Extract<CanvasStroke, { points: Point[] }>
type WhiteboardTool = 'pen' | 'eraser' | 'drag' | 'select'
type EraserMode = 'mask' | 'delete' | 'cut'
type TransformMode = 'move' | 'resize-n' | 'resize-ne' | 'resize-e' | 'resize-se' | 'resize-s' | 'resize-sw' | 'resize-w' | 'resize-nw' | 'rotate'

interface ElementGeometry {
  center: Point
  width: number
  height: number
  rotation: number
}

interface ElementTransformState {
  mode: TransformMode
  startPointer: Point
  startElements: CanvasStroke[]
  startGeometry: ElementGeometry
  startAngle: number
}

const selectedElementKeys = ref<string[]>([])
const isElementTransforming = ref(false)
const isBoxSelecting = ref(false)
const selectionBoxStart = ref<Point | null>(null)
const selectionBoxEnd = ref<Point | null>(null)
let elementTransform: ElementTransformState | null = null

const failedCount = computed(() => allStrokes.value.filter(s => s.failed && !s.id).length)
const canUndo = computed(() => localUndoStack.value.length > 0)
const canvasCursor = computed(() => {
  if (isElementTransforming.value) return 'grabbing'
  if (isPanning.value) return 'grabbing'
  if (currentTool.value === 'drag' || spaceHeld.value) return 'grab'
  if (currentTool.value === 'select') return 'default'
  return 'crosshair'
})
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
  setTool('pen')
}

function setTool(tool: WhiteboardTool) {
  currentTool.value = tool
  isDrawing.value = false
  isErasing.value = false
  lastErasePoint = null
  currentStroke.value = null
  if (tool === 'eraser') currentWidth.value = eraserWidth.value
  if (tool !== 'eraser') eraserMenuOpen.value = false
  if (tool !== 'select') clearSelection()
  renderFrame()
}

function toggleEraserMenu() {
  setTool('eraser')
  eraserMenuOpen.value = !eraserMenuOpen.value
}

function selectEraserMode(mode: EraserMode) {
  eraserMode.value = mode
  eraserMenuOpen.value = false
  setTool('eraser')
}

function clearSelection() {
  selectedElementKeys.value = []
  isElementTransforming.value = false
  isBoxSelecting.value = false
  selectionBoxStart.value = null
  selectionBoxEnd.value = null
  elementTransform = null
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
  isErasing.value = false
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
  drawSelectedElementOverlay(ctx)
  drawSelectionBox(ctx)
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
    if (stroke.type === 'image') {
      drawImageElement(ctx, stroke)
      continue
    }

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

function drawImageElement(ctx: CanvasRenderingContext2D, image: Extract<StrokeData, { type: 'image' }> & { failed?: boolean }) {
  const cached = imageCache.get(image.src)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const rotation = degreesToRadians(image.rotation ?? 0)
  ctx.translate(image.x + image.width / 2, image.y + image.height / 2)
  ctx.rotate(rotation)

  if (cached instanceof HTMLImageElement && cached.complete && cached.naturalWidth > 0) {
    ctx.drawImage(cached, -image.width / 2, -image.height / 2, image.width, image.height)
  } else {
    if (!cached) {
      imageCache.set(image.src, 'loading')
      const img = new Image()
      img.onload = () => {
        imageCache.set(image.src, img)
        scheduleRender()
      }
      img.onerror = () => {
        imageCache.set(image.src, 'error')
        scheduleRender()
      }
      img.src = image.src
    }

    ctx.fillStyle = '#f7f8f5'
    ctx.fillRect(-image.width / 2, -image.height / 2, image.width, image.height)
    ctx.strokeStyle = cached === 'error' ? '#c0392b' : 'rgba(32,33,36,.24)'
    ctx.lineWidth = 1
    ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height)
  }

  if (image.failed) {
    ctx.strokeStyle = 'rgba(234,67,53,.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height)
  }

  ctx.restore()
}

function drawSelectedElementOverlay(ctx: CanvasRenderingContext2D) {
  const elements = getSelectedElements()
  if (elements.length === 0) return

  const handle = getHandleSize()
  const geometry = getInteractiveGeometry(getSelectionGeometry(elements))
  const rotateOffset = 34 / scale.value
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.translate(geometry.center.x, geometry.center.y)
  ctx.rotate(degreesToRadians(geometry.rotation))
  ctx.strokeStyle = '#202124'
  ctx.lineWidth = 1.5 / scale.value
  ctx.setLineDash([6 / scale.value, 4 / scale.value])
  ctx.strokeRect(-geometry.width / 2, -geometry.height / 2, geometry.width, geometry.height)
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.moveTo(0, -geometry.height / 2)
  ctx.lineTo(0, -geometry.height / 2 - rotateOffset)
  ctx.stroke()

  for (const point of getElementHandlePoints(geometry)) {
    const radius = point.mode === 'rotate' ? handle * 0.58 : handle / 2
    ctx.beginPath()
    if (point.mode === 'rotate') {
      ctx.arc(point.local.x, point.local.y, radius, 0, Math.PI * 2)
    } else {
      ctx.rect(point.local.x - handle / 2, point.local.y - handle / 2, handle, handle)
    }
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#202124'
    ctx.lineWidth = 1.3 / scale.value
    ctx.stroke()
  }
  ctx.restore()
}

function drawSelectionBox(ctx: CanvasRenderingContext2D) {
  const start = selectionBoxStart.value
  const end = selectionBoxEnd.value
  if (!isBoxSelecting.value || !start || !end) return
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(66,133,244,.10)'
  ctx.strokeStyle = '#4285f4'
  ctx.lineWidth = 1.2 / scale.value
  ctx.setLineDash([5 / scale.value, 4 / scale.value])
  ctx.fillRect(left, top, width, height)
  ctx.strokeRect(left, top, width, height)
  ctx.restore()
}

function elementKey(element: CanvasStroke): string {
  return element.id ? `id:${element.id}` : `local:${element.localId || ''}`
}

function getSelectedElements(): CanvasStroke[] {
  const keys = new Set(selectedElementKeys.value)
  if (keys.size === 0) return []
  return allStrokes.value.filter(stroke => keys.has(elementKey(stroke)))
}

function setSelectedElements(elements: CanvasStroke[]) {
  selectedElementKeys.value = elements.map(elementKey)
}

function isElementSelected(element: CanvasStroke) {
  return selectedElementKeys.value.includes(elementKey(element))
}

function cloneElement(element: CanvasStroke): CanvasStroke {
  if (element.type === 'image') return { ...element }
  return {
    ...element,
    points: element.points.map(point => ({ ...point })),
  }
}

function getHandleSize() {
  return Math.max(10 / scale.value, 8)
}

function getMinSelectionSize() {
  return Math.max(56 / scale.value, 28)
}

function getInteractiveGeometry(geometry: ElementGeometry): ElementGeometry {
  const minSize = getMinSelectionSize()
  return {
    ...geometry,
    width: Math.max(geometry.width, minSize),
    height: Math.max(geometry.height, minSize),
  }
}

function getElementHandlePoints(geometry: ElementGeometry) {
  const w = geometry.width
  const h = geometry.height
  const rotateOffset = 34 / scale.value
  return [
    { mode: 'resize-nw' as const, local: { x: -w / 2, y: -h / 2 } },
    { mode: 'resize-n' as const, local: { x: 0, y: -h / 2 } },
    { mode: 'resize-ne' as const, local: { x: w / 2, y: -h / 2 } },
    { mode: 'resize-e' as const, local: { x: w / 2, y: 0 } },
    { mode: 'resize-se' as const, local: { x: w / 2, y: h / 2 } },
    { mode: 'resize-s' as const, local: { x: 0, y: h / 2 } },
    { mode: 'resize-sw' as const, local: { x: -w / 2, y: h / 2 } },
    { mode: 'resize-w' as const, local: { x: -w / 2, y: 0 } },
    { mode: 'rotate' as const, local: { x: 0, y: -h / 2 - rotateOffset } },
  ]
}

function hitTestElements(point: Point): { element: CanvasStroke; mode: TransformMode } | null {
  const selected = getSelectedElements()
  if (selected.length > 0) {
    const geometry = getInteractiveGeometry(getSelectionGeometry(selected))
    const handleMode = hitTestGeometryHandle(point, geometry)
    if (handleMode) return { element: selected[0], mode: handleMode }
    if (isPointInsideGeometry(point, geometry)) return { element: selected[0], mode: 'move' }
  }

  for (let i = allStrokes.value.length - 1; i >= 0; i--) {
    const stroke = allStrokes.value[i]
    if (stroke.type !== 'image' && stroke.tool === 'eraser') continue
    if (isPointInsideElement(point, stroke)) return { element: stroke, mode: 'move' }
  }

  return null
}

function hitTestElementHandle(point: Point, element: CanvasStroke): TransformMode | null {
  return hitTestGeometryHandle(point, getElementGeometry(element))
}

function hitTestGeometryHandle(point: Point, geometry: ElementGeometry): TransformMode | null {
  const local = worldToElementCenteredLocal(point, geometry)
  const hitSize = getHandleSize() * 1.5
  for (const handle of getElementHandlePoints(geometry)) {
    if (Math.abs(local.x - handle.local.x) <= hitSize / 2 && Math.abs(local.y - handle.local.y) <= hitSize / 2) {
      return handle.mode
    }
  }
  return null
}

function isPointInsideGeometry(point: Point, geometry: ElementGeometry) {
  const local = worldToElementCenteredLocal(point, geometry)
  return Math.abs(local.x) <= geometry.width / 2 && Math.abs(local.y) <= geometry.height / 2
}

function isPointInsideElement(point: Point, element: CanvasStroke) {
  if (element.type === 'image') {
    const geometry = getElementGeometry(element)
    const local = worldToElementCenteredLocal(point, geometry)
    return Math.abs(local.x) <= geometry.width / 2 && Math.abs(local.y) <= geometry.height / 2
  }

  return isPointNearDrawingStroke(point, element)
}

function isPointNearDrawingStroke(point: Point, stroke: DrawingStroke) {
  const tolerance = Math.max(8 / scale.value, stroke.width / 2 + 4 / scale.value)
  const thresholdSq = tolerance * tolerance
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (distanceToSegmentSq(point, stroke.points[i], stroke.points[i + 1]) <= thresholdSq) return true
  }
  return false
}

function distanceToSegmentSq(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return distanceSq(point, a)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
  const projected = { x: a.x + t * dx, y: a.y + t * dy }
  return distanceSq(point, projected)
}

function distanceSq(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function worldToElementCenteredLocal(point: Point, geometry: ElementGeometry): Point {
  return rotatePoint({
    x: point.x - geometry.center.x,
    y: point.y - geometry.center.y,
  }, -degreesToRadians(geometry.rotation))
}

function elementLocalToWorld(local: Point, geometry: ElementGeometry): Point {
  const rotated = rotatePoint({
    x: local.x - geometry.width / 2,
    y: local.y - geometry.height / 2,
  }, degreesToRadians(geometry.rotation))
  return { x: geometry.center.x + rotated.x, y: geometry.center.y + rotated.y }
}

function getElementGeometry(element: CanvasStroke): ElementGeometry {
  if (element.type === 'image') {
    return {
      center: { x: element.x + element.width / 2, y: element.y + element.height / 2 },
      width: element.width,
      height: element.height,
      rotation: element.rotation ?? 0,
    }
  }

  const bounds = getDrawingStrokeBounds(element)
  return {
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
    rotation: 0,
  }
}

function getSelectionGeometry(elements: CanvasStroke[]): ElementGeometry {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    for (const corner of getElementWorldCorners(element)) {
      minX = Math.min(minX, corner.x)
      minY = Math.min(minY, corner.y)
      maxX = Math.max(maxX, corner.x)
      maxY = Math.max(maxY, corner.y)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 1
    maxY = 1
  }
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    rotation: 0,
  }
}

function getDrawingStrokeBounds(stroke: DrawingStroke) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

function getElementWorldCorners(element: CanvasStroke): Point[] {
  const geometry = getElementGeometry(element)
  return [
    elementLocalToWorld({ x: 0, y: 0 }, geometry),
    elementLocalToWorld({ x: geometry.width, y: 0 }, geometry),
    elementLocalToWorld({ x: geometry.width, y: geometry.height }, geometry),
    elementLocalToWorld({ x: 0, y: geometry.height }, geometry),
  ]
}

function rotatePoint(point: Point, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

function degreesToRadians(degrees: number) {
  return degrees * Math.PI / 180
}

function radiansToDegrees(radians: number) {
  return radians * 180 / Math.PI
}

function onPointerDown(e: PointerEvent) {
  const canvas = canvasRef.value!
  canvas.setPointerCapture(e.pointerId)
  eraserMenuOpen.value = false

  if (e.pointerType === 'touch') {
    touchPointers.set(e.pointerId, screenToCanvas(e.clientX, e.clientY))
    if (touchPointers.size >= 2) {
      beginPinchGesture()
      return
    }
  }

  if (e.button === 2 || e.button === 1 || (e.button === 0 && (spaceHeld.value || currentTool.value === 'drag'))) {
    e.preventDefault()
    isPanning.value = true
    return
  }

  if (e.button !== 0) return

  const worldPoint = screenToWorld(e.clientX, e.clientY)
  const hit = currentTool.value === 'select' ? hitTestElements(worldPoint) : null
  if (hit) {
    e.preventDefault()
    if (!isElementSelected(hit.element)) setSelectedElements([hit.element])
    const selected = getSelectedElements()
    const geometry = getInteractiveGeometry(getSelectionGeometry(selected))
    isElementTransforming.value = true
    elementTransform = {
      mode: hit.mode,
      startPointer: worldPoint,
      startElements: selected.map(cloneElement),
      startGeometry: geometry,
      startAngle: Math.atan2(worldPoint.y - geometry.center.y, worldPoint.x - geometry.center.x),
    }
    renderFrame()
    return
  }

  if (currentTool.value === 'select') {
    selectedElementKeys.value = []
    isBoxSelecting.value = true
    selectionBoxStart.value = worldPoint
    selectionBoxEnd.value = worldPoint
    renderFrame()
    return
  }

  if (currentTool.value === 'eraser') {
    if (eraserMode.value === 'mask') {
      isDrawing.value = true
      currentStroke.value = {
        points: [worldPoint],
        color: currentColor.value,
        width: currentWidth.value,
        tool: 'eraser',
        opacity: 1,
        blend: 'normal',
      }
    } else {
      isErasing.value = true
      lastErasePoint = worldPoint
      eraseBetween(worldPoint, worldPoint)
      renderFrame()
    }
    return
  }

  isDrawing.value = true
  currentStroke.value = {
    points: [worldPoint],
    color: currentColor.value,
    width: currentWidth.value,
    tool: 'pen',
    opacity: presets.value[activePresetIndex.value].opacity,
    blend: presets.value[activePresetIndex.value].blend,
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

  if (isElementTransforming.value && elementTransform) {
    updateElementTransform(screenToWorld(e.clientX, e.clientY))
    renderFrame()
    return
  }

  if (isBoxSelecting.value) {
    selectionBoxEnd.value = screenToWorld(e.clientX, e.clientY)
    renderFrame()
    return
  }

  if (isPanning.value) {
    offsetX.value += e.movementX
    offsetY.value += e.movementY
    renderFrame()
    return
  }

  if (isErasing.value) {
    const pt = screenToWorld(e.clientX, e.clientY)
    eraseBetween(lastErasePoint || pt, pt)
    lastErasePoint = pt
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

  if (isElementTransforming.value) {
    isElementTransforming.value = false
    const elements = getSelectedElements()
    elementTransform = null
    for (const element of elements) void saveElementTransform(element)
    return
  }

  if (isBoxSelecting.value) {
    isBoxSelecting.value = false
    selectElementsInBox()
    selectionBoxStart.value = null
    selectionBoxEnd.value = null
    renderFrame()
    return
  }

  if (isErasing.value) {
    isErasing.value = false
    lastErasePoint = null
    void flushPendingEraseChanges()
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

function selectElementsInBox() {
  const start = selectionBoxStart.value
  const end = selectionBoxEnd.value
  if (!start || !end) return
  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)
  const minSize = 4 / scale.value

  if (right - left < minSize && bottom - top < minSize) {
    selectedElementKeys.value = []
    return
  }

  const selected = allStrokes.value.filter(stroke => {
    if (stroke.type !== 'image' && stroke.tool === 'eraser') return false
    return elementIntersectsBox(stroke, { left, right, top, bottom })
  })
  setSelectedElements(selected)
}

function elementIntersectsBox(element: CanvasStroke, box: { left: number; right: number; top: number; bottom: number }) {
  if (element.type === 'image') {
    const corners = getElementWorldCorners(element)
    if (corners.some(point => pointInBox(point, box))) return true
    const boxCorners = [
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.right, y: box.bottom },
      { x: box.left, y: box.bottom },
    ]
    return boxCorners.some(point => isPointInsideElement(point, element))
  }

  if (element.points.some(point => pointInBox(point, box))) return true
  const edges: Array<[Point, Point]> = [
    [{ x: box.left, y: box.top }, { x: box.right, y: box.top }],
    [{ x: box.right, y: box.top }, { x: box.right, y: box.bottom }],
    [{ x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }],
    [{ x: box.left, y: box.bottom }, { x: box.left, y: box.top }],
  ]
  for (let i = 0; i < element.points.length - 1; i++) {
    if (edges.some(([a, b]) => segmentsIntersect(element.points[i], element.points[i + 1], a, b))) return true
  }
  return false
}

function pointInBox(point: Point, box: { left: number; right: number; top: number; bottom: number }) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
}

function eraseBetween(from: Point, to: Point) {
  if (eraserMode.value === 'delete') {
    eraseWholeStrokesBetween(from, to)
    return
  }
  eraseCutSegmentsBetween(from, to)
}

function eraseWholeStrokesBetween(from: Point, to: Point) {
  const radius = Math.max(1, currentWidth.value / 2)
  const removedKeys = new Set<string>()
  const removedIds: number[] = []
  const nextStrokes: CanvasStroke[] = []

  for (const stroke of allStrokes.value) {
    if (stroke.type === 'image' || stroke.tool === 'eraser' || !strokeIntersectsEraser(stroke, from, to, radius)) {
      nextStrokes.push(stroke)
      continue
    }

    const key = elementKey(stroke)
    removedKeys.add(key)
    if (stroke.retryTimer) window.clearTimeout(stroke.retryTimer)
    if (stroke.id) removedIds.push(stroke.id)
    else erasedPendingKeys.add(key)
  }

  if (removedKeys.size === 0) return
  allStrokes.value = nextStrokes
  localUndoStack.value = localUndoStack.value.filter(stroke => !removedKeys.has(elementKey(stroke)))
  if (selectedElementKeys.value.some(key => removedKeys.has(key))) clearSelection()
  for (const id of removedIds) pendingEraseIds.add(id)
}

function strokeIntersectsEraser(stroke: DrawingStroke, from: Point, to: Point, radius: number) {
  const threshold = radius + stroke.width / 2
  const thresholdSq = threshold * threshold
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (segmentDistanceSq(from, to, stroke.points[i], stroke.points[i + 1]) <= thresholdSq) return true
  }
  return false
}

function segmentDistanceSq(a: Point, b: Point, c: Point, d: Point) {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(
    distanceToSegmentSq(a, c, d),
    distanceToSegmentSq(b, c, d),
    distanceToSegmentSq(c, a, b),
    distanceToSegmentSq(d, a, b),
  )
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
}

function eraseCutSegmentsBetween(from: Point, to: Point) {
  const radius = Math.max(1, currentWidth.value / 2)
  const removedKeys = new Set<string>()
  const removedIds: number[] = []
  const nextStrokes: CanvasStroke[] = []

  for (const stroke of allStrokes.value) {
    if (stroke.type === 'image' || stroke.tool === 'eraser') {
      nextStrokes.push(stroke)
      continue
    }

    const segments = cutStrokeByEraser(stroke, from, to, radius)
    if (segments === null) {
      nextStrokes.push(stroke)
      continue
    }

    const key = elementKey(stroke)
    if (segments.length === 0) {
      removedKeys.add(key)
      if (stroke.retryTimer) window.clearTimeout(stroke.retryTimer)
      if (stroke.id) removedIds.push(stroke.id)
      else erasedPendingKeys.add(key)
      continue
    }

    applyStrokeSegment(stroke, segments[0])
    nextStrokes.push(stroke)
    if (stroke.id) pendingEraseUpdateKeys.add(key)

    for (let i = 1; i < segments.length; i++) {
      const splitStroke = createSplitStroke(stroke, segments[i])
      nextStrokes.push(splitStroke)
      localUndoStack.value.push(splitStroke)
      void saveStroke(splitStroke)
    }
  }

  if (removedKeys.size === 0 && removedIds.length === 0 && pendingEraseUpdateKeys.size === 0) {
    allStrokes.value = nextStrokes
    return
  }
  allStrokes.value = nextStrokes
  localUndoStack.value = localUndoStack.value.filter(stroke => !removedKeys.has(elementKey(stroke)))
  if (selectedElementKeys.value.some(key => removedKeys.has(key))) clearSelection()
  for (const id of removedIds) pendingEraseIds.add(id)
}

function cutStrokeByEraser(stroke: DrawingStroke, from: Point, to: Point, radius: number): Point[][] | null {
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

function applyStrokeSegment(stroke: DrawingStroke, points: Point[]) {
  stroke.points = points
}

function createSplitStroke(source: DrawingStroke, points: Point[]): CanvasStroke {
  return {
    points,
    color: source.color,
    width: source.width,
    tool: source.tool,
    opacity: source.opacity ?? 1,
    blend: source.blend ?? 'normal',
    page: source.page ?? currentPage.value,
    localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  }
}

async function flushPendingEraseChanges() {
  const updateKeys = Array.from(pendingEraseUpdateKeys)
  pendingEraseUpdateKeys.clear()
  const ids = Array.from(pendingEraseIds)
  pendingEraseIds.clear()
  if (updateKeys.length === 0 && ids.length === 0) return

  try {
    for (const key of updateKeys) {
      const element = allStrokes.value.find(stroke => elementKey(stroke) === key)
      if (element?.id) await saveElementTransform(element)
    }

    if (ids.length > 0) {
      await api(`/api/projects/${props.boardSlug}/strokes/erase`, {
        method: 'POST',
        body: JSON.stringify({
          ids,
          page: currentPage.value,
        }),
      })
    }
  } catch {
    saveError.value = '擦除失败'
    void loadExistingStrokes()
  }
}

function updateElementTransform(pointer: Point) {
  if (!elementTransform) return
  const startGeometry = elementTransform.startGeometry

  if (elementTransform.mode === 'move') {
    const delta = {
      x: pointer.x - elementTransform.startPointer.x,
      y: pointer.y - elementTransform.startPointer.y,
    }
    for (const start of elementTransform.startElements) {
      const element = allStrokes.value.find(stroke => elementKey(stroke) === elementKey(start))
      if (element) moveElement(element, start, delta)
    }
    return
  }

  if (elementTransform.mode === 'rotate') {
    const center = startGeometry.center
    const nextAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x)
    const degrees = radiansToDegrees(nextAngle - elementTransform.startAngle)
    for (const start of elementTransform.startElements) {
      const element = allStrokes.value.find(stroke => elementKey(stroke) === elementKey(start))
      if (element) rotateElement(element, start, startGeometry, degrees)
    }
    return
  }

  resizeElementGroupFromHandle(elementTransform.startElements, startGeometry, pointer, elementTransform.mode)
}

function moveElement(element: CanvasStroke, start: CanvasStroke, delta: Point) {
  if (element.type === 'image' && start.type === 'image') {
    element.x = start.x + delta.x
    element.y = start.y + delta.y
    return
  }

  if (element.type !== 'image' && start.type !== 'image') {
    element.points = start.points.map(point => ({ x: point.x + delta.x, y: point.y + delta.y }))
  }
}

function rotateElement(element: CanvasStroke, start: CanvasStroke, startGeometry: ElementGeometry, degrees: number) {
  if (element.type === 'image' && start.type === 'image') {
    const center = getElementGeometry(start).center
    const rotatedCenter = rotatePoint({ x: center.x - startGeometry.center.x, y: center.y - startGeometry.center.y }, degreesToRadians(degrees))
    element.rotation = normalizeDegrees((start.rotation ?? 0) + degrees)
    element.x = startGeometry.center.x + rotatedCenter.x - start.width / 2
    element.y = startGeometry.center.y + rotatedCenter.y - start.height / 2
    return
  }

  if (element.type !== 'image' && start.type !== 'image') {
    const radians = degreesToRadians(degrees)
    element.points = start.points.map(point => {
      const rotated = rotatePoint({ x: point.x - startGeometry.center.x, y: point.y - startGeometry.center.y }, radians)
      return { x: startGeometry.center.x + rotated.x, y: startGeometry.center.y + rotated.y }
    })
  }
}

function resizeElementGroupFromHandle(startElements: CanvasStroke[], startGeometry: ElementGeometry, pointer: Point, mode: TransformMode) {
  const rect = getResizedSelectionRect(startGeometry, pointer, mode)
  for (const start of startElements) {
    const element = allStrokes.value.find(stroke => elementKey(stroke) === elementKey(start))
    if (element) applyElementResize(element, start, startGeometry, rect)
  }
}

function getResizedSelectionRect(startGeometry: ElementGeometry, pointer: Point, mode: TransformMode) {
  const localCentered = worldToElementCenteredLocal(pointer, startGeometry)
  const p = { x: localCentered.x + startGeometry.width / 2, y: localCentered.y + startGeometry.height / 2 }
  const minSize = 24
  let left = 0
  let right = startGeometry.width
  let top = 0
  let bottom = startGeometry.height
  const isCorner = mode === 'resize-nw' || mode === 'resize-ne' || mode === 'resize-se' || mode === 'resize-sw'

  if (isCorner) {
    const anchor = getResizeAnchor(startGeometry, mode)
    const scaleX = Math.abs(p.x - anchor.x) / startGeometry.width
    const scaleY = Math.abs(p.y - anchor.y) / startGeometry.height
    const nextScale = Math.max(minSize / startGeometry.width, minSize / startGeometry.height, scaleX, scaleY)
    const nextWidth = startGeometry.width * nextScale
    const nextHeight = startGeometry.height * nextScale

    if (mode === 'resize-se') {
      right = nextWidth
      bottom = nextHeight
    } else if (mode === 'resize-sw') {
      left = startGeometry.width - nextWidth
      right = startGeometry.width
      bottom = nextHeight
    } else if (mode === 'resize-ne') {
      top = startGeometry.height - nextHeight
      right = nextWidth
      bottom = startGeometry.height
    } else {
      left = startGeometry.width - nextWidth
      top = startGeometry.height - nextHeight
      right = startGeometry.width
      bottom = startGeometry.height
    }
  } else {
    if (mode === 'resize-w') left = Math.min(startGeometry.width - minSize, p.x)
    if (mode === 'resize-e') right = Math.max(minSize, p.x)
    if (mode === 'resize-n') top = Math.min(startGeometry.height - minSize, p.y)
    if (mode === 'resize-s') bottom = Math.max(minSize, p.y)
  }

  const width = Math.max(minSize, right - left)
  const height = Math.max(minSize, bottom - top)
  return {
    left,
    top,
    width,
    height,
    center: elementLocalToWorld({ x: (left + right) / 2, y: (top + bottom) / 2 }, startGeometry),
  }
}

function resizeElementFromHandle(element: CanvasStroke, start: CanvasStroke, startGeometry: ElementGeometry, pointer: Point, mode: TransformMode) {
  const localCentered = worldToElementCenteredLocal(pointer, startGeometry)
  const p = { x: localCentered.x + startGeometry.width / 2, y: localCentered.y + startGeometry.height / 2 }
  const minSize = 24
  let left = 0
  let right = startGeometry.width
  let top = 0
  let bottom = startGeometry.height
  const isCorner = mode === 'resize-nw' || mode === 'resize-ne' || mode === 'resize-se' || mode === 'resize-sw'

  if (isCorner) {
    const anchor = getResizeAnchor(startGeometry, mode)
    const scaleX = Math.abs(p.x - anchor.x) / startGeometry.width
    const scaleY = Math.abs(p.y - anchor.y) / startGeometry.height
    const nextScale = Math.max(minSize / startGeometry.width, minSize / startGeometry.height, scaleX, scaleY)
    const nextWidth = startGeometry.width * nextScale
    const nextHeight = startGeometry.height * nextScale

    if (mode === 'resize-se') {
      left = 0
      top = 0
      right = nextWidth
      bottom = nextHeight
    } else if (mode === 'resize-sw') {
      left = startGeometry.width - nextWidth
      top = 0
      right = startGeometry.width
      bottom = nextHeight
    } else if (mode === 'resize-ne') {
      left = 0
      top = startGeometry.height - nextHeight
      right = nextWidth
      bottom = startGeometry.height
    } else {
      left = startGeometry.width - nextWidth
      top = startGeometry.height - nextHeight
      right = startGeometry.width
      bottom = startGeometry.height
    }
  } else {
    if (mode === 'resize-w') left = Math.min(startGeometry.width - minSize, p.x)
    if (mode === 'resize-e') right = Math.max(minSize, p.x)
    if (mode === 'resize-n') top = Math.min(startGeometry.height - minSize, p.y)
    if (mode === 'resize-s') bottom = Math.max(minSize, p.y)
  }

  const nextWidth = Math.max(minSize, right - left)
  const nextHeight = Math.max(minSize, bottom - top)
  const nextCenter = elementLocalToWorld({ x: (left + right) / 2, y: (top + bottom) / 2 }, startGeometry)
  applyElementResize(element, start, startGeometry, { left, top, width: nextWidth, height: nextHeight, center: nextCenter })
}

function applyElementResize(
  element: CanvasStroke,
  start: CanvasStroke,
  startGeometry: ElementGeometry,
  rect: { left: number; top: number; width: number; height: number; center: Point },
) {
  const sx = rect.width / startGeometry.width
  const sy = rect.height / startGeometry.height
  if (element.type === 'image' && start.type === 'image') {
    const startCenter = getElementGeometry(start).center
    const localCenter = worldToElementCenteredLocal(startCenter, startGeometry)
    const nextLocalCenter = {
      x: rect.left + (localCenter.x + startGeometry.width / 2) * sx,
      y: rect.top + (localCenter.y + startGeometry.height / 2) * sy,
    }
    const nextCenter = elementLocalToWorld(nextLocalCenter, { ...startGeometry, center: rect.center, width: rect.width, height: rect.height })
    element.width = Math.max(1, start.width * Math.abs(sx))
    element.height = Math.max(1, start.height * Math.abs(sy))
    element.x = nextCenter.x - element.width / 2
    element.y = nextCenter.y - element.height / 2
    element.rotation = start.rotation ?? 0
    return
  }

  if (element.type !== 'image' && start.type !== 'image') {
    element.points = start.points.map(point => {
      const local = worldToElementCenteredLocal(point, startGeometry)
      const nextLocal = {
        x: rect.left + (local.x + startGeometry.width / 2) * sx,
        y: rect.top + (local.y + startGeometry.height / 2) * sy,
      }
      return elementLocalToWorld(nextLocal, { ...startGeometry, center: rect.center, width: rect.width, height: rect.height })
    })
    element.width = Math.max(1, start.width * ((Math.abs(sx) + Math.abs(sy)) / 2))
  }
}

function getResizeAnchor(geometry: ElementGeometry, mode: TransformMode): Point {
  if (mode === 'resize-se') return { x: 0, y: 0 }
  if (mode === 'resize-sw') return { x: geometry.width, y: 0 }
  if (mode === 'resize-ne') return { x: 0, y: geometry.height }
  return { x: geometry.width, y: geometry.height }
}

function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360
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

function chooseImage() {
  fileInputRef.value?.click()
}

function onImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = firstImageFile(input.files)
  if (file) void addImageFile(file)
  input.value = ''
}

function onImageDrop(e: DragEvent) {
  const file = firstImageFile(e.dataTransfer?.files || null)
  if (!file) return
  void addImageFile(file)
}

function onPaste(e: ClipboardEvent) {
  const file = firstImageFile(e.clipboardData?.files || null)
  if (!file) return
  e.preventDefault()
  void addImageFile(file)
}

function firstImageFile(files: FileList | null): File | null {
  if (!files) return null
  return Array.from(files).find(file => file.type.startsWith('image/')) || null
}

async function addImageFile(file: File) {
  if (!file.type.startsWith('image/')) return
  if (file.size > 5 * 1024 * 1024) {
    saveError.value = '图片不能超过 5MB'
    return
  }

  saveError.value = '图片上传中'
  try {
    const [size, asset] = await Promise.all([readImageSize(file), uploadImageAsset(file)])
    const canvas = canvasRef.value
    const rect = canvas?.getBoundingClientRect()
    const viewportWidth = (rect?.width || 800) / scale.value
    const viewportHeight = (rect?.height || 600) / scale.value
    const fit = Math.min(1, (viewportWidth * 0.65) / size.width, (viewportHeight * 0.65) / size.height)
    const width = Math.max(40, size.width * fit)
    const height = Math.max(40, size.height * fit)
    const centerX = ((rect?.width || 800) / 2 - offsetX.value) / scale.value
    const centerY = ((rect?.height || 600) / 2 - offsetY.value) / scale.value
    const image = createLocalStroke({
      type: 'image',
      src: asset.url,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      rotation: 0,
      mime: asset.mime,
    }, currentPage.value)

    allStrokes.value.push(image)
    localUndoStack.value.push(image)
    setTool('select')
    selectedElementKeys.value = [elementKey(image)]
    void saveStroke(image)
    saveError.value = '图片已添加'
    window.setTimeout(() => {
      if (saveError.value === '图片已添加') saveError.value = ''
    }, 1600)
    renderFrame()
  } catch {
    saveError.value = '添加图片失败'
  }
}

async function uploadImageAsset(file: File): Promise<UploadedImageAsset> {
  const form = new FormData()
  form.append('image', file)
  const res = await fetch(`/api/projects/${props.boardSlug}/assets`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('INVALID_IMAGE'))
    }
    img.src = url
  })
}

function getStrokeBounds(strokes: StrokeData[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    if (stroke.type === 'image') {
      for (const corner of getElementWorldCorners(stroke)) {
        minX = Math.min(minX, corner.x)
        minY = Math.min(minY, corner.y)
        maxX = Math.max(maxX, corner.x)
        maxY = Math.max(maxY, corner.y)
      }
    } else {
      for (const point of stroke.points) {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      }
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
    const previousElementKey = elementKey(stroke)
    const row = await api<StrokeRow>(`/api/projects/${props.boardSlug}/strokes`, {
      method: 'POST',
      body: JSON.stringify({
        stroke_data: JSON.stringify(persistableStroke(stroke)),
        local_id: stroke.localId,
        page: stroke.page ?? currentPage.value,
      }),
    })
    applySavedRow(stroke, row)
    if (erasedPendingKeys.delete(previousElementKey)) {
      pendingEraseIds.add(row.id)
      void flushPendingEraseChanges()
    }
    selectedElementKeys.value = selectedElementKeys.value.map(key => key === previousElementKey ? elementKey(stroke) : key)
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
    if (stroke.id && !stroke.failed && selectedElementKeys.value.includes(elementKey(stroke))) void saveElementTransform(stroke)
  }
}

async function saveElementTransform(element: CanvasStroke) {
  if (!element.id || element.pending) {
    savePendingStrokes(props.boardSlug, allStrokes.value)
    renderFrame()
    return
  }

  element.pending = true
  saveError.value = ''
  try {
    const row = await api<StrokeRow>(`/api/projects/${props.boardSlug}/strokes/${element.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stroke_data: JSON.stringify(persistableStroke(element)),
        page: element.page ?? currentPage.value,
      }),
    })
    const parsed = parseStrokeRow(row)
    if (parsed) {
      const localId = element.localId
      Object.assign(element, parsed, { localId })
    }
  } catch {
    saveError.value = '元素更新失败'
  } finally {
    element.pending = false
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
    selectedElementKeys.value = selectedElementKeys.value.filter(key => key !== elementKey(target))
    renderFrame()
    return
  }

  try {
    await api(`/api/projects/${props.boardSlug}/strokes/${target.id}?page=${target.page ?? currentPage.value}`, {
      method: 'DELETE',
    })
    allStrokes.value = allStrokes.value.filter(stroke => stroke.id !== target.id)
    selectedElementKeys.value = selectedElementKeys.value.filter(key => key !== elementKey(target))
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
    clearSelection()
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
  clearSelection()
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
    clearSelection()
    renderFrame()
    return
  }

  if (message.type === 'stroke-updated') {
    if ((message.page ?? message.stroke.page ?? 0) !== currentPage.value) return
    const parsed = parseStrokeRow(message.stroke)
    if (!parsed) return
    const existing = allStrokes.value.find(stroke => stroke.id === parsed.id)
    if (existing) {
      const localId = existing.localId
      Object.assign(existing, parsed, { localId })
    } else {
      allStrokes.value.push(parsed)
    }
    renderFrame()
    return
  }

  if (message.type === 'stroke-deleted') {
    if ((message.page ?? 0) !== currentPage.value) return
    allStrokes.value = allStrokes.value.filter(stroke => stroke.id !== message.id)
    localUndoStack.value = localUndoStack.value.filter(stroke => stroke.id !== message.id)
    selectedElementKeys.value = selectedElementKeys.value.filter(key => key !== `id:${message.id}`)
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
  window.addEventListener('paste', onPaste)
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
  window.removeEventListener('paste', onPaste)
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
