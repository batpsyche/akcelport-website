import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readlinkSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { setupTestEnv, makeUser, login, api, type TestEnv, type Session } from './helpers.ts';
import { buildApp } from '../server/src/app.ts';
import { buildSiteServer } from '../server/src/site-server.ts';
import { seedFromSite } from '../server/src/seed.ts';
import { PublishService } from '../server/src/publish/service.ts';
import type pg from 'pg';

/** A pool whose transaction clients fail at COMMIT when `failCommit` is set, and whose publish records fail when `failRecord` is set. */
function faultyPool(pool: pg.Pool, faults: { failCommit?: boolean; failRecord?: boolean }): pg.Pool {
  const query = (text: string, ...rest: unknown[]) => {
    if (faults.failRecord && text.startsWith('INSERT INTO publishes')) return Promise.reject(new Error('database unavailable'));
    return (pool.query as (...a: unknown[]) => Promise<unknown>)(text, ...rest);
  };
  const connect = async () => {
    const client = await pool.connect();
    return new Proxy(client, {
      get(target, prop) {
        if (prop === 'query') return (text: string, ...rest: unknown[]) => (faults.failCommit && text === 'COMMIT' ? Promise.reject(new Error('connection lost')) : (target.query as (...a: unknown[]) => Promise<unknown>)(text, ...rest));
        const v = (target as unknown as Record<PropertyKey, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
  };
  return { query, connect } as unknown as pg.Pool;
}

let env: TestEnv;
let app: FastifyInstance;
let site: FastifyInstance;
let admin: Session;
let editor: Session;
before(async () => {
  env = await setupTestEnv();
  await seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir });
  await makeUser(env.pool, 'admin@example.com', 'admin');
  await makeUser(env.pool, 'editor@example.com', 'editor');
  app = await buildApp(env.config, env.pool);
  site = await buildSiteServer(env.config);
  admin = await login(app, 'admin@example.com');
  editor = await login(app, 'editor@example.com');
});
after(async () => { await app.close(); await site.close(); await env.cleanup(); });

const current = () => readlinkSync(join(env.config.publishDir, 'current')).split('/').pop()!;
const page = async (url: string) => (await site.inject({ method: 'GET', url })).body;
const productId = async (slug: string) => ((await api(app, 'GET', '/api/products', { session: editor })).body.items as Array<{ id: number; slug: string }>).find((p) => p.slug === slug)!.id;

test('before any publish the site server shows a placeholder', async () => {
  assert.match(await page('/'), /Nothing published yet/);
});

test('publish builds the site into a release, swaps current atomically and serves it', async () => {
  const r = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: 'all' } });
  assert.equal(r.status, 200, r.text);
  const releaseId = r.body.releaseId as string;
  assert.equal(current(), releaseId);
  assert.ok(existsSync(join(env.config.publishDir, 'releases', releaseId, 'products/cable-lugs/index.html')));
  assert.match(await page('/products/cable-lugs/'), /Cable Lugs/);
  assert.match(await page('/'), /Akcelport/);
  const red = await site.inject({ method: 'GET', url: '/cable-lugs.php' });
  assert.equal(red.statusCode, 301);
  assert.equal(red.headers.location, '/products/cable-lugs/');
  assert.equal((await site.inject({ method: 'GET', url: '/no-such-page/' })).statusCode, 404);
  const history = await api(app, 'GET', '/api/publish', { session: editor });
  assert.equal(history.body.current, releaseId);
  const publishes = history.body.publishes as Array<{ kind: string; status: string; releaseId: string }>;
  assert.equal(publishes[0].status, 'success');
  assert.equal(publishes[0].kind, 'publish');
});

test('an edited product goes live only after publish; the draft is promoted', async () => {
  const id = await productId('cable-lugs');
  const body = (await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.body as Record<string, unknown>;
  const saved = await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { body: { ...body, summary: 'A freshly published summary.' } } });
  assert.equal(saved.status, 200, saved.text);
  assert.doesNotMatch(await page('/products/cable-lugs/'), /freshly published/);
  const first = current();
  const r = await api(app, 'POST', '/api/publish', { session: editor, payload: {} });
  assert.equal(r.status, 200, r.text);
  assert.notEqual(current(), first);
  assert.match(await page('/products/cable-lugs/'), /A freshly published summary\./);
  const after = await api(app, 'GET', `/api/products/${id}`, { session: editor });
  assert.equal((after.body.item as { hasDraft: boolean; pending: boolean }).hasDraft, false);
  assert.equal((after.body.live as { summary: string }).summary, 'A freshly published summary.');
  assert.deepEqual(((await api(app, 'GET', '/api/pending', { session: editor })).body.items as unknown[]), []);
});

test('a failed build leaves the published site and the drafts untouched', async () => {
  const before = current();
  const id = await productId('flexibars');
  const body = (await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.body as Record<string, unknown>;
  await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { body: { ...body, summary: 'Should stay a draft.' } } });
  // A redirect to a product that does not exist fails the site's own content check.
  const bad = await api(app, 'POST', '/api/redirects', { session: admin, payload: { kind: 'page', from_path: '/ghost.php', to_path: '/products/ghost/' } });
  assert.equal(bad.status, 201);
  const r = await api(app, 'POST', '/api/publish', { session: admin, payload: {} });
  assert.equal(r.status, 422, r.text);
  assert.match(r.text, /nothing was published/);
  assert.match(JSON.stringify(r.body.details), /redirect \/ghost\.php/);
  assert.equal(current(), before, 'current release unchanged');
  assert.doesNotMatch(await page('/products/flexibars/'), /Should stay a draft/);
  const after = await api(app, 'GET', `/api/products/${id}`, { session: editor });
  assert.equal((after.body.item as { hasDraft: boolean }).hasDraft, true, 'draft was rolled back, still pending');
  const publishes = (await api(app, 'GET', '/api/publish', { session: admin })).body.publishes as Array<{ status: string; error: string }>;
  assert.equal(publishes[0].status, 'failed');
  assert.match(publishes[0].error, /build failed/);
  // Remove the bad redirect; publishing works again.
  const ghost = ((bad.body.redirects as Array<{ id: number; fromPath: string }>).find((x) => x.fromPath === '/ghost.php'))!;
  await api(app, 'DELETE', `/api/redirects/${ghost.id}`, { session: admin });
  assert.equal((await api(app, 'POST', '/api/publish', { session: admin, payload: {} })).status, 200);
  assert.match(await page('/products/flexibars/'), /Should stay a draft\./);
});

test('preview builds the drafts under /preview/ for signed-in users only', async () => {
  const id = await productId('earth-rods');
  const body = (await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.body as Record<string, unknown>;
  await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { body: { ...body, summary: 'Preview-only wording.' } } });
  const r = await api(app, 'POST', '/api/publish/preview', { session: editor });
  assert.equal(r.status, 200, r.text);
  const prev = await app.inject({ method: 'GET', url: '/preview/products/earth-rods/', headers: { cookie: editor.cookie } });
  assert.equal(prev.statusCode, 200);
  assert.match(prev.body, /Preview-only wording\./);
  assert.match(prev.body, /href="\/preview\/assets\/site\.css/, 'preview is built for the /preview/ sub-folder');
  assert.equal((await app.inject({ method: 'GET', url: '/preview/products/earth-rods/' })).statusCode, 401);
  assert.doesNotMatch(await page('/products/earth-rods/'), /Preview-only wording/);
  await api(app, 'POST', `/api/products/${id}/discard`, { session: editor });
});

test('selective publish promotes only the chosen items', async () => {
  const a = await productId('cable-ducts');
  const b = await productId('panel-hinges');
  for (const [id, text] of [[a, 'Ducts selected.'], [b, 'Hinges not selected.']] as Array<[number, string]>) {
    const body = (await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.body as Record<string, unknown>;
    await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { body: { ...body, summary: text } } });
  }
  const r = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: { products: [a] } } });
  assert.equal(r.status, 200, r.text);
  assert.match(await page('/products/cable-ducts/'), /Ducts selected\./);
  assert.doesNotMatch(await page('/products/panel-hinges/'), /Hinges not selected/);
  const pending = (await api(app, 'GET', '/api/pending', { session: editor })).body.items as Array<{ slug: string }>;
  assert.deepEqual(pending.map((p) => p.slug), ['panel-hinges']);
  await api(app, 'POST', `/api/products/${b}/discard`, { session: editor });
});

test('a renamed product keeps its published address until the rename itself is published', async () => {
  const id = await productId('cable-glands');
  const full = await api(app, 'GET', `/api/products/${id}`, { session: editor });
  const saved = await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { slug: 'cable-glands-renamed', body: full.body.body } });
  assert.equal(saved.status, 200, saved.text);
  const about = (await api(app, 'GET', '/api/pages/about', { session: editor })).body.body as Record<string, unknown>;
  await api(app, 'PUT', '/api/pages/about', { session: editor, payload: { body: { ...about, title: 'About, republished' } } });
  const r = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: { pages: ['about'] } } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await site.inject({ method: 'GET', url: '/products/cable-glands/' })).statusCode, 200, 'old address still served');
  assert.equal((await site.inject({ method: 'GET', url: '/products/cable-glands-renamed/' })).statusCode, 404);
  const pending = (await api(app, 'GET', '/api/pending', { session: editor })).body.items as Array<{ slug: string }>;
  assert.deepEqual(pending.map((p) => p.slug), ['cable-glands-renamed']);
  await api(app, 'POST', `/api/products/${id}/discard`, { session: editor });
  assert.deepEqual(((await api(app, 'GET', '/api/pending', { session: editor })).body.items as unknown[]), []);
});

test('a selection that would publish a product without its family is refused with a clear message', async () => {
  const families = (await api(app, 'GET', '/api/families', { session: editor })).body.items as Array<{ id: number; slug: string }>;
  const template = (await api(app, 'GET', `/api/families/${families[0].id}`, { session: editor })).body.body as Record<string, unknown>;
  const fam = await api(app, 'POST', '/api/families', { session: editor, payload: { slug: 'test-family', body: { ...template, name: 'Test Family', shortName: 'Test' } } });
  assert.equal(fam.status, 201, fam.text);
  const famId = (fam.body.item as { id: number }).id;
  const pBody = (await api(app, 'GET', `/api/products/${await productId('cable-lugs')}`, { session: editor })).body.body as Record<string, unknown>;
  const prod = await api(app, 'POST', '/api/products', { session: editor, payload: { slug: 'test-family-product', familyId: famId, body: { ...pBody, name: 'Test Family Product' } } });
  assert.equal(prod.status, 201, prod.text);
  const prodId = (prod.body.item as { id: number }).id;
  const before = current();
  const refused = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: { products: [prodId] } } });
  assert.equal(refused.status, 422, refused.text);
  assert.equal(refused.body.error, 'Product "test-family-product" cannot go live before its family "test-family": publish them together');
  assert.equal(current(), before, 'nothing published');
  assert.ok(((await api(app, 'GET', '/api/pending', { session: editor })).body.items as Array<{ slug: string }>).some((i) => i.slug === 'test-family-product'), 'product still pending');
  const ok = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: { families: [famId], products: [prodId] } } });
  assert.equal(ok.status, 200, ok.text);
  assert.match(await page('/products/test-family-product/'), /Test Family Product/);
});

test('hidden items disappear at publish, deletions apply, old releases are pruned, rollback restores a release', async () => {
  const id = await productId('spiral-wrapping-bands');
  await api(app, 'POST', `/api/products/${id}/status`, { session: editor, payload: { status: 'hidden' } });
  const before = current();
  // The home page still lists the product under an industry: the content check refuses with a clear message.
  const refused = await api(app, 'POST', '/api/publish', { session: admin, payload: {} });
  assert.equal(refused.status, 422, refused.text);
  assert.match(JSON.stringify(refused.body.details), /home industry rail: unknown product spiral-wrapping-bands/);
  assert.equal(current(), before);
  const home = (await api(app, 'GET', '/api/pages/home', { session: editor })).body.body as { industries: { items: Array<{ products: string[] }> } };
  home.industries.items = home.industries.items.map((t) => ({ ...t, products: t.products.filter((p) => p !== 'spiral-wrapping-bands') }));
  assert.equal((await api(app, 'PUT', '/api/pages/home', { session: editor, payload: { body: home } })).status, 200);
  const r = await api(app, 'POST', '/api/publish', { session: admin, payload: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal((await site.inject({ method: 'GET', url: '/products/spiral-wrapping-bands/' })).statusCode, 404);
  const releases = readdirSync(join(env.config.publishDir, 'releases')).filter((n) => /^\d{8}-/.test(n));
  assert.ok(releases.length <= env.config.publishKeep, `kept ${releases.length} releases (limit ${env.config.publishKeep})`);
  assert.ok(releases.includes(before), 'previous release kept for rollback');

  const rb = await api(app, 'POST', '/api/publish/rollback', { session: admin, payload: { releaseId: before } });
  assert.equal(rb.status, 200, rb.text);
  assert.equal(current(), before);
  assert.equal((await site.inject({ method: 'GET', url: '/products/spiral-wrapping-bands/' })).statusCode, 200, 'rolled back release shows the product again');
  assert.equal((await api(app, 'POST', '/api/publish/rollback', { session: admin, payload: { releaseId: '20000101-000000-zzzz' } })).status, 404);
  await api(app, 'POST', `/api/products/${id}/status`, { session: editor, payload: { status: 'live' } });
});

test('a commit failure after the build leaves the current release and the drafts untouched', async () => {
  const faults = { failCommit: true };
  const service = new PublishService(faultyPool(env.pool, faults), env.config);
  const id = await productId('flexibars');
  const body = (await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.body as Record<string, unknown>;
  await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { body: { ...body, summary: 'Lost in a commit failure.' } } });
  const before = current();
  const releasesBefore = readdirSync(join(env.config.publishDir, 'releases')).sort();
  await assert.rejects(service.publish(editor.user), /connection lost/);
  assert.equal(current(), before, 'current still points at the previous release');
  assert.ok(existsSync(join(env.config.publishDir, 'releases', before, 'index.html')), 'the current release is intact');
  assert.deepEqual(readdirSync(join(env.config.publishDir, 'releases')).sort(), releasesBefore, 'the half-published release is removed');
  assert.doesNotMatch(await page('/products/flexibars/'), /Lost in a commit failure/);
  assert.equal(((await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.item as { hasDraft: boolean }).hasDraft, true, 'promotion rolled back');
  const publishes = (await api(app, 'GET', '/api/publish', { session: admin })).body.publishes as Array<{ status: string; error: string }>;
  assert.equal(publishes[0].status, 'failed');
  assert.match(publishes[0].error, /connection lost/);
  faults.failCommit = false;
  assert.ok(((await service.publish(editor.user)).promoted as Array<{ slug: string }>).some((p) => p.slug === 'flexibars'), 'the same service publishes once the database is back');
  assert.match(await page('/products/flexibars/'), /Lost in a commit failure\./);
});

test('a failure before the build starts does not leave publish or preview locked as busy', async () => {
  const faults = { failRecord: true };
  const service = new PublishService(faultyPool(env.pool, faults), env.config);
  await assert.rejects(service.publish(editor.user), /database unavailable/);
  assert.equal((await service.history()).busy, false);
  await assert.rejects(service.preview(editor.user), /database unavailable/);
  assert.equal((await service.history()).busy, false);
  faults.failRecord = false;
  const r = await service.preview(editor.user);
  assert.ok(r.id > 0, 'preview runs again on the same service');
});

test('a failed symlink swap after commit is recorded, reported, and the built release stays available for rollback', async () => {
  const id = await productId('earth-rods');
  const body = (await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.body as Record<string, unknown>;
  await api(app, 'PUT', `/api/products/${id}`, { session: editor, payload: { body: { ...body, summary: 'Committed but not yet switched.' } } });
  const link = join(env.config.publishDir, 'current');
  const previous = current();
  // A directory sitting where the symlink belongs cannot be replaced by the atomic rename.
  rmSync(link);
  mkdirSync(link);
  writeFileSync(join(link, 'index.html'), 'blocker');
  try {
    const r = await api(app, 'POST', '/api/publish', { session: admin, payload: {} });
    assert.equal(r.status, 500, r.text);
    assert.match(String(r.body.error), /switching the site to release .* failed/);
    const details = r.body.details as { publishId: number; releaseId: string; log: string };
    assert.ok(details.publishId > 0);
    assert.ok(existsSync(join(env.config.publishDir, 'releases', details.releaseId, 'products/earth-rods/index.html')), 'the built release is kept');
    const publishes = (await api(app, 'GET', '/api/publish', { session: admin })).body.publishes as Array<{ id: number; status: string; error: string; releaseId: string }>;
    assert.equal(publishes[0].id, details.publishId);
    assert.equal(publishes[0].status, 'failed');
    assert.match(publishes[0].error, /switching the site to release/);
    assert.equal(publishes[0].releaseId, details.releaseId);
    assert.equal(((await api(app, 'GET', `/api/products/${id}`, { session: editor })).body.item as { hasDraft: boolean }).hasDraft, false, 'the promotion was committed');
    assert.equal((await api(app, 'GET', '/api/publish', { session: admin })).body.busy, false);
    // Once the obstacle is gone an administrator restores the built release.
    rmSync(link, { recursive: true });
    assert.equal((await api(app, 'POST', '/api/publish/rollback', { session: admin, payload: { releaseId: details.releaseId } })).status, 200);
    assert.equal(current(), details.releaseId);
    assert.match(await page('/products/earth-rods/'), /Committed but not yet switched\./);
    assert.ok(existsSync(join(env.config.publishDir, 'releases', previous)), 'the previous release was not removed');
  } finally {
    if (existsSync(link) && !readlinkSafe(link)) rmSync(link, { recursive: true, force: true });
  }
});

function readlinkSafe(p: string): string | null { try { return readlinkSync(p); } catch { return null; } }
