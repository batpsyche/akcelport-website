import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, type TestEnv } from './helpers.ts';
import { migrate } from '../server/src/migrate.ts';

let env: TestEnv;
before(async () => { env = await setupTestEnv(); });
after(async () => { await env.cleanup(); });

const rerunNewsNav = async () => {
  await env.pool.query(`DELETE FROM schema_migrations WHERE name = '003_news_nav.sql'`);
  assert.deepEqual(await migrate(env.pool), ['003_news_nav.sql']);
};
const hrefs = async (column: 'live' | 'draft') =>
  ((await env.pool.query(`SELECT ${column} FROM pages WHERE key = 'site'`)).rows[0][column]?.nav ?? null)?.map((n: { href: string }) => n.href) ?? null;

test('003_news_nav adds the News header link to an already seeded site document once, before Contact', async () => {
  const nav = [{ label: 'Products', href: '/products/', mega: true }, { label: 'Downloads', href: '/downloads/' }, { label: 'Contact', href: '/contact/' }];
  await env.pool.query(`INSERT INTO pages (key, live, draft) VALUES ('site', $1, $2), ('home', $3, NULL)`,
    [JSON.stringify({ name: 'Site', nav }), JSON.stringify({ name: 'Draft', nav: nav.slice(0, 2) }), JSON.stringify({ nav })]);

  await rerunNewsNav();
  assert.deepEqual(await hrefs('live'), ['/products/', '/downloads/', '/news/', '/contact/']);
  assert.deepEqual(await hrefs('draft'), ['/products/', '/downloads/', '/news/'], 'appended when there is no Contact entry');
  const live = (await env.pool.query(`SELECT live FROM pages WHERE key = 'site'`)).rows[0].live;
  assert.equal(live.name, 'Site', 'the rest of the document is kept');
  assert.deepEqual(live.nav[2], { label: 'News', href: '/news/' });
  assert.deepEqual(live.nav[0], nav[0]);
  const home = (await env.pool.query(`SELECT live FROM pages WHERE key = 'home'`)).rows[0].live;
  assert.deepEqual(home.nav, nav, 'other pages are untouched');

  await rerunNewsNav();
  assert.deepEqual(await hrefs('live'), ['/products/', '/downloads/', '/news/', '/contact/'], 'running again does not duplicate');
  assert.deepEqual(await hrefs('draft'), ['/products/', '/downloads/', '/news/']);

  await env.pool.query(`UPDATE pages SET draft = NULL WHERE key = 'site'`);
  await rerunNewsNav();
  assert.equal((await env.pool.query(`SELECT draft FROM pages WHERE key = 'site'`)).rows[0].draft, null, 'a missing draft stays missing');
});

test('004_translate turns the language menu on in a seeded site document once, keeping an explicit choice', async () => {
  await env.pool.query('DELETE FROM pages');
  await env.pool.query(`INSERT INTO pages (key, live, draft) VALUES ('site', $1, $2), ('home', $3, NULL)`,
    [JSON.stringify({ name: 'Site' }), JSON.stringify({ name: 'Draft', translate: { enabled: false } }), JSON.stringify({ title: 'Home' })]);
  const rerun = async () => {
    await env.pool.query(`DELETE FROM schema_migrations WHERE name = '004_translate.sql'`);
    assert.deepEqual(await migrate(env.pool), ['004_translate.sql']);
  };
  const row = async (key: string) => (await env.pool.query(`SELECT live, draft FROM pages WHERE key = $1`, [key])).rows[0];

  await rerun();
  assert.deepEqual((await row('site')).live, { name: 'Site', translate: { enabled: true } }, 'added with the default, rest kept');
  assert.deepEqual((await row('site')).draft, { name: 'Draft', translate: { enabled: false } }, 'an explicit off is kept');
  assert.deepEqual((await row('home')).live, { title: 'Home' }, 'other pages are untouched');

  await env.pool.query(`UPDATE pages SET live = jsonb_set(live, '{translate,enabled}', 'false'), draft = NULL WHERE key = 'site'`);
  await rerun();
  assert.deepEqual((await row('site')).live, { name: 'Site', translate: { enabled: false } }, 'running again keeps a later off');
  assert.equal((await row('site')).draft, null, 'a missing draft stays missing');
});
