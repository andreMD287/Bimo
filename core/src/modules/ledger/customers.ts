import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../../db/types';

type Db = Kysely<Database> | Transaction<Database>;

export interface CustomerInput {
  id: string;
  merchantId: string;
  displayName: string;
  phone: string | null;
  updatedAt: Date;
}

export type UpsertResult = 'accepted' | 'duplicate' | 'id_conflict';

/**
 * Clientes (spec 04 §8): gana la ultima edicion segun `updated_at`. Mismo contenido = `duplicate`; una edicion mas
 * vieja que la guardada tambien se responde `duplicate` (ya fue superada); un ID de otro comercio = `id_conflict`.
 */
export async function upsertCustomer(tx: Transaction<Database>, c: CustomerInput): Promise<UpsertResult> {
  const cur = await tx.selectFrom('customers').selectAll().where('id', '=', c.id).forUpdate().executeTakeFirst();
  if (!cur) {
    await tx
      .insertInto('customers')
      .values({ id: c.id, merchant_id: c.merchantId, display_name: c.displayName, phone: c.phone, created_at: c.updatedAt, updated_at: c.updatedAt })
      .execute();
    return 'accepted';
  }
  if (cur.merchant_id !== c.merchantId) return 'id_conflict';
  const same = cur.display_name === c.displayName && cur.phone === c.phone && cur.updated_at.getTime() === c.updatedAt.getTime();
  if (same || c.updatedAt.getTime() <= cur.updated_at.getTime()) return 'duplicate';
  await tx.updateTable('customers').set({ display_name: c.displayName, phone: c.phone, updated_at: c.updatedAt }).where('id', '=', c.id).execute();
  return 'accepted';
}

export async function loadCustomers(db: Db, merchantId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.selectFrom('customers').selectAll().where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
}
