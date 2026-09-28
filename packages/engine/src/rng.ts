export interface Rng {
  /** Número em [0, 1). */
  next(): number;
  /** Inteiro em [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Estado interno; `createRng(state)` continua a mesma sequência. */
  readonly state: number;
}

/** PRNG mulberry32: rápido, 32 bits de estado, serializável como um número. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    get state() {
      return a;
    },
  };
}

/** Fisher–Yates; devolve um novo array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Semente aleatória a partir de uma fonte de números em [0, 1). */
export function randomSeed(random: () => number): number {
  return Math.floor(random() * 4294967296) >>> 0;
}
