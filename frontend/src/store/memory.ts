import type { Asiento, BusinessDate } from '../lib/tipos';
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
} from './types';

/** Estado completo serializable (para persistirlo en localStorage en la web). */
export interface MemoryState {
  entries: StoredEntry[];
  customers: StoredCustomer[];
  channels: StoredChannel[];
  days: StoredDay[];
  outbox: OutboxRow[];
  nextSeq: number;
  sync: SyncState;
}

const fresh = (): MemoryState => ({ entries: [], customers: [], channels: [], days: [], outbox: [], nextSeq: 1, sync: { ...EMPTY_SYNC } });

/**
 * Base local en memoria (web y pruebas). `onChange` recibe el estado despues de cada transaccion para persistirlo.
 * La transaccion copia el estado y lo restaura si `fn` lanza.
 */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private s: MemoryState;
  private depth = 0;

  constructor(
    initial?: MemoryState,
    private readonly onChange?: (s: MemoryState) => void,
  ) {
    this.s = initial ?? fresh();
  }

  private commit() {
    if (this.depth === 0) this.onChange?.(this.s);
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    const backup = structuredClone(this.s);
    this.depth += 1;
    try {
      const out = fn();
      this.depth -= 1;
      this.commit();
      return out;
    } catch (e) {
      this.depth -= 1;
      this.s = backup;
      throw e;
    }
  }

  snapshot(): Snapshot {
    return structuredClone({ entries: this.s.entries, customers: this.s.customers, channels: this.s.channels, days: this.s.days, sync: this.s.sync });
  }

  private enqueue(entity: OutboxEntity, entityId: string) {
    this.s.outbox.push({ seq: this.s.nextSeq++, entity, entity_id: entityId, attempts: 0, next_attempt_at: 0, last_error: null });
  }

  private touchDay(date: BusinessDate): StoredDay {
    let d = this.s.days.find((x) => x.business_date === date);
    if (!d) {
      d = emptyDay(date);
      this.s.days.push(d);
      this.s.days.sort((a, b) => a.business_date.localeCompare(b.business_date));
    }
    return d;
  }

  addEntry(a: Asiento, meta: MetaAsiento | null, origin: 'local' | 'remote'): boolean {
    return this.transaction(() => {
      if (this.s.entries.some((e) => e.asiento.id === a.id)) return false;
      // mismas restricciones que SQLite: no se repiten ids de linea ni line_no dentro del asiento
      if (new Set(a.lines.map((l) => l.id)).size !== a.lines.length || new Set(a.lines.map((l) => l.line_no)).size !== a.lines.length) {
        throw new Error('lineas repetidas');
      }
      this.s.entries.push({ asiento: structuredClone(a), meta, sync_status: origin === 'local' ? 'pendiente' : 'sincronizado', reject_code: null });
      const day = this.touchDay(a.business_date);
      // DB-09 / D-9 tambien en el celular: un asiento en un dia sellado lo pasa a requiere_enmienda
      if (day.status === 'sellado') day.status = 'requiere_enmienda';
      if (origin === 'local') this.enqueue('entry', a.id);
      return true;
    });
  }

  markEntrySynced(id: string) {
    const e = this.s.entries.find((x) => x.asiento.id === id);
    if (e) {
      e.sync_status = 'sincronizado';
      e.reject_code = null;
    }
    this.commit();
  }

  markEntryRejected(id: string, code: string) {
    const e = this.s.entries.find((x) => x.asiento.id === id);
    if (e) {
      e.sync_status = 'rechazado';
      e.reject_code = code;
    }
    this.commit();
  }

  upsertCustomer(c: StoredCustomer, origin: 'local' | 'remote'): boolean {
    return this.transaction(() => {
      const cur = this.s.customers.find((x) => x.id === c.id);
      if (cur && cur.updated_at_ms >= c.updated_at_ms && origin === 'remote') return false;
      if (cur) Object.assign(cur, c);
      else this.s.customers.push({ ...c });
      if (origin === 'local') this.enqueue('customer', c.id);
      return true;
    });
  }

  upsertChannel(c: StoredChannel, origin: 'local' | 'remote'): boolean {
    return this.transaction(() => {
      const cur = this.s.channels.find((x) => x.id === c.id);
      if (cur && cur.updated_at_ms >= c.updated_at_ms && origin === 'remote') return false;
      if (cur) Object.assign(cur, c);
      else this.s.channels.push({ ...c });
      if (origin === 'local') this.enqueue('channel', c.id);
      return true;
    });
  }

  upsertDay(date: BusinessDate, patch: Partial<Omit<StoredDay, 'business_date'>>) {
    this.transaction(() => {
      Object.assign(this.touchDay(date), structuredClone(patch));
    });
  }

  enqueueClose(date: BusinessDate) {
    this.transaction(() => {
      if (!this.s.outbox.some((o) => o.entity === 'close' && o.entity_id === date)) this.enqueue('close', date);
    });
  }

  outbox(nowMs: number, limit: number): OutboxRow[] {
    // FIFO: si el primero espera su turno, los demas tambien (el orden importa: asientos antes de sus reversos y del cierre)
    const rows = [...this.s.outbox].sort((a, b) => a.seq - b.seq);
    const first = rows[0];
    if (!first || first.next_attempt_at > nowMs) return [];
    return rows.filter((r) => r.next_attempt_at <= nowMs).slice(0, limit).map((r) => ({ ...r }));
  }

  completeOutbox(seq: number) {
    this.s.outbox = this.s.outbox.filter((o) => o.seq !== seq);
    this.commit();
  }

  retryOutbox(seq: number, error: string, nextAttemptAt: number) {
    const o = this.s.outbox.find((x) => x.seq === seq);
    if (o) {
      o.attempts += 1;
      o.last_error = error;
      o.next_attempt_at = nextAttemptAt;
    }
    this.commit();
  }

  getSync(): SyncState {
    return { ...this.s.sync };
  }

  setSync(patch: Partial<SyncState>) {
    Object.assign(this.s.sync, patch);
    this.commit();
  }

  reset() {
    this.s = fresh();
    this.commit();
  }
}
