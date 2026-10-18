import type { Asiento, BusinessDate, CanalConfig, ChannelCode, Linea } from '../lib/tipos';
import {
  EMPTY_SYNC,
  emptyDay,
  type MetaAsiento,
  type OutboxEntity,
  type OutboxRow,
  type Snapshot,
  type Store,
  type StoredChannel,
  type StoredCustomer,
  type StoredDay,
  type StoredEntry,
  type SyncState,
  type SyncStatus,
} from './types';

export type SqlValue = string | number | null;

/** Lo minimo que la base local necesita de un motor SQLite. expo-sqlite (sincrono) en el celular; node:sqlite en pruebas. */
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): void;
  all<T>(sql: string, params?: SqlValue[]): T[];
}

/** Migraciones de la base local (spec 04 §2). Cada una corre una vez, en orden. */
const MIGRATIONS: string[] = [
  `
  create table local_entries (
    id text primary key, business_date text not null, occurred_at text not null, kind text not null, origin text not null,
    reverses_entry_id text, note text, sync_status text not null, reject_code text, created_on_device integer not null,
    meta_json text
  );
  create table local_lines (
    id text primary key, entry_id text not null references local_entries(id), line_no integer not null, account_code text not null,
    direction text not null, amount_minor integer not null, currency text not null, channel text, customer_id text,
    unique (entry_id, line_no)
  );
  create index local_entries_day on local_entries (business_date);
  create table local_customers (id text primary key, display_name text not null, phone text, updated_at_ms integer not null, sync_status text not null);
  create table local_channels (
    id text primary key, name text not null, channel text not null, commission_bps integer not null, settlement_days integer not null,
    active integer not null, updated_at_ms integer not null
  );
  create table local_days (
    business_date text primary key, status text not null, counted_cash_minor integer, closed_at text, seal_status text,
    pending_signature integer not null default 0, signing_request_id text, sellos_json text not null default '[]'
  );
  create table outbox (
    seq integer primary key autoincrement, entity text not null, entity_id text not null, attempts integer not null default 0,
    next_attempt_at integer not null default 0, last_error text
  );
  create table sync_state (
    id integer primary key check (id = 1), pull_cursor integer not null, last_push_at integer, last_pull_at integer, clock_skew_ms integer not null
  );
  insert into sync_state (id, pull_cursor, clock_skew_ms) values (1, 0, 0);
  `,
];

interface EntryRow {
  id: string; business_date: string; occurred_at: string; kind: Asiento['kind']; origin: Asiento['origin'];
  reverses_entry_id: string | null; note: string | null; sync_status: SyncStatus; reject_code: string | null; meta_json: string | null;
}
interface LineRow {
  id: string; entry_id: string; line_no: number; account_code: Linea['account_code']; direction: Linea['direction'];
  amount_minor: number; currency: Linea['currency']; channel: ChannelCode | null; customer_id: string | null;
}
interface DayRow {
  business_date: string; status: StoredDay['status']; counted_cash_minor: number | null; closed_at: string | null; seal_status: string | null;
  pending_signature: number; signing_request_id: string | null; sellos_json: string;
}

export class SqlStore implements Store {
  readonly kind = 'sqlite' as const;
  private depth = 0;

  constructor(
    private readonly db: SqlDriver,
    /** Hacen falta para que `transaction` sea atomica en el motor. */
    private readonly tx: <T>(fn: () => T) => T,
  ) {
    this.migrate();
  }

  private migrate() {
    const row = this.db.all<{ user_version: number }>('pragma user_version')[0];
    let v = row?.user_version ?? 0;
    for (; v < MIGRATIONS.length; v++) {
      const sql = MIGRATIONS[v] as string;
      this.tx(() => {
        this.db.exec(sql);
        this.db.exec(`pragma user_version = ${v + 1}`);
      });
    }
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth += 1;
    try {
      return this.tx(fn);
    } finally {
      this.depth -= 1;
    }
  }

  snapshot(): Snapshot {
    const entries = this.db.all<EntryRow>('select * from local_entries order by occurred_at, id');
    const lines = this.db.all<LineRow>('select * from local_lines order by entry_id, line_no');
    const byEntry = new Map<string, Linea[]>();
    for (const l of lines) {
      const arr = byEntry.get(l.entry_id) ?? [];
      arr.push({ id: l.id, line_no: l.line_no, account_code: l.account_code, direction: l.direction, amount_minor: l.amount_minor, currency: l.currency, channel: l.channel, customer_id: l.customer_id });
      byEntry.set(l.entry_id, arr);
    }
    return {
      entries: entries.map<StoredEntry>((e) => ({
        asiento: { id: e.id, business_date: e.business_date, occurred_at: e.occurred_at, kind: e.kind, origin: e.origin, reverses_entry_id: e.reverses_entry_id, note: e.note, lines: byEntry.get(e.id) ?? [] },
        meta: e.meta_json ? (JSON.parse(e.meta_json) as MetaAsiento) : null,
        sync_status: e.sync_status,
        reject_code: e.reject_code,
      })),
      customers: this.db.all<{ id: string; display_name: string; phone: string | null; updated_at_ms: number }>('select id, display_name, phone, updated_at_ms from local_customers order by display_name'),
      channels: this.db
        .all<{ id: string; name: string; channel: ChannelCode; commission_bps: number; settlement_days: number; active: number; updated_at_ms: number }>('select * from local_channels order by rowid')
        .map<StoredChannel>((c) => ({ id: c.id, nombre: c.name, channel: c.channel, comision_bps: c.commission_bps, dias_consignacion: c.settlement_days, activo: c.active === 1, updated_at_ms: c.updated_at_ms })),
      days: this.db.all<DayRow>('select * from local_days order by business_date').map<StoredDay>((d) => ({
        business_date: d.business_date, status: d.status, counted_cash_minor: d.counted_cash_minor, closed_at: d.closed_at, seal_status: d.seal_status,
        pending_signature: d.pending_signature === 1, signing_request_id: d.signing_request_id, sellos: JSON.parse(d.sellos_json) as StoredDay['sellos'],
      })),
      sync: this.getSync(),
    };
  }

  private enqueue(entity: OutboxEntity, entityId: string) {
    this.db.run('insert into outbox (entity, entity_id) values (?, ?)', [entity, entityId]);
  }

  private ensureDay(date: BusinessDate) {
    this.db.run('insert or ignore into local_days (business_date, status) values (?, ?)', [date, 'abierto']);
  }

  addEntry(a: Asiento, meta: MetaAsiento | null, origin: 'local' | 'remote'): boolean {
    return this.transaction(() => {
      if (this.db.all('select 1 as x from local_entries where id = ?', [a.id]).length > 0) return false;
      this.db.run(
        'insert into local_entries (id, business_date, occurred_at, kind, origin, reverses_entry_id, note, sync_status, created_on_device, meta_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [a.id, a.business_date, a.occurred_at, a.kind, a.origin, a.reverses_entry_id, a.note, origin === 'local' ? 'pendiente' : 'sincronizado', origin === 'local' ? 1 : 0, meta ? JSON.stringify(meta) : null],
      );
      for (const l of a.lines) {
        this.db.run(
          'insert into local_lines (id, entry_id, line_no, account_code, direction, amount_minor, currency, channel, customer_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [l.id, a.id, l.line_no, l.account_code, l.direction, l.amount_minor, l.currency, l.channel, l.customer_id],
        );
      }
      this.ensureDay(a.business_date);
      // DB-09 / D-9 tambien en el celular
      this.db.run("update local_days set status = 'requiere_enmienda' where business_date = ? and status = 'sellado'", [a.business_date]);
      if (origin === 'local') this.enqueue('entry', a.id);
      return true;
    });
  }

  markEntrySynced(id: string) {
    this.db.run("update local_entries set sync_status = 'sincronizado', reject_code = null where id = ?", [id]);
  }

  markEntryRejected(id: string, code: string) {
    this.db.run("update local_entries set sync_status = 'rechazado', reject_code = ? where id = ?", [code, id]);
  }

  upsertCustomer(c: StoredCustomer, origin: 'local' | 'remote'): boolean {
    return this.transaction(() => {
      const cur = this.db.all<{ updated_at_ms: number }>('select updated_at_ms from local_customers where id = ?', [c.id])[0];
      if (cur && cur.updated_at_ms >= c.updated_at_ms && origin === 'remote') return false;
      this.db.run(
        'insert into local_customers (id, display_name, phone, updated_at_ms, sync_status) values (?, ?, ?, ?, ?) on conflict(id) do update set display_name = excluded.display_name, phone = excluded.phone, updated_at_ms = excluded.updated_at_ms, sync_status = excluded.sync_status',
        [c.id, c.display_name, c.phone, c.updated_at_ms, origin === 'local' ? 'pendiente' : 'sincronizado'],
      );
      if (origin === 'local') this.enqueue('customer', c.id);
      return true;
    });
  }

  upsertChannel(c: StoredChannel, origin: 'local' | 'remote'): boolean {
    return this.transaction(() => {
      const cur = this.db.all<{ updated_at_ms: number }>('select updated_at_ms from local_channels where id = ?', [c.id])[0];
      if (cur && cur.updated_at_ms >= c.updated_at_ms && origin === 'remote') return false;
      this.db.run(
        'insert into local_channels (id, name, channel, commission_bps, settlement_days, active, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set name = excluded.name, channel = excluded.channel, commission_bps = excluded.commission_bps, settlement_days = excluded.settlement_days, active = excluded.active, updated_at_ms = excluded.updated_at_ms',
        [c.id, c.nombre, c.channel, c.comision_bps, c.dias_consignacion, c.activo ? 1 : 0, c.updated_at_ms],
      );
      if (origin === 'local') this.enqueue('channel', c.id);
      return true;
    });
  }

  upsertDay(date: BusinessDate, patch: Partial<Omit<StoredDay, 'business_date'>>) {
    this.transaction(() => {
      this.ensureDay(date);
      const cur = this.snapshotDay(date) ?? emptyDay(date);
      const d: StoredDay = { ...cur, ...patch };
      this.db.run(
        'update local_days set status = ?, counted_cash_minor = ?, closed_at = ?, seal_status = ?, pending_signature = ?, signing_request_id = ?, sellos_json = ? where business_date = ?',
        [d.status, d.counted_cash_minor, d.closed_at, d.seal_status, d.pending_signature ? 1 : 0, d.signing_request_id, JSON.stringify(d.sellos), date],
      );
    });
  }

  private snapshotDay(date: BusinessDate): StoredDay | undefined {
    return this.snapshot().days.find((d) => d.business_date === date);
  }

  enqueueClose(date: BusinessDate) {
    this.transaction(() => {
      if (this.db.all("select 1 as x from outbox where entity = 'close' and entity_id = ?", [date]).length === 0) this.enqueue('close', date);
    });
  }

  outbox(nowMs: number, limit: number): OutboxRow[] {
    const first = this.db.all<OutboxRow>('select * from outbox order by seq limit 1')[0];
    if (!first || first.next_attempt_at > nowMs) return [];
    return this.db.all<OutboxRow>('select * from outbox where next_attempt_at <= ? order by seq limit ?', [nowMs, limit]);
  }

  completeOutbox(seq: number) {
    this.db.run('delete from outbox where seq = ?', [seq]);
  }

  retryOutbox(seq: number, error: string, nextAttemptAt: number) {
    this.db.run('update outbox set attempts = attempts + 1, last_error = ?, next_attempt_at = ? where seq = ?', [error, nextAttemptAt, seq]);
  }

  getSync(): SyncState {
    const r = this.db.all<SyncState>('select pull_cursor, last_push_at, last_pull_at, clock_skew_ms from sync_state where id = 1')[0];
    return r ?? { ...EMPTY_SYNC };
  }

  setSync(patch: Partial<SyncState>) {
    const s = { ...this.getSync(), ...patch };
    this.db.run('update sync_state set pull_cursor = ?, last_push_at = ?, last_pull_at = ?, clock_skew_ms = ? where id = 1', [s.pull_cursor, s.last_push_at, s.last_pull_at, s.clock_skew_ms]);
  }

  reset() {
    this.transaction(() => {
      for (const t of ['local_lines', 'local_entries', 'local_customers', 'local_channels', 'local_days', 'outbox']) this.db.exec(`delete from ${t}`);
      this.db.exec('update sync_state set pull_cursor = 0, last_push_at = null, last_pull_at = null, clock_skew_ms = 0 where id = 1');
    });
  }
}

export type { CanalConfig };
