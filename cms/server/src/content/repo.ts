// Content items (families, products, downloads) share one model: a live body, an optional draft body, a visibility
// status, a pending-deletion flag, numbered versions and an audit trail. Pages (site-wide documents) have live/draft only.
import type { FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { Queryable } from '../db.ts';
import { HttpError } from '../auth/plugin.ts';
import { audit, diffDocuments } from '../audit.ts';
import { productBodySchema, familyBodySchema, downloadBodySchema, pageSchemas, slugSchema, type PageKey } from '../../../shared/content-schemas.ts';
import { checkMediaRefs, checkDownloadRefs, type Issue } from './validate.ts';

export type ItemType = 'family' | 'product' | 'download';
export const TABLES: Record<ItemType, string> = { family: 'families', product: 'products', download: 'downloads' };
const SCHEMAS: Record<ItemType, ZodType> = { family: familyBodySchema, product: productBodySchema, download: downloadBodySchema };

export interface ItemRow {
  id: number; slug: string; published_slug: string | null; family_id?: number; published_family_id?: number | null; sort_order: number; status: 'hidden' | 'live'; published_status: 'hidden' | 'live';
  live: Record<string, unknown> | null; draft: Record<string, unknown> | null; deleted_at: Date | null; created_at: Date; updated_at: Date; updated_by: number | null;
}

export interface ItemSummary {
  id: number; slug: string; name: string; familyId?: number; sortOrder: number; status: 'hidden' | 'live'; publishedStatus: 'hidden' | 'live';
  hasDraft: boolean; neverPublished: boolean; pendingDeletion: boolean; pending: boolean; updatedAt: Date;
}

export function summarize(row: ItemRow): ItemSummary {
  const body = row.draft ?? row.live ?? {};
  const name = String((body as { name?: string; title?: string }).name ?? (body as { title?: string }).title ?? row.slug);
  const hasDraft = row.draft !== null || (row.live !== null && (row.slug !== row.published_slug || (row.family_id ?? null) !== (row.published_family_id ?? null)));
  const pendingDeletion = row.deleted_at !== null;
  return {
    id: row.id, slug: row.slug, name, familyId: row.family_id, sortOrder: row.sort_order, status: row.status, publishedStatus: row.published_status,
    hasDraft, neverPublished: row.live === null, pendingDeletion,
    pending: hasDraft || pendingDeletion || row.status !== row.published_status, updatedAt: row.updated_at,
  };
}

export class ValidationError extends HttpError {
  constructor(issues: Issue[]) { super(400, 'Please fix the highlighted fields', { issues }); }
}

export function parseBody(type: ItemType, body: unknown): Record<string, unknown> {
  const r = SCHEMAS[type].safeParse(body);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data as Record<string, unknown>;
}

export async function validateItem(db: Queryable, type: ItemType, body: Record<string, unknown>): Promise<void> {
  const issues = await checkMediaRefs(db, body);
  if (type === 'product') issues.push(...(await checkDownloadRefs(db, (body.downloads as string[]) ?? [])));
  if (issues.length) throw new ValidationError(issues);
}

export async function listItems(db: Queryable, type: ItemType): Promise<ItemSummary[]> {
  const rows = await db.query<ItemRow>(`SELECT * FROM ${TABLES[type]} ORDER BY ${type === 'product' ? 'family_id, ' : ''}sort_order, id`);
  return rows.rows.map(summarize);
}

export async function getItem(db: Queryable, type: ItemType, id: number): Promise<ItemRow> {
  const r = await db.query<ItemRow>(`SELECT * FROM ${TABLES[type]} WHERE id = $1`, [id]);
  if (!r.rows[0]) throw new HttpError(404, 'Not found');
  return r.rows[0];
}

async function nextVersion(db: Queryable, entityType: string, entityId: string): Promise<number> {
  const r = await db.query<{ n: number }>('SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM content_versions WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);
  return Number(r.rows[0].n);
}

export async function writeVersion(db: Queryable, entityType: string, entityId: string, body: unknown, userId: number | null, note?: string, meta: { slug?: string; familyId?: number | null } = {}): Promise<number> {
  const n = await nextVersion(db, entityType, entityId);
  await db.query('INSERT INTO content_versions (entity_type, entity_id, version_no, body, slug, family_id, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [entityType, entityId, n, JSON.stringify(body), meta.slug ?? null, meta.familyId ?? null, note ?? null, userId]);
  return n;
}

export async function listVersions(db: Queryable, entityType: string, entityId: string) {
  return (await db.query(
    `SELECT v.id, v.version_no AS "versionNo", v.note, v.created_at AS "createdAt", u.email AS "createdBy"
     FROM content_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.entity_type = $1 AND v.entity_id = $2 ORDER BY v.version_no DESC LIMIT 50`,
    [entityType, entityId],
  )).rows;
}

/** Key-order-independent equality (jsonb does not preserve key order). */
export function canonical(v: unknown): string {
  const sort = (x: unknown): unknown => Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])])) : x;
  return JSON.stringify(sort(v));
}
const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export interface SaveOptions { slug?: string; familyId?: number }

/** Slugs of the products whose current body links the given download. */
async function linkedProducts(db: Queryable, downloadSlug: string): Promise<string[]> {
  const used = await db.query<{ slug: string }>(`SELECT slug FROM products WHERE deleted_at IS NULL AND (COALESCE(draft, live)->'downloads') ? $1 ORDER BY slug LIMIT 5`, [downloadSlug]);
  return used.rows.map((r) => r.slug);
}

export async function createItem(db: Queryable, req: FastifyRequest, type: ItemType, input: { slug: string; familyId?: number; body: unknown }): Promise<ItemRow> {
  const slug = slugSchema.parse(input.slug);
  const body = parseBody(type, input.body);
  await validateItem(db, type, body);
  const exists = await db.query(`SELECT 1 FROM ${TABLES[type]} WHERE slug = $1 OR published_slug = $1`, [slug]);
  if (exists.rowCount) throw new ValidationError([{ path: 'slug', message: 'This slug is already used' }]);
  let familyCols = '', familyVals = '';
  const params: unknown[] = [slug, JSON.stringify(body)];
  if (type === 'product') {
    if (!input.familyId) throw new ValidationError([{ path: 'familyId', message: 'Choose a family' }]);
    const fam = await db.query('SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL', [input.familyId]);
    if (!fam.rowCount) throw new ValidationError([{ path: 'familyId', message: 'Unknown family' }]);
    familyCols = ', family_id'; familyVals = ', $3'; params.push(input.familyId);
  }
  const orderSql = type === 'product' ? `(SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products WHERE family_id = $3)` : `(SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ${TABLES[type]})`;
  const r = await db.query<ItemRow>(
    `INSERT INTO ${TABLES[type]} (slug, draft, status, published_status, sort_order, updated_by${familyCols}) VALUES ($1, $2, 'live', 'hidden', ${orderSql}, ${type === 'product' ? '$4' : '$3'}${familyVals}) RETURNING *`,
    type === 'product' ? [...params, req.user!.id] : [...params, req.user!.id],
  );
  const row = r.rows[0];
  await writeVersion(db, type, String(row.id), body, req.user!.id, 'Created', { slug, familyId: row.family_id ?? null });
  await audit(db, req, { action: `${type}.create`, entityType: type, entityId: row.id, label: `${slug}` });
  return row;
}

export async function saveDraft(db: Queryable, req: FastifyRequest, type: ItemType, id: number, input: { body: unknown } & SaveOptions): Promise<ItemRow> {
  const current = await getItem(db, type, id);
  const body = parseBody(type, input.body);
  await validateItem(db, type, body);
  let slug = current.slug;
  if (input.slug !== undefined && input.slug !== current.slug) {
    slug = slugSchema.parse(input.slug);
    const exists = await db.query(`SELECT 1 FROM ${TABLES[type]} WHERE (slug = $1 OR published_slug = $1) AND id <> $2`, [slug, id]);
    if (exists.rowCount) throw new ValidationError([{ path: 'slug', message: 'This slug is already used' }]);
    if (type === 'download') {
      const used = await linkedProducts(db, current.slug);
      if (used.length) throw new ValidationError([{ path: 'slug', message: `Still linked from: ${used.join(', ')}; unlink it from these products before renaming` }]);
    }
  }
  let familyId = current.family_id ?? null;
  if (type === 'product' && input.familyId !== undefined && input.familyId !== current.family_id) {
    const fam = await db.query('SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL', [input.familyId]);
    if (!fam.rowCount) throw new ValidationError([{ path: 'familyId', message: 'Unknown family' }]);
    familyId = input.familyId;
  }
  const draft = current.live && sameJson(body, current.live) ? null : body;
  const r = await db.query<ItemRow>(
    `UPDATE ${TABLES[type]} SET draft = $2, slug = $3, ${type === 'product' ? 'family_id = $5,' : ''} updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING *`,
    type === 'product' ? [id, draft ? JSON.stringify(draft) : null, slug, req.user!.id, familyId] : [id, draft ? JSON.stringify(draft) : null, slug, req.user!.id],
  );
  const previous = current.draft ?? current.live;
  if (!sameJson(previous, body) || slug !== current.slug || familyId !== (current.family_id ?? null)) {
    await writeVersion(db, type, String(id), body, req.user!.id, undefined, { slug, familyId });
    await audit(db, req, { action: `${type}.save`, entityType: type, entityId: id, label: slug, changes: { ...diffDocuments(previous as Record<string, unknown>, body), ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}), ...(familyId !== (current.family_id ?? null) ? { familyId: { from: current.family_id, to: familyId } } : {}) } });
  }
  return r.rows[0];
}

export async function discardDraft(db: Queryable, req: FastifyRequest, type: ItemType, id: number): Promise<ItemRow> {
  const current = await getItem(db, type, id);
  if (current.live === null) throw new HttpError(400, 'This item has never been published; delete it instead');
  const r = await db.query<ItemRow>(
    `UPDATE ${TABLES[type]} SET draft = NULL, slug = published_slug, ${type === 'product' ? 'family_id = published_family_id,' : ''} updated_at = now(), updated_by = $2 WHERE id = $1 RETURNING *`,
    [id, req.user!.id],
  );
  await audit(db, req, { action: `${type}.discard-draft`, entityType: type, entityId: id, label: current.slug });
  return r.rows[0];
}

export async function setStatus(db: Queryable, req: FastifyRequest, type: ItemType, id: number, status: 'hidden' | 'live'): Promise<ItemRow> {
  const current = await getItem(db, type, id);
  const r = await db.query<ItemRow>(`UPDATE ${TABLES[type]} SET status = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *`, [id, status, req.user!.id]);
  await audit(db, req, { action: `${type}.status`, entityType: type, entityId: id, label: current.slug, changes: { status: { from: current.status, to: status } } });
  return r.rows[0];
}

export async function deleteItem(db: Queryable, req: FastifyRequest, type: ItemType, id: number): Promise<{ hard: boolean }> {
  const current = await getItem(db, type, id);
  if (type === 'family') {
    const n = await db.query('SELECT count(*)::int AS n FROM products WHERE family_id = $1', [id]);
    if (n.rows[0].n > 0) throw new HttpError(400, 'Move or delete the products in this family first');
  }
  if (type === 'download') {
    const used = await linkedProducts(db, current.slug);
    if (used.length) throw new HttpError(400, `Still linked from: ${used.join(', ')}`);
  }
  if (current.live === null) {
    await db.query(`DELETE FROM ${TABLES[type]} WHERE id = $1`, [id]);
    await db.query('DELETE FROM content_versions WHERE entity_type = $1 AND entity_id = $2', [type, String(id)]);
    await audit(db, req, { action: `${type}.delete`, entityType: type, entityId: id, label: current.slug });
    return { hard: true };
  }
  await db.query(`UPDATE ${TABLES[type]} SET deleted_at = now(), draft = NULL, updated_at = now(), updated_by = $2 WHERE id = $1`, [id, req.user!.id]);
  await audit(db, req, { action: `${type}.delete`, entityType: type, entityId: id, label: current.slug, changes: { pending: true } });
  return { hard: false };
}

export async function restoreItem(db: Queryable, req: FastifyRequest, type: ItemType, id: number): Promise<ItemRow> {
  const current = await getItem(db, type, id);
  const r = await db.query<ItemRow>(`UPDATE ${TABLES[type]} SET deleted_at = NULL, updated_at = now(), updated_by = $2 WHERE id = $1 RETURNING *`, [id, req.user!.id]);
  await audit(db, req, { action: `${type}.restore`, entityType: type, entityId: id, label: current.slug });
  return r.rows[0];
}

export async function reorderItems(db: Queryable, req: FastifyRequest, type: ItemType, ids: number[], familyId?: number): Promise<void> {
  const where = type === 'product' ? 'AND family_id = $2' : '';
  const params: unknown[] = [ids];
  if (type === 'product') {
    if (!familyId) throw new HttpError(400, 'familyId is required');
    params.push(familyId);
  }
  const rows = await db.query<{ id: number }>(`SELECT id FROM ${TABLES[type]} WHERE id = ANY($1) ${where}`, params);
  if (rows.rowCount !== ids.length) throw new HttpError(400, 'Some items do not belong here');
  for (let i = 0; i < ids.length; i++) await db.query(`UPDATE ${TABLES[type]} SET sort_order = $2, updated_at = now() WHERE id = $1`, [ids[i], i + 1]);
  await audit(db, req, { action: `${type}.reorder`, entityType: type, entityId: familyId ?? undefined, label: `${ids.length} items`, changes: { ids } });
}

export async function revertItem(db: Queryable, req: FastifyRequest, type: ItemType, id: number, versionId: number): Promise<ItemRow> {
  const v = await db.query<{ body: Record<string, unknown>; version_no: number; slug: string | null; family_id: number | null }>('SELECT body, version_no, slug, family_id FROM content_versions WHERE id = $1 AND entity_type = $2 AND entity_id = $3', [versionId, type, String(id)]);
  if (!v.rows[0]) throw new HttpError(404, 'Version not found');
  const row = await saveDraft(db, req, type, id, { body: v.rows[0].body, slug: v.rows[0].slug ?? undefined, familyId: v.rows[0].family_id ?? undefined });
  await audit(db, req, { action: `${type}.revert`, entityType: type, entityId: id, label: row.slug, changes: { toVersion: v.rows[0].version_no } });
  return row;
}

// ---- pages (site-wide documents)

export interface PageRow { key: string; live: Record<string, unknown> | null; draft: Record<string, unknown> | null; updated_at: Date; updated_by: number | null }

export async function getPage(db: Queryable, key: PageKey): Promise<PageRow> {
  const r = await db.query<PageRow>('SELECT * FROM pages WHERE key = $1', [key]);
  if (!r.rows[0]) throw new HttpError(404, 'Document not found');
  return r.rows[0];
}

export async function savePage(db: Queryable, req: FastifyRequest, key: PageKey, input: unknown): Promise<PageRow> {
  const current = await getPage(db, key);
  const parsed = pageSchemas[key].safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const body = parsed.data as Record<string, unknown>;
  const issues = await checkMediaRefs(db, body);
  if (issues.length) throw new ValidationError(issues);
  const draft = current.live && sameJson(body, current.live) ? null : body;
  const r = await db.query<PageRow>('UPDATE pages SET draft = $2, updated_at = now(), updated_by = $3 WHERE key = $1 RETURNING *', [key, draft ? JSON.stringify(draft) : null, req.user!.id]);
  const previous = current.draft ?? current.live;
  if (!sameJson(previous, body)) {
    await writeVersion(db, 'page', key, body, req.user!.id);
    await audit(db, req, { action: 'page.save', entityType: 'page', entityId: key, label: key, changes: diffDocuments(previous, body) });
  }
  return r.rows[0];
}

export async function discardPageDraft(db: Queryable, req: FastifyRequest, key: PageKey): Promise<PageRow> {
  const r = await db.query<PageRow>('UPDATE pages SET draft = NULL, updated_at = now(), updated_by = $2 WHERE key = $1 RETURNING *', [key, req.user!.id]);
  await audit(db, req, { action: 'page.discard-draft', entityType: 'page', entityId: key, label: key });
  return r.rows[0];
}

export async function revertPage(db: Queryable, req: FastifyRequest, key: PageKey, versionId: number): Promise<PageRow> {
  const v = await db.query<{ body: Record<string, unknown>; version_no: number }>('SELECT body, version_no FROM content_versions WHERE id = $1 AND entity_type = $2 AND entity_id = $3', [versionId, 'page', key]);
  if (!v.rows[0]) throw new HttpError(404, 'Version not found');
  const row = await savePage(db, req, key, v.rows[0].body);
  await audit(db, req, { action: 'page.revert', entityType: 'page', entityId: key, label: key, changes: { toVersion: v.rows[0].version_no } });
  return row;
}

/** Everything that would change at the next publish. */
export async function pendingChanges(db: Queryable) {
  const items: Array<ItemSummary & { type: ItemType; change: string }> = [];
  for (const type of ['family', 'product', 'download'] as ItemType[]) {
    for (const s of await listItems(db, type)) {
      if (!s.pending) continue;
      const change = s.pendingDeletion ? 'delete' : s.neverPublished ? 'new' : s.hasDraft && s.status !== s.publishedStatus ? `edit, ${s.status === 'live' ? 'show' : 'hide'}` : s.hasDraft ? 'edit' : s.status === 'live' ? 'show' : 'hide';
      items.push({ ...s, type, change });
    }
  }
  const pages = (await db.query<{ key: string; updated_at: Date }>('SELECT key, updated_at FROM pages WHERE draft IS NOT NULL ORDER BY key')).rows.map((p) => ({ key: p.key, updatedAt: p.updated_at, change: 'edit' }));
  return { items, pages };
}
