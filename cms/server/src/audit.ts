import type { FastifyRequest } from 'fastify';
import type { Queryable } from './db.ts';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string | number;
  label?: string;
  changes?: unknown;
}

export async function audit(db: Queryable, req: FastifyRequest, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, label, changes, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.user?.id ?? null, req.user?.email ?? null, e.action, e.entityType ?? null, e.entityId === undefined ? null : String(e.entityId), e.label ?? null, e.changes === undefined ? null : JSON.stringify(e.changes), req.ip],
  );
}

/** Shallow field-level diff of two JSON documents for the audit log (values truncated to keep rows small). */
export function diffDocuments(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const clip = (v: unknown) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : v; };
  for (const k of keys) {
    const a = before?.[k], b = after?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: clip(a), to: clip(b) };
  }
  return out;
}
