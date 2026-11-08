/*
 * Forge — Tower preset generator. Fresh extraction, ported from
 * world/forges/spire-forge/index.html's newGenome()/draw()/mutate() and their dependencies
 * (RULES/bayPools/ruleFor/makeBays/mkCtx/put/raw/ring/frieze/fan/dressBand — lines
 * 247-629 as of 2026-11-03), copied as closely as possible to the original so its
 * output matches Spire Forge's own for the same recipe/seed. Two real changes from
 * the original, both mechanical: (1) every function that read `pools()`/`state.*`
 * now takes the pool/byId it needs as an explicit argument instead of reaching into
 * page state, so this module has no dependency on any page's DOM or globals; (2) the
 * module-level `RECORD` toggle becomes a `generate(g, byId, { record })` option,
 * closed over per call instead of shared mutable state — reentrant, where the
 * original wasn't.
 *
 * Deliberately a duplicate of, not a refactor of, world/forges/spire-forge/index.html — see
 * shared/engine/generators/kit-utils.js's header for why. Depends on kit-utils.js being
 * loaded first (window.ForgeKit).
 */
(function () {
  "use strict";

  const { rng, clamp } = window.ForgeKit;

  const W = 600, H = 900, AX = 300, GROUND = 836;
  const MINT = "#5fd38d", DIM = "#2f6e4c";

  // Rule keys, most specific to most general. A bay looks up family.level.position first, then family.position.
  const RULES = [
    ["base.ground.center", "Ground terrace", "centre bay"], ["base.ground.end", "Ground terrace", "end bays"], ["base.ground.side", "Ground terrace", "other bays"],
    ["base.center", "Upper terraces", "centre bay"], ["base.end", "Upper terraces", "end bays"], ["base.side", "Upper terraces", "other bays"],
    ["drum.center", "Drums", "centre bay"], ["drum.end", "Drums", "end bays"], ["drum.side", "Drums", "other bays"],
    ["base.pilaster", "Terraces", "pilasters"], ["drum.pilaster", "Drums", "pilasters"],
  ];

  function bayPools(pool) {
    const open = [...new Set([...pool.lamp, ...pool.bead, ...pool.segment])].filter((p) => p.side === "center" && Math.max(p.w, p.h) <= 130);
    const pil = [...new Set([...pool.segment, ...pool.spire])].filter((p) => p.side === "center");
    return { open: open.length ? open : pool.bead, pil };
  }
  function ruleFor(key, R, pool) {
    const { open, pil } = bayPools(pool), pick = (a) => (a.length ? a[Math.floor(R() * a.length)].id : null);
    if (key.endsWith("pilaster")) return { part: R() < 0.75 ? pick(pil) : null };
    const big = key.endsWith("center") ? 1.15 : key.endsWith("end") ? 1.0 : 0.85;
    return { part: pick(open), scale: +(big * (0.9 + R() * 0.2)).toFixed(2) };
  }
  function makeBays(R, pool, on = true) {
    const rules = {};
    for (const [k] of RULES) rules[k] = ruleFor(k, R, pool);
    for (const f of ["base.ground", "base", "drum"]) if (R() < 0.5) rules[f + ".end"] = { ...rules[f + ".side"], scale: rules[f + ".side"].scale * 1.1 };
    return { on, width: Math.round(26 + R() * 22), size: +(0.7 + R() * 0.2).toFixed(2), rules };
  }

  /* ---------- genome ---------- */
  function newGenome(tpl, seed, pool) {
    const R = rng(seed), pk = (r) => (pool[r].length ? pool[r][Math.floor(R() * pool[r].length)].id : null);
    const between = (a, b) => a + R() * (b - a), int = (a, b) => Math.floor(between(a, b + 1));
    const fans = (n) => [
      { part: pk("blade"), n, r: 0.62, from: -165, to: -25, spin: between(-50, 10), scale: between(0.8, 1.1) },
      { part: pk("blade"), n: Math.max(2, n - 2), r: 0.95, from: -150, to: -35, spin: between(-45, -10), scale: between(0.7, 1) },
    ];
    const segs = [pk("segment"), R() < 0.5 ? pk("segment") : null].filter(Boolean);
    const base = { frieze: [pk("frieze"), pk("frieze"), pk("frieze")], hook: pk("hook") };
    const T = {
      lighthouse: () => ({ base: { n: 3, half: between(150, 190), h: between(34, 46), step: between(0.76, 0.84), ...base },
        shaft: { h: between(330, 420), core: R() < 0.7 ? pk("core") : null, segs, ribs: true, rib: pk("rib"), ribHook: pk("hook") },
        balc: { n: 3, half: between(95, 125), taper: between(0.15, 0.3), frieze: pk("frieze"), bead: pk("bead"), hook: pk("hook") },
        drums: { n: 0, half: 70, h: 40, frieze: pk("frieze") }, neck: [pk("lamp"), pk("frieze")],
        crown: { R: between(95, 125), halo: pk("halo"), bead: pk("bead"), beads: int(7, 11), lamp: pk("lamp"), n: int(5, 7), fans: fans(int(5, 7)), spire: true, spirePart: pk("spire"), beams: true },
        butt: { on: true, part: pk("buttress"), scale: between(0.65, 0.85) } }),
      spire: () => ({ base: { n: 2, half: between(80, 120), h: between(26, 36), step: between(0.78, 0.9), ...base },
        shaft: { h: between(480, 600), core: null, segs, ribs: R() < 0.6, rib: pk("rib"), ribHook: pk("hook") },
        balc: { n: int(4, 6), half: between(60, 90), taper: between(0.3, 0.5), frieze: pk("frieze"), bead: pk("bead"), hook: pk("hook") },
        drums: { n: 0, half: 50, h: 30, frieze: pk("frieze") }, neck: [pk("lamp")],
        crown: { R: R() < 0.4 ? between(50, 70) : 0, halo: pk("halo"), bead: pk("bead"), beads: int(0, 6), lamp: pk("lamp"), n: int(3, 5), fans: fans(int(3, 5)), spire: true, spirePart: pk("spire"), beams: false },
        butt: { on: R() < 0.5, part: pk("buttress"), scale: between(0.55, 0.75) } }),
      hive: () => ({ base: { n: 1, half: between(160, 200), h: between(30, 40), step: 0.8, ...base },
        shaft: { h: between(60, 120), core: null, segs, ribs: false, rib: pk("rib"), ribHook: pk("hook") },
        balc: { n: 0, half: 100, taper: 0.2, frieze: pk("frieze"), bead: pk("bead"), hook: pk("hook") },
        drums: { n: int(3, 5), half: between(120, 160), h: between(55, 75), frieze: pk("frieze") }, neck: [pk("segment")],
        crown: { R: between(55, 85), halo: pk("halo"), bead: pk("bead"), beads: int(6, 10), lamp: pk("lamp"), n: int(4, 6), fans: fans(int(4, 6)), spire: R() < 0.6, spirePart: pk("spire"), beams: false },
        butt: { on: R() < 0.7, part: pk("buttress"), scale: between(0.6, 0.85) } }),
      shrine: () => ({ base: { n: int(3, 4), half: between(200, 240), h: between(22, 30), step: between(0.84, 0.9), ...base },
        shaft: { h: between(90, 170), core: null, segs, ribs: true, rib: pk("rib"), ribHook: pk("hook") },
        balc: { n: 1, half: between(110, 140), taper: 0, frieze: pk("frieze"), bead: pk("bead"), hook: pk("hook") },
        drums: { n: 0, half: 60, h: 30, frieze: pk("frieze") }, neck: [pk("lamp"), pk("segment")],
        crown: { R: between(160, 200), halo: pk("halo"), bead: pk("bead"), beads: int(10, 16), lamp: pk("lamp"), n: int(7, 10), fans: fans(int(7, 10)), spire: R() < 0.5, spirePart: pk("spire"), beams: R() < 0.5 },
        butt: { on: true, part: pk("buttress"), scale: between(0.7, 0.95) } }),
      rotunda: () => ({ base: { n: 2, half: between(190, 230), h: between(30, 40), step: between(0.9, 0.95), ...base },
        shaft: { h: 0, core: null, segs, ribs: false, rib: pk("rib"), ribHook: pk("hook") },
        balc: { n: 0, half: 140, taper: 0, frieze: pk("frieze"), bead: pk("bead"), hook: pk("hook") },
        drums: { n: 2, half: between(150, 175), h: between(80, 100), frieze: pk("frieze") }, neck: [],
        crown: { R: 0, halo: pk("halo"), bead: pk("bead"), beads: 0, lamp: pk("lamp"), n: int(2, 4), fans: fans(int(2, 4)), spire: true, spirePart: pk("spire"), beams: false },
        butt: { on: false, part: pk("buttress"), scale: 0.6 },
        dome: { on: true, rise: between(0.62, 0.9), shells: int(1, 3), bead: pk("bead") } }),
    };
    const g = { tpl, seed, dome: { on: false, rise: 0.8, shells: 2, bead: pk("bead") }, ...T[tpl](), bays: makeBays(R, pool, tpl !== "spire") };
    if (tpl === "rotunda") { const b = () => ({ part: pk("bead"), scale: 1 }); Object.assign(g.bays.rules, { "drum.center": { part: pk("lamp"), scale: 1.1 }, "drum.side": b(), "drum.end": b() }); g.bays.width = 34; }
    return g;
  }

  function mutate(g0, R, pool) {
    const g = JSON.parse(JSON.stringify(g0)), pk = (r) => pool[r][Math.floor(R() * pool[r].length)]?.id;
    const ops = [
      () => { if (g.bays) { const k = RULES[Math.floor(R() * RULES.length)][0]; g.bays.rules[k] = ruleFor(k, R, pool); } },
      () => { if (g.bays) g.bays.width = clamp(g.bays.width * (0.75 + R() * 0.5), 16, 90); },
      () => { g.base.half = clamp(g.base.half * (0.85 + R() * 0.3), 70, 250); g.base.h = clamp(g.base.h * (0.85 + R() * 0.3), 18, 80); },
      () => { g.base.frieze = g.base.frieze.map(() => pk("frieze")); },
      () => { g.shaft.h = clamp(g.shaft.h * (0.8 + R() * 0.45), 0, 620); },
      () => { g.shaft.segs = [pk("segment"), R() < 0.5 ? pk("segment") : null].filter(Boolean); g.shaft.core = R() < 0.4 ? pk("core") : null; },
      () => { g.balc.n = clamp(g.balc.n + (R() < 0.5 ? -1 : 1), 0, 7); },
      () => { g.balc.frieze = pk("frieze"); g.balc.bead = pk("bead"); },
      () => { g.crown.R = clamp(g.crown.R * (0.75 + R() * 0.55), 0, 210); },
      () => { g.crown.fans.forEach((f) => { f.part = pk("blade"); f.spin = -50 + R() * 60; }); },
      () => { g.crown.n = clamp(g.crown.n + Math.round((R() - 0.5) * 4), 0, 10); },
      () => { g.crown.lamp = pk("lamp"); },
      () => { g.drums.n = clamp(g.drums.n + (R() < 0.5 ? -1 : 1), 0, 6); g.drums.frieze = pk("frieze"); },
      () => { g.butt.on = !g.butt.on || R() < 0.5; g.butt.part = pk("buttress"); },
      () => { g.crown.halo = pk("halo"); g.crown.beads = clamp(g.crown.beads + Math.round((R() - 0.5) * 6), 0, 16); },
      () => { if (!g.dome) g.dome = { on: false, rise: 0.8, shells: 2 }; if (g.tpl === "rotunda" || R() < 0.3) { g.dome.on = true; g.dome.rise = clamp(g.dome.rise * (0.8 + R() * 0.4), 0.4, 1.3); g.dome.bead = pk("bead"); } },
    ];
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) ops[Math.floor(R() * ops.length)]();
    g.seed = Math.floor(R() * 1e9);
    return g;
  }

  /* ---------- the building: generate(recipe, byId, opts) -> {svg, parts, k, height} ---------- */
  function generate(g, byId, opts) {
    opts = opts || {};
    const record = opts.record || null;
    const P = (id) => byId[id];

    function mkCtx() { return { out: [], defs: new Map(), count: 0, top: GROUND, maxHalf: 0 }; }
    function put(ctx, id, x, y, s = 1, rot = 0, o = {}) {
      const p = byId[id]; if (!p) return null;
      const center = p.side === "center" && !o.free;
      if (center) x = AX;
      if (record) record.push({ part: id, x: +x.toFixed(2), y: +y.toFixed(2), scale: +s.toFixed(3), rotate: +(+rot).toFixed(2), flipY: !!o.flipY, mirroredCopy: !center && x < AX - 0.5 && o.mirror !== false });
      const sw = o.sw ?? 1;
      const frag = p.svg.replace(/stroke-width="([\d.]+)"/g, (_, v) => `stroke-width="${(v * sw / s).toFixed(3)}"`);
      const fill = o.fill ? frag.replace(/fill="#[0-9a-fA-F]+"/g, `fill="${o.fill}"`) : frag;
      const gg = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(+rot).toFixed(1)}) scale(${s.toFixed(3)} ${(o.flipY ? -s : s).toFixed(3)})"${o.op ? ` opacity="${o.op}"` : ""} stroke-width="${(sw / s).toFixed(3)}">${fill}</g>`;
      ctx.out.push(gg);
      if (!center && x < AX - 0.5 && o.mirror !== false) ctx.out.push(`<g transform="matrix(-1 0 0 1 ${2 * AX} 0)">${gg}</g>`);
      if (p.defs) ctx.defs.set(p.id, p.defs);
      ctx.count++;
      const ext = Math.max(p.w, p.h) * s / 2;
      ctx.top = Math.min(ctx.top, y - ext);
      ctx.maxHalf = Math.max(ctx.maxHalf, Math.abs(AX - x) + ext);
      return p;
    }
    const raw = (ctx, s) => ctx.out.push(s);
    function ring(ctx, y, half, _ry, sw = 1.1) {
      raw(ctx, `<path d="M${(AX - half).toFixed(1)} ${y.toFixed(1)} L${(AX + half).toFixed(1)} ${y.toFixed(1)}" stroke="${MINT}" stroke-width="${sw}" fill="none"/>`);
      ctx.maxHalf = Math.max(ctx.maxHalf, half);
    }
    function frieze(ctx, id, y, half, targetH) {
      const p = byId[id]; if (!p || half < 12) return;
      const s = clamp(targetH / p.h, 0.45, 1.15), step = p.w * s * 1.08;
      for (let x = AX - step / 2; x - p.w * s / 2 > AX - half; x -= step) put(ctx, id, x, y, s, 0, { free: true });
    }
    function fan(ctx, id, cx, cy, n, r, a0, a1, s, spin = 0, o = {}) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1), th = a0 + (a1 - a0) * t, rad = th * Math.PI / 180;
        put(ctx, id, cx + r * Math.sin(rad), cy - r * Math.cos(rad), s, th + spin, { free: true, ...o });
      }
    }
    function dressBand(ctx, g2, fam, lvl, yTop, yBot, half, corniceId) {
      const B = g2.bays, h = yBot - yTop, margin = 5;
      let zoneTop = yTop;
      if (h >= 28) {
        const ch = h * 0.24;
        if (corniceId) frieze(ctx, corniceId, yTop + ch / 2 + 1, half - 6, ch * 0.8);
        ring(ctx, yTop + ch + 1, half, 0, 0.7);
        zoneTop = yTop + ch + 1;
      }
      const zoneH = yBot - zoneTop, inner = 2 * (half - margin);
      let n = Math.max(1, Math.round(inner / clamp(B.width, 12, 120)));
      if (n % 2 === 0) n += 1;
      const bw = inner / n, c = (n - 1) / 2;
      const rule = (pos) => B.rules[`${fam}.${lvl}.${pos}`] || B.rules[`${fam}.${pos}`] || B.rules[`base.${pos}`];
      for (let i = 0; i <= c; i++) {
        const x = AX - half + margin + bw * (i + 0.5);
        const pos = i === c ? "center" : i === 0 && n >= 3 ? "end" : "side";
        const r = rule(pos), p = r && P(r.part);
        if (!p) continue;
        const box = Math.min(bw * 0.86, zoneH * 0.86) * clamp(B.size, 0.3, 1.2) * (r.scale || 1);
        const s = clamp(box / Math.max(p.w, p.h), 0.12, 1.8);
        put(ctx, p.id, x, zoneTop + zoneH * 0.5, s, 0, { free: true, sw: 1 });
      }
      const pr = B.rules[`${fam}.pilaster`], pp = pr && P(pr.part);
      for (let k = 1; k <= c + (n === 1 ? 0 : 0); k++) {
        const x = AX - half + margin + bw * k;
        if (x >= AX - 1) break;
        if (pp) put(ctx, pp.id, x, zoneTop + zoneH * 0.5, clamp(zoneH * 0.92 / pp.h, 0.12, 1.4), 0, { free: true, sw: 0.9 });
        else raw(ctx, `<path d="M${x.toFixed(1)} ${zoneTop.toFixed(1)} L${x.toFixed(1)} ${yBot.toFixed(1)} M${(2 * AX - x).toFixed(1)} ${zoneTop.toFixed(1)} L${(2 * AX - x).toFixed(1)} ${yBot.toFixed(1)}" stroke="${MINT}" stroke-width="0.7"/>`);
      }
    }

    const ctx = mkCtx();
    let y = GROUND;
    const back = mkCtx();
    let half = g.base.half;
    for (let i = 0; i < g.base.n; i++) {
      const h = g.base.h, cy = y - h / 2;
      ring(ctx, y - h, half, h * 0.35);
      ring(ctx, y, half, h * 0.35, 1.3);
      raw(ctx, `<path d="M${AX - half} ${y - h} L${AX - half} ${y} M${AX + half} ${y - h} L${AX + half} ${y}" stroke="${MINT}" stroke-width="1.1"/>`);
      ring(ctx, y - h + 4, half - 4, 0, 0.6);
      if (g.bays?.on) dressBand(ctx, g, "base", i === 0 ? "ground" : "upper", y - h, y, half, g.base.frieze[i % g.base.frieze.length]);
      else frieze(ctx, g.base.frieze[i % g.base.frieze.length], cy + h * 0.06, half - 8, h * 0.62);
      put(ctx, g.base.hook, AX - half - 8, y - h - 2, clamp(h / 50, 0.5, 1), -20, { sw: 1.1 });
      y -= h; half *= g.base.step;
    }
    const topOfBase = y;
    if (g.butt.on && P(g.butt.part) && g.base.n) {
      const b = P(g.butt.part), s = clamp(g.butt.scale, 0.3, 1.2);
      put(ctx, g.butt.part, AX - g.base.half * 0.92, GROUND - b.h * s * 0.5 - 4, s, -4, { sw: 1 });
    }
    const shaftH = g.shaft.h, shaftTop = y - shaftH;
    let coreHalf = 26;
    if (shaftH > 10) {
      const core = P(g.shaft.core);
      if (core && shaftH / core.h > 0.55 && shaftH / core.h < 1.6) {
        const s = shaftH / core.h; put(ctx, core.id, AX, y - shaftH / 2, s, 0, { sw: 1 }); coreHalf = Math.min(core.w * s / 2, 70);
      } else {
        const segs = g.shaft.segs.map(P).filter(Boolean);
        if (segs.length) {
          let yy = y, i = 0, guard = 0;
          while (yy > shaftTop + 4 && guard++ < 60) {
            const sp = segs[i++ % segs.length], s = clamp(34 / sp.w, 0.8, 1.6), hh = sp.h * s;
            put(ctx, sp.id, AX, yy - hh / 2, s, 0, { sw: 1.1 }); coreHalf = Math.max(coreHalf, sp.w * s / 2);
            yy -= hh * 0.92;
          }
        }
      }
      if (g.shaft.ribs && P(g.shaft.rib)) {
        const rb = P(g.shaft.rib), s = clamp(44 / rb.h, 0.4, 1.1), step = rb.h * s * 0.85;
        for (let yy = y - step / 2; yy > shaftTop + step / 3; yy -= step) {
          put(ctx, rb.id, AX - coreHalf - 12, yy, s, -6, { sw: 1 });
          if (P(g.shaft.ribHook)) put(ctx, g.shaft.ribHook, AX - coreHalf - 2, yy + step * 0.3, clamp(14 / Math.max(P(g.shaft.ribHook).w, 1), 0.3, 0.8), 15, { sw: 1 });
        }
      }
    }
    y = shaftTop;
    for (let i = 0; i < g.balc.n; i++) {
      const t = (i + 1) / (g.balc.n + 1), by = topOfBase - shaftH * t;
      const bh = g.balc.half * (1 - g.balc.taper * t), ry = bh * 0.22;
      ring(ctx, by, bh, ry, 1.4); ring(ctx, by + 7, bh - 6, (bh - 6) * 0.22, 0.8);
      frieze(ctx, g.balc.frieze, by - 13, bh - 10, 20);
      const bead = P(g.balc.bead);
      if (bead) for (let k = 0; k < 7; k++) {
        const bx = AX - (bh - 8) * (1 - k / 6), byy = by + 7;
        if (bx < AX - 4) { raw(ctx, `<path d="M${bx.toFixed(1)} ${byy.toFixed(1)} L${bx.toFixed(1)} ${(byy + 6).toFixed(1)}" stroke="${MINT}" stroke-width="0.7"/>`); raw(ctx, `<path d="M${(2 * AX - bx).toFixed(1)} ${byy.toFixed(1)} L${(2 * AX - bx).toFixed(1)} ${(byy + 6).toFixed(1)}" stroke="${MINT}" stroke-width="0.7"/>`); put(ctx, bead.id, bx, byy + 13, clamp(14 / bead.w, 0.2, 0.6), 0, { free: true, sw: 0.9 }); }
      }
      put(ctx, g.balc.hook, AX - bh - 6, by - 6, 0.75, -10, { sw: 1.1 });
    }
    let dh = g.drums.half;
    for (let i = 0; i < g.drums.n; i++) {
      const h = g.drums.h * (1 - i * 0.08);
      ring(ctx, y - h, dh, Math.min(h * 0.35, dh * 0.3));
      ring(ctx, y, dh, Math.min(h * 0.35, dh * 0.3), 1.3);
      raw(ctx, `<path d="M${AX - dh} ${y - h} C${AX - dh * 1.08} ${y - h * 0.6} ${AX - dh * 1.08} ${y - h * 0.4} ${AX - dh} ${y} M${AX + dh} ${y - h} C${AX + dh * 1.08} ${y - h * 0.6} ${AX + dh * 1.08} ${y - h * 0.4} ${AX + dh} ${y}" stroke="${MINT}" stroke-width="1.1" fill="none"/>`);
      if (g.bays?.on) dressBand(ctx, g, "drum", "any", y - h, y, dh * 0.97, g.drums.frieze);
      else frieze(ctx, g.drums.frieze, y - h / 2, dh - 8, h * 0.5);
      y -= h * 0.96; dh *= 0.8;
    }
    if (g.dome?.on) {
      const lastHalf = g.drums.n ? dh / 0.8 : g.balc.n ? g.balc.half * (1 - g.balc.taper) : coreHalf + 24;
      const Rd = lastHalf * 0.98, Hd = Rd * clamp(g.dome.rise, 0.3, 1.4);
      ring(ctx, y, Rd + 8, 0, 1.4); ring(ctx, y - 5, Rd + 2, 0, 0.7);
      for (let k = 0; k <= clamp(g.dome.shells ?? 2, 0, 4); k++) {
        const f = 1 - k * 0.17;
        raw(ctx, `<path d="M${(AX - Rd * f).toFixed(1)} ${(y - 5).toFixed(1)} A${(Rd * f).toFixed(1)} ${(Hd * f).toFixed(1)} 0 0 1 ${(AX + Rd * f).toFixed(1)} ${(y - 5).toFixed(1)}" fill="none" stroke="${k ? DIM : MINT}" stroke-width="${k ? 0.8 : 1.4}"/>`);
      }
      const bd = P(g.dome.bead);
      if (bd) { const s = clamp(11 / bd.w, 0.15, 0.6), n = Math.max(5, Math.round(Rd / 14)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * Math.PI; put(ctx, bd.id, AX - Rd * 0.94 * Math.cos(t) * 0.999, y - 5 - Hd * 0.18 * Math.sin(t) - 8, s, 0, { free: true, sw: 0.8, mirror: false }); } }
      ctx.top = Math.min(ctx.top, y - 5 - Hd); ctx.maxHalf = Math.max(ctx.maxHalf, Rd + 8);
      y -= Hd + 1;
    }
    for (const id of g.neck) { const p = P(id); if (!p) continue; const s = clamp(40 / Math.max(p.w, 1), 0.6, 1.2), hh = p.h * s; put(ctx, id, AX, y - hh / 2 + 4, s, 0, { sw: 1.1 }); y -= hh * 0.85; }
    const Rr = g.crown.R, lampP = P(g.crown.lamp);
    const lampS = lampP ? clamp(Math.min(Math.max(Rr, 45) * 0.85, 105) / Math.max(lampP.h, lampP.w * 0.8), 0.5, 1.4) : 1;
    const cy = y - Math.max(Rr * 0.85, lampP ? lampP.h * lampS * 0.5 : 30);
    if (g.crown.beams) for (const [a, l] of [[-80, 300], [-66, 270], [-94, 260]]) {
      const r = a * Math.PI / 180, x2 = AX + l * Math.sin(r), y2 = cy - l * Math.cos(r);
      for (const xx of [x2, 2 * AX - x2]) raw(back, `<line x1="${AX}" y1="${cy.toFixed(1)}" x2="${xx.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${DIM}" stroke-width="0.8" stroke-dasharray="1 7"/>`);
    }
    if (Rr > 20 && P(g.crown.halo)) {
      const hp = P(g.crown.halo);
      put(back, hp.id, AX, cy, 2 * Rr / hp.w, 0, { sw: 0.9 });
      put(back, hp.id, AX, cy, 1.45 * Rr / hp.w, 0, { sw: 0.6, op: 0.6 });
      const bead = P(g.crown.bead);
      if (bead && g.crown.beads > 0) {
        const bs = clamp(12 / bead.w, 0.15, 0.6);
        fan(back, bead.id, AX, cy, g.crown.beads, Rr, -172, -8, bs, 0, { sw: 0.8 });
        put(back, bead.id, AX, cy - Rr, bs * 1.3, 0, { sw: 0.8 });
      }
    }
    for (const [i, f] of g.crown.fans.entries()) {
      const n = i === 0 ? g.crown.n : Math.max(0, g.crown.n - 2);
      if (!n || !P(f.part)) continue;
      const bp = P(f.part), s = clamp(f.scale * Math.max(Rr, 50) * 0.42 / Math.max(bp.w, bp.h), 0.35, 1.3);
      fan(ctx, f.part, AX, cy + 4, n, Math.max(Rr, 50) * f.r, f.from, f.to, s, f.spin, { sw: 1.1 });
    }
    if (lampP) put(ctx, lampP.id, AX, cy, lampS, 0, { sw: 1.2 });
    if (g.crown.spire && P(g.crown.spirePart)) {
      const sp = P(g.crown.spirePart), s = clamp(Math.max(Rr, 60) * 0.75 / sp.h, 0.5, 1.4), top = cy - Math.max(Rr, lampP ? lampP.h * lampS / 2 : 30);
      put(ctx, sp.id, AX, top - sp.h * s / 2 + 8, s, 0, { sw: 1.1 });
    }
    const gw = Math.max(g.base.half + 60, 200);
    [[gw, GROUND + 6], [gw * 0.8, GROUND + 15], [gw * 0.6, GROUND + 24], [gw * 0.35, GROUND + 33]].forEach(([w, yy], i) =>
      raw(ctx, `<path d="M${AX - w} ${yy} L${AX + w} ${yy}" stroke="${i ? DIM : MINT}" stroke-width="${i ? 0.9 : 1.2}"${i ? ` stroke-dasharray="16 5 3 5"` : ""}/>`));
    const top = Math.min(ctx.top, back.top), wide = Math.max(ctx.maxHalf, back.maxHalf);
    const k = Math.min(1, (GROUND - 24) / Math.max(GROUND - top, 1), (AX - 12) / Math.max(wide, 1));
    const defs = new Map([...back.defs, ...ctx.defs]);
    const body = back.out.join("") + ctx.out.join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.size ? `<defs>${[...defs.values()].join("")}</defs>` : ""}<rect width="${W}" height="${H}" fill="#14171d"/><g transform="translate(${AX} ${GROUND}) scale(${k.toFixed(4)}) translate(${-AX} ${-GROUND})">${body}</g></svg>`;
    return { svg, parts: ctx.count + back.count, k, height: Math.round(GROUND - top) };
  }


  /* ---------- Tower Forge spec (the shared building recipe) ----------
   * Copied from world/forges/spire-forge/index.html's "bridge to Tower Forge" section (bayCount /
   * winKindOf / bandOrn / toTowerForge), with page state passed in: g (the genome), byId (kit parts
   * with .roles) and the building's name. The spec embeds the full genome as `spire`, so one saved
   * recipe serves Tower Forge and World Scene (the spec) and Spire Forge and Bench (spec.spire).
   */
  // The flat elevation is read as the front of a round building: 1 m = 16 px, and the bays across the
  // front (half the circumference) become windows around the whole tier.
  const PX = 16, m = v => +(v / PX).toFixed(2);
  function bayCount(half, g) { const inner = 2 * (half - 5); let n = Math.max(1, Math.round(inner / clamp(g.bays?.width ?? 30, 12, 120))); return n % 2 ? n : n + 1; }
  function winKindOf(id, byId) {
    const p = byId[id]; if (!p) return "arch";
    if (p.roles.includes("bead")) return "round";
    if (p.roles.includes("segment") && p.h > 2 * p.w) return "slit";
    return "arch";
  }
  function bandOrn(g, fam, lvl, half, h, friezeId, byId) {
    const B = g.bays?.on ? g.bays : null;
    const zoneH = h >= 28 ? h * 0.75 : h;
    const o = { frieze: friezeId || null, friezePx: +(Math.max(h * 0.24 * 0.8, 8)).toFixed(1) };
    if (!B) return o;
    const n = bayCount(half, g), bw = 2 * (half - 5) / n;
    const side = B.rules[`${fam}.${lvl}.side`] || B.rules[`${fam}.side`] || {}, ctr = B.rules[`${fam}.${lvl}.center`] || B.rules[`${fam}.center`] || {};
    const pil = B.rules[`${fam}.pilaster`] || {};
    return { ...o, bay: side.part || null, front: ctr.part || null, bayN: clamp(Math.round(n * Math.PI / 2), 3, 48),
      bayPx: +(Math.min(bw * 0.86, zoneH * 0.86) * clamp(B.size, 0.3, 1.2) * (side.scale || 1)).toFixed(1),
      pil: pil.part || null, pilPx: +(zoneH * 0.92).toFixed(1) };
  }
  function toTowerSpec(g, byId, name) {
    const B = g.bays?.on ? g.bays : null, tiers = [];
    const glow = !!g.crown.beams;
    const openings = (half, fam, lvl) => {
      if (!B) return { winRows: 0 };
      const n = bayCount(half, g), r = B.rules[`${fam}.${lvl}.side`] || B.rules[`${fam}.side`] || {};
      return { winRows: 1, winPer: clamp(Math.round(n * Math.PI / 2), 1, 16), winKind: winKindOf(r.part, byId), winGlow: glow };
    };
    const ribsFor = (half, fam) => (B && B.rules[`${fam}.pilaster`]?.part) ? clamp(Math.round(bayCount(half, g) * Math.PI / 2), 0, 48) : 0;
    // base terraces
    let half = g.base.half;
    for (let i = 0; i < g.base.n; i++) {
      tiers.push({ h: clamp(m(g.base.h), 0.5, 40), r0: clamp(m(half), 0.2, 12), r1: clamp(m(half), 0.2, 12), sides: 0, prof: "straight", amp: 0, twist: 0,
        mat: i === 0 ? "dark" : "body", pat: "none", ribs: ribsFor(half, "base"), ribD: 0.12, chan: 0,
        ...openings(half, "base", i === 0 ? "ground" : "upper"), band: i === g.base.n - 1 ? "corbel" : "ring", bandSize: 0.35,
        spN: 0, stair: 0, banN: 0, butN: i === 0 && g.butt.on ? 6 : 0, butR: clamp(m(g.base.half * 0.5), 1, 16),
        orn: bandOrn(g, "base", i === 0 ? "ground" : "upper", half, g.base.h, g.base.frieze[i % g.base.frieze.length], byId) });
      if (tiers[tiers.length - 1].orn.bay) { tiers[tiers.length - 1].winRows = 0; tiers[tiers.length - 1].ribs = 0; }
      half *= g.base.step;
    }
    // shaft, cut at each balcony
    const coreR = clamp(m(Math.max(26, Math.min(half * 0.55, 60))), 0.2, 12);
    const segs = g.balc.n + 1;
    if (g.shaft.h > 10) for (let i = 0; i < segs; i++) {
      const t = (i + 1) / segs, hasBalc = i < g.balc.n;
      const bh = g.balc.half * (1 - g.balc.taper * t);
      tiers.push({ h: clamp(m(g.shaft.h / segs), 0.5, 40), r0: coreR, r1: coreR, sides: g.shaft.core ? 0 : 8, prof: "straight", amp: 0, twist: 0,
        mat: "body", pat: "none", ribs: g.shaft.ribs ? 16 : 0, ribD: 0.3, chan: g.shaft.core ? 2 : 0,
        winRows: 2, winPer: 4, winKind: "slit", winGlow: glow,
        band: hasBalc ? "balcony" : "ring", bandSize: hasBalc ? clamp(m(bh) - coreR, 0.1, 2.5) : 0.2,
        spN: 0, stair: i === 0 && g.shaft.h > 300 ? 2 : 0, banN: 0, butN: 0,
        orn: { rib: g.shaft.ribs ? g.shaft.rib : null, ribN: 8, ribPx: 44, frieze: hasBalc ? g.balc.frieze : null, friezePx: 16 } });
    }
    // upper drums
    let dh = g.drums.half;
    for (let i = 0; i < g.drums.n; i++) {
      const h = g.drums.h * (1 - i * 0.08);
      tiers.push({ h: clamp(m(h), 0.5, 40), r0: clamp(m(dh), 0.2, 12), r1: clamp(m(dh * 0.97), 0.2, 12), sides: 0, prof: "bulge", amp: 0.3, twist: 0,
        mat: "body", pat: "none", ribs: ribsFor(dh, "drum"), ribD: 0.1, chan: 0, ...openings(dh, "drum", "any"), band: "beads", bandSize: 0.3,
        spN: 0, stair: 0, banN: 0, butN: 0, orn: bandOrn(g, "drum", "any", dh, h, g.drums.frieze, byId) });
      if (tiers[tiers.length - 1].orn.bay) { tiers[tiers.length - 1].winRows = 0; tiers[tiers.length - 1].ribs = 0; }
      dh *= 0.8;
    }
    // neck
    if (g.neck.length) { const top = tiers.length ? tiers[tiers.length - 1].r1 : coreR; tiers.push({ h: clamp(m(40 * g.neck.length), 0.5, 40), r0: Math.min(top, coreR), r1: +(Math.min(top, coreR) * 0.7).toFixed(2), sides: 0, prof: "neck", amp: 0.4, twist: 0, mat: "accent", pat: "none", ribs: 0, chan: 1, winRows: 0, band: "none", spN: 0, stair: 0, banN: 0, butN: 0 }); }
    if (!tiers.length) tiers.push({ h: 4, r0: 2, r1: 2 });
    const R = g.crown.R, lampP = byId[g.crown.lamp];
    const lampS = lampP ? clamp(Math.min(Math.max(R, 45) * 0.85, 105) / Math.max(lampP.h, lampP.w * 0.8), 0.5, 1.4) : 1;
    const blades = g.crown.fans.map((f, i) => {
      const n = i === 0 ? g.crown.n : Math.max(0, g.crown.n - 2), bp = byId[f.part];
      if (!n || !bp) return null;
      return { part: f.part, n, rPx: +(Math.max(R, 50) * f.r).toFixed(1), from: f.from, to: f.to, spin: +(+f.spin).toFixed(1),
        sPx: +clamp(f.scale * Math.max(R, 50) * 0.42 / Math.max(bp.w, bp.h), 0.35, 1.3).toFixed(3) };
    }).filter(Boolean);
    const orn = { weight: 1.6, crown: { blades, lamp: lampP ? lampP.id : null, lampS: +lampS.toFixed(3), cyPx: +Math.max(R * 0.85, lampP ? lampP.h * lampS * 0.5 : 30).toFixed(1), sweeps: 6 } };
    return {
      orn,
      seed: g.seed % 1000000,
      base: g.base.n ? { kind: "none", h: 2, spread: 1.6, fins: 0, lean: 0 } : { kind: g.butt.on ? "roots" : "steps", h: 2, spread: 1.6, fins: g.butt.on ? 6 : 0, lean: 0 },
      tiers,
      crown: { kind: blades.length ? "dome" : byId[g.crown.lamp] ? "lantern" : "dome", h: blades.length ? clamp(m(Math.max(R, 50) * 0.3), 0.2, 20) : clamp(m(Math.max(R, 50) * 1.1), 0.2, 20), mat: "accent", finial: !!g.crown.spire },
      halos: R > 20 ? [{ kind: g.crown.beads >= 8 ? "armillary" : "portal", r: clamp(m(R), 0.5, 20), y: clamp(m(R * 0.5), -30, 15), tilt: 0, face: 0, n: 2, spin: 0.3, off: 0 }] : [],
      aura: { beam: glow, beamLen: 60, motes: glow ? 240 : 80 },
      look: { sky: "dusk", body: "#2b3a34", accent: "#5fd38d", dark: "#14171d", glow: "#7ff0b0", cloth: "#2f6e4c", weather: 0.2, bloom: 1.2 },
      source: { from: "Spire Forge", name: (name || ""), type: g.tpl },
      spire: JSON.parse(JSON.stringify(g))   // the full design: World Scene builds this exact tower in 3D
    };
  }

  window.SpireGenerator = { newGenome, generate, mutate, toTowerSpec, RULES, ruleFor, makeBays, W, H, AX, GROUND };
})();
