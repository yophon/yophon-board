export class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const attempts = (this.attempts.get(key) || []).filter((time) => time > cutoff);
    if (attempts.length >= this.max) {
      this.attempts.set(key, attempts);
      return true;
    }
    attempts.push(now);
    this.attempts.set(key, attempts);
    return false;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, times] of this.attempts) {
      const valid = times.filter((time) => time > now - this.windowMs);
      if (valid.length === 0) this.attempts.delete(key);
      else this.attempts.set(key, valid);
    }
  }

  get size(): number {
    return this.attempts.size;
  }
}
