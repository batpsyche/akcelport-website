// Shared test setup: a real PostgreSQL database (TEST_DATABASE_URL, or DATABASE_URL with "_test" appended to the
// database name), migrated and truncated before each test file; temp media and publish directories.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { loadDotEnv, loadConfig, cmsRoot, type Config } from '../server/src/config.ts';
import { migrate } from '../server/src/migrate.ts';

loadDotEnv();

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run the tests');
  const u = new URL(base);
  u.pathname = u.pathname.replace(/\/?$/, '') + '_test';
  return u.toString();
}

async function ensureDatabase(url: string): Promise<void> {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!r.rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

export interface TestEnv { pool: pg.Pool; config: Config; tmp: string; siteRoot: string; cleanup: () => Promise<void> }

export async function setupTestEnv(): Promise<TestEnv> {
  const url = testDatabaseUrl();
  await ensureDatabase(url);
  const tmp = mkdtempSync(join(tmpdir(), 'akcelport-cms-'));
  const siteRoot = resolve(cmsRoot, '..');
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    SESSION_SECRET: 'test-session-secret-0123456789-0123456789',
    MEDIA_DIR: join(tmp, 'media'),
    PUBLISH_DIR: join(tmp, 'publish'),
    SITE_ROOT: siteRoot,
    PUBLISH_KEEP: '2',
    SESSION_SECURE: '0',
  });
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  await migrate(pool);
  await pool.query('TRUNCATE products, families, downloads, pages, redirects, media, content_versions, audit_log, publishes, sessions, login_attempts, password_tokens, users, app_settings RESTART IDENTITY CASCADE');
  return {
    pool, config, tmp, siteRoot,
    cleanup: async () => { await pool.end(); rmSync(tmp, { recursive: true, force: true }); },
  };
}

// ---- HTTP helpers on top of Fastify's inject (no network).
import type { FastifyInstance, InjectOptions } from 'fastify';
import { createUser } from '../server/src/users/routes.ts';

export interface Session { cookie: string; csrf: string; user: { id: number; email: string; role: string } }

export async function makeUser(pool: pg.Pool, email: string, role: 'admin' | 'editor', password = 'correct horse battery'): Promise<number> {
  const { user } = await createUser(pool, { email, name: email.split('@')[0], role, password }, null);
  await pool.query('UPDATE users SET must_change_password = false WHERE id = $1', [user.id]);
  return user.id;
}

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') throw new Error('no set-cookie header');
  return first.split(';')[0];
}

export async function login(app: FastifyInstance, email: string, password = 'correct horse battery'): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { cookie: cookieFrom(res), csrf: body.csrfToken, user: body.user };
}

export interface ApiOptions { session?: Session; headers?: Record<string, string>; origin?: string | null; csrf?: string | null; payload?: unknown; rawPayload?: InjectOptions['payload'] }

/** Sends a request the way the browser app does: same-origin Origin header, session cookie and CSRF header. */
export async function api(app: FastifyInstance, method: InjectOptions['method'], url: string, opts: ApiOptions = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', ...(opts.headers ?? {}) };
  if (opts.origin !== null) headers.origin = opts.origin ?? 'http://localhost:3000';
  if (opts.session) {
    headers.cookie = opts.session.cookie;
    if (opts.csrf !== null) headers['x-csrf-token'] = opts.csrf ?? opts.session.csrf;
  }
  const res = await app.inject({ method, url, headers, payload: opts.rawPayload ?? (opts.payload as InjectOptions['payload']) });
  let json: Record<string, unknown> | undefined;
  try { json = res.json(); } catch { json = undefined; }
  return { status: res.statusCode, body: json ?? {}, text: res.body, headers: res.headers };
}

/** Builds a multipart/form-data payload by hand. */
export function multipart(fields: Record<string, string>, file: { name: string; filename: string; type: string; data: Buffer }): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----akcelport${Date.now()}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  parts.push(file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  const payload = Buffer.concat(parts);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(payload.length) } };
}

export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
