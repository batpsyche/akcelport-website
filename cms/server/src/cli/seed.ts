import { loadDotEnv, loadConfig } from '../config.ts';
import { createPool } from '../db.ts';
import { migrate } from '../migrate.ts';
import { seedFromSite } from '../seed.ts';

loadDotEnv();
const config = loadConfig();
const reset = process.argv.includes('--reset');
const pool = createPool(config.databaseUrl);
try {
  await migrate(pool);
  const r = await seedFromSite(pool, { siteRoot: config.siteRoot, mediaDir: config.mediaDir, reset });
  console.log(`Seeded from ${config.siteRoot}: ${r.families} families, ${r.products} products, ${r.downloads} downloads, ${r.pages} documents, ${r.redirects} redirects, ${r.media} media files -> ${config.mediaDir}`);
} finally {
  await pool.end();
}
