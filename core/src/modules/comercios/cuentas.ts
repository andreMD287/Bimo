/**
 * Estado de la cuenta Stellar del comercio y la cola `account.deploy` (spec 07 §4, A-2..A-5).
 * Todo acceso a `merchants`, `devices` y a los mensajes `account.deploy` del outbox pasa por aqui.
 */
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/types';

type Db = Kysely<Database>;

export interface DeployMessage {
  id: string;
  attempts: number;
  merchantId: string;
  deviceId: string;
}

export const DEPLOY_LEASE_MS = 2 * 60 * 1000;

/** Toma un mensaje pendiente y vencido (FOR UPDATE SKIP LOCKED) y lo "alquila" por unos minutos. */
export async function claimAccountDeploy(db: Db, now: Date): Promise<DeployMessage | null> {
  const res = await sql<{ id: string; attempts: number; payload: { merchant_id: string; device_id: string } }>`
    update outbox_messages
       set attempts = attempts + 1, next_attempt_at = ${new Date(now.getTime() + DEPLOY_LEASE_MS)}
     where id = (
       select id from outbox_messages
        where topic = 'account.deploy' and status = 'pendiente' and next_attempt_at <= ${now}
        order by created_at
        for update skip locked
        limit 1)
    returning id, attempts, payload`.execute(db);
  const row = res.rows[0];
  return row ? { id: row.id, attempts: row.attempts, merchantId: row.payload.merchant_id, deviceId: row.payload.device_id } : null;
}

export interface DeployContext {
  merchant: { accountStatus: 'pending' | 'deploying' | 'ready' | 'failed'; stellarAddress: string | null } | null;
  device: { publicKey: Buffer; revoked: boolean } | null;
}

export async function getDeployContext(db: Db, merchantId: string, deviceId: string): Promise<DeployContext> {
  const m = await db.selectFrom('merchants').select(['account_status', 'stellar_address']).where('id', '=', merchantId).executeTakeFirst();
  const d = await db.selectFrom('devices').select(['public_key', 'revoked_at']).where('id', '=', deviceId).executeTakeFirst();
  return {
    merchant: m ? { accountStatus: m.account_status, stellarAddress: m.stellar_address } : null,
    device: d ? { publicKey: d.public_key, revoked: d.revoked_at !== null } : null,
  };
}

export async function closeDeployMessage(db: Db, messageId: string): Promise<void> {
  await db.updateTable('outbox_messages').set({ status: 'enviado' }).where('id', '=', messageId).execute();
}

/** `pending` -> `deploying`, o A-5: `failed` -> `deploying` (los intentos vuelven a contar desde 1). */
export async function startDeploying(db: Db, messageId: string, merchantId: string, fromFailed: boolean): Promise<void> {
  await db.updateTable('merchants').set({ account_status: 'deploying' }).where('id', '=', merchantId).execute();
  if (fromFailed) await db.updateTable('outbox_messages').set({ attempts: 1 }).where('id', '=', messageId).execute();
}

/** A-3: despliegue confirmado. */
export async function completeDeploy(
  db: Db,
  input: { messageId: string; merchantId: string; deviceId: string; address: string; txHash: string | null },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx.updateTable('merchants').set({ stellar_address: input.address, account_status: 'ready' }).where('id', '=', input.merchantId).execute();
    if (input.txHash) await tx.updateTable('devices').set({ signer_registered_tx: input.txHash }).where('id', '=', input.deviceId).execute();
    await tx.updateTable('outbox_messages').set({ status: 'enviado', last_error: null }).where('id', '=', input.messageId).execute();
  });
}

/** Un fallo que todavia no llega a A-4: se reintenta mas tarde. */
export async function retryDeployLater(db: Db, messageId: string, reason: string, nextAttemptAt: Date): Promise<void> {
  await db.updateTable('outbox_messages').set({ last_error: reason, next_attempt_at: nextAttemptAt }).where('id', '=', messageId).execute();
}

/** A-4: 5 fallos seguidos -> `failed` + alerta. El mensaje sigue pendiente para el reintento horario (A-5). */
export async function failDeploy(
  db: Db,
  input: { messageId: string; merchantId: string; reason: string; attempts: number; nextAttemptAt: Date; permanent: boolean },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx.updateTable('merchants').set({ account_status: 'failed' }).where('id', '=', input.merchantId).execute();
    await tx
      .updateTable('outbox_messages')
      .set({ last_error: input.reason, next_attempt_at: input.nextAttemptAt, ...(input.permanent ? { status: 'fallido' as const } : {}) })
      .where('id', '=', input.messageId)
      .execute();
    await tx
      .insertInto('audit_log')
      .values({
        actor: 'worker.account-deploy',
        action: 'alert.account_deploy_failed',
        target: input.merchantId,
        detail: JSON.stringify({ reason: input.reason, attempts: input.attempts }),
      })
      .execute();
  });
}
