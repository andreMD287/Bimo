import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors';
import { MAX_PULL_LIMIT, pullChanges, pushItems } from '../../modules/sync';
import { routeOf } from '../contract';
import type { ServerDeps } from '../server';

const PullQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(MAX_PULL_LIMIT),
});

/** Spec 06 §3.2: sincronizacion. */
export function registerSyncRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const now = deps.now ?? Date.now;
  const pushRoute = routeOf('post', '/sync/push');

  app.post('/sync/push', { config: { access: 'device' } }, async (req) => {
    const body = (pushRoute.body as z.ZodType<{ device_id: string; device_time: string; items: Array<{ type: 'customer' | 'channel' | 'entry'; data: Record<string, unknown> }> }>).parse(req.body);
    if (body.device_id !== req.ctx.deviceId) throw new AppError('invalid_request', 'device_id no coincide con X-Device-Id');
    const deviceTime = new Date(body.device_time);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.device_time) || Number.isNaN(deviceTime.getTime())) {
      throw new AppError('invalid_request', 'device_time debe ser ISO-8601 UTC con milisegundos');
    }
    return pushItems(deps.db, {
      merchantId: req.ctx.merchantId as string,
      deviceId: req.ctx.deviceId as string,
      userId: req.ctx.userId,
      deviceTime,
      serverNow: new Date(now()),
      items: body.items,
    });
  });

  app.get('/sync/pull', { config: { access: 'device' } }, async (req) => {
    const q = PullQuery.parse(req.query);
    return pullChanges(deps.db, { merchantId: req.ctx.merchantId as string, cursor: q.cursor, limit: q.limit });
  });
}
