import type { Logger } from 'pino';

/**
 * Modo `worker` (ADR-01): corre los trabajos en segundo plano. Los workers concretos (despliegue de cuentas,
 * sellador, indexador, ttl, conciliador) se registran aqui en A-08, A-12 y A-13.
 */
export interface Worker {
  name: string;
  intervalMs: number;
  tick(): Promise<void>;
}

export function runWorkers(workers: Worker[], log: Logger): () => void {
  const timers = workers.map((w) => {
    let running = false;
    return setInterval(() => {
      if (running) return;
      running = true;
      w.tick()
        .catch((err: unknown) => log.error({ worker: w.name, err_name: err instanceof Error ? err.name : 'error' }, 'worker fallo'))
        .finally(() => {
          running = false;
        });
    }, w.intervalMs);
  });
  log.info({ workers: workers.map((w) => w.name) }, 'workers iniciados');
  return () => timers.forEach(clearInterval);
}
