import { Account, Keypair, Networks, Operation, TransactionBuilder, scValToNative, xdr } from '@stellar/stellar-sdk';
import { p256 } from '@noble/curves/nist.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/errors';
import { newId } from '../src/ids';
import { EnviadorDirecto, accountSalt, computeAccountAddress, constructorArgs } from '../src/modules/stellar';
import type { AccountDeployer } from '../src/modules/stellar';
import { MAX_FAILURES, RETRY_AFTER_FAILED_MS, processNextAccountDeploy } from '../src/workers/account-deploy';
import { createTestDb, type TestDb } from './pg';

const DEPLOYER = 'GCSGJMK4653I7I5HKI7CIYKROGA5EOFEINSG43LIVSLVEIPOYRCXQCBE';

describe('spec 03 §3: direccion determinista de bimo-account', () => {
  it('spec03-3 la direccion de la cuenta de prueba de testnet se reproduce desde deployer y merchant_id', () => {
    // Evidencia de A-05: deploy con salt = SHA-256("bimo-account-v1" || "demo") desde la cuenta deployer.
    expect(computeAccountAddress({ deployer: DEPLOYER, merchantId: 'demo', networkPassphrase: Networks.TESTNET })).toBe(
      'CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M',
    );
  });

  it('spec03-3 el salt es SHA-256("bimo-account-v1" || merchant_id)', () => {
    expect(accountSalt('demo').toString('hex')).toBe('2d0ce5e1e855a92aa3b8d7e5c69bdac1e6799556880ed83cb8dcefabbe3aedcb');
    expect(accountSalt('a').equals(accountSalt('b'))).toBe(false);
    expect(accountSalt('demo')).toHaveLength(32);
  });

  it('spec03-3 el unico firmante de la regla 0 es External(verificador, clave) y no hay politicas', () => {
    const pub = p256.getPublicKey(p256.utils.randomSecretKey(), false);
    const verifier = 'CBMQY54X5BZEOF3TSCZC73MCKIC4SLDYDFNUVHQZ2PTGVTGZD7ILSBVL';
    const [signers, policies] = constructorArgs(verifier, pub) as [xdr.ScVal, xdr.ScVal];
    const native = scValToNative(signers) as Array<[string, string, Uint8Array]>;
    expect(native).toHaveLength(1); // un solo firmante
    expect(native[0]?.[0]).toBe('External');
    expect(native[0]?.[1]).toBe(verifier);
    expect(Buffer.from(native[0]?.[2] ?? []).equals(Buffer.from(pub))).toBe(true);
    // Bimo no es firmante: ninguna cuenta de Bimo aparece en los argumentos
    expect(JSON.stringify(native)).not.toContain(DEPLOYER);
    expect(Object.keys(scValToNative(policies) as object)).toHaveLength(0);
  });
});

function fakeInnerTx(): ReturnType<TransactionBuilder['build']> {
  const src = Keypair.random();
  const tx = new TransactionBuilder(new Account(src.publicKey(), '1'), { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: '10' }))
    .setTimeout(60)
    .build();
  tx.sign(src);
  return tx;
}

describe('spec 03 §7: EnviadorDirecto', () => {
  const feeSource = Keypair.random();
  const make = (server: Partial<ConstructorParameters<typeof EnviadorDirecto>[0]['server']>, timeoutMs = 50) =>
    new EnviadorDirecto({
      server: server as ConstructorParameters<typeof EnviadorDirecto>[0]['server'],
      networkPassphrase: Networks.TESTNET,
      feeSource,
      pollIntervalMs: 1,
      timeoutMs,
    });

  it('spec03-7 envuelve la tx en un fee-bump pagado por fallback-submitter y devuelve confirmado', async () => {
    let sentTx: { feeSource?: string; innerTransaction?: unknown } | undefined;
    const e = make({
      sendTransaction: (async (tx: unknown) => {
        sentTx = tx as typeof sentTx;
        return { status: 'PENDING', hash: 'H1' };
      }) as never,
      getTransaction: (async () => ({ status: 'SUCCESS', ledger: 123, returnValue: xdr.ScVal.scvVoid() })) as never,
    });
    const r = await e.enviar(fakeInnerTx());
    expect(r).toMatchObject({ hash: 'H1', status: 'confirmado', ledger: 123 });
    expect(sentTx?.feeSource).toBe(feeSource.publicKey());
    expect(sentTx?.innerTransaction).toBeTruthy();
  });

  it('una transaccion que la red rechaza o que falla queda como fallido', async () => {
    const rechazada = make({
      sendTransaction: (async () => ({ status: 'ERROR', hash: 'H2', errorResult: { result: { type: 'txBadSeq' } } })) as never,
    });
    expect(await rechazada.enviar(fakeInnerTx())).toMatchObject({ status: 'fallido', error: 'txBadSeq' });
    const fallida = make({
      sendTransaction: (async () => ({ status: 'PENDING', hash: 'H3' })) as never,
      getTransaction: (async () => ({ status: 'FAILED', ledger: 9 })) as never,
    });
    expect(await fallida.enviar(fakeInnerTx())).toMatchObject({ status: 'fallido', hash: 'H3' });
  });

  it('spec06-6 si la red no responde lanza 503 chain_unavailable', async () => {
    const caida = make({ sendTransaction: (async () => Promise.reject(new Error('ECONNRESET'))) as never });
    await expect(caida.enviar(fakeInnerTx())).rejects.toMatchObject({ code: 'chain_unavailable' });
    const ocupada = make({ sendTransaction: (async () => ({ status: 'TRY_AGAIN_LATER', hash: 'H' })) as never });
    await expect(ocupada.enviar(fakeInnerTx())).rejects.toBeInstanceOf(AppError);
    const sinConfirmar = make({
      sendTransaction: (async () => ({ status: 'PENDING', hash: 'H4' })) as never,
      getTransaction: (async () => ({ status: 'NOT_FOUND' })) as never,
    });
    await expect(sinConfirmar.enviar(fakeInnerTx())).rejects.toMatchObject({ code: 'chain_unavailable' });
  });
});

// ------------------------------------------------------------------ worker A-2..A-5 con Postgres real
class FakeDeployer implements AccountDeployer {
  calls: Array<{ merchantId: string; publicKey: Buffer }> = [];
  failures = 0; // cuantas llamadas fallan antes de tener exito
  gate: Promise<void> | undefined;
  async deploy(input: { merchantId: string; publicKey: Buffer }) {
    this.calls.push(input);
    if (this.gate) await this.gate;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new AppError('chain_unavailable', 'sin red');
    }
    return { address: `C${input.merchantId.padEnd(55, 'A').slice(0, 55)}`, txHash: `TX_${input.merchantId}` };
  }
}

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

let n = 0;
async function seed(opts: { revoked?: boolean } = {}) {
  n += 1;
  const userId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`;
  await t.addUser(userId);
  const merchantId = newId();
  const deviceId = newId();
  await t.db.insertInto('merchants').values({ id: merchantId, stellar_address: null, network: 'testnet', account_status: 'deploying', forgotten_at: null }).execute();
  await t.db.insertInto('merchant_members').values({ merchant_id: merchantId, user_id: userId, role: 'dueno' }).execute();
  await t.db
    .insertInto('devices')
    .values({
      id: deviceId, merchant_id: merchantId, user_id: userId, key_kind: 'software_p256',
      public_key: Buffer.from(p256.getPublicKey(p256.utils.randomSecretKey(), false)), signer_registered_tx: null,
      revoked_at: opts.revoked ? new Date() : null,
    })
    .execute();
  const messageId = newId();
  await t.db
    .insertInto('outbox_messages')
    .values({ id: messageId, topic: 'account.deploy', payload: JSON.stringify({ merchant_id: merchantId, device_id: deviceId }), next_attempt_at: new Date('2026-10-17T10:00:00Z') })
    .execute();
  return { merchantId, deviceId, messageId };
}

const status = async (merchantId: string) =>
  t.db.selectFrom('merchants').select(['account_status', 'stellar_address']).where('id', '=', merchantId).executeTakeFirstOrThrow();
const message = async (id: string) => t.db.selectFrom('outbox_messages').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('spec 07 §4: transiciones A-2..A-5 del worker', () => {
  const T0 = new Date('2026-10-17T12:00:00Z');
  // La cola es global: cada prueba empieza sin mensajes de las anteriores.
  beforeEach(async () => {
    await t.db.deleteFrom('outbox_messages').execute();
  });

  it('A-3 un despliegue confirmado deja la cuenta en ready con su stellar_address y registra la tx', async () => {
    const s = await seed();
    const deployer = new FakeDeployer();
    expect(await processNextAccountDeploy({ db: t.db, deployer, now: () => T0 })).toBe(true);
    const m = await status(s.merchantId);
    expect(m.account_status).toBe('ready');
    expect(m.stellar_address).toMatch(/^C/);
    const d = await t.db.selectFrom('devices').select('signer_registered_tx').where('id', '=', s.deviceId).executeTakeFirstOrThrow();
    expect(d.signer_registered_tx).toBe(`TX_${s.merchantId}`);
    expect((await message(s.messageId)).status).toBe('enviado');
    expect(deployer.calls[0]?.publicKey).toHaveLength(65);
  });

  it('A-4 con 5 fallos seguidos la cuenta pasa a failed, hay alerta y el reintento queda a una hora', async () => {
    const s = await seed();
    const deployer = new FakeDeployer();
    deployer.failures = 99;
    let now = T0;
    for (let i = 1; i <= MAX_FAILURES; i++) {
      expect(await processNextAccountDeploy({ db: t.db, deployer, now: () => now })).toBe(true);
      const msg = await message(s.messageId);
      if (i < MAX_FAILURES) {
        expect((await status(s.merchantId)).account_status).toBe('deploying');
        expect(msg.next_attempt_at.getTime()).toBeGreaterThan(now.getTime());
        now = new Date(msg.next_attempt_at.getTime() + 1); // el backoff vence
      }
    }
    expect((await status(s.merchantId)).account_status).toBe('failed');
    const msg = await message(s.messageId);
    expect(msg.status).toBe('pendiente');
    expect(msg.next_attempt_at.getTime() - now.getTime()).toBe(RETRY_AFTER_FAILED_MS);
    expect(msg.last_error).toBe('chain_unavailable');
    const alerts = await t.db.selectFrom('audit_log').select('target').where('action', '=', 'alert.account_deploy_failed').where('target', '=', s.merchantId).execute();
    expect(alerts).toHaveLength(1);
    expect(deployer.calls).toHaveLength(MAX_FAILURES);
  });

  it('A-5 pasada la hora, una cuenta failed vuelve a deploying y, si el despliegue sale, a ready', async () => {
    const s = await seed();
    const deployer = new FakeDeployer();
    deployer.failures = MAX_FAILURES; // fallan los 5 primeros, el sexto sale
    let now = T0;
    for (let i = 1; i <= MAX_FAILURES; i++) {
      await processNextAccountDeploy({ db: t.db, deployer, now: () => now });
      now = new Date((await message(s.messageId)).next_attempt_at.getTime() + 1);
    }
    expect((await status(s.merchantId)).account_status).toBe('failed');
    // antes de la hora no se toca
    expect(await processNextAccountDeploy({ db: t.db, deployer, now: () => new Date(now.getTime() - 60_000) })).toBe(false);
    // a la hora: A-5
    expect(await processNextAccountDeploy({ db: t.db, deployer, now: () => now })).toBe(true);
    expect(deployer.calls).toHaveLength(MAX_FAILURES + 1);
    expect((await status(s.merchantId)).account_status).toBe('ready');
  });

  it('A-5 si el reintento horario tambien falla, la cuenta vuelve a failed solo tras otros 5 fallos', async () => {
    const s = await seed();
    const deployer = new FakeDeployer();
    deployer.failures = 99;
    let now = T0;
    for (let i = 1; i <= MAX_FAILURES; i++) {
      await processNextAccountDeploy({ db: t.db, deployer, now: () => now });
      now = new Date((await message(s.messageId)).next_attempt_at.getTime() + 1);
    }
    await processNextAccountDeploy({ db: t.db, deployer, now: () => now }); // A-5 + fallo 1
    expect((await status(s.merchantId)).account_status).toBe('deploying');
    expect((await message(s.messageId)).attempts).toBe(1);
  });

  it('un mensaje de una cuenta que ya esta lista se cierra sin volver a desplegar (idempotencia)', async () => {
    const s = await seed();
    await t.db.updateTable('merchants').set({ account_status: 'ready', stellar_address: 'CYAHECHO' }).where('id', '=', s.merchantId).execute();
    const deployer = new FakeDeployer();
    await processNextAccountDeploy({ db: t.db, deployer, now: () => T0 });
    expect(deployer.calls).toHaveLength(0);
    expect((await message(s.messageId)).status).toBe('enviado');
  });

  it('un dispositivo revocado no se despliega: la cuenta queda failed con alerta y el mensaje fallido', async () => {
    const s = await seed({ revoked: true });
    const deployer = new FakeDeployer();
    await processNextAccountDeploy({ db: t.db, deployer, now: () => T0 });
    expect(deployer.calls).toHaveLength(0);
    expect((await status(s.merchantId)).account_status).toBe('failed');
    expect((await message(s.messageId)).status).toBe('fallido');
  });

  it('spec08-2 dos workers a la vez no toman el mismo mensaje (FOR UPDATE SKIP LOCKED)', async () => {
    const s = await seed();
    const deployer = new FakeDeployer();
    let release!: () => void;
    deployer.gate = new Promise((r) => (release = r));
    const a = processNextAccountDeploy({ db: t.db, deployer, now: () => T0 });
    await new Promise((r) => setTimeout(r, 200));
    // el primero tiene el mensaje alquilado: el segundo no ve nada pendiente
    expect(await processNextAccountDeploy({ db: t.db, deployer, now: () => T0 })).toBe(false);
    release();
    await a;
    expect(deployer.calls.filter((c) => c.merchantId === s.merchantId)).toHaveLength(1);
  });
});
