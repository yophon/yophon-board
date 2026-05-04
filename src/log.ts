import { INTERNAL_REMOTE_IP_HEADER } from "./config";

/**
 * Single-line access log. Keeps a stable column order so journald entries
 * are still grep-friendly without a structured-log shipper.
 *
 *   [2026-05-04T07:12:33.421Z] 200 GET   /api/projects        ip=1.2.3.4 12.4ms
 */
export function logRequest(request: Request, status: number, startMs: number): void {
  const ms = Math.max(0, Date.now() - startMs);
  const ip = clientIp(request);
  const method = request.method.padEnd(5);
  const url = new URL(request.url);
  const path = (url.pathname + url.search).slice(0, 200);
  const ts = new Date().toISOString();
  const line = `[${ts}] ${status} ${method} ${path} ip=${ip} ${ms.toFixed(1)}ms`;
  if (status >= 500) console.error(line);
  else console.log(line);
}

function clientIp(request: Request): string {
  const remote = request.headers.get(INTERNAL_REMOTE_IP_HEADER);
  if (remote && remote.startsWith("127.")) {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  return remote || "unknown";
}
