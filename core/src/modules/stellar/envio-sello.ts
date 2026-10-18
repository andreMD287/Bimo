/**
 * Envio de `seal_batch` con la doble autorizacion (spec 03 §5.4, §7): arma la tx con las entradas del comercio
 * (smart account) y del atestador, la re-simula para obtener los recursos, la firma el `deployer` y la envia por el
 * puerto `Enviador` (fee-bump de `fallback-submitter`).
 */
import { Address, Contract, Keypair, Operation, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { AppError } from '../../errors';
import type { Deployments } from '../../deployments';
import type { Enviador, EnvioResult, EstadoTx } from './enviador';
import { authPayloadScVal, merchantAuthEntry } from './firma';
import { sealItemScVal, type SealItemInput } from './sello';

export interface SubmitSealInput {
  merchantAddress: string;
  items: SealItemInput[];
  preimageXdr: Buffer;
  /** Firma P-256 del dueno, 64 bytes, ya normalizada a low-S. */
  ownerSignature: Buffer;
  /** Clave publica del dueno (65 bytes). */
  ownerPublicKey: Buffer;
  /** `SorobanAuthorizationEntry` del atestador, ya firmada (XDR). */
  attesterEntry: Buffer;
  onSubmitted?: (hash: string) => Promise<void>;
}

/** Puerto que usa el worker de sellos; `StellarSealSubmitter` lo implementa contra la red. */
export interface SealSubmitter {
  submit(input: SubmitSealInput): Promise<EnvioResult>;
  status(hash: string): Promise<EstadoTx>;
  latestLedger(): Promise<number>;
}

export type SubmitRpc = Pick<rpc.Server, 'getAccount' | 'simulateTransaction' | 'getLatestLedger'>;

export class StellarSealSubmitter implements SealSubmitter {
  constructor(
    private readonly o: { server: SubmitRpc; deployments: Deployments; deployer: Keypair; enviador: Enviador },
  ) {}

  async latestLedger(): Promise<number> {
    try {
      return (await this.o.server.getLatestLedger()).sequence;
    } catch {
      throw new AppError('chain_unavailable', 'No se pudo leer el ledger actual');
    }
  }

  status(hash: string): Promise<EstadoTx> {
    return this.o.enviador.estado(hash);
  }

  async submit(i: SubmitSealInput): Promise<EnvioResult> {
    const d = this.o.deployments;
    const authPayload = authPayloadScVal({ verifierId: d.p256_verifier_id, publicKey: i.ownerPublicKey, signature: i.ownerSignature });
    const auth = [
      merchantAuthEntry({ merchantAddress: i.merchantAddress, preimageXdr: i.preimageXdr, authPayload }),
      xdr.SorobanAuthorizationEntry.fromXDR(i.attesterEntry),
    ];
    const call = new Contract(d.registry_ids[d.registry_ids.length - 1] as string).call(
      'seal_batch',
      new Address(i.merchantAddress).toScVal(),
      xdr.ScVal.scvVec(i.items.map(sealItemScVal)),
    );

    let sim;
    let built;
    try {
      const account = await this.o.server.getAccount(this.o.deployer.publicKey());
      const base = new TransactionBuilder(account, { fee: '100', networkPassphrase: d.network_passphrase })
        .addOperation(call)
        .setTimeout(120)
        .build();
      const op = Operation.invokeHostFunction({ func: (base.operations[0] as { func: xdr.HostFunction }).func, auth });
      const acc2 = await this.o.server.getAccount(this.o.deployer.publicKey());
      built = new TransactionBuilder(acc2, { fee: '100', networkPassphrase: d.network_passphrase }).addOperation(op).setTimeout(120).build();
      sim = await this.o.server.simulateTransaction(built); // con las entradas puestas: modo "enforce", devuelve los recursos
    } catch {
      throw new AppError('chain_unavailable', 'No se pudo simular el sello en Stellar');
    }
    if (rpc.Api.isSimulationError(sim)) {
      // Un rechazo del contrato o de la autorizacion no es un problema de red: el sello queda `fallido`.
      return { hash: '', status: 'fallido', error: contractError(sim.error) };
    }
    const prepared = rpc.assembleTransaction(built, sim).build();
    prepared.sign(this.o.deployer);
    return this.o.enviador.enviar(prepared, i.onSubmitted ? { onSubmitted: i.onSubmitted } : {});
  }
}

/** Solo el codigo corto (por ejemplo `Contract#1` = AlreadySealed) para no guardar texto con datos. */
function contractError(message: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(message);
  if (m) return `Contract#${m[1]}`;
  if (/Auth/.test(message)) return 'AuthError';
  return 'SimulationError';
}
