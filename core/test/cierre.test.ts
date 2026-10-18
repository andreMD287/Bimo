import { readFileSync } from 'node:fs';
import { amendReasonHash } from '@bimo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerDiasRoutes } from '../src/api/routes/dias';
import { buildServer } from '../src/api/server';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { AppError } from '../src/errors';
import { newId } from '../src/ids';
import { LEDGER_ACCOUNTS } from '../src/modules/comercios';
import type { SealItemInput, SealPreparer } from '../src/modules/stellar';
import { insertEntry, seedMerchant, venta } from './fixtures';
import { makeAuth, testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

let t: TestDb;
let app: FastifyInstance;
let auth: Awaited<ReturnType<typeof makeAuth>>;
let clock = Date.parse('2026-10-17T15:00:00.000Z');

class FakePreparer implements SealPreparer {
  calls: Array<{ merchantAddress: string; items: SealItemInput[] }> = [];
  fail = false;
  async prepare(input: { merchantAddress: string; items: SealItemInput[]; now: Date }) {
    if (this.fail) throw new AppError('chain_unavailable', 'sin red');
    this.calls.push({ merchantAddress: input.merchantAddress, items: input.items });
    const n = this.calls.length;
    return {
      preimageXdr: Buffer.from(`preimage-${n}`),
      expirationLedger: 1000 + n,
      expiresAt: new Date(input.now.getTime() + 10 * 60 * 1000),
    };
  }
}
const preparer = new FakePreparer();

const U = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`;
let nUser = 0;

beforeAll(async () => {
  t = await createTestDb();
  auth = await makeAuth();
  app = await buildServer({
    config: testConfig(),
    db: t.db,
    jwt: auth.jwt,
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    now: () => clock,
    seals: preparer,
    routes: [registerDiasRoutes],
  });
});
afterAll(async () => {
  await app.close();
  await t.close();
});

/** Comercio nuevo, con su cuenta Stellar lista (sin ella los dias esperan). */
async function newMerchant(ready = true) {
  nUser += 1;
  const user = U(nUser);
  await t.addUser(user);
  const m = await seedMerchant(t.db, user);
  if (ready) await t.db.updateTable('merchants').set({ account_status: 'ready', stellar_address: `C${m.merchantId}`.padEnd(56, 'A') }).where('id', '=', m.merchantId).execute();
  return { user, ...m, device: m.deviceIds[0] as string };
}
type M = Awaited<ReturnType<typeof newMerchant>>;

async function call(m: M, method: 'GET' | 'POST', url: string, body?: unknown) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${await auth.sign(m.user)}`, 'x-device-time': new Date(clock).toISOString(), 'x-device-id': m.device },
    ...(body !== undefined ? { payload: body as object } : {}),
  });
}
const dayRow = (m: M, date: string) =>
  t.db.selectFrom('business_days').selectAll().where('merchant_id', '=', m.merchantId).where('business_date', '=', date).executeTakeFirst();
const sell = (m: M, at: string, amt = 1000) => insertEntry(t.db, { merchantId: m.merchantId, deviceId: m.device, occurredAt: at, lines: venta(amt) });

describe('spec 07 §1: cierre del dia (D-2, D-3)', () => {
  it('D-3 cierra un dia abierto: guarda efectivo contado, quien y cuando, y crea la solicitud de firma', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-16T15:00:00.000Z');
    const e2 = await sell(m, '2026-10-16T16:00:00.000Z');
    const res = await call(m, 'POST', '/days/2026-10-16/close', { counted_cash_minor: 2000, entry_ids: [e1, e2] });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('cerrado');
    expect(res.json().signing_request_id).toMatch(/^[0-9A-Z]{26}$/);
    const d = await dayRow(m, '2026-10-16');
    expect(d).toMatchObject({ status: 'cerrado', counted_cash_minor: 2000, closed_by: m.user });
    expect(d?.closed_at?.toISOString()).toBe(new Date(clock).toISOString());
  });

  it('D-2 cerrar una fecha sin asientos crea el dia y se sellara con la raiz vacia', async () => {
    const m = await newMerchant();
    const res = await call(m, 'POST', '/days/2026-10-12/close', { counted_cash_minor: 0, entry_ids: [] });
    expect(res.statusCode).toBe(200);
    expect((await dayRow(m, '2026-10-12'))?.status).toBe('cerrado');
    const seal = await t.db.selectFrom('seals').selectAll().where('day_id', '=', (await dayRow(m, '2026-10-12'))!.id).executeTakeFirstOrThrow();
    expect(Buffer.from(seal.merkle_root).toString('hex')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(seal.entry_count).toBe(0);
    expect(seal.status).toBe('preparado');
  });

  it('D-3 si al servidor le faltan asientos responde 409 missing_entries con la lista y no cierra', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-16T15:00:00.000Z');
    const falta = newId();
    const res = await call(m, 'POST', '/days/2026-10-16/close', { counted_cash_minor: 1000, entry_ids: [e1, falta] });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'missing_entries', details: { entry_ids: [falta] } });
    expect((await dayRow(m, '2026-10-16'))?.status).toBe('abierto');
  });

  it('spec04-11 cerrar sin conexion y recuperar la red: el cierre llega despues de los asientos y queda completo', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-15T15:00:00.000Z'); // llegaron por el push
    const res = await call(m, 'POST', '/days/2026-10-15/close', { counted_cash_minor: null, entry_ids: [e1] });
    expect(res.statusCode).toBe(200); // un dia pasado puede cerrarse sin conteo
    expect((await dayRow(m, '2026-10-15'))).toMatchObject({ status: 'cerrado', counted_cash_minor: null });
  });

  it('spec07-1 cualquier otro estado responde 409 day_not_closable (cerrado con otro conteo, firmado, sellado, enmienda)', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-14T15:00:00.000Z');
    expect((await call(m, 'POST', '/days/2026-10-14/close', { counted_cash_minor: 1000, entry_ids: [e1] })).statusCode).toBe(200);
    // reintento identico = idempotente (la respuesta del primero pudo perderse)
    expect((await call(m, 'POST', '/days/2026-10-14/close', { counted_cash_minor: 1000, entry_ids: [e1] })).statusCode).toBe(200);
    // otro conteo = error
    const other = await call(m, 'POST', '/days/2026-10-14/close', { counted_cash_minor: 999, entry_ids: [e1] });
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('day_not_closable');
    for (const status of ['firmado', 'sellado', 'requiere_enmienda'] as const) {
      await t.db.updateTable('business_days').set({ status }).where('merchant_id', '=', m.merchantId).where('business_date', '=', '2026-10-14').execute();
      const r = await call(m, 'POST', '/days/2026-10-14/close', { counted_cash_minor: 1000, entry_ids: [e1] });
      expect(r.json().error.code, status).toBe('day_not_closable');
    }
  });

  it('spec03-4.3 una fecha futura en Bogota responde 409 day_not_closable; una fecha mal formada, 400', async () => {
    const m = await newMerchant();
    const fut = await call(m, 'POST', '/days/2026-10-18/close', { counted_cash_minor: 0, entry_ids: [] });
    expect(fut.statusCode).toBe(409);
    expect(fut.json().error.code).toBe('day_not_closable');
    expect((await call(m, 'POST', '/days/ayer/close', { counted_cash_minor: 0, entry_ids: [] })).statusCode).toBe(400);
    // hoy (2026-10-17 en Bogota) si se puede cerrar
    expect((await call(m, 'POST', '/days/2026-10-17/close', { counted_cash_minor: 0, entry_ids: [] })).statusCode).toBe(200);
  });

  it('dos cierres simultaneos del mismo dia no dejan estados inconsistentes (un solo sello preparado)', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-13T15:00:00.000Z');
    const body = { counted_cash_minor: 1000, entry_ids: [e1] };
    const [a, b] = await Promise.all([call(m, 'POST', '/days/2026-10-13/close', body), call(m, 'POST', '/days/2026-10-13/close', body)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const day = await dayRow(m, '2026-10-13');
    expect(day?.status).toBe('cerrado');
    expect(await t.db.selectFrom('seals').select('id').where('day_id', '=', day!.id).execute()).toHaveLength(1);
    const open = await t.db.selectFrom('signing_requests').select('id').where('merchant_id', '=', m.merchantId).where('status', '=', 'abierta').execute();
    expect(open).toHaveLength(1);
  });
});

describe('spec 07 §2: solicitud de firma (S-1, S-3, S-4, D-10)', () => {
  it('S-1 toma los dias cerrados, guarda hojas y un sello preparado por dia, y devuelve la preimagen', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-10T15:00:00.000Z', 100);
    const e2 = await sell(m, '2026-10-10T16:00:00.000Z', 200);
    await call(m, 'POST', '/days/2026-10-10/close', { counted_cash_minor: 300, entry_ids: [e1, e2] });
    preparer.calls.length = 0;
    const res = await call(m, 'GET', '/signing/pending');
    expect(res.statusCode).toBe(200);
    const r = res.json().request;
    expect(r).toMatchObject({ items: [{ date: '2026-10-10', entry_count: 2, is_amend: false }] });
    expect(Buffer.from(r.preimage_xdr, 'base64').toString()).toMatch(/^preimage-/);
    expect(r.expiration_ledger).toBeGreaterThan(1000);
    const seal = await t.db.selectFrom('seals').selectAll().where('signing_request_id', '=', r.signing_request_id).executeTakeFirstOrThrow();
    expect(seal).toMatchObject({ status: 'preparado', version: 1, entry_count: 2, origin_flags: 1 });
    const leaves = await t.db.selectFrom('seal_leaves').select(['entry_id', 'leaf_index']).where('seal_id', '=', seal.id).orderBy('leaf_index').execute();
    expect(leaves.map((l) => l.entry_id)).toEqual([e1, e2].sort()); // por id ascendente
    // la solicitud que ya existe se devuelve tal cual, sin simular otra vez
    const again = await call(m, 'GET', '/signing/pending');
    expect(again.json().request.signing_request_id).toBe(r.signing_request_id);
    expect(preparer.calls.length).toBeLessThanOrEqual(1);
  });

  it('spec02-9 la raiz del dia de ejemplo es 0859...c08b (5 asientos, origin_flags declarado + verificado)', async () => {
    const m = await newMerchant();
    const v = JSON.parse(readFileSync(new URL('../../docs/specs/02-vectores.json', import.meta.url), 'utf8')) as {
      entries: Array<{ entry: any; salt: string }>;
      day_example: { entry_ids: string[]; root: string };
    };
    // el comercio del vector: mismo merchant_id para que los bytes coincidan
    const vecMerchant = '01JA2B3C4D5E6F7G8H9J0KMNPQ';
    await t.db.insertInto('merchants').values({ id: vecMerchant, stellar_address: 'CVECTORES'.padEnd(56, 'A'), network: 'testnet', account_status: 'ready', forgotten_at: null }).execute();
    await t.db.insertInto('merchant_members').values({ merchant_id: vecMerchant, user_id: m.user, role: 'empleado' }).execute();
    const accountIds = new Map<string, string>();
    for (const a of LEDGER_ACCOUNTS) {
      const id = newId();
      accountIds.set(`${a.code}`, id);
      await t.db.insertInto('ledger_accounts').values({ id, merchant_id: vecMerchant, code: a.code, type: a.type, currency: a.currency }).execute();
    }
    await t.db.insertInto('customers').values({ id: '01JA9Y000000000000000000R0', merchant_id: vecMerchant, display_name: 'Rosa', phone: null, created_at: new Date(clock), updated_at: new Date(clock) }).execute();
    const byId = new Map(v.entries.map((e) => [e.entry.id, e]));
    for (const id of v.day_example.entry_ids) {
      const e = (byId.get(id) as { entry: any; salt: string }).entry;
      await t.db.transaction().execute(async (tx) => {
        await tx.insertInto('journal_entries').values({
          id: e.id, merchant_id: vecMerchant, occurred_at: e.occurred_at, kind: e.kind, origin: e.origin, reverses_entry_id: e.reverses_entry_id ?? null,
          external_source: e.external_source ?? null, external_ref: e.external_ref ?? null, note: null, device_id: null, created_by: null,
        }).execute();
        for (const l of e.lines) {
          await tx.insertInto('journal_lines').values({
            id: newId(), entry_id: e.id, line_no: l.line_no, account_id: accountIds.get(l.account_code) as string, direction: l.direction,
            amount_minor: l.amount_minor, currency: l.currency, channel: l.channel ?? null, customer_id: l.customer_id ?? null,
          }).execute();
        }
        await tx.insertInto('entry_salts').values({ entry_id: e.id, salt: Buffer.from((byId.get(id) as { salt: string }).salt, 'hex') }).execute();
      });
    }
    // los 5 asientos caen en el 2026-10-06 de Bogota
    await t.db.updateTable('business_days').set({ status: 'cerrado' }).where('merchant_id', '=', vecMerchant).where('business_date', '=', '2026-10-06').execute();
    const { ensureSigningRequest } = await import('../src/modules/cierre');
    preparer.calls.length = 0;
    const view = await ensureSigningRequest(t.db, { merchantId: vecMerchant, preparer, now: new Date(clock) });
    expect(view?.items).toEqual([{ date: '2026-10-06', entry_count: 5, is_amend: false }]);
    const item = preparer.calls[0]!.items[0]!;
    expect(item.root.toString('hex')).toBe(v.day_example.root);
    expect(item).toMatchObject({ date: 20261006, entryCount: 5, originFlags: 3 });
    expect(item.amend).toBeUndefined();
  });

  it('S-4 / D-10 un asiento nuevo de un dia incluido reemplaza la solicitud; la siguiente se crea con los datos al dia', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-09T15:00:00.000Z');
    await call(m, 'POST', '/days/2026-10-09/close', { counted_cash_minor: 1000, entry_ids: [e1] });
    const first = (await call(m, 'GET', '/signing/pending')).json().request;
    const late = await sell(m, '2026-10-09T18:00:00.000Z', 55); // llega por el push de otro dispositivo
    const { supersedeIfAffected } = await import('../src/modules/cierre');
    expect(await supersedeIfAffected(t.db, m.merchantId, '2026-10-09', new Date(clock))).toBe(true);
    const old = await t.db.selectFrom('signing_requests').selectAll().where('id', '=', first.signing_request_id).executeTakeFirstOrThrow();
    expect(old.status).toBe('reemplazada');
    expect(await t.db.selectFrom('seals').select('id').where('signing_request_id', '=', first.signing_request_id).execute()).toHaveLength(0);
    const second = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(second.signing_request_id).not.toBe(first.signing_request_id);
    expect(second.items[0]).toMatchObject({ date: '2026-10-09', entry_count: 2 });
    expect(late).toBeTruthy();
  });

  it('S-4 cerrar otro dia reemplaza la solicitud abierta y la nueva incluye ambos dias', async () => {
    const m = await newMerchant();
    const a = await sell(m, '2026-10-08T15:00:00.000Z');
    const r1 = (await call(m, 'POST', '/days/2026-10-08/close', { counted_cash_minor: 1000, entry_ids: [a] })).json().signing_request_id;
    const b = await sell(m, '2026-10-09T15:00:00.000Z');
    const r2 = (await call(m, 'POST', '/days/2026-10-09/close', { counted_cash_minor: 1000, entry_ids: [b] })).json().signing_request_id;
    expect(r2).not.toBe(r1);
    expect((await t.db.selectFrom('signing_requests').select('status').where('id', '=', r1).executeTakeFirstOrThrow()).status).toBe('reemplazada');
    const pending = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(pending.items.map((i: { date: string }) => i.date)).toEqual(['2026-10-08', '2026-10-09']);
  });

  it('S-3 una solicitud vencida se marca vencida, se borran sus sellos preparados y se crea otra', async () => {
    const m = await newMerchant();
    const a = await sell(m, '2026-10-07T15:00:00.000Z');
    const r1 = (await call(m, 'POST', '/days/2026-10-07/close', { counted_cash_minor: 1000, entry_ids: [a] })).json().signing_request_id;
    clock += 11 * 60 * 1000; // pasan 11 minutos
    const pending = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(pending.signing_request_id).not.toBe(r1);
    const old = await t.db.selectFrom('signing_requests').select(['status', 'closed_at']).where('id', '=', r1).executeTakeFirstOrThrow();
    expect(old.status).toBe('vencida');
    expect(old.closed_at).not.toBeNull();
    expect(await t.db.selectFrom('seals').select('id').where('signing_request_id', '=', r1).execute()).toHaveLength(0);
  });

  it('spec07-2 hay como maximo una solicitud abierta aunque lleguen dos GET simultaneos', async () => {
    const m = await newMerchant();
    const a = await sell(m, '2026-10-06T15:00:00.000Z');
    await call(m, 'POST', '/days/2026-10-06/close', { counted_cash_minor: 1000, entry_ids: [a] });
    const [x, y] = await Promise.all([call(m, 'GET', '/signing/pending'), call(m, 'GET', '/signing/pending')]);
    expect(x.json().request.signing_request_id).toBe(y.json().request.signing_request_id);
    const open = await t.db.selectFrom('signing_requests').select('id').where('merchant_id', '=', m.merchantId).where('status', '=', 'abierta').execute();
    expect(open).toHaveLength(1);
  });

  it('spec03-5.5 con mas de 14 dias pendientes la solicitud toma los 14 mas viejos', async () => {
    const m = await newMerchant();
    for (let d = 1; d <= 16; d++) {
      await t.db.insertInto('business_days').values({ id: newId(), merchant_id: m.merchantId, business_date: `2026-09-${String(d).padStart(2, '0')}`, status: 'cerrado', counted_cash_minor: null, closed_at: new Date(clock), closed_by: null }).execute();
    }
    const pending = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(pending.items).toHaveLength(14);
    expect(pending.items[0].date).toBe('2026-09-01');
    expect(pending.items[13].date).toBe('2026-09-14');
  });

  it('una enmienda lleva prev_version, el motivo con los ids agregados y la raiz de todos los asientos', async () => {
    const m = await newMerchant();
    const e1 = await sell(m, '2026-10-03T15:00:00.000Z');
    await call(m, 'POST', '/days/2026-10-03/close', { counted_cash_minor: 1000, entry_ids: [e1] });
    const first = (await call(m, 'GET', '/signing/pending')).json().request;
    // simula que el sello 1 se confirmo (A-12) y llega un asiento tarde
    const day = await dayRow(m, '2026-10-03');
    await t.db.updateTable('seals').set({ status: 'confirmado', tx_hash: 'TX1', confirmed_at: new Date(clock) }).where('signing_request_id', '=', first.signing_request_id).execute();
    await t.db.updateTable('signing_requests').set({ status: 'firmada', closed_at: new Date(clock) }).where('id', '=', first.signing_request_id).execute();
    await t.db.updateTable('business_days').set({ status: 'sellado', current_seal_version: 1 }).where('id', '=', day!.id).execute();
    const late = await sell(m, '2026-10-03T19:00:00.000Z', 77); // DB-09: requiere_enmienda
    expect((await dayRow(m, '2026-10-03'))?.status).toBe('requiere_enmienda');
    preparer.calls.length = 0;
    const second = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(second.items).toEqual([{ date: '2026-10-03', entry_count: 2, is_amend: true }]);
    const item = preparer.calls[0]!.items[0]!;
    expect(item.amend?.prevVersion).toBe(1);
    expect(item.amend?.reasonHash.toString('hex')).toBe(Buffer.from(amendReasonHash([late])).toString('hex'));
    const seal = await t.db.selectFrom('seals').select(['version', 'amend_reason_hash']).where('signing_request_id', '=', second.signing_request_id).executeTakeFirstOrThrow();
    expect(seal.version).toBe(2);
  });

  it('con la cuenta Stellar sin lista los dias esperan (request null) y vender/cerrar sigue funcionando', async () => {
    const m = await newMerchant(false);
    const a = await sell(m, '2026-10-02T15:00:00.000Z');
    const res = await call(m, 'POST', '/days/2026-10-02/close', { counted_cash_minor: 1000, entry_ids: [a] });
    expect(res.statusCode).toBe(200);
    expect(res.json().signing_request_id).toBeUndefined();
    expect((await call(m, 'GET', '/signing/pending')).json()).toEqual({ request: null });
  });

  it('spec06-6 si Stellar no responde: el cierre queda hecho y GET /signing/pending responde 503 chain_unavailable', async () => {
    const m = await newMerchant();
    const a = await sell(m, '2026-10-01T15:00:00.000Z');
    preparer.fail = true;
    try {
      const res = await call(m, 'POST', '/days/2026-10-01/close', { counted_cash_minor: 1000, entry_ids: [a] });
      expect(res.statusCode).toBe(200);
      expect(res.json().signing_request_id).toBeUndefined();
      expect((await dayRow(m, '2026-10-01'))?.status).toBe('cerrado');
      const pend = await call(m, 'GET', '/signing/pending');
      expect(pend.statusCode).toBe(503);
      expect(pend.json().error.code).toBe('chain_unavailable');
      expect(await t.db.selectFrom('signing_requests').select('id').where('merchant_id', '=', m.merchantId).execute()).toHaveLength(0);
    } finally {
      preparer.fail = false;
    }
  });
});

describe('spec 06 §3.3: GET /days', () => {
  it('lista los dias con su estado, el numero de asientos y la version del sello', async () => {
    const m = await newMerchant();
    await sell(m, '2026-10-04T15:00:00.000Z');
    await sell(m, '2026-10-04T16:00:00.000Z');
    await sell(m, '2026-10-05T15:00:00.000Z');
    const all = (await call(m, 'GET', '/days')).json().days;
    expect(all).toEqual([
      { date: '2026-10-04', status: 'abierto', entry_count: 2, seal_version: 0 },
      { date: '2026-10-05', status: 'abierto', entry_count: 1, seal_version: 0 },
    ]);
    const range = (await call(m, 'GET', '/days?from=2026-10-05&to=2026-10-05')).json().days;
    expect(range).toHaveLength(1);
    expect((await call(m, 'GET', '/days?from=mal')).statusCode).toBe(400);
  });
});
