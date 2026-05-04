import { degreesToRadians } from './geometry'
import { ensurePdf, getRenderedPage, type PdfCache } from './pdfRenderer'
import {
  getTextFont,
  getTextLineHeight,
  getTextPadding,
  wrapTextLines,
} from './textLayout'
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

  // Within element-local space the top-left corner is (-w/2, -h/2).
  // Pages are stacked vertically with `pageGap` between them.
  const left = -pdf.width / 2
  const top = -pdf.height / 2

  if (entry.state === 'ready' && entry.metadata) {
    let cursorY = top
    for (let i = 0; i < pdf.pageCount; i++) {
      const pageHeight = pdf.pageHeights[i] ?? pdf.height / pdf.pageCount
      drawPdfPage(ctx, entry, i, left, cursorY, pdf.width, pageHeight, options.scheduleRender)
      cursorY += pageHeight
      if (i < pdf.pageCount - 1 && pdf.pageGap > 0) {
        // Gap between pages: subtle dashed separator hints "annotation strip"
        ctx.save()
        ctx.fillStyle = 'rgba(247,248,245,0.7)'
        ctx.fillRect(left, cursorY, pdf.width, pdf.pageGap)
        ctx.strokeStyle = 'rgba(32,33,36,0.16)'
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(left + 6, cursorY + pdf.pageGap / 2)
        ctx.lineTo(left + pdf.width - 6, cursorY + pdf.pageGap / 2)
        ctx.stroke()
        ctx.restore()
        cursorY += pdf.pageGap
      }
    }
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
