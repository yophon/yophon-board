import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IMAGE_MAX_BYTES, PDF_MAX_BYTES, serverConfig } from "./config";

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

export interface SavedAsset {
  asset_id: string;
  url: string;
  mime: string;
  size: number;
  kind: AssetKind;
}

/**
 * Persist an uploaded file. `kind` selects which mime/size policy to apply.
 * Throws `INVALID_ASSET_TYPE` or `ASSET_TOO_LARGE` on policy violations.
 */
export async function saveAsset(boardSlug: string, file: File, kind: AssetKind): Promise<SavedAsset> {
  const config = kind === "pdf" ? PDF_CONFIG : IMAGE_CONFIG;
  const mime = file.type.toLowerCase();
  const ext = config.extensions[mime];
  if (!ext) throw new Error("INVALID_ASSET_TYPE");
  if (file.size <= 0 || file.size > config.maxBytes) throw new Error("ASSET_TOO_LARGE");

  const assetId = `${crypto.randomUUID()}${ext}`;
  const dir = join(serverConfig.assetDir, boardSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, assetId), new Uint8Array(await file.arrayBuffer()));

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

// Back-compat aliases — old callers used these names.
export const saveImageAsset = (slug: string, file: File) => saveAsset(slug, file, "image");
export const serveImageAsset = serveAsset;
