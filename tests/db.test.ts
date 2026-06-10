import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Database,
  cleanupExpiredAdminSessions,
  createAdminSession,
  createStroke,
  deleteStrokes,
  ensureBoard,
  getStrokes,
  initDb,
  updateStroke,
  validateAdminSession,
} from "../src/db";

let db: Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  db.close();
});

const strokeData = JSON.stringify({
  points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  color: "#202124",
  width: 2,
  tool: "pen",
  opacity: 1,
  blend: "normal",
});

describe("migrations", () => {
  test("records migration 1 in schema_migrations", () => {
    const rows = db.query("SELECT version, applied_at FROM schema_migrations ORDER BY version").all() as Array<{ version: number; applied_at: number }>;
    expect(rows.map((row) => row.version)).toEqual([1]);
    expect(rows[0].applied_at).toBeGreaterThan(0);
  });

  test("is idempotent across re-opens and keeps existing data", () => {
    const dir = mkdtempSync(join(tmpdir(), "yophon-board-test-"));
    const path = join(dir, "test.db");
    try {
      const first = initDb(path);
      const board = ensureBoard(first, "keepme");
      createStroke(first, board.id, 0, "client-1", "local-1", strokeData);
      first.close();

      const second = initDb(path);
      const versions = second.query("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
      expect(versions).toHaveLength(1);
      const kept = second.query("SELECT slug FROM boards WHERE slug = 'keepme'").get();
      expect(kept).not.toBeNull();
      expect(getStrokes(second, board.id)).toHaveLength(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("adopts a pre-versioning legacy database", () => {
    const dir = mkdtempSync(join(tmpdir(), "yophon-board-test-"));
    const path = join(dir, "legacy.db");
    try {
      // Simulate a production database created before schema_migrations existed.
      const legacy = new Database(path);
      legacy.run("CREATE TABLE boards (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public', created_at INTEGER DEFAULT (unixepoch()))");
      legacy.run("INSERT INTO boards (slug, title) VALUES ('legacy-board', 'Legacy')");
      legacy.close();

      const upgraded = initDb(path);
      const versions = upgraded.query("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
      expect(versions).toHaveLength(1);
      const kept = upgraded.query("SELECT title FROM boards WHERE slug = 'legacy-board'").get() as { title: string };
      expect(kept.title).toBe("Legacy");
      // Tables added by migration 1 now exist too.
      expect(upgraded.query("SELECT COUNT(*) AS n FROM strokes").get()).toEqual({ n: 0 });
      upgraded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createStroke", () => {
  test("is idempotent for the same client_id + local_id", () => {
    const board = ensureBoard(db, "test-board");
    const first = createStroke(db, board.id, 0, "client-1", "local-1", strokeData);
    const second = createStroke(db, board.id, 0, "client-1", "local-1", strokeData);
    expect(second.id).toBe(first.id);
    expect(getStrokes(db, board.id)).toHaveLength(1);
  });

  test("returns the existing row instead of throwing on a pre-inserted duplicate key", () => {
    const board = ensureBoard(db, "test-board");
    db.run(
      "INSERT INTO strokes (board_id, page, client_id, local_id, stroke_data) VALUES (?, ?, ?, ?, ?)",
      [board.id, 0, "client-1", "local-1", strokeData],
    );
    const row = createStroke(db, board.id, 0, "client-1", "local-1", strokeData);
    expect(row.client_id).toBe("client-1");
    expect(getStrokes(db, board.id)).toHaveLength(1);
  });

  test("different local_ids create distinct rows", () => {
    const board = ensureBoard(db, "test-board");
    const first = createStroke(db, board.id, 0, "client-1", "local-1", strokeData);
    const second = createStroke(db, board.id, 0, "client-1", "local-2", strokeData);
    expect(second.id).not.toBe(first.id);
    expect(getStrokes(db, board.id)).toHaveLength(2);
  });
});

describe("updateStroke", () => {
  test("updates and returns the stored row", () => {
    const board = ensureBoard(db, "test-board");
    const row = createStroke(db, board.id, 0, "client-1", "local-1", strokeData);
    const updated = JSON.stringify({ ...JSON.parse(strokeData), color: "#ff0000" });
    const result = updateStroke(db, board.id, row.id, 0, updated);
    expect(result?.stroke_data).toBe(updated);
  });

  test("returns null when no row matches", () => {
    const board = ensureBoard(db, "test-board");
    const row = createStroke(db, board.id, 0, "client-1", "local-1", strokeData);
    expect(updateStroke(db, board.id, row.id, 1, strokeData)).toBeNull();
    expect(updateStroke(db, board.id, 9999, 0, strokeData)).toBeNull();
  });
});

describe("deleteStrokes", () => {
  test("deletes matching ids atomically and reports only deleted ones", () => {
    const board = ensureBoard(db, "test-board");
    const a = createStroke(db, board.id, 0, "client-1", "local-a", strokeData);
    const b = createStroke(db, board.id, 0, "client-1", "local-b", strokeData);
    const otherPage = createStroke(db, board.id, 1, "client-1", "local-c", strokeData);

    const deleted = deleteStrokes(db, board.id, 0, [a.id, b.id, otherPage.id, 9999]);
    expect(deleted.sort()).toEqual([a.id, b.id].sort());
    expect(getStrokes(db, board.id, 0)).toHaveLength(0);
    expect(getStrokes(db, board.id, 1)).toHaveLength(1);
  });

  test("does not delete strokes from another board", () => {
    const board = ensureBoard(db, "test-board");
    const other = ensureBoard(db, "other-board");
    const row = createStroke(db, other.id, 0, "client-1", "local-1", strokeData);

    expect(deleteStrokes(db, board.id, 0, [row.id])).toEqual([]);
    expect(getStrokes(db, other.id)).toHaveLength(1);
  });
});

describe("admin sessions", () => {
  test("validates a fresh session and rejects unknown ids", () => {
    const sid = createAdminSession(db);
    expect(validateAdminSession(db, sid)).toBe(true);
    expect(validateAdminSession(db, "no-such-session")).toBe(false);
  });

  test("rejects and cleans up expired sessions", () => {
    const sid = createAdminSession(db);
    const past = Math.floor(Date.now() / 1000) - 10;
    db.run("UPDATE admin_sessions SET expires_at = ? WHERE id = ?", [past, sid]);

    expect(validateAdminSession(db, sid)).toBe(false);

    cleanupExpiredAdminSessions(db);
    expect(db.query("SELECT COUNT(*) AS n FROM admin_sessions").get()).toEqual({ n: 0 });
  });
});
