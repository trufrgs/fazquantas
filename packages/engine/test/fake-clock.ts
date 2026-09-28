import type { Clock } from '../src/host';

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

/** Relógio controlado pelo teste: nada acontece até `advance`/`runAll`. */
export class FakeClock implements Clock {
  private t = 0;
  private seq = 0;
  private timers: Timer[] = [];

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const timer = { id: ++this.seq, at: this.t + ms, fn };
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((x) => x.id !== handle);
  }

  get pending(): number {
    return this.timers.length;
  }

  /** Avança o tempo, disparando os timers que vencerem (inclusive os criados no caminho). */
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = target;
  }

  /** Dispara timers até não sobrar nenhum (ou estourar o limite). */
  runAll(limit = 100_000): void {
    let count = 0;
    while (this.timers.length > 0) {
      if (++count > limit) throw new Error('timers demais');
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers.shift()!;
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
  }
}
