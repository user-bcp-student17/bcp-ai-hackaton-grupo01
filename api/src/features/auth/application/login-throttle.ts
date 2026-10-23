type Window = { count: number; resetAtMs: number };

type Dependencies = {
  maxAttempts: number;
  windowSeconds: number;
  now: () => number;
};

// In-memory fixed window. A restart resets it: acceptable for the local demo only.
export class LoginThrottle {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly deps: Dependencies) {}

  // Returns null when the attempt is allowed and counted under every key,
  // or the Retry-After in seconds when any key is over its limit.
  consume(keys: readonly string[]): number | null {
    const nowMs = this.deps.now();
    let retryAfter: number | null = null;
    for (const key of keys) {
      const window = this.windows.get(key);
      if (window && window.resetAtMs > nowMs && window.count >= this.deps.maxAttempts) {
        const seconds = Math.ceil((window.resetAtMs - nowMs) / 1000);
        retryAfter = Math.max(retryAfter ?? 0, seconds);
      }
    }
    if (retryAfter !== null) return retryAfter;
    for (const key of keys) {
      const window = this.windows.get(key);
      if (window && window.resetAtMs > nowMs) {
        window.count += 1;
      } else {
        this.windows.set(key, {
          count: 1,
          resetAtMs: nowMs + this.deps.windowSeconds * 1000,
        });
      }
    }
    return null;
  }
}
