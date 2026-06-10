import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import {
  INTERNAL_REMOTE_IP_HEADER,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  PUBLIC_WRITE_LIMIT_MAX,
  PUBLIC_WRITE_LIMIT_WINDOW_MS,
  serverConfig,
} from "./config";
import { ensureBoard, initDb, normalizeSlug } from "./db";
import { AppError } from "./errors";
import { logRequest } from "./log";
import { SlidingWindowRateLimiter } from "./rateLimit";
import { createAssetRoutes } from "./routes/assets";
import { createAuthRoutes } from "./routes/auth";
import { createProjectRoutes } from "./routes/projects";
import { serveIndex, serveStaticAsset } from "./staticFiles";
import { BoardHub, type BoardWsData } from "./wsHub";

const db = initDb();
const boardHub = new BoardHub();
const writeLimiter = new SlidingWindowRateLimiter(PUBLIC_WRITE_LIMIT_MAX, PUBLIC_WRITE_LIMIT_WINDOW_MS);
const loginLimiter = new SlidingWindowRateLimiter(LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);

// Periodically prune rate-limit maps so memory doesn't drift unbounded.
setInterval(() => {
  writeLimiter.cleanup();
  loginLimiter.cleanup();
}, 10 * 60 * 1000);

const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (error instanceof Response) return error;
    if (error instanceof AppError) {
      set.status = error.status;
      return { error: error.userMessage };
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
  .use(createProjectRoutes({ db, hub: boardHub, writeLimiter }))
  .use(createAssetRoutes({ db, writeLimiter }))
  .use(createAuthRoutes({
    db,
    loginLimiter,
    runtimeStats: () => {
      const { wsClients, wsBoards } = boardHub.stats();
      return {
        ws_clients: wsClients,
        ws_boards: wsBoards,
        write_attempts_keys: writeLimiter.size,
        login_attempts_keys: loginLimiter.size,
      };
    },
  }));

Bun.serve<BoardWsData>({
  hostname: serverConfig.host,
  port: serverConfig.port,
  async fetch(req, server) {
    const start = Date.now();
    const headers = new Headers(req.headers);
    const remoteIp = server.requestIP(req)?.address;
    if (remoteIp) headers.set(INTERNAL_REMOTE_IP_HEADER, remoteIp);

    const request = new Request(req, { headers });
    const url = new URL(request.url);
    const wsMatch = url.pathname.match(/^\/api\/(?:projects|boards)\/([^/]+)\/ws$/);
    if (wsMatch) {
      const boardSlug = normalizeSlug(decodeURIComponent(wsMatch[1]));
      ensureBoard(db, boardSlug);
      if (server.upgrade(req, { data: { boardSlug } })) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname.startsWith("/api/")) {
      const response = await app.handle(request);
      logRequest(request, response.status, start);
      return response;
    }

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
      // 客户端发来的 WebSocket 消息被刻意忽略：写操作全部走 HTTP，WS 仅做单向广播。
    },
    close(ws) {
      boardHub.remove(ws.data.boardSlug, ws);
    },
  },
});

console.log(`yophon-board running at http://${serverConfig.host}:${serverConfig.port}`);
