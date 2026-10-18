import { p256 } from '@noble/curves/nist.js';
import { sql } from 'kysely';
import type { Db } from '../src/db/client';
import type { AccountCode, ChannelCode, EntryKind, LineDirection } from '../src/db/types';
import { newId } from '../src/ids';
import { createMerchant } from '../src/modules/comercios';

export interface FixtureLine {
  acc: AccountCode;
  dir: LineDirection;
  amt: number;
  ch?: ChannelCode;
  cust?: string;
}

/** Comercio con sus 10 cuentas, un dueno y un dispositivo activo (listo para llamar la API). */
export async function seedMerchant(db: Db, userId: string, opts: { devices?: number } = {}) {
  const { merchantId } = await createMerchant(db, { userId, network: 'testnet', businessName: 'Tienda de prueba' });
  const deviceIds: string[] = [];
  for (let i = 0; i < (opts.devices ?? 1); i++) {
    const id = newId();
    deviceIds.push(id);
    await db
      .insertInto('devices')
      .values({
        id, merchant_id: merchantId, user_id: userId, key_kind: 'software_p256',
        public_key: Buffer.from(p256.getPublicKey(p256.utils.randomSecretKey(), false)), signer_registered_tx: null, revoked_at: null,
      })
      .execute();
  }
  return { merchantId, deviceIds };
}

/** Inserta un asiento con sus lineas en una transaccion (los triggers DB-02..DB-11 hacen el resto). */
export async function insertEntry(
  db: Db,
  input: { merchantId: string; deviceId?: string | null; id?: string; occurredAt: string; kind?: EntryKind; lines: FixtureLine[]; reverses?: string },
): Promise<string> {
  const id = input.id ?? newId();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('journal_entries')
      .values({
        id, merchant_id: input.merchantId, occurred_at: input.occurredAt, kind: input.kind ?? 'venta', origin: 'declarado',
        reverses_entry_id: input.reverses ?? null, external_source: null, external_ref: null, note: null,
        device_id: input.deviceId ?? null, created_by: null,
      })
      .execute();
    let n = 0;
    for (const l of input.lines) {
      n += 1;
      const acc = await tx
        .selectFrom('ledger_accounts')
        .select(['id', 'currency'])
        .where('merchant_id', '=', input.merchantId)
        .where('code', '=', l.acc)
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('journal_lines')
        .values({
          id: newId(), entry_id: id, line_no: n, account_id: acc.id, direction: l.dir, amount_minor: l.amt, currency: acc.currency,
          channel: l.ch ?? null, customer_id: l.cust ?? null,
        })
        .execute();
    }
    await sql`set constraints all immediate`.execute(tx);
  });
  return id;
}

export const venta = (amt: number): FixtureLine[] => [
  { acc: 'caja', dir: 'debe', amt, ch: 'efectivo' },
  { acc: 'ventas', dir: 'haber', amt },
];
