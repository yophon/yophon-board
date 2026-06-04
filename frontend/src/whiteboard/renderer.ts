import { degreesToRadians } from './geometry'
import { ensurePdf, getRenderedPage, type PdfCache } from './pdfRenderer'
import {
  getTextFont,
  getTextLineHeight,
  getTextPadding,
  wrapTextLines,
} from './textLayout'
import { getMindMapChildren, getVisibleMindMapNodeIds } from './mindmap'
import type { StrokeData } from './types'

interface DrawOptions {
  imageCache: Map<string, HTMLImageElement | 'loading' | 'error'>
  pdfCache: PdfCache
  scheduleRender: () => void
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: (StrokeData & { failed?: boolean })[], options: DrawOptions) {
  for (const stroke of strokes) {
    if (stroke.type === 'image') {
      drawImageElement(ctx, stroke, options)
      continue
    }

    if (stroke.type === 'pdf') {
      drawPdfElement(ctx, stroke, options)
      continue
    }

    if (stroke.type === 'text') {
      drawTextElement(ctx, stroke)
      continue
    }

    if (stroke.type === 'mindmap') {
      drawMindMapElement(ctx, stroke)
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

function drawImageElement(ctx: CanvasRenderingContext2D, image: Extract<StrokeData, { type: 'image' }> & { failed?: boolean }, options: DrawOptions) {
  const cached = options.imageCache.get(image.src)
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
      options.imageCache.set(image.src, 'loading')
      const img = new Image()
      img.onload = () => {
        options.imageCache.set(image.src, img)
        options.scheduleRender()
      }
      img.onerror = () => {
        options.imageCache.set(image.src, 'error')
        options.scheduleRender()
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

function drawPdfElement(
  ctx: CanvasRenderingContext2D,
  pdf: Extract<StrokeData, { type: 'pdf' }> & { failed?: boolean },
  options: DrawOptions,
) {
  const entry = ensurePdf(options.pdfCache, pdf.src, options.scheduleRender)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const rotation = degreesToRadians(pdf.rotation ?? 0)
  ctx.translate(pdf.x + pdf.width / 2, pdf.y + pdf.height / 2)
  ctx.rotate(rotation)

  // Element-local top-left.
  const left = -pdf.width / 2
  const top = -pdf.height / 2

  if (entry.state === 'ready' && entry.metadata) {
    // Single-page mode: render exactly one page filling the element
    // bounds. The host element is resized to that page's aspect when
    // the user flips, so this stays geometrically correct.
    const pageIndex = clampPageIndex(pdf.currentPageIndex ?? 0, pdf.pageCount)
    drawPdfPage(ctx, entry, pageIndex, left, top, pdf.width, pdf.height, options.scheduleRender)
  } else {
    // Loading or error placeholder.
    ctx.fillStyle = entry.state === 'error' ? '#fae0e0' : '#f1f3ed'
    ctx.fillRect(left, top, pdf.width, pdf.height)
    ctx.strokeStyle = entry.state === 'error' ? '#c0392b' : 'rgba(32,33,36,.24)'
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, pdf.width, pdf.height)
    ctx.fillStyle = 'rgba(32,33,36,0.55)'
    ctx.font = '16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(entry.state === 'error' ? 'PDF 加载失败' : 'PDF 加载中…', 0, 0)
  }

  if (pdf.failed) {
    ctx.strokeStyle = 'rgba(234,67,53,.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(left, top, pdf.width, pdf.height)
  }

  ctx.restore()
}

function clampPageIndex(index: number, pageCount: number): number {
  if (!Number.isFinite(index)) return 0
  if (index < 0) return 0
  if (index >= pageCount) return pageCount - 1
  return Math.floor(index)
}

function drawPdfPage(
  ctx: CanvasRenderingContext2D,
  entry: ReturnType<typeof ensurePdf>,
  pageIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  scheduleRender: () => void,
) {
  // Page-coloured background covers the gap-rendering above for that
  // page slot; we want each page to have a clean white surface for
  // legibility regardless of pdfjs background settings.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, width, height)
  const canvas = getRenderedPage(entry, pageIndex, scheduleRender)
  if (canvas) {
    ctx.drawImage(canvas, x, y, width, height)
  }
  ctx.strokeStyle = 'rgba(32,33,36,0.18)'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, height)
}

function drawTextElement(ctx: CanvasRenderingContext2D, text: Extract<StrokeData, { type: 'text' }> & { failed?: boolean }) {
  const padding = getTextPadding(text.fontSize)
  const lineHeight = getTextLineHeight(text.fontSize)
  const align = text.align ?? 'left'
  const contentWidth = Math.max(1, text.width - padding * 2)
  ctx.save()
  ctx.globalAlpha = text.failed ? 0.55 : 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.translate(text.x + text.width / 2, text.y + text.height / 2)
  ctx.rotate(degreesToRadians(text.rotation ?? 0))
  ctx.beginPath()
  ctx.rect(-text.width / 2, -text.height / 2, text.width, text.height)
  ctx.clip()
  ctx.font = getTextFont(text.fontSize, text.bold, text.italic)
  ctx.fillStyle = text.color
  ctx.textAlign = align
  ctx.textBaseline = 'top'

  const lines = wrapTextLines(ctx, text.text, contentWidth)
  const x = align === 'center'
    ? 0
    : align === 'right'
      ? text.width / 2 - padding
      : -text.width / 2 + padding
  let y = -text.height / 2 + padding
  for (const line of lines) {
    if (y > text.height / 2) break
    ctx.fillText(line, x, y)
    y += lineHeight
  }

  if (text.failed) {
    ctx.strokeStyle = 'rgba(234,67,53,.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(-text.width / 2, -text.height / 2, text.width, text.height)
  }

  ctx.restore()
}

function drawMindMapElement(ctx: CanvasRenderingContext2D, mindmap: Extract<StrokeData, { type: 'mindmap' }> & { failed?: boolean }) {
  ctx.save()
  ctx.globalAlpha = mindmap.failed ? 0.55 : 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.translate(mindmap.x + mindmap.width / 2, mindmap.y + mindmap.height / 2)
  ctx.rotate(degreesToRadians(mindmap.rotation ?? 0))
  ctx.translate(-mindmap.width / 2, -mindmap.height / 2)

  const visibleIds = getVisibleMindMapNodeIds(mindmap)
  const nodes = new Map(mindmap.nodes.filter(node => visibleIds.has(node.id)).map(node => [node.id, node]))
  ctx.lineWidth = 2.8
  ctx.lineCap = 'round'
  for (const edge of mindmap.edges) {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to) continue
    const toLeft = (to.branch || 'right') === 'left'
    const fromX = from.id === 'root' ? (toLeft ? from.x : from.x + from.width) : (toLeft ? from.x : from.x + from.width)
    const fromY = from.y + from.height / 2
    const toX = toLeft ? to.x + to.width : to.x
    const toY = to.y + to.height / 2
    const bend = Math.max(42, Math.abs(toX - fromX) * 0.46)
    ctx.strokeStyle = edge.stroke || (toLeft ? '#5b8def' : '#37a86b')
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.bezierCurveTo(
      fromX + (toX >= fromX ? bend : -bend),
      fromY,
      toX - (toX >= fromX ? bend : -bend),
      toY,
      toX,
      toY,
    )
    ctx.stroke()
  }

  for (const node of mindmap.nodes) {
    if (!visibleIds.has(node.id)) continue
    const isRoot = node.id === 'root'
    const radius = isRoot ? 18 : 8
    ctx.shadowColor = 'rgba(32,33,36,.12)'
    ctx.shadowBlur = isRoot ? 12 : 7
    ctx.shadowOffsetY = isRoot ? 4 : 2
    ctx.fillStyle = node.color || (isRoot ? '#202124' : '#ffffff')
    roundRect(ctx, node.x, node.y, node.width, node.height, radius)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    ctx.strokeStyle = isRoot ? '#202124' : (node.branch === 'left' ? 'rgba(91,141,239,.35)' : 'rgba(55,168,107,.34)')
    ctx.lineWidth = isRoot ? 0 : 1.2
    if (!isRoot) ctx.stroke()

    ctx.fillStyle = isRoot ? '#ffffff' : '#202124'
    ctx.font = `${isRoot ? 700 : 600} ${isRoot ? mindmap.fontSize + 1 : mindmap.fontSize}px "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = wrapTextLines(ctx, node.text, Math.max(1, node.width - 22)).slice(0, 2)
    const lineHeight = mindmap.fontSize * 1.2
    const startY = node.y + node.height / 2 - ((lines.length - 1) * lineHeight) / 2
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], node.x + node.width / 2, startY + i * lineHeight)
    }

    drawMindMapCollapseBadge(ctx, mindmap, node)
  }

  if (mindmap.failed) {
    ctx.strokeStyle = 'rgba(234,67,53,.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, mindmap.width, mindmap.height)
  }

  ctx.restore()
}

function drawMindMapCollapseBadge(
  ctx: CanvasRenderingContext2D,
  mindmap: Extract<StrokeData, { type: 'mindmap' }>,
  node: Extract<StrokeData, { type: 'mindmap' }>['nodes'][number],
) {
  const childCount = getMindMapChildren(mindmap, node.id).length
  if (childCount === 0) return
  const branch = node.branch || 'right'
  const cx = branch === 'left' ? node.x - 10 : node.x + node.width + 10
  const cy = node.y + node.height / 2
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = branch === 'left' ? '#5b8def' : '#37a86b'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.strokeStyle = '#202124'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(cx - 4, cy)
  ctx.lineTo(cx + 4, cy)
  if (node.collapsed) {
    ctx.moveTo(cx, cy - 4)
    ctx.lineTo(cx, cy + 4)
  }
  ctx.stroke()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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
