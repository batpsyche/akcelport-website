// The Google Translate language bar: rendered on every page by default, and removed when site.translate.enabled is false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cmsRoot } from '../server/src/config.ts';
import { pageSchemas } from '../shared/content-schemas.ts';

const siteRoot = resolve(cmsRoot, '..');

function buildWith(translate: unknown): { home: string; product: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'akcelport-translate-'));
  try {
    const content = join(tmp, 'content');
    cpSync(join(siteRoot, 'content'), content, { recursive: true });
    const site = JSON.parse(readFileSync(join(content, 'site.json'), 'utf8'));
    if (translate === undefined) delete site.translate; else site.translate = translate;
    writeFileSync(join(content, 'site.json'), JSON.stringify(site));
    const out = join(tmp, 'dist');
    const r = spawnSync(process.execPath, [join(siteRoot, 'scripts/build.mjs'), '--content', content, '--out', out], { cwd: siteRoot, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return { home: readFileSync(join(out, 'index.html'), 'utf8'), product: readFileSync(join(out, 'products/cable-lugs/index.html'), 'utf8') };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const BAR = 'id="google_translate_element"';

test('the language bar is on every page when enabled, and when the setting is missing', () => {
  for (const setting of [{ enabled: true }, undefined]) {
    const { home, product } = buildWith(setting);
    assert.ok(home.includes(BAR) && product.includes(BAR), `bar rendered for ${JSON.stringify(setting)}`);
    assert.ok(home.indexOf(BAR) < home.indexOf('class="site-header"'), 'the bar sits above the header');
  }
});

test('turning the setting off removes the language bar', () => {
  const { home, product } = buildWith({ enabled: false });
  assert.ok(!home.includes(BAR) && !product.includes(BAR));
  assert.ok(!home.includes('data-translate'));
});

test('the site settings schema accepts the switch and documents without it', () => {
  const site = JSON.parse(readFileSync(join(siteRoot, 'content/site.json'), 'utf8'));
  assert.equal(site.translate.enabled, true, 'the repository default is on');
  assert.ok(pageSchemas.site.safeParse(site).success);
  const { translate: _drop, ...without } = site;
  assert.ok(pageSchemas.site.safeParse(without).success);
  assert.ok(!pageSchemas.site.safeParse({ ...site, translate: { enabled: 'yes' } }).success);
});
