import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MAX_PULL_LIMIT, pullChanges } from '../../modules/sync';
import type { ServerDeps } from '../server';

const PullQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(MAX_PULL_LIMIT),
});

/** Spec 06 §3.2: sincronizacion. (El push llega con A-09.) */
export function registerSyncRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.get('/sync/pull', { config: { access: 'device' } }, async (req) => {
    const q = PullQuery.parse(req.query);
    return pullChanges(deps.db, { merchantId: req.ctx.merchantId as string, cursor: q.cursor, limit: q.limit });
  });
}
