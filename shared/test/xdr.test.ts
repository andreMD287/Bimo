import { createHash } from 'node:crypto';
import { Address, Networks, StrKey, hash, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  RULE_IDS_XDR,
  XdrReader,
  authDigest,
  decodeAuthPreimage,
  decodeScVal,
  decodeStrkey,
  encodeScVal,
  encodeStrkey,
  validateSigningPreimage,
  type ScVal,
} from '../src';

const REGISTRY = 'CDRMZRCZZFICPDROENVBP6VFDPB2FTZARW2A4XV7NERRM6BPSD45GZYB';
const ACCOUNT = 'CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M';
const G = 'GCSGJMK4653I7I5HKI7CIYKROGA5EOFEINSG43LIVSLVEIPOYRCXQCBE';
const ROOT = Buffer.alloc(32, 7);

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const field = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(k), val: v });
const sdkItem = (date: number, count: number, amend?: { prev: number; reason: Buffer }) =>
  xdr.ScVal.scvMap([
    field('amend', amend ? xdr.ScVal.scvVec([sym('Of'), xdr.ScVal.scvMap([field('prev_version', xdr.ScVal.scvU32(amend.prev)), field('reason_hash', xdr.ScVal.scvBytes(amend.reason))])]) : xdr.ScVal.scvVec([sym('None')])),
    field('date', xdr.ScVal.scvU32(date)),
    field('entry_count', xdr.ScVal.scvU32(count)),
    field('origin_flags', xdr.ScVal.scvU32(1)),
    field('root', xdr.ScVal.scvBytes(ROOT)),
  ]);

function sdkPreimage(opts: { v2?: boolean; passphrase?: string; contract?: string; fn?: string; merchant?: string; items?: xdr.ScVal[]; subs?: number; address?: string }): Buffer {
  const fnArgs = new xdr.InvokeContractArgs({
    contractAddress: new Address(opts.contract ?? REGISTRY).toScAddress(),
    functionName: opts.fn ?? 'seal_batch',
    args: [new Address(opts.merchant ?? ACCOUNT).toScVal(), xdr.ScVal.scvVec(opts.items ?? [sdkItem(20261006, 5)])],
  });
  const sub = (): xdr.SorobanAuthorizedInvocation =>
    new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(fnArgs), subInvocations: [] });
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(fnArgs),
    subInvocations: Array.from({ length: opts.subs ?? 0 }, sub),
  });
  const networkId = hash(opts.passphrase ?? Networks.TESTNET);
  const pre = opts.v2
    ? xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
        new xdr.HashIdPreimageSorobanAuthorizationWithAddress({ networkId, nonce: 987654321n, signatureExpirationLedger: 5253825, address: new Address(opts.address ?? ACCOUNT).toScAddress(), invocation }),
      )
    : xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
        new xdr.HashIdPreimageSorobanAuthorization({ networkId, nonce: 987654321n, signatureExpirationLedger: 5253825, invocation }),
      );
  return Buffer.from(pre.toXDR());
}

describe('xdr minimo: strkey y ScVal contrastados con @stellar/stellar-sdk', () => {
  it('strkey: codifica y decodifica cuentas G y contratos C igual que el SDK', () => {
    for (const s of [REGISTRY, ACCOUNT, G]) {
      const d = decodeStrkey(s);
      expect(encodeStrkey(d.kind, d.id)).toBe(s);
      expect(Buffer.from(d.id).equals(s.startsWith('C') ? StrKey.decodeContract(s) : StrKey.decodeEd25519PublicKey(s))).toBe(true);
    }
    expect(() => decodeStrkey(REGISTRY.slice(0, -1) + 'A')).toThrow();
  });

  it('ScVal: el SealItem se codifica con los mismos bytes que el SDK y se decodifica de vuelta', () => {
    const sdk = Buffer.from(sdkItem(20261006, 5, { prev: 1, reason: Buffer.alloc(32, 9) }).toXDR());
    const mine: ScVal = {
      t: 'map',
      v: [
        [{ t: 'symbol', v: 'amend' }, { t: 'vec', v: [{ t: 'symbol', v: 'Of' }, { t: 'map', v: [[{ t: 'symbol', v: 'prev_version' }, { t: 'u32', v: 1 }], [{ t: 'symbol', v: 'reason_hash' }, { t: 'bytes', v: new Uint8Array(32).fill(9) }]] }] }],
        [{ t: 'symbol', v: 'date' }, { t: 'u32', v: 20261006 }],
        [{ t: 'symbol', v: 'entry_count' }, { t: 'u32', v: 5 }],
        [{ t: 'symbol', v: 'origin_flags' }, { t: 'u32', v: 1 }],
        [{ t: 'symbol', v: 'root' }, { t: 'bytes', v: new Uint8Array(32).fill(7) }],
      ],
    };
    expect(Buffer.from(encodeScVal(mine)).equals(sdk)).toBe(true);
    expect(Buffer.from(encodeScVal(decodeScVal(new XdrReader(sdk)))).equals(sdk)).toBe(true);
  });

  it('ScVal: direcciones, enteros de 64 bits, textos y vacios', () => {
    for (const x of [new Address(ACCOUNT).toScVal(), new Address(G).toScVal(), xdr.ScVal.scvU64(2n ** 60n), xdr.ScVal.scvI64(-5n), xdr.ScVal.scvString('ñandú'), xdr.ScVal.scvVoid(), xdr.ScVal.scvBool(true), xdr.ScVal.scvBytes(Buffer.from([1, 2, 3]))]) {
      const bytes = Buffer.from(x.toXDR());
      expect(Buffer.from(encodeScVal(decodeScVal(new XdrReader(bytes)))).equals(bytes)).toBe(true);
    }
  });

  it('RULE_IDS_XDR es el XDR de Vec<u32>[0] y authDigest sigue la formula del spec 03 §5.3', () => {
    expect(Buffer.from(RULE_IDS_XDR).equals(Buffer.from(xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)]).toXDR()))).toBe(true);
    const pre = sdkPreimage({});
    const payload = createHash('sha256').update(pre).digest();
    const want = createHash('sha256').update(payload).update(Buffer.from(xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)]).toXDR())).digest();
    expect(Buffer.from(authDigest(pre)).equals(want)).toBe(true);
  });
});

describe('spec 03 §5.2: validacion de la preimagen antes de pedir Face ID', () => {
  const expected = { networkPassphrase: Networks.TESTNET, registryId: REGISTRY, merchantAddress: ACCOUNT, localDays: [{ date: 20261006, entryCount: 5 }] };

  it('decodifica las preimagenes v1 y v2 que arma el SDK', () => {
    const v1 = decodeAuthPreimage(sdkPreimage({}));
    expect(v1).toMatchObject({ envelopeType: 9, nonce: 987654321n, signatureExpirationLedger: 5253825, address: null, subInvocations: 0 });
    expect(v1.call).toMatchObject({ contract: REGISTRY, fn: 'seal_batch' });
    const v2 = decodeAuthPreimage(sdkPreimage({ v2: true }));
    expect(v2).toMatchObject({ envelopeType: 10, address: ACCOUNT });
  });

  it('acepta una preimagen correcta (v1 y v2) y devuelve auth_digest y los items', () => {
    for (const v2 of [false, true]) {
      const pre = sdkPreimage({ v2 });
      const r = validateSigningPreimage(pre, expected);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.items).toHaveLength(1);
        expect(r.items[0]).toMatchObject({ date: 20261006, entryCount: 5, originFlags: 1, amend: null });
        expect(Buffer.from(r.authDigest).equals(Buffer.from(authDigest(pre)))).toBe(true);
        expect(r.expirationLedger).toBe(5253825);
      }
    }
  });

  it('acepta una enmienda y varios dias en un lote', () => {
    const pre = sdkPreimage({ items: [sdkItem(20261005, 3), sdkItem(20261006, 6, { prev: 1, reason: Buffer.alloc(32, 1) })] });
    const r = validateSigningPreimage(pre, { ...expected, localDays: [{ date: 20261005, entryCount: 3 }, { date: 20261006, entryCount: 6 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items[1]?.amend).toMatchObject({ prevVersion: 1 });
  });

  it('rechaza otra red, otro contrato, otra funcion, otro comercio, otras fechas o conteos y sub-invocaciones', () => {
    const fail = (pre: Buffer, exp = expected) => {
      const r = validateSigningPreimage(pre, exp);
      return r.ok ? 'ok' : r.reason;
    };
    expect(fail(sdkPreimage({ passphrase: Networks.PUBLIC }))).toBe('red');
    expect(fail(sdkPreimage({ contract: ACCOUNT }))).toBe('contrato');
    expect(fail(sdkPreimage({ fn: 'set_attester' }))).toBe('funcion');
    expect(fail(sdkPreimage({ merchant: G }))).toBe('comercio');
    expect(fail(sdkPreimage({ v2: true, address: G }))).toBe('comercio');
    expect(fail(sdkPreimage({}), { ...expected, localDays: [{ date: 20261007, entryCount: 5 }] })).toBe('dias'); // otra fecha
    expect(fail(sdkPreimage({}), { ...expected, localDays: [{ date: 20261006, entryCount: 4 }] })).toBe('dias'); // otro conteo
    expect(fail(sdkPreimage({}), { ...expected, localDays: [] })).toBe('dias'); // dia que la app no tiene pendiente
    expect(fail(sdkPreimage({ items: [sdkItem(20261006, 5), sdkItem(20261007, 1)] }))).toBe('dias'); // dia de mas
    expect(fail(sdkPreimage({ subs: 1 }))).toBe('subinvocaciones');
    expect(fail(Buffer.from('basura'))).toBe('preimagen_invalida');
    expect(fail(Buffer.concat([sdkPreimage({}), Buffer.from([0, 0, 0, 0])]))).toBe('preimagen_invalida'); // bytes sobrantes
  });
});
