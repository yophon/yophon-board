<template>
  <div class="whiteboard-wrap" :class="{ 'web-fullscreen': isWebFullscreen }" ref="wrapRef">
    <input ref="fileInputRef" class="wb-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="onImageFileChange" />
    <input ref="pdfInputRef" class="wb-file-input" type="file" accept="application/pdf" @change="onPdfFileChange" />
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
      :class="{ 'wb-text-editor-mindmap': isMindMapTextEditor }"
      :style="textEditorStyle"
      :value="textEditor.text"
      @input="onTextEditorInputWrapped"
      @blur="onTextEditorBlur"
      @keydown.stop="onTextEditorKeyDown"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
    ></textarea>
    <div
      v-if="textEditor && !isMindMapTextEditor"
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
    <div
      v-if="selectedPdfElement"
      class="wb-pdf-pager"
      :style="pdfPagerStyle"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @wheel.stop
    >
      <button
        class="wb-pdf-pager-btn"
        :disabled="(selectedPdfElement.currentPageIndex ?? 0) <= 0"
        @click="pdfPagerPrev"
        title="上一页"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="wb-pdf-pager-label">
        <input
          class="wb-pdf-pager-input"
          type="number"
          min="1"
          :max="selectedPdfElement.pageCount"
          :value="(selectedPdfElement.currentPageIndex ?? 0) + 1"
          @change="pdfPagerInput(($event.target as HTMLInputElement).value)"
          @keydown.enter="pdfPagerInput(($event.target as HTMLInputElement).value)"
          title="页码"
        />
        <span class="wb-pdf-pager-total">/ {{ selectedPdfElement.pageCount }}</span>
      </span>
      <button
        class="wb-pdf-pager-btn"
        :disabled="(selectedPdfElement.currentPageIndex ?? 0) >= selectedPdfElement.pageCount - 1"
        @click="pdfPagerNext"
        title="下一页"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
    <div
      v-if="selectedMindMapElement"
      class="wb-mindmap-toolbar"
      :style="mindMapToolbarStyle"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @wheel.stop
    >
      <button class="wb-mindmap-action" @click="editSelectedMindMapNode" title="编辑节点（双击节点）">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button class="wb-mindmap-action" @click="addMindMapChild" title="添加子节点（Tab）">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/><path d="M18 8v8"/><path d="M14 12h8"/></svg>
      </button>
      <button class="wb-mindmap-action" @click="addMindMapSibling" title="添加同级节点（Enter）">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><path d="M10 7h5"/><path d="M10 17h5"/><path d="M18 10v8"/><path d="M14 14h8"/></svg>
      </button>
      <button class="wb-mindmap-action" :disabled="!selectedMindMapNodeHasChildren" @click="toggleSelectedMindMapCollapse" title="展开/收起（点击节点旁圆形徽章）">
        <svg v-if="selectedMindMapNode?.collapsed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>
      </button>
      <button class="wb-mindmap-action wb-mindmap-danger" :disabled="selectedMindMapNodeId === 'root'" @click="deleteMindMapNode" title="删除节点及子树（Delete，可撤销）">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
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
      <button class="wb-tool-btn" @click="choosePdf" title="添加 PDF">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 13h.5"/><path d="M14 13h1"/><path d="M9 17h6"/></svg>
      </button>
      <button class="wb-tool-btn" :class="{ active: currentTool === 'text' }" @click="insertText" title="添加文本">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14"/><path d="M12 5v14"/><path d="M8 19h8"/></svg>
      </button>
      <button class="wb-tool-btn" @click="insertMindMap" title="添加思维导图">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M9.7 10 6.7 7.5"/><path d="m14.3 10 3-2.5"/><path d="m9.7 14-3 2.5"/><path d="m14.3 14 3 2.5"/></svg>
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
import { ensureLegacyClientId, loadPendingStrokes } from '../whiteboard/pendingStorage'
import { drawStrokes } from '../whiteboard/renderer'
import {
  MINDMAP_MAX_NODES,
  addMindMapChildNode,
  addMindMapSiblingNode,
  createDrawnixMindMapTemplate,
  getMindMapBadgeNodeId,
  getMindMapChildren,
  getMindMapScale,
  deleteMindMapNodeById,
  getNearestMindMapNodeId,
  getVisibleMindMapNodeIds,
  layoutMindMap,
  normalizeMindMap,
  reattachMindMapNode,
  toggleMindMapNodeCollapsed,
} from '../whiteboard/mindmap'
import type { PdfCache } from '../whiteboard/pdfRenderer'
import { probePdf } from '../whiteboard/pdfRenderer'
import {
  cloneElement,
  elementKey,
  getElementHandlePoints,
  getElementWorldCorners,
  getHandleSize,
  getInteractiveGeometry,
  getSelectionGeometry,
  isDrawingStroke,
  isRectElement,
  mindMapLocalToWorld,
  worldToMindMapLocal,
  type DrawingStroke,
  type TextStroke,
} from '../whiteboard/selection'
import { createLocalStroke, persistableStroke } from '../whiteboard/strokeModel'
import {
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_WIDTH,
  TEXT_FONT_FAMILY,
  measureTextBox,
  wrapTextLines,
} from '../whiteboard/textLayout'
import type {
  CanvasStroke,
  DrawingStrokeData,
  MindMapElementData,
  MindMapNodeData,
  Point,
  StrokeData,
  UploadedImageAsset,
} from '../whiteboard/types'
import { useWhiteboardSocket } from '../composables/useWhiteboardSocket'
import { useWhiteboardFullscreen } from '../composables/useWhiteboardFullscreen'
import { useWhiteboardViewport } from '../composables/useWhiteboardViewport'
import { useWhiteboardTextEditor, type TextEditorCommit } from '../composables/useWhiteboardTextEditor'
import { useWhiteboardHistory } from '../composables/useWhiteboardHistory'
import { useWhiteboardSelection } from '../composables/useWhiteboardSelection'
import { useWhiteboardPersist } from '../composables/useWhiteboardPersist'
import { useWhiteboardSync } from '../composables/useWhiteboardSync'

const props = withDefaults(defineProps<{
  boardSlug?: string
}>(), {
  boardSlug: 'main',
})

const canvasRef = ref<HTMLCanvasElement>()
const miniMapRef = ref<HTMLCanvasElement>()
const fileInputRef = ref<HTMLInputElement>()
const pdfInputRef = ref<HTMLInputElement>()
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
  onChange: () => {
    invalidateScene()
    requestRender()
  },
})

type WhiteboardTool = 'pen' | 'eraser' | 'drag' | 'select' | 'text'
type EraserMode = 'mask' | 'delete' | 'cut'

const isDrawing = ref(false)
const isPanning = ref(false)
const isErasing = ref(false)
const currentPage = ref(0)
const currentStroke = ref<DrawingStrokeData | null>(null)
const allStrokes = ref<CanvasStroke[]>([])
const lastSyncedId = ref(0)

const currentColor = ref('#202124')
const currentWidth = ref(3)
const currentTool = ref<WhiteboardTool>('pen')
const spaceHeld = ref(false)
const saveError = ref('')
const touchPointers = new Map<number, Point>()
let frameRequest: number | null = null
let statusTimer: number | null = null
let pinchDistance = 0
let pinchCenter: Point | null = null
let pinchActive = false
let resizeObserver: ResizeObserver | null = null
let lastErasePoint: Point | null = null
const imageCache = new Map<string, HTMLImageElement | 'loading' | 'error'>()
const pdfCache: PdfCache = new Map()

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

// —— composables: selection, history, persistence, sync ——

const selection = useWhiteboardSelection({ strokes: allStrokes, scale })
const {
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
} = selection

const history = useWhiteboardHistory()
const canUndo = history.canUndo

const persist = useWhiteboardPersist({
  boardSlug: () => props.boardSlug,
  currentPage,
  strokes: allStrokes,
  lastSyncedId,
  setStatus: (message) => { saveError.value = message },
  notifyStrokesChanged,
  onStrokeKeyChanged: (previousKey, nextKey) => selection.remapKey(previousKey, nextKey),
})
const failedCount = persist.failedCount

const sync = useWhiteboardSync({
  boardSlug: () => props.boardSlug,
  currentPage,
  strokes: allStrokes,
  lastSyncedId,
  prepareStroke: prepareStrokeForBoard,
  isElementSyncBlocked: (element) =>
    persist.isElementSyncBusy(element) ||
    selection.isElementInteracting(element) ||
    isEditorEditingElement(element),
  isIdDiscarded: persist.isIdDiscarded,
  consumeDiscardedLocalId: persist.consumeDiscardedLocalId,
  eraseRemoteId: (id, page) => {
    persist.queueEraseId(id, page)
    void persist.flushPendingEraseChanges()
  },
  onPendingMirrorChanged: persist.persistPendingMirror,
  onStrokesCleared: () => {
    history.clear()
    clearSelection()
  },
  onStrokeDeleted: (id) => {
    history.removeById(id)
    selection.dropKey(`id:${id}`)
  },
  notifyStrokesChanged,
  setStatus: (message) => { saveError.value = message },
})

const {
  editor: textEditor,
  beginInsertion: beginTextInsertionState,
  beginEdit: beginTextEditState,
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
} = useWhiteboardTextEditor({
  textEditorRef,
  textToolbarRef,
  measureBox: (text, fontSize, width, bold, italic) => measureInsertedText(text, fontSize, width, bold, italic),
  onCommit: applyTextEditorCommit,
  onCancel: onTextEditorCancelled,
  onChange: () => requestRender(),
})

// `connectSocket` returns the ref-backed `wsState` that templates and
// computeds read; the actual connect/reconnect lifecycle lives in the
// composable. Callbacks are arrow functions so they resolve `sync` /
// `persist` via closure at the moment a message or open event fires.
const { wsState, connect: connectSocket } = useWhiteboardSocket({
  url: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/projects/${props.boardSlug}/ws`
  },
  onOpen: () => {
    void sync.loadExistingStrokes(lastSyncedId.value > 0)
    void persist.flushPendingStrokes()
  },
  onMessage: (event) => sync.handleSocketMessage(event),
})

const {
  isFullscreen,
  isWebFullscreen,
  fullscreenTitle,
  startFullscreenPress,
  finishFullscreenPress,
  cancelFullscreenPress,
} = useWhiteboardFullscreen({
  wrapRef,
  onModeChange: () => scheduleResizeCanvas(),
  onError: (message) => { saveError.value = message },
})

// —— computeds ——

const canvasCursor = computed(() => {
  if (isMindMapNodeDragging.value) return 'grabbing'
  if (isElementTransforming.value) return 'grabbing'
  if (isPanning.value) return 'grabbing'
  if (currentTool.value === 'drag' || spaceHeld.value) return 'grab'
  if (currentTool.value === 'text') return 'text'
  if (currentTool.value === 'select') return hoveredMindMap.value ? 'pointer' : 'default'
  return 'crosshair'
})
/** The mind-map element + node currently being edited inline (if any). */
const editingMindMapInfo = computed(() => {
  const info = getEditingMindMapNode()
  if (!info) return null
  const element = allStrokes.value.find(stroke => elementKey(stroke) === info.elementKey)
  if (!element || element.type !== 'mindmap') return null
  const node = element.nodes.find(item => item.id === info.nodeId)
  if (!node) return null
  return { element, node }
})

const textEditorStyle = computed(() => {
  const editor = textEditor.value
  if (!editor) return {}

  const mindMap = editingMindMapInfo.value
  if (mindMap) {
    // In-place node editing: the textarea covers the node exactly and
    // copies its visual style (fill, radius, font, centering), so typing
    // feels like editing the node itself rather than a floating box.
    const { element, node } = mindMap
    const s = getMindMapScale(element)
    const isRoot = node.id === 'root'
    const fontSize = isRoot ? element.fontSize + 1 : element.fontSize
    const lineHeight = fontSize * 1.2
    let lineCount = 1
    const ctx = canvasRef.value?.getContext('2d')
    if (ctx) {
      ctx.save()
      ctx.font = `${isRoot ? 700 : 600} ${fontSize}px ${TEXT_FONT_FAMILY}`
      lineCount = Math.max(1, wrapTextLines(ctx, editor.text, Math.max(1, node.width - 22 * s)).length)
      ctx.restore()
    }
    const padTop = Math.max(0, (editor.height - lineCount * lineHeight) / 2)
    return {
      left: `${offsetX.value + editor.x * scale.value}px`,
      top: `${offsetY.value + editor.y * scale.value}px`,
      width: `${Math.max(1, editor.width * scale.value)}px`,
      height: `${Math.max(1, editor.height * scale.value)}px`,
      fontSize: `${fontSize * scale.value}px`,
      lineHeight: '1.2',
      color: isRoot ? '#ffffff' : '#202124',
      backgroundColor: node.color || (isRoot ? '#202124' : '#ffffff'),
      borderRadius: `${(isRoot ? 18 : 8) * s * scale.value}px`,
      fontFamily: TEXT_FONT_FAMILY,
      fontWeight: isRoot ? '700' : '600',
      textAlign: 'center' as const,
      padding: `${padTop * scale.value}px ${11 * s * scale.value}px`,
      boxSizing: 'border-box' as const,
      transform: `rotate(${editor.rotation}deg)`,
      // Positioned at the node's rotated top-left, so rotation pivots there.
      transformOrigin: 'top left',
    }
  }

  return {
    left: `${offsetX.value + editor.x * scale.value}px`,
    top: `${offsetY.value + editor.y * scale.value}px`,
    width: `${Math.max(1, editor.width * scale.value)}px`,
    height: `${Math.max(1, editor.height * scale.value)}px`,
    fontSize: `${editor.fontSize * scale.value}px`,
    color: editor.color,
    fontFamily: TEXT_FONT_FAMILY,
    fontWeight: editor.bold ? '700' : '400',
    fontStyle: editor.italic ? 'italic' : 'normal',
    textAlign: editor.align,
    transform: `rotate(${editor.rotation}deg)`,
    // Plain text rotates around its center to match the canvas renderer.
    transformOrigin: 'center',
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

// Pager overlay: shows up when exactly one PDF element is selected so
// the user can flip pages without leaving the canvas. We re-derive
// every render so it tracks pan/zoom + element resize without
// imperative DOM math.
const selectedPdfElement = computed(() => {
  const elements = allStrokes.value.filter(s => selectedElementKeys.value.includes(elementKey(s)))
  if (elements.length !== 1) return null
  const only = elements[0]
  return only.type === 'pdf' ? only : null
})
const pdfPagerStyle = computed(() => {
  const pdf = selectedPdfElement.value
  if (!pdf) return {}
  // Anchor below the element, centered horizontally. Stays inside the
  // viewport even when the element is panned off the bottom.
  const left = offsetX.value + (pdf.x + pdf.width / 2) * scale.value
  const top = offsetY.value + (pdf.y + pdf.height) * scale.value + 10
  return {
    left: `${left}px`,
    top: `${top}px`,
    transform: 'translateX(-50%)',
  }
})

const selectedMindMapElement = computed(() => {
  const elements = allStrokes.value.filter(s => selectedElementKeys.value.includes(elementKey(s)))
  if (elements.length !== 1) return null
  const only = elements[0]
  if (only.type !== 'mindmap') return null
  const nodeId = selectedMindMapNodeId.value
  if (!nodeId || !only.nodes.some(node => node.id === nodeId)) return null
  return only
})

const selectedMindMapNode = computed(() => {
  const element = selectedMindMapElement.value
  if (!element || !selectedMindMapNodeId.value) return null
  return element.nodes.find(node => node.id === selectedMindMapNodeId.value) || null
})

const selectedMindMapNodeHasChildren = computed(() => {
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  return !!element && !!node && getMindMapChildren(element, node.id).length > 0
})

const mindMapToolbarStyle = computed(() => {
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  if (!element || !node) return {}
  const topCenter = mindMapLocalToWorld(element, { x: node.x + node.width / 2, y: node.y })
  return {
    left: `${offsetX.value + topCenter.x * scale.value}px`,
    top: `${Math.max(8, offsetY.value + topCenter.y * scale.value - 46)}px`,
    transform: 'translateX(-50%)',
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
const isMindMapTextEditor = computed(() => textEditor.value?.key?.includes('::') ?? false)

// —— helpers ——

function showTransientStatus(message: string, duration = 1600) {
  saveError.value = message
  if (statusTimer) window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => {
    statusTimer = null
    if (saveError.value === message) saveError.value = ''
  }, duration)
}

function prepareStrokeForBoard(stroke: CanvasStroke): CanvasStroke {
  if (stroke.type === 'mindmap') normalizeMindMap(stroke)
  return stroke
}

function isEditorEditingElement(element: CanvasStroke): boolean {
  const key = textEditor.value?.key
  if (!key) return false
  const elKey = elementKey(element)
  return key === elKey || key.startsWith(`${elKey}::`)
}

function getEditingMindMapNode() {
  const key = textEditor.value?.key
  if (!key?.includes('::')) return null
  const [elementKeyPart, nodeId] = key.split('::')
  if (!elementKeyPart || !nodeId) return null
  return { elementKey: elementKeyPart, nodeId }
}

/** Record a mind map's pre-mutation state so the operation is undoable. */
function snapshotMindMap(element: CanvasStroke): CanvasStroke {
  return cloneElement(element)
}

/** Grow/shrink a node's height to fit its wrapped text (renderer metrics). */
function fitMindMapNodeHeight(element: MindMapElementData & CanvasStroke, node: MindMapNodeData) {
  const ctx = canvasRef.value?.getContext('2d')
  const s = getMindMapScale(element)
  const isRoot = node.id === 'root'
  const fontSize = isRoot ? element.fontSize + 1 : element.fontSize
  let lineCount = 1
  if (ctx) {
    ctx.save()
    ctx.font = `${isRoot ? 700 : 600} ${fontSize}px ${TEXT_FONT_FAMILY}`
    lineCount = Math.max(1, wrapTextLines(ctx, node.text, Math.max(1, node.width - 22 * s)).length)
    ctx.restore()
  }
  const minHeight = (isRoot ? 62 : 38) * s
  node.height = Math.max(minHeight, Math.ceil(lineCount * fontSize * 1.2 + 16 * s))
}

// —— tools ——

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
  hoveredMindMap.value = null
  if (tool === 'eraser') currentWidth.value = eraserWidth.value
  if (tool !== 'eraser') eraserMenuOpen.value = false
  if (tool !== 'select') clearSelection()
  requestRender()
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

// —— pinch gesture ——

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
  invalidateScene()
  requestRender()
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

// —— rendering ——

const drawOptions = {
  imageCache,
  pdfCache,
  scheduleRender: () => {
    invalidateScene()
    requestRender()
  },
}

let sceneCanvas: HTMLCanvasElement | null = null
let sceneCacheValid = false

function invalidateScene() {
  sceneCacheValid = false
}

/** Stroke data changed: drop render caches and repaint. */
function notifyStrokesChanged() {
  invalidateScene()
  requestRender()
}

function requestRender() {
  if (frameRequest !== null) return
  frameRequest = window.requestAnimationFrame(() => {
    frameRequest = null
    renderFrame()
  })
}

/** Clear + grid + strokes, in world space, onto the given context. */
function paintScene(
  ctx: CanvasRenderingContext2D,
  deviceWidth: number,
  deviceHeight: number,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  strokesToDraw: (CanvasStroke | DrawingStrokeData)[],
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, deviceWidth, deviceHeight)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  const gridSize = 40
  const startX = Math.floor(-offsetX.value / scale.value / gridSize) * gridSize - gridSize
  const startY = Math.floor(-offsetY.value / scale.value / gridSize) * gridSize - gridSize
  const endX = startX + cssWidth / scale.value + gridSize * 2
  const endY = startY + cssHeight / scale.value + gridSize * 2
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  for (let x = startX; x < endX; x += gridSize) {
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath()
      ctx.arc(x, y, 1.2 / scale.value, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  drawStrokes(ctx, strokesToDraw, drawOptions)
  ctx.restore()
}

function renderFrame() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1

  const editingMindMapNode = getEditingMindMapNode()
  const staticStrokes = allStrokes.value.map(stroke => {
    if (editingMindMapNode && stroke.type === 'mindmap' && elementKey(stroke) === editingMindMapNode.elementKey) {
      return { ...stroke, editingNodeId: editingMindMapNode.nodeId }
    }
    return stroke
  })

  if (isDrawing.value && currentStroke.value) {
    // Hot path: while a pen / mask-eraser stroke is in progress, the static
    // scene can't change (pan/zoom and selection are mutually exclusive
    // with drawing), so it's painted once into an offscreen layer and only
    // the live stroke is drawn per frame. Heavy boards stay responsive.
    if (!sceneCacheValid || !sceneCanvas || sceneCanvas.width !== canvas.width || sceneCanvas.height !== canvas.height) {
      sceneCanvas = sceneCanvas ?? document.createElement('canvas')
      sceneCanvas.width = canvas.width
      sceneCanvas.height = canvas.height
      paintScene(sceneCanvas.getContext('2d')!, canvas.width, canvas.height, rect.width, rect.height, dpr, staticStrokes)
      sceneCacheValid = true
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(sceneCanvas, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.save()
    ctx.translate(offsetX.value, offsetY.value)
    ctx.scale(scale.value, scale.value)
    drawStrokes(ctx, [currentStroke.value], drawOptions)
    ctx.restore()
  } else {
    sceneCacheValid = false
    paintScene(ctx, canvas.width, canvas.height, rect.width, rect.height, dpr, staticStrokes)
    ctx.save()
    ctx.translate(offsetX.value, offsetY.value)
    ctx.scale(scale.value, scale.value)
    drawSelectedElementOverlay(ctx)
    drawSelectionBox(ctx)
    drawMindMapHoverOverlay(ctx)
    drawMindMapDragPreview(ctx)
    ctx.restore()
  }
  requestMiniMapRender()
}

/** Enter the element-local coordinate space of a (possibly rotated) mind map. */
function applyMindMapElementTransform(ctx: CanvasRenderingContext2D, element: MindMapElementData & CanvasStroke) {
  ctx.translate(element.x + element.width / 2, element.y + element.height / 2)
  ctx.rotate(degreesToRadians(element.rotation ?? 0))
  ctx.translate(-element.width / 2, -element.height / 2)
}

function drawMindMapHoverOverlay(ctx: CanvasRenderingContext2D) {
  const hovered = hoveredMindMap.value
  if (!hovered || hovered.badge) return
  if (isMindMapNodeDragging.value || isElementTransforming.value) return
  const element = allStrokes.value.find(stroke => elementKey(stroke) === hovered.key)
  if (!element || element.type !== 'mindmap') return
  const node = element.nodes.find(item => item.id === hovered.nodeId)
  if (!node) return
  // The selected node already has its own (stronger) outline.
  if (selectedMindMapElement.value === element && selectedMindMapNodeId.value === node.id) return
  const s = getMindMapScale(element)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  applyMindMapElementTransform(ctx, element)
  ctx.strokeStyle = 'rgba(66,133,244,.65)'
  ctx.lineWidth = 1.8 / scale.value
  drawRoundRectPath(ctx, node.x - 3 * s, node.y - 3 * s, node.width + 6 * s, node.height + 6 * s, 10 * s)
  ctx.stroke()
  ctx.restore()
}

function drawMindMapDragPreview(ctx: CanvasRenderingContext2D) {
  const drag = selection.getNodeDragPreview()
  if (!drag?.active) return
  const element = drag.element
  const node = element.nodes.find(item => item.id === drag.nodeId)
  if (!node) return
  const s = getMindMapScale(element)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  applyMindMapElementTransform(ctx, element)

  const target = drag.target
  if (target) {
    const parent = element.nodes.find(item => item.id === target.parentId)
    if (parent) {
      // Highlight the future parent…
      ctx.strokeStyle = '#f9ab00'
      ctx.lineWidth = 2.2 / scale.value
      drawRoundRectPath(ctx, parent.x - 4 * s, parent.y - 4 * s, parent.width + 8 * s, parent.height + 8 * s, 12 * s)
      ctx.stroke()
      // …and where among its children the node will land.
      const siblings = getMindMapChildren(element, parent.id)
        .filter(child => child.id !== drag.nodeId)
        .filter(child => target.parentId !== 'root' || (child.branch || 'right') === target.branch)
      const anchorX = target.branch === 'left' ? parent.x - 30 * s : parent.x + parent.width + 30 * s
      let indicatorY: number
      if (siblings.length === 0) indicatorY = parent.y + parent.height / 2
      else if (target.index >= siblings.length) {
        const last = siblings[siblings.length - 1]
        indicatorY = last.y + last.height + 10 * s
      } else if (target.index === 0) indicatorY = siblings[0].y - 10 * s
      else {
        const above = siblings[target.index - 1]
        const below = siblings[target.index]
        indicatorY = (above.y + above.height + below.y) / 2
      }
      ctx.strokeStyle = '#f9ab00'
      ctx.lineWidth = 3 / scale.value
      ctx.beginPath()
      ctx.moveTo(anchorX - 18 * s, indicatorY)
      ctx.lineTo(anchorX + 18 * s, indicatorY)
      ctx.stroke()
    }
  }

  // Ghost of the dragged node following the pointer.
  ctx.globalAlpha = 0.55
  const ghostX = drag.currentLocal.x - node.width / 2
  const ghostY = drag.currentLocal.y - node.height / 2
  ctx.fillStyle = node.color || '#ffffff'
  drawRoundRectPath(ctx, ghostX, ghostY, node.width, node.height, 8 * s)
  ctx.fill()
  ctx.strokeStyle = target ? '#f9ab00' : 'rgba(32,33,36,.6)'
  ctx.lineWidth = 1.4 / scale.value
  ctx.stroke()
  ctx.restore()
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
  drawSelectedMindMapNodeOverlay(ctx)
}

function drawSelectedMindMapNodeOverlay(ctx: CanvasRenderingContext2D) {
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  if (!element || !node || isMindMapTextEditor.value) return

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.translate(element.x + element.width / 2, element.y + element.height / 2)
  ctx.rotate(degreesToRadians(element.rotation ?? 0))
  ctx.translate(-element.width / 2, -element.height / 2)
  ctx.strokeStyle = '#4285f4'
  ctx.lineWidth = 2.4 / scale.value
  ctx.setLineDash([])
  drawRoundRectPath(ctx, node.x - 5 / scale.value, node.y - 5 / scale.value, node.width + 10 / scale.value, node.height + 10 / scale.value, 14)
  ctx.stroke()
  ctx.restore()
}

function drawRoundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
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

// —— mini map ——

const MINI_MAP_REPAINT_MS = 160
let miniMapTimer: number | null = null
let miniMapLastPaint = 0

/** The mini map redraws every stroke, so it repaints at most ~6 fps. */
function requestMiniMapRender() {
  const now = performance.now()
  const elapsed = now - miniMapLastPaint
  if (elapsed >= MINI_MAP_REPAINT_MS) {
    miniMapLastPaint = now
    renderMiniMap()
    return
  }
  if (miniMapTimer !== null) return
  miniMapTimer = window.setTimeout(() => {
    miniMapTimer = null
    miniMapLastPaint = performance.now()
    renderMiniMap()
  }, MINI_MAP_REPAINT_MS - elapsed)
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
  drawStrokes(ctx, allStrokes.value, drawOptions)
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
  const rect = wrap.getBoundingClientRect()
  const cssWidth = Math.max(1, Math.round(rect.width))
  const cssHeight = Math.max(1, Math.round(rect.height))
  const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr))
  const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight
  canvas.style.width = cssWidth + 'px'
  canvas.style.height = cssHeight + 'px'
  invalidateScene()
  renderFrame()
}

// —— pointer events ——

/** Mind-map node / collapse badge under the idle pointer (select tool). */
const hoveredMindMap = ref<{ key: string; nodeId: string; badge: boolean } | null>(null)

function hitTestMindMapBadge(point: Point): { element: MindMapElementData & CanvasStroke; nodeId: string } | null {
  for (const stroke of [...allStrokes.value].reverse()) {
    if (stroke.type !== 'mindmap') continue
    const nodeId = getMindMapBadgeNodeId(stroke, worldToMindMapLocal(point, stroke))
    if (nodeId) return { element: stroke, nodeId }
  }
  return null
}

function updateMindMapHover(worldPoint: Point) {
  let next: { key: string; nodeId: string; badge: boolean } | null = null
  if (currentTool.value === 'select') {
    const badgeHit = hitTestMindMapBadge(worldPoint)
    if (badgeHit) {
      next = { key: elementKey(badgeHit.element), nodeId: badgeHit.nodeId, badge: true }
    } else {
      const nodeHit = hitTestMindMapNode(worldPoint)
      if (nodeHit) next = { key: elementKey(nodeHit.element), nodeId: nodeHit.node.id, badge: false }
    }
  }
  const prev = hoveredMindMap.value
  if (prev?.key === next?.key && prev?.nodeId === next?.nodeId && prev?.badge === next?.badge) return
  hoveredMindMap.value = next
  requestRender()
}

function hitTestMindMapNode(point: Point, element?: CanvasStroke): { element: MindMapElementData & CanvasStroke; node: MindMapNodeData } | null {
  const candidates = element
    ? [element]
    : [...allStrokes.value].reverse()
  for (const stroke of candidates) {
    if (stroke.type !== 'mindmap') continue
    const visibleIds = getVisibleMindMapNodeIds(stroke)
    const local = worldToMindMapLocal(point, stroke)
    for (let i = stroke.nodes.length - 1; i >= 0; i--) {
      const node = stroke.nodes[i]
      if (!visibleIds.has(node.id)) continue
      if (
        local.x >= node.x &&
        local.x <= node.x + node.width &&
        local.y >= node.y &&
        local.y <= node.y + node.height
      ) {
        return { element: stroke, node }
      }
    }
  }
  return null
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

  const badgeHit = currentTool.value === 'select' ? hitTestMindMapBadge(worldPoint) : null
  if (badgeHit) {
    e.preventDefault()
    setSelectedElements([badgeHit.element])
    selectedMindMapNodeId.value = badgeHit.nodeId
    if (toggleMindMapNodeCollapsed(badgeHit.element, badgeHit.nodeId)) {
      notifyStrokesChanged()
      void persist.saveElementTransform(badgeHit.element)
    }
    return
  }

  const nodeHit = currentTool.value === 'select' ? hitTestMindMapNode(worldPoint) : null
  if (nodeHit) {
    e.preventDefault()
    if (nodeHit.node.id === 'root') {
      // Dragging the root moves the whole mind map.
      setSelectedElements([nodeHit.element])
      selectedMindMapNodeId.value = 'root'
      selection.beginTransform('move', worldPoint)
      requestRender()
      return
    }
    selection.beginNodeDrag(nodeHit.element, nodeHit.node.id, worldPoint)
    requestRender()
    return
  }

  const hit = currentTool.value === 'select' ? selection.hitTest(worldPoint) : null
  if (hit) {
    e.preventDefault()
    if (!isElementSelected(hit.element)) setSelectedElements([hit.element])
    if (hit.element.type !== 'mindmap') selectedMindMapNodeId.value = null
    selection.beginTransform(hit.mode, worldPoint)
    requestRender()
    return
  }

  if (currentTool.value === 'select') {
    selection.beginBoxSelect(worldPoint)
    requestRender()
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
      notifyStrokesChanged()
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

  if (isElementTransforming.value) {
    selection.updateTransform(screenToWorld(e.clientX, e.clientY))
    notifyStrokesChanged()
    return
  }

  if (isMindMapNodeDragging.value) {
    // Pure preview: the drag only updates the ghost + drop indicator.
    selection.updateNodeDrag(screenToWorld(e.clientX, e.clientY))
    requestRender()
    return
  }

  if (isBoxSelecting.value) {
    selection.updateBoxSelect(screenToWorld(e.clientX, e.clientY))
    requestRender()
    return
  }

  if (isPanning.value) {
    offsetX.value += e.movementX
    offsetY.value += e.movementY
    invalidateScene()
    requestRender()
    return
  }

  if (isErasing.value) {
    const pt = screenToWorld(e.clientX, e.clientY)
    eraseBetween(lastErasePoint || pt, pt)
    lastErasePoint = pt
    notifyStrokesChanged()
    return
  }

  if (!isDrawing.value || !currentStroke.value) {
    updateMindMapHover(screenToWorld(e.clientX, e.clientY))
    return
  }
  const pt = screenToWorld(e.clientX, e.clientY)
  currentStroke.value.points.push(pt)
  requestRender()
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
    for (const element of selection.endTransform()) {
      void persist.saveElementTransform(element)
    }
    return
  }

  if (isMindMapNodeDragging.value) {
    const drag = selection.endNodeDrag()
    if (drag?.active && drag.target) {
      const element = drag.element
      const before = snapshotMindMap(element)
      if (reattachMindMapNode(element, drag.nodeId, drag.target.parentId, drag.target.index, drag.target.branch)) {
        history.pushMutation(element, before)
        void persist.saveElementTransform(element)
      }
    }
    notifyStrokesChanged()
    return
  }

  if (isBoxSelecting.value) {
    selection.endBoxSelect()
    requestRender()
    return
  }

  if (isErasing.value) {
    isErasing.value = false
    lastErasePoint = null
    void persist.flushPendingEraseChanges()
    return
  }

  if (!isDrawing.value || !currentStroke.value) return
  isDrawing.value = false

  if (currentStroke.value.points.length >= 2) {
    const stroke = createLocalStroke(currentStroke.value, currentPage.value)
    allStrokes.value.push(stroke)
    history.push(stroke)
    void persist.saveStroke(stroke)
  }
  currentStroke.value = null
  notifyStrokesChanged()
}

function onCanvasDoubleClick(e: MouseEvent) {
  if (currentTool.value !== 'select') return
  const worldPoint = screenToWorld(e.clientX, e.clientY)
  const hit = selection.hitTest(worldPoint)
  if (!hit) return

  setSelectedElements([hit.element])
  if (hit.element.type === 'text') {
    beginTextEdit(hit.element)
    return
  }
  if (hit.element.type === 'mindmap') {
    const nodeHit = hitTestMindMapNode(worldPoint, hit.element)
    beginMindMapEdit(hit.element, nodeHit?.node.id)
  }
}

// —— eraser (delete / cut modes) ——

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
  const nextStrokes: CanvasStroke[] = []

  for (const stroke of allStrokes.value) {
    if (!isDrawingStroke(stroke) || stroke.tool === 'eraser' || !strokeIntersectsEraser(stroke, from, to, radius)) {
      nextStrokes.push(stroke)
      continue
    }

    removedKeys.add(elementKey(stroke))
    if (stroke.id) persist.queueEraseId(stroke.id, stroke.page ?? currentPage.value)
    else persist.markUnsavedStrokeDiscarded(stroke)
  }

  if (removedKeys.size === 0) return
  allStrokes.value = nextStrokes
  history.removeByKeys(removedKeys)
  if (selectedElementKeys.value.some(key => removedKeys.has(key))) clearSelection()
  persist.persistPendingMirror()
}

function eraseCutSegmentsBetween(from: Point, to: Point) {
  const radius = Math.max(1, currentWidth.value / 2)
  const removedKeys = new Set<string>()
  const nextStrokes: CanvasStroke[] = []
  let changed = false

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
    changed = true

    if (segments.length === 0) {
      removedKeys.add(elementKey(stroke))
      if (stroke.id) persist.queueEraseId(stroke.id, stroke.page ?? currentPage.value)
      else persist.markUnsavedStrokeDiscarded(stroke)
      continue
    }

    applyStrokeSegment(stroke, segments[0])
    nextStrokes.push(stroke)
    if (stroke.id) persist.queueEraseUpdate(elementKey(stroke))
    // An unsaved stroke whose POST is in flight was sent with the
    // untrimmed points — queue a transform resave for the trimmed shape.
    else if (stroke.pending) void persist.saveElementTransform(stroke)

    for (let i = 1; i < segments.length; i++) {
      const splitStroke = createSplitStroke(stroke, segments[i])
      nextStrokes.push(splitStroke)
      history.push(splitStroke)
      void persist.saveStroke(splitStroke)
    }
  }

  if (!changed) return
  allStrokes.value = nextStrokes
  history.removeByKeys(removedKeys)
  if (selectedElementKeys.value.some(key => removedKeys.has(key))) clearSelection()
  persist.persistPendingMirror()
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

// —— insert: text / mind map ——

function chooseImage() {
  fileInputRef.value?.click()
}

function insertText() {
  setTool('text')
}

function insertMindMap() {
  const rect = canvasRef.value?.getBoundingClientRect()
  const centerX = ((rect?.width || 800) / 2 - offsetX.value) / scale.value
  const centerY = ((rect?.height || 600) / 2 - offsetY.value) / scale.value
  const mindmap = createLocalStroke(createDrawnixMindMapTemplate(centerX, centerY), currentPage.value)

  allStrokes.value.push(mindmap)
  history.push(mindmap)
  setTool('select')
  setSelectedElements([mindmap])
  selectedMindMapNodeId.value = 'root'
  void persist.saveStroke(mindmap)
  notifyStrokesChanged()
  // Jump straight into naming the root — the usual first action.
  beginMindMapEdit(mindmap, 'root')
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
  clearSelection()
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

// Pre-edit snapshot of the mind map being inline-edited. Typing mutates the
// node live (so it grows in place); Escape / empty commit restores this.
let mindMapEditState: { element: CanvasStroke; before: CanvasStroke } | null = null

function beginMindMapEdit(element: CanvasStroke, nodeId = selectedMindMapNodeId.value || 'root') {
  if (element.type !== 'mindmap') return
  const node = element.nodes.find(item => item.id === nodeId) || element.nodes.find(item => item.id === 'root') || element.nodes[0]
  if (!node) return
  selectedMindMapNodeId.value = node.id
  mindMapEditState = { element, before: cloneElement(element) }
  const world = mindMapLocalToWorld(element, { x: node.x, y: node.y })
  beginTextEditState({
    key: `${elementKey(element)}::${node.id}`,
    text: node.text,
    x: world.x,
    y: world.y,
    width: node.width,
    height: node.height,
    rotation: element.rotation ?? 0,
    fontSize: element.fontSize,
    color: node.id === 'root' ? '#ffffff' : '#202124',
    align: 'center',
    bold: node.id === 'root',
    italic: false,
  })
  requestRender()
}

function onTextEditorInputWrapped(e: Event) {
  onTextEditorInput(e)
  syncMindMapEditorBox()
}

/**
 * Live in-place editing: mirror the draft into the node, let it grow (and
 * the layout shift) as you type, and keep the textarea glued to the node's
 * box. The pre-edit snapshot makes this safely cancellable.
 */
function syncMindMapEditorBox() {
  const editor = textEditor.value
  const info = editingMindMapInfo.value
  if (!editor || !info) return
  const { element, node } = info
  const s = getMindMapScale(element)
  node.text = editor.text
  const ctx = canvasRef.value?.getContext('2d')
  if (ctx) {
    const isRoot = node.id === 'root'
    const fontSize = isRoot ? element.fontSize + 1 : element.fontSize
    ctx.save()
    ctx.font = `${isRoot ? 700 : 600} ${fontSize}px ${TEXT_FONT_FAMILY}`
    const widest = editor.text.split(/\r?\n/).reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0)
    ctx.restore()
    node.width = Math.max(node.width, Math.min(260 * s, widest + 26 * s))
  }
  fitMindMapNodeHeight(element, node)
  layoutMindMap(element)
  const world = mindMapLocalToWorld(element, { x: node.x, y: node.y })
  editor.x = world.x
  editor.y = world.y
  editor.width = node.width
  editor.height = node.height
  notifyStrokesChanged()
}

/** Escape or empty commit: restore the pre-edit snapshot. */
function onTextEditorCancelled() {
  const state = mindMapEditState
  mindMapEditState = null
  if (!state) return
  const element = state.element
  if (!allStrokes.value.includes(element)) return
  Object.assign(element, cloneElement(state.before), {
    id: element.id,
    localId: element.localId,
    created_at: element.created_at,
    page: element.page,
    pending: element.pending,
    failed: element.failed,
    retryCount: element.retryCount,
    retryTimer: element.retryTimer,
    transformRetryTimer: element.transformRetryTimer,
  })
  notifyStrokesChanged()
}

function editSelectedMindMapNode() {
  const element = selectedMindMapElement.value
  if (!element) return
  beginMindMapEdit(element, selectedMindMapNodeId.value || 'root')
}

function addMindMapChild() {
  const element = selectedMindMapElement.value
  const parent = selectedMindMapNode.value
  if (!element || !parent) return
  if (element.nodes.length >= MINDMAP_MAX_NODES) {
    saveError.value = `思维导图节点最多 ${MINDMAP_MAX_NODES} 个`
    return
  }
  const before = snapshotMindMap(element)
  const node = addMindMapChildNode(element, parent.id)
  if (!node) return
  history.pushMutation(element, before)
  selectedMindMapNodeId.value = node.id
  notifyStrokesChanged()
  void persist.saveElementTransform(element)
  beginMindMapEdit(element, node.id)
}

function addMindMapSibling() {
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  if (!element || !node || node.id === 'root') return
  if (element.nodes.length >= MINDMAP_MAX_NODES) {
    saveError.value = `思维导图节点最多 ${MINDMAP_MAX_NODES} 个`
    return
  }
  const before = snapshotMindMap(element)
  const sibling = addMindMapSiblingNode(element, node.id)
  if (!sibling) return
  history.pushMutation(element, before)
  selectedMindMapNodeId.value = sibling.id
  notifyStrokesChanged()
  void persist.saveElementTransform(element)
  beginMindMapEdit(element, sibling.id)
}

function deleteMindMapNode() {
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  if (!element || !node || node.id === 'root') return
  const before = snapshotMindMap(element)
  selectedMindMapNodeId.value = deleteMindMapNodeById(element, node.id)
  history.pushMutation(element, before)
  notifyStrokesChanged()
  void persist.saveElementTransform(element)
}

function toggleSelectedMindMapCollapse() {
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  if (!element || !node) return
  if (!toggleMindMapNodeCollapsed(element, node.id)) return
  notifyStrokesChanged()
  void persist.saveElementTransform(element)
}

/**
 * Persistence side of text editor commits. The composable handles open
 * / type / commit-or-cancel; we just receive a finalized commit and
 * either patch an existing text stroke or create a new one.
 */
async function applyTextEditorCommit(commit: TextEditorCommit) {
  if (commit.mode === 'edit' && commit.key?.includes('::')) {
    const [elementKeyPart, nodeId] = commit.key.split('::')
    const element = allStrokes.value.find(stroke => elementKey(stroke) === elementKeyPart)
    if (element?.type === 'mindmap') {
      const node = element.nodes.find(item => item.id === nodeId)
      if (node) {
        const editState = mindMapEditState
        mindMapEditState = null
        node.text = commit.text
        fitMindMapNodeHeight(element, node)
        layoutMindMap(element)
        if (editState?.element === element) {
          const changed = JSON.stringify(persistableStroke(element)) !== JSON.stringify(persistableStroke(editState.before))
          if (changed) {
            history.pushMutation(element, editState.before)
            void persist.saveElementTransform(element)
          }
        } else {
          // No snapshot (defensive): persist without an undo entry.
          void persist.saveElementTransform(element)
        }
        notifyStrokesChanged()
        setSelectedElements([element])
        selectedMindMapNodeId.value = node.id
      }
    }
    return
  }

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
      notifyStrokesChanged()
      await persist.saveElementTransform(element)
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
  history.push(element)
  currentTool.value = 'select'
  setSelectedElements([element])
  void persist.saveStroke(element)
  showTransientStatus('文本已添加')
  notifyStrokesChanged()
}

function measureInsertedText(text = '', fontSize = DEFAULT_TEXT_FONT_SIZE, width = DEFAULT_TEXT_WIDTH, bold = false, italic = false) {
  return measureTextBox(canvasRef.value?.getContext('2d'), text, fontSize, width, bold, italic)
}

// —— image / pdf upload ——

function onImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = firstImageFile(input.files)
  if (file) void addImageFile(file)
  input.value = ''
}

function onPdfFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = firstPdfFile(input.files)
  if (file) void addPdfFile(file)
  input.value = ''
}

function onImageDrop(e: DragEvent) {
  // Reuses the image-drop handler for PDFs too — the canvas only has
  // one drop zone, so we sniff the file type and route accordingly.
  const files = e.dataTransfer?.files || null
  const pdf = firstPdfFile(files)
  if (pdf) {
    void addPdfFile(pdf)
    return
  }
  const image = firstImageFile(files)
  if (!image) return
  void addImageFile(image)
}

function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files || null
  const pdf = firstPdfFile(files)
  if (pdf) {
    e.preventDefault()
    void addPdfFile(pdf)
    return
  }
  const image = firstImageFile(files)
  if (!image) return
  e.preventDefault()
  void addImageFile(image)
}

function firstImageFile(files: FileList | null): File | null {
  if (!files) return null
  return Array.from(files).find(file => file.type.startsWith('image/')) || null
}

function firstPdfFile(files: FileList | null): File | null {
  if (!files) return null
  return Array.from(files).find(file => file.type === 'application/pdf') || null
}

function choosePdf() {
  pdfInputRef.value?.click()
}

async function addImageFile(file: File) {
  if (!file.type.startsWith('image/')) return
  if (file.size > 5 * 1024 * 1024) {
    saveError.value = '图片不能超过 5MB'
    return
  }

  saveError.value = '图片上传中'
  try {
    const [size, asset] = await Promise.all([readImageSize(file), uploadAsset(file, 'image')])
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
    history.push(image)
    setTool('select')
    setSelectedElements([image])
    void persist.saveStroke(image)
    showTransientStatus('图片已添加')
    notifyStrokesChanged()
  } catch (err) {
    saveError.value = `添加图片失败：${err instanceof Error && err.message ? err.message : '未知错误'}`
  }
}

/**
 * Upload through the shared assets endpoint. The form field name tells the
 * server which asset kind (size cap + allowed mime types) to apply.
 */
async function uploadAsset(file: File, field: 'image' | 'pdf'): Promise<UploadedImageAsset> {
  const form = new FormData()
  form.append(field, file)
  const res = await fetch(`/api/projects/${props.boardSlug}/assets`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json() as { error?: string }
      if (data.error) message = data.error
    } catch { /* non-JSON error body; keep the status text */ }
    throw new Error(message)
  }
  return res.json()
}

async function addPdfFile(file: File) {
  if (file.type !== 'application/pdf') return
  if (file.size > 10 * 1024 * 1024) {
    saveError.value = 'PDF 不能超过 10MB'
    return
  }

  saveError.value = 'PDF 解析中'
  try {
    // Probe locally first so we know page count + dimensions BEFORE
    // committing to a network upload. A corrupt PDF fails fast here.
    const arrayBuffer = await file.arrayBuffer()
    const metadata = await probePdf(arrayBuffer.slice(0))
    saveError.value = 'PDF 上传中'
    const asset = await uploadAsset(file, 'pdf')

    const PAGE_GAP = 24
    // Cap the inserted PDF so it fits within the current viewport on
    // BOTH axes. A portrait page would otherwise overflow vertically
    // even with a moderate width cap.
    const canvas = canvasRef.value
    const rect = canvas?.getBoundingClientRect()
    const viewportWidth = (rect?.width || 800) / scale.value
    const viewportHeight = (rect?.height || 600) / scale.value
    const naturalFirstHeight = metadata.pageHeights[0] ?? metadata.pageWidth
    const fitScale = Math.min(
      1,
      (viewportWidth * 0.7) / metadata.pageWidth,
      (viewportHeight * 0.85) / naturalFirstHeight,
    )
    const width = Math.max(120, metadata.pageWidth * fitScale)
    const heightScale = width / metadata.pageWidth
    const pageHeights = metadata.pageHeights.map(h => h * heightScale)
    // Single-page mode: element bounds match the first page. Flipping
    // pages later resizes the element to the new page's height.
    const initialHeight = pageHeights[0] ?? width

    const centerX = ((rect?.width || 800) / 2 - offsetX.value) / scale.value
    const centerY = ((rect?.height || 600) / 2 - offsetY.value) / scale.value
    // Center the page in the viewport (now that it fits both axes).
    const x = centerX - width / 2
    const y = centerY - initialHeight / 2

    const pdfElement = createLocalStroke({
      type: 'pdf',
      src: asset.url,
      x,
      y,
      width,
      height: initialHeight,
      rotation: 0,
      pageCount: metadata.pageCount,
      pageGap: PAGE_GAP,
      pageHeights,
      currentPageIndex: 0,
    }, currentPage.value)

    allStrokes.value.push(pdfElement)
    history.push(pdfElement)
    setTool('select')
    setSelectedElements([pdfElement])
    void persist.saveStroke(pdfElement)
    showTransientStatus(`PDF 已添加 (${metadata.pageCount} 页)`, 1800)
    notifyStrokesChanged()
  } catch (err) {
    saveError.value = `添加 PDF 失败：${err instanceof Error && err.message ? err.message : '未知错误'}`
  }
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

// —— pdf pager ——

// Flip a PDF element to a new page. Single-page mode: each page may
// have its own aspect ratio, but we preserve the user's existing
// stretch by carrying the current vertical scale (element.height /
// pageHeights[currentIdx]) across the flip. So a user who already
// resized the PDF won't see it snap back to the page's natural size
// — only the per-page aspect difference shows up.
// Persisted via the same PATCH path as a regular transform so other
// clients see the flip.
function setPdfPage(element: CanvasStroke, nextIndex: number) {
  if (element.type !== 'pdf') return
  const target = Math.max(0, Math.min(element.pageCount - 1, Math.floor(nextIndex)))
  const currentIdx = element.currentPageIndex ?? 0
  if (target === currentIdx) return
  const currentNominal = element.pageHeights[currentIdx]
  const targetNominal = element.pageHeights[target]
  element.currentPageIndex = target
  if (Number.isFinite(currentNominal) && currentNominal > 0
    && Number.isFinite(targetNominal) && targetNominal > 0) {
    const verticalScale = element.height / currentNominal
    element.height = targetNominal * verticalScale
  }
  notifyStrokesChanged()
  void persist.saveElementTransform(element)
}

function pdfPagerPrev() {
  const pdf = selectedPdfElement.value
  if (!pdf) return
  setPdfPage(pdf, (pdf.currentPageIndex ?? 0) - 1)
}

function pdfPagerNext() {
  const pdf = selectedPdfElement.value
  if (!pdf) return
  setPdfPage(pdf, (pdf.currentPageIndex ?? 0) + 1)
}

function pdfPagerInput(value: string) {
  const pdf = selectedPdfElement.value
  if (!pdf) return
  // User-facing pager is 1-based; data model is 0-based.
  const oneBased = Number.parseInt(value, 10)
  if (!Number.isFinite(oneBased)) return
  setPdfPage(pdf, oneBased - 1)
}

// —— keyboard ——

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (selection.cancelActiveInteraction()) {
      e.preventDefault()
      notifyStrokesChanged()
      return
    }
  }
  if (handleMindMapKeyDown(e)) return
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

function handleMindMapKeyDown(e: KeyboardEvent) {
  if (isEditableKeyboardTarget(e.target)) return false
  const element = selectedMindMapElement.value
  const node = selectedMindMapNode.value
  if (!element || !node) return false

  if (e.key === 'Tab') {
    e.preventDefault()
    addMindMapChild()
    return true
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey || node.id === 'root') addMindMapChild()
    else addMindMapSibling()
    return true
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (node.id === 'root') return false
    e.preventDefault()
    deleteMindMapNode()
    return true
  }

  const direction = e.key === 'ArrowLeft'
    ? 'left'
    : e.key === 'ArrowRight'
      ? 'right'
      : e.key === 'ArrowUp'
        ? 'up'
        : e.key === 'ArrowDown'
          ? 'down'
          : null
  if (direction) {
    const nextId = getNearestMindMapNodeId(element, node.id, direction)
    if (nextId) {
      e.preventDefault()
      selectedMindMapNodeId.value = nextId
      requestRender()
      return true
    }
  }

  return false
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

// —— commands: undo / clear / retry ——

async function undoLastStroke() {
  const entry = history.pop()
  if (!entry) return

  if (entry.kind === 'mutate') {
    const element = entry.element
    if (!allStrokes.value.includes(element)) {
      // The element was deleted in the meantime — skip to the next entry.
      void undoLastStroke()
      return
    }
    // Restore the snapshot's content while keeping the element's current
    // identity and runtime sync state.
    Object.assign(element, cloneElement(entry.before), {
      id: element.id,
      localId: element.localId,
      created_at: element.created_at,
      page: element.page,
      pending: element.pending,
      failed: element.failed,
      retryCount: element.retryCount,
      retryTimer: element.retryTimer,
      transformRetryTimer: element.transformRetryTimer,
    })
    if (element.type === 'mindmap' && selectedMindMapNodeId.value && !element.nodes.some(node => node.id === selectedMindMapNodeId.value)) {
      selectedMindMapNodeId.value = 'root'
    }
    notifyStrokesChanged()
    void persist.saveElementTransform(element)
    return
  }

  const target = entry.stroke
  if (!target.id) {
    allStrokes.value = allStrokes.value.filter(stroke => stroke !== target)
    persist.markUnsavedStrokeDiscarded(target)
    selection.dropKey(elementKey(target))
    notifyStrokesChanged()
    return
  }

  try {
    await api(`/api/projects/${props.boardSlug}/strokes/${target.id}?page=${target.page ?? currentPage.value}`, {
      method: 'DELETE',
    })
    allStrokes.value = allStrokes.value.filter(stroke => stroke.id !== target.id)
    selection.dropKey(elementKey(target))
    notifyStrokesChanged()
  } catch {
    // Deletion failed: keep the entry undoable instead of dropping it.
    history.push(target)
    saveError.value = '撤销失败'
  }
}

function retryFailedSaves() {
  void persist.retryFailedSaves()
}

async function clearBoard() {
  if (!authStore.authed) return
  if (!window.confirm(`确定清空第 ${currentPage.value} 页？`)) return
  try {
    await api(`/api/projects/${props.boardSlug}/strokes?page=${currentPage.value}`, { method: 'DELETE' })
    allStrokes.value = allStrokes.value.filter(stroke => (stroke.pending || stroke.failed) && (stroke.page ?? currentPage.value) === currentPage.value)
    history.clear()
    clearSelection()
    saveError.value = ''
    notifyStrokesChanged()
  } catch {
    saveError.value = '清空失败'
  }
}

// —— pages / share / export ——

async function goToPage(page: number) {
  const nextPage = Math.max(0, Math.min(9999, page))
  if (nextPage === currentPage.value) return
  // Push out anything queued for the page we're leaving, and mirror its
  // unsaved strokes before they're dropped from memory.
  void persist.flushPendingEraseChanges()
  persist.persistPendingMirror()
  currentPage.value = nextPage
  updatePageUrl()
  currentStroke.value = null
  isDrawing.value = false
  isPanning.value = false
  clearSelection()
  history.clear()
  lastSyncedId.value = 0
  resetView()
  await sync.loadExistingStrokes()
  restorePendingForPage(nextPage)
}

/** Re-attach unsaved strokes mirrored in localStorage for this page. */
function restorePendingForPage(page: number) {
  const knownLocalIds = new Set(allStrokes.value.map(stroke => stroke.localId).filter(Boolean))
  const restored = loadPendingStrokes(props.boardSlug, page)
    .filter(stroke => !stroke.localId || !knownLocalIds.has(stroke.localId))
    .map(prepareStrokeForBoard)
  if (restored.length === 0) return
  allStrokes.value.push(...restored)
  notifyStrokesChanged()
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
    showTransientStatus('链接已复制')
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

// —— lifecycle ——

onMounted(async () => {
  await nextTick()
  ensureLegacyClientId()
  readInitialPage()
  resizeCanvas()
  if (wrapRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => resizeCanvas())
    resizeObserver.observe(wrapRef.value)
  }
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('paste', onPaste)
  await authStore.check()

  restorePendingForPage(currentPage.value)
  await sync.loadExistingStrokes()
  connectSocket()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('paste', onPaste)
  if (statusTimer !== null) window.clearTimeout(statusTimer)
  if (miniMapTimer !== null) window.clearTimeout(miniMapTimer)
  if (frameRequest !== null) window.cancelAnimationFrame(frameRequest)
})
</script>
