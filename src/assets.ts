import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IMAGE_MAX_BYTES, serverConfig } from "./config";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export interface SavedImageAsset {
  asset_id: string;
  url: string;
  mime: string;
  size: number;
}

export async function saveImageAsset(boardSlug: string, file: File): Promise<SavedImageAsset> {
  const mime = file.type.toLowerCase();
  const ext = IMAGE_EXTENSIONS[mime];
  if (!ext) throw new Error("INVALID_IMAGE_TYPE");
  if (file.size <= 0 || file.size > IMAGE_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const assetId = `${crypto.randomUUID()}${ext}`;
  const dir = join(serverConfig.assetDir, boardSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, assetId), new Uint8Array(await file.arrayBuffer()));

  return {
    asset_id: assetId,
    url: `/api/projects/${encodeURIComponent(boardSlug)}/assets/${assetId}`,
    mime,
    size: file.size,
  };
}

export async function serveImageAsset(boardSlug: string, assetId: string): Promise<Response> {
  if (!/^[0-9a-f-]+\.(gif|jpe?g|png|webp)$/i.test(assetId)) {
    return new Response(JSON.stringify({ error: "图片不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const file = Bun.file(join(serverConfig.assetDir, boardSlug, assetId));
  if (!(await file.exists())) {
    return new Response(JSON.stringify({ error: "图片不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
