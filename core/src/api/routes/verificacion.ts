import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { loadDeployments } from '../../deployments';
import { AppError } from '../../errors';
import { authenticateLink, buildPackage, createLink, listLinks, requestRestore, revokeLink } from '../../modules/verificacion';
import { routeOf } from '../contract';
import { RateLimiter } from '../ratelimit';
import type { ServerDeps } from '../server';

const TOKEN_LIMIT_PER_MINUTE = 60; // spec 06 §4

/** Spec 06 §3.5 (enlaces del dueno) y §3.6 (publicos, con el token del enlace). */
export function registerVerificacionRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const now = () => new Date((deps.now ?? Date.now)());
  const tokenLimiter = new RateLimiter(TOKEN_LIMIT_PER_MINUTE, 60_000, deps.now ?? Date.now);
  const createRoute = routeOf('post', '/verification-links');
  const restoreRoute = routeOf('post', '/public/verification/restore');
  const baseUrl = deps.config.verifierBaseUrl ?? 'http://localhost:5173';

  app.post('/verification-links', { config: { access: 'device', roles: ['dueno'] } }, async (req, reply) => {
    const body = (createRoute.body as z.ZodType<{ date_from: string; date_to: string; expires_in_days: number }>).parse(req.body);
    const out = await createLink(deps.db, {
      merchantId: req.ctx.merchantId as string,
      dateFrom: body.date_from,
      dateTo: body.date_to,
      expiresInDays: body.expires_in_days,
      verifierBaseUrl: baseUrl,
      now: now(),
    });
    return reply.status(201).send(out);
  });

  app.get('/verification-links', { config: { access: 'device', roles: ['dueno'] } }, async (req) => ({
    links: await listLinks(deps.db, req.ctx.merchantId as string, now()),
  }));

  app.delete<{ Params: { id: string } }>('/verification-links/:id', { config: { access: 'device', roles: ['dueno'] } }, async (req, reply) => {
    await revokeLink(deps.db, req.ctx.merchantId as string, req.params.id, now());
    return reply.status(204).send();
  });

  // ---- publicos: el token del enlace va en Authorization: Bearer (spec 05 §2)
  async function link(req: FastifyRequest) {
    const m = req.headers.authorization ? /^Bearer\s+(\S+)$/i.exec(req.headers.authorization) : null;
    if (!m?.[1]) throw new AppError('unauthenticated', 'Falta el token del enlace');
    const access = await authenticateLink(deps.db, m[1], now());
    const wait = tokenLimiter.hit(access.id);
    if (wait > 0) throw new AppError('rate_limited', 'Demasiadas peticiones', {}, { 'Retry-After': String(wait) });
    return access;
  }

  const RangeQuery = z.object({ from: z.string().optional(), to: z.string().optional() });
  app.get('/public/verification', { config: { access: 'public' } }, async (req) => {
    const access = await link(req);
    const q = RangeQuery.parse(req.query);
    return buildPackage(deps.db, { link: access, from: q.from, to: q.to, deployments: loadDeployments(deps.config.stellarNetwork) });
  });

  app.post('/public/verification/restore', { config: { access: 'public' } }, async (req, reply) => {
    const access = await link(req);
    const body = (restoreRoute.body as z.ZodType<{ date: string }>).parse(req.body);
    await requestRestore(deps.db, access, body.date, now());
    return reply.status(202).send();
  });

  // Reservado para el incremento 2 (spec 05 §7)
  app.get('/public/entry-proof', { config: { access: 'public' } }, async (req) => {
    await link(req);
    throw new AppError('not_found', 'Aun no disponible');
  });
}
