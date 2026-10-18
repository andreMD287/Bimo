/**
 * Prueba de punta a punta en testnet (spec 08 §4): despliega una bimo-account con una llave P-256 de software
 * usando el mismo codigo del worker (StellarAccountDeployer + EnviadorDirecto) y comprueba su firmante leyendo la
 * regla 0 directo de Stellar RPC, como hara la app (spec 03 §6 paso 4).
 *
 *   DEPLOYER_SECRET=S... FALLBACK_SUBMITTER_SECRET=S... pnpm --filter @bimo/core exec tsx scripts/e2e-testnet-account.ts
 */
import { p256 } from '@noble/curves/nist.js';
import { Address, Contract, Keypair, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { loadDeployments } from '../src/deployments';
import { newId } from '../src/ids';
import { EnviadorDirecto, StellarAccountDeployer, computeAccountAddress } from '../src/modules/stellar';

const deployerSecret = process.env.DEPLOYER_SECRET;
const feeSecret = process.env.FALLBACK_SUBMITTER_SECRET;
if (!deployerSecret || !feeSecret) throw new Error('Faltan DEPLOYER_SECRET y FALLBACK_SUBMITTER_SECRET');

const d = loadDeployments('testnet');
const server = new rpc.Server(d.rpc_url);
const deployer = Keypair.fromSecret(deployerSecret);
const enviador = new EnviadorDirecto({ server, networkPassphrase: d.network_passphrase, feeSource: Keypair.fromSecret(feeSecret) });
const accounts = new StellarAccountDeployer({ server, deployments: d, deployer, enviador });

const priv = p256.utils.randomSecretKey();
const pub = Buffer.from(p256.getPublicKey(priv, false));
const merchantId = newId();
console.log('merchant_id', merchantId);
console.log('direccion esperada', computeAccountAddress({ deployer: deployer.publicKey(), merchantId, networkPassphrase: d.network_passphrase }));

const out = await accounts.deploy({ merchantId, publicKey: pub });
console.log('desplegada', out.address, 'tx', out.txHash, `https://stellar.expert/explorer/testnet/tx/${out.txHash}`);

// Idempotencia: un segundo intento adopta la cuenta que ya existe, sin otra transaccion.
const again = await accounts.deploy({ merchantId, publicKey: pub });
console.log('segundo intento', again.address === out.address && again.txHash === null ? 'adopta la cuenta existente' : 'ERROR');

// Comprobacion del firmante directo de RPC (spec 03 §6 paso 4)
const source = await server.getAccount(deployer.publicKey());
const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: d.network_passphrase })
  .addOperation(new Contract(out.address).call('get_context_rule', xdr.ScVal.scvU32(0)))
  .setTimeout(60)
  .build();
const sim = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim) || !sim.result) throw new Error('no se pudo leer la regla 0');
const rule = scValToNative(sim.result.retval) as { signers: Array<[string, string, Uint8Array]>; policies: unknown[]; context_type: unknown };
const signers = rule.signers;
const okSigner =
  signers.length === 1 && signers[0]?.[0] === 'External' && signers[0]?.[1] === d.p256_verifier_id && Buffer.from(signers[0]?.[2] ?? []).equals(pub);
console.log('firmantes de la regla 0:', signers.length, okSigner ? 'solo la llave del iPhone (OK)' : 'ERROR: firmante inesperado');
console.log('Bimo como firmante:', JSON.stringify(rule).includes(deployer.publicKey()) ? 'SI (ERROR)' : 'no (OK)');
void Address;
