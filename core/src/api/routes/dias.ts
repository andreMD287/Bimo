import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors';
import { closeDay, ensureSigningRequest, getPendingSigning, listDays, parseDate, submitSignature } from '../../modules/cierre';
import { getDevicePublicKey } from '../../modules/comercios';
import { routeOf } from '../contract';
import type { ServerDeps } from '../server';

/** Spec 06 §3.3 (dias y cierre) y §3.4 (firma pendiente). La recepcion de la firma llega con A-12. */
export function registerDiasRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const now = () => new Date((deps.now ?? Date.now)());
  const closeRoute = routeOf('post', '/days/{date}/close');

  app.post<{ Params: { date: string } }>('/days/:date/close', { config: { access: 'device', roles: ['dueno'] } }, async (req) => {
    const body = (closeRoute.body as z.ZodType<{ counted_cash_minor: number | null; entry_ids: string[] }>).parse(req.body);
    const merchantId = req.ctx.merchantId as string;
    const out = await closeDay(deps.db, {
      merchantId,
      userId: req.ctx.userId,
      date: parseDate(req.params.date),
      countedCashMinor: body.counted_cash_minor,
      entryIds: body.entry_ids,
      now: now(),
    });
    // Se pide la solicitud de firma con el dueno presente (spec 07 §2). Si la red falla, el cierre ya quedo hecho:
    // la app la pide despues con GET /signing/pending.
    let signingRequestId: string | undefined;
    if (deps.seals) {
      try {
        signingRequestId = (await ensureSigningRequest(deps.db, { merchantId, preparer: deps.seals, now: now() }))?.signing_request_id;
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'chain_unavailable')) throw e;
      }
    }
    return { status: out.status, ...(signingRequestId ? { signing_request_id: signingRequestId } : {}) };
  });

  const DaysQuery = z.object({ from: z.string().optional(), to: z.string().optional() });
  app.get('/days', { config: { access: 'device' } }, async (req) => {
    const q = DaysQuery.parse(req.query);
    return { days: await listDays(deps.db, req.ctx.merchantId as string, q.from, q.to) };
  });

  app.get('/signing/pending', { config: { access: 'device', roles: ['dueno'] } }, async (req) => {
    if (!deps.seals) return { request: null };
    const request = await getPendingSigning(deps.db, { merchantId: req.ctx.merchantId as string, preparer: deps.seals, now: now() });
    return { request };
  });

  const sigRoute = routeOf('post', '/signing/{id}/signature');
  app.post<{ Params: { id: string } }>('/signing/:id/signature', { config: { access: 'device', roles: ['dueno'] } }, async (req, reply) => {
    const body = (sigRoute.body as z.ZodType<{ signature: string }>).parse(req.body);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.signature)) throw new AppError('invalid_request', 'Base64 invalido');
    const signature = Buffer.from(body.signature, 'base64');
    if (signature.length !== 64) throw new AppError('invalid_request', 'La firma debe medir 64 bytes');
    if (!deps.signer) throw new AppError('chain_unavailable', 'La firma de sellos no esta configurada');
    const merchantId = req.ctx.merchantId as string;
    const publicKey = await getDevicePublicKey(deps.db, merchantId, req.ctx.deviceId as string);
    if (!publicKey) throw new AppError('forbidden', 'Dispositivo no autorizado');
    await submitSignature(deps.db, { merchantId, requestId: req.params.id, deviceId: req.ctx.deviceId as string, ownerPublicKey: publicKey, signature, signer: deps.signer, now: now() });
    return reply.status(202).send({ status: 'firmado' });
  });
}
