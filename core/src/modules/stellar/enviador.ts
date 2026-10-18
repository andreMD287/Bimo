/**
 * Puerto `Enviador` (spec 03 §7, ADR-09): envia transacciones a la red y espera la confirmacion.
 * Adaptadores: `EnviadorDirecto` (unico para la demo, spec 08 §6.1) y `EnviadorRelayer` (A-20, diferido).
 */
import { Keypair, TransactionBuilder, type FeeBumpTransaction, type Transaction, type rpc, type xdr } from '@stellar/stellar-sdk';
import { AppError } from '../../errors';

export interface EnvioResult {
  hash: string;
  status: 'confirmado' | 'fallido';
  ledger?: number;
  /** Valor devuelto por la invocacion (por ejemplo la direccion del contrato creado). */
  returnValue?: xdr.ScVal;
  /** Solo el codigo de la red o un texto corto; nunca datos del comercio. */
  error?: string;
}

export interface Enviador {
  /** Envia la transaccion (ya firmada por quien corresponda) y espera su resultado. Lanza `chain_unavailable` si la red no responde. */
  enviar(tx: Transaction): Promise<EnvioResult>;
}

/** Subconjunto de rpc.Server que usa el adaptador (permite sustituirlo en pruebas). */
export type RpcLike = Pick<rpc.Server, 'sendTransaction' | 'getTransaction'>;

export interface EnviadorDirectoOptions {
  server: RpcLike;
  networkPassphrase: string;
  /** Cuenta G de Bimo con XLM que paga la comision (`fallback-submitter`): envuelve la tx en un fee-bump. */
  feeSource: Keypair;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const unavailable = (why: string) => new AppError('chain_unavailable', `La red de Stellar no responde (${why})`);

export class EnviadorDirecto implements Enviador {
  private readonly pollMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: EnviadorDirectoOptions) {
    this.pollMs = opts.pollIntervalMs ?? 1000;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async enviar(tx: Transaction): Promise<EnvioResult> {
    // El fee-bump lo paga fallback-submitter; la tx interna conserva sus firmas y autorizaciones.
    const bump: FeeBumpTransaction = TransactionBuilder.buildFeeBumpTransaction(
      this.opts.feeSource,
      String(Math.max(Number(tx.fee), 100) * 2),
      tx,
      this.opts.networkPassphrase,
    );
    bump.sign(this.opts.feeSource);

    let sent: Awaited<ReturnType<RpcLike['sendTransaction']>>;
    try {
      sent = await this.opts.server.sendTransaction(bump);
    } catch {
      throw unavailable('sendTransaction');
    }
    if (sent.status === 'TRY_AGAIN_LATER') throw unavailable('TRY_AGAIN_LATER');
    if (sent.status === 'ERROR') {
      return { hash: sent.hash, status: 'fallido', error: sent.errorResult ? String((sent.errorResult as { result?: { type?: string } }).result?.type ?? 'ERROR') : 'ERROR' };
    }

    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      let got: Awaited<ReturnType<RpcLike['getTransaction']>>;
      try {
        got = await this.opts.server.getTransaction(sent.hash);
      } catch {
        throw unavailable('getTransaction');
      }
      if (got.status === 'SUCCESS') {
        return { hash: sent.hash, status: 'confirmado', ledger: got.ledger, ...(got.returnValue ? { returnValue: got.returnValue } : {}) };
      }
      if (got.status === 'FAILED') return { hash: sent.hash, status: 'fallido', ledger: got.ledger, error: 'FAILED' };
      if (Date.now() >= deadline) throw unavailable('tiempo de espera de la confirmacion');
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }
}
