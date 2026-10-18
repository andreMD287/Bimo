/**
 * Worker de envio de sellos (spec 07 §3, L-3..L-6 y D-5..D-8). Toma `seal.submit` del outbox y, por el puerto
 * `Enviador` (via `SealSubmitter`), envia `seal_batch` con la firma del dueno y la del atestador:
 *   L-3  firmado/fallido -> enviado       (la red acepta la tx; se guarda el tx_hash compartido)
 *   L-4  enviado -> confirmado            (D-5 sellado, o D-6 requiere_enmienda si llegaron asientos)
 *   L-5  firmado/enviado -> fallido       (reintento con backoff y la misma firma)
 *   L-6  fallido y ledger >= expiracion   (se descarta: D-7 cerrado, o D-8 requiere_enmienda)
 */
import type { Logger } from 'pino';
import { claim, complete, retryLater } from '../db/outbox';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import { confirmRequest, discardRequest, failRequest, loadSubmission, markSent, type Submission } from '../modules/cierre';
import { getAccountInfo } from '../modules/comercios';
import type { SealSubmitter } from '../modules/stellar';
import type { Worker } from './index';

export const TOPIC = 'seal.submit';
const LEASE_MS = 2 * 60 * 1000;
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
/** Contract#1 = AlreadySealed: la tx de un intento anterior si llego a la cadena (spec 03 §4.3). */
const ALREADY_SEALED = 'Contract#1';

export interface SealSubmitDeps {
  db: Db;
  submitter: SealSubmitter;
  now?: () => Date;
  log?: Logger;
}

const errCode = (e: unknown) => (e instanceof AppError ? e.code : e instanceof Error ? e.name : 'error');
const backoff = (attempts: number) => BACKOFF_MS[Math.min(Math.max(attempts, 1) - 1, BACKOFF_MS.length - 1)] as number;

/** Procesa un mensaje `seal.submit`; devuelve false si no habia ninguno listo. */
export async function processNextSealSubmit(deps: SealSubmitDeps): Promise<boolean> {
  const now = (deps.now ?? (() => new Date()))();
  const msg = await claim<{ signing_request_id: string; merchant_id: string; owner_public_key: string }>(deps.db, TOPIC, now, LEASE_MS);
  if (!msg) return false;
  const { signing_request_id: requestId, merchant_id: merchantId } = msg.payload;
  const ownerPublicKey = Buffer.from(msg.payload.owner_public_key, 'hex');

  const sub = await loadSubmission(deps.db, requestId);
  if (!sub || sub.seals.length === 0 || sub.seals.every((s) => s.status === 'confirmado')) {
    await complete(deps.db, msg.id);
    return true;
  }
  try {
    await advance(deps, sub, merchantId, ownerPublicKey, now);
    const after = await loadSubmission(deps.db, requestId);
    if (!after || after.seals.length === 0 || after.seals.every((s) => s.status === 'confirmado')) await complete(deps.db, msg.id);
    else await retryLater(deps.db, msg.id, after.seals[0]?.status === 'fallido' ? 'fallido' : 'pendiente', new Date(now.getTime() + backoff(msg.attempts)));
  } catch (e) {
    // La red no responde: nada cambia, se reintenta
    await retryLater(deps.db, msg.id, errCode(e), new Date(now.getTime() + backoff(msg.attempts)));
    deps.log?.warn({ merchant_id: merchantId, reason: errCode(e) }, 'envio de sello pospuesto');
  }
  return true;
}

async function advance(deps: SealSubmitDeps, sub: Submission, merchantId: string, ownerPublicKey: Buffer, now: Date): Promise<void> {
  const ledger = await deps.submitter.latestLedger();

  // Una tx ya enviada: se consulta su resultado
  const sent = sub.seals.find((s) => s.status === 'enviado' && s.txHash);
  if (sent?.txHash) {
    const st = await deps.submitter.status(sent.txHash);
    if (st === 'confirmado') return confirm(deps, sub, merchantId, sent.txHash, null, now);
    if (st === 'fallido') return void (await failRequest(deps.db, sub.requestId, 'TxFailed'));
    if (ledger >= sub.expirationLedger + 5) return void (await failRequest(deps.db, sub.requestId, 'TxNotFound')); // spec 07: despues de la expiracion es fallo (L-5)
    return; // sigue pendiente
  }

  // L-6: la firma vencio sin llegar a la red
  if (ledger >= sub.expirationLedger) {
    await discardRequest(deps.db, { requestId: sub.requestId, merchantId, reason: 'firma_vencida' });
    deps.log?.warn({ merchant_id: merchantId }, 'sello descartado: la firma vencio antes de enviarse');
    return;
  }

  if (!sub.ownerSignature || !sub.attesterEntry) throw new Error('solicitud firmada sin firmas guardadas');
  const res = await deps.submitter.submit({
    merchantAddress: await merchantAddress(deps.db, merchantId),
    items: sub.seals.map((s) => ({
      date: Number(s.businessDate.replace(/-/g, '')),
      root: s.root,
      entryCount: s.entryCount,
      originFlags: s.originFlags,
      amend: s.version > 1 && s.amendReasonHash ? { prevVersion: s.prevVersion, reasonHash: s.amendReasonHash } : undefined,
    })),
    preimageXdr: sub.preimageXdr,
    ownerSignature: sub.ownerSignature,
    ownerPublicKey,
    attesterEntry: sub.attesterEntry,
    onSubmitted: async (hash) => markSent(deps.db, sub.requestId, hash), // L-3
  });
  if (res.status === 'confirmado') return confirm(deps, sub, merchantId, res.hash, res.ledger ?? null, now);
  if (res.error === ALREADY_SEALED) {
    // un intento anterior si llego: se adopta como confirmado si hay hash conocido
    const prior = sub.seals.find((s) => s.txHash)?.txHash;
    if (prior) return confirm(deps, sub, merchantId, prior, null, now);
  }
  await failRequest(deps.db, sub.requestId, res.error ?? 'TxFailed'); // L-5
}

async function confirm(deps: SealSubmitDeps, sub: Submission, merchantId: string, txHash: string, ledger: number | null, now: Date): Promise<void> {
  await confirmRequest(deps.db, { requestId: sub.requestId, merchantId, txHash, ledger, now });
  deps.log?.info({ merchant_id: merchantId }, 'sello confirmado');
}

async function merchantAddress(db: Db, merchantId: string): Promise<string> {
  const info = await getAccountInfo(db, merchantId);
  if (!info?.stellarAddress) throw new Error('el comercio no tiene cuenta');
  return info.stellarAddress;
}

export function createSealSubmitWorker(deps: SealSubmitDeps): Worker {
  return {
    name: 'seal-submit',
    intervalMs: 3000,
    async tick() {
      while (await processNextSealSubmit(deps)) {
        /* siguiente mensaje */
      }
    },
  };
}
