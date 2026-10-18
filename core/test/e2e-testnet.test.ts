/**
 * Prueba de punta a punta en testnet (spec 08 §4, spec 03 §10): solo corre con BIMO_E2E_TESTNET=1 y los secretos de
 * Bimo en el entorno (DEPLOYER_SECRET, FALLBACK_SUBMITTER_SECRET, ATTESTER_SECRET). Usa el codigo real de core
 * (worker de cuentas, cierre, preparacion de la firma, recepcion de la firma, worker de envio) y una llave P-256 de
 * software. Sella el dia de ejemplo del spec 02 (raiz 0859...c08b) con doble autorizacion y prueba QA-02.
 */
import { readFileSync } from 'node:fs';
import { p256 } from '@noble/curves/nist.js';
import { Address, Contract, Keypair, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDeployments } from '../src/deployments';
import { newId } from '../src/ids';
import { closeDay, ensureSigningRequest, submitSignature } from '../src/modules/cierre';
import { LEDGER_ACCOUNTS } from '../src/modules/comercios';
import {
  EnviadorDirecto,
  RpcSealPreparer,
  StellarAccountDeployer,
  StellarSealSubmitter,
  authDigest,
  computeAccountAddress,
  createSealSigner,
  normalizeLowS,
  signAttesterEntry,
} from '../src/modules/stellar';
import { processNextAccountDeploy } from '../src/workers/account-deploy';
import { processNextSealSubmit } from '../src/workers/seal-submit';
import { createTestDb, type TestDb } from './pg';

const enabled = process.env.BIMO_E2E_TESTNET === '1';
const run = enabled ? describe : describe.skip;

// La llave del vector del spec 03 §2 (solo de prueba, publica en el spec).
const VECTOR_PRIV = Buffer.from('989fd7c843f06b56d7ba2e78eb612f9f4459d3aff1173689c1a82a4a9fb60bfc', 'hex');
const VECTOR_MERCHANT = '01JA2B3C4D5E6F7G8H9J0KMNPQ'; // merchant_id de los vectores del spec 02

run('testnet: el dia de ejemplo del spec 02 se sella con doble autorizacion', () => {
  const d = loadDeployments('testnet');
  const server = new rpc.Server(d.rpc_url);
  let t: TestDb;
  let deployer: Keypair;
  let enviador: EnviadorDirecto;
  const links: string[] = [];

  beforeAll(async () => {
    t = await createTestDb();
    deployer = Keypair.fromSecret(process.env.DEPLOYER_SECRET as string);
    enviador = new EnviadorDirecto({ server, networkPassphrase: d.network_passphrase, feeSource: Keypair.fromSecret(process.env.FALLBACK_SUBMITTER_SECRET as string) });
  });
  afterAll(async () => {
    await t.close();
    if (links.length) console.log('ENLACES\n' + links.join('\n'));
  });

  async function registryRecord(account: string, date: number) {
    const source = await server.getAccount(deployer.publicKey());
    const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: d.network_passphrase })
      .addOperation(new Contract(d.registry_ids[0] as string).call('get', new Address(account).toScVal(), xdr.ScVal.scvU32(date)))
      .setTimeout(60)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim) || !sim.result) throw new Error('no se pudo leer el registro');
    return scValToNative(sim.result.retval) as Array<{ version: number; root: Uint8Array; entry_count: number; origin_flags: number }>;
  }

  it('crea la cuenta, cierra el dia, firma como el iPhone y queda sellado; QA-02 rechaza la firma ajena', async () => {
    const vec = JSON.parse(readFileSync(new URL('../../docs/specs/02-vectores.json', import.meta.url), 'utf8')) as {
      entries: Array<{ entry: { id: string; occurred_at: string; kind: 'venta'; origin: 'declarado' | 'verificado'; reverses_entry_id?: string; external_source?: string; external_ref?: string; lines: Array<{ line_no: number; account_code: string; direction: 'debe' | 'haber'; amount_minor: number; currency: 'COP'; channel?: string; customer_id?: string }> }; salt: string }>;
      day_example: { entry_ids: string[]; root: string };
    };
    const ownerPub = Buffer.from(p256.getPublicKey(VECTOR_PRIV, false));
    const user = 'abababab-abab-4bab-8bab-abababababab';
    await t.addUser(user);

    // 1) Comercio del vector y su dispositivo; el worker despliega la bimo-account real
    await t.db.insertInto('merchants').values({ id: VECTOR_MERCHANT, stellar_address: null, network: 'testnet', account_status: 'deploying', forgotten_at: null }).execute();
    await t.db.insertInto('merchant_members').values({ merchant_id: VECTOR_MERCHANT, user_id: user, role: 'dueno' }).execute();
    const accountIds = new Map<string, string>();
    for (const a of LEDGER_ACCOUNTS) {
      const id = newId();
      accountIds.set(a.code, id);
      await t.db.insertInto('ledger_accounts').values({ id, merchant_id: VECTOR_MERCHANT, code: a.code, type: a.type, currency: a.currency }).execute();
    }
    const deviceId = newId();
    await t.db.insertInto('devices').values({ id: deviceId, merchant_id: VECTOR_MERCHANT, user_id: user, key_kind: 'software_p256', public_key: ownerPub, signer_registered_tx: null, revoked_at: null }).execute();
    await t.db.insertInto('outbox_messages').values({ id: newId(), topic: 'account.deploy', payload: JSON.stringify({ merchant_id: VECTOR_MERCHANT, device_id: deviceId }), next_attempt_at: new Date(Date.now() - 1000) }).execute();
    const accounts = new StellarAccountDeployer({ server, deployments: d, deployer, enviador });
    expect(await processNextAccountDeploy({ db: t.db, deployer: accounts })).toBe(true);
    const merchant = await t.db.selectFrom('merchants').select(['account_status', 'stellar_address']).where('id', '=', VECTOR_MERCHANT).executeTakeFirstOrThrow();
    expect(merchant.account_status).toBe('ready');
    const account = merchant.stellar_address as string;
    expect(account).toBe(computeAccountAddress({ deployer: deployer.publicKey(), merchantId: VECTOR_MERCHANT, networkPassphrase: d.network_passphrase }));
    links.push(`cuenta: https://stellar.expert/explorer/testnet/contract/${account}`);

    // 2) Los 5 asientos del dia de ejemplo (spec 02 §9), con las sales del vector
    await t.db.insertInto('customers').values({ id: '01JA9Y000000000000000000R0', merchant_id: VECTOR_MERCHANT, display_name: 'Rosa', phone: null, created_at: new Date(), updated_at: new Date() }).execute();
    const byId = new Map(vec.entries.map((e) => [e.entry.id, e]));
    for (const id of vec.day_example.entry_ids) {
      const { entry: e, salt } = byId.get(id)!;
      await t.db.transaction().execute(async (tx) => {
        await tx.insertInto('journal_entries').values({
          id: e.id, merchant_id: VECTOR_MERCHANT, occurred_at: e.occurred_at, kind: e.kind, origin: e.origin, reverses_entry_id: e.reverses_entry_id ?? null,
          external_source: e.external_source ?? null, external_ref: e.external_ref ?? null, note: null, device_id: null, created_by: null,
        }).execute();
        for (const l of e.lines) {
          await tx.insertInto('journal_lines').values({
            id: newId(), entry_id: e.id, line_no: l.line_no, account_id: accountIds.get(l.account_code) as string, direction: l.direction,
            amount_minor: l.amount_minor, currency: l.currency, channel: (l.channel ?? null) as never, customer_id: l.customer_id ?? null,
          }).execute();
        }
        await tx.insertInto('entry_salts').values({ entry_id: e.id, salt: Buffer.from(salt, 'hex') }).execute();
      });
    }

    // 3) Cierre (D-3) y solicitud de firma real (simula seal_batch en testnet)
    const now = new Date();
    await closeDay(t.db, { merchantId: VECTOR_MERCHANT, userId: user, date: '2026-10-06', countedCashMinor: null, entryIds: vec.day_example.entry_ids, now });
    const preparer = new RpcSealPreparer({ server, deployments: d, sourceAddress: d.deployer });
    const request = await ensureSigningRequest(t.db, { merchantId: VECTOR_MERCHANT, preparer, now: new Date() });
    expect(request?.items).toEqual([{ date: '2026-10-06', entry_count: 5, is_amend: false }]);
    const preimage = Buffer.from(request!.preimage_xdr, 'base64');

    // 4) La app (aqui, la llave de software del vector) firma auth_digest y core recibe la firma
    const signature = Buffer.from(p256.sign(authDigest(preimage), VECTOR_PRIV, { prehash: true }));
    const signer = createSealSigner({ attester: Keypair.fromSecret(process.env.ATTESTER_SECRET as string), networkPassphrase: d.network_passphrase });
    await submitSignature(t.db, { merchantId: VECTOR_MERCHANT, requestId: request!.signing_request_id, deviceId, ownerPublicKey: ownerPub, signature, signer, now: new Date() });

    // 5) El worker envia seal_batch con la doble autorizacion y confirma
    const submitter = new StellarSealSubmitter({ server, deployments: d, deployer, enviador });
    await t.db.updateTable('outbox_messages').set({ next_attempt_at: new Date(Date.now() - 1000) }).where('topic', '=', 'seal.submit').execute();
    expect(await processNextSealSubmit({ db: t.db, submitter })).toBe(true);
    const seal = await t.db.selectFrom('seals').selectAll().where('signing_request_id', '=', request!.signing_request_id).executeTakeFirstOrThrow();
    expect(seal.status).toBe('confirmado');
    expect(seal.tx_hash).toMatch(/^[0-9a-f]{64}$/);
    links.push(`seal (día de ejemplo, raíz ${vec.day_example.root}): https://stellar.expert/explorer/testnet/tx/${seal.tx_hash}`);
    const day = await t.db.selectFrom('business_days').select(['status', 'current_seal_version']).where('merchant_id', '=', VECTOR_MERCHANT).executeTakeFirstOrThrow();
    expect(day).toEqual({ status: 'sellado', current_seal_version: 1 });

    // 6) get() devuelve el sello con la raiz del spec
    const records = await registryRecord(account, 20261006);
    expect(Buffer.from(records[0]!.root).toString('hex')).toBe(vec.day_example.root);
    expect(records[0]).toMatchObject({ version: 1, entry_count: 5, origin_flags: 3 });

    // 7) QA-02: la misma tx con una firma que NO es la del comercio (la unica llave que Bimo podria usar) la rechaza la red
    const wrong = normalizeLowS(Buffer.from(p256.sign(authDigest(preimage), p256.utils.randomSecretKey(), { prehash: true })));
    const attester = await signAttesterEntry({ preimageXdr: preimage, attester: Keypair.fromSecret(process.env.ATTESTER_SECRET as string), networkPassphrase: d.network_passphrase });
    const fresh = await preparer.prepare({
      merchantAddress: account,
      now: new Date(),
      items: [{ date: 20261007, root: Buffer.alloc(32, 1), entryCount: 1, originFlags: 1, amend: undefined }],
    });
    const attester2 = await signAttesterEntry({ preimageXdr: fresh.preimageXdr, attester: Keypair.fromSecret(process.env.ATTESTER_SECRET as string), networkPassphrase: d.network_passphrase });
    const qa02 = await submitter.submit({
      merchantAddress: account,
      items: [{ date: 20261007, root: Buffer.alloc(32, 1), entryCount: 1, originFlags: 1, amend: undefined }],
      preimageXdr: fresh.preimageXdr,
      ownerSignature: wrong,
      ownerPublicKey: ownerPub,
      attesterEntry: attester2,
    });
    expect(qa02.status).toBe('fallido');
    expect(qa02.hash).toBe('');
    expect((await registryRecord(account, 20261007)).length).toBe(0); // nada quedo guardado
    void attester;
    links.push('QA-02: sellar con una firma que no es la del comercio fue rechazado por la red en la simulación (nada se guardó).');
  }, 240_000);
});
