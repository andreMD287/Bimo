/**
 * Motor de sincronizacion (spec 04 §3, §5, §6, §8): sube el outbox en orden (push), cierra dias (close) y baja los
 * cambios del servidor (pull). Es idempotente: matar la app a mitad no pierde ni duplica nada.
 */
import { ApiError, type Api, type PullChange, type PushItem, type PushResult } from '../api/client';
import type { Asiento, DayStatus, Linea } from '../lib/tipos';
import type { OutboxRow, Store, StoredChannel, StoredCustomer, StoredDay } from '../store/types';

export interface SyncDeps {
  store: Store;
  api: Pick<Api, 'push' | 'pull' | 'closeDay'>;
  deviceId: string;
  now?: () => number;
}

export interface SyncReport {
  online: boolean;
  pushed: number;
  rejected: number;
  pulled: number;
  clockSkewMs: number | null;
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000]; // spec 04 §3.2: hasta 5 min
const backoff = (attempts: number) => BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] as number;

const iso = (ms: number) => new Date(ms).toISOString();

function entryItem(store: Store, id: string): PushItem | null {
  const e = store.snapshot().entries.find((x) => x.asiento.id === id);
  if (!e) return null;
  const a = e.asiento;
  return {
    type: 'entry',
    data: {
      id: a.id,
      occurred_at: a.occurred_at,
      kind: a.kind,
      origin: a.origin,
      reverses_entry_id: a.reverses_entry_id,
      note: a.note,
      lines: a.lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        account_code: l.account_code,
        direction: l.direction,
        amount_minor: l.amount_minor,
        currency: l.currency,
        channel: l.channel,
        customer_id: l.customer_id,
      })),
    },
  };
}

function toItem(store: Store, snap: ReturnType<Store['snapshot']>, row: OutboxRow): PushItem | null {
  if (row.entity === 'entry') return entryItem(store, row.entity_id);
  if (row.entity === 'customer') {
    const c = snap.customers.find((x) => x.id === row.entity_id);
    return c ? { type: 'customer', data: { id: c.id, display_name: c.display_name, phone: c.phone, updated_at: iso(c.updated_at_ms) } } : null;
  }
  if (row.entity === 'channel') {
    const c = snap.channels.find((x) => x.id === row.entity_id);
    return c
      ? { type: 'channel', data: { id: c.id, name: c.nombre, channel: c.channel, commission_bps: c.comision_bps, settlement_days: c.dias_consignacion, active: c.activo, updated_at: iso(c.updated_at_ms) } }
      : null;
  }
  return null;
}

/** Sube lo pendiente. Se detiene en el primer `close` (va despues de los asientos de su dia) y lo procesa solo. */
export async function pushOutbox(d: SyncDeps): Promise<{ online: boolean; pushed: number; rejected: number; clockSkewMs: number | null }> {
  const now = d.now ?? Date.now;
  let pushed = 0;
  let rejected = 0;
  let skew: number | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const rows = d.store.outbox(now(), 200);
    if (rows.length === 0) break;
    const first = rows[0] as OutboxRow;

    if (first.entity === 'close') {
      try {
        await sendClose(d, first);
        pushed += 1;
        continue;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) {
          d.store.retryOutbox(first.seq, 'network', now() + backoff(first.attempts));
          return { online: false, pushed, rejected, clockSkewMs: skew };
        }
        d.store.retryOutbox(first.seq, e instanceof ApiError ? e.code : 'error', now() + backoff(first.attempts));
        break;
      }
    }

    const batch: OutboxRow[] = [];
    for (const r of rows) {
      if (r.entity === 'close') break;
      batch.push(r);
    }
    const snap = d.store.snapshot();
    const items: Array<{ row: OutboxRow; item: PushItem }> = [];
    for (const row of batch) {
      const item = toItem(d.store, snap, row);
      if (item) items.push({ row, item });
      else d.store.completeOutbox(row.seq); // el dato ya no existe
    }
    if (items.length === 0) continue;

    let res;
    try {
      res = await d.api.push(items.map((x) => x.item), d.deviceId);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        d.store.retryOutbox(first.seq, 'network', now() + backoff(first.attempts));
        return { online: false, pushed, rejected, clockSkewMs: skew };
      }
      d.store.retryOutbox(first.seq, e instanceof ApiError ? e.code : 'error', now() + backoff(first.attempts));
      break;
    }
    skew = res.clock_skew_ms;
    d.store.setSync({ clock_skew_ms: res.clock_skew_ms, last_push_at: now() });
    const byId = new Map<string, PushResult>(res.results.map((r) => [`${r.type}:${r.id}`, r]));
    let stalled = false;
    for (const { row, item } of items) {
      const r = byId.get(`${item.type}:${row.entity_id}`);
      if (!r || r.result === 'dependency_failed') {
        d.store.retryOutbox(row.seq, 'dependency_failed', now() + backoff(row.attempts));
        stalled = true;
        continue;
      }
      d.store.transaction(() => {
        if (r.result === 'accepted' || r.result === 'duplicate') {
          if (row.entity === 'entry') d.store.markEntrySynced(row.entity_id);
          pushed += 1;
        } else {
          // rejected / id_conflict: nunca se reintenta ni se borra (spec 04 §5.2)
          if (row.entity === 'entry') d.store.markEntryRejected(row.entity_id, r.code ?? r.result);
          rejected += 1;
        }
        d.store.completeOutbox(row.seq);
      });
      if (r.business_date && r.day_status && row.entity === 'entry') {
        // el servidor corrige la fecha del dia si el reloj del celular estaba mal
        const local = snap.entries.find((x) => x.asiento.id === row.entity_id)?.asiento.business_date;
        if (local && local !== r.business_date) d.store.upsertDay(r.business_date, {});
      }
    }
    if (stalled) break;
  }
  return { online: true, pushed, rejected, clockSkewMs: skew };
}

async function sendClose(d: SyncDeps, row: OutboxRow): Promise<void> {
  const snap = d.store.snapshot();
  const day = snap.days.find((x) => x.business_date === row.entity_id);
  const entryIds = snap.entries.filter((e) => e.asiento.business_date === row.entity_id && e.sync_status !== 'rechazado').map((e) => e.asiento.id);
  try {
    await d.api.closeDay(row.entity_id, { counted_cash_minor: day?.counted_cash_minor ?? null, entry_ids: entryIds });
  } catch (e) {
    // el dia ya estaba cerrado (la respuesta anterior se perdio): cuenta como hecho
    if (e instanceof ApiError && e.code === 'day_not_closable') {
      d.store.completeOutbox(row.seq);
      return;
    }
    throw e;
  }
  d.store.completeOutbox(row.seq);
}

// ---------------------------------------------------------------- pull
function toAsiento(data: Record<string, unknown>): Asiento {
  const lines = (data.lines as Array<Record<string, unknown>>).map<Linea>((l) => ({
    id: l.id as string,
    line_no: l.line_no as number,
    account_code: l.account_code as Linea['account_code'],
    direction: l.direction as Linea['direction'],
    amount_minor: l.amount_minor as number,
    currency: l.currency as Linea['currency'],
    channel: (l.channel as Linea['channel']) ?? null,
    customer_id: (l.customer_id as string) ?? null,
  }));
  return {
    id: data.id as string,
    business_date: data.business_date as string,
    occurred_at: data.occurred_at as string,
    kind: data.kind as Asiento['kind'],
    origin: data.origin as Asiento['origin'],
    reverses_entry_id: (data.reverses_entry_id as string) ?? null,
    note: (data.note as string) ?? null,
    lines,
  };
}

function applyChange(store: Store, c: PullChange): void {
  const d = c.data;
  switch (c.entity) {
    case 'entry':
      store.addEntry(toAsiento(d), null, 'remote');
      break;
    case 'customer': {
      const cu: StoredCustomer = { id: d.id as string, display_name: d.display_name as string, phone: (d.phone as string) ?? null, updated_at_ms: Date.parse(d.updated_at as string) };
      store.upsertCustomer(cu, 'remote');
      break;
    }
    case 'channel': {
      const ch: StoredChannel = {
        id: d.id as string, nombre: d.name as string, channel: d.channel as StoredChannel['channel'], comision_bps: d.commission_bps as number,
        dias_consignacion: d.settlement_days as number, activo: d.active === true, updated_at_ms: Date.parse(d.updated_at as string),
      };
      store.upsertChannel(ch, 'remote');
      break;
    }
    case 'day':
      store.upsertDay(d.business_date as string, { status: d.status as DayStatus, counted_cash_minor: (d.counted_cash_minor as number) ?? null });
      break;
    case 'seal': {
      const date = d.business_date as string;
      const cur = store.snapshot().days.find((x) => x.business_date === date);
      const sellos: StoredDay['sellos'] = (cur?.sellos ?? []).filter((s) => s.version !== d.version);
      sellos.push({ version: d.version as number, status: d.status as string, tx_hash: (d.tx_hash as string) ?? null });
      sellos.sort((a, b) => a.version - b.version);
      store.upsertDay(date, {
        sellos,
        seal_status: d.status as string,
        pending_signature: d.status === 'preparado',
        signing_request_id: d.status === 'preparado' ? ((d.signing_request_id as string) ?? null) : null,
      });
      break;
    }
  }
}

/** Baja todos los cambios desde el cursor; cada pagina se aplica en UNA transaccion junto con el nuevo cursor. */
export async function pullAll(d: SyncDeps): Promise<{ online: boolean; pulled: number }> {
  const now = d.now ?? Date.now;
  let pulled = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const cursor = d.store.getSync().pull_cursor;
    let page;
    try {
      page = await d.api.pull(cursor, 500);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) return { online: false, pulled };
      throw e;
    }
    d.store.transaction(() => {
      for (const c of page.changes) applyChange(d.store, c);
      d.store.setSync({ pull_cursor: page.next_cursor, last_pull_at: now() });
    });
    pulled += page.changes.length;
    if (!page.has_more) break;
  }
  return { online: true, pulled };
}

/** Push y despues pull (spec 04 §3). */
export async function syncAll(d: SyncDeps): Promise<SyncReport> {
  const push = await pushOutbox(d);
  if (!push.online) return { online: false, pushed: push.pushed, rejected: push.rejected, pulled: 0, clockSkewMs: push.clockSkewMs };
  const pull = await pullAll(d);
  return { online: pull.online, pushed: push.pushed, rejected: push.rejected, pulled: pull.pulled, clockSkewMs: push.clockSkewMs };
}
