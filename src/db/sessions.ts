import type { Database } from "bun:sqlite";

const ADMIN_PASSWORD = process.env.BOARD_ADMIN_PASSWORD;
const DEFAULT_BCRYPT_COST = 10;

/** Seed the admin password from the environment on first boot. */
export function seedAdminPassword(db: Database): void {
  const existing = db.query("SELECT value FROM config WHERE key = 'admin_password'").get() as { value: string } | null;
  if (!existing && ADMIN_PASSWORD) {
    const hashed = Bun.password.hashSync(ADMIN_PASSWORD, {
      algorithm: "bcrypt",
      cost: DEFAULT_BCRYPT_COST,
    });
    db.run("INSERT INTO config (key, value) VALUES ('admin_password', ?)", [hashed]);
  }
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
