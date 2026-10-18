import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { DeviceDirectory } from '../auth/devices';
import type { JwtVerifier } from '../auth/jwt';
import type { CoreConfig } from '../config';
import type { Db } from '../db/client';
import type { MemberRole } from '../db/types';
import { AppError, errorBody } from '../errors';
import type { SealSigner } from '../modules/cierre';
import type { SealPreparer } from '../modules/stellar';
import { createLogger } from '../logger';
import { RateLimiter } from './ratelimit';
import { registerHealth, type HealthChecks } from './health';

/** Quien hace la peticion, ya validado por el hook de autenticacion. */
export interface RequestContext {
  userId: string;
  merchantId: string | null;
  deviceId: string | null;
  role: MemberRole | null;
  /** Reloj del celular segun `X-Device-Time` y su desfase con el servidor (spec 04 §7). */
  deviceTime: Date | null;
  clockSkewMs: number | null;
}

/**
 * Como se autentica cada ruta (spec 06 §2):
 *  - `public`: sin sesion (health, enlaces de verificacion con su propio token).
 *  - `user`: JWT sin dispositivo (registro de comercio y dispositivo).
 *  - `device`: JWT + `X-Device-Id` (por omision: seguro por defecto).
 */
export type RouteAccess = 'public' | 'user' | 'device';

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: RouteAccess;
    /** Roles permitidos; si el del usuario no esta, 403 `role_not_allowed`. */
    roles?: MemberRole[];
  }
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

export interface ServerDeps {
  config: CoreConfig;
  db: Db;
  jwt: JwtVerifier;
  devices: DeviceDirectory;
  health: HealthChecks;
  /** Prepara la firma de los sellos (simula seal_batch en Stellar). Sin esto no se crean solicitudes de firma. */
  seals?: SealPreparer;
  /** Verifica y normaliza la firma del dueno y firma por el atestador (POST /signing/{id}/signature). */
  signer?: SealSigner;
  /** Para pruebas: destino de los logs y reloj. */
  logDestination?: NodeJS.WritableStream;
  now?: () => number;
  /** Registro de las rutas de cada modulo (A-07 en adelante). */
  routes?: Array<(app: FastifyInstance, deps: ServerDeps) => void | Promise<void>>;
}

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const DEVICE_LIMIT_PER_MINUTE = 120; // spec 06 §4

function parseDeviceTime(raw: string | undefined): Date {
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) {
    throw new AppError('invalid_request', 'X-Device-Time debe ser ISO-8601 UTC con milisegundos');
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new AppError('invalid_request', 'X-Device-Time invalido');
  return d;
}

function bearer(req: FastifyRequest): string {
  const h = req.headers.authorization;
  const m = h ? /^Bearer\s+(\S+)$/i.exec(h) : null;
  if (!m?.[1]) throw new AppError('unauthenticated', 'Falta el token de sesion');
  return m[1];
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const logger = createLogger(deps.config.env === 'local' ? 'debug' : 'info', deps.logDestination);

  // pino 10 y los tipos de Fastify no coinciden en `msgPrefix`; en ejecucion son compatibles.
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024, // 1 MB (spec 06 §4)
    genReqId: (req) => {
      const given = req.headers['x-request-id'];
      return typeof given === 'string' && REQUEST_ID.test(given) ? given : randomUUID();
    },
    ajv: { customOptions: { removeAdditional: false } },
  }) as unknown as FastifyInstance;

  const perDevice = new RateLimiter(DEVICE_LIMIT_PER_MINUTE, 60_000, now);

  app.decorateRequest('ctx', undefined as unknown as RequestContext);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('X-Request-Id', req.id);
    if (req.is404) return;
    const access = req.routeOptions.config.access ?? 'device';
    if (access === 'public') {
      req.ctx = { userId: '', merchantId: null, deviceId: null, role: null, deviceTime: null, clockSkewMs: null };
      return;
    }

    const { userId } = await deps.jwt.verify(bearer(req));
    const deviceTime = parseDeviceTime(req.headers['x-device-time'] as string | undefined);
    const ctx: RequestContext = {
      userId,
      merchantId: null,
      deviceId: null,
      role: null,
      deviceTime,
      clockSkewMs: deviceTime.getTime() - now(), // spec 04 §7: device_time - hora del servidor
    };

    let limitKey = `user:${userId}`;
    if (access === 'device') {
      const rawId = req.headers['x-device-id'];
      const deviceId = typeof rawId === 'string' ? rawId : '';
      if (!deviceId) throw new AppError('forbidden', 'Falta X-Device-Id');
      const device = await deps.devices.findDevice(deviceId);
      if (!device || device.userId !== userId) throw new AppError('forbidden', 'Dispositivo no autorizado');
      const role = await deps.devices.memberRole(userId, device.merchantId);
      if (!role) throw new AppError('forbidden', 'Dispositivo no autorizado');
      if (device.revoked) throw new AppError('device_revoked', 'Este dispositivo fue revocado');
      const allowed = req.routeOptions.config.roles;
      if (allowed && !allowed.includes(role)) throw new AppError('role_not_allowed', 'Tu rol no permite esta accion');
      ctx.merchantId = device.merchantId;
      ctx.deviceId = device.id;
      ctx.role = role;
      limitKey = `device:${device.id}`;
    }

    const wait = perDevice.hit(limitKey);
    if (wait > 0) throw new AppError('rate_limited', 'Demasiadas peticiones', {}, { 'Retry-After': String(wait) });

    req.ctx = ctx;
    req.log = req.log.child({ merchant_id: ctx.merchantId, device_id: ctx.deviceId });
  });

  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      { method: req.method, route: req.routeOptions.url ?? 'not_found', status: reply.statusCode, ms: Math.round(reply.elapsedTime), request_id: req.id },
      'request',
    );
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send(errorBody('not_found', 'Ruta no encontrada'));
  });

  app.setErrorHandler((err: FastifyError | AppError | ZodError | Error, req, reply) => {
    if (err instanceof AppError) {
      for (const [k, v] of Object.entries(err.headers)) reply.header(k, v);
      return reply.status(err.status).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(
        errorBody('invalid_request', 'La peticion no cumple el esquema', {
          fields: err.issues.map((i) => i.path.join('.')),
        }),
      );
    }
    const fe = err as FastifyError;
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.status(400).send(errorBody('invalid_request', 'Peticion invalida', { reason: fe.code ?? 'bad_request' }));
    }
    // Nunca se registra el mensaje: los errores de Postgres pueden traer valores (montos, nombres).
    req.log.error({ err_name: err.name, err_code: fe.code }, 'error no controlado');
    return reply.status(500).send(errorBody('internal_error', 'Error interno'));
  });

  registerHealth(app, deps.health);
  for (const register of deps.routes ?? []) await register(app, deps);

  return app;
}
