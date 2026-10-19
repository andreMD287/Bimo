import { createHash } from 'node:crypto';
import { encodeEntry, leafHash, merkleRoot, type Entry } from '@bimo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerVerificacionRoutes } from '../src/api/routes/verificacion';
import { buildServer } from '../src/api/server';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { newId } from '../src/ids';
import { seedMerchant, seedSpecDay, venta, insertEntry } from './fixtures';
import { LogCapture, makeAuth, testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

let t: TestDb;
let app: FastifyInstance;
let auth: Awaited<ReturnType<typeof makeAuth>>;
let clock = Date.parse('2026-10-17T15:00:00.000Z');
const log = new LogCapture();

const U_SPEC = 'ccccdddd-0000-4000-8000-000000000001';
const U_B = 'ccccdddd-0000-4000-8000-000000000002';
let spec: Awaited<ReturnType<typeof seedSpecDay>>;
let specDevice: string;
let other: { merchantId: string; deviceIds: string[] };

beforeAll(async () => {
  t = await createTestDb();
  await t.addUser(U_SPEC);
  await t.addUser(U_B);
  auth = await makeAuth();
  spec = await seedSpecDay(t.db, U_SPEC);
  specDevice = newId();
  await t.db.insertInto('devices').values({ id: specDevice, merchant_id: spec.merchantId, user_id: U_SPEC, key_kind: 'software_p256', public_key: Buffer.alloc(65, 4), signer_registered_tx: null, revoked_at: null }).execute();
  other = await seedMerchant(t.db, U_B);
  app = await buildServer({
    config: testConfig({ VERIFIER_BASE_URL: 'https://verificar.bimo.test' }),
    db: t.db,
    jwt: auth.jwt,
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    now: () => clock,
    logDestination: log,
    routes: [registerVerificacionRoutes],
  });
});
afterAll(async () => {
  await app.close();
  await t.close();
});

async function owner(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown, user = U_SPEC, device = specDevice) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${await auth.sign(user)}`, 'x-device-time': new Date(clock).toISOString(), 'x-device-id': device },
    ...(body !== undefined ? { payload: body as object } : {}),
  });
}
const tokenOf = (url: string) => url.split('#t=')[1] as string;
const pub = (token: string, path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) =>
  app.inject({ method, url: path, headers: { authorization: `Bearer ${token}` }, ...(body !== undefined ? { payload: body as object } : {}) });

async function newLink(over: Record<string, unknown> = {}) {
  const res = await owner('POST', '/verification-links', { date_from: '2026-09-01', date_to: '2026-10-07', expires_in_days: 30, ...over });
  return res;
}

describe('spec 05 §2: crear, listar y revocar enlaces', () => {
  it('spec05-2 el enlace lleva el token en el fragmento (#t=), vence a los 30 dias y solo se guarda su SHA-256', async () => {
    const res = await newLink();
    expect(res.statusCode).toBe(201);
    const j = res.json();
    expect(j.url).toMatch(/^https:\/\/verificar\.bimo\.test\/#t=[A-Za-z0-9_-]{43}$/);
    expect(j.expires_at).toBe(new Date(clock + 30 * 86_400_000).toISOString());
    const token = tokenOf(j.url);
    const row = await t.db.selectFrom('verification_links').selectAll().where('id', '=', j.id).executeTakeFirstOrThrow();
    expect(Buffer.from(row.token_hash).toString('hex')).toBe(createHash('sha256').update(Buffer.from(token, 'base64url')).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.date_from).toBe('2026-09-01');
  });

  it('spec05-2 valida el periodo: maximo 366 dias, sin futuro, hoy solo si ya esta sellado, vigencia 7/30/90', async () => {
    expect((await newLink({ date_from: '2025-01-01', date_to: '2026-10-07' })).statusCode).toBe(400); // > 366 dias
    expect((await newLink({ date_from: '2026-10-10', date_to: '2026-10-09' })).statusCode).toBe(400);
    expect((await newLink({ date_to: '2026-10-18' })).statusCode).toBe(400); // futuro
    expect((await newLink({ date_to: '2026-10-17' })).statusCode).toBe(400); // hoy sin sellar
    expect((await newLink({ expires_in_days: 15 })).statusCode).toBe(400);
    expect((await newLink({ date_from: '2025-10-17', date_to: '2026-10-16' })).statusCode).toBe(201); // 365 dias, hasta ayer
    await t.db.insertInto('business_days').values({ id: newId(), merchant_id: spec.merchantId, business_date: '2026-10-17', status: 'sellado', counted_cash_minor: null, closed_at: new Date(), closed_by: null }).execute();
    expect((await newLink({ date_to: '2026-10-17' })).statusCode).toBe(201); // hoy sellado
  });

  it('un empleado no puede crear enlaces (403 role_not_allowed)', async () => {
    await t.db.insertInto('merchant_members').values({ merchant_id: spec.merchantId, user_id: U_B, role: 'empleado' }).execute();
    const dev = newId();
    await t.db.insertInto('devices').values({ id: dev, merchant_id: spec.merchantId, user_id: U_B, key_kind: 'software_p256', public_key: Buffer.alloc(65, 5), signer_registered_tx: null, revoked_at: null }).execute();
    const res = await owner('POST', '/verification-links', { date_from: '2026-09-01', date_to: '2026-10-07', expires_in_days: 7 }, U_B, dev);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('role_not_allowed');
  });

  it('GET lista los enlaces con su estado y el numero de vistas; DELETE revoca; el revocado responde 410', async () => {
    const created = (await newLink()).json();
    const token = tokenOf(created.url);
    expect((await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06')).statusCode).toBe(200);
    expect((await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06')).statusCode).toBe(200);
    let list = (await owner('GET', '/verification-links')).json().links.find((l: { id: string }) => l.id === created.id);
    expect(list).toMatchObject({ status: 'activo', view_count: 2, revoked_at: null, date_from: '2026-09-01', date_to: '2026-10-07' });
    expect((await owner('DELETE', `/verification-links/${created.id}`)).statusCode).toBe(204);
    const gone = await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06');
    expect(gone.statusCode).toBe(410);
    expect(gone.json().error.code).toBe('link_inactive');
    list = (await owner('GET', '/verification-links')).json().links.find((l: { id: string }) => l.id === created.id);
    expect(list.status).toBe('revocado');
    expect((await owner('DELETE', `/verification-links/${newId()}`)).statusCode).toBe(404);
    // el enlace de otro comercio no se puede revocar
    const mine = (await newLink()).json();
    const dev = other.deviceIds[0] as string;
    expect((await owner('DELETE', `/verification-links/${mine.id}`, undefined, U_B, dev)).statusCode).toBe(404);
  });

  it('un enlace vencido responde 410 link_inactive y figura como vencido', async () => {
    const created = (await newLink({ expires_in_days: 7 })).json();
    const token = tokenOf(created.url);
    clock += 8 * 86_400_000;
    try {
      expect((await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06')).statusCode).toBe(410);
      const l = (await owner('GET', '/verification-links')).json().links.find((x: { id: string }) => x.id === created.id);
      expect(l.status).toBe('vencido');
    } finally {
      clock -= 8 * 86_400_000;
    }
  });
});

describe('spec 05 §3: GET /public/verification', () => {
  it('spec02-9 el paquete del dia de ejemplo trae los asientos del vector, sus sales, y el verificador recalcula la raiz 0859...c08b', async () => {
    const token = tokenOf((await newLink()).json().url);
    const res = await pub(token, '/public/verification?from=2026-10-06&to=2026-10-07');
    expect(res.statusCode).toBe(200);
    const pkg = res.json();
    expect(pkg.format).toBe('bimo-verification-v1');
    expect(pkg.merchant).toEqual({ merchant_id: spec.merchantId, business_name: 'Tienda Dona Marta', stellar_address: 'CVECTORES'.padEnd(56, 'A') });
    expect(pkg.network).toMatchObject({ network_passphrase: 'Test SDF Network ; September 2015', rpc_url: 'https://soroban-testnet.stellar.org' });
    expect(pkg.network.registry_ids).toHaveLength(1);
    expect(pkg.link).toMatchObject({ date_from: '2026-09-01', date_to: '2026-10-07' });
    expect(pkg.days.map((d: { date: number }) => d.date)).toEqual([20261006, 20261007]);
    const day = pkg.days[0];
    expect(day.entries).toHaveLength(5);
    // exactamente el asiento del vector (menos nada: mismos campos del spec 02 §3)
    const byId = new Map(spec.vectors.entries.map((e) => [e.entry.id, e]));
    for (const e of day.entries as Array<{ entry: Entry & { merchant_id: string }; salt: string; clock_suspect: boolean }>) {
      const want = byId.get(e.entry.id)!;
      expect(e.entry).toEqual({ ...want.entry, merchant_id: spec.merchantId, reverses_entry_id: want.entry.reverses_entry_id ?? null, external_source: want.entry.external_source ?? null, external_ref: want.entry.external_ref ?? null });
      expect(e.salt).toBe(want.salt);
      expect(e.clock_suspect).toBe(false);
    }
    // el "navegador" recalcula la raiz con shared a partir del paquete
    const leaves = day.entries.map((e: { entry: Entry; salt: string }) => leafHash(Buffer.from(e.salt, 'hex'), encodeEntry(e.entry)));
    expect(Buffer.from(merkleRoot(leaves)).toString('hex')).toBe(spec.root);
    // los dias sin asientos aparecen con su estado real
    expect(pkg.days[1]).toMatchObject({ date: 20261007, entries: [], seals: [] });
  });

  it('spec05-1 el paquete nunca trae notas, nombres, telefonos, raices ni totales del servidor', async () => {
    const token = tokenOf((await newLink()).json().url);
    const text = (await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06')).body;
    for (const forbidden of ['nota privada', 'Marta Perez', '3001234567', 'Bogota', 'Dona Rosa', '3109998888', 'merkle', '"root"', 'total']) {
      expect(text.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('spec05-3 un dia enmendado trae las dos versiones con los asientos que llegaron tarde', async () => {
    await t.addUser('ccccdddd-0000-4000-8000-000000000004');
    const mm = await seedMerchant(t.db, 'ccccdddd-0000-4000-8000-000000000004');
    await t.db.updateTable('merchants').set({ stellar_address: 'CENMIENDA'.padEnd(56, 'A'), account_status: 'ready' }).where('id', '=', mm.merchantId).execute();
    const e1 = await insertEntry(t.db, { merchantId: mm.merchantId, occurredAt: '2026-09-20T15:00:00.000Z', lines: venta(100) });
    const late = await insertEntry(t.db, { merchantId: mm.merchantId, occurredAt: '2026-09-20T18:00:00.000Z', lines: venta(50) });
    const day = await t.db.selectFrom('business_days').select('id').where('merchant_id', '=', mm.merchantId).executeTakeFirstOrThrow();
    const mkSeal = async (version: number, leaves: string[]) => {
      const id = newId();
      await t.db.insertInto('seals').values({ id, day_id: day.id, signing_request_id: null, version, merkle_root: Buffer.alloc(32, version), entry_count: leaves.length, origin_flags: 1, status: 'confirmado', tx_hash: `TX${version}`, confirmed_at: new Date() }).execute();
      let i = 0;
      for (const l of leaves) await t.db.insertInto('seal_leaves').values({ seal_id: id, leaf_index: i++, entry_id: l, leaf_hash: Buffer.alloc(32, 1) }).execute();
    };
    await mkSeal(1, [e1]);
    await mkSeal(2, [e1, late].sort());
    await t.db.updateTable('business_days').set({ status: 'sellado', current_seal_version: 2 }).where('id', '=', day.id).execute();
    const link = await owner('POST', '/verification-links', { date_from: '2026-09-01', date_to: '2026-10-07', expires_in_days: 7 }, 'ccccdddd-0000-4000-8000-000000000004', mm.deviceIds[0] as string);
    const pkg = (await pub(tokenOf(link.json().url), '/public/verification?from=2026-09-20&to=2026-09-20')).json();
    expect(pkg.days[0].status).toBe('sellado');
    expect(pkg.days[0].seals).toEqual([
      { version: 1, tx_hash: 'TX1', added_entry_ids: [e1] },
      { version: 2, tx_hash: 'TX2', added_entry_ids: [late] },
    ]);
  });

  it('spec05-3 pide como maximo 31 dias, dentro del periodo del enlace; sin token o con uno desconocido, 401', async () => {
    const token = tokenOf((await newLink()).json().url);
    expect((await pub(token, '/public/verification?from=2026-09-01&to=2026-10-02')).statusCode).toBe(400); // 32 dias
    expect((await pub(token, '/public/verification?from=2026-08-01&to=2026-08-10')).statusCode).toBe(400); // fuera del periodo
    expect((await pub(token, '/public/verification?from=2026-09-01&to=2026-09-30')).statusCode).toBe(200); // 30 dias
    expect((await pub(token, '/public/verification?from=2026-09-01&to=2026-10-01')).statusCode).toBe(200); // 31 dias
    expect((await app.inject({ method: 'GET', url: '/public/verification' })).statusCode).toBe(401);
    expect((await pub('d'.repeat(43), '/public/verification')).statusCode).toBe(401);
    // sin from/to devuelve los primeros 31 dias del periodo
    expect((await pub(token, '/public/verification')).json().days).toHaveLength(31);
  });

  it('spec06-4 mas de 60 peticiones por minuto con un mismo token responde 429', async () => {
    const token = tokenOf((await newLink()).json().url);
    let last = 200;
    for (let i = 0; i < 62; i++) last = (await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06')).statusCode;
    expect(last).toBe(429);
  });

  it('spec05-6 el token no aparece en los logs', async () => {
    const token = tokenOf((await newLink()).json().url);
    await pub(token, '/public/verification?from=2026-10-06&to=2026-10-06');
    expect(log.text).not.toContain(token);
  });

  it('POST /public/verification/restore encola la restauracion (202) y entry-proof responde 404', async () => {
    const token = tokenOf((await newLink()).json().url);
    expect((await pub(token, '/public/verification/restore', 'POST', { date: '2026-10-06' })).statusCode).toBe(202);
    const msg = await t.db.selectFrom('outbox_messages').selectAll().where('topic', '=', 'verification.restore').executeTakeFirstOrThrow();
    expect(msg.payload).toEqual({ merchant_id: spec.merchantId, date: '2026-10-06' });
    expect((await pub(token, '/public/verification/restore', 'POST', { date: '2020-01-01' })).statusCode).toBe(400);
    const proof = await pub(token, `/public/entry-proof?entry_id=${newId()}`);
    expect(proof.statusCode).toBe(404);
  });
});
