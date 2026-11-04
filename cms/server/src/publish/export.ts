// Writes the database content back into the content/*.json shape the site build reads.
// mode 'live' exports what was promoted at the last publish; 'preview' exports drafts where they exist.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Queryable } from '../db.ts';
import { pageKeys } from '../../../shared/content-schemas.ts';

export type ExportMode = 'live' | 'preview';

interface ContentRow { id: number; slug: string; sort_order: number; body: Record<string, unknown>; family_id?: number }

function selection(mode: ExportMode): { where: string; body: string; slug: string; family: string } {
  return mode === 'live'
    ? { where: `published_status = 'live' AND live IS NOT NULL`, body: 'live', slug: 'published_slug', family: 'published_family_id' }
    : { where: `status = 'live' AND deleted_at IS NULL AND COALESCE(draft, live) IS NOT NULL`, body: 'COALESCE(draft, live)', slug: 'slug', family: 'family_id' };
}

export async function loadExportData(db: Queryable, mode: ExportMode) {
  const s = selection(mode);
  const families = (await db.query<ContentRow>(`SELECT id, ${s.slug} AS slug, sort_order, ${s.body} AS body FROM families WHERE ${s.where} ORDER BY sort_order, id`)).rows;
  const familyIds = new Set(families.map((f) => f.id));
  const products = (await db.query<ContentRow>(`SELECT id, ${s.slug} AS slug, ${s.family} AS family_id, sort_order, ${s.body} AS body FROM products WHERE ${s.where} ORDER BY sort_order, id`)).rows
    .filter((p) => familyIds.has(p.family_id!));
  const downloads = (await db.query<ContentRow>(`SELECT id, ${s.slug} AS slug, sort_order, ${s.body} AS body FROM downloads WHERE ${s.where} ORDER BY sort_order, id`)).rows;
  const pageRows = (await db.query<{ key: string; body: Record<string, unknown> }>(`SELECT key, ${mode === 'live' ? 'live' : 'COALESCE(draft, live)'} AS body FROM pages`)).rows;
  const pages = new Map(pageRows.map((r) => [r.key, r.body]));
  const redirects = (await db.query<{ kind: string; from_path: string; to_path: string }>(`SELECT kind, from_path, to_path FROM redirects ORDER BY sort_order, id`)).rows;
  return { families, products, downloads, pages, redirects };
}

const writeJson = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

/** Exports content into outDir (created fresh). Returns counts. */
export async function exportContent(db: Queryable, mode: ExportMode, outDir: string) {
  const data = await loadExportData(db, mode);
  for (const key of pageKeys) if (!data.pages.has(key)) throw new Error(`document "${key}" is missing; run the seed first`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'categories'), { recursive: true });
  mkdirSync(join(outDir, 'products'), { recursive: true });

  const familySlug = new Map(data.families.map((f) => [f.id, f.slug]));
  const byFamily = new Map<number, ContentRow[]>();
  for (const p of data.products) {
    const list = byFamily.get(p.family_id!) || [];
    list.push(p);
    byFamily.set(p.family_id!, list);
  }
  for (const f of data.families) {
    const { name, ...rest } = f.body as { name: string } & Record<string, unknown>;
    const members = (byFamily.get(f.id) || []).map((p) => p.slug);
    writeJson(join(outDir, 'categories', `${f.slug}.json`), { slug: f.slug, name, order: f.sort_order, ...rest, products: members });
  }

  // Site order: family order, then product order within the family (the same order the build uses).
  const orderedProducts = data.families.flatMap((f) => byFamily.get(f.id) || []);
  for (const p of orderedProducts) {
    const { name, ...rest } = p.body as { name: string } & Record<string, unknown>;
    writeJson(join(outDir, 'products', `${p.slug}.json`), { slug: p.slug, name, family: familySlug.get(p.family_id!), order: p.sort_order, ...rest });
  }

  const documents = data.downloads.map((d) => ({
    id: d.slug,
    ...d.body,
    products: orderedProducts.filter((p) => (p.body.downloads as string[] | undefined)?.includes(d.slug)).map((p) => p.slug),
  }));
  writeJson(join(outDir, 'downloads.json'), { documents });

  for (const key of pageKeys) {
    const body = data.pages.get(key)!;
    if (key === 'countries') writeJson(join(outDir, 'countries.json'), (body as { list: string[] }).list);
    else writeJson(join(outDir, `${key}.json`), body);
  }

  writeJson(join(outDir, 'redirects.json'), {
    note: 'Old akcelport.com URLs mapped to their new locations. Emitted at build time as dist/.htaccess (Apache) and dist/_redirects (Netlify style). Managed in the CMS.',
    pages: data.redirects.filter((r) => r.kind === 'page').map((r) => ({ from: r.from_path, to: r.to_path })),
    downloads: data.redirects.filter((r) => r.kind === 'download').map((r) => ({ from: r.from_path, to: r.to_path })),
  });

  return { families: data.families.length, products: orderedProducts.length, downloads: documents.length, redirects: data.redirects.length };
}
