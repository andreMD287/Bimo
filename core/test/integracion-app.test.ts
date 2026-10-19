/**
 * Ensayo de punta a punta (A-19) con el codigo REAL de la app (runtime, base local, firmante, motor de sincronizacion)
 * contra `bimo-core` real y Postgres real. Se simulan solo los bordes externos: Supabase Auth (codigo por correo), la
 * red de Stellar (preparacion de la firma, despliegue de la cuenta y envio) y la lectura del registry.
 * Flujo: onboarding -> ventas sin red -> sincronizar -> cerrar -> validar la preimagen y firmar -> sellado -> enlace -> verificar.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Address, Keypair, Networks, hash, xdr } from '@stellar/stellar-sdk';
import { SignJWT, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntime, SigningError } from '../../frontend/src/runtime/runtime';
import { memoryKv } from '../../frontend/src/kv';
import { asientoAjusteCaja, asientoVenta } from '../../frontend/src/mocks/contabilidad';
import { instanteBogota, sumarDias, hoyBogota, fechaBogota } from '../../frontend/src/lib/fechas';
import { cargarFirmante } from '../../frontend/src/signer';
import { MemoryStore } from '../../frontend/src/store/memory';
import type { CanalConfig } from '../../frontend/src/lib/tipos';
import type { OnChainSeal, SealReader } from '../../verifier/src';
import { registerComerciosRoutes } from '../src/api/routes/comercios';
import { registerDiasRoutes } from '../src/api/routes/dias';
import { registerSyncRoutes } from '../src/api/routes/sync';
import { registerVerificacionRoutes } from '../src/api/routes/verificacion';
import { buildServer } from '../src/api/server';
import { createJwtVerifier } from '../src/auth/jwt';
import { createPgDeviceDirectory } from '../src/auth/devices';
import { loadDeployments } from '../src/deployments';
import { computeAccountAddress, createSealSigner, sealItemScVal, type SealItemInput, type SealPreparer, type SealSubmitter, type SubmitSealInput } from '../src/modules/stellar';
import { processNextAccountDeploy } from '../src/workers/account-deploy';
import { processNextSealSubmit } from '../src/workers/seal-submit';
import { testConfig } from './helpers';
import { createTestDb, type TestDb } from './pg';

const d = loadDeployments('testnet');
const USER = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
const DEPLOYER = 'GCSGJMK4653I7I5HKI7CIYKROGA5EOFEINSG43LIVSLVEIPOYRCXQCBE';

let t: TestDb;
let api: Server;
let auth: Server;
let apiUrl = '';
let authUrl = '';
let rtStop = false;
let networkUp = true;
const attester = Keypair.random();

/** Preparador de firmas con una preimagen REAL (la misma forma que arma Stellar), sin llamar a la red. */
class LocalPreparer implements SealPreparer {
  n = 0;
  async prepare(input: { merchantAddress: string; items: SealItemInput[]; now: Date }) {
    this.n += 1;
    const expiration = 9_000_000 + this.n;
    const args = new xdr.InvokeContractArgs({
      contractAddress: new Address(d.registry_ids[d.registry_ids.length - 1] as string).toScAddress(),
      functionName: 'seal_batch',
      args: [new Address(input.merchantAddress).toScVal(), xdr.ScVal.scvVec(input.items.map(sealItemScVal))],
    });
    const invocation = new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(args), subInvocations: [] });
    const pre = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({ networkId: hash(Networks.TESTNET), nonce: BigInt(this.n), signatureExpirationLedger: expiration, invocation }),
    );
    return { preimageXdr: Buffer.from(pre.toXDR()), expirationLedger: expiration, expiresAt: new Date(input.now.getTime() + 10 * 60 * 1000) };
  }
}

class ConfirmingSubmitter implements SealSubmitter {
  submits: SubmitSealInput[] = [];
  async latestLedger() {
    return 100;
  }
  async status() {
    return 'desconocido' as const;
  }
  async submit(i: SubmitSealInput) {
    this.submits.push(i);
    await i.onSubmitted?.('TXHASH_INTEGRACION');
    return { hash: 'TXHASH_INTEGRACION', status: 'confirmado' as const, ledger: 321 };
  }
}
const submitter = new ConfirmingSubmitter();

function listen(server: Server): Promise<string> {
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

beforeAll(async () => {
  t = await createTestDb();
  await t.addUser(USER);
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const token = () => new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject(USER).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);

  // Supabase Auth de mentira: acepta el codigo 123456
  auth = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/auth/v1/otp') return void res.end('{}');
      const j = body ? (JSON.parse(body) as { token?: string }) : {};
      if (req.url === '/auth/v1/verify' && j.token !== '123456') {
        res.statusCode = 400;
        return void res.end('{"error":"invalid"}');
      }
      res.end(JSON.stringify({ access_token: await token(), refresh_token: 'r', expires_in: 3600, user: { id: USER } }));
    });
  });
  authUrl = await listen(auth);

  const app = await buildServer({
    config: testConfig(),
    db: t.db,
    jwt: createJwtVerifier({ keys: async () => publicKey }),
    devices: createPgDeviceDirectory(t.db),
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    seals: new LocalPreparer(),
    signer: createSealSigner({ attester, networkPassphrase: Networks.TESTNET }),
    routes: [registerComerciosRoutes, registerSyncRoutes, registerDiasRoutes, registerVerificacionRoutes],
  });
  await app.ready();
  // Fastify atiende por su propio servidor HTTP
  await app.listen({ port: 0, host: '127.0.0.1' });
  apiUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  api = app.server;
});

afterAll(async () => {
  rtStop = true;
  await new Promise((r) => auth.close(r));
  await new Promise((r) => api.close(r));
  await t.close();
});

const bytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256));

const CANAL_EFECTIVO: CanalConfig = { id: '01JD0000000000000000000EFE', nombre: 'Efectivo', channel: 'efectivo', comision_bps: 0, dias_consignacion: 0, activo: true };
const CANAL_BREB: CanalConfig = { id: '01JD0000000000000000000BRE', nombre: 'Bre-B', channel: 'breb', comision_bps: 0, dias_consignacion: 0, activo: true };

describe('ensayo de punta a punta con el codigo real de la app', () => {
  it('onboarding, ventas sin red, sincronizacion, cierre, firma validada, sello, enlace y verificacion', async () => {
    const store = new MemoryStore();
    const kv = memoryKv();
    const rt = createRuntime({
      config: { apiUrl, supabaseUrl: authUrl, anonKey: 'anon', deployments: { network_passphrase: d.network_passphrase, rpc_url: d.rpc_url, registry_ids: d.registry_ids } },
      kv,
      store,
      signer: cargarFirmante(kv, bytes),
      sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 150))),
      fetchImpl: (async (url: string, init?: RequestInit) => {
        if (!networkUp && String(url).startsWith(apiUrl)) throw new TypeError('sin red');
        return fetch(url, init);
      }) as typeof fetch,
    });

    // 1) CU-01: codigo por correo, comercio y dispositivo con prueba de posesion
    await rt.sendCode('marta@ejemplo.co');
    const acc = await rt.register({ email: 'marta@ejemplo.co', code: '123456', businessName: 'Tienda Dona Marta' });
    expect(acc).toMatchObject({ business_name: 'Tienda Dona Marta', account_status: 'deploying', stellar_address: null });
    expect(rt.ready).toBe(true);
    // el worker despliega la cuenta (aqui con la direccion determinista y sin red de Stellar)
    const address = computeAccountAddress({ deployer: DEPLOYER, merchantId: acc.merchant_id, networkPassphrase: d.network_passphrase });
    expect(await processNextAccountDeploy({ db: t.db, deployer: { deploy: async () => ({ address, txHash: 'TXDEPLOY' }) } })).toBe(true);
    expect((await rt.refreshAccount()).account_status).toBe('ready');

    // 2) Ventas SIN red durante un dia (QA-03): todo queda en la base local y el outbox
    networkUp = false;
    const ayer = sumarDias(hoyBogota(), -1);
    const at = (h: number, m = 0) => instanteBogota(ayer, h, m);
    store.upsertChannel({ ...CANAL_EFECTIVO, updated_at_ms: Date.now() }, 'local');
    store.upsertChannel({ ...CANAL_BREB, updated_at_ms: Date.now() }, 'local');
    const v1 = asientoVenta(at(9), [{ canal: CANAL_EFECTIVO, monto_minor: 2_000_000 }], null);
    const v2 = asientoVenta(at(11), [{ canal: CANAL_EFECTIVO, monto_minor: 3_000_000 }, { canal: CANAL_BREB, monto_minor: 7_000_000 }], null);
    store.addEntry(v1, { canal_ids: [CANAL_EFECTIVO.id] }, 'local');
    store.addEntry(v2, { canal_ids: [CANAL_EFECTIVO.id, CANAL_BREB.id] }, 'local');
    // al cerrar: el efectivo contado es 1.000.000 menos de lo esperado -> ajuste_caja
    const ajuste = asientoAjusteCaja(at(20), 1_000_000);
    store.addEntry(ajuste, null, 'local');
    store.upsertDay(ayer, { status: 'cerrado', counted_cash_minor: 4_000_000, closed_at: at(20) });
    store.enqueueClose(ayer);
    expect((await rt.sync()).online).toBe(false);
    const pendientes = store.outbox(Number.MAX_SAFE_INTEGER, 50);
    expect(pendientes.map((o) => o.entity)).toEqual(['channel', 'channel', 'entry', 'entry', 'entry', 'close']);
    expect(await t.db.selectFrom('journal_entries').select('id').execute()).toHaveLength(0);

    // 3) vuelve la red: se sube todo en orden y el servidor queda con los 3 asientos y el dia cerrado
    networkUp = true;
    store.setSync({}); // sin cambios
    for (const o of store.snapshot().days) void o;
    // el backoff del intento sin red espera su turno: se adelanta el reloj del motor
    const rep = await (async () => {
      const { syncAll } = await import('../../frontend/src/sync/engine');
      return syncAll({ store, api: rt.api, deviceId: rt.deviceId() as string, now: () => Date.now() + 10 * 60 * 1000 });
    })();
    expect(rep).toMatchObject({ online: true, rejected: 0 });
    expect(store.outbox(Number.MAX_SAFE_INTEGER, 50)).toEqual([]);
    expect(store.snapshot().entries.every((e) => e.sync_status === 'sincronizado')).toBe(true);
    const serverEntries = await t.db.selectFrom('journal_entries').select(['id', 'business_date']).execute();
    expect(serverEntries.map((e) => e.id).sort()).toEqual([v1.id, v2.id, ajuste.id].sort());
    expect(serverEntries.every((e) => e.business_date === ayer)).toBe(true);
    const day = await t.db.selectFrom('business_days').select(['status', 'counted_cash_minor']).where('business_date', '=', ayer).executeTakeFirstOrThrow();
    expect(day).toEqual({ status: 'cerrado', counted_cash_minor: 4_000_000 });
    expect(await t.db.selectFrom('merchant_channels').select('id').execute()).toHaveLength(2);

    // 4) CU-04: la app valida la preimagen con SU base local, firma y el dia queda sellado
    const worker = setInterval(() => {
      if (!rtStop) void processNextSealSubmit({ db: t.db, submitter }).catch(() => undefined);
    }, 150);
    try {
      const fases: string[] = [];
      const out = await rt.signPending({ onPhase: (p) => fases.push(p), timeoutMs: 20_000 });
      expect(out.sealedDates).toEqual([ayer]);
      expect(fases).toEqual(['validando', 'firmando', 'guardando']);
    } finally {
      clearInterval(worker);
    }
    expect(submitter.submits).toHaveLength(1);
    expect(submitter.submits[0]?.items[0]).toMatchObject({ date: Number(ayer.replace(/-/g, '')), entryCount: 3 });
    const sealed = store.snapshot().days.find((x) => x.business_date === ayer);
    expect(sealed).toMatchObject({ status: 'sellado', sellos: [{ version: 1, status: 'confirmado', tx_hash: 'TXHASH_INTEGRACION' }] });

    // 5) enlace de verificacion y verificacion en el "navegador" del analista
    const link = await rt.createLink({ date_from: ayer, date_to: ayer, expires_in_days: 30 });
    const token = link.url.split('#t=')[1] as string;
    expect((await rt.listLinks())[0]).toMatchObject({ id: link.id, status: 'activo' });
    const chain = async (): Promise<OnChainSeal[]> => {
      const rows = await t.db.selectFrom('seals').selectAll().where('status', '=', 'confirmado').orderBy('version').execute();
      return rows.map((r) => ({ version: r.version, root: new Uint8Array(r.merkle_root), entryCount: r.entry_count, originFlags: r.origin_flags, reasonHash: r.amend_reason_hash ? new Uint8Array(r.amend_reason_hash) : null }));
    };
    const honest: SealReader = { getSeals: async () => chain() };
    const ok = await rt.verify(token, { reader: honest as never });
    expect(ok.result.trusted).toBe(true);
    expect(ok.result.days[0]).toMatchObject({ result: 'coincide', txHash: 'TXHASH_INTEGRACION' });
    // ventas = 2.000.000 + 10.000.000; el ajuste de caja no es venta
    expect(ok.result.summary).toMatchObject({ matching: 1, mismatched: 0, salesMinor: 12_000_000 });
    expect(ok.result.days[0]?.byChannel).toEqual({ efectivo: 5_000_000, breb: 7_000_000 });
    // si lo que hay en la red no coincide, el dia da "No coincide" y no suma
    const liar: SealReader = { getSeals: async () => (await chain()).map((s) => ({ ...s, root: new Uint8Array(32).fill(1) })) };
    const bad = await rt.verify(token, { reader: liar as never });
    expect(bad.result.days[0]?.result).toBe('no_coincide');
    expect(bad.result.summary.salesMinor).toBe(0);
    // el servidor vio las vistas
    expect((await rt.listLinks())[0]?.view_count).toBeGreaterThanOrEqual(2);
    // revocar y volver a abrir: 410
    await rt.revokeLink(link.id);
    await expect(rt.verify(token, { reader: honest as never })).rejects.toMatchObject({ code: 'link_inactive' });
    void SigningError;
    void fechaBogota;
  }, 90_000);
});
