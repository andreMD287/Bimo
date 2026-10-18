import { p256 } from '@noble/curves/nist.js';
import { Address, Keypair, Networks, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerDiasRoutes } from '../src/api/routes/dias';
import { buildServer } from '../src/api/server';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { AppError } from '../src/errors';
import {
  authDigest,
  authPayloadScVal,
  createSealSigner,
  decodePreimage,
  normalizeLowS,
  signAttesterEntry,
  verifyOwnerSignature,
  type EnvioResult,
  type SealItemInput,
  type SealPreparer,
  type SealSubmitter,
  type SubmitSealInput,
} from '../src/modules/stellar';
import { processNextSealSubmit } from '../src/workers/seal-submit';
import { insertEntry, seedMerchant, venta } from './fixtures';
import { makeAuth, testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

// ------------------------------------------------------------------ criptografia (spec 03 §2 y §5.3)
const KEY = '04b609d9b7b75af1981c44fe316b89e3a0416a2b4cc0c42ae93ac5da8ba91215a8588f5c41d34fe80bcd7ed19e470bfc9b125a32350279d6ee867dffef85dae70e';
const SIG_HIGH_S = '359f38f09c89bc24abaaafc28aa31446d3b517ed054043127c2ecf28af9c62fff87eba6464a1cce15861f8df4c2272b4d5e35056d92fa2fcb6628b7ac3f3c366';
const SIG_HIGH_S_NORMALIZED = '359f38f09c89bc24abaaafc28aa31446d3b517ed054043127c2ecf28af9c62ff0781459a9b5e331fa79e0720b3dd8d4ae703aa56cde7fb883d573f48386f61eb';
const ATTESTER = Keypair.random();
const REGISTRY = 'CDRMZRCZZFICPDROENVBP6VFDPB2FTZARW2A4XV7NERRM6BPSD45GZYB';

/** HashIdPreimage::SorobanAuthorization de mentira (misma forma que la real) para las pruebas. */
function fakePreimage(expirationLedger: number, nonce = 12345n): Buffer {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({ contractAddress: new Address(REGISTRY).toScAddress(), functionName: 'seal_batch', args: [] }),
    ),
    subInvocations: [],
  });
  const pre = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({ networkId: Buffer.alloc(32, 9), nonce, signatureExpirationLedger: expirationLedger, invocation }),
  );
  return Buffer.from(pre.toXDR());
}

describe('spec 03 §5.3-§5.4: firma del sello', () => {
  it('spec03-2 normalizeLowS convierte la firma high-S del spec en la normalizada', () => {
    expect(normalizeLowS(Buffer.from(SIG_HIGH_S, 'hex')).toString('hex')).toBe(SIG_HIGH_S_NORMALIZED);
    // una firma que ya es low-S no cambia
    expect(normalizeLowS(Buffer.from(SIG_HIGH_S_NORMALIZED, 'hex')).toString('hex')).toBe(SIG_HIGH_S_NORMALIZED);
  });

  it('spec03-5.3 el dueno firma SHA-256(auth_digest) y verifyOwnerSignature lo comprueba (low-S o high-S)', () => {
    const priv = p256.utils.randomSecretKey();
    const pub = p256.getPublicKey(priv, false);
    const pre = fakePreimage(1000);
    const sig = p256.sign(authDigest(pre), priv, { prehash: true });
    expect(verifyOwnerSignature(pub, pre, sig)).toBe(true);
    // otra preimagen, otra clave o largo incorrecto: no
    expect(verifyOwnerSignature(pub, fakePreimage(1001), sig)).toBe(false);
    expect(verifyOwnerSignature(p256.getPublicKey(p256.utils.randomSecretKey(), false), pre, sig)).toBe(false);
    expect(verifyOwnerSignature(pub, pre, sig.slice(0, 63))).toBe(false);
    // la normalizada tambien verifica (es la que va a la cadena)
    expect(verifyOwnerSignature(pub, pre, normalizeLowS(sig))).toBe(true);
  });

  it('spec03-5.4 AuthPayload: context_rule_ids [0] y un firmante External(verificador, clave)', () => {
    const payload = authPayloadScVal({ verifierId: 'CBMQY54X5BZEOF3TSCZC73MCKIC4SLDYDFNUVHQZ2PTGVTGZD7ILSBVL', publicKey: Buffer.from(KEY, 'hex'), signature: Buffer.from(SIG_HIGH_S_NORMALIZED, 'hex') });
    const native = scValToNative(payload) as { context_rule_ids: number[]; signers: unknown };
    expect(Object.keys(native)).toEqual(['context_rule_ids', 'signers']);
    expect(native.context_rule_ids).toEqual([0]);
    expect(JSON.stringify(payload.toXDR('base64')).length).toBeGreaterThan(50);
  });

  it('spec03-5.4 la entrada del atestador lleva su firma ed25519 y la misma invocacion y vigencia que la del comercio', async () => {
    const pre = fakePreimage(5000);
    const entryXdr = await signAttesterEntry({ preimageXdr: pre, attester: ATTESTER, networkPassphrase: Networks.TESTNET });
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(entryXdr);
    const cred = (entry.credentials as unknown as { address: { address: xdr.ScAddress; signatureExpirationLedger: number; signature: xdr.ScVal } }).address;
    expect(Address.fromScAddress(cred.address).toString()).toBe(ATTESTER.publicKey());
    expect(cred.signatureExpirationLedger).toBe(5000);
    expect(scValToNative(cred.signature)).toHaveLength(1); // [{public_key, signature}]
    expect(entry.rootInvocation.toXDR('base64')).toBe(decodePreimage(pre).invocation.toXDR('base64'));
  });
});

// ------------------------------------------------------------------ S-2 y ciclo del sello con Postgres real
let t: TestDb;
let app: FastifyInstance;
let auth: Awaited<ReturnType<typeof makeAuth>>;
let clock = Date.parse('2026-10-17T15:00:00.000Z');
let nUser = 0;

class FakePreparer implements SealPreparer {
  calls = 0;
  async prepare(input: { merchantAddress: string; items: SealItemInput[]; now: Date }) {
    this.calls += 1;
    const expiration = 10_000 + this.calls;
    return { preimageXdr: fakePreimage(expiration, BigInt(this.calls)), expirationLedger: expiration, expiresAt: new Date(input.now.getTime() + 10 * 60 * 1000) };
  }
}

class FakeSubmitter implements SealSubmitter {
  ledger = 10_000;
  submits: SubmitSealInput[] = [];
  /** Resultado del proximo envio. */
  next: () => Promise<EnvioResult> | EnvioResult = () => ({ hash: 'TXHASH1', status: 'confirmado', ledger: 777 });
  statusOf: 'confirmado' | 'fallido' | 'pendiente' | 'desconocido' = 'pendiente';
  down = false;
  /** Se ejecuta entre "la red acepto la tx" y su confirmacion (por ejemplo, llega un asiento). */
  afterAccepted: (() => Promise<void>) | undefined;
  async latestLedger() {
    if (this.down) throw new AppError('chain_unavailable', 'sin red');
    return this.ledger;
  }
  async status() {
    return this.statusOf;
  }
  async submit(input: SubmitSealInput) {
    this.submits.push(input);
    const r = await this.next();
    if (r.hash) await input.onSubmitted?.(r.hash);
    if (this.afterAccepted) await this.afterAccepted();
    return r;
  }
}

const preparer = new FakePreparer();
const submitter = new FakeSubmitter();
const signer = createSealSigner({ attester: ATTESTER, networkPassphrase: Networks.TESTNET });

beforeAll(async () => {
  t = await createTestDb();
  auth = await makeAuth();
  app = await buildServer({
    config: testConfig(),
    db: t.db,
    jwt: auth.jwt,
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    now: () => clock,
    seals: preparer,
    signer,
    routes: [registerDiasRoutes],
  });
});
afterAll(async () => {
  await app.close();
  await t.close();
});
beforeEach(async () => {
  await t.db.deleteFrom('outbox_messages').execute();
  submitter.submits = [];
  submitter.next = () => ({ hash: 'TXHASH1', status: 'confirmado', ledger: 777 });
  submitter.statusOf = 'pendiente';
  submitter.down = false;
  submitter.afterAccepted = undefined;
  submitter.ledger = 10_000;
});

async function newMerchant() {
  nUser += 1;
  const user = `99999999-9999-4999-8999-${String(nUser).padStart(12, '0')}`;
  await t.addUser(user);
  const m = await seedMerchant(t.db, user);
  const priv = p256.utils.randomSecretKey();
  await t.db.updateTable('devices').set({ public_key: Buffer.from(p256.getPublicKey(priv, false)) }).where('id', '=', m.deviceIds[0] as string).execute();
  await t.db.updateTable('merchants').set({ account_status: 'ready', stellar_address: `C${m.merchantId}`.padEnd(56, 'A') }).where('id', '=', m.merchantId).execute();
  return { user, ...m, device: m.deviceIds[0] as string, priv, address: `C${m.merchantId}`.padEnd(56, 'A') };
}
type M = Awaited<ReturnType<typeof newMerchant>>;

async function call(m: M, method: 'GET' | 'POST', url: string, body?: unknown) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${await auth.sign(m.user)}`, 'x-device-time': new Date(clock).toISOString(), 'x-device-id': m.device },
    ...(body !== undefined ? { payload: body as object } : {}),
  });
}
const sell = (m: M, at: string, amt = 1000) => insertEntry(t.db, { merchantId: m.merchantId, deviceId: m.device, occurredAt: at, lines: venta(amt) });
const dayStatus = async (m: M, date: string) =>
  (await t.db.selectFrom('business_days').select(['status', 'current_seal_version']).where('merchant_id', '=', m.merchantId).where('business_date', '=', date).executeTakeFirstOrThrow());

/** Cierra un dia y devuelve la solicitud de firma pendiente. */
async function closedWithRequest(m: M, date: string, n = 2) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await sell(m, `${date}T1${i}:00:00.000Z`, 100 + i));
  await call(m, 'POST', `/days/${date}/close`, { counted_cash_minor: 1000, entry_ids: ids });
  const req = (await call(m, 'GET', '/signing/pending')).json().request as { signing_request_id: string; preimage_xdr: string; expiration_ledger: number };
  return { ...req, preimage: Buffer.from(req.preimage_xdr, 'base64'), ids };
}
const sign = (m: M, preimage: Buffer) => Buffer.from(p256.sign(authDigest(preimage), m.priv, { prehash: true })).toString('base64');

describe('spec 07 §2: S-2 POST /signing/{id}/signature', () => {
  it('S-2 / L-2 / D-4 una firma valida deja la solicitud firmada, los sellos firmados (low-S y entrada del atestador) y el dia firmado', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-01');
    const res = await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: sign(m, r.preimage) });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'firmado' });
    expect((await t.db.selectFrom('signing_requests').select('status').where('id', '=', r.signing_request_id).executeTakeFirstOrThrow()).status).toBe('firmada');
    const seal = await t.db.selectFrom('seals').selectAll().where('signing_request_id', '=', r.signing_request_id).executeTakeFirstOrThrow();
    expect(seal.status).toBe('firmado');
    expect(seal.merchant_signature).toHaveLength(64);
    const s = BigInt('0x' + Buffer.from(seal.merchant_signature!.subarray(32)).toString('hex'));
    expect(s <= p256.Point.Fn.ORDER / 2n).toBe(true); // low-S
    const att = xdr.SorobanAuthorizationEntry.fromXDR(Buffer.from(seal.attester_signature!));
    expect(Address.fromScAddress((att.credentials as unknown as { address: { address: xdr.ScAddress } }).address.address).toString()).toBe(ATTESTER.publicKey());
    expect((await dayStatus(m, '2026-10-01')).status).toBe('firmado');
    const msgs = await t.db.selectFrom('outbox_messages').selectAll().where('topic', '=', 'seal.submit').execute();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.payload).toMatchObject({ signing_request_id: r.signing_request_id, merchant_id: m.merchantId });
  });

  it('una firma high-S tambien se acepta y se guarda normalizada', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-02');
    const low = p256.sign(authDigest(r.preimage), m.priv, { prehash: true });
    const n = p256.Point.Fn.ORDER;
    const high = Buffer.concat([Buffer.from(low.slice(0, 32)), Buffer.from((n - BigInt('0x' + Buffer.from(low.slice(32)).toString('hex'))).toString(16).padStart(64, '0'), 'hex')]);
    expect((await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: high.toString('base64') })).statusCode).toBe(202);
    const seal = await t.db.selectFrom('seals').select('merchant_signature').where('signing_request_id', '=', r.signing_request_id).executeTakeFirstOrThrow();
    expect(Buffer.from(seal.merchant_signature!).equals(Buffer.from(low))).toBe(true);
  });

  it('spec06-6 una firma que no corresponde responde 422 invalid_signature y no cambia nada', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-03');
    const other = Buffer.from(p256.sign(authDigest(r.preimage), p256.utils.randomSecretKey(), { prehash: true })).toString('base64');
    const res = await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: other });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('invalid_signature');
    expect((await t.db.selectFrom('signing_requests').select('status').where('id', '=', r.signing_request_id).executeTakeFirstOrThrow()).status).toBe('abierta');
    expect((await dayStatus(m, '2026-10-03')).status).toBe('cerrado');
    expect(await t.db.selectFrom('outbox_messages').select('id').execute()).toHaveLength(0);
  });

  it('spec07-2 una firma despues de expires_at responde 409 signature_expired y la solicitud queda vencida', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-04');
    clock += 11 * 60 * 1000;
    const res = await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: sign(m, r.preimage) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('signature_expired');
    expect((await t.db.selectFrom('signing_requests').select('status').where('id', '=', r.signing_request_id).executeTakeFirstOrThrow()).status).toBe('vencida');
    // volver a pedir la solicitud funciona
    expect((await call(m, 'GET', '/signing/pending')).json().request.signing_request_id).not.toBe(r.signing_request_id);
  });

  it('spec07-2 firmar una solicitud reemplazada responde 409 request_superseded', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-05');
    await t.db.updateTable('signing_requests').set({ status: 'reemplazada' }).where('id', '=', r.signing_request_id).execute();
    const res = await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: sign(m, r.preimage) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('request_superseded');
  });

  it('un asiento que llego despues de preparar el sello (cambio el conteo) responde 409 request_superseded y reemplaza la solicitud', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-06');
    await sell(m, '2026-10-06T18:00:00.000Z', 5); // llego por otro dispositivo; nadie llamo a supersede aun
    const res = await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: sign(m, r.preimage) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('request_superseded');
    expect((await t.db.selectFrom('signing_requests').select('status').where('id', '=', r.signing_request_id).executeTakeFirstOrThrow()).status).toBe('reemplazada');
    const again = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(again.items[0].entry_count).toBe(3);
  });

  it('reintentar una firma ya recibida responde 202 sin duplicar el mensaje; otra solicitud o inexistente, 404', async () => {
    const m = await newMerchant();
    const r = await closedWithRequest(m, '2026-10-07');
    const body = { signature: sign(m, r.preimage) };
    expect((await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, body)).statusCode).toBe(202);
    expect((await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, body)).statusCode).toBe(202);
    expect(await t.db.selectFrom('outbox_messages').select('id').where('topic', '=', 'seal.submit').execute()).toHaveLength(1);
    const other = await newMerchant();
    expect((await call(other, 'POST', `/signing/${r.signing_request_id}/signature`, body)).statusCode).toBe(404);
    expect((await call(m, 'POST', `/signing/01JA0000000000000000000NOPE/signature`, body)).statusCode).toBe(404);
    expect((await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: 'AAAA' })).statusCode).toBe(400);
  });
});

/** Firma una solicitud y deja el mensaje `seal.submit` listo. */
async function signedRequest(m: M, date: string, n = 2) {
  const r = await closedWithRequest(m, date, n);
  expect((await call(m, 'POST', `/signing/${r.signing_request_id}/signature`, { signature: sign(m, r.preimage) })).statusCode).toBe(202);
  return r;
}
const worker = (now = clock) => processNextSealSubmit({ db: t.db, submitter, now: () => new Date(now) });
const sealOf = (requestId: string) => t.db.selectFrom('seals').selectAll().where('signing_request_id', '=', requestId).execute();
const messageOf = () => t.db.selectFrom('outbox_messages').selectAll().where('topic', '=', 'seal.submit').executeTakeFirstOrThrow();

describe('spec 07 §3: L-3..L-6 y D-5..D-8 (worker seal-submit)', () => {
  it('L-3 / L-4 / D-5 se envia con la doble autorizacion, queda confirmado con el tx_hash y el dia sellado', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-01');
    expect(await worker()).toBe(true);
    const sent = submitter.submits[0]!;
    expect(sent.merchantAddress).toBe(m.address);
    expect(sent.items).toHaveLength(1);
    expect(sent.items[0]).toMatchObject({ date: 20260901, entryCount: 2, originFlags: 1, amend: undefined });
    expect(sent.ownerSignature).toHaveLength(64);
    expect(sent.ownerPublicKey).toHaveLength(65);
    expect(sent.attesterEntry.length).toBeGreaterThan(50);
    const [seal] = await sealOf(r.signing_request_id);
    expect(seal).toMatchObject({ status: 'confirmado', tx_hash: 'TXHASH1', ledger_seq: 777 });
    expect(seal?.confirmed_at).not.toBeNull();
    expect(await dayStatus(m, '2026-09-01')).toEqual({ status: 'sellado', current_seal_version: 1 });
    expect((await messageOf()).status).toBe('enviado');
  });

  it('L-3 todos los sellos de la misma solicitud comparten el tx_hash (lote de varios dias, un solo envio)', async () => {
    const m = await newMerchant();
    const a = await sell(m, '2026-08-01T15:00:00.000Z');
    const b = await sell(m, '2026-08-02T15:00:00.000Z');
    await call(m, 'POST', '/days/2026-08-01/close', { counted_cash_minor: 1, entry_ids: [a] });
    await call(m, 'POST', '/days/2026-08-02/close', { counted_cash_minor: 1, entry_ids: [b] });
    const req = (await call(m, 'GET', '/signing/pending')).json().request;
    await call(m, 'POST', `/signing/${req.signing_request_id}/signature`, { signature: sign(m, Buffer.from(req.preimage_xdr, 'base64')) });
    await worker();
    expect(submitter.submits).toHaveLength(1);
    expect(submitter.submits[0]!.items.map((i) => i.date)).toEqual([20260801, 20260802]);
    const seals = await sealOf(req.signing_request_id);
    expect(new Set(seals.map((s) => s.tx_hash))).toEqual(new Set(['TXHASH1']));
    expect(seals.every((s) => s.status === 'confirmado')).toBe(true);
  });

  it('D-6 un asiento que llega mientras el sello esta enviado deja el dia en requiere_enmienda tras la confirmacion', async () => {
    const m = await newMerchant();
    await signedRequest(m, '2026-09-02');
    submitter.afterAccepted = async () => {
      await sell(m, '2026-09-02T20:00:00.000Z', 9); // llega con la tx ya aceptada, antes de la confirmacion
    };
    await worker();
    expect(await dayStatus(m, '2026-09-02')).toEqual({ status: 'requiere_enmienda', current_seal_version: 1 });
  });

  it('L-5 si el envio falla el sello queda fallido con el codigo y se reintenta con la misma firma hasta confirmar', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-03');
    submitter.next = () => ({ hash: '', status: 'fallido', error: 'AuthError' });
    await worker();
    const [failed] = await sealOf(r.signing_request_id);
    expect(failed).toMatchObject({ status: 'fallido', error: 'AuthError' });
    expect((await messageOf()).status).toBe('pendiente');
    expect((await messageOf()).next_attempt_at.getTime()).toBeGreaterThan(clock);
    // el reintento espera el backoff
    expect(await worker(clock)).toBe(false);
    submitter.next = () => ({ hash: 'TXOK', status: 'confirmado', ledger: 800 });
    expect(await worker(clock + 60_000)).toBe(true);
    expect(submitter.submits).toHaveLength(2);
    expect(submitter.submits[1]!.ownerSignature.equals(submitter.submits[0]!.ownerSignature)).toBe(true);
    expect((await sealOf(r.signing_request_id))[0]).toMatchObject({ status: 'confirmado', tx_hash: 'TXOK', error: null });
    expect((await dayStatus(m, '2026-09-03')).status).toBe('sellado');
  });

  it('L-5 una tx enviada que falla en la red queda fallido (TxFailed) y no se confirma', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-04');
    submitter.next = () => ({ hash: 'TXBAD', status: 'fallido', ledger: 5, error: 'FAILED' });
    await worker();
    expect((await sealOf(r.signing_request_id))[0]).toMatchObject({ status: 'fallido', error: 'FAILED' });
    expect((await dayStatus(m, '2026-09-04')).status).toBe('firmado');
  });

  it('L-6 / D-7 un sello no enviado antes de expirar se descarta, el dia vuelve a cerrado y no quedan filas con la misma version', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-05');
    submitter.ledger = r.expiration_ledger + 1; // la firma vencio
    await worker();
    expect(submitter.submits).toHaveLength(0);
    expect(await sealOf(r.signing_request_id)).toHaveLength(0);
    expect(await dayStatus(m, '2026-09-05')).toEqual({ status: 'cerrado', current_seal_version: 0 });
    const audit = await t.db.selectFrom('audit_log').select('detail').where('action', '=', 'seal.discarded').where('target', '=', r.signing_request_id).execute();
    expect(audit).toHaveLength(1);
    expect((await messageOf()).status).toBe('enviado');
    // la proxima solicitud vuelve a crear la version 1 sin chocar con el unique (day_id, version)
    const again = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(again.items[0]).toMatchObject({ date: '2026-09-05', is_amend: false });
  });

  it('L-6 / D-8 una enmienda no enviada antes de expirar se descarta y el dia vuelve a requiere_enmienda', async () => {
    const m = await newMerchant();
    const r1 = await signedRequest(m, '2026-09-06');
    await worker(); // sello 1 confirmado -> sellado
    await sell(m, '2026-09-06T21:00:00.000Z', 3); // DB-09 -> requiere_enmienda
    expect((await dayStatus(m, '2026-09-06')).status).toBe('requiere_enmienda');
    const req2 = (await call(m, 'GET', '/signing/pending')).json().request;
    expect(req2.items[0].is_amend).toBe(true);
    await call(m, 'POST', `/signing/${req2.signing_request_id}/signature`, { signature: sign(m, Buffer.from(req2.preimage_xdr, 'base64')) });
    expect((await dayStatus(m, '2026-09-06')).status).toBe('firmado');
    submitter.ledger = req2.expiration_ledger + 1;
    await worker();
    expect(await sealOf(req2.signing_request_id)).toHaveLength(0);
    expect(await dayStatus(m, '2026-09-06')).toEqual({ status: 'requiere_enmienda', current_seal_version: 1 });
    expect((await sealOf(r1.signing_request_id))[0]?.status).toBe('confirmado'); // el sello 1 sigue intacto (DB-12)
  });

  it('D-5 con una enmienda confirmada la version vigente pasa a 2 y el dia queda sellado', async () => {
    const m = await newMerchant();
    await signedRequest(m, '2026-09-07');
    await worker();
    await sell(m, '2026-09-07T21:00:00.000Z', 3);
    const req2 = (await call(m, 'GET', '/signing/pending')).json().request;
    await call(m, 'POST', `/signing/${req2.signing_request_id}/signature`, { signature: sign(m, Buffer.from(req2.preimage_xdr, 'base64')) });
    submitter.next = () => ({ hash: 'TXAMEND', status: 'confirmado', ledger: 900 });
    await worker();
    expect(submitter.submits[1]!.items[0]!.amend).toMatchObject({ prevVersion: 1 });
    expect(await dayStatus(m, '2026-09-07')).toEqual({ status: 'sellado', current_seal_version: 2 });
  });

  it('una tx ya enviada se consulta por su hash: confirmada -> L-4 sin volver a enviar', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-08');
    // simula que el worker murio tras L-3
    await t.db.updateTable('seals').set({ status: 'enviado', tx_hash: 'TXPEND' }).where('signing_request_id', '=', r.signing_request_id).execute();
    submitter.statusOf = 'pendiente';
    await worker();
    expect(submitter.submits).toHaveLength(0);
    expect((await sealOf(r.signing_request_id))[0]?.status).toBe('enviado');
    submitter.statusOf = 'confirmado';
    await worker(clock + 60_000);
    expect(submitter.submits).toHaveLength(0);
    expect((await sealOf(r.signing_request_id))[0]).toMatchObject({ status: 'confirmado', tx_hash: 'TXPEND' });
    expect((await dayStatus(m, '2026-09-08')).status).toBe('sellado');
  });

  it('spec06-6 si Stellar no responde nada cambia y el mensaje se reintenta despues', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-09');
    submitter.down = true;
    await worker();
    expect((await sealOf(r.signing_request_id))[0]?.status).toBe('firmado');
    expect((await messageOf()).status).toBe('pendiente');
    submitter.down = false;
    await worker(clock + 60_000);
    expect((await sealOf(r.signing_request_id))[0]?.status).toBe('confirmado');
  });

  it('DB-12 un sello confirmado no se puede editar ni borrar', async () => {
    const m = await newMerchant();
    const r = await signedRequest(m, '2026-09-10');
    await worker();
    await expect(t.db.updateTable('seals').set({ entry_count: 99 }).where('signing_request_id', '=', r.signing_request_id).execute()).rejects.toThrow(/DB-12/);
    await expect(t.db.deleteFrom('seals').where('signing_request_id', '=', r.signing_request_id).execute()).rejects.toThrow(/DB-12/);
  });
});
