/* INTERACTIONS — Ecology simulation engine.
   Extracted 2026-10-31 from "tools/fish-tool/Cybernetic Ecology.html" so the full creature
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

   Depends on shared/ecology-species.js (window.EcologySpecies) being loaded first. Classic script
   (not a module), works from file://. Load order:
     <script src="../../shared/ecology-species.js"></script>
     <script src="../../shared/ecology-sim.js"></script>
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

  const WORLD_SCALE = 4;
  const K = 20;
  const DEG = Math.PI / 180;

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (v, target, rate, dt) => v + (target - v) * Math.min(1, dt * rate);
  const rand = (a, b) => a + Math.random() * (b - a);

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
    const tally = SPECIES.map(() => ({ eaten: 0, lost: 0 }));
    const pressure = SPECIES.map(() => 0);
    const pop = { ...RT.POP_DEFAULT };
    const ptr = { x: -1e4, y: -1e4, active: false };
    const vortex = { x: null, y: null };
    const vortices = [];
    const bounds = { w: 1, h: 1 };
    const grid = new Map();
    let gridCell = 1;
    const gridKey = (gx, gy) => (gx + 8192) * 16384 + (gy + 8192);

    function tankW() { return bounds.w; }
    function tankH() { return bounds.h; }
    function tankDepth() { return Math.max(60, Math.min(bounds.w, bounds.h) * 0.9 * cfg.dz); }

    function bodyLen(f) { return cfg.size * f.scale * f.depth * SPECIES[f.sp].swim.len; }
    function segLen(f) { return bodyLen(f) / (K - 1); }
    function resetChain(f) {
      const L = segLen(f), dx = -Math.cos(f.ang), dy = -Math.sin(f.ang);
      for (let i = 0; i < K; i++) { f.chain[i * 2] = f.x + dx * L * i; f.chain[i * 2 + 1] = f.y + dy * L * i; }
    }
    function initMood(f) {
      Object.assign(f, { dashT: 0, cool: rand(0, 3), nextDash: rand(2, 9), target: null, stalkT: 0, tuck: 0, turnS: 0, puff: 0, alert: 0,
        cloak: 0, glide: 0, flap: 1, full: 0, gulp: 0, alarm: 0, fleeX: 0, fleeY: 0, dead: false, noRespawn: false, host: null, zGoalHost: null, pulseT: rand(0, 2), spinT: 0, nextSpin: rand(6, 16),
        caught: null, struggleT: 0, struggleT0: 0, holding: null });
    }
    function spawn(spi, near, edge) {
      let ang = near ? near.ang + rand(-0.4, 0.4) : rand(0, Math.PI * 2);
      let x = near ? near.x + rand(-80, 80) : rand(0, tankW()), y = near ? near.y + rand(-80, 80) : rand(0, tankH() * 0.75);
      if (edge) {
        const side = Math.floor(Math.random() * 4);
        x = side === 0 ? -40 : side === 1 ? tankW() + 40 : rand(0, tankW()); y = side === 2 ? -40 : side === 3 ? tankH() * 0.75 + 40 : rand(0, tankH() * 0.7);
        ang = Math.atan2(tankH() * 0.35 - y, tankW() / 2 - x) + rand(-0.6, 0.6);
      }
      const f = {
        x, y, fade: edge ? 0 : 1,
        vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, ang,
        phase: rand(0, 10), scale: rand(0.65, 1.3), seed: rand(0, 100), wanderA: rand(0, 6.28),
        sightMul: rand(0.8, 1.25), boldness: rand(0.75, 1.3), wanderMul: rand(0.7, 1.4),
        ring: Math.sqrt(Math.random()), sp: spi, z: Math.random(), zPref: Math.random(), darkRoll: Math.random(), depth: 1, dir: 1,
        chain: new Float32Array(K * 2), cz: new Float32Array(K), croll: new Float32Array(K),
        meals: 0
      };
      f.cz.fill(f.z * tankDepth());
      initMood(f);
      resetChain(f);
      return f;
    }
    function desired() {
      const want = SPECIES.map(() => 0);
      if (cfg.species !== 'mixed') { want[SPECIES.findIndex(s => s.key === cfg.species)] = Math.max(6, Math.round(cfg.count / 5)); return want; }
      SPECIES.forEach((sp, i) => { want[i] = Math.round((pop[sp.key] ?? 4) * cfg.count / RT.POP_TOTAL); });
      return want;
    }
    function setCount() {
      const want = desired(), have = SPECIES.map(() => 0);
      for (const f of fish) have[f.sp]++;
      for (const p of pending) have[p.sp]++;
      SPECIES.forEach((_, i) => {
        while (have[i] > want[i]) {
          const pi = pending.findIndex(p => p.sp === i);
          if (pi >= 0) pending.splice(pi, 1);
          else { const fi = fish.findIndex(f => f.sp === i); fish.splice(fi, 1); }
          have[i]--;
        }
        while (have[i] < want[i]) {
          const kin = fish.filter(f => f.sp === i), near = kin.length && Math.random() < 0.7 ? kin[Math.floor(Math.random() * kin.length)] : null;
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
      let r = Math.random() * total;
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
          const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) pending.push({ sp: pickTier1(), t: rand(1, 4) });
          continue;
        }
        const oldSp = f.sp;
        f.sp = ev.next[Math.floor(Math.random() * ev.next.length)];
        f.meals = 0; f.fade = 0; f.scale *= 1.08;
        pending.push({ sp: oldSp, t: rand(4, 10) });
      }
    }
    function struggleDur(prey, pred) { return rand(0.45, 0.75) * Math.max(0.35, Math.min(1.4, bodyLen(prey) / Math.max(1, bodyLen(pred)) + 0.3)); }
    function mealRestMul(pred, prey) { return Math.max(0.4, Math.min(2.2, bodyLen(prey) / Math.max(1, bodyLen(pred)) * 1.6 + 0.4)); }
    function finishCatch(prey, pred) {
      prey.dead = true; prey.caught = null;
      if (pred && !pred.dead) { pred.holding = null; pred.full = SPECIES[pred.sp].beh.rest * mealRestMul(pred, prey); pred.gulp = 1; pred.target = null; tally[pred.sp].eaten++; }
      if (prey.holding) { prey.holding.caught = null; prey.holding = null; }
      tally[prey.sp].lost++;
      pressure[prey.sp] = Math.min(6, pressure[prey.sp] + 1);
    }
    function stepHold(f, dt) {
      const o = f.holding;
      if (!o || o.dead || o.caught !== f) { f.holding = null; return true; }
      f.vx *= Math.max(0, 1 - dt * 6); f.vy *= Math.max(0, 1 - dt * 6);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.ang += Math.sin(performance.now() * 0.001 * 17 + f.seed * 5) * dt * 0.8;
      f.tuck = smooth(f.tuck, 0.6, 6, dt); f.alert = smooth(f.alert, 1, 6, dt);
      followChain(f); trail3D(f, dt, Math.hypot(f.vx, f.vy));
      if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 0.8);
      return false;
    }
    function stepStruggle(f, dt) {
      const h = f.caught;
      if (!h || h.dead) { finishCatch(f, h && !h.dead ? h : null); return; }
      f.struggleT -= dt;
      const hbl = bodyLen(h);
      const mx = h.x + Math.cos(h.ang) * hbl * 0.42, my = h.y + Math.sin(h.ang) * hbl * 0.42;
      const tire = Math.max(0, f.struggleT / f.struggleT0);
      const shakeA = hbl * 0.2 * Math.min(1, tire * 2.2);
      const sx = Math.sin(performance.now() * 0.001 * 33 + f.seed * 11) * shakeA, sy = Math.cos(performance.now() * 0.001 * 29 + f.seed * 13) * shakeA;
      f.x += (mx + sx - f.x) * Math.min(1, dt * 10); f.y += (my + sy - f.y) * Math.min(1, dt * 10);
      f.ang = Math.atan2(my - f.y, mx - f.x) + Math.sin(performance.now() * 0.001 * 47 + f.seed * 7) * 2.4 * tire;
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
      for (let oy = -rings; oy <= rings; oy++) for (let ox = -rings; ox <= rings; ox++) {
        const a = grid.get(gridKey(gx0 + ox, gy0 + oy)); if (!a) continue;
        for (const j of a) {
          const o = fish[j];
          if (!predicate(o)) continue;
          const d = Math.hypot(o.x - x, o.y - y);
          if (d < bd) { bd = d; best = o; }
        }
      }
      return best;
    }

    function step(dt) {
      const bodyPx = cfg.size;
      const R = bodyPx * 1.5 * WORLD_SCALE, cell = R;
      gridCell = cell;
      const maxSp = bodyPx * 1.6 * cfg.speed, maxF = maxSp * 2.2;
      const W = tankW(), H = tankH(), margin = Math.min(140, bodyPx * 1.5);
      const personal = cfg.beh === 'on';
      grid.clear();
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i], k = gridKey(Math.floor(f.x / cell), Math.floor(f.y / cell));
        let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
      }
      for (let i = 0; i < pressure.length; i++) if (pressure[i] > 0) pressure[i] = Math.max(0, pressure[i] - dt * 0.12);
      const hunters = personal ? fish.filter(f => isPredator[f.sp]) : [];
      const spinners = personal ? fish.filter(f => f.spinT > 0) : [];
      let density = null;
      if (personal) {
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
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        if (f.dead) continue;
        if (f.caught) { stepStruggle(f, dt); continue; }
        if (f.holding && !stepHold(f, dt)) continue;
        const spc = SPECIES[f.sp], b = personal ? spc.beh : RT.PLAIN, sw = spc.swim;
        const bl = bodyLen(f);
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, zs = 0, n = 0, alX = 0, alY = 0, alN = 0, alC = 0, cx2 = 0, cy2 = 0, n2 = 0;
        const canBite = personal && spc.preySet.size && f.full <= 0 && (!b.spinCatch || f.spinT > 0);
        const reach = bl * (b.catch || 0.3);
        let lead = null, leadD = 1e9;
        const gx = Math.floor(f.x / cell), gy = Math.floor(f.y / cell);
        const sp0 = Math.hypot(f.vx, f.vy) || 1;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const a = grid.get(gridKey(gx + ox, gy + oy)); if (!a) continue;
          for (const j of a) {
            if (j === i) continue;
            const o = fish[j];
            if (o.dead || o.caught) continue;
            const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
            if (d2 > R * R || d2 < 1e-6) continue;
            if (canBite && spc.preySet.has(o.sp) && d2 < reach * reach && Math.abs(o.z - f.z) * cfg.dz < 0.25 &&
                (b.graze || b.spinCatch || !b.dash || f.dashT > 0 || d2 < reach * reach * 0.36)) {
              const confusion = Math.min(0.7, density[j] * 0.05);
              if (confusion > 0 && Math.random() < confusion) continue;
              if (b.graze || b.spinCatch) {
                o.dead = true; f.full = b.rest * mealRestMul(f, o); f.dashT = 0; f.gulp = 1; f.target = null;
                f.meals = (f.meals || 0) + 1;
                if (o.holding) { o.holding.caught = null; o.holding = null; }
                tally[f.sp].eaten++; tally[o.sp].lost++;
                pressure[o.sp] = Math.min(6, pressure[o.sp] + 1);
              } else {
                o.caught = f; o.struggleT = o.struggleT0 = struggleDur(o, f);
                f.holding = o; f.dashT = 0; f.target = null;
                f.meals = (f.meals || 0) + 1;
              }
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
        if (lead) {
          const tx = lead.chain[(K - 1) * 2] - f.x, ty = lead.chain[(K - 1) * 2 + 1] - f.y, td = Math.hypot(tx, ty) || 1;
          fx += (tx / td * maxSp - f.vx) * b.train; fy += (ty / td * maxSp - f.vy) * b.train;
        }

        let cruise = 1, dashing = f.dashT > 0, threat = 0, flX = 0, flY = 0;
        if (personal) {
          if (spc.predators.size) {
            for (const h of hunters) {
              if (!spc.predators.has(h.sp)) continue;
              const dx = f.x - h.x, dy = f.y - h.y, d = Math.hypot(dx, dy) || 1, hb = SPECIES[h.sp].beh, hl = bodyLen(h);
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
              const Rf = R * (h.dashT > 0 || h.alert > 0.5 ? 3 : 1.8) * (h.cloak > 0.6 ? 0.4 : 1);
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
          if (b.puff && ptr.active && cfg.ptr !== 'ignore' && Math.hypot(ptr.x - f.x, ptr.y - f.y) < bodyPx * 3.5) threat = Math.max(threat, 0.8);

          if (spc.preySet.size && f.full <= 0 && !b.graze && !b.spinCatch || (b.graze && f.full <= 0 && b.chase)) {
            const sight = (b.sight || 5) * bl * WORLD_SCALE * f.sightMul;
            if (f.target && (f.target.dead || f.target.caught || !fish.includes(f.target) || Math.hypot(f.target.x - f.x, f.target.y - f.y) > sight * 1.3)) f.target = null;
            if (!f.target) {
              f.target = gridNearestFish(f.x, f.y, sight, o => spc.preySet.has(o.sp) && !o.caught && Math.abs(o.z - f.z) * cfg.dz <= 0.35);
              f.stalkT = 0;
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
              const ready = b.dash && b.dash.mode === 'chase' && f.dashT <= 0 && f.cool <= 0 && d < b.dash.range * bl && (!b.dash.wait || f.stalkT > b.dash.wait);
              if (ready) { f.dashT = b.dash.dur; f.dashAng = Math.atan2(dy, dx); f.stalkT = 0; }
            }
          }
          if (b.dash && b.dash.mode === 'periodic') {
            f.nextDash -= dt;
            if (f.nextDash <= 0) { f.dashT = b.dash.dur; f.dashAng = f.ang; f.nextDash = rand(...b.dash.every); }
          }
          if (b.puff) cruise *= 1 - 0.8 * f.puff;
          if (b.light && ptr.active && cfg.ptr !== 'ignore') {
            const dx = ptr.x - f.x, dy = ptr.y - f.y, d = Math.hypot(dx, dy) || 1;
            fx += (dx / d * maxSp - f.vx) * b.light * Math.min(1, d / (bl * 0.6)); fy += (dy / d * maxSp - f.vy) * b.light * Math.min(1, d / (bl * 0.6));
          }
          if (b.stopgo && !dashing) cruise *= Math.sin(performance.now() * 0.001 * b.stopgo * 2 + f.seed) > 0.15 ? 1 : 0.06;
          if (spc.hostSet.size) {
            if (f.host && (!fish.includes(f.host) || !spc.hostSet.has(f.host.sp))) f.host = null;
            if (!f.host || Math.random() < dt * 0.05) {
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
          f.zGoal = b.z[0] + (b.z[1] - b.z[0]) * f.zPref + 0.12 * Math.sin(performance.now() * 0.0001 + f.seed);
        }
        if (n && b.school > 0) f.zGoal = f.zGoal * 0.7 + (zs / n) * 0.3;
        if (f.target) f.zGoal = f.zGoal * 0.5 + f.target.z * 0.5;
        if (personal && f.zGoalHost != null) f.zGoal = f.zGoalHost;
        if (personal && b.dive) f.zGoal += 0.4 * f.alarm;
        f.z += (Math.min(1, Math.max(0, f.zGoal)) - f.z) * Math.min(1, dt * 0.4);
        f.depth = 1;
        f.wanderA += rand(-1, 1) * dt * (b.wanderRate || 2) * f.wanderMul;
        fx += Math.cos(f.wanderA) * maxSp * b.wander; fy += Math.sin(f.wanderA) * maxSp * b.wander;
        if (f.x < margin) fx += (margin - f.x) / margin * maxF; else if (f.x > W - margin) fx -= (f.x - (W - margin)) / margin * maxF;
        if (f.y < margin) fy += (margin - f.y) / margin * maxF; else if (f.y > H - margin) fy -= (f.y - (H - margin)) / margin * maxF;
        for (let vi = 0; vi < vortices.length; vi++) {
          const v = vortices[vi], vdx = f.x - v.x, vdy = f.y - v.y, vr = Math.hypot(vdx, vdy) || 1;
          if (vr > v.radius) continue;
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
        f.flap = (1 - 0.6 * f.glide) * (1 - 0.4 * f.tuck) * (1 + 0.6 * f.puff);
        const beat = b.pulse ? 2 + 10 * (f.tuckGoal || 0) : 3 + 9 * sp / maxSp;
        f.phase += dt * beat * Math.sqrt(cfg.speed) / Math.sqrt(f.scale * Math.max(0.6, sw.len / sw.waves));
        if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 0.8);
      }
      eatCarcasses(); applyEvolutions(); stepCarcasses(dt);
      if (fish.some(f => f.dead)) {
        for (const f of fish) if (f.dead && !f.noRespawn) pending.push({ sp: f.sp, t: rand(4, 10) * (1 + Math.min(2.5, pressure[f.sp] * 0.5)) });
        fish = fish.filter(f => !f.dead);
      }
      for (const p of pending) p.t -= dt;
      const born = pending.filter(p => p.t <= 0);
      if (born.length) { pending = pending.filter(p => p.t > 0); for (const p of born) fish.push(spawn(p.sp, null, true)); }
    }

    return {
      cfg, speciesRT: SPECIES, isPredator, POP_DEFAULT: RT.POP_DEFAULT, POP_TOTAL: RT.POP_TOTAL,
      get fish() { return fish; }, get carcasses() { return carcasses; }, get pending() { return pending; },
      get gridCell() { return gridCell; },
      pressure, tally, pop, ptr, vortex, vortices, bounds,
      _resize(vw, vh) { bounds.w = vw * WORLD_SCALE; bounds.h = vh * WORLD_SCALE; },
      _step(dt) { step(dt); },
      _setSpecies(key) { cfg.species = key; fish = []; pending = []; setCount(); },
      _setCount() { setCount(); },
      _desired() { return desired(); },
      _bodyLen(f) { return bodyLen(f); },
      _nearestFish(x, y, maxRadius, predicate) { return gridNearestFish(x, y, maxRadius, predicate); },
    };
  }

  function resize(sim, vw, vh) { sim._resize(vw, vh); }
  function step(sim, dt) { sim._step(dt); }
  function setSpecies(sim, key) { sim._setSpecies(key); }
  function setCount(sim) { sim._setCount(); }
  function setPop(sim, popObj) { Object.assign(sim.pop, popObj); sim._setCount(); }
  function desired(sim) { return sim._desired(); }
  function bodyLen(sim, f) { return sim._bodyLen(f); }
  function nearestFish(sim, x, y, maxRadius, predicate) { return sim._nearestFish(x, y, maxRadius, predicate); }
  function setPointer(sim, x, y, active) { sim.ptr.x = x; sim.ptr.y = y; sim.ptr.active = active; }
  function setVortexAnchor(sim, x, y) { sim.vortex.x = x; sim.vortex.y = y; }
  // sim.vortices is exposed by reference (a plain array), so step()'s closure keeps seeing updates
  // only if callers mutate it in place — reassigning sim.vortices = [...] would NOT reach step().
  // This helper does the in-place clear-and-refill for you.
  function setVortices(sim, list) { sim.vortices.length = 0; for (const v of list) sim.vortices.push(v); }

  window.EcologySim = {
    create, resize, step, setSpecies, setCount, setPop, desired, bodyLen, nearestFish,
    setPointer, setVortexAnchor, setVortices, WORLD_SCALE, K,
  };
})();
