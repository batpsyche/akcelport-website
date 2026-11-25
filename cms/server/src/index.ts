import { loadDotEnv, loadConfig } from './config.ts';
import { createPool } from './db.ts';
import { migrate } from './migrate.ts';
import { buildApp } from './app.ts';
import { buildSiteServer } from './site-server.ts';
import { purgeExpiredSessions } from './auth/session.ts';

loadDotEnv();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const applied = await migrate(pool);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

const app = await buildApp(config, pool);
const site = await buildSiteServer(config);
await app.listen({ port: config.port, host: '0.0.0.0' });
await site.listen({ port: config.sitePort, host: '0.0.0.0' });
console.log(`Akcelport backoffice on http://localhost:${config.port}/  (published site on http://localhost:${config.sitePort}/)`);

const purge = setInterval(() => purgeExpiredSessions(pool).catch((e) => app.log.error(e)), 3600_000);
const shutdown = async () => {
  clearInterval(purge);
  await Promise.allSettled([app.close(), site.close()]);
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
