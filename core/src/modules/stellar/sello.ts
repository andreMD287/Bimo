/**
 * Preparacion de la firma de un sello (spec 03 §5.1): simula `seal_batch` y arma la preimagen que firma el dueno.
 * El modulo `cierre` depende del puerto `SealPreparer`; `RpcSealPreparer` lo implementa contra Stellar RPC.
 */
import { Address, Contract, TransactionBuilder, hash, rpc, xdr } from '@stellar/stellar-sdk';
import { AppError } from '../../errors';
import type { Deployments } from '../../deployments';

export interface SealItemInput {
  /** AAAAMMDD */
  date: number;
  root: Buffer;
  entryCount: number;
  originFlags: number;
  amend?: { prevVersion: number; reasonHash: Buffer } | undefined;
}

export interface PreparedSigning {
  /** `HashIdPreimage::SorobanAuthorization` en XDR (spec 03 §5.1). */
  preimageXdr: Buffer;
  expirationLedger: number;
  expiresAt: Date;
}

export interface SealPreparer {
  prepare(input: { merchantAddress: string; items: SealItemInput[]; now: Date }): Promise<PreparedSigning>;
}

/** Ledgers de vigencia de la firma: ~10 minutos (spec 03 §5.1). */
export const SIGNATURE_VALIDITY_LEDGERS = 120;
const LEDGER_SECONDS = 5;

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const field = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(k), val: v });

/** `SealItem` del contrato (spec 03 §4.1, v1.4): los campos van ordenados por nombre. */
export function sealItemScVal(i: SealItemInput): xdr.ScVal {
  const amend = i.amend
    ? xdr.ScVal.scvVec([
        sym('Of'),
        xdr.ScVal.scvMap([field('prev_version', xdr.ScVal.scvU32(i.amend.prevVersion)), field('reason_hash', xdr.ScVal.scvBytes(i.amend.reasonHash))]),
      ])
    : xdr.ScVal.scvVec([sym('None')]);
  return xdr.ScVal.scvMap([
    field('amend', amend),
    field('date', xdr.ScVal.scvU32(i.date)),
    field('entry_count', xdr.ScVal.scvU32(i.entryCount)),
    field('origin_flags', xdr.ScVal.scvU32(i.originFlags)),
    field('root', xdr.ScVal.scvBytes(i.root)),
  ]);
}

export type SealRpc = Pick<rpc.Server, 'getAccount' | 'simulateTransaction' | 'getLatestLedger'>;

export class RpcSealPreparer implements SealPreparer {
  constructor(
    private readonly o: {
      server: SealRpc;
      deployments: Deployments;
      /** Cuenta G con fondos usada solo como origen de la simulacion (la del `deployer`). */
      sourceAddress: string;
    },
  ) {}

  async prepare(input: { merchantAddress: string; items: SealItemInput[]; now: Date }): Promise<PreparedSigning> {
    const d = this.o.deployments;
    const op = new Contract(d.registry_ids[d.registry_ids.length - 1] as string).call(
      'seal_batch',
      new Address(input.merchantAddress).toScVal(),
      xdr.ScVal.scvVec(input.items.map(sealItemScVal)),
    );
    let sim;
    let latestSeq: number;
    try {
      const account = await this.o.server.getAccount(this.o.sourceAddress);
      const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: d.network_passphrase }).addOperation(op).setTimeout(120).build();
      sim = await this.o.server.simulateTransaction(tx);
      latestSeq = (await this.o.server.getLatestLedger()).sequence;
    } catch {
      throw new AppError('chain_unavailable', 'No se pudo preparar la firma en Stellar');
    }
    if (rpc.Api.isSimulationError(sim) || !sim.result) throw new Error(`simulacion de seal_batch fallida`);

    // La entrada de autorizacion de la smart account del comercio (la del atestador la arma A-12 al recibir la firma)
    const entry = sim.result.auth.find((a) => {
      const c = a.credentials;
      const v = c.type === 'sorobanCredentialsAddressV2' ? c.addressV2 : c.type === 'sorobanCredentialsAddress' ? c.address : null;
      return v !== null && Address.fromScAddress(v.address).toString() === input.merchantAddress;
    });
    if (!entry) throw new Error('la simulacion no pidio la autorizacion del comercio');
    const creds = entry.credentials;
    const nonce = creds.type === 'sorobanCredentialsAddressV2' ? creds.addressV2.nonce : creds.type === 'sorobanCredentialsAddress' ? creds.address.nonce : null;
    if (nonce === null) throw new Error('credenciales de autorizacion inesperadas');

    // Spec 03 §5.1: HashIdPreimage::SorobanAuthorization (credenciales `address` v1, aceptadas tambien en el protocolo 29)
    const expirationLedger = latestSeq + SIGNATURE_VALIDITY_LEDGERS;
    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: hash(d.network_passphrase),
        nonce,
        signatureExpirationLedger: expirationLedger,
        invocation: entry.rootInvocation,
      }),
    );
    return {
      preimageXdr: Buffer.from(preimage.toXDR()),
      expirationLedger,
      expiresAt: new Date(input.now.getTime() + SIGNATURE_VALIDITY_LEDGERS * LEDGER_SECONDS * 1000),
    };
  }
}
