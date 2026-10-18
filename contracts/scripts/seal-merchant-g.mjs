// Uso: node seal.mjs <registryId> <sourceSecret(merchant)> <attesterSecret> <date> <rootHex> <entryCount> <flags>
import {
  Keypair, rpc, TransactionBuilder, Networks, Contract, xdr, Operation, authorizeEntry, Address, BASE_FEE,
} from '@stellar/stellar-sdk';

const [registryId, merchantSecret, attesterSecret, date, rootHex, count, flags] = process.argv.slice(2);
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const passphrase = Networks.TESTNET;
const merchant = Keypair.fromSecret(merchantSecret);
const attester = Keypair.fromSecret(attesterSecret);

const sym = (s) => xdr.ScVal.scvSymbol(s);
const entry = (k, v) => new xdr.ScMapEntry({ key: sym(k), val: v });
const item = xdr.ScVal.scvMap([
  entry('amend', xdr.ScVal.scvVec([sym('None')])),
  entry('date', xdr.ScVal.scvU32(Number(date))),
  entry('entry_count', xdr.ScVal.scvU32(Number(count))),
  entry('origin_flags', xdr.ScVal.scvU32(Number(flags))),
  entry('root', xdr.ScVal.scvBytes(Buffer.from(rootHex, 'hex'))),
]);

const account = await server.getAccount(merchant.publicKey());
const contract = new Contract(registryId);
const op = contract.call('seal', new Address(merchant.publicKey()).toScVal(), item);
let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(120).build();
const sim = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

const latest = await server.getLatestLedger();
const signed = [];
for (const a of sim.result.auth) {
  const c = a.credentials;
  if (c.type === 'sorobanCredentialsSourceAccount') { signed.push(a); continue; }
  const v = c.addressV2 ?? c.address;
  const addr = Address.fromScAddress(v.address).toString();
  const kp = addr === attester.publicKey() ? attester : addr === merchant.publicKey() ? merchant : null;
  if (!kp) throw new Error('sin llave para ' + addr);
  signed.push(await authorizeEntry(a, kp, latest.sequence + 100, passphrase));
}
const hostFn = tx.operations[0].func;
const op2 = Operation.invokeHostFunction({ func: hostFn, auth: signed });
const account2 = await server.getAccount(merchant.publicKey());
tx = new TransactionBuilder(account2, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op2).setTimeout(120).build();
const sim2 = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim2)) throw new Error(sim2.error);
const prepared = rpc.assembleTransaction(tx, sim2).build();
prepared.sign(merchant);
const sent = await server.sendTransaction(prepared);
console.log('status', sent.status, 'hash', sent.hash, sent.errorResult ? sent.errorResult.toXDR('base64') : '', JSON.stringify(sent.diagnosticEvents?.length));
let r;
for (let i = 0; i < 30; i++) {
  r = await server.getTransaction(sent.hash);
  if (r.status !== 'NOT_FOUND') break;
  await new Promise((res) => setTimeout(res, 1000));
}
console.log('final', r.status, 'ledger', r.ledger);
