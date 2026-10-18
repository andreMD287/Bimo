/**
 * Worker de despliegue de `bimo-account` (spec 07 §4, transiciones A-2..A-5). Toma mensajes `account.deploy` del
 * outbox (FOR UPDATE SKIP LOCKED, spec 08 §2) y orquesta: modulo `comercios` (estado) + modulo `stellar` (red).
 *   A-3: despliegue confirmado  -> ready (guarda stellar_address)
 *   A-4: 5 fallos seguidos      -> failed + alerta (audit_log); el mensaje se reintenta cada hora
 *   A-5: failed + reintento     -> deploying
 */
import type { Logger } from 'pino';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import {
  claimAccountDeploy,
  closeDeployMessage,
  completeDeploy,
  failDeploy,
  getDeployContext,
  retryDeployLater,
  startDeploying,
} from '../modules/comercios';
import type { AccountDeployer } from '../modules/stellar';
import type { Worker } from './index';

export const MAX_FAILURES = 5; // A-4
export const RETRY_AFTER_FAILED_MS = 60 * 60 * 1000; // A-5: cada hora
const BACKOFF_MS = [10_000, 30_000, 60_000, 120_000, 300_000];

/** Solo un codigo corto para el log y `last_error`: nunca el mensaje (puede traer datos). */
const errName = (e: unknown) => (e instanceof AppError ? e.code : e instanceof Error ? e.name : 'error');

export interface AccountDeployDeps {
  db: Db;
  deployer: AccountDeployer;
  now?: () => Date;
  log?: Logger;
}

/** Procesa un mensaje; devuelve false si no habia ninguno listo. */
export async function processNextAccountDeploy(deps: AccountDeployDeps): Promise<boolean> {
  const now = (deps.now ?? (() => new Date()))();
  const msg = await claimAccountDeploy(deps.db, now);
  if (!msg) return false;

  const ctx = await getDeployContext(deps.db, msg.merchantId, msg.deviceId);
  if (!ctx.merchant || ctx.merchant.stellarAddress || ctx.merchant.accountStatus === 'ready') {
    await closeDeployMessage(deps.db, msg.id); // ya estaba hecho
    return true;
  }
  if (!ctx.device || ctx.device.revoked) {
    await failDeploy(deps.db, {
      messageId: msg.id, merchantId: msg.merchantId, reason: 'dispositivo_no_disponible', attempts: msg.attempts,
      nextAttemptAt: new Date(now.getTime() + RETRY_AFTER_FAILED_MS), permanent: true,
    });
    return true;
  }

  const fromFailed = ctx.merchant.accountStatus === 'failed';
  const attempts = fromFailed ? 1 : msg.attempts;
  if (fromFailed || ctx.merchant.accountStatus === 'pending') {
    await startDeploying(deps.db, msg.id, msg.merchantId, fromFailed); // A-5 (o pending -> deploying)
  }

  try {
    const out = await deps.deployer.deploy({ merchantId: msg.merchantId, publicKey: ctx.device.publicKey });
    await completeDeploy(deps.db, { messageId: msg.id, merchantId: msg.merchantId, deviceId: msg.deviceId, address: out.address, txHash: out.txHash });
    deps.log?.info({ merchant_id: msg.merchantId }, 'cuenta desplegada');
  } catch (e) {
    const reason = errName(e);
    if (attempts >= MAX_FAILURES) {
      await failDeploy(deps.db, {
        messageId: msg.id, merchantId: msg.merchantId, reason, attempts,
        nextAttemptAt: new Date(now.getTime() + RETRY_AFTER_FAILED_MS), permanent: false,
      });
      deps.log?.error({ merchant_id: msg.merchantId, reason }, 'ALERTA: no se pudo desplegar la cuenta');
    } else {
      const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] as number;
      await retryDeployLater(deps.db, msg.id, reason, new Date(now.getTime() + wait));
    }
  }
  return true;
}

export function createAccountDeployWorker(deps: AccountDeployDeps): Worker {
  return {
    name: 'account-deploy',
    intervalMs: 3000,
    async tick() {
      while (await processNextAccountDeploy(deps)) {
        /* siguiente mensaje */
      }
    },
  };
}
