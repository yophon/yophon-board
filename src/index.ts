import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import {
  INTERNAL_REMOTE_IP_HEADER,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  PUBLIC_WRITE_LIMIT_MAX,
  PUBLIC_WRITE_LIMIT_WINDOW_MS,
  SESSION_COOKIE,
  serverConfig,
} from "./config";
import {
  clearBoardPage,
  createAdminSession,
  createStroke,
  deleteAdminSession,
  deleteOwnStroke,
  ensureBoard,
  getBoard,
  getDbStats,
  getStrokes,
  initDb,
  listBoards,
  normalizeSlug,
  updateAdminPassword,
  validateAdminSession,
  verifyAdminPassword,
} from "./db";
import {
  badRequest,
  ensureClientId,
  getClientKey,
  parseId,
  parsePage,
  shouldUseSecureCookie,
  toPublicBoard,
  toPublicStroke,
  tooManyRequests,
  type CookieJar,
} from "./http";
import { SlidingWindowRateLimiter } from "./rateLimit";
import { serveIndex, serveStaticAsset } from "./staticFiles";
import { normalizeStrokeData } from "./stroke";
import { BoardHub, type BoardWsData } from "./wsHub";

const db = initDb();
const boardHub = new BoardHub();
const writeLimiter = new SlidingWindowRateLimiter(PUBLIC_WRITE_LIMIT_MAX, PUBLIC_WRITE_LIMIT_WINDOW_MS);
const loginLimiter = new SlidingWindowRateLimiter(LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);

function isAuthed(cookie: CookieJar): boolean {
  const sid = cookie[SESSION_COOKIE]?.value;
  return typeof sid === "string" && sid.length > 0 && validateAdminSession(db, sid);
}

setInterval(() => {
  writeLimiter.cleanup();
  loginLimiter.cleanup();
}, 10 * 60 * 1000);

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
    origin: serverConfig.appOrigin ? [serverConfig.appOrigin] : true,
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
    if (loginLimiter.hit(`login:${clientKey}`)) {
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
  .post("/api/auth/password", async ({ body, cookie, set }) => {
    if (!isAuthed(cookie)) {
      set.status = 401;
      return { error: "未授权，请先登录" };
    }
    const payload = body as { old_password: string; new_password: string };
    if (!payload.new_password || payload.new_password.length < 8 || payload.new_password.length > 256) {
      set.status = 400;
      return { error: "新密码长度需在 8-256 之间" };
    }
    const ok = await updateAdminPassword(db, payload.old_password, payload.new_password);
    if (!ok) {
      set.status = 400;
      return { error: "旧密码错误" };
    }
    cookie[SESSION_COOKIE].set({ value: "", maxAge: 0, path: "/" });
    return { ok: true };
  }, {
    body: t.Object({
      old_password: t.String(),
      new_password: t.String(),
    }),
  })
  .get("/api/admin/stats", ({ cookie, set }) => {
    if (!isAuthed(cookie)) {
      set.status = 401;
      return { error: "未授权，请先登录" };
    }
    const dbStats = getDbStats(db);
    const { wsClients, wsBoards } = boardHub.stats();
    return {
      ...dbStats,
      ws_clients: wsClients,
      ws_boards: wsBoards,
      write_attempts_keys: writeLimiter.size,
      login_attempts_keys: loginLimiter.size,
      uptime_seconds: Math.floor(process.uptime()),
    };
  })
  .get("/api/boards/:slug/strokes", ({ params, query }) => {
    const board = getBoard(db, params.slug);
    if (!board) return [];
    const sinceRaw = Number(query.since ?? 0);
    const sinceId = Number.isInteger(sinceRaw) && sinceRaw >= 0 ? sinceRaw : 0;
    return getStrokes(db, board.id, parsePage(query.page), sinceId).map(toPublicStroke);
  })
  .post("/api/boards/:slug/strokes", ({ params, body, request, cookie }) => {
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

    const board = ensureBoard(db, params.slug);
    const row = createStroke(db, board.id, page, clientId, localId, normalized.value);
    const publicRow = toPublicStroke(row);
    boardHub.broadcast(board.slug, { type: "stroke-created", stroke: publicRow, local_id: localId, page });
    return publicRow;
  }, {
    body: t.Object({
      stroke_data: t.String(),
      local_id: t.String(),
      client_id: t.Optional(t.String()),
      page: t.Optional(t.Number()),
    }),
  })
  .delete("/api/boards/:slug/strokes/:id", ({ params, query, request, cookie }) => {
    const board = getBoard(db, params.slug);
    if (!board) return badRequest("白板不存在");
    const page = parsePage(query.page);
    const clientId = ensureClientId(cookie, request);

    const id = parseId(params.id);
    const deleted = deleteOwnStroke(db, board.id, id, page, clientId);
    if (!deleted) return badRequest("无法撤销此笔画");
    boardHub.broadcast(board.slug, { type: "stroke-deleted", id, page });
    return { ok: true };
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
    boardHub.broadcast(board.slug, { type: "strokes-cleared", page });
    return { ok: true };
  });

Bun.serve<BoardWsData>({
  hostname: serverConfig.host,
  port: serverConfig.port,
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

    const assetResponse = await serveStaticAsset(url.pathname, serverConfig.distDir);
    if (assetResponse) return assetResponse;

    return serveIndex(serverConfig.distDir);
  },
  websocket: {
    open(ws) {
      boardHub.add(ws.data.boardSlug, ws);
      ws.send(JSON.stringify({ type: "connected", board: ws.data.boardSlug }));
    },
    message() {
      // Writes use HTTP; WebSocket is only for fan-out.
    },
    close(ws) {
      boardHub.remove(ws.data.boardSlug, ws);
    },
  },
});

console.log(`yophon-board running at http://${serverConfig.host}:${serverConfig.port}`);
