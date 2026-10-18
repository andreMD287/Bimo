/**
 * Reglas de validacion V-01..V-11 (spec 04 §4). Una sola vez, aqui: la app y `bimo-core` las importan.
 * La hora nunca es motivo de rechazo (solo su formato, V-11).
 */
import { isUlid } from './ulid';
import type { AccountCode, ChannelCode, Entry, EntryLine } from './types';

export type ValidationCode =
  | 'invalid_id'
  | 'invalid_lines'
  | 'invalid_amount'
  | 'unbalanced'
  | 'invalid_accounts'
  | 'invalid_channel'
  | 'invalid_customer'
  | 'forbidden_origin'
  | 'invalid_reversal'
  | 'invalid_text'
  | 'invalid_time';

export type ValidationResult = { ok: true } | { ok: false; code: ValidationCode };

/** Lo que hace falta saber fuera del asiento para V-07 y V-09 (incluidos los anteriores del mismo lote). */
export interface ValidationContext {
  knownCustomerIds: ReadonlySet<string>;
  findEntry(id: string): Entry | undefined;
  isReversed(id: string): boolean;
}

export const MAX_AMOUNT = 1_000_000_000_000; // 10^12 (V-03)
export const MAX_NOTE_LENGTH = 140; // V-10
const MIN_LINES = 2;
const MAX_LINES = 20;

const fail = (code: ValidationCode): ValidationResult => ({ ok: false, code });
const OK: ValidationResult = { ok: true };

const isAmountNumber = (v: unknown): v is number | bigint =>
  (typeof v === 'number' && Number.isSafeInteger(v)) || typeof v === 'bigint';

const amountBig = (l: EntryLine) => BigInt(l.amount_minor);

type Allowed = { debe: readonly AccountCode[]; haber: readonly AccountCode[] };

/** Tabla 4.1: cuentas permitidas por tipo de asiento (inc. 1). `reverso` se comprueba en V-09; `conversion` no sale de la app. */
const ACCOUNTS_BY_KIND: Partial<Record<Entry['kind'], Allowed>> = {
  venta: { debe: ['caja', 'cuenta_socio', 'por_cobrar_psp', 'por_cobrar_clientes'], haber: ['ventas'] },
  abono_cliente: { debe: ['caja', 'cuenta_socio'], haber: ['por_cobrar_clientes'] },
  liquidacion_psp: { debe: ['cuenta_socio', 'comisiones'], haber: ['por_cobrar_psp'] },
  ajuste_caja: { debe: ['diferencias_caja', 'caja'], haber: ['caja', 'diferencias_caja'] },
  salida: { debe: ['gastos', 'retiros_dueno'], haber: ['caja', 'cuenta_socio'] },
};

/** V-05 */
function accountsOk(e: Entry): boolean {
  if (e.kind === 'reverso') return true; // V-09 exige el espejo exacto
  const allowed = ACCOUNTS_BY_KIND[e.kind];
  if (!allowed) return false; // `conversion` y los tipos reservados no los crea la app
  const debe = e.lines.filter((l) => l.direction === 'debe');
  const haber = e.lines.filter((l) => l.direction === 'haber');
  if (debe.length === 0 || haber.length === 0) return false;
  if (!debe.every((l) => allowed.debe.includes(l.account_code))) return false;
  if (!haber.every((l) => allowed.haber.includes(l.account_code))) return false;
  if (e.kind === 'liquidacion_psp' && !debe.some((l) => l.account_code === 'cuenta_socio')) return false;
  if (e.kind === 'ajuste_caja') {
    if (e.lines.length !== 2) return false;
    const d = debe[0]?.account_code;
    const h = haber[0]?.account_code;
    return (d === 'diferencias_caja' && h === 'caja') || (d === 'caja' && h === 'diferencias_caja');
  }
  return true;
}

const SOCIO_CHANNELS: readonly ChannelCode[] = ['breb', 'transferencia_otro'];
const PSP_CHANNELS: readonly ChannelCode[] = ['datafono_externo', 'tap_to_pay'];

/** V-06 (tabla 4.2) */
function channelOk(kind: Entry['kind'], l: EntryLine): boolean {
  const ch = l.channel ?? null;
  switch (l.account_code) {
    case 'caja':
      return ch === 'efectivo';
    case 'cuenta_socio':
      if (ch === null) return false;
      if (SOCIO_CHANNELS.includes(ch)) return true;
      // datafono/tap solo en liquidacion_psp (y en su reverso)
      return PSP_CHANNELS.includes(ch) && (kind === 'liquidacion_psp' || kind === 'reverso');
    case 'por_cobrar_psp':
      return ch !== null && PSP_CHANNELS.includes(ch);
    case 'por_cobrar_clientes':
      return ch === 'fiado';
    case 'bolsillo_usd':
      return false; // fuera del inc. 1
    default:
      return ch === null; // cuentas que no son de activo: sin canal
  }
}

const mirrorKey = (account: string, direction: string, amount: bigint, currency: string, channel: string | null, customer: string | null) =>
  `${account}|${direction}|${amount}|${currency}|${channel ?? ''}|${customer ?? ''}`;

/** V-09: espejo exacto (mismas cuentas, montos, canales y clientes con la direccion invertida). */
function isMirror(original: Entry, reverso: Entry): boolean {
  if (original.lines.length !== reverso.lines.length) return false;
  const want = original.lines
    .map((l) => mirrorKey(l.account_code, l.direction === 'debe' ? 'haber' : 'debe', amountBig(l), l.currency, l.channel ?? null, l.customer_id ?? null))
    .sort();
  const have = reverso.lines
    .map((l) => mirrorKey(l.account_code, l.direction, amountBig(l), l.currency, l.channel ?? null, l.customer_id ?? null))
    .sort();
  return want.every((k, i) => k === have[i]);
}

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateEntry(e: Entry, ctx: ValidationContext): ValidationResult {
  // V-01 ids de asiento y de linea
  if (!isUlid(e.id) || !e.lines.every((l) => isUlid(l.id))) return fail('invalid_id');

  // V-02 entre 2 y 20 lineas; line_no de 1 a n sin huecos
  const n = e.lines.length;
  if (n < MIN_LINES || n > MAX_LINES) return fail('invalid_lines');
  const nums = e.lines.map((l) => l.line_no).sort((a, b) => a - b);
  if (!nums.every((v, i) => v === i + 1)) return fail('invalid_lines');

  // V-03 montos enteros entre 1 y 10^12
  for (const l of e.lines) {
    if (!isAmountNumber(l.amount_minor)) return fail('invalid_amount');
    const a = amountBig(l);
    if (a < 1n || a > BigInt(MAX_AMOUNT)) return fail('invalid_amount');
  }

  // V-04 por moneda, debe = haber
  const sums = new Map<string, bigint>();
  for (const l of e.lines) {
    const s = sums.get(l.currency) ?? 0n;
    sums.set(l.currency, l.direction === 'debe' ? s + amountBig(l) : s - amountBig(l));
  }
  if ([...sums.values()].some((s) => s !== 0n)) return fail('unbalanced');

  // V-05 cuentas y direccion por kind
  if (!accountsOk(e)) return fail('invalid_accounts');

  // V-06 canal por cuenta
  if (!e.lines.every((l) => channelOk(e.kind, l))) return fail('invalid_channel');

  // V-07 customer_id obligatorio en por_cobrar_clientes, prohibido en las demas, y el cliente existe
  for (const l of e.lines) {
    const needs = l.account_code === 'por_cobrar_clientes';
    const has = l.customer_id != null;
    if (needs !== has) return fail('invalid_customer');
    if (has && (!isUlid(l.customer_id) || !ctx.knownCustomerIds.has(l.customer_id as string))) return fail('invalid_customer');
  }

  // V-08 desde la app solo `declarado`, sin fuente ni ref externa
  if (e.origin !== 'declarado' || e.external_source != null || e.external_ref != null) return fail('forbidden_origin');

  // V-09 reverso: espejo exacto de un asiento conocido que no fue reversado antes
  if (e.kind === 'reverso') {
    const target = e.reverses_entry_id;
    if (!isUlid(target)) return fail('invalid_reversal');
    const original = ctx.findEntry(target);
    if (!original || ctx.isReversed(target) || !isMirror(original, e)) return fail('invalid_reversal');
  } else if (e.reverses_entry_id != null) {
    return fail('invalid_reversal');
  }

  // V-10 nota de maximo 140 caracteres, en NFC
  if (e.note != null) {
    if (typeof e.note !== 'string' || e.note !== e.note.normalize('NFC') || [...e.note].length > MAX_NOTE_LENGTH) return fail('invalid_text');
  }

  // V-11 precision de milisegundos (la hora nunca es motivo de rechazo)
  const t = e.occurred_at;
  const timeOk = typeof t === 'number' ? Number.isSafeInteger(t) : typeof t === 'string' && ISO_MS.test(t) && !Number.isNaN(Date.parse(t));
  if (!timeOk) return fail('invalid_time');

  return OK;
}
