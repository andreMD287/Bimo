import { businessDate } from '@bimo/shared';
import type { Kysely, Transaction } from 'kysely';
import { AppError } from '../../errors';
import type { Database } from '../../db/types';
import { newId } from '../../ids';
import { countDayEntries, existingEntryIds } from '../ledger';
import { supersedeOpenRequest } from './firma';
import { withMerchantLock } from './lock';

type Db = Kysely<Database> | Transaction<Database>;

/** Lectura de dias y sellos para el pull (spec 04 §8). */
export async function loadDays(db: Db, merchantId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.selectFrom('business_days').selectAll().where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
}

export async function loadSeals(db: Db, merchantId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .selectFrom('seals as s')
    .innerJoin('business_days as d', 'd.id', 's.day_id')
    .select(['s.id', 'd.business_date', 's.version', 's.status', 's.tx_hash', 's.signing_request_id'])
    .where('d.merchant_id', '=', merchantId)
    .where('s.id', 'in', ids)
    .execute();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(date: string): string {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new AppError('invalid_request', 'La fecha debe ser AAAA-MM-DD');
  return date;
}

/** Fecha de negocio (Bogota) del instante `now`, como AAAA-MM-DD. */
export function todayInBogota(now: Date): string {
  const n = businessDate(now.getTime());
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export interface CloseInput {
  merchantId: string;
  userId: string;
  date: string;
  countedCashMinor: number | null;
  entryIds: string[];
  now: Date;
}

/**
 * D-2 / D-3 (spec 07 §1, spec 06 §3.3). Un dia sin asientos se cierra y se sellara con la raiz vacia (D-2);
 * un dia `abierto` se cierra si el servidor ya tiene todos los `entry_ids` que el celular conoce (D-3). Reemplaza la
 * solicitud de firma abierta (S-4). Cualquier otro estado es `409 day_not_closable`.
 */
export async function closeDay(db: Kysely<Database>, input: CloseInput): Promise<{ status: 'cerrado' }> {
  const date = parseDate(input.date);
  if (date > todayInBogota(input.now)) throw new AppError('day_not_closable', 'No se puede cerrar un dia futuro');

  return withMerchantLock(db, input.merchantId, async (tx) => {
    const day = await tx
      .selectFrom('business_days')
      .selectAll()
      .where('merchant_id', '=', input.merchantId)
      .where('business_date', '=', date)
      .executeTakeFirst();

    if (day && day.status === 'cerrado' && day.counted_cash_minor === input.countedCashMinor) {
      return { status: 'cerrado' as const }; // reintento de un cierre que ya se hizo (la respuesta se perdio)
    }
    if (day && day.status !== 'abierto') throw new AppError('day_not_closable', `El dia esta ${day.status}`);

    if (!day) {
      // D-2: dia sin asientos
      const n = await countDayEntries(tx, input.merchantId, date);
      if (n > 0) throw new Error('dia con asientos sin business_days'); // imposible: DB-03 lo crea con el primer asiento
    }

    // D-3: estan todos los asientos que el celular conoce?
    const have = await existingEntryIds(tx, input.merchantId, input.entryIds);
    const missing = input.entryIds.filter((id) => !have.has(id));
    if (missing.length > 0) throw new AppError('missing_entries', 'Faltan asientos por subir', { entry_ids: missing });

    if (day) {
      await tx
        .updateTable('business_days')
        .set({ status: 'cerrado', counted_cash_minor: input.countedCashMinor, closed_at: input.now, closed_by: input.userId })
        .where('id', '=', day.id)
        .execute();
    } else {
      await tx
        .insertInto('business_days')
        .values({ id: newId(), merchant_id: input.merchantId, business_date: date, status: 'cerrado', counted_cash_minor: input.countedCashMinor, closed_at: input.now, closed_by: input.userId })
        .execute();
    }
    await supersedeOpenRequest(tx, input.merchantId, 'reemplazada', input.now); // S-4
    return { status: 'cerrado' as const };
  });
}

export interface DaySummary {
  date: string;
  status: string;
  entry_count: number;
  seal_version: number;
  tx_hash?: string;
}

/** GET /days (spec 06 §3.3). */
export async function listDays(db: Db, merchantId: string, from?: string, to?: string): Promise<DaySummary[]> {
  let q = db.selectFrom('business_days').selectAll().where('merchant_id', '=', merchantId).orderBy('business_date');
  if (from) q = q.where('business_date', '>=', parseDate(from));
  if (to) q = q.where('business_date', '<=', parseDate(to));
  const days = await q.execute();
  const out: DaySummary[] = [];
  for (const d of days) {
    const entry_count = await countDayEntries(db, merchantId, d.business_date);
    const seal = await db
      .selectFrom('seals')
      .select('tx_hash')
      .where('day_id', '=', d.id)
      .where('status', '=', 'confirmado')
      .orderBy('version', 'desc')
      .executeTakeFirst();
    out.push({
      date: d.business_date,
      status: d.status,
      entry_count,
      seal_version: d.current_seal_version,
      ...(seal?.tx_hash ? { tx_hash: seal.tx_hash } : {}),
    });
  }
  return out;
}
