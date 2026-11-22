/* INTERACTIONS — species rigs: a 2D species sheet stood up as a walker def.
   Moved out of the Walker Bestiary so every page that walks or simulates a species builds it the same way
   (the Bestiary, and the body page that runs the same rig as a physics body).

     SpeciesRig.def(SpeciesRig.PLANS.pincer, await PartLib.load())   -> a walker def (segs, legs, arms)

   Needs window.PartLib (shared/engine/mech/part-lib.js) and window.LimbArt (shared/engine/motion/limb-art.js).
   A def is data only: segs[i] = { h, gap, parts: [{ polys, cx, cy, k, lift, mirror }], legs, arms, cy, zF, zB },
   plan.climb (a trait, not a look) lets a physics body grip walls and towers: see shared/engine/motion/surface.js.
   leg = { artObj, ang, len, fracs, reach, knee, hip: [x, y, z] }, arm = { art, artPolys, mount, len, fracs, rest, flap }.
   A wing arm carries its drawing as artPolys under the id in art; a page that draws by id registers it.

   A kit walker is one 2D species, standing up. The rules, from looking at how the sheets are drawn:
   1. One species per walker. Every part comes from the same sheet, so the shapes share one hand.
   2. The body IS the sheet: its centre parts stay on the spine in the order and at the places they were
      drawn (crest, head, body, segments, tail blade), flat, seen from above as the species is.
   3. Its side pieces stay where they were drawn, mirrored. The big swept blades are the silhouette.
   4. Legs are the species' own leg blades, hung where they met the body and sprawled, so they lie in the
      plane of the drawing. Only species drawn with legs are walked; the swifts, moths and koi are flyers.
   5. The body is carried as one piece, unless the species is drawn in repeating segments with a leg pair
      each: then plan.cuts "legs" cuts the spine between the pairs and the pieces follow one another.
   Nothing is extruded, domed into a hull or wrapped in a tube: thickness and lattices read as clutter. */

(function () {
  const { jointAndTip, sliceSpine, medialSpine } = window.LimbArt;
  const lines = (p) => window.PartLib.lines(p);
  function def(plan, parts) {
    const drop = new Set(plan.drop || []);
    const ps = parts.filter((p) => p.species === plan.sheet).filter((p) => !drop.has(p.id) && lines(p).length);
    const ext = (polys) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const pl of polys) for (let j = 0; j < pl.length; j += 2) { x0 = Math.min(x0, pl[j]); x1 = Math.max(x1, pl[j]); y0 = Math.min(y0, pl[j + 1]); y1 = Math.max(y1, pl[j + 1]); } return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2 }; };
    // plan.wings: more blades that beat, beside plan.wing. One may be drawn as a centre part (a blade that crosses the spine): it leaves the body and
    // rides an arm like any wing, mirrored for the other side, so its twin on the sheet goes in plan.drop
    const more = new Set((plan.wings || []).map((w) => w.id));
    const centre = ps.filter((p) => p.side === "center" && !more.has(p.id)).map((p) => ({ p, polys: lines(p), ...ext(lines(p)) }));
    const side = ps.filter((p) => p.side !== "center").map((p) => { const polys = lines(p); return { p, polys, ...ext(polys), ...jointAndTip(polys) }; });
    const Y0 = Math.min(...centre.map((c) => c.y0)), Y1 = Math.max(...centre.map((c) => c.y1)), span = Y1 - Y0, k = plan.len / span;
    const rimAt = (y) => { let m = 0; for (const c of centre) for (const pl of c.polys) for (let j = 0; j < pl.length; j += 2) if (Math.abs(pl[j + 1] - y) < 10) m = Math.max(m, Math.abs(pl[j] - 200)); return Math.min(60, m || 10); };
    // a low rise over each centre plate, so the spine has a crown to it without becoming a hull
    const domes = centre.filter((c) => c.w > 18).map((c) => ({ cy: c.cy, R: Math.max(c.w, c.h) / 2 }));
    const lift = (sx, sy) => { let m = 0; for (const d of domes) { const r = Math.hypot(sx - 200, sy - d.cy) / d.R; if (r < 1) m = Math.max(m, Math.min(d.R, 46) * Math.sqrt(1 - r * r)); } return m * k * (plan.crown ?? 0.36); };
    // legs: the plan names them, or the two longest blades that are not the wing are taken, fore and hind
    const byId = (id) => side.find((q) => q.p.id === id);
    let want = plan.legs;
    if (!want) {
      const c = side.filter((q) => q.L >= 30 && q.p.id !== plan.wing).sort((a, b) => b.L - a.L), pool = c.length > 2 ? c.slice(1) : c;
      const two = pool.slice(0, 2).sort((a, b) => a.J[1] - b.J[1]);
      want = !two.length ? [] : two.length === 1 || Math.abs(two[0].J[1] - two[1].J[1]) < span * 0.18
        ? [{ id: two[0].p.id, f: 0.3, ang: 78 }, { id: (two[1] || two[0]).p.id, f: 0.63, ang: 104 }]
        : [{ id: two[0].p.id, f: 0.3, ang: 78 }, { id: two[1].p.id, f: 0.63, ang: 104 }];
    }
    const used = new Set(want.map((l) => l.id)); if (plan.wing) used.add(plan.wing);
    // where the spine is cut into walker segments. "legs" cuts it between each pair of legs, so every pair has
    // its own piece of body (a centipede); each such piece turns about the point its legs hang from
    const legY = want.map((l) => (l.f != null ? Y0 + l.f * span : l.y ?? (byId(l.id) || { J: [0, 0] }).J[1])).sort((p, q) => p - q);
    const cuts = plan.cuts === "legs" && legY.length > 1
      ? (() => { const d = (legY[legY.length - 1] - legY[0]) / (legY.length - 1), c = [legY[0] - d / 2]; for (let i = 0; i + 1 < legY.length; i++) c.push((legY[i] + legY[i + 1]) / 2); c.push(legY[legY.length - 1] + d / 2); while (c[c.length - 1] + d * 1.4 < Y1) c.push(c[c.length - 1] + d); return c; })()
      : plan.cuts === "parts"
      // "parts": a cut between every centre part, as the ecology has it, where each part rides the spine on
      // its own. Parts that sit on top of one another stay together; no piece is shorter than a twentieth of the body.
      ? (() => { const cl = []; for (const c of centre.slice().sort((p, q) => p.y0 - q.y0)) { const last = cl[cl.length - 1]; if (last && c.cy < last.y1) last.y1 = Math.max(last.y1, c.y1); else cl.push({ y0: c.y0, y1: c.y1 }); }
          const c = []; for (let i = 0; i + 1 < cl.length; i++) { const y = (cl[i].y1 + cl[i + 1].y0) / 2; if (y - (c.length ? c[c.length - 1] : Y0) > span * 0.05 && Y1 - y > span * 0.05) c.push(y); } return c; })()
      : (plan.cuts || []).map((f) => Y0 + f * span);
    const segOf = (y) => { let i = 0; while (i < cuts.length && y > cuts[i]) i++; return i; };
    const N = cuts.length + 1, org = Array.from({ length: N }, (_, i) => { const lo = i ? cuts[i - 1] : Y0, hi = i < cuts.length ? cuts[i] : Y1, own = legY.find((y) => y > lo && y <= hi); return own ?? (lo + hi) / 2; });
    // zF, zB: where this piece's front and back cuts fall, in its own frame (for checking the joints close)
    const segs = org.map((cy, i) => ({ h: 0, gap: i ? (cy - org[i - 1]) * k : 0, parts: [], legs: [], arms: [], cy, zF: (cy - (i ? cuts[i - 1] : Y0)) * k, zB: (cy - (i < cuts.length ? cuts[i] : Y1)) * k }));
    for (const c of centre) { const sg = segs[segOf(c.cy)]; sg.parts.push({ id: c.p.id, polys: c.polys, cx: 200, cy: sg.cy, k, lift }); }
    for (const q of side) if (!used.has(q.p.id) || (plan.keepArt || []).includes(q.p.id)) { const sg = segs[segOf(q.J[1])]; sg.parts.push({ id: q.p.id, polys: q.polys, cx: 200, cy: sg.cy, k, lift, mirror: true }); }
    const legLen = [];
    for (const l of want) {
      const q = byId(l.id); if (!q) continue;
      const sc = l.s || Math.min(3, Math.max(1, (plan.leg || 0) / (q.L * k))), jy = l.f != null ? Y0 + l.f * span : l.y ?? q.J[1], jx = l.f != null || l.y != null ? 200 - rimAt(jy) * 0.8 : q.J[0];
      const move = (x, y) => [jx + (x - q.J[0]) * sc, jy + (y - q.J[1]) * sc];
      const polys = q.polys.map((pl) => { const o = new Array(pl.length); for (let j = 0; j < pl.length; j += 2) { const m = move(pl[j], pl[j + 1]); o[j] = m[0]; o[j + 1] = m[1]; } return o; });
      const J = [jx, jy], T = move(q.T[0], q.T[1]), fr = plan.fracs || [0.4, 0.36, 0.24], len = q.L * sc * k, sg = segs[segOf(jy)];
      const hx = Math.max(0.25 * rimAt(jy), Math.min(200 - jx, rimAt(jy) * 0.85));
      sg.legs.push({ id: l.id, keepOwn: true, artObj: sliceSpine(polys, medialSpine(polys, J, T, 8), fr), ang: l.ang ?? 90, len, fracs: fr, reach: l.reach ?? plan.reach ?? 0.4, knee: l.knee, hip: [hx * k, lift(200 - hx, jy) * 0.5, (sg.cy - jy) * k] });
      legLen.push(len);
    }
    const Lm = legLen.length ? legLen.slice().sort((a, b) => a - b)[Math.floor(legLen.length / 2)] : 1;
    for (const sg of segs) sg.h = (plan.h ?? 0.7) * Lm;
    // a wing: the species' own wing blade, cut into three bones, beating from where it met the body
    const wingSet = [plan.wing && byId(plan.wing) && { wg: byId(plan.wing), o: {} }].concat((plan.wings || []).map((w) => { const q = ps.find((x) => x.id === w.id); if (!q) return null; const polys = lines(q); return { wg: { p: q, polys, ...jointAndTip(polys) }, o: w }; })).filter(Boolean);
    for (const { wg, o } of wingSet) {
      const id = "SW-" + wg.p.id;   // the wing's drawing rides on the arm (artPolys); a page registers it under this id
      const sg = segs[segOf(wg.J[1])], len = wg.L * k * (plan.wingScale || 1), mx = (200 - wg.J[0]) * k, mz = (sg.cy - wg.J[1]) * k, my = lift(wg.J[0], wg.J[1]) + 0.03;
      const dx = (wg.J[0] - wg.T[0]) / wg.L, dz = -(wg.T[1] - wg.J[1]) / wg.L;
      sg.arms.push({ art: id, artPolys: wg.polys, mount: [mx, my, mz], len, fracs: [0.4, 0.34, 0.26], rest: [mx + dx * len * 0.86, my + 0.12 * len, mz + dz * len * 0.86], flap: { amps: o.amps || [24, 18, 14], lags: [0, 0.1, 0.22], rate: o.rate || 4.2, phase: o.phase || 0, ground: plan.wingGround ?? 1 } });
    }
    return { segs, smooth: segs.length > 1, flatLimbs: plan.flat !== false, Lm, ...(plan.float ? { float: plan.float } : {}), speed: (plan.speed ?? 0.62) * Math.pow(Lm, 0.6), stride: (plan.stride ?? 0.42) * Lm, lift: (plan.step ?? 0.2) * Lm, turn: plan.turn ?? 1.4, bob: plan.bob ?? 0.012, ...(plan.climb ? { climb: true } : {}) };
  }

  // the Kit Quad Mech (the qilin): a hull, turret, side pods and visor over four legs, one part per bone when segmented.
  // Lifted from the Walker Bestiary page so the tank and the Specimen page stand it up the same way.
  function quad(parts, o) {
    o = o || {};
    const { segmentArt } = window.LimbArt, byId = new Map(parts.map((p) => [p.id, p]));
    const polysOf = (id) => { const e = byId.get(id); return e ? lines(e) : null; };
    const box = (polys) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const pl of polys) for (let i = 0; i + 1 < pl.length; i += 2) { x0 = Math.min(x0, pl[i]); x1 = Math.max(x1, pl[i]); y0 = Math.min(y0, pl[i + 1]); y1 = Math.max(y1, pl[i + 1]); } return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 }; };
    const at = (id, w, q) => { const polys = polysOf(id); if (!polys) return null; const b = box(polys);
      return { polys, mirror: byId.get(id).side === "left", cx: b.cx || 1e-6, cy: b.cy, k: w / b.w, y: q.y || 0, z: q.z || 0, ...(q.dome ? { dome: { ...q.dome, c: [b.cx, b.cy] } } : {}) }; };
    const body = [at("P024", 0.62, { y: -0.1 }), at("P523", 1.0, { y: 0.02, z: -0.04 }), at("P353", 0.46, { y: 0.06 }),
      at("P619", 0.92, { y: 0.1, z: -0.02, dome: { R: 62, hf: 0.42 } }), at("P355", 0.44, { y: 0.2, z: 0.44 })].filter(Boolean);
    const leg = (ids, ang, len) => { const a = ang * Math.PI / 180, r = 0.3, fr = o.segmented ? [0.42, 0.4, 0.18] : [0.4, 0.36, 0.24];
      const P = ids.map(polysOf); if (P.some((x) => !x)) return null;
      const artObj = o.segmented ? segmentArt(P, fr) : sliceSpine(P[0], (() => { const { J, T } = jointAndTip(P[0]); return [J, T]; })(), fr);
      return { keepOwn: true, artObj, ang, len, fracs: fr, reach: 0.6, hip: [Math.sin(a) * r, 0.02, Math.cos(a) * r] }; };
    const legs = (o.segmented ? [leg(["P128", "P183", "P444"], 52, 1.55), leg(["P245", "P187", "P444"], 128, 1.45)]
                              : [leg(["P396"], 52, 1.55), leg(["P183"], 128, 1.45)]).filter(Boolean);
    return { segs: [{ h: 0.62, parts: body, arms: [], legs }], frame: true, speed: 0.75, stride: 0.42, lift: 0.28, turn: 1.6, Lm: 1.5, ...(o.appendages ? { appendages: o.appendages } : {}) };
  }
  // which species each walker is, and which of its blades carry it. float: what it does past that speed (leg
  // lengths a second on the Walk page); the swim numbers are that species' own, from ecology-species.js,
  // except the Centiwyrm's, which is set wavier than its ecology entry (waves 0.9, amp 1, ampPow 1.6)
  const PLANS = {
    puffer:    { sheet: "sheet-blade-puffer", len: 2.6, h: 0.46, reach: 0.82, fracs: [0.3, 0.4, 0.3], legs: [{ id: "P029", ang: 50 }, { id: "P028", ang: 80 }, { id: "P027", ang: 108 }, { id: "P026", ang: 138 }],
                 float: { kind: "swim", at: 3.0, rise: 0.8, lag: 0, fold: 0.3, swim: { waves: 0.5, amp: 0.5, ampPow: 2.0, bend: 0.6, fin: 0.5, speed: 0.7 } }, speed: 0.8, stride: 0.42, step: 0.28, turn: 1.7 },
    strider:   { sheet: "sheet-carapace-strider", len: 2.0, h: 0.5, reach: 0.8, fracs: [0.3, 0.4, 0.3], legs: [{ id: "P079", ang: 60 }, { id: "P078", ang: 96 }, { id: "P077", ang: 132 }], speed: 0.8, stride: 0.44, step: 0.3, turn: 1.6 },
    pincer:    { sheet: "sheet-pincer-crawler", climb: true, cuts: "legs", len: 1.3, leg: 0.8, h: 0.42, reach: 0.82, fracs: [0.3, 0.4, 0.3], legs: [{ id: "P252", ang: 66 }, { id: "P254", ang: 92 }, { id: "P256", ang: 118 }], speed: 0.9, stride: 0.45, step: 0.3, turn: 1.8 },
    centiwyrm: { sheet: "pearl-chasing-centiwyrm", len: 2.8, leg: 0.6, h: 0.4, reach: 0.8, cuts: "parts",
                 float: { kind: "swim", at: 3.0, rise: 1.3, crawl: 0.35, swim: { waves: 1.3, amp: 1.5, ampPow: 1.2, bend: 1, fin: 0.21, speed: 1 } }, legs: [{ id: "P398", ang: 72 }, { id: "P400", ang: 86 }, { id: "P402", ang: 98 }, { id: "P404", ang: 112 }], speed: 0.7, stride: 0.5, step: 0.26, turn: 1.3 },
  // no legs: the body page's swimmer. It slithers on land and swims with the ecology's own leech wave
  leech:     { sheet: "sheet-studded-leech", len: 2.4, h: 0.16, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.7, swim: { waves: 1.6, amp: 0.8, ampPow: 0.6, bend: 1.8, fin: 0.2, speed: 1 } }, speed: 0.7, stride: 0.4, turn: 1.6 },
  // the ecology's own swimmers, legless, each part riding the spine as in the tank, with its own swim numbers from ecology-species.js
  wisp:      { sheet: "sheet-lantern-wisp", len: 0.9, h: 0.2, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.5, swim: { waves: 1, amp: 1, ampPow: 1, bend: 1.6, fin: 0.2, speed: 0.7 } }, speed: 0.6, stride: 0.3, turn: 2.2 },
  koi:       { sheet: "sheet-koi", len: 2.4, h: 0.25, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.6, swim: { waves: 0.9, amp: 1, ampPow: 1.6, bend: 1, fin: 0.21, speed: 1 } }, speed: 0.8, stride: 0.4, turn: 1.8 },
  serpent:   { sheet: "sheet-serpent", len: 3.2, h: 0.2, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.6, swim: { waves: 1.6, amp: 0.55, ampPow: 0.7, bend: 2.2, fin: 0.32, speed: 1.1 } }, speed: 0.9, stride: 0.4, turn: 1.6 },
  jelly:     { sheet: "sheet-bell-jelly", len: 2.2, h: 0.3, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.8, swim: { waves: 1.1, amp: 0.5, ampPow: 1, bend: 2, fin: 0.3, speed: 0.6 } }, speed: 0.5, stride: 0.4, turn: 1.2 },
  manta:     { sheet: "sheet-glass-manta", len: 5, h: 0.3, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.9, swim: { waves: 0.45, amp: 0.35, ampPow: 2.2, bend: 0.7, fin: 0.42, speed: 0.8 } }, speed: 0.8, stride: 0.5, turn: 1 },
  lancer:    { sheet: "crowned-sickle-lancer", len: 2.4, leg: 0.75, h: 0.48, reach: 0.78, wing: "P549", wings: [{ id: "P550", amps: [15, 11, 9], phase: 0.9 }], drop: ["P551"], wingGround: 0.65, float: { kind: "fly", at: 3.0, rise: 2.2, swim: { speed: 1.1 } }, legs: [{ id: "P556", ang: 56 }, { id: "P555", ang: 88 }, { id: "P554", ang: 120 }], speed: 0.75, stride: 0.44, step: 0.28, turn: 1.5 },
  };
  // the qilin: Zac's Blender Qilin (the Walker Bestiary's GLB mock, shared/data/mechs/blender-mech.glb) put through Kit to 3D. Its pieces were
  // traced flat into the kit by tools/kit3d/glb-to-kit.mjs (sheet "sheet-blender-qilin"): the two body plates from above (P721 lower,
  // P722 upper), the leg from the side (P723; the mock's legs are all one mesh) and the head from the front (P724). From here they go the way
  // every kit part does: the plates made solid as cores, the leg drawing cut along its spine and skinned (SkinLeg), the head made solid
  // (PartSolid) on the neck's tip. The plates sit where the mock has them (heights and fore-aft offsets from the GLB, at 0.26 walker units to
  // its unit); the legs are drawn longer, as the Bestiary stands them (a horse's, not the mock's stubs). It runs as a horse (Gaits.RUN.horse)
  // the leg's spine on its drawing: from the hip (the middle of its flat top) down the thigh, which slants back to the knee (the drawing's
  // leftmost bulge), then down the shin to the foot. Hip and foot from shared/data/kit-sources/blender-qilin-joints.json, the rest read off the outline
  const QILIN_LEG = [[223, 491], [205, 518], [180, 545], [155, 570], [168, 600], [186, 635], [198, 670], [210, 704]];
  function qilin(parts) {
    const byId = new Map(parts.map((p) => [p.id, p]));
    const polysOf = (id) => { const e = byId.get(id); return e ? lines(e) : null; };
    const box = (polys) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const pl of polys) for (let i = 0; i + 1 < pl.length; i += 2) { x0 = Math.min(x0, pl[i]); x1 = Math.max(x1, pl[i]); y0 = Math.min(y0, pl[i + 1]); y1 = Math.max(y1, pl[i + 1]); } return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 || 1, h: y1 - y0 || 1 }; };
    const at = (id, w, q) => { const polys = polysOf(id); if (!polys) return null; const b = box(polys);
      return { polys, mirror: false, cx: b.cx || 1e-6, cy: b.cy, k: w / b.w, y: q.y || 0, z: q.z || 0, solid: q.solid, ...(q.dome ? { dome: { ...q.dome, c: [b.cx, b.cy] } } : {}) }; };
    const M = 0.26, FLAT = { mode: "plate", thick: 0.1, inner: 0.25, edge: 0.04 };   // the mock's plates are thin flat sheets: a low bevel to a flat top, not a rounded belly   // walker units to one of the mock's
    const body = [at("P721", 5.76 * M, { y: 0, z: 0.16, solid: FLAT }), at("P722", 6.53 * M, { y: 0.71 * M, z: -0.02, solid: FLAT })].filter(Boolean);
    // the traced leg has long straight edges (the mock's thigh is a few flat faces): cut them into short steps, so an edge that runs past the knee bends with it
    const fine = (polys, step) => polys.map((pl) => { const o = [pl[0], pl[1]]; for (let i = 2; i + 1 < pl.length; i += 2) { const ax = pl[i - 2], ay = pl[i - 1], n = Math.max(1, Math.ceil(Math.hypot(pl[i] - ax, pl[i + 1] - ay) / step)); for (let j = 1; j <= n; j++) o.push(ax + (pl[i] - ax) * j / n, ay + (pl[i + 1] - ay) * j / n); } return o; });
    const LP0 = polysOf("P723"), LP = LP0 && fine(LP0, 4); let legs = [];
    if (LP) { const fr = [0.42, 0.42, 0.16], spine = QILIN_LEG;
      const leg = (ang, r, len) => { const a = ang * Math.PI / 180; return { keepOwn: true, artObj: sliceSpine(LP, spine, fr), ang, len, fracs: fr, reach: 0.12, upright: 1, pole: [-1, 0.35], hip: [Math.sin(a) * r, 0.0, Math.cos(a) * r] }; };
      // upright: the leg is drawn from the side, so it stands in its own plane under the body, as the mock's do, not sprawled flat like a sheet
      // creature's; pole: its knee points back, the way the drawing's bulges
      legs = [leg(44, 0.47, 1.6), leg(143, 0.55, 1.55)]; }
    const hp = polysOf("P724"), hb = hp && box(hp);
    return { segs: [{ h: 1.35, parts: body, arms: [], legs }], frame: true, speed: 0.6, stride: 0.5, lift: 0.3, turn: 1.3, Lm: 1.6, appendages: "qilin", bl: 1.2, run: "horse",   // h: hips high, so the long legs stand near straight, as the Bestiary has them
     
      neck: { rise: 0.14, reach: 0.46, arch: 0.04, rings: 9, mane: true },   // as the Bestiary carries it: the neck reaching forward and low, the head out ahead of the plates
      head: hp ? { polys: hp, k: (2.9 * M) / hb.w, cx: hb.cx, cy: hb.cy, h: hb.h } : null };   // the head, 2.9 of the mock's units across, made solid on the neck
  }
  // the mystic qilin: the Qilin board's three directions (Jade calm, Antlered flame, Celestial) built from kit parts and made solid. A deer's
  // barrel of scale bands (Crowned lancer plates, turned across the back, deepest at the chest), the Blender qilin's leg drawn slim and
  // standing upright, a neck rising high and scaled with smaller bands, the Fin dragon's head in profile on it, and on the head
  // a jade horn (Sickle swift spike) or antlers (Horned vampire horns) or both, Bell jelly whiskers, a gold sun disc behind it for the
  // Celestial; Sickle swift blades as flames at shoulder and haunch, a Clawed centiwyrm ring on each flank, and a Comb drifter plume for the
  // tail's tuft. o: { crown: "horn" | "antlers" | "both", flames: 0..2, halo }, the board's switches
  const MYSTIC = { jade: { crown: "horn", flames: 0.7, halo: false }, antlered: { crown: "antlers", flames: 1.3, halo: false }, celestial: { crown: "horn", flames: 1, halo: true } };
  function mysticQilin(parts, o) {
    o = Object.assign({}, MYSTIC.jade, o || {});
    const byId = new Map(parts.map((p) => [p.id, p])), polysOf = (id) => { const e = byId.get(id); return e ? lines(e) : null; };
    const box = (polys) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const pl of polys) for (let i = 0; i + 1 < pl.length; i += 2) { x0 = Math.min(x0, pl[i]); x1 = Math.max(x1, pl[i]); y0 = Math.min(y0, pl[i + 1]); y1 = Math.max(y1, pl[i + 1]); } return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 || 1, h: y1 - y0 || 1 }; };
    const turn = (polys) => { const b = box(polys); return polys.map((pl) => pl.map((v, i) => i % 2 ? b.cy + (pl[i - 1] - b.cx) : b.cx - (pl[i + 1] - b.cy))); };   // a quarter turn about its centre
    // body: the bands across the back, hip to chest, each a little wider and higher toward the chest
    const BAND = polysOf("P564"), band = BAND && turn(BAND), bb = band && box(band), body = [];
    if (band) for (let i = 0; i < 9; i++) { const q = i / 8, w = 0.36 + 0.2 * Math.pow(Math.sin(q * 2.6), 1.2), z = -0.55 + q * 1.1;
      body.push({ polys: band, mirror: false, cx: bb.cx, cy: bb.cy, k: w / bb.w, y: 0.05 * Math.sin(q * Math.PI) + 0.03 * q, z, solid: { thick: 1.25, inner: 0.3 } }); }
    // legs: the Blender leg, slimmed toward its own spine, upright
    const fine = (polys, step) => polys.map((pl) => { const r = [pl[0], pl[1]]; for (let i = 2; i + 1 < pl.length; i += 2) { const ax = pl[i - 2], ay = pl[i - 1], n = Math.max(1, Math.ceil(Math.hypot(pl[i] - ax, pl[i + 1] - ay) / step)); for (let j = 1; j <= n; j++) r.push(ax + (pl[i] - ax) * j / n, ay + (pl[i + 1] - ay) * j / n); } return r; });
    const spineX = (y) => { const S = QILIN_LEG; if (y <= S[0][1]) return S[0][0]; for (let i = 1; i < S.length; i++) if (y <= S[i][1]) { const f = (y - S[i - 1][1]) / (S[i][1] - S[i - 1][1]); return S[i - 1][0] + (S[i][0] - S[i - 1][0]) * f; } return S[S.length - 1][0]; };
    const LP0 = polysOf("P723"), LP = LP0 && fine(LP0, 4).map((pl) => pl.map((v, i) => i % 2 ? v : spineX(pl[i + 1]) + (v - spineX(pl[i + 1])) * 0.55));
    const legs = []; if (LP) { const fr = [0.42, 0.42, 0.16]; const leg = (ang, r, len) => { const a = ang * Math.PI / 180; return { keepOwn: true, artObj: sliceSpine(LP, QILIN_LEG, fr), ang, len, fracs: fr, reach: 0.1, upright: 1, pole: [-1, 0.35], hip: [Math.sin(a) * r, 0, Math.cos(a) * r] }; };
      legs.push(leg(26, 0.5, 1.55), leg(154, 0.5, 1.5)); }
    // what it carries, each a kit drawing made solid (AppendageSolid parts)
    const P = (id, size, d) => { const polys = polysOf(id); if (!polys) return null; const b = box(polys); return Object.assign({ polys, cx: b.cx, cy: b.cy, k: size / Math.max(b.w, b.h) }, d); };
    const F = o.flames || 0, attach = [
      band && P("P564", 0.200, { at: "neck", q: 0.08, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      band && P("P564", 0.188, { at: "neck", q: 0.20, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      band && P("P564", 0.176, { at: "neck", q: 0.32, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      band && P("P564", 0.164, { at: "neck", q: 0.44, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      band && P("P564", 0.152, { at: "neck", q: 0.56, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      band && P("P564", 0.140, { at: "neck", q: 0.68, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      band && P("P564", 0.128, { at: "neck", q: 0.80, plane: "front", rot: 90, pos: [0, 0.075, 0], solid: { thick: 0.7 } }),
      P("P223", 0.5, { at: "head", plane: "side", flip: true, rot: -12, pos: [0, 0.02, 0.12], solid: { thick: 1.1 } }),   // the Fin dragon's head in profile, snout forward
      (o.crown === "horn" || o.crown === "both") && P("P293", 0.26, { at: "head", plane: "side", rot: 28, pos: [0, 0.16, 0.08], solid: { mode: "blade", thick: 0.6 } }),
      (o.crown === "antlers" || o.crown === "both") && P("P656", 0.36, { at: "head", plane: "side", flip: true, rot: -15, pos: [0.07, 0.2, -0.02], pair: true, solid: { mode: "blade", thick: 0.5 } }),
      P("P017", 0.3, { at: "head", plane: "side", flip: true, rot: -25, pos: [0.05, -0.04, 0.24], pair: true, solid: { thick: 0.5 } }),
      o.halo && P("P181", 0.8, { at: "head", plane: "front", pos: [0, 0.12, -0.12], solid: { mode: "plate", thick: 0.08 } }),
      P("P448", 0.2, { at: "body", plane: "side", pos: [0.25, 0.0, 0.05], pair: true, solid: { mode: "plate", thick: 0.15 } }),
      F > 0 && P("P290", 0.42 * F, { at: "body", plane: "side", flip: true, rot: 10, pos: [0.24, 0.1 + 0.06 * F, 0.36], pair: true, flicker: 1, solid: { mode: "blade", thick: 0.4 } }),
      F > 0 && P("P291", 0.38 * F, { at: "body", plane: "side", flip: true, rot: -5, pos: [0.22, 0.1 + 0.06 * F, -0.42], pair: true, flicker: 1, solid: { mode: "blade", thick: 0.4 } }),
      F > 0 && P("P093", 0.36 * F, { at: "neck", q: 0.5, plane: "side", flip: true, rot: 60, pos: [0, 0.12, 0], flicker: 1, solid: { mode: "blade", thick: 0.4 } }),
      P("P094", 0.32 + 0.12 * F, { at: "tail", plane: "side", flip: true, rot: 20, pos: [0, 0.02, 0], flicker: F > 0 ? 1 : 0.3, solid: { mode: "blade", thick: 0.4 } }),
    ].filter(Boolean);
    return { segs: [{ h: 1.4, parts: body, arms: [], legs }], frame: true, speed: 0.6, stride: 0.5, lift: 0.34, turn: 1.3, Lm: 1.55, run: "horse", appendages: "qilin", bl: 1.2,
      neck: { reach: 0.34, rise: 0.56, arch: 0.07, rings: 9, r0: 0.06, r1: 0.04, mane: false, horns: false }, tail: { length: 0.42, start: 48, turn: -30, rings: 10, r0: 0.045, r1: 0.02 }, noTuft: true,
      attach, mystic: o };
  }
  window.SpeciesRig = { def, quad, qilin, mysticQilin, MYSTIC, PLANS };
})();
