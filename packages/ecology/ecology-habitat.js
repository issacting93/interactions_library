/* ecology-habitat.js: where things live. A place is read into a few habitat maps on a coarse grid, each species is read into what it
   likes, and a newborn's spot is drawn from how well it suits that kind there, less how crowded it already is. Nothing is set per place
   or per species by hand: the maps come from a place's own landmarks, the liking from each species' own behaviour, so a new place
   (a stage, Endless, a generated city floor) gets its population from its own layout.

   Maps (0..1 per cell, each landmark a soft bump that falls off with distance):
     cover    boulders: somewhere to lurk          weed     weed beds: grazing, and hiding
     carrion  carcasses: something dead to pick    warm     vents: warmth, and the plankton that blooms there
     open     whatever has none of those: open water
   Liking (from a species' behaviour, beh: its depth band z, school, prey, graze, mood ...):
     bottom   how much of its band reaches the floor (the floor maps count for it by that much; open water counts for the rest)
     cover    ambushers, stalkers, crawlers, strikers, loners        weed     grazers, the camouflaged
     carrion  scavengers                                              warm     colonies and stingers; a little for plankton
     open     schools, murmurations, gliders and monarchs
   How much a place can feed: rich = how much of it is weed, vents and carrion (0..1). A food minimum and a cap on hunters follow from it,
   as a pyramid (about three to eat for each one that hunts you).

     const hab = EcologyHabitat.create({ w, h, props: [{ kind, x, y, r }], cell })
     EcologyHabitat.like(beh)            -> { bottom, cover, weed, carrion, warm, open, school }
     EcologyHabitat.suit(hab, beh, x, y) -> 0..1
     EcologyHabitat.place(hab, sim, i, { me, ring: [r0, r1], onScreen(x, y, z), floor, group }) -> { x, y, z, group: [{x, y, z}] } | null
     EcologyHabitat.settle(hab, sim, skip(f)) sets everyone down again where they suit (a new place)
     EcologyHabitat.budget(hab)          -> { preyMin, threatMax }

   Classic script -> window.EcologyHabitat. */
(function () {
  "use strict";
  // everything that simulates draws its randomness here: the seeded stream when the core is loaded (a seed replays), Math.random when it is not
  const RND = () => (window.EcoCore ? window.EcoCore.random() : Math.random());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = RND;
  const REACH = { boulder: 2.6, weed: 2.4, carcass: 2.2, vent: 3 };   // how far a landmark's pull reaches, in its own size
  const MAP = { boulder: "cover", weed: "weed", carcass: "carrion", vent: "warm" };

  function create(o) {
    const w = o.w, h = o.h, cell = o.cell || Math.max(w, h) / 28, nx = Math.max(4, Math.ceil(w / cell)), ny = Math.max(4, Math.ceil(h / cell)), N = nx * ny;
    const F = { cover: new Float32Array(N), weed: new Float32Array(N), carrion: new Float32Array(N), warm: new Float32Array(N), open: new Float32Array(N) };
    for (const p of o.props || []) { const k = MAP[p.kind]; if (!k) continue; const R = Math.max(cell, (p.r || cell) * (REACH[p.kind] || 2.5));
      const i0 = Math.max(0, Math.floor((p.x - R) / cell)), i1 = Math.min(nx - 1, Math.floor((p.x + R) / cell)), j0 = Math.max(0, Math.floor((p.y - R) / cell)), j1 = Math.min(ny - 1, Math.floor((p.y + R) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = (i + 0.5) * cell - p.x, dy = (j + 0.5) * cell - p.y, d = Math.hypot(dx, dy) / R; if (d < 1) { const c = j * nx + i; F[k][c] = Math.min(1, F[k][c] + (1 - d * d) * (1 - d * d)); } } }
    let rich = 0; for (let c = 0; c < N; c++) { const cl = Math.max(F.cover[c], F.weed[c], F.carrion[c], F.warm[c]); F.open[c] = 1 - cl; rich += Math.max(F.weed[c], F.carrion[c], F.warm[c]); }
    return { w, h, cell, nx, ny, F, rich: clamp(rich / N * 2.5, 0, 1) };
  }

  // what a species likes, read off its behaviour (cached on the beh object)
  const MOOD = { cover: /ambush|stalk|crawl|strik|loner|armou?r|deep|lancer|chaser/i, weed: /camoufl|frond/i, carrion: /scaveng/i, warm: /colony/i, open: /school|murmur|glid|monarch|show|swift|flutter|moth|watcher/i };
  function like(beh) {
    if (!beh) return { bottom: 0.3, cover: 0.2, weed: 0.2, carrion: 0, warm: 0, open: 0.5, school: 0 };
    if (beh._like) return beh._like;
    const z = beh.z || [0.2, 0.7], bottom = clamp((z[1] - 0.6) / 0.4, 0, 1) * clamp(0.4 + z[0], 0, 1), mood = beh.mood || "", prey = beh.prey || [];
    const L = { bottom, cover: MOOD.cover.test(mood) || beh.stopgo || beh.lure ? 1 : 0.1, weed: beh.graze || MOOD.weed.test(mood) ? 1 : prey.length === 1 && prey[0] === "wisp" ? 0.5 : 0.1,
      carrion: MOOD.carrion.test(mood) ? 1.4 : 0, warm: MOOD.warm.test(mood) || beh.sting ? 1.4 : /plankton/i.test(mood) ? 0.7 : 0, open: MOOD.open.test(mood) || (beh.school || 0) >= 0.9 ? 1 : 0.35, school: beh.school || 0 };
    Object.defineProperty(beh, "_like", { value: L, enumerable: false }); return L;
  }
  function suit(hab, beh, x, y) {
    const i = clamp(Math.floor(x / hab.cell), 0, hab.nx - 1), j = clamp(Math.floor(y / hab.cell), 0, hab.ny - 1), c = j * hab.nx + i, L = like(beh), F = hab.F;
    const floor = L.cover * F.cover[c] + L.weed * F.weed[c] + L.carrion * F.carrion[c] + L.warm * F.warm[c];
    return clamp(0.12 + L.bottom * floor + (1 - L.bottom * 0.6) * L.open * F.open[c] * 0.6 + (1 - L.bottom) * 0.25, 0, 1.5) / 1.5;
  }
  // how full each cell already is: every living thing counts, its own kind three times over (a kind spreads out from itself)
  function crowd(hab, sim, spi) {
    const occ = new Float32Array(hab.nx * hab.ny); for (const f of sim.fish) { if (f.dead) continue; const i = clamp(Math.floor(f.x / hab.cell), 0, hab.nx - 1), j = clamp(Math.floor(f.y / hab.cell), 0, hab.ny - 1); occ[j * hab.nx + i] += f.sp === spi ? 3 : 1; }
    return occ;
  }

  function place(hab, sim, spi, o) {
    o = o || {}; const sp = sim.speciesRT[spi], beh = sp && sp.beh, L = like(beh), z0 = (beh && beh.z) || [0.1, 0.9];
    if (o.floor && z0[1] < 0.7) return null;   // food for a walker has to come down to the floor
    const occ = crowd(hab, sim, spi), cap = 4 + 6 * (sim.fish.length / (hab.nx * hab.ny));
    const W = hab.w, H = hab.h, best = []; let tot = 0;
    for (let k = 0; k < 40; k++) {
      let x, y; if (o.me && o.ring) { const a = rnd() * Math.PI * 2, r = o.ring[0] + rnd() * (o.ring[1] - o.ring[0]); x = o.me.x + Math.cos(a) * r; y = o.me.y + Math.sin(a) * r; } else { x = rnd() * W; y = rnd() * H; }
      x = clamp(x, 20, W - 20); y = clamp(y, 20, H - 20);
      const zz = o.floor ? clamp(Math.max(z0[0], 0.78) + rnd() * (z0[1] - Math.max(z0[0], 0.78)), 0.78, 0.95) : z0[0] + rnd() * (z0[1] - z0[0]);
      if (o.onScreen && o.onScreen(x, y, zz)) continue;
      const i = clamp(Math.floor(x / hab.cell), 0, hab.nx - 1), j = clamp(Math.floor(y / hab.cell), 0, hab.ny - 1), s = suit(hab, beh, x, y) * Math.max(0.04, 1 - occ[j * hab.nx + i] / cap), wgt = s * s;
      best.push({ x, y, z: zz, wgt }); tot += wgt;
    }
    if (!best.length) return null;
    let r = rnd() * tot, at = best[best.length - 1]; for (const b of best) { if ((r -= b.wgt) <= 0) { at = b; break; } }
    // a schooling kind is born as a few together
    const n = o.group != null ? o.group : L.school >= 1.2 ? 3 + Math.floor(rnd() * 3) : L.school >= 0.7 ? 2 + Math.floor(rnd() * 2) : 1, g = [], sp2 = hab.cell * 0.35;
    for (let k = 0; k < n; k++) g.push(k ? { x: clamp(at.x + (rnd() - 0.5) * sp2 * 2, 20, W - 20), y: clamp(at.y + (rnd() - 0.5) * sp2 * 2, 20, H - 20), z: clamp(at.z + (rnd() - 0.5) * 0.08, 0, 0.97) } : { x: at.x, y: at.y, z: at.z });
    return { x: at.x, y: at.y, z: at.z, group: g };
  }

  // a new place: everyone free to move is set down again where they suit, schools kept together (a school's first places it, the rest follow)
  function settle(hab, sim, skip) {
    const lead = new Map(); let n = 0;
    for (const f of sim.fish) { if (f.dead || (skip && skip(f))) continue; const sp = sim.speciesRT[f.sp], L = like(sp && sp.beh), l = lead.get(f.sp);
      let q; if (l && L.school >= 0.7 && RND() < 0.8) q = { x: clamp(l.x + (RND() - 0.5) * hab.cell * 0.8, 20, hab.w - 20), y: clamp(l.y + (RND() - 0.5) * hab.cell * 0.8, 20, hab.h - 20), z: l.z };
      else { q = place(hab, sim, f.sp, { group: 1 }); if (q) lead.set(f.sp, q); }
      if (!q) continue; f.x = q.x; f.y = q.y; if (q.z != null && sim.bandFrac) { f.z = q.z; f.zPref = sim.bandFrac(f.sp, q.z); }
      if (sim.resetChain) sim.resetChain(f); n++; }
    return n;
  }
  // the pyramid: a richer place feeds more, and allows a hunter for about every three things to eat
  function budget(hab) { const preyMin = Math.round(8 + 10 * hab.rich); return { preyMin, threatMax: Math.max(2, Math.round(preyMin / 3.5)) }; }

  window.EcologyHabitat = { create, like, suit, place, settle, budget };
})();
