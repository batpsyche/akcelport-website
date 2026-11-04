import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { setupTestEnv, makeUser, login, api, cookieFrom, type TestEnv } from './helpers.ts';
import { buildApp } from '../server/src/app.ts';
import { seedFromSite } from '../server/src/seed.ts';

let env: TestEnv;
let app: FastifyInstance;
before(async () => {
  env = await setupTestEnv();
  await seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir });
  await makeUser(env.pool, 'admin@example.com', 'admin');
  await makeUser(env.pool, 'editor@example.com', 'editor');
  app = await buildApp(env.config, env.pool);
});
after(async () => { await app.close(); await env.cleanup(); });

test('login sets a hardened session cookie and rejects wrong passwords', async () => {
  const bad = await api(app, 'POST', '/api/auth/login', { payload: { email: 'admin@example.com', password: 'nope-nope-nope' } });
  assert.equal(bad.status, 401);
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'correct horse battery' }, headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });
  assert.equal(res.statusCode, 200);
  const setCookie = String(res.headers['set-cookie']);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Secure/, 'test config runs over http');
  const session = { cookie: cookieFrom(res), csrf: res.json().csrfToken, user: res.json().user };
  const me = await api(app, 'GET', '/api/auth/me', { session });
  assert.equal(me.status, 200);
  assert.equal((me.body.user as { email: string }).email, 'admin@example.com');
  assert.equal(me.body.csrfToken, session.csrf);
});

test('unauthenticated requests get 401 and a tampered cookie is ignored', async () => {
  assert.equal((await api(app, 'GET', '/api/products')).status, 401);
  const s = await login(app, 'editor@example.com');
  const tampered = { ...s, cookie: s.cookie.slice(0, -4) + 'zzzz' };
  assert.equal((await api(app, 'GET', '/api/products', { session: tampered })).status, 401);
});

test('state-changing requests need a same-origin Origin and the CSRF header', async () => {
  const s = await login(app, 'editor@example.com');
  const product = (await api(app, 'GET', '/api/products', { session: s })).body.items as Array<{ id: number }>;
  const target = `/api/products/${product[0].id}/status`;
  assert.equal((await api(app, 'POST', target, { session: s, csrf: null, payload: { status: 'live' } })).status, 403, 'missing CSRF header');
  assert.equal((await api(app, 'POST', target, { session: s, csrf: 'wrong', payload: { status: 'live' } })).status, 403, 'wrong CSRF header');
  assert.equal((await api(app, 'POST', target, { session: s, origin: 'https://evil.example', payload: { status: 'live' } })).status, 403, 'cross-site origin');
  assert.equal((await api(app, 'POST', target, { session: s, payload: { status: 'live' } })).status, 200, 'same-origin with CSRF header');
});

test('roles are enforced on the server', async () => {
  const editor = await login(app, 'editor@example.com');
  const admin = await login(app, 'admin@example.com');
  assert.equal((await api(app, 'GET', '/api/users', { session: editor })).status, 403);
  assert.equal((await api(app, 'GET', '/api/users', { session: admin })).status, 200);
  assert.equal((await api(app, 'GET', '/api/pages/site', { session: editor })).status, 403);
  assert.equal((await api(app, 'GET', '/api/pages/site', { session: admin })).status, 200);
  assert.equal((await api(app, 'GET', '/api/pages/about', { session: editor })).status, 200);
  assert.equal((await api(app, 'POST', '/api/redirects', { session: editor, payload: { kind: 'page', from_path: '/x.php', to_path: '/' } })).status, 403);
  assert.equal((await api(app, 'PUT', '/api/settings', { session: editor, payload: { editorsCanPublish: false } })).status, 403);
  assert.equal((await api(app, 'POST', '/api/publish/rollback', { session: editor, payload: { releaseId: 'x' } })).status, 403);
  // Editors can publish by default; the admin can switch that off.
  assert.equal((await api(app, 'GET', '/api/auth/me', { session: editor })).body.canPublish, true);
  assert.equal((await api(app, 'PUT', '/api/settings', { session: admin, payload: { editorsCanPublish: false } })).status, 200);
  assert.equal((await api(app, 'GET', '/api/auth/me', { session: editor })).body.canPublish, false);
  assert.equal((await api(app, 'POST', '/api/publish', { session: editor, payload: {} })).status, 403);
  await api(app, 'PUT', '/api/settings', { session: admin, payload: { editorsCanPublish: true } });
});

test('login is rate limited per account after repeated failures', async () => {
  await makeUser(env.pool, 'victim@example.com', 'editor');
  for (let i = 0; i < 5; i++) {
    const r = await api(app, 'POST', '/api/auth/login', { payload: { email: 'victim@example.com', password: 'wrong-password-1' } });
    assert.equal(r.status, 401);
  }
  const blocked = await api(app, 'POST', '/api/auth/login', { payload: { email: 'victim@example.com', password: 'correct horse battery' } });
  assert.equal(blocked.status, 429);
});

test('admin creates a user with a one-time setup link, and resets passwords', async () => {
  const admin = await login(app, 'admin@example.com');
  const created = await api(app, 'POST', '/api/users', { session: admin, payload: { email: 'new@example.com', name: 'New Person', role: 'editor' } });
  assert.equal(created.status, 201);
  const setupPath = created.body.setupPath as string;
  assert.match(setupPath, /^\/set-password\?token=/);
  const token = setupPath.split('token=')[1];
  const info = await api(app, 'GET', `/api/auth/token-info?token=${token}`);
  assert.equal(info.status, 200);
  assert.equal(info.body.email, 'new@example.com');
  assert.equal((await api(app, 'POST', '/api/auth/set-password', { payload: { token, password: 'short' } })).status, 400);
  const set = await api(app, 'POST', '/api/auth/set-password', { payload: { token, password: 'a fine long password' } });
  assert.equal(set.status, 200, set.text);
  assert.equal((await api(app, 'POST', '/api/auth/set-password', { payload: { token, password: 'a fine long password' } })).status, 400, 'token is single use');
  const fresh = await login(app, 'new@example.com', 'a fine long password');
  assert.equal(fresh.user.role, 'editor');

  // Reset by link: the old session dies, the new password works.
  const users = (await api(app, 'GET', '/api/users', { session: admin })).body.users as Array<{ id: number; email: string }>;
  const target = users.find((u) => u.email === 'new@example.com')!;
  const reset = await api(app, 'POST', `/api/users/${target.id}/reset-password`, { session: admin, payload: {} });
  assert.equal(reset.status, 200);
  assert.equal((await api(app, 'GET', '/api/auth/me', { session: fresh })).status, 401, 'old session destroyed');
  const t2 = (reset.body.resetPath as string).split('token=')[1];
  assert.equal((await api(app, 'POST', '/api/auth/set-password', { payload: { token: t2, password: 'another long password' } })).status, 200);
  assert.equal((await login(app, 'new@example.com', 'another long password')).user.email, 'new@example.com');

  // Deactivation blocks login; the last admin cannot be demoted.
  assert.equal((await api(app, 'PATCH', `/api/users/${target.id}`, { session: admin, payload: { is_active: false } })).status, 200);
  assert.equal((await api(app, 'POST', '/api/auth/login', { payload: { email: 'new@example.com', password: 'another long password' } })).status, 401);
  assert.equal((await api(app, 'PATCH', `/api/users/${admin.user.id}`, { session: admin, payload: { role: 'editor' } })).status, 400);
});

test('change password and logout', async () => {
  await makeUser(env.pool, 'changer@example.com', 'editor');
  const s = await login(app, 'changer@example.com');
  assert.equal((await api(app, 'POST', '/api/auth/change-password', { session: s, payload: { currentPassword: 'wrong wrong wrong', newPassword: 'brand new password' } })).status, 400);
  assert.equal((await api(app, 'POST', '/api/auth/change-password', { session: s, payload: { currentPassword: 'correct horse battery', newPassword: 'brand new password' } })).status, 200);
  assert.equal((await api(app, 'GET', '/api/auth/me', { session: s })).status, 200, 'current session survives');
  assert.equal((await api(app, 'POST', '/api/auth/logout', { session: s })).status, 200);
  assert.equal((await api(app, 'GET', '/api/auth/me', { session: s })).status, 401);
  assert.equal((await login(app, 'changer@example.com', 'brand new password')).user.email, 'changer@example.com');
});

test('a temporary password locks the API down to me, change-password and logout until it is changed', async () => {
  const admin = await login(app, 'admin@example.com');
  const created = await api(app, 'POST', '/api/users', { session: admin, payload: { email: 'temp@example.com', name: 'Temp', role: 'editor', password: 'temporary password 1' } });
  assert.equal(created.status, 201, created.text);
  const s = await login(app, 'temp@example.com', 'temporary password 1');
  assert.equal(s.user.email, 'temp@example.com');
  const blocked = await api(app, 'GET', '/api/products', { session: s });
  assert.equal(blocked.status, 403);
  assert.equal((blocked.body.details as { code: string }).code, 'password_change_required');
  assert.equal((await api(app, 'POST', '/api/publish/preview', { session: s })).status, 403);
  assert.equal((await api(app, 'GET', '/api/pending', { session: s })).status, 403);
  const me = await api(app, 'GET', '/api/auth/me', { session: s });
  assert.equal(me.status, 200);
  assert.equal((me.body.user as { mustChangePassword: boolean }).mustChangePassword, true);
  assert.equal((await api(app, 'POST', '/api/auth/change-password', { session: s, payload: { currentPassword: 'temporary password 1', newPassword: 'my very own password' } })).status, 200);
  assert.equal((await api(app, 'GET', '/api/products', { session: s })).status, 200, 'unlocked after the change');
  assert.equal(((await api(app, 'GET', '/api/auth/me', { session: s })).body.user as { mustChangePassword: boolean }).mustChangePassword, false);
  // Logout stays available while locked.
  const s2 = await login(app, 'editor@example.com');
  await env.pool.query('UPDATE users SET must_change_password = true WHERE email = $1', ['editor@example.com']);
  assert.equal((await api(app, 'GET', '/api/products', { session: s2 })).status, 403);
  assert.equal((await api(app, 'POST', '/api/auth/logout', { session: s2 })).status, 200);
  await env.pool.query('UPDATE users SET must_change_password = false WHERE email = $1', ['editor@example.com']);
});

test('audit log records who did what', async () => {
  const admin = await login(app, 'admin@example.com');
  const r = await api(app, 'GET', '/api/audit?limit=20', { session: admin });
  assert.equal(r.status, 200);
  const entries = r.body.entries as Array<{ action: string; userEmail: string }>;
  assert.ok(entries.some((e) => e.action === 'user.create' && e.userEmail === 'admin@example.com'));
  assert.ok(entries.some((e) => e.action === 'settings.update'));
});

test('the audit log shows sign-in IP addresses to administrators only', async () => {
  const admin = await login(app, 'admin@example.com');
  const editor = await login(app, 'editor@example.com');
  const forAdmin = (await api(app, 'GET', '/api/audit?limit=20', { session: admin })).body.entries as Array<Record<string, unknown>>;
  const forEditor = (await api(app, 'GET', '/api/audit?limit=20', { session: editor })).body.entries as Array<Record<string, unknown>>;
  assert.ok(forAdmin.length > 0 && forEditor.length > 0);
  assert.ok(forAdmin.every((e) => 'ip' in e), 'admin entries carry the ip field');
  assert.ok(forAdmin.some((e) => e.action === 'auth.login' && typeof e.ip === 'string'), 'login entries record the client address');
  assert.ok(forEditor.every((e) => !('ip' in e)), 'editor entries omit the ip field');
  assert.ok(forEditor.some((e) => e.action === 'auth.login' && e.userEmail === 'admin@example.com'), 'who, what and when stay visible to editors');
});

test('static assets do not count against the per-IP API rate limit', async () => {
  const s = await login(app, 'editor@example.com');
  const media = (await api(app, 'GET', '/api/media', { session: s })).body.media as Array<{ path: string }>;
  const remainingBefore = Number((await api(app, 'GET', '/api/auth/me', { session: s })).headers['x-ratelimit-remaining']);
  assert.ok(Number.isInteger(remainingBefore), 'API responses carry the rate-limit headers');
  mkdirSync(app.publishService.previewDir, { recursive: true });
  writeFileSync(join(app.publishService.previewDir, 'index.html'), '<!doctype html><title>preview</title>');
  const statics = ['/index.html', '/favicon.png', '/fonts/archivo-100-900.woff2', `/media/${media[0].path}`, '/preview/index.html'];
  for (let i = 0; i < 20; i++) {
    for (const url of statics) {
      const res = await api(app, 'GET', url, { session: s });
      assert.notEqual(res.status, 429, url);
      assert.equal(res.headers['x-ratelimit-remaining'], undefined, `${url} is not rate limited`);
    }
  }
  const remainingAfter = Number((await api(app, 'GET', '/api/auth/me', { session: s })).headers['x-ratelimit-remaining']);
  assert.equal(remainingAfter, remainingBefore - 1, 'only the API calls were counted');
});

test('a percent-encoded spelling of /api/ is still rate limited and CSRF checked', async () => {
  const s = await login(app, 'editor@example.com');
  const before = Number((await api(app, 'GET', '/api/auth/me', { session: s })).headers['x-ratelimit-remaining']);
  const encoded = await api(app, 'GET', '/%61pi/auth/me', { session: s });
  assert.equal(encoded.status, 200, 'the router matches the decoded path');
  assert.equal(Number(encoded.headers['x-ratelimit-remaining']), before - 1, 'the encoded path consumed the API budget');
  const products = (await api(app, 'GET', '/api/products', { session: s })).body.items as Array<{ id: number }>;
  assert.equal((await api(app, 'POST', `/%61pi/products/${products[0].id}/status`, { session: s, csrf: null, payload: { status: 'live' } })).status, 403, 'missing CSRF header');
  await env.pool.query('UPDATE users SET must_change_password = true WHERE email = $1', ['editor@example.com']);
  try {
    assert.equal((await api(app, 'GET', '/%61pi/products', { session: s })).status, 403, 'password change still required');
    assert.equal((await api(app, 'GET', '/%61pi/auth/me', { session: s })).status, 200, 'the exempt route is exempt however it is spelled');
  } finally {
    await env.pool.query('UPDATE users SET must_change_password = false WHERE email = $1', ['editor@example.com']);
  }
});
