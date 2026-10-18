import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSyncRoutes } from '../src/api/routes/sync';
import { buildServer } from '../src/api/server';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { newId } from '../src/ids';
import { insertEntry, seedMerchant, venta } from './fixtures';
import { makeAuth, testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

let t: TestDb;
let app: FastifyInstance;
let auth: Awaited<ReturnType<typeof makeAuth>>;

const UA = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const UB = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
let mA: { merchantId: string; deviceIds: string[] };
let mB: { merchantId: string; deviceIds: string[] };

beforeAll(async () => {
  t = await createTestDb();
  await t.addUser(UA);
  await t.addUser(UB);
  auth = await makeAuth();
  mA = await seedMerchant(t.db, UA, { devices: 2 });
  mB = await seedMerchant(t.db, UB);
  app = await buildServer({
    config: testConfig(),
    db: t.db,
    jwt: auth.jwt,
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    routes: [registerSyncRoutes],
  });
});
afterAll(async () => {
  await app.close();
  await t.close();
});

async function pull(user: string, device: string, qs = '') {
  return app.inject({
    method: 'GET',
    url: `/sync/pull${qs}`,
    headers: { authorization: `Bearer ${await auth.sign(user)}`, 'x-device-time': new Date().toISOString(), 'x-device-id': device },
  });
}

describe('spec 04 §8: GET /sync/pull', () => {
  it('spec04-11 una venta creada en el dispositivo A aparece en el dispositivo B despues de un pull', async () => {
    const [devA, devB] = mA.deviceIds as [string, string];
    const id = await insertEntry(t.db, { merchantId: mA.merchantId, deviceId: devA, occurredAt: '2026-10-07T04:30:00.000Z', lines: venta(2000000) });
    const res = await pull(UA, devB);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const change = body.changes.find((c: { data: { id?: string } }) => c.data.id === id);
    expect(change.entity).toBe('entry');
    expect(change.data).toMatchObject({
      id, kind: 'venta', origin: 'declarado', business_date: '2026-10-06', occurred_at: '2026-10-07T04:30:00.000Z',
      reverses_entry_id: null, note: null, clock_suspect: false,
    });
    expect(change.data.lines).toEqual([
      expect.objectContaining({ line_no: 1, account_code: 'caja', direction: 'debe', amount_minor: 2000000, currency: 'COP', channel: 'efectivo' }),
      expect.objectContaining({ line_no: 2, account_code: 'ventas', direction: 'haber', amount_minor: 2000000, currency: 'COP' }),
    ]);
    expect(change.data.lines[1]).not.toHaveProperty('channel');
    // el dia que creo el trigger tambien viaja en el feed
    expect(body.changes.some((c: { entity: string; data: { business_date?: string; status?: string } }) => c.entity === 'day' && c.data.business_date === '2026-10-06' && c.data.status === 'abierto')).toBe(true);
  });

  it('el cursor devuelve solo lo nuevo y next_cursor avanza sin huecos ni duplicados (paginas de 3)', async () => {
    const dev = mA.deviceIds[0] as string;
    const all = await pull(UA, dev);
    const lastSeq = all.json().next_cursor as number;
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      ids.push(await insertEntry(t.db, { merchantId: mA.merchantId, deviceId: dev, occurredAt: `2026-10-08T15:0${i}:00.000Z`, lines: venta(1000 + i) }));
    }
    const seen: string[] = [];
    let cursor = lastSeq;
    let pages = 0;
    for (;;) {
      const r = (await pull(UA, dev, `?cursor=${cursor}&limit=3`)).json();
      pages += 1;
      for (const c of r.changes) if (c.entity === 'entry') seen.push(c.data.id);
      expect(r.next_cursor).toBeGreaterThanOrEqual(cursor);
      cursor = r.next_cursor;
      if (!r.has_more) break;
      expect(pages).toBeLessThan(10);
    }
    expect(seen).toEqual(ids); // en orden y sin duplicados
    const nada = (await pull(UA, dev, `?cursor=${cursor}`)).json();
    expect(nada).toEqual({ changes: [], next_cursor: cursor, has_more: false });
  });

  it('los cambios llegan en orden de seq', async () => {
    const r = (await pull(UA, mA.deviceIds[0] as string)).json();
    const seqs = r.changes.map((c: { seq: number }) => c.seq);
    expect(seqs).toEqual([...seqs].sort((a: number, b: number) => a - b));
  });

  it('clientes y canales: llega la ultima edicion (gana updated_at)', async () => {
    const dev = mA.deviceIds[0] as string;
    const before = (await pull(UA, dev)).json().next_cursor as number;
    const customerId = newId();
    await t.db.insertInto('customers').values({ id: customerId, merchant_id: mA.merchantId, display_name: 'Dona Rosa', phone: null, created_at: '2026-10-08T10:00:00Z', updated_at: '2026-10-08T10:00:00Z' }).execute();
    await t.db.updateTable('customers').set({ display_name: 'Dona Rosa Perez', updated_at: '2026-10-08T11:00:00Z' }).where('id', '=', customerId).execute();
    const channelId = newId();
    await t.db.insertInto('merchant_channels').values({ id: channelId, merchant_id: mA.merchantId, name: 'Datafono Bold', channel: 'datafono_externo', commission_bps: 250, settlement_days: 2, created_at: '2026-10-08T10:00:00Z', updated_at: '2026-10-08T10:00:00Z' }).execute();
    const r = (await pull(UA, dev, `?cursor=${before}`)).json();
    const customers = r.changes.filter((c: { entity: string }) => c.entity === 'customer');
    expect(customers).toHaveLength(2); // alta y edicion
    for (const c of customers) expect(c.data).toMatchObject({ id: customerId, display_name: 'Dona Rosa Perez', updated_at: '2026-10-08T11:00:00.000Z' });
    const ch = r.changes.find((c: { entity: string }) => c.entity === 'channel');
    expect(ch.data).toEqual({ id: channelId, name: 'Datafono Bold', channel: 'datafono_externo', commission_bps: 250, settlement_days: 2, active: true, updated_at: '2026-10-08T10:00:00.000Z' });
  });

  it('un sello preparado trae signing_request_id y uno confirmado trae tx_hash', async () => {
    const dev = mA.deviceIds[0] as string;
    const before = (await pull(UA, dev)).json().next_cursor as number;
    const day = await t.db.selectFrom('business_days').select('id').where('merchant_id', '=', mA.merchantId).where('business_date', '=', '2026-10-06').executeTakeFirstOrThrow();
    const srId = newId();
    await t.db.insertInto('signing_requests').values({ id: srId, merchant_id: mA.merchantId, preimage_xdr: Buffer.from([0]), expiration_ledger: 10, expires_at: '2026-10-20T00:00:00Z' }).execute();
    const sealId = newId();
    await t.db.insertInto('seals').values({ id: sealId, day_id: day.id, signing_request_id: srId, version: 1, merkle_root: Buffer.alloc(32, 1), entry_count: 1, origin_flags: 1 }).execute();
    const prep = (await pull(UA, dev, `?cursor=${before}`)).json().changes.find((c: { entity: string }) => c.entity === 'seal');
    expect(prep.data).toEqual({ business_date: '2026-10-06', version: 1, status: 'preparado', signing_request_id: srId });
    const mid = (await pull(UA, dev)).json().next_cursor as number;
    await t.db.updateTable('seals').set({ status: 'confirmado', tx_hash: 'TXABC', confirmed_at: new Date() }).where('id', '=', sealId).execute();
    const conf = (await pull(UA, dev, `?cursor=${mid}`)).json().changes.find((c: { entity: string }) => c.entity === 'seal');
    expect(conf.data).toEqual({ business_date: '2026-10-06', version: 1, status: 'confirmado', tx_hash: 'TXABC' });
  });

  it('nunca se ven los cambios de otro comercio', async () => {
    await insertEntry(t.db, { merchantId: mB.merchantId, occurredAt: '2026-10-09T15:00:00.000Z', lines: venta(555) });
    const r = (await pull(UA, mA.deviceIds[0] as string)).json();
    expect(JSON.stringify(r)).not.toContain('555');
    const rb = (await pull(UB, mB.deviceIds[0] as string)).json();
    expect(rb.changes.filter((c: { entity: string }) => c.entity === 'entry')).toHaveLength(1);
  });

  it('limit fuera de 1..500 o cursor negativo responde 400 invalid_request', async () => {
    const dev = mA.deviceIds[0] as string;
    expect((await pull(UA, dev, '?limit=501')).statusCode).toBe(400);
    expect((await pull(UA, dev, '?limit=0')).statusCode).toBe(400);
    expect((await pull(UA, dev, '?cursor=-1')).json().error.code).toBe('invalid_request');
  });

  it('sin dispositivo valido responde 403', async () => {
    const res = await pull(UA, mB.deviceIds[0] as string);
    expect(res.statusCode).toBe(403);
  });
});
