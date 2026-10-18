/**
 * Despliegue de `bimo-account` (spec 03 §3 y §6 paso 3): una smart account por comercio, con la regla 0 `Default`
 * y como unico firmante la llave del iPhone verificada por `bimo-p256-verifier`. Bimo nunca queda como firmante.
 */
import { createHash } from 'node:crypto';
import {
  Address,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  hash,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { AppError } from '../../errors';
import type { Deployments } from '../../deployments';
import type { Enviador } from './enviador';

/** salt = SHA-256("bimo-account-v1" ‖ merchant_id) (spec 03 §3). */
export function accountSalt(merchantId: string): Buffer {
  return createHash('sha256').update('bimo-account-v1').update(merchantId, 'utf8').digest();
}

/** Direccion C... determinista: la desplegada por `deployer` con ese salt. */
export function computeAccountAddress(input: { deployer: string; merchantId: string; networkPassphrase: string }): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(input.networkPassphrase),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({ address: new Address(input.deployer).toScAddress(), salt: accountSalt(input.merchantId) }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXdr()));
}

/** Argumentos del constructor: `signers: Vec<Signer>` = [External(verifier, clave)] y `policies` vacio (spec 03 §3). */
export function constructorArgs(verifierId: string, publicKey: Uint8Array): xdr.ScVal[] {
  const signer = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('External'),
    new Address(verifierId).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(publicKey)),
  ]);
  return [xdr.ScVal.scvVec([signer]), xdr.ScVal.scvMap([])];
}

export interface AccountDeployer {
  /** Despliega (o adopta, si ya existe) la bimo-account del comercio. Idempotente. */
  deploy(input: { merchantId: string; publicKey: Buffer }): Promise<{ address: string; txHash: string | null }>;
}

export type DeployerRpc = Pick<rpc.Server, 'getAccount' | 'simulateTransaction' | 'getLedgerEntries'>;

export interface StellarAccountDeployerOptions {
  server: DeployerRpc;
  deployments: Deployments;
  /** Llave de la cuenta `deployer` (secreto del servicio, nunca en el repo). */
  deployer: Keypair;
  enviador: Enviador;
}

/** Despliegue real sobre Stellar. Usa el puerto `Enviador` para enviar y confirmar. */
export class StellarAccountDeployer implements AccountDeployer {
  constructor(private readonly o: StellarAccountDeployerOptions) {}

  private async exists(address: string): Promise<boolean> {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(address).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent,
      }),
    );
    try {
      const res = await this.o.server.getLedgerEntries(key);
      return res.entries.length > 0;
    } catch {
      throw new AppError('chain_unavailable', 'No se pudo consultar la red de Stellar');
    }
  }

  async deploy(input: { merchantId: string; publicKey: Buffer }) {
    const { deployments: d } = this.o;
    const address = computeAccountAddress({ deployer: this.o.deployer.publicKey(), merchantId: input.merchantId, networkPassphrase: d.network_passphrase });
    // Reintento tras un envio cuya confirmacion se perdio: la cuenta ya existe, se adopta.
    if (await this.exists(address)) return { address, txHash: null };

    let account;
    try {
      account = await this.o.server.getAccount(this.o.deployer.publicKey());
    } catch {
      throw new AppError('chain_unavailable', 'No se pudo leer la cuenta deployer');
    }
    const op = Operation.createCustomContract({
      address: new Address(this.o.deployer.publicKey()),
      wasmHash: Buffer.from(d.account_wasm_hash, 'hex'),
      salt: accountSalt(input.merchantId),
      constructorArgs: constructorArgs(d.p256_verifier_id, input.publicKey),
    });
    const built = new TransactionBuilder(account, { fee: '100', networkPassphrase: d.network_passphrase }).addOperation(op).setTimeout(120).build();
    let sim;
    try {
      sim = await this.o.server.simulateTransaction(built);
    } catch {
      throw new AppError('chain_unavailable', 'No se pudo simular el despliegue');
    }
    if (rpc.Api.isSimulationError(sim)) throw new Error(`simulacion fallida: ${sim.error.slice(0, 120)}`);
    const prepared = rpc.assembleTransaction(built, sim).build();
    prepared.sign(this.o.deployer);

    const result = await this.o.enviador.enviar(prepared);
    if (result.status !== 'confirmado') throw new Error(`despliegue fallido: ${result.error ?? 'desconocido'}`);
    return { address, txHash: result.hash };
  }
}
