// One seeded random number generator for the whole run (mulberry32): the same seed always plays out the same world.
// Systems never call Math.random. A run can fork a stream for a sub-task (the world layout, each ring) so adding a draw in one
// place does not reshuffle another.

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 0x9e3779b9; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }   // a..b inclusive
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  shuffle<T>(xs: T[]): T[] { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; }
  // a weighted pick: weights need not sum to 1
  weighted<T>(xs: readonly T[], w: (x: T) => number): T | undefined {
    let tot = 0; for (const x of xs) tot += Math.max(0, w(x));
    if (tot <= 0) return undefined;
    let r = this.next() * tot;
    for (const x of xs) { r -= Math.max(0, w(x)); if (r <= 0) return x; }
    return xs[xs.length - 1];
  }
  fork(salt: number): Rng { return new Rng(Math.imul((this.s ^ salt) >>> 0, 2654435761) ^ (salt * 40503)); }
}

// a seed from words (a run's name) or a number
export function seedOf(v: string | number): number {
  if (typeof v === "number") return v >>> 0;
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
