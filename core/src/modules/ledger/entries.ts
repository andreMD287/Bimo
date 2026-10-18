/**
 * Modulo ledger: asientos, lineas, sales y clientes (spec 01 §4.2, spec 04 §5). Es el unico que escribe
 * `journal_entries`, `journal_lines`, `entry_salts` y `customers`. No importa a ningun otro modulo (spec 08 §1).
 */
import type { Entry, EntryLine } from '@bimo/shared';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '../../db/types';

type Db = Kysely<Database> | Transaction<Database>;

export interface StoredEntry extends Entry {
  merchant_id: string;
  business_date: string; // AAAA-MM-DD
  clock_suspect: boolean;
}

/** Carga asientos del comercio con sus lineas (`account_code` en lugar del id interno). */
export async function loadEntries(db: Db, merchantId: string, ids: string[]): Promise<Map<string, StoredEntry>> {
  const out = new Map<string, StoredEntry>();
  if (ids.length === 0) return out;
  const entries = await db
    .selectFrom('journal_entries')
    .select(['id', 'occurred_at', 'business_date', 'kind', 'origin', 'reverses_entry_id', 'note', 'clock_suspect', 'external_source', 'external_ref'])
    .where('merchant_id', '=', merchantId)
    .where('id', 'in', ids)
    .execute();
  if (entries.length === 0) return out;
  const lines = await db
    .selectFrom('journal_lines as l')
    .innerJoin('ledger_accounts as a', 'a.id', 'l.account_id')
    .select(['l.id', 'l.entry_id', 'l.line_no', 'a.code as account_code', 'l.direction', 'l.amount_minor', 'l.currency', 'l.channel', 'l.customer_id'])
    .where(
      'l.entry_id',
      'in',
      entries.map((e) => e.id),
    )
    .orderBy('l.entry_id')
    .orderBy('l.line_no')
    .execute();
  const byEntry = new Map<string, EntryLine[]>();
  for (const l of lines) {
    const arr = byEntry.get(l.entry_id) ?? [];
    arr.push({
      id: l.id,
      line_no: l.line_no,
      account_code: l.account_code,
      direction: l.direction,
      amount_minor: l.amount_minor,
      currency: l.currency,
      channel: l.channel,
      customer_id: l.customer_id,
    });
    byEntry.set(l.entry_id, arr);
  }
  for (const e of entries) {
    out.set(e.id, {
      id: e.id,
      merchant_id: merchantId,
      business_date: e.business_date,
      occurred_at: e.occurred_at.toISOString(),
      kind: e.kind,
      origin: e.origin,
      reverses_entry_id: e.reverses_entry_id,
      external_source: e.external_source,
      external_ref: e.external_ref,
      note: e.note,
      clock_suspect: e.clock_suspect,
      lines: byEntry.get(e.id) ?? [],
    });
  }
  return out;
}

/** Comercio dueno de un ID de asiento, o null si el ID no existe. */
export async function entryOwner(db: Db, id: string): Promise<string | null> {
  const row = await db.selectFrom('journal_entries').select('merchant_id').where('id', '=', id).executeTakeFirst();
  return row?.merchant_id ?? null;
}

export async function isReversed(db: Db, merchantId: string, entryId: string): Promise<boolean> {
  const row = await db
    .selectFrom('journal_entries')
    .select('id')
    .where('merchant_id', '=', merchantId)
    .where('reverses_entry_id', '=', entryId)
    .executeTakeFirst();
  return row !== undefined;
}

export async function existingCustomerIds(db: Db, merchantId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.selectFrom('customers').select('id').where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
  return new Set(rows.map((r) => r.id));
}

export interface InsertEntryInput {
  merchantId: string;
  deviceId: string;
  createdBy: string;
  entry: Entry;
  clockSuspect: boolean;
  salt: Buffer;
}

/** Inserta asiento + lineas + sal. Los triggers DB-02..DB-11 calculan business_date, el dia y el feed. */
export async function insertEntry(tx: Transaction<Database>, input: InsertEntryInput): Promise<{ businessDate: string; dayStatus: string }> {
  const e = input.entry;
  const accounts = await tx.selectFrom('ledger_accounts').select(['id', 'code', 'currency']).where('merchant_id', '=', input.merchantId).execute();
  const accountId = new Map(accounts.map((a) => [`${a.code}|${a.currency}`, a.id]));
  await tx
    .insertInto('journal_entries')
    .values({
      id: e.id,
      merchant_id: input.merchantId,
      occurred_at: new Date(typeof e.occurred_at === 'number' ? e.occurred_at : Date.parse(e.occurred_at)),
      kind: e.kind,
      origin: e.origin,
      reverses_entry_id: e.reverses_entry_id ?? null,
      external_source: null,
      external_ref: null,
      note: e.note ?? null,
      device_id: input.deviceId,
      created_by: input.createdBy,
      clock_suspect: input.clockSuspect,
    })
    .execute();
  await tx
    .insertInto('journal_lines')
    .values(
      e.lines.map((l) => {
        const acc = accountId.get(`${l.account_code}|${l.currency}`);
        if (!acc) throw new Error('cuenta del ledger inexistente');
        return {
          id: l.id as string,
          entry_id: e.id,
          line_no: l.line_no,
          account_id: acc,
          direction: l.direction,
          amount_minor: Number(l.amount_minor),
          currency: l.currency,
          channel: l.channel ?? null,
          customer_id: l.customer_id ?? null,
        };
      }),
    )
    .execute();
  await tx.insertInto('entry_salts').values({ entry_id: e.id, salt: input.salt }).execute();
  await sql`set constraints all immediate`.execute(tx); // DB-04/DB-05 se comprueban aqui, dentro del try del llamador
  const day = await tx
    .selectFrom('journal_entries as je')
    .innerJoin('business_days as d', 'd.id', 'je.day_id')
    .select(['d.business_date', 'd.status'])
    .where('je.id', '=', e.id)
    .executeTakeFirstOrThrow();
  return { businessDate: day.business_date, dayStatus: day.status };
}

/** Fecha y estado del dia de un asiento ya guardado (para responder `duplicate`). */
export async function dayOfEntry(db: Db, entryId: string): Promise<{ businessDate: string; dayStatus: string } | null> {
  const row = await db
    .selectFrom('journal_entries as je')
    .innerJoin('business_days as d', 'd.id', 'je.day_id')
    .select(['d.business_date', 'd.status'])
    .where('je.id', '=', entryId)
    .executeTakeFirst();
  return row ? { businessDate: row.business_date, dayStatus: row.status } : null;
}

/** De los IDs dados, los que ya existen en el comercio (para validar el `close`, spec 07 D-3). */
export async function existingEntryIds(db: Db, merchantId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.selectFrom('journal_entries').select('id').where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
  return new Set(rows.map((r) => r.id));
}

export interface SealableEntry {
  entry: StoredEntry;
  salt: Buffer;
}

/** Todos los asientos de un dia de negocio (incluidos los reversos), por `id` ascendente, con su sal (spec 02 §4). */
export async function loadDayEntriesForSeal(db: Db, merchantId: string, businessDate: string): Promise<SealableEntry[]> {
  const ids = (
    await db
      .selectFrom('journal_entries')
      .select('id')
      .where('merchant_id', '=', merchantId)
      .where('business_date', '=', businessDate)
      .orderBy('id')
      .execute()
  ).map((r) => r.id);
  if (ids.length === 0) return [];
  const entries = await loadEntries(db, merchantId, ids);
  const salts = await db.selectFrom('entry_salts').select(['entry_id', 'salt']).where('entry_id', 'in', ids).execute();
  const saltOf = new Map(salts.map((s) => [s.entry_id, s.salt]));
  return ids.map((id) => {
    const salt = saltOf.get(id);
    if (!salt) throw new Error('asiento sin sal');
    return { entry: entries.get(id) as StoredEntry, salt };
  });
}

export async function countDayEntries(db: Db, merchantId: string, businessDate: string): Promise<number> {
  const row = await db
    .selectFrom('journal_entries')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('merchant_id', '=', merchantId)
    .where('business_date', '=', businessDate)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}
