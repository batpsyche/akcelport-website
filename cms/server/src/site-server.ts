// Serves the currently published release (PUBLISH_DIR/current) at the root path on SITE_PORT,
// honouring the _redirects file the build writes, so local use matches a production web server.
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';

export async function buildSiteServer(config: Config): Promise<FastifyInstance> {
  const current = join(config.publishDir, 'current');
  const app = Fastify({ logger: { level: config.logLevel } });
  await app.register(fastifyStatic, { root: current, prefix: '/', index: ['index.html'], dotfiles: 'ignore', cacheControl: true, maxAge: 0, decorateReply: true, acceptRanges: true });

  let redirectsCache: { source: string; map: Map<string, string> } | null = null;
  const redirects = (): Map<string, string> => {
    const file = join(current, '_redirects');
    const source = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!redirectsCache || redirectsCache.source !== source) {
      const map = new Map<string, string>();
      for (const line of source.split('\n')) {
        const [from, to] = line.trim().split(/\s+/);
        if (from && to) map.set(from, to);
      }
      redirectsCache = { source, map };
    }
    return redirectsCache.map;
  };

  app.setNotFoundHandler(async (req, reply) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const to = redirects().get(path);
    if (to) return reply.redirect(to, 301);
    const notFound = join(current, '404.html');
    reply.code(404).type('text/html; charset=utf-8');
    return existsSync(notFound) ? readFileSync(notFound) : 'Not found';
  });
  return app;
}
