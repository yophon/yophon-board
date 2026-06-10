import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IMAGE_MAX_BYTES, PDF_MAX_BYTES, serverConfig } from "./config";
import { AppError } from "./errors";
import type { UploadedAsset } from "../shared/types";

interface AssetKindConfig {
  /** Mime → file extension. The extension determines the on-disk file name. */
  extensions: Record<string, string>;
  /** Server-side size cap in bytes. */
  maxBytes: number;
  /** Regex matching allowed file extensions when serving back. */
  servePattern: RegExp;
}

const IMAGE_CONFIG: AssetKindConfig = {
  extensions: {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  },
  maxBytes: IMAGE_MAX_BYTES,
  servePattern: /^[0-9a-f-]+\.(?:gif|jpe?g|png|webp)$/i,
};

const PDF_CONFIG: AssetKindConfig = {
  extensions: {
    "application/pdf": ".pdf",
  },
  maxBytes: PDF_MAX_BYTES,
  servePattern: /^[0-9a-f-]+\.pdf$/i,
};

const SERVE_PATTERN_ANY = /^[0-9a-f-]+\.(?:gif|jpe?g|png|webp|pdf)$/i;

export type AssetKind = "image" | "pdf";

/** Upload response — the shared wire type with `kind` made required. */
export type SavedAsset = UploadedAsset & { kind: AssetKind };

/**
 * Magic-byte signatures per allowed mime type. The declared mime (which Bun
 * derives from the upload's file name) must match the actual file content,
 * so a renamed `.txt` can't masquerade as a PNG.
 */
const MAGIC_BYTE_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/png": (bytes) => hasBytePrefix(bytes, [0x89, 0x50, 0x4e, 0x47]),
  "image/jpeg": (bytes) => hasBytePrefix(bytes, [0xff, 0xd8, 0xff]),
  "image/gif": (bytes) => hasAsciiAt(bytes, "GIF8", 0),
  "image/webp": (bytes) => hasAsciiAt(bytes, "RIFF", 0) && hasAsciiAt(bytes, "WEBP", 8),
  "application/pdf": (bytes) => hasAsciiAt(bytes, "%PDF-", 0),
};

/** Whether `bytes` start with the file signature expected for `mime`. */
export function matchesMagicBytes(bytes: Uint8Array, mime: string): boolean {
  return MAGIC_BYTE_CHECKS[mime]?.(bytes) ?? false;
}

const invalidAssetType = (kind: AssetKind) =>
  new AppError(400, kind === "pdf" ? "仅支持 PDF 文件" : "仅支持 PNG、JPEG、WebP、GIF 图片");

const assetTooLarge = (kind: AssetKind) =>
  new AppError(400, kind === "pdf" ? "PDF 不能超过 10MB" : "图片不能超过 5MB");

/**
 * Persist an uploaded file. `kind` selects which mime/size policy to apply.
 * Throws an AppError (400) on policy violations: unknown mime, magic-byte
 * mismatch, or size out of bounds.
 */
export async function saveAsset(boardSlug: string, file: File, kind: AssetKind): Promise<SavedAsset> {
  const config = kind === "pdf" ? PDF_CONFIG : IMAGE_CONFIG;
  const mime = file.type.toLowerCase();
  const ext = config.extensions[mime];
  if (!ext) throw invalidAssetType(kind);
  if (file.size <= 0 || file.size > config.maxBytes) throw assetTooLarge(kind);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesMagicBytes(bytes, mime)) throw invalidAssetType(kind);

  const assetId = `${crypto.randomUUID()}${ext}`;
  const dir = join(serverConfig.assetDir, boardSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, assetId), bytes);

  return {
    asset_id: assetId,
    url: `/api/projects/${encodeURIComponent(boardSlug)}/assets/${assetId}`,
    mime,
    size: file.size,
    kind,
  };
}

/**
 * Stream an asset back. Validates the asset id against an allow-list of
 * extensions before reading from disk so we never serve arbitrary paths.
 */
export async function serveAsset(boardSlug: string, assetId: string): Promise<Response> {
  if (!SERVE_PATTERN_ANY.test(assetId)) {
    return notFound();
  }

  const file = Bun.file(join(serverConfig.assetDir, boardSlug, assetId));
  if (!(await file.exists())) {
    return notFound();
  }

  const isPdf = /\.pdf$/i.test(assetId);
  return new Response(file, {
    headers: {
      "Content-Type": file.type || (isPdf ? "application/pdf" : "application/octet-stream"),
      "Cache-Control": "public, max-age=31536000, immutable",
      // PDFs are large; let browsers/pdfjs make range requests.
      ...(isPdf ? { "Accept-Ranges": "bytes" } : {}),
    },
  });
}

function notFound() {
  return new Response(JSON.stringify({ error: "资源不存在" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

function hasBytePrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function hasAsciiAt(bytes: Uint8Array, text: string, offset: number): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

// Back-compat aliases — old callers used these names.
export const saveImageAsset = (slug: string, file: File) => saveAsset(slug, file, "image");
export const serveImageAsset = serveAsset;
