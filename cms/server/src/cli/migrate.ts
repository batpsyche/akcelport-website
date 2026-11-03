import { loadDotEnv, loadConfig } from '../config.ts';
import { createPool } from '../db.ts';
import { migrate } from '../migrate.ts';

loadDotEnv();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await pool.end();
}
