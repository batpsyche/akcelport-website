import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type pg from 'pg';
import type { Config } from '../config.ts';
import { HttpError, requireAuth, requireAdmin } from '../auth/plugin.ts';
import { audit } from '../audit.ts';
import { getSetting, setSetting } from '../settings.ts';
import { pageKeys, redirectSchema, type PageKey } from '../../../shared/content-schemas.ts';
import {
  type ItemType, listItems, getItem, summarize, createItem, saveDraft, discardDraft, setStatus, deleteItem, restoreItem, reorderItems,
  revertItem, listVersions, getPage, savePage, discardPageDraft, revertPage, pendingChanges,
} from './repo.ts';

const idParam = (req: FastifyRequest) => {
  const id = Number((req.params as { id: string }).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Bad id');
  return id;
};

export async function contentRoutes(app: FastifyInstance, opts: { pool: pg.Pool; config: Config }) {
  const { pool } = opts;
  app.addHook('preHandler', requireAuth);

  app.get('/api/dashboard', async () => {
    const counts = (await pool.query(`SELECT
      (SELECT count(*) FROM products WHERE deleted_at IS NULL)::int AS products,
      (SELECT count(*) FROM families WHERE deleted_at IS NULL)::int AS families,
      (SELECT count(*) FROM downloads WHERE deleted_at IS NULL)::int AS downloads,
      (SELECT count(*) FROM media)::int AS media,
      (SELECT count(*) FROM users WHERE is_active)::int AS users`)).rows[0];
    const pending = await pendingChanges(pool);
    const lastPublish = (await pool.query(`SELECT id, kind, status, release_id AS "releaseId", started_by_email AS "startedBy", started_at AS "startedAt", finished_at AS "finishedAt", error FROM publishes WHERE kind IN ('publish','rollback') ORDER BY id DESC LIMIT 1`)).rows[0] ?? null;
    const recent = (await pool.query(`SELECT id, user_email AS "userEmail", action, entity_type AS "entityType", entity_id AS "entityId", label, created_at AS "createdAt" FROM audit_log ORDER BY id DESC LIMIT 8`)).rows;
    return { counts, pendingCount: pending.items.length + pending.pages.length, lastPublish, recent };
  });

  app.get('/api/pending', async () => pendingChanges(pool));

  // ---- families, products, downloads: one route set each
  for (const [type, base] of [['family', 'families'], ['product', 'products'], ['download', 'downloads']] as Array<[ItemType, string]>) {
    const full = async (id: number) => {
      const row = await getItem(pool, type, id);
      return { item: summarize(row), body: row.draft ?? row.live, live: row.live, versions: await listVersions(pool, type, String(id)) };
    };

    app.get(`/api/${base}`, async () => ({ items: await listItems(pool, type) }));
    app.get(`/api/${base}/:id`, async (req) => full(idParam(req)));
    app.post(`/api/${base}`, async (req, reply) => {
      const input = z.object({ slug: z.string(), familyId: z.number().int().optional(), body: z.unknown() }).parse(req.body);
      const row = await createItem(pool, req, type, { slug: input.slug, familyId: input.familyId, body: input.body });
      reply.code(201);
      return full(row.id);
    });
    app.put(`/api/${base}/:id`, async (req) => {
      const input = z.object({ slug: z.string().optional(), familyId: z.number().int().optional(), body: z.unknown() }).parse(req.body);
      const row = await saveDraft(pool, req, type, idParam(req), { slug: input.slug, familyId: input.familyId, body: input.body });
      return full(row.id);
    });
    app.post(`/api/${base}/:id/discard`, async (req) => full((await discardDraft(pool, req, type, idParam(req))).id));
    app.post(`/api/${base}/:id/status`, async (req) => {
      const { status } = z.object({ status: z.enum(['hidden', 'live']) }).parse(req.body);
      return full((await setStatus(pool, req, type, idParam(req), status)).id);
    });
    app.delete(`/api/${base}/:id`, async (req) => deleteItem(pool, req, type, idParam(req)));
    app.post(`/api/${base}/:id/restore`, async (req) => full((await restoreItem(pool, req, type, idParam(req))).id));
    app.post(`/api/${base}/reorder`, async (req) => {
      const input = z.object({ ids: z.array(z.number().int()).min(1), familyId: z.number().int().optional() }).parse(req.body);
      await reorderItems(pool, req, type, input.ids, input.familyId);
      return { items: await listItems(pool, type) };
    });
    app.get(`/api/${base}/:id/versions`, async (req) => ({ versions: await listVersions(pool, type, String(idParam(req))) }));
    app.get(`/api/${base}/:id/versions/:versionId`, async (req) => {
      const v = await pool.query('SELECT id, version_no AS "versionNo", body, created_at AS "createdAt" FROM content_versions WHERE id = $1 AND entity_type = $2 AND entity_id = $3', [Number((req.params as { versionId: string }).versionId), type, String(idParam(req))]);
      if (!v.rows[0]) throw new HttpError(404, 'Version not found');
      return { version: v.rows[0] };
    });
    app.post(`/api/${base}/:id/revert`, async (req) => {
      const { versionId } = z.object({ versionId: z.number().int() }).parse(req.body);
      return full((await revertItem(pool, req, type, idParam(req), versionId)).id);
    });
  }

  // ---- pages (site-wide documents). "site" is admin-only.
  const pageKey = (req: FastifyRequest): PageKey => {
    const key = (req.params as { key: string }).key as PageKey;
    if (!pageKeys.includes(key)) throw new HttpError(404, 'Document not found');
    if (key === 'site' && req.user!.role !== 'admin') throw new HttpError(403, 'Site settings are managed by an administrator');
    return key;
  };
  const fullPage = async (key: PageKey) => {
    const row = await getPage(pool, key);
    return { key, body: row.draft ?? row.live, live: row.live, hasDraft: row.draft !== null, updatedAt: row.updated_at, versions: await listVersions(pool, 'page', key) };
  };
  app.get('/api/pages', async () => ({
    pages: (await pool.query('SELECT key, draft IS NOT NULL AS "hasDraft", updated_at AS "updatedAt" FROM pages ORDER BY key')).rows,
  }));
  app.get('/api/pages/:key', async (req) => fullPage(pageKey(req)));
  app.put('/api/pages/:key', async (req) => {
    const key = pageKey(req);
    const { body } = z.object({ body: z.unknown() }).parse(req.body);
    await savePage(pool, req, key, body);
    return fullPage(key);
  });
  app.post('/api/pages/:key/discard', async (req) => { const key = pageKey(req); await discardPageDraft(pool, req, key); return fullPage(key); });
  app.get('/api/pages/:key/versions/:versionId', async (req) => {
    const key = pageKey(req);
    const v = await pool.query('SELECT id, version_no AS "versionNo", body, created_at AS "createdAt" FROM content_versions WHERE id = $1 AND entity_type = $2 AND entity_id = $3', [Number((req.params as { versionId: string }).versionId), 'page', key]);
    if (!v.rows[0]) throw new HttpError(404, 'Version not found');
    return { version: v.rows[0] };
  });
  app.post('/api/pages/:key/revert', async (req) => {
    const key = pageKey(req);
    const { versionId } = z.object({ versionId: z.number().int() }).parse(req.body);
    await revertPage(pool, req, key, versionId);
    return fullPage(key);
  });

  // ---- app settings (admin)
  app.get('/api/settings', async () => ({ editorsCanPublish: (await getSetting(pool, 'editors_can_publish', true)) === true }));
  app.put('/api/settings', { preHandler: requireAdmin }, async (req) => {
    const body = z.object({ editorsCanPublish: z.boolean() }).parse(req.body);
    await setSetting(pool, 'editors_can_publish', body.editorsCanPublish);
    await audit(pool, req, { action: 'settings.update', entityType: 'settings', label: 'editorsCanPublish', changes: body });
    return { editorsCanPublish: body.editorsCanPublish };
  });

  // ---- redirects (admin)
  const redirectRows = async () => (await pool.query('SELECT id, kind, from_path AS "fromPath", to_path AS "toPath", sort_order AS "sortOrder", updated_at AS "updatedAt" FROM redirects ORDER BY sort_order, id')).rows;
  app.get('/api/redirects', async () => ({ redirects: await redirectRows() }));
  app.post('/api/redirects', { preHandler: requireAdmin }, async (req, reply) => {
    const body = redirectSchema.parse(req.body);
    const dup = await pool.query('SELECT 1 FROM redirects WHERE from_path = $1', [body.from_path]);
    if (dup.rowCount) throw new HttpError(409, 'A redirect from this path already exists');
    const r = await pool.query('INSERT INTO redirects (kind, from_path, to_path, sort_order) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM redirects)) RETURNING id', [body.kind, body.from_path, body.to_path]);
    await audit(pool, req, { action: 'redirect.create', entityType: 'redirect', entityId: r.rows[0].id, label: `${body.from_path} -> ${body.to_path}` });
    reply.code(201);
    return { redirects: await redirectRows() };
  });
  app.put('/api/redirects/:id', { preHandler: requireAdmin }, async (req) => {
    const id = idParam(req);
    const body = redirectSchema.parse(req.body);
    const dup = await pool.query('SELECT 1 FROM redirects WHERE from_path = $1 AND id <> $2', [body.from_path, id]);
    if (dup.rowCount) throw new HttpError(409, 'A redirect from this path already exists');
    const r = await pool.query('UPDATE redirects SET kind = $2, from_path = $3, to_path = $4, updated_at = now() WHERE id = $1', [id, body.kind, body.from_path, body.to_path]);
    if (!r.rowCount) throw new HttpError(404, 'Redirect not found');
    await audit(pool, req, { action: 'redirect.update', entityType: 'redirect', entityId: id, label: `${body.from_path} -> ${body.to_path}` });
    return { redirects: await redirectRows() };
  });
  app.delete('/api/redirects/:id', { preHandler: requireAdmin }, async (req) => {
    const id = idParam(req);
    const r = await pool.query('DELETE FROM redirects WHERE id = $1 RETURNING from_path', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Redirect not found');
    await audit(pool, req, { action: 'redirect.delete', entityType: 'redirect', entityId: id, label: r.rows[0].from_path });
    return { redirects: await redirectRows() };
  });

  // ---- audit log
  app.get('/api/audit', async (req) => {
    const q = z.object({ before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(200).default(50), entityType: z.string().optional(), entityId: z.string().optional(), q: z.string().optional() }).parse(req.query);
    const ipColumn = req.user!.role === 'admin' ? 'ip, ' : '';
    const rows = (await pool.query(
      `SELECT id, user_email AS "userEmail", action, entity_type AS "entityType", entity_id AS "entityId", label, changes, ${ipColumn}created_at AS "createdAt"
       FROM audit_log WHERE ($1::bigint IS NULL OR id < $1) AND ($2::text IS NULL OR entity_type = $2) AND ($3::text IS NULL OR entity_id = $3)
         AND ($4::text IS NULL OR label ILIKE '%' || $4 || '%' OR user_email ILIKE '%' || $4 || '%' OR action ILIKE '%' || $4 || '%')
       ORDER BY id DESC LIMIT $5`,
      [q.before ?? null, q.entityType ?? null, q.entityId ?? null, q.q ?? null, q.limit],
    )).rows;
    return { entries: rows, nextBefore: rows.length === q.limit ? rows[rows.length - 1].id : null };
  });
}
