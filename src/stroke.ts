import { STROKE_MAX_BYTES, STROKE_MAX_POINTS } from "./config";

export type StrokeValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function normalizeStrokeData(raw: string): StrokeValidationResult {
  if (!raw.trim()) return { ok: false, message: "涂鸦数据不能为空" };
  if (raw.length > STROKE_MAX_BYTES) return { ok: false, message: "涂鸦数据过大" };

  let stroke: any;
  try {
    stroke = JSON.parse(raw);
  } catch {
    return { ok: false, message: "涂鸦数据格式不合法" };
  }

  if (stroke?.type === "image") {
    const src = typeof stroke.src === "string" ? stroke.src.trim() : "";
    if (!/^\/api\/(?:projects|boards)\/[a-z0-9-]{1,63}\/assets\/[0-9a-f-]+\.(?:gif|jpe?g|png|webp)$/i.test(src)) {
      return { ok: false, message: "图片地址不合法" };
    }

    const x = Number(stroke.x);
    const y = Number(stroke.y);
    const width = Number(stroke.width);
    const height = Number(stroke.height);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 10 ||
      height < 10 ||
      width > 4096 ||
      height > 4096
    ) {
      return { ok: false, message: "图片尺寸不合法" };
    }

    const normalizedImage = JSON.stringify({
      type: "image",
      src,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      rotation: normalizeRotation(stroke.rotation),
      mime: typeof stroke.mime === "string" ? stroke.mime.slice(0, 80) : undefined,
    });
    if (normalizedImage.length > STROKE_MAX_BYTES) return { ok: false, message: "涂鸦数据过大" };
    return { ok: true, value: normalizedImage };
  }

  if (stroke?.type === "pdf") {
    const src = typeof stroke.src === "string" ? stroke.src.trim() : "";
    if (!/^\/api\/(?:projects|boards)\/[a-z0-9-]{1,63}\/assets\/[0-9a-f-]+\.pdf$/i.test(src)) {
      return { ok: false, message: "PDF 地址不合法" };
    }

    const x = Number(stroke.x);
    const y = Number(stroke.y);
    const width = Number(stroke.width);
    const height = Number(stroke.height);
    const pageCount = Number(stroke.pageCount);
    const pageGap = Number(stroke.pageGap ?? 24);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isInteger(pageCount) ||
      pageCount < 1 ||
      pageCount > 200 ||
      width < 32 ||
      height < 32 ||
      // PDFs can be tall (200 pages × 1100px ≈ 220k); cap generously.
      width > 4096 ||
      height > 320000 ||
      !Number.isFinite(pageGap) ||
      pageGap < 0 ||
      pageGap > 200
    ) {
      return { ok: false, message: "PDF 尺寸不合法" };
    }

    // Per-page heights are optional metadata; without it the renderer
    // treats every page as height/pageCount. When present we validate
    // each entry is a positive number and the array length matches.
    let pageHeights: number[] | undefined;
    if (Array.isArray(stroke.pageHeights)) {
      if (stroke.pageHeights.length !== pageCount) {
        return { ok: false, message: "PDF 页面信息不一致" };
      }
      const heights: number[] = [];
      for (const value of stroke.pageHeights) {
        const h = Number(value);
        if (!Number.isFinite(h) || h <= 0 || h > 6000) {
          return { ok: false, message: "PDF 页面尺寸不合法" };
        }
        heights.push(Math.round(h * 100) / 100);
      }
      pageHeights = heights;
    }

    // 0-based index of the page the client is showing. Optional for
    // back-compat with rows written before single-page mode landed.
    let currentPageIndex: number | undefined;
    if (stroke.currentPageIndex !== undefined && stroke.currentPageIndex !== null) {
      const raw = Number(stroke.currentPageIndex);
      if (!Number.isInteger(raw) || raw < 0 || raw >= pageCount) {
        return { ok: false, message: "PDF 当前页不合法" };
      }
      currentPageIndex = raw;
    }

    const normalizedPdf = JSON.stringify({
      type: "pdf",
      src,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      rotation: normalizeRotation(stroke.rotation),
      pageCount,
      pageGap: Math.round(pageGap),
      pageHeights,
      currentPageIndex,
    });
    if (normalizedPdf.length > STROKE_MAX_BYTES) return { ok: false, message: "涂鸦数据过大" };
    return { ok: true, value: normalizedPdf };
  }

  if (stroke?.type === "text") {
    const text = typeof stroke.text === "string" ? stroke.text.trim().slice(0, 2000) : "";
    if (!text) return { ok: false, message: "文本不能为空" };

    const x = Number(stroke.x);
    const y = Number(stroke.y);
    const width = Number(stroke.width);
    const height = Number(stroke.height);
    const fontSize = Number(stroke.fontSize);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(fontSize) ||
      width < 10 ||
      height < 10 ||
      width > 4096 ||
      height > 4096 ||
      fontSize < 8 ||
      fontSize > 160
    ) {
      return { ok: false, message: "文本尺寸不合法" };
    }

    const color = typeof stroke.color === "string" && /^#[0-9a-fA-F]{6}$/.test(stroke.color)
      ? stroke.color
      : "#202124";
    const normalizedText = JSON.stringify({
      type: "text",
      text,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      rotation: normalizeRotation(stroke.rotation),
      fontSize: Math.round(fontSize * 10) / 10,
      color,
      align: normalizeTextAlign(stroke.align),
      bold: stroke.bold === true,
      italic: stroke.italic === true,
    });
    if (normalizedText.length > STROKE_MAX_BYTES) return { ok: false, message: "涂鸦数据过大" };
    return { ok: true, value: normalizedText };
  }

  if (stroke?.type === "mindmap") {
    const x = Number(stroke.x);
    const y = Number(stroke.y);
    const width = Number(stroke.width);
    const height = Number(stroke.height);
    const fontSize = Number(stroke.fontSize);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(fontSize) ||
      width < 160 ||
      height < 120 ||
      width > 4096 ||
      height > 4096 ||
      fontSize < 10 ||
      fontSize > 72 ||
      !Array.isArray(stroke.nodes) ||
      stroke.nodes.length < 1 ||
      stroke.nodes.length > 40 ||
      !Array.isArray(stroke.edges) ||
      stroke.edges.length > 80
    ) {
      return { ok: false, message: "思维导图尺寸不合法" };
    }

    const nodes: Array<{ id: string; text: string; x: number; y: number; width: number; height: number; color?: string }> = [];
    const nodeIds = new Set<string>();
    for (const rawNode of stroke.nodes) {
      const id = typeof rawNode?.id === "string" ? rawNode.id.trim().slice(0, 40) : "";
      const text = typeof rawNode?.text === "string" ? rawNode.text.trim().slice(0, 120) : "";
      const nodeX = Number(rawNode?.x);
      const nodeY = Number(rawNode?.y);
      const nodeWidth = Number(rawNode?.width);
      const nodeHeight = Number(rawNode?.height);
      if (
        !id ||
        nodeIds.has(id) ||
        !text ||
        !Number.isFinite(nodeX) ||
        !Number.isFinite(nodeY) ||
        !Number.isFinite(nodeWidth) ||
        !Number.isFinite(nodeHeight) ||
        nodeWidth < 24 ||
        nodeHeight < 18 ||
        nodeWidth > width ||
        nodeHeight > height
      ) {
        return { ok: false, message: "思维导图节点不合法" };
      }
      nodeIds.add(id);
      nodes.push({
        id,
        text,
        x: Math.round(nodeX * 100) / 100,
        y: Math.round(nodeY * 100) / 100,
        width: Math.round(nodeWidth * 100) / 100,
        height: Math.round(nodeHeight * 100) / 100,
        color: typeof rawNode?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(rawNode.color) ? rawNode.color : undefined,
      });
    }

    const edges: Array<{ from: string; to: string }> = [];
    for (const rawEdge of stroke.edges) {
      const from = typeof rawEdge?.from === "string" ? rawEdge.from.trim().slice(0, 40) : "";
      const to = typeof rawEdge?.to === "string" ? rawEdge.to.trim().slice(0, 40) : "";
      if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) {
        return { ok: false, message: "思维导图连线不合法" };
      }
      edges.push({ from, to });
    }

    const normalizedMindMap = JSON.stringify({
      type: "mindmap",
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      rotation: normalizeRotation(stroke.rotation),
      fontSize: Math.round(fontSize * 10) / 10,
      nodes,
      edges,
    });
    if (normalizedMindMap.length > STROKE_MAX_BYTES) return { ok: false, message: "涂鸦数据过大" };
    return { ok: true, value: normalizedMindMap };
  }

  const points = stroke?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > STROKE_MAX_POINTS) {
    return { ok: false, message: "涂鸦点位不合法" };
  }

  const tool = stroke.tool === "eraser" ? "eraser" : "pen";
  const width = Number(stroke.width);
  if (!Number.isFinite(width) || width < 1 || width > 80) {
    return { ok: false, message: "画笔粗细不合法" };
  }

  const color = typeof stroke.color === "string" && /^#[0-9a-fA-F]{6}$/.test(stroke.color)
    ? stroke.color
    : "#202124";

  let normalizedPoints: Array<{ x: number; y: number }>;
  try {
    normalizedPoints = points.map((point: any) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("INVALID_POINT");
      return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    });
  } catch {
    return { ok: false, message: "涂鸦点位不合法" };
  }

  const normalized = JSON.stringify({
    points: normalizedPoints,
    color,
    width: Math.round(width * 10) / 10,
    tool,
    opacity: Number.isFinite(Number(stroke.opacity)) ? Math.max(0.05, Math.min(1, Number(stroke.opacity))) : 1,
    blend: stroke.blend === "multiply" ? "multiply" : "normal",
  });

  if (normalized.length > STROKE_MAX_BYTES) return { ok: false, message: "涂鸦数据过大" };
  return { ok: true, value: normalized };
}

function normalizeRotation(value: unknown): number {
  const rotation = Number(value ?? 0);
  if (!Number.isFinite(rotation)) return 0;
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.round(normalized * 100) / 100;
}

function normalizeTextAlign(value: unknown): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}
