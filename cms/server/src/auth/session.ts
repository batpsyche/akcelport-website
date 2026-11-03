import { randomBytes, createHash } from 'node:crypto';
import type { Queryable } from '../db.ts';
import type { Config } from '../config.ts';

export const SESSION_COOKIE = 'akcelport_cms_session';

export interface SessionUser { id: number; email: string; name: string; role: 'admin' | 'editor'; mustChangePassword: boolean }
export interface Session { id: string; userId: number; csrfToken: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date }

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(db: Queryable, userId: number, meta: { ip?: string; userAgent?: string }, config: Config): Promise<{ token: string; csrfToken: string }> {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionMaxMs);
  await db.query(
    `INSERT INTO sessions (id, user_id, csrf_token, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
    [hashToken(token), userId, csrfToken, expiresAt, meta.ip ?? null, (meta.userAgent ?? '').slice(0, 300)],
  );
  return { token, csrfToken };
}

interface Row {
  id: string; user_id: number; csrf_token: string; created_at: Date; last_seen_at: Date; expires_at: Date;
  email: string; name: string; role: 'admin' | 'editor'; is_active: boolean; must_change_password: boolean;
}

/** Resolves a cookie token to its session and user, enforcing the idle and absolute timeouts. */
export async function findSession(db: Queryable, token: string, config: Config): Promise<{ session: Session; user: SessionUser } | undefined> {
  const id = hashToken(token);
  const r = await db.query<Row>(
    `SELECT s.id, s.user_id, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at, u.email, u.name, u.role, u.is_active, u.must_change_password
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return undefined;
  const now = Date.now();
  const idle = now - new Date(row.last_seen_at).getTime() > config.sessionIdleMs;
  const expired = now > new Date(row.expires_at).getTime();
  if (idle || expired || !row.is_active) {
    await db.query('DELETE FROM sessions WHERE id = $1', [id]);
    return undefined;
  }
  if (now - new Date(row.last_seen_at).getTime() > 5 * 60_000) await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [id]);
  return {
    session: { id: row.id, userId: row.user_id, csrfToken: row.csrf_token, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at },
    user: { id: row.user_id, email: row.email, name: row.name, role: row.role, mustChangePassword: row.must_change_password },
  };
}

export async function destroySession(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [hashToken(token)]);
}

export async function destroyUserSessions(db: Queryable, userId: number, exceptSessionId?: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND ($2::text IS NULL OR id <> $2)', [userId, exceptSessionId ?? null]);
}

export async function purgeExpiredSessions(db: Queryable): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
  await db.query(`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`);
  await db.query(`DELETE FROM password_tokens WHERE expires_at < now() - interval '7 days'`);
}
