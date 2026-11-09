/* shared/engine/motion/limb-art.js — turning drawn limbs into bones.
   A mechanism, not a look: it reads your line art and says which piece of it rides which bone.
   The drawing itself is never changed, only cut and carried.

   Coordinates are 2D sheet units (the Forge 400 x 400 top view, front up, left limbs on the left).
   A polyline is a flat array [x0, y0, x1, y1, ...].

     LimbArt.flattenD(d, steps)          -> polylines from SVG path data (M L C Z, each curve sampled
                                            `steps` times, default 4)
     LimbArt.jointAndTip(polys)          -> { J, T, L }: the end nearest the body, the point farthest
                                            from it, and the distance between
     LimbArt.sliceSpine(polys, spine, fracs)
                                         -> { L, bones, nseg, src }: the drawing cut into one slab per
                                            bone along a spine polyline (joint -> ... -> tip). Each bone's
                                            lines are [along, across, ...] from that bone's start, so a
                                            renderer can lay them along whatever bone the IK gives it.
     LimbArt.medialSpine(polys, J, T, n) -> a curved spine through the middle of a limb, J to T
     LimbArt.guidedSpine(polys, way, maxW)
                                         -> a spine through hand-placed waypoints (hip knot, elbow,
                                            blade...), pulled to the centre of the drawing between them
     LimbArt.parseForgeSVG(text)         -> a Bestiary Forge export read back into body parts, limb
                                            chains (parts joined end to end), ornaments, veil, accents,
                                            carve lines and halos. Throws if the file has no Forge parts.
                                            Needs a browser (uses DOMParser).

   Used by world/forges/walker-bestiary and its rig-sheet tool. Classic script, no dependencies. */
(function () {
  "use strict";
  const DEG = Math.PI / 180;

  // cut a drawn limb into bones along a spine polyline (joint -> ... -> tip): each point is projected
  // onto the spine to get (distance along it, offset from it), then clipped into one slab per bone
  function sliceSpine(polys, spine, fracs) {
    const cum = [0];
    for (let i = 0; i + 1 < spine.length; i++) cum.push(cum[i] + Math.hypot(spine[i + 1][0] - spine[i][0], spine[i + 1][1] - spine[i][1]));
    const Ls = cum[cum.length - 1] || 1, last = spine.length - 2;
    const proj = (x, y) => {
      let best = null;
      for (let i = 0; i <= last; i++) {
        const a = spine[i], b = spine[i + 1], ax = b[0] - a[0], ay = b[1] - a[1], l = Math.hypot(ax, ay) || 1;
        let u = ((x - a[0]) * ax + (y - a[1]) * ay) / (l * l);
        if (i > 0) u = Math.max(0, u); if (i < last) u = Math.min(1, u);
        const qx = a[0] + ax * u, qy = a[1] + ay * u, d2 = (x - qx) ** 2 + (y - qy) ** 2;
        if (!best || d2 < best[2]) best = [cum[i] + u * l, ((x - a[0]) * -ay + (y - a[1]) * ax) / l, d2];
      }
      return best;
    };
    const cuts = [0]; fracs.reduce((acc, f) => (cuts.push((acc + f) * Ls), acc + f), 0);
    const starts = cuts.slice(0, -1); cuts[0] = -1e9; cuts[cuts.length - 1] = 1e9;
    const bones = fracs.map(() => []);
    // split long edges first, so every piece projects cleanly onto a bent spine
    const fine = polys.map((pl) => {
      const o = [pl[0], pl[1]];
      for (let i = 0; i + 3 < pl.length; i += 2) {
        const n = Math.max(1, Math.ceil(Math.hypot(pl[i + 2] - pl[i], pl[i + 3] - pl[i + 1]) / 3));
        for (let q = 1; q <= n; q++) o.push(pl[i] + ((pl[i + 2] - pl[i]) * q) / n, pl[i + 1] + ((pl[i + 3] - pl[i + 1]) * q) / n);
      }
      return o;
    });
    for (const pl of fine) for (let i = 0; i + 3 < pl.length; i += 2) {
      const [ta, va] = proj(pl[i], pl[i + 1]), [tb, vb] = proj(pl[i + 2], pl[i + 3]);
      // an edge whose ends project onto different spine segments can jump; drop it rather than streak
      const el = Math.hypot(pl[i + 2] - pl[i], pl[i + 3] - pl[i + 1]);
      if (Math.abs(tb - ta) > 2.5 * el + 4 || Math.abs(vb - va) > 2.5 * el + 4) continue;
      for (let kk = 0; kk < fracs.length; kk++) {
        const lo = cuts[kk], hi = cuts[kk + 1]; let u0 = 0, u1 = 1;
        if (ta !== tb) { const p0 = (lo - ta) / (tb - ta), p1 = (hi - ta) / (tb - ta); u0 = Math.max(0, Math.min(p0, p1)); u1 = Math.min(1, Math.max(p0, p1)); }
        else if (ta < lo || ta >= hi) continue;
        if (u1 <= u0) continue;
        const base = starts[kk];
        bones[kk].push(ta + (tb - ta) * u0 - base, va + (vb - va) * u0, ta + (tb - ta) * u1 - base, va + (vb - va) * u1);
      }
    }
    return { L: Ls, bones, nseg: bones.reduce((s, b) => s + b.length / 4, 0), src: { polys, spine, fracs } };
  }
  function jointAndTip(polys) {
    let J = null;
    for (const pl of polys) for (let i = 0; i < pl.length; i += 2) if (!J || pl[i] > J[0]) J = [pl[i], pl[i + 1]];
    let T = J, bd = -1;
    for (const pl of polys) for (let i = 0; i < pl.length; i += 2) { const d = Math.hypot(pl[i] - J[0], pl[i + 1] - J[1]); if (d > bd) { bd = d; T = [pl[i], pl[i + 1]]; } }
    return { J, T, L: bd };
  }

  function flattenD(d, steps) {
    const K = steps || 4;
    const toks = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, poly = [];
    const out = [], flush = () => { if (poly.length >= 4) out.push(poly); poly = []; };
    while (i < toks.length) {
      const t = toks[i];
      if (t === "M" || t === "L" || t === "C" || t === "Z") { cmd = t; i++; }
      if (cmd === "Z") { poly.push(sx, sy); flush(); cmd = null; continue; }
      if (!cmd) { i++; continue; }
      const n = cmd === "C" ? 6 : 2, v = toks.slice(i, i + n).map(Number);
      if (v.length < n || v.some(Number.isNaN)) break;
      i += n;
      if (cmd === "M") { flush(); cx = sx = v[0]; cy = sy = v[1]; poly.push(cx, cy); cmd = "L"; }
      else if (cmd === "L") { cx = v[0]; cy = v[1]; poly.push(cx, cy); }
      else {
        for (let k = 1; k <= K; k++) {
          const u = k / K, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, e = u ** 3;
          poly.push(a * cx + b * v[0] + c * v[2] + e * v[4], a * cy + b * v[1] + c * v[3] + e * v[5]);
        }
        cx = v[4]; cy = v[5];
      }
    }
    flush(); return out;
  }
  // read every placed part: where it sits on the 400 x 400 sheet, mirrored or not, and what it is
  function parseForgeSVG(text) {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new Error("That file isn't an SVG.");
    const spec = { body: [], halos: [], cands: [], veil: [], accent: [], carve: [] };
    for (const top of svg.children) {
      if (top.nodeName.toLowerCase() === "defs") continue;
      const mir = /^matrix\(\s*-1/.test(top.getAttribute("transform") || "");
      const g = mir ? top.firstElementChild : top;
      const m = g && /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)\s*rotate\(([-\d.e]+)\)\s*scale\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(g.getAttribute("transform") || "");
      if (!m) continue;
      const [tx, ty, rot, scx, scy] = m.slice(1).map(Number);
      const inner = g.firstElementChild, mi = inner && /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(inner.getAttribute("transform") || "");
      const ox = mi ? -mi[1] : 0, oy = mi ? -mi[2] : 0, c = Math.cos(rot * DEG), s = Math.sin(rot * DEG);
      const side = Math.abs(tx - 200) > 0.5;
      const place = { line: [], tx, ty, scale: scx };
      for (const p of g.querySelectorAll("path")) {
        const fill = (p.getAttribute("fill") || "").toLowerCase(), stroke = (p.getAttribute("stroke") || "").toLowerCase();
        const kind = fill === "#343334" ? "veil" : fill && fill !== "none" && fill !== "#ffffff" ? "accent" : stroke === "#000000" ? "carve" : stroke ? "line" : null;
        if (!kind) continue;
        const polys = flattenD(p.getAttribute("d") || "").map((pl) => {
          const o = new Array(pl.length);
          for (let j = 0; j < pl.length; j += 2) {
            const X = (pl[j] - ox) * scx, Y = (pl[j + 1] - oy) * scy, px = tx + X * c - Y * s;
            o[j] = mir ? 400 - px : px; o[j + 1] = ty + X * s + Y * c;
          }
          return o;
        });
        if (kind === "line") place.line.push(...polys); else spec[kind].push(...polys);
      }
      if (!place.line.length) continue;
      if (!side) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const pl of place.line) for (let j = 0; j < pl.length; j += 2) { x0 = Math.min(x0, pl[j]); x1 = Math.max(x1, pl[j]); y0 = Math.min(y0, pl[j + 1]); y1 = Math.max(y1, pl[j + 1]); }
        const w = x1 - x0, h = y1 - y0;
        if (w > 90 && Math.abs(w - h) / w < 0.15) spec.halos.push({ polys: place.line, cy: (y0 + y1) / 2, r: w / 2 });
        else spec.body.push({ polys: place.line, y0, y1, w });
      } else if (!mir) spec.cands.push({ polys: place.line, ...jointAndTip(place.line) });
    }
    if (!spec.body.length && !spec.cands.length) throw new Error("No Bestiary Forge parts found in that SVG.");
    // limbs vs ornaments, then chain limbs whose inner end meets another's outer end
    const limbs = [], orn = [];
    for (const p of spec.cands) {
      let wmin = 1e9, wmax = -1e9; const ux = (p.T[0] - p.J[0]) / (p.L || 1), uy = (p.T[1] - p.J[1]) / (p.L || 1);
      for (const pl of p.polys) for (let j = 0; j < pl.length; j += 2) { const v = -(pl[j] - p.J[0]) * uy + (pl[j + 1] - p.J[1]) * ux; wmin = Math.min(wmin, v); wmax = Math.max(wmax, v); }
      p.W = wmax - wmin;
      (p.L >= 35 && (p.L / p.W >= 1.35 || p.L >= 80) ? limbs : orn).push(p);
    }
    // body outline, for snapping hips to the rim and for the body's domes
    const bodyPts = []; for (const b of spec.body) for (const pl of b.polys) for (let j = 0; j < pl.length; j += 2) bodyPts.push(pl[j], pl[j + 1]);
    spec.rimAt = (y) => { let m = 0; for (let j = 0; j < bodyPts.length; j += 2) if (Math.abs(bodyPts[j + 1] - y) < 10) m = Math.max(m, Math.abs(bodyPts[j] - 200)); return Math.min(60, m || 12); };
    const dirOf = (p) => [(p.T[0] - p.J[0]) / (p.L || 1), (p.T[1] - p.J[1]) / (p.L || 1)];
    const pairs = [];
    for (const a of limbs) for (const b of limbs) {
      if (a === b || b.J[0] > a.J[0] - 10) continue;
      const d = Math.hypot(a.T[0] - b.J[0], a.T[1] - b.J[1]);
      if (d > Math.max(25, 0.3 * (a.L + b.L))) continue;
      const da = dirOf(a), db = dirOf(b), cos = da[0] * db[0] + da[1] * db[1];
      pairs.push([d + 40 * (1 - cos), a, b]);
    }
    pairs.sort((x, y) => x[0] - y[0]);
    const succ = new Map(), hasPred = new Set();
    for (const [, a, b] of pairs) if (!succ.has(a) && !hasPred.has(b)) { succ.set(a, b); hasPred.add(b); }
    let chains = [];
    for (const a of limbs) {
      if (hasPred.has(a)) continue;
      const ch = [a]; let cur = a; while (succ.has(cur) && ch.length < 6) { cur = succ.get(cur); ch.push(cur); }
      chains.push(ch);
    }
    // a chain that starts far out from the body is a loose outer piece: hang it off the nearest leg tip
    const far = (ch) => Math.abs(200 - ch[0].J[0]) > spec.rimAt(ch[0].J[1]) + 30;
    const anchored = chains.filter((ch) => !far(ch));
    for (const ch of chains.filter(far)) {
      let best = null, bd = 140;
      for (const c of anchored) { const t = c[c.length - 1].T, d = Math.hypot(t[0] - ch[0].J[0], t[1] - ch[0].J[1]); if (d < bd) { bd = d; best = c; } }
      if (best) best.push(...ch); else orn.push(...ch);
    }
    chains = anchored.map((ch) => {
      const spine = [ch[0].J];
      for (let i = 0; i + 1 < ch.length; i++) spine.push([(ch[i].T[0] + ch[i + 1].J[0]) / 2, (ch[i].T[1] + ch[i + 1].J[1]) / 2]);
      spine.push(ch[ch.length - 1].T);
      let Ls = 0; for (let i = 0; i + 1 < spine.length; i++) Ls += Math.hypot(spine[i + 1][0] - spine[i][0], spine[i + 1][1] - spine[i][1]);
      return { polys: ch.flatMap((p) => p.polys), spine, Ls, parts: ch.length };
    });
    chains.sort((a, b) => b.Ls - a.Ls);
    spec.chains = chains.slice(0, 10);
    for (const c of chains.slice(10)) orn.push(c);
    // each centre part becomes its own dome, so the body reads as stacked, rounded plates
    spec.domes = spec.body.map((b) => ({ cy: (b.y0 + b.y1) / 2, R: Math.max(b.w, b.y1 - b.y0) / 2 }));
    spec.liftPx = (sx, sy) => { let m = 0; for (const d of spec.domes) { const r = Math.hypot(sx - 200, sy - d.cy) / d.R; if (r < 1) m = Math.max(m, Math.min(d.R, 50) * Math.sqrt(1 - r * r)); } return m; };
    spec.orn = orn.flatMap((p) => p.polys);
    let y0 = 1e9, y1 = -1e9, hw = 10;
    for (const b of spec.body) { y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); hw = Math.max(hw, Math.min(70, b.w / 2)); }
    spec.cy = isFinite(y0) ? (y0 + y1) / 2 : 200; spec.tail = isFinite(y1) ? y1 : 300; spec.hw = hw;
    spec.lanternY = spec.accent.length ? spec.accent[0].reduce((s, v, j) => (j % 2 ? s + v : s), 0) / (spec.accent[0].length / 2) : (isFinite(y0) ? y0 + (y1 - y0) * 0.25 : 150);
    return spec;
  }

  // a curved spine through the middle of a drawn limb: centroids of the outline in slabs along joint -> tip
  function medialSpine(polys, J, T, n = 10) {
    const L = Math.hypot(T[0] - J[0], T[1] - J[1]) || 1, ux = (T[0] - J[0]) / L, uy = (T[1] - J[1]) / L;
    const sum = Array.from({ length: n + 1 }, () => [0, 0, 0]), half = L / n / 1.4;
    for (const pl of polys) for (let j = 0; j < pl.length; j += 2) {
      const t = (pl[j] - J[0]) * ux + (pl[j + 1] - J[1]) * uy;
      for (let i = 1; i < n; i++) if (Math.abs(t - (L * i) / n) < half) { sum[i][0] += pl[j]; sum[i][1] += pl[j + 1]; sum[i][2]++; }
    }
    const sp = [J];
    for (let i = 1; i < n; i++) if (sum[i][2]) sp.push([sum[i][0] / sum[i][2], sum[i][1] / sum[i][2]]);
    sp.push(T); return sp;
  }

  // spine through a drawn limb that follows hand-placed waypoints, refined to the outline's centre between them
  function guidedSpine(polys, way, maxW) {
    const sp = [way[0]];
    for (let w = 0; w + 1 < way.length; w++) {
      const a = way[w], b = way[w + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      const n = Math.max(2, Math.round(L / 22)), half = L / n / 1.4;
      for (let i = 1; i < n; i++) {
        const t0 = (L * i) / n; let sx = 0, sy = 0, c = 0;
        for (const pl of polys) for (let j = 0; j < pl.length; j += 2) {
          const dx = pl[j] - a[0], dy = pl[j + 1] - a[1], t = dx * ux + dy * uy, v = -dx * uy + dy * ux;
          if (Math.abs(t - t0) < half && Math.abs(v) < maxW) { sx += pl[j]; sy += pl[j + 1]; c++; }
        }
        sp.push(c ? [sx / c, sy / c] : [a[0] + ux * t0, a[1] + uy * t0]);
      }
      sp.push(b);
    }
    return sp;
  }

  window.LimbArt = { flattenD, jointAndTip, sliceSpine, medialSpine, guidedSpine, parseForgeSVG };
})();
