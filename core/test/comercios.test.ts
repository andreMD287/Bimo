import { p256 } from '@noble/curves/nist.js';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerComerciosRoutes } from '../src/api/routes/comercios';
import { buildServer } from '../src/api/server';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { newId } from '../src/ids';
import { makeAuth, testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

let t: TestDb;
let app: FastifyInstance;
let auth: Awaited<ReturnType<typeof makeAuth>>;
let clock = Date.parse('2026-10-17T15:00:00.000Z');

const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const U2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const U3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

beforeAll(async () => {
  t = await createTestDb();
  for (const u of [U1, U2, U3]) await t.addUser(u);
  auth = await makeAuth();
  app = await buildServer({
    config: testConfig(),
    db: t.db,
    jwt: auth.jwt,
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    now: () => clock,
    routes: [registerComerciosRoutes],
  });
});

afterAll(async () => {
  await app.close();
  await t.close();
});

const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

async function call(method: 'GET' | 'POST', url: string, user: string, opts: { body?: unknown; device?: string } = {}) {
  return app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${await auth.sign(user)}`,
      'x-device-time': new Date(clock).toISOString(),
      ...(opts.device ? { 'x-device-id': opts.device } : {}),
    },
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
}

function newKey() {
  const priv = p256.utils.randomSecretKey();
  return { priv, pub: p256.getPublicKey(priv, false) };
}

async function makeMerchant(user: string, name = 'Tienda de prueba') {
  const res = await call('POST', '/merchants', user, { body: { business_name: name } });
  expect(res.statusCode).toBe(201);
  return res.json().merchant_id as string;
}

async function getChallenge(user: string) {
  const res = await call('POST', '/devices/challenge', user, { body: {} });
  expect(res.statusCode).toBe(200);
  const j = res.json();
  return { id: j.challenge_id as string, bytes: Buffer.from(j.challenge, 'base64'), expiresAt: j.expires_at as string };
}

function deviceBody(
  challengeId: string,
  key: { pub: Uint8Array },
  signature: Uint8Array,
  deviceId = newId(),
  kind: 'software_p256' | 'secure_enclave_p256' = 'software_p256',
) {
  return { device_id: deviceId, challenge_id: challengeId, public_key: toB64(key.pub), key_kind: kind, signature: toB64(signature) };
}

describe('A-1: POST /merchants', () => {
  it('A-1 crea comercio, perfil, miembro dueno y las 10 cuentas del ledger en estado pending', async () => {
    const id = await makeMerchant(U1, 'Tienda Dona Marta');
    const m = await t.db.selectFrom('merchants').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(m.account_status).toBe('pending');
    expect(m.network).toBe('testnet');
    expect(m.stellar_address).toBeNull();
    const p = await t.db.selectFrom('merchant_profiles').selectAll().where('merchant_id', '=', id).executeTakeFirstOrThrow();
    expect(p.business_name).toBe('Tienda Dona Marta');
    const mem = await t.db.selectFrom('merchant_members').selectAll().where('merchant_id', '=', id).execute();
    expect(mem.map((x) => [x.user_id, x.role])).toEqual([[U1, 'dueno']]);
    const accounts = await t.db.selectFrom('ledger_accounts').select(['code', 'type', 'currency']).where('merchant_id', '=', id).execute();
    expect(accounts).toHaveLength(10);
    expect(accounts.find((a) => a.code === 'bolsillo_usd')).toMatchObject({ type: 'activo', currency: 'USDC' });
    expect(accounts.find((a) => a.code === 'retiros_dueno')).toMatchObject({ type: 'patrimonio', currency: 'COP' });
    expect(accounts.find((a) => a.code === 'adelantos_por_pagar')).toBeUndefined();
  });

  it('A-1 un usuario que ya tiene comercio recibe 409 already_exists y no se crea otro', async () => {
    const res = await call('POST', '/merchants', U1, { body: { business_name: 'Otra' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('already_exists');
    const n = await t.db.selectFrom('merchant_members').select('merchant_id').where('user_id', '=', U1).execute();
    expect(n).toHaveLength(1);
  });

  it('A-1 el cuerpo se valida contra el esquema del spec 06 (400 invalid_request)', async () => {
    const res = await call('POST', '/merchants', U3, { body: { business_name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
    const none = await t.db.selectFrom('merchant_members').select('merchant_id').where('user_id', '=', U3).execute();
    expect(none).toHaveLength(0);
  });
});

describe('POST /devices/challenge', () => {
  it('spec06-3.1 el reto mide 32 bytes y vence en 5 minutos', async () => {
    const c = await getChallenge(U1);
    expect(c.bytes).toHaveLength(32);
    expect(new Date(c.expiresAt).getTime() - clock).toBe(5 * 60 * 1000);
  });

  it('un usuario sin comercio no puede pedir un reto (403)', async () => {
    const res = await call('POST', '/devices/challenge', U3, { body: {} });
    expect(res.statusCode).toBe(403);
  });

  it('spec06-4 el reto 11 en una hora responde 429 rate_limited', async () => {
    await makeMerchant(U2, 'Tienda 2');
    let last = 0;
    let retry: string | undefined;
    for (let i = 0; i < 11; i++) {
      const r = await call('POST', '/devices/challenge', U2, { body: {} });
      last = r.statusCode;
      retry = r.headers['retry-after'] as string | undefined;
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
    clock += 61 * 60 * 1000; // pasa la hora
    const ok = await call('POST', '/devices/challenge', U2, { body: {} });
    expect(ok.statusCode).toBe(200);
  });
});

describe('A-2: POST /devices', () => {
  it('A-2 una firma valida registra el dispositivo, pasa la cuenta a deploying y encola account.deploy', async () => {
    const key = newKey();
    const c = await getChallenge(U1);
    const deviceId = newId();
    const res = await call('POST', '/devices', U1, { body: deviceBody(c.id, key, p256.sign(c.bytes, key.priv, { prehash: true }), deviceId) });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ device_id: deviceId, account_status: 'deploying' });
    const merchant = await t.db.selectFrom('merchant_members').select('merchant_id').where('user_id', '=', U1).executeTakeFirstOrThrow();
    const m = await t.db.selectFrom('merchants').select('account_status').where('id', '=', merchant.merchant_id).executeTakeFirstOrThrow();
    expect(m.account_status).toBe('deploying');
    const dev = await t.db.selectFrom('devices').selectAll().where('id', '=', deviceId).executeTakeFirstOrThrow();
    expect(Buffer.from(dev.public_key).equals(Buffer.from(key.pub))).toBe(true);
    expect(dev.key_kind).toBe('software_p256');
    const msgs = await t.db.selectFrom('outbox_messages').selectAll().where('topic', '=', 'account.deploy').execute();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.payload).toMatchObject({ merchant_id: merchant.merchant_id, device_id: deviceId });
    expect(msgs[0]?.status).toBe('pendiente');
  });

  it('spec06-6 una firma que no corresponde a la clave responde 422 invalid_signature y no despliega nada', async () => {
    const real = newKey();
    const other = newKey();
    const c = await getChallenge(U2);
    const deviceId = newId();
    const res = await call('POST', '/devices', U2, { body: deviceBody(c.id, real, p256.sign(c.bytes, other.priv, { prehash: true }), deviceId) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('invalid_signature');
    expect(await t.db.selectFrom('devices').select('id').where('id', '=', deviceId).execute()).toHaveLength(0);
    const merchant = await t.db.selectFrom('merchant_members').select('merchant_id').where('user_id', '=', U2).executeTakeFirstOrThrow();
    const m = await t.db.selectFrom('merchants').select('account_status').where('id', '=', merchant.merchant_id).executeTakeFirstOrThrow();
    expect(m.account_status).toBe('pending');
    const msgs = await t.db.selectFrom('outbox_messages').select('id').where('payload', '@>' as never, sql`${JSON.stringify({ merchant_id: merchant.merchant_id })}::jsonb` as never).execute();
    expect(msgs).toHaveLength(0);
  });

  it('spec06-6 un reto usado dos veces responde 422 invalid_challenge', async () => {
    const key = newKey();
    const c = await getChallenge(U2);
    const sig = p256.sign(c.bytes, key.priv, { prehash: true });
    const first = await call('POST', '/devices', U2, { body: deviceBody(c.id, key, sig) });
    expect(first.statusCode).toBe(201);
    const second = await call('POST', '/devices', U2, { body: deviceBody(c.id, newKey(), sig) });
    expect(second.statusCode).toBe(422);
    expect(second.json().error.code).toBe('invalid_challenge');
  });

  it('un reto vencido responde 422 invalid_challenge', async () => {
    const key = newKey();
    const c = await getChallenge(U1);
    clock += 5 * 60 * 1000 + 1;
    const res = await call('POST', '/devices', U1, { body: deviceBody(c.id, key, p256.sign(c.bytes, key.priv, { prehash: true })) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('invalid_challenge');
  });

  it('el reto de otro usuario responde 422 invalid_challenge', async () => {
    const key = newKey();
    const c = await getChallenge(U1);
    const res = await call('POST', '/devices', U2, { body: deviceBody(c.id, key, p256.sign(c.bytes, key.priv, { prehash: true })) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('invalid_challenge');
  });

  it('una firma con s alto (Secure Enclave no normaliza a low-S) tambien se acepta', async () => {
    const key = newKey();
    const c = await getChallenge(U1);
    const low = p256.sign(c.bytes, key.priv, { prehash: true });
    const n = p256.Point.Fn.ORDER;
    const r = low.slice(0, 32);
    const s = BigInt('0x' + Buffer.from(low.slice(32)).toString('hex'));
    const high = new Uint8Array(64);
    high.set(r, 0);
    high.set(Buffer.from((n - s).toString(16).padStart(64, '0'), 'hex'), 32);
    const res = await call('POST', '/devices', U1, { body: deviceBody(c.id, key, high) });
    expect(res.statusCode).toBe(201);
    // segundo dispositivo del mismo comercio: no vuelve a encolar el despliegue
    const msgs = await t.db.selectFrom('outbox_messages').select('id').where('topic', '=', 'account.deploy').execute();
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it('una clave que no es un punto de P-256 o no mide 65 bytes responde 400 invalid_request', async () => {
    const c = await getChallenge(U1);
    const bogus = new Uint8Array(65);
    bogus[0] = 0x04;
    const res = await call('POST', '/devices', U1, { body: deviceBody(c.id, { pub: bogus }, new Uint8Array(64)) });
    expect(res.statusCode).toBe(400);
    const short = await call('POST', '/devices', U1, { body: deviceBody(c.id, { pub: new Uint8Array(33) }, new Uint8Array(64)) });
    expect(short.statusCode).toBe(400);
  });

  it('la misma clave en el mismo comercio responde 409 already_exists', async () => {
    const key = newKey();
    const c1 = await getChallenge(U1);
    expect((await call('POST', '/devices', U1, { body: deviceBody(c1.id, key, p256.sign(c1.bytes, key.priv, { prehash: true })) })).statusCode).toBe(201);
    const c2 = await getChallenge(U1);
    const dup = await call('POST', '/devices', U1, { body: deviceBody(c2.id, key, p256.sign(c2.bytes, key.priv, { prehash: true })) });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('already_exists');
  });

  it('un usuario sin comercio recibe 403 al registrar un dispositivo', async () => {
    const res = await call('POST', '/devices', U3, { body: deviceBody(newId(), newKey(), new Uint8Array(64)) });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /merchants/me', () => {
  it('devuelve el comercio con el network de deployments/testnet.json y el rol', async () => {
    const key = newKey();
    const c = await getChallenge(U1);
    const deviceId = newId();
    expect((await call('POST', '/devices', U1, { body: deviceBody(c.id, key, p256.sign(c.bytes, key.priv, { prehash: true }), deviceId) })).statusCode).toBe(201);
    const res = await call('GET', '/merchants/me', U1, { device: deviceId });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.business_name).toBe('Tienda Dona Marta');
    expect(j.account_status).toBe('deploying');
    expect(j.stellar_address).toBeNull();
    expect(j.role).toBe('dueno');
    expect(j.network.network).toBe('testnet');
    expect(j.network.registry_ids[0]).toMatch(/^C[A-Z0-9]{55}$/);
    expect(j.network.p256_verifier_id).toMatch(/^C[A-Z0-9]{55}$/);
  });

  it('sin X-Device-Id responde 403', async () => {
    const res = await call('GET', '/merchants/me', U1);
    expect(res.statusCode).toBe(403);
  });
});
