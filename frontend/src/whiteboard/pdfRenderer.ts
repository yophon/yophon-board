/**
 * PDF document loader + per-page renderer.
 *
 * Owns one cache entry per PDF asset URL containing:
 *  - the pdfjs document handle (resolved once)
 *  - per-page rendered canvases (resolved on demand at a base resolution)
 *
 * Pages are rendered at `RENDER_SCALE × pdf.js natural scale` so that they
 * stay crisp when the canvas is zoomed in moderately. For higher zoom
 * levels the cached canvas is just blitted with bilinear filtering;
 * v2 could re-render at higher DPR on demand.
 */
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api'

const RENDER_SCALE = 1.5

export interface PdfPageMetadata {
  width: number
  height: number
}

export interface PdfDocumentMetadata {
  pageCount: number
  /** Width of the widest page (we lay all pages out at the same world width). */
  pageWidth: number
  /** Natural height of each page (after scaling all pages to `pageWidth`). */
  pageHeights: number[]
}

interface PdfCacheEntry {
  state: 'loading' | 'ready' | 'error'
  doc?: PDFDocumentProxy
  metadata?: PdfDocumentMetadata
  /** Per-page rendered canvases at RENDER_SCALE. `null` = not yet started. */
  pages?: (HTMLCanvasElement | 'rendering' | 'error' | null)[]
}

export type PdfCache = Map<string, PdfCacheEntry>

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null

/**
 * Lazy-load pdfjs-dist + configure the worker. The worker is resolved
 * via `?url` so Vite emits a hashed asset and the import is async — the
 * pdfjs bundle (~300 KB) doesn't ship in the initial chunk.
 */
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const [pdfjsLib, workerUrl] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ])
      pdfjsLib.GlobalWorkerOptions.workerSrc = (workerUrl as { default: string }).default
      return pdfjsLib
    })()
  }
  return pdfjsModulePromise
}

/**
 * Inspect a freshly-uploaded PDF (by URL or ArrayBuffer) to extract
 * page count and per-page dimensions. Used at insertion time to size
 * the whiteboard element before saving.
 */
export async function probePdf(input: string | ArrayBuffer): Promise<PdfDocumentMetadata> {
  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument(typeof input === 'string' ? { url: input } : { data: input })
  const doc = await loadingTask.promise
  const metadata = await readMetadata(doc)
  return metadata
}

/**
 * Get-or-create a cache entry. Triggers async loading if not started.
 * The renderer calls this every frame; on cache miss it returns
 * immediately and the caller draws a placeholder until the load
 * completes and `onChange` fires.
 */
export function ensurePdf(cache: PdfCache, src: string, onChange: () => void): PdfCacheEntry {
  const existing = cache.get(src)
  if (existing) return existing

  const entry: PdfCacheEntry = { state: 'loading' }
  cache.set(src, entry)

  void (async () => {
    try {
      const pdfjsLib = await loadPdfjs()
      const doc = await pdfjsLib.getDocument({ url: src }).promise
      entry.doc = doc
      entry.metadata = await readMetadata(doc)
      entry.pages = new Array(doc.numPages).fill(null)
      entry.state = 'ready'
    } catch {
      entry.state = 'error'
    }
    onChange()
  })()

  return entry
}

/**
 * Render the page if it hasn't been rendered yet, then return the canvas
 * synchronously (or `null` if still rendering / errored). Future calls
 * for the same page reuse the cached canvas.
 */
export function getRenderedPage(entry: PdfCacheEntry, pageIndex: number, onChange: () => void): HTMLCanvasElement | null {
  if (entry.state !== 'ready' || !entry.doc || !entry.pages) return null
  const cached = entry.pages[pageIndex]
  if (cached instanceof HTMLCanvasElement) return cached
  if (cached === 'rendering' || cached === 'error') return null

  entry.pages[pageIndex] = 'rendering'
  void renderPageToCanvas(entry.doc, pageIndex + 1)
    .then(canvas => {
      if (entry.pages) entry.pages[pageIndex] = canvas
      onChange()
    })
    .catch(() => {
      if (entry.pages) entry.pages[pageIndex] = 'error'
      onChange()
    })
  return null
}

async function renderPageToCanvas(doc: PDFDocumentProxy, pageNumber: number): Promise<HTMLCanvasElement> {
  const page: PDFPageProxy = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas-2d-unavailable')
  await page.render({ canvasContext: context, viewport, canvas }).promise
  return canvas
}

async function readMetadata(doc: PDFDocumentProxy): Promise<PdfDocumentMetadata> {
  const pageCount = doc.numPages
  // Read pages in parallel — pdfjs serialises internally so this is
  // mostly free to issue.
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => doc.getPage(i + 1)),
  )
  const naturalSizes = pages.map(page => {
    const v = page.getViewport({ scale: 1 })
    return { width: v.width, height: v.height }
  })

  // Layout: every page rendered at the widest page's width; shorter
  // pages get scaled up so they share the same world width. Heights
  // adjust proportionally.
  const pageWidth = Math.max(1, ...naturalSizes.map(s => s.width))
  const pageHeights = naturalSizes.map(s => (s.height / s.width) * pageWidth)
  return { pageCount, pageWidth, pageHeights }
}
