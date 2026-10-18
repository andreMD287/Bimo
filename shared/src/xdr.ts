/**
 * XDR minimo de Soroban (solo lo que usan la app y el verificador): ScVal, direcciones C.../G... y la preimagen de
 * autorizacion (spec 03 §5). Sin dependencias de Node ni de React Native; en pruebas se contrasta con @stellar/stellar-sdk.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from './canonical';

// ------------------------------------------------------------------ strkey (SEP-23): G... cuenta, C... contrato
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('strkey invalido');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

const VERSION = { account: 6 << 3, contract: 2 << 3 } as const;

export type AddressKind = 'account' | 'contract';

export function encodeStrkey(kind: AddressKind, id: Uint8Array): string {
  const payload = concatBytes(Uint8Array.of(VERSION[kind]), id);
  const crc = crc16xmodem(payload);
  return base32Encode(concatBytes(payload, Uint8Array.of(crc & 255, crc >> 8)));
}

export function decodeStrkey(s: string): { kind: AddressKind; id: Uint8Array } {
  const raw = base32Decode(s);
  if (raw.length !== 35) throw new Error('strkey invalido');
  const payload = raw.slice(0, 33);
  const crc = crc16xmodem(payload);
  if ((raw[33] as number) !== (crc & 255) || (raw[34] as number) !== crc >> 8) throw new Error('strkey invalido');
  const kind = raw[0] === VERSION.account ? 'account' : raw[0] === VERSION.contract ? 'contract' : null;
  if (!kind) throw new Error('strkey invalido');
  return { kind, id: payload.slice(1) };
}

// ------------------------------------------------------------------ ScVal
export type ScAddress = { kind: AddressKind; id: Uint8Array };

export type ScVal =
  | { t: 'bool'; v: boolean }
  | { t: 'void' }
  | { t: 'u32'; v: number }
  | { t: 'i32'; v: number }
  | { t: 'u64'; v: bigint }
  | { t: 'i64'; v: bigint }
  | { t: 'bytes'; v: Uint8Array }
  | { t: 'string'; v: string }
  | { t: 'symbol'; v: string }
  | { t: 'vec'; v: ScVal[] }
  | { t: 'map'; v: Array<[ScVal, ScVal]> }
  | { t: 'address'; v: ScAddress };

const T = { bool: 0, void: 1, u32: 3, i32: 4, u64: 5, i64: 6, bytes: 13, string: 14, symbol: 15, vec: 16, map: 17, address: 18 } as const;

export class XdrReader {
  private o = 0;
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get done() {
    return this.o === this.bytes.length;
  }
  private need(n: number) {
    if (this.o + n > this.bytes.length) throw new Error('XDR truncado');
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.o);
    this.o += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.o);
    this.o += 4;
    return v;
  }
  u64(): bigint {
    this.need(8);
    const v = this.view.getBigUint64(this.o);
    this.o += 8;
    return v;
  }
  i64(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.o);
    this.o += 8;
    return v;
  }
  fixed(n: number): Uint8Array {
    this.need(n);
    const v = this.bytes.slice(this.o, this.o + n);
    this.o += n + ((4 - (n % 4)) % 4);
    return v;
  }
  var(): Uint8Array {
    const n = this.u32();
    return this.fixed(n);
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function decodeScAddress(r: XdrReader): ScAddress {
  const type = r.u32();
  if (type === 0) {
    if (r.u32() !== 0) throw new Error('clave de cuenta no soportada');
    return { kind: 'account', id: r.fixed(32) };
  }
  if (type === 1) return { kind: 'contract', id: r.fixed(32) };
  throw new Error('direccion XDR no soportada');
}

export function decodeScVal(r: XdrReader): ScVal {
  const type = r.u32();
  switch (type) {
    case T.bool:
      return { t: 'bool', v: r.u32() !== 0 };
    case T.void:
      return { t: 'void' };
    case T.u32:
      return { t: 'u32', v: r.u32() };
    case T.i32:
      return { t: 'i32', v: r.i32() };
    case T.u64:
      return { t: 'u64', v: r.u64() };
    case T.i64:
      return { t: 'i64', v: r.i64() };
    case T.bytes:
      return { t: 'bytes', v: r.var() };
    case T.string:
      return { t: 'string', v: dec.decode(r.var()) };
    case T.symbol:
      return { t: 'symbol', v: dec.decode(r.var()) };
    case T.vec: {
      if (r.u32() === 0) return { t: 'vec', v: [] };
      const n = r.u32();
      const out: ScVal[] = [];
      for (let i = 0; i < n; i++) out.push(decodeScVal(r));
      return { t: 'vec', v: out };
    }
    case T.map: {
      if (r.u32() === 0) return { t: 'map', v: [] };
      const n = r.u32();
      const out: Array<[ScVal, ScVal]> = [];
      for (let i = 0; i < n; i++) out.push([decodeScVal(r), decodeScVal(r)]);
      return { t: 'map', v: out };
    }
    case T.address:
      return { t: 'address', v: decodeScAddress(r) };
    default:
      throw new Error(`ScVal tipo ${type} no soportado`);
  }
}

const u32b = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const varOpaque = (bytes: Uint8Array) => concatBytes(u32b(bytes.length), bytes, new Uint8Array((4 - (bytes.length % 4)) % 4));

export function encodeScAddress(a: ScAddress): Uint8Array {
  return a.kind === 'account' ? concatBytes(u32b(0), u32b(0), a.id) : concatBytes(u32b(1), a.id);
}

export function encodeScVal(v: ScVal): Uint8Array {
  switch (v.t) {
    case 'bool':
      return concatBytes(u32b(T.bool), u32b(v.v ? 1 : 0));
    case 'void':
      return u32b(T.void);
    case 'u32':
      return concatBytes(u32b(T.u32), u32b(v.v));
    case 'i32': {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setInt32(0, v.v);
      return concatBytes(u32b(T.i32), b);
    }
    case 'u64': {
      const b = new Uint8Array(8);
      new DataView(b.buffer).setBigUint64(0, v.v);
      return concatBytes(u32b(T.u64), b);
    }
    case 'i64': {
      const b = new Uint8Array(8);
      new DataView(b.buffer).setBigInt64(0, v.v);
      return concatBytes(u32b(T.i64), b);
    }
    case 'bytes':
      return concatBytes(u32b(T.bytes), varOpaque(v.v));
    case 'string':
      return concatBytes(u32b(T.string), varOpaque(enc.encode(v.v)));
    case 'symbol':
      return concatBytes(u32b(T.symbol), varOpaque(enc.encode(v.v)));
    case 'vec':
      return concatBytes(u32b(T.vec), u32b(1), u32b(v.v.length), ...v.v.map(encodeScVal));
    case 'map':
      return concatBytes(u32b(T.map), u32b(1), u32b(v.v.length), ...v.v.flatMap(([k, x]) => [encodeScVal(k), encodeScVal(x)]));
    case 'address':
      return concatBytes(u32b(T.address), encodeScAddress(v.v));
  }
}

export const sym = (s: string): ScVal => ({ t: 'symbol', v: s });
export const u32 = (n: number): ScVal => ({ t: 'u32', v: n });
export const contractAddress = (strkey: string): ScVal => {
  const a = decodeStrkey(strkey);
  return { t: 'address', v: a };
};

/** Direccion C.../G... de un ScVal address. */
export function addressToString(a: ScAddress): string {
  return encodeStrkey(a.kind, a.id);
}

// ------------------------------------------------------------------ preimagen de autorizacion (spec 03 §5.1-§5.3)
export interface AuthorizedCall {
  contract: string; // C...
  fn: string;
  args: ScVal[];
}

export interface DecodedAuthPreimage {
  /** 9 = SorobanAuthorization (v1); 10 = SorobanAuthorizationWithAddress (v2, protocolo 29). */
  envelopeType: 9 | 10;
  networkId: Uint8Array;
  nonce: bigint;
  signatureExpirationLedger: number;
  /** Solo en v2. */
  address: string | null;
  call: AuthorizedCall;
  subInvocations: number;
}

function decodeInvocation(r: XdrReader): { call: AuthorizedCall; subInvocations: number } {
  const fnType = r.u32();
  if (fnType !== 0) throw new Error('la preimagen no invoca una funcion de contrato');
  const contract = addressToString(decodeScAddress(r));
  const fn = dec.decode(r.var());
  const nargs = r.u32();
  const args: ScVal[] = [];
  for (let i = 0; i < nargs; i++) args.push(decodeScVal(r));
  const subs = r.u32();
  let total = subs;
  for (let i = 0; i < subs; i++) total += decodeInvocation(r).subInvocations;
  return { call: { contract, fn, args }, subInvocations: total };
}

/** Decodifica la preimagen que firma el dueno. Rechaza cualquier otra forma. */
export function decodeAuthPreimage(bytes: Uint8Array): DecodedAuthPreimage {
  const r = new XdrReader(bytes);
  const type = r.u32();
  if (type !== 9 && type !== 10) throw new Error('la preimagen no es de autorizacion de Soroban');
  const networkId = r.fixed(32);
  const nonce = r.i64();
  const signatureExpirationLedger = r.u32();
  const address = type === 10 ? addressToString(decodeScAddress(r)) : null;
  const inv = decodeInvocation(r);
  if (!r.done) throw new Error('bytes sobrantes en la preimagen');
  return { envelopeType: type, networkId, nonce, signatureExpirationLedger, address, call: inv.call, subInvocations: inv.subInvocations };
}

/** XDR de `Vec<u32>[0]`: la regla de contexto 0 (spec 03 §5.3). */
export const RULE_IDS_XDR = encodeScVal({ t: 'vec', v: [u32(0)] });

/**
 * auth_digest = SHA-256( SHA-256(preimagen) ‖ XDR(Vec<u32>[0]) ). El dueno firma SHA-256(auth_digest) (spec 03 §5.3).
 * La app lo calcula por su cuenta; nunca firma un hash que le manden hecho.
 */
export function authDigest(preimageXdr: Uint8Array): Uint8Array {
  return sha256(concatBytes(sha256(preimageXdr), RULE_IDS_XDR));
}

/** Lectura de un `SealItem` (spec 03 §4.1 v1.4) tal como viaja en la invocacion. */
export interface SealItemView {
  date: number;
  root: Uint8Array;
  entryCount: number;
  originFlags: number;
  amend: { prevVersion: number; reasonHash: Uint8Array } | null;
}

function field(map: Array<[ScVal, ScVal]>, name: string): ScVal {
  const f = map.find(([k]) => k.t === 'symbol' && k.v === name);
  if (!f) throw new Error(`falta el campo ${name}`);
  return f[1];
}

export function readSealItem(v: ScVal): SealItemView {
  if (v.t !== 'map') throw new Error('item de sello invalido');
  const num = (name: string) => {
    const x = field(v.v, name);
    if (x.t !== 'u32') throw new Error(`${name} no es u32`);
    return x.v;
  };
  const root = field(v.v, 'root');
  if (root.t !== 'bytes') throw new Error('root invalida');
  const amendV = field(v.v, 'amend');
  let amend: SealItemView['amend'] = null;
  if (amendV.t === 'vec' && amendV.v[0]?.t === 'symbol' && amendV.v[0].v === 'Of') {
    const info = amendV.v[1];
    if (info?.t !== 'map') throw new Error('enmienda invalida');
    const prev = field(info.v, 'prev_version');
    const reason = field(info.v, 'reason_hash');
    if (prev.t !== 'u32' || reason.t !== 'bytes') throw new Error('enmienda invalida');
    amend = { prevVersion: prev.v, reasonHash: reason.v };
  }
  return { date: num('date'), root: root.v, entryCount: num('entry_count'), originFlags: num('origin_flags'), amend };
}
