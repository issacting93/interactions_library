/* INTERACTIONS — species rigs: a 2D species sheet stood up as a walker def.
   Moved out of the Walker Bestiary so every page that walks or simulates a species builds it the same way
   (the Bestiary, and the body page that runs the same rig as a physics body).

     SpeciesRig.def(SpeciesRig.PLANS.pincer, await PartLib.load())   -> a walker def (segs, legs, arms)

   Needs window.PartLib (shared/engine/mech/part-lib.js) and window.LimbArt (shared/engine/motion/limb-art.js).
   A def is data only: segs[i] = { h, gap, parts: [{ polys, cx, cy, k, lift, mirror }], legs, arms, cy, zF, zB },
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
    const centre = ps.filter((p) => p.side === "center").map((p) => ({ p, polys: lines(p), ...ext(lines(p)) }));
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
    for (const c of centre) { const sg = segs[segOf(c.cy)]; sg.parts.push({ polys: c.polys, cx: 200, cy: sg.cy, k, lift }); }
    for (const q of side) if (!used.has(q.p.id) || (plan.keepArt || []).includes(q.p.id)) { const sg = segs[segOf(q.J[1])]; sg.parts.push({ polys: q.polys, cx: 200, cy: sg.cy, k, lift, mirror: true }); }
    const legLen = [];
    for (const l of want) {
      const q = byId(l.id); if (!q) continue;
      const sc = l.s || Math.min(3, Math.max(1, (plan.leg || 0) / (q.L * k))), jy = l.f != null ? Y0 + l.f * span : l.y ?? q.J[1], jx = l.f != null || l.y != null ? 200 - rimAt(jy) * 0.8 : q.J[0];
      const move = (x, y) => [jx + (x - q.J[0]) * sc, jy + (y - q.J[1]) * sc];
      const polys = q.polys.map((pl) => { const o = new Array(pl.length); for (let j = 0; j < pl.length; j += 2) { const m = move(pl[j], pl[j + 1]); o[j] = m[0]; o[j + 1] = m[1]; } return o; });
      const J = [jx, jy], T = move(q.T[0], q.T[1]), fr = plan.fracs || [0.4, 0.36, 0.24], len = q.L * sc * k, sg = segs[segOf(jy)];
      const hx = Math.max(0.25 * rimAt(jy), Math.min(200 - jx, rimAt(jy) * 0.85));
      sg.legs.push({ keepOwn: true, artObj: sliceSpine(polys, medialSpine(polys, J, T, 8), fr), ang: l.ang ?? 90, len, fracs: fr, reach: l.reach ?? plan.reach ?? 0.4, knee: l.knee, hip: [hx * k, lift(200 - hx, jy) * 0.5, (sg.cy - jy) * k] });
      legLen.push(len);
    }
    const Lm = legLen.length ? legLen.slice().sort((a, b) => a - b)[Math.floor(legLen.length / 2)] : 1;
    for (const sg of segs) sg.h = (plan.h ?? 0.7) * Lm;
    // a wing: the species' own wing blade, cut into three bones, beating from where it met the body
    const wg = plan.wing && byId(plan.wing);
    if (wg) {
      const id = "SW-" + wg.p.id;   // the wing's drawing rides on the arm (artPolys); a page registers it under this id
      const sg = segs[segOf(wg.J[1])], len = wg.L * k * (plan.wingScale || 1), mx = (200 - wg.J[0]) * k, mz = (sg.cy - wg.J[1]) * k, my = lift(wg.J[0], wg.J[1]) + 0.03;
      const dx = (wg.J[0] - wg.T[0]) / wg.L, dz = -(wg.T[1] - wg.J[1]) / wg.L;
      sg.arms.push({ art: id, artPolys: wg.polys, mount: [mx, my, mz], len, fracs: [0.4, 0.34, 0.26], rest: [mx + dx * len * 0.86, my + 0.12 * len, mz + dz * len * 0.86], flap: { amps: [24, 18, 14], lags: [0, 0.1, 0.22], rate: 4.2, ground: plan.wingGround ?? 1 } });
    }
    return { segs, smooth: segs.length > 1, flatLimbs: plan.flat !== false, Lm, ...(plan.float ? { float: plan.float } : {}), speed: (plan.speed ?? 0.62) * Math.pow(Lm, 0.6), stride: (plan.stride ?? 0.42) * Lm, lift: (plan.step ?? 0.2) * Lm, turn: plan.turn ?? 1.4, bob: plan.bob ?? 0.012 };
  }
  // which species each walker is, and which of its blades carry it. float: what it does past that speed (leg
  // lengths a second on the Walk page); the swim numbers are that species' own, from ecology-species.js,
  // except the Centiwyrm's, which is set wavier than its ecology entry (waves 0.9, amp 1, ampPow 1.6)
  const PLANS = {
    puffer:    { sheet: "sheet-blade-puffer", len: 2.6, h: 0.46, reach: 0.82, fracs: [0.3, 0.4, 0.3], legs: [{ id: "P029", ang: 50 }, { id: "P028", ang: 80 }, { id: "P027", ang: 108 }, { id: "P026", ang: 138 }],
                 float: { kind: "swim", at: 3.0, rise: 0.8, lag: 0, fold: 0.3, swim: { waves: 0.5, amp: 0.5, ampPow: 2.0, bend: 0.6, fin: 0.5, speed: 0.7 } }, speed: 0.8, stride: 0.42, step: 0.28, turn: 1.7 },
    strider:   { sheet: "sheet-carapace-strider", len: 2.0, h: 0.5, reach: 0.8, fracs: [0.3, 0.4, 0.3], legs: [{ id: "P079", ang: 60 }, { id: "P078", ang: 96 }, { id: "P077", ang: 132 }], speed: 0.8, stride: 0.44, step: 0.3, turn: 1.6 },
    pincer:    { sheet: "sheet-pincer-crawler", len: 1.3, leg: 0.8, h: 0.42, reach: 0.82, fracs: [0.3, 0.4, 0.3], legs: [{ id: "P252", ang: 66 }, { id: "P254", ang: 92 }, { id: "P256", ang: 118 }], speed: 0.9, stride: 0.45, step: 0.3, turn: 1.8 },
    centiwyrm: { sheet: "pearl-chasing-centiwyrm", len: 2.8, leg: 0.6, h: 0.4, reach: 0.8, cuts: "parts",
                 float: { kind: "swim", at: 3.0, rise: 1.3, crawl: 0.35, swim: { waves: 1.3, amp: 1.5, ampPow: 1.2, bend: 1, fin: 0.21, speed: 1 } }, legs: [{ id: "P398", ang: 72 }, { id: "P400", ang: 86 }, { id: "P402", ang: 98 }, { id: "P404", ang: 112 }], speed: 0.7, stride: 0.5, step: 0.26, turn: 1.3 },
  // no legs: the body page's swimmer. It slithers on land and swims with the ecology's own leech wave
  leech:     { sheet: "sheet-studded-leech", len: 2.4, h: 0.16, cuts: "parts", legs: [], float: { kind: "swim", rise: 0.7, swim: { waves: 1.6, amp: 0.8, ampPow: 0.6, bend: 1.8, fin: 0.2, speed: 1 } }, speed: 0.7, stride: 0.4, turn: 1.6 },
  lancer:    { sheet: "crowned-sickle-lancer", len: 2.4, leg: 0.75, h: 0.48, reach: 0.78, wing: "P549", wingGround: 0.2, float: { kind: "fly", at: 3.0, rise: 2.2, swim: { speed: 1.1 } }, legs: [{ id: "P556", ang: 56 }, { id: "P555", ang: 88 }, { id: "P554", ang: 120 }], speed: 0.75, stride: 0.44, step: 0.28, turn: 1.5 },
  };
  window.SpeciesRig = { def, PLANS };
})();
