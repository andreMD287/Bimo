import { newUlid } from '@bimo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSyncRoutes } from '../src/api/routes/sync';
import { buildServer } from '../src/api/server';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { seedMerchant } from './fixtures';
import { makeAuth, testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

let t: TestDb;
let app: FastifyInstance;
let auth: Awaited<ReturnType<typeof makeAuth>>;
const SERVER_NOW = Date.parse('2026-10-17T15:00:00.000Z');

const UA = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const UB = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
let mA: { merchantId: string; deviceIds: string[] };
let mB: { merchantId: string; deviceIds: string[] };

beforeAll(async () => {
  t = await createTestDb();
  await t.addUser(UA);
  await t.addUser(UB);
  auth = await makeAuth();
  mA = await seedMerchant(t.db, UA);
  mB = await seedMerchant(t.db, UB);
  app = await buildServer({
    config: testConfig(),
    db: t.db,
    jwt: auth.jwt,
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    now: () => SERVER_NOW,
    routes: [registerSyncRoutes],
  });
});
afterAll(async () => {
  await app.close();
  await t.close();
});

interface Item {
  type: 'customer' | 'channel' | 'entry';
  data: Record<string, unknown>;
}

async function push(user: string, device: string, items: Item[], deviceTime = new Date(SERVER_NOW).toISOString()) {
  return app.inject({
    method: 'POST',
    url: '/sync/push',
    headers: { authorization: `Bearer ${await auth.sign(user)}`, 'x-device-time': deviceTime, 'x-device-id': device },
    payload: { device_id: device, device_time: deviceTime, items },
  });
}
const pushA = (items: Item[], deviceTime?: string) => push(UA, mA.deviceIds[0] as string, items, deviceTime);

const line = (account_code: string, direction: string, amount_minor: number, channel?: string, customer_id?: string, line_no = 1) => ({
  id: newUlid(), line_no, account_code, direction, amount_minor, currency: 'COP', ...(channel ? { channel } : {}), ...(customer_id ? { customer_id } : {}),
});

function ventaEntry(amount = 2000000, over: Record<string, unknown> = {}): Item {
  return {
    type: 'entry',
    data: {
      id: newUlid(), occurred_at: '2026-10-17T14:30:00.000Z', kind: 'venta', origin: 'declarado', reverses_entry_id: null, note: null,
      lines: [line('caja', 'debe', amount, 'efectivo', undefined, 1), line('ventas', 'haber', amount, undefined, undefined, 2)], ...over,
    },
  };
}
const idOf = (i: Item) => i.data.id as string;

describe('spec 04 §5: POST /sync/push', () => {
  it('un asiento valido se acepta, guarda sal de 32 bytes, calcula business_date y responde el estado del dia', async () => {
    const it1 = ventaEntry(2000000, { occurred_at: '2026-10-07T04:30:00.000Z' });
    const res = await pushA([it1]);
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([{ type: 'entry', id: idOf(it1), result: 'accepted', business_date: '2026-10-06', day_status: 'abierto' }]);
    expect(res.json().clock_skew_ms).toBe(0);
    const e = await t.db.selectFrom('journal_entries').selectAll().where('id', '=', idOf(it1)).executeTakeFirstOrThrow();
    expect(e.business_date).toBe('2026-10-06');
    expect(e.device_id).toBe(mA.deviceIds[0]);
    expect(e.created_by).toBe(UA);
    expect(e.origin).toBe('declarado');
    expect(e.clock_suspect).toBe(false);
    const salt = await t.db.selectFrom('entry_salts').select('salt').where('entry_id', '=', idOf(it1)).executeTakeFirstOrThrow();
    expect(salt.salt).toHaveLength(32);
    const lines = await t.db.selectFrom('journal_lines').select(['line_no', 'amount_minor']).where('entry_id', '=', idOf(it1)).orderBy('line_no').execute();
    expect(lines.map((l) => l.amount_minor)).toEqual([2000000, 2000000]);
  });

  it('spec04-11 enviar el mismo lote dos veces devuelve duplicate en todos los items y no cambia la sal', async () => {
    const cust = { type: 'customer' as const, data: { id: newUlid(), display_name: 'Dona Rosa', phone: null, updated_at: '2026-10-17T14:00:00.000Z' } };
    const items = [cust, ventaEntry(500), ventaEntry(700)];
    const first = (await pushA(items)).json().results;
    expect(first.map((r: { result: string }) => r.result)).toEqual(['accepted', 'accepted', 'accepted']);
    const saltBefore = await t.db.selectFrom('entry_salts').select('salt').where('entry_id', '=', idOf(items[1] as Item)).executeTakeFirstOrThrow();
    const second = (await pushA(items)).json().results;
    expect(second.map((r: { result: string }) => r.result)).toEqual(['duplicate', 'duplicate', 'duplicate']);
    expect(second[1].business_date).toBe('2026-10-17');
    const saltAfter = await t.db.selectFrom('entry_salts').select('salt').where('entry_id', '=', idOf(items[1] as Item)).executeTakeFirstOrThrow();
    expect(Buffer.from(saltAfter.salt).equals(Buffer.from(saltBefore.salt))).toBe(true);
    const n = await t.db.selectFrom('journal_entries').select('id').where('id', 'in', [idOf(items[1] as Item), idOf(items[2] as Item)]).execute();
    expect(n).toHaveLength(2);
  });

  it('spec04-11 el mismo ID con otro monto devuelve id_conflict', async () => {
    const original = ventaEntry(1000);
    await pushA([original]);
    const changed = ventaEntry(1001, { id: idOf(original) });
    const r = (await pushA([changed])).json().results[0];
    expect(r).toMatchObject({ result: 'id_conflict', id: idOf(original) });
    const stored = await t.db.selectFrom('journal_lines').select('amount_minor').where('entry_id', '=', idOf(original)).execute();
    expect(stored.every((l) => l.amount_minor === 1000)).toBe(true);
  });

  it('un ID que pertenece a otro comercio devuelve id_conflict (sin revelar nada mas)', async () => {
    const other = ventaEntry(321);
    await push(UB, mB.deviceIds[0] as string, [other]);
    const r = (await pushA([other])).json().results[0];
    expect(r).toEqual({ type: 'entry', id: idOf(other), result: 'id_conflict' });
  });

  it('spec04-11 V-08: origin = verificado desde la app es rechazado con forbidden_origin', async () => {
    const bad = ventaEntry(100, { origin: 'verificado' });
    const r = (await pushA([bad])).json().results[0];
    expect(r).toEqual({ type: 'entry', id: idOf(bad), result: 'rejected', code: 'forbidden_origin' });
    expect(await t.db.selectFrom('journal_entries').select('id').where('id', '=', idOf(bad)).execute()).toHaveLength(0);
  });

  it('cada regla V devuelve su codigo y un item malo no bloquea a los demas', async () => {
    const unbalanced = ventaEntry(100);
    (unbalanced.data.lines as Array<{ amount_minor: number }>)[1]!.amount_minor = 99;
    const ok = ventaEntry(150);
    const badId = ventaEntry(100, { id: 'no-es-ulid' });
    const badTime = ventaEntry(100, { occurred_at: '2026-10-17T14:30:00Z' });
    const res = (await pushA([unbalanced, ok, badId, badTime])).json().results;
    expect(res[0]).toMatchObject({ result: 'rejected', code: 'unbalanced' });
    expect(res[1]).toMatchObject({ result: 'accepted' });
    expect(res[2]).toMatchObject({ result: 'rejected', code: 'invalid_id' });
    expect(res[3]).toMatchObject({ result: 'rejected', code: 'invalid_time' });
  });

  it('spec04-11 un reverso de una venta que aun no se ha subido funciona si ambos van en orden en el mismo lote', async () => {
    const venta = ventaEntry(4000);
    const reverso: Item = {
      type: 'entry',
      data: {
        id: newUlid(), occurred_at: '2026-10-17T14:31:00.000Z', kind: 'reverso', origin: 'declarado', reverses_entry_id: idOf(venta), note: null,
        lines: [line('ventas', 'debe', 4000, undefined, undefined, 1), line('caja', 'haber', 4000, 'efectivo', undefined, 2)],
      },
    };
    const res = (await pushA([venta, reverso])).json().results;
    expect(res.map((r: { result: string }) => r.result)).toEqual(['accepted', 'accepted']);
    // un segundo reverso del mismo asiento no se acepta
    const again: Item = { type: 'entry', data: { ...reverso.data, id: newUlid(), lines: (reverso.data.lines as object[]).map((l) => ({ ...l, id: newUlid() })) } };
    expect((await pushA([again])).json().results[0]).toMatchObject({ result: 'rejected', code: 'invalid_reversal' });
  });

  it('un reverso que llega antes que su venta se rechaza (invalid_reversal); reenviarlo en orden despues lo acepta', async () => {
    const venta = ventaEntry(900);
    const reverso: Item = {
      type: 'entry',
      data: {
        id: newUlid(), occurred_at: '2026-10-17T14:31:00.000Z', kind: 'reverso', origin: 'declarado', reverses_entry_id: idOf(venta), note: null,
        lines: [line('ventas', 'debe', 900, undefined, undefined, 1), line('caja', 'haber', 900, 'efectivo', undefined, 2)],
      },
    };
    expect((await pushA([reverso])).json().results[0]).toMatchObject({ result: 'rejected', code: 'invalid_reversal' });
    const res = (await pushA([venta, reverso])).json().results;
    expect(res.map((r: { result: string }) => r.result)).toEqual(['accepted', 'accepted']);
  });

  it('dependency_failed: un asiento que depende de un cliente o de un asiento del lote que no se acepto', async () => {
    const badCustomer = { type: 'customer' as const, data: { id: newUlid(), display_name: '', phone: null, updated_at: '2026-10-17T14:00:00.000Z' } };
    const fiado: Item = {
      type: 'entry',
      data: {
        id: newUlid(), occurred_at: '2026-10-17T14:30:00.000Z', kind: 'venta', origin: 'declarado', reverses_entry_id: null, note: null,
        lines: [line('por_cobrar_clientes', 'debe', 100, 'fiado', badCustomer.data.id as string, 1), line('ventas', 'haber', 100, undefined, undefined, 2)],
      },
    };
    const res = (await pushA([badCustomer, fiado])).json().results;
    expect(res[0]).toMatchObject({ type: 'customer', result: 'rejected', code: 'invalid_text' });
    expect(res[1]).toEqual({ type: 'entry', id: idOf(fiado), result: 'dependency_failed' });
    // y un reverso cuyo original fue rechazado en el mismo lote
    const malo = ventaEntry(100, { origin: 'on_chain' });
    const rev: Item = {
      type: 'entry',
      data: {
        id: newUlid(), occurred_at: '2026-10-17T14:31:00.000Z', kind: 'reverso', origin: 'declarado', reverses_entry_id: idOf(malo), note: null,
        lines: [line('ventas', 'debe', 100, undefined, undefined, 1), line('caja', 'haber', 100, 'efectivo', undefined, 2)],
      },
    };
    expect((await pushA([malo, rev])).json().results[1]).toMatchObject({ result: 'dependency_failed' });
  });

  it('spec04-7 con el reloj adelantado 30 min los asientos de ese push quedan con clock_suspect y se devuelve el desfase', async () => {
    const skewed = ventaEntry(111);
    const res = await pushA([skewed], new Date(SERVER_NOW + 30 * 60 * 1000).toISOString());
    expect(res.json().clock_skew_ms).toBe(30 * 60 * 1000);
    const e = await t.db.selectFrom('journal_entries').select('clock_suspect').where('id', '=', idOf(skewed)).executeTakeFirstOrThrow();
    expect(e.clock_suspect).toBe(true);
  });

  it('spec04-7 una venta antigua hecha sin red, con el reloj bien, no se marca como sospechosa', async () => {
    const old = ventaEntry(222, { occurred_at: '2026-10-15T14:30:00.000Z' }); // hace 2 dias
    await pushA([old]);
    const e = await t.db.selectFrom('journal_entries').select('clock_suspect').where('id', '=', idOf(old)).executeTakeFirstOrThrow();
    expect(e.clock_suspect).toBe(false);
    // y 9 minutos de desfase todavia no es sospechoso
    const near = ventaEntry(223);
    await pushA([near], new Date(SERVER_NOW - 9 * 60 * 1000).toISOString());
    expect((await t.db.selectFrom('journal_entries').select('clock_suspect').where('id', '=', idOf(near)).executeTakeFirstOrThrow()).clock_suspect).toBe(false);
  });

  it('el texto se normaliza a NFC al recibirlo', async () => {
    const it1 = ventaEntry(333, { note: 'café del dia' });
    expect((await pushA([it1])).json().results[0].result).toBe('accepted');
    const e = await t.db.selectFrom('journal_entries').select('note').where('id', '=', idOf(it1)).executeTakeFirstOrThrow();
    expect(e.note).toBe('café del dia');
  });

  it('DB-09: un asiento para un dia sellado lo deja en requiere_enmienda y lo informa', async () => {
    const first = ventaEntry(444, { occurred_at: '2026-10-10T15:00:00.000Z' });
    await pushA([first]);
    await t.db.updateTable('business_days').set({ status: 'sellado' }).where('merchant_id', '=', mA.merchantId).where('business_date', '=', '2026-10-10').execute();
    const late = ventaEntry(445, { occurred_at: '2026-10-10T16:00:00.000Z' });
    expect((await pushA([late])).json().results[0]).toMatchObject({ result: 'accepted', business_date: '2026-10-10', day_status: 'requiere_enmienda' });
  });

  it('clientes: aceptar, repetir, editar (gana la mas reciente) y una edicion vieja no pisa la nueva', async () => {
    const id = newUlid();
    const data = (name: string, at: string) => ({ type: 'customer' as const, data: { id, display_name: name, phone: '3001112233', updated_at: at } });
    expect((await pushA([data('Rosa', '2026-10-17T10:00:00.000Z')])).json().results[0].result).toBe('accepted');
    expect((await pushA([data('Rosa', '2026-10-17T10:00:00.000Z')])).json().results[0].result).toBe('duplicate');
    expect((await pushA([data('Rosa Perez', '2026-10-17T11:00:00.000Z')])).json().results[0].result).toBe('accepted');
    expect((await pushA([data('Rosa vieja', '2026-10-17T09:00:00.000Z')])).json().results[0].result).toBe('duplicate');
    const c = await t.db.selectFrom('customers').select(['display_name', 'created_at']).where('id', '=', id).executeTakeFirstOrThrow();
    expect(c.display_name).toBe('Rosa Perez');
    expect(c.created_at.toISOString()).toBe('2026-10-17T10:00:00.000Z');
    // un cliente de otro comercio con el mismo ID
    expect((await push(UB, mB.deviceIds[0] as string, [data('Intruso', '2026-10-17T12:00:00.000Z')])).json().results[0].result).toBe('id_conflict');
  });

  it('canales: se guardan y los rangos de comision y dias se validan', async () => {
    const id = newUlid();
    const ch = (bps: number, days: number) => ({ type: 'channel' as const, data: { id, name: 'Datafono Bold', channel: 'datafono_externo', commission_bps: bps, settlement_days: days, active: true, updated_at: '2026-10-17T10:00:00.000Z' } });
    expect((await pushA([ch(250, 2)])).json().results[0].result).toBe('accepted');
    expect((await pushA([ch(10001, 2)])).json().results[0]).toMatchObject({ result: 'rejected', code: 'invalid_amount' });
    expect((await pushA([ch(250, 31)])).json().results[0]).toMatchObject({ result: 'rejected', code: 'invalid_amount' });
    const saved = await t.db.selectFrom('merchant_channels').select(['commission_bps', 'settlement_days']).where('id', '=', id).executeTakeFirstOrThrow();
    expect(saved).toEqual({ commission_bps: 250, settlement_days: 2 });
  });

  it('dos envios simultaneos del mismo asiento no crean duplicados', async () => {
    const it1 = ventaEntry(808);
    const [a, b] = await Promise.all([pushA([it1]), pushA([it1])]);
    const results = [a.json().results[0].result, b.json().results[0].result].sort();
    expect(results).toEqual(['accepted', 'duplicate']);
    expect(await t.db.selectFrom('journal_entries').select('id').where('id', '=', idOf(it1)).execute()).toHaveLength(1);
    expect(await t.db.selectFrom('entry_salts').select('entry_id').where('entry_id', '=', idOf(it1)).execute()).toHaveLength(1);
  });

  it('spec06-4 mas de 200 items, un device_id distinto o una forma imposible responden 400 invalid_request', async () => {
    const many = Array.from({ length: 201 }, () => ventaEntry(1));
    expect((await pushA(many)).statusCode).toBe(400);
    const dev = mA.deviceIds[0] as string;
    const mismatch = await app.inject({
      method: 'POST', url: '/sync/push',
      headers: { authorization: `Bearer ${await auth.sign(UA)}`, 'x-device-time': new Date(SERVER_NOW).toISOString(), 'x-device-id': dev },
      payload: { device_id: '01JA0000000000000000000XXX', device_time: new Date(SERVER_NOW).toISOString(), items: [] },
    });
    expect(mismatch.statusCode).toBe(400);
    const shape = await app.inject({
      method: 'POST', url: '/sync/push',
      headers: { authorization: `Bearer ${await auth.sign(UA)}`, 'x-device-time': new Date(SERVER_NOW).toISOString(), 'x-device-id': dev },
      payload: { device_id: dev, device_time: new Date(SERVER_NOW).toISOString(), items: [{ type: 'entry', data: { id: 5 } }] },
    });
    expect(shape.statusCode).toBe(400);
    expect(shape.json().error.code).toBe('invalid_request');
  });

  it('el push de A llega al pull de B (mismo comercio, otro dispositivo)', async () => {
    const it1 = ventaEntry(909);
    await pushA([it1]);
    const pull = await app.inject({
      method: 'GET', url: '/sync/pull',
      headers: { authorization: `Bearer ${await auth.sign(UA)}`, 'x-device-time': new Date(SERVER_NOW).toISOString(), 'x-device-id': mA.deviceIds[0] as string },
    });
    expect(pull.json().changes.some((c: { entity: string; data: { id?: string } }) => c.entity === 'entry' && c.data.id === idOf(it1))).toBe(true);
  });
});
