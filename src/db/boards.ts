import type { Database } from "bun:sqlite";
import { invalidSlug } from "../errors";

export interface BoardRow {
  id: number;
  slug: string;
  title: string;
  visibility: string;
  created_at: number;
}

export const DEFAULT_BOARD_SLUG = process.env.DEFAULT_BOARD_SLUG || "main";
export const DEFAULT_BOARD_TITLE = process.env.DEFAULT_BOARD_TITLE || "Yophon Board";

export function normalizeSlug(raw: string | undefined): string {
  const slug = (raw || DEFAULT_BOARD_SLUG).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    throw invalidSlug();
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
