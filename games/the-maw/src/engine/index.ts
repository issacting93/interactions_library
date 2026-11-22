// The Rust engine in the browser (window.EcoEngine). The engine itself is games/the-maw/engine (Rust), compiled to WebAssembly and
// carried inside this script, so the tank loads it like any other classic script: no fetch, and it works from a file or a published copy.
// Built to shared/engine/ecology/eco-engine.js by `npm run build:engine`; load it right after eco-core.js.
//
// When it is on, it takes over the pieces of the core it has, behind the names the tank already uses:
//   EcoCore.random / reseed   the seeded stream, drawn in Rust (the same numbers, draw for draw)
//   EcoCore.Clock             simulated time in whole quanta
//   EcoCore.Web               ratio, eats, fears, refusal: who eats whom
//   EcoEngine.World           the swimmers' world: every creature's numbers live in the engine's memory, and it senses them (the neighbour
//                             grid), reads each one's neighbours for steering, and moves them, all in place (ecology-sim.js uses it)
//   EcoEngine.Body            the walking body's physics: one substep of a creature body's chunks (creature-body.js uses it)
//   EcoEngine.Fear            which hunters are near enough to matter to a creature, found through a grid
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
  world_new(): number; world_reserve(w: number, slots: number): number; world_reserve_list(w: number, n: number, solids: number): number; world_solids_cap(w: number): number; world_set_species(w: number, n: number): void;
  world_sense(w: number, n: number, cell: number, density: number): number;
  world_move(w: number, movers: number, solids: number, dt: number, maxSp: number, maxF: number, personal: number, size: number, speed: number, bank: number, flex: number, depth: number): void;
  world_neighbours(w: number, i: number, flags: number, r: number, bodyPx: number, dz: number, size: number, reach: number, biteTol: number, sepMul: number, bl: number, sp0: number): void;
  world_data(w: number): number; world_sp(w: number): number; world_skip(w: number): number; world_chain(w: number): number; world_cz(w: number): number; world_croll(w: number): number;
  world_species(w: number): number; world_ord(w: number): number; world_out(w: number): number; world_movers(w: number): number; world_solids(w: number): number;
  world_beh(w: number): number; world_vort(w: number): number; world_vort_sp(w: number): number; world_io(w: number): number; world_gave(w: number): number; world_reserve_tables(w: number, beh: number, vort: number): void; world_tables_cap(w: number): number;
  world_steer_tank(w: number, flags: number, dt: number, bodyPx: number, r: number, maxSp: number, maxF: number, wd: number, ht: number, margin: number, align: number, coh: number, sep: number, dz: number, size: number, simT: number, vx0: number, vy0: number, vradius: number, swirl: number, ptrX: number, ptrY: number, lowland: number, nVort: number, nSolids: number, flex: number, bank: number, td: number): void;
  world_steer_all(w: number, f: number): void; world_move_all(w: number, solids: number, dt: number, maxSp: number, maxF: number, personal: number, size: number, speed: number, bank: number, flex: number, depth: number): void; fear_hs(f: number): number;
  world_steer(w: number, f: number, i: number, bid: number, flags: number, reach: number, bl: number, sp0: number, steerX: number, steerY: number): void;
  world_density(w: number): number; world_order(w: number): number; world_starts(w: number): number; world_gx0(w: number): number; world_gy0(w: number): number; world_cols(w: number): number; world_rows(w: number): number;
  body_reserve(n: number): number; body_chunks(): number; body_rest(): number; body_prm(): number; body_integrate(n: number): void;
  fear_new(): number; fear_reserve(f: number, n: number): number; fear_build(f: number, n: number, r3: number): void; fear_query(f: number, x: number, y: number, bl: number, lured: number): number;
  fear_sp(f: number): number; fear_hl(f: number): number; fear_sting(f: number): number; fear_lure(f: number): number; fear_ang(f: number): number; fear_dash_t(f: number): number; fear_alert(f: number): number; fear_cloak(f: number): number;
  fear_mimic(f: number): number; fear_body(f: number): number; fear_predators(f: number): number; fear_weighed(f: number): number; fear_set_species(f: number, species: number): void;
  fear_weigh(f: number, x: number, y: number, sp: number, bl: number, lured: number, flags: number, r: number, maxF: number, fx: number, fy: number): void;
  fear_x(f: number): number; fear_y(f: number): number; fear_kind(f: number): number; fear_a(f: number): number; fear_b(f: number): number; fear_out(f: number): number;
}
interface Body { kind: number | string; weight: number; plate: boolean; claw: boolean; jaw: number; sieve: boolean; schools: boolean; hunts: boolean }
interface WebRules { band: [number, number]; plate: number; claw: number }
type Win = { EcoCore?: Record<string, any>; EcoEngine?: unknown; ECO_ENGINE?: string; location?: { search: string } };
const win = (typeof window !== "undefined" ? window : globalThis) as unknown as Win;

// who answers the engine's questions about a bite, for the neighbour pass now running (Sense.neighbours sets it)
interface SteerHost { edible(i: number, j: number): number; bite(i: number, j: number): number; fearPrep?(): void; hunt?(i: number): void; hostBlock?(i: number): void; lurers?(i: number): void; dirty?(): void; struggle?(i: number): void; hold?(i: number): number; catchEnd?(i: number, escaped: number): void }
let steerHost: SteerHost | null = null;
// and about a hunter, for the creature now weighing its hunters (Fear.weigh sets it)
interface FearHost { fears(i: number, k: number): number; mimics(i: number, k: number): number }
let fearHost: FearHost | null = null;
let ex: Exports | null = null, why = "";
try {
  // sin, cos, atan2 and hypot are the page's own: the engine and the JavaScript still beside it must round alike (engine/src/math.rs)
  const math = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, hypot: (a: number, b: number) => Math.hypot(a, b), pow: Math.pow };
  ex = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes as unknown as BufferSource), { math, steer: { edible: (i: number, j: number) => (steerHost ? steerHost.edible(i, j) : 0), bite: (i: number, j: number) => (steerHost ? steerHost.bite(i, j) : 0),
      fear_prep: () => { if (steerHost && steerHost.fearPrep) steerHost.fearPrep(); }, hunt: (i: number) => { if (steerHost && steerHost.hunt) steerHost.hunt(i); },
      host_block: (i: number) => { if (steerHost && steerHost.hostBlock) steerHost.hostBlock(i); }, lurers: (i: number) => { if (steerHost && steerHost.lurers) steerHost.lurers(i); },
      struggle: (i: number) => { if (steerHost && steerHost.struggle) steerHost.struggle(i); }, hold: (i: number) => (steerHost && steerHost.hold ? steerHost.hold(i) : 1),
      catch_end: (i: number, escaped: number) => { if (steerHost && steerHost.catchEnd) steerHost.catchEnd(i, escaped); },
      dirty: () => { if (steerHost && steerHost.dirty) steerHost.dirty(); } },
    fear: { fears: (i: number, k: number) => (fearHost ? fearHost.fears(i, k) : 0), mimics: (i: number, k: number) => (fearHost ? fearHost.mimics(i, k) : 0) } }).exports as unknown as Exports;
} catch (e) { why = "the engine did not start: " + (e as Error).message; }

function make(x: Exports) {
  // simulated time (clock.rs), with the same face as the core's Clock
  class Clock {
    readonly q: number; private h: number;
    constructor(readonly quanta = 240, readonly maxQ = 12) { this.q = 1 / quanta; this.h = x.clock_new(quanta, maxQ); grown(); }
    advance(wall: number): number { return x.clock_advance(this.h, wall); }
    fixed(n = 4): number { return x.clock_fixed(this.h, n); }
    get t(): number { return x.clock_t(this.h); } set t(v: number) { x.clock_set_t(this.h, v); }
    get steps(): number { return x.clock_steps(this.h); }
    get scale(): number { return x.clock_scale(this.h); } set scale(v: number) { x.clock_set_scale(this.h, v); }
  }
  // The engine's memory moves when it grows, and every array here is a view straight into it. Whatever may have grown it calls grown(),
  // which has every world and fear take its views again.
  let lastBuf: ArrayBuffer | null = null; const watchers: Array<() => void> = [];
  const grown = (): boolean => { if (x.memory.buffer === lastBuf) return false; lastBuf = x.memory.buffer; for (const w of watchers) w(); return true; };
  // The swimmers' world (world.rs): every creature's numbers in the engine's memory, one column per field, one slot per creature.
  //   data                            the creatures' numbers, a row of World.ROW per slot in World.FIELDS order: data[slot * ROW + field].
  //                                   The page's creature objects read and write it directly.
  //   sp, skip, chain, cz, croll      species, dead-or-held, and the spine (K points x then y; depth; roll), by slot
  //   species                         each species' swim: sep, len, speed, waves, bend, wing, hunts (World.SPECIES numbers each)
  //   ord                             the slot at each place in the page's list of creatures, written before sense
  // sense() builds the grid over the places: the creatures in cell (gx, gy) are order[starts[c]] to order[starts[c + 1] - 1], with
  // c = (gx - gx0) + (gy - gy0) * cols, for cells inside cols by rows; density is by place. gen goes up whenever the views are taken again.
  class World {
    static readonly FIELDS = ["x", "y", "z", "vx", "vy", "ang", "scale", "depth", "fade", "phase", "alarm", "fleeX", "fleeY", "dashT", "spinT", "turnS", "tuck", "puff", "alert", "cloak", "glide", "flap", "ground",
      "cool", "nextDash", "full", "gulp", "hide", "boldness", "pulseT", "nextSpin", "settleT", "groundGoal", "wanderA", "wanderMul", "ring", "zPref", "zGoal", "zGoalHost", "seed", "tuckGoal", "dashAng",
      // the hunt: _tg and _ig hold the target and what it ignores as slots (-1 none, -2 something the engine does not hold), _ls* where it last saw it
      "_tg", "_ig", "_lsx", "_lsy", "_lst", "bestD", "chaseT", "ignoreT", "stalkT", "sightMul",
      // what the page tells the engine once a step, and what steering hands to movement (world.rs BID to ON)
      "_bid", "_cf", "_stx", "_sty", "_holds", "_hk", "_wfx", "_wfy", "_wcr", "_wth", "_wdash", "_on",
      // a catch: _cb who holds it and _hd what it holds (slots, as _tg), and the struggle
      "_cb", "_hd", "struggleT", "struggleT0", "tryT", "escMul"] as const;
    // fields that may be unset: kept as NaN, read back as null
    static readonly NULLABLE = ["hide", "groundGoal", "zGoalHost", "tuckGoal", "dashAng"] as const;
    static readonly ROW = 80; static readonly K = 20; static readonly SPECIES = 10; static readonly BEH = 48; static readonly VORT = 5; static readonly MOVER = 12; static readonly SOLID = 9;
    beh!: Float64Array; vort!: Float64Array; vortSp!: Uint8Array; io!: Float64Array; gave!: Uint32Array; behCap = 0; vortCap = 0;
    data!: Float64Array;
    onViews: (() => void) | null = null;   // called whenever the views have been taken again (the engine's memory moved)
    sp!: Int32Array; skip!: Uint8Array; chain!: Float32Array; cz!: Float32Array; croll!: Float32Array; species!: Float64Array; ord!: Uint32Array;
    out!: Float64Array; movers!: Float64Array; solids!: Float64Array; density!: Float32Array; order!: Uint32Array; starts!: Uint32Array;
    gen = 0; slots = 0; listCap = 0; solidCap = 0; nSpecies = 0; gx0 = 0; gy0 = 0; cols = 0; rows = 0;
    private h = x.world_new(); private cells = 0;
    constructor() { watchers.push(() => this.views()); if (!grown()) this.views(); }
    private views(): void {
      const b = x.memory.buffer, h = this.h, n = this.slots, m = this.listCap;
      this.data = new Float64Array(b, x.world_data(h), n * 80);
      this.sp = new Int32Array(b, x.world_sp(h), n); this.skip = new Uint8Array(b, x.world_skip(h), n);
      this.chain = new Float32Array(b, x.world_chain(h), n * 40); this.cz = new Float32Array(b, x.world_cz(h), n * 20); this.croll = new Float32Array(b, x.world_croll(h), n * 20);
      this.species = new Float64Array(b, x.world_species(h), this.nSpecies * 10); this.gave = new Uint32Array(b, x.world_gave(h), this.nSpecies); this.ord = new Uint32Array(b, x.world_ord(h), m);
      this.out = new Float64Array(b, x.world_out(h), 17); this.movers = new Float64Array(b, x.world_movers(h), m * 12); this.solids = new Float64Array(b, x.world_solids(h), this.solidCap * 9);
      this.density = new Float32Array(b, x.world_density(h), m); this.order = new Uint32Array(b, x.world_order(h), m); this.starts = new Uint32Array(b, x.world_starts(h), this.cells + 1);
      const tc = x.world_tables_cap(h); this.behCap = Math.floor(tc / 65536); this.vortCap = tc % 65536;
      this.beh = new Float64Array(b, x.world_beh(h), this.behCap * 48); this.vort = new Float64Array(b, x.world_vort(h), this.vortCap * 5);
      this.vortSp = new Uint8Array(b, x.world_vort_sp(h), this.vortCap * this.nSpecies); this.io = new Float64Array(b, x.world_io(h), 16);
      this.gen++;
      if (this.onViews) this.onViews();
    }
    private took(): void { if (!grown()) this.views(); }   // after anything that may have moved this world's arrays
    reserve(slots: number): void { if (slots > this.slots) { this.slots = x.world_reserve(this.h, slots); this.took(); } }
    reserveList(n: number, solids = 0): void { if (n > this.listCap || solids > this.solidCap) { this.listCap = x.world_reserve_list(this.h, n, solids); this.solidCap = x.world_solids_cap(this.h); this.took(); } }
    reserveTables(behaviours: number, vortices: number): void { if (behaviours > this.behCap || vortices > this.vortCap) { x.world_reserve_tables(this.h, behaviours, vortices); this.took(); } }
    setSpecies(n: number): void { x.world_set_species(this.h, n); this.nSpecies = n; this.took(); }
    sense(n: number, cell: number, density = true): boolean {
      const ok = !!x.world_sense(this.h, n, cell, density ? 1 : 0), h = this.h;
      if (ok) { this.gx0 = x.world_gx0(h); this.gy0 = x.world_gy0(h); this.cols = x.world_cols(h); this.rows = x.world_rows(h); this.cells = this.cols * this.rows; }
      if (!grown() && ok) this.starts = new Uint32Array(x.memory.buffer, x.world_starts(h), this.cells + 1);
      return ok;
    }
    // The neighbour pass of steering for the creature at place i (world.rs `neighbours`): fills `out`. When a neighbour is in biting reach
    // the engine asks the host whether it is food (edible) and has it do the biting (bite, which returns whether i now bites anything in
    // reach). The host may change any creature while it answers. flags: 1 personal, 2 can bite, 4 bites anything in reach, 8 swims in a train.
    neighbours(i: number, flags: number, r: number, bodyPx: number, dz: number, size: number, reach: number, biteTol: number, sepMul: number, bl: number, sp0: number, host: SteerHost): void {
      const was = steerHost; steerHost = host;
      try { x.world_neighbours(this.h, i, flags, r, bodyPx, dz, size, reach, biteTol, sepMul, bl, sp0); } finally { steerHost = was; }
      grown();
    }
    // The tank as this step's steering reads it (world.rs SteerTank). flags: 1 personal, 2 the tank turns about a centre, 4 the pointer matters,
    // 8 it scatters, 16 the host has a say on fear, 32 the host has individuals with lures.
    steerTank(flags: number, t: number[]): void { (x.world_steer_tank as (...a: number[]) => void)(this.h, flags, ...t); }
    // Steer the creature at place i (world.rs `steer`): the result is in io (force x, y, cruise, dashing, threat). The host answers a bite,
    // the hunt, riding a host, lures, fear's preparation, and marks the hunters changed; fhost answers the food web.
    // flags: 1 can bite, 2 bites anything in reach, 4 a hand on it, 8 keeps to its own business too, 16 a host's hunter, 32 a host's guest.
    steer(fear: { h: number }, i: number, bid: number, flags: number, reach: number, bl: number, sp0: number, steerX: number, steerY: number, host: SteerHost, fhost: FearHost): void {
      const was = steerHost, wasF = fearHost; steerHost = host; fearHost = fhost;
      try { x.world_steer(this.h, fear.h, i, bid, flags, reach, bl, sp0, steerX, steerY); } finally { steerHost = was; fearHost = wasF; }
      grown();
    }
    // Steer every creature in the list (world.rs `steer_all`): what each wants lands in its row. The host answers as for steer, plus a held
    // creature's struggle and a holder's hold (which returns 1 if it lets go and steers as usual).
    steerAll(fear: { h: number }, host: SteerHost, fhost: FearHost): void {
      const was = steerHost, wasF = fearHost; steerHost = host; fearHost = fhost;
      try { x.world_steer_all(this.h, fear.h); } finally { steerHost = was; fearHost = wasF; }
      grown();
    }
    // Move every creature that steered this step (world.rs `move_all`), from what steering left in its row.
    moveAll(solids: number, dt: number, t: { maxSp: number; maxF: number; personal: boolean; size: number; speed: number; bank: number; flex: number; depth: number }): void {
      x.world_move_all(this.h, solids, dt, t.maxSp, t.maxF, t.personal ? 1 : 0, t.size, t.speed, t.bank, t.flex, t.depth);
    }
    // Move the creatures listed in `movers` (MOVER numbers each: slot, flags, tuck goal, the steering wish, the behaviour's numbers), in place.
    move(movers: number, solids: number, dt: number, t: { maxSp: number; maxF: number; personal: boolean; size: number; speed: number; bank: number; flex: number; depth: number }): void {
      x.world_move(this.h, movers, solids, dt, t.maxSp, t.maxF, t.personal ? 1 : 0, t.size, t.speed, t.bank, t.flex, t.depth);
    }
  }
  // Which hunters could matter to a creature (fear.rs). Write each hunter's place, kind (0 chases, 1 stings, 2 lures) and reach (a, b),
  // call build, then query a creature: the hunters to weigh are out[0 .. the number returned], in rising order.
  class Fear {
    x!: Float64Array; y!: Float64Array; kind!: Uint8Array; a!: Float64Array; b!: Float64Array; out!: Uint32Array; cap = 0;
    // each hunter as it stands now, for weigh: species, body length, sting, lure, heading, dash, alert, cloak, whether it mimics, seven body points
    hs!: Int32Array;   // each hunter's slot, as noted
    sp!: Int32Array; hl!: Float64Array; sting!: Float64Array; lure!: Float64Array; ang!: Float64Array; dashT!: Float64Array; alert!: Float64Array; cloak!: Float64Array; mimic!: Uint8Array; body!: Float64Array;
    predators!: Uint8Array; species = 0;   // predators[prey species * species + hunter species]: the prey's species flees the hunter's
    weighed!: Float64Array;                // what weigh found: force x, y, threat, flee x, y
    readonly h = x.fear_new();
    constructor() { watchers.push(() => this.views()); if (!grown()) this.views(); }
    private views(): void {
      const m = x.memory.buffer, h = this.h, n = this.cap;
      this.x = new Float64Array(m, x.fear_x(h), n); this.y = new Float64Array(m, x.fear_y(h), n); this.kind = new Uint8Array(m, x.fear_kind(h), n);
      this.a = new Float64Array(m, x.fear_a(h), n); this.b = new Float64Array(m, x.fear_b(h), n); this.out = new Uint32Array(m, x.fear_out(h), n);
      const f = (ptr: number) => new Float64Array(m, ptr, n);
      this.hl = f(x.fear_hl(h)); this.sting = f(x.fear_sting(h)); this.lure = f(x.fear_lure(h)); this.ang = f(x.fear_ang(h)); this.dashT = f(x.fear_dash_t(h)); this.alert = f(x.fear_alert(h)); this.cloak = f(x.fear_cloak(h));
      this.sp = new Int32Array(m, x.fear_sp(h), n); this.hs = new Int32Array(m, x.fear_hs(h), n); this.mimic = new Uint8Array(m, x.fear_mimic(h), n); this.body = new Float64Array(m, x.fear_body(h), n * 14);
      this.predators = new Uint8Array(m, x.fear_predators(h), this.species * this.species); this.weighed = new Float64Array(m, x.fear_weighed(h), 5);
    }
    setSpecies(n: number): void { x.fear_set_species(this.h, n); this.species = n; if (!grown()) this.views(); }
    // What the hunters near a creature do to its steering (fear.rs `weigh`): fills `weighed`. The host answers whether the creature fears
    // hunter k where its species has no say, and whether hunter k passes for its kind. flags: 1 walking head down, 2 the host has a say.
    weigh(px: number, py: number, sp: number, bl: number, lured: number, flags: number, r: number, maxF: number, fx: number, fy: number, host: FearHost): void {
      const was = fearHost; fearHost = host;
      try { x.fear_weigh(this.h, px, py, sp, bl, lured, flags, r, maxF, fx, fy); } finally { fearHost = was; }
      grown();
    }
    reserve(n: number): void { if (n > this.cap) { this.cap = x.fear_reserve(this.h, n); if (!grown()) this.views(); } }
    build(n: number, r3: number): void { x.fear_build(this.h, n, r3); grown(); }
    query(px: number, py: number, bl: number, lured: number): number { const c = x.fear_query(this.h, px, py, bl, lured); grown(); return c; }
  }
  // ---- the walking body (body.rs): one substep of a creature body's chunks ----
  // One scratch body for the page: reserve(n), write each chunk (Body.CH numbers, in body.rs's order), the joints' rest lengths and the
  // settings (prm, body.rs's P_ order), integrate(n), then read the chunks back. creature-body.js uses it.
  const Body = {
    CH: 20, PRM: 40, cap: 0,
    chunks: new Float64Array(0), rest: new Float64Array(0), prm: new Float64Array(0),
    views(): void { const b = x.memory.buffer, n = this.cap; this.chunks = new Float64Array(b, x.body_chunks(), n * 20); this.rest = new Float64Array(b, x.body_rest(), n); this.prm = new Float64Array(b, x.body_prm(), 40); },
    reserve(n: number): void { if (n > this.cap) { this.cap = x.body_reserve(n); if (!grown()) this.views(); } },
    integrate(n: number): void { x.body_integrate(n); grown(); },
  };
  watchers.push(() => Body.views()); Body.cap = x.body_reserve(1); Body.views();
  // who eats whom (web.rs). Bodies stay the tank's plain objects; their numbers cross.
  const DEF: WebRules = { band: [2, 100], plate: 2, claw: 0.6 };
  const ratio = (a: Body, b: Body, R: WebRules = DEF): number => x.web_ratio(a.weight, b.weight, b.plate ? 1 : 0, a.claw ? 1 : 0, a.jaw, R.plate, R.claw);
  const verdict = (a: Body, b: Body, R: WebRules = DEF): number =>
    x.web_verdict(a.kind === b.kind ? 1 : 0, a.weight, b.weight, b.plate ? 1 : 0, a.claw ? 1 : 0, a.jaw, a.sieve ? 1 : 0, b.schools ? 1 : 0, R.band[0], R.band[1], R.plate, R.claw);
  const eats = (a: Body, b: Body, R: WebRules = DEF): boolean => verdict(a, b, R) === 0;
  const fears = (prey: Body, hunter: Body, R: WebRules = DEF): boolean => hunter.hunts && eats(hunter, prey, R);
  const WHY = ["", "own kind", "too big", "too small"] as const;
  const refusal = (a: Body, b: Body, R: WebRules = DEF) => WHY[verdict(a, b, R)];
  return { Clock, World, Fear, Body, Web: { ratio, eats, fears, refusal }, random: () => x.rng_next(), seed: (s: number) => x.rng_seed(s >>> 0), state: () => x.rng_state() };
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
    this.on = true; this.parts = ["random", "clock", "web", "creatures", "sense", "steer", "fear", "move", "body"];
    return true;
  },
};
win.EcoEngine = EcoEngine;
if (asked !== "js" && asked !== "off") EcoEngine.use(); else EcoEngine.why = "turned off (engine=" + asked + ")";
