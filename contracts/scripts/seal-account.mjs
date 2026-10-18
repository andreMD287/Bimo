// Sella un dia con una bimo-account como comercio. Uso:
// node seal-account.mjs <registry> <account> <verifier> <p256PrivHex> <submitterSecret> <attesterSecret> <date> <rootHex> <count> <flags> [v1|v2]
import {
  Keypair, rpc, TransactionBuilder, Networks, Contract, xdr, Operation, authorizeEntry, Address, BASE_FEE, hash,
} from '@stellar/stellar-sdk';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, concatBytes } from '@noble/hashes/utils.js';

const [registryId, accountId, verifierId, privHex, submitterSecret, attesterSecret, date, rootHex, count, flags, mode = 'v2'] = process.argv.slice(2);
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const passphrase = Networks.TESTNET;
const submitter = Keypair.fromSecret(submitterSecret);
const attester = Keypair.fromSecret(attesterSecret);
const priv = hexToBytes(privHex);
const pub = p256.getPublicKey(priv, false);

const sym = (s) => xdr.ScVal.scvSymbol(s);
const entry = (k, v) => new xdr.ScMapEntry({ key: sym(k), val: v });
const item = xdr.ScVal.scvMap([
  entry('amend', xdr.ScVal.scvVec([sym('None')])),
  entry('date', xdr.ScVal.scvU32(Number(date))),
  entry('entry_count', xdr.ScVal.scvU32(Number(count))),
  entry('origin_flags', xdr.ScVal.scvU32(Number(flags))),
  entry('root', xdr.ScVal.scvBytes(Buffer.from(rootHex, 'hex'))),
]);

function toV1(a) {
  // Reescribe las credenciales address_v2 como address (v1), el formato del spec 03 §5.
  const c = a.credentials;
  if (c.type !== 'sorobanCredentialsAddressV2') return a;
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: c.addressV2.address, nonce: c.addressV2.nonce, signatureExpirationLedger: 0, signature: xdr.ScVal.scvVec([]),
    })),
    rootInvocation: a.rootInvocation,
  });
}

const account = await server.getAccount(submitter.publicKey());
const op = new Contract(registryId).call('seal', new Address(accountId).toScVal(), item);
let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(120).build();
const sim = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim)) throw new Error('sim1 ' + sim.error);
const latest = await server.getLatestLedger();
const validUntil = latest.sequence + 120;

const signed = [];
for (let a of sim.result.auth) {
  if (a.credentials.type === 'sorobanCredentialsSourceAccount') { signed.push(a); continue; }
  if (mode === 'v1') a = toV1(a);
  const v = a.credentials.addressV2 ?? a.credentials.address;
  const addr = Address.fromScAddress(v.address).toString();
  console.log('auth para', addr, a.credentials.type);
  if (addr === attester.publicKey()) {
    signed.push(await authorizeEntry(a, attester, validUntil, passphrase));
  } else if (addr === accountId) {
    signed.push(await authorizeEntry(a, async (preimage, payload) => {
      const ruleIds = xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)]);
      const authDigest = sha256(concatBytes(payload, ruleIds.toXdr()));
      const sig = p256.sign(authDigest, priv, { lowS: true }); // firma SHA-256(auth_digest)
      const signer = xdr.ScVal.scvVec([sym('External'), new Address(verifierId).toScVal(), xdr.ScVal.scvBytes(Buffer.from(pub))]);
      const signatureScVal = xdr.ScVal.scvMap([
        entry('context_rule_ids', ruleIds),
        entry('signers', xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signer, val: xdr.ScVal.scvBytes(Buffer.from(sig)) })])),
      ]);
      return { signatureScVal };
    }, validUntil, passphrase));
  } else throw new Error('auth inesperada ' + addr);
}
const op2 = Operation.invokeHostFunction({ func: tx.operations[0].func, auth: signed });
const acc2 = await server.getAccount(submitter.publicKey());
tx = new TransactionBuilder(acc2, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op2).setTimeout(120).build();
const sim2 = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim2)) { console.log('SIM2 ERROR:', sim2.error); process.exit(2); }
const prepared = rpc.assembleTransaction(tx, sim2).build();
prepared.sign(submitter);
const sent = await server.sendTransaction(prepared);
console.log('status', sent.status, 'hash', sent.hash);
let r;
for (let i = 0; i < 30; i++) {
  r = await server.getTransaction(sent.hash);
  if (r.status !== 'NOT_FOUND') break;
  await new Promise((res) => setTimeout(res, 1000));
}
console.log('final', r.status, 'ledger', r.ledger);
