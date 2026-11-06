// mulberry32 — tiny, deterministic, good enough for synthetic-data sampling
// (not cryptographic). A fixed seed makes --seed runs reproducible, which
// matters for comparing rollup output across generator runs.
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: () => number, items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let x = rng() * total;
  for (const item of items) {
    x -= item.weight;
    if (x <= 0) return item.value;
  }
  return items[items.length - 1]!.value;
}

export function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randomIntInRange(rng: () => number, min: number, max: number): number {
  return Math.floor(randomInRange(rng, min, max + 1));
}
