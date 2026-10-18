import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '../../db/types';

/** Cambios de estado del dia y de la firma solo bajo un advisory lock del comercio (spec 07, encabezado). */
export async function withMerchantLock<T>(db: Kysely<Database>, merchantId: string, fn: (tx: Transaction<Database>) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${merchantId}, 0))`.execute(tx);
    return fn(tx);
  });
}
