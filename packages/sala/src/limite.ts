/**
 * Token bucket: aguenta uma rajada de `capacity` mensagens e repõe `refillPerSec` por segundo.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  /** Consome uma ficha; `false` quando estourou o limite. */
  take(cost = 1): boolean {
    const t = this.now();
    const elapsedSec = Math.max(0, t - this.last) / 1000;
    this.last = t;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
