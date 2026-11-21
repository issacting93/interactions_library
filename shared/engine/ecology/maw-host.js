/* maw-host.js: the Maw game's core, mountable in any page that runs the creature sim (World Scene first; the tank page later).

   The page keeps its own sim, camera and renderer. This module brings the rest:
     the kit (PartLib) and its drawing (KitLook from motion/looks.js), the diet (EcologyDiet), the walkers (EcologyWalkers) on the
     page's own ground, and the Maw (EcologyMaw) as the player.

     const mh = MawHost.create({ sim, place: () => ({ tw, th, td, floor, place: { towers, walls, H, cell } }), screenDir: (f, sx, sy) => [tx, ty] });
     await mh.ready;          // the kit is loaded and the walkers stand in the place
     mh.start();              // the Maw is put in the place and is the player's
     each frame: mh.step(dt, () => EcologySim.step(sim, dt));   // the walkers before and after the sim, then the diet and the Maw
     mh.lines()               // { data (x, y, z, a per vertex, tank units), verts, batches: [{ start, count, color }] }: walkers then the Maw
     mh.view()                // EcologyMaw.view: where the camera should look (tank units), or null
     mh.keys(on)              // WASD / arrows walk, space held coils and let go lunges (screen directions through screenDir)

   spawn(W): optional, where the Maw starts, [x, z] in walker units (else a free spot anywhere in the place).
   place(): the page's tank size (tw, th, td) and its floor as a share of td; place.towers and place.walls in walker units, standing on
   place.H(x, z), the page's own ground in walker units (see WorldGen.generate's layout).

   Needs (classic scripts, before this one): EcologySim, EcologyDiet, EcologyMaw, EcologyWalkers, PartLib, and what they need
   (ik, gaits, limb-art, part-lib, species-rig, skeleton, surface, creature-body, world-gen, world-brain, creature-cells, fangs, maw-wing).
   Classic script -> window.MawHost. */
(function () {
  "use strict";
  const here = (document.currentScript && document.currentScript.src) || location.href;
  const looksUrl = new URL("../motion/looks.js", here).href;

  function create(opts) {
    const sim = opts.sim, SPECIES = sim.speciesRT ? window.EcologySpecies.SPECIES : window.EcologySpecies.SPECIES;
    const mh = { sim, opts, diet: null, maw: null, walkers: null, kit: null, f: null, on: false, input: { k: new Set(), hold: false }, ready: null };
    const sheetOf = (name) => {   // as the tank page has it: a species names its kit sheet; its name is only a fallback
      const kit = mh.kit; if (!kit) return null; const own = SPECIES.find((x) => x.name === name); if (own && own.sheet && kit.bySheet[own.sheet]) return own.sheet;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), rest = slug.split("-").slice(1).join("-");
      for (const c of ["sheet-" + slug, slug, "sheet-" + rest, rest]) if (c && kit.bySheet[c]) return c; return null; };
    const cssCol = (v) => v.map((x) => Math.max(0, Math.min(1, x)));
    mh.ready = (async () => {
      const { KitLook } = await import(looksUrl);
      const parts = await window.PartLib.load(opts.partsUrl);
      mh.kit = { byId: Object.fromEntries(parts.map((q) => [q.id, q])), bySheet: {} }; for (const q of parts) (mh.kit.bySheet[q.species] || (mh.kit.bySheet[q.species] = [])).push(q);
      mh.diet = window.EcologyDiet.create(sim, { species: window.EcologySpecies });
      mh.maw = window.EcologyMaw.create({ parts, KitLook, sheetOf, colorOf: (sp) => cssCol(SPECIES[sp].colHi) });
      mh.diet.partsOf = () => mh.maw.lv.reach + mh.maw.lv.bulk + mh.maw.lv.wide;
      const P = opts.place();
      mh.walkers = window.EcologyWalkers.create({ sim, parts, KitLook, floor: P.floor });
      mh.walkers.on = opts.walkers !== false;
      layout();
      return mh;
    })();
    function layout() { const P = opts.place(); window.EcologyWalkers.layout(mh.walkers, { tw: P.tw, th: P.th, td: P.td, seed: P.seed || 1, place: P.place }); if (mh.maw && mh.maw.guest) window.EcologyMaw.relayout(mh.maw); }
    mh.layout = () => { if (mh.walkers) layout(); };
    mh.start = () => {
      if (!mh.walkers) return null;
      const at = opts.spawn ? opts.spawn(mh.walkers.W) : null, f = window.EcologyMaw.attach(mh.maw, { sim, diet: mh.diet, walkers: mh.walkers, at }); if (!f) return null;
      f.fade = 1; mh.diet.mine = f; window.EcologyDiet.startRun(mh.diet, f); mh.diet.goalFn = () => false; mh.f = f; mh.on = true; return f;
    };
    mh.stop = () => { if (mh.maw) window.EcologyMaw.detach(mh.maw); if (mh.diet) { mh.diet.run = null; mh.diet.mine = null; } mh.f = null; mh.on = false; };
    mh.alive = () => !!(mh.on && mh.diet && mh.diet.run && mh.diet.run.state === "play");
    mh.step = (dt, stepSim) => {
      const w = mh.walkers;
      if (w) window.EcologyWalkers.before(w, dt);
      stepSim();
      if (w) window.EcologyWalkers.after(w, dt);
      if (!mh.diet) return;
      window.EcologyDiet.step(mh.diet, dt);
      if (mh.on && mh.maw && mh.maw.guest && mh.maw.body) { feed(); window.EcologyMaw.step(mh.maw, dt); }
      // eaten or starved (or lost its body): it comes back after a moment, where the page's spawn puts it
      if (mh.on && !(mh.alive() && mh.maw.body)) { mh.down = (mh.down || 0) + dt; if (mh.down > (opts.respawn || 2.5)) { mh.down = 0; mh.deaths = (mh.deaths || 0) + 1; mh.stop(); mh.start(); } }
      else mh.down = 0;
    };
    // the player's hand: held keys as a direction on screen, turned into a direction in the tank by the page's camera
    function feed() {
      const K = mh.input.k, sx = (K.has("d") || K.has("arrowright") ? 1 : 0) - (K.has("a") || K.has("arrowleft") ? 1 : 0), sy = (K.has("s") || K.has("arrowdown") ? 1 : 0) - (K.has("w") || K.has("arrowup") ? 1 : 0);
      let move = null; if (sx || sy) { const d = opts.screenDir ? opts.screenDir(mh.maw.guest, sx, sy) : [sx, sy], L = Math.hypot(d[0], d[1]) || 1; move = [d[0] / L, d[1] / L]; }
      window.EcologyMaw.input(mh.maw, { hold: mh.input.hold, aim: null, move });
    }
    const KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const down = (e) => { if (!mh.on || e.target.closest && e.target.closest("input, textarea, select")) return; const k = e.key.toLowerCase();
      if (KEYS.has(k)) { mh.input.k.add(k); e.preventDefault(); } else if (k === " ") { mh.input.hold = true; e.preventDefault(); } };
    const up = (e) => { const k = e.key.toLowerCase(); mh.input.k.delete(k); if (k === " ") mh.input.hold = false; };
    const blur = () => { mh.input.k.clear(); mh.input.hold = false; };
    mh.keys = (on) => { const f = on ? addEventListener : removeEventListener; f("keydown", down); f("keyup", up); f("blur", blur); };
    // the walkers' lines and the Maw's, one array for one draw: the walkers first, each kind in its colour, then the Maw in its ink
    let buf = new Float32Array(0);
    mh.lines = () => {
      const A = mh.walkers && mh.walkers.crew.length ? window.EcologyWalkers.lines(mh.walkers) : null, B = mh.on && mh.maw && mh.maw.guest ? window.EcologyMaw.lines(mh.maw) : null;
      const na = A ? A.verts : 0, nb = B ? B.verts : 0; if (buf.length < (na + nb) * 4) buf = new Float32Array(Math.ceil((na + nb) * 4 * 1.3));
      if (A) buf.set(A.data.subarray(0, na * 4), 0); if (B) buf.set(B.data.subarray(0, nb * 4), na * 4);
      const batches = [...(A ? A.batches : []), ...(B ? B.batches.map((b) => ({ start: b.start + na, count: b.count, color: b.color, maw: true })) : [])];
      return { data: buf, verts: na + nb, batches };
    };
    mh.view = () => (mh.on && mh.maw && mh.maw.guest ? window.EcologyMaw.view(mh.maw) : null);
    return mh;
  }
  window.MawHost = { create };
})();
