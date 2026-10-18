/**
 * Formato canonico BIMO-ENTRY v1 (spec 02 §2, §3, §5). Port de `docs/specs/02-referencia.mjs`:
 * ningun byte cambia. Lo que se sella con este formato queda en Stellar para siempre.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import type { Entry } from './types';

export const CODES = {
  kind: { venta: 1, abono_cliente: 2, liquidacion_psp: 3, ajuste_caja: 4, reverso: 5, conversion: 6, salida: 9 },
  origin: { declarado: 1, verificado: 2, on_chain: 3 },
  account: {
    caja: 1, por_cobrar_clientes: 2, por_cobrar_psp: 3, cuenta_socio: 4, bolsillo_usd: 5, adelantos_por_pagar: 6,
    ventas: 7, comisiones: 8, diferencias_caja: 9, gastos: 10, retiros_dueno: 11,
  },
  direction: { debe: 1, haber: 2 },
  currency: { COP: 1, USDC: 2 },
  channel: { efectivo: 1, breb: 2, datafono_externo: 3, tap_to_pay: 4, fiado: 5, transferencia_otro: 6 },
} as const;

type Table = keyof typeof CODES;

const textEncoder = new TextEncoder();

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const u8 = (n: number) => Uint8Array.of(n);
const u16 = (n: number) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
};
const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const i64 = (n: number | bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(n));
  return b;
};
const u64 = (n: number | bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n));
  return b;
};

/** `str`: u16 con la longitud en bytes + UTF-8 en NFC (maximo 65 535 bytes). */
function str(s: string): Uint8Array {
  const bytes = textEncoder.encode(s.normalize('NFC'));
  if (bytes.length > 65535) throw new Error('string > 65535 bytes');
  return concatBytes(u16(bytes.length), bytes);
}
const opt = (s: string | null | undefined) => (s == null ? u8(0) : concatBytes(u8(1), str(s)));

function code(table: Table, value: string): number {
  const c = (CODES[table] as Record<string, number>)[value];
  if (c === undefined) throw new Error(`codigo desconocido ${table}.${value}`);
  return c;
}

/** Dia de negocio AAAAMMDD en America/Bogota (UTC-5 fijo, sin horario de verano). */
export function businessDate(occurredAtMs: number): number {
  const d = new Date(occurredAtMs - 5 * 3600 * 1000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function occurredAtMs(e: Pick<Entry, 'occurred_at'>): number {
  return typeof e.occurred_at === 'number' ? e.occurred_at : Date.parse(e.occurred_at);
}

/** Bytes canonicos de un asiento. Requiere `merchant_id`. */
export function encodeEntry(e: Entry): Uint8Array {
  if (!e.merchant_id) throw new Error('encodeEntry requiere merchant_id');
  const ms = occurredAtMs(e);
  const lines = [...e.lines].sort((a, b) => a.line_no - b.line_no);
  return concatBytes(
    textEncoder.encode('BIMO-ENTRY'), u8(1),
    str(e.merchant_id), str(e.id),
    u32(businessDate(ms)), i64(ms),
    u8(code('kind', e.kind)), u8(code('origin', e.origin)),
    opt(e.reverses_entry_id), opt(e.external_source), opt(e.external_ref),
    u16(lines.length),
    ...lines.map((l) =>
      concatBytes(
        u16(l.line_no), u8(code('account', l.account_code)), u8(code('direction', l.direction)),
        u64(l.amount_minor), u8(code('currency', l.currency)),
        u8(l.channel == null ? 0 : code('channel', l.channel)),
        opt(l.customer_id),
      ),
    ),
  );
}

export { sha256 };
export const strBytes = str;
export const u32Bytes = u32;
export const u8Byte = u8;
