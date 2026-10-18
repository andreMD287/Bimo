/**
 * Modulo comercios (spec 06 §3.1, spec 07 §4 A-1/A-2, spec 03 §6 pasos 2 y 3).
 * Solo habla con sus tablas: merchants, merchant_profiles, merchant_members, devices, device_challenges,
 * ledger_accounts y la cola outbox_messages (para encolar `account.deploy`).
 */
import { randomBytes } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import type { Kysely, Transaction } from 'kysely';
import { AppError } from '../../errors';
import type { Database, KeyKind, MemberRole } from '../../db/types';
import { newId } from '../../ids';

type Tx = Transaction<Database> | Kysely<Database>;

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Cuentas del ledger que se crean con el comercio (spec 01 §4.2). `adelantos_por_pagar` llega en el inc. 3. */
export const LEDGER_ACCOUNTS = [
  { code: 'caja', type: 'activo', currency: 'COP' },
  { code: 'por_cobrar_clientes', type: 'activo', currency: 'COP' },
  { code: 'por_cobrar_psp', type: 'activo', currency: 'COP' },
  { code: 'cuenta_socio', type: 'activo', currency: 'COP' },
  { code: 'bolsillo_usd', type: 'activo', currency: 'USDC' },
  { code: 'ventas', type: 'ingreso', currency: 'COP' },
  { code: 'comisiones', type: 'gasto', currency: 'COP' },
  { code: 'diferencias_caja', type: 'gasto', currency: 'COP' },
  { code: 'gastos', type: 'gasto', currency: 'COP' },
  { code: 'retiros_dueno', type: 'patrimonio', currency: 'COP' },
] as const;

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

/** A-1: POST /merchants. Crea comercio, perfil, miembro (dueno) y las 10 cuentas en una transaccion. */
export async function createMerchant(
  db: Kysely<Database>,
  input: { userId: string; network: 'testnet' | 'mainnet'; businessName: string; ownerName?: string | undefined; city?: string | undefined },
): Promise<{ merchantId: string }> {
  const existing = await db.selectFrom('merchant_members').select('merchant_id').where('user_id', '=', input.userId).executeTakeFirst();
  if (existing) throw new AppError('already_exists', 'Este usuario ya tiene un comercio');
  const merchantId = newId();
  try {
    await db.transaction().execute(async (tx) => {
      await tx.insertInto('merchants').values({ id: merchantId, stellar_address: null, network: input.network, forgotten_at: null }).execute();
      await tx
        .insertInto('merchant_profiles')
        .values({ merchant_id: merchantId, business_name: input.businessName, owner_name: input.ownerName ?? null, phone: null, city: input.city ?? null })
        .execute();
      await tx.insertInto('merchant_members').values({ merchant_id: merchantId, user_id: input.userId, role: 'dueno' }).execute();
      await tx
        .insertInto('ledger_accounts')
        .values(LEDGER_ACCOUNTS.map((a) => ({ id: newId(), merchant_id: merchantId, code: a.code, type: a.type, currency: a.currency })))
        .execute();
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('already_exists', 'Este usuario ya tiene un comercio');
    throw e;
  }
  return { merchantId };
}

export async function merchantOfUser(db: Tx, userId: string): Promise<{ merchantId: string; role: MemberRole } | null> {
  const row = await db.selectFrom('merchant_members').select(['merchant_id', 'role']).where('user_id', '=', userId).executeTakeFirst();
  return row ? { merchantId: row.merchant_id, role: row.role } : null;
}

/** POST /devices/challenge: 32 bytes aleatorios, un solo uso, vencen en 5 minutos. */
export async function issueChallenge(
  db: Tx,
  input: { userId: string; purpose: 'register_device' | 'delete_merchant'; now: Date },
): Promise<{ challengeId: string; challenge: Buffer; expiresAt: Date }> {
  if (!(await merchantOfUser(db, input.userId))) throw new AppError('forbidden', 'Primero crea tu comercio');
  const challengeId = newId();
  const challenge = randomBytes(32);
  const expiresAt = new Date(input.now.getTime() + CHALLENGE_TTL_MS);
  await db
    .insertInto('device_challenges')
    .values({ id: challengeId, user_id: input.userId, purpose: input.purpose, challenge, expires_at: expiresAt, used_at: null, created_at: input.now })
    .execute();
  return { challengeId, challenge, expiresAt };
}

/** Consume el reto de forma atomica; si no existe, no es del usuario, vencio o ya se uso: 422 invalid_challenge. */
export async function consumeChallenge(
  db: Tx,
  input: { userId: string; challengeId: string; purpose: 'register_device' | 'delete_merchant'; now: Date },
): Promise<Buffer> {
  const row = await db
    .updateTable('device_challenges')
    .set({ used_at: input.now })
    .where('id', '=', input.challengeId)
    .where('user_id', '=', input.userId)
    .where('purpose', '=', input.purpose)
    .where('used_at', 'is', null)
    .where('expires_at', '>', input.now)
    .returning('challenge')
    .executeTakeFirst();
  if (!row) throw new AppError('invalid_challenge', 'El reto no existe, vencio o ya se uso');
  return row.challenge;
}

/**
 * Prueba de posesion (spec 03 §6 paso 2): ECDSA P-256 sobre SHA-256(reto), como firma CryptoKit y la llave de
 * software (`@noble/curves` con prehash). Se acepta cualquier `s` (el Secure Enclave no normaliza a low-S).
 */
export function verifyChallengeSignature(publicKey: Uint8Array, challenge: Uint8Array, signature: Uint8Array): boolean {
  try {
    return p256.verify(signature, challenge, publicKey, { prehash: true, lowS: false });
  } catch {
    return false;
  }
}

/** Devuelve la clave si es un punto valido de P-256 (65 bytes SEC1 sin comprimir), o null. */
export function parsePublicKey(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length !== 65 || bytes[0] !== 0x04) return null;
  try {
    p256.Point.fromBytes(bytes);
    return bytes;
  } catch {
    return null;
  }
}

/** A-2: POST /devices. Guarda el dispositivo y, si es el primero, pasa la cuenta a `deploying` y encola `account.deploy`. */
export async function registerDevice(
  db: Kysely<Database>,
  input: {
    userId: string;
    deviceId: string;
    challengeId: string;
    publicKey: Buffer;
    keyKind: KeyKind;
    signature: Buffer;
    now: Date;
  },
): Promise<{ deviceId: string; accountStatus: 'pending' | 'deploying' | 'ready' | 'failed' }> {
  const membership = await merchantOfUser(db, input.userId);
  if (!membership) throw new AppError('forbidden', 'Primero crea tu comercio');
  const key = parsePublicKey(input.publicKey);
  if (!key) throw new AppError('invalid_request', 'La clave publica debe ser P-256 sin comprimir (65 bytes)');

  // El reto se consume aunque la firma sea mala: no se puede probar firmas contra un mismo reto.
  const challenge = await consumeChallenge(db, { userId: input.userId, challengeId: input.challengeId, purpose: 'register_device', now: input.now });
  if (!verifyChallengeSignature(key, challenge, input.signature)) {
    throw new AppError('invalid_signature', 'La firma no corresponde a la clave publica');
  }

  try {
    return await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('devices')
        .values({
          id: input.deviceId,
          merchant_id: membership.merchantId,
          user_id: input.userId,
          key_kind: input.keyKind,
          public_key: Buffer.from(key),
          signer_registered_tx: null,
          revoked_at: null,
        })
        .execute();
      // A-2: pending -> deploying (solo el primer dispositivo; el UPDATE condicionado lo hace atomico)
      const moved = await tx
        .updateTable('merchants')
        .set({ account_status: 'deploying' })
        .where('id', '=', membership.merchantId)
        .where('account_status', '=', 'pending')
        .returning('account_status')
        .executeTakeFirst();
      if (moved) {
        await tx
          .insertInto('outbox_messages')
          .values({
            id: newId(),
            topic: 'account.deploy',
            payload: JSON.stringify({ merchant_id: membership.merchantId, device_id: input.deviceId }),
            next_attempt_at: input.now,
          })
          .execute();
      }
      const m = await tx.selectFrom('merchants').select('account_status').where('id', '=', membership.merchantId).executeTakeFirstOrThrow();
      return { deviceId: input.deviceId, accountStatus: m.account_status };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('already_exists', 'El dispositivo o la clave ya estan registrados');
    throw e;
  }
}

export interface MerchantMe {
  merchantId: string;
  businessName: string;
  stellarAddress: string | null;
  accountStatus: 'pending' | 'deploying' | 'ready' | 'failed';
  role: MemberRole;
}

export async function getMerchantMe(db: Tx, merchantId: string, role: MemberRole): Promise<MerchantMe> {
  const row = await db
    .selectFrom('merchants as m')
    .innerJoin('merchant_profiles as p', 'p.merchant_id', 'm.id')
    .select(['m.id', 'm.stellar_address', 'm.account_status', 'p.business_name'])
    .where('m.id', '=', merchantId)
    .executeTakeFirst();
  if (!row) throw new AppError('not_found', 'Comercio no encontrado');
  return {
    merchantId: row.id,
    businessName: row.business_name,
    stellarAddress: row.stellar_address,
    accountStatus: row.account_status,
    role,
  };
}

/** Direccion de la smart account y su estado (para los sellos: solo se firma con la cuenta `ready`). */
export async function getAccountInfo(
  db: Tx,
  merchantId: string,
): Promise<{ stellarAddress: string | null; accountStatus: 'pending' | 'deploying' | 'ready' | 'failed' } | null> {
  const row = await db.selectFrom('merchants').select(['stellar_address', 'account_status']).where('id', '=', merchantId).executeTakeFirst();
  return row ? { stellarAddress: row.stellar_address, accountStatus: row.account_status } : null;
}

/** Clave publica (65 bytes) de un dispositivo activo del comercio; null si no existe o esta revocado. */
export async function getDevicePublicKey(db: Tx, merchantId: string, deviceId: string): Promise<Buffer | null> {
  const row = await db
    .selectFrom('devices')
    .select(['public_key', 'revoked_at'])
    .where('merchant_id', '=', merchantId)
    .where('id', '=', deviceId)
    .executeTakeFirst();
  return row && row.revoked_at === null ? row.public_key : null;
}

/** Nombre del negocio y direccion de la cuenta: lo unico del comercio que ve un verificador (spec 05 §1). */
export async function getPublicProfile(db: Tx, merchantId: string): Promise<{ businessName: string; stellarAddress: string | null } | null> {
  const row = await db
    .selectFrom('merchants as m')
    .innerJoin('merchant_profiles as p', 'p.merchant_id', 'm.id')
    .select(['p.business_name', 'm.stellar_address'])
    .where('m.id', '=', merchantId)
    .executeTakeFirst();
  return row ? { businessName: row.business_name, stellarAddress: row.stellar_address } : null;
}
