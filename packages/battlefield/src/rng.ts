// Seeded PRNG (mulberry32 over a splitmix-hashed seed) so a layout is a pure
// function of its seed; every random choice in the generator goes through one
// Rng instance in a fixed order.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform integer in [lo, hi] inclusive. */
  intBetween(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** Draws every item once, weighted, without replacement. */
  weightedOrder<T>(items: readonly { item: T; weight: number }[]): T[];
}

function hashSeed(seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) throw new Error(`Seed must be an integer, got ${seed}`);
  let state = hashSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);
  const rng: Rng = {
    next,
    int,
    intBetween: (lo, hi) => lo + int(hi - lo + 1),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[int(items.length)]!;
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    weightedOrder: (items) => {
      const pool = items.map((e) => ({ ...e }));
      const out: typeof pool[number]["item"][] = [];
      while (pool.length) {
        const total = pool.reduce((n, e) => n + e.weight, 0);
        let roll = next() * total;
        let idx = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
          roll -= pool[i]!.weight;
          if (roll < 0) {
            idx = i;
            break;
          }
        }
        out.push(pool[idx]!.item);
        pool.splice(idx, 1);
      }
      return out;
    },
  };
  return rng;
}
