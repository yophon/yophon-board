import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import {
  clearBoardPage,
  createAdminSession,
  createStroke,
  deleteAdminSession,
  deleteOwnStroke,
  ensureBoard,
  getBoard,
  getStrokes,
  initDb,
  listBoards,
  normalizeSlug,
  validateAdminSession,
  verifyAdminPassword,
  type BoardRow,
  type StrokeRow,
} from "./db";

const db = initDb();

const SESSION_COOKIE = "yophon_board_session";
const PORT = Number(process.env.PORT || 3020);
const HOST = process.env.HOST || "127.0.0.1";
const APP_ORIGIN = process.env.APP_ORIGIN;
const COOKIE_SECURE = process.env.COOKIE_SECURE;
const PUBLIC_WRITE_LIMIT_MAX = 240;
const PUBLIC_WRITE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 8;
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const INTERNAL_REMOTE_IP_HEADER = "x-yophon-remote-ip";
const STROKE_MAX_BYTES = 20000;
const STROKE_MAX_POINTS = 1000;
const DIST_DIR = existsSync("frontend/dist") ? "frontend/dist" : "public";

type WsData = { boardSlug: string };
const boardClients = new Map<string, Set<Bun.ServerWebSocket<WsData>>>();
const writeAttempts = new Map<string, number[]>();
const loginAttempts = new Map<string, number[]>();

function isAuthed(cookie: Record<string, any>): boolean {
  const sid = cookie[SESSION_COOKIE]?.value;
  return typeof sid === "string" && sid.length > 0 && validateAdminSession(db, sid);
}

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("INVALID_ID");
  return id;
}

function parsePage(value: unknown): number {
  const page = Number(value ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 9999) throw new Error("INVALID_ID");
  return page;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function badRequest(message: string) {
  return jsonError(message, 400);
}

function tooManyRequests(message: string) {
  return jsonError(message, 429);
}

function isTrustedProxyAddress(address: string | null): boolean {
  return !!address && (address === "::1" || address === "::ffff:127.0.0.1" || address.startsWith("127."));
}

function firstForwardedFor(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function getClientKey(request: Request): string {
  const remoteIp = request.headers.get(INTERNAL_REMOTE_IP_HEADER);
  if (isTrustedProxyAddress(remoteIp)) {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    const forwardedFor = firstForwardedFor(request.headers.get("x-forwarded-for"));
    if (forwardedFor) return forwardedFor;
  }
  return remoteIp || "unknown";
}

function shouldUseSecureCookie(request: Request): boolean {
  if (COOKIE_SECURE === "true") return true;
  if (COOKIE_SECURE === "false") return false;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto === "https";
  return new URL(request.url).protocol === "https:";
}

function isRateLimited(store: Map<string, number[]>, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const attempts = (store.get(key) || []).filter((time) => time > cutoff);
  if (attempts.length >= max) {
    store.set(key, attempts);
    return true;
  }
  attempts.push(now);
  store.set(key, attempts);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, times] of writeAttempts) {
    const valid = times.filter((time) => time > now - PUBLIC_WRITE_LIMIT_WINDOW_MS);
    if (valid.length === 0) writeAttempts.delete(key);
    else writeAttempts.set(key, valid);
  }
  for (const [key, times] of loginAttempts) {
    const valid = times.filter((time) => time > now - LOGIN_RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) loginAttempts.delete(key);
    else loginAttempts.set(key, valid);
  }
}, 10 * 60 * 1000);

function normalizeStrokeData(raw: string): string | Response {
  if (!raw.trim()) return badRequest("涂鸦数据不能为空");
  if (raw.length > STROKE_MAX_BYTES) return badRequest("涂鸦数据过大");

  let stroke: any;
  try {
    stroke = JSON.parse(raw);
  } catch {
    return badRequest("涂鸦数据格式不合法");
  }

  const points = stroke?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > STROKE_MAX_POINTS) {
    return badRequest("涂鸦点位不合法");
  }

  const tool = stroke.tool === "eraser" ? "eraser" : "pen";
  const width = Number(stroke.width);
  if (!Number.isFinite(width) || width < 1 || width > 80) {
    return badRequest("画笔粗细不合法");
  }

  const color = typeof stroke.color === "string" && /^#[0-9a-fA-F]{6}$/.test(stroke.color)
    ? stroke.color
    : "#202124";

  const normalizedPoints = points.map((point: any) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("INVALID_POINT");
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });

  const normalized = JSON.stringify({
    points: normalizedPoints,
    color,
    width: Math.round(width * 10) / 10,
    tool,
    opacity: Number.isFinite(Number(stroke.opacity)) ? Math.max(0.05, Math.min(1, Number(stroke.opacity))) : 1,
    blend: stroke.blend === "multiply" ? "multiply" : "normal",
  });

  if (normalized.length > STROKE_MAX_BYTES) return badRequest("涂鸦数据过大");
  return normalized;
}

function toPublicBoard(board: BoardRow) {
  return {
    id: board.id,
    slug: board.slug,
    title: board.title,
    visibility: board.visibility,
    created_at: board.created_at,
  };
}

function toPublicStroke(row: StrokeRow) {
  return {
    id: row.id,
    page: row.page,
    stroke_data: row.stroke_data,
    created_at: row.created_at,
  };
}

function getBoardClients(boardSlug: string): Set<Bun.ServerWebSocket<WsData>> {
  const existing = boardClients.get(boardSlug);
  if (existing) return existing;
  const next = new Set<Bun.ServerWebSocket<WsData>>();
  boardClients.set(boardSlug, next);
  return next;
}

function broadcastBoard(boardSlug: string, message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  const clients = boardClients.get(boardSlug);
  if (!clients) return;
  for (const client of clients) {
    try {
      client.send(payload);
    } catch {
      clients.delete(client);
    }
  }
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (error instanceof Response) return error;
    if ((error as Error).message === "INVALID_ID") {
      set.status = 400;
      return { error: "无效的 ID" };
    }
    if ((error as Error).message === "INVALID_SLUG") {
      set.status = 400;
      return { error: "无效的白板标识" };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "请求参数不合法" };
    }
    console.error(error);
    set.status = 500;
    return { error: "服务器开小差了，请稍后再试" };
  })
  .use(cors({
    origin: APP_ORIGIN ? [APP_ORIGIN] : true,
    credentials: true,
  }))
  .get("/api/health", () => ({ ok: true }))
  .get("/api/boards", () => listBoards(db).map(toPublicBoard))
  .get("/api/boards/:slug", ({ params }) => {
    const board = ensureBoard(db, params.slug);
    return toPublicBoard(board);
  })
  .post("/api/boards", ({ body, cookie, set }) => {
    if (!isAuthed(cookie)) {
      set.status = 401;
      return { error: "未授权，请先登录" };
    }
    const payload = body as { slug: string; title?: string };
    return toPublicBoard(ensureBoard(db, payload.slug, payload.title));
  }, {
    body: t.Object({
      slug: t.String(),
      title: t.Optional(t.String()),
    }),
  })
  .post("/api/auth/login", async ({ body, cookie, set, request }) => {
    const clientKey = getClientKey(request);
    if (isRateLimited(loginAttempts, `login:${clientKey}`, LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS)) {
      return tooManyRequests("登录尝试过于频繁，请稍后再试");
    }

    const ok = await verifyAdminPassword(db, (body as { password: string }).password);
    if (!ok) {
      set.status = 401;
      return { error: "密码错误" };
    }

    const sid = createAdminSession(db);
    cookie[SESSION_COOKIE].set({
      value: sid,
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(request),
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return { ok: true };
  }, {
    body: t.Object({ password: t.String() }),
  })
  .post("/api/auth/logout", ({ cookie, request }) => {
    const sid = cookie[SESSION_COOKIE]?.value;
    if (typeof sid === "string" && sid.length > 0) deleteAdminSession(db, sid);
    cookie[SESSION_COOKIE].set({
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(request),
      maxAge: 0,
      path: "/",
    });
    return { ok: true };
  })
  .get("/api/auth/check", ({ cookie }) => ({ authed: isAuthed(cookie) }))
  .get("/api/boards/:slug/strokes", ({ params, query }) => {
    const board = getBoard(db, params.slug);
    if (!board) return [];
    return getStrokes(db, board.id, parsePage(query.page)).map(toPublicStroke);
  })
  .post("/api/boards/:slug/strokes", ({ params, body, request }) => {
    const clientKey = getClientKey(request);
    if (isRateLimited(writeAttempts, `stroke:${clientKey}`, PUBLIC_WRITE_LIMIT_MAX, PUBLIC_WRITE_LIMIT_WINDOW_MS)) {
      return tooManyRequests("提交过于频繁，请稍后再试");
    }

    const payload = body as { stroke_data: string; client_id: string; local_id: string; page?: number };
    const clientId = payload.client_id?.trim();
    const localId = payload.local_id?.trim();
    if (!clientId || clientId.length > 80 || !localId || localId.length > 120) {
      return badRequest("缺少客户端笔画标识");
    }

    const page = parsePage(payload.page);
    let normalized: string | Response;
    try {
      normalized = normalizeStrokeData(payload.stroke_data);
    } catch {
      return badRequest("涂鸦点位不合法");
    }
    if (normalized instanceof Response) return normalized;

    const board = ensureBoard(db, params.slug);
    const row = createStroke(db, board.id, page, clientId, localId, normalized);
    const publicRow = toPublicStroke(row);
    broadcastBoard(board.slug, { type: "stroke-created", stroke: publicRow, client_id: clientId, local_id: localId, page });
    return publicRow;
  }, {
    body: t.Object({
      stroke_data: t.String(),
      client_id: t.String(),
      local_id: t.String(),
      page: t.Optional(t.Number()),
    }),
  })
  .delete("/api/boards/:slug/strokes/:id", ({ params, query, body }) => {
    const board = getBoard(db, params.slug);
    if (!board) return badRequest("白板不存在");
    const page = parsePage(query.page);
    const clientId = (body as { client_id?: string } | undefined)?.client_id?.trim() || "";
    if (!clientId) return badRequest("缺少客户端标识");

    const id = parseId(params.id);
    const deleted = deleteOwnStroke(db, board.id, id, page, clientId);
    if (!deleted) return badRequest("无法撤销此笔画");
    broadcastBoard(board.slug, { type: "stroke-deleted", id, page });
    return { ok: true };
  }, {
    body: t.Object({ client_id: t.String() }),
  })
  .delete("/api/boards/:slug/strokes", ({ params, query, cookie, set }) => {
    if (!isAuthed(cookie)) {
      set.status = 401;
      return { error: "未授权，请先登录" };
    }
    const board = getBoard(db, params.slug);
    if (!board) return badRequest("白板不存在");
    const page = parsePage(query.page);
    clearBoardPage(db, board.id, page);
    broadcastBoard(board.slug, { type: "strokes-cleared", page });
    return { ok: true };
  });

Bun.serve<WsData>({
  hostname: HOST,
  port: PORT,
  async fetch(req, server) {
    const headers = new Headers(req.headers);
    const remoteIp = server.requestIP(req)?.address;
    if (remoteIp) headers.set(INTERNAL_REMOTE_IP_HEADER, remoteIp);

    const request = new Request(req, { headers });
    const url = new URL(request.url);
    const wsMatch = url.pathname.match(/^\/api\/boards\/([^/]+)\/ws$/);
    if (wsMatch) {
      const boardSlug = normalizeSlug(decodeURIComponent(wsMatch[1]));
      ensureBoard(db, boardSlug);
      if (server.upgrade(req, { data: { boardSlug } })) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname.startsWith("/api/")) return app.handle(request);

    if (url.pathname !== "/") {
      const filePath = join(DIST_DIR, url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const isAsset = url.pathname.startsWith("/assets/");
        return new Response(file, {
          headers: {
            "content-type": contentTypeFor(url.pathname),
            "cache-control": isAsset ? "public, max-age=31536000, immutable" : "public, max-age=3600",
          },
        });
      }
    }

    return new Response(Bun.file(join(DIST_DIR, "index.html")), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
  websocket: {
    open(ws) {
      getBoardClients(ws.data.boardSlug).add(ws);
      ws.send(JSON.stringify({ type: "connected", board: ws.data.boardSlug }));
    },
    message() {
      // Writes use HTTP; WebSocket is only for fan-out.
    },
    close(ws) {
      boardClients.get(ws.data.boardSlug)?.delete(ws);
    },
  },
});

console.log(`yophon-board running at http://${HOST}:${PORT}`);
