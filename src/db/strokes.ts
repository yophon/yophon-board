import type { Database } from "bun:sqlite";

export interface StrokeRow {
  id: number;
  board_id: number;
  page: number;
  client_id: string;
  local_id: string;
  stroke_data: string;
  created_at: number;
}

const STROKE_COLUMNS = "id, board_id, page, client_id, local_id, stroke_data, created_at";

export function getStrokes(db: Database, boardId: number, page = 0, sinceId = 0): StrokeRow[] {
  return db.query(
    `SELECT ${STROKE_COLUMNS} FROM strokes WHERE board_id = ? AND page = ? AND id > ? ORDER BY id ASC`,
  ).all(boardId, page, sinceId) as StrokeRow[];
}

/**
 * Insert a stroke, atomically and idempotently: the lookup + insert run in
 * one transaction, and a UNIQUE(board_id, client_id, local_id) conflict
 * (e.g. a concurrent duplicate submit) falls back to returning the
 * already-stored row instead of surfacing a 500.
 */
export function createStroke(
  db: Database,
  boardId: number,
  page: number,
  clientId: string,
  localId: string,
  strokeData: string,
): StrokeRow {
  const cleanClientId = clientId.slice(0, 80);
  const cleanLocalId = localId.slice(0, 120);
  const findExisting = () => db.query(
    `SELECT ${STROKE_COLUMNS} FROM strokes WHERE board_id = ? AND client_id = ? AND local_id = ?`,
  ).get(boardId, cleanClientId, cleanLocalId) as StrokeRow | null;

  const insertOrReuse = db.transaction((): StrokeRow => {
    const existing = findExisting();
    if (existing) return existing;

    const result = db.run(
      "INSERT INTO strokes (board_id, page, client_id, local_id, stroke_data) VALUES (?, ?, ?, ?, ?)",
      [boardId, page, cleanClientId, cleanLocalId, strokeData.trim().slice(0, 20000)],
    );
    return db.query(
      `SELECT ${STROKE_COLUMNS} FROM strokes WHERE id = ?`,
    ).get(Number(result.lastInsertRowid)) as StrokeRow;
  });

  try {
    return insertOrReuse();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = findExisting();
      if (existing) return existing;
    }
    throw error;
  }
}

export function updateStroke(
  db: Database,
  boardId: number,
  id: number,
  page: number,
  strokeData: string,
): StrokeRow | null {
  const update = db.transaction((): StrokeRow | null => {
    const result = db.run(
      "UPDATE strokes SET stroke_data = ? WHERE board_id = ? AND id = ? AND page = ?",
      [strokeData.trim().slice(0, 20000), boardId, id, page],
    );
    if (result.changes <= 0) return null;
    return db.query(
      `SELECT ${STROKE_COLUMNS} FROM strokes WHERE id = ?`,
    ).get(id) as StrokeRow;
  });
  return update();
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

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || error.message.includes("UNIQUE constraint failed");
}
