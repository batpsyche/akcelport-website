// Publishing: promote pending changes, export, build with the site's own build script, validate, swap atomically.
//   PUBLISH_DIR/releases/<id>/   one built site per publish
//   PUBLISH_DIR/current          symlink to the live release (swapped atomically; rollback re-points it)
//   PUBLISH_DIR/preview/         a build of the drafts, served behind login at /preview/
import { mkdirSync, existsSync, readdirSync, rmSync, symlinkSync, renameSync, readlinkSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import type { Config } from '../config.ts';
import type { Queryable } from '../db.ts';
import { HttpError } from '../auth/plugin.ts';
import { exportContent } from './export.ts';
import { pendingChanges, TABLES, type ItemType } from '../content/repo.ts';

export const RELEASE_RE = /^\d{8}-\d{6}-[a-z0-9]{4}$/;
const EMPTY_RELEASE = '00000000-000000-none';
const LOCK_KEY = 727401;

export interface Selection { families?: number[]; products?: number[]; downloads?: number[]; pages?: string[] }
export interface Actor { id: number; email: string }

const placeholder = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f2f3f5;color:#14181d}main{max-width:36rem;padding:2rem;background:#fff;border-top:4px solid #d6201a}</style></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>\n`;

function releaseId(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${randomBytes(2).toString('hex')}`;
}

export class PublishService {
  private busy = false;
  constructor(private pool: pg.Pool, private config: Config) {}

  get publishDir() { return this.config.publishDir; }
  get releasesDir() { return join(this.config.publishDir, 'releases'); }
  get currentLink() { return join(this.config.publishDir, 'current'); }
  get previewDir() { return join(this.config.publishDir, 'preview'); }

  /** Makes sure current/ and preview/ exist so the static servers have something to serve. */
  ensureDirs(): void {
    mkdirSync(this.releasesDir, { recursive: true });
    if (!existsSync(this.currentLink)) {
      const empty = join(this.releasesDir, EMPTY_RELEASE);
      mkdirSync(empty, { recursive: true });
      writeFileSync(join(empty, 'index.html'), placeholder('Nothing published yet', 'Use the Publish page in the backoffice to build and publish the site.'));
      writeFileSync(join(empty, '404.html'), placeholder('Not found', 'Nothing has been published yet.'));
      this.swapCurrent(EMPTY_RELEASE);
    }
    if (!existsSync(join(this.previewDir, 'index.html'))) {
      mkdirSync(this.previewDir, { recursive: true });
      writeFileSync(join(this.previewDir, 'index.html'), placeholder('No preview yet', 'Use "Preview changes" on the Publish page to build a preview of the drafts.'));
    }
  }

  currentRelease(): string | null {
    try { return basename(readlinkSync(this.currentLink)); } catch { return null; }
  }

  private swapCurrent(id: string): void {
    const tmp = join(this.config.publishDir, `current.${process.pid}.tmp`);
    rmSync(tmp, { force: true });
    symlinkSync(join('releases', id), tmp);
    renameSync(tmp, this.currentLink);
  }

  /** Newest first: by the id's timestamp (one-second resolution), then by directory mtime to order releases built in the same second.
   *  The mtime alone is not enough: a failed removal of an old release touches its directory, which must not make it look newest. */
  listReleases(): Array<{ id: string; createdAt: Date; current: boolean }> {
    if (!existsSync(this.releasesDir)) return [];
    const current = this.currentRelease();
    const second = (id: string) => id.slice(0, 15);
    return readdirSync(this.releasesDir)
      .filter((n) => RELEASE_RE.test(n))
      .map((id) => ({ id, createdAt: statSync(join(this.releasesDir, id)).mtime, current: id === current }))
      .sort((a, b) => second(b.id).localeCompare(second(a.id)) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  /** Removes releases beyond PUBLISH_KEEP (never the current one). A release that cannot be removed is reported, not fatal. */
  private prune(): { removed: string[]; warnings: string[] } {
    const keep = this.config.publishKeep;
    const current = this.currentRelease();
    const removed: string[] = [];
    const warnings: string[] = [];
    const stale = this.listReleases().slice(keep).map((r) => r.id).filter((id) => id !== current);
    if (current && current !== EMPTY_RELEASE && existsSync(join(this.releasesDir, EMPTY_RELEASE))) stale.push(EMPTY_RELEASE);
    for (const id of stale) {
      try {
        rmSync(join(this.releasesDir, id), { recursive: true, force: true });
        removed.push(id);
      } catch (err) {
        warnings.push(`Could not remove old release ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { removed, warnings };
  }

  private build(contentDir: string, outDir: string, env: Record<string, string> = {}): Promise<{ ok: boolean; log: string }> {
    return new Promise((resolve) => {
      const args = [join(this.config.siteRoot, 'scripts/build.mjs'), '--content', contentDir, '--out', outDir, '--assets', this.config.mediaDir];
      const child = spawn(process.execPath, args, { cwd: this.config.siteRoot, env: { ...process.env, SITE_BASE: '', SITE_URL: this.config.siteUrl ?? '', ...env } });
      let log = '';
      child.stdout.on('data', (d) => (log += d));
      child.stderr.on('data', (d) => (log += d));
      child.on('error', (err) => resolve({ ok: false, log: log + `\n${err.message}` }));
      child.on('close', (code) => resolve({ ok: code === 0, log: log.trim() }));
    });
  }

  private async record(kind: 'publish' | 'preview' | 'rollback', actor: Actor, releaseId: string | null, items: unknown): Promise<number> {
    const r = await this.pool.query<{ id: number }>(
      `INSERT INTO publishes (kind, status, started_by, started_by_email, release_id, items) VALUES ($1,'running',$2,$3,$4,$5) RETURNING id`,
      [kind, actor.id, actor.email, releaseId, JSON.stringify(items)],
    );
    return r.rows[0].id;
  }

  private async finish(id: number, status: 'success' | 'failed', log: string, error: string | null, releaseId?: string | null): Promise<void> {
    await this.pool.query(`UPDATE publishes SET status = $2, log = $3, error = $4, release_id = COALESCE($5, release_id), finished_at = now() WHERE id = $1`, [id, status, log, error, releaseId ?? null]);
  }

  /** Runs one publish or preview at a time. */
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new HttpError(409, 'A publish is already running');
    this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }

  /** Promotes the selected pending changes inside the given transaction (deletions last) and returns what was promoted. A selection that would leave a live product without a live family is refused. */
  private async promote(db: Queryable, selection: Selection | 'all') {
    const pending = await pendingChanges(db);
    const picked = ([['family', 'families'], ['product', 'products'], ['download', 'downloads']] as Array<[ItemType, keyof Selection]>)
      .flatMap(([type, key]) => pending.items.filter((i) => i.type === type && (selection === 'all' || ((selection[key] ?? []) as Array<number | string>).includes(i.id))).map((item) => ({ type, item })));
    const promoted: Array<{ type: string; id: number | string; slug: string; change: string }> = [];
    for (const { type, item } of picked.filter((p) => !p.item.pendingDeletion)) {
      await db.query(`UPDATE ${TABLES[type]} SET live = COALESCE(draft, live), draft = NULL, published_status = status, published_slug = slug, ${type === 'product' ? 'published_family_id = family_id,' : ''} updated_at = now() WHERE id = $1`, [item.id]);
      promoted.push({ type, id: item.id, slug: item.slug, change: item.change });
    }
    const orphan = await db.query<{ slug: string; family: string }>(
      `SELECT p.published_slug AS slug, f.slug AS family FROM products p JOIN families f ON f.id = p.published_family_id
       WHERE p.id = ANY($1) AND p.published_status = 'live' AND f.live IS NULL ORDER BY p.id LIMIT 1`,
      [picked.filter((p) => p.type === 'product' && !p.item.pendingDeletion).map((p) => p.item.id)],
    );
    if (orphan.rowCount) throw new HttpError(422, `Product "${orphan.rows[0].slug}" cannot go live before its family "${orphan.rows[0].family}": publish them together`);
    for (const page of pending.pages) {
      if (selection !== 'all' && !(selection.pages ?? []).includes(page.key)) continue;
      await db.query('UPDATE pages SET live = draft, draft = NULL, updated_at = now() WHERE key = $1', [page.key]);
      promoted.push({ type: 'page', id: page.key, slug: page.key, change: 'edit' });
    }
    for (const { type, item } of picked.filter((p) => p.item.pendingDeletion)) {
      if (type === 'family') {
        const left = await db.query<{ slug: string }>('SELECT slug FROM products WHERE family_id = $1 OR published_family_id = $1 ORDER BY slug', [item.id]);
        if (left.rowCount) throw new HttpError(422, `Family "${item.slug}" still has products on the site (${left.rows.map((r) => r.slug).join(', ')}): publish their move or deletion together with it`);
      }
      await db.query(`DELETE FROM ${TABLES[type]} WHERE id = $1`, [item.id]);
      await db.query('DELETE FROM content_versions WHERE entity_type = $1 AND entity_id = $2', [type, String(item.id)]);
      promoted.push({ type, id: item.id, slug: item.slug, change: item.change });
    }
    return promoted;
  }

  publish(actor: Actor, selection: Selection | 'all' = 'all'): Promise<{ id: number; releaseId: string; promoted: unknown[]; log: string }> {
    return this.exclusive(async () => {
      const id = releaseId();
      const tmpContent = join(this.config.publishDir, 'tmp', `${id}-content`);
      const outDir = join(this.releasesDir, id);
      const recordId = await this.record('publish', actor, id, null);
      let client: pg.PoolClient | undefined;
      let log = '';
      let promoted: unknown[];
      try {
        client = await this.pool.connect();
        await client.query('BEGIN');
        const locked = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS ok', [LOCK_KEY]);
        if (!locked.rows[0].ok) throw new HttpError(409, 'A publish is already running');
        promoted = await this.promote(client, selection);
        await this.pool.query('UPDATE publishes SET items = $2 WHERE id = $1', [recordId, JSON.stringify(promoted)]);
        const counts = await exportContent(client, 'live', tmpContent);
        log += `Exported ${counts.products} products, ${counts.families} families, ${counts.downloads} downloads, ${counts.redirects} redirects.\n`;
        const built = await this.build(tmpContent, outDir);
        log += built.log;
        if (!built.ok) throw new HttpError(422, 'The site build failed; nothing was published', { log });
        await client.query('COMMIT');
      } catch (err) {
        if (client) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
        rmSync(outDir, { recursive: true, force: true });
        const message = err instanceof Error ? err.message : String(err);
        await this.finish(recordId, 'failed', log, message);
        if (err instanceof HttpError) { err.details = { ...(err.details as object ?? {}), log, publishId: recordId }; throw err; }
        throw new HttpError(500, `Publish failed: ${message}`, { log, publishId: recordId });
      } finally {
        client?.release();
        rmSync(tmpContent, { recursive: true, force: true });
      }
      try {
        this.swapCurrent(id);
      } catch (err) {
        const message = `The content is published in the database, but switching the site to release ${id} failed: ${err instanceof Error ? err.message : String(err)}. Restore release ${id} from the Publish page once the cause is fixed.`;
        await this.finish(recordId, 'failed', log, message);
        throw new HttpError(500, message, { log, publishId: recordId, releaseId: id });
      }
      const pruned = this.prune();
      if (pruned.removed.length) log += `\nRemoved old releases: ${pruned.removed.join(', ')}`;
      for (const w of pruned.warnings) log += `\nWarning: ${w}`;
      try {
        await this.finish(recordId, 'success', log, null);
      } catch (err) {
        const message = `Release ${id} is live, but recording the publish failed: ${err instanceof Error ? err.message : String(err)}`;
        try { await this.finish(recordId, 'failed', log, message); } catch { /* the database is unreachable; the row stays as it is */ }
        throw new HttpError(500, message, { log, publishId: recordId, releaseId: id });
      }
      return { id: recordId, releaseId: id, promoted, log };
    });
  }

  preview(actor: Actor): Promise<{ id: number; log: string }> {
    return this.exclusive(async () => {
      const stamp = releaseId();
      const tmpContent = join(this.config.publishDir, 'tmp', `${stamp}-preview-content`);
      const tmpOut = join(this.config.publishDir, `preview.${stamp}.tmp`);
      const recordId = await this.record('preview', actor, null, null);
      let log = '';
      try {
        const counts = await exportContent(this.pool, 'preview', tmpContent);
        log += `Exported ${counts.products} products, ${counts.families} families, ${counts.downloads} downloads (drafts included).\n`;
        const built = await this.build(tmpContent, tmpOut, { SITE_BASE: '/preview/' });
        log += built.log;
        if (!built.ok) throw new HttpError(422, 'The preview build failed', { log });
        const old = join(this.config.publishDir, `preview.${stamp}.old`);
        if (existsSync(this.previewDir)) renameSync(this.previewDir, old);
        renameSync(tmpOut, this.previewDir);
        rmSync(old, { recursive: true, force: true });
        await this.finish(recordId, 'success', log, null);
        return { id: recordId, log };
      } catch (err) {
        rmSync(tmpOut, { recursive: true, force: true });
        const message = err instanceof Error ? err.message : String(err);
        await this.finish(recordId, 'failed', log, message);
        if (err instanceof HttpError) { err.details = { ...(err.details as object ?? {}), log, publishId: recordId }; throw err; }
        throw new HttpError(500, `Preview failed: ${message}`, { log, publishId: recordId });
      } finally {
        rmSync(tmpContent, { recursive: true, force: true });
      }
    });
  }

  async rollback(actor: Actor, id: string): Promise<{ id: number; releaseId: string }> {
    if (!RELEASE_RE.test(id) || !existsSync(join(this.releasesDir, id, 'index.html'))) throw new HttpError(404, 'Release not found');
    if (this.busy) throw new HttpError(409, 'A publish is already running');
    const recordId = await this.record('rollback', actor, id, null);
    try {
      this.swapCurrent(id);
      await this.finish(recordId, 'success', `Current release set to ${id}`, null);
    } catch (err) {
      const message = `Switching the site to release ${id} failed: ${err instanceof Error ? err.message : String(err)}`;
      try { await this.finish(recordId, 'failed', '', message); } catch { /* the database is unreachable; the row stays as it is */ }
      throw new HttpError(500, message, { publishId: recordId, releaseId: id });
    }
    return { id: recordId, releaseId: id };
  }

  async history() {
    const publishes = (await this.pool.query(
      `SELECT id, kind, status, started_by_email AS "startedBy", release_id AS "releaseId", items, log, error, started_at AS "startedAt", finished_at AS "finishedAt" FROM publishes ORDER BY id DESC LIMIT 50`,
    )).rows;
    return { current: this.currentRelease(), releases: this.listReleases(), publishes, busy: this.busy, previewBuiltAt: existsSync(this.previewDir) ? statSync(this.previewDir).mtime : null };
  }

  currentRealPath(): string { return realpathSync(this.currentLink); }
}
