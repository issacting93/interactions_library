/* tools/route/route.js — "Night Route": three canvas studies in the manner of Kentucky Route Zero and a
   quiet sage desktop. Flat cut-out planes stacked by depth, one pale moon, one warm light, small human
   marks against a lot of dark. Every tower, hall and creature is a Forge drawing reduced to a silhouette.

     Route.assets({ seed, kit, species, onStage })            -> Promise<assets>   (silhouettes, shared)
     Route.tableau(canvas, assets, { seed })                  a 3200 x 1400 still: the road, the tower, the Old One
     Route.wallpaper(canvas, assets, { seed, w, h, date, clock })  a desktop picture for that day (real moon phase)
     Route.stage(canvas, assets, { seed })  -> { stop() }     a theatre: flats fly in and out on wires, lit by spots

   Needs tools/mural/mural.js (window.MuralKit) and the Forge / ecology scripts it needs. Classic script. */
(function () {
  "use strict";
  const K = () => window.MuralKit;
  const TAU = Math.PI * 2;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // palettes: one quiet colour each, sky to near ground, with a single warm accent
  const PALETTES = {
    sage:  { name: "Sage",  sky: ["#2b3531", "#56635b", "#8b978d"], moon: "#e6e9df", hills: ["#7e8b81", "#68766c", "#55625a", "#424e47", "#313b36", "#212825"], warm: "#f0b35a" },
    slate: { name: "Slate", sky: ["#232a33", "#4a5562", "#7f8c97"], moon: "#e4e8ec", hills: ["#74808b", "#606b77", "#4e5864", "#3d4651", "#2d343d", "#1d2229"], warm: "#f2a65a" },
    fog:   { name: "Fog",   sky: ["#36403f", "#6f7c79", "#a7b1ac"], moon: "#f1f2ec", hills: ["#94a09b", "#7c8984", "#67736f", "#535e5a", "#3f4846", "#2a3130"], warm: "#eab060" },
    ash:   { name: "Ash",   sky: ["#2f2c29", "#5e5850", "#9a9284"], moon: "#efe9dc", hills: ["#8a8376", "#736d62", "#5f5a51", "#4b4740", "#383530", "#252320"], warm: "#ee9f4d" },
  };

  // ── silhouettes from the Forge ───────────────────────────────────────────
  // a drawing closed into one solid shape: blur the lines together, threshold, then fill what they enclose
  function solid(mask, close) {
    let m = mask;
    if (close) {
      const c = K().canvas(mask.width, mask.height), x = c.getContext("2d", { willReadFrequently: true });
      x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
      x.filter = `blur(${close}px)`; x.drawImage(mask, 0, 0); x.filter = "none";
      const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const v = d[i] > 22 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      x.putImageData(id, 0, 0); m = c;
    }
    return K().figure(m, { body: "#ffffff", line: "#ffffff" });
  }
  function tint(c, col, alpha) {
    const o = K().canvas(c.width, c.height), x = o.getContext("2d");
    x.drawImage(c, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = col; x.globalAlpha = alpha ?? 1; x.fillRect(0, 0, o.width, o.height);
    return o;
  }
  function fit(c, h) { return K().scaled(c, h / c.height); }
  // a point inside the silhouette at height fy (0 top .. 1 bottom): the middle of the widest solid run
  function inside(c, fy) {
    const y = clamp(Math.round(c.height * fy), 0, c.height - 1), d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, y, c.width, 1).data;
    let best = [0, 0], s = -1;
    for (let x = 0; x <= c.width; x++) {
      const on = x < c.width && d[x * 4 + 3] > 200;
      if (on && s < 0) s = x;
      if (!on && s >= 0) { if (x - s > best[1] - best[0]) best = [s, x]; s = -1; }
    }
    return { x: (best[0] + best[1]) / 2, y, w: best[1] - best[0] };
  }

  // an Old One cut flat: a long body along a curved spine, two great fins, a split tail and trailing veils
  function oldOne(R, L) {
    const c = K().canvas(L * 1.25, L * 0.9), x = c.getContext("2d"), cy = c.height * 0.45, n = 60, bend = (R() - 0.5) * 0.5, fat = 0.075 + R() * 0.04;
    const spine = []; for (let i = 0; i <= n; i++) { const t = i / n; spine.push([L * 0.12 + t * L, cy + Math.sin(t * Math.PI * (1 + bend)) * L * 0.06 - t * t * L * 0.05]); }
    const width = (t) => L * fat * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) * (1 - 0.6 * t) + L * 0.004;
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = spine[Math.max(0, i - 1)], b = spine[Math.min(n, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = width(t);
      top.push([spine[i][0] + (dy / l) * w, spine[i][1] - (dx / l) * w]); bot.push([spine[i][0] - (dy / l) * w * 0.8, spine[i][1] + (dx / l) * w * 0.8]);
    }
    x.fillStyle = "#fff"; x.beginPath(); top.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); for (let i = n; i >= 0; i--) x.lineTo(bot[i][0], bot[i][1]); x.closePath(); x.fill();
    // fins: long swept wings from a third of the way back, one raised and one lowered
    const f0 = spine[Math.round(n * 0.32)], span = L * (0.38 + R() * 0.15);
    for (const [k, sw] of [[-1, 0.9], [1, 0.55]]) {
      x.beginPath(); x.moveTo(f0[0] - L * 0.06, f0[1]);
      x.quadraticCurveTo(f0[0] + L * 0.05, f0[1] + k * span * 0.7, f0[0] + L * 0.24 * sw, f0[1] + k * span * sw);
      x.quadraticCurveTo(f0[0] + L * 0.16, f0[1] + k * span * 0.3, f0[0] + L * 0.12, f0[1]); x.closePath(); x.fill();
    }
    // the tail splits into two flukes
    const e = spine[n];
    for (const k of [-1, 1]) { x.beginPath(); x.moveTo(e[0] - L * 0.04, e[1]); x.quadraticCurveTo(e[0] + L * 0.04, e[1] + k * L * 0.02, e[0] + L * 0.1, e[1] + k * L * 0.09); x.quadraticCurveTo(e[0] + L * 0.03, e[1] + k * L * 0.02, e[0], e[1]); x.closePath(); x.fill(); }
    // veils: thin tendrils trailing from the belly
    x.strokeStyle = "#fff"; x.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const p = bot[Math.round(n * (0.2 + i * 0.08))], len = L * (0.12 + R() * 0.22);
      x.lineWidth = L * 0.006 * (1 - i * 0.08); x.beginPath(); x.moveTo(p[0], p[1]); x.bezierCurveTo(p[0] + len * 0.3, p[1] + len * 0.3, p[0] + len * 0.6, p[1] + len * 0.2, p[0] + len, p[1] + len * (0.45 + R() * 0.3)); x.stroke();
    }
    // the eye: a hole of sky
    const h = spine[Math.round(n * 0.08)]; x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(h[0] + L * 0.01, h[1] - L * 0.012, L * 0.008, 0, TAU); x.fill();
    const d = x.getImageData(0, 0, c.width, c.height).data;
    return K().trim(c, d, c.width, c.height);
  }

  async function assets(opts) {
    const R = ForgeKit.rng(opts.seed || 7), kit = opts.kit, species = opts.species, stage = opts.onStage || (() => {}), Reg = ForgeRegistry;
    const draw = (id, seed) => Reg.run(id, Reg.create(id, kit, seed), kit).svg;
    const make = async (id, w, h) => { try { return solid(await K().svgMask(draw(id, Math.floor(R() * 1e9)), w, h), 4); } catch (e) { return null; } };
    const out = { towers: [], halls: [], creatures: [], oldOnes: [] };
    for (let i = 0; i < 4; i++) out.oldOnes.push(oldOne(R, 900));
    stage("Cutting the towers");
    for (let i = 0; i < 5; i++) { const t = await make("building.spire", 420, 900); if (t) out.towers.push(t); await K().tick(); }
    stage("Cutting the halls");
    for (const id of ["building.arch", "building.classical", "building.arch", "building.classical"]) { const t = await make(id, 700, 700); if (t) out.halls.push(t); await K().tick(); }
    stage("Cutting the Old Ones");
    const rend = K().creatureRenderer(species), keys = species.map((s) => s.key);
    for (let i = 0; i < 6; i++) {
      const key = keys[Math.floor(R() * keys.length)];
      const pose = { bend: (R() - 0.5) * 40, tuck: R() * 0.2, puff: 0.6 + R() * 0.4, glide: 0.8 + R() * 0.2, flap: 0.9 + R() * 0.4, turn: (R() - 0.5) * 0.4 };
      const m = K().creatureMask(rend, species, key, pose);
      // an Old One stays soft: its own brightness becomes its opacity, so the wings come out as thin veils
      const sm = K().scaled(m, 560 / Math.max(m.width, m.height)), cx = sm.getContext("2d", { willReadFrequently: true }), id = cx.getImageData(0, 0, sm.width, sm.height);
      for (let j = 0; j < id.data.length; j += 4) { const L = id.data[j] / 255; id.data[j + 3] = Math.round(255 * Math.min(1, Math.pow(Math.max(0, L - 0.08) / 0.5, 0.75))); id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; }
      cx.putImageData(id, 0, 0);
      out.creatures.push(K().trim(sm, id.data, sm.width, sm.height));
      await K().tick();
    }
    // the long, winged ones first: they read best as a shape against the moon
    out.creatures.sort((a, b) => b.width / b.height - a.width / a.height);
    stage("");
    return out;
  }

  // ── painted pieces ──────────────────────────────────────────────────────
  // a ridge: a few slow waves and a little jag, straight segments between (a cut plywood edge)
  function ridge(R, w, base, amp, n) {
    const ph = [R() * TAU, R() * TAU, R() * TAU], k = [0.8 + R() * 1.4, 2.2 + R() * 2.2, 5 + R() * 4], pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, v = 0.55 * Math.sin(t * k[0] * Math.PI + ph[0]) + 0.3 * Math.sin(t * k[1] * Math.PI + ph[1]) + 0.15 * Math.sin(t * k[2] * Math.PI + ph[2]);
      pts.push([t * w, base - amp * (0.5 + 0.5 * v) + (R() - 0.5) * amp * 0.05]);
    }
    return pts;
  }
  function yAt(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i], t = (x - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
    return pts[pts.length - 1][1];
  }
  function fillRidge(ctx, pts, bottom, col, seam) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], bottom);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(pts[pts.length - 1][0], bottom); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (seam) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.strokeStyle = `rgba(255,255,255,${seam})`; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // mist pooled in a valley: a soft band of sky colour sitting on a ridge's foot
  function mist(ctx, w, y, h, col, a) {
    const g = ctx.createLinearGradient(0, y - h, 0, y + h * 0.3);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.75, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(0, y - h, w, h * 1.3);
  }
  // a pine as a flat spike: tiers of short ragged branches, a little lean
  function pine(ctx, x, y, h, col, R) {
    const w = h * (0.2 + R() * 0.08), tiers = 6 + Math.floor(R() * 5), lean = (R() - 0.5) * h * 0.03, right = [], left = [];
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers, ty = y - h + h * 0.9 * t, tw = w * Math.pow(t, 0.85) * (0.75 + R() * 0.45), cx = x + lean * (1 - t);
      right.push([cx + tw, ty], [cx + tw * 0.3, ty - h * 0.025]);
      left.push([cx - tw * (0.85 + R() * 0.3), ty + (R() - 0.5) * h * 0.02], [cx - tw * 0.3, ty - h * 0.025]);
    }
    ctx.beginPath(); ctx.moveTo(x + lean, y - h);
    for (const p of right) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(x + w * 0.06, y + 2); ctx.lineTo(x - w * 0.06, y + 2);
    for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  // a stand of pines along a ridge, gathered into clumps (never an even comb)
  function pines(ctx, R, pts, x0, x1, hMin, hMax, col, count) {
    const c0 = R() * TAU, fq = 2 + R() * 4;
    for (let i = 0; i < count; i++) {
      let x = x0 + R() * (x1 - x0);
      if (Math.sin((x / (x1 - x0 || 1)) * fq * Math.PI + c0) < -0.2 && R() < 0.75) continue;
      const h = hMin + Math.pow(R(), 1.6) * (hMax - hMin);
      pine(ctx, x, yAt(pts, x) + h * 0.06, h, col, R);
    }
  }
  function stars(ctx, R, x, y, w, h, n, col) {
    for (let i = 0; i < n; i++) {
      const sx = x + R() * w, sy = y + Math.pow(R(), 1.4) * h, s = R() < 0.93 ? 1.2 : 2.2;
      ctx.fillStyle = rgba(col, 0.15 + R() * 0.6); ctx.fillRect(sx, sy, s, s);
    }
  }
  // the moon: halo, disc, a few flat maria, and the phase (0 new .. 0.5 full .. 1 new), lit side right when waxing
  function moon(ctx, x, y, r, col, shadow, phase, R) {
    const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 3.4);
    g.addColorStop(0, rgba(col, 0.22)); g.addColorStop(0.35, rgba(col, 0.07)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 3.5, y - r * 3.5, r * 7, r * 7);
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.clip();
    ctx.fillStyle = rgba("#000000", 0.04);
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse((R() - 0.5) * r * 1.2, (R() - 0.5) * r * 1.2, r * (0.12 + R() * 0.22), r * (0.08 + R() * 0.16), R() * TAU, 0, TAU); ctx.fill(); }
    if (phase != null && Math.abs(phase - 0.5) > 0.015) {
      const waning = phase > 0.5, k = Math.cos(TAU * phase), rx = Math.abs(k) * r * 1.002;
      if (waning) ctx.scale(-1, 1);
      ctx.beginPath(); ctx.moveTo(0, -r - 1); ctx.arc(0, 0, r + 1, -Math.PI / 2, Math.PI / 2, true);
      if (k > 0) ctx.ellipse(0, 0, rx, r + 1, 0, Math.PI / 2, -Math.PI / 2, true);
      else ctx.ellipse(0, 0, rx, r + 1, 0, Math.PI / 2, Math.PI * 1.5, false);
      ctx.closePath(); ctx.fillStyle = shadow; ctx.fill();
    }
    ctx.restore();
  }
  // a high jet: a sliver with a blinking light, its contrail widening and fading behind it
  function jet(ctx, x, y, ang, len, s, col) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (const [off, a] of [[-1.6 * s, 0.32], [1.6 * s, 0.32]]) {
      const g = ctx.createLinearGradient(x, y, x - dx * len, y - dy * len);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(0.5, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = g; ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        ctx.lineWidth = s * (1.2 + k * 1.8); ctx.globalAlpha = 0.6 / (k + 1);
        ctx.beginPath(); ctx.moveTo(x - dy * off - dx * 8 * s, y + dx * off - dy * 8 * s); ctx.lineTo(x - dx * len - dy * off * (2 + k), y - dy * len + dx * off * (2 + k)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(7 * s, 0); ctx.lineTo(-6 * s, -1.2 * s); ctx.lineTo(-6 * s, 1.2 * s); ctx.closePath(); ctx.fill();
    ctx.fillRect(-2 * s, -5 * s, 2.2 * s, 10 * s);
    ctx.restore();
    ctx.fillStyle = "#ff6a5a"; ctx.beginPath(); ctx.arc(x - dy * 5 * s, y + dx * 5 * s, 1.4 * s, 0, TAU); ctx.fill();
  }
  // a box truck seen three-quarters, headlights on (the truck in Route Zero)
  function truck(ctx, x, y, s, col, warm, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir || 1, 1);
    // the beams first, so the truck stands in its own light
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(16 * s, 0, 150 * s, 0); g.addColorStop(0, rgba(warm, 0.34)); g.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(15 * s, -5 * s); ctx.lineTo(150 * s, -14 * s); ctx.lineTo(150 * s, 9 * s); ctx.lineTo(15 * s, -1 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = col;
    ctx.fillRect(-26 * s, -22 * s, 30 * s, 20 * s);                       // box
    ctx.beginPath(); ctx.moveTo(5 * s, -15 * s); ctx.lineTo(12 * s, -15 * s); ctx.lineTo(16 * s, -8 * s); ctx.lineTo(16 * s, -2 * s); ctx.lineTo(5 * s, -2 * s); ctx.closePath(); ctx.fill();  // cab
    ctx.fillRect(-26 * s, -3 * s, 42 * s, 2 * s);
    for (const wx of [-18, 9]) { ctx.beginPath(); ctx.arc(wx * s, -1 * s, 3.2 * s, 0, TAU); ctx.fill(); }
    ctx.fillStyle = rgba(warm, 0.8); ctx.fillRect(7 * s, -13 * s, 5 * s, 4 * s);   // a lit cab window
    ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(15.5 * s, -4 * s, 1.5 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // a light hung out of sight: a pale cone through the haze and a pool where it lands
  function spot(ctx, x, top, y, rx, col, a) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, top, 0, y);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - rx * 0.12, top); ctx.lineTo(x + rx * 0.12, top); ctx.lineTo(x + rx, y); ctx.lineTo(x - rx, y); ctx.closePath(); ctx.fill();
    const p = ctx.createRadialGradient(x, y, 0, x, y, rx); p.addColorStop(0, rgba(col, a * 1.6)); p.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = p; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // a lit window in a silhouette, with light spilling into the dark around it
  function window_(ctx, x, y, w, h, warm) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const r = Math.max(w, h) * 9, g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(warm, 0.26)); g.addColorStop(0.4, rgba(warm, 0.07)); g.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = warm; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "rgba(255,244,214,0.75)"; ctx.fillRect(x - w / 2 + w * 0.2, y - h / 2 + h * 0.2, w * 0.6, h * 0.6);
  }
  // a tower standing on a ridge, one lit window, cut in that ridge's colour
  function tower(ctx, sil, x, ground, h, col, warm, fy) {
    const t = tint(fit(sil, h), col);
    ctx.drawImage(t, x - t.width / 2, ground - t.height + h * 0.02);
    const p = inside(t, fy ?? 0.3);
    if (p.w > 4) { const ww = clamp(p.w * 0.28, 3, h * 0.03); window_(ctx, x - t.width / 2 + p.x, ground - t.height + h * 0.02 + p.y, ww, ww * 1.5, warm); }
    return t;
  }
  function road(ctx, pts, w0, w1, col) {
    const L = [], Rr = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = w0 + (w1 - w0) * (i / (n - 1)) ** 1.6;
      L.push([pts[i][0] - (dy / l) * w / 2, pts[i][1] + (dx / l) * w / 2]); Rr.push([pts[i][0] + (dy / l) * w / 2, pts[i][1] - (dx / l) * w / 2]);
    }
    ctx.beginPath(); L.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    // a dashed centre line, shrinking into the distance
    for (let i = 2; i < n - 1; i += 2) { const p = pts[i], q = pts[i + 1], t = i / (n - 1); ctx.strokeStyle = "rgba(240,236,220,0.35)"; ctx.lineWidth = 0.6 + t * t * 5; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); ctx.stroke(); }
  }
  function bezier(p0, p1, p2, p3, n) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return o; }
  // telegraph poles down the side of the road, wires sagging between them
  function poles(ctx, pts, side, col, sc) {
    const tops = [];
    for (let i = 3; i < pts.length; i += 3) {
      const t = i / (pts.length - 1), p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, off = (20 + t * t * 260) * sc;
      const x = p[0] + (dy / l) * off * side, y = p[1] - (dx / l) * off * side, h = (14 + t * t * 260) * sc;
      ctx.fillStyle = col; ctx.fillRect(x - Math.max(1, h * 0.012), y - h, Math.max(2, h * 0.024), h);
      ctx.fillRect(x - h * 0.12, y - h * 0.94, h * 0.24, Math.max(1.5, h * 0.014));
      tops.push([x, y - h * 0.94, h]);
    }
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = Math.max(0.8, sc);
    for (const k of [-1, 1]) for (let i = 1; i < tops.length; i++) { const a = tops[i - 1], b = tops[i]; ctx.beginPath(); ctx.moveTo(a[0] + k * a[2] * 0.1, a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + (a[2] + b[2]) * 0.06, b[0] + k * b[2] * 0.1, b[1]); ctx.stroke(); }
  }
  let grainTile = null;
  function grain(ctx, w, h, a) {
    if (!grainTile) { grainTile = K().canvas(256, 256); const x = grainTile.getContext("2d"), d = x.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } x.putImageData(d, 0, 0); }
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = ctx.createPattern(grainTile, "repeat"); ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  function vignette(ctx, w, h, a) {
    const g = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function sky(ctx, w, h, P, y1) {
    const g = ctx.createLinearGradient(0, 0, 0, y1);
    g.addColorStop(0, P.sky[0]); g.addColorStop(0.62, P.sky[1]); g.addColorStop(1, P.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function creature(ctx, sil, x, y, size, rot, col, alpha, flip) {
    const c = tint(K().scaled(sil, size / Math.max(sil.width, sil.height)), col);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); if (flip) ctx.scale(-1, 1); ctx.globalAlpha = alpha ?? 1; ctx.drawImage(c, -c.width / 2, -c.height / 2); ctx.restore();
  }
  const pick = (R, arr) => arr[Math.floor(R() * arr.length) % Math.max(1, arr.length)];

  // ── I. the tableau ──────────────────────────────────────────────────────
  function tableau(cv, A, o) {
    const W = 3200, H = 1400, R = ForgeKit.rng(o.seed || 1), P = PALETTES[o.palette || "sage"];
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    sky(ctx, W, H, P, 1050);
    stars(ctx, R, 0, 0, W, 760, 700, P.moon);
    const MX = 2140 + (R() - 0.5) * 300, MY = 380 + R() * 80, MR = 220;
    moon(ctx, MX, MY, MR, P.moon, rgba(P.sky[1], 0.93), 0.5, R);
    // an Old One crossing the moon, very high and very slow; another far off
    creature(ctx, pick(R, A.oldOnes), MX - MR * 0.2, MY + MR * 0.25, 760, -0.1 - R() * 0.12, P.hills[4], 0.95, true);
    // further off, Forge creatures as pale line ghosts
    for (let i = 0; i < 2 && A.creatures.length; i++) creature(ctx, A.creatures[(i + 1) % A.creatures.length], 380 + i * 1250 + R() * 300, 300 + R() * 160, 300 - i * 80, (R() - 0.5) * 0.5, P.moon, 0.35, R() < 0.5);
    jet(ctx, 600 + R() * 500, 140 + R() * 60, -0.08, 900, 1.6, P.moon);
    // the far ridges, each with mist pooled at its foot
    const r0 = ridge(R, W, 880, 300, 38), r1 = ridge(R, W, 960, 230, 30), r2 = ridge(R, W, 1060, 170, 24), r3 = ridge(R, W, 1170, 120, 20);
    fillRidge(ctx, r0, H, P.hills[0], 0.05); mist(ctx, W, 960, 120, P.sky[2], 0.35);
    fillRidge(ctx, r1, H, P.hills[1], 0.06);
    const TX = 760 + R() * 300, tg = yAt(r1, TX);
    if (A.towers.length) tower(ctx, pick(R, A.towers), TX, tg, 560, P.hills[4], P.warm, 0.28);
    pines(ctx, R, r1, 0, W, 18, 46, P.hills[2], 120);
    mist(ctx, W, 1050, 110, P.sky[2], 0.3);
    fillRidge(ctx, r2, H, P.hills[2], 0.06);
    pines(ctx, R, r2, 0, W, 30, 80, P.hills[3], 150);
    mist(ctx, W, 1150, 90, P.sky[2], 0.22);
    fillRidge(ctx, r3, H, P.hills[3], 0.07);
    // the road: over the crest of the near ridge and down toward us
    const RX = 1640 + (R() - 0.5) * 240, rt = [RX, yAt(r3, RX) + 4];
    const rpts = bezier(rt, [RX + 120, rt[1] + 60], [RX - 520, H - 220], [RX - 300, H + 40], 26);
    road(ctx, rpts, 4, 380, P.hills[1]);
    poles(ctx, rpts, 1, P.hills[5], 1);
    const tp = rpts[9];
    spot(ctx, tp[0] + 10, 0, tp[1], 140, P.moon, 0.06);
    truck(ctx, tp[0], tp[1] + 2, 1.6, P.hills[5], P.warm, -1);
    // stage wings: dark mounds and tall pines framing both sides
    const wl = [[0, 1080], [160, 1150], [330, 1250], [470, 1340], [560, 1400]], wr = [[2600, 1400], [2740, 1300], [2900, 1200], [3060, 1130], [3200, 1090]];
    for (const side of [wl, wr]) { ctx.beginPath(); ctx.moveTo(side[0][0], H); for (const p of side) ctx.lineTo(p[0], p[1]); ctx.lineTo(side[side.length - 1][0], H); ctx.closePath(); ctx.fillStyle = P.hills[5]; ctx.fill(); }
    for (let i = 0; i < 9; i++) pine(ctx, R() * 380, 1300 + R() * 110, 420 + R() * 520, P.hills[5], R);
    for (let i = 0; i < 9; i++) pine(ctx, 2820 + R() * 380, 1260 + R() * 140, 420 + R() * 520, P.hills[5], R);
    grain(ctx, W, H, 0.08);
    vignette(ctx, W, H, 0.45);
  }

  // ── II. the wallpaper ───────────────────────────────────────────────────
  function moonPhase(d) { const p = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) / 29.530588853; return p - Math.floor(p); }
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function wallScene(A, o) {
    const w = o.w, h = o.h, date = o.date, seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    const R = ForgeKit.rng(seed * 7 + 3), keys = Object.keys(PALETTES), P = PALETTES[o.palette || keys[seed % keys.length]];
    const c = K().canvas(w, h), ctx = c.getContext("2d"), s = Math.min(w, h) / 1600, portrait = h > w;
    sky(ctx, w, h, P, h * 0.82);
    stars(ctx, R, 0, 0, w, h * 0.55, Math.round(w * h / 9000), P.moon);
    const mr = (portrait ? 0.16 : 0.13) * Math.min(w, h), mx = w * (portrait ? 0.62 : 0.56 + R() * 0.3), my = h * (portrait ? 0.27 : 0.24 + R() * 0.12);
    moon(ctx, mx, my, mr, P.moon, rgba(P.sky[1], 0.95), moonPhase(date), R);
    if (R() < 0.7) { const jx = w * (0.15 + R() * 0.4), jy = h * (0.12 + R() * 0.1); jet(ctx, jx, jy, -0.05 - R() * 0.2, w * 0.3, 1.3 * s * 1.6, P.moon); }
    if (R() < 0.45) creature(ctx, pick(R, A.oldOnes), mx + (R() - 0.5) * mr * 3, my + mr * (1.2 + R() * 0.8), 420 * s, (R() - 0.5) * 0.3, P.hills[3], 0.75, R() < 0.5);
    const base = portrait ? 0.6 : 0.62, rows = [
      ridge(R, w, h * (base + 0.02), h * 0.17, 34), ridge(R, w, h * (base + 0.1), h * 0.14, 28),
      ridge(R, w, h * (base + 0.2), h * 0.12, 24), ridge(R, w, h * (base + 0.31), h * 0.1, 20),
    ];
    rows.forEach((r, i) => {
      fillRidge(ctx, r, h, P.hills[i + (i ? 1 : 0)], 0.05);
      if (i === 1 && A.towers.length && R() < 0.55) { const tx = w * (0.15 + R() * 0.7); tower(ctx, pick(R, A.towers), tx, yAt(r, tx), h * 0.2, P.hills[i + 2], P.warm, 0.25); }
      if (i >= 1) pines(ctx, R, r, 0, w, h * 0.015 * (i + 1), h * 0.05 * (i + 1), P.hills[Math.min(5, i + 2)], Math.round((w / 1600) * (60 + i * 30)));
      if (i < 3) mist(ctx, w, yAt(r, w / 2) + h * 0.06, h * 0.06, P.sky[2], 0.22);
    });
    grain(ctx, w, h, 0.06);
    vignette(ctx, w, h, 0.35);
    return { c, P };
  }
  function wallpaper(cv, A, o) {
    const scene = wallScene(A, o);
    cv.width = o.w; cv.height = o.h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(scene.c, 0, 0);
    if (o.clock !== false) clock(ctx, o.w, o.h, o.now || new Date(), scene.P);
    return scene;
  }
  function clock(ctx, w, h, now, P) {
    const s = Math.min(w, h) / 1600, x = w * 0.06, y = h - h * 0.1;
    const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0");
    ctx.save(); ctx.fillStyle = rgba(P.moon, 0.86); ctx.textBaseline = "alphabetic";
    ctx.font = `300 ${Math.round(150 * s)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillText(`${hh}:${mm}`, x, y - 60 * s);
    ctx.font = `400 ${Math.round(34 * s)}px "IBM Plex Mono", ui-monospace, monospace`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(6 * s)}px`;
    ctx.fillStyle = rgba(P.moon, 0.62);
    ctx.fillText(`${DAYS[now.getDay()]} · ${String(now.getDate()).padStart(2, "0")} ${MONTHS[now.getMonth()]}`, x + 6 * s, y);
    ctx.restore();
  }

  // ── III. the stage ──────────────────────────────────────────────────────
  // the proscenium is fixed; each scene is a set of flats that fly in from the loft on wires
  const SW = 1600, SH = 900, OX = 130, OY = 70, OW = 1340, OH = 650, FLOOR = OY + OH;
  function flat(w, h) { const c = K().canvas(w, h); return { c, x: c.getContext("2d") }; }
  function cutRidge(R, P, col, base, amp, treeCol, tree) {
    const f = flat(OW, OH), r = ridge(R, OW, base, amp, 18);
    fillRidge(f.x, r, OH, col, 0.08);
    if (tree) pines(f.x, R, r, 0, OW, tree[0], tree[1], treeCol || col, tree[2]);
    const top = Math.min(...r.map((p) => p[1])) - (tree ? tree[1] : 0);
    return { c: f.c, top, r, wires: [OW * 0.22, OW * 0.78] };
  }
  const SCENES = [
    { title: "ACT I · THE TOWER ON THE RIDGE", build(R, A, P) {
      const sky = flat(OW, OH); sky.x.fillStyle = P.sky[1]; sky.x.fillRect(0, 0, OW, OH); sky.x.drawImage(skyDrop(R, P, true), 0, 0);
      const back = cutRidge(R, P, P.hills[0], OH * 0.72, OH * 0.2);
      const mid = cutRidge(R, P, P.hills[2], OH * 0.84, OH * 0.16, P.hills[3], [16, 50, 40]);
      if (A.towers.length) { const tx = OW * (0.3 + R() * 0.4); tower(mid.c.getContext("2d"), pick(R, A.towers), tx, yAt(mid.r, tx) + 6, OH * 0.6, P.hills[2], P.warm, 0.25); mid.top = OH * 0.2; mid.wires = [tx - 30, tx + 30]; }
      const near = cutRidge(R, P, P.hills[4], OH * 0.98, OH * 0.1, P.hills[4], [40, 120, 26]);
      return { sky: sky.c, flats: [back, mid, near], spots: [[OW * 0.5, 260]] };
    } },
    { title: "ACT II · AN OLD ONE PASSES", build(R, A, P) {
      const sky = flat(OW, OH); sky.x.fillStyle = P.sky[0]; sky.x.fillRect(0, 0, OW, OH); sky.x.drawImage(skyDrop(R, P, false), 0, 0);
      const back = cutRidge(R, P, P.hills[1], OH * 0.86, OH * 0.12);
      const f = flat(OW, OH);
      creature(f.x, pick(R, A.oldOnes), OW / 2, OH * 0.34, 640, (R() - 0.5) * 0.2, P.hills[4], 1, R() < 0.5);
      const old = { c: f.c, top: OH * 0.3, wires: [OW / 2 - 120, OW / 2 + 120], drift: { amp: 140, bob: 10, speed: 0.16 } };
      const near = cutRidge(R, P, P.hills[3], OH * 0.97, OH * 0.12, P.hills[4], [30, 110, 50]);
      return { sky: sky.c, flats: [back, old, near], spots: [[OW * 0.35, 200], [OW * 0.7, 200]] };
    } },
    { title: "ACT III · THE STATION AT NIGHT", build(R, A, P) {
      const sky = flat(OW, OH); sky.x.fillStyle = P.sky[1]; sky.x.fillRect(0, 0, OW, OH); sky.x.drawImage(skyDrop(R, P, true), 0, 0);
      const back = cutRidge(R, P, P.hills[1], OH * 0.78, OH * 0.16, P.hills[2], [14, 40, 50]);
      const f = flat(OW, OH), hx = OW * (0.35 + R() * 0.3), gy = OH * 0.9;
      f.x.fillStyle = P.hills[3]; f.x.fillRect(0, gy, OW, OH - gy);
      if (A.halls.length) tower(f.x, pick(R, A.halls), hx, gy, OH * 0.48, P.hills[3], P.warm, 0.8);
      const hall = { c: f.c, top: OH * 0.4, wires: [hx - 160, hx + 160] };
      const t = flat(OW, OH); truck(t.x, OW * 0.18, OH * 0.97, 3, P.hills[5], P.warm, 1);
      const tr = { c: t.c, top: OH * 0.83, wires: [], slide: { from: -700, at: 1.5, dur: 4.5 } };
      return { sky: sky.c, flats: [back, hall, tr], spots: [[hx, 240]] };
    } },
  ];
  function skyDrop(R, P, withMoon) {
    const c = K().canvas(OW, OH), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, OH); g.addColorStop(0, rgba(P.sky[0], 0.9)); g.addColorStop(1, rgba(P.sky[2], 0.85)); x.fillStyle = g; x.fillRect(0, 0, OW, OH);
    stars(x, R, 0, 0, OW, OH * 0.6, 260, P.moon);
    if (withMoon) moon(x, OW * (0.15 + R() * 0.7), OH * (0.2 + R() * 0.12), 70 + R() * 40, P.moon, rgba(P.sky[1], 0.95), 0.5, R);
    else moon(x, OW * 0.82, OH * 0.16, 30, P.moon, rgba(P.sky[0], 0.95), 0.3, R);
    // the seam where two canvas drops are stitched
    x.fillStyle = "rgba(255,255,255,0.04)"; x.fillRect(OW * 0.5, 0, 2, OH);
    return c;
  }
  function stage(cv, A, o) {
    cv.width = SW; cv.height = SH;
    const ctx = cv.getContext("2d"), P = PALETTES[o.palette || "sage"], reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seed = o.seed || 11, idx = 0, cur = null, prev = null, raf = 0, running = true, onTitle = o.onTitle || (() => {});
    const HOLD = 11, FLY = 1.8, STAG = 0.35;
    const audience = (() => { const R = ForgeKit.rng(5), a = []; for (let row = 0; row < 2; row++) for (let x = -20; x < SW + 40; x += 52 + R() * 26) a.push([x + row * 26, SH - 18 - row * 46 + R() * 8, 22 + R() * 6 + row * 2]); return a.sort((p, q) => p[1] - q[1]); })();
    const next = (now) => { const R = ForgeKit.rng(seed = (seed * 48271 + 11) % 2147483647); prev = cur; const sc = SCENES[idx % SCENES.length]; cur = Object.assign(sc.build(R, A, P), { title: sc.title, t: now }); idx++; onTitle(sc.title); };
    // position of a flat at time t since its scene began (in) or since it was struck (out)
    const dropIn = (i, s) => reduce ? 0 : (1 - ease((s - 1.2 - i * STAG) / FLY)) * -OH * 1.05;
    const liftOut = (i, s) => reduce ? -OH * 2 : ease((s - i * STAG) / FLY) * -OH * 1.05;
    function drawSet(set, s, out, now) {
      ctx.save(); ctx.globalAlpha = out ? 1 - ease((s - 0.4) / 1.4) : ease((s - 0.6) / 1.6); ctx.drawImage(set.sky, OX, OY); ctx.restore();
      set.flats.forEach((f, i) => {
        let dy = out ? liftOut(set.flats.length - 1 - i, s) : dropIn(i, s), dx = 0;
        if (f.drift) { dx = Math.sin(now * f.drift.speed) * f.drift.amp; dy += Math.sin(now * 0.7) * f.drift.bob; }
        if (f.slide) { dy = 0; dx = out ? 0 : (1 - ease((s - f.slide.at) / f.slide.dur)) * f.slide.from; if (out) { dx = ease(s / 2.2) * 900; } }
        ctx.drawImage(f.c, OX + dx, OY + dy);
        ctx.strokeStyle = "rgba(210,220,205,0.22)"; ctx.lineWidth = 1;
        for (const wx of f.wires) { ctx.beginPath(); ctx.moveTo(OX + dx + wx, OY - 10); ctx.lineTo(OX + dx + wx, OY + dy + f.top); ctx.stroke(); }
      });
    }
    function frame(ms) {
      if (!running) return;
      const now = ms / 1000;
      if (!cur) next(now);
      if (now - cur.t > HOLD + FLY * 2) next(now);
      const s = now - cur.t, ps = prev ? s : 99;
      ctx.fillStyle = "#0d110f"; ctx.fillRect(0, 0, SW, SH);
      ctx.save(); ctx.beginPath(); ctx.rect(OX, OY, OW, OH); ctx.clip();
      ctx.fillStyle = P.sky[0]; ctx.fillRect(OX, OY, OW, OH);
      if (prev && ps < 4) drawSet(prev, ps, true, now);
      drawSet(cur, s, false, now);
      // the lighting: dark everywhere the spots don't reach; the lights dip while the set changes
      const dip = prev ? 0.35 * (1 - ease((s - 1.5) / 1.5)) : 0;
      const lm = K().canvas(OW, OH), lx = lm.getContext("2d");
      lx.fillStyle = `rgba(4,7,6,${0.42 + dip})`; lx.fillRect(0, 0, OW, OH);
      lx.globalCompositeOperation = "destination-out";
      const up = ease((s - 2) / 2);
      for (const [x, r] of cur.spots) { const g = lx.createRadialGradient(x, OH * 0.7, 0, x, OH * 0.7, r * 2.4); g.addColorStop(0, `rgba(0,0,0,${0.85 * up})`); g.addColorStop(1, "rgba(0,0,0,0)"); lx.fillStyle = g; lx.fillRect(0, 0, OW, OH); }
      ctx.drawImage(lm, OX, OY);
      for (const [x, r] of cur.spots) spot(ctx, OX + x, OY - 20, FLOOR - 20, r * 0.9, P.moon, 0.05 * up);
      ctx.restore();
      // floor boards and apron
      ctx.fillStyle = "#1a201d"; ctx.fillRect(OX - 40, FLOOR, OW + 80, 40);
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; for (let i = 0; i <= 24; i++) { const x = OX - 40 + (i / 24) * (OW + 80); ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(SW / 2 + (x - SW / 2) * 1.12, FLOOR + 40); ctx.stroke(); }
      ctx.fillStyle = "rgba(240,180,90,0.5)"; for (let x = OX; x < OX + OW; x += 48) ctx.fillRect(x, FLOOR + 2, 6, 2);   // footlight glints
      // proscenium: valance and side curtains, folds in flat bands
      ctx.fillStyle = "#151a17"; ctx.fillRect(0, 0, SW, OY); ctx.fillRect(0, 0, OX, FLOOR + 40); ctx.fillRect(OX + OW, 0, SW - OX - OW, FLOOR + 40);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? "#1c2320" : "#111513"; ctx.fillRect(OX - 18 - i * 18, 0, 14, FLOOR + 40); ctx.fillRect(OX + OW + 4 + i * 18, 0, 14, FLOOR + 40); }
      ctx.fillStyle = "#1c2320"; for (let x = 0; x < SW; x += 40) { ctx.beginPath(); ctx.moveTo(x, OY); ctx.quadraticCurveTo(x + 20, OY + 18, x + 40, OY); ctx.fill(); }
      // the act card on the apron
      const ta = ease((s - 3.2) / 1.2) * (1 - ease((s - HOLD - 0.6) / 1));
      ctx.save(); ctx.globalAlpha = ta * 0.8; ctx.fillStyle = "#d9dfd5"; ctx.font = '500 15px "IBM Plex Mono", ui-monospace, monospace'; if ("letterSpacing" in ctx) ctx.letterSpacing = "4px"; ctx.textAlign = "center"; ctx.fillText(cur.title, SW / 2, FLOOR + 76); ctx.restore();
      // the audience: dim heads with a little stage light on their crowns
      for (const [x, y, r] of audience) {
        ctx.fillStyle = "#070908"; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y + r * 2.1, r * 2.2, r * 1.3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(200,210,190,0.08)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
      grain(ctx, SW, SH, 0.05);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { stop() { running = false; cancelAnimationFrame(raf); }, start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }, get running() { return running; } };
  }

  window.Route = { PALETTES, assets, tableau, wallpaper, wallScene, clock, stage, moonPhase };
})();
