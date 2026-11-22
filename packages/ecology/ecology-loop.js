/*
 * Forge — the live ecology loop. Runs EcologySim over a saved city: landmarks pull in the
 * species their prefab attracts, and species that spend time around a building slowly drift
 * their swim toward that building's character. A drifted species can be captured as a new
 * world object (type "species") that remembers the building and the base species.
 *
 *   EcologyLoop.create({ sim, city, prefabs, rigs, rate }) -> loop
 *     sim      an EcologySim instance (already resized + populated)
 *     city     the saved city recipe: { placements: [{ prefab, x, y, span }], extent }
 *     prefabs  Map(prefabId -> { id, name, type, version, attracts: [names or ecology keys] })
 *     rigs     saved rig records (type "rig"): recipe.ecologyKey / swim / drift (recipe.variant
 *              set: the rig belongs to a released variant, slot key "ecologyKey~variantId")
 *   loop.landmarks       [{ prefab, x, y (tank), radius, species: Set(index) }] — also pushed
 *                        into sim.vortices, filtered by species (ecology-sim.js)
 *   loop.tick(dt)        accrues exposure and re-derives every species' live swim
 *   loop.state(i)        { key, name, base, cur, drift 0..1, exposure: { prefabId: s }, top, rigged, allow }
 *   loop.variant(i)      the recipe a captured species is saved with
 *   loop.setAttracts(prefabId, keys), loop.reset(), loop.rate (0..1), loop.tau (s)
 *   loop.restore(i, exposure)  put back a species' exposure ({ prefabId: s }) from an earlier run
 *     setVortices  optional (sim, vortices) -> void; how the landmarks' pull reaches the sim. Defaults to
 *                  EcologySim.setVortices, which replaces sim.vortices; a host with vortices of its own
 *                  (World Scene's towers) passes one that merges them
 *   EcologyLoop.keyForName(name, keys, SPECIES) maps a kit species name ("Butterfly Worm")
 *     or an ecology display name ("Sigil Koi") to an ecology key.
 *
 * Swim keys follow the ecology species data (len waves amp ampPow bend fin speed), the same
 * ones a Forge rig tunes (creature-rig.js), so a rig's swim is the base a species drifts from.
 * Classic script.
 */
(function () {
  "use strict";
  const SWIM_KEYS = ["len", "waves", "amp", "ampPow", "bend", "fin", "speed"];
  const DEFAULT_ALLOW = ["speed", "amp", "waves"];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // each building leans each swim parameter its own way: x0.6 .. x1.5
  const lean = (prefabId, key) => 0.6 + (hash(prefabId + ":" + key) / 4294967296) * 0.9;

  function keyForName(name, keys, SPECIES) {
    if (!name) return null;
    const n = String(name).trim();
    if (keys.includes(n)) return n;
    const byName = SPECIES.find((s) => s.name.toLowerCase() === n.toLowerCase());
    if (byName) return byName.key;
    const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (window.CreatureRig) { const k = window.CreatureRig.ecologyKeyFor("sheet-" + slug, keys); if (k) return k; }
    return keys.find((k) => k === slug || slug.endsWith("-" + k) || slug.split("-").includes(k)) || null;
  }

  function create(o) {
    const sim = o.sim, RT = sim.speciesRT, keys = RT.map((s) => s.key);
    const idx = (k) => keys.indexOf(k);
    const base = RT.map((s) => ({ ...s.swim }));
    const allow = RT.map(() => DEFAULT_ALLOW.slice());
    const rigged = RT.map(() => null);
    for (const r of o.rigs || []) {
      // a rig made for a captured variant drives that variant's slot (key "base~variantId")
      const rk = r.recipe && (r.recipe.variant ? `${r.recipe.ecologyKey}~${r.recipe.variant}` : r.recipe.ecologyKey);
      const i = idx(rk);
      if (i >= 0 && !r.recipe.variant && rigged[i] && rigged[i].recipe.variant) continue;
      if (i < 0) continue;
      // a variant's swim is its own record (base + overrides, already in the slot); its rig adds
      // which parameters may drift, not a second swim
      if (!r.recipe.variant) for (const k of SWIM_KEYS) if (r.recipe.swim && r.recipe.swim[k] != null) base[i][k] = r.recipe.swim[k];
      if (Array.isArray(r.recipe.drift)) allow[i] = r.recipe.drift.filter((k) => SWIM_KEYS.includes(k));
      rigged[i] = r;
    }
    const exposure = RT.map(() => ({}));
    const E = o.city.extent || 18, W = sim.bounds.w, H = sim.bounds.h, k = Math.min(W, H) / (2 * E);
    const loop = { rate: o.rate ?? 0.6, tau: 40, landmarks: [], keys };

    loop.toTank = (x, y) => [W / 2 + x * k, H / 2 + y * k];
    loop.unitsToTank = k;

    function rebuild() {
      loop.landmarks = [];
      for (const p of o.city.placements || []) {
        const pf = o.prefabs.get(p.prefab);
        if (!pf) continue;
        const [x, y] = loop.toTank(p.x, p.y);
        const sp = new Set((pf.attracts || []).map((n) => idx(keyForName(n, keys, RT))).filter((i) => i >= 0));
        loop.landmarks.push({ prefab: pf, cell: p.cell, x, y, radius: Math.max(140, (p.span || 1) * k * 1.8), species: sp, strength: 0.9 });
      }
      const live = loop.landmarks.filter((l) => l.species.size).map((l) => ({ x: l.x, y: l.y, radius: l.radius, strength: l.strength, species: l.species }));
      (o.setVortices || window.EcologySim.setVortices)(sim, live);
    }
    rebuild();

    loop.setAttracts = (prefabId, list) => { const pf = o.prefabs.get(prefabId); if (pf) { pf.attracts = list.slice(); rebuild(); } };

    function derive(i) {
      const ex = exposure[i], tot = Object.values(ex).reduce((a, b) => a + b, 0);
      const d = (1 - Math.exp(-tot / loop.tau)) * loop.rate;
      const cur = { ...base[i] };
      if (tot > 0) for (const key of allow[i]) {
        let m = 0;
        for (const [pid, e] of Object.entries(ex)) m += (e / tot) * (lean(pid, key) - 1);
        cur[key] = +(base[i][key] * (1 + d * m)).toFixed(4);
      }
      return { d, cur, tot };
    }

    loop.tick = (dt) => {
      const heads = new Array(RT.length).fill(0);
      for (const f of sim.fish) if (!f.dead) heads[f.sp]++;
      for (const l of loop.landmarks) {
        if (!l.species.size) continue;
        const r2 = l.radius * l.radius;
        for (const f of sim.fish) {
          if (f.dead || !l.species.has(f.sp)) continue;
          const dx = f.x - l.x, dy = f.y - l.y;
          if (dx * dx + dy * dy < r2) { const ex = exposure[f.sp]; ex[l.prefab.id] = (ex[l.prefab.id] || 0) + dt / Math.max(1, heads[f.sp]); }
        }
      }
      for (let i = 0; i < RT.length; i++) {
        if (!Object.keys(exposure[i]).length && !rigged[i]) continue;
        Object.assign(RT[i].swim, derive(i).cur);
      }
    };

    loop.state = (i) => {
      const { d, cur, tot } = derive(i), ex = exposure[i];
      const top = Object.entries(ex).sort((a, b) => b[1] - a[1])[0];
      return { key: keys[i], name: RT[i].name, base: base[i], cur, drift: d, exposureTotal: tot, exposure: ex, top: top ? o.prefabs.get(top[0]) : null, rigged: rigged[i], allow: allow[i] };
    };
    loop.variant = (i) => {
      const s = loop.state(i);
      return {
        base: s.key, baseName: s.name, swim: s.cur, baseSwim: s.base, drift: +s.drift.toFixed(4), allow: s.allow,
        exposure: Object.fromEntries(Object.entries(s.exposure).map(([k2, v]) => [k2, +v.toFixed(2)])),
        building: s.top ? s.top.id : null, rig: s.rigged ? s.rigged.id : null,
      };
    };
    loop.restore = (i, ex) => { if (exposure[i] && ex) Object.assign(exposure[i], ex); };
    loop.reset = () => { exposure.forEach((e) => { for (const k2 in e) delete e[k2]; }); RT.forEach((s, i) => Object.assign(s.swim, base[i])); };
    return loop;
  }

  window.EcologyLoop = { create, keyForName, SWIM_KEYS, DEFAULT_ALLOW, lean };
})();
