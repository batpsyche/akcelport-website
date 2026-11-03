import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { setupTestEnv, makeUser, login, api, multipart, TINY_PNG, TINY_PDF, type TestEnv, type Session } from './helpers.ts';
import { buildApp } from '../server/src/app.ts';
import { seedFromSite } from '../server/src/seed.ts';

let env: TestEnv;
let app: FastifyInstance;
let editor: Session;
let admin: Session;
before(async () => {
  env = await setupTestEnv();
  await seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir });
  await makeUser(env.pool, 'admin@example.com', 'admin');
  await makeUser(env.pool, 'editor@example.com', 'editor');
  app = await buildApp(env.config, env.pool);
  editor = await login(app, 'editor@example.com');
  admin = await login(app, 'admin@example.com');
});
after(async () => { await app.close(); await env.cleanup(); });

const productBySlug = async (slug: string) => ((await api(app, 'GET', '/api/products', { session: editor })).body.items as Array<{ id: number; slug: string; pending: boolean; hasDraft: boolean }>).find((p) => p.slug === slug)!;

test('editing a product creates a draft, a version and a pending change; discard restores', async () => {
  const p = await productBySlug('cable-lugs');
  const full = await api(app, 'GET', `/api/products/${p.id}`, { session: editor });
  assert.equal(full.status, 200);
  const body = full.body.body as Record<string, unknown>;
  assert.equal(body.name, 'Cable Lugs');
  const saved = await api(app, 'PUT', `/api/products/${p.id}`, { session: editor, payload: { body: { ...body, summary: 'Updated summary for testing.' } } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal((saved.body.item as { hasDraft: boolean }).hasDraft, true);
  assert.equal((saved.body.versions as unknown[]).length, 1);
  const pending = await api(app, 'GET', '/api/pending', { session: editor });
  assert.ok((pending.body.items as Array<{ slug: string; change: string }>).some((i) => i.slug === 'cable-lugs' && i.change === 'edit'));
  // Saving the live body again clears the draft.
  const back = await api(app, 'PUT', `/api/products/${p.id}`, { session: editor, payload: { body } });
  assert.equal((back.body.item as { hasDraft: boolean }).hasDraft, false);
  // Revert to version 1 brings the edited summary back as a draft; discard drops it.
  const versions = back.body.versions as Array<{ id: number; versionNo: number }>;
  const v1 = versions.find((v) => v.versionNo === 1)!;
  const reverted = await api(app, 'POST', `/api/products/${p.id}/revert`, { session: editor, payload: { versionId: v1.id } });
  assert.equal((reverted.body.body as { summary: string }).summary, 'Updated summary for testing.');
  const discarded = await api(app, 'POST', `/api/products/${p.id}/discard`, { session: editor });
  assert.equal((discarded.body.item as { hasDraft: boolean }).hasDraft, false);
  assert.equal((discarded.body.body as { summary: string }).summary, body.summary);
});

test('validation rejects bad bodies, unknown media and unknown datasheets', async () => {
  const p = await productBySlug('flexibars');
  const body = (await api(app, 'GET', `/api/products/${p.id}`, { session: editor })).body.body as Record<string, unknown>;
  const noName = await api(app, 'PUT', `/api/products/${p.id}`, { session: editor, payload: { body: { ...body, name: '' } } });
  assert.equal(noName.status, 400);
  assert.ok(((noName.body.details as { issues: Array<{ path: string }> }).issues).some((i) => i.path === 'name'));
  const badImage = await api(app, 'PUT', `/api/products/${p.id}`, { session: editor, payload: { body: { ...body, hero: { ...(body.hero as object), src: '/img/products/flexibars/missing.webp' } } } });
  assert.equal(badImage.status, 400);
  assert.match(badImage.text, /not in the media library/);
  const badDownload = await api(app, 'PUT', `/api/products/${p.id}`, { session: editor, payload: { body: { ...body, downloads: ['nope'] } } });
  assert.equal(badDownload.status, 400);
  assert.match(badDownload.text, /Unknown datasheet/);
  assert.equal((await api(app, 'PUT', `/api/products/${p.id}`, { session: editor, payload: { body: { ...body, downloads: [] } } })).status, 400);
});

test('create, hide, reorder, delete and restore products; family and download guards', async () => {
  const families = (await api(app, 'GET', '/api/families', { session: editor })).body.items as Array<{ id: number; slug: string }>;
  const fam = families.find((f) => f.slug === 'connection-terminals')!;
  const template = (await api(app, 'GET', `/api/products/${(await productBySlug('cable-lugs')).id}`, { session: editor })).body.body as Record<string, unknown>;
  const dup = await api(app, 'POST', '/api/products', { session: editor, payload: { slug: 'cable-lugs', familyId: fam.id, body: template } });
  assert.equal(dup.status, 400);
  const created = await api(app, 'POST', '/api/products', { session: editor, payload: { slug: 'test-product', familyId: fam.id, body: { ...template, name: 'Test Product' } } });
  assert.equal(created.status, 201, created.text);
  const item = created.body.item as { id: number; neverPublished: boolean; pending: boolean };
  assert.equal(item.neverPublished, true);
  assert.equal(item.pending, true);
  const hidden = await api(app, 'POST', `/api/products/${item.id}/status`, { session: editor, payload: { status: 'hidden' } });
  assert.equal((hidden.body.item as { status: string }).status, 'hidden');

  const members = ((await api(app, 'GET', '/api/products', { session: editor })).body.items as Array<{ id: number; familyId: number }>).filter((p) => p.familyId === fam.id).map((p) => p.id);
  const reordered = await api(app, 'POST', '/api/products/reorder', { session: editor, payload: { familyId: fam.id, ids: [...members].reverse() } });
  assert.equal(reordered.status, 200);
  const after = ((await api(app, 'GET', '/api/products', { session: editor })).body.items as Array<{ id: number; familyId: number; sortOrder: number }>).filter((p) => p.familyId === fam.id);
  assert.deepEqual(after.map((p) => p.id), [...members].reverse());
  assert.equal((await api(app, 'POST', '/api/products/reorder', { session: editor, payload: { familyId: fam.id, ids: [members[0], 999999] } })).status, 400);

  // A never-published product is removed outright; a published one is marked for deletion and can be restored.
  assert.deepEqual((await api(app, 'DELETE', `/api/products/${item.id}`, { session: editor })).body, { hard: true });
  const live = await productBySlug('cable-glands');
  assert.deepEqual((await api(app, 'DELETE', `/api/products/${live.id}`, { session: editor })).body, { hard: false });
  assert.ok((await productBySlug('cable-glands')).pending);
  assert.equal((await api(app, 'POST', `/api/products/${live.id}/restore`, { session: editor })).status, 200);
  assert.equal((await productBySlug('cable-glands')).pending, false);

  assert.equal((await api(app, 'DELETE', `/api/families/${fam.id}`, { session: editor })).status, 400, 'family with products');
  const downloads = (await api(app, 'GET', '/api/downloads', { session: editor })).body.items as Array<{ id: number; slug: string }>;
  const linked = downloads.find((d) => d.slug === 'cable-lugs-legacy')!;
  assert.equal((await api(app, 'DELETE', `/api/downloads/${linked.id}`, { session: editor })).status, 400, 'download linked from a product');
});

test('pages: editors edit about, only admins edit site settings; versions and revert work', async () => {
  const about = (await api(app, 'GET', '/api/pages/about', { session: editor })).body.body as Record<string, unknown>;
  const saved = await api(app, 'PUT', '/api/pages/about', { session: editor, payload: { body: { ...about, title: 'About us (edited)' } } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.hasDraft, true);
  const pages = (await api(app, 'GET', '/api/pages', { session: editor })).body.pages as Array<{ key: string; hasDraft: boolean }>;
  assert.equal(pages.find((p) => p.key === 'about')!.hasDraft, true);
  const site = (await api(app, 'GET', '/api/pages/site', { session: admin })).body.body as Record<string, unknown>;
  const bad = await api(app, 'PUT', '/api/pages/site', { session: admin, payload: { body: { ...site, siteUrl: 'not a url' } } });
  assert.equal(bad.status, 400);
  const ok = await api(app, 'PUT', '/api/pages/site', { session: admin, payload: { body: { ...site, form: { ...(site.form as object), endpoint: 'https://formspree.io/f/example' } } } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(((ok.body.body as { form: { endpoint: string } }).form.endpoint), 'https://formspree.io/f/example');
  const discarded = await api(app, 'POST', '/api/pages/about/discard', { session: editor });
  assert.equal(discarded.body.hasDraft, false);
});

test('redirects are admin-managed and validated', async () => {
  const bad = await api(app, 'POST', '/api/redirects', { session: admin, payload: { kind: 'page', from_path: 'no-slash', to_path: '/' } });
  assert.equal(bad.status, 400);
  const created = await api(app, 'POST', '/api/redirects', { session: admin, payload: { kind: 'page', from_path: '/old-page.php', to_path: '/about/' } });
  assert.equal(created.status, 201);
  const list = created.body.redirects as Array<{ id: number; fromPath: string }>;
  const mine = list.find((r) => r.fromPath === '/old-page.php')!;
  assert.equal((await api(app, 'POST', '/api/redirects', { session: admin, payload: { kind: 'page', from_path: '/old-page.php', to_path: '/' } })).status, 409);
  assert.equal((await api(app, 'PUT', `/api/redirects/${mine.id}`, { session: admin, payload: { kind: 'page', from_path: '/old-page.php', to_path: '/contact/' } })).status, 200);
  assert.equal((await api(app, 'DELETE', `/api/redirects/${mine.id}`, { session: admin })).status, 200);
});

test('media: upload with type, size and folder checks; replace; delete only when unused', async () => {
  const bad = multipart({ folder: 'img/products/cable-lugs' }, { name: 'file', filename: 'notes.txt', type: 'text/plain', data: Buffer.from('hello') });
  assert.equal((await api(app, 'POST', '/api/media', { session: editor, rawPayload: bad.payload, headers: bad.headers })).status, 400);
  const wrongFolder = multipart({ folder: 'etc/passwd' }, { name: 'file', filename: 'a.png', type: 'image/png', data: TINY_PNG });
  assert.equal((await api(app, 'POST', '/api/media', { session: editor, rawPayload: wrongFolder.payload, headers: wrongFolder.headers })).status, 400);
  const pdfInImg = multipart({ folder: 'img/company' }, { name: 'file', filename: 'a.pdf', type: 'application/pdf', data: TINY_PDF });
  assert.equal((await api(app, 'POST', '/api/media', { session: editor, rawPayload: pdfInImg.payload, headers: pdfInImg.headers })).status, 400);

  const good = multipart({ folder: 'img/products/cable-lugs' }, { name: 'file', filename: 'New Photo (1).PNG', type: 'image/png', data: TINY_PNG });
  const up = await api(app, 'POST', '/api/media', { session: editor, rawPayload: good.payload, headers: good.headers });
  assert.equal(up.status, 201, up.text);
  const media = up.body.media as { id: number; path: string; width: number; height: number; kind: string };
  assert.equal(media.path, 'img/products/cable-lugs/new-photo-1.png');
  assert.equal(media.width, 1);
  assert.ok(existsSync(join(env.config.mediaDir, media.path)));
  const again = await api(app, 'POST', '/api/media', { session: editor, rawPayload: good.payload, headers: good.headers });
  assert.equal((again.body.media as { path: string }).path, 'img/products/cable-lugs/new-photo-1-2.png', 'name collision gets a suffix');
  const served = await app.inject({ method: 'GET', url: `/media/${media.path}`, headers: { cookie: editor.cookie } });
  assert.equal(served.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: `/media/${media.path}` })).statusCode, 401, 'media needs login');

  const pdf = multipart({ folder: 'downloads/catalogue', name: 'Test Sheet' }, { name: 'file', filename: 'x.pdf', type: 'application/pdf', data: TINY_PDF });
  const pdfUp = await api(app, 'POST', '/api/media', { session: editor, rawPayload: pdf.payload, headers: pdf.headers });
  assert.equal(pdfUp.status, 201, pdfUp.text);
  assert.equal((pdfUp.body.media as { path: string; pages: number }).path, 'downloads/catalogue/test-sheet.pdf');
  assert.equal((pdfUp.body.media as { pages: number }).pages, 2);

  // Replace keeps the path; kind mismatch is refused.
  const rep = multipart({}, { name: 'file', filename: 'other.png', type: 'image/png', data: TINY_PNG });
  assert.equal((await api(app, 'POST', `/api/media/${media.id}/replace`, { session: editor, rawPayload: rep.payload, headers: rep.headers })).status, 200);
  const repPdf = multipart({}, { name: 'file', filename: 'x.pdf', type: 'application/pdf', data: TINY_PDF });
  assert.equal((await api(app, 'POST', `/api/media/${media.id}/replace`, { session: editor, rawPayload: repPdf.payload, headers: repPdf.headers })).status, 400);

  // A file referenced by content cannot be deleted; an unused one can.
  const all = (await api(app, 'GET', '/api/media?q=cable-lung-1', { session: editor })).body.media as Array<{ id: number; path: string }>;
  const used = all.find((m) => m.path === 'img/products/cable-lugs/cable-lung-1-jpg.webp')!;
  const refused = await api(app, 'DELETE', `/api/media/${used.id}`, { session: editor });
  assert.equal(refused.status, 400);
  assert.match(refused.text, /product cable-lugs/);
  assert.equal((await api(app, 'DELETE', `/api/media/${media.id}`, { session: editor })).status, 200);
  assert.ok(!existsSync(join(env.config.mediaDir, media.path)));
});
