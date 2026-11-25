import { loadDotEnv, loadConfig } from '../config.ts';
import { createPool } from '../db.ts';
import { migrate } from '../migrate.ts';
import { seedFromSite, syncMediaFromSite } from '../seed.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Storage, eachLimit } from '../storage.ts';
import { inspectBuffer } from '../media/inspect.ts';

loadDotEnv();
const config = loadConfig();
const reset = process.argv.includes('--reset');
const pool = createPool(config.databaseUrl, { schema: config.dbSchema });
try {
  await migrate(pool);
  const r = await seedFromSite(pool, { siteRoot: config.siteRoot, mediaDir: config.mediaDir, reset });
  console.log(`Seeded from ${config.siteRoot}: ${r.families} families, ${r.products} products, ${r.downloads} downloads, ${r.pages} documents, ${r.redirects} redirects, ${r.media} media files -> ${config.mediaDir}`);
  if (config.storage) {
    // Serverless staging: the media library lives in the Storage bucket.
    const storage = new Storage(config.storage);
    const paths = syncMediaFromSite(config.siteRoot, config.mediaDir);
    await eachLimit(paths, 6, async (p) => {
      const buf = readFileSync(join(config.mediaDir, p));
      await storage.put(`media/${p}`, buf, inspectBuffer(buf)?.mime ?? 'application/octet-stream', 0);
    });
    console.log(`Uploaded ${paths.length} media files to Storage bucket ${config.storage.bucket}`);
  }
} finally {
  await pool.end();
}
