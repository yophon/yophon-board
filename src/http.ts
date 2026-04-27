import {
  CLIENT_ID_COOKIE,
  CLIENT_ID_MAX_AGE,
  INTERNAL_REMOTE_IP_HEADER,
  serverConfig,
} from "./config";
import type { BoardRow, StrokeRow } from "./db";

export type CookieJar = Record<string, any>;

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("INVALID_ID");
  return id;
}

export function parsePage(value: unknown): number {
  const page = Number(value ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 9999) throw new Error("INVALID_ID");
  return page;
}

export function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function badRequest(message: string) {
  return jsonError(message, 400);
}

export function tooManyRequests(message: string) {
  return jsonError(message, 429);
}

export function getClientKey(request: Request): string {
  const remoteIp = request.headers.get(INTERNAL_REMOTE_IP_HEADER);
  if (isTrustedProxyAddress(remoteIp)) {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    const forwardedFor = firstForwardedFor(request.headers.get("x-forwarded-for"));
    if (forwardedFor) return forwardedFor;
  }
  return remoteIp || "unknown";
}

export function shouldUseSecureCookie(request: Request): boolean {
  if (serverConfig.cookieSecure === "true") return true;
  if (serverConfig.cookieSecure === "false") return false;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto === "https";
  return new URL(request.url).protocol === "https:";
}

export function ensureClientId(cookie: CookieJar, request: Request): string {
  const existing = cookie[CLIENT_ID_COOKIE]?.value;
  if (typeof existing === "string" && /^[a-f0-9-]{16,80}$/.test(existing)) return existing;
  const next = crypto.randomUUID();
  cookie[CLIENT_ID_COOKIE].set({
    value: next,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: CLIENT_ID_MAX_AGE,
  });
  return next;
}

export function toPublicBoard(board: BoardRow) {
  return {
    id: board.id,
    slug: board.slug,
    title: board.title,
    visibility: board.visibility,
    created_at: board.created_at,
  };
}

export function toPublicStroke(row: StrokeRow) {
  return {
    id: row.id,
    page: row.page,
    stroke_data: row.stroke_data,
    created_at: row.created_at,
  };
}

function isTrustedProxyAddress(address: string | null): boolean {
  return !!address && (address === "::1" || address === "::ffff:127.0.0.1" || address.startsWith("127."));
}

function firstForwardedFor(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}
