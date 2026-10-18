/**
 * Pull (servidor -> celular), spec 04 §8 y spec 06 §3.2: lee el feed `merchant_changes` del comercio desde un cursor
 * y trae cada entidad completa. Solo lectura. El modulo es dueno de la lectura del feed; las tablas de otros
 * dominios (asientos, clientes, canales, dias, sellos) se leen aqui porque el feed las nombra, pero nunca se escriben.
 */
import type { Kysely } from 'kysely';
import type { Database } from '../../db/types';

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

const iso = (d: Date) => d.toISOString();

export async function pullChanges(
  db: Kysely<Database>,
  input: { merchantId: string; cursor: number; limit: number },
): Promise<PullPage> {
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
    loadEntries(db, input.merchantId, ids('entry')),
    loadCustomers(db, input.merchantId, ids('customer')),
    loadChannels(db, input.merchantId, ids('channel')),
    loadDays(db, input.merchantId, ids('day')),
    loadSeals(db, input.merchantId, ids('seal')),
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

type Loaded = Map<string, Record<string, unknown>>;

async function loadEntries(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  if (ids.length === 0) return out;
  const entries = await db
    .selectFrom('journal_entries')
    .select(['id', 'occurred_at', 'business_date', 'kind', 'origin', 'reverses_entry_id', 'note', 'clock_suspect', 'external_source', 'external_ref'])
    .where('merchant_id', '=', merchantId)
    .where('id', 'in', ids)
    .execute();
  const lines = await db
    .selectFrom('journal_lines as l')
    .innerJoin('ledger_accounts as a', 'a.id', 'l.account_id')
    .select(['l.id', 'l.entry_id', 'l.line_no', 'a.code as account_code', 'l.direction', 'l.amount_minor', 'l.currency', 'l.channel', 'l.customer_id'])
    .where('l.entry_id', 'in', ids)
    .orderBy('l.entry_id')
    .orderBy('l.line_no')
    .execute();
  const byEntry = new Map<string, Array<Record<string, unknown>>>();
  for (const l of lines) {
    const arr = byEntry.get(l.entry_id) ?? [];
    arr.push({
      id: l.id,
      line_no: l.line_no,
      account_code: l.account_code,
      direction: l.direction,
      amount_minor: l.amount_minor,
      currency: l.currency,
      ...(l.channel ? { channel: l.channel } : {}),
      ...(l.customer_id ? { customer_id: l.customer_id } : {}),
    });
    byEntry.set(l.entry_id, arr);
  }
  for (const e of entries) {
    out.set(e.id, {
      id: e.id,
      occurred_at: iso(e.occurred_at),
      business_date: e.business_date,
      kind: e.kind,
      origin: e.origin,
      reverses_entry_id: e.reverses_entry_id,
      note: e.note,
      clock_suspect: e.clock_suspect,
      ...(e.external_source ? { external_source: e.external_source, external_ref: e.external_ref } : {}),
      lines: byEntry.get(e.id) ?? [],
    });
  }
  return out;
}

async function loadCustomers(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  if (ids.length === 0) return out;
  const rows = await db.selectFrom('customers').selectAll().where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
  for (const c of rows) {
    out.set(c.id, { id: c.id, display_name: c.display_name, phone: c.phone, created_at: iso(c.created_at), updated_at: iso(c.updated_at) });
  }
  return out;
}

async function loadChannels(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  if (ids.length === 0) return out;
  const rows = await db.selectFrom('merchant_channels').selectAll().where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
  for (const c of rows) {
    out.set(c.id, {
      id: c.id, name: c.name, channel: c.channel, commission_bps: c.commission_bps, settlement_days: c.settlement_days,
      active: c.active, updated_at: iso(c.updated_at),
    });
  }
  return out;
}

/** `entity_id` de un dia es `business_days.id`; `data` lleva la fecha, que es lo que la app conoce. */
async function loadDays(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  if (ids.length === 0) return out;
  const rows = await db.selectFrom('business_days').selectAll().where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
  for (const d of rows) {
    out.set(d.id, { business_date: d.business_date, status: d.status, counted_cash_minor: d.counted_cash_minor });
  }
  return out;
}

async function loadSeals(db: Kysely<Database>, merchantId: string, ids: string[]): Promise<Loaded> {
  const out: Loaded = new Map();
  if (ids.length === 0) return out;
  const rows = await db
    .selectFrom('seals as s')
    .innerJoin('business_days as d', 'd.id', 's.day_id')
    .select(['s.id', 'd.business_date', 's.version', 's.status', 's.tx_hash', 's.signing_request_id'])
    .where('d.merchant_id', '=', merchantId)
    .where('s.id', 'in', ids)
    .execute();
  for (const s of rows) {
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
