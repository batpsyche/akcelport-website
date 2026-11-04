// Media library: photos and PDFs on disk under MEDIA_DIR, mirroring the website's public/ layout.
import type { FastifyInstance } from 'fastify';
import { mkdirSync, existsSync, writeFileSync, renameSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type pg from 'pg';
import type { Config } from '../config.ts';
import { HttpError, requireAuth } from '../auth/plugin.ts';
import { audit } from '../audit.ts';
import { inspectBuffer } from './inspect.ts';

export const FOLDER_RE = /^(img\/(products\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/originals)?|company|downloads)|downloads\/(catalogue|legacy))$/;
const MEDIA_COLS = 'id, path, kind, mime, bytes, width, height, pages, sha256, original_filename AS "originalFilename", created_at AS "createdAt", updated_at AS "updatedAt"';

export const slugifyName = (name: string) => basename(name, extname(name)).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';

export async function isMediaReferenced(pool: pg.Pool, path: string): Promise<string[]> {
  const needle = `%"/${path}"%`;
  const hits: string[] = [];
  for (const [table, label] of [['products', 'product'], ['families', 'family'], ['downloads', 'download']]) {
    const r = await pool.query<{ slug: string }>(`SELECT slug FROM ${table} WHERE live::text LIKE $1 OR draft::text LIKE $1 LIMIT 3`, [needle]);
    hits.push(...r.rows.map((x) => `${label} ${x.slug}`));
  }
  const p = await pool.query<{ key: string }>('SELECT key FROM pages WHERE live::text LIKE $1 OR draft::text LIKE $1 LIMIT 3', [needle]);
  hits.push(...p.rows.map((x) => `document ${x.key}`));
  return hits;
}

/** Items whose bodies reference the image at `path` with a width or height other than the given one. */
export async function staleImageRefs(pool: pg.Pool, path: string, width: number, height: number): Promise<string[]> {
  const vars = JSON.stringify({ src: `/${path}`, w: width, h: height });
  const stale = (col: string) => `jsonb_path_exists(${col}, '$.** ? (@.src == $src && (@.w != $w || @.h != $h))', $1::jsonb)`;
  const hits: string[] = [];
  for (const [table, label] of [['products', 'product'], ['families', 'family'], ['downloads', 'download']]) {
    const r = await pool.query<{ slug: string }>(`SELECT slug FROM ${table} WHERE ${stale('live')} OR ${stale('draft')} ORDER BY slug`, [vars]);
    hits.push(...r.rows.map((x) => `${label} ${x.slug}`));
  }
  const p = await pool.query<{ key: string }>(`SELECT key FROM pages WHERE ${stale('live')} OR ${stale('draft')} ORDER BY key`, [vars]);
  hits.push(...p.rows.map((x) => `document ${x.key}`));
  return hits;
}

export async function mediaRoutes(app: FastifyInstance, opts: { pool: pg.Pool; config: Config }) {
  const { pool, config } = opts;
  app.addHook('preHandler', requireAuth);

  app.get('/api/media', async (req) => {
    const q = z.object({ kind: z.enum(['image', 'pdf']).optional(), q: z.string().optional() }).parse(req.query);
    const rows = (await pool.query(
      `SELECT ${MEDIA_COLS} FROM media WHERE ($1::text IS NULL OR kind = $1) AND ($2::text IS NULL OR path ILIKE '%' || $2 || '%') ORDER BY path`,
      [q.kind ?? null, q.q ?? null],
    )).rows;
    return { media: rows };
  });

  app.get('/api/media/:id/usage', async (req) => {
    const row = (await pool.query<{ path: string }>('SELECT path FROM media WHERE id = $1', [Number((req.params as { id: string }).id)])).rows[0];
    if (!row) throw new HttpError(404, 'Not found');
    return { usedBy: await isMediaReferenced(pool, row.path) };
  });

  async function readUpload(req: Parameters<typeof app.post>[1] extends never ? never : import('fastify').FastifyRequest) {
    const part = await req.file();
    if (!part) throw new HttpError(400, 'No file uploaded');
    const buf = await part.toBuffer();
    if (part.file.truncated) throw new HttpError(413, 'File is too large');
    const info = inspectBuffer(buf);
    if (!info) throw new HttpError(400, 'Only WebP, PNG, JPEG images and PDF files are accepted');
    const limit = info.kind === 'pdf' ? config.uploadPdfMaxBytes : config.uploadImageMaxBytes;
    if (buf.length > limit) throw new HttpError(413, `File is larger than ${Math.round(limit / 1024 / 1024)} MB`);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(part.fields)) {
      const f = Array.isArray(v) ? v[0] : v;
      if (f && 'value' in f && typeof f.value === 'string') fields[k] = f.value;
    }
    return { buf, info, fields, filename: part.filename };
  }

  const writeAtomic = (abs: string, buf: Buffer) => {
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = `${abs}.upload-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, buf);
    renameSync(tmp, abs);
  };

  app.post('/api/media', async (req, reply) => {
    const { buf, info, fields, filename } = await readUpload(req);
    const folder = fields.folder ?? '';
    if (!FOLDER_RE.test(folder)) throw new HttpError(400, 'Choose a valid folder (img/products/<slug>, img/company, img/downloads, downloads/catalogue or downloads/legacy)');
    if ((folder.startsWith('downloads/') && info.kind !== 'pdf') || (folder.startsWith('img/') && info.kind !== 'image')) throw new HttpError(400, 'PDFs go under downloads/, images under img/');
    const base = slugifyName(fields.name || filename);
    let path = `${folder}/${base}.${info.ext}`;
    for (let n = 2; existsSync(join(config.mediaDir, path)) || (await pool.query('SELECT 1 FROM media WHERE path = $1', [path])).rowCount; n++) path = `${folder}/${base}-${n}.${info.ext}`;
    writeAtomic(join(config.mediaDir, path), buf);
    const sha = createHash('sha256').update(buf).digest('hex');
    const row = (await pool.query(
      `INSERT INTO media (path, kind, mime, bytes, width, height, pages, sha256, original_filename, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${MEDIA_COLS}`,
      [path, info.kind, info.mime, buf.length, info.width ?? null, info.height ?? null, info.pages ?? null, sha, filename, req.user!.id],
    )).rows[0];
    await audit(pool, req, { action: 'media.upload', entityType: 'media', entityId: row.id, label: path, changes: { bytes: buf.length, mime: info.mime } });
    reply.code(201);
    return { media: row };
  });

  app.post('/api/media/:id/replace', async (req) => {
    const id = Number((req.params as { id: string }).id);
    const current = (await pool.query<{ path: string; kind: string }>('SELECT path, kind FROM media WHERE id = $1', [id])).rows[0];
    if (!current) throw new HttpError(404, 'Not found');
    const { buf, info } = await readUpload(req);
    if (info.kind !== current.kind) throw new HttpError(400, `Replace a ${current.kind} with a ${current.kind}`);
    const currentExt = extname(current.path).slice(1);
    if (info.ext !== currentExt && !(info.ext === 'jpg' && currentExt === 'jpeg')) throw new HttpError(400, `Upload a .${currentExt} file so links keep working`);
    writeAtomic(join(config.mediaDir, current.path), buf);
    const sha = createHash('sha256').update(buf).digest('hex');
    const row = (await pool.query(
      `UPDATE media SET mime = $2, bytes = $3, width = $4, height = $5, pages = $6, sha256 = $7, uploaded_by = $8, updated_at = now() WHERE id = $1 RETURNING ${MEDIA_COLS}`,
      [id, info.mime, buf.length, info.width ?? null, info.height ?? null, info.pages ?? null, sha, req.user!.id],
    )).rows[0];
    await audit(pool, req, { action: 'media.replace', entityType: 'media', entityId: id, label: current.path, changes: { bytes: buf.length } });
    const stale = info.width && info.height ? await staleImageRefs(pool, current.path, info.width, info.height) : [];
    const warning = stale.length ? `The new file is ${info.width}×${info.height} but ${stale.join(', ')} still store another size for it; open them and pick the image again to update the size.` : null;
    return { media: row, warning };
  });

  app.delete('/api/media/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    const current = (await pool.query<{ path: string }>('SELECT path FROM media WHERE id = $1', [id])).rows[0];
    if (!current) throw new HttpError(404, 'Not found');
    const used = await isMediaReferenced(pool, current.path);
    if (used.length) throw new HttpError(400, `Still used by ${used.join(', ')}`);
    await pool.query('DELETE FROM media WHERE id = $1', [id]);
    const abs = join(config.mediaDir, current.path);
    if (existsSync(abs)) unlinkSync(abs);
    await audit(pool, req, { action: 'media.delete', entityType: 'media', entityId: id, label: current.path });
    return { ok: true };
  });
}

/** Reads a media file for tests and tooling. */
export const readMedia = (config: Config, path: string) => readFileSync(join(config.mediaDir, path));
