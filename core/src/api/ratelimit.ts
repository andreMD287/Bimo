/** Limite por ventana fija en memoria (spec 06 §4). Suficiente para una instancia de `api`. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Devuelve 0 si pasa, o los segundos que hay que esperar. */
  hit(key: string): number {
    const t = this.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      if (this.hits.size > 50_000) this.sweep(t);
      return 0;
    }
    cur.count += 1;
    if (cur.count > this.limit) return Math.max(1, Math.ceil((cur.resetAt - t) / 1000));
    return 0;
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
