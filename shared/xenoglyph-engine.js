/* INTERACTIONS — Xenoglyph glyph-generation core.
   The eight procedural "writing system" engines extracted from tools/xenoglyph/xenoglyph.html:
   script/radical/pills/pixel/sigil/circuit/cluster/blob, plus the seeded RNG and shared
   skeleton/stroke-rendering helpers they're built from. Pure geometry → SVG-fragment strings, no
   DOM — every engine fn is `(rng, opts) -> {svg, ink, sig}` so a caller supplies its own seeded rng
   and a plain options object (cx, wt, flesh, seed, grid, jitter, round) and gets back inner SVG
   markup plus an "ink" density estimate and a dedup signature. Xenoglyph's own glyph-assembly layer
   (character→style mapping, variant/signature caching against a live `state` object) stays in the
   tool itself — it's app-specific glue, not generative math.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../shared/xenoglyph-engine.js"></script>
*/
(function () {
  'use strict';

  /* ── seeded rng ── */
  function xmur3(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }; }
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rngFor(seed, style, ch, variant) { return mulberry32(xmur3(seed + "::" + style + "::" + ch + "::v" + variant)()); }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  /* ── skeleton + stroke rendering (shared by script/radical) ── */
  function makeSkeleton(r, o) {
    const n = o.grid || 3, pad = 20, step = (100 - 2 * pad) / (n - 1);
    const P = (c, rw) => [pad + c * step, pad + rw * step];
    const polys = [], dots = [], used = new Set();
    const paths = o.cx >= 4 ? 2 : 1;
    for (let p = 0; p < paths; p++) {
      let c = ri(r, 0, n - 1), rw = ri(r, 0, n - 1);
      let pts = [[c, rw]]; used.add(c + "," + rw);
      const steps = Math.min(1 + o.cx, 5);
      for (let s = 0; s < steps; s++) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => { const nc = c + d[0], nr = rw + d[1]; return nc >= 0 && nc < n && nr >= 0 && nr < n && !used.has(nc + "," + nr); });
        if (!dirs.length) break;
        const d = pick(r, dirs); c += d[0]; rw += d[1]; used.add(c + "," + rw); pts.push([c, rw]);
      }
      if (pts.length >= 2) polys.push(pts.map(pt => P(pt[0], pt[1])));
    }
    if (r() < .55) {
      let c, rw, t = 0; do { c = ri(r, 0, n - 1); rw = ri(r, 0, n - 1); t++; } while (used.has(c + "," + rw) && t < 9);
      const [x, y] = P(c, rw);
      if (r() < .5) dots.push([x, y]); else polys.push([[x - 7, y], [x + 7, y]]);
    }
    return { polys, dots, step };
  }
  function jitterSkel(skel, r, amt) {
    if (!amt) return skel;
    const mv = ([x, y]) => [x + (r() - .5) * 2 * amt, y + (r() - .5) * 2 * amt];
    return { polys: skel.polys.map(p => p.map(mv)), dots: skel.dots.map(mv), step: skel.step };
  }
  const BG = 'var(--_bg,#0B0D14)';
  function brushPoly(pts, wMax) {
    let L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = L[L.length - 1] || 1;
    const width = t => wMax * (0.22 + 0.78 * Math.sin(Math.PI * Math.min(Math.max(t, .04), .96)));
    let parts = [];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const w1 = width(L[i - 1] / total) / 2, w2 = width(L[i] / total) / 2;
      parts.push(`<polygon points="${(x1 + nx * w1).toFixed(1)},${(y1 + ny * w1).toFixed(1)} ${(x2 + nx * w2).toFixed(1)},${(y2 + ny * w2).toFixed(1)} ${(x2 - nx * w2).toFixed(1)},${(y2 - ny * w2).toFixed(1)} ${(x1 - nx * w1).toFixed(1)},${(y1 - ny * w1).toFixed(1)}" fill="currentColor"/>`);
      if (i < pts.length - 1) parts.push(`<circle cx="${x2}" cy="${y2}" r="${w2.toFixed(1)}" fill="currentColor"/>`);
    }
    const last = pts[pts.length - 1];
    parts.push(`<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="${(width(.04) / 2).toFixed(1)}" fill="currentColor"/>`);
    parts.push(`<circle cx="${last[0]}" cy="${last[1]}" r="${(width(.96) / 2).toFixed(1)}" fill="currentColor"/>`);
    return parts.join("");
  }
  function fleshRender(skel, flesh, wt, k = 1, round = 1) {
    const pathD = pts => "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ");
    const cap = round > 0.33 ? "round" : "butt", join = round > 0.33 ? "round" : "miter";
    const dot = (x, y, rr) => round > 0.5 ? `<circle cx="${x}" cy="${y}" r="${rr}" fill="currentColor"/>` : `<rect x="${(x - rr * .95).toFixed(1)}" y="${(y - rr * .95).toFixed(1)}" width="${(rr * 1.9).toFixed(1)}" height="${(rr * 1.9).toFixed(1)}" rx="${(rr * .4 * round).toFixed(1)}" fill="currentColor"/>`;
    let parts = [];
    if (flesh === "mono") { const w = (2.4 + wt * 1.1) * k; skel.polys.forEach(pts => parts.push(`<path d="${pathD(pts)}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>`)); skel.dots.forEach(([x, y]) => parts.push(dot(x, y, w * 1.2))); }
    else if (flesh === "pill") { const w = (6 + wt * 2.2) * k; skel.polys.forEach(pts => parts.push(`<path d="${pathD(pts)}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>`)); skel.dots.forEach(([x, y]) => parts.push(dot(x, y, w * .62))); }
    else if (flesh === "outline") { const W = (7 + wt * 2.4) * k, inner = Math.max(W - 4.4 * k, 1.4); skel.polys.forEach(pts => parts.push(`<path d="${pathD(pts)}" fill="none" stroke="currentColor" stroke-width="${W}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>`)); skel.dots.forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="${W * .68}" fill="currentColor"/>`)); skel.polys.forEach(pts => parts.push(`<path d="${pathD(pts)}" fill="none" stroke="${BG}" stroke-width="${inner}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>`)); skel.dots.forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="${Math.max(W * .68 - 2.2 * k, .8)}" fill="${BG}"/>`)); }
    else if (flesh === "dot") { const rr = (1.8 + wt * .8) * k, gap = Math.max(rr * 2.7, 7 * k); skel.polys.forEach(pts => { for (let i = 1; i < pts.length; i++) { const [x1, y1] = pts[i - 1], [x2, y2] = pts[i]; const len = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(1, Math.round(len / gap)); for (let s = 0; s <= steps; s++) { const t = s / steps; parts.push(`<circle cx="${(x1 + (x2 - x1) * t).toFixed(1)}" cy="${(y1 + (y2 - y1) * t).toFixed(1)}" r="${rr}" fill="currentColor"/>`); } } }); skel.dots.forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="${rr * 1.5}" fill="currentColor"/>`)); }
    else { const wMax = (5.5 + wt * 2.3) * k; skel.polys.forEach(pts => parts.push(brushPoly(pts, wMax))); skel.dots.forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="${wMax * .42}" fill="currentColor"/>`)); }
    return parts.join("");
  }
  function recenter(skel) {
    let xs = [], ys = [];
    skel.polys.forEach(p => p.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
    skel.dots.forEach(([x, y]) => { xs.push(x); ys.push(y); });
    if (!xs.length) return skel;
    const dx = 50 - (Math.min(...xs) + Math.max(...xs)) / 2, dy = 48 - (Math.min(...ys) + Math.max(...ys)) / 2;
    const mv = ([x, y]) => [x + dx, y + dy];
    return { polys: skel.polys.map(p => p.map(mv)), dots: skel.dots.map(mv) };
  }
  function skelInk(skel, scale = 1) { let L = 0; skel.polys.forEach(p => { for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); }); return L * scale + skel.dots.length * 12; }
  function skelSig(skel) { const key = p => p.map(pt => Math.round(pt[0] / 4) + "," + Math.round(pt[1] / 4)).join(";"); const polys = skel.polys.map(p => { const f = key(p), b = key([...p].reverse()); return f < b ? f : b; }).sort(); const dots = skel.dots.map(d => Math.round(d[0] / 4) + "," + Math.round(d[1] / 4)).sort(); return polys.join("|") + "#" + dots.join("|"); }

  /* ── engines: each (rng, opts) -> {svg, ink, sig} ── */
  function engScript(r, o) { const raw = makeSkeleton(r, o); const skel = recenter(jitterSkel(raw, r, o.jitter * 1.6)); return { svg: fleshRender(skel, o.flesh, o.wt, 1, o.round), ink: skelInk(skel, 30 / raw.step), sig: skelSig(skel) }; }
  function engPills(r, o) {
    const rows = 4, pad = 14, rh = (100 - 2 * pad) / rows, cols = 4, cw = (100 - 2 * pad) / cols;
    const h = Math.min(rh * 0.72, 8 + o.wt * 3.2), rf = Math.max(o.round ?? 1, .04);
    let parts = [], items = [], ink = 0; const count = Math.min(2 + Math.floor(o.cx / 2), 4); const usedRows = new Set(); let guard = 0;
    for (let i = 0; i < count && guard < 24; i++) {
      guard++; const kind = pick(r, ["h", "h", "h", "v", "sq", "dots"]);
      if (kind === "v") { const row = ri(r, 0, rows - 2); if (usedRows.has(row) || usedRows.has(row + 1)) { i--; continue; } usedRows.add(row); usedRows.add(row + 1); const col = ri(r, 0, cols - 1); const x = pad + col * cw + (cw - h) / 2, y = pad + row * rh + (rh - h) / 2; parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${h.toFixed(1)}" height="${(rh + h).toFixed(1)}" rx="${(h / 2 * rf).toFixed(1)}" fill="currentColor"/>`); items.push("v" + row + ":" + col); ink += 1.7; continue; }
      let row, t = 0; do { row = ri(r, 0, rows - 1); t++; } while (usedRows.has(row) && t < 10); if (usedRows.has(row)) { i--; continue; } usedRows.add(row); const y = pad + row * rh + (rh - h) / 2;
      if (kind === "sq") { const col = ri(r, 0, cols - 1), x = pad + col * cw + (cw - h) / 2; parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${h.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h * .35 * rf).toFixed(1)}" fill="currentColor"/>`); items.push("s" + row + ":" + col); ink += .6; }
      else if (kind === "dots") { const col = ri(r, 0, cols - 2), d = h * .62, yy = y + (h - d) / 2; [col, col + 1].forEach(c => { const x = pad + c * cw + (cw - d) / 2; parts.push(`<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${d.toFixed(1)}" height="${d.toFixed(1)}" rx="${(d * .4 * rf).toFixed(1)}" fill="currentColor"/>`); }); items.push("d" + row + ":" + col); ink += .8; }
      else { const span = ri(r, 1, 3), start = ri(r, 0, cols - span), x = pad + start * cw, w = span * cw; parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h / 2 * rf).toFixed(1)}" fill="currentColor"/>`); items.push("h" + row + ":" + start + ":" + span); ink += span; }
    }
    return { svg: parts.join(""), ink, sig: items.sort().join("|") };
  }
  function engPixel(r, o) {
    const n = 5, m = 12, cs = (100 - 2 * m) / n;
    let parts = [`<rect x="4" y="4" width="92" height="92" rx="10" fill="currentColor" opacity="0.12"/>`];
    const cells = new Set(); const runs = 1 + Math.floor(o.cx / 2);
    for (let i = 0; i < runs; i++) { const horiz = r() < .5, len = ri(r, 2, 3); const c = ri(r, 0, horiz ? n - len : n - 1), rw = ri(r, 0, horiz ? n - 1 : n - len); for (let k = 0; k < len; k++) cells.add((horiz ? c + k : c) + "," + (horiz ? rw : rw + k)); }
    const singles = ri(r, 1, 1 + o.cx); for (let i = 0; i < singles; i++) cells.add(ri(r, 0, n - 1) + "," + ri(r, 0, n - 1));
    const g = 1.6, arr = [...cells].map(k => k.split(",").map(Number));
    const minC = Math.min(...arr.map(a => a[0])), minR = Math.min(...arr.map(a => a[1]));
    const sig = arr.map(([c, rw]) => (c - minC) + "," + (rw - minR)).sort().join("|");
    arr.forEach(([c, rw]) => { parts.push(`<rect x="${m + c * cs + g}" y="${m + rw * cs + g}" width="${cs - 2 * g}" height="${cs - 2 * g}" rx="${(2.5 * (o.round ?? 1)).toFixed(1)}" fill="currentColor"/>`); });
    return { svg: parts.join(""), ink: arr.length, sig };
  }
  function engSigil(r, o) {
    const slots = Math.min(2 + Math.ceil(o.cx / 2), 4), pad = 10, sh = (100 - 2 * pad) / slots, cx = 50, sw = 3 + o.wt * 1.4;
    let parts = [], kinds = [], ink = 0; const W = { disc: 1.5, ring: 1.2, arcU: 1, arcD: 1, bar: 1, square: 1.5, dots: .8 };
    for (let i = 0; i < slots; i++) {
      const cy = pad + sh * (i + .5), size = Math.min(sh * .42, 16), kind = pick(r, ["disc", "ring", "arcU", "arcD", "bar", "square", "dots"]); kinds.push(kind); ink += W[kind];
      switch (kind) {
        case "disc": parts.push(`<circle cx="${cx}" cy="${cy}" r="${size * .8}" fill="currentColor"/>`); break;
        case "ring": parts.push(`<circle cx="${cx}" cy="${cy}" r="${size * .85}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`); break;
        case "arcU": parts.push(`<path d="M${cx - size} ${cy + size * .4} A ${size} ${size} 0 0 1 ${cx + size} ${cy + size * .4}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"/>`); break;
        case "arcD": parts.push(`<path d="M${cx - size} ${cy - size * .4} A ${size} ${size} 0 0 0 ${cx + size} ${cy - size * .4}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"/>`); break;
        case "bar": parts.push(`<rect x="${cx - size * 1.4}" y="${cy - sw / 2}" width="${size * 2.8}" height="${sw}" rx="${sw / 2}" fill="currentColor"/>`); break;
        case "square": parts.push(`<rect x="${cx - size * .7}" y="${cy - size * .7}" width="${size * 1.4}" height="${size * 1.4}" fill="currentColor"/>`); break;
        case "dots": parts.push(`<circle cx="${cx - size * .9}" cy="${cy}" r="${sw * .9}" fill="currentColor"/><circle cx="${cx + size * .9}" cy="${cy}" r="${sw * .9}" fill="currentColor"/>`); break;
      }
    }
    return { svg: parts.join(""), ink, sig: kinds.join("-") };
  }
  function engCircuit(r, o) {
    const w = 44, x0 = 50 - w / 2, y0 = 8, h = 84, sw = 2 + o.wt * .9;
    let parts = [`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${w / 2}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`, `<path d="M50 ${y0} L50 ${y0 + h}" stroke="currentColor" stroke-width="${sw}"/>`];
    const nodes = Math.min(2 + o.cx, 6); let kinds = [];
    for (let i = 0; i < nodes; i++) {
      const y = y0 + 12 + (h - 24) * (i / (Math.max(nodes - 1, 1))), kind = pick(r, ["node", "node", "arcL", "arcR"]), rad = 6.5; kinds.push(kind);
      if (kind === "node") parts.push(`<circle cx="50" cy="${y}" r="${rad}" fill="${BG}" stroke="currentColor" stroke-width="${sw}"/>`);
      else if (kind === "arcL") parts.push(`<path d="M50 ${y - rad} A ${rad} ${rad} 0 0 0 50 ${y + rad}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`);
      else parts.push(`<path d="M50 ${y - rad} A ${rad} ${rad} 0 0 1 50 ${y + rad}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`);
    }
    return { svg: parts.join(""), ink: kinds.filter(k => k === "node").length + kinds.length * .4, sig: kinds.join("-") };
  }
  function engCluster(r, o) {
    const n = o.grid || 3, pad = 20, step = (100 - 2 * pad) / (n - 1), rad = 6 + o.wt * 1.8;
    let pts = [], conns = [], used = new Set(); const count = Math.min(2 + Math.ceil(o.cx / 2), 5);
    let c = ri(r, 0, n - 1), rw = ri(r, 0, n - 1);
    for (let i = 0; i < count; i++) { used.add(c + "," + rw); pts.push([c, rw]); const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => { const nc = c + d[0], nr = rw + d[1]; return nc >= 0 && nc < n && nr >= 0 && nr < n && !used.has(nc + "," + nr); }); if (!dirs.length) break; const d = pick(r, dirs); if (r() < .55) conns.push([i, pts.length]); c += d[0]; rw += d[1]; }
    conns = conns.filter(([, b]) => b < pts.length);
    const minC = Math.min(...pts.map(p => p[0])), minR = Math.min(...pts.map(p => p[1]));
    const sig = pts.map(p => (p[0] - minC) + "," + (p[1] - minR)).join("|") + "#" + conns.map(cn => cn.join("-")).join("|");
    let P = pts.map(([cc, rr]) => [pad + cc * step, pad + rr * step]);
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const dx = 50 - (Math.min(...xs) + Math.max(...xs)) / 2, dy = 48 - (Math.min(...ys) + Math.max(...ys)) / 2;
    const jit = (o.jitter || 0) * 1.6; if (jit) P = P.map(([x, y]) => [x + (r() - .5) * 2 * jit, y + (r() - .5) * 2 * jit]);
    const cap = (o.round ?? 1) > 0.33 ? "round" : "butt"; let parts = [], ink = P.length * 10;
    conns.forEach(([a, b]) => { const [x1, y1] = P[a], [x2, y2] = P[b]; ink += Math.hypot(x2 - x1, y2 - y1) * (30 / step) * .5; parts.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="currentColor" stroke-width="${rad * .85}" stroke-linecap="${cap}"/>`); });
    P.forEach(([x, y]) => parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}" fill="currentColor"/>`));
    return { svg: parts.join(""), ink, sig };
  }
  let radicalCache = { key: "", rads: [] };
  function getRadicals(seed) {
    if (radicalCache.key === seed) return radicalCache.rads;
    const rads = [];
    for (let i = 0; i < 6; i++) {
      const r = rngFor(seed, "__radical", "R" + i, 0); const used = new Set(); let c = ri(r, 0, 2), rw = ri(r, 0, 2); let pts = [[c, rw]]; used.add(c + "," + rw); const steps = ri(r, 2, 3);
      for (let s = 0; s < steps; s++) { const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => { const nc = c + d[0], nr = rw + d[1]; return nc >= 0 && nc < 3 && nr >= 0 && nr < 3 && !used.has(nc + "," + nr); }); if (!dirs.length) break; const d = pick(r, dirs); c += d[0]; rw += d[1]; used.add(c + "," + rw); pts.push([c, rw]); }
      const skel = { polys: pts.length >= 2 ? [pts.map(p => [p[0] / 2, p[1] / 2])] : [], dots: [] }; if (r() < .35 || !skel.polys.length) skel.dots.push([ri(r, 0, 2) / 2, ri(r, 0, 2) / 2]); rads.push(skel);
    }
    radicalCache = { key: seed, rads }; return rads;
  }
  function placeSkel(skel, rect) { const map = ([u, v]) => [rect.x + u * rect.w, rect.y + v * rect.h]; return { polys: skel.polys.map(poly => poly.map(map)), dots: skel.dots.map(map) }; }
  const RAD_LAYOUTS = [[{ x: 24, y: 24, w: 52, h: 52 }], [{ x: 24, y: 12, w: 52, h: 31 }, { x: 24, y: 57, w: 52, h: 31 }], [{ x: 13, y: 24, w: 31, h: 52 }, { x: 56, y: 24, w: 31, h: 52 }], [{ x: 27, y: 10, w: 46, h: 29 }, { x: 13, y: 53, w: 31, h: 35 }, { x: 56, y: 53, w: 31, h: 35 }]];
  function normLen(skel) { let L = 0; skel.polys.forEach(p => { for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); }); return L + skel.dots.length * .3; }
  function engRadical(r, o) {
    const rads = getRadicals(o.seed); const pool = o.cx <= 2 ? [0, 1, 2] : o.cx >= 4 ? [1, 2, 3, 3] : [0, 1, 2, 3]; const li = pick(r, pool); const layout = RAD_LAYOUTS[li];
    let parts = [], ids = [], ink = 0;
    layout.forEach(rect => { const idx = ri(r, 0, rads.length - 1); ids.push(idx); const rad = rads[idx]; const k = Math.max(Math.min(rect.w, rect.h) / 62, .5); ink += normLen(rad) * Math.min(rect.w, rect.h) * .5 + 8; const placed = jitterSkel(placeSkel(rad, rect), r, (o.jitter || 0) * 1.2 * k); parts.push(fleshRender(placed, o.flesh, o.wt, k, o.round)); });
    return { svg: parts.join(""), ink, sig: li + ":" + ids.join("-") };
  }
  const HALF_PI = Math.PI / 2;
  function mbDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function mbVec(p, a, d) { return [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d]; }
  function clampAcos(x) { return Math.acos(Math.max(-1, Math.min(1, x))); }
  function metaballBridge(r1, r2, c1, c2, handle = 2.4, v = .5) {
    const d = mbDist(c1, c2); if (r1 === 0 || r2 === 0 || d > r1 + r2 * 2.5 || d <= Math.abs(r1 - r2)) return "";
    let u1 = 0, u2 = 0; if (d < r1 + r2) { u1 = clampAcos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d)); u2 = clampAcos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d)); }
    const ang = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]), spread = clampAcos((r1 - r2) / d);
    const a1 = ang + u1 + (spread - u1) * v, a2 = ang - u1 - (spread - u1) * v, a3 = ang + Math.PI - u2 - (Math.PI - u2 - spread) * v, a4 = ang - Math.PI + u2 + (Math.PI - u2 - spread) * v;
    const p1 = mbVec(c1, a1, r1), p2 = mbVec(c1, a2, r1), p3 = mbVec(c2, a3, r2), p4 = mbVec(c2, a4, r2);
    const total = r1 + r2, d2 = Math.min(v * handle, mbDist(p1, p3) / total) * Math.min(1, d * 2 / total);
    const h1 = mbVec(p1, a1 - HALF_PI, r1 * d2), h2 = mbVec(p2, a2 + HALF_PI, r1 * d2), h3 = mbVec(p3, a3 + HALF_PI, r2 * d2), h4 = mbVec(p4, a4 - HALF_PI, r2 * d2);
    const F = p => p[0].toFixed(1) + " " + p[1].toFixed(1);
    return `<path d="M${F(p1)} C${F(h1)} ${F(h3)} ${F(p3)} L${F(p4)} C${F(h4)} ${F(h2)} ${F(p2)} Z" fill="currentColor"/>`;
  }
  function engBlob(r, o) {
    const folds = pick(r, [4, 5, 6, 8]), wide = r() < .45, R0 = (wide ? 23 : 14) + r() * 5, base = 4 + o.wt * 1.5, sw = 2 + o.wt * .9;
    const armKind = pick(r, ["chain", "chain", "arc", "bar", "ring", "dot"]), alt = r() < .4 && folds % 2 === 0, nucleus = pick(r, ["none", "none", "disc", "ring"]);
    let armSvg = "", armLen = 1, armInk = 1;
    if (armKind === "chain") { const balls = [{ c: [50, 50 - R0], r: base * (.75 + r() * .5) }]; const len = Math.min(1 + Math.round(o.cx / 2), 3); for (let i = 1; i < len; i++) { const prev = balls[i - 1], nr = base * (.55 + r() * .6), a = -HALF_PI + (r() - .5) * 1.2, d = (prev.r + nr) * (.9 + r() * .25), nx = prev.c[0] + Math.cos(a) * d, ny = prev.c[1] + Math.sin(a) * d; if (Math.hypot(nx - 50, ny - 50) > 42) break; balls.push({ c: [nx, ny], r: nr }); } let m = balls.map(b => `<circle cx="${b.c[0].toFixed(1)}" cy="${b.c[1].toFixed(1)}" r="${b.r.toFixed(1)}" fill="currentColor"/>`); for (let i = 1; i < balls.length; i++) m.push(metaballBridge(balls[i - 1].r, balls[i].r, balls[i - 1].c, balls[i].c)); armSvg = m.join(""); armLen = balls.length; armInk = 1 + .5 * (balls.length - 1); }
    else if (armKind === "arc") { const th = Math.PI / folds * .72, a1 = -HALF_PI - th, a2 = -HALF_PI + th, p1 = [50 + Math.cos(a1) * R0, 50 + Math.sin(a1) * R0], p2 = [50 + Math.cos(a2) * R0, 50 + Math.sin(a2) * R0]; armSvg = `<path d="M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A ${R0.toFixed(1)} ${R0.toFixed(1)} 0 0 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${(base * 1.1).toFixed(1)}" stroke-linecap="round"/>`; armInk = 1.3; }
    else if (armKind === "bar") { const len = base * 2.6; armSvg = `<rect x="${(50 - base * .55).toFixed(1)}" y="${(50 - R0 - len / 2).toFixed(1)}" width="${(base * 1.1).toFixed(1)}" height="${len.toFixed(1)}" rx="${(base * .55).toFixed(1)}" fill="currentColor"/>`; armInk = 1; }
    else if (armKind === "ring") { armSvg = `<circle cx="50" cy="${(50 - R0).toFixed(1)}" r="${(base * .95).toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${sw.toFixed(1)}"/>`; armInk = .8; }
    else { armSvg = `<circle cx="50" cy="${(50 - R0).toFixed(1)}" r="${(base * .7).toFixed(1)}" fill="currentColor"/>`; armInk = .6; }
    if (r() < .5 && armKind !== "arc" && armKind !== "ring") { const sy = 50 - R0 - base * 1.7; if (50 - sy < 45) { armSvg += `<circle cx="50" cy="${sy.toFixed(1)}" r="${(base * .3).toFixed(1)}" fill="currentColor"/>`; armInk += .15; } }
    let altSvg = "";
    if (alt) { const kind2 = pick(r, ["dot", "ring"]), R2 = R0 * (.6 + r() * .2); altSvg = kind2 === "dot" ? `<circle cx="50" cy="${(50 - R2).toFixed(1)}" r="${(base * .45).toFixed(1)}" fill="currentColor"/>` : `<circle cx="50" cy="${(50 - R2).toFixed(1)}" r="${(base * .6).toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${(sw * .8).toFixed(1)}"/>`; }
    let parts = []; for (let i = 0; i < folds; i++) parts.push(`<g transform="rotate(${(i * 360 / folds).toFixed(1)} 50 50)">${(alt && i % 2) ? altSvg : armSvg}</g>`);
    let nInk = 0; if (nucleus === "disc") { parts.push(`<circle cx="50" cy="50" r="${(base * .8).toFixed(1)}" fill="currentColor"/>`); nInk = .8; } else if (nucleus === "ring") { parts.push(`<circle cx="50" cy="50" r="${(base * .85).toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${sw.toFixed(1)}"/>`); nInk = .5; }
    const primaryArms = alt ? Math.ceil(folds / 2) : folds; const ink = primaryArms * armInk + (alt ? Math.floor(folds / 2) * .4 : 0) + nInk;
    return { svg: parts.join(""), ink, sig: [folds, armKind, armLen, wide ? "W" : "T", alt ? "A" : "-", nucleus].join(":") };
  }

  function bandFrom(meds) { return cx => { const m = meds[Math.min(cx, 5)]; return [m * .72, m * 1.38]; }; }
  const ENGINES = {
    script: { fn: engScript, label: "Script", skeletal: true, band: bandFrom([0, 72, 102, 130, 190, 200]) },
    radical: { fn: engRadical, label: "Radical", skeletal: true, band: bandFrom([0, 52, 52, 58, 67, 70]) },
    pills: { fn: engPills, label: "Pills", band: bandFrom([0, 2.7, 4.5, 4.5, 5.4, 5.4]) },
    pixel: { fn: engPixel, label: "Pixel", band: bandFrom([0, 4, 6, 7, 9, 9]) },
    sigil: { fn: engSigil, label: "Sigil" },
    circuit: { fn: engCircuit, label: "Circuit" },
    cluster: { fn: engCluster, label: "Cluster", band: bandFrom([0, 45, 45, 70, 70, 80]) },
    blob: { fn: engBlob, label: "Blob", band: () => [3, 11] },
  };

  window.Xenoglyph = {
    xmur3, mulberry32, rngFor, pick, ri,
    makeSkeleton, jitterSkel, brushPoly, fleshRender, recenter, skelInk, skelSig,
    engScript, engPills, engPixel, engSigil, engCircuit, engCluster, engRadical, engBlob,
    getRadicals, placeSkel, RAD_LAYOUTS, normLen, metaballBridge,
    bandFrom, ENGINES,
  };
})();
