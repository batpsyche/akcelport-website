// Vercel function entry (serverless staging): the whole Fastify app behind one function. No listening ports, no
// timers; the published site is served by the separate site-host function. See "Staging on Vercel + Supabase" in README.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config.ts';
import { createPool } from './db.ts';
import { migrate } from './migrate.ts';
import { buildApp } from './app.ts';
import { purgeExpiredSessions } from './auth/session.ts';

const config = loadConfig();
const pool = createPool(config.databaseUrl, { schema: config.dbSchema, max: 3 });
const ready = (async () => {
  await migrate(pool);
  purgeExpiredSessions(pool).catch(() => { /* best effort on cold start */ });
  const app = await buildApp(config, pool);
  await app.ready();
  return app;
})();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await ready;
  app.server.emit('request', req, res);
}
