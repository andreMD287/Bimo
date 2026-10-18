/**
 * Recepcion de la firma (S-2) y ciclo de vida del sello (L-1..L-6, D-4..D-8) del spec 07 §1-§3.
 * Todo cambio de estado ocurre bajo el advisory lock del comercio.
 */
import type { Kysely } from 'kysely';
import { enqueue } from '../../db/outbox';
import type { Database } from '../../db/types';
import { AppError } from '../../errors';
import { countDayEntries } from '../ledger';
import { supersedeOpenRequest } from './firma';
import { withMerchantLock } from './lock';


/** Lo que cierre necesita del modulo stellar para recibir una firma (lo implementa el adaptador real o uno de prueba). */
export interface SealSigner {
  /** True si la firma P-256 (r ‖ s) del dueno es valida sobre la preimagen. */
  verify(publicKey: Buffer, preimageXdr: Buffer, signature: Buffer): boolean;
  /** Normaliza `s` a la mitad baja (low-S). */
  normalize(signature: Buffer): Buffer;
  /** Firma la entrada de autorizacion del atestador y devuelve su XDR. */
  signAttester(preimageXdr: Buffer): Promise<Buffer>;
}

export interface SubmitSignatureInput {
  merchantId: string;
  requestId: string;
  deviceId: string;
  ownerPublicKey: Buffer;
  signature: Buffer;
  signer: SealSigner;
  now: Date;
}

type Outcome = { ok: true } | { error: 'expired' | 'superseded' };

/**
 * S-2: `POST /signing/{id}/signature`. Vencida -> 409 signature_expired (S-3); reemplazada, o con asientos que cambiaron
 * desde que se preparo -> 409 request_superseded (S-4); firma que no corresponde -> 422 invalid_signature.
 */
export async function submitSignature(db: Kysely<Database>, input: SubmitSignatureInput): Promise<void> {
  const outcome = await withMerchantLock<Outcome>(db, input.merchantId, async (tx) => {
    const req = await tx.selectFrom('signing_requests').selectAll().where('id', '=', input.requestId).where('merchant_id', '=', input.merchantId).executeTakeFirst();
    if (!req) throw new AppError('not_found', 'Solicitud de firma no encontrada');
    if (req.status === 'firmada') return { ok: true }; // reintento de una firma ya recibida
    if (req.status === 'vencida') return { error: 'expired' };
    if (req.status === 'reemplazada') return { error: 'superseded' };

    if (req.expires_at.getTime() <= input.now.getTime()) {
      await supersedeOpenRequest(tx, input.merchantId, 'vencida', input.now); // S-3
      return { error: 'expired' };
    }
    // Los asientos del dia no pueden haber cambiado desde que se preparo el sello
    const seals = await tx
      .selectFrom('seals as s')
      .innerJoin('business_days as d', 'd.id', 's.day_id')
      .select(['s.id', 's.entry_count', 'd.id as day_id', 'd.business_date'])
      .where('s.signing_request_id', '=', req.id)
      .execute();
    for (const s of seals) {
      if ((await countDayEntries(tx, input.merchantId, s.business_date)) !== s.entry_count) {
        await supersedeOpenRequest(tx, input.merchantId, 'reemplazada', input.now); // S-4
        return { error: 'superseded' };
      }
    }
    if (!input.signer.verify(input.ownerPublicKey, req.preimage_xdr, input.signature)) {
      throw new AppError('invalid_signature', 'La firma no corresponde a esta solicitud');
    }
    const ownerSignature = input.signer.normalize(input.signature);
    const attesterEntry = await input.signer.signAttester(req.preimage_xdr);

    // S-2 / L-2 / D-4
    await tx.updateTable('signing_requests').set({ status: 'firmada', closed_at: input.now }).where('id', '=', req.id).execute();
    await tx
      .updateTable('seals')
      .set({ status: 'firmado', merchant_signature: ownerSignature, attester_signature: attesterEntry })
      .where('signing_request_id', '=', req.id)
      .execute();
    await tx
      .updateTable('business_days')
      .set({ status: 'firmado' })
      .where(
        'id',
        'in',
        seals.map((s) => s.day_id),
      )
      .execute();
    await enqueue(tx, 'seal.submit', { signing_request_id: req.id, merchant_id: input.merchantId, owner_public_key: input.ownerPublicKey.toString('hex') }, input.now);
    return { ok: true };
  });
  if ('error' in outcome) {
    if (outcome.error === 'expired') throw new AppError('signature_expired', 'La firma llego tarde; vuelve a pedirla');
    throw new AppError('request_superseded', 'Cambiaron los datos; vuelve a pedir la firma');
  }
}

// ---------------------------------------------------------------- ciclo de vida del sello (lo usa el worker)
export interface Submission {
  requestId: string;
  merchantId: string;
  expirationLedger: number;
  preimageXdr: Buffer;
  ownerSignature: Buffer | null;
  attesterEntry: Buffer | null;
  seals: Array<{
    id: string;
    dayId: string;
    businessDate: string;
    version: number;
    root: Buffer;
    entryCount: number;
    originFlags: number;
    amendReasonHash: Buffer | null;
    prevVersion: number;
    status: string;
    txHash: string | null;
  }>;
}

export async function loadSubmission(db: Kysely<Database>, requestId: string): Promise<Submission | null> {
  const req = await db.selectFrom('signing_requests').selectAll().where('id', '=', requestId).executeTakeFirst();
  if (!req) return null;
  const seals = await db
    .selectFrom('seals as s')
    .innerJoin('business_days as d', 'd.id', 's.day_id')
    .select(['s.id', 's.day_id', 'd.business_date', 's.version', 's.merkle_root', 's.entry_count', 's.origin_flags', 's.amend_reason_hash', 's.status', 's.tx_hash', 's.merchant_signature', 's.attester_signature'])
    .where('s.signing_request_id', '=', requestId)
    .orderBy('d.business_date')
    .execute();
  return {
    requestId,
    merchantId: req.merchant_id,
    expirationLedger: req.expiration_ledger,
    preimageXdr: req.preimage_xdr,
    ownerSignature: seals[0]?.merchant_signature ?? null,
    attesterEntry: seals[0]?.attester_signature ?? null,
    seals: seals.map((s) => ({
      id: s.id, dayId: s.day_id, businessDate: s.business_date, version: s.version, root: s.merkle_root, entryCount: s.entry_count,
      originFlags: s.origin_flags, amendReasonHash: s.amend_reason_hash, prevVersion: s.version - 1, status: s.status, txHash: s.tx_hash,
    })),
  };
}

/** L-3: el relayer/la red acepto la tx -> `enviado`, con el `tx_hash` compartido por todos los sellos de la solicitud. */
export async function markSent(db: Kysely<Database>, requestId: string, txHash: string): Promise<void> {
  await db.updateTable('seals').set({ status: 'enviado', tx_hash: txHash, error: null }).where('signing_request_id', '=', requestId).where('status', 'in', ['firmado', 'fallido']).execute();
}

/** L-4 + D-5/D-6: `confirmado`; cada dia queda `sellado` si no llegaron asientos, o `requiere_enmienda` si si. */
export async function confirmRequest(db: Kysely<Database>, input: { requestId: string; merchantId: string; txHash: string; ledger: number | null; now: Date }): Promise<void> {
  await withMerchantLock(db, input.merchantId, async (tx) => {
    const seals = await tx
      .selectFrom('seals as s')
      .innerJoin('business_days as d', 'd.id', 's.day_id')
      .select(['s.id', 's.day_id', 's.version', 's.entry_count', 'd.business_date', 's.status'])
      .where('s.signing_request_id', '=', input.requestId)
      .execute();
    for (const s of seals) {
      if (s.status === 'confirmado') continue;
      await tx
        .updateTable('seals')
        .set({ status: 'confirmado', tx_hash: input.txHash, ledger_seq: input.ledger, confirmed_at: input.now, error: null })
        .where('id', '=', s.id)
        .execute();
      const now = await countDayEntries(tx, input.merchantId, s.business_date);
      await tx
        .updateTable('business_days')
        .set({ status: now === s.entry_count ? 'sellado' : 'requiere_enmienda', current_seal_version: s.version })
        .where('id', '=', s.day_id)
        .execute();
    }
  });
}

/** L-5: la tx o el envio fallan -> `fallido` con el codigo corto del error. */
export async function failRequest(db: Kysely<Database>, requestId: string, error: string): Promise<void> {
  await db.updateTable('seals').set({ status: 'fallido', error }).where('signing_request_id', '=', requestId).where('status', 'in', ['firmado', 'enviado', 'fallido']).execute();
}

/**
 * L-6: la firma vencio sin enviarse. Se borran los sellos no confirmados y sus hojas, se anota el motivo en `audit_log`
 * y cada dia vuelve a `cerrado` (era la version 1, D-7) o a `requiere_enmienda` (era una enmienda, D-8).
 */
export async function discardRequest(db: Kysely<Database>, input: { requestId: string; merchantId: string; reason: string }): Promise<void> {
  await withMerchantLock(db, input.merchantId, async (tx) => {
    const seals = await tx
      .selectFrom('seals')
      .select(['id', 'day_id', 'version', 'status'])
      .where('signing_request_id', '=', input.requestId)
      .where('status', '!=', 'confirmado')
      .execute();
    for (const s of seals) {
      await tx.updateTable('business_days').set({ status: s.version === 1 ? 'cerrado' : 'requiere_enmienda' }).where('id', '=', s.day_id).where('status', '=', 'firmado').execute();
      await tx.deleteFrom('seals').where('id', '=', s.id).execute();
    }
    await tx
      .insertInto('audit_log')
      .values({ actor: 'worker.seal-submit', action: 'seal.discarded', target: input.requestId, detail: JSON.stringify({ reason: input.reason, seals: seals.length }) })
      .execute();
  });
}
