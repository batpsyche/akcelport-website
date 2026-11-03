// Seeds the database from the website repository (content/*.json and public/) so the CMS starts with exactly
// what the site shows today. Media files are copied into MEDIA_DIR and registered in the media table.
import { readFileSync, readdirSync, statSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { withTransaction } from './db.ts';
import { inspectBuffer } from './media/inspect.ts';
import { pageKeys } from '../../shared/content-schemas.ts';

export interface SeedOptions { siteRoot: string; mediaDir: string; reset?: boolean }
export interface SeedReport { families: number; products: number; downloads: number; pages: number; redirects: number; media: number }

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const listJson = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(dir, f)));

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else if (!name.startsWith('.')) out.push(p);
  }
  return out;
}

/** Copies public/img and public/downloads into MEDIA_DIR (existing files are kept) and returns every media path. */
export function syncMediaFromSite(siteRoot: string, mediaDir: string): string[] {
  mkdirSync(mediaDir, { recursive: true });
  for (const sub of ['img', 'downloads']) {
    const src = join(siteRoot, 'public', sub);
    if (existsSync(src)) cpSync(src, join(mediaDir, sub), { recursive: true, force: false, errorOnExist: false });
  }
  const files: string[] = [];
  for (const sub of ['img', 'downloads']) if (existsSync(join(mediaDir, sub))) files.push(...walkFiles(join(mediaDir, sub)));
  return files.map((f) => relative(mediaDir, f).split(sep).join('/')).sort();
}

export async function registerMediaFile(db: pg.PoolClient | pg.Pool, mediaDir: string, path: string, uploadedBy: number | null = null): Promise<boolean> {
  const buf = readFileSync(join(mediaDir, path));
  const info = inspectBuffer(buf);
  if (!info) return false;
  const sha = createHash('sha256').update(buf).digest('hex');
  await db.query(
    `INSERT INTO media (path, kind, mime, bytes, width, height, pages, sha256, original_filename, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (path) DO UPDATE SET kind = EXCLUDED.kind, mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, width = EXCLUDED.width,
       height = EXCLUDED.height, pages = EXCLUDED.pages, sha256 = EXCLUDED.sha256, updated_at = now()`,
    [path, info.kind, info.mime, buf.length, info.width ?? null, info.height ?? null, info.pages ?? null, sha, path.split('/').pop(), uploadedBy],
  );
  return true;
}

export async function seedFromSite(pool: pg.Pool, opts: SeedOptions): Promise<SeedReport> {
  const content = join(opts.siteRoot, 'content');
  if (!existsSync(join(content, 'site.json'))) throw new Error(`No content/site.json under SITE_ROOT ${opts.siteRoot}`);
  const existing = await pool.query('SELECT (SELECT count(*) FROM families) + (SELECT count(*) FROM pages) AS n');
  if (Number(existing.rows[0].n) > 0 && !opts.reset) throw new Error('Database already has content; use --reset to replace it');

  const mediaPaths = syncMediaFromSite(opts.siteRoot, opts.mediaDir);

  return withTransaction(pool, async (db) => {
    if (opts.reset) {
      await db.query('TRUNCATE products, families, downloads, pages, redirects, media, content_versions RESTART IDENTITY CASCADE');
    }
    let media = 0;
    for (const p of mediaPaths) if (await registerMediaFile(db, opts.mediaDir, p)) media++;

    const categories = listJson(join(content, 'categories')) as Array<Record<string, unknown>>;
    const familyIds = new Map<string, number>();
    for (const c of categories) {
      const { slug, order, products: _products, ...body } = c as { slug: string; order: number; products: string[] } & Record<string, unknown>;
      const r = await db.query<{ id: number }>(
        `INSERT INTO families (slug, sort_order, status, published_status, live) VALUES ($1,$2,'live','live',$3) RETURNING id`,
        [slug, order, JSON.stringify(body)],
      );
      familyIds.set(slug, r.rows[0].id);
    }

    const products = listJson(join(content, 'products')) as Array<Record<string, unknown>>;
    for (const p of products) {
      const { slug, family, order, ...body } = p as { slug: string; family: string; order: number } & Record<string, unknown>;
      const familyId = familyIds.get(family);
      if (!familyId) throw new Error(`product ${slug}: unknown family ${family}`);
      await db.query(
        `INSERT INTO products (slug, family_id, sort_order, status, published_status, live) VALUES ($1,$2,$3,'live','live',$4)`,
        [slug, familyId, order, JSON.stringify(body)],
      );
    }

    const downloads = readJson(join(content, 'downloads.json')).documents as Array<Record<string, unknown>>;
    let di = 0;
    for (const d of downloads) {
      const { id, products: _products, ...body } = d as { id: string; products: string[] } & Record<string, unknown>;
      await db.query(
        `INSERT INTO downloads (slug, sort_order, status, published_status, live) VALUES ($1,$2,'live','live',$3)`,
        [id, ++di, JSON.stringify(body)],
      );
    }

    let pages = 0;
    for (const key of pageKeys) {
      const file = key === 'countries' ? 'countries.json' : `${key}.json`;
      let body = readJson(join(content, file));
      if (key === 'countries') body = { list: body };
      await db.query(`INSERT INTO pages (key, live) VALUES ($1, $2)`, [key, JSON.stringify(body)]);
      pages++;
    }

    const redirects = readJson(join(content, 'redirects.json')) as { pages: Array<{ from: string; to: string }>; downloads: Array<{ from: string; to: string }> };
    let ri = 0;
    for (const [kind, list] of [['page', redirects.pages], ['download', redirects.downloads]] as const) {
      for (const r of list) {
        await db.query(`INSERT INTO redirects (kind, from_path, to_path, sort_order) VALUES ($1,$2,$3,$4)`, [kind, r.from, r.to, ++ri]);
      }
    }

    await db.query(`INSERT INTO app_settings (key, value) VALUES ('editors_can_publish', 'true') ON CONFLICT (key) DO NOTHING`);

    return { families: categories.length, products: products.length, downloads: downloads.length, pages, redirects: ri, media };
  });
}
