import { loadDotEnv, loadConfig } from '../config.ts';
import { createPool } from '../db.ts';
import { migrate } from '../migrate.ts';
import { seedFromSite, syncMediaFromSite, addNewSiteMedia } from '../seed.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Storage, eachLimit } from '../storage.ts';
import { inspectBuffer } from '../media/inspect.ts';

loadDotEnv();
const config = loadConfig();
const reset = process.argv.includes('--reset');
// --media-only: on an already seeded database, add only the site's media files the library does not have yet.
const mediaOnly = process.argv.includes('--media-only');
const pool = createPool(config.databaseUrl);
const upload = async (storage: Storage, paths: string[]) => eachLimit(paths, 6, async (p) => {
  const buf = readFileSync(join(config.mediaDir, p));
  await storage.put(`media/${p}`, buf, inspectBuffer(buf)?.mime ?? 'application/octet-stream', 0);
});
try {
  await migrate(pool);
  if (mediaOnly) {
    const added = await addNewSiteMedia(pool, { siteRoot: config.siteRoot, mediaDir: config.mediaDir });
    if (config.storage) await upload(new Storage(config.storage), added);
    console.log(`Added ${added.length} new media files${added.length ? `: ${added.join(', ')}` : ''}${config.storage ? ` (uploaded to Storage bucket ${config.storage.bucket})` : ''}`);
  } else {
    const r = await seedFromSite(pool, { siteRoot: config.siteRoot, mediaDir: config.mediaDir, reset });
    console.log(`Seeded from ${config.siteRoot}: ${r.families} families, ${r.products} products, ${r.downloads} downloads, ${r.news} news posts, ${r.pages} documents, ${r.redirects} redirects, ${r.media} media files -> ${config.mediaDir}`);
    if (config.storage) {
      // Serverless staging: the media library lives in the Storage bucket.
      const storage = new Storage(config.storage);
      const paths = syncMediaFromSite(config.siteRoot, config.mediaDir);
      await upload(storage, paths);
      console.log(`Uploaded ${paths.length} media files to Storage bucket ${config.storage.bucket}`);
    }
  }
} finally {
  await pool.end();
}
