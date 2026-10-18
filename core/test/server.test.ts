import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config';
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_EMPLEADO,
  DEVICE_REVOKED,
  USER_A,
  USER_B,
  USER_EMPLEADO,
  makeApp,
  testConfig,
} from './helpers';

let current: FastifyInstance | undefined;
afterEach(async () => {
  await current?.close();
});

async function setup() {
  const ctx = await makeApp();
  current = ctx.app;
  return ctx;
}

describe('spec 06 §6: dispositivo (X-Device-Id)', () => {
  it('spec06-6 sin X-Device-Id responde 403', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'POST', url: '/_t/echo', headers: await headers(USER_A), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });

  it('spec06-6 con un dispositivo de otro comercio responde 403', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'POST', url: '/_t/echo', headers: await headers(USER_A, DEVICE_B), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });

  it('spec06-6 con un dispositivo inexistente responde 403', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/_t/echo',
      headers: await headers(USER_A, '01JA00000000000000000NOPE0'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('spec06-6 con un dispositivo revocado responde 403 device_revoked', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'POST', url: '/_t/echo', headers: await headers(USER_A, DEVICE_REVOKED), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('device_revoked');
  });

  it('spec06-6 un empleado que llama una ruta de dueno recibe 403 role_not_allowed', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/_t/solo-dueno',
      headers: await headers(USER_EMPLEADO, DEVICE_EMPLEADO),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('role_not_allowed');
  });

  it('un dispositivo valido pasa y el contexto trae el comercio', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'POST', url: '/_t/echo', headers: await headers(USER_A, DEVICE_A), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().merchant).toBe('01JA0000000000000000000MA1');
  });

  it('las rutas de registro (access user) no exigen X-Device-Id', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'POST', url: '/_t/registro', headers: await headers(USER_B), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBe(USER_B);
  });
});

describe('spec 06 §2: sesion y reloj', () => {
  it('sin Authorization responde 401 unauthenticated', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/_t/echo', headers: { 'x-device-id': DEVICE_A }, payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });

  it('un JWT con firma ajena responde 401', async () => {
    const { app } = await setup();
    const other = await makeApp();
    const bad = await other.auth.sign(USER_A);
    const res = await app.inject({
      method: 'POST',
      url: '/_t/echo',
      headers: { authorization: `Bearer ${bad}`, 'x-device-id': DEVICE_A, 'x-device-time': new Date().toISOString() },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    await other.app.close();
  });

  it('un JWT con otra audiencia responde 401', async () => {
    const { app, auth } = await setup();
    const t = await auth.sign(USER_A, 'otra');
    const res = await app.inject({
      method: 'POST',
      url: '/_t/echo',
      headers: { authorization: `Bearer ${t}`, 'x-device-id': DEVICE_A, 'x-device-time': new Date().toISOString() },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('X-Device-Time ausente o mal formado responde 400 invalid_request', async () => {
    const { app, headers } = await setup();
    const h = (await headers(USER_A, DEVICE_A)) as Record<string, string>;
    const sin = { ...h };
    delete sin['x-device-time'];
    expect((await app.inject({ method: 'POST', url: '/_t/echo', headers: sin, payload: {} })).statusCode).toBe(400);
    const mal = await app.inject({ method: 'POST', url: '/_t/echo', headers: { ...h, 'x-device-time': '2026-10-06 20:30' }, payload: {} });
    expect(mal.statusCode).toBe(400);
    expect(mal.json().error.code).toBe('invalid_request');
  });

  it('spec06-4 mas de 120 peticiones por minuto de un dispositivo responde 429 con Retry-After', async () => {
    const { app, headers } = await setup();
    const h = await headers(USER_A, DEVICE_A);
    let last = 200;
    let retry: string | undefined;
    for (let i = 0; i < 125; i++) {
      const r = await app.inject({ method: 'POST', url: '/_t/echo', headers: h, payload: {} });
      last = r.statusCode;
      retry = r.headers['retry-after'] as string | undefined;
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
  });
});

describe('spec 06 §1.1: errores y X-Request-Id', () => {
  it('toda respuesta lleva X-Request-Id y se respeta el recibido si es valido', async () => {
    const { app } = await setup();
    const a = await app.inject({ method: 'GET', url: '/health' });
    expect(a.headers['x-request-id']).toBeTruthy();
    const b = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-abc12345' } });
    expect(b.headers['x-request-id']).toBe('req-abc12345');
    const c = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'mal id con espacios' } });
    expect(String(c.headers['x-request-id'])).not.toContain(' ');
  });

  it('una ruta inexistente responde 404 con el formato de error', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/no-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String), details: {} } });
  });

  it('spec06-6 con BIMO_SIMULATORS=off las rutas /dev/* responden 404', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/dev/simulate/card-sale',
      headers: await headers(USER_A, DEVICE_A),
      payload: { amount_minor: 1000 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /health es publico y dice el estado', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ status: 'ok', db: 'ok', rpc: 'ok', relayer: 'not_configured' });
  });

  it('un cuerpo de mas de 1 MB responde 400 invalid_request', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/_t/echo',
      headers: { ...(await headers(USER_A, DEVICE_A)), 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'a'.repeat(1024 * 1024 + 10) }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });
});

describe('spec 06 §5: los logs no llevan datos sensibles', () => {
  it('spec06-5 una sesion completa no deja montos, tokens, firmas ni nombres en los logs', async () => {
    const { app, headers, log, auth } = await setup();
    const token = await auth.sign(USER_A);
    const h = { ...(await headers(USER_A, DEVICE_A)), authorization: `Bearer ${token}` };
    const body = {
      amount_minor: 987654321,
      note: 'nota privada de la tienda',
      display_name: 'Dona Rosa Perez',
      signature: 'FIRMA-SECRETA-BASE64',
      public_key: 'LLAVE-PUBLICA-BASE64',
      business_name: 'Tienda de Marta',
    };
    await app.inject({ method: 'POST', url: '/_t/echo', headers: h, payload: body });
    await app.inject({ method: 'POST', url: '/_t/echo', headers: { ...h, authorization: 'Bearer malo.malo.malo' }, payload: body });
    await app.inject({ method: 'GET', url: '/health?token=SECRETO-EN-QUERY' });
    const text = log.text;
    expect(log.lines.length).toBeGreaterThan(0);
    for (const secret of [
      '987654321',
      'nota privada',
      'Dona Rosa',
      'FIRMA-SECRETA',
      'LLAVE-PUBLICA',
      'Tienda de Marta',
      token,
      'malo.malo.malo',
      'SECRETO-EN-QUERY',
    ]) {
      expect(text, `el log no debe contener "${secret}"`).not.toContain(secret);
    }
    expect(text).toContain('"merchant_id":"01JA0000000000000000000MA1"');
    expect(text).toContain('"request_id"');
  });
});

describe('spec 08 §3.1: configuracion', () => {
  const base = { BIMO_ENV: 'local', DATABASE_URL: 'postgres://x' };
  it('spec08-3.1 el arranque falla si BIMO_SIMULATORS=on en production', () => {
    expect(() => loadConfig({ ...base, BIMO_ENV: 'production', BIMO_SIMULATORS: 'on' })).toThrow(/BIMO_SIMULATORS/);
  });
  it('production con simuladores off arranca', () => {
    expect(loadConfig({ ...base, BIMO_ENV: 'production', BIMO_SIMULATORS: 'off' }).simulators).toBe(false);
  });
  it('falla sin DATABASE_URL y con BIMO_ENV desconocido', () => {
    expect(() => loadConfig({ BIMO_ENV: 'local' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, BIMO_ENV: 'otro' })).toThrow(/BIMO_ENV/);
  });
  it('los secretos no aparecen en el mensaje de error de configuracion', () => {
    let msg = '';
    try {
      loadConfig({ BIMO_ENV: 'local', ATTESTER_SECRET: 'SXXXSECRETO' });
    } catch (e) {
      msg = String(e);
    }
    expect(msg).not.toContain('SXXXSECRETO');
  });
  it('testConfig por defecto tiene los simuladores apagados', () => {
    expect(testConfig().simulators).toBe(false);
  });
});
