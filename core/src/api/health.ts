import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { Db } from '../db/client';

export interface HealthChecks {
  db(): Promise<boolean>;
  rpc(): Promise<boolean>;
  relayer(): Promise<'ok' | 'down' | 'not_configured'>;
}

const withTimeout = async <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export function createHealthChecks(db: Db, rpcUrl: string, relayerUrl: string | undefined): HealthChecks {
  return {
    async db() {
      try {
        await sql`select 1`.execute(db);
        return true;
      } catch {
        return false;
      }
    },
    async rpc() {
      try {
        const res = await withTimeout(
          fetch(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
          }),
          3000,
          null,
        );
        if (!res?.ok) return false;
        const body = (await res.json()) as { result?: { status?: string } };
        return body.result?.status === 'healthy';
      } catch {
        return false;
      }
    },
    async relayer() {
      if (!relayerUrl) return 'not_configured';
      try {
        const res = await withTimeout(fetch(relayerUrl, { method: 'GET' }), 3000, null);
        return res ? 'ok' : 'down';
      } catch {
        return 'down';
      }
    },
  };
}

/** GET /health (spec 06 §3.6). Siempre 200: el cuerpo dice que parte esta caida. */
export function registerHealth(app: FastifyInstance, checks: HealthChecks): void {
  app.get('/health', { config: { access: 'public' } }, async () => {
    const [db, rpc, relayer] = await Promise.all([checks.db(), checks.rpc(), checks.relayer()]);
    return {
      status: db && rpc ? 'ok' : 'degraded',
      db: db ? 'ok' : 'down',
      rpc: rpc ? 'ok' : 'down',
      relayer,
    };
  });
}
