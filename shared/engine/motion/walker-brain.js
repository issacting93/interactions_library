/* INTERACTIONS — the walker's brain: why a walker moves.

   walker.js knows how to walk to a point. This file decides which point, and how the body carries itself
   on the way, from the same personality data the ecology swims its species by. Three layers, after the
   ecology (shared/engine/ecology/ecology-sim.js) and Rain World's creatures:

     drives      hunger, fear (threat), a boredom clock, and a memory of where the prey was last seen
     behaviour   wander, graze, stalk, dash, eat, alert, puff, flee, bitten, search, give up
     body        each behaviour sets walker.mod (speed, height, stride, lift, breath), walker.face (what
                 to turn and watch while standing), walker.floatOn (lift off and swim away)

     import { createBrain, LIFE } from ".../shared/engine/motion/walker-brain.js";
     w.brain = createBrain(w, "pincer", { bodyLen, rand });
     // each frame, before locomote:  w.brain.step(dt, { walkers, H, lim });
     w.brain.mode, w.brain.hunger, w.brain.threat, w.brain.say()   for a readout

   A walker knows only what it can see: sight is a radius in its own body lengths, as in the ecology.
   Out of sight, a hunter goes to where it last saw its prey; if nothing is there it gives up, and it
   gives up anyway after a long chase (Rain World: no stalemates). */

// Copied from shared/engine/ecology/ecology-species.js (BEH and ECO), which is too large to load here
// (20 MB, it carries the part textures). Keys are the ecology's. Keep the two in step by hand.
export const LIFE = {
  puffer: { name: "Blade Puffer", mood: "Nervous", wander: 0.55, wanderRate: 5, minSp: 0.08, speedMul: 0.8, puff: true, sight: 3, eats: [], flee: "puff" },
  pincer: { name: "Pincer Crawler", mood: "Crawler", wander: 0.3, wanderRate: 1.2, minSp: 0.02, stopgo: 1.3, sight: 3, chase: 0.5,
    dash: { range: 1.4, mult: 3, dur: 0.3, cool: 2 }, eats: ["leech", "puffer", "wisp"], catch: 0.45, rest: 5, flee: "none" },
  "carapace-strider": { name: "Carapace Strider", mood: "Scavenger", wander: 0.3, wanderRate: 1.2, minSp: 0.02, stopgo: 1.3, sight: 3, eats: [], flee: "none" },
  "pearl-chasing-centiwyrm": { name: "Pearl-chasing Centiwyrm", mood: "Chaser", wander: 0.2, wanderRate: 1.1, minSp: 0.06, sight: 4, eats: ["wisp"], flee: "none" },
  "crowned-sickle-lancer": { name: "Crowned Sickle Lancer", mood: "Lancer", wander: 0.2, wanderRate: 1, minSp: 0.08, eats: [], flee: "none" },
};

// What each behaviour is called on a readout, and how the body carries it
const BODY = {
  wander: { speed: 0.7, height: 1, stride: 1, lift: 1, breath: 0 },
  graze:  { speed: 0, height: 0.86, stride: 1, lift: 1, breath: 0.03 },
  stalk:  { speed: 0.55, height: 0.74, stride: 0.6, lift: 0.55, breath: 0 },
  hold:   { speed: 0, height: 0.7, stride: 0.6, lift: 0.55, breath: 0 },
  search: { speed: 0.6, height: 0.9, stride: 0.85, lift: 0.9, breath: 0 },
  dash:   { speed: 3, height: 0.9, stride: 1.5, lift: 0.8, breath: 0 },
  eat:    { speed: 0, height: 0.72, stride: 1, lift: 1, breath: 0.07 },
  alert:  { speed: 0, height: 1.14, stride: 1, lift: 1, breath: 0 },
  puff:   { speed: 0.15, height: 1.32, stride: 0.55, lift: 0.5, breath: 0.05 },
  flee:   { speed: 2.4, height: 1, stride: 1.2, lift: 1, breath: 0 },
  bitten: { speed: 0, height: 0.42, stride: 1, lift: 1, breath: 0.02 },
  bored:  { speed: 0.55, height: 0.95, stride: 0.9, lift: 1, breath: 0 },
};
const SAY = {
  wander: "wandering", graze: "pausing", stalk: "stalking", hold: "holding still", search: "searching where it last saw it",
  dash: "lunging", eat: "eating, resting", alert: "watching", puff: "puffed up", flee: "fleeing, swimming off",
  bitten: "bitten", bored: "gave up, wandering",
};

export function createBrain(w, key, opts = {}) {
  const L = LIFE[key] || LIFE["carapace-strider"], rand = opts.rand || Math.random, Lb = opts.bodyLen || 1.5;
  const B = {
    key, life: L, mode: "wander", hunger: 0.2 + 0.4 * rand(), threat: 0, puff: 0, boldness: 0.75 + 0.55 * rand(),
    prey: null, lastSeen: null, chaseT: 0, cool: 0, dashT: 0, eatT: 0, fleeT: 0, bittenT: 0, retarget: 0, sgT: rand() * 2, from: null,
    bodyLen: Lb, eatsN: 0, bitesN: 0,
  };
  const me = () => w.head().pos;
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clampTo = (p, lim) => { const r = Math.hypot(p.x, p.z); if (r > lim) { p.x *= lim / r; p.z *= lim / r; } return p; };
  function aim(x, z, env) { const p = clampTo({ x, z }, env.lim); w.target.set(p.x, env.H(p.x, p.z), p.z); }
  function wanderTo(env, reach) {
    const a = rand() * Math.PI * 2, r = (0.8 + rand() * 2.2) * Lb * reach, h = me();
    aim(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r, env);
  }
  function body(m, env) {
    const b = BODY[m];
    for (const k in b) w.mod[k] += (b[k] - w.mod[k]) * Math.min(1, env.dt * (m === "dash" || m === "flee" ? 9 : 3.5));
  }
  B.bite = function (by) { B.bittenT = 2.4; B.from = by; B.mode = "bitten"; B.puff = 0; B.bitesN++; w.shake = 0.15; };
  B.say = () => SAY[B.mode] || B.mode;

  B.step = function (dt, env) {
    env.dt = dt;
    const h = me(), others = env.walkers.filter((o) => o !== w && o.brain);
    B.cool = Math.max(0, B.cool - dt);
    w.face = null;

    // ---- fear: anything that eats this species, closer than this one can see, weighed up when it lunges
    let threat = 0, threatBy = null;
    for (const o of others) if (o.brain.life.eats.includes(key)) {
      const d = flat(o.head().pos, h), R = (L.sight || 3) * Lb * 1.3 + o.brain.bodyLen;
      const t = Math.max(0, 1 - d / R) * (o.brain.mode === "dash" ? 1.6 : o.brain.mode === "stalk" || o.brain.mode === "hold" ? 1.15 : o.brain.mode === "eat" ? 0.4 : 0.8);   // a hunter that is eating is less of a worry
      if (t > threat) { threat = Math.min(1, t); threatBy = o; }
    }
    B.threat += (threat - B.threat) * Math.min(1, dt * 4);

    // ---- bitten: sinks and lies still, then bolts and swims off (the walker has a swim mode for this)
    if (B.bittenT > 0) {
      B.bittenT -= dt; B.mode = "bitten"; w.floatOn = false; aim(h.x, h.z, env); body("bitten", env);
      if (B.bittenT <= 0) { B.fleeT = 4; B.cool = 6; }
      return;
    }
    if (B.fleeT > 0) {
      B.fleeT -= dt; B.mode = "flee";
      const src = (threatBy || B.from || { head: () => ({ pos: { x: 0, z: 0 } }) }).head().pos;
      let ax = h.x - src.x, az = h.z - src.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      // swimming away from the edge of the world: turn along it instead
      if (Math.hypot(h.x, h.z) > env.lim * 0.8) { const t = ax; ax = -az; az = t; }
      aim(h.x + ax * 5 * Lb, h.z + az * 5 * Lb, env);
      w.floatOn = !!w.def.float; body("flee", env);
      if (B.fleeT <= 0) { w.floatOn = false; B.from = null; B.retarget = 0; }
      return;
    }
    w.floatOn = false;

    // ---- prey's answer to fear, the ecology's flee: "puff" puffs up and holds its ground, facing the
    // threat; anything else stands alert. Either one bolts when the threat comes right in, but only after
    // a moment to react (startle), which is the hunter's chance
    if (B.threat > 0.28 && threatBy) {
      const p = threatBy.head().pos; w.face = p;
      const bolt = B.threat > (L.puff ? 0.88 : 0.6) * B.boldness && B.cool <= 0;
      B.startle = bolt ? (B.startle || 0) + dt : 0;
      if (B.startle > 0.45) { B.startle = 0; B.fleeT = L.puff ? 3.2 : 2.4; B.cool = 5; B.from = threatBy; }
      if (L.puff) {
        B.puff += (1 - B.puff) * Math.min(1, dt * 5);
        aim(h.x, h.z, env);
        B.mode = "puff"; body("puff", env);
      } else {
        B.mode = "alert"; aim(h.x, h.z, env); body("alert", env);
      }
      return;
    }
    B.puff += (0 - B.puff) * Math.min(1, dt * 1.2);

    // ---- a meal: rests for as long as the ecology says a meal lasts
    if (B.eatT > 0) { B.eatT -= dt; B.mode = "eat"; aim(h.x, h.z, env); body("eat", env); return; }

    // ---- hunger and the hunt
    if (L.eats.length) B.hunger = Math.min(1, B.hunger + dt / 30);
    if (L.eats.length && B.hunger > 0.35 && B.cool <= 0) {
      const sight = (L.sight || 3) * Lb * 1.6;
      if (!B.prey || B.prey.brain.fleeT > 0 || B.prey.brain.bittenT > 0) {
        B.prey = null;
        let best = sight;
        for (const o of others) if (L.eats.includes(o.brain.key) && o.brain.fleeT <= 0 && o.brain.bittenT <= 0) { const d = flat(o.head().pos, h); if (d < best) { best = d; B.prey = o; } }
        if (B.prey) { B.chaseT = 0; B.lastSeen = null; }
      }
      if (B.prey) {
        const pp = B.prey.head().pos, d = flat(pp, h), seen = d < sight;
        B.chaseT += dt;
        if (B.chaseT > 16) { B.prey = null; B.cool = 7; B.mode = "bored"; wanderTo(env, 2); return; }   // no stalemates
        if (!seen) {
          if (!B.lastSeen) { B.prey = null; return; }
          aim(B.lastSeen.x, B.lastSeen.z, env); B.mode = "search"; body("search", env);
          if (flat(B.lastSeen, h) < Lb * 0.6) { B.prey = null; B.cool = 4; B.mode = "bored"; wanderTo(env, 2); }
          return;
        }
        B.lastSeen = { x: pp.x, z: pp.z }; w.face = pp; B.preyD = d;
        const reach = (L.catch || 0.4) * Lb + B.prey.brain.bodyLen * 0.5;
        if (B.dashT > 0) {
          B.dashT -= dt; B.mode = "dash"; body("dash", env);
          const pv = B.prey.head().vel; aim(pp.x + pv.x * 0.25, pp.z + pv.z * 0.25, env);
          if (d < reach) {
            B.prey.brain.bite(w); B.prey = null; B.dashT = 0; B.eatT = L.rest || 4; B.hunger = 0; B.eatsN++;
            B.cool = (L.dash && L.dash.cool) || 2; return;
          }
          if (B.dashT <= 0) B.cool = (L.dash && L.dash.cool) || 2;
          return;
        }
        // the lunge: from the ecology's dash range, held for longer, since a walker has to step it out
        if (L.dash && d < L.dash.range * Lb + B.prey.brain.bodyLen * 0.5) { B.dashT = L.dash.dur * 4; B.mode = "dash"; return; }
        // stalk: low and slow, in the crawler's stop-go rhythm
        B.sgT += dt; const per = L.stopgo || 1.6, moving = (B.sgT % per) < per * 0.68;
        aim(pp.x, pp.z, env);
        B.mode = moving ? "stalk" : "hold"; body(B.mode, env);
        if (!moving) aim(h.x, h.z, env);
        return;
      }
    }

    // ---- nothing to do: wander in the species' rhythm, stopping now and then
    B.retarget -= dt;
    if (B.mode === "graze" && B.retarget > 0) { aim(h.x, h.z, env); body("graze", env); return; }
    if (B.retarget <= 0 || flat(w.target, h) < Lb * 0.4) {
      if (rand() < (L.stopgo ? 0.4 : 0.25)) { B.mode = "graze"; B.retarget = 0.8 + rand() * 1.6; aim(h.x, h.z, env); return; }
      B.mode = B.mode === "bored" && B.cool > 0 ? "bored" : "wander";
      wanderTo(env, L.wanderRate > 3 ? 0.6 : 1.4);
      B.retarget = (L.wanderRate > 3 ? 1 : 3) + rand() * 2.5;
    }
    if (B.mode !== "bored" || B.cool <= 0) B.mode = "wander";
    body(B.mode === "bored" ? "bored" : "wander", env);
    if (L.speedMul) w.mod.speed *= 0.97 + 0.03 * L.speedMul;
  };
  return B;
}
