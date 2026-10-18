/**
 * Pull (servidor -> celular), spec 04 §8 y spec 06 §3.2: lee el feed `merchant_changes` del comercio desde un cursor
 * y trae cada entidad completa por la interfaz publica de su modulo (ledger, comercios, cierre). Solo lectura.
 */
import type { Kysely } from 'kysely';
import type { Database } from '../../db/types';
import { loadChannels } from '../comercios';
import { loadDays, loadSeals } from '../cierre';
import { loadCustomers, loadEntries } from '../ledger';

export const MAX_PULL_LIMIT = 500; // spec 06 §4

export interface PullChange {
  seq: number;
  entity: 'entry' | 'customer' | 'channel' | 'day' | 'seal';
  data: Record<string, unknown>;
}

export interface PullPage {
  changes: PullChange[];
  next_cursor: number;
  has_more: boolean;
}

type Loaded = Map<string, Record<string, unknown>>;

export async function pullChanges(db: Kysely<Database>, input: { merchantId: string; cursor: number; limit: number }): Promise<PullPage> {
  const limit = Math.min(Math.max(input.limit, 1), MAX_PULL_LIMIT);
  const rows = await db
    .selectFrom('merchant_changes')
    .select(['seq', 'entity', 'entity_id'])
    .where('merchant_id', '=', input.merchantId)
    .where('seq', '>', input.cursor)
    .orderBy('seq')
    .limit(limit + 1)
    .execute();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const ids = (entity: PullChange['entity']) => [...new Set(page.filter((r) => r.entity === entity).map((r) => r.entity_id))];
  const [entries, customers, channels, days, seals] = await Promise.all([
    entriesData(db, input.merchantId, ids('entry')),
    customersData(db, input.merchantId, ids('customer')),
    channelsData(db, input.merchantId, ids('channel')),
    daysData(db, input.merchantId, ids('day')),
    sealsData(db, input.merchantId, ids('seal')),
  ]);
  const byEntity = { entry: entries, customer: customers, channel: channels, day: days, seal: seals };

  const changes: PullChange[] = [];
  for (const r of page) {
    const data = byEntity[r.entity].get(r.entity_id);
    if (data) changes.push({ seq: r.seq, entity: r.entity, data }); // si ya no existe (borrado de datos), se omite
  }
  const last = page[page.length - 1];
  return { changes, next_cursor: last ? last.seq : input.cursor, has_more: hasMore };
}

async function entriesData(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  for (const [id, e] of await loadEntries(db, merchantId, ids)) {
    out.set(id, {
      id: e.id,
      occurred_at: e.occurred_at,
      business_date: e.business_date,
      kind: e.kind,
      origin: e.origin,
      reverses_entry_id: e.reverses_entry_id ?? null,
      note: e.note ?? null,
      clock_suspect: e.clock_suspect,
      ...(e.external_source ? { external_source: e.external_source, external_ref: e.external_ref ?? null } : {}),
      lines: e.lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        account_code: l.account_code,
        direction: l.direction,
        amount_minor: l.amount_minor,
        currency: l.currency,
        ...(l.channel ? { channel: l.channel } : {}),
        ...(l.customer_id ? { customer_id: l.customer_id } : {}),
      })),
    });
  }
  return out;
}

async function customersData(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  for (const c of await loadCustomers(db, merchantId, ids)) {
    out.set(c.id, { id: c.id, display_name: c.display_name, phone: c.phone, created_at: c.created_at.toISOString(), updated_at: c.updated_at.toISOString() });
  }
  return out;
}

async function channelsData(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  for (const c of await loadChannels(db, merchantId, ids)) {
    out.set(c.id, {
      id: c.id,
      name: c.name,
      channel: c.channel,
      commission_bps: c.commission_bps,
      settlement_days: c.settlement_days,
      active: c.active,
      updated_at: c.updated_at.toISOString(),
    });
  }
  return out;
}

/** `entity_id` de un dia es `business_days.id`; `data` lleva la fecha, que es lo que la app conoce. */
async function daysData(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  for (const d of await loadDays(db, merchantId, ids)) {
    out.set(d.id, { business_date: d.business_date, status: d.status, counted_cash_minor: d.counted_cash_minor });
  }
  return out;
}

async function sealsData(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  for (const s of await loadSeals(db, merchantId, ids)) {
    out.set(s.id, {
      business_date: s.business_date,
      version: s.version,
      status: s.status,
      ...(s.tx_hash ? { tx_hash: s.tx_hash } : {}),
      // spec 06 §3.2: un sello en `preparado` incluye la solicitud para que la app pida la preimagen
      ...(s.status === 'preparado' && s.signing_request_id ? { signing_request_id: s.signing_request_id } : {}),
    });
  }
  return out;
}
