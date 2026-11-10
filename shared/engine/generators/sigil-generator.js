/*
 * Forge — Seal and Alphabet preset generators. Fresh extraction, ported from
 * world/forges/sigil-forge/index.html's newSigil()/drawSigil()/mutateSigil() and
 * newAlphabet()/drawSheet()/drawText()/glyphSvg() and their shared dependencies
 * (lines ~283-865 as of 2026-11-03), same treatment as spire-generator.js: every
 * function that read `state.*` now takes the parts/byId it needs explicitly.
 *
 * One real design decision, not just a mechanical fix: the original's glyph()
 * reads `state.alpha` directly when drawing a seal's inscription in the "forged"
 * alphabet style — i.e. Seal's output depends on Script's output. Here that
 * becomes an explicit `opts.alphabet` argument to generateSeal(), so the
 * dependency is visible at the call site (Bench passes its own currently-active
 * alphabet) instead of hidden in shared page state.
 *
 * Known, deliberate omission: the original's "weave" feature (real vector
 * boolean cuts between overlapping parts, via the ClipperLib CDN library) is not
 * ported. drawSigil() already falls back cleanly when `window.ClipperLib` /
 * `g.weave` isn't available — every weave-gated branch has a non-woven fallback
 * already in the original code — so Seal generates correctly here, just always
 * in the plainer non-woven style. Porting the ~100-line Clipper-based boolean
 * engine is future work if the woven look matters for Bench specifically.
 *
 * Icon mode (world/forges/sigil-forge/index.html's newIcon()/drawIcon()) is not ported
 * this pass either — same pool/glyph machinery as Seal, cheap to add later.
 *
 * Depends on kit-utils.js being loaded first (window.ForgeKit).
 */
(function () {
  "use strict";

  const { rng, clamp, svgUrl } = window.ForgeKit;

  const S = 600, C = 300, MINT = "#5fd38d", DIM = "#2f6e4c", PLATE = "#14171d";
  const f1 = (v) => (+v).toFixed(1), f3 = (v) => (+v).toFixed(3);
  const rad = (d) => (d * Math.PI) / 180;

  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const XENO = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("").forEach((ch, i) => { XENO[ch] = "P" + String(359 + i).padStart(3, "0"); });

  // parts: the tagged shared/data/creature-parts.json array (via ForgeKit.rolesOf). No
  // species-enable filtering here — Sigil's own generators never had that concept.
  function partHelpers(parts) {
    const pool = (role) => parts.filter((p) => p.roles.includes(role));
    const pickId = (R, role) => { const a = pool(role); return a.length ? a[Math.floor(R() * a.length)].id : null; };
    const iconPool = (role) => pool(role).filter((p) => !p.defs && /stroke="#/.test(p.svg) && !/stroke="none"/.test(p.svg));
    const pickIcon = (R, role) => { const a = iconPool(role); return a.length ? a[Math.floor(R() * a.length)].id : pickId(R, role); };
    const lineOnly = (p) => p && !p.defs && /stroke="#/.test(p.svg) && !/stroke="none"/.test(p.svg) && !/fill="#/.test(p.svg);
    const pickLine = (R, role) => { const a = pool(role).filter(lineOnly); return a.length ? a[Math.floor(R() * a.length)].id : pickIcon(R, role); };
    return { pool, pickId, iconPool, pickIcon, lineOnly, pickLine };
  }

  /* ---------- drawing primitives (byId-parameterized) ---------- */
  function mkCtx() { return { out: [], defs: new Map(), n: 0 }; }
  function makeDrawHelpers(byId) {
    const P = (id) => byId[id];
    function put(ctx, id, x, y, s, rot = 0, o = {}) {
      const p = P(id); if (!p || !(s > 0)) return null;
      const src = o.fix && !/stroke-width=/.test(p.svg) ? p.svg.replace(/stroke="#/g, 'stroke-width="1.6" stroke="#') : p.svg;
      let frag = o.uniform
        ? src.replace(/stroke-width="([\d.]+)"/g, `stroke-width="${f3(o.uniform / s)}"`)
        : src.replace(/stroke-width="([\d.]+)"/g, (_, v) => `stroke-width="${f3((v * (o.sw ?? 1)) / s)}"`);
      if (o.color) frag = recolor(frag, o.color);
      ctx.out.push(`<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${f3(o.flip ? -s : s)} ${f3(s)})"${o.op ? ` opacity="${o.op}"` : ""}>${frag}</g>`);
      if (p.defs) ctx.defs.set(p.id, p.defs);
      ctx.n++;
      return p;
    }
    const raw = (ctx, s) => ctx.out.push(s);
    function glyph(ctx, ch, x, y, size, rot, o = {}, alphabet) {
      if (o.alpha === "forged" && alphabet) {
        const gl = alphabet.glyphs.find((g) => g.ch === ch); if (!gl) return;
        raw(ctx, `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${o.flip ? -1 : 1} 1)">${glyphSvg(alphabet, gl, 0, 0, size, { w: o.w ?? (alphabet.w * size) / 60, color: o.color }, byId)}</g>`);
        return;
      }
      const id = XENO[ch]; if (!id) return;
      put(ctx, id, x, y, size / 30, rot, { sw: (o.w ?? 1.2) / 1.2, color: o.color, flip: o.flip });
    }
    return { P, put, raw, glyph };
  }
  function lum(hex) { const n = parseInt(hex.slice(1, 7), 16); return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; }
  function recolor(frag, line) {
    return frag.replace(/stroke="#[0-9a-fA-F]{3,8}"/g, `stroke="${line}"`).replace(/fill="(#[0-9a-fA-F]{6})"/g, (_, c) => `fill="${lum(c) < 0.3 ? PLATE : line}"`);
  }
  const stroke = (c, w, extra = "") => `fill="none" stroke="${c}" stroke-width="${f3(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}`;
  const knock = (c, w) => stroke(c, w).replace('fill="none"', `fill="${PLATE}"`);
  const fit = (p, size) => size / Math.max(p.w, p.h);
  const polar = (r, deg) => [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];
  function circle(ctx, r, c, w, extra) { ctx.out.push(`<circle cx="${C}" cy="${C}" r="${f1(r)}" ${stroke(c, w, extra)}/>`); }
  function svgDoc(ctx, bg = true) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${ctx.defs.size ? `<defs>${[...ctx.defs.values()].join("")}</defs>` : ""}${bg ? `<rect width="${S}" height="${S}" fill="${PLATE}"/>` : ""}${ctx.out.join("")}</svg>`;
  }
  function hollowPath(ctx, d, w, col = MINT) { ctx.out.push(`<path d="${d}" ${stroke(col, w * 2.4)}/>`); ctx.out.push(`<path d="${d}" ${stroke(PLATE, w * 1.0)}/>`); }
  const hashStr = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  function ornParts(g, parts) {
    const { pickLine } = partHelpers(parts);
    const R = rng(g.orn?.seed ?? (g.seed ^ 0x5bd1e995)), pick = (a) => a[Math.floor(R() * a.length)];
    const any = (...roles) => { for (const r of roles) { const id = pickLine(R, r); if (id) return id; } return null; };
    return { rim: any("frieze", "segment"), rim2: any(pick(["bead", "lamp"]), "bead"), fill: any(pick(["lamp", "spire", "segment", "lamp"]), "lamp"),
      tip: any(pick(["spire", "lamp", "bead"]), "bead"), ray: any("spire", "segment"), fin: any("hook", "blade"), dot: any("bead"), halo: any("halo", "lamp"), mult: 2 + Math.floor(R() * 2), flipRim: R() < 0.5 };
  }

  /* ---------- word to path ---------- */
  function reduce(text) {
    const t = (text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const seen = new Set(), out = [];
    [...t].forEach((ch, i) => { if (seen.has(ch)) return; if (i > 0 && "AEIOU".includes(ch)) return; seen.add(ch); out.push(ch); });
    return out.join("");
  }
  const KAMEA6 = [[6, 32, 3, 34, 35, 1], [7, 11, 27, 28, 8, 30], [19, 14, 16, 15, 23, 24], [18, 20, 22, 21, 17, 13], [25, 29, 10, 9, 26, 12], [36, 5, 33, 4, 2, 31]];
  const KCELL = {}; KAMEA6.forEach((row, r) => row.forEach((v, c) => { KCELL[v] = [c, r]; }));
  const numOf = (ch) => CHARS.indexOf(ch) + 1;
  function tracePoints(method, word, Rt) {
    if (method === "wheel") return [...word].map((ch) => polar(Rt, ((numOf(ch) - 1) / 36) * 360));
    const step = (Rt * 2 * 0.74) / 5;
    return [...word].map((ch) => { const [c, r] = KCELL[numOf(ch)] || [0, 0]; return [C + (c - 2.5) * step, C + (r - 2.5) * step]; });
  }

  /* ---------- SEAL ---------- */
  function newSigil(seed, text, parts) {
    const { pickId } = partHelpers(parts);
    const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
    const n = pick([5, 6, 7, 8, 8, 9, 10, 12]);
    const petal = () => pickId(R, R() < 0.6 ? "blade" : R() < 0.5 ? "hook" : "rib");
    return { mode: "sigil", seed, text: text ?? "FORGE", method: pick(["wheel", "wheel", "kamea", "monogram"]), n, mirror: R() < 0.7,
      frame: { kind: pick(["ring", "star", "star", "poly"]), k: 2 + Math.floor(R() * 3) },
      band: R() < 0.6, lw: +(1.1 + R() * 0.8).toFixed(1), alpha: "forged", oneColor: false,
      detail: +(0.65 + R() * 0.3).toFixed(2), orn: { seed: Math.floor(R() * 1e9) }, weave: false, contours: 2,
      layers: [{ part: petal(), r: +(0.42 + R() * 0.15).toFixed(2), size: Math.round(50 + R() * 40), spin: Math.round(-30 + R() * 50), off: +(0.15 + R() * 0.2).toFixed(2) },
               { part: petal(), r: +(0.72 + R() * 0.1).toFixed(2), size: R() < 0.75 ? Math.round(40 + R() * 40) : 0, spin: Math.round(-40 + R() * 60), off: +(0.1 + R() * 0.25).toFixed(2) }],
      beads: { part: pickId(R, "bead"), mult: Math.floor(R() * 3) }, core: { part: pickId(R, R() < 0.5 ? "lamp" : "bead") },
      trace: { bead: pickId(R, "bead"), hook: pickId(R, "hook") },
      mono: [0, 1, 2, 3, 4, 5, 6, 7].map(() => ({ rot: pick([0, 0, 90, 180, 270]), flip: R() < 0.3, k: +(0.75 + R() * 0.35).toFixed(2) })) };
  }

  // generate(g, { parts, byId, alphabet }, opt) -> { svg, parts, word }
  function generate(g, kit, opt = {}) {
    const { byId, parts, alphabet } = kit;
    const { P, put, raw, glyph } = makeDrawHelpers(byId);
    const ctx = mkCtx(), color = g.oneColor ? MINT : undefined, lw = g.lw, word = reduce(g.text);
    const n = g.n, D = clamp(+g.detail || 0, 0, 1), O = D > 0 ? ornParts(g, parts) : null, so = { sw: lw / 1.2, color };
    const { lineOnly } = partHelpers(parts);
    function hollow(ctx2, id, x, y, s, rot, o = {}, k = 1) {
      const p = P(id); if (!p) return;
      if (!lineOnly(p)) return put(ctx2, id, x, y, s, rot, o);
      const sw = o.sw ?? 1;
      put(ctx2, id, x, y, s, rot, { ...o, fix: true, sw: sw * 3.0 * k, color: o.color || MINT });
      put(ctx2, id, x, y, s, rot, { ...o, fix: true, sw: sw * 1.15 * k, color: PLATE, op: undefined });
    }

    function rosette(ctx2, L, color2, extra = {}, lwOverride) {
      const p = P(L.part); if (!p || !(L.size > 0)) return;
      const s = fit(p, L.size), r = L.r * 250, step = 360 / n, o = { sw: (lwOverride ?? g.lw) / 1.2, color: color2, ...extra };
      for (let i = 0; i < n; i++) {
        const th = i * step;
        if (g.mirror) {
          const off = L.off * step, a = th + off, phi = a + L.spin;
          put(ctx2, p.id, ...polar(r, a), s, phi, o);
          put(ctx2, p.id, ...polar(r, th - off), s, 2 * th - phi, { ...o, flip: true });
        } else put(ctx2, p.id, ...polar(r, th), s, th + L.spin, o);
      }
    }

    if (D > 0.15 && g.frame.kind !== "none") {
      circle(ctx, 290, MINT, lw * 0.8); circle(ctx, 275, DIM, lw * 0.6);
      const m = n * (D > 0.6 ? 8 : 4);
      let d = ""; for (let i = 0; i < m; i++) { const a = (i / m) * 360, long = i % (m / n) === 0, [x1, y1] = polar(275, a), [x2, y2] = polar(long ? 290 : 282, a); d += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`; }
      raw(ctx, `<path d="${d}" ${stroke(MINT, lw * 0.6)}/>`);
      if (D > 0.45 && O.tip) for (let i = 0; i < n; i++) { const a = (i / n) * 360 + 180 / n, [x, y] = polar(283, a); put(ctx, O.tip, x, y, fit(P(O.tip), 13), a, so); }
    }
    const N = n < 6 ? n * 2 : n, R0 = 270;
    if (g.frame.kind !== "none") circle(ctx, R0, MINT, lw * 1.3);
    if (g.frame.kind === "ring") circle(ctx, R0 - 9, MINT, lw * 0.7);
    if (g.frame.kind === "star" || g.frame.kind === "poly") {
      const k = g.frame.kind === "poly" ? 1 : clamp(g.frame.k, 2, Math.floor((N - 1) / 2) || 1), Rs = R0 - 6;
      const pts = Array.from({ length: N }, (_, i) => polar(Rs, (i * 360) / N));
      let d = ""; const seen = new Set();
      for (let i = 0; i < N; i++) { const j = (i + k) % N, key = Math.min(i, j) + "-" + Math.max(i, j); if (seen.has(key)) continue; seen.add(key); d += `M${f1(pts[i][0])} ${f1(pts[i][1])}L${f1(pts[j][0])} ${f1(pts[j][1])}`; }
      raw(ctx, `<path d="${d}" ${stroke(g.frame.kind === "poly" ? MINT : DIM, lw * (g.frame.kind === "poly" ? 1 : 0.9))}/>`);
      if (D > 0.3 && O.dot) pts.forEach(([x, y]) => { put(ctx, O.dot, x, y, fit(P(O.dot), 10), 0, so); raw(ctx, `<circle cx="${f1(x)}" cy="${f1(y)}" r="8" ${stroke(MINT, lw * 0.6)}/>`); });
    }
    let inner = R0;
    if (g.band && word.length) {
      const r1 = R0 - (g.frame.kind === "ring" ? 16 : 12), r2 = r1 - 34, rm = (r1 + r2) / 2;
      circle(ctx, r2, MINT, lw * 0.8);
      const seq = (g.text || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().split(/\s+/).join("·") || word;
      const slots = Math.max(seq.length + 1, Math.floor((2 * Math.PI * rm) / 30));
      const reps = Math.max(1, Math.floor(slots / (seq.length + 1))), total = reps * (seq.length + 1);
      for (let i = 0; i < total; i++) {
        const ch = seq[i % (seq.length + 1)], a = (i / total) * 360, [x, y] = polar(rm, a);
        if (ch === "·" || ch === undefined) { const b = P(g.beads.part) || P(g.trace.bead); if (b) put(ctx, b.id, x, y, fit(b, 9), 0, { sw: lw / 1.2, color }); else raw(ctx, `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.4" fill="${MINT}"/>`); }
        else if (g.alpha === "forged" && alphabet) glyph(ctx, ch, x, y, 25, a, { alpha: "forged", w: Math.max(lw * 0.9, alphabet.w * 25 / 60), color }, alphabet);
        else glyph(ctx, ch, x, y, 22, a, { alpha: g.alpha, w: lw * 0.9, color }, alphabet);
      }
      inner = r2;
    }
    if (D > 0.1 && O.rim) {
      const rr = inner - 15, m = n * O.mult, p = P(O.rim), s = fit(p, Math.min(26, ((2 * Math.PI * rr) / m) * 0.85));
      circle(ctx, inner - 4, MINT, lw * 0.6); circle(ctx, inner - 26, MINT, lw * 0.6);
      for (let i = 0; i < m; i++) { const a = ((i + 0.5) / m) * 360, [x, y] = polar(rr, a); put(ctx, p.id, x, y, s, a + 90, { ...so, flip: O.flipRim && i % 2 === 1 }); }
      if (D > 0.7 && O.rim2) for (let i = 0; i < m; i++) { const a = (i / m) * 360, [x, y] = polar(rr, a); put(ctx, O.rim2, x, y, fit(P(O.rim2), 7), 0, so); }
      inner -= 26;
    }
    const scaleIn = inner / 250;
    const Ls = [...g.layers].map((L) => ({ ...L, r: L.r * Math.min(1, scaleIn) * 0.98 }));
    if (D > 0.4 && Ls.length > 1 && !(Ls[1].size > 0) && O.fin && Ls[0].size > 0) {
      const out0 = Ls[0].r * 250 + Ls[0].size * 0.5, lim = inner - 8, gap = lim - out0;
      if (gap > 34) Ls[1] = { ...Ls[1], part: O.fin, r: (out0 + lim) / 2 / 250, size: Math.min(gap * 0.75, 64), spin: Ls[1].spin || 20, off: Ls[1].off || 0.2 };
    }
    for (const [li, L] of [...Ls.entries()].reverse()) {
      if (!(L.size > 0) || !P(L.part)) continue;
      const r = L.r * 250, step = 360 / n;
      if (D > 0.25 && O.fill) { const pf = P(O.fill), sf = fit(pf, L.size * (li ? 0.38 : 0.46)); for (let i = 0; i < n; i++) { const a = i * step + step / 2, [x, y] = polar(r * (li ? 1 : 0.94), a); (D > 0.5 ? hollow : put)(ctx, pf.id, x, y, sf, a, { ...so, grp: li }); } }
      if (D > 0.45 && li === 0 && lineOnly(P(L.part))) {
        rosette(ctx, L, color || MINT, { fix: true }, lw * 3.0);
        rosette(ctx, L, PLATE, { fix: true }, lw * 1.15);
      } else rosette(ctx, L, color);
      if (D > 0.55 && O.tip) { const pt = P(O.tip), st = fit(pt, 10 + D * 6), rt = r + L.size * 0.55; for (let i = 0; i < n; i++) { const th = i * step, offs = g.mirror ? [L.off * step, -L.off * step] : [0]; for (const dv of offs) { const a = th + dv, [x, y] = polar(rt, a); put(ctx, pt.id, x, y, st, a, { ...so, grp: li }); } } }
      if (D > 0.8 && li === 1 && O.dot) for (let i = 0; i < 2 * n; i++) { const a = (i * step) / 2 + step / 4, [x, y] = polar(r + L.size * 0.2, a); put(ctx, O.dot, x, y, fit(P(O.dot), 8), 0, so); }
    }
    const bead = P(g.beads.part);
    if (bead && g.beads.mult > 0) {
      const m = n * g.beads.mult, rb = inner * 0.9 - 6;
      for (let i = 0; i < m; i++) put(ctx, bead.id, ...polar(rb, ((i + 0.5) / m) * 360), fit(bead, 11), 0, { sw: lw / 1.2, color });
    }
    const Rt = Math.min(inner * 0.5, 130);
    const room = Ls[0].size > 0 ? Ls[0].r * 250 - Ls[0].size * 0.5 - 8 : inner * 0.8;
    if (D > 0.35 && room > Rt + 14) {
      const rh = Math.min(Rt + 22, room - 8); circle(ctx, rh, MINT, lw * 0.8); circle(ctx, rh + 7, MINT, lw * 0.5);
      if (O.dot) for (let i = 0; i < 2 * n; i++) { const a = ((i + 0.5) / (2 * n)) * 360, [x, y] = polar(rh + 3.5, a); put(ctx, O.dot, x, y, fit(P(O.dot), 6), 0, so); }
      if (D > 0.5 && O.fin) { const pf = P(O.fin), sf = fit(pf, 16); for (let i = 0; i < n; i++) { const a = (i / n) * 360, [x, y] = polar(rh + 15, a); put(ctx, pf.id, x - 5 * Math.cos(rad(a)), y - 5 * Math.sin(rad(a)), sf, a, so); put(ctx, pf.id, x + 5 * Math.cos(rad(a)), y + 5 * Math.sin(rad(a)), sf, a, { ...so, flip: true }); } }
      const r0 = Ls[0].size > 0 ? Ls[0].r * 250 - Ls[0].size * 0.5 : inner * 0.8, gap = r0 - (rh + 12);
      if (D > 0.65 && O.ray && gap > 18) { const pr = P(O.ray), sr = fit(pr, gap * 0.85); for (let i = 0; i < n; i++) { const a = (i / n) * 360 + 180 / n, [x, y] = polar(rh + 10 + gap / 2, a); put(ctx, pr.id, x, y, sr, a, so); } }
    }
    if (g.method === "monogram") {
      const core = P(g.core.part);
      if (core) put(ctx, core.id, C, C, fit(core, Rt * 2.1), 0, { sw: lw / 1.2, color, op: 0.35 });
      const ms = [...word].slice(0, 8).map((ch, i) => [ch, g.mono[i] || { rot: 0, flip: false, k: 1 }]);
      if (D > 0.3) {
        ms.forEach(([ch, m]) => glyph(ctx, ch, C, C, Rt * 1.35 * m.k, m.rot, { alpha: g.alpha, flip: m.flip, w: lw * 3.4, color: color || MINT }, alphabet));
        ms.forEach(([ch, m]) => glyph(ctx, ch, C, C, Rt * 1.35 * m.k, m.rot, { alpha: g.alpha, flip: m.flip, w: lw * 1.3, color: PLATE }, alphabet));
      } else ms.forEach(([ch, m]) => glyph(ctx, ch, C, C, Rt * 1.35 * m.k, m.rot, { alpha: g.alpha, flip: m.flip, w: lw * 2.2, color }, alphabet));
    } else if (word.length) {
      const pts = tracePoints(g.method, word, Rt);
      if (g.method === "wheel") for (let i = 0; i < 36; i++) { const [x1, y1] = polar(Rt + 8, i * 10), [x2, y2] = polar(Rt + (i % 9 === 0 ? 18 : 13), i * 10); raw(ctx, `<path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" ${stroke(DIM, lw * 0.8)}/>`); }
      else { const step = (Rt * 2 * 0.74) / 5; for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) raw(ctx, `<circle cx="${f1(C + (c - 2.5) * step)}" cy="${f1(C + (r - 2.5) * step)}" r="1.6" fill="${DIM}"/>`); }
      const core = P(g.core.part);
      if (core) put(ctx, core.id, C, C, fit(core, Rt * 0.55), 0, { sw: lw / 1.2, color, op: 0.55 });
      const td = "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L");
      if (pts.length > 1) { if (D > 0.3) hollowPath(ctx, td, lw * 1.4); else raw(ctx, `<path d="${td}" ${stroke(MINT, lw * 2)}/>`); }
      const tb = P(g.trace.bead);
      pts.slice(1, -1).forEach(([x, y]) => { if (D > 0.3) raw(ctx, `<circle cx="${f1(x)}" cy="${f1(y)}" r="11" ${knock(MINT, lw * 0.8)}/>`); if (tb) put(ctx, tb.id, x, y, fit(tb, D > 0.3 ? 14 : 12), 0, { sw: lw / 1.2, color }); });
      const [sx, sy] = pts[0]; raw(ctx, `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="7" ${(D > 0.3 ? knock : stroke)(MINT, lw * 1.6)}/>`); if (D > 0.3) raw(ctx, `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="12" ${stroke(MINT, lw * 0.6)}/>`);
      if (pts.length > 1) {
        const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2], ang = (Math.atan2(ey - py, ex - px) * 180) / Math.PI;
        const hk = P(g.trace.hook);
        if (hk) put(ctx, hk.id, ex, ey, fit(hk, 26), ang + 90, { sw: lw / 1.2, color });
        else { const nx = -Math.sin(rad(ang)) * 9, ny = Math.cos(rad(ang)) * 9; raw(ctx, `<path d="M${f1(ex - nx)} ${f1(ey - ny)}L${f1(ex + nx)} ${f1(ey + ny)}" ${stroke(MINT, lw * 2)}/>`); }
      }
    }
    return { svg: svgDoc(ctx), parts: ctx.n, word };
  }

  function mutate(g0, R, parts) {
    const { pickId } = partHelpers(parts);
    const g = JSON.parse(JSON.stringify(g0)), pick = (a) => a[Math.floor(R() * a.length)];
    const ops = [
      () => { g.n = clamp(g.n + pick([-2, -1, 1, 2]), 3, 16); },
      () => { g.mirror = !g.mirror; },
      () => { g.frame.kind = pick(["ring", "star", "poly", "none"]); g.frame.k = 2 + Math.floor(R() * 3); },
      () => { const L = pick(g.layers); L.part = pickId(R, pick(["blade", "hook", "rib", "lamp"])); },
      () => { const L = pick(g.layers); L.spin = clamp(L.spin + Math.round((R() - 0.5) * 60), -90, 90); },
      () => { const L = pick(g.layers); L.size = clamp(Math.round(L.size * (0.7 + R() * 0.6)) || 40, 0, 150); },
      () => { const L = pick(g.layers); L.off = +clamp(L.off + (R() - 0.5) * 0.2, 0, 0.5).toFixed(2); },
      () => { g.beads.mult = (g.beads.mult + 1 + Math.floor(R() * 2)) % 4; },
      () => { g.core.part = pickId(R, pick(["lamp", "bead", "halo"])); },
      () => { g.trace.bead = pickId(R, "bead"); g.trace.hook = pickId(R, "hook"); },
      () => { g.band = !g.band; },
      () => { g.detail = +clamp((+g.detail || 0) + (R() - 0.4) * 0.4, 0, 1).toFixed(2); },
      () => { g.orn = { seed: Math.floor(R() * 1e9) }; },
      () => { g.mono.forEach((m) => { m.rot = pick([0, 90, 180, 270]); m.flip = R() < 0.3; }); },
    ];
    const k = 2 + Math.floor(R() * 2); for (let i = 0; i < k; i++) pick(ops)();
    g.seed = Math.floor(R() * 1e9);
    return g;
  }

  /* ---------- ALPHABET: grid-walk glyphs ---------- */
  function gridEdges(cols, rows, diag) {
    const E = [], id = (x, y) => y * cols + x;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) E.push([id(x, y), id(x + 1, y)]);
      if (y + 1 < rows) E.push([id(x, y), id(x, y + 1)]);
      if (diag && x + 1 < cols && y + 1 < rows) { E.push([id(x, y), id(x + 1, y + 1)]); E.push([id(x + 1, y), id(x, y + 1)]); }
    }
    return E;
  }
  const ekey = ([a, b]) => (a < b ? a + "-" + b : b + "-" + a);
  function makeGlyph(R, A, E) {
    const { cols, rows, min, max } = A, adj = new Map();
    for (const e of E) for (const [u, v] of [[e[0], e[1]], [e[1], e[0]]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); }
    const target = min + Math.floor(R() * (max - min + 1)), used = new Set(), nodes = [];
    let cur = Math.floor(R() * cols * rows); nodes.push(cur);
    let guard = 0;
    while (used.size < target && guard++ < 80) {
      const opts = adj.get(cur).filter((v) => !used.has(ekey([cur, v])));
      if (!opts.length || (used.size >= 2 && R() < 0.18)) { cur = nodes[Math.floor(R() * nodes.length)]; continue; }
      const v = opts[Math.floor(R() * opts.length)];
      used.add(ekey([cur, v])); cur = v; nodes.push(v);
    }
    return [...used].map((k) => k.split("-").map(Number));
  }
  function crossings(edges, cols) {
    const set = new Set(edges.map(ekey)); let n = 0;
    for (const [a, b] of edges) {
      const ax = a % cols, ay = Math.floor(a / cols), bx = b % cols, by = Math.floor(b / cols);
      if (Math.abs(ax - bx) === 1 && Math.abs(ay - by) === 1 && bx - ax === by - ay) {
        const x = Math.min(ax, bx), y = Math.min(ay, by);
        if (set.has(ekey([y * cols + x + 1, (y + 1) * cols + x]))) n++;
      }
    }
    return n;
  }
  function glyphOK(edges, A) {
    const ys = new Set(), xs = new Set();
    for (const e of edges) for (const v of e) { ys.add(Math.floor(v / A.cols)); xs.add(v % A.cols); }
    if (Math.max(...ys) - Math.min(...ys) !== A.rows - 1) return false;
    if (xs.size < 2) return false;
    return crossings(edges, A.cols) <= A.cross;
  }
  const mirrorKey = (edges, cols) => edges.map(([a, b]) => ekey([Math.floor(a / cols) * cols + (cols - 1 - (a % cols)), Math.floor(b / cols) * cols + (cols - 1 - (b % cols))])).sort().join(",");
  function distinct(edges, kept, A) {
    const k = new Set(edges.map(ekey)), mk = mirrorKey(edges, A.cols);
    for (const g of kept) {
      if (g === null) continue;
      const o = new Set(g.edges.map(ekey));
      let d = 0; for (const x of k) if (!o.has(x)) d++; for (const x of o) if (!k.has(x)) d++;
      if (d < A.dist) return false;
      if (g.edges.map(ekey).sort().join(",") === mk) return false;
    }
    return true;
  }
  function newAlphabet(seed, A0) {
    const R = rng(seed), A = { ...A0, seed, glyphs: [] }, E = gridEdges(A.cols, A.rows, A.diag);
    let tries = 0;
    for (const ch of CHARS) {
      let g = null;
      while (!g && tries++ < 20000) { const e = makeGlyph(R, A, E); if (glyphOK(e, A) && distinct(e, A.glyphs, A)) g = { ch, edges: e }; }
      if (!g) { const e = makeGlyph(R, A, E); g = { ch, edges: e }; }
      A.glyphs.push(g);
    }
    return A;
  }
  function strokesOf(edges) {
    const adj = new Map(), used = new Set();
    for (const [a, b] of edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const deg = (v) => adj.get(v).length, out = [];
    const walk = (s) => { const path = [s]; let cur = s; for (;;) { const nx = adj.get(cur).find((v) => !used.has(ekey([cur, v]))); if (nx == null) break; used.add(ekey([cur, nx])); path.push(nx); cur = nx; if (deg(cur) !== 2) break; } return path; };
    for (const v of adj.keys()) if (deg(v) !== 2) while (adj.get(v).some((u) => !used.has(ekey([v, u])))) out.push(walk(v));
    for (const v of adj.keys()) while (adj.get(v).some((u) => !used.has(ekey([v, u])))) out.push(walk(v));
    return { strokes: out, adj };
  }
  function chaikin(pts, it = 2) {
    for (let k = 0; k < it; k++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      o.push(pts[pts.length - 1]); pts = o;
    }
    return pts;
  }
  function glyphParts(A, parts) {
    if (A._parts && A._parts.k === A.seed) return A._parts;
    const { pickLine } = partHelpers(parts);
    const R = rng((A.seed || 1) ^ 0x2545f491);
    const p = { k: A.seed, barb: pickLine(R, "hook") || pickLine(R, "blade"), dot: A.bead || pickLine(R, "bead"), mark: pickLine(R, R() < 0.5 ? "lamp" : "spire") || pickLine(R, "bead") };
    Object.defineProperty(A, "_parts", { value: p, enumerable: false, configurable: true, writable: true });
    return p;
  }
  function glyphSvg(A, gl, x, y, size, o = {}, byId, parts) {
    const { P, put, raw } = makeDrawHelpers(byId || {});
    const unit = size / (Math.max(A.cols, A.rows) - 1), ox = x - (unit * (A.cols - 1)) / 2, oy = y - (unit * (A.rows - 1)) / 2;
    const pt = (v) => [ox + (v % A.cols) * unit, oy + Math.floor(v / A.cols) * unit];
    const col = o.color || MINT, w = o.w ?? A.w, ctx = mkCtx();
    const { strokes, adj } = strokesOf(gl.edges);
    const orn = unit >= 11 ? clamp(+A.orn || 0, 0, 1) : 0, GR = rng(hashStr(gl.ch + ":" + (A.seed || 0) + ":" + gl.edges.length));
    const ga = orn > 0 && parts ? glyphParts(A, parts) : null, hollowOK = orn > 0.4 && w >= 2.2 && A.style !== "beaded" && col !== PLATE;
    for (const s of strokes) {
      let pts = s.map(pt);
      if (A.style === "round" || A.style === "creature") pts = chaikin(pts, 2);
      if (hollowOK) { hollowPath(ctx, `M${pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}`, w * 0.55, col); continue; }
      if (A.style === "beaded") {
        const bead = P(A.bead);
        raw(ctx, `<path d="M${pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}" ${stroke(col, w * 0.45)}/>`);
        if (bead) for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / (unit * 0.34))); for (let k = 0; k <= n; k++) { if (k === n && i < pts.length - 2) continue; put(ctx, bead.id, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, fit(bead, unit * 0.26), 0, { uniform: w * 0.5, color: o.color }); } }
      } else raw(ctx, `<path d="M${pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}" ${stroke(col, w)}/>`);
    }
    if (A.style === "creature") {
      const hk = P(A.hook), bd = P(A.bead);
      for (const [v, nb] of adj) {
        const [x0, y0] = pt(v);
        if (nb.length === 1 && hk) { const [x1, y1] = pt(nb[0]), ang = (Math.atan2(y0 - y1, x0 - x1) * 180) / Math.PI; put(ctx, hk.id, x0, y0, fit(hk, unit * 0.62), ang + 90, { uniform: w * 0.6, color: o.color, flip: v % 2 === 1 }); }
        if (nb.length >= 3 && bd) put(ctx, bd.id, x0, y0, fit(bd, unit * 0.38), 0, { uniform: w * 0.6, color: o.color });
      }
    }
    if (orn > 0 && ga) {
      const pw = { uniform: Math.max(1, w * 0.45), color: o.color };
      if (ga.barb) gl.edges.forEach(([a, b], i) => {
        if (GR() > orn * 0.85) return;
        const [x1, y1] = pt(a), [x2, y2] = pt(b), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI, side = i % 2 ? 1 : -1;
        const nx = -Math.sin(rad(ang)) * side * unit * 0.2, ny = Math.cos(rad(ang)) * side * unit * 0.2;
        put(ctx, ga.barb, mx + nx, my + ny, fit(P(ga.barb), unit * 0.42), ang + (side > 0 ? 180 : 0), { ...pw, flip: side > 0 });
      });
      for (const [v, nb] of adj) {
        if (nb.length < 2) continue;
        const [x0, y0] = pt(v);
        const turn = nb.length === 2 && (() => { const [a, b] = nb.map(pt); return Math.abs((a[0] - x0) * (b[1] - y0) - (a[1] - y0) * (b[0] - x0)) > 1e-6; })();
        if (nb.length >= 3 || (turn && GR() < orn * 0.7)) raw(ctx, `<circle cx="${f1(x0)}" cy="${f1(y0)}" r="${f1(unit * 0.16)}" ${knock(col, Math.max(1, w * 0.4))}/>`);
        if (nb.length >= 3 && ga.dot && orn > 0.5) put(ctx, ga.dot, x0, y0, fit(P(ga.dot), unit * 0.2), 0, pw);
      }
      if (GR() < orn * 0.8 && ga.mark) {
        const ys = gl.edges.flat().map((v) => pt(v)[1]), xs = gl.edges.flat().map((v) => pt(v)[0]);
        const top = GR() < 0.5, cx = (Math.min(...xs) + Math.max(...xs)) / 2 + (GR() - 0.5) * unit * 0.6;
        const yy = top ? Math.min(...ys) - unit * 0.42 : Math.max(...ys) + unit * 0.42;
        const id = GR() < 0.5 ? ga.mark : ga.dot || ga.mark;
        put(ctx, id, cx, yy, fit(P(id), unit * 0.46), top ? 0 : 180, pw);
      }
      if (orn > 0.75) for (const s of strokes) {
        if (s.length < 3) continue;
        let q = s.map(pt); if (A.style === "round" || A.style === "creature") q = chaikin(q, 2);
        const off = unit * 0.14, o2 = q.map((p, i) => { const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [p[0] - ((b[1] - a[1]) / L) * off, p[1] + ((b[0] - a[0]) / L) * off]; });
        raw(ctx, `<path d="M${o2.slice(1, -1).map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}" ${stroke(col, Math.max(0.8, w * 0.25))}/>`);
      }
    }
    for (const [k, d] of ctx.defs) o.defs?.set(k, d);
    return ctx.out.join("");
  }
  function drawSheet(A, byId, parts) {
    const ctx = mkCtx(), cell = S / 6;
    A.glyphs.forEach((gl, i) => {
      const cx = (i % 6 + 0.5) * cell, cy = (Math.floor(i / 6) + 0.5) * cell + 4;
      ctx.out.push(`<text x="${f1(cx - cell / 2 + 8)}" y="${f1(cy - cell / 2 + 12)}" fill="${DIM}" font-family="IBM Plex Mono, monospace" font-size="11">${gl.ch}</text>`);
      ctx.out.push(glyphSvg(A, gl, cx, cy, cell * 0.56, { defs: ctx.defs }, byId, parts));
    });
    for (let i = 1; i < 6; i++) ctx.out.push(`<path d="M${f1(i * cell)} 8V${S - 8}M8 ${f1(i * cell)}H${S - 8}" stroke="#20242c" stroke-width="1"/>`);
    return { svg: svgDoc(ctx), parts: ctx.n };
  }

  window.SigilGenerator = { newSigil, generate, mutate, newAlphabet, drawSheet, glyphSvg, S, C };
})();
