// Implementación de referencia de spec 02 (BIMO-ENTRY v1 + Merkle RFC 9162).
// Sin dependencias: Node 18+ o navegador (cambiar sha256 por WebCrypto).
import { createHash } from 'node:crypto';

export const CODES = {
  kind: { venta: 1, abono_cliente: 2, liquidacion_psp: 3, ajuste_caja: 4, reverso: 5, conversion: 6 },
  origin: { declarado: 1, verificado: 2, on_chain: 3 },
  account: { caja: 1, por_cobrar_clientes: 2, por_cobrar_psp: 3, cuenta_socio: 4, bolsillo_usd: 5,
             adelantos_por_pagar: 6, ventas: 7, comisiones: 8, diferencias_caja: 9 },
  direction: { debe: 1, haber: 2 },
  currency: { COP: 1, USDC: 2 },
  channel: { efectivo: 1, breb: 2, datafono_externo: 3, tap_to_pay: 4, fiado: 5, transferencia_otro: 6 },
};

export const sha256 = (b) => new Uint8Array(createHash('sha256').update(b).digest());
const enc = new TextEncoder();
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
};
const u8 = (n) => Uint8Array.of(n);
const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; };
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const i64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(n)); return b; };
const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; };
const str = (s) => { const b = enc.encode(s.normalize('NFC')); if (b.length > 65535) throw new Error('string > 65535 bytes'); return concat(u16(b.length), b); };
const opt = (s) => (s == null ? u8(0) : concat(u8(1), str(s)));
const code = (table, v) => { const c = CODES[table][v]; if (c === undefined) throw new Error(`código desconocido ${table}.${v}`); return c; };

// Fecha de negocio: día calendario en America/Bogota (UTC-5 fijo).
export const businessDate = (occurredAtMs) => {
  const d = new Date(occurredAtMs - 5 * 3600 * 1000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

export function encodeEntry(e) {
  const ms = typeof e.occurred_at === 'number' ? e.occurred_at : Date.parse(e.occurred_at);
  const lines = [...e.lines].sort((a, b) => a.line_no - b.line_no);
  return concat(
    enc.encode('BIMO-ENTRY'), u8(1),
    str(e.merchant_id), str(e.id),
    u32(businessDate(ms)), i64(ms),
    u8(code('kind', e.kind)), u8(code('origin', e.origin)),
    opt(e.reverses_entry_id), opt(e.external_source), opt(e.external_ref),
    u16(lines.length),
    ...lines.map((l) => concat(
      u16(l.line_no), u8(code('account', l.account_code)), u8(code('direction', l.direction)),
      u64(l.amount_minor), u8(code('currency', l.currency)),
      u8(l.channel == null ? 0 : code('channel', l.channel)),
      opt(l.customer_id),
    )),
  );
}

export const leafHash = (salt, entryBytes) => sha256(concat(u8(0), salt, entryBytes));
export const nodeHash = (l, r) => sha256(concat(u8(1), l, r));
const split = (n) => { let k = 1; while (k * 2 < n) k *= 2; return k; };

export function merkleRoot(leaves) {
  if (leaves.length === 0) return sha256(new Uint8Array());
  if (leaves.length === 1) return leaves[0];
  const k = split(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

export function auditPath(m, leaves) {
  const n = leaves.length;
  if (n <= 1) return [];
  const k = split(n);
  return m < k
    ? [...auditPath(m, leaves.slice(0, k)), merkleRoot(leaves.slice(k))]
    : [...auditPath(m - k, leaves.slice(k)), merkleRoot(leaves.slice(0, k))];
}

// RFC 9162, sección 2.1.3.2
export function verifyInclusion(leaf, index, treeSize, path, root) {
  if (index >= treeSize) return false;
  let fn = index, sn = treeSize - 1, r = leaf;
  for (const p of path) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      if ((fn & 1) === 0) { while ((fn & 1) === 0 && fn !== 0) { fn >>= 1; sn >>= 1; } }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1; sn >>= 1;
  }
  return sn === 0 && Buffer.from(r).equals(Buffer.from(root));
}

export function amendReasonHash(addedEntryIds) {
  const ids = [...addedEntryIds].sort();
  return sha256(concat(enc.encode('BIMO-AMEND'), u8(1), u32(ids.length), ...ids.map(str)));
}
