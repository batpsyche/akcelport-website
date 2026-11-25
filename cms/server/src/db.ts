import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

/** With a schema, every connection gets `search_path = <schema>, public, extensions` so the CMS tables stay in their own
 *  schema of a shared database (use a session-mode pooler: transaction mode drops session settings). */
export function createPool(connectionString: string, opts: { schema?: string; max?: number } = {}): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10 });
  if (opts.schema) {
    const ident = `"${opts.schema.replace(/"/g, '""')}"`;
    pool.on('connect', (client) => { client.query(`CREATE SCHEMA IF NOT EXISTS ${ident}; SET search_path TO ${ident}, public, extensions`).catch(() => { /* surfaces on the first query */ }); });
  }
  return pool;
}

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Convenience: first row or undefined. */
export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(db: Queryable, text: string, values: unknown[] = []): Promise<T | undefined> {
  const r = await db.query<T>(text, values);
  return r.rows[0];
}

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(db: Queryable, text: string, values: unknown[] = []): Promise<T[]> {
  const r = await db.query<T>(text, values);
  return r.rows;
}
