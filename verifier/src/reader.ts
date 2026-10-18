/**
 * Lectura de `bimo-registry` directo de Stellar RPC (spec 05 §4 paso 1), sin pasar por la API de Bimo.
 * Usa `getLedgerEntries` con las llaves `Latest(comercio, fecha)` y `Seal(comercio, fecha, version)` (spec 03 §4.1).
 */
import { XdrReader, concatBytes, contractAddress, decodeScAddress, decodeScVal, decodeStrkey, encodeScAddress, encodeScVal, sym, u32, type ScVal } from '@bimo/shared';
import type { OnChainSeal } from './types';

export interface SealReader {
  /** Todas las versiones del sello de `(comercio, fecha)` en un registry, de la 1 a la vigente. Vacio si no hay. */
  getSeals(registryId: string, merchantAddress: string, date: number): Promise<OnChainSeal[]>;
}

const b64 = {
  enc: (b: Uint8Array) => {
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s);
  },
  dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

/** LedgerKey::ContractData { contract, key, durability = persistent } en XDR. */
function ledgerKeyXdr(registryId: string, key: ScVal): string {
  const registry = decodeStrkey(registryId);
  const u32b = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  return b64.enc(concatBytes(u32b(6), encodeScAddress(registry), encodeScVal(key), u32b(1)));
}

const field = (map: Array<[ScVal, ScVal]>, name: string): ScVal | undefined => map.find(([k]) => k.t === 'symbol' && k.v === name)?.[1];

function decodeSeal(val: ScVal): OnChainSeal {
  if (val.t !== 'map') throw new Error('SealRecord invalido');
  const num = (n: string) => {
    const f = field(val.v, n);
    if (f?.t !== 'u32') throw new Error(`${n} invalido`);
    return f.v;
  };
  const root = field(val.v, 'root');
  if (root?.t !== 'bytes') throw new Error('root invalida');
  const reason = field(val.v, 'reason_hash');
  return {
    version: num('version'),
    root: root.v,
    entryCount: num('entry_count'),
    originFlags: num('origin_flags'),
    reasonHash: reason?.t === 'bytes' ? reason.v : null,
  };
}

/** LedgerEntryData::ContractData -> el `val` del contrato. */
function contractDataValue(xdrB64: string): ScVal {
  const r = new XdrReader(b64.dec(xdrB64));
  if (r.u32() !== 6) throw new Error('la entrada no es de contrato');
  r.u32(); // ext
  decodeScAddress(r);
  decodeScVal(r); // llave
  r.u32(); // durabilidad
  return decodeScVal(r);
}

export class RpcSealReader implements SealReader {
  constructor(
    private readonly rpcUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async entries(keys: string[]): Promise<Array<{ key: string; xdr: string }>> {
    const res = await this.fetchImpl(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLedgerEntries', params: { keys } }),
    });
    if (!res.ok) throw new Error(`RPC respondio ${res.status}`);
    const body = (await res.json()) as { result?: { entries?: Array<{ key: string; xdr: string }> | null }; error?: { message: string } };
    if (body.error) throw new Error('RPC con error');
    return body.result?.entries ?? [];
  }

  async getSeals(registryId: string, merchantAddress: string, date: number): Promise<OnChainSeal[]> {
    const merchant = contractAddress(merchantAddress);
    const latestKey = ledgerKeyXdr(registryId, { t: 'vec', v: [sym('Latest'), merchant, u32(date)] });
    const latest = (await this.entries([latestKey]))[0];
    if (!latest) return [];
    const lv = contractDataValue(latest.xdr);
    if (lv.t !== 'u32') throw new Error('Latest invalido');
    const keys = Array.from({ length: lv.v }, (_, i) => ledgerKeyXdr(registryId, { t: 'vec', v: [sym('Seal'), merchant, u32(date), u32(i + 1)] }));
    const found = await this.entries(keys);
    const byKey = new Map(found.map((e) => [e.key, e.xdr]));
    return keys.map((k) => {
      const x = byKey.get(k);
      if (!x) throw new Error('falta una version del sello en la red');
      return decodeSeal(contractDataValue(x));
    });
  }
}
