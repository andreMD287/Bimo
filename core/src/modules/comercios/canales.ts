import type { Kysely, Transaction } from 'kysely';
import type { ChannelCode, Database } from '../../db/types';

type Db = Kysely<Database> | Transaction<Database>;

export interface ChannelInput {
  id: string;
  merchantId: string;
  name: string;
  channel: ChannelCode;
  commissionBps: number;
  settlementDays: number;
  active: boolean;
  updatedAt: Date;
}

export type ChannelUpsertResult = 'accepted' | 'duplicate' | 'id_conflict';

/** Configuracion de canales (spec 01 v1.4): gana la ultima edicion, igual que los clientes. */
export async function upsertChannel(tx: Transaction<Database>, c: ChannelInput): Promise<ChannelUpsertResult> {
  const cur = await tx.selectFrom('merchant_channels').selectAll().where('id', '=', c.id).forUpdate().executeTakeFirst();
  if (!cur) {
    await tx
      .insertInto('merchant_channels')
      .values({
        id: c.id,
        merchant_id: c.merchantId,
        name: c.name,
        channel: c.channel,
        commission_bps: c.commissionBps,
        settlement_days: c.settlementDays,
        active: c.active,
        created_at: c.updatedAt,
        updated_at: c.updatedAt,
      })
      .execute();
    return 'accepted';
  }
  if (cur.merchant_id !== c.merchantId) return 'id_conflict';
  const same =
    cur.name === c.name &&
    cur.channel === c.channel &&
    cur.commission_bps === c.commissionBps &&
    cur.settlement_days === c.settlementDays &&
    cur.active === c.active &&
    cur.updated_at.getTime() === c.updatedAt.getTime();
  if (same || c.updatedAt.getTime() <= cur.updated_at.getTime()) return 'duplicate';
  await tx
    .updateTable('merchant_channels')
    .set({ name: c.name, channel: c.channel, commission_bps: c.commissionBps, settlement_days: c.settlementDays, active: c.active, updated_at: c.updatedAt })
    .where('id', '=', c.id)
    .execute();
  return 'accepted';
}

export async function loadChannels(db: Db, merchantId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.selectFrom('merchant_channels').selectAll().where('merchant_id', '=', merchantId).where('id', 'in', ids).execute();
}
