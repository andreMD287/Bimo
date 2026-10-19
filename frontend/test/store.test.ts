import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Asiento } from '../src/lib/tipos';
import { MemoryStore } from '../src/store/memory';
import { SqlStore, type SqlDriver, type SqlValue } from '../src/store/sql';
import type { Store, StoredChannel, StoredCustomer } from '../src/store/types';

function sqliteStore(): Store {
  const db = new DatabaseSync(':memory:');
  const driver: SqlDriver = {
    exec: (sql) => db.exec(sql),
    run: (sql, params: SqlValue[] = []) => void db.prepare(sql).run(...params),
    all: <T,>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
  };
  return new SqlStore(driver, (fn) => {
    db.exec('begin');
    try {
      const out = fn();
      db.exec('commit');
      return out;
    } catch (e) {
      db.exec('rollback');
      throw e;
    }
  });
}

const venta = (id: string, date = '2026-10-06', amount = 2000000): Asiento => ({
  id,
  business_date: date,
  occurred_at: `${date}T20:30:00.000Z`,
  kind: 'venta',
  origin: 'declarado',
  reverses_entry_id: null,
  note: null,
  lines: [
    { id: `${id}L1`, line_no: 1, account_code: 'caja', direction: 'debe', amount_minor: amount, currency: 'COP', channel: 'efectivo', customer_id: null },
    { id: `${id}L2`, line_no: 2, account_code: 'ventas', direction: 'haber', amount_minor: amount, currency: 'COP', channel: null, customer_id: null },
  ],
});
const cliente = (id: string, name: string, at: number): StoredCustomer => ({ id, display_name: name, phone: null, updated_at_ms: at });
const canal = (id: string, at: number, bps = 250): StoredChannel => ({
  id,
  nombre: 'Datafono Bold',
  channel: 'datafono_externo',
  comision_bps: bps,
  dias_consignacion: 2,
  activo: true,
  updated_at_ms: at,
});

for (const [name, make] of [
  ['MemoryStore', () => new MemoryStore() as Store],
  ['SqlStore (SQLite)', sqliteStore],
] as const) {
  describe(`spec 04 §2: base local — ${name}`, () => {
    it('spec04-2 registrar un asiento es una sola transaccion: asiento, lineas, dia abierto y fila del outbox', () => {
      const s = make();
      expect(s.addEntry(venta('A1'), { canal_ids: ['c1'] }, 'local')).toBe(true);
      const snap = s.snapshot();
      expect(snap.entries).toHaveLength(1);
      expect(snap.entries[0]).toMatchObject({ sync_status: 'pendiente', reject_code: null, meta: { canal_ids: ['c1'] } });
      expect(snap.entries[0]?.asiento.lines).toHaveLength(2);
      expect(snap.entries[0]?.asiento.lines[0]).toMatchObject({ account_code: 'caja', amount_minor: 2000000, channel: 'efectivo' });
      expect(snap.days).toEqual([expect.objectContaining({ business_date: '2026-10-06', status: 'abierto' })]);
      expect(s.outbox(0, 10)).toEqual([expect.objectContaining({ entity: 'entry', entity_id: 'A1', attempts: 0 })]);
    });

    it('spec04-2 si algo falla a mitad, o queda todo o no queda nada (sin asiento, sin lineas y sin outbox)', () => {
      const s = make();
      const bad = venta('B1');
      bad.lines[1]!.line_no = 1; // line_no repetido: la base lo rechaza
      expect(() => s.addEntry(bad, null, 'local')).toThrow();
      expect(s.snapshot().entries).toHaveLength(0);
      expect(s.snapshot().days).toHaveLength(0);
      expect(s.outbox(0, 10)).toHaveLength(0);
      expect(() =>
        s.transaction(() => {
          s.addEntry(venta('B2'), null, 'local');
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(s.snapshot().entries).toHaveLength(0);
      expect(s.outbox(0, 10)).toHaveLength(0);
    });

    it('un asiento repetido no se duplica; los que vienen del servidor no entran al outbox', () => {
      const s = make();
      s.addEntry(venta('C1'), null, 'local');
      expect(s.addEntry(venta('C1'), null, 'local')).toBe(false);
      expect(s.addEntry(venta('C2'), null, 'remote')).toBe(true);
      expect(s.snapshot().entries.map((e) => [e.asiento.id, e.sync_status])).toEqual([
        ['C1', 'pendiente'],
        ['C2', 'sincronizado'],
      ]);
      expect(s.outbox(0, 10).map((o) => o.entity_id)).toEqual(['C1']);
    });

    it('D-1 y D-9: el primer asiento crea el dia abierto y uno nuevo en un dia sellado lo pasa a requiere_enmienda', () => {
      const s = make();
      s.addEntry(venta('D1', '2026-10-06'), null, 'local');
      s.upsertDay('2026-10-06', { status: 'sellado', sellos: [{ version: 1, status: 'confirmado', tx_hash: 'TX' }] });
      s.addEntry(venta('D2', '2026-10-06'), null, 'local');
      const d = s.snapshot().days[0];
      expect(d).toMatchObject({ status: 'requiere_enmienda' });
      expect(d?.sellos).toEqual([{ version: 1, status: 'confirmado', tx_hash: 'TX' }]);
    });

    it('clientes y canales: gana la ultima edicion; lo local se encola y lo remoto no', () => {
      const s = make();
      expect(s.upsertCustomer(cliente('K1', 'Rosa', 100), 'local')).toBe(true);
      expect(s.upsertCustomer(cliente('K1', 'Rosa vieja', 50), 'remote')).toBe(false);
      expect(s.upsertCustomer(cliente('K1', 'Rosa Perez', 200), 'remote')).toBe(true);
      expect(s.snapshot().customers).toEqual([expect.objectContaining({ id: 'K1', display_name: 'Rosa Perez', updated_at_ms: 200 })]);
      expect(s.upsertChannel(canal('H1', 10), 'local')).toBe(true);
      expect(s.upsertChannel(canal('H1', 5, 999), 'remote')).toBe(false);
      expect(s.snapshot().channels[0]).toMatchObject({ id: 'H1', comision_bps: 250, activo: true });
      expect(s.outbox(0, 10).map((o) => `${o.entity}:${o.entity_id}`)).toEqual(['customer:K1', 'channel:H1']);
    });

    it('outbox: FIFO, un fallo al frente detiene a los demas hasta su turno, y completar lo saca', () => {
      const s = make();
      s.addEntry(venta('E1'), null, 'local');
      s.addEntry(venta('E2'), null, 'local');
      const [a, b] = s.outbox(0, 10);
      expect([a?.entity_id, b?.entity_id]).toEqual(['E1', 'E2']);
      s.retryOutbox(a!.seq, 'sin red', 5000);
      expect(s.outbox(1000, 10)).toEqual([]);
      const later = s.outbox(5000, 10);
      expect(later.map((o) => o.entity_id)).toEqual(['E1', 'E2']);
      expect(later[0]).toMatchObject({ attempts: 1, last_error: 'sin red' });
      s.completeOutbox(a!.seq);
      expect(s.outbox(5000, 10).map((o) => o.entity_id)).toEqual(['E2']);
    });

    it('sincronizado / rechazado: un rechazado nunca se borra', () => {
      const s = make();
      s.addEntry(venta('F1'), null, 'local');
      s.addEntry(venta('F2'), null, 'local');
      s.markEntrySynced('F1');
      s.markEntryRejected('F2', 'unbalanced');
      expect(s.snapshot().entries.map((e) => [e.asiento.id, e.sync_status, e.reject_code])).toEqual([
        ['F1', 'sincronizado', null],
        ['F2', 'rechazado', 'unbalanced'],
      ]);
    });

    it('enqueueClose encola una sola vez por dia, despues de los asientos que ya estaban', () => {
      const s = make();
      s.addEntry(venta('G1'), null, 'local');
      s.enqueueClose('2026-10-06');
      s.enqueueClose('2026-10-06');
      s.addEntry(venta('G2', '2026-10-07'), null, 'local');
      expect(s.outbox(0, 10).map((o) => `${o.entity}:${o.entity_id}`)).toEqual(['entry:G1', 'close:2026-10-06', 'entry:G2']);
    });

    it('estado de sincronizacion y reset', () => {
      const s = make();
      expect(s.getSync()).toEqual({ pull_cursor: 0, last_push_at: null, last_pull_at: null, clock_skew_ms: 0 });
      s.setSync({ pull_cursor: 42, clock_skew_ms: -1500 });
      s.setSync({ last_pull_at: 99 });
      expect(s.getSync()).toEqual({ pull_cursor: 42, last_push_at: null, last_pull_at: 99, clock_skew_ms: -1500 });
      s.addEntry(venta('H1'), null, 'local');
      s.reset();
      expect(s.snapshot()).toMatchObject({ entries: [], customers: [], channels: [], days: [], sync: { pull_cursor: 0 } });
      expect(s.outbox(0, 10)).toEqual([]);
    });
  });
}

describe('las dos implementaciones se comportan igual', () => {
  it('la misma secuencia de operaciones deja el mismo estado', () => {
    const run = (s: Store) => {
      s.addEntry(venta('Z1'), { canal_ids: ['a'] }, 'local');
      s.addEntry(venta('Z2', '2026-10-07'), null, 'remote');
      s.upsertCustomer(cliente('K', 'Rosa', 1), 'local');
      s.upsertChannel(canal('H', 2), 'remote');
      s.upsertDay('2026-10-06', { status: 'cerrado', counted_cash_minor: 100, closed_at: '2026-10-06T22:00:00.000Z' });
      s.enqueueClose('2026-10-06');
      s.markEntrySynced('Z1');
      return { snap: s.snapshot(), outbox: s.outbox(0, 50).map((r) => ({ entity: r.entity, entity_id: r.entity_id, attempts: r.attempts })) };
    };
    expect(run(sqliteStore())).toEqual(run(new MemoryStore()));
  });
});
