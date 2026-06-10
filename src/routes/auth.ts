import { Elysia, t } from "elysia";
import type { Database } from "bun:sqlite";
import { SESSION_COOKIE } from "../config";
import {
  createAdminSession,
  deleteAdminSession,
  getDbStats,
  updateAdminPassword,
  validateAdminSession,
  verifyAdminPassword,
} from "../db";
import {
  getClientKey,
  shouldUseSecureCookie,
  tooManyRequests,
  type CookieJar,
} from "../http";
import type { SlidingWindowRateLimiter } from "../rateLimit";

/** Live process counters merged into /api/admin/stats; supplied by index.ts. */
export interface RuntimeStats {
  ws_clients: number;
  ws_boards: Record<string, number>;
  write_attempts_keys: number;
  login_attempts_keys: number;
}

export interface AuthRouteDeps {
  db: Database;
  loginLimiter: SlidingWindowRateLimiter;
  runtimeStats: () => RuntimeStats;
}

export function isAuthed(db: Database, cookie: CookieJar): boolean {
  const sid = cookie[SESSION_COOKIE]?.value;
  return typeof sid === "string" && sid.length > 0 && validateAdminSession(db, sid);
}

export function createAuthRoutes({ db, loginLimiter, runtimeStats }: AuthRouteDeps) {
  return new Elysia({ name: "routes/auth" })
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
    .get("/api/auth/check", ({ cookie }) => ({ authed: isAuthed(db, cookie) }))
    .post("/api/auth/password", async ({ body, cookie, set }) => {
      if (!isAuthed(db, cookie)) {
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
      if (!isAuthed(db, cookie)) {
        set.status = 401;
        return { error: "未授权，请先登录" };
      }
      return {
        ...getDbStats(db),
        ...runtimeStats(),
        uptime_seconds: Math.floor(process.uptime()),
      };
    });
}
