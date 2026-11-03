import type { Queryable } from './db.ts';

export async function getSetting<T>(db: Queryable, key: string, dflt: T): Promise<T> {
  const r = await db.query<{ value: T }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : dflt;
}

export async function setSetting(db: Queryable, key: string, value: unknown): Promise<void> {
  await db.query('INSERT INTO app_settings (key, value, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, JSON.stringify(value)]);
}
