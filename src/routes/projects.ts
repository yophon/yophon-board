import { Elysia, t } from "elysia";
import type { Database } from "bun:sqlite";
import { BOARD_API_PREFIXES } from "../config";
import {
  clearBoardPage,
  createStroke,
  deleteOwnStroke,
  deleteStrokes,
  ensureBoard,
  getBoard,
  getStrokes,
  listBoards,
  updateStroke,
} from "../db";
import {
  badRequest,
  ensureClientId,
  getClientKey,
  parseId,
  parsePage,
  toPublicBoard,
  toPublicStroke,
  tooManyRequests,
  type CookieJar,
} from "../http";
import type { SlidingWindowRateLimiter } from "../rateLimit";
import { normalizeStrokeData } from "../stroke";
import type { BoardHub } from "../wsHub";
import { isAuthed } from "./auth";

export interface ProjectRouteDeps {
  db: Database;
  hub: BoardHub;
  writeLimiter: SlidingWindowRateLimiter;
}

const createBoardBody = t.Object({
  slug: t.String(),
  title: t.Optional(t.String()),
});

const strokeBody = t.Object({
  stroke_data: t.String(),
  local_id: t.String(),
  client_id: t.Optional(t.String()),
  page: t.Optional(t.Number()),
});

const eraseBody = t.Object({
  ids: t.Array(t.Number()),
  page: t.Optional(t.Number()),
});

const updateBody = t.Object({
  stroke_data: t.String(),
  page: t.Optional(t.Number()),
});

/**
 * Board/page/stroke routes. The same handlers are registered under both
 * /api/projects and /api/boards (legacy alias), so there is exactly one
 * implementation per operation.
 */
export function createProjectRoutes({ db, hub, writeLimiter }: ProjectRouteDeps) {
  function listProjects() {
    return listBoards(db).map(toPublicBoard);
  }

  function getOrCreateProject(slug: string) {
    return toPublicBoard(ensureBoard(db, slug));
  }

  function createProject(payload: { slug: string; title?: string }) {
    return toPublicBoard(ensureBoard(db, payload.slug, payload.title));
  }

  function listProjectStrokes(slug: string, query: Record<string, unknown>) {
    const board = getBoard(db, slug);
    if (!board) return [];
    const sinceRaw = Number(query.since ?? 0);
    const sinceId = Number.isInteger(sinceRaw) && sinceRaw >= 0 ? sinceRaw : 0;
    return getStrokes(db, board.id, parsePage(query.page), sinceId).map(toPublicStroke);
  }

  function saveProjectStroke(slug: string, body: unknown, request: Request, cookie: CookieJar) {
    const clientKey = getClientKey(request);
    if (writeLimiter.hit(`stroke:${clientKey}`)) {
      return tooManyRequests("提交过于频繁，请稍后再试");
    }

    const payload = body as { stroke_data: string; local_id: string; page?: number };
    const localId = payload.local_id?.trim();
    if (!localId || localId.length > 120) {
      return badRequest("缺少客户端笔画标识");
    }
    const clientId = ensureClientId(cookie, request);

    const page = parsePage(payload.page);
    const normalized = normalizeStrokeData(payload.stroke_data);
    if (!normalized.ok) return badRequest(normalized.message);

    const board = ensureBoard(db, slug);
    const row = createStroke(db, board.id, page, clientId, localId, normalized.value);
    const publicRow = toPublicStroke(row);
    hub.broadcast(board.slug, { type: "stroke-created", stroke: publicRow, local_id: localId, page });
    return publicRow;
  }

  function deleteOwnProjectStroke(slug: string, strokeId: string, query: Record<string, unknown>, request: Request, cookie: CookieJar) {
    const board = getBoard(db, slug);
    if (!board) return badRequest("白板不存在");
    const page = parsePage(query.page);
    const clientId = ensureClientId(cookie, request);

    const id = parseId(strokeId);
    const deleted = deleteOwnStroke(db, board.id, id, page, clientId);
    if (!deleted) return badRequest("无法撤销此笔画");
    hub.broadcast(board.slug, { type: "stroke-deleted", id, page });
    return { ok: true };
  }

  function eraseProjectStrokes(slug: string, body: unknown, request: Request) {
    const clientKey = getClientKey(request);
    if (writeLimiter.hit(`erase:${clientKey}`)) {
      return tooManyRequests("提交过于频繁，请稍后再试");
    }

    const board = getBoard(db, slug);
    if (!board) return badRequest("白板不存在");
    const page = parsePage((body as { page?: number }).page);
    const ids = Array.from(new Set(((body as { ids?: unknown[] }).ids || [])
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0)
      .slice(0, 100)));
    if (ids.length === 0) return { ok: true, deleted_ids: [] };

    const deleted = deleteStrokes(db, board.id, page, ids);
    for (const id of deleted) {
      hub.broadcast(board.slug, { type: "stroke-deleted", id, page });
    }
    return { ok: true, deleted_ids: deleted };
  }

  function updateProjectStroke(slug: string, strokeId: string, body: unknown, query: Record<string, unknown>, request: Request) {
    const clientKey = getClientKey(request);
    if (writeLimiter.hit(`update:${clientKey}`)) {
      return tooManyRequests("提交过于频繁，请稍后再试");
    }

    const board = getBoard(db, slug);
    if (!board) return badRequest("白板不存在");
    const id = parseId(strokeId);
    const page = parsePage((body as { page?: number }).page ?? query.page);
    const normalized = normalizeStrokeData((body as { stroke_data?: string }).stroke_data || "");
    if (!normalized.ok) return badRequest(normalized.message);

    const row = updateStroke(db, board.id, id, page, normalized.value);
    if (!row) return badRequest("无法更新此元素");
    const publicRow = toPublicStroke(row);
    hub.broadcast(board.slug, { type: "stroke-updated", stroke: publicRow, page });
    return publicRow;
  }

  function clearProjectPage(slug: string, query: Record<string, unknown>) {
    const board = getBoard(db, slug);
    if (!board) return badRequest("白板不存在");
    const page = parsePage(query.page);
    clearBoardPage(db, board.id, page);
    hub.broadcast(board.slug, { type: "strokes-cleared", page });
    return { ok: true };
  }

  const app = new Elysia({ name: "routes/projects" });

  for (const prefix of BOARD_API_PREFIXES) {
    // Historical quirk we must preserve: POST /api/projects rejects an
    // existing slug with 400, while the legacy POST /api/boards keeps its
    // idempotent "ensure" semantics and returns the existing board.
    const rejectDuplicateSlug = prefix === "/api/projects";

    app
      .get(prefix, () => listProjects())
      .post(prefix, ({ body, cookie, set }) => {
        if (!isAuthed(db, cookie)) {
          set.status = 401;
          return { error: "未授权，请先登录" };
        }
        const payload = body as { slug: string; title?: string };
        if (rejectDuplicateSlug && getBoard(db, payload.slug)) {
          return badRequest("项目标识已存在");
        }
        return createProject(payload);
      }, {
        body: createBoardBody,
      })
      .get(`${prefix}/:slug`, ({ params }) => getOrCreateProject(params.slug))
      .get(`${prefix}/:slug/strokes`, ({ params, query }) => listProjectStrokes(params.slug, query))
      .post(`${prefix}/:slug/strokes`, ({ params, body, request, cookie }) => {
        return saveProjectStroke(params.slug, body, request, cookie);
      }, {
        body: strokeBody,
      })
      .post(`${prefix}/:slug/strokes/erase`, ({ params, body, request }) => {
        return eraseProjectStrokes(params.slug, body, request);
      }, {
        body: eraseBody,
      })
      .delete(`${prefix}/:slug/strokes/:id`, ({ params, query, request, cookie }) => {
        return deleteOwnProjectStroke(params.slug, params.id, query, request, cookie);
      })
      .patch(`${prefix}/:slug/strokes/:id`, ({ params, body, query, request }) => {
        return updateProjectStroke(params.slug, params.id, body, query, request);
      }, {
        body: updateBody,
      })
      .delete(`${prefix}/:slug/strokes`, ({ params, query, cookie, set }) => {
        if (!isAuthed(db, cookie)) {
          set.status = 401;
          return { error: "未授权，请先登录" };
        }
        return clearProjectPage(params.slug, query);
      });
  }

  return app;
}
