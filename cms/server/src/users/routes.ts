import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type pg from 'pg';
import type { Config } from '../config.ts';
import { hashPassword, passwordProblem } from '../auth/password.ts';
import { destroyUserSessions } from '../auth/session.ts';
import { HttpError, requireAdmin } from '../auth/plugin.ts';
import { createPasswordToken } from '../auth/routes.ts';
import { audit } from '../audit.ts';

const USER_COLS = 'id, email, name, role, is_active, must_change_password, created_at, updated_at, last_login_at';

export async function createUser(pool: pg.Pool, input: { email: string; name: string; role: 'admin' | 'editor'; password?: string }, createdBy: number | null) {
  const hash = input.password ? await hashPassword(input.password) : null;
  const r = await pool.query(
    `INSERT INTO users (email, name, role, password_hash, must_change_password) VALUES ($1,$2,$3,$4,$5) RETURNING ${USER_COLS}`,
    [input.email.trim().toLowerCase(), input.name.trim(), input.role, hash, !!input.password && createdBy !== null],
  );
  const user = r.rows[0];
  const setupToken = hash ? null : await createPasswordToken(pool, user.id, 'setup', createdBy);
  return { user, setupToken };
}

export async function userRoutes(app: FastifyInstance, opts: { pool: pg.Pool; config: Config }) {
  const { pool } = opts;
  app.addHook('preHandler', requireAdmin);

  app.get('/api/users', async () => ({ users: (await pool.query(`SELECT ${USER_COLS} FROM users ORDER BY created_at, id`)).rows }));

  app.post('/api/users', async (req, reply) => {
    const body = z.object({
      email: z.string().trim().toLowerCase().email(),
      name: z.string().trim().max(120).default(''),
      role: z.enum(['admin', 'editor']),
      password: z.string().optional(),
    }).parse(req.body);
    if (body.password) { const p = passwordProblem(body.password); if (p) throw new HttpError(400, p); }
    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
    if (exists.rowCount) throw new HttpError(409, 'A user with this email already exists');
    const { user, setupToken } = await createUser(pool, body, req.user!.id);
    await audit(pool, req, { action: 'user.create', entityType: 'user', entityId: user.id, label: user.email, changes: { role: user.role, withPassword: !!body.password } });
    reply.code(201);
    return { user, setupPath: setupToken ? `/set-password?token=${setupToken}` : null };
  });

  app.patch('/api/users/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ name: z.string().trim().max(120).optional(), role: z.enum(['admin', 'editor']).optional(), is_active: z.boolean().optional() }).parse(req.body);
    const current = (await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id])).rows[0];
    if (!current) throw new HttpError(404, 'User not found');
    const demoting = (body.role && body.role !== 'admin') || body.is_active === false;
    if (demoting && current.role === 'admin' && current.is_active) {
      const admins = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active`);
      if (admins.rows[0].n <= 1) throw new HttpError(400, 'Keep at least one active administrator');
    }
    if (id === req.user!.id && demoting) throw new HttpError(400, 'You cannot demote or deactivate your own account');
    const r = await pool.query(
      `UPDATE users SET name = COALESCE($2, name), role = COALESCE($3, role), is_active = COALESCE($4, is_active), updated_at = now() WHERE id = $1 RETURNING ${USER_COLS}`,
      [id, body.name ?? null, body.role ?? null, body.is_active ?? null],
    );
    if (body.is_active === false) await destroyUserSessions(pool, id);
    await audit(pool, req, { action: 'user.update', entityType: 'user', entityId: id, label: current.email, changes: body });
    return { user: r.rows[0] };
  });

  app.post('/api/users/:id/reset-password', async (req) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ password: z.string().optional() }).parse(req.body ?? {});
    const user = (await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id])).rows[0];
    if (!user) throw new HttpError(404, 'User not found');
    let resetPath: string | null = null;
    if (body.password) {
      const p = passwordProblem(body.password);
      if (p) throw new HttpError(400, p);
      await pool.query('UPDATE users SET password_hash = $1, must_change_password = true, updated_at = now() WHERE id = $2', [await hashPassword(body.password), id]);
    } else {
      resetPath = `/set-password?token=${await createPasswordToken(pool, id, 'reset', req.user!.id)}`;
    }
    await destroyUserSessions(pool, id);
    await audit(pool, req, { action: 'user.reset-password', entityType: 'user', entityId: id, label: user.email, changes: { method: body.password ? 'temporary-password' : 'link' } });
    return { ok: true, resetPath };
  });
}
