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

  function bolt(x, y, r, M) {
    return `<g class="cl-bolt"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 1.25).toFixed(1)}" fill="${M.hw}"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.9).toFixed(1)}" fill="none" stroke="${M.ring}" stroke-width="${(r * 0.28).toFixed(2)}"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="${M.eye}" filter="url(#clGlow)"/></g>`;
  }

  function svg(placements, byId, id) {
    const M = MATERIALS[id];
    if (!M || !M.shell) return window.CreatureCells.svg(placements, byId);
    const cells = placements.filter((p) => p.role === "cell"), dets = placements.filter((p) => p.role === "detail");
    const spine = cells.filter((p) => p.side === "c").sort((a, b) => a.y - b.y), sides = cells.filter((p) => p.side === "l");
    const half = (p) => (byId[p.part].h * p.scale) / 2, halfW = (p) => (byId[p.part].w * p.scale) / 2;
    const tf = (p, k) => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(p.scale * (k || 1)).toFixed(3)})`;
    const mirror = (s, p) => s + (p.side === "l" ? `<g transform="matrix(-1 0 0 1 ${2 * AXIS} 0)">${s}</g>` : "");
    let core = "", shell = "", ink = "", hw = "", clips = "";

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
      const P = byId[p.part]; let best = [P.w / 2, 0], bx = -1e9;
      for (const pl of polysOf(P)) for (const [x, y] of pl) if (x > bx) { bx = x; best = [x, y]; }
      return [p.x + best[0] * p.scale, p.y + best[1] * p.scale];
    };
    for (const p of sides) {
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
      if (M.band && role === "plate" && p.side === "c") {   // a painted band across each plate
        const cid = `clB${n}`; clips += `<clipPath id="${cid}">${outs.map((pl) => `<path d="${d(pl)}"/>`).join("")}</clipPath>`;
        band = `<rect x="${(-P.w).toFixed(1)}" y="${(P.h * 0.12).toFixed(1)}" width="${(2 * P.w).toFixed(1)}" height="${Math.max(1.2, P.h * 0.045).toFixed(1)}" fill="${M.band}" clip-path="url(#${cid})"/>`;
      }
      const plate = `<g transform="${tf(p, M.seam)}"><path d="${outs.map(d).join("")}" fill="${fill}" fill-rule="evenodd" stroke="${M.ink}" stroke-width="${(0.7 / p.scale).toFixed(2)}" stroke-opacity=".55"/>${band}${holes}</g>`;
      shell += mirror(plate, p);
      ink += mirror(`<g transform="${tf(p, M.seam)}" stroke-width="${(1 / p.scale).toFixed(3)}">${recolour(P.svg, M, role)}</g>`, p);
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
    for (const p of sides) { const j = jointOf(p); hw += mirror(bolt(j[0], j[1], Math.max(2.2, Math.min(byId[p.part].w, byId[p.part].h) * p.scale * 0.07), M), p); }

    const [x0, y0, x1, y1] = window.CreatureCells.bounds(placements, byId), pad = 16;
    const defs = new Set(placements.map((p) => byId[p.part] && byId[p.part].defs).filter(Boolean));
    const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad + 10].map((v) => +v.toFixed(1));
    const shadow = `<ellipse cx="${AXIS}" cy="${(y1 + 6).toFixed(1)}" rx="${((x1 - x0) * 0.36).toFixed(1)}" ry="${Math.max(3, (y1 - y0) * 0.025).toFixed(1)}" fill="${M.shadow}" filter="url(#clSoft)"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" style="background:${M.bg}">` +
      `<defs><filter id="clGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<filter id="clCore" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<filter id="clSoft"><feGaussianBlur stdDeviation="5"/></filter>` +
      `<filter id="clPlate" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#000" flood-opacity=".28"/></filter>${clips}${[...defs].join("")}</defs>` +
      `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${M.bg}"/>${shadow}` +
      `<g class="cl-core" filter="url(#clCore)" opacity=".95">${core}</g><g class="cl-shell" filter="url(#clPlate)">${shell}</g><g class="cl-ink">${ink}</g><g class="cl-hw">${hw}</g></svg>`;
  }

  window.CreatureLook = { MATERIALS, svg };
})();
