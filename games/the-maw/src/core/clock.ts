// A fixed-step clock. The simulation always advances in steps of `dt` (1/60 s), however fast the screen draws, so a run is the
// same on a phone and a desktop and can be replayed. `alpha` is how far between two steps the screen is, for smooth drawing.
// Time can be slowed (a mutation choice slows the world rather than freezing it).

export class Clock {
  readonly dt: number;
  t = 0;            // simulated seconds
  steps = 0;
  scale = 1;        // 1: normal, 0.2: slowed, 0: paused
  alpha = 0;
  private acc = 0;
  constructor(hz = 60, private maxSteps = 8) { this.dt = 1 / hz; }
  // wall seconds since the last frame -> how many steps to run now
  advance(wall: number): number {
    this.acc += Math.min(0.25, Math.max(0, wall)) * this.scale;
    let n = 0;
    while (this.acc >= this.dt && n < this.maxSteps) { this.acc -= this.dt; n++; }
    if (n === this.maxSteps) this.acc = 0;   // fell behind: drop the backlog instead of spiralling
    this.alpha = this.acc / this.dt;
    return n;
  }
  tick(): void { this.t += this.dt; this.steps++; }
}
