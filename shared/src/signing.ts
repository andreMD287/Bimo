/**
 * Validacion de la preimagen antes de pedir Face ID (spec 03 §5.2). La app la corre con su propia base local y su
 * configuracion; si algo no cuadra, rechaza y nunca firma. `core` no puede obligar a firmar algo distinto.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { addressToString, authDigest, decodeAuthPreimage, readSealItem, type SealItemView } from './xdr';

const textEncoder = new TextEncoder();

export interface ExpectedSigning {
  /** Passphrase de la red configurada en la app (testnet en el incremento 1). */
  networkPassphrase: string;
  /** ID de `bimo-registry` (C...) de la configuracion de la app. */
  registryId: string;
  /** Direccion de su propia smart account. */
  merchantAddress: string;
  /** Dias cerrados pendientes de firma y numero de asientos de cada uno en la base local (AAAAMMDD). */
  localDays: ReadonlyArray<{ date: number; entryCount: number }>;
}

export type SigningCheck =
  | { ok: true; items: SealItemView[]; authDigest: Uint8Array; expirationLedger: number }
  | { ok: false; reason: 'preimagen_invalida' | 'red' | 'contrato' | 'funcion' | 'comercio' | 'dias' | 'subinvocaciones' };

const bytesEq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export function validateSigningPreimage(preimageXdr: Uint8Array, expected: ExpectedSigning): SigningCheck {
  let p;
  try {
    p = decodeAuthPreimage(preimageXdr);
  } catch {
    return { ok: false, reason: 'preimagen_invalida' };
  }
  // network_id = SHA-256 del passphrase configurado
  if (!bytesEq(p.networkId, sha256(textEncoder.encode(expected.networkPassphrase)))) return { ok: false, reason: 'red' };
  // contrato invocado = el bimo-registry configurado
  if (p.call.contract !== expected.registryId) return { ok: false, reason: 'contrato' };
  // funcion seal o seal_batch
  if (p.call.fn !== 'seal' && p.call.fn !== 'seal_batch') return { ok: false, reason: 'funcion' };
  // la v2 (protocolo 29) lleva la direccion que firma: tiene que ser su propia cuenta
  if (p.address !== null && p.address !== expected.merchantAddress) return { ok: false, reason: 'comercio' };
  // sin sub-invocaciones
  if (p.subInvocations !== 0) return { ok: false, reason: 'subinvocaciones' };

  // merchant = su propia smart account
  const [merchantArg, itemsArg] = p.call.args;
  if (merchantArg?.t !== 'address' || addressToString(merchantArg.v) !== expected.merchantAddress) return { ok: false, reason: 'comercio' };
  let items: SealItemView[];
  try {
    if (p.call.fn === 'seal') {
      if (p.call.args.length !== 2 || !itemsArg) throw new Error('args');
      items = [readSealItem(itemsArg)];
    } else {
      if (p.call.args.length !== 2 || itemsArg?.t !== 'vec') throw new Error('args');
      items = itemsArg.v.map(readSealItem);
    }
  } catch {
    return { ok: false, reason: 'preimagen_invalida' };
  }

  // fechas y entry_count de cada item = su base local (dias cerrados pendientes de firma)
  if (items.length !== expected.localDays.length) return { ok: false, reason: 'dias' };
  const local = new Map(expected.localDays.map((d) => [d.date, d.entryCount]));
  for (const it of items) {
    if (local.get(it.date) !== it.entryCount) return { ok: false, reason: 'dias' };
  }
  if (new Set(items.map((i) => i.date)).size !== items.length) return { ok: false, reason: 'dias' };

  return { ok: true, items, authDigest: authDigest(preimageXdr), expirationLedger: p.signatureExpirationLedger };
}
