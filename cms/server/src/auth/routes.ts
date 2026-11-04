import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type pg from 'pg';
import type { Config } from '../config.ts';
import { hashPassword, verifyPassword, passwordProblem } from './password.ts';
import { createSession, destroySession, destroyUserSessions, hashToken } from './session.ts';
import { HttpError, requireAuth, setSessionCookie, clearSessionCookie } from './plugin.ts';
import { audit } from '../audit.ts';
import { getSetting } from '../settings.ts';

const LOGIN_WINDOW_MIN = 15, MAX_PER_EMAIL = 5, MAX_PER_IP = 20;

export async function canPublish(pool: pg.Pool, role: 'admin' | 'editor'): Promise<boolean> {
  if (role === 'admin') return true;
  return (await getSetting(pool, 'editors_can_publish', true)) === true;
}

export async function createPasswordToken(db: pg.Pool | pg.PoolClient, userId: number, purpose: 'setup' | 'reset', createdBy: number | null): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query('DELETE FROM password_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await db.query(
    `INSERT INTO password_tokens (token_hash, user_id, purpose, expires_at, created_by) VALUES ($1,$2,$3, now() + interval '48 hours', $4)`,
    [hashToken(token), userId, purpose, createdBy],
  );
  return token;
}

export async function authRoutes(app: FastifyInstance, opts: { pool: pg.Pool; config: Config }) {
  const { pool, config } = opts;

  const me = async (req: FastifyRequest) => ({
    user: req.user!,
    csrfToken: req.session!.csrfToken,
    canPublish: await canPublish(pool, req.user!.role),
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
    const recent = await pool.query<{ by_email: number; by_ip: number }>(
      `SELECT (SELECT count(*) FROM login_attempts WHERE email = $1 AND NOT succeeded AND at > now() - make_interval(mins => $3))::int AS by_email,
              (SELECT count(*) FROM login_attempts WHERE ip = $2 AND NOT succeeded AND at > now() - make_interval(mins => $3))::int AS by_ip`,
      [body.email, req.ip, LOGIN_WINDOW_MIN],
    );
    if (recent.rows[0].by_email >= MAX_PER_EMAIL || recent.rows[0].by_ip >= MAX_PER_IP) {
      throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${LOGIN_WINDOW_MIN} minutes.`);
    }
    const user = (await pool.query(`SELECT id, email, name, role, password_hash, is_active, must_change_password FROM users WHERE email = $1`, [body.email])).rows[0];
    const ok = !!user && user.is_active && (await verifyPassword(body.password, user.password_hash));
    await pool.query('INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1,$2,$3)', [body.email, req.ip, ok]);
    if (!ok) throw new HttpError(401, 'Wrong email or password');
    const { token, csrfToken } = await createSession(pool, user.id, { ip: req.ip, userAgent: req.headers['user-agent'] }, config);
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    setSessionCookie(reply, token, config);
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.must_change_password };
    await audit(pool, req, { action: 'auth.login', entityType: 'user', entityId: user.id, label: user.email });
    return { user: req.user, csrfToken, canPublish: await canPublish(pool, user.role) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionToken) await destroySession(pool, req.sessionToken);
    clearSessionCookie(reply, config);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => me(req));

  app.post('/api/auth/change-password', { preHandler: requireAuth }, async (req) => {
    const body = z.object({ currentPassword: z.string(), newPassword: z.string() }).parse(req.body);
    const problem = passwordProblem(body.newPassword);
    if (problem) throw new HttpError(400, problem);
    const row = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id])).rows[0];
    if (!(await verifyPassword(body.currentPassword, row?.password_hash))) throw new HttpError(400, 'Current password is wrong');
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2', [await hashPassword(body.newPassword), req.user!.id]);
    await destroyUserSessions(pool, req.user!.id, req.session!.id);
    await audit(pool, req, { action: 'auth.change-password', entityType: 'user', entityId: req.user!.id, label: req.user!.email });
    return { ok: true };
  });

  app.get('/api/auth/token-info', async (req) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    const row = (await pool.query(
      `SELECT u.email, t.purpose FROM password_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.is_active`,
      [hashToken(q.token)],
    )).rows[0];
    if (!row) throw new HttpError(404, 'This link is invalid or has expired');
    return { email: row.email, purpose: row.purpose };
  });

  app.post('/api/auth/set-password', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = z.object({ token: z.string().min(10), password: z.string() }).parse(req.body);
    const problem = passwordProblem(body.password);
    if (problem) throw new HttpError(400, problem);
    const row = (await pool.query(
      `SELECT t.user_id, u.email, u.name, u.role FROM password_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.is_active`,
      [hashToken(body.token)],
    )).rows[0];
    if (!row) throw new HttpError(400, 'This link is invalid or has expired');
    await pool.query('UPDATE password_tokens SET used_at = now() WHERE token_hash = $1', [hashToken(body.token)]);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2', [await hashPassword(body.password), row.user_id]);
    await destroyUserSessions(pool, row.user_id);
    const { token, csrfToken } = await createSession(pool, row.user_id, { ip: req.ip, userAgent: req.headers['user-agent'] }, config);
    setSessionCookie(reply, token, config);
    req.user = { id: row.user_id, email: row.email, name: row.name, role: row.role, mustChangePassword: false };
    await audit(pool, req, { action: 'auth.set-password', entityType: 'user', entityId: row.user_id, label: row.email });
    return { user: req.user, csrfToken, canPublish: await canPublish(pool, row.role) };
  });
}
