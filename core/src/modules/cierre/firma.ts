/**
 * Solicitudes de firma y sellos preparados (spec 07 §2 S-1, S-3, S-4; spec 03 §5.1, §5.5; spec 02 §4-§7).
 * Hay como maximo una solicitud `abierta` por comercio. Los cambios de estado ocurren bajo el advisory lock.
 */
import { amendReasonHash, encodeEntry, leafHash, merkleRoot, originFlags } from '@bimo/shared';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../../db/types';
import { newId } from '../../ids';
import { getAccountInfo } from '../comercios';
import { loadDayEntriesForSeal } from '../ledger';
import type { SealItemInput, SealPreparer } from '../stellar';
import { withMerchantLock } from './lock';

type Tx = Transaction<Database>;

export const MAX_DAYS_PER_REQUEST = 14; // spec 03 §4.3 y §5.5

export interface PendingView {
  signing_request_id: string;
  preimage_xdr: string; // base64
  items: Array<{ date: string; entry_count: number; is_amend: boolean }>;
  expiration_ledger: number;
  expires_at: string;
}

/**
 * S-3 / S-4: cierra la solicitud abierta (`vencida` o `reemplazada`) y borra sus sellos `preparado` y sus hojas;
 * nunca llegaron a la cadena. Devuelve true si habia una abierta.
 */
export async function supersedeOpenRequest(tx: Tx, merchantId: string, status: 'vencida' | 'reemplazada', now: Date): Promise<boolean> {
  const open = await tx
    .selectFrom('signing_requests')
    .select('id')
    .where('merchant_id', '=', merchantId)
    .where('status', '=', 'abierta')
    .forUpdate()
    .executeTakeFirst();
  if (!open) return false;
  await tx.deleteFrom('seals').where('signing_request_id', '=', open.id).where('status', '=', 'preparado').execute();
  await tx.updateTable('signing_requests').set({ status, closed_at: now }).where('id', '=', open.id).execute();
  return true;
}

/** D-10 / S-4: llega un asiento de un dia incluido en la solicitud abierta -> se reemplaza. */
export async function supersedeIfAffected(db: Kysely<Database>, merchantId: string, businessDate: string, now: Date): Promise<boolean> {
  return withMerchantLock(db, merchantId, async (tx) => {
    const hit = await tx
      .selectFrom('signing_requests as r')
      .innerJoin('seals as s', 's.signing_request_id', 'r.id')
      .innerJoin('business_days as d', 'd.id', 's.day_id')
      .select('r.id')
      .where('r.merchant_id', '=', merchantId)
      .where('r.status', '=', 'abierta')
      .where('d.business_date', '=', businessDate)
      .executeTakeFirst();
    if (!hit) return false;
    return supersedeOpenRequest(tx, merchantId, 'reemplazada', now);
  });
}

async function viewOf(tx: Tx | Kysely<Database>, requestId: string): Promise<PendingView> {
  const r = await tx.selectFrom('signing_requests').selectAll().where('id', '=', requestId).executeTakeFirstOrThrow();
  const seals = await tx
    .selectFrom('seals as s')
    .innerJoin('business_days as d', 'd.id', 's.day_id')
    .select(['d.business_date', 's.entry_count', 's.version'])
    .where('s.signing_request_id', '=', requestId)
    .orderBy('d.business_date')
    .execute();
  return {
    signing_request_id: r.id,
    preimage_xdr: Buffer.from(r.preimage_xdr).toString('base64'),
    items: seals.map((s) => ({ date: s.business_date, entry_count: s.entry_count, is_amend: s.version > 1 })),
    expiration_ledger: r.expiration_ledger,
    expires_at: r.expires_at.toISOString(),
  };
}

const dateNumber = (d: string) => Number(d.replace(/-/g, ''));

/**
 * S-1 (GET /signing/pending o close): toma hasta 14 dias `cerrado`/`requiere_enmienda` (los mas viejos primero),
 * calcula la raiz Merkle de cada uno con `shared`, guarda `seal_leaves` y un `seals` en `preparado` con la siguiente
 * version, simula `seal_batch` y guarda la preimagen. Devuelve null si no hay nada que firmar o la cuenta no esta lista.
 */
export async function ensureSigningRequest(
  db: Kysely<Database>,
  input: { merchantId: string; preparer: SealPreparer; now: Date },
): Promise<PendingView | null> {
  return withMerchantLock(db, input.merchantId, async (tx) => {
    const open = await tx
      .selectFrom('signing_requests')
      .selectAll()
      .where('merchant_id', '=', input.merchantId)
      .where('status', '=', 'abierta')
      .executeTakeFirst();
    if (open) {
      if (open.expires_at.getTime() > input.now.getTime()) return viewOf(tx, open.id);
      await supersedeOpenRequest(tx, input.merchantId, 'vencida', input.now); // S-3
    }

    const account = await getAccountInfo(tx, input.merchantId);
    if (!account || account.accountStatus !== 'ready' || !account.stellarAddress) return null; // los dias esperan (spec 07 §4)

    const days = await tx
      .selectFrom('business_days')
      .selectAll()
      .where('merchant_id', '=', input.merchantId)
      .where('status', 'in', ['cerrado', 'requiere_enmienda'])
      .orderBy('business_date')
      .limit(MAX_DAYS_PER_REQUEST)
      .execute();
    if (days.length === 0) return null;

    const prepared: Array<{ dayId: string; version: number; item: SealItemInput; leaves: Array<{ entryId: string; hash: Buffer }>; root: Buffer; originFlags: number; reason: Buffer | null }> = [];
    for (const day of days) {
      const rows = await loadDayEntriesForSeal(tx, input.merchantId, day.business_date);
      const leafHashes = rows.map((r) => leafHash(r.salt, encodeEntry({ ...r.entry, merchant_id: input.merchantId })));
      const root = Buffer.from(merkleRoot(leafHashes));
      const flags = originFlags(rows.map((r) => ({ origin: r.entry.origin, clock_suspect: r.entry.clock_suspect })));
      const version = day.current_seal_version + 1;
      let amend: SealItemInput['amend'];
      let reason: Buffer | null = null;
      if (version > 1) {
        // Enmienda (spec 02 §7): los asientos agregados desde la version vigente
        const prev = await tx.selectFrom('seals').select('id').where('day_id', '=', day.id).where('version', '=', day.current_seal_version).executeTakeFirst();
        const prevLeaves = prev ? await tx.selectFrom('seal_leaves').select('entry_id').where('seal_id', '=', prev.id).execute() : [];
        const before = new Set(prevLeaves.map((l) => l.entry_id));
        const added = rows.map((r) => r.entry.id).filter((id) => !before.has(id));
        reason = Buffer.from(amendReasonHash(added));
        amend = { prevVersion: day.current_seal_version, reasonHash: reason };
      }
      prepared.push({
        dayId: day.id,
        version,
        root,
        originFlags: flags,
        reason,
        leaves: rows.map((r, i) => ({ entryId: r.entry.id, hash: Buffer.from(leafHashes[i] as Uint8Array) })),
        item: { date: dateNumber(day.business_date), root, entryCount: rows.length, originFlags: flags, amend },
      });
    }

    // Simula seal_batch y arma la preimagen (si la red no responde, esto lanza y no queda nada guardado)
    const signing = await input.preparer.prepare({ merchantAddress: account.stellarAddress, items: prepared.map((p) => p.item), now: input.now });
    const requestId = newId();
    await tx
      .insertInto('signing_requests')
      .values({
        id: requestId, merchant_id: input.merchantId, preimage_xdr: signing.preimageXdr, expiration_ledger: signing.expirationLedger,
        expires_at: signing.expiresAt, created_at: input.now, closed_at: null,
      })
      .execute();
    for (const p of prepared) {
      const sealId = newId();
      await tx
        .insertInto('seals')
        .values({
          id: sealId, day_id: p.dayId, signing_request_id: requestId, version: p.version, merkle_root: p.root,
          entry_count: p.leaves.length, origin_flags: p.originFlags, amend_reason_hash: p.reason,
          merchant_signature: null, attester_signature: null, tx_hash: null, ledger_seq: null, error: null, confirmed_at: null,
        })
        .execute();
      if (p.leaves.length > 0) {
        await tx
          .insertInto('seal_leaves')
          .values(p.leaves.map((l, i) => ({ seal_id: sealId, leaf_index: i, entry_id: l.entryId, leaf_hash: l.hash })))
          .execute();
      }
    }
    return viewOf(tx, requestId);
  });
}

/** GET /signing/pending: la solicitud vigente, creandola si hace falta (el dueno esta presente). */
export async function getPendingSigning(db: Kysely<Database>, input: { merchantId: string; preparer: SealPreparer; now: Date }): Promise<PendingView | null> {
  return ensureSigningRequest(db, input);
}
