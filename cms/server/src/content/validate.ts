// Cross-reference checks the JSON schemas cannot express: every image and file path must exist in the media
// library, every download key must exist, and a product's family must exist.
import type { Queryable } from '../db.ts';

export interface Issue { path: string; message: string }

/** Collects every string value under a `src`, `file` or `thumb` key, with its JSON path. */
export function collectMediaRefs(value: unknown, path = ''): Array<{ path: string; ref: string }> {
  const out: Array<{ path: string; ref: string }> = [];
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}.${i}`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const cp = p ? `${p}.${k}` : k;
        if ((k === 'src' || k === 'file' || k === 'thumb') && typeof x === 'string') out.push({ path: cp, ref: x });
        else walk(x, cp);
      }
    }
  };
  walk(value, path);
  return out;
}

export async function checkMediaRefs(db: Queryable, body: unknown): Promise<Issue[]> {
  const refs = collectMediaRefs(body);
  if (!refs.length) return [];
  const paths = [...new Set(refs.map((r) => r.ref.replace(/^\//, '')))];
  const found = new Set((await db.query<{ path: string }>('SELECT path FROM media WHERE path = ANY($1)', [paths])).rows.map((r) => r.path));
  return refs.filter((r) => !found.has(r.ref.replace(/^\//, ''))).map((r) => ({ path: r.path, message: `File not in the media library: ${r.ref}` }));
}

export async function checkDownloadRefs(db: Queryable, keys: string[]): Promise<Issue[]> {
  if (!keys.length) return [];
  const found = new Set((await db.query<{ slug: string }>('SELECT slug FROM downloads WHERE slug = ANY($1) AND deleted_at IS NULL', [keys])).rows.map((r) => r.slug));
  return keys.flatMap((k, i) => (found.has(k) ? [] : [{ path: `downloads.${i}`, message: `Unknown datasheet: ${k}` }]));
}
