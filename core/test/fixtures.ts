import { randomBytes } from 'node:crypto';
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
    await tx.insertInto('entry_salts').values({ entry_id: id, salt: randomBytes(32) }).execute(); // la sal la crea core al recibir el asiento
    await sql`set constraints all immediate`.execute(tx);
  });
  return id;
}

export const venta = (amt: number): FixtureLine[] => [
  { acc: 'caja', dir: 'debe', amt, ch: 'efectivo' },
  { acc: 'ventas', dir: 'haber', amt },
];

/** El dia de ejemplo del spec 02 §9 (5 asientos, sales del vector) para un comercio con el merchant_id del vector. */
export async function seedSpecDay(db: Db, userId: string): Promise<{ merchantId: string; entryIds: string[]; root: string; vectors: SpecVectors }> {
  const { readFileSync } = await import('node:fs');
  const { LEDGER_ACCOUNTS } = await import('../src/modules/comercios');
  const v = JSON.parse(readFileSync(new URL('../../docs/specs/02-vectores.json', import.meta.url), 'utf8')) as SpecVectors;
  const merchantId = '01JA2B3C4D5E6F7G8H9J0KMNPQ';
  await db.insertInto('merchants').values({ id: merchantId, stellar_address: 'CVECTORES'.padEnd(56, 'A'), network: 'testnet', account_status: 'ready', forgotten_at: null }).execute();
  await db.insertInto('merchant_members').values({ merchant_id: merchantId, user_id: userId, role: 'dueno' }).execute();
  await db.insertInto('merchant_profiles').values({ merchant_id: merchantId, business_name: 'Tienda Dona Marta', owner_name: 'Marta Perez', phone: '3001234567', city: 'Bogota' }).execute();
  const accountIds = new Map<string, string>();
  for (const a of LEDGER_ACCOUNTS) {
    const id = newId();
    accountIds.set(a.code, id);
    await db.insertInto('ledger_accounts').values({ id, merchant_id: merchantId, code: a.code, type: a.type, currency: a.currency }).execute();
  }
  await db.insertInto('customers').values({ id: '01JA9Y000000000000000000R0', merchant_id: merchantId, display_name: 'Dona Rosa Perez', phone: '3109998888', created_at: new Date(), updated_at: new Date() }).execute();
  const byId = new Map(v.entries.map((e) => [e.entry.id, e]));
  for (const id of v.day_example.entry_ids) {
    const { entry: e, salt } = byId.get(id) as SpecVectors['entries'][number];
    await db.transaction().execute(async (tx) => {
      await tx.insertInto('journal_entries').values({
        id: e.id, merchant_id: merchantId, occurred_at: e.occurred_at, kind: e.kind, origin: e.origin, reverses_entry_id: e.reverses_entry_id ?? null,
        external_source: e.external_source ?? null, external_ref: e.external_ref ?? null, note: 'nota privada del dueno', device_id: null, created_by: null,
      }).execute();
      for (const l of e.lines) {
        await tx.insertInto('journal_lines').values({
          id: newId(), entry_id: e.id, line_no: l.line_no, account_id: accountIds.get(l.account_code) as string, direction: l.direction,
          amount_minor: l.amount_minor, currency: l.currency, channel: (l.channel ?? null) as ChannelCode | null, customer_id: l.customer_id ?? null,
        }).execute();
      }
      await tx.insertInto('entry_salts').values({ entry_id: e.id, salt: Buffer.from(salt, 'hex') }).execute();
    });
  }
  return { merchantId, entryIds: v.day_example.entry_ids, root: v.day_example.root, vectors: v };
}

export interface SpecVectors {
  entries: Array<{
    entry: {
      id: string; occurred_at: string; kind: EntryKind; origin: 'declarado' | 'verificado'; reverses_entry_id?: string; external_source?: string; external_ref?: string;
      lines: Array<{ line_no: number; account_code: AccountCode; direction: LineDirection; amount_minor: number; currency: 'COP' | 'USDC'; channel?: string; customer_id?: string }>;
    };
    salt: string;
  }>;
  day_example: { entry_ids: string[]; root: string };
}
