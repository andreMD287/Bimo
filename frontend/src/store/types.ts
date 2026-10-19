/**
 * Base local de la app (spec 04 §2, spec 01 §8). Interfaz sincrona: registrar una venta es UNA transaccion local que
 * guarda asiento, lineas y la fila del outbox; o queda todo o no queda nada. Implementaciones: `SqlStore` (expo-sqlite
 * en el telefono) y `MemoryStore` (web y pruebas), con las mismas pruebas de contrato.
 */
import type { Asiento, BusinessDate, CanalConfig, Cliente, DayStatus } from '../lib/tipos';

export type SyncStatus = 'pendiente' | 'sincronizado' | 'rechazado';
export type OutboxEntity = 'customer' | 'channel' | 'entry' | 'close';

/** Datos del front que no van en el asiento (no entran al hash). */
export interface MetaAsiento {
  canal_ids: string[];
  anticipo_total_minor?: number;
}

export interface StoredEntry {
  asiento: Asiento;
  meta: MetaAsiento | null;
  sync_status: SyncStatus;
  reject_code: string | null;
}

export interface StoredCustomer extends Cliente {
  phone: string | null;
  updated_at_ms: number;
}

export interface StoredChannel extends CanalConfig {
  updated_at_ms: number;
}

export interface SelloLocal {
  version: number;
  status: string;
  tx_hash: string | null;
}

export interface StoredDay {
  business_date: BusinessDate;
  status: DayStatus;
  counted_cash_minor: number | null;
  closed_at: string | null;
  /** Estado del ultimo sello que informo el servidor (preparado, firmado, enviado, confirmado, fallido). */
  seal_status: string | null;
  /** Hay un sello `preparado` esperando la firma del dueno. */
  pending_signature: boolean;
  signing_request_id: string | null;
  sellos: SelloLocal[];
}

export interface OutboxRow {
  seq: number;
  entity: OutboxEntity;
  entity_id: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
}

export interface SyncState {
  pull_cursor: number;
  last_push_at: number | null;
  last_pull_at: number | null;
  clock_skew_ms: number;
}

export interface Snapshot {
  entries: StoredEntry[];
  customers: StoredCustomer[];
  channels: StoredChannel[];
  days: StoredDay[];
  sync: SyncState;
}

export interface Store {
  readonly kind: 'sqlite' | 'memory';
  snapshot(): Snapshot;
  /** Todo lo que haga `fn` ocurre en una sola transaccion: si lanza, no queda nada. */
  transaction<T>(fn: () => T): T;

  /** Inserta el asiento (si no existe). `pendiente` = nace en este celular y va al outbox. */
  addEntry(a: Asiento, meta: MetaAsiento | null, origin: 'local' | 'remote'): boolean;
  markEntrySynced(id: string): void;
  markEntryRejected(id: string, code: string): void;

  /** Gana la ultima edicion (`updated_at_ms`). Devuelve true si se aplico. `local` encola en el outbox. */
  upsertCustomer(c: StoredCustomer, origin: 'local' | 'remote'): boolean;
  upsertChannel(c: StoredChannel, origin: 'local' | 'remote'): boolean;

  /** Crea o fusiona el dia local (D-1: el primer asiento crea el dia abierto). */
  upsertDay(date: BusinessDate, patch: Partial<Omit<StoredDay, 'business_date'>>): void;
  /** Encola `close` para el dia (se envia despues de sus asientos). */
  enqueueClose(date: BusinessDate): void;

  outbox(nowMs: number, limit: number): OutboxRow[];
  completeOutbox(seq: number): void;
  retryOutbox(seq: number, error: string, nextAttemptAt: number): void;

  getSync(): SyncState;
  setSync(patch: Partial<SyncState>): void;
  /** Borra todo (cerrar sesion / cuenta nueva). */
  reset(): void;
}

export const EMPTY_SYNC: SyncState = { pull_cursor: 0, last_push_at: null, last_pull_at: null, clock_skew_ms: 0 };

export function emptyDay(date: BusinessDate): StoredDay {
  return {
    business_date: date,
    status: 'abierto',
    counted_cash_minor: null,
    closed_at: null,
    seal_status: null,
    pending_signature: false,
    signing_request_id: null,
    sellos: [],
  };
}
