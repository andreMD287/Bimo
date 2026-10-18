/**
 * Prueba en testnet de la preparacion de la firma (spec 03 §5.1): simula seal_batch con una bimo-account real
 * y comprueba que la preimagen es HashIdPreimage::SorobanAuthorization con la invocacion esperada.
 *   pnpm --filter @bimo/core exec tsx scripts/e2e-testnet-prepare.ts <cuenta C...>
 */
import { rpc, xdr } from '@stellar/stellar-sdk';
import { loadDeployments } from '../src/deployments';
import { RpcSealPreparer } from '../src/modules/stellar';

const account = process.argv[2];
if (!account) throw new Error('Uso: e2e-testnet-prepare.ts <cuenta C...>');
const d = loadDeployments('testnet');
const preparer = new RpcSealPreparer({ server: new rpc.Server(d.rpc_url), deployments: d, sourceAddress: d.deployer });
const out = await preparer.prepare({
  merchantAddress: account,
  now: new Date(),
  items: [{ date: 20261111, root: Buffer.alloc(32, 7), entryCount: 3, originFlags: 1, amend: undefined }],
});
const pre = xdr.HashIdPreimage.fromXDR(out.preimageXdr);
console.log('tipo de preimagen:', pre.type);
const body = (pre as unknown as { sorobanAuthorization: { signatureExpirationLedger: number; invocation: { function: { contractFn: { functionName: string } } } } }).sorobanAuthorization;
console.log('funcion invocada:', body.invocation.function.contractFn.functionName, '· vence en el ledger', body.signatureExpirationLedger, out.expirationLedger === body.signatureExpirationLedger ? '(OK)' : '(ERROR)');
console.log('expira', out.expiresAt.toISOString(), '· bytes', out.preimageXdr.length);
