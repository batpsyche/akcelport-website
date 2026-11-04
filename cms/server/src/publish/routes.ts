import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type pg from 'pg';
import type { Config } from '../config.ts';
import { HttpError, requireAuth, requireAdmin } from '../auth/plugin.ts';
import { audit } from '../audit.ts';
import { canPublish } from '../auth/routes.ts';
import { pendingChanges } from '../content/repo.ts';
import type { PublishService } from './service.ts';

export async function publishRoutes(app: FastifyInstance, opts: { pool: pg.Pool; config: Config; service: PublishService }) {
  const { pool, service } = opts;
  app.addHook('preHandler', requireAuth);

  const requirePublisher = async (req: Parameters<typeof requireAuth>[0]) => {
    if (!(await canPublish(pool, req.user!.role))) throw new HttpError(403, 'Publishing is reserved to administrators');
  };

  app.get('/api/publish', async (req) => ({ ...(await service.history()), pending: await pendingChanges(pool), canPublish: await canPublish(pool, req.user!.role), sitePort: opts.config.sitePort }));

  app.post('/api/publish', { preHandler: requirePublisher }, async (req) => {
    const body = z.object({
      selection: z.union([z.literal('all'), z.object({ families: z.array(z.number().int()).optional(), products: z.array(z.number().int()).optional(), downloads: z.array(z.number().int()).optional(), pages: z.array(z.string()).optional() })]).default('all'),
    }).parse(req.body ?? {});
    const result = await service.publish({ id: req.user!.id, email: req.user!.email }, body.selection);
    await audit(pool, req, { action: 'publish.run', entityType: 'publish', entityId: result.id, label: result.releaseId, changes: { items: result.promoted.length } });
    return result;
  });

  app.post('/api/publish/preview', async (req) => {
    const result = await service.preview({ id: req.user!.id, email: req.user!.email });
    await audit(pool, req, { action: 'publish.preview', entityType: 'publish', entityId: result.id });
    return result;
  });

  app.post('/api/publish/rollback', { preHandler: requireAdmin }, async (req) => {
    const { releaseId } = z.object({ releaseId: z.string() }).parse(req.body);
    const result = await service.rollback({ id: req.user!.id, email: req.user!.email }, releaseId);
    await audit(pool, req, { action: 'publish.rollback', entityType: 'publish', entityId: result.id, label: releaseId });
    return result;
  });
}
