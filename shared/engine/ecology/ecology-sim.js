/* INTERACTIONS — Ecology simulation engine.
   Extracted 2026-10-31 from "world/forges/fish-tool/Cybernetic Ecology.html" so the full creature
   simulation (species behavior derivation, boid steering, predation, carcasses, population
   respawn-pressure timing, vortex/pointer interaction) can run headless, independent of that
   tool's WebGL2 renderer and DOM UI, and be driven by another scene (e.g. a combined city + tower
   + ecology world).

   This is a full-fidelity relocation, not a trimmed-down port: an earlier narrower attempt that
   tried to extract only fish[]/step(dt) in isolation correctly bailed, because step(dt) is
   inseparable from the species-behavior derivation (predator/prey sets, hosts), the carcass
   system, and predation-pressure respawn timing — all of that is real simulation behavior, not
   page glue, so all of it moved together here.

   What did NOT move, and stays in Cybernetic Ecology.html: WebGL2 shader programs and draw calls,
   the spine-texture upload (writeSpines), the DOM UI (sliders/species chips/eco panel), and the
   camera (updateCamera/pickFollow/screenToTank) — none of those call into this module's internals,
   they only read this module's public state each frame.

   Depends on shared/engine/ecology/ecology-species.js (window.EcologySpecies) being loaded first. Classic script
   (not a module), works from file://. Load order:
     <script src="ecology-species.js"></script>
     <script src="ecology-sim.js"></script>
     (then your own script that reads window.EcologySim)

   API:
     EcologySim.create(cfg) -> sim
       cfg is stored BY REFERENCE as sim.cfg and read live every step — the original code read a
       page-global settings object (S) directly inside step(), so a consumer whose own UI mutates
       the same object in place (as Cybernetic Ecology.html's sliders already do) gets identical
       live-tuning behavior with no extra wiring. Required/read fields (plain numbers/strings):
       size, speed, beh ('on'|'off'), sep, align, coh, flow ('free'|'vortex'), vradius, swirl,
       ptr ('scatter'|'attract'|'ignore'), dz, wiggle, flex, bank, species ('mixed' or a species
       key), count. A consumer that doesn't care about some axis (e.g. no pointer in a 3D scene)
       just sets ptr:'ignore' and never touches sim.ptr. create() does NOT populate sim.fish —
       call EcologySim.resize() then EcologySim.setSpecies()/setCount() once bounds are valid
       (matching the original page's own startup order: resize() first, population later).
     EcologySim.resize(sim, vw, vh) — sets the simulation's spatial domain. vw/vh are "viewport"
       units; the tank is WORLD_SCALE (4) times that in each axis, matching the original tank's own
       vw*WORLD_SCALE sizing exactly. A non-browser consumer just picks whatever vw/vh produces the
       arena size it wants. Call once before the first setSpecies()/setCount()/step(); call again
       whenever the arena should change size.
     EcologySim.step(sim, dt) — advances fish/carcasses/pressure/respawn by dt seconds, in place.
     EcologySim.setSpecies(sim, key) — 'mixed' or a single species key; clears and repopulates the
       tank, matching the original setSpecies(key)'s population-affecting half exactly (a caller
       that also drives UI, like Cybernetic Ecology.html, still owns the button/blurb side itself).
     EcologySim.setCount(sim) — re-syncs live fish/pending counts to the current population targets
       (cfg.count / cfg.species / sim.pop); call after changing sim.pop[key] or cfg.count/species.
     EcologySim.setPop(sim, popObj) — Object.assign's popObj into sim.pop, then setCount().
     EcologySim.desired(sim) — per-species target head-count array, same as the original desired().
     EcologySim.bodyLen(sim, fish) — a fish's current body length (needs sim.cfg.size + its species).
     EcologySim.nearestFish(sim, x, y, maxRadius, predicate) — grid-bucketed nearest-fish lookup,
       same algorithm the original hunter/host-seeking and HUD code used (gridNearestFish).
     EcologySim.add(sim, key) -> guest fish | null — a host's own creature as a member of that species: the host places
       it every frame, it never respawns, the tank's hunters treat it as prey. EcologySim.kill(sim, fish) — taken from outside. EcologySim.grab(sim, pred, prey) — one takes hold of the other.
     sim.hooks — a host's own rules on top (onMeal, canEat, onCatch, onSpawn, lurers), and per creature f.beh and f.escMul:
       see where hooks is declared. shared/engine/ecology/ecology-diet.js uses them for the diet game.
     EcologySim.hunts(sim) -> [{ hunter, prey, hold?, dash? }] — every catch and chase going on, catches first.
     EcologySim.setSolids(sim, [{ x, y, r, zTop } | { x0, y0, x1, y1, r, zTop }]) — towers and walls to steer round and land on.
     EcologySim.setPointer(sim, x, y, active) — feeds the pointer-attraction/scatter interaction
       (tank-space coordinates, matching screenToTank's output in the original). Equivalent to
       setting sim.ptr.x/y/active directly, which is also fine — it's a plain mutable object.
     EcologySim.setVortexAnchor(sim, x, y) — sets the vortex center (tank-space), matching the
       original pointerdown handler's "if (S.flow==='vortex') vortex.x=...". Equivalent to setting
       sim.vortex.x/y directly.
     sim.vortices — a plain mutable array of LOCAL swirl sources, {x, y (tank-space), radius
       (tank-space), strength}, additive to whatever cfg.flow is and independent of the single
       global vortex/anchor above. Empty by default, so a consumer that never touches it (e.g.
       Cybernetic Ecology.html) sees zero behavior change. A world scene that places landmarks as
       whirlpools (towers, say) just keeps this array in sync with their tank-space positions —
       every fish within `radius` of a source gets pulled into orbit around it, scaled by
       `strength` and distance falloff; fish outside every source's radius are unaffected and keep
       whatever cfg.flow already gives them.
       Optional `species` (a Set of species indices): only those species feel that source, so a
       landmark can draw in the creatures it attracts and leave the rest alone (Forge Ecology).
     Readable per-instance state (read-only by convention — nothing outside this module should
     mutate these except via the setters above): sim.fish (array of live creature objects: x,y,z,
       ang,vx,vy,chain,cz,croll,sp (species index into sim.speciesRT / the shared SPECIES data,
       same indexing), scale, fade, alarm, dead, meals, and more — the same per-fish fields step()
       always carried), sim.carcasses, sim.pending, sim.pressure, sim.tally, sim.pop, sim.bounds
       ({w,h}), sim.gridCell, sim.speciesRT (the derived per-species runtime: swim/bounds/weight/
       key/name/blurb/counts references into the shared raw data, plus beh/preySet/predators/
       hostSet/wing derived here), sim.POP_DEFAULT, sim.POP_TOTAL.

   Known pinned constants, duplicated (not shared) with Cybernetic Ecology.html on purpose — one is
   simulation topology, the other is page/GPU layout, and they only need to agree on a number, not
   share code; change one, you must change the other:
     K = 20            spine points per fish (page's spine-texture row layout depends on the same
                        number: TEX_W, the spineData write loop).
     WORLD_SCALE = 4    tank size vs. viewport (page's own tankW()/tankH()/tankDepth() camera/render
                        helpers, and regenTerrain's TW/TH, use the same constant independently).
*/
(function () {
  'use strict';
  // everything that simulates draws its randomness here: the seeded stream when the core is loaded (a seed replays), Math.random when it is not
  const RND = () => (window.EcoCore ? window.EcoCore.random() : Math.random());

  const WORLD_SCALE = 4;
  const K = 20;
  const DEG = Math.PI / 180;

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (v, target, rate, dt) => v + (target - v) * Math.min(1, dt * rate);
  const rand = (a, b) => a + RND() * (b - a);

  function buildSpeciesRuntime(data) {
    const RAW = data.SPECIES, BEH = data.BEH, ECO = data.ECO, WING = data.WING, EVOLVE = data.EVOLVE;
    const TIER1_KEYS = data.TIER1_KEYS;
    const keyIdx = k => RAW.findIndex(s => s.key === k);
    const PLAIN = { school: 1, wander: 0.35, turn: 1e5, vortex: 1, z: [0, 1], minSp: 0.35 };
    for (const k in ECO) {
      const b = BEH[k]; if (!b) continue; const e = ECO[k];
      Object.assign(b, { prey: e.eats, flee: e.flee, catch: e.catch || 0.3, rest: e.rest || 3, contagion: e.contagion || 0, graze: !!e.graze, spinCatch: !!e.spinCatch, dive: !!e.dive });
      if (e.eats.length && !b.chase && !b.stalk && !b.lure && !b.dash && !b.graze && !b.spinCatch) b.chase = 0.5;
      if (k === 'eel') { b.chase = 0.4; b.sight = 4; }
      if (k === 'dragon') { b.chase = 0.6; b.sight = 4; b.dash = { mode: 'chase', range: 2.5, mult: 1.8, dur: 0.5, cool: 3 }; }
    }
    const SP = RAW.map(raw => ({
      key: raw.key, name: raw.name, blurb: raw.blurb, swim: raw.swim, bounds: raw.bounds,
      weight: raw.weight, counts: raw.counts,
    }));
    for (let i = 0; i < SP.length; i++) SP[i].beh = BEH[RAW[i].key] || PLAIN;
    for (let i = 0; i < SP.length; i++) SP[i].preySet = new Set((SP[i].beh.prey || []).map(keyIdx));
    for (let i = 0; i < SP.length; i++) SP[i].predators = new Set(SP.map((o, j) => (o.preySet.has(i) || (o.beh.sting && o !== SP[i])) ? j : -1).filter(j => j >= 0));
    for (let i = 0; i < SP.length; i++) SP[i].hostSet = new Set((SP[i].beh.hosts || []).map(keyIdx));
    for (let i = 0; i < SP.length; i++) SP[i].wing = WING[RAW[i].key] ?? 0.25;
    const isPredator = SP.map(sp => sp.preySet.size > 0 || !!sp.beh.sting);
    const TOTAL_W = SP.reduce((a, s) => a + (s.weight || 1), 0);
    const EVOLVE_IDX = {};
    for (const k in EVOLVE) EVOLVE_IDX[keyIdx(k)] = { next: EVOLVE[k].next.map(keyIdx), meals: EVOLVE[k].meals };
    const CARCASS_EATER_IDX = new Set(['wisp', 'pincer', 'carapace-strider', 'plated-scavenger'].map(keyIdx));
    const POP_DEFAULT = Object.fromEntries(Object.entries(ECO).map(([k, e]) => [k, e.pop]));
    const POP_TOTAL = Object.values(POP_DEFAULT).reduce((a, b) => a + b, 0);
    const TIER1_IDX = TIER1_KEYS.map(keyIdx).filter(i => i >= 0);
    const TIER1_W = TIER1_IDX.map(i => Math.max(0.1, POP_DEFAULT[SP[i].key] ?? 1));
    return { SP, isPredator, TOTAL_W, EVOLVE_IDX, CARCASS_EATER_IDX, POP_DEFAULT, POP_TOTAL, TIER1_IDX, TIER1_W, PLAIN };
  }

  function create(cfg) {
    const data = window.EcologySpecies;
    const RT = buildSpeciesRuntime(data);
    const SPECIES = RT.SP, isPredator = RT.isPredator, EVOLVE_IDX = RT.EVOLVE_IDX,
      CARCASS_EATER_IDX = RT.CARCASS_EATER_IDX, TIER1_IDX = RT.TIER1_IDX, TIER1_W = RT.TIER1_W;

    let fish = [];
    let pending = [];
    let carcasses = [];
    const tally = SPECIES.map(() => ({ eaten: 0, lost: 0, escaped: 0, gaveUp: 0 }));
    const pressure = SPECIES.map(() => 0);
    const pop = { ...RT.POP_DEFAULT };
    const ptr = { x: -1e4, y: -1e4, active: false };
    const vortex = { x: null, y: null };
    const vortices = [];
    const bounds = { w: 1, h: 1 };
    const grid = new Map();
    let gridCell = 1;
    // The Rust engine (window.EcoEngine, games/the-maw/engine), when it is on. The creatures' numbers then live in the engine's memory
    // (EcoEngine.World: one column per field, one slot per creature) and a creature here is a Fish, whose x, y, vx, ... read and write its
    // slot directly, so the rest of this file, and everything else that reads a creature, works on it as on a plain object. The engine
    // senses them (the neighbour grid and the density count), reads each one's neighbours for steering and moves them, all in place; a seed
    // plays out the same either way. egOK says this step's grid is the engine's; where it could not build one, the Map is used for that step.
    const eg = window.EcoEngine && window.EcoEngine.on ? new window.EcoEngine.World() : null;
    let egOK = false, egN = 0;
    const emIdx = [], emTank = {};
    // ---- creatures in the engine ----
    // A Fish holds its slot (_s). The list of creatures is in the page's own order (it is sorted for drawing, added to and cut from, here
    // and by hosts), so sync() tells the engine which slot stands at each place, before anything that goes by place. A creature that has
    // left the list is detached: its numbers are copied out onto it as plain properties and its slot is freed, so whoever still holds it
    // (a hunter's target, a carcass, a host) finds what it left with. One that turns up in the list without a slot (a plain object, or a
    // detached one put back) is adopted.
    const FIELDS = eg ? window.EcoEngine.World.FIELDS : [], ROW = 80, NULLABLE = new Set(eg ? window.EcoEngine.World.NULLABLE : []);
    let D = null, SPV = null;   // the engine's creature numbers (a row of ROW per slot) and species, as they are in its memory now
    if (eg) { eg.onViews = () => { D = eg.data; SPV = eg.sp; }; eg.onViews(); }
    const owners = [], freeSlots = []; let slotTop = 0, liveSlots = 0, stamp = 0;
    class Fish {
      constructor(s) { this._s = s; this._o = s * ROW; this._st = 0; this._cg = -1; this._ch = null; this._cz = null; this._cr = null; this._tgo = null; this._igo = null; this._lsv = null; this._cbo = null; this._hdo = null; }
      _spine() { const s = this._s; this._ch = eg.chain.subarray(s * 40, s * 40 + 40); this._cz = eg.cz.subarray(s * 20, s * 20 + 20); this._cr = eg.croll.subarray(s * 20, s * 20 + 20); this._cg = eg.gen; }
      get sp() { return SPV[this._s]; } set sp(v) { SPV[this._s] = v; }
      // the spine: views into the engine's memory, taken again when it has moved
      get chain() { if (this._cg !== eg.gen) this._spine(); return this._ch; }
      get cz() { if (this._cg !== eg.gen) this._spine(); return this._cz; }
      get croll() { if (this._cg !== eg.gen) this._spine(); return this._cr; }
      // its numbers, where they live: field k of its row (World.FIELDS order; world.rs names the same). Those that may be unset are kept
      // as NaN and read back as null.
      get x() { return D[this._o]; } set x(v) { D[this._o] = v; }
      get y() { return D[this._o + 1]; } set y(v) { D[this._o + 1] = v; }
      get z() { return D[this._o + 2]; } set z(v) { D[this._o + 2] = v; }
      get vx() { return D[this._o + 3]; } set vx(v) { D[this._o + 3] = v; }
      get vy() { return D[this._o + 4]; } set vy(v) { D[this._o + 4] = v; }
      get ang() { return D[this._o + 5]; } set ang(v) { D[this._o + 5] = v; }
      get scale() { return D[this._o + 6]; } set scale(v) { D[this._o + 6] = v; }
      get depth() { return D[this._o + 7]; } set depth(v) { D[this._o + 7] = v; }
      get fade() { return D[this._o + 8]; } set fade(v) { D[this._o + 8] = v; }
      get phase() { return D[this._o + 9]; } set phase(v) { D[this._o + 9] = v; }
      get alarm() { return D[this._o + 10]; } set alarm(v) { D[this._o + 10] = v; }
      get fleeX() { return D[this._o + 11]; } set fleeX(v) { D[this._o + 11] = v; }
      get fleeY() { return D[this._o + 12]; } set fleeY(v) { D[this._o + 12] = v; }
      get dashT() { return D[this._o + 13]; } set dashT(v) { D[this._o + 13] = v; }
      get spinT() { return D[this._o + 14]; } set spinT(v) { D[this._o + 14] = v; }
      get turnS() { return D[this._o + 15]; } set turnS(v) { D[this._o + 15] = v; }
      get tuck() { return D[this._o + 16]; } set tuck(v) { D[this._o + 16] = v; }
      get puff() { return D[this._o + 17]; } set puff(v) { D[this._o + 17] = v; }
      get alert() { return D[this._o + 18]; } set alert(v) { D[this._o + 18] = v; }
      get cloak() { return D[this._o + 19]; } set cloak(v) { D[this._o + 19] = v; }
      get glide() { return D[this._o + 20]; } set glide(v) { D[this._o + 20] = v; }
      get flap() { return D[this._o + 21]; } set flap(v) { D[this._o + 21] = v; }
      get ground() { return D[this._o + 22]; } set ground(v) { D[this._o + 22] = v; }
      get cool() { return D[this._o + 23]; } set cool(v) { D[this._o + 23] = v; }
      get nextDash() { return D[this._o + 24]; } set nextDash(v) { D[this._o + 24] = v; }
      get full() { return D[this._o + 25]; } set full(v) { D[this._o + 25] = v; }
      get gulp() { return D[this._o + 26]; } set gulp(v) { D[this._o + 26] = v; }
      get hide() { const v = D[this._o + 27]; return v !== v ? null : v; } set hide(v) { D[this._o + 27] = v == null ? NaN : v; }
      get boldness() { return D[this._o + 28]; } set boldness(v) { D[this._o + 28] = v; }
      get pulseT() { return D[this._o + 29]; } set pulseT(v) { D[this._o + 29] = v; }
      get nextSpin() { return D[this._o + 30]; } set nextSpin(v) { D[this._o + 30] = v; }
      get settleT() { return D[this._o + 31]; } set settleT(v) { D[this._o + 31] = v; }
      get groundGoal() { const v = D[this._o + 32]; return v !== v ? null : v; } set groundGoal(v) { D[this._o + 32] = v == null ? NaN : v; }
      get wanderA() { return D[this._o + 33]; } set wanderA(v) { D[this._o + 33] = v; }
      get wanderMul() { return D[this._o + 34]; } set wanderMul(v) { D[this._o + 34] = v; }
      get ring() { return D[this._o + 35]; } set ring(v) { D[this._o + 35] = v; }
      get zPref() { return D[this._o + 36]; } set zPref(v) { D[this._o + 36] = v; }
      get zGoal() { return D[this._o + 37]; } set zGoal(v) { D[this._o + 37] = v; }
      get zGoalHost() { const v = D[this._o + 38]; return v !== v ? null : v; } set zGoalHost(v) { D[this._o + 38] = v == null ? NaN : v; }
      get seed() { return D[this._o + 39]; } set seed(v) { D[this._o + 39] = v; }
      get tuckGoal() { const v = D[this._o + 40]; return v !== v ? null : v; } set tuckGoal(v) { D[this._o + 40] = v == null ? NaN : v; }
      get dashAng() { const v = D[this._o + 41]; return v !== v ? null : v; } set dashAng(v) { D[this._o + 41] = v == null ? NaN : v; }
      get _tg() { return D[this._o + 42]; } set _tg(v) { D[this._o + 42] = v; }
      get _ig() { return D[this._o + 43]; } set _ig(v) { D[this._o + 43] = v; }
      get _lsx() { return D[this._o + 44]; } set _lsx(v) { D[this._o + 44] = v; }
      get _lsy() { return D[this._o + 45]; } set _lsy(v) { D[this._o + 45] = v; }
      get _lst() { return D[this._o + 46]; } set _lst(v) { D[this._o + 46] = v; }
      get bestD() { return D[this._o + 47]; } set bestD(v) { D[this._o + 47] = v; }
      get chaseT() { return D[this._o + 48]; } set chaseT(v) { D[this._o + 48] = v; }
      get ignoreT() { return D[this._o + 49]; } set ignoreT(v) { D[this._o + 49] = v; }
      get stalkT() { return D[this._o + 50]; } set stalkT(v) { D[this._o + 50] = v; }
      get sightMul() { return D[this._o + 51]; } set sightMul(v) { D[this._o + 51] = v; }
      get _bid() { return D[this._o + 52]; } set _bid(v) { D[this._o + 52] = v; }
      get _cf() { return D[this._o + 53]; } set _cf(v) { D[this._o + 53] = v; }
      get _stx() { return D[this._o + 54]; } set _stx(v) { D[this._o + 54] = v; }
      get _sty() { return D[this._o + 55]; } set _sty(v) { D[this._o + 55] = v; }
      get _holds() { return D[this._o + 56]; } set _holds(v) { D[this._o + 56] = v; }
      get _hk() { return D[this._o + 57]; } set _hk(v) { D[this._o + 57] = v; }
      get _wfx() { return D[this._o + 58]; } set _wfx(v) { D[this._o + 58] = v; }
      get _wfy() { return D[this._o + 59]; } set _wfy(v) { D[this._o + 59] = v; }
      get _wcr() { return D[this._o + 60]; } set _wcr(v) { D[this._o + 60] = v; }
      get _wth() { return D[this._o + 61]; } set _wth(v) { D[this._o + 61] = v; }
      get _wdash() { return D[this._o + 62]; } set _wdash(v) { D[this._o + 62] = v; }
      get _on() { return D[this._o + 63]; } set _on(v) { D[this._o + 63] = v; }
      get _cb() { return D[this._o + 64]; } set _cb(v) { D[this._o + 64] = v; }
      get _hd() { return D[this._o + 65]; } set _hd(v) { D[this._o + 65] = v; }
      get struggleT() { return D[this._o + 66]; } set struggleT(v) { D[this._o + 66] = v; }
      get struggleT0() { return D[this._o + 67]; } set struggleT0(v) { D[this._o + 67] = v; }
      get tryT() { return D[this._o + 68]; } set tryT(v) { D[this._o + 68] = v; }
      get escMul() { return D[this._o + 69]; } set escMul(v) { D[this._o + 69] = v; }
      // what it hunts and what it ignores: a creature the engine holds is kept as its slot; anything else (one that has left the list, or an
      // object of a host's) is kept here and marked -2. ref() and unref() keep the slots right as creatures leave and rejoin the list.
      get target() { const t = D[this._o + 42]; return t >= 0 ? owners[t] : t === -2 ? this._tgo : null; }
      set target(v) { const o = this._o; if (v == null) { D[o + 42] = -1; this._tgo = null; } else if (v._s >= 0 && owners[v._s] === v) { D[o + 42] = v._s; this._tgo = null; } else { D[o + 42] = -2; this._tgo = v; } }
      get ignore() { const t = D[this._o + 43]; return t >= 0 ? owners[t] : t === -2 ? this._igo : null; }
      set ignore(v) { const o = this._o; if (v == null) { D[o + 43] = -1; this._igo = null; } else if (v._s >= 0 && owners[v._s] === v) { D[o + 43] = v._s; this._igo = null; } else { D[o + 43] = -2; this._igo = v; } }
      // who holds it and what it holds: slots, as for target
      get caught() { const t = D[this._o + 64]; return t >= 0 ? owners[t] : t === -2 ? this._cbo : null; }
      set caught(v) { const o = this._o; if (v == null) { D[o + 64] = -1; this._cbo = null; } else if (v._s >= 0 && owners[v._s] === v) { D[o + 64] = v._s; this._cbo = null; } else { D[o + 64] = -2; this._cbo = v; } }
      get holding() { const t = D[this._o + 65]; return t >= 0 ? owners[t] : t === -2 ? this._hdo : null; }
      set holding(v) { const o = this._o; if (v == null) { D[o + 65] = -1; this._hdo = null; } else if (v._s >= 0 && owners[v._s] === v) { D[o + 65] = v._s; this._hdo = null; } else { D[o + 65] = -2; this._hdo = v; } }
      // where it last saw what it lost: a view onto its row (so `lastSeen.t -= dt` lands there), or null
      get lastSeen() { return D[this._o + 46] !== D[this._o + 46] ? null : (this._lsv || (this._lsv = new LastSeen(this))); }
      set lastSeen(v) { const o = this._o; if (v == null) D[o + 46] = NaN; else { D[o + 44] = v.x; D[o + 45] = v.y; D[o + 46] = v.t; } }
    }
    class LastSeen {
      constructor(f) { this.f = f; }
      get x() { return D[this.f._o + 44]; } set x(v) { D[this.f._o + 44] = v; }
      get y() { return D[this.f._o + 45]; } set y(v) { D[this.f._o + 45] = v; }
      get t() { return D[this.f._o + 46]; } set t(v) { D[this.f._o + 46] = v; }
    }
    // the hunt's references that are objects, not numbers
    const REFS = ['target', 'ignore', 'lastSeen', 'caught', 'holding'];
    // the reference fields kept as slots, with the property that holds the object when it is not one the engine holds
    const SLOTREFS = [[42, '_tgo', 'target'], [43, '_igo', 'ignore'], [64, '_cbo', 'caught'], [65, '_hdo', 'holding']];
    function slotNew() { const s = freeSlots.length ? freeSlots.pop() : slotTop++; eg.reserve(slotTop); liveSlots++; return s; }
    function fishNew() { const s = slotNew(), f = new Fish(s); owners[s] = f; D.fill(NaN, s * ROW, s * ROW + ROW); eg.croll.fill(0, s * 20, s * 20 + 20); return f; }   // a fresh row: every field unset
    function adopt(f) {
      const vals = FIELDS.map((name) => f[name]), sp = f.sp, ch = f.chain, cz = f.cz, cr = f.croll, refs = REFS.map((name) => f[name]);
      if (!(f instanceof Fish)) Object.setPrototypeOf(f, Fish.prototype);
      for (const name of FIELDS) delete f[name];
      for (const name of REFS) delete f[name];
      delete f.sp; delete f.chain; delete f.cz; delete f.croll;
      if (f._tgo === undefined) { f._tgo = null; f._igo = null; f._lsv = null; f._cbo = null; f._hdo = null; }
      const s = slotNew(); f._s = s; f._o = s * ROW; f._cg = -1; owners[s] = f;
      D.fill(NaN, s * ROW, s * ROW + ROW);
      for (let k = 0; k < FIELDS.length; k++) { const v = vals[k]; D[s * ROW + k] = v == null && NULLABLE.has(FIELDS[k]) ? NaN : v; }
      eg.sp[s] = sp;
      if (ch) eg.chain.set(ch, s * 40); else eg.chain.fill(0, s * 40, s * 40 + 40);
      if (cz) eg.cz.set(cz, s * 20); else eg.cz.fill(0, s * 20, s * 20 + 20);
      if (cr) eg.croll.set(cr, s * 20); else eg.croll.fill(0, s * 20, s * 20 + 20);
      f.target = refs[0]; f.ignore = refs[1]; f.lastSeen = refs[2] ? { x: refs[2].x, y: refs[2].y, t: refs[2].t } : null; f.caught = refs[3]; f.holding = refs[4];
      // whoever was hunting, ignoring, holding or held by it while it was away holds it again by its slot
      for (let s2 = 0; s2 < slotTop; s2++) { const o = owners[s2]; if (!o || o === f) continue; for (const [k, obj, name] of SLOTREFS) if (D[o._o + k] === -2 && o[obj] === f) o[name] = f; }
    }
    function detach(f) {
      const s = f._s, own = (name, value) => Object.defineProperty(f, name, { value, writable: true, enumerable: true, configurable: true });
      for (let k = 0; k < FIELDS.length; k++) { const v = D[s * ROW + k]; own(FIELDS[k], v !== v && NULLABLE.has(FIELDS[k]) ? null : v); }
      own('sp', eg.sp[s]); own('chain', eg.chain.slice(s * 40, s * 40 + 40)); own('cz', eg.cz.slice(s * 20, s * 20 + 20)); own('croll', eg.croll.slice(s * 20, s * 20 + 20));
      const ls = D[s * ROW + 46] === D[s * ROW + 46] ? { x: D[s * ROW + 44], y: D[s * ROW + 45], t: D[s * ROW + 46] } : null;
      own('target', f.target); own('ignore', f.ignore); own('lastSeen', ls); own('caught', f.caught); own('holding', f.holding);
      f._s = -1; owners[s] = null; freeSlots.push(s); liveSlots--;
    }
    function sync() {
      const n = fish.length; stamp++;
      eg.reserveList(n, solids.length);
      for (let i = 0; i < n; i++) { const f = fish[i]; if (!(f._s >= 0)) adopt(f); f._st = stamp; }
      if (liveSlots !== n) {
        const gone = [];
        for (let s = 0; s < slotTop; s++) { const o = owners[s]; if (o && o._st !== stamp) { gone[s] = o; detach(o); } }
        // whoever was hunting or ignoring one that left now holds it as an object, so its slot can go to another
        if (gone.length) for (let s = 0; s < slotTop; s++) {
          const o = owners[s]; if (!o) continue;
          for (const [k, obj] of SLOTREFS) { const t = D[o._o + k]; if (t >= 0 && gone[t]) { D[o._o + k] = -2; o[obj] = gone[t]; } }
        }
      }
      // what the engine's steering needs to know of each that only the page can say: its behaviour, a hand on it, a host's flags, a catch held
      const personal = cfg.beh === 'on';
      for (let i = 0; i < n; i++) {
        const f = fish[i], b = personal ? (f.beh || SPECIES[f.sp].beh) : RT.PLAIN, st = f.steer, o = f._o;
        const bid = bidOf(b);
        D[o + 52] = bid; D[o + 53] = (f.hunter ? 1 : 0) | (f.guest ? 2 : 0) | (st ? 4 : 0) | (st && st.keep ? 8 : 0) | (f.maw ? 16 : 0);
        D[o + 54] = st ? st.x : 0; D[o + 55] = st ? st.y : 0; D[o + 56] = f.holding ? 1 : 0;
      }
      const ord = eg.ord, skip = eg.skip;
      for (let i = 0; i < n; i++) { const f = fish[i], s = f._s; ord[i] = s; skip[s] = (f.dead ? 1 : 0) | (f.caught ? 2 : 0); }
      eg.io[10] = n; eg.io[11] = hooks.lurers.length ? 1 : 0;
      egN = n;
    }
    // after something that can kill, free, hold or add creatures mid-step, or change what one is: all of it again
    function resync() { sync(); }
    // what each species' swim gives its creatures, for the engine (rewritten each step: a host may retune a species)
    function speciesSync() {
      const S = SPECIES.length; if (eg.nSpecies !== S) eg.setSpecies(S);
      const T = eg.species;
      for (let i = 0; i < S; i++) { const sp = SPECIES[i], sw = sp.swim, o = i * 10; T[o] = sw.sep; T[o + 1] = sw.len; T[o + 2] = sw.speed; T[o + 3] = sw.waves; T[o + 4] = sw.bend; T[o + 5] = sp.wing || 0; T[o + 6] = isPredator[i] ? 1 : 0; T[o + 7] = sp.predators.size ? 1 : 0; T[o + 8] = sp.hostSet.size ? 1 : 0; T[o + 9] = sp.preySet.size ? 1 : 0; }
    }
    // The neighbour pass of steering in the engine (world.rs `neighbours`, which is the neighbour loop of phSteer, operation for operation).
    // It reads the creatures where they live, so it sees what they are now; only who is dead or held is kept for it here (sync, resync).
    // A bite stays here: the engine asks nbHost whether a neighbour in reach is food, and has it do the biting.
    let nbF = null, nbB = null;
    // Fear, culled. Every creature used to weigh every hunter in the tank, which grows with the square of the population. A hunter can only
    // matter within a known distance: three neighbour radii for one that chases, its sting's reach from the furthest point of its body for one
    // that stings, its lure's reach for one that lures. hunterCache() notes each hunter's place and those distances once, and steering skips a
    // hunter beyond them before doing anything else with it. A skipped hunter would have done nothing, so the tank plays out the same
    // (EcologySim.CULL = false weighs them all again, to check that). hDirty: something moved, resized or changed a hunter mid-step.
    const HX = [], HY = [], HK = [], HA = [], HB = [];
    let hDirty = true;
    // the hunters have changed since they were noted: also told to the engine's steering, which asks for them to be noted again only then
    function setDirty() { hDirty = true; if (eg) eg.io[9] = 1; }
    // with the engine on, the same notes go to it (fear.rs), and it answers through a grid: only the hunters near a creature are looked at at all
    const ef = eg ? new window.EcoEngine.Fear() : null;
    // ... and weighs them too (fear.rs `weigh`, which is the fear loop of phSteer below, operation for operation). It asks fearHost only what
    // it cannot know: whether the host's food web says this creature fears that hunter, and whether a mimic passes for its kind.
    let fearF = null, fearHunters = null;
    // i: the place of the creature asking, or 4294967295 when the page called weigh itself for fearF
    const asker = (i) => (i === 4294967295 ? fearF : fish[i]);
    const fearHost = { fears: (i, k) => (hooks.fears(asker(i), fearHunters[k]) ? 1 : 0), mimics: (i, k) => (fearHunters[k].mimic.has(asker(i).sp) ? 1 : 0) };
    if (ef) { const S = SPECIES.length; ef.setSpecies(S); for (let a = 0; a < S; a++) for (const hsp of SPECIES[a].predators) ef.predators[a * S + hsp] = 1; }
    function hunterCache(hunters) {
      hDirty = false; if (eg) eg.io[9] = 0;
      for (let k = 0; k < hunters.length; k++) {
        const h = hunters[k], hb = h.beh || SPECIES[h.sp].beh, hl = bodyLen(h);
        HX[k] = h.x; HY[k] = h.y;
        if (hb.sting) {   // it stings along its body: the furthest its body reaches from its head, plus the sting
          let ext = 0; for (let q = 0; q < K; q += 3) ext = Math.max(ext, Math.hypot(h.x - h.chain[q * 2], h.y - h.chain[q * 2 + 1]));
          HK[k] = 1; HA[k] = hl * 0.12 * hb.sting + ext; HB[k] = 0;
        } else if (hb.lure) { HK[k] = 2; HA[k] = hb.lure * hl; HB[k] = hl * 0.35; }
        else { HK[k] = 0; HA[k] = 0; HB[k] = 0; }
      }
      if (ef) {
        const n = hunters.length; ef.reserve(n);
        for (let k = 0; k < n; k++) {
          const h = hunters[k], hb = h.beh || SPECIES[h.sp].beh;
          ef.x[k] = HX[k]; ef.y[k] = HY[k]; ef.kind[k] = HK[k]; ef.a[k] = HA[k]; ef.b[k] = HB[k];
          ef.sp[k] = h.sp; ef.hl[k] = bodyLen(h); ef.sting[k] = hb.sting || 0; ef.lure[k] = hb.lure || 0; ef.ang[k] = h.ang; ef.dashT[k] = h.dashT; ef.alert[k] = h.alert; ef.cloak[k] = h.cloak; ef.mimic[k] = h.mimic ? 1 : 0;
          for (let q = 0, o = k * 14; q < K; q += 3, o += 2) { ef.body[o] = h.chain[q * 2]; ef.body[o + 1] = h.chain[q * 2 + 1]; }
          h._hk = k; if (eg) ef.hs[k] = h._s >= 0 ? h._s : -1;
        }
        ef.build(n, 3 * ph.R);
      }
    }
    const biteAny = (f, b) => !!(b.graze || b.spinCatch || !b.dash || f.dashT > 0 || f.hunter);
    const nbHost = {
      edible: (i, j) => (edible(fish[i], fish[j]) ? 1 : 0),
      bite(i, j) {
        const f = fish[i], o = fish[j], b = ph.personal ? (f.beh || SPECIES[f.sp].beh) : RT.PLAIN;
        const confusion = Math.min(0.7, eg.density[j] * 0.05);
        if (confusion > 0 && RND() < confusion) return biteAny(f, b) ? 1 : 0;
        biteDo(f, o, b);
        resync();
        return biteAny(f, b) ? 1 : 0;
      },
    };
    // what a bite does: a grazer or a spinner swallows it there; anything else takes hold of it, unless a host's onCatch says no
    function biteDo(f, o, b) {
      setDirty();
      if (b.graze || b.spinCatch) {
        o.dead = true; f.full = b.rest * mealRestMul(f, o); f.dashT = 0; f.gulp = 1; f.target = null;
        f.meals = (f.meals || 0) + 1;
        if (o.holding) { o.holding.caught = null; o.holding = null; }
        tally[f.sp].eaten++; tally[o.sp].lost++;
        pressure[o.sp] = Math.min(6, pressure[o.sp] + 1);
        if (hooks.onMeal) hooks.onMeal(f, o);
      } else if (hooks.onCatch && hooks.onCatch(f, o) === false) {
        f.target = null; f.dashT = 0;
      } else {
        o.caught = f; o.struggleT = o.struggleT0 = struggleDur(o, f);
        f.holding = o; f.dashT = 0; f.target = null;
        f.meals = (f.meals || 0) + 1;
      }
    }
    const gridKey = (gx, gy) => (gx + 8192) * 16384 + (gy + 8192);

    function tankW() { return bounds.w; }
    function tankH() { return bounds.h; }
    function tankDepth() { return Math.max(60, Math.min(bounds.w, bounds.h) * 0.9 * cfg.dz); }

    // solids: discs { x, y, r, zTop } and slabs { x0, y0, x1, y1, r (half thickness), zTop }; zTop is the depth of the top (0 the surface)
    // hooks: a host's own rules on top of the tank's (ecology-diet.js sets these). All optional.
    //   onMeal(pred, prey)  something was eaten      canEat(pred, prey) -> false: not prey for this one right now
    //   onCatch(pred, prey) -> false: the bite fails  onSpawn(f)  a new arrival
    //   eats(pred, prey) -> true | false | undefined   a creature's own menu in place of its species' (with f.hunter)
    //   fears(prey, hunter) -> true: this hunter is one to run from, though its species is not on the prey's list
    //   lurers: [fish]  individuals whose light draws the smallest prey (beside the species that lure by nature)
    //   lowland: 0..1  the share of the tank (by each creature's zPref) that lives just above the floor, within reach of a walker
    // A creature may carry f.beh, its own behaviour in place of its species' (an object whose prototype is the species' beh),
    // and f.escMul, a multiplier on its chance to twist out of a hold.
    const hooks = { lurers: [] };
    // is o food for f: a host may answer for a creature outright (hooks.eats -> true | false; undefined: the species' own menu,
    // then hooks.canEat). A creature with f.hunter hunts even if its species has no menu.
    function edible(f, o) { const e = hooks.eats ? hooks.eats(f, o) : undefined; return e !== undefined ? e : SPECIES[f.sp].preySet.has(o.sp) && (!hooks.canEat || hooks.canEat(f, o)); }
    const solids = [], _sn = { d: 0, nx: 1, ny: 0 };
    function solidNear(so, x, y) {   // distance from the solid's centre line, and the way out
      let qx = so.x, qy = so.y;
      if (so.x1 != null) { const ex = so.x1 - so.x0, ey = so.y1 - so.y0, l2 = ex * ex + ey * ey; let u = l2 ? ((x - so.x0) * ex + (y - so.y0) * ey) / l2 : 0; u = Math.max(0, Math.min(1, u)); qx = so.x0 + ex * u; qy = so.y0 + ey * u; }
      const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
      _sn.d = d; if (d > 1e-6) { _sn.nx = dx / d; _sn.ny = dy / d; } else { _sn.nx = 1; _sn.ny = 0; }
    }
    let simT = 0;   // the sim's own seconds (every wobble that used the wall clock reads this, so a run replays)
    function bodyLen(f) { return cfg.size * f.scale * f.depth * SPECIES[f.sp].swim.len; }
    function segLen(f) { return bodyLen(f) / (K - 1); }
    function resetChain(f) {
      const L = segLen(f), dx = -Math.cos(f.ang), dy = -Math.sin(f.ang);
      for (let i = 0; i < K; i++) { f.chain[i * 2] = f.x + dx * L * i; f.chain[i * 2 + 1] = f.y + dy * L * i; }
    }
    function initMood(f) {
      Object.assign(f, { dashT: 0, cool: rand(0, 3), nextDash: rand(2, 9), target: null, stalkT: 0, tuck: 0, turnS: 0, puff: 0, alert: 0,
        cloak: 0, glide: 0, flap: 1, full: 0, gulp: 0, alarm: 0, fleeX: 0, fleeY: 0, dead: false, noRespawn: false, host: null, zGoalHost: null, pulseT: rand(0, 2), spinT: 0, nextSpin: rand(6, 16),
        caught: null, struggleT: 0, struggleT0: 0, holding: null,
        // walking and swimming (beh.amphi): ground 1 = walking the floor on its legs, 0 = swimming
        ground: amphiOf(f) && amphiOf(f).home === 'ground' ? 1 : 0, groundGoal: null, settleT: rand(2, 8),
        // the hunt: how long this chase has run, where the prey was last seen, a prey it has given up on
        chaseT: 0, lastSeen: null, ignore: null, ignoreT: 0, tryT: 0 });
    }
    function amphiOf(f) { const b = f.beh || (SPECIES[f.sp] && SPECIES[f.sp].beh); return b && b.amphi || null; }
    // a depth (0 surface .. 1 floor) as a share of the species' own band: zPref is where in its band it likes to swim
    function bandFrac(spi, z) { const b = ((SPECIES[spi] || {}).beh || {}).z || [0, 1]; return Math.max(0, Math.min(1, (z - b[0]) / Math.max(1e-3, b[1] - b[0]))); }
    function spawn(spi, near, edge) {
      let ang = near ? near.ang + rand(-0.4, 0.4) : rand(0, Math.PI * 2);
      let x = near ? near.x + rand(-80, 80) : rand(0, tankW()), y = near ? near.y + rand(-80, 80) : rand(0, tankH() * 0.75);
      if (edge) {
        const side = Math.floor(RND() * 4);
        x = side === 0 ? -40 : side === 1 ? tankW() + 40 : rand(0, tankW()); y = side === 2 ? -40 : side === 3 ? tankH() * 0.75 + 40 : rand(0, tankH() * 0.7);
        ang = Math.atan2(tankH() * 0.35 - y, tankW() / 2 - x) + rand(-0.6, 0.6);
      }
      const f = Object.assign(eg ? fishNew() : { chain: new Float32Array(K * 2), cz: new Float32Array(K), croll: new Float32Array(K) }, {
        x, y, fade: edge ? 0 : 1,
        vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, ang,
        phase: rand(0, 10), scale: rand(0.65, 1.3), seed: rand(0, 100), wanderA: rand(0, 6.28),
        sightMul: rand(0.8, 1.25), boldness: rand(0.75, 1.3), wanderMul: rand(0.7, 1.4),
        ring: Math.sqrt(RND()), sp: spi, z: RND(), zPref: RND(), darkRoll: RND(), depth: 1, dir: 1,
        meals: 0
      });
      // a host that knows the place (EcologyHabitat) picks where a newborn lives: hooks.place(species, edge) -> { x, y, z } | null.
      // A respawn placed this way fades in where it lives instead of swimming in from the edge
      if (!near && hooks.place) { const q = hooks.place(spi, edge); if (q) { f.x = q.x; f.y = q.y; if (q.z != null) { f.z = q.z; f.zPref = bandFrac(spi, q.z); } if (edge) { f.fade = 0; f.vx *= 0.3; f.vy *= 0.3; } } }
      f.cz.fill(f.z * tankDepth());
      initMood(f);
      resetChain(f);
      if (hooks.onSpawn) hooks.onSpawn(f);
      return f;
    }
    function desired() {
      const want = SPECIES.map(() => 0);
      if (cfg.species !== 'mixed') { want[SPECIES.findIndex(s => s.key === cfg.species)] = Math.max(6, Math.round(cfg.count / 5)); return want; }
      SPECIES.forEach((sp, i) => { want[i] = Math.round((pop[sp.key] ?? 4) * cfg.count / RT.POP_TOTAL); });
      return want;
    }
    function setCount() {
      const want = desired(), have = SPECIES.map(() => 0), kept = (f) => f.hidden || f.maw || f.brood || f.mawEgg || f.caught || f.holding;   // walkers' and the Maw's hidden bodies, a brood, a host, a creature mid-catch: never counted, never cut
      for (const f of fish) if (!kept(f)) have[f.sp]++;
      for (const p of pending) have[p.sp]++;
      SPECIES.forEach((_, i) => {
        while (have[i] > want[i]) {
          const pi = pending.findIndex(p => p.sp === i);
          if (pi >= 0) pending.splice(pi, 1);
          else { const fi = fish.findIndex(f => f.sp === i && !kept(f)); if (fi < 0) break; fish.splice(fi, 1); }
          have[i]--;
        }
        while (have[i] < want[i]) {
          const kin = fish.filter(f => f.sp === i), near = kin.length && RND() < 0.7 ? kin[Math.floor(RND() * kin.length)] : null;
          fish.push(spawn(i, near, false)); have[i]++;
        }
      });
    }
    function trail3D(f, dt, sp) {
      const TD = tankDepth(), k = Math.max(0, Math.min(1, sp * dt / Math.max(1, segLen(f)) * 1.2));
      const wing = SPECIES[f.sp].wing || 0;
      const rollGoal = Math.max(-1.1, Math.min(1.1, -f.turnS * cfg.bank * (1 + 0.6 * wing) * 1.3));
      const maxSpanDz = bodyLen(f) * 1.2;
      f.cz[0] = f.z * TD;
      f.croll[0] += (rollGoal - f.croll[0]) * Math.min(1, dt * 5);
      for (let i = 1; i < K; i++) {
        f.cz[i] += (f.cz[i - 1] - f.cz[i]) * k;
        const d = f.cz[i] - f.cz[0];
        if (d > maxSpanDz) f.cz[i] = f.cz[0] + maxSpanDz; else if (d < -maxSpanDz) f.cz[i] = f.cz[0] - maxSpanDz;
        f.croll[i] += (f.croll[i - 1] - f.croll[i]) * k;
      }
    }
    function followChain(f) {
      const c = f.chain, L = segLen(f), maxBend = cfg.flex * DEG * SPECIES[f.sp].swim.bend * 11 / (K - 1);
      c[0] = f.x; c[1] = f.y;
      let prevAng = Math.atan2(-f.vy, -f.vx);
      for (let i = 1; i < K; i++) {
        const px = c[(i - 1) * 2], py = c[(i - 1) * 2 + 1];
        let a = Math.atan2(c[i * 2 + 1] - py, c[i * 2] - px);
        let d = Math.atan2(Math.sin(a - prevAng), Math.cos(a - prevAng));
        if (d > maxBend) a = prevAng + maxBend; else if (d < -maxBend) a = prevAng - maxBend;
        c[i * 2] = px + Math.cos(a) * L; c[i * 2 + 1] = py + Math.sin(a) * L;
        prevAng = a;
      }
    }
    function dropCarcass(x, y, z) { carcasses.push({ x, y, z, life: 20 }); }
    function stepCarcasses(dt) {
      for (const c of carcasses) { c.z = Math.min(1, c.z + dt * 0.05); c.life -= dt; }
      carcasses = carcasses.filter(c => c.life > 0);
    }
    function eatCarcasses() {
      for (const f of fish) {
        if (f.dead || !CARCASS_EATER_IDX.has(f.sp) || !carcasses.length) continue;
        const reach = bodyLen(f) * 0.45;
        for (let i = carcasses.length - 1; i >= 0; i--) {
          const c = carcasses[i], dx = c.x - f.x, dy = c.y - f.y, dz = (c.z - f.z) * cfg.dz;
          if (dx * dx + dy * dy < reach * reach && Math.abs(dz) < 0.3) {
            carcasses.splice(i, 1); f.meals = (f.meals || 0) + 1; f.gulp = 1; f.full = Math.max(f.full, 1);
            break;
          }
        }
      }
    }
    function pickTier1() {
      const total = TIER1_W.reduce((a, b) => a + b, 0);
      let r = RND() * total;
      for (let i = 0; i < TIER1_IDX.length; i++) { r -= TIER1_W[i]; if (r <= 0) return TIER1_IDX[i]; }
      return TIER1_IDX[TIER1_IDX.length - 1];
    }
    function applyEvolutions() {
      for (const f of fish) {
        if (f.dead) continue;
        const ev = EVOLVE_IDX[f.sp];
        if (!ev || f.meals < ev.meals) continue;
        if (!ev.next.length) {
          f.dead = true; f.noRespawn = true; dropCarcass(f.x, f.y, f.z);
          const n = 2 + Math.floor(RND() * 3);
          for (let i = 0; i < n; i++) pending.push({ sp: pickTier1(), t: rand(1, 4) });
          continue;
        }
        const oldSp = f.sp;
        f.sp = ev.next[Math.floor(RND() * ev.next.length)];
        f.meals = 0; f.fade = 0; f.scale *= 1.08;
        pending.push({ sp: oldSp, t: rand(4, 10) });
      }
    }
    function struggleDur(prey, pred) { return rand(1.1, 1.8) * Math.max(0.35, Math.min(1.4, bodyLen(prey) / Math.max(1, bodyLen(pred)) + 0.3)); }
    // a caught creature twists free: it bolts away, the hunter is left with nothing and needs a moment
    function breakFree(prey, pred) {
      prey.caught = null; prey.alarm = 1; prey.cool = 1.5;
      const a = pred ? Math.atan2(prey.y - pred.y, prey.x - pred.x) : prey.ang;
      prey.dashT = 0.7; prey.dashAng = a; prey.fleeX = Math.cos(a); prey.fleeY = Math.sin(a);
      if (pred) { pred.holding = null; pred.cool = 2.5; pred.target = null; pred.ignore = prey; pred.ignoreT = 4; }
      tally[prey.sp].escaped++;
    }
    function mealRestMul(pred, prey) { return Math.max(0.4, Math.min(2.2, bodyLen(prey) / Math.max(1, bodyLen(pred)) * 1.6 + 0.4)); }
    function finishCatch(prey, pred) {
      prey.dead = true; prey.caught = null;
      if (pred && !pred.dead) { pred.holding = null; pred.full = SPECIES[pred.sp].beh.rest * mealRestMul(pred, prey); pred.gulp = 1; pred.target = null; tally[pred.sp].eaten++; if (hooks.onMeal) hooks.onMeal(pred, prey); }
      if (prey.holding) { prey.holding.caught = null; prey.holding = null; }
      tally[prey.sp].lost++;
      pressure[prey.sp] = Math.min(6, pressure[prey.sp] + 1);
    }
    function stepHold(f, dt) {
      const o = f.holding;
      if (!o || o.dead || o.caught !== f) { f.holding = null; return true; }
      f.vx *= Math.max(0, 1 - dt * 6); f.vy *= Math.max(0, 1 - dt * 6);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.ang += Math.sin((simT * 1000) * 0.001 * 17 + f.seed * 5) * dt * 0.8;
      f.tuck = smooth(f.tuck, 0.6, 6, dt); f.alert = smooth(f.alert, 1, 6, dt);
      followChain(f); trail3D(f, dt, Math.hypot(f.vx, f.vy));
      if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 0.8);
      return false;
    }
    function stepStruggle(f, dt) {
      const h = f.caught;
      if (!h || h.dead) { finishCatch(f, h && !h.dead ? h : null); return; }
      f.struggleT -= dt;
      if (h.maw) {   // in the Maw's jaw: the Maw carries it at its mouth (EcologyMaw holdAt). Only the thrashing is left here, or the two pull it back and forth
        const tire = Math.max(0, f.struggleT / f.struggleT0); f.vx = f.vy = 0; f.phase += dt * 24 * (0.4 + 0.6 * tire); f.alarm = 1; f.puff = Math.min(1, (f.puff || 0) + dt * 4);
        if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 0.8); if (f.struggleT <= 0) finishCatch(f, h); return; }
      const hbl = bodyLen(h);
      // every third of a second a chance to twist free: bolder and bigger prey more often, and while fresh
      f.tryT = (f.tryT || 0) + dt;
      if (f.tryT > 0.3) {
        f.tryT = 0;
        const fresh = f.struggleT / f.struggleT0, size = Math.max(0.5, Math.min(1.5, bodyLen(f) / Math.max(1, hbl) * 1.2));
        if (RND() < 0.2 * f.boldness * size * (0.4 + 0.6 * fresh) * (f.escMul || 1)) { breakFree(f, h); return; }
      }
      const mx = h.x + Math.cos(h.ang) * hbl * 0.42, my = h.y + Math.sin(h.ang) * hbl * 0.42;
      const tire = Math.max(0, f.struggleT / f.struggleT0);
      const shakeA = hbl * 0.2 * Math.min(1, tire * 2.2);
      const sx = Math.sin((simT * 1000) * 0.001 * 33 + f.seed * 11) * shakeA, sy = Math.cos((simT * 1000) * 0.001 * 29 + f.seed * 13) * shakeA;
      f.x += (mx + sx - f.x) * Math.min(1, dt * 10); f.y += (my + sy - f.y) * Math.min(1, dt * 10);
      f.ang = Math.atan2(my - f.y, mx - f.x) + Math.sin((simT * 1000) * 0.001 * 47 + f.seed * 7) * 2.4 * tire;
      f.vx = f.vy = 0;
      f.phase += dt * 24 * (0.4 + 0.6 * tire);
      f.alarm = 1; f.puff = Math.min(1, (f.puff || 0) + dt * 4);
      followChain(f); trail3D(f, dt, 0);
      if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 0.8);
      if (f.struggleT <= 0) finishCatch(f, h);
    }
    function gridNearestFish(x, y, maxRadius, predicate) {
      const rings = Math.max(1, Math.ceil(maxRadius / gridCell));
      const gx0 = Math.floor(x / gridCell), gy0 = Math.floor(y / gridCell);
      let best = null, bd = maxRadius;
      const eO = egOK ? eg.order : null, eS = egOK ? eg.starts : null;
      for (let oy = -rings; oy <= rings; oy++) for (let ox = -rings; ox <= rings; ox++) {
        let a, q = 0, q1 = 0;
        if (eO) { const cx = gx0 + ox - eg.gx0, cy = gy0 + oy - eg.gy0; if (cx < 0 || cy < 0 || cx >= eg.cols || cy >= eg.rows) continue; a = eO; q = eS[cx + cy * eg.cols]; q1 = eS[cx + cy * eg.cols + 1]; }
        else { a = grid.get(gridKey(gx0 + ox, gy0 + oy)); if (!a) continue; q1 = a.length; }
        for (; q < q1; q++) {
          const j = a[q], o = fish[j];
          if (!o || !predicate(o)) continue;   // the grid holds indices from the last step: a count change in between can leave them past the end
          const d = Math.hypot(o.x - x, o.y - y);
          if (d < bd) { bd = d; best = o; }
        }
      }
      return best;
    }

    // The step runs as four phases over the creatures' plain data, in this order (the tank's schedule runs each as a system):
    //   sense: the neighbour grid, pressures, density.  steer: what every creature wants (forces, hunting, depth); it writes the wish to f._sc.
    //   move: velocity, turn, position, solids, chain, and the smoothed body state.  upkeep: carcasses, evolutions, deaths and births.
    const ph = {};
    function phSense(dt) {
      simT += dt;
      const bodyPx = cfg.size;
      const R = bodyPx * 1.5 * WORLD_SCALE, cell = R;
      gridCell = cell;
      const maxSp = bodyPx * 1.6 * cfg.speed, maxF = maxSp * 2.2;
      const W = tankW(), H = tankH(), margin = Math.min(140, bodyPx * 1.5);
      const personal = cfg.beh === 'on';
      egOK = false;
      if (eg) { sync(); speciesSync(); egOK = eg.sense(fish.length, cell, personal); }   // the engine's sense: the grid and the density count over the creatures where they live
      if (!egOK) {
        grid.clear();
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i], k = gridKey(Math.floor(f.x / cell), Math.floor(f.y / cell));
          let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
        }
      }
      for (let i = 0; i < pressure.length; i++) if (pressure[i] > 0) pressure[i] = Math.max(0, pressure[i] - dt * 0.12);
      const hunters = personal ? fish.filter(f => isPredator[f.sp]) : [];
      const spinners = personal ? fish.filter(f => f.spinT > 0) : [];
      let density = null;
      if (personal && egOK) density = eg.density;
      else if (personal) {
        density = new Float32Array(fish.length);
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i]; if (f.dead || f.caught) continue;
          const gx = Math.floor(f.x / cell), gy = Math.floor(f.y / cell);
          let cnt = 0;
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const a = grid.get(gridKey(gx + ox, gy + oy)); if (!a) continue;
            for (const j of a) {
              if (j === i) continue;
              const o = fish[j]; if (o.dead || o.caught || o.sp !== f.sp) continue;
              const dx = o.x - f.x, dy = o.y - f.y;
              if (dx * dx + dy * dy <= cell * cell) cnt++;
            }
          }
          density[i] = cnt;
        }
      }
      Object.assign(ph, { bodyPx, R, cell, maxSp, maxF, W, H, margin, personal, hunters, spinners, density });
    }
    // Pieces of steering that need the creatures as objects (a target, a host, a lure), shared by the JavaScript loop below and the engine's
    // steering, which calls back for them. What they add to the force, and to cruise, passes through stS.
    const stS = { fx: 0, fy: 0, cruise: 1, dashing: false };
    function steerLurers(f, bl) {
      const { maxF } = ph; let fx = stS.fx, fy = stS.fy;
      for (let li = 0; li < hooks.lurers.length; li++) {   // an individual's lure draws the smallest things (hooks.lurers)
        const h = hooks.lurers[li]; if (h === f || h.dead || h.sp === f.sp || bl > bodyLen(h) * 0.6) continue;
        const hl = bodyLen(h), lx = h.x + Math.cos(h.ang) * hl * 0.35, ly = h.y + Math.sin(h.ang) * hl * 0.35, ld = Math.hypot(lx - f.x, ly - f.y) || 1, lr = 3.5 * hl;
        if (ld < lr) { const k = 1 - ld / lr; fx += (lx - f.x) / ld * maxF * 0.7 * k; fy += (ly - f.y) / ld * maxF * 0.7 * k; }
      }
      stS.fx = fx; stS.fy = fy;
    }
    function steerHunt(f, b, spc, bl, dt) {
      const { maxSp } = ph; let fx = stS.fx, fy = stS.fy, cruise = stS.cruise; const dashing = stS.dashing;
      if ((spc.preySet.size || f.hunter) && f.full <= 0 && !b.graze && !b.spinCatch || (b.graze && f.full <= 0 && b.chase)) {
        const sight = (b.sight || 5) * bl * WORLD_SCALE * f.sightMul;
        const amH = amphiOf(f), zTol = amH ? 0.7 : 0.35;
        if (f.ignoreT > 0) { f.ignoreT -= dt; if (f.ignoreT <= 0) f.ignore = null; }
        if (f.target && (f.target.dead || f.target.caught || !fish.includes(f.target))) { f.target = null; f.lastSeen = null; }
        if (f.steer && !f.steer.keep) { f.target = null; f.lastSeen = null; }   // steered by hand: it goes where it is sent, and bites what it meets
        // out of sight: remember where it was, and go and look there
        const tracks = !!(b.amphi || b.giveUp);   // the walk-and-swim hunters remember, search and give up; the rest hunt as before
        if (f.target && Math.hypot(f.target.x - f.x, f.target.y - f.y) > sight * 1.3) { if (tracks) f.lastSeen = { x: f.target.x, y: f.target.y, t: 4 }; f.target = null; }
        // a long chase that comes to nothing: give up on that one for a while (no stalemates)
        // (the clock only runs while it is not gaining: closing in by a tenth resets it)
        if (f.target && tracks) { const dT = Math.hypot(f.target.x - f.x, f.target.y - f.y); if (!(f.bestD < dT * 1.1)) { f.bestD = dT; f.chaseT = 0; } else f.chaseT += dt;
          if (f.chaseT > (b.giveUp || 8)) { f.ignore = f.target; f.ignoreT = 8; f.target = null; f.lastSeen = null; f.cool = Math.max(f.cool, 3); tally[f.sp].gaveUp++; } }
        else f.bestD = Infinity;
        if (!f.target && !f.steer) {
          // a slow floor hunter picks prey it could reach: walking, slow, or already close
          const reachable = (o) => !amH || amH.home !== 'ground' || o.ground > 0.5 || Math.hypot(o.vx, o.vy) < maxSp * 2 || Math.hypot(o.x - f.x, o.y - f.y) < 4 * bl;
          f.target = gridNearestFish(f.x, f.y, sight, o => edible(f, o) && !o.caught && o !== f.ignore && Math.abs(o.z - f.z) * cfg.dz <= zTol && reachable(o));
          f.stalkT = 0; if (f.target) { f.chaseT = 0; f.lastSeen = null; }
        }
        if (!f.target && f.lastSeen) {
          const L = f.lastSeen, dx = L.x - f.x, dy = L.y - f.y, d = Math.hypot(dx, dy) || 1;
          L.t -= dt; fx += (dx / d * maxSp * 0.8 - f.vx) * 0.6; fy += (dy / d * maxSp * 0.8 - f.vy) * 0.6;
          if (d < bl * 0.6 || L.t <= 0) f.lastSeen = null;
        }
        const T = f.target;
        if (T) {
          const px = T.x + T.vx * 0.3, py = T.y + T.vy * 0.3, dx = px - f.x, dy = py - f.y, d = Math.hypot(dx, dy) || 1;
          if (b.chase) { fx += (dx / d * maxSp - f.vx) * b.chase; fy += (dy / d * maxSp - f.vy) * b.chase; }
          if (b.stalk) {
            const want = b.stalk * bl, k = Math.max(-1, Math.min(1, (d - want) / want));
            fx += (dx / d * maxSp * 0.6 * k + T.vx - f.vx) * 1.2; fy += (dy / d * maxSp * 0.6 * k + T.vy - f.vy) * 1.2;
            if (Math.abs(d - want) < want * 0.5) f.stalkT += dt;
            cruise = 0.6;
          }
          if (b.lure && !dashing) cruise = 0.15;
          const ready = b.dash && b.dash.mode === 'chase' && f.dashT <= 0 && f.cool <= 0 && d < b.dash.range * bl * (b.amphi && f.ground < 0.5 ? 1.6 : 1) && (!b.dash.wait || f.stalkT > b.dash.wait);
          if (ready) { f.dashT = b.dash.dur; f.dashAng = Math.atan2(dy, dx); f.stalkT = 0; }
        }
      }
      stS.fx = fx; stS.fy = fy; stS.cruise = cruise;
    }
    function steerHostBlock(f, b, spc, bl, dt) {
      const { maxSp } = ph; let fx = stS.fx, fy = stS.fy;
      if (spc.hostSet.size) {
        if (f.host && (!fish.includes(f.host) || !spc.hostSet.has(f.host.sp))) f.host = null;
        if (!f.host || RND() < dt * 0.05) {
          const best = gridNearestFish(f.x, f.y, (b.sight || 8) * bl * WORLD_SCALE * f.sightMul, o => spc.hostSet.has(o.sp));
          if (best) f.host = best;
        }
        const h = f.host;
        if (h) {
          const hl = bodyLen(h), m = (K >> 1) - 2 + Math.floor((f.seed % 1) * 4), sd = f.seed % 2 < 1 ? -1 : 1;
          const px = h.chain[m * 2], py = h.chain[m * 2 + 1], tx = h.chain[(m + 1) * 2] - px, ty = h.chain[(m + 1) * 2 + 1] - py, tl = Math.hypot(tx, ty) || 1;
          const off = 0.16 * (1 - 0.55 * (f.hide || 0));
          const gx2 = px - ty / tl * hl * off * sd, gy2 = py + tx / tl * hl * off * sd;
          const dx = gx2 - f.x, dy = gy2 - f.y, d = Math.hypot(dx, dy) || 1;
          fx += (dx / d * maxSp * Math.min(1.5, d / (bl * 0.5)) + h.vx - f.vx) * 1.6; fy += (dy / d * maxSp * Math.min(1.5, d / (bl * 0.5)) + h.vy - f.vy) * 1.6;
          f.zGoalHost = h.z;
        } else f.zGoalHost = null;
      }
      stS.fx = fx; stS.fy = fy;
    }
    // ---- steering in the engine (world.rs `steer`, which is phSteer's body, operation for operation) ----
    // Each behaviour object it meets gets a number and a row in the engine's table (world.rs B_), rewritten every step since a host may retune one.
    const behIds = new Map(), behList = [];
    function behRow(b, id) {
      const T = eg.beh, o = id * 48, d = b.dash, am = b.amphi, pu = b.pulse, sn = b.spin;
      T[o] = b.school; T[o + 1] = b.train; T[o + 2] = b.sepMul || 1; T[o + 3] = b.contagion;
      T[o + 4] = b.flee === 'bolt' ? 1 : b.flee === 'scatter' ? 2 : b.flee === 'hide' ? 3 : b.flee === 'none' ? 4 : 0;
      T[o + 5] = b.puff ? 1 : 0;
      T[o + 6] = !d ? 0 : d.mode === 'periodic' ? 1 : d.mode === 'chase' ? 2 : 3;
      T[o + 7] = d ? d.dur : 0; T[o + 8] = d && d.every ? d.every[0] : NaN; T[o + 9] = d && d.every ? d.every[1] : NaN; T[o + 10] = d ? d.cool || 0 : 0;
      T[o + 11] = !am ? 0 : am.home === 'water' ? 1 : am.home === 'ground' ? 2 : 3;
      const se = (am && am.settle) || [5, 10], ri = (am && am.rise) || [8, 16];
      T[o + 12] = se[0]; T[o + 13] = se[1]; T[o + 14] = ri[0]; T[o + 15] = ri[1];
      T[o + 16] = b.light; T[o + 17] = b.stopgo;
      T[o + 18] = pu ? 1 : 0; T[o + 19] = pu ? pu.period : 0; T[o + 20] = pu ? pu.gain : 0;
      T[o + 21] = sn ? 1 : 0; T[o + 22] = sn ? sn.dur : 0; T[o + 23] = sn ? sn.every[0] : 0; T[o + 24] = sn ? sn.every[1] : 0;
      T[o + 25] = b.vortex; T[o + 26] = b.z[0]; T[o + 27] = b.z[1]; T[o + 28] = b.dive; T[o + 29] = b.wanderRate; T[o + 30] = b.wander; T[o + 31] = b.lured || 1;
      T[o + 32] = b.graze; T[o + 33] = b.spinCatch; T[o + 34] = b.chase; T[o + 35] = b.stalk; T[o + 36] = b.lure; T[o + 37] = b.sight; T[o + 38] = b.giveUp; T[o + 39] = d ? d.range : 0; T[o + 40] = d ? d.wait : 0;
      T[o + 41] = b.speedMul || 1; T[o + 42] = d ? d.mult : 1.8; T[o + 43] = b.minSp; T[o + 44] = b.turn; T[o + 45] = b.glide; T[o + 46] = b.cloak; T[o + 47] = b.catch;
    }
    function bidOf(b) {
      let id = behIds.get(b);
      if (id === undefined) { id = behList.length; behIds.set(b, id); behList.push(b); eg.reserveTables(behList.length, vortices.length); behRow(b, id); }
      return id;
    }
    function solidsSync() {
      eg.reserveList(fish.length, solids.length);
      const SO = eg.solids;
      for (let si = 0; si < solids.length; si++) { const so = solids[si], o = si * 9; SO[o] = so.x; SO[o + 1] = so.y; SO[o + 2] = so.x0; SO[o + 3] = so.y0; SO[o + 4] = so.x1; SO[o + 5] = so.y1; SO[o + 6] = so.x1 != null ? 1 : 0; SO[o + 7] = so.r; SO[o + 8] = so.zTop; }
    }
    // the tank as this step's steering reads it, the behaviours and the whirlpools
    function steerPrep(dt) {
      const { bodyPx, R, maxSp, maxF, W, H, margin, personal } = ph;
      solidsSync();
      eg.reserveTables(behList.length, vortices.length);
      for (let k = 0; k < behList.length; k++) behRow(behList[k], k);
      const V = eg.vort, VS = eg.vortSp, S = SPECIES.length;
      for (let v = 0; v < vortices.length; v++) {
        const vv = vortices[v], o = v * 5; V[o] = vv.x; V[o + 1] = vv.y; V[o + 2] = vv.radius; V[o + 3] = vv.strength; V[o + 4] = vv.species ? 1 : 0;
        if (vv.species) for (let k = 0; k < S; k++) VS[v * S + k] = vv.species.has(k) ? 1 : 0;
      }
      const ptrOn = ptr.active && cfg.ptr !== 'ignore';
      eg.steerTank((personal ? 1 : 0) | (cfg.flow === 'vortex' ? 2 : 0) | (ptrOn ? 4 : 0) | (cfg.ptr === 'scatter' ? 8 : 0) | (hooks.fears ? 16 : 0),
        [dt, bodyPx, R, maxSp, maxF, W, H, margin, cfg.align, cfg.coh, cfg.sep, cfg.dz, cfg.size, simT, vortex.x ?? W / 2, vortex.y ?? H / 2, cfg.vradius, cfg.swirl, ptr.x, ptr.y, hooks.lowland || 0, vortices.length, solids.length, cfg.flex, cfg.bank, tankDepth()]);
    }
    // what the engine's steering asks of the page, by the place of the creature asking
    let stDt = 0, stHunters = null;
    const behOf = (f) => (ph.personal ? (f.beh || SPECIES[f.sp].beh) : RT.PLAIN);
    const steerCalls = {
      edible: (i, j) => nbHost.edible(i, j),
      bite: (i, j) => nbHost.bite(i, j),
      fearPrep() { if (hDirty) hunterCache(stHunters); },
      hunt(i) { const T = fish[i].target, P = eg.io; if (T) { P[5] = 1; P[6] = T.x; P[7] = T.y; P[8] = T.z; } else P[5] = 0; },
      hostBlock(i) { const f = fish[i], O = eg.io; stS.fx = O[0]; stS.fy = O[1]; steerHostBlock(f, behOf(f), SPECIES[f.sp], bodyLen(f), stDt); const P = eg.io; P[0] = stS.fx; P[1] = stS.fy; },
      lurers(i) { const f = fish[i], O = eg.io; stS.fx = O[0]; stS.fy = O[1]; steerLurers(f, bodyLen(f)); const P = eg.io; P[0] = stS.fx; P[1] = stS.fy; },
      dirty() { setDirty(); },
      struggle(i) { stepStruggle(fish[i], stDt); setDirty(); resync(); },
      hold(i) { const held = stepHold(fish[i], stDt); setDirty(); resync(); return held ? 1 : 0; },
      catchEnd(i, escaped) { const f = fish[i], h = f.caught; if (escaped) breakFree(f, h); else finishCatch(f, h); setDirty(); resync(); },
    };
    function phSteer(dt) {
      const { bodyPx, R, cell, maxSp, maxF, W, H, margin, personal, hunters, spinners } = ph;
      const eO = egOK ? eg.order : null, eS = egOK ? eg.starts : null, eX0 = eg ? eg.gx0 : 0, eY0 = eg ? eg.gy0 : 0, eC = eg ? eg.cols : 0, eRw = eg ? eg.rows : 0;
      const density = egOK && personal ? eg.density : ph.density;
      const useNb = !!eO;   // the neighbour pass in the engine
      const useRust = useNb && !!ef && window.EcologySim.CULL !== false;   // and the rest of steering
      steeredRust = useRust;
      if (useRust) {   // the whole loop in the engine (world.rs steer_all): what each wants lands in its row, for phMoveEngine
        steerPrep(dt); setDirty(); sync();
        fearF = null; fearHunters = hunters; stHunters = hunters; stDt = dt;
        eg.steerAll(ef, steerCalls, fearHost);
        const G = eg.gave; for (let k = 0; k < G.length; k++) if (G[k]) { tally[k].gaveUp += G[k]; G[k] = 0; }   // the hunts the engine gave up on
        return;
      }
      setDirty();
      if (eg) sync();
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i]; f._on = false;
        if (f.dead) continue;
        if (f.caught) { stepStruggle(f, dt); setDirty(); if (eg) resync(); continue; }
        if (f.holding) { const held = stepHold(f, dt); setDirty(); if (eg) resync(); if (!held) continue; }
        const spc = SPECIES[f.sp], b = personal ? (f.beh || spc.beh) : RT.PLAIN, sw = spc.swim;
        const bl = bodyLen(f);
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, zs = 0, n = 0, alX = 0, alY = 0, alN = 0, alC = 0, cx2 = 0, cy2 = 0, n2 = 0;
        const canBite = personal && (spc.preySet.size || f.hunter) && f.full <= 0 && (!b.spinCatch || f.spinT > 0);
        const reach = f.hunter ? Math.max(bl * (b.catch || 0.3), cfg.size * 0.45) : bl * (b.catch || 0.3);   // a host's hunter, however small, can reach like a body of the tank's base size
        let lead = null, leadD = 1e9;
        const gx = Math.floor(f.x / cell), gy = Math.floor(f.y / cell);
        const sp0 = Math.hypot(f.vx, f.vy) || 1;
        if (useNb) {
          if (i >= egN) sync();
          nbF = f; nbB = b;
          eg.neighbours(i, (personal ? 1 : 0) | (canBite ? 2 : 0) | (biteAny(f, b) ? 4 : 0) | (b.train ? 8 : 0), R, bodyPx, cfg.dz, cfg.size, reach, b.amphi ? 0.45 : 0.25, b.sepMul || 1, bl, sp0, nbHost);
          const O = eg.out;
          sx = O[0]; sy = O[1]; ax = O[2]; ay = O[3]; cx = O[4]; cy = O[5]; zs = O[6]; n = O[7]; alX = O[8]; alY = O[9]; alN = O[10]; alC = O[11]; cx2 = O[12]; cy2 = O[13]; n2 = O[14];
          if (O[15] >= 0) { lead = fish[O[15]]; leadD = O[16]; }
        } else
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          let a, q = 0, q1 = 0;
          if (eO) { const cx = gx + ox - eX0, cy = gy + oy - eY0; if (cx < 0 || cy < 0 || cx >= eC || cy >= eRw) continue; a = eO; q = eS[cx + cy * eC]; q1 = eS[cx + cy * eC + 1]; }
          else { a = grid.get(gridKey(gx + ox, gy + oy)); if (!a) continue; q1 = a.length; }
          for (; q < q1; q++) {
            const j = a[q];
            if (j === i) continue;
            const o = fish[j];
            if (o.dead || o.caught) continue;
            const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
            if (d2 > R * R || d2 < 1e-6) continue;
            if (canBite && edible(f, o) && d2 < reach * reach && Math.abs(o.z - f.z) * cfg.dz < (b.amphi ? 0.45 : 0.25) &&
                (b.graze || b.spinCatch || !b.dash || f.dashT > 0 || f.hunter || d2 < reach * reach * 0.36)) {
              const confusion = Math.min(0.7, density[j] * 0.05);
              if (confusion > 0 && RND() < confusion) continue;
              biteDo(f, o, b);
              continue;
            }
            const d = Math.sqrt(d2);
            const zNear = Math.max(0, 1 - Math.abs(o.z - f.z) * 4 * cfg.dz);
            if (zNear <= 0) continue;
            const SEP = bodyPx * 0.6 * (f.scale * f.depth * sw.sep + o.scale * o.depth * SPECIES[o.sp].swim.sep) * (b.sepMul || 1);
            const mx = o.chain[(K >> 1) * 2] - f.x, my = o.chain[(K >> 1) * 2 + 1] - f.y, dm = Math.hypot(mx, my) || 1;
            if (d < SEP) { const k = (1 - d / SEP) * zNear; sx -= dx / d * k * k * 2 + dx / d * k; sy -= dy / d * k * k * 2 + dy / d * k; }
            if (dm < SEP * 0.8) { const k = (1 - dm / (SEP * 0.8)) * zNear; sx -= mx / dm * k; sy -= my / dm * k; }
            if ((dx * f.vx + dy * f.vy) < -0.5 * d * sp0) continue;
            if (personal && o.sp !== f.sp && !isPredator[f.sp] && !isPredator[o.sp] && bodyLen(o) > bl * 1.3) { cx2 += o.x; cy2 += o.y; n2++; }
            if (o.sp !== f.sp) continue;
            ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; zs += o.z; n++;
            alC++; if (o.alarm > 0.05) { alX += o.fleeX * o.alarm; alY += o.fleeY * o.alarm; alN += o.alarm; }
            if (b.train && (dx * f.vx + dy * f.vy) > 0.3 * d * sp0 && d < leadD) { lead = o; leadD = d; }
          }
        }
        let fx = 0, fy = 0;
        if (n && b.school > 0) {
          const sp = Math.hypot(ax, ay) || 1;
          fx += (ax / sp * maxSp - f.vx) * cfg.align * 1.2 * b.school;
          fy += (ay / sp * maxSp - f.vy) * cfg.align * 1.2 * b.school;
          const tx = cx / n - f.x, ty = cy / n - f.y, td = Math.hypot(tx, ty) || 1;
          const huddle = 1 + 2 * f.alarm;
          fx += (tx / td * maxSp - f.vx) * cfg.coh * 0.6 * b.school * huddle;
          fy += (ty / td * maxSp - f.vy) * cfg.coh * 0.6 * b.school * huddle;
        }
        if (n2) {
          const tx2 = cx2 / n2 - f.x, ty2 = cy2 / n2 - f.y, td2 = Math.hypot(tx2, ty2) || 1;
          fx += (tx2 / td2 * maxSp - f.vx) * 0.18; fy += (ty2 / td2 * maxSp - f.vy) * 0.18;
        }
        fx += sx * maxSp * cfg.sep * 4; fy += sy * maxSp * cfg.sep * 4;
        if (f.steer) { const k = f.steer.keep ? 1.2 : 3.5; fx += (f.steer.x * maxSp * 1.4 - f.vx) * k; fy += (f.steer.y * maxSp * 1.4 - f.vy) * k; }   // a hand on it (f.steer: unit heading)
        if (lead) {
          const tx = lead.chain[(K - 1) * 2] - f.x, ty = lead.chain[(K - 1) * 2 + 1] - f.y, td = Math.hypot(tx, ty) || 1;
          fx += (tx / td * maxSp - f.vx) * b.train; fy += (ty / td * maxSp - f.vy) * b.train;
        }

        let cruise = 1, dashing = f.dashT > 0, threat = 0, flX = 0, flY = 0;
        if (personal) {
          if (spc.predators.size || hooks.fears) {
            const cull = window.EcologySim.CULL !== false, R3 = 3 * R, lured = b.lured || 1;
            if (cull && hDirty) hunterCache(hunters);
            if (cull && ef) {   // the engine finds the hunters near enough and weighs them
              fearF = f; fearHunters = hunters;
              ef.weigh(f.x, f.y, f.sp, bl, lured, (b.amphi && b.amphi.home === 'water' && f.ground > 0.5 ? 1 : 0) | (hooks.fears ? 2 : 0), R, maxF, fx, fy, fearHost);
              const Wd = ef.weighed; fx = Wd[0]; fy = Wd[1]; threat = Wd[2]; flX = Wd[3]; flY = Wd[4];
            } else
            for (let hk = 0; hk < hunters.length; hk++) {
              const h = hunters[hk];
              if (cull) {   // too far to matter, whatever it is (a little slack for rounding)
                const kind = HK[hk], far = (kind === 1 ? bl * 0.6 + HA[hk] : kind === 2 ? Math.max(R3, HA[hk] * lured + HB[hk]) : R3) * 1.001 + 1;
                const ux = f.x - HX[hk], uy = f.y - HY[hk];
                if (ux * ux + uy * uy > far * far) continue;
              }
              if (!spc.predators.has(h.sp)) { if (!hooks.fears) continue; const ex = f.x - h.x, ey = f.y - h.y; if (ex * ex + ey * ey > 9 * R * R || !hooks.fears(f, h)) continue; }   // its species' hunters, and (asked only of those near enough to matter) whatever a host says could eat this one
              if (h.mimic && h.mimic.has(f.sp)) continue;   // it looks like one of them (the Maw's mimic): no reason to run
              const dx = f.x - h.x, dy = f.y - h.y, d = Math.hypot(dx, dy) || 1, hb = h.beh || SPECIES[h.sp].beh, hl = bodyLen(h);
              if (hb.sting) {
                let dm = 1e9, qx = 0, qy = 0;
                for (let k = 0; k < K; k += 3) { const ex = f.x - h.chain[k * 2], ey = f.y - h.chain[k * 2 + 1], e = Math.hypot(ex, ey); if (e < dm) { dm = e; qx = ex; qy = ey; } }
                const Rs = bl * 0.6 + hl * 0.12 * hb.sting;
                if (dm < Rs) { const k = 1 - dm / Rs; fx += qx / (dm || 1) * maxF * 2 * k; fy += qy / (dm || 1) * maxF * 2 * k; threat = Math.max(threat, k * 0.6); flX += qx / (dm || 1) * k; flY += qy / (dm || 1) * k; }
                continue;
              }
              if (hb.lure && h.dashT <= 0) {
                const lx = h.x + Math.cos(h.ang) * hl * 0.35, ly = h.y + Math.sin(h.ang) * hl * 0.35, ld = Math.hypot(lx - f.x, ly - f.y) || 1;
                const lr = hb.lure * hl * (b.lured || 1);
                if (ld < lr) { const k = (1 - ld / lr) * (b.lured || 1); fx += (lx - f.x) / ld * maxF * 0.7 * k; fy += (ly - f.y) / ld * maxF * 0.7 * k; }
                continue;
              }
              // a swimmer walking the floor has its head down: it notices a hunter late
              const Rf = R * (h.dashT > 0 || h.alert > 0.5 ? 3 : 1.8) * (h.cloak > 0.6 ? 0.4 : 1) * (b.amphi && b.amphi.home === 'water' && f.ground > 0.5 ? 0.45 : 1);
              if (d < Rf) { const k = 1 - d / Rf; fx += dx / d * maxF * 2.2 * k; fy += dy / d * maxF * 2.2 * k; threat = Math.max(threat, k); flX += dx / d * k; flY += dy / d * k; }
            }
          }
          const fl = Math.hypot(flX, flY);
          if (fl > 0) { f.fleeX = flX / fl; f.fleeY = flY / fl; }
          f.alarm = Math.max(threat, f.alarm * Math.max(0, 1 - dt * 1.5));
          if (b.contagion && alN > 0) {
            const avg = alN / Math.max(1, alC), k = Math.min(1, avg * 1.5) * b.contagion, ll = Math.hypot(alX, alY) || 1;
            fx += alX / ll * maxF * 1.6 * k; fy += alY / ll * maxF * 1.6 * k;
            f.alarm = Math.max(f.alarm, avg * 0.6);
            if (fl === 0) { f.fleeX = alX / ll; f.fleeY = alY / ll; }
          }
          if (b.flee === 'bolt' && threat > 0.45 * f.boldness && f.cool <= 0 && f.dashT <= 0) { f.dashT = 0.6; f.dashAng = Math.atan2(f.fleeY, f.fleeX); f.cool = 2.5; }
          if (b.flee === 'scatter' && threat > 0.25 * f.boldness && f.dashT <= 0 && f.cool <= 0) { f.dashT = 0.3; f.dashAng = Math.atan2(f.fleeY, f.fleeX) + rand(-1.1, 1.1); f.cool = 0.6; }
          if (b.flee === 'hide' && threat > 0.2 * f.boldness) f.hide = 1; else f.hide = Math.max(0, (f.hide || 0) - dt);
          if (f.full > 0) { f.full -= dt; cruise *= 0.7; }
          f.gulp = Math.max(0, f.gulp - dt * 1.5);
          for (const j of spinners) {
            if (j === f || j.sp === f.sp) continue;
            const dx = j.x - f.x, dy = j.y - f.y, d = Math.hypot(dx, dy) || 1, rr = bodyLen(j) * 2.2;
            if (d < rr) { const k = 1 - d / rr; fx += (dx / d * 0.6 - dy / d) * maxF * 1.4 * k; fy += (dy / d * 0.6 + dx / d) * maxF * 1.4 * k; }
          }
          stS.fx = fx; stS.fy = fy; steerLurers(f, bl); fx = stS.fx; fy = stS.fy;
          if (b.puff && ptr.active && cfg.ptr !== 'ignore' && Math.hypot(ptr.x - f.x, ptr.y - f.y) < bodyPx * 3.5) threat = Math.max(threat, 0.8);

          stS.fx = fx; stS.fy = fy; stS.cruise = cruise; stS.dashing = dashing; steerHunt(f, b, spc, bl, dt); fx = stS.fx; fy = stS.fy; cruise = stS.cruise;
          if (b.dash && b.dash.mode === 'periodic') {
            f.nextDash -= dt;
            if (f.nextDash <= 0) { f.dashT = b.dash.dur; f.dashAng = f.ang; f.nextDash = rand(...b.dash.every); }
          }
          if (b.puff) cruise *= 1 - 0.8 * f.puff;
          // walk or swim. A floor creature lifts off to lunge at prey above the floor and to run; a
          // swimmer settles to walk now and then when nothing is after it, and swims up when something is
          const am = b.amphi;
          if (am) {
            const scared = threat > 0.3 || f.alarm > 0.5, T = f.target;
            let want;
            if (am.home === 'ground') {
              const offFloor = T && (1 - T.z) * cfg.dz > 0.12;
              want = !(scared && b.flee !== 'none') && !(dashing && (offFloor || !T)) && !(scared && b.flee === 'none' && threat > 0.6) ? 1 : 0;
              // close enough to rush it: lift off and swim the last stretch, whatever height it is at
              if (T && Math.hypot(T.x - f.x, T.y - f.y) < (offFloor ? 5 : 4) * bl) want = 0;
            } else {
              f.settleT -= dt;
              if (f.settleT <= 0) { f.groundGoal = f.groundGoal ? 0 : 1; f.settleT = rand(...(f.groundGoal ? am.settle || [5, 10] : am.rise || [8, 16])); }
              want = scared || T ? 0 : f.groundGoal ? 1 : 0;
            }
            f.ground = smooth(f.ground, want, want > f.ground ? 0.9 : 3.5, dt);
            if (f.ground > 0.5 && !dashing) cruise *= 0.55;
            else if (T && am.home === 'ground') cruise *= 2;               // the rush: off the floor and after it
          }
          if (b.light && ptr.active && cfg.ptr !== 'ignore') {
            const dx = ptr.x - f.x, dy = ptr.y - f.y, d = Math.hypot(dx, dy) || 1;
            fx += (dx / d * maxSp - f.vx) * b.light * Math.min(1, d / (bl * 0.6)); fy += (dy / d * maxSp - f.vy) * b.light * Math.min(1, d / (bl * 0.6));
          }
          if (b.stopgo && !dashing && !(b.amphi && f.ground < 0.5)) cruise *= Math.sin((simT * 1000) * 0.001 * b.stopgo * 2 + f.seed) > 0.15 ? 1 : 0.06;
          stS.fx = fx; stS.fy = fy; steerHostBlock(f, b, spc, bl, dt); fx = stS.fx; fy = stS.fy;
          if (b.pulse) {
            f.pulseT += dt;
            const pz = Math.pow(Math.max(0, Math.sin(f.pulseT * 2 * Math.PI / b.pulse.period)), 4);
            fx += Math.cos(f.ang) * maxF * b.pulse.gain * pz; fy += Math.sin(f.ang) * maxF * b.pulse.gain * pz;
            f.vx *= 1 - Math.min(0.5, dt * 1.4); f.vy *= 1 - Math.min(0.5, dt * 1.4);
            f.tuckGoal = pz;
          }
          if (b.spin) {
            f.nextSpin -= dt;
            if (f.nextSpin <= 0 && f.spinT <= 0) { f.spinT = b.spin.dur; f.nextSpin = rand(...b.spin.every); }
            if (f.spinT > 0) { f.spinT -= dt; fx += -f.vy * 14; fy += f.vx * 14; }
          }
          if (f.dashT > 0) {
            f.dashT -= dt; dashing = true;
            const a = f.dashAng ?? f.ang;
            fx += Math.cos(a) * maxF * 2.5; fy += Math.sin(a) * maxF * 2.5;
            if (f.dashT <= 0 && b.dash && b.dash.mode === 'chase') f.cool = b.dash.cool || 0;
          } else f.cool -= dt;
        }

        if (cfg.flow === 'vortex') {
          const vx0 = vortex.x ?? W / 2, vy0 = vortex.y ?? H / 2;
          const Rmax = Math.min(W, H) * 0.46 * cfg.vradius;
          const dx = f.x - vx0, dy = f.y - vy0, r = Math.hypot(dx, dy) || 1;
          const rp = Rmax * (0.12 + 0.88 * f.ring);
          const tx = -dy / r, ty = dx / r;
          const tang = maxSp * (1.25 - 0.45 * f.ring) * Math.max(0.3, cruise);
          const radial = Math.max(-1, Math.min(1, (rp - r) / (rp * 0.5))) * maxSp * 0.9;
          const dvx = tx * tang + dx / r * radial, dvy = ty * tang + dy / r * radial;
          const wv = cfg.swirl * 1.6 * b.vortex * (dashing ? 0.2 : 1);
          fx += (dvx - f.vx) * wv; fy += (dvy - f.vy) * wv;
          f.zGoal = 0.75 * (1 - Math.min(1, r / Rmax)) + 0.35 * f.zPref;
          if (personal) f.zGoal = f.zGoal * 0.4 + (b.z[0] + (b.z[1] - b.z[0]) * f.zPref) * 0.6;
        } else {
          f.zGoal = b.z[0] + (b.z[1] - b.z[0]) * f.zPref + 0.12 * Math.sin((simT * 1000) * 0.0001 + f.seed);
        }
        if (n && b.school > 0) f.zGoal = f.zGoal * 0.7 + (zs / n) * 0.3;
        if (f.target) f.zGoal = f.zGoal * 0.5 + f.target.z * 0.5;
        if (personal && f.zGoalHost != null) f.zGoal = f.zGoalHost;
        if (personal && b.dive) f.zGoal += 0.4 * f.alarm;
        if (f.ground > 0) f.zGoal = f.zGoal * (1 - f.ground) + 0.97 * f.ground;           // walking: on the floor
        if (hooks.lowland && !f.guest && f.zPref < hooks.lowland) f.zGoal = 0.945 + 0.02 * Math.sin((simT * 1000) * 0.0002 + f.seed);   // a host asked for a share of the tank to live near the floor
        const swimHunt = personal && b.amphi && f.target && f.ground < 0.5;                 // left the floor after prey: rise to it
        if (swimHunt || (f.hunter && f.target)) f.zGoal = f.target.z;                     // a host's hunter goes to its prey's depth
        f.z += (Math.min(1, Math.max(0, f.zGoal)) - f.z) * Math.min(1, dt * (f.ground > 0.5 || swimHunt || (f.hunter && f.target) ? 1.4 : 0.4));
        if (f.depth !== 1) setDirty();
        f.depth = 1;
        f.wanderA += rand(-1, 1) * dt * (b.wanderRate || 2) * f.wanderMul;
        fx += Math.cos(f.wanderA) * maxSp * b.wander; fy += Math.sin(f.wanderA) * maxSp * b.wander;
        if (f.x < margin) fx += (margin - f.x) / margin * maxF; else if (f.x > W - margin) fx -= (f.x - (W - margin)) / margin * maxF;
        if (f.y < margin) fy += (margin - f.y) / margin * maxF; else if (f.y > H - margin) fy -= (f.y - (H - margin)) / margin * maxF;
        for (let vi = 0; vi < vortices.length; vi++) {
          const v = vortices[vi], vdx = f.x - v.x, vdy = f.y - v.y, vr = Math.hypot(vdx, vdy) || 1;
          if (vr > v.radius || (v.species && !v.species.has(f.sp))) continue;
          const fall = 1 - vr / v.radius, vtx = -vdy / vr, vty = vdx / vr;
          const orbitR = v.radius * 0.45;
          const radial = Math.max(-1, Math.min(1, (orbitR - vr) / (orbitR * 0.6))) * maxSp * 0.5 * fall;
          const tang = maxSp * v.strength * fall;
          fx += vtx * tang + vdx / vr * radial; fy += vty * tang + vdy / vr * radial;
        }
        if (ptr.active && cfg.ptr !== 'ignore') {
          const dx = ptr.x - f.x, dy = ptr.y - f.y, d = Math.hypot(dx, dy) || 1, Rp = bodyPx * 3;
          if (d < Rp) {
            const k = (1 - d / Rp) * (1 - 0.8 * f.z * cfg.dz);
            if (cfg.ptr === 'scatter' && !(personal && b.light)) { fx -= dx / d * maxF * 3 * k; fy -= dy / d * maxF * 3 * k; }
            else { fx += dx / d * maxF * 0.8 * k; fy += dy / d * maxF * 0.8 * k; }
          }
        }
        // solid things in the tank (a host's towers and walls): below a solid's top, turn away from it and slide along it
        for (let si = 0; si < solids.length; si++) {
          const so = solids[si]; if (f.z < so.zTop - 0.04) continue;
          solidNear(so, f.x, f.y);
          const look = bodyPx * 2.6, gap = _sn.d - so.r; if (gap > look) continue;
          const k = 1 - Math.max(0, gap) / look, tx = -_sn.ny, ty = _sn.nx, side = (f.vx * tx + f.vy * ty) >= 0 ? 1 : -1;
          fx += (_sn.nx * 2.4 + tx * side * 1.2) * maxF * k * k; fy += (_sn.ny * 2.4 + ty * side * 1.2) * maxF * k * k;
        }
        const sc = f._sc || (f._sc = {}); sc.fx = fx; sc.fy = fy; sc.cruise = cruise; sc.dashing = dashing; sc.threat = threat; f._on = true;
        if (ef && f._hk >= 0 && hunters[f._hk] === f) ef.dashT[f._hk] = f.dashT;   // a hunter's dash is seen by those that steer after it
      }
    }
    // Movement in the Rust engine (games/the-maw/engine/src/mover.rs `move_one`, which is phMove below, operation for operation). The
    // creatures are moved where they live; all that is handed over for each is what steering wished and what its behaviour allows.
    // The column order is world.rs's MOVER. Change phMove and mover.rs together, and run tests/engine-sim.mjs.
    let steeredRust = false;
    function phMoveEngine(dt) {
      const { maxSp, maxF, personal } = ph;
      if (steeredRust) {   // steering left what each wants in its row: the engine builds the movers itself (world.rs move_all)
        steeredRust = false;
        solidsSync();
        emTank.maxSp = maxSp; emTank.maxF = maxF; emTank.personal = personal; emTank.size = cfg.size; emTank.speed = cfg.speed; emTank.bank = cfg.bank; emTank.flex = cfg.flex; emTank.depth = tankDepth();
        eg.moveAll(solids.length, dt, emTank);
        return;
      }
      eg.reserveList(fish.length, solids.length);
      const M = eg.movers, SO = eg.solids;
      let n = 0;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i]; if (!f._on || f.dead) continue;
        if (!(f._s >= 0)) { f._on = false; continue; }
        const b = personal ? (f.beh || SPECIES[f.sp].beh) : RT.PLAIN, sc = f._sc, o = n * 12;
        M[o] = f._s; M[o + 1] = (sc.dashing ? 1 : 0) | (f.target ? 2 : 0) | (b.puff ? 4 : 0) | (b.chase && b.dash ? 8 : 0) | (b.cloak ? 16 : 0) | (b.pulse ? 32 : 0);
        M[o + 2] = f.tuckGoal; M[o + 3] = sc.fx; M[o + 4] = sc.fy; M[o + 5] = sc.cruise; M[o + 6] = sc.threat;
        M[o + 7] = b.speedMul || 1; M[o + 8] = b.dash ? b.dash.mult : 1.8; M[o + 9] = b.minSp; M[o + 10] = b.turn; M[o + 11] = b.glide;
        emIdx[n++] = i;
      }
      for (let si = 0; si < solids.length; si++) { const so = solids[si], o = si * 9; SO[o] = so.x; SO[o + 1] = so.y; SO[o + 2] = so.x0; SO[o + 3] = so.y0; SO[o + 4] = so.x1; SO[o + 5] = so.y1; SO[o + 6] = so.x1 != null ? 1 : 0; SO[o + 7] = so.r; SO[o + 8] = so.zTop; }
      emTank.maxSp = maxSp; emTank.maxF = maxF; emTank.personal = personal; emTank.size = cfg.size; emTank.speed = cfg.speed; emTank.bank = cfg.bank; emTank.flex = cfg.flex; emTank.depth = tankDepth();
      eg.move(n, solids.length, dt, emTank);
      for (let k = 0; k < n; k++) fish[emIdx[k]]._on = false;
    }
    function phMove(dt) {
      if (eg) return phMoveEngine(dt);
      const { bodyPx, maxSp, maxF, personal } = ph;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i]; if (!f._on || f.dead) continue;
        const spc = SPECIES[f.sp], b = personal ? (f.beh || spc.beh) : RT.PLAIN, sw = spc.swim, sc = f._sc, bl = bodyLen(f);
        let fx = sc.fx, fy = sc.fy; const cruise = sc.cruise, dashing = sc.dashing, threat = sc.threat;
        const fm = Math.hypot(fx, fy), fcap = maxF * (dashing ? 6 : 3); if (fm > fcap) { fx *= fcap / fm; fy *= fcap / fm; }
        f.vx += fx * dt; f.vy += fy * dt;
        let sp = Math.hypot(f.vx, f.vy);
        const cap = maxSp * (0.85 + 0.3 * f.scale) * sw.speed * (b.speedMul || 1) * (dashing ? (b.dash ? b.dash.mult : 1.8) : cruise) * (1 + 0.45 * Math.min(1, threat + f.alarm * 0.5));
        const minSp = maxSp * b.minSp * (personal ? 1 : 1);
        if (sp > cap) { const k = dashing ? cap / sp : 1 - Math.min(1, dt * 3) * (1 - cap / sp); f.vx *= k; f.vy *= k; sp = Math.hypot(f.vx, f.vy); }
        if (sp < minSp) { const k = minSp / (sp || 1); f.vx *= k; f.vy *= k; sp = minSp; }
        const want = Math.atan2(f.vy, f.vx);
        let dA = wrap(want - f.ang);
        const maxTurn = b.turn * DEG * dt * (f.spinT > 0 ? 3 : 1);
        if (Math.abs(dA) > maxTurn) { dA = Math.sign(dA) * maxTurn; const a = f.ang + dA; f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp; }
        f.ang = wrap(f.ang + dA);
        f.x += f.vx * dt * f.depth; f.y += f.vy * dt * f.depth;
        // and it cannot be inside one: coming down onto the top it lands there, from the side it is put back out
        for (let si = 0; si < solids.length; si++) {
          const so = solids[si]; if (f.z <= so.zTop) continue;
          solidNear(so, f.x, f.y); if (_sn.d >= so.r) continue;
          if (f.z - so.zTop < 0.04) { f.z = so.zTop; continue; }
          const push = so.r - _sn.d; f.x += _sn.nx * push; f.y += _sn.ny * push;
          const vn = f.vx * _sn.nx + f.vy * _sn.ny; if (vn < 0) { f.vx -= vn * _sn.nx; f.vy -= vn * _sn.ny; }
        }
        followChain(f);
        trail3D(f, dt, sp);

        const turnRate = dt > 0 ? dA / dt / (Math.min(b.turn, 300) * DEG) : 0;
        f.turnS = smooth(f.turnS, Math.max(-1, Math.min(1, turnRate)), 6, dt);
        f.tuck = smooth(f.tuck, personal ? (dashing ? 1 : (f.tuckGoal || 0)) : 0, dashing ? 10 : 4, dt);
        f.puff = smooth(f.puff, personal && b.puff ? Math.min(1, threat * 1.6) : 0, threat > 0.1 ? 5 : 0.7, dt);
        f.alert = smooth(f.alert, personal && ((b.chase && b.dash && f.target) || (dashing && f.target)) ? 1 : 0, 4, dt);
        f.cloak = smooth(f.cloak, personal && b.cloak && f.target && !dashing ? 1 : 0, dashing ? 8 : 0.8, dt);
        const glideGoal = personal ? (b.glide ? b.glide * (dashing ? 0 : 1) : Math.max(0, 0.6 - sp / Math.max(1, cap)) * 0.5) : 0;
        f.glide = smooth(f.glide, glideGoal, 2, dt);
        f.flap = (1 - 0.6 * f.glide) * (1 - 0.4 * f.tuck) * (1 + 0.6 * f.puff) * (1 - 0.7 * (f.ground || 0));
        const beat = b.pulse ? 2 + 10 * (f.tuckGoal || 0) : 3 + 9 * sp / maxSp;
        f.phase += dt * beat * Math.sqrt(cfg.speed) / Math.sqrt(f.scale * Math.max(0.6, sw.len / sw.waves));
        if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 0.8);
        f._on = false;
      }
    }
    function phUpkeep(dt) {
      eatCarcasses(); applyEvolutions(); stepCarcasses(dt);
      if (fish.some(f => f.dead)) {
        for (const f of fish) if (f.dead && !f.noRespawn) pending.push({ sp: f.sp, t: rand(4, 10) * (1 + Math.min(2.5, pressure[f.sp] * 0.5)) });
        fish = fish.filter(f => !f.dead);
      }
      for (const p of pending) p.t -= dt;
      const born = pending.filter(p => p.t <= 0);
      if (born.length) { pending = pending.filter(p => p.t > 0); for (const p of born) fish.push(spawn(p.sp, null, true)); }
    }
    function step(dt) { phSense(dt); phSteer(dt); phMove(dt); phUpkeep(dt); }

    return {
      cfg, speciesRT: SPECIES, isPredator, POP_DEFAULT: RT.POP_DEFAULT, POP_TOTAL: RT.POP_TOTAL,
      get fish() { return fish; }, get carcasses() { return carcasses; }, get pending() { return pending; },
      get gridCell() { return gridCell; },
      get time() { return simT; },
      // every creature gone and the tank filled again from its population (a new place, or a seeded start)
      // every free creature gone (the walkers' and the Maw's own bodies stay), the clock and the pressures at nought: an empty place
      _empty() { const kept = (f) => f.hidden || f.maw || f.guest;
        for (const f of fish) if (!kept(f)) { if (f.caught) f.caught.holding = null; if (f.holding) f.holding.caught = null; f.caught = f.holding = null; f.dead = true; }   // whatever held one of them lets go
        fish = fish.filter((f) => kept(f) && !f.dead); pending = []; carcasses.length = 0; pressure.fill(0); simT = 0; },
      // ... and filled again from its population (a new place, or a seeded start)
      _refill() { this._empty(); setCount(); },
      pressure, tally, pop, ptr, vortex, vortices, bounds,
      _resize(vw, vh) { bounds.w = vw * WORLD_SCALE; bounds.h = vh * WORLD_SCALE; },
      _step(dt) { step(dt); },
      _phase(name, dt) { ({ sense: phSense, steer: phSteer, move: phMove, upkeep: phUpkeep })[name](dt); },
      _setSpecies(key) { cfg.species = key; fish = []; pending = []; setCount(); },
      _setCount() { setCount(); },
      _desired() { return desired(); },
      _bodyLen(f) { return bodyLen(f); },
      _nearestFish(x, y, maxRadius, predicate) { return gridNearestFish(x, y, maxRadius, predicate); },
      // one more of a species, counted and respawning like the rest, at a place (z: 0 surface .. 1 floor); it fades in (the director's)
      bandFrac, resetChain(f) { resetChain(f); f.cz.fill(f.z * tankDepth()); },
      _spawnAt(i, x, y, z) { const f = spawn(i, null, false); f.x = x; f.y = y; if (z != null) { f.z = z; f.zPref = bandFrac(i, z); f.cz.fill(z * tankDepth()); } f.fade = 0; resetChain(f); fish.push(f); return f; },
      _add(key) { const i = SPECIES.findIndex(sp => sp.key === key); if (i < 0) return null; const f = spawn(i, null, false); f.noRespawn = true; f.guest = true; fish.push(f); return f; },
      _grab(pred, prey) { if (!pred || !prey || pred.dead || prey.dead || prey.caught || pred.holding) return false; if (prey.holding) { prey.holding.caught = null; prey.holding = null; }
        prey.caught = pred; prey.struggleT = prey.struggleT0 = struggleDur(prey, pred); pred.holding = prey; pred.target = null; return true; },
      solids, hooks,
      _kill(f) { if (f.dead) return; if (f.caught) f.caught.holding = null; finishCatch(f, null); },
    };
  }

  function resize(sim, vw, vh) { sim._resize(vw, vh); }
  function step(sim, dt) { sim._step(dt); }
  // one phase of the step (sense | steer | move | upkeep), so a schedule can run them as systems; step() is all four in order
  function phase(sim, name, dt) { sim._phase(name, dt); }
  function setSpecies(sim, key) { sim._setSpecies(key); }
  function setCount(sim) { sim._setCount(); }
  function refill(sim) { sim._refill(); }
  function empty(sim) { sim._empty(); }
  function setPop(sim, popObj) { Object.assign(sim.pop, popObj); sim._setCount(); }
  function desired(sim) { return sim._desired(); }
  function bodyLen(sim, f) { return sim._bodyLen(f); }
  function nearestFish(sim, x, y, maxRadius, predicate) { return sim._nearestFish(x, y, maxRadius, predicate); }
  // A host's own creature standing in the tank: a guest of that species, which the host moves itself (set x, y, z each
  // frame) and which never respawns. The tank's hunters see it as prey of that species: watch guest.caught and guest.dead.
  function add(sim, key) { return sim._add(key); }
  function spawnAt(sim, key, x, y, z) { const i = typeof key === 'number' ? key : sim.speciesRT.findIndex((sp) => sp.key === key); return i < 0 ? null : sim._spawnAt(i, x, y, z); }
  // Something outside the tank took this creature: it dies as if eaten, and its kind respawns under the usual pressure.
  function kill(sim, f) { sim._kill(f); }
  // One creature takes hold of another now (a host's guest catching what its own creature caught): the usual struggle,
  // escape or meal follows. False if either is already held or holding.
  function grab(sim, pred, prey) { return sim._grab(pred, prey); }
  // Every hunt going on now, the ones most worth watching first: a catch (hold), then a dash, then any chase.
  // -> [{ hunter, prey, hold?, dash? }]
  function hunts(sim) {
    const out = [];
    for (const f of sim.fish) {
      if (f.dead || f.caught) continue;
      if (f.holding && !f.holding.dead) out.push({ hunter: f, prey: f.holding, hold: true });
      else if (f.target && !f.target.dead && !f.target.caught) out.push({ hunter: f, prey: f.target, dash: f.dashT > 0 });
    }
    const rank = (h) => (h.hold ? 0 : h.dash ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b));
  }
  // Solid things the creatures steer round, cannot enter, and can land on: discs { x, y, r, zTop } and slabs
  // { x0, y0, x1, y1, r, zTop } in tank units; zTop is the depth of the top, 0..1.
  function setSolids(sim, list) { sim.solids.length = 0; for (const so of list) sim.solids.push(so); }
  function setPointer(sim, x, y, active) { sim.ptr.x = x; sim.ptr.y = y; sim.ptr.active = active; }
  function setVortexAnchor(sim, x, y) { sim.vortex.x = x; sim.vortex.y = y; }
  // sim.vortices is exposed by reference (a plain array), so step()'s closure keeps seeing updates
  // only if callers mutate it in place — reassigning sim.vortices = [...] would NOT reach step().
  // This helper does the in-place clear-and-refill for you.
  function setVortices(sim, list) { sim.vortices.length = 0; for (const v of list) sim.vortices.push(v); }

  window.EcologySim = {
    CULL: true,   // steering skips hunters too far to matter (false: weighs every hunter, as it used to; the results are the same)
    phase,
    create, resize, step, setSpecies, setCount, refill, empty, setPop, desired, bodyLen, nearestFish,
    setPointer, setVortexAnchor, setVortices, add, spawnAt, kill, grab, setSolids, hunts, WORLD_SCALE, K,
  };
})();
