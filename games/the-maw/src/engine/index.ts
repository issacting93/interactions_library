// The Rust engine in the browser (window.EcoEngine). The engine itself is games/the-maw/engine (Rust), compiled to WebAssembly and
// carried inside this script, so the tank loads it like any other classic script: no fetch, and it works from a file or a published copy.
// Built to shared/engine/ecology/eco-engine.js by `npm run build:engine`; load it right after eco-core.js.
//
// When it is on, it takes over the pieces of the core it has, behind the names the tank already uses:
//   EcoCore.random / reseed   the seeded stream, drawn in Rust (the same numbers, draw for draw)
//   EcoCore.Clock             simulated time in whole quanta
//   EcoCore.Web               ratio, eats, fears, refusal: who eats whom
//   EcoEngine.Sense           creature columns in the engine's memory and the neighbour grid over them (ecology-sim.js uses it)
//   EcoEngine.Mover           the swimmers' movement: velocity, turn, position, solids, the trailing spine, the eased body state
// Everything else still runs in JavaScript. A seed must play out the same with the engine on or off (tests/engine-replay.py).
//
// On by default. `?engine=js` in the address (or window.ECO_ENGINE = "js" before this script) turns it off; `?engine=rust` says so out loud.
// If WebAssembly is missing or the module will not start, it stays off and says why in EcoEngine.why.
import wasmBytes from "../../engine/target/wasm32-unknown-unknown/release/eco_engine.wasm";

interface Exports {
  memory: WebAssembly.Memory;
  eco_version(): number;
  rng_seed(seed: number): void; rng_next(): number; rng_state(): number;
  clock_new(quanta: number, maxQ: number): number; clock_advance(c: number, wall: number): number; clock_fixed(c: number, n: number): number;
  clock_t(c: number): number; clock_set_t(c: number, t: number): void; clock_steps(c: number): number; clock_scale(c: number): number; clock_set_scale(c: number, s: number): void;
  web_ratio(aw: number, bw: number, bPlate: number, aClaw: number, aJaw: number, rPlate: number, rClaw: number): number;
  web_verdict(same: number, aw: number, bw: number, bPlate: number, aClaw: number, aJaw: number, aSieve: number, bSchools: number, lo: number, hi: number, rPlate: number, rClaw: number): number;
  sense_new(): number; sense_reserve(s: number, n: number): number; sense_build(s: number, n: number, cell: number, density: number): number;
  sense_x(s: number): number; sense_y(s: number): number; sense_sp(s: number): number; sense_skip(s: number): number; sense_density(s: number): number;
  sense_order(s: number): number; sense_starts(s: number): number; sense_gx0(s: number): number; sense_gy0(s: number): number; sense_cols(s: number): number; sense_rows(s: number): number;
  mover_new(): number; mover_reserve(m: number, n: number, solids: number): number; mover_solids_cap(m: number): number;
  mover_step(m: number, n: number, solids: number, dt: number, maxSp: number, maxF: number, personal: number, size: number, speed: number, bank: number, flex: number, depth: number): void;
  mover_rows(m: number): number; mover_chain(m: number): number; mover_cz(m: number): number; mover_croll(m: number): number; mover_solids(m: number): number;
}
interface Body { kind: number | string; weight: number; plate: boolean; claw: boolean; jaw: number; sieve: boolean; schools: boolean; hunts: boolean }
interface WebRules { band: [number, number]; plate: number; claw: number }
type Win = { EcoCore?: Record<string, any>; EcoEngine?: unknown; ECO_ENGINE?: string; location?: { search: string } };
const win = (typeof window !== "undefined" ? window : globalThis) as unknown as Win;

let ex: Exports | null = null, why = "";
try {
  // sin, cos, atan2 and hypot are the page's own: the engine and the JavaScript still beside it must round alike (engine/src/math.rs)
  const math = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, hypot: (a: number, b: number) => Math.hypot(a, b) };
  ex = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes as unknown as BufferSource), { math }).exports as unknown as Exports;
} catch (e) { why = "the engine did not start: " + (e as Error).message; }

function make(x: Exports) {
  // simulated time (clock.rs), with the same face as the core's Clock
  class Clock {
    readonly q: number; private h: number;
    constructor(readonly quanta = 240, readonly maxQ = 12) { this.q = 1 / quanta; this.h = x.clock_new(quanta, maxQ); }
    advance(wall: number): number { return x.clock_advance(this.h, wall); }
    fixed(n = 4): number { return x.clock_fixed(this.h, n); }
    get t(): number { return x.clock_t(this.h); } set t(v: number) { x.clock_set_t(this.h, v); }
    get steps(): number { return x.clock_steps(this.h); }
    get scale(): number { return x.clock_scale(this.h); } set scale(v: number) { x.clock_set_scale(this.h, v); }
  }
  // The creatures' columns and the grid (sense.rs). The arrays are views straight into the engine's memory: write x, y, sp and skip for
  // the first n creatures, call build, then read the grid: the creatures in cell (gx, gy) are order[starts[c]] to order[starts[c + 1] - 1],
  // with c = (gx - gx0) + (gy - gy0) * cols, for cells inside cols by rows. The engine's memory can move when it grows, so call sync()
  // before reading the views in a later function.
  class Sense {
    x!: Float64Array; y!: Float64Array; sp!: Int32Array; skip!: Uint8Array; density!: Float32Array; order!: Uint32Array; starts!: Uint32Array;
    gx0 = 0; gy0 = 0; cols = 0; rows = 0; cap = 0;
    private h = x.sense_new(); private buf: ArrayBuffer | null = null; private cells = 0;
    private views(): void {
      const b = x.memory.buffer, h = this.h, n = this.cap; this.buf = b;
      this.x = new Float64Array(b, x.sense_x(h), n); this.y = new Float64Array(b, x.sense_y(h), n); this.sp = new Int32Array(b, x.sense_sp(h), n);
      this.skip = new Uint8Array(b, x.sense_skip(h), n); this.density = new Float32Array(b, x.sense_density(h), n); this.order = new Uint32Array(b, x.sense_order(h), n);
      this.starts = new Uint32Array(b, x.sense_starts(h), this.cells + 1);
    }
    sync(): this { if (this.buf !== x.memory.buffer) this.views(); return this; }
    reserve(n: number): void { if (n > this.cap) { this.cap = x.sense_reserve(this.h, n); this.cells = 0; this.views(); } else this.sync(); }
    build(n: number, cell: number, density = true): boolean {
      if (!x.sense_build(this.h, n, cell, density ? 1 : 0)) return false;
      const h = this.h; this.gx0 = x.sense_gx0(h); this.gy0 = x.sense_gy0(h); this.cols = x.sense_cols(h); this.rows = x.sense_rows(h); this.cells = this.cols * this.rows;
      if (this.buf !== x.memory.buffer) this.views(); else this.starts = new Uint32Array(this.buf, x.sense_starts(h), this.cells + 1);
      return true;
    }
  }
  // The swimmers' movement (mover.rs). One row of STRIDE numbers for each creature that moves this step, in the column order mover.rs names,
  // plus its spine (chain: K points, x then y; cz; croll) and the tank's solids (SOLID numbers each). Fill them, call step, read them back.
  class Mover {
    static readonly STRIDE = 40; static readonly K = 20; static readonly SOLID = 9;
    rows!: Float64Array; chain!: Float32Array; cz!: Float32Array; croll!: Float32Array; solids!: Float64Array;
    cap = 0; solidCap = 0;
    private h = x.mover_new(); private buf: ArrayBuffer | null = null;
    private views(): void {
      const b = x.memory.buffer, h = this.h, n = this.cap; this.buf = b;
      this.rows = new Float64Array(b, x.mover_rows(h), n * 40); this.chain = new Float32Array(b, x.mover_chain(h), n * 40);
      this.cz = new Float32Array(b, x.mover_cz(h), n * 20); this.croll = new Float32Array(b, x.mover_croll(h), n * 20); this.solids = new Float64Array(b, x.mover_solids(h), this.solidCap * 9);
    }
    reserve(n: number, solids = 0): void {
      if (n > this.cap || solids > this.solidCap) { this.cap = x.mover_reserve(this.h, n, solids); this.solidCap = x.mover_solids_cap(this.h); this.views(); }
      else if (this.buf !== x.memory.buffer) this.views();
    }
    step(n: number, solids: number, dt: number, t: { maxSp: number; maxF: number; personal: boolean; size: number; speed: number; bank: number; flex: number; depth: number }): void {
      x.mover_step(this.h, n, solids, dt, t.maxSp, t.maxF, t.personal ? 1 : 0, t.size, t.speed, t.bank, t.flex, t.depth);
    }
  }
  // who eats whom (web.rs). Bodies stay the tank's plain objects; their numbers cross.
  const DEF: WebRules = { band: [2, 100], plate: 2, claw: 0.6 };
  const ratio = (a: Body, b: Body, R: WebRules = DEF): number => x.web_ratio(a.weight, b.weight, b.plate ? 1 : 0, a.claw ? 1 : 0, a.jaw, R.plate, R.claw);
  const verdict = (a: Body, b: Body, R: WebRules = DEF): number =>
    x.web_verdict(a.kind === b.kind ? 1 : 0, a.weight, b.weight, b.plate ? 1 : 0, a.claw ? 1 : 0, a.jaw, a.sieve ? 1 : 0, b.schools ? 1 : 0, R.band[0], R.band[1], R.plate, R.claw);
  const eats = (a: Body, b: Body, R: WebRules = DEF): boolean => verdict(a, b, R) === 0;
  const fears = (prey: Body, hunter: Body, R: WebRules = DEF): boolean => hunter.hunts && eats(hunter, prey, R);
  const WHY = ["", "own kind", "too big", "too small"] as const;
  const refusal = (a: Body, b: Body, R: WebRules = DEF) => WHY[verdict(a, b, R)];
  return { Clock, Sense, Mover, Web: { ratio, eats, fears, refusal }, random: () => x.rng_next(), seed: (s: number) => x.rng_seed(s >>> 0), state: () => x.rng_state() };
}

const made = ex ? make(ex) : null;
const asked = win.ECO_ENGINE || (/[?&]engine=(\w+)/.exec((win.location && win.location.search) || "") || [])[1] || "rust";
const EcoEngine = {
  version: ex ? ex.eco_version() : 0,
  bytes: (wasmBytes as unknown as Uint8Array).length,
  on: false,          // true once it has taken over the core's pieces
  why,                // why it is off, when it is
  parts: [] as string[],
  exports: ex,
  ...(made || {}),
  // Take over the core's pieces. Called once below; a page can call it itself after setting ECO_ENGINE = "js" to start it late.
  use(core: Record<string, any> | undefined = win.EcoCore): boolean {
    if (!made || !core) { this.why = this.why || "no core to take over (load eco-core.js first)"; return false; }
    if (this.on) return true;
    const seedOf = core.seedOf as (v: number | string) => number;
    made.seed(core.rng && typeof core.rng.s === "number" ? core.rng.s : (Math.random() * 4294967296) >>> 0);   // carry on from where the core's stream stands
    core.random = made.random;
    core.reseed = (seed: number | string) => made.seed(seedOf(seed));
    core.Clock = made.Clock;
    core.Web = { ...core.Web, ...made.Web };
    core.engine = "rust";
    this.on = true; this.parts = ["random", "clock", "web", "sense", "move"];
    return true;
  },
};
win.EcoEngine = EcoEngine;
if (asked !== "js" && asked !== "off") EcoEngine.use(); else EcoEngine.why = "turned off (engine=" + asked + ")";
