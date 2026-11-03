// Seed from the repository, export, build: the result must be byte-identical to a build from the repository itself.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setupTestEnv, type TestEnv } from './helpers.ts';
import { seedFromSite } from '../server/src/seed.ts';
import { exportContent } from '../server/src/publish/export.ts';

let env: TestEnv;
before(async () => { env = await setupTestEnv(); });
after(async () => { await env.cleanup(); });

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p));
  }
  return out.sort();
}

function build(args: string[], envExtra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [join(env.siteRoot, 'scripts/build.mjs'), ...args], { cwd: env.siteRoot, encoding: 'utf8', env: { ...process.env, ...envExtra } });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('seed, export and build reproduce the current site exactly', async () => {
  const report = await seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir });
  assert.equal(report.families, 6);
  assert.equal(report.products, 18);
  assert.equal(report.downloads, 23);
  assert.equal(report.pages, 7);
  assert.equal(report.redirects, 30);
  assert.ok(report.media >= 360, `registered ${report.media} media files`);

  // Exported JSON is semantically identical to content/ (key order aside).
  const exportDir = join(env.tmp, 'export');
  await exportContent(env.pool, 'live', exportDir);
  const repoContent = join(env.siteRoot, 'content');
  const files = walk(repoContent);
  assert.deepEqual(walk(exportDir), files);
  for (const f of files) {
    const a = JSON.parse(readFileSync(join(repoContent, f), 'utf8'));
    const b = JSON.parse(readFileSync(join(exportDir, f), 'utf8'));
    if (f === 'redirects.json') { delete a.note; delete b.note; }
    assert.deepEqual(b, a, `content mismatch in ${f}`);
  }

  // A build from the export + media dir is byte-identical to a build from the repository.
  const fromRepo = join(env.tmp, 'dist-repo');
  const fromExport = join(env.tmp, 'dist-export');
  const r1 = build(['--out', fromRepo]);
  assert.equal(r1.status, 0, r1.out);
  const r2 = build(['--content', exportDir, '--out', fromExport, '--assets', env.config.mediaDir]);
  assert.equal(r2.status, 0, r2.out);
  const list = walk(fromRepo);
  assert.deepEqual(walk(fromExport), list);
  for (const f of list) {
    assert.ok(readFileSync(join(fromRepo, f)).equals(readFileSync(join(fromExport, f))), `built file differs: ${f}`);
  }
  assert.ok(existsSync(join(fromExport, 'products/cable-lugs/index.html')));
});

test('seeding twice is refused without --reset, and --reset replaces the content', async () => {
  await assert.rejects(seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir }), /already has content/);
  const again = await seedFromSite(env.pool, { siteRoot: env.siteRoot, mediaDir: env.config.mediaDir, reset: true });
  assert.equal(again.products, 18);
  const n = await env.pool.query('SELECT count(*)::int AS n FROM products');
  assert.equal(n.rows[0].n, 18);
});
