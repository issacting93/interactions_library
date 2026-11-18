/* ecology-director.js: keeps a run fair. Once a second it counts, from the player's point of view, what in the tank it can eat and what
   can eat it, and nudges the tank toward a food pyramid: enough small things to eat (in the whole tank and within reach), not too many
   bigger things (in the whole tank and close by). It works the way a game's AI director does (Left 4 Dead's), never in view:
     - too little food: food is born off screen, a little way out from the player, of a kind in this place's roster that the player can eat now
       (the floor's kinds for a walker), fading in
     - too many hunters: the farthest one off screen leaves (and its respawns are dropped); one too close, beyond the first, loses
       interest in the player for a few seconds
   What counts as food and as a threat is asked of the player each time, so as the player grows, yesterday's threats become food.

     const dir = EcologyDirector.create(RULES?)
     EcologyDirector.step(dir, dt, { sim, me, edible(f), threat(f), onScreen(x, y, z) -> bool, kinds: [key...] | null,
                                     reach (tank units: "nearby"), floor (true: food is born near the floor), threatMax, preyMin,
                                    keep: [key...] kinds that never leave (a goal's) })
     dir.last  what it saw and did the last time it ran: { prey, near, threats, close, born, left, calmed }

   Classic script -> window.EcologyDirector. Needs EcologySim (spawnAt). */
(function () {
  "use strict";
  // everything that simulates draws its randomness here: the seeded stream when the core is loaded (a seed replays), Math.random when it is not
  const RND = () => (window.EcoCore ? window.EcoCore.random() : Math.random());
  const RULES = { every: 1, preyMin: 10, preyNear: 3, born: 3, flood: 3, leave: 2, threatMax: 3, threatNear: 1, calm: 4, out: [1.15, 2.1], tries: 24 };
  function create(rules) { return { R: Object.assign({}, RULES, rules || {}), t: 0, last: null }; }
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  function step(dir, dt, o) {
    const R = dir.R; if ((dir.t += dt) < R.every) return dir.last; dir.t = 0;
    const sim = o.sim, me = o.me; if (!sim || !me || me.dead) return dir.last;
    const W = sim.bounds.w, H = sim.bounds.h * 0.75, reach2 = o.reach * o.reach, find2 = reach2 * R.out[1] * R.out[1];   // food counts as near out to where it is born
    const live = sim.fish.filter((f) => f !== me && !f.dead && (!f.hidden || f.crew) && !f.caught && !f.holding);   // the floor crew are hidden stand-ins, but real food and real hunters
    const prey = live.filter((f) => o.edible(f)), threats = live.filter((f) => o.threat(f));
    const near = prey.filter((f) => d2(f, me) < find2).length, close = threats.filter((f) => d2(f, me) < reach2).sort((a, b) => d2(a, me) - d2(b, me));
    const last = (dir.last = { prey: prey.length, near, threats: threats.length, close: close.length, born: 0, left: 0, calmed: 0 });

    // food: as many as are missing, in the tank or in reach (a few a second), off screen and a little way out
    const preyMin = o.preyMin ?? R.preyMin, want = prey.length >= preyMin * R.flood ? 0 : Math.min(R.born, Math.max(preyMin - prey.length, R.preyNear - near));   // never past flood x the minimum
    if (want > 0) {
      const kinds = (o.kinds && o.kinds.length ? o.kinds : sim.speciesRT.map((sp) => sp.key)).filter((k) => sim.speciesRT.some((sp) => sp.key === k));
      const ring = [o.reach * R.out[0], o.reach * R.out[1]], ok = [];
      // where: the host's habitat if it has one (o.placeFor(i, ring) -> { group: [{x, y, z}] }: a spot that suits that kind, a school born
      // together); otherwise anywhere off screen in the ring
      const spot = (i) => { if (o.placeFor) return o.placeFor(i, ring);
        for (let k = 0; k < R.tries; k++) { const a = RND() * Math.PI * 2, r = ring[0] + RND() * (ring[1] - ring[0]);
          const x = Math.max(20, Math.min(W - 20, me.x + Math.cos(a) * r)), y = Math.max(20, Math.min(H - 20, me.y + Math.sin(a) * r)), z = o.floor ? 0.78 + RND() * 0.17 : RND() * 0.9;
          if (!(o.onScreen && o.onScreen(x, y, z))) return { group: [{ x, y, z }] }; } return null; };
      for (let n = 0; n < want && ok.length < want; n++) {
        // a kind the player can eat now: try them in a shuffled order; one that turns out not to be food goes back, school and all
        for (const k of kinds.slice().sort(() => RND() - 0.5)) { const i = sim.speciesRT.findIndex((sp) => sp.key === k), at = i >= 0 && spot(i); if (!at) continue;
          const born = at.group.map((q) => window.EcologySim.spawnAt(sim, i, q.x, q.y, q.z)).filter(Boolean);
          if (born.length && o.edible(born[0])) { ok.push(...born); break; } for (const f of born) { const j = sim.fish.indexOf(f); if (j >= 0) sim.fish.splice(j, 1); } }
      }
      last.born = ok.length;
    }
    // hunters: too many in the tank, the farthest off screen leaves (its respawns too); too many close, the extra ones lose interest
    const max = o.threatMax ?? R.threatMax;
    if (threats.length > max) {
      const keep = new Set(o.keep || []), far = threats.filter((f) => !f.crew && !keep.has(sim.speciesRT[f.sp].key) && !(o.onScreen && o.onScreen(f.x, f.y, f.z))).sort((a, b) => d2(b, me) - d2(a, me)).slice(0, Math.min(R.leave, threats.length - max));   // a couple a second, so the tank thins out rather than empties
      for (const f of far) { const i = sim.fish.indexOf(f); if (i >= 0) { sim.fish.splice(i, 1); last.left++; }
        const P = sim.pending; for (let j = P.length - 1; j >= 0; j--) if (P[j].sp === f.sp) { P.splice(j, 1); break; } }
    }
    for (const f of close.slice(R.threatNear)) { if (f.target === me) f.target = null; f.ignore = me; f.ignoreT = R.calm; last.calmed++; }
    return last;
  }
  window.EcologyDirector = { create, step, RULES };
})();
