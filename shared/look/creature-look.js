/*
 * Forge — creature look. Draws a composed creature (CreatureCells.compose placements) as a built
 * object instead of line art: a hard shell over a glowing core, visible hardware at every joint,
 * one material set per creature. From the reference set (porcelain koi, coral shrimp, desert mech,
 * slate walker), which all share the same five moves:
 *
 *   1. shell over core   cells are plates filled with the shell colour, inset a little so the core
 *                        shows through the seams; the core is ribs and a spine tube in the glow colour
 *   2. hardware          a bolt (disc, ring, lit centre) wherever two cells meet and where a side
 *                        cell joins the body
 *   3. segment plates    each spine cell is its own plate, so the hex rhythm reads as armour
 *   4. one material set  shell, ink, core, glow, hardware (+ fin, band, perforate per material)
 *   5. surface detail    the part's own linework, recoloured in the ink, is the pattern on the
 *                        plate; details ride on top in the same ink
 *
 * Machine rules (docs: Forge creature pipeline and glossary, Design language for machines):
 *   60/30/10    a material with an accent keeps 60 shell, 30 secondary (hardware, core) and 10
 *               accent; the accent goes only on joint caps at the hips and on decals
 *   glow        lit only where something looks out (a glow part: visor, sensor); bolts are unlit
 *   decals      hazard stripes along the lower edge of the biggest body plate and a unit number,
 *               which also give the machine a size (opts.decals: false to leave them off)
 *   silhouette  every layer in one ink, no seams: the test that the shape reads before detail
 *
 *   CreatureLook.MATERIALS                     { id: { label, bg, shell, ink, core, glow, hw, ring, ... } }
 *   CreatureLook.svg(placements, byId, id)     -> SVG markup ("line" returns CreatureCells.svg)
 *
 * Appearance only: reads geometry from CreatureArch.partPolys. Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200;
  const MATERIALS = {
    line: { label: "Line", bg: null },
    porcelain: { label: "Porcelain", bg: "#e3e3ea", shell: "#f7f6f2", shade: "#dcdbe6", ink: "#2a3f9e", core: "#7b4dff", glow: "#a98bff",
      hw: "#2c2e35", ring: "#9aa0ad", eye: "#b9a4ff", shadow: "rgba(123,77,255,.28)", seam: 0.94 },
    coral: { label: "Coral", bg: "#ecebef", shell: "#d6453b", shade: "#b5352d", ink: "#7d211b", core: "#4a3524", glow: "#6b4a2c",
      hw: "#3a2c20", ring: "#b48a52", eye: "#e9d7c0", fin: "rgba(246,226,220,.78)", finInk: "#c9615a", perforate: true, shadow: "rgba(90,40,30,.18)", seam: 0.93 },
    desert: { label: "Desert mech", bg: "#e9e8e6", shell: "#d8c6a0", shade: "#efe8d8", ink: "#5d5347", core: "#4a4d55", glow: "#ff8a2b",
      hw: "#474a52", ring: "#ff8a2b", eye: "#ff5a3a", fin: "#5a5e68", finInk: "#2f3238", shadow: "rgba(40,40,40,.22)", seam: 0.92 },
    mech: { label: "White mech", bg: "#9a9c9e", shell: "#eceeed", shade: "#cfd3d2", ink: "#5e666b", core: "#2c2f33", glow: "#2f6dff",
      hw: "#26282c", ring: "#6d747a", eye: "#4a86ff", fin: "#e3e6e5", finInk: "#5e666b", shadow: "rgba(20,24,30,.35)", seam: 0.94, bulk: 7, accent: "#ff6a1a" },
    // the White mech with the hazard-orange accent swapped for a signal yellow, and a darker frame
    field: { label: "Field unit", bg: "#a6a79f", shell: "#d9d6cb", shade: "#bfbcb0", ink: "#4d4f4a", core: "#2a2b28", glow: "#9cff6b",
      hw: "#2f302c", ring: "#5d5f58", eye: "#9cff6b", fin: "#cfccc0", finInk: "#4d4f4a", shadow: "rgba(20,22,18,.35)", seam: 0.94, bulk: 7, accent: "#f2c230" },
    silhouette: { label: "Silhouette", bg: "#e7e5df", shell: "#15161a", shade: "#15161a", ink: "#15161a", core: "#15161a", glow: "#15161a",
      hw: "#15161a", ring: "#15161a", eye: "#15161a", shadow: "rgba(0,0,0,.16)", seam: 1, bulk: 7, silhouette: true },
    slate: { label: "Slate walker", bg: "#ebebe8", shell: "#3d5a69", shade: "#4f6d7c", ink: "#1f3039", core: "#8d896d", glow: "#e3b341",
      hw: "#a8a283", ring: "#e3b341", eye: "#e3b341", band: "#e3b341", shadow: "rgba(30,40,50,.25)", seam: 0.95 },
  };

  const polyCache = new Map();
  const polysOf = (p) => { if (!polyCache.has(p.id)) polyCache.set(p.id, window.CreatureArch ? window.CreatureArch.partPolys(p) : []); return polyCache.get(p.id); };
  const area = (pl) => { let a = 0; for (let i = 0; i < pl.length; i++) { const [x0, y0] = pl[i], [x1, y1] = pl[(i + 1) % pl.length]; a += x0 * y1 - x1 * y0; } return a / 2; };
  // the outline(s) of a part: its biggest closed polylines
  function outlines(p) {
    const ps = polysOf(p).filter((pl) => pl.length > 5).map((pl) => ({ pl, a: Math.abs(area(pl)) }));
    const max = Math.max(0, ...ps.map((q) => q.a));
    return ps.filter((q) => q.a >= max * 0.18 && q.a > 12).map((q) => q.pl);
  }
  const d = (pl) => "M" + pl.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") + "Z";
  const inPoly = (pt, pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const [xi, yi] = pl[i], [xj, yj] = pl[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };

  // the part's own linework in the material's inks
  function recolour(svg, M, role) {
    const ink = role === "fin" && M.finInk ? M.finInk : M.ink;
    // #14171d is the sheet's ground: as a fill it knocks lines out (so: the plate colour), as a
    // stroke it is a frame meant to vanish
    const knock = role === "fin" ? (M.fin || M.shell) : M.shell;
    const map = { "#5fd38d": ink, "#61e56a": ink, "#2b4a3e": M.shade, "#d6ffb0": M.glow, "#343334": M.hw };
    return svg.replace(/(stroke|fill)="(#[0-9a-fA-F]{6})"/g, (m, k, c) => {
      c = c.toLowerCase();
      if (c === "#14171d") return k === "stroke" ? 'stroke="none"' : `fill="${knock}"`;
      if (c === "#000000") return `${k}="none"`;            // black = the sheet's frame boxes, never ink
      return `${k}="${map[c] || c}"`;
    });
  }

  function bolt(x, y, r, M, cap) {
    // machines (an accent material): unlit hex-free bolts, the accent only on joint caps
    if (M.accent) return `<g class="cl-bolt"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 1.25).toFixed(1)}" fill="${M.hw}"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.85).toFixed(1)}" fill="none" stroke="${cap ? M.accent : M.ring}" stroke-width="${(r * (cap ? 0.42 : 0.26)).toFixed(2)}"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="${M.ring}"/></g>`;
    return `<g class="cl-bolt"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 1.25).toFixed(1)}" fill="${M.hw}"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.9).toFixed(1)}" fill="none" stroke="${M.ring}" stroke-width="${(r * 0.28).toFixed(2)}"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="${M.eye}" filter="url(#clGlow)"/></g>`;
  }

  // decals for the biggest body plate: a hazard band along its lower edge and a stencilled unit
  // number, both in plate coordinates and clipped to the plate
  function decals(P, outs, cid, M, unit) {
    const sw = Math.max(3, P.h * 0.07), y = P.h * 0.5 - sw * 2.4, n = Math.ceil((2 * P.w) / sw) + 4;
    let stripes = `<rect x="${(-P.w).toFixed(1)}" y="${y.toFixed(1)}" width="${(2 * P.w).toFixed(1)}" height="${(sw * 1.4).toFixed(1)}" fill="${M.accent}"/>`;
    for (let i = 0; i < n; i++) {
      const x = -P.w + i * sw * 1.4;
      stripes += `<path d="M${x.toFixed(1)} ${(y + sw * 1.4).toFixed(1)}l${(sw * 0.7).toFixed(1)} 0l${(sw * 1.4).toFixed(1)} ${(-sw * 1.4).toFixed(1)}l${(-sw * 0.7).toFixed(1)} 0Z" fill="${M.hw}"/>`;
    }
    const fs = Math.max(7, Math.min(16, P.h * 0.24));
    const num = `<text x="${(P.w * 0.16).toFixed(1)}" y="${(-P.h * 0.02).toFixed(1)}" font-family="'IBM Plex Mono', ui-monospace, monospace" font-weight="600" font-size="${fs.toFixed(1)}" letter-spacing="${(fs * 0.06).toFixed(2)}" fill="${M.hw}" fill-opacity=".85">${unit}</text>` +
      `<rect x="${(P.w * 0.16).toFixed(1)}" y="${(-P.h * 0.02 + fs * 0.25).toFixed(1)}" width="${(fs * 1.9).toFixed(1)}" height="${(fs * 0.12).toFixed(1)}" fill="${M.accent}"/>`;
    return `<g clip-path="url(#${cid})">${stripes}</g>${num}`;
  }

  // opts: { vb: [x, y, w, h] a fixed frame (for animation), under: markup drawn on the ground, shadow: false,
  //         decals: false, unit: "07" (the stencilled number; default from the part ids) }
  function svg(placements, byId, id, opts) {
    opts = opts || {};
    const M = MATERIALS[id];
    if (!M || !M.shell) return window.CreatureCells.svg(placements, byId, opts);
    const cells = placements.filter((p) => p.role === "cell"), dets = placements.filter((p) => p.role === "detail");
    const spine = cells.filter((p) => p.side === "c" && !p.free).sort((a, b) => a.y - b.y), sides = cells.filter((p) => p.side === "l" && !p.free);
    const half = (p) => (byId[p.part].h * p.scale) / 2, halfW = (p) => (byId[p.part].w * p.scale) / 2;
    const tf = (p, k) => window.CreatureCells.place(p, k);
    const mirror = (s, p) => s + (p.side === "l" ? `<g transform="matrix(-1 0 0 1 ${2 * AXIS} 0)">${s}</g>` : "");
    let core = "", shell = "", ink = "", hw = "", clips = "";
    // the plate that carries the decals: the biggest one on the spine
    const decalOn = M.accent && opts.decals !== false ? spine.reduce((b, p) => (!b || byId[p.part].w * byId[p.part].h * p.scale ** 2 > byId[b.part].w * byId[b.part].h * b.scale ** 2 ? p : b), null) : null;
    let h = 0; for (const p of placements) for (const ch of String(p.part)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const unit = opts.unit || String((h % 89) + 10).padStart(2, "0");

    // 1. the core: a lit tube down the spine, ribs across each seam, struts out to each side cell
    if (spine.length) {
      const y0 = spine[0].y, y1 = spine[spine.length - 1].y;
      const w = Math.max(6, Math.min(...spine.map(halfW)) * 0.42);
      core += `<rect x="${(AXIS - w / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${M.core}"/>`;
      for (let i = 0; i + 1 < spine.length; i++) {
        const a = spine[i], b = spine[i + 1], ya = a.y + half(a) * 0.4, yb = b.y - half(b) * 0.4;
        const rw = Math.min(halfW(a), halfW(b)) * 0.85, n = Math.max(2, Math.min(5, Math.round((yb - ya) / 7)));
        for (let k = 0; k < n; k++) {
          const y = ya + (yb - ya) * (k + 0.5) / n;
          core += `<path d="M${(AXIS - rw).toFixed(1)} ${(y + rw * 0.18).toFixed(1)}Q${AXIS} ${(y - rw * 0.22).toFixed(1)} ${(AXIS + rw).toFixed(1)} ${(y + rw * 0.18).toFixed(1)}" fill="none" stroke="${M.core}" stroke-width="${Math.max(1.6, rw * 0.12).toFixed(1)}" stroke-linecap="round"/>`;
        }
      }
    }
    const jointOf = (p) => {   // the point of a side cell nearest the body, in sheet coords
      if (p.joint) return p.joint;
      const P = byId[p.part]; let best = [P.w / 2, 0], bx = -1e9;
      for (const pl of polysOf(P)) for (const [x, y] of pl) if (x > bx) { bx = x; best = [x, y]; }
      return [p.x + best[0] * p.scale, p.y + best[1] * p.scale];
    };
    for (const p of sides) {
      if (p.strut === false) continue;
      const j = jointOf(p), body = [AXIS - Math.max(4, (spine[0] ? Math.min(...spine.map(halfW)) * 0.2 : 4)), j[1]];
      core += mirror(`<path d="M${body[0].toFixed(1)} ${body[1].toFixed(1)}L${j[0].toFixed(1)} ${j[1].toFixed(1)}" stroke="${M.core}" stroke-width="3.2" stroke-linecap="round"/>`, p);
    }

    // 2. the shell: plates filled, inset so the seams show the core; side cells as fins
    cells.forEach((p, n) => {
      const P = byId[p.part], role = p.side === "l" && M.fin ? "fin" : "plate";
      const fill = role === "fin" ? M.fin : M.shell, outs = outlines(P);
      if (!outs.length) return;
      let holes = "";
      if (M.perforate && role === "fin") {     // a row of holes along the fin, kept inside it
        const big = outs[0], c = big.reduce((s, q) => [s[0] + q[0] / big.length, s[1] + q[1] / big.length], [0, 0]);
        const far = big.reduce((b, q) => (Math.hypot(q[0] - c[0], q[1] - c[1]) > Math.hypot(b[0] - c[0], b[1] - c[1]) ? q : b), big[0]);
        const r = Math.max(1.2, Math.min(P.w, P.h) * 0.06);
        for (let k = 1; k <= 5; k++) {
          const t = k / 6, pt = [c[0] + (far[0] - c[0]) * (t - 0.35) * 1.4, c[1] + (far[1] - c[1]) * (t - 0.35) * 1.4];
          if (outs.some((pl) => inPoly(pt, pl))) holes += `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="${(r * (1 - t * 0.4)).toFixed(1)}" fill="${M.bg}"/>`;
        }
      }
      let band = "";
      if (p === decalOn) {
        const cid = `clD${n}`; clips += `<clipPath id="${cid}">${outs.map((pl) => `<path d="${d(pl)}"/>`).join("")}</clipPath>`;
        band += decals(P, outs, cid, M, unit);
      }
      if (M.band && role === "plate" && p.side === "c") {   // a painted band across each plate
        const cid = `clB${n}`; clips += `<clipPath id="${cid}">${outs.map((pl) => `<path d="${d(pl)}"/>`).join("")}</clipPath>`;
        band = `<rect x="${(-P.w).toFixed(1)}" y="${(P.h * 0.12).toFixed(1)}" width="${(2 * P.w).toFixed(1)}" height="${Math.max(1.2, P.h * 0.045).toFixed(1)}" fill="${M.band}" clip-path="url(#${cid})"/>`;
      }
      // bulk: thin drawings grow a solid silhouette (a fat stroke in the plate colour over an edge)
      const od = outs.map(d).join(""), bk = (M.bulk || 0) * (p.bulk == null ? 1 : p.bulk);
      const bulk = bk ? `<path d="${od}" fill="${fill}" stroke="${M.ink}" stroke-opacity=".6" stroke-width="${((bk + 1.4) / p.scale).toFixed(2)}" stroke-linejoin="round"/><path d="${od}" fill="${fill}" stroke="${fill}" stroke-width="${(bk / p.scale).toFixed(2)}" stroke-linejoin="round"/>` : "";
      const plate = `<g transform="${tf(p, M.seam)}">${bulk}<path d="${od}" fill="${fill}" fill-rule="evenodd" stroke="${M.ink}" stroke-width="${(0.7 / p.scale).toFixed(2)}" stroke-opacity="${bk ? 0 : 0.55}"/>${band}${holes}</g>`;
      shell += mirror(plate, p);
      // a lit part (visor, antenna tip): dark glass, glowing lines
      const lines = p.glow ? recolour(P.svg, M, role).replace(/fill="(?!none)[^"]*"/g, `fill="${M.core}"`).replace(/stroke="(?!none)[^"]*"/g, `stroke="${M.glow}"`) : recolour(P.svg, M, role);
      ink += mirror(`<g transform="${tf(p, M.seam)}" stroke-width="${(1 / p.scale).toFixed(3)}"${p.glow ? ' filter="url(#clGlow)"' : ""}>${lines}</g>`, p);
    });
    for (const p of dets) {
      const P = byId[p.part];
      ink += mirror(`<g transform="${tf(p)}" stroke-width="${(1 / p.scale).toFixed(3)}">${recolour(P.svg, M, "detail")}</g>`, p);
    }

    // 3. hardware: a bolt at every seam and every side joint
    for (let i = 0; i + 1 < spine.length; i++) {
      const a = spine[i], b = spine[i + 1];
      const y = Math.min(b.y, Math.max(a.y, (a.y + half(a) + b.y - half(b)) / 2));
      hw += bolt(AXIS, y, Math.max(2.4, Math.min(halfW(a), halfW(b)) * 0.16), M);
    }
    for (const p of cells) if (p.bolt && p.joint) hw += bolt(p.joint[0], p.joint[1], Math.max(2.2, Math.min(byId[p.part].w, byId[p.part].h) * p.scale * 0.07), M);
    for (const p of sides) { const j = jointOf(p); hw += mirror(bolt(j[0], j[1], Math.max(2.2, Math.min(byId[p.part].w, byId[p.part].h) * p.scale * 0.07), M, true), p); }
    if (M.silhouette) { ink = ""; hw = ""; core = core.replace(/stroke-width="[^"]*"/g, 'stroke-width="5"'); }

    const [x0, y0, x1, y1] = window.CreatureCells.bounds(placements, byId), pad = 16;
    const defs = new Set(placements.map((p) => byId[p.part] && byId[p.part].defs).filter(Boolean));
    const vb = opts.vb || [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad + 10].map((v) => +v.toFixed(1));
    const shadow = `<ellipse cx="${AXIS}" cy="${(y1 + 6).toFixed(1)}" rx="${((x1 - x0) * 0.36).toFixed(1)}" ry="${Math.max(3, (y1 - y0) * 0.025).toFixed(1)}" fill="${M.shadow}" filter="url(#clSoft)"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" style="background:${M.bg}">` +
      `<defs><filter id="clGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<filter id="clCore" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<filter id="clSoft"><feGaussianBlur stdDeviation="5"/></filter>` +
      `<filter id="clPlate" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#000" flood-opacity=".28"/></filter>${clips}${[...defs].join("")}</defs>` +
      `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${M.bg}"/>${opts.under || ""}${opts.shadow === false ? "" : shadow}` +
      `<g class="cl-core"${M.accent || M.silhouette ? "" : ' filter="url(#clCore)"'} opacity=".95">${core}</g><g class="cl-shell"${M.silhouette ? "" : ' filter="url(#clPlate)"'}>${shell}</g><g class="cl-ink">${ink}</g><g class="cl-hw">${hw}</g></svg>`;
  }

  window.CreatureLook = { MATERIALS, svg };
})();
