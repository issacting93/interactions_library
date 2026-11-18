// The simulation's clock. Frame time is cut into quanta (1/240 s) and each frame runs ONE step of a whole number of them, so a
// step's dt is always one of a few exact values: a run is its seed plus the sequence of those numbers plus the input, and replays
// exactly. (One step a frame, not catch-up steps at a fixed rate: the tank has no interpolation, so on a 120 Hz screen a 60 Hz sim
// would judder.) Headless checks call `fixed()` and get the same step every time. `scale` slows the world (hit-stop, a choice open).
export class Clock {
  readonly q: number;
  t = 0;            // simulated seconds
  steps = 0;
  scale = 1;
  private acc = 0;
  constructor(readonly quanta = 240, readonly maxQ = 12) { this.q = 1 / quanta; }
  // wall seconds since the last frame -> this frame's step, in sim seconds (0: nothing to run yet)
  advance(wall: number): number {
    this.acc += Math.max(0, wall);
    let k = Math.floor(this.acc / this.q + 1e-9);
    if (k <= 0) return 0;
    this.acc -= k * this.q;
    if (k > this.maxQ) { k = this.maxQ; this.acc = 0; }   // fell behind (a hidden tab): drop the backlog
    return this.tick(k * this.q * this.scale);
  }
  // a step of exactly n quanta (default 4: 1/60 s), for headless runs
  fixed(n = 4): number { return this.tick(n * this.q * this.scale); }
  private tick(dt: number): number { this.t += dt; this.steps++; return dt; }
}
