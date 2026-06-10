import { Elysia } from "elysia";
import type { Database } from "bun:sqlite";
import { saveAsset, serveAsset } from "../assets";
import { BOARD_API_PREFIXES } from "../config";
import { ensureBoard, getBoard } from "../db";
import { badRequest, getClientKey, tooManyRequests } from "../http";
import type { SlidingWindowRateLimiter } from "../rateLimit";

export interface AssetRouteDeps {
  db: Database;
  writeLimiter: SlidingWindowRateLimiter;
}

/**
 * Asset upload + serving routes, registered under both /api/projects and
 * the legacy /api/boards alias.
 */
export function createAssetRoutes({ db, writeLimiter }: AssetRouteDeps) {
  async function uploadProjectAsset(slug: string, request: Request) {
    const clientKey = getClientKey(request);
    if (writeLimiter.hit(`asset:${clientKey}`)) {
      return tooManyRequests("提交过于频繁，请稍后再试");
    }

    const form = await request.formData();
    // Accept the legacy `image` key plus the generic `pdf` key. The form
    // field name selects the asset kind; the file's mime type and magic
    // bytes are re-validated against that kind in saveAsset.
    const imageField = form.get("image");
    const pdfField = form.get("pdf");
    const file = pdfField instanceof File ? pdfField : imageField instanceof File ? imageField : null;
    if (!file) return badRequest("缺少上传文件");
    const kind: "pdf" | "image" = pdfField instanceof File ? "pdf" : "image";

    const board = ensureBoard(db, slug);
    return await saveAsset(board.slug, file, kind);
  }

  function getProjectAsset(slug: string, assetId: string) {
    const board = getBoard(db, slug);
    if (!board) return new Response(JSON.stringify({ error: "白板不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
    return serveAsset(board.slug, assetId);
  }

  const app = new Elysia({ name: "routes/assets" });

  for (const prefix of BOARD_API_PREFIXES) {
    app
      .get(`${prefix}/:slug/assets/:assetId`, ({ params }) => getProjectAsset(params.slug, params.assetId))
      .post(`${prefix}/:slug/assets`, ({ params, request }) => uploadProjectAsset(params.slug, request));
  }

  return app;
}
