/* tools/mural/mural.js — "The Tower of the Old Ones", a creation-myth mural painted in canvas from
   the library's own generators, read left to right like the murals in Journey:

     I   The First Light   the Old Ones pour out of a sun-seal (Sigil Forge seal) and spiral into the sky
     II  The Tower         a great spire (Spire Forge) on a mesa sends a beam into the spirit sky; the
                           Old Ones (Cybernetic Ecology creatures) circle it, trailing cloth
     III The Long Sleep    arch and classical towers (Creature Arch, Creature Classical) half buried in
                           dunes, stone columns standing as tombstones, red-robed pilgrims walking home

   Friezes top and bottom carry Scriptorium glyphs (shared/glyph/glyph-system.js) and small seals;
   each chapter's name is written as one composed logogram. Over everything: plaster grain, cracks,
   wear and gold leaf. Every figure is painted from a generator's own drawing: its lines become gold
   or ink, and whatever the lines enclose is filled as a body (the flood fill used by the Seraph).

     Mural.paint(canvas, { seed, kit, species, onStage })  -> Promise   (canvas is resized to 3600 x 1500)
   Needs kit-utils, the Forge generators and registry, ecology-sim, ecology-render, xenoglyph-engine,
   glyph-system and a species file (window.SERAPH_SPECIES). Classic script. */
(function () {
  "use strict";
  const W = 3600, H = 1500, FR = 112;                    // mural size; frieze height
  const HORIZON = 1010;
  const P = {
    sky0: "#191630", sky1: "#33284a", sky2: "#6e3443", sky3: "#c45a3c", haze: "#efa05a",
    sand0: "#f3c47e", sand1: "#e09a55", sand2: "#bd6a35", sand3: "#8a4224", sand4: "#5a2717",
    umber: "#2e1610", umber2: "#4a2416", red: "#a52c1c", red2: "#7a2117", gold: "#f3c86e", goldHi: "#fff0c0", goldDeep: "#b98030",
    spirit: "#d6fff4", spirit2: "#86e0cf", spirit3: "#3d9c94", bone: "#f6ecd8", plaster: "#ead6b2",
  };
  const tick = () => new Promise((r) => requestAnimationFrame(() => r()));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

  // ── drawings → masks ─────────────────────────────────────────────────────
  // Forge draws mint lines on a dark plate: every colour becomes its brightness, the plate black
  function brightness(svg) {
    // captions and labels in a drawing would rasterise into specks: a mural has no small print
    svg = svg.replace(/<text[\s\S]*?<\/text>/g, "");
    return svg.replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => {
      const L = Math.max(...hex("#" + h)) / 255;
      if (L < 0.2) return "#000000";
      const v = Math.round(Math.min(1, L / 0.72) * 255).toString(16).padStart(2, "0");
      return "#" + v + v + v;
    });
  }
  const loadImg = (svg) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("a drawing would not load")); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
  function viewBox(svg) { const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1]; const a = vb ? vb.trim().split(/[\s,]+/).map(Number) : [0, 0, 600, 600]; return { w: a[2] || 600, h: a[3] || 600 }; }
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  // a drawing fitted into w x h (contain), as a brightness mask
  async function svgMask(svg, w, h) {
    const vb = viewBox(svg), k = Math.min(w / vb.w, h / vb.h), dw = vb.w * k, dh = vb.h * k;
    const c = canvas(dw, dh), x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(await loadImg(brightness(svg)), 0, 0, c.width, c.height);
    return c;
  }
  // what the lines enclose: close small gaps, flood the outside in from the edges (half resolution)
  function enclosed(mask) {
    const step = mask.width * mask.height > 1.6e6 ? 2 : 1, w = Math.ceil(mask.width / step), h = Math.ceil(mask.height / step), n = w * h, R = 2;
    const c = canvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(mask, 0, 0, w, h);
    const px = x.getImageData(0, 0, w, h).data, a = new Uint8Array(n), b = new Uint8Array(n), q = new Int32Array(n);
    for (let i = 0; i < n; i++) a[i] = px[i * 4] > 40 ? 1 : 0;
    const grow = (src, dst) => {
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let m = 0; for (let k = -R; k <= R && !m; k++) { const t = xx + k; if (t >= 0 && t < w && src[y * w + t]) m = 1; } dst[y * w + xx] = m; }
      for (let xx = 0; xx < w; xx++) for (let y = 0; y < h; y++) { let m = 0; for (let k = -R; k <= R && !m; k++) { const t = y + k; if (t >= 0 && t < h && dst[t * w + xx]) m = 1; } src[y * w + xx] = m; }
    };
    grow(a, b);
    b.fill(0); let qh = 0, qt = 0;
    const seed = (i) => { if (!a[i] && !b[i]) { b[i] = 1; q[qt++] = i; } };
    for (let i = 0; i < w; i++) { seed(i); seed((h - 1) * w + i); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) { const i = q[qh++], xx = i % w; if (xx > 0) seed(i - 1); if (xx < w - 1) seed(i + 1); if (i >= w) seed(i - w); if (i < n - w) seed(i + w); }
    grow(b, a);
    const out = canvas(mask.width, mask.height), ox = out.getContext("2d");
    const small = canvas(w, h), sx = small.getContext("2d"), img = sx.createImageData(w, h);
    for (let i = 0; i < n; i++) { img.data[i * 4 + 3] = b[i] ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; }
    sx.putImageData(img, 0, 0);
    ox.imageSmoothingEnabled = true; ox.filter = "blur(1px)"; ox.drawImage(small, 0, 0, mask.width, mask.height);
    return out;
  }
  // a figure in pigments: the enclosed body in one colour, the lines in another, optional glow
  function figure(mask, o) {
    const w = mask.width, h = mask.height, fill = o.body ? enclosed(mask) : null;
    const out = canvas(w, h), x = out.getContext("2d");
    const md = mask.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const fd = fill ? fill.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data : null;
    const img = x.createImageData(w, h), d = img.data, B = o.body ? hex(o.body) : [0, 0, 0], L = hex(o.line), ba = o.bodyAlpha ?? 1, la = o.lineAlpha ?? 1;
    for (let i = 0; i < w * h; i++) {
      const j = i * 4, l = md[j] / 255, f = fd ? (fd[j + 3] / 255) * ba : 0, a = Math.max(f, l * la);
      if (a <= 0.003) continue;
      const t = Math.min(1, (l * la) / Math.max(a, 1e-3));
      d[j] = B[0] + (L[0] - B[0]) * t; d[j + 1] = B[1] + (L[1] - B[1]) * t; d[j + 2] = B[2] + (L[2] - B[2]) * t; d[j + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return trim(out, d, w, h);
  }
  // crop to the painted ink, so a figure stands on its own feet (drawings carry empty margins)
  function trim(c, d, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return c;
    const o = canvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext("2d").drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }
  function place(ctx, img, cx, by, o) {
    // centred on cx, standing on baseline by (or centred on by when o.centre)
    o = o || {};
    const w = img.width, h = img.height;
    ctx.save(); ctx.translate(cx, by); if (o.rot) ctx.rotate(o.rot); if (o.flip) ctx.scale(-1, 1);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    const dx = -w / 2, dy = o.centre ? -h / 2 : -h;
    if (o.glow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.filter = `blur(${o.glow}px)`; ctx.globalAlpha = (o.alpha ?? 1) * (o.glowAlpha ?? 0.8); ctx.drawImage(img, dx, dy); ctx.restore(); }
    ctx.drawImage(img, dx, dy);
    ctx.restore();
  }

  // ── the Old Ones: Cybernetic Ecology creatures posed in flight ───────────
  const FOCAL = Math.max(60, 1000 * 0.9 * 0.8) * 0.45, K = 20;
  function creatureRenderer(species) {
    const cv = canvas(700, 700);
    const r = EcologyRender.create(cv, { SPECIES: species, HUE: {}, WING: {}, DEFAULT_COL_HI: window.SERAPH_DEFAULT_COL_HI }, { maxFish: 2 });
    EcologyRender.resize(r, 700, 700);
    return { cv, r };
  }
  function creatureMask(rend, species, key, pose) {
    const idx = Math.max(0, species.findIndex((s) => s.key === key)), sp = species[idx], b = sp.bounds;
    const aspect = (b[2] - b[0]) / (b[3] - b[1]), span = 640, len = span / Math.max(1, aspect);
    const f = { sp: idx, len, chain: new Float32Array(K * 2), cz: new Float32Array(K).fill(FOCAL), croll: new Float32Array(K), phase: 0, seed: 1, z: 0, darkRoll: 1, cloak: 0, fade: 1, gulp: 0,
      tuck: pose.tuck, turnS: pose.turn, puff: pose.puff, alert: 0, glide: pose.glide, flap: pose.flap };
    const seg = f.len / (K - 1), pts = [[0, 0]];
    for (let k = 1; k < K; k++) { const a = (pose.bend * (k / (K - 1) - 0.5)) * Math.PI / 180, [x, y] = pts[k - 1]; pts.push([x + Math.sin(a) * seg, y + Math.cos(a) * seg]); }
    const mx = pts[K >> 1][0], my = pts[K >> 1][1];
    for (let k = 0; k < K; k++) { f.chain[k * 2] = 500 + pts[k][0] - mx; f.chain[k * 2 + 1] = 500 + pts[k][1] - my; }
    const tank = { fish: [f], carcasses: [], speciesRT: species.map(() => ({ beh: null })), cfg: { size: 176, dz: 0.8, wiggle: 0.018, beh: "off" }, _bodyLen: (x) => x.len };
    EcologyRender.frame(rend.r, { sim: tank, time: pose.t || 3, worldW: 1000, worldH: 1000, dpr: 1, camera: { tilt: 0 },
      render: { glow: 0.3, iris: 0, irisMode: 1, shimmer: 0, snow: false, carcasses: false, dark: 0, wings: 1, waterAlpha: 1 } });
    // keep brightness only, cropped to the creature, in the same task (the WebGL frame is still readable)
    const m = canvas(700, 700), x = m.getContext("2d", { willReadFrequently: true });
    x.drawImage(rend.cv, 0, 0);
    const id = x.getImageData(0, 0, 700, 700), d = id.data;
    let top = 1, x0 = 700, y0 = 700, x1 = 0, y1 = 0;
    for (let i = 0; i < d.length; i += 4) { const L = Math.max(d[i], d[i + 1], d[i + 2]); d[i] = L; if (L > top) top = L; }
    const k = Math.min(4, 240 / top);
    for (let y = 0; y < 700; y++) for (let xx = 0; xx < 700; xx++) { const j = (y * 700 + xx) * 4, L = Math.min(255, d[j] * k); d[j] = d[j + 1] = d[j + 2] = L; d[j + 3] = 255; if (L > 30) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    x.putImageData(id, 0, 0);
    if (x1 <= x0) return m;
    const pad = 12, c = canvas(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad), cx = c.getContext("2d");
    cx.fillStyle = "#000"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(m, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  }
  function scaled(img, s) { const c = canvas(img.width * s, img.height * s), x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height); return c; }

  // ── painted elements ─────────────────────────────────────────────────────
  // cloth: a long ribbon that narrows as it flows, with gold glyph dots (Journey's scarves and cloth creatures)
  function ribbon(ctx, pts, w0, R, col) {
    if (pts.length < 2) return;
    const left = [], right = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const w = w0 * (1 - (i / (n - 1)) * 0.75) * (0.85 + 0.15 * Math.sin(i * 0.9));
      left.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]); right.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
    }
    ctx.save();
    ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]); for (const p of left.slice(1)) ctx.lineTo(p[0], p[1]); for (const p of right.reverse()) ctx.lineTo(p[0], p[1]); ctx.closePath();
    ctx.fillStyle = col || P.red; ctx.fill();
    ctx.strokeStyle = rgba(P.umber, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = P.gold;
    for (let i = 2; i < n - 2; i += 3) { const p = pts[i], s = w0 * 0.22 * (1 - i / n); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(R() * Math.PI); ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7); ctx.restore(); }
    ctx.restore();
  }
  // a line that drifts like cloth in wind: its heading swings in a slow wave that grows along it
  function flow(x, y, len, ang, wave, R, steps) {
    const pts = []; steps = steps || 40;
    const ph = R() * 6, f = 2.2 + R() * 1.6;          // one or two slow swells along the cloth, not a wriggle
    for (let i = 0; i < steps; i++) { const t = i / (steps - 1), a = ang + Math.sin(t * f + ph) * wave * (0.3 + t); const prev = pts[i - 1] || [x, y]; pts.push(i ? [prev[0] + Math.cos(a) * (len / steps), prev[1] + Math.sin(a) * (len / steps)] : [x, y]); }
    return pts;
  }
  // a pilgrim: red robe flared at the hem, a dark face with two lights, a scarf in the wind
  function pilgrim(ctx, x, y, s, R, dir) {
    dir = dir || 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    // the scarf streams back from the hood and lifts in the wind, curling as it goes (Journey's scarf)
    ribbon(ctx, flow(-s * 0.06, -s * 0.9, s * (1.1 + R() * 0.4), Math.PI * 1.13, 0.75, R, 24), s * 0.065, R);
    ctx.fillStyle = P.umber; ctx.fillRect(-s * 0.1, -s * 0.06, s * 0.05, s * 0.06); ctx.fillRect(s * 0.06, -s * 0.06, s * 0.05, s * 0.06);   // legs
    ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.84); ctx.quadraticCurveTo(-s * 0.2, -s * 0.4, -s * 0.3, -s * 0.05); ctx.quadraticCurveTo(0, s * 0.02, s * 0.3, -s * 0.05); ctx.quadraticCurveTo(s * 0.2, -s * 0.4, s * 0.08, -s * 0.84); ctx.closePath();
    ctx.fillStyle = P.red; ctx.fill();
    ctx.fillStyle = P.gold; for (let i = -2; i <= 2; i++) ctx.fillRect(i * s * 0.09 - s * 0.025, -s * 0.2, s * 0.05, s * 0.05);   // hem glyphs
    ctx.beginPath(); ctx.ellipse(0, -s * 0.9, s * 0.13, s * 0.15, 0, 0, Math.PI * 2); ctx.fillStyle = P.red2; ctx.fill();   // hood
    ctx.beginPath(); ctx.ellipse(s * 0.02, -s * 0.89, s * 0.075, s * 0.09, 0, 0, Math.PI * 2); ctx.fillStyle = P.umber; ctx.fill();
    ctx.fillStyle = P.goldHi; ctx.fillRect(s * 0.0, -s * 0.9, s * 0.03, s * 0.012); ctx.fillRect(s * 0.05, -s * 0.9, s * 0.03, s * 0.012);   // eyes
    ctx.restore();
  }
  // dunes: a band of sand with a lit and a shaded side, ripples, and grain
  function dune(ctx, y0, amp, freq, phase, cTop, cBottom, R, ripples) {
    const pts = [];
    for (let x = -20; x <= W + 20; x += 12) pts.push([x, y0 - amp * (0.55 * Math.sin(x * freq + phase) + 0.3 * Math.sin(x * freq * 2.3 + phase * 1.7) + 0.15 * Math.sin(x * freq * 5.1 + phase * 0.4))]);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-20, H); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.lineTo(W + 20, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + 260); g.addColorStop(0, cTop); g.addColorStop(1, cBottom);
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    // the lit crest
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = rgba(P.goldHi, 0.55); ctx.lineWidth = 2.2; ctx.stroke();
    // ripples
    if (ripples) {
      ctx.strokeStyle = rgba(P.sand4, 0.16); ctx.lineWidth = 1.4;
      for (let i = 0; i < ripples; i++) {
        const x = R() * W, base = y0 + 20 + R() * 220, L = 40 + R() * 120;
        ctx.beginPath(); ctx.moveTo(x, base); ctx.bezierCurveTo(x + L * 0.3, base - 6, x + L * 0.7, base + 6, x + L, base - 2); ctx.stroke();
      }
    }
    ctx.restore();
    return (x) => y0 - amp * (0.55 * Math.sin(x * freq + phase) + 0.3 * Math.sin(x * freq * 2.3 + phase * 1.7) + 0.15 * Math.sin(x * freq * 5.1 + phase * 0.4));
  }

  // ── the mural ────────────────────────────────────────────────────────────
  async function paint(target, opts) {
    const R = ForgeKit.rng(opts.seed || 1), kit = opts.kit, species = opts.species, stage = opts.onStage || (() => {});
    target.width = W; target.height = H;
    const ctx = target.getContext("2d");
    const Reg = ForgeRegistry;
    const draw = (id, seed) => Reg.run(id, Reg.create(id, kit, seed), kit).svg;

    // sky: night above, the spirit band, a burning horizon
    stage("Painting the sky");
    const g = ctx.createLinearGradient(0, FR, 0, HORIZON);
    g.addColorStop(0, P.sky0); g.addColorStop(0.38, P.sky1); g.addColorStop(0.68, P.sky2); g.addColorStop(0.9, P.sky3); g.addColorStop(1, P.haze);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // painted bands, the way a mural layers its sky
    for (let i = 0; i < 9; i++) {
      const y = FR + 60 + i * 95 + R() * 30;
      ctx.fillStyle = rgba(i < 4 ? P.spirit3 : P.haze, 0.04 + R() * 0.04);
      ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.004 + i) * 14); ctx.lineTo(W, y + 30); ctx.lineTo(0, y + 30); ctx.fill();
    }
    // stars in the spirit sky
    for (let i = 0; i < 900; i++) { const x = R() * W, y = FR + R() * (HORIZON - FR) * 0.55, s = R() < 0.92 ? 1.2 : 2.6; ctx.fillStyle = rgba(R() < 0.7 ? P.bone : P.spirit, 0.35 + R() * 0.5); ctx.fillRect(x, y, s, s); }
    // long spirit clouds
    for (let i = 0; i < 7; i++) {
      const y = FR + 200 + R() * 520, x = R() * W, L = 500 + R() * 900, th = 14 + R() * 22;
      ctx.fillStyle = rgba(i % 2 ? P.spirit2 : P.haze, 0.07 + R() * 0.06);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + L * 0.3, y - th, x + L * 0.7, y - th, x + L, y); ctx.bezierCurveTo(x + L * 0.7, y + th * 0.6, x + L * 0.3, y + th * 0.6, x, y); ctx.fill();
    }
    await tick();

    // I — the sun-seal and the light it pours out
    stage("Casting the sun-seal");
    const SUN = [610, 470], sunR = 300;
    ctx.save(); ctx.translate(SUN[0], SUN[1]);
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, l = i % 2 ? sunR * 1.55 : sunR * 2.1, w = i % 2 ? 0.035 : 0.05; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w) * l, Math.sin(a - w) * l); ctx.lineTo(Math.cos(a + w) * l, Math.sin(a + w) * l); ctx.closePath(); ctx.fillStyle = rgba(P.gold, i % 2 ? 0.07 : 0.11); ctx.fill(); }
    const halo = ctx.createRadialGradient(0, 0, sunR * 0.4, 0, 0, sunR * 1.4); halo.addColorStop(0, rgba(P.goldHi, 0.35)); halo.addColorStop(1, rgba(P.gold, 0)); ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, sunR * 1.4, 0, Math.PI * 2); ctx.fill();
    for (const [r, wdt] of [[sunR * 1.08, 4], [sunR * 1.16, 1.6], [sunR * 1.24, 1]]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.strokeStyle = rgba(P.gold, 0.8); ctx.lineWidth = wdt; ctx.stroke(); }
    ctx.restore();
    const sealImg = figure(await svgMask(draw("seal.sigil", Math.floor(R() * 1e9)), sunR * 2, sunR * 2), { body: P.red2, bodyAlpha: 0.92, line: P.gold });
    place(ctx, sealImg, SUN[0], SUN[1], { centre: true, glow: 10, glowAlpha: 0.55 });
    await tick();

    // II — the beam from the tower's crown into the spirit sky
    const TX = 1800, MESA = 1150, TOWER_H = 880;
    const beam = ctx.createLinearGradient(0, FR, 0, MESA - TOWER_H);
    beam.addColorStop(0, rgba(P.spirit, 0.0)); beam.addColorStop(0.35, rgba(P.spirit, 0.45)); beam.addColorStop(1, rgba(P.goldHi, 0.85));
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(TX - 14, MESA - TOWER_H + 40); ctx.lineTo(TX - 70, FR); ctx.lineTo(TX + 70, FR); ctx.lineTo(TX + 14, MESA - TOWER_H + 40); ctx.fill();
    ctx.fillStyle = rgba(P.goldHi, 0.5); ctx.fillRect(TX - 3, FR, 6, MESA - TOWER_H - FR + 40);
    for (let i = 0; i < 5; i++) { const y = FR + 90 + i * 70, r = 60 + i * 34; ctx.beginPath(); ctx.ellipse(TX, y, r, r * 0.22, 0, 0, Math.PI * 2); ctx.strokeStyle = rgba(P.spirit, 0.35 - i * 0.05); ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
    await tick();

    // distant towers on the horizon (more spires, small and hazy)
    stage("Raising the far towers");
    for (const [x, hgt, a] of [[260, 300, 0.32], [1180, 240, 0.28], [2480, 280, 0.3], [3330, 330, 0.34]]) {
      const im = figure(await svgMask(draw("building.spire", Math.floor(R() * 1e9)), hgt * 0.7, hgt), { body: P.sky2, bodyAlpha: 0.9, line: P.haze, lineAlpha: 0.7 });
      place(ctx, im, x, HORIZON + 30, { alpha: a + 0.3 });
    }
    // back dunes
    const back = dune(ctx, HORIZON + 30, 26, 0.0022, R() * 6, P.sand1, P.sand2, R, 0);
    await tick();

    // the mesa and its stair, under the tower
    ctx.save();
    ctx.beginPath(); ctx.moveTo(TX - 520, MESA + 120); ctx.lineTo(TX - 330, MESA); ctx.lineTo(TX + 330, MESA); ctx.lineTo(TX + 520, MESA + 120); ctx.closePath();
    const mg = ctx.createLinearGradient(0, MESA, 0, MESA + 140); mg.addColorStop(0, P.sand2); mg.addColorStop(1, P.sand3); ctx.fillStyle = mg; ctx.fill();
    ctx.strokeStyle = rgba(P.goldHi, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(TX - 330, MESA); ctx.lineTo(TX + 330, MESA); ctx.stroke();
    for (let i = 0; i < 9; i++) { const y = MESA + 12 + i * 12, w = 70 + i * 16; ctx.fillStyle = i % 2 ? P.sand1 : P.sand2; ctx.fillRect(TX - w / 2, y, w, 10); }
    ctx.restore();

    // creatures behind the tower
    stage("Waking the Old Ones");
    const rend = creatureRenderer(species);
    const keys = species.map((s) => s.key);
    const flyer = async (key, x, y, size, rot, behind, trail) => {
      const pose = { bend: (R() - 0.5) * 50, tuck: R() * 0.3, puff: 0.5 + R() * 0.5, glide: 0.6 + R() * 0.4, flap: 0.8 + R() * 0.5, turn: (R() - 0.5) * 0.6 };
      const m = creatureMask(rend, species, key, pose), s = size / Math.max(m.width, m.height);
      const im = figure(scaled(m, s), { body: P.spirit3, bodyAlpha: 0.35, line: P.spirit });
      // cloth from the creature's tail: its body runs along its rotated vertical axis, tail down
      if (trail) { const tx = x - Math.sin(rot) * im.height * 0.42, ty = y + Math.cos(rot) * im.height * 0.42;
        ctx.save(); ctx.globalAlpha = 0.82;
        ribbon(ctx, flow(tx, ty, size * (0.75 + R() * 0.45), rot + Math.PI / 2 + (R() - 0.5) * 0.5, 0.7, R, 40), size * 0.045, R, behind ? P.red2 : P.red);
        ctx.restore(); }
      place(ctx, im, x, y, { centre: true, rot, glow: 16, glowAlpha: behind ? 0.5 : 0.9, alpha: behind ? 0.75 : 1 });
      await tick();
    };
    await flyer(keys[1], TX - 330, 420, 360, -0.5, true, false);
    await flyer(keys[5], TX + 360, 330, 330, 0.6, true, true);

    // the tower itself: umber stone, gold-lit edges
    stage("Building the tower");
    const tower = figure(await svgMask(draw("building.spire", Math.floor(R() * 1e9)), TOWER_H * 0.7, TOWER_H), { body: P.umber, bodyAlpha: 1, line: P.gold });
    place(ctx, tower, TX, MESA + 62, { glow: 6, glowAlpha: 0.35 });   // set into the mesa's top face, not its back edge
    await tick();

    // III — arch and classical towers half sunk in the sand, tombstone columns
    stage("Burying the old city");
    const arch = figure(await svgMask(draw("building.arch", Math.floor(R() * 1e9)), 420, 560), { body: P.sand3, bodyAlpha: 0.95, line: P.goldDeep });
    place(ctx, arch, 2700, 1260, { rot: 0.06 });
    const classic = figure(await svgMask(draw("building.classical", Math.floor(R() * 1e9)), 460, 420), { body: P.sand3, bodyAlpha: 0.95, line: P.goldDeep });
    place(ctx, classic, 3200, 1240, { rot: -0.08 });
    // ruins on the left too, under the sun-seal
    const ruin = figure(await svgMask(draw("building.classical", Math.floor(R() * 1e9)), 360, 330), { body: P.sand3, bodyAlpha: 0.95, line: P.goldDeep });
    place(ctx, ruin, 380, 1220, { rot: 0.05 });
    await tick();

    // middle dunes cover their feet
    const mid = dune(ctx, 1190, 48, 0.0016, R() * 6, P.sand0, P.sand2, R, 140);
    // columns as tombstones
    for (let i = 0; i < 9; i++) {
      const x = 2350 + i * 130 + R() * 60, base = mid(x) + 30, h = 90 + R() * 150, w = 22 + R() * 10, lean = (R() - 0.5) * 0.25;
      ctx.save(); ctx.translate(x, base); ctx.rotate(lean);
      ctx.fillStyle = P.sand3; ctx.fillRect(-w / 2, -h, w, h); ctx.fillStyle = P.sand4; ctx.fillRect(-w / 2, -h, w * 0.35, h);
      ctx.fillStyle = P.sand2; ctx.fillRect(-w * 0.8, -h - 12, w * 1.6, 12);
      ctx.fillStyle = rgba(P.goldHi, 0.5); ctx.fillRect(w * 0.3, -h, 2, h);
      ctx.restore();
    }
    await tick();

    // the Old Ones in front: pouring from the seal, circling the beam, descending over the ruins
    for (const [ki, x, y, size, rot, trail] of [[0, 980, 300, 380, -0.9], [2, 1030, 640, 300, -1.3], [6, 760, 820, 260, -2.2],
                                         [3, TX - 520, 640, 420, 0.4], [4, TX + 460, 640, 400, -0.3], [8, TX + 30, 230, 280, 1.57],
                                         [9, 2750, 420, 420, 0.9], [7, 3150, 640, 330, 1.25], [11, 2350, 760, 300, 0.2]].map((v, i) => [...v, i === 0 || i === 4 || i === 6])) {
      await flyer(keys[ki % keys.length], x, y, size, rot, false, trail);
    }

    // pilgrims: climbing the stair, and a long line walking home across the dunes
    stage("Walking the pilgrims");
    const front = dune(ctx, 1335, 34, 0.0011, R() * 6, P.sand1, P.sand3, R, 200);
    for (let i = 0; i < 4; i++) pilgrim(ctx, TX + 150 + i * 34, MESA + 118 - i * 10, 52 - i * 4, R, -1);
    // a procession walking back toward the tower, in groups, with gaps
    let px = 2300;
    while (px < 3480) { const n = 1 + Math.floor(R() * 3); for (let k = 0; k < n; k++) { pilgrim(ctx, px, front(px) + 6, 70 + R() * 22, R, -1); px += 96 + R() * 30; } px += 130 + R() * 200; }
    px = 860;
    while (px < 1500) { pilgrim(ctx, px, front(px) + 6, 66 + R() * 18, R, 1); px += 90 + R() * 160; }
    await tick();

    // friezes: glyphs of the Scriptorium in gold on red, with small seals
    stage("Carving the friezes");
    const script = GlyphSystem.newScript(Math.floor(R() * 1e9), R, R() < 0.5 ? "carved" : "brush");
    script.figure = 0.25; script.head = 0.25;
    const glyphImg = async (inner, size, ink, plate) => loadImg(GlyphSystem.svgDoc(inner, { size, ink, plate }));
    for (const [y0, flip] of [[0, false], [H - FR, true]]) {
      ctx.fillStyle = P.red2; ctx.fillRect(0, y0, W, FR);
      ctx.fillStyle = P.gold; ctx.fillRect(0, flip ? y0 : y0 + FR - 6, W, 6); ctx.fillRect(0, flip ? y0 + 12 : y0 + FR - 16, W, 2);
      ctx.fillStyle = P.umber; ctx.fillRect(0, flip ? y0 + FR - 3 : y0, W, 3);
      let x = 34, k = 0;
      while (x < W - 60) {
        if (k % 9 === 4) {
          const s = figure(await svgMask(draw("seal.sigil", Math.floor(R() * 1e9)), 90, 90), { body: P.red, bodyAlpha: 1, line: P.gold });
          place(ctx, s, x + 45, y0 + FR / 2, { centre: true }); x += 112;
        } else {
          const c = GlyphSystem.LEXICON[Math.floor(R() * GlyphSystem.LEXICON.length)].id;
          const im = await glyphImg(GlyphSystem.radical(script, c).svg, 74, P.gold, P.red2);
          ctx.drawImage(im, x, y0 + (FR - 74) / 2 + (flip ? -4 : 4)); x += 82;
        }
        k++;
      }
    }
    // chapter names as composed logograms in cartouches on the top frieze
    for (const [cx, words] of [[600, ["sun", "spirit", "before"]], [1800, ["city", "sky", "spirit"]], [3000, ["night", "fall", "after"]]]) {
      const s = { ...script, grammar: "ring", frame: "none" };
      ctx.fillStyle = P.red; ctx.strokeStyle = P.gold; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(cx, FR / 2, 120, 50, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const im = await glyphImg(GlyphSystem.compose(s, words).svg, 92, P.goldHi, P.red);
      ctx.drawImage(im, cx - 46, FR / 2 - 46);
    }
    // chapter dividers: gold double lines between the friezes
    for (const x of [1200, 2400]) { ctx.fillStyle = rgba(P.gold, 0.55); ctx.fillRect(x - 5, FR, 2, H - 2 * FR); ctx.fillRect(x + 3, FR, 2, H - 2 * FR); }
    await tick();

    // age: plaster grain, wear, cracks, a warm vignette
    stage("Ageing the plaster");
    const id = ctx.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
    ctx.putImageData(id, 0, 0);
    for (let i = 0; i < 70; i++) { const x = R() * W, y = R() * H, r = 30 + R() * 160, gg = ctx.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, rgba(P.plaster, 0.16 + R() * 0.14)); gg.addColorStop(1, rgba(P.plaster, 0)); ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let i = 0; i < 46; i++) {
      let x = R() * W, y = R() * H, a = R() * Math.PI * 2; const n = 20 + R() * 70;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < n; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; ctx.lineTo(x, y); }
      ctx.strokeStyle = rgba(P.umber, 0.38); ctx.lineWidth = 1.3; ctx.stroke();
      ctx.translate(1.2, 1.2); ctx.strokeStyle = rgba(P.bone, 0.18); ctx.stroke(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, rgba(P.umber, 0.55));
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    stage("");
  }

  window.Mural = { paint, W, H };
})();
