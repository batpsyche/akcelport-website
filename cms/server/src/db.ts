import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
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
