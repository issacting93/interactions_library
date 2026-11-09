/*
 * Forge — hex mech. Generates walker parts from hexagons: every piece is a cluster of hex cells
 * whose outer edges become the outline, with inset hexes as panels and a hex knuckle cap at each
 * joint. One seed gives one machine: a hull, a turret deck, a visor bar and side pods (top view,
 * mirror-symmetric), and a leg made of a thigh, a shin and a foot that a walker carries one part
 * per bone (LimbArt.segmentArt).
 *
 *   HexMech.design(seed, opts) -> {
 *     seed, name, style,
 *     body:  { hull, deck, visor, pods },     // polylines, top view, centred on (0, 0), +y toward the back
 *     leg:   { thigh, shin, foot },           // polylines, each along -x from its body end at x = 0
 *     fracs, legLen, bodyR                    // bone shares, leg length and body radius in cell units
 *   }
 *   A polyline is a flat array [x0, y0, x1, y1, ...], as in LimbArt and the Walker Bestiary PARTS.
 *   opts: { r } cell radius in drawing units (default 10), { style } to force one of STYLES
 *
 *   HexMech.part("HX-thigh-Plated-3") -> a kit-shaped part ({ id, side, w, h, svg, name, ... }), rebuilt
 *       from its id; HexMech.parts(slot, seeds) -> every style of one slot (thigh, shin, foot, hull,
 *       deck, visor, pod)
 *
 * Pure: no DOM. Classic script.
 */
(function () {
  "use strict";
  const S3 = Math.sqrt(3);
  const rng = (seed) => { let a = (seed * 2654435761) >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const pick = (R, xs) => xs[Math.floor(R() * xs.length)];

  // pointy-top hex at axial (q, r): centre and corners
  const centre = (q, r, s) => [s * S3 * (q + r / 2), s * 1.5 * r];
  const corners = (c, s, flat) => [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - (flat ? 0 : 30)); return [c[0] + s * Math.cos(a), c[1] + s * Math.sin(a)]; });
  // flat-top hex in offset columns (limbs): columns 1.5 s apart, odd columns half a cell lower
  const fcentre = (i, j, s) => [1.5 * s * i, S3 * s * (j + (i & 1) / 2)];
  const key = (p) => p.map((v) => Math.round(v * 100)).join(",");

  // the outline of a cluster: hex edges that only one cell owns, as two-point polylines
  function outline(cells, s, flat) {
    const edges = new Map();
    for (const [q, r] of cells) {
      const cs = flat ? corners(fcentre(q, r, s), s, true) : corners(centre(q, r, s), s);
      for (let i = 0; i < 6; i++) {
        const a = cs[i], b = cs[(i + 1) % 6], k = [key(a), key(b)].sort().join("|");
        edges.set(k, edges.has(k) ? null : [a, b]);
      }
    }
    return [...edges.values()].filter(Boolean).map(([a, b]) => [a[0], a[1], b[0], b[1]]);
  }
  const hexLine = (c, s, flat) => { const cs = corners(c, s, flat); return [...cs, cs[0]].flat(); };
  const transform = (polys, f) => polys.map((pl) => { const o = []; for (let i = 0; i + 1 < pl.length; i += 2) o.push(...f(pl[i], pl[i + 1])); return o; });

  // a limb segment: columns of cells along the axis, each column 1-3 cells thick (a taper profile),
  // a knuckle cap at the body end, panel insets on some cells
  function segment(R, len, prof, s, opts) {
    const cells = [];
    for (let i = 0; i < len; i++) {
      const t = len > 1 ? i / (len - 1) : 0, w = Math.max(1, Math.round(prof[0] + (prof[1] - prof[0]) * t));
      // column i: w cells stacked straight across the axis, centred on it (flat-top, so columns stay upright)
      const lo = -Math.floor((w - (i & 1)) / 2);
      for (let j = lo; j < lo + w; j++) cells.push([i, j]);
    }
    let polys = outline(cells, s, true);
    // panels: inset hexes on a few cells
    for (const [i, j] of cells) if (R() < opts.panel) polys.push(hexLine(fcentre(i, j, s), s * 0.52, true));
    // knuckle cap at the body end: a larger hex ring with a pin
    if (opts.knuckle) { const c = [0, 0]; polys.push(hexLine(c, s * opts.knuckle, true), hexLine(c, s * 0.32, true)); }
    // lay it along -x with the body end (the knuckle, smallest x) at x = 0
    let x0 = 1e9; for (const pl of polys) for (let i = 0; i < pl.length; i += 2) x0 = Math.min(x0, pl[i]);
    return transform(polys, (x, y) => [-(x - x0), y]);
  }

  // a mirror-symmetric cluster for the body: cells within `rad` of the centre, pruned in pairs
  function cluster(R, rad, keep, s, panel) {
    const cells = [];
    for (let q = -rad; q <= rad; q++) for (let r = -rad; r <= rad; r++) if (Math.abs(q) + Math.abs(r) + Math.abs(-q - r) <= 2 * rad) cells.push([q, r]);
    const byKey = new Map(cells.map((c) => [c.join(","), c]));
    const mirror = ([q, r]) => [-q - r, r];                 // reflection across the x = 0 axis (pointy-top axial)
    const out = new Set(cells.map((c) => c.join(",")));
    for (const c of cells) {
      const d = (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(-c[0] - c[1])) / 2;
      if (d === rad && R() > keep) { out.delete(c.join(",")); out.delete(mirror(c).join(",")); }
    }
    const kept = [...out].map((k) => byKey.get(k)).filter(Boolean);
    const polys = outline(kept, s);
    for (const c of kept) if (R() < panel) { const m = mirror(c); polys.push(hexLine(centre(c[0], c[1], s), s * 0.5)); if (m.join(",") !== c.join(",")) polys.push(hexLine(centre(m[0], m[1], s), s * 0.5)); }
    return polys;
  }

  const STYLES = ["Plated", "Strutted", "Bulwark", "Needle"];
  const NAMES = ["Hexwright", "Cell-strider", "Lattice mule", "Comb walker", "Honeyframe", "Facet hauler", "Six-step", "Prism tread"];

  function design(seed, opts) {
    opts = opts || {};
    const R = rng(seed), s = opts.r || 10, picked = pick(R, STYLES), style = opts.style || picked;
    const P = {
      Plated: { thigh: [4, 3, 2], shin: [4, 2, 1], panel: 0.55, knuckle: 1.25, bodyR: 3, keep: 0.6 },
      Strutted: { thigh: [5, 1, 1], shin: [5, 1, 1], panel: 0.15, knuckle: 1.1, bodyR: 2, keep: 0.75 },
      Bulwark: { thigh: [3, 3, 3], shin: [3, 3, 2], panel: 0.7, knuckle: 1.45, bodyR: 3, keep: 0.85 },
      Needle: { thigh: [4, 2, 1], shin: [6, 1, 1], panel: 0.3, knuckle: 1.0, bodyR: 2, keep: 0.5 },
    }[style];
    const jitter = (n) => Math.max(1, n + (R() < 0.35 ? (R() < 0.5 ? -1 : 1) : 0));
    const tl = jitter(P.thigh[0]), sl = jitter(P.shin[0]);
    const thigh = segment(R, tl, [P.thigh[1], P.thigh[2]], s, { panel: P.panel, knuckle: P.knuckle });
    const shin = segment(R, sl, [P.shin[1], P.shin[2]], s, { panel: P.panel * 0.8, knuckle: P.knuckle * 0.9 });
    const foot = segment(R, pick(R, [1, 2]), [pick(R, [2, 3]), 2], s, { panel: 0.4, knuckle: 0.8 });
    const bodyR = P.bodyR;
    const hull = cluster(R, bodyR, P.keep, s, P.panel);
    const deck = cluster(R, Math.max(1, bodyR - 1), 0.7, s * 0.8, 0.5);
    // visor: a bar of cells across the front, lit; pods: a pair of small clusters at the sides
    const vw = pick(R, [2, 3, 4]), visorCells = []; for (let q = -vw; q <= vw - 1; q++) visorCells.push([q, 0]);
    const visor = transform(outline(visorCells, s * 0.55), (x, y) => [x + s * 0.55 * S3 * 0.5, y]);
    const pod = cluster(R, 1, 0.8, s * 0.7, 0.6), off = s * S3 * (bodyR + 0.6);
    const pods = [...transform(pod, (x, y) => [x - off, y]), ...transform(pod, (x, y) => [x + off, y])];
    const total = tl + sl + 1.4;
    return {
      seed, style, name: pick(R, NAMES) + " " + String(seed).padStart(2, "0"),
      body: { hull, deck, visor, pods }, leg: { thigh, shin, foot },
      fracs: [tl / total, sl / total, 1.4 / total], legLen: total, bodyR, r: s,
    };
  }

  /* ---------- hex parts: the generator's pieces as kit parts ----------
     A hex part looks like any part in creature-parts.json ({ id, species, side, w, h, svg }), so
     Compose can offer it in a swap ring and the walkers can carry it. Its id says how to rebuild it,
     HX-<slot>-<style>-<seed>, so nothing has to be stored: part(id) regenerates the same drawing. */
  const SLOTS = { thigh: ["leg", "thigh", "left"], shin: ["leg", "shin", "left"], foot: ["leg", "foot", "left"],
    hull: ["body", "hull", "center"], deck: ["body", "deck", "center"], visor: ["body", "visor", "center"], pod: ["pod", null, "left"] };
  const partCache = new Map();
  function part(id) {
    if (partCache.has(id)) return partCache.get(id);
    const m = /^HX-(\w+)-(\w+)-(\d+)$/.exec(id); if (!m || !SLOTS[m[1]] || !STYLES.includes(m[2])) return null;
    const [slot, style, seed] = [m[1], m[2], +m[3]], D = design(seed, { style }), [where, key, side] = SLOTS[slot];
    // one pod cluster (the design draws the pair), everything else as designed
    let polys = where === "pod" ? D.body.pods.slice(0, D.body.pods.length / 2) : D[where][key];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const pl of polys) for (let i = 0; i + 1 < pl.length; i += 2) { x0 = Math.min(x0, pl[i]); x1 = Math.max(x1, pl[i]); y0 = Math.min(y0, pl[i + 1]); y1 = Math.max(y1, pl[i + 1]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const d = polys.map((pl) => { let o = ""; for (let i = 0; i + 1 < pl.length; i += 2) o += (i ? "L" : "M") + (pl[i] - cx).toFixed(1) + " " + (pl[i + 1] - cy).toFixed(1); return o; }).join("");
    const out = { id, species: "hex-parts", side, w: +(x1 - x0).toFixed(1), h: +(y1 - y0).toFixed(1), ox: 200, oy: 200, slot, style, seed,
      name: `Hex ${slot} · ${style} ${String(seed).padStart(2, "0")}`,
      svg: `<g transform="translate(0 0)"><path d="${d}" fill="none" stroke="#5fd38d" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></g>` };
    partCache.set(id, out);
    return out;
  }
  // a set of hex parts for one slot: every style, a few seeds each
  const parts = (slot, seeds) => STYLES.flatMap((st) => (seeds || [1, 2, 3]).map((sd) => part(`HX-${slot}-${st}-${sd}`))).filter(Boolean);

  window.HexMech = { design, part, parts, STYLES, SLOTS: Object.keys(SLOTS) };
})();
