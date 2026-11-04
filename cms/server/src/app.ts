import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type pg from 'pg';
import { cmsRoot, type Config } from './config.ts';
import { authPlugin, HttpError, requireAuth } from './auth/plugin.ts';
import { authRoutes } from './auth/routes.ts';
import { userRoutes } from './users/routes.ts';
import { contentRoutes } from './content/routes.ts';
import { mediaRoutes } from './media/routes.ts';
import { publishRoutes } from './publish/routes.ts';
import { PublishService } from './publish/service.ts';

declare module 'fastify' {
  interface FastifyInstance { publishService: PublishService }
}

export async function buildApp(config: Config, pool: pg.Pool): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel }, trustProxy: config.trustProxy, bodyLimit: 2 * 1024 * 1024 });
  const service = new PublishService(pool, config);
  service.ensureDirs();
  app.decorate('publishService', service);

  await app.register(fastifyCookie, { secret: config.sessionSecret });
  // Limit the API only; static assets (admin bundle, fonts, media, preview) are free. Decide on the matched
  // route, never req.url: the router percent-decodes before matching, so /%61pi/... reaches the /api/ handlers.
  await app.register(fastifyRateLimit, { global: true, max: 600, timeWindow: '1 minute', allowList: (req) => !req.routeOptions.url?.startsWith('/api/') });
  await app.register(fastifyMultipart, { limits: { fileSize: Math.max(config.uploadImageMaxBytes, config.uploadPdfMaxBytes) + 1, files: 1, fields: 10 } });
  await app.register(authPlugin, { pool, config });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Please fix the highlighted fields', details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) return reply.code(429).send({ error: 'Too many requests. Please slow down.' });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'File is too large' });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message ?? 'Bad request' });
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on the server' });
  });

  await app.register(authRoutes, { pool, config });
  await app.register(userRoutes, { pool, config });
  await app.register(contentRoutes, { pool, config });
  await app.register(mediaRoutes, { pool, config });
  await app.register(publishRoutes, { pool, config, service });

  // The website's fonts and favicon, for the admin UI.
  await app.register(fastifyStatic, { root: join(config.siteRoot, 'public/fonts'), prefix: '/fonts/', decorateReply: false, maxAge: '7d' });
  app.get('/favicon.png', async (_req, reply) => reply.sendFile('favicon.png', join(config.siteRoot, 'public')));

  // Media and preview are private to signed-in users.
  await app.register(async (priv) => {
    priv.addHook('onRequest', requireAuth);
    await priv.register(fastifyStatic, { root: config.mediaDir, prefix: '/media/', decorateReply: false, maxAge: 0, cacheControl: true, acceptRanges: true });
    await priv.register(fastifyStatic, { root: service.previewDir, prefix: '/preview/', decorateReply: false, index: ['index.html'], maxAge: 0, cacheControl: true, acceptRanges: true });
  });

  // The built admin UI (cms/dist/client); any non-API path falls back to index.html for client-side routing.
  const clientDir = join(cmsRoot, 'dist/client');
  const hasClient = existsSync(join(clientDir, 'index.html'));
  await app.register(fastifyStatic, { root: hasClient ? clientDir : join(cmsRoot, 'client'), prefix: '/', decorateReply: true, wildcard: false, index: false, maxAge: '1h' });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    if (req.url.startsWith('/media/') || req.url.startsWith('/preview/')) return reply.code(404).send('Not found');
    if (hasClient) return reply.sendFile('index.html', clientDir);
    return reply.code(503).type('text/plain').send('The admin UI is not built. Run `npm run build` in cms/ (or `npm run dev:client` for development on port 5173).');
  });

  return app;
}
