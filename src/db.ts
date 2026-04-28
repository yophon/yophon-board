import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import "dotenv/config";

export { Database };

export interface BoardRow {
  id: number;
  slug: string;
  title: string;
  visibility: string;
  created_at: number;
}

export interface StrokeRow {
  id: number;
  board_id: number;
  page: number;
  client_id: string;
  local_id: string;
  stroke_data: string;
  created_at: number;
}

const DB_PATH = process.env.DB_PATH || "data/yophon-board.db";
const DEFAULT_BOARD_SLUG = process.env.DEFAULT_BOARD_SLUG || "main";
const DEFAULT_BOARD_TITLE = process.env.DEFAULT_BOARD_TITLE || "Yophon Board";
const ADMIN_PASSWORD = process.env.BOARD_ADMIN_PASSWORD;
const DEFAULT_BCRYPT_COST = 10;

export function initDb(): Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  db.run(`CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at INTEGER DEFAULT (unixepoch())
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS strokes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    page INTEGER NOT NULL DEFAULT 0,
    client_id TEXT NOT NULL,
    local_id TEXT NOT NULL,
    stroke_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(board_id, client_id, local_id)
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_strokes_board_page_id ON strokes(board_id, page, id)");

  db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER,
    expires_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  const existingAdmin = db.query("SELECT value FROM config WHERE key = 'admin_password'").get() as { value: string } | null;
  if (!existingAdmin && ADMIN_PASSWORD) {
    const hashed = Bun.password.hashSync(ADMIN_PASSWORD, {
      algorithm: "bcrypt",
      cost: DEFAULT_BCRYPT_COST,
    });
    db.run("INSERT INTO config (key, value) VALUES ('admin_password', ?)", [hashed]);
  }

  ensureBoard(db, DEFAULT_BOARD_SLUG, DEFAULT_BOARD_TITLE);
  return db;
}

export function normalizeSlug(raw: string | undefined): string {
  const slug = (raw || DEFAULT_BOARD_SLUG).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    throw new Error("INVALID_SLUG");
  }
  return slug;
}

export function ensureBoard(db: Database, rawSlug: string, title?: string): BoardRow {
  const slug = normalizeSlug(rawSlug);
  const existing = db.query("SELECT * FROM boards WHERE slug = ?").get(slug) as BoardRow | null;
  if (existing) return existing;

  const cleanTitle = (title || slug).trim().slice(0, 80) || slug;
  const result = db.run(
    "INSERT INTO boards (slug, title, visibility) VALUES (?, ?, 'public')",
    [slug, cleanTitle],
  );
  return db.query("SELECT * FROM boards WHERE id = ?").get(Number(result.lastInsertRowid)) as BoardRow;
}

export function getBoard(db: Database, rawSlug: string): BoardRow | null {
  const slug = normalizeSlug(rawSlug);
  return db.query("SELECT * FROM boards WHERE slug = ?").get(slug) as BoardRow | null;
}

export function listBoards(db: Database): BoardRow[] {
  return db.query("SELECT * FROM boards ORDER BY created_at DESC, id DESC").all() as BoardRow[];
}

export function getStrokes(db: Database, boardId: number, page = 0, sinceId = 0): StrokeRow[] {
  return db.query(
    "SELECT id, board_id, page, client_id, local_id, stroke_data, created_at FROM strokes WHERE board_id = ? AND page = ? AND id > ? ORDER BY id ASC",
  ).all(boardId, page, sinceId) as StrokeRow[];
}

export function createStroke(
  db: Database,
  boardId: number,
  page: number,
  clientId: string,
  localId: string,
  strokeData: string,
): StrokeRow {
  const existing = db.query(
    "SELECT id, board_id, page, client_id, local_id, stroke_data, created_at FROM strokes WHERE board_id = ? AND client_id = ? AND local_id = ?",
  ).get(boardId, clientId, localId) as StrokeRow | null;
  if (existing) return existing;

  const result = db.run(
    "INSERT INTO strokes (board_id, page, client_id, local_id, stroke_data) VALUES (?, ?, ?, ?, ?)",
    [boardId, page, clientId.slice(0, 80), localId.slice(0, 120), strokeData.trim().slice(0, 20000)],
  );
  return db.query(
    "SELECT id, board_id, page, client_id, local_id, stroke_data, created_at FROM strokes WHERE id = ?",
  ).get(Number(result.lastInsertRowid)) as StrokeRow;
}

export function updateStroke(
  db: Database,
  boardId: number,
  id: number,
  page: number,
  strokeData: string,
): StrokeRow | null {
  const result = db.run(
    "UPDATE strokes SET stroke_data = ? WHERE board_id = ? AND id = ? AND page = ?",
    [strokeData.trim().slice(0, 20000), boardId, id, page],
  );
  if (result.changes <= 0) return null;
  return db.query(
    "SELECT id, board_id, page, client_id, local_id, stroke_data, created_at FROM strokes WHERE id = ?",
  ).get(id) as StrokeRow;
}

export function deleteOwnStroke(db: Database, boardId: number, id: number, page: number, clientId: string): boolean {
  const result = db.run(
    "DELETE FROM strokes WHERE board_id = ? AND id = ? AND page = ? AND client_id = ?",
    [boardId, id, page, clientId.slice(0, 80)],
  );
  return result.changes > 0;
}

export function deleteStrokes(db: Database, boardId: number, page: number, ids: number[]): number[] {
  const deleted: number[] = [];
  const statement = db.prepare("DELETE FROM strokes WHERE board_id = ? AND id = ? AND page = ?");
  const transaction = db.transaction((strokeIds: number[]) => {
    for (const id of strokeIds) {
      const result = statement.run(boardId, id, page);
      if (result.changes > 0) deleted.push(id);
    }
  });
  transaction(ids);
  return deleted;
}

export function clearBoardPage(db: Database, boardId: number, page: number): void {
  db.run("DELETE FROM strokes WHERE board_id = ? AND page = ?", [boardId, page]);
}

export function createAdminSession(db: Database): string {
  cleanupExpiredAdminSessions(db);
  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 7 * 24 * 60 * 60;
  db.run("INSERT INTO admin_sessions (id, created_at, expires_at) VALUES (?, ?, ?)", [sessionId, now, expiresAt]);
  return sessionId;
}

export function validateAdminSession(db: Database, sessionId: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const row = db.query("SELECT id FROM admin_sessions WHERE id = ? AND expires_at > ?").get(sessionId, now);
  return !!row;
}

export function deleteAdminSession(db: Database, sessionId: string): void {
  db.run("DELETE FROM admin_sessions WHERE id = ?", [sessionId]);
}

export function cleanupExpiredAdminSessions(db: Database): void {
  const now = Math.floor(Date.now() / 1000);
  db.run("DELETE FROM admin_sessions WHERE expires_at <= ?", [now]);
}

export async function verifyAdminPassword(db: Database, password: string): Promise<boolean> {
  const row = db.query("SELECT value FROM config WHERE key = 'admin_password'").get() as { value: string } | null;
  if (!row) return false;
  return await Bun.password.verify(password, row.value);
}

export async function updateAdminPassword(
  db: Database,
  oldPassword: string,
  newPassword: string,
): Promise<boolean> {
  const ok = await verifyAdminPassword(db, oldPassword);
  if (!ok) return false;
  const hashed = Bun.password.hashSync(newPassword, {
    algorithm: "bcrypt",
    cost: DEFAULT_BCRYPT_COST,
  });
  db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('admin_password', ?)", [hashed]);
  db.run("DELETE FROM admin_sessions");
  return true;
}

export interface DbStats {
  boards: number;
  strokes: number;
  admin_sessions: number;
  db_path: string;
  db_size_bytes: number;
}

export function getDbStats(db: Database): DbStats {
  const boards = (db.query("SELECT COUNT(*) AS n FROM boards").get() as { n: number }).n;
  const strokes = (db.query("SELECT COUNT(*) AS n FROM strokes").get() as { n: number }).n;
  const now = Math.floor(Date.now() / 1000);
  const sessions = (db.query("SELECT COUNT(*) AS n FROM admin_sessions WHERE expires_at > ?").get(now) as { n: number }).n;
  let size = 0;
  for (const path of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try {
      size += Bun.file(path).size || 0;
    } catch {
      // file may not exist yet (e.g. WAL only after first write); ignore.
    }
  }
  return { boards, strokes, admin_sessions: sessions, db_path: DB_PATH, db_size_bytes: size };
}
