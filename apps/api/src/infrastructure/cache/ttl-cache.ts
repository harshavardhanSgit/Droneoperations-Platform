/**
 * A deliberately small in-memory cache with time-based expiry.
 *
 * Single-instance API, tiny payloads: a Map with an expiry timestamp beats
 * Redis by a dependency and a network hop. The rules for the day this stops
 * being true are documented at the coverage endpoint — many instances sharing
 * a cache means Redis; a projections table is the read-model answer, fed by
 * the transactional outbox the architecture review defers to V1.
 *
 * Not a promise cache: callers that want to deduplicate concurrent misses
 * compose that themselves (the coverage route doesn't need it — a miss costs
 * three narrow queries, and the rate limiter keeps that affordable).
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);

    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Live entries. Used by tests and nothing else. */
  get size(): number {
    let live = 0;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      } else {
        live += 1;
      }
    }
    return live;
  }
}
