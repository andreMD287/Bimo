import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadDeployments } from '../../deployments';
import { AppError } from '../../errors';
import { createMerchant, getMerchantMe, issueChallenge, registerDevice } from '../../modules/comercios';
import { routeOf } from '../contract';
import { RateLimiter } from '../ratelimit';
import type { ServerDeps } from '../server';

const CHALLENGES_PER_HOUR = 10; // spec 06 §4

const b64 = (s: string, expectedLen: number): Buffer => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new AppError('invalid_request', 'Base64 invalido');
  const buf = Buffer.from(s, 'base64');
  if (buf.length !== expectedLen) throw new AppError('invalid_request', `Se esperaban ${expectedLen} bytes`);
  return buf;
};

/** Spec 06 §3.1: comercio y dispositivo (CU-01). */
export function registerComerciosRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const now = deps.now ?? Date.now;
  const challengeLimiter = new RateLimiter(CHALLENGES_PER_HOUR, 60 * 60 * 1000, now);

  const createRoute = routeOf('post', '/merchants');
  app.post('/merchants', { config: { access: 'user' } }, async (req, reply) => {
    const body = (createRoute.body as z.ZodType<{ business_name: string; owner_name?: string; city?: string }>).parse(req.body);
    const { merchantId } = await createMerchant(deps.db, {
      userId: req.ctx.userId,
      network: deps.config.stellarNetwork,
      businessName: body.business_name,
      ownerName: body.owner_name,
      city: body.city,
    });
    return reply.status(201).send({ merchant_id: merchantId });
  });

  app.post('/devices/challenge', { config: { access: 'user' } }, async (req) => {
    const wait = challengeLimiter.hit(req.ctx.userId);
    if (wait > 0) throw new AppError('rate_limited', 'Demasiados retos; intenta mas tarde', {}, { 'Retry-After': String(wait) });
    const c = await issueChallenge(deps.db, { userId: req.ctx.userId, purpose: 'register_device', now: new Date(now()) });
    return { challenge_id: c.challengeId, challenge: c.challenge.toString('base64'), expires_at: c.expiresAt.toISOString() };
  });

  const devicesRoute = routeOf('post', '/devices');
  app.post('/devices', { config: { access: 'user' } }, async (req, reply) => {
    const body = (
      devicesRoute.body as z.ZodType<{
        device_id: string;
        challenge_id: string;
        public_key: string;
        key_kind: 'secure_enclave_p256' | 'software_p256' | 'passkey_webauthn';
        signature: string;
      }>
    ).parse(req.body);
    const out = await registerDevice(deps.db, {
      userId: req.ctx.userId,
      deviceId: body.device_id,
      challengeId: body.challenge_id,
      publicKey: b64(body.public_key, 65),
      keyKind: body.key_kind,
      signature: b64(body.signature, 64),
      now: new Date(now()),
    });
    return reply.status(201).send({ device_id: out.deviceId, account_status: out.accountStatus });
  });

  app.get('/merchants/me', { config: { access: 'device' } }, async (req) => {
    const me = await getMerchantMe(deps.db, req.ctx.merchantId as string, req.ctx.role as 'dueno' | 'empleado');
    return {
      merchant_id: me.merchantId,
      business_name: me.businessName,
      stellar_address: me.stellarAddress,
      account_status: me.accountStatus,
      network: loadDeployments(deps.config.stellarNetwork),
      role: me.role,
    };
  });
}
