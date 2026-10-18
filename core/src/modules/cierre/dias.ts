import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../../db/types';

type Db = Kysely<Database> | Transaction<Database>;

/** Lectura de dias y sellos para el pull (spec 04 §8). Las transiciones del dia (A-11) viven tambien en este modulo. */
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
