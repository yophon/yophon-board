import { existsSync } from "node:fs";

export const SESSION_COOKIE = "yophon_board_session";
export const CLIENT_ID_COOKIE = "yophon_board_cid";
export const CLIENT_ID_MAX_AGE = 365 * 24 * 60 * 60;
export const INTERNAL_REMOTE_IP_HEADER = "x-yophon-remote-ip";

export const PUBLIC_WRITE_LIMIT_MAX = 240;
export const PUBLIC_WRITE_LIMIT_WINDOW_MS = 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 8;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const STROKE_MAX_BYTES = 20000;
export const STROKE_MAX_POINTS = 1000;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const serverConfig = {
  port: Number(process.env.PORT || 3020),
  host: process.env.HOST || "127.0.0.1",
  appOrigin: process.env.APP_ORIGIN,
  cookieSecure: process.env.COOKIE_SECURE,
  distDir: existsSync("frontend/dist") ? "frontend/dist" : "public",
  assetDir: process.env.ASSET_DIR || "data/assets",
};
