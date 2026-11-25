// Releases in Supabase Storage (serverless staging): the build output is uploaded as content-addressed objects plus a
// manifest per release, and state.json points at the live one. Only files whose content changed are uploaded, so a
// publish after the first one sends just the regenerated pages. Rollback re-points state.json.
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep, extname, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { Storage, eachLimit, type Manifest, type SiteState } from '../storage.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
};
const contentType = (file: string) => (basename(file) === '_redirects' ? 'text/plain; charset=utf-8' : TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export class RemoteReleases {
  constructor(private storage: Storage, private keep: number) {}

  async state(): Promise<SiteState> {
    return (await this.storage.getJson<SiteState>('state.json')) ?? { current: null, releases: [] };
  }

  /** Uploads a built site directory and returns its manifest; objects already referenced by `known` are skipped. */
  private async upload(id: string, dir: string, known: Set<string>): Promise<{ manifest: Manifest; uploaded: number; bytes: number }> {
    const manifest: Manifest = { id, createdAt: new Date().toISOString(), files: {} };
    const todo: Array<{ key: string; buf: Buffer; type: string }> = [];
    for (const abs of walk(dir)) {
      const path = '/' + relative(dir, abs).split(sep).join('/');
      if (path === '/.htaccess') continue;
      const buf = readFileSync(abs);
      const key = `objects/${sha256(buf)}/${basename(abs)}`;
      const type = contentType(abs);
      manifest.files[path] = { key, type, size: buf.length };
      if (!known.has(key) && !todo.some((t) => t.key === key)) todo.push({ key, buf, type });
    }
    let bytes = 0;
    await eachLimit(todo, 6, async (t) => { await this.storage.put(t.key, t.buf, t.type, 31536000); bytes += t.buf.length; });
    return { manifest, uploaded: todo.length, bytes };
  }

  /** Object keys referenced by the kept releases and the preview: the set that must not be deleted. */
  private async referenced(state: SiteState): Promise<{ keys: Set<string>; complete: boolean }> {
    const keys = new Set<string>();
    let complete = true;
    for (const name of [...state.releases.map((r) => `releases/${r.id}.json`), 'preview.json']) {
      const m = await this.storage.getJson<Manifest>(name).catch(() => null);
      if (m) for (const f of Object.values(m.files)) keys.add(f.key);
      else if (name !== 'preview.json') complete = false;
    }
    return { keys, complete };
  }

  /** Uploads the release, makes it current and prunes releases beyond PUBLISH_KEEP. Returns log lines. */
  async publish(id: string, dir: string): Promise<string> {
    const state = await this.state();
    const before = await this.referenced(state);
    const { manifest, uploaded, bytes } = await this.upload(id, dir, before.keys);
    await this.storage.putJson(`releases/${id}.json`, manifest);
    const releases = [{ id, createdAt: manifest.createdAt }, ...state.releases.filter((r) => r.id !== id)];
    const kept = releases.slice(0, this.keep);
    const dropped = releases.slice(this.keep);
    await this.storage.putJson('state.json', { current: id, releases: kept } satisfies SiteState);
    let log = `Uploaded ${uploaded} changed files (${(bytes / 1024 / 1024).toFixed(1)} MB) of ${Object.keys(manifest.files).length} to Storage.`;
    if (dropped.length) {
      try {
        await this.storage.remove(dropped.map((r) => `releases/${r.id}.json`));
        const after = await this.referenced({ current: id, releases: kept });
        if (after.complete) {
          const unused = [...before.keys].filter((k) => !after.keys.has(k));
          if (unused.length) await this.storage.remove(unused);
        }
        log += `\nRemoved old releases: ${dropped.map((r) => r.id).join(', ')}`;
      } catch (err) {
        log += `\nWarning: could not prune old releases: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return log;
  }

  async preview(stamp: string, dir: string): Promise<string> {
    const state = await this.state();
    const { keys } = await this.referenced(state);
    const { manifest, uploaded } = await this.upload(`preview-${stamp}`, dir, keys);
    await this.storage.putJson('preview.json', manifest);
    return `Uploaded ${uploaded} changed files to Storage.`;
  }

  async rollback(id: string): Promise<boolean> {
    const state = await this.state();
    if (!state.releases.some((r) => r.id === id)) return false;
    await this.storage.putJson('state.json', { ...state, current: id } satisfies SiteState);
    return true;
  }

  async previewBuiltAt(): Promise<string | null> {
    return (await this.storage.getJson<Manifest>('preview.json'))?.createdAt ?? null;
  }
}

/**
 * Makes MEDIA_DIR hold every media file that the build cannot take from the deployed public/ folder: files uploaded or
 * replaced in the CMS. Files already downloaded with the same content are kept.
 */
export async function syncMediaForBuild(pool: pg.Pool | pg.PoolClient, storage: Storage, siteRoot: string, mediaDir: string): Promise<number> {
  mkdirSync(mediaDir, { recursive: true });
  const rows = (await pool.query<{ path: string; sha256: string }>('SELECT path, sha256 FROM media')).rows;
  const hashOf = (abs: string) => (existsSync(abs) ? sha256(readFileSync(abs)) : null);
  const missing = rows.filter((r) => hashOf(join(siteRoot, 'public', r.path)) !== r.sha256 && hashOf(join(mediaDir, r.path)) !== r.sha256);
  await eachLimit(missing, 6, async (r) => {
    const buf = await storage.get(`media/${r.path}`);
    if (!buf) throw new Error(`Media file ${r.path} is missing from Storage`);
    mkdirSync(dirname(join(mediaDir, r.path)), { recursive: true });
    writeFileSync(join(mediaDir, r.path), buf);
  });
  return missing.length;
}
