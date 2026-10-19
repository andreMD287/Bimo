import { describe, expect, it } from 'vitest';
import { ApiError, type PullChange, type PushItem, type PushResult } from '../src/api/client';
import { createAuth } from '../src/auth/otp';
import { memoryKv } from '../src/kv';
import type { Asiento } from '../src/lib/tipos';
import { cargarFirmante } from '../src/signer';
import { MemoryStore } from '../src/store/memory';
import { pullAll, pushOutbox, syncAll, type SyncDeps } from '../src/sync/engine';
import { p256 } from '@noble/curves/nist.js';

const venta = (id: string, date = '2026-10-06', amount = 1000): Asiento => ({
  id, business_date: date, occurred_at: `${date}T20:30:00.000Z`, kind: 'venta', origin: 'declarado', reverses_entry_id: null, note: null,
  lines: [
    { id: `${id}L1`, line_no: 1, account_code: 'caja', direction: 'debe', amount_minor: amount, currency: 'COP', channel: 'efectivo', customer_id: null },
    { id: `${id}L2`, line_no: 2, account_code: 'ventas', direction: 'haber', amount_minor: amount, currency: 'COP', channel: null, customer_id: null },
  ],
});

function fakeApi() {
  const calls: string[] = [];
  const state = {
    network: true,
    pushResult: (i: PushItem): PushResult => ({ type: i.type, id: i.data.id as string, result: 'accepted', business_date: '2026-10-06', day_status: 'abierto' }),
    pages: [] as Array<{ changes: PullChange[]; next_cursor: number; has_more: boolean }>,
    closeError: null as ApiError | null,
  };
  const api: SyncDeps['api'] = {
    push: async (items) => {
      calls.push(`push:${items.map((i) => `${i.type}:${i.data.id}`).join(',')}`);
      if (!state.network) throw new ApiError(0, 'network');
      return { results: items.map(state.pushResult), clock_skew_ms: 1234 };
    },
    pull: async (cursor) => {
      calls.push(`pull:${cursor}`);
      if (!state.network) throw new ApiError(0, 'network');
      return state.pages.shift() ?? { changes: [], next_cursor: cursor, has_more: false };
    },
    closeDay: async (date, body) => {
      calls.push(`close:${date}:${body.entry_ids.join(',')}:${body.counted_cash_minor}`);
      if (!state.network) throw new ApiError(0, 'network');
      if (state.closeError) throw state.closeError;
      return { status: 'cerrado' };
    },
  };
  return { api, calls, state };
}

describe('spec 04 §5: push', () => {
  it('sube asientos y clientes en orden; aceptados quedan sincronizados y salen del outbox', async () => {
    const store = new MemoryStore();
    store.upsertCustomer({ id: 'K1', display_name: 'Rosa', phone: null, updated_at_ms: 5 }, 'local');
    store.addEntry(venta('A1'), null, 'local');
    const { api, calls } = fakeApi();
    const r = await pushOutbox({ store, api, deviceId: 'D1', now: () => 1000 });
    expect(r).toMatchObject({ online: true, pushed: 2, rejected: 0, clockSkewMs: 1234 });
    expect(calls).toEqual(['push:customer:K1,entry:A1']);
    expect(store.outbox(1000, 10)).toEqual([]);
    expect(store.snapshot().entries[0]?.sync_status).toBe('sincronizado');
    expect(store.getSync().clock_skew_ms).toBe(1234);
  });

  it('spec04-5.2 un rechazado queda rechazado con su codigo, nunca se reintenta y no bloquea a los demas', async () => {
    const store = new MemoryStore();
    store.addEntry(venta('B1'), null, 'local');
    store.addEntry(venta('B2'), null, 'local');
    const { api, state } = fakeApi();
    state.pushResult = (i) => (i.data.id === 'B1' ? { type: 'entry', id: 'B1', result: 'rejected', code: 'unbalanced' } : { type: 'entry', id: 'B2', result: 'accepted' });
    const r = await pushOutbox({ store, api, deviceId: 'D1', now: () => 1000 });
    expect(r).toMatchObject({ pushed: 1, rejected: 1 });
    expect(store.snapshot().entries.map((e) => [e.asiento.id, e.sync_status, e.reject_code])).toEqual([['B1', 'rechazado', 'unbalanced'], ['B2', 'sincronizado', null]]);
    expect(store.outbox(9e9, 10)).toEqual([]);
  });

  it('spec04-3.2 sin red nada se pierde: queda en el outbox con backoff y el siguiente intento lo sube (sin duplicar)', async () => {
    const store = new MemoryStore();
    store.addEntry(venta('C1'), null, 'local');
    const { api, state, calls } = fakeApi();
    state.network = false;
    const r1 = await pushOutbox({ store, api, deviceId: 'D1', now: () => 1000 });
    expect(r1.online).toBe(false);
    const [row] = store.outbox(9e9, 10);
    expect(row).toMatchObject({ entity_id: 'C1', attempts: 1, last_error: 'network', next_attempt_at: 2000 });
    expect(store.outbox(1500, 10)).toEqual([]); // espera su turno
    state.network = true;
    await pushOutbox({ store, api, deviceId: 'D1', now: () => 2500 });
    expect(store.snapshot().entries[0]?.sync_status).toBe('sincronizado');
    expect(calls.filter((c) => c.startsWith('push:entry:C1'))).toHaveLength(2);
  });

  it('dependency_failed deja el item pendiente para reintentarlo despues', async () => {
    const store = new MemoryStore();
    store.addEntry(venta('D1'), null, 'local');
    const { api, state } = fakeApi();
    state.pushResult = (i) => ({ type: i.type, id: i.data.id as string, result: 'dependency_failed' });
    await pushOutbox({ store, api, deviceId: 'D1', now: () => 1000 });
    expect(store.outbox(9e9, 10)).toHaveLength(1);
    expect(store.snapshot().entries[0]?.sync_status).toBe('pendiente');
  });

  it('spec04-6 el cierre se envia despues de los asientos de su dia, con sus ids y el efectivo contado', async () => {
    const store = new MemoryStore();
    store.addEntry(venta('E1'), null, 'local');
    store.addEntry(venta('E2'), null, 'local');
    store.upsertDay('2026-10-06', { status: 'cerrado', counted_cash_minor: 2000 });
    store.enqueueClose('2026-10-06');
    store.addEntry(venta('E3', '2026-10-07'), null, 'local');
    const { api, calls } = fakeApi();
    await pushOutbox({ store, api, deviceId: 'D1', now: () => 1000 });
    expect(calls).toEqual(['push:entry:E1,entry:E2', 'close:2026-10-06:E1,E2:2000', 'push:entry:E3']);
    expect(store.outbox(1000, 10)).toEqual([]);
  });

  it('un cierre sin red se reintenta; day_not_closable (ya estaba cerrado) cuenta como hecho', async () => {
    const store = new MemoryStore();
    store.addEntry(venta('F1'), null, 'local');
    store.enqueueClose('2026-10-06');
    const { api, state } = fakeApi();
    await pushOutbox({ store, api, deviceId: 'D1', now: () => 1000 });
    // ya salio; ahora simulamos otro dia con red caida y luego ya cerrado
    store.addEntry(venta('F2', '2026-10-08'), null, 'local');
    store.enqueueClose('2026-10-08');
    state.network = false;
    expect((await pushOutbox({ store, api, deviceId: 'D1', now: () => 2000 })).online).toBe(false);
    state.network = true;
    state.closeError = new ApiError(409, 'day_not_closable');
    await pushOutbox({ store, api, deviceId: 'D1', now: () => 9e6 });
    expect(store.outbox(9e9, 10)).toEqual([]);
  });
});

describe('spec 04 §8: pull', () => {
  const entryChange = (seq: number, id: string): PullChange => ({
    seq, entity: 'entry',
    data: { id, business_date: '2026-10-06', occurred_at: '2026-10-06T20:30:00.000Z', kind: 'venta', origin: 'verificado', reverses_entry_id: null, note: null, lines: venta(id).lines },
  });

  it('aplica cada pagina en una transaccion con su cursor; repetir una pagina no duplica nada', async () => {
    const store = new MemoryStore();
    const { api, state } = fakeApi();
    state.pages = [
      { changes: [entryChange(1, 'R1'), { seq: 2, entity: 'customer', data: { id: 'K1', display_name: 'Rosa', phone: null, created_at: '2026-10-06T10:00:00.000Z', updated_at: '2026-10-06T10:00:00.000Z' } }], next_cursor: 2, has_more: true },
      { changes: [{ seq: 3, entity: 'day', data: { business_date: '2026-10-06', status: 'cerrado', counted_cash_minor: 100 } }], next_cursor: 3, has_more: false },
    ];
    const r = await pullAll({ store, api, deviceId: 'D1', now: () => 7 });
    expect(r).toEqual({ online: true, pulled: 3 });
    const snap = store.snapshot();
    expect(snap.entries.map((e) => [e.asiento.id, e.sync_status, e.asiento.origin])).toEqual([['R1', 'sincronizado', 'verificado']]);
    expect(snap.customers[0]).toMatchObject({ id: 'K1', display_name: 'Rosa' });
    expect(snap.days[0]).toMatchObject({ status: 'cerrado', counted_cash_minor: 100 });
    expect(snap.sync).toMatchObject({ pull_cursor: 3, last_pull_at: 7 });
    // la misma pagina otra vez (la app se cerro antes de guardar el cursor)
    state.pages = [{ changes: [entryChange(1, 'R1')], next_cursor: 3, has_more: false }];
    await pullAll({ store, api, deviceId: 'D1' });
    expect(store.snapshot().entries).toHaveLength(1);
    expect(store.outbox(9e9, 10)).toEqual([]); // lo que viene del servidor no se vuelve a subir
  });

  it('un sello preparado marca la firma pendiente con su solicitud; uno confirmado trae el tx_hash', async () => {
    const store = new MemoryStore();
    const { api, state } = fakeApi();
    state.pages = [{ changes: [{ seq: 1, entity: 'seal', data: { business_date: '2026-10-06', version: 1, status: 'preparado', signing_request_id: 'SR1' } }], next_cursor: 1, has_more: false }];
    await pullAll({ store, api, deviceId: 'D1' });
    expect(store.snapshot().days[0]).toMatchObject({ pending_signature: true, signing_request_id: 'SR1', seal_status: 'preparado' });
    state.pages = [{ changes: [{ seq: 2, entity: 'seal', data: { business_date: '2026-10-06', version: 1, status: 'confirmado', tx_hash: 'TXABC' } }, { seq: 3, entity: 'day', data: { business_date: '2026-10-06', status: 'sellado', counted_cash_minor: null } }], next_cursor: 3, has_more: false }];
    await pullAll({ store, api, deviceId: 'D1' });
    expect(store.snapshot().days[0]).toMatchObject({ status: 'sellado', pending_signature: false, signing_request_id: null, sellos: [{ version: 1, status: 'confirmado', tx_hash: 'TXABC' }] });
  });

  it('sin red syncAll informa que no hay conexion y no pierde el outbox', async () => {
    const store = new MemoryStore();
    store.addEntry(venta('G1'), null, 'local');
    const { api, state } = fakeApi();
    state.network = false;
    const r = await syncAll({ store, api, deviceId: 'D1', now: () => 1 });
    expect(r.online).toBe(false);
    expect(store.outbox(9e9, 10)).toHaveLength(1);
  });
});

describe('firmante y sesion', () => {
  it('spec03-6 la llave P-256 de software se crea una vez, se guarda y firma SHA-256(mensaje) en low-S', () => {
    const kv = memoryKv();
    const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255);
    const f1 = cargarFirmante(kv, bytes);
    const f2 = cargarFirmante(kv, () => { throw new Error('no debe pedir otra llave'); });
    expect(Buffer.from(f1.publicKey()).equals(Buffer.from(f2.publicKey()))).toBe(true);
    expect(f1.publicKey()).toHaveLength(65);
    const msg = new TextEncoder().encode('reto');
    const sig = f1.sign(msg);
    expect(sig).toHaveLength(64);
    expect(p256.verify(sig, msg, f1.publicKey(), { prehash: true })).toBe(true);
    expect(p256.verify(sig, msg, f1.publicKey(), { prehash: true, lowS: true })).toBe(true);
  });

  it('spec06-2 el codigo por correo: envia, verifica, guarda la sesion y la renueva antes de vencer', async () => {
    const kv = memoryKv();
    let t = 1_000_000;
    const reqs: string[] = [];
    const fetchImpl = (async (url: string, init: { body: string }) => {
      reqs.push(`${url.split('/auth/v1')[1]} ${init.body}`);
      if (url.endsWith('/otp')) return { ok: true, status: 200, json: async () => ({}) };
      const exp = Math.floor(t / 1000) + 3600;
      return { ok: true, status: 200, json: async () => ({ access_token: `jwt-${reqs.length}`, refresh_token: 'r', expires_at: exp, user: { id: 'U1' } }) };
    }) as unknown as typeof fetch;
    const auth = createAuth({ supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', kv, now: () => t, fetchImpl });
    await auth.sendCode('marta@ejemplo.co');
    const s = await auth.verifyCode('marta@ejemplo.co', '123456');
    expect(s).toMatchObject({ user_id: 'U1', email: 'marta@ejemplo.co' });
    expect(await auth.getToken()).toBe('jwt-2');
    t += 3550_000; // faltan 50 s para vencer
    expect(await auth.getToken()).toBe('jwt-3'); // renovado con refresh_token
    expect(reqs[0]).toContain('/otp');
    expect(reqs[2]).toContain('refresh_token');
    auth.signOut();
    expect(await auth.getToken()).toBeNull();
  });
});
