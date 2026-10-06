// Seeded randomness for the retail (noise) bot, so a run can be replayed from its seed.
export type Rand = () => number;

/** mulberry32: small, fast 32-bit PRNG; uniform in [0, 1). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform. */
export function standardNormal(rand: Rand): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Knuth's algorithm; exact and fast for the small rates used here (lambda < 30). */
export function poisson(rand: Rand, lambda: number): number {
  if (!(lambda >= 0 && lambda < 30)) throw new RangeError(`lambda must be in [0, 30), got ${lambda}`);
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

/** Log-normal with the given median and log-standard-deviation. */
export function logNormal(rand: Rand, median: number, sigmaLn: number): number {
  return median * Math.exp(sigmaLn * standardNormal(rand));
}
