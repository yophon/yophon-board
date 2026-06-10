import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import "dotenv/config";
import { DEFAULT_BOARD_SLUG, DEFAULT_BOARD_TITLE, ensureBoard } from "./boards";
import { seedAdminPassword } from "./sessions";

export { Database };

const DB_PATH = process.env.DB_PATH || "data/yophon-board.db";

/**
 * Open the SQLite database, run versioned migrations, and seed defaults.
 * Returns a Database that callers pass to the per-domain helpers in this
 * folder. `dbPath` is overridable for tests (e.g. ":memory:").
 */
export function initDb(dbPath: string = DB_PATH): Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  runMigrations(db);
  seedAdminPassword(db);
  ensureBoard(db, DEFAULT_BOARD_SLUG, DEFAULT_BOARD_TITLE);

  return db;
}

/**
 * Versioned migrations. Each entry runs at most once per database, inside
 * its own transaction, and is recorded in schema_migrations. Migration 1
 * is the original CREATE TABLE IF NOT EXISTS schema, so databases created
 * before versioning existed simply mark it applied without any change.
 * New schema changes append `{ version: N, up }` entries here.
 */
const MIGRATIONS: Array<{ version: number; up: (db: Database) => void }> = [
  { version: 1, up: createInitialSchema },
];

export function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (unixepoch())
  )`);

  const appliedRows = db.query("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      migration.up(db);
      db.run("INSERT INTO schema_migrations (version) VALUES (?)", [migration.version]);
    })();
  }
}

function createInitialSchema(db: Database): void {
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
  const dbPath = db.filename || DB_PATH;
  let size = 0;
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      size += Bun.file(path).size || 0;
    } catch {
      // file may not exist yet (e.g. WAL only after first write); ignore.
    }
  }
  return { boards, strokes, admin_sessions: sessions, db_path: dbPath, db_size_bytes: size };
}

// Re-export domain helpers so consumers can `import { ... } from "./db"`.
export * from "./boards";
export * from "./sessions";
export * from "./strokes";
