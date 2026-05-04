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
      @dblclick="onCanvasDoubleClick"
    ></canvas>
    <textarea
      v-if="textEditor"
      ref="textEditorRef"
      class="wb-text-editor"
      :style="textEditorStyle"
      :value="textEditor.text"
      @input="onTextEditorInput"
      @blur="onTextEditorBlur"
      @keydown.stop="onTextEditorKeyDown"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
    ></textarea>
    <div
      v-if="textEditor"
      ref="textToolbarRef"
      class="wb-text-toolbar"
      :style="textToolbarStyle"
      @focusout="onTextToolbarFocusOut"
      @pointerdown.stop="startTextToolbarInteraction"
      @pointermove.stop
      @pointerup.stop
    >
      <label class="wb-text-color" title="文本颜色">
        <input type="color" :value="textEditor.color" @input="updateTextEditorColor(($event.target as HTMLInputElement).value)" />
      </label>
      <input
        class="wb-text-size"
        type="number"
        min="8"
        max="160"
        :value="Math.round(textEditor.fontSize)"
        @input="updateTextEditorFontSize(Number(($event.target as HTMLInputElement).value))"
        title="字号"
      />
      <button class="wb-text-style-btn" :class="{ active: textEditor.bold }" @click="toggleTextEditorStyle('bold')" title="粗体">B</button>
      <button class="wb-text-style-btn wb-text-italic" :class="{ active: textEditor.italic }" @click="toggleTextEditorStyle('italic')" title="斜体">I</button>
      <button class="wb-text-style-btn" :class="{ active: textEditor.align === 'left' }" @click="setTextEditorAlign('left')" title="左对齐">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M4 12h11"/><path d="M4 18h16"/></svg>
      </button>
      <button class="wb-text-style-btn" :class="{ active: textEditor.align === 'center' }" @click="setTextEditorAlign('center')" title="居中">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M7 12h10"/><path d="M4 18h16"/></svg>
      </button>
      <button class="wb-text-style-btn" :class="{ active: textEditor.align === 'right' }" @click="setTextEditorAlign('right')" title="右对齐">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M9 12h11"/><path d="M4 18h16"/></svg>
      </button>
    </div>
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
      <button class="wb-tool-btn" :class="{ active: currentTool === 'text' }" @click="insertText" title="添加文本">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14"/><path d="M12 5v14"/><path d="M8 19h8"/></svg>
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
import { cutStrokeByEraser, strokeIntersectsEraser } from '../whiteboard/eraser'
import {
  degreesToRadians,
  getCenter,
  getDistance,
} from '../whiteboard/geometry'
import { ensureLegacyClientId, loadPendingStrokes, savePendingStrokes } from '../whiteboard/pendingStorage'
import { drawStrokes } from '../whiteboard/renderer'
import {
  applyElementTransform,
  cloneElement,
  elementIntersectsBox,
  elementKey,
  getElementGeometry,
  getElementHandlePoints,
  getElementWorldCorners,
  getHandleSize,
  getInteractiveGeometry,
  getSelectionGeometry,
  hitTestElements as hitTestSelectionElements,
  isDrawingStroke,
  isRectElement,
  type DrawingStroke,
  type ElementGeometry,
  type ElementTransformState,
  type RectElementStroke,
  type TextStroke,
  type TransformMode,
} from '../whiteboard/selection'
import {
  applySavedRow,
  createLocalStroke,
  parseStrokeRow,
  persistableStroke,
} from '../whiteboard/strokeModel'
import {
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_WIDTH,
  TEXT_FONT_FAMILY,
  clampTextFontSize,
  measureTextBox,
} from '../whiteboard/textLayout'
import type {
  CanvasStroke,
  DrawingStrokeData,
  Point,
  StrokeData,
  TextElementData,
  StrokeRow,
  UploadedImageAsset,
  WhiteboardWsMessage,
} from '../whiteboard/types'
import { useWhiteboardSocket } from '../composables/useWhiteboardSocket'
import { useWhiteboardFullscreen } from '../composables/useWhiteboardFullscreen'
import { useWhiteboardViewport } from '../composables/useWhiteboardViewport'
import { useWhiteboardTextEditor, type TextEditorCommit } from '../composables/useWhiteboardTextEditor'

const props = withDefaults(defineProps<{
  boardSlug?: string
}>(), {
  boardSlug: 'main',
})

const canvasRef = ref<HTMLCanvasElement>()
const miniMapRef = ref<HTMLCanvasElement>()
const fileInputRef = ref<HTMLInputElement>()
const textEditorRef = ref<HTMLTextAreaElement>()
const textToolbarRef = ref<HTMLDivElement>()
const wrapRef = ref<HTMLDivElement>()
const authStore = useAuthStore()

const {
  offsetX,
  offsetY,
  scale,
  clientToWorld: screenToWorld,
  clientToCanvas: screenToCanvas,
  onWheel,
  reset: resetView,
  centerOnWorldPoint,
  getViewportWorldBounds,
} = useWhiteboardViewport({
  canvasRef,
  onChange: () => renderFrame(),
})

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
const retryTimer = ref<number | null>(null)
const touchPointers = new Map<number, Point>()
let frameRequest: number | null = null
let unmounted = false
let pinchDistance = 0
let pinchCenter: Point | null = null
let pinchActive = false
let lastErasePoint: Point | null = null
const pendingEraseIds = new Set<number>()
const pendingEraseUpdateKeys = new Set<string>()
const erasedPendingKeys = new Set<string>()
const imageCache = new Map<string, HTMLImageElement | 'loading' | 'error'>()

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

type WhiteboardTool = 'pen' | 'eraser' | 'drag' | 'select' | 'text'
type EraserMode = 'mask' | 'delete' | 'cut'

const selectedElementKeys = ref<string[]>([])
const isElementTransforming = ref(false)
const isBoxSelecting = ref(false)
const selectionBoxStart = ref<Point | null>(null)
const selectionBoxEnd = ref<Point | null>(null)
let elementTransform: ElementTransformState | null = null

const {
  editor: textEditor,
  beginInsertion: beginTextInsertionState,
  beginEdit: beginTextEditState,
  focusEditor: focusTextEditor,
  onInput: onTextEditorInput,
  onKeyDown: onTextEditorKeyDown,
  onBlur: onTextEditorBlur,
  onToolbarFocusOut: onTextToolbarFocusOut,
  startToolbarInteraction: startTextToolbarInteraction,
  updateColor: updateTextEditorColor,
  updateFontSize: updateTextEditorFontSize,
  toggleStyle: toggleTextEditorStyle,
  setAlign: setTextEditorAlign,
  commit: commitTextEditor,
  cancel: cancelTextEditor,
} = useWhiteboardTextEditor({
  textEditorRef,
  textToolbarRef,
  measureBox: (text, fontSize, width, bold, italic) => measureInsertedText(text, fontSize, width, bold, italic),
  onCommit: applyTextEditorCommit,
  onChange: () => renderFrame(),
})

// `connectSocket` returns the ref-backed `wsState` that templates and
// computeds read; the actual connect/reconnect lifecycle lives in the
// composable. Callbacks below are arrow functions so they pick up the
// later-declared `handleSocketMessage` / `loadExistingStrokes` / etc. via
// closure at the moment a message or open event fires.
const { wsState, connect: connectSocket } = useWhiteboardSocket({
  url: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/projects/${props.boardSlug}/ws`
  },
  onOpen: () => {
    void loadExistingStrokes(lastSyncedId.value > 0)
    void flushPendingStrokes()
  },
  onMessage: (event) => handleSocketMessage(event),
})

const {
  isFullscreen,
  isWebFullscreen,
  fullscreenTitle,
  toggleFullscreen,
  startFullscreenPress,
  finishFullscreenPress,
  cancelFullscreenPress,
} = useWhiteboardFullscreen({
  wrapRef,
  onModeChange: () => scheduleResizeCanvas(),
  onError: (message) => { saveError.value = message },
})

const failedCount = computed(() => allStrokes.value.filter(s => s.failed && !s.id).length)
const canUndo = computed(() => localUndoStack.value.length > 0)
const canvasCursor = computed(() => {
  if (isElementTransforming.value) return 'grabbing'
  if (isPanning.value) return 'grabbing'
  if (currentTool.value === 'drag' || spaceHeld.value) return 'grab'
  if (currentTool.value === 'text') return 'text'
  if (currentTool.value === 'select') return 'default'
  return 'crosshair'
})
const textEditorStyle = computed(() => {
  const editor = textEditor.value
  if (!editor) return {}
  return {
    left: `${offsetX.value + editor.x * scale.value}px`,
    top: `${offsetY.value + editor.y * scale.value}px`,
    width: `${editor.width * scale.value}px`,
    height: `${editor.height * scale.value}px`,
    fontSize: `${editor.fontSize * scale.value}px`,
    color: editor.color,
    fontFamily: TEXT_FONT_FAMILY,
    fontWeight: editor.bold ? '700' : '400',
    fontStyle: editor.italic ? 'italic' : 'normal',
    textAlign: editor.align,
    transform: `rotate(${editor.rotation}deg)`,
  }
})
const textToolbarStyle = computed(() => {
  const editor = textEditor.value
  if (!editor) return {}
  return {
    left: `${offsetX.value + editor.x * scale.value}px`,
    top: `${Math.max(8, offsetY.value + editor.y * scale.value - 42)}px`,
  }
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

function selectPreset(i: number) {
  activePresetIndex.value = i
  currentColor.value = presets.value[i].color
  currentWidth.value = presets.value[i].width
  setTool('pen')
}

function setTool(tool: WhiteboardTool) {
  if (textEditor.value && tool !== 'text') void commitTextEditor()
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

  drawStrokes(ctx, allToDraw, { imageCache, scheduleRender })
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

function drawSelectedElementOverlay(ctx: CanvasRenderingContext2D) {
  const elements = getSelectedElements()
  if (elements.length === 0) return

  const handle = getHandleSize(scale.value)
  const geometry = getInteractiveGeometry(getSelectionGeometry(elements), scale.value)
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

  for (const point of getElementHandlePoints(geometry, scale.value)) {
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

function hitTestElements(point: Point) {
  return hitTestSelectionElements(point, allStrokes.value, getSelectedElements(), scale.value)
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
  if (currentTool.value === 'text') {
    e.preventDefault()
    if (textEditor.value) {
      void commitTextEditor()
      return
    }
    beginTextInsertion(worldPoint)
    return
  }

  const hit = currentTool.value === 'select' ? hitTestElements(worldPoint) : null
  if (hit) {
    e.preventDefault()
    if (!isElementSelected(hit.element)) setSelectedElements([hit.element])
    const selected = getSelectedElements()
    const geometry = getInteractiveGeometry(getSelectionGeometry(selected), scale.value)
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
    applyElementTransform(screenToWorld(e.clientX, e.clientY), elementTransform, allStrokes.value)
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

function onCanvasDoubleClick(e: MouseEvent) {
  if (currentTool.value !== 'select') return
  const worldPoint = screenToWorld(e.clientX, e.clientY)
  const hit = hitTestElements(worldPoint)
  if (!hit || hit.element.type !== 'text') return

  setSelectedElements([hit.element])
  beginTextEdit(hit.element)
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
    if (isDrawingStroke(stroke) && stroke.tool === 'eraser') return false
    return elementIntersectsBox(stroke, { left, right, top, bottom }, scale.value)
  })
  setSelectedElements(selected)
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
    if (!isDrawingStroke(stroke) || stroke.tool === 'eraser' || !strokeIntersectsEraser(stroke, from, to, radius)) {
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

function eraseCutSegmentsBetween(from: Point, to: Point) {
  const radius = Math.max(1, currentWidth.value / 2)
  const removedKeys = new Set<string>()
  const removedIds: number[] = []
  const nextStrokes: CanvasStroke[] = []

  for (const stroke of allStrokes.value) {
    if (!isDrawingStroke(stroke) || stroke.tool === 'eraser') {
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

function chooseImage() {
  fileInputRef.value?.click()
}

function insertText() {
  setTool('text')
}

function beginTextInsertion(point: Point) {
  const box = measureInsertedText()
  beginTextInsertionState({
    text: '',
    x: point.x,
    y: point.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    fontSize: box.fontSize,
    color: currentColor.value,
    align: 'left',
    bold: false,
    italic: false,
  })
  selectedElementKeys.value = []
}

function beginTextEdit(element: TextStroke) {
  beginTextEditState({
    key: elementKey(element),
    text: element.text,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation ?? 0,
    fontSize: element.fontSize,
    color: element.color,
    align: element.align ?? 'left',
    bold: element.bold ?? false,
    italic: element.italic ?? false,
  })
}

/**
 * Persistence side of text editor commits. The composable handles open
 * / type / commit-or-cancel; we just receive a finalized commit and
 * either patch an existing text stroke or create a new one.
 */
async function applyTextEditorCommit(commit: TextEditorCommit) {
  if (commit.mode === 'edit' && commit.key) {
    const element = allStrokes.value.find(stroke => elementKey(stroke) === commit.key)
    if (element?.type === 'text') {
      element.text = commit.text
      element.x = commit.x
      element.y = commit.y
      element.width = commit.width
      element.height = commit.height
      element.rotation = commit.rotation
      element.fontSize = commit.fontSize
      element.color = commit.color
      element.align = commit.align
      element.bold = commit.bold
      element.italic = commit.italic
      setSelectedElements([element])
      await saveElementTransform(element)
    }
    return
  }

  const element = createLocalStroke({
    type: 'text',
    text: commit.text,
    x: commit.x,
    y: commit.y,
    width: commit.width,
    height: commit.height,
    rotation: commit.rotation,
    fontSize: commit.fontSize,
    color: commit.color,
    align: commit.align,
    bold: commit.bold,
    italic: commit.italic,
  }, currentPage.value)

  allStrokes.value.push(element)
  localUndoStack.value.push(element)
  currentTool.value = 'select'
  selectedElementKeys.value = [elementKey(element)]
  void saveStroke(element)
  saveError.value = '文本已添加'
  window.setTimeout(() => {
    if (saveError.value === '文本已添加') saveError.value = ''
  }, 1600)
}

function measureInsertedText(text = '', fontSize = DEFAULT_TEXT_FONT_SIZE, width = DEFAULT_TEXT_WIDTH, bold = false, italic = false) {
  return measureTextBox(canvasRef.value?.getContext('2d'), text, fontSize, width, bold, italic)
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
    if (isRectElement(stroke)) {
      for (const corner of getElementWorldCorners(stroke)) {
        minX = Math.min(minX, corner.x)
        minY = Math.min(minY, corner.y)
        maxX = Math.max(maxX, corner.x)
        maxY = Math.max(maxY, corner.y)
      }
    } else if (isDrawingStroke(stroke)) {
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
  drawStrokes(ctx, allStrokes.value, { imageCache, scheduleRender })
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
  centerOnWorldPoint({ x: worldX, y: worldY })
}

function scheduleResizeCanvas() {
  void nextTick(() => {
    window.requestAnimationFrame(() => {
      resizeCanvas()
      window.setTimeout(resizeCanvas, 80)
    })
  })
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
  if (retryTimer.value) window.clearTimeout(retryTimer.value)
  if (frameRequest !== null) window.cancelAnimationFrame(frameRequest)
  for (const stroke of allStrokes.value) {
    if (stroke.retryTimer) {
      window.clearTimeout(stroke.retryTimer)
    }
  }
})
</script>
