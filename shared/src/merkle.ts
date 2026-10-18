/** Hojas, arbol Merkle RFC 9162 y enmiendas (spec 02 §4, §6, §7). Port de `docs/specs/02-referencia.mjs`. */
import { concatBytes, sha256, strBytes, u32Bytes, u8Byte } from './canonical';
import type { Entry } from './types';

export const leafHash = (salt: Uint8Array, entryBytes: Uint8Array): Uint8Array => sha256(concatBytes(Uint8Array.of(0), salt, entryBytes));
export const nodeHash = (left: Uint8Array, right: Uint8Array): Uint8Array => sha256(concatBytes(Uint8Array.of(1), left, right));

/** Mayor potencia de 2 estrictamente menor que n. */
const split = (n: number): number => {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
};

/** raiz(vacio) = SHA-256(""); raiz([h]) = h; raiz(D[n]) = nodo(raiz(D[0:k]), raiz(D[k:n])). */
export function merkleRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256(new Uint8Array());
  if (leaves.length === 1) return leaves[0] as Uint8Array;
  const k = split(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** Audit path de RFC 9162 §2.1.3 para la hoja `m`. */
export function auditPath(m: number, leaves: Uint8Array[]): Uint8Array[] {
  const n = leaves.length;
  if (n <= 1) return [];
  const k = split(n);
  return m < k
    ? [...auditPath(m, leaves.slice(0, k)), merkleRoot(leaves.slice(k))]
    : [...auditPath(m - k, leaves.slice(k)), merkleRoot(leaves.slice(0, k))];
}

const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** RFC 9162 §2.1.3.2. Rechaza indices, tamanos o caminos que no cuadran. */
export function verifyInclusion(leaf: Uint8Array, index: number, treeSize: number, path: Uint8Array[], root: Uint8Array): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(treeSize) || index < 0 || index >= treeSize) return false;
  let fn = index;
  let sn = treeSize - 1;
  let r = leaf;
  for (const p of path) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && bytesEqual(r, root);
}

/** amend_reason_hash = SHA-256("BIMO-AMEND" || 0x01 || u32(k) || str(id_1) || ... || str(id_k)), ids ascendentes. */
export function amendReasonHash(addedEntryIds: string[]): Uint8Array {
  const ids = [...addedEntryIds].sort();
  return sha256(concatBytes(new TextEncoder().encode('BIMO-AMEND'), u8Byte(1), u32Bytes(ids.length), ...ids.map(strBytes)));
}

/** origin_flags (spec 02 §6): bit 0 declarado, bit 1 verificado, bit 2 on_chain, bit 3 algun asiento con clock_suspect. */
export function originFlags(entries: Array<Pick<Entry, 'origin'> & { clock_suspect?: boolean | undefined }>): number {
  let flags = 0;
  for (const e of entries) {
    if (e.origin === 'declarado') flags |= 1;
    else if (e.origin === 'verificado') flags |= 2;
    else if (e.origin === 'on_chain') flags |= 4;
    if (e.clock_suspect) flags |= 8;
  }
  return flags;
}
