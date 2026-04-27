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
