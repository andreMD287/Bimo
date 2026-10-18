import { readFileSync } from 'node:fs';
import { Address, Networks, xdr } from '@stellar/stellar-sdk';
import {
  amendReasonHash,
  concatBytes,
  contractAddress,
  decodeStrkey,
  encodeEntry,
  encodeScAddress,
  encodeScVal,
  leafHash,
  merkleRoot,
  originFlags,
  type Entry,
} from '@bimo/shared';
import { describe, expect, it } from 'vitest';
import { RpcSealReader, verifyPackage, type OnChainSeal, type SealReader, type VerificationPackage } from '../src';

const vec = JSON.parse(readFileSync(new URL('../../docs/specs/02-vectores.json', import.meta.url), 'utf8')) as {
  entries: Array<{ entry: Entry & { merchant_id: string }; salt: string }>;
  day_example: { entry_ids: string[]; root: string };
};
const MERCHANT = '01JA2B3C4D5E6F7G8H9J0KMNPQ';
const ACCOUNT = 'CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M';
const REGISTRY = 'CDRMZRCZZFICPDROENVBP6VFDPB2FTZARW2A4XV7NERRM6BPSD45GZYB';
const TRUSTED = [{ networkPassphrase: Networks.TESTNET, registryIds: [REGISTRY] }];
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bin = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

const byId = new Map(vec.entries.map((e) => [e.entry.id, e]));
const dayEntries = (ids: string[]) =>
  ids.map((id) => {
    const e = byId.get(id)!;
    return { entry: structuredClone(e.entry), salt: e.salt, clock_suspect: false };
  });
const rootOf = (ids: string[]) =>
  merkleRoot(ids.map((id) => {
    const e = byId.get(id)!;
    return leafHash(bin(e.salt), encodeEntry(e.entry));
  }));
const sealOf = (version: number, ids: string[], reason: Uint8Array | null = null): OnChainSeal => ({
  version,
  root: rootOf(ids),
  entryCount: ids.length,
  originFlags: originFlags(ids.map((id) => ({ origin: byId.get(id)!.entry.origin }))),
  reasonHash: reason,
});

class FakeChain implements SealReader {
  data = new Map<string, OnChainSeal[]>();
  async getSeals(registryId: string, merchant: string, date: number) {
    return this.data.get(`${registryId}|${merchant}|${date}`) ?? [];
  }
  set(date: number, seals: OnChainSeal[]) {
    this.data.set(`${REGISTRY}|${ACCOUNT}|${date}`, seals);
  }
}

function pkg(days: VerificationPackage['days'], over: Partial<VerificationPackage['network']> = {}): VerificationPackage {
  return {
    format: 'bimo-verification-v1',
    merchant: { merchant_id: MERCHANT, business_name: 'Tienda Dona Marta', stellar_address: ACCOUNT },
    network: { network_passphrase: Networks.TESTNET, rpc_url: 'https://soroban-testnet.stellar.org', registry_ids: [REGISTRY], ...over },
    link: { date_from: '2026-09-01', date_to: '2026-10-07', expires_at: '2027-01-01T00:00:00.000Z' },
    days,
  };
}
const DAY = vec.day_example.entry_ids;

describe('spec 05 §4: verificacion del paquete', () => {
  it('spec05-8 el dia de ejemplo del spec 02 da "Coincide" y los totales los calcula quien verifica', async () => {
    const chain = new FakeChain();
    chain.set(20261006, [sealOf(1, DAY)]);
    expect(hex(sealOf(1, DAY).root)).toBe(vec.day_example.root);
    const r = await verifyPackage(
      pkg([{ date: 20261006, status: 'sellado', entries: dayEntries(DAY), seals: [{ version: 1, tx_hash: 'TX1', added_entry_ids: [] }] }]),
      { reader: chain, trusted: TRUSTED },
    );
    expect(r.trusted).toBe(true);
    expect(r.days[0]).toMatchObject({ date: 20261006, result: 'coincide', amendments: 0, txHash: 'TX1', reason: null });
    // ventas = A 2.000.000 + B 10.000.000 + C 5.000.000 - reverso de A 2.000.000
    expect(r.days[0]?.salesMinor).toBe(15_000_000);
    expect(r.days[0]?.byChannel).toEqual({ efectivo: 3_000_000, breb: 7_000_000, fiado: 5_000_000 });
    expect(r.summary).toMatchObject({ matching: 1, unsealed: 0, mismatched: 0, salesMinor: 15_000_000, thirdPartyPercent: 20, clockSuspectCount: 0 });
  });

  it('spec05-8 cambiar 1 centavo, la sal o borrar un asiento da "No coincide" y esos montos no entran a los totales', async () => {
    const chain = new FakeChain();
    chain.set(20261006, [sealOf(1, DAY)]);
    const base = () => dayEntries(DAY);
    const cases: Array<[string, VerificationPackage['days'][number]['entries']]> = [];
    const cent = base();
    cent[0]!.entry.lines[0]!.amount_minor = Number(cent[0]!.entry.lines[0]!.amount_minor) + 1;
    cases.push(['un centavo', cent]);
    const salt = base();
    salt[1]!.salt = '00' + salt[1]!.salt.slice(2);
    cases.push(['la sal', salt]);
    cases.push(['un asiento menos', base().slice(1)]);
    const other = base();
    other[2]!.entry.merchant_id = '01JA2B3C4D5E6F7G8H9J0OTRO1'.replace('O', '0');
    cases.push(['otro comercio', other]);
    const date = base();
    date[0]!.entry.occurred_at = '2026-10-08T15:00:00.000Z';
    cases.push(['otra fecha', date]);
    const flag = base();
    flag[0]!.clock_suspect = true; // origin_flags cambia (bit 3)
    cases.push(['clock_suspect', flag]);
    for (const [name, entries] of cases) {
      const r = await verifyPackage(pkg([{ date: 20261006, status: 'sellado', entries, seals: [{ version: 1, tx_hash: 'TX1', added_entry_ids: [] }] }]), { reader: chain, trusted: TRUSTED });
      expect(r.days[0]?.result, name).toBe('no_coincide');
      expect(r.summary, name).toMatchObject({ matching: 0, mismatched: 1, salesMinor: 0 });
    }
  });

  it('spec05-4.1 un dia sin sello en la red es "Sin sellar"', async () => {
    const r = await verifyPackage(pkg([{ date: 20261006, status: 'cerrado', entries: dayEntries(DAY), seals: [] }]), { reader: new FakeChain(), trusted: TRUSTED });
    expect(r.days[0]).toMatchObject({ result: 'sin_sellar', salesMinor: 0 });
    expect(r.summary).toMatchObject({ unsealed: 1, matching: 0, salesMinor: 0 });
  });

  it('spec05-8 un dia enmendado muestra las dos versiones y cuales asientos llegaron tarde; si se borra uno da "No coincide"', async () => {
    const first = DAY.slice(0, 4);
    const chain = new FakeChain();
    chain.set(20261006, [sealOf(1, first), sealOf(2, DAY, amendReasonHash([DAY[4] as string]))]);
    const days = (entries: VerificationPackage['days'][number]['entries'], added = [DAY[4] as string]) =>
      pkg([{ date: 20261006, status: 'sellado', entries, seals: [{ version: 1, tx_hash: 'TX1', added_entry_ids: [] }, { version: 2, tx_hash: 'TX2', added_entry_ids: added }] }]);
    const ok = await verifyPackage(days(dayEntries(DAY)), { reader: chain, trusted: TRUSTED });
    expect(ok.days[0]).toMatchObject({ result: 'coincide', amendments: 1, txHash: 'TX2', lateEntryIds: [DAY[4]] });
    // borrar un asiento de los agregados tarde
    expect((await verifyPackage(days(dayEntries(DAY).slice(0, 4)), { reader: chain, trusted: TRUSTED })).days[0]?.result).toBe('no_coincide');
    // borrar uno de los primeros
    expect((await verifyPackage(days(dayEntries(DAY).slice(1)), { reader: chain, trusted: TRUSTED })).days[0]?.result).toBe('no_coincide');
    // mentir sobre cuales llegaron tarde
    expect((await verifyPackage(days(dayEntries(DAY), [DAY[3] as string]), { reader: chain, trusted: TRUSTED })).days[0]?.result).toBe('no_coincide');
    // sin el detalle de la enmienda
    expect((await verifyPackage(days(dayEntries(DAY), []), { reader: chain, trusted: TRUSTED })).days[0]?.result).toBe('no_coincide');
  });

  it('spec05-8 un paquete con un registry_id o una red que no estan compilados es rechazado y no verifica nada', async () => {
    const chain = new FakeChain();
    chain.set(20261006, [sealOf(1, DAY)]);
    const days = [{ date: 20261006, status: 'sellado', entries: dayEntries(DAY), seals: [{ version: 1, tx_hash: 'TX1', added_entry_ids: [] }] }];
    const bad = await verifyPackage(pkg(days, { registry_ids: [ACCOUNT] }), { reader: chain, trusted: TRUSTED });
    expect(bad).toMatchObject({ trusted: false, days: [] });
    const extra = await verifyPackage(pkg(days, { registry_ids: [REGISTRY, ACCOUNT] }), { reader: chain, trusted: TRUSTED });
    expect(extra.trusted).toBe(false);
    const net = await verifyPackage(pkg(days, { network_passphrase: Networks.PUBLIC }), { reader: chain, trusted: TRUSTED });
    expect(net.trusted).toBe(false);
  });

  it('el porcentaje verificado por terceros y los asientos con reloj dudoso se cuentan solo de los dias que coinciden', async () => {
    const chain = new FakeChain();
    chain.set(20261006, [sealOf(1, DAY)]);
    const r = await verifyPackage(pkg([{ date: 20261006, status: 'sellado', entries: dayEntries(DAY), seals: [{ version: 1, tx_hash: 'TX1', added_entry_ids: [] }] }, { date: 20261007, status: 'abierto', entries: [], seals: [] }]), { reader: chain, trusted: TRUSTED });
    expect(r.summary.thirdPartyPercent).toBe(20); // 1 de 5 es `verificado`
    expect(r.summary.unsealed).toBe(1);
  });
});

describe('RpcSealReader: llaves y respuestas de getLedgerEntries', () => {
  const sdkKey = (key: xdr.ScVal) =>
    xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(REGISTRY).toScAddress(), key, durability: xdr.ContractDataDurability.persistent })).toXDR('base64');
  const u32 = (n: number) => xdr.ScVal.scvU32(n);
  const sym = (s: string) => xdr.ScVal.scvSymbol(s);
  const entryData = (val: Uint8Array) => {
    // LedgerEntryData::ContractData { ext: 0, contract, key, durability: persistent(1), val }
    const reg = decodeStrkey(REGISTRY);
    const u = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    return Buffer.from(concatBytes(u(6), u(0), encodeScAddress(reg), encodeScVal({ t: 'u32', v: 0 }), u(1), val)).toString('base64');
  };

  it('pide exactamente las llaves Latest y Seal del contrato (iguales a las que arma el SDK) y decodifica el sello', async () => {
    const root = rootOf(DAY);
    const record = encodeScVal({
      t: 'map',
      v: [
        [{ t: 'symbol', v: 'attester' }, contractAddress(ACCOUNT)],
        [{ t: 'symbol', v: 'entry_count' }, { t: 'u32', v: 5 }],
        [{ t: 'symbol', v: 'ledger' }, { t: 'u32', v: 100 }],
        [{ t: 'symbol', v: 'origin_flags' }, { t: 'u32', v: 3 }],
        [{ t: 'symbol', v: 'reason_hash' }, { t: 'void' }],
        [{ t: 'symbol', v: 'root' }, { t: 'bytes', v: root }],
        [{ t: 'symbol', v: 'timestamp' }, { t: 'u64', v: 1700000000n }],
        [{ t: 'symbol', v: 'version' }, { t: 'u32', v: 1 }],
      ],
    });
    const wantLatest = sdkKey(xdr.ScVal.scvVec([sym('Latest'), new Address(ACCOUNT).toScVal(), u32(20261006)]));
    const wantSeal = sdkKey(xdr.ScVal.scvVec([sym('Seal'), new Address(ACCOUNT).toScVal(), u32(20261006), u32(1)]));
    const asked: string[][] = [];
    const fakeFetch = (async (_url: string, init: { body: string }) => {
      const keys = JSON.parse(init.body).params.keys as string[];
      asked.push(keys);
      const entries = keys.map((k) => ({ key: k, xdr: k === wantLatest ? entryData(encodeScVal({ t: 'u32', v: 1 })) : entryData(record) }));
      return { ok: true, json: async () => ({ result: { entries } }) };
    }) as unknown as typeof fetch;
    const reader = new RpcSealReader('https://rpc.test', fakeFetch);
    const seals = await reader.getSeals(REGISTRY, ACCOUNT, 20261006);
    expect(asked[0]).toEqual([wantLatest]);
    expect(asked[1]).toEqual([wantSeal]);
    expect(seals).toHaveLength(1);
    expect(seals[0]).toMatchObject({ version: 1, entryCount: 5, originFlags: 3, reasonHash: null });
    expect(hex(seals[0]!.root)).toBe(vec.day_example.root);
  });

  it('si la red no tiene el sello devuelve vacio; si el RPC falla, lanza', async () => {
    const empty = (async () => ({ ok: true, json: async () => ({ result: { entries: null } }) })) as unknown as typeof fetch;
    expect(await new RpcSealReader('https://rpc.test', empty).getSeals(REGISTRY, ACCOUNT, 20261006)).toEqual([]);
    const down = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(new RpcSealReader('https://rpc.test', down).getSeals(REGISTRY, ACCOUNT, 20261006)).rejects.toThrow();
  });
});
