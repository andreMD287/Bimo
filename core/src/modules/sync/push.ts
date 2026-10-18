/**
 * Push (celular -> servidor), spec 04 §5 y §7. Cada item se procesa en orden y en su propia transaccion: uno malo no
 * bloquea a los demas. Las reglas V-01..V-11 son las de `@bimo/shared`; aqui no se reimplementan.
 */
import { randomBytes } from 'node:crypto';
import { encodeEntry, isUlid, validateEntry, type Entry, type ValidationCode, type ValidationContext } from '@bimo/shared';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../../db/types';
import { upsertChannel } from '../comercios';
import { dayOfEntry, entryOwner, existingCustomerIds, insertEntry, isReversed, loadEntries, upsertCustomer } from '../ledger';

export const MAX_PUSH_ITEMS = 200; // spec 06 §4
export const CLOCK_SUSPECT_MS = 10 * 60 * 1000; // spec 04 §7

export interface PushItemIn {
  type: 'customer' | 'channel' | 'entry';
  data: Record<string, unknown>;
}

export interface PushResultOut {
  type: 'customer' | 'channel' | 'entry';
  id: string;
  result: 'accepted' | 'duplicate' | 'id_conflict' | 'rejected' | 'dependency_failed';
  code?: ValidationCode;
  business_date?: string;
  day_status?: string;
}

export interface PushInput {
  merchantId: string;
  deviceId: string;
  userId: string;
  deviceTime: Date;
  serverNow: Date;
  items: PushItemIn[];
}

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
const nfc = (s: string) => s.normalize('NFC');
const cleanText = (v: unknown): string | null => (typeof v === 'string' ? nfc(v) : null);

type Db = Kysely<Database>;

export async function pushItems(db: Db, input: PushInput): Promise<{ results: PushResultOut[]; clock_skew_ms: number }> {
  // spec 04 §7: skew = device_time - hora del servidor; si |skew| > 10 min, los asientos de ESTA peticion quedan sospechosos
  const skew = input.deviceTime.getTime() - input.serverNow.getTime();
  const clockSuspect = Math.abs(skew) > CLOCK_SUSPECT_MS;

  const results: PushResultOut[] = [];
  /** IDs de items de este lote que no se aceptaron: sus dependientes quedan `dependency_failed`. */
  const unresolved = new Set<string>();

  for (const item of input.items) {
    let out: PushResultOut;
    if (item.type === 'customer') out = await pushCustomer(db, input, item.data);
    else if (item.type === 'channel') out = await pushChannel(db, input, item.data);
    else out = await pushEntry(db, input, item.data, clockSuspect, unresolved);
    if (out.result === 'rejected' || out.result === 'id_conflict' || out.result === 'dependency_failed') unresolved.add(out.id);
    results.push(out);
  }
  return { results, clock_skew_ms: skew };
}

// ---------------------------------------------------------------- clientes y canales
const reject = (type: PushResultOut['type'], id: unknown, code: ValidationCode): PushResultOut => ({
  type,
  id: typeof id === 'string' ? id : '',
  result: 'rejected',
  code,
});

async function pushCustomer(db: Db, input: PushInput, d: Record<string, unknown>): Promise<PushResultOut> {
  const id = d.id;
  if (!isUlid(id)) return reject('customer', id, 'invalid_id');
  const name = cleanText(d.display_name);
  if (name === null || name.length < 1 || [...name].length > 60) return reject('customer', id, 'invalid_text');
  const phone = d.phone === null || d.phone === undefined ? null : cleanText(d.phone);
  if (d.phone != null && phone === null) return reject('customer', id, 'invalid_text');
  if (typeof d.updated_at !== 'string' || !ISO_MS.test(d.updated_at) || Number.isNaN(Date.parse(d.updated_at))) return reject('customer', id, 'invalid_time');
  const result = await db.transaction().execute((tx) =>
    upsertCustomer(tx, { id, merchantId: input.merchantId, displayName: name, phone, updatedAt: new Date(d.updated_at as string) }),
  );
  return { type: 'customer', id, result };
}

async function pushChannel(db: Db, input: PushInput, d: Record<string, unknown>): Promise<PushResultOut> {
  const id = d.id;
  if (!isUlid(id)) return reject('channel', id, 'invalid_id');
  const name = cleanText(d.name);
  if (name === null || name.length < 1 || [...name].length > 60) return reject('channel', id, 'invalid_text');
  const bps = d.commission_bps;
  const days = d.settlement_days;
  if (!Number.isInteger(bps) || (bps as number) < 0 || (bps as number) > 10000) return reject('channel', id, 'invalid_amount');
  if (!Number.isInteger(days) || (days as number) < 0 || (days as number) > 30) return reject('channel', id, 'invalid_amount');
  if (typeof d.updated_at !== 'string' || !ISO_MS.test(d.updated_at) || Number.isNaN(Date.parse(d.updated_at))) return reject('channel', id, 'invalid_time');
  const result = await db.transaction().execute((tx) =>
    upsertChannel(tx, {
      id,
      merchantId: input.merchantId,
      name,
      channel: d.channel as never,
      commissionBps: bps as number,
      settlementDays: days as number,
      active: d.active === true,
      updatedAt: new Date(d.updated_at as string),
    }),
  );
  return { type: 'channel', id, result };
}

// ---------------------------------------------------------------- asientos
/** Normaliza a NFC los textos y devuelve el asiento tal como se validara y se guardara. */
function normalize(raw: Record<string, unknown>): Entry {
  const e = raw as unknown as Entry;
  return {
    ...e,
    note: typeof e.note === 'string' ? nfc(e.note) : (e.note ?? null),
    reverses_entry_id: e.reverses_entry_id ?? null,
    external_source: e.external_source ?? null,
    external_ref: e.external_ref ?? null,
    lines: Array.isArray(e.lines) ? e.lines.map((l) => ({ ...l, channel: l.channel ?? null, customer_id: l.customer_id ?? null })) : [],
  };
}

/** Bytes canonicos sin sal: lo que decide si un reenvio es `duplicate` o `id_conflict` (spec 04 §5.2). */
function canonicalHex(merchantId: string, e: Entry): string {
  const ms = typeof e.occurred_at === 'number' ? e.occurred_at : Date.parse(e.occurred_at);
  return Buffer.from(encodeEntry({ ...e, merchant_id: merchantId, occurred_at: ms })).toString('hex');
}

async function pushEntry(db: Db, input: PushInput, raw: Record<string, unknown>, clockSuspect: boolean, unresolved: Set<string>): Promise<PushResultOut> {
  const entry = normalize(raw);
  const id = typeof entry.id === 'string' ? entry.id : '';

  // 1) Reenvio: el ID ya existe. Se decide antes de validar (un reverso reenviado ya "fue reversado" por si mismo).
  if (isUlid(id)) {
    const dup = await classifyExisting(db, input.merchantId, entry);
    if (dup) return dup;
  }

  // 2) Dependencias del mismo lote que no se aceptaron
  const deps = [entry.reverses_entry_id, ...entry.lines.map((l) => l.customer_id)].filter((x): x is string => typeof x === 'string');
  if (deps.some((d) => unresolved.has(d))) return { type: 'entry', id, result: 'dependency_failed' };

  // 3) Reglas V-01..V-11 con el contexto del comercio (clientes y asientos conocidos, incluidos los del lote ya guardados)
  const customerIds = entry.lines.map((l) => l.customer_id).filter((x): x is string => typeof x === 'string' && isUlid(x));
  const known = await existingCustomerIds(db, input.merchantId, customerIds);
  const target = typeof entry.reverses_entry_id === 'string' && isUlid(entry.reverses_entry_id) ? entry.reverses_entry_id : null;
  const original = target ? (await loadEntries(db, input.merchantId, [target])).get(target) : undefined;
  const reversed = target ? await isReversed(db, input.merchantId, target) : false;
  const ctx: ValidationContext = {
    knownCustomerIds: known,
    findEntry: (x) => (x === target ? original : undefined),
    isReversed: (x) => (x === target ? reversed : false),
  };
  const verdict = validateEntry(entry, ctx);
  if (!verdict.ok) return { type: 'entry', id, result: 'rejected', code: verdict.code };

  // 4) Guardar en su propia transaccion, con la sal de 32 bytes (CSPRNG) solo la primera vez
  try {
    const day = await db.transaction().execute((tx: Transaction<Database>) =>
      insertEntry(tx, {
        merchantId: input.merchantId,
        deviceId: input.deviceId,
        createdBy: input.userId,
        entry,
        clockSuspect,
        salt: randomBytes(32),
      }),
    );
    return { type: 'entry', id, result: 'accepted', business_date: day.businessDate, day_status: day.dayStatus };
  } catch (e) {
    if (isUniqueViolation(e)) {
      // dos envios simultaneos del mismo asiento: gana uno, el otro se vuelve a clasificar
      const dup = await classifyExisting(db, input.merchantId, entry);
      if (dup) return dup;
    }
    throw e;
  }
}

/** Si el ID ya existe: `duplicate` (mismos bytes canonicos), o `id_conflict` (otro contenido u otro comercio). */
async function classifyExisting(db: Db, merchantId: string, entry: Entry): Promise<PushResultOut | null> {
  const owner = await entryOwner(db, entry.id);
  if (owner === null) return null;
  if (owner !== merchantId) return { type: 'entry', id: entry.id, result: 'id_conflict' };
  const stored = (await loadEntries(db, merchantId, [entry.id])).get(entry.id);
  let same = false;
  if (stored) {
    try {
      same = canonicalHex(merchantId, entry) === canonicalHex(merchantId, stored);
    } catch {
      same = false; // un reenvio con codigos desconocidos no puede ser igual al guardado
    }
  }
  if (!same) return { type: 'entry', id: entry.id, result: 'id_conflict' };
  const day = await dayOfEntry(db, entry.id);
  return { type: 'entry', id: entry.id, result: 'duplicate', ...(day ? { business_date: day.businessDate, day_status: day.dayStatus } : {}) };
}
