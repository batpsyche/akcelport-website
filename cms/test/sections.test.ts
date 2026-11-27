// Page sections (order and show/hide), the home hero slider and the home "All products" section: the shared rules,
// the site build, the CMS schema and labels, the save-and-publish round trip, the 005 migration and the media sync.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { cmsRoot } from '../server/src/config.ts';
import { pageSchemas } from '../shared/content-schemas.ts';
import { sectionLabels } from '../shared/page-fields.ts';
import { PAGE_SECTIONS, resolveSections, visibleSections } from '../../src/lib/sections.mjs';
import { setupTestEnv, makeUser, login, api, type TestEnv, type Session } from './helpers.ts';
import { buildApp } from '../server/src/app.ts';
import { buildSiteServer } from '../server/src/site-server.ts';
import { seedFromSite, addNewSiteMedia } from '../server/src/seed.ts';
import { migrate } from '../server/src/migrate.ts';

const siteRoot = resolve(cmsRoot, '..');
const repoJson = (file: string) => JSON.parse(readFileSync(join(siteRoot, 'content', file), 'utf8'));
const HOME_ORDER = PAGE_SECTIONS.home;

const PAGES = { home: 'index.html', about: 'about/index.html', contact: 'contact/index.html', products: 'products/index.html' };
type Built = Record<keyof typeof PAGES, string>;

/** Builds the site with edited copies of the given content documents; returns the build log and the main pages. */
function buildWith(edit: Partial<Record<'home' | 'about' | 'contact', (doc: Record<string, unknown>) => void>>): { status: number | null; log: string; pages?: Built } {
  const tmp = mkdtempSync(join(tmpdir(), 'akcelport-sections-'));
  try {
    const content = join(tmp, 'content');
    cpSync(join(siteRoot, 'content'), content, { recursive: true });
    for (const [name, fn] of Object.entries(edit)) {
      const doc = JSON.parse(readFileSync(join(content, `${name}.json`), 'utf8'));
      fn!(doc);
      writeFileSync(join(content, `${name}.json`), JSON.stringify(doc));
    }
    const out = join(tmp, 'dist');
    const r = spawnSync(process.execPath, [join(siteRoot, 'scripts/build.mjs'), '--content', content, '--out', out], { cwd: siteRoot, encoding: 'utf8' });
    const pages = r.status === 0 ? (Object.fromEntries(Object.entries(PAGES).map(([k, f]) => [k, readFileSync(join(out, f), 'utf8')])) as Built) : undefined;
    return { status: r.status, log: r.stdout + r.stderr, pages };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
const built = (edit: Parameters<typeof buildWith>[0] = {}): Built => {
  const b = buildWith(edit);
  assert.equal(b.status, 0, b.log);
  return b.pages!;
};
// Position of each home section's marker in the built page (-1 when absent).
const MARKERS: Record<string, string> = {
  slider: 'data-slider', hero: 'data-hero', stats: 'class="stats"', products: 'id="products"', families: 'id="range"', process: 'id="built-in"',
  featured: 'id="featured"', industries: 'id="industries"', global: 'id="global"', brochure: 'class="sec sec-white"><div class="container brochure"', news: 'id="news"', cta: 'class="cta-band"',
};
const order = (html: string) => Object.entries(MARKERS).map(([id, m]) => [id, html.indexOf(m)] as const).filter(([, i]) => i > -1).sort((a, b) => a[1] - b[1]).map(([id]) => id);

test('resolveSections: list order wins, unknown and repeated ids are dropped, missing ones are inserted after their predecessor', () => {
  const doc = { sections: [{ id: 'cta' }, { id: 'stats', enabled: false }, { id: 'nope' }, { id: 'cta', enabled: false }] };
  const r = resolveSections('home', doc);
  assert.deepEqual(r.map((s) => s.id).slice(0, 3), ['slider', 'hero', 'cta']);
  assert.equal(r.length, HOME_ORDER.length);
  assert.deepEqual(r.find((s) => s.id === 'cta'), { id: 'cta', enabled: true }, 'the first entry of a repeated id counts');
  assert.deepEqual(r.find((s) => s.id === 'stats'), { id: 'stats', enabled: false });
  assert.ok(r.findIndex((s) => s.id === 'products') === r.findIndex((s) => s.id === 'stats') + 1, 'a missing section follows its predecessor');
  assert.deepEqual(resolveSections('about', {}).map((s) => s.id), PAGE_SECTIONS.about);
  assert.ok(resolveSections('about', {}).every((s) => s.enabled));
});

test('without a sections list the old animated hero shows only while there is no slider', () => {
  assert.deepEqual(visibleSections('home', {}), HOME_ORDER);
  assert.deepEqual(visibleSections('home', { slider: { slides: [{ headline: 'x' }] } }), HOME_ORDER.filter((id) => id !== 'hero'));
});

test('every section id has an editor label', () => {
  for (const page of Object.keys(PAGE_SECTIONS) as Array<keyof typeof PAGE_SECTIONS>) {
    assert.deepEqual(Object.keys(sectionLabels[page]).sort(), [...PAGE_SECTIONS[page]].sort(), page);
  }
});

test('the repository home page: slider first, products right after the statistics, old hero hidden', () => {
  const home = repoJson('home.json');
  assert.deepEqual(home.sections.map((s: { id: string }) => s.id), HOME_ORDER);
  assert.equal(home.sections.find((s: { id: string }) => s.id === 'hero').enabled, false);
  const { home: html, products } = built();
  assert.deepEqual(order(html), HOME_ORDER.filter((id) => id !== 'hero'));
  assert.ok(!html.includes('/assets/hero.js'), 'the canvas script is not loaded while the hero is hidden');
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /<h1 class="slide-hl">Quality, built in\.<\/h1>/);
  // three slides, each with a portrait source for phones and a landscape image
  assert.equal((html.match(/data-slide /g) || []).length, 3);
  assert.equal((html.match(/<source media="\(orientation: portrait\) and \(max-width: 900px\)" srcset="\/img\/hero\/banner-\d-portrait\.webp"/g) || []).length, 3);
  assert.equal((html.match(/class="slide-img" src="\/img\/hero\/banner-\d-landscape\.webp"/g) || []).length, 3);
  assert.equal((html.match(/ inert>/g) || []).length, 2, 'only the first slide is reachable before the script runs');
  // the home products section is the products page's filter and grid
  const grid = (s: string) => s.slice(s.indexOf('<div class="filter-bar"'), s.indexOf('data-filter-empty'));
  assert.ok(grid(html).length > 1000);
  assert.equal(grid(html), grid(products));
});

test('a hidden section is left out, reordering moves it, and the old hero comes back with its script', () => {
  const { home } = built({ home: (d) => {
    const s = d.sections as Array<{ id: string; enabled: boolean }>;
    s.find((x) => x.id === 'stats')!.enabled = false;
    s.find((x) => x.id === 'hero')!.enabled = true;
    s.find((x) => x.id === 'slider')!.enabled = false;
    const p = s.splice(s.findIndex((x) => x.id === 'products'), 1)[0];
    s.push(p);
  } });
  assert.deepEqual(order(home), ['hero', 'families', 'process', 'featured', 'industries', 'global', 'brochure', 'news', 'cta', 'products']);
  assert.ok(home.includes('/assets/hero.js'));
  assert.equal((home.match(/<h1/g) || []).length, 2, 'the animated hero keeps its own h1 (band and static copy)');
});

test('with both heroes hidden the page keeps a visually hidden h1', () => {
  const { home } = built({ home: (d) => { d.sections = (d.sections as Array<{ id: string }>).map((s) => ({ ...s, enabled: !['slider', 'hero'].includes(s.id) })); } });
  assert.match(home, /<h1 class="sr">Electrical components/);
});

test('a home document from before sections renders products after statistics and hides the old hero once slides exist', () => {
  const { home } = built({ home: (d) => { delete d.sections; } });
  assert.deepEqual(order(home), HOME_ORDER.filter((id) => id !== 'hero'));
  const noSlider = built({ home: (d) => { delete d.sections; delete d.slider; delete d.productsGrid; } }).home;
  assert.deepEqual(order(noSlider), HOME_ORDER.filter((id) => id !== 'slider'));
});

test('about and contact sections can be hidden', () => {
  const { about, contact } = built({
    about: (d) => { (d.sections as Array<{ id: string; enabled: boolean }>).find((s) => s.id === 'quality')!.enabled = false; },
    contact: (d) => { d.sections = [{ id: 'details', enabled: false }]; },
  });
  assert.ok(!about.includes('class="sec sec-ink quality"'));
  assert.ok(about.includes('class="cert-grid"'));
  assert.ok(!contact.includes('data-form'));
  assert.ok(contact.includes('<h1>'));
});

test('the content check rejects a bad sections list and a slide without its image', () => {
  const dup = buildWith({ home: (d) => { (d.sections as unknown[]).push({ id: 'stats', enabled: true }, { id: 'banner' }); } });
  assert.notEqual(dup.status, 0);
  assert.match(dup.log, /section stats is listed twice/);
  assert.match(dup.log, /unknown section banner/);
  const img = buildWith({ home: (d) => { ((d.slider as { slides: Array<Record<string, unknown>> }).slides[1].imagePortrait as { src: string }).src = '/img/hero/missing.webp'; } });
  assert.notEqual(img.status, 0);
  assert.match(img.log, /missing file \/img\/hero\/missing\.webp \(home slide 2\)/);
});

test('the page schemas accept the repository documents and refuse unknown or repeated sections', () => {
  for (const page of ['home', 'about', 'contact'] as const) assert.ok(pageSchemas[page].safeParse(repoJson(`${page}.json`)).success, page);
  const bad = pageSchemas.home.safeParse({ ...repoJson('home.json'), sections: [{ id: 'stats' }, { id: 'stats' }] });
  assert.ok(!bad.success);
  assert.deepEqual(bad.error!.issues.map((i) => i.path.join('.')), ['sections']);
  assert.ok(!pageSchemas.about.safeParse({ sections: [{ id: 'slider' }] }).success);
  assert.ok(!pageSchemas.contact.safeParse({ sections: [{ id: 'details', enabled: 'no' }] }).success);
  assert.ok(pageSchemas.home.safeParse({ title: 'no sections list' }).success);
});

// ---- database: save + publish, migration, media sync
let env: TestEnv;
let app: FastifyInstance;
let site: FastifyInstance;
let editor: Session;
before(async () => {
  env = await setupTestEnv();
  await seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir });
  await makeUser(env.pool, 'editor@example.com', 'editor');
  app = await buildApp(env.config, env.pool);
  site = await buildSiteServer(env.config);
  editor = await login(app, 'editor@example.com');
});
after(async () => { await app.close(); await site.close(); await env.cleanup(); });

const page = async (url: string) => (await site.inject({ method: 'GET', url })).body;

test('switching a section off in the editor hides it on the site only after Publish', async () => {
  const first = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: 'all' } });
  assert.equal(first.status, 200, first.text);
  assert.ok((await page('/')).includes('class="stats"'));

  const doc = (await api(app, 'GET', '/api/pages/home', { session: editor })).body.body as { sections: Array<{ id: string; enabled: boolean }> };
  doc.sections.find((s) => s.id === 'stats')!.enabled = false;
  const saved = await api(app, 'PUT', '/api/pages/home', { session: editor, payload: { body: doc } });
  assert.equal(saved.status, 200, saved.text);
  assert.ok((await page('/')).includes('class="stats"'), 'a saved draft does not change the live site');

  const pub = await api(app, 'POST', '/api/publish', { session: editor, payload: { selection: 'all' } });
  assert.equal(pub.status, 200, pub.text);
  const home = await page('/');
  assert.ok(!home.includes('class="stats"'));
  assert.ok(home.includes('data-slider') && home.includes('id="products"'));
});

test('the editor refuses a sections list with an unknown section', async () => {
  const doc = (await api(app, 'GET', '/api/pages/about', { session: editor })).body.body as Record<string, unknown>;
  const r = await api(app, 'PUT', '/api/pages/about', { session: editor, payload: { body: { ...doc, sections: [{ id: 'banner', enabled: true }] } } });
  assert.equal(r.status, 400, r.text);
});

test('005_page_sections adds sections, the slider and the products heading to seeded documents once', async () => {
  const home = repoJson('home.json');
  const { sections: _s, slider: _sl, productsGrid: _pg, ...oldHome } = home;
  const { sections: _a, ...oldAbout } = repoJson('about.json');
  const { sections: _c, ...oldContact } = repoJson('contact.json');
  await env.pool.query('DELETE FROM pages');
  await env.pool.query(`INSERT INTO pages (key, live, draft) VALUES ('home', $1, $2), ('about', $3, NULL), ('contact', $4, $5), ('site', $6, NULL)`, [
    JSON.stringify(oldHome), JSON.stringify({ ...oldHome, title: 'Draft title' }), JSON.stringify(oldAbout),
    JSON.stringify(oldContact), JSON.stringify({ ...oldContact, sections: [{ id: 'details', enabled: false }] }), JSON.stringify({ name: 'Site' }),
  ]);
  const rerun = async () => {
    await env.pool.query(`DELETE FROM schema_migrations WHERE name = '005_page_sections.sql'`);
    assert.deepEqual(await migrate(env.pool), ['005_page_sections.sql']);
  };
  const row = async (key: string) => (await env.pool.query(`SELECT live, draft FROM pages WHERE key = $1`, [key])).rows[0];

  await rerun();
  assert.deepEqual((await row('home')).live, home, 'the migrated home document matches the repository');
  assert.equal((await row('home')).draft.title, 'Draft title', 'the draft is migrated too and keeps its edits');
  assert.deepEqual((await row('home')).draft.sections, home.sections);
  assert.deepEqual((await row('about')).live.sections, repoJson('about.json').sections);
  assert.equal((await row('about')).draft, null, 'a missing draft stays missing');
  assert.deepEqual((await row('contact')).live.sections, [{ id: 'details', enabled: true }]);
  assert.deepEqual((await row('contact')).draft.sections, [{ id: 'details', enabled: false }], 'an existing list is kept');
  assert.deepEqual((await row('site')).live, { name: 'Site' }, 'other documents are untouched');

  await env.pool.query(`UPDATE pages SET live = jsonb_set(live, '{sections,2,enabled}', 'false') WHERE key = 'home'`);
  await rerun();
  assert.equal((await row('home')).live.sections[2].enabled, false, 'running again keeps later edits');
});

test('--media-only adds new site media files and leaves existing rows alone', async () => {
  const path = 'img/hero/banner-1-landscape.webp';
  await env.pool.query(`UPDATE media SET original_filename = 'replaced-in-cms.webp' WHERE path = 'img/hero/banner-2-landscape.webp'`);
  await env.pool.query(`DELETE FROM media WHERE path = $1`, [path]);
  const added = await addNewSiteMedia(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir });
  assert.deepEqual(added, [path]);
  assert.ok(existsSync(join(env.config.mediaDir, path)));
  const r = await env.pool.query(`SELECT path, width, height, original_filename FROM media WHERE path LIKE 'img/hero/%' ORDER BY path`);
  assert.equal(r.rows.length, 6);
  assert.deepEqual(r.rows.find((m) => m.path === path), { path, width: 1920, height: 1086, original_filename: 'banner-1-landscape.webp' });
  assert.equal(r.rows.find((m) => m.path === 'img/hero/banner-2-landscape.webp').original_filename, 'replaced-in-cms.webp');
  assert.deepEqual(await addNewSiteMedia(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir }), []);
});
