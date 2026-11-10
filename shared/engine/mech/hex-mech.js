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
 * Design language (docs: Forge creature pipeline and glossary): detail is rationed by tier
 * (primary parts stay mostly plain) and gathered at joint ends and the front; every detail is a
 * vent, sensor, handle, hatch or bolt; legs start at least two cells thick; the hex repeats at
 * three scales (outline, plates, bolt heads).
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

  /* ---------- detail with a job ----------
     Five kinds, each drawn inside one cell: a vent (slits), a sensor (lens and ring), a handle
     (a U bar, which also gives the machine a size), a hatch (an inset panel with its hinge line)
     and a bolt (a small hex: the motif at its smallest scale). */
  const ring = (c, r, n) => { const o = []; for (let k = 0; k <= n; k++) { const a = (2 * Math.PI * k) / n; o.push(c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)); } return o; };
  const DETAIL = {
    vent: (c, s) => [-1, 0, 1].map((k) => [c[0] - s * 0.45, c[1] + k * s * 0.3, c[0] + s * 0.45, c[1] + k * s * 0.3]),
    sensor: (c, s) => [ring(c, s * 0.42, 14), ring(c, s * 0.2, 10)],
    handle: (c, s) => [[c[0] - s * 0.45, c[1] - s * 0.1, c[0] - s * 0.45, c[1] + s * 0.35, c[0] + s * 0.45, c[1] + s * 0.35, c[0] + s * 0.45, c[1] - s * 0.1]],
    hatch: (c, s, flat) => [hexLine(c, s * 0.58, flat), [c[0] - s * 0.4, c[1] - s * 0.36, c[0] + s * 0.4, c[1] - s * 0.36]],
    bolt: (c, s, flat) => [hexLine(c, s * 0.17, flat)],
  };
  // detail is rationed by tier and gathered where the eye should go (joint ends, the front), so the
  // middle of a plate stays plain: n cells with the highest focus get one detail each
  function detail(R, cells, at, focus, n, kinds, s, flat) {
    const ranked = cells.map((c) => ({ c, f: focus(c) + R() * 0.25 })).sort((a, b) => b.f - a.f).slice(0, n);
    return ranked.flatMap(({ c }, i) => DETAIL[kinds[i % kinds.length]](at(c), s, flat));
  }
  const TIER = { primary: 0.22, secondary: 0.32, tertiary: 0.5 };    // share of cells that carry detail

  // a limb segment: columns of cells along the axis, each column 1-3 cells thick (a taper profile),
  // a knuckle cap at the body end; detail at both joint ends, the middle left plain
  function segment(R, len, prof, s, opts) {
    const cells = [];
    for (let i = 0; i < len; i++) {
      const t = len > 1 ? i / (len - 1) : 0, w = Math.max(1, Math.round(prof[0] + (prof[1] - prof[0]) * t));
      // column i: w cells stacked straight across the axis, centred on it (flat-top, so columns stay upright)
      const lo = -Math.floor((w - (i & 1)) / 2);
      for (let j = lo; j < lo + w; j++) cells.push([i, j]);
    }
    let polys = outline(cells, s, true);
    const ends = (c) => Math.max(1 - c[0] / Math.max(1, len - 1), c[0] / Math.max(1, len - 1)) ** 2;
    const n = Math.max(opts.kinds.length ? 1 : 0, Math.round(cells.length * (TIER[opts.tier] || 0.3) * opts.panel * 2));
    polys.push(...detail(R, cells, (c) => fcentre(c[0], c[1], s), ends, n, opts.kinds, s, true));
    // knuckle cap at the body end: a larger hex ring with a pin and three hex bolts around it
    if (opts.knuckle) {
      const c = [0, 0], k = s * opts.knuckle;
      polys.push(hexLine(c, k, true), hexLine(c, s * 0.32, true));
      for (const a of [90, 210, 330]) { const r = (a * Math.PI) / 180; polys.push(hexLine([c[0] + Math.cos(r) * k * 0.68, c[1] + Math.sin(r) * k * 0.68], s * 0.14, true)); }
    }
    // lay it along -x with the body end (the knuckle, smallest x) at x = 0
    let x0 = 1e9; for (const pl of polys) for (let i = 0; i < pl.length; i += 2) x0 = Math.min(x0, pl[i]);
    return transform(polys, (x, y) => [-(x - x0), y]);
  }

  // a mirror-symmetric cluster for the body: cells within `rad` of the centre, pruned in pairs;
  // detail gathered at the front (negative r) and at the rim, mirrored so both sides match
  function cluster(R, rad, keep, s, panel, tier, kinds) {
    const cells = [];
    for (let q = -rad; q <= rad; q++) for (let r = -rad; r <= rad; r++) if (Math.abs(q) + Math.abs(r) + Math.abs(-q - r) <= 2 * rad) cells.push([q, r]);
    const byKey = new Map(cells.map((c) => [c.join(","), c]));
    const mirror = ([q, r]) => [-q - r, r];                 // reflection across the x = 0 axis (pointy-top axial)
    const dist = (c) => (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(-c[0] - c[1])) / 2;
    const out = new Set(cells.map((c) => c.join(",")));
    for (const c of cells) if (dist(c) === rad && R() > keep) { out.delete(c.join(",")); out.delete(mirror(c).join(",")); }
    const kept = [...out].map((k) => byKey.get(k)).filter(Boolean);
    const polys = outline(kept, s);
    // one side (and the axis); its details are mirrored onto the other side
    const half = kept.filter((c) => centre(c[0], c[1], s)[0] <= 0.01);
    const focus = (c) => (-c[1] / Math.max(1, rad)) * 0.8 + (dist(c) / Math.max(1, rad)) * 0.6;
    const n = Math.max(1, Math.round(half.length * (TIER[tier] || 0.3) * panel * 2));
    const ds = detail(R, half, (c) => centre(c[0], c[1], s), focus, n, kinds, s, false);
    polys.push(...ds, ...ds.map((pl) => pl.map((v, i) => (i % 2 === 0 ? -v : v))));
    return polys;
  }

  const STYLES = ["Plated", "Strutted", "Bulwark", "Needle"];
  const NAMES = ["Hexwright", "Cell-strider", "Lattice mule", "Comb walker", "Honeyframe", "Facet hauler", "Six-step", "Prism tread"];

  function design(seed, opts) {
    opts = opts || {};
    const R = rng(seed), s = opts.r || 10, picked = pick(R, STYLES), style = opts.style || picked;
    const P = {
      // legs start at least two cells thick: long thin shapes don't read at a glance
      Plated: { thigh: [4, 3, 2], shin: [4, 2, 1], panel: 0.55, knuckle: 1.25, bodyR: 3, keep: 0.6 },
      Strutted: { thigh: [5, 2, 1], shin: [5, 2, 1], panel: 0.35, knuckle: 1.1, bodyR: 2, keep: 0.75 },
      Bulwark: { thigh: [3, 3, 3], shin: [3, 3, 2], panel: 0.7, knuckle: 1.45, bodyR: 3, keep: 0.85 },
      Needle: { thigh: [4, 2, 1], shin: [6, 2, 1], panel: 0.4, knuckle: 1.0, bodyR: 2, keep: 0.5 },
    }[style];
    const jitter = (n) => Math.max(1, n + (R() < 0.35 ? (R() < 0.5 ? -1 : 1) : 0));
    const tl = jitter(P.thigh[0]), sl = jitter(P.shin[0]);
    // tiers: thigh and hull primary (mostly plain), shin and deck secondary, foot and pods tertiary
    const thigh = segment(R, tl, [P.thigh[1], P.thigh[2]], s, { panel: P.panel, knuckle: P.knuckle, tier: "primary", kinds: ["hatch", "vent", "handle"] });
    const shin = segment(R, sl, [P.shin[1], P.shin[2]], s, { panel: P.panel * 0.8, knuckle: P.knuckle * 0.9, tier: "secondary", kinds: ["vent", "handle", "bolt"] });
    const foot = segment(R, pick(R, [1, 2]), [pick(R, [2, 3]), 2], s, { panel: 0.4, knuckle: 0.8, tier: "tertiary", kinds: ["bolt"] });
    const bodyR = P.bodyR;
    // proportions lean 2:1 (hull to deck), never halves
    const hull = cluster(R, bodyR, P.keep, s, P.panel, "primary", ["sensor", "hatch", "vent", "bolt"]);
    const deck = cluster(R, Math.max(1, bodyR - 1), 0.7, s * 0.8, 0.5, "secondary", ["vent", "vent", "bolt"]);
    // visor: a bar of cells across the front, lit; pods: a pair of small clusters at the sides
    const vw = pick(R, [2, 3, 4]), visorCells = []; for (let q = -vw; q <= vw - 1; q++) visorCells.push([q, 0]);
    const visor = transform(outline(visorCells, s * 0.55), (x, y) => [x + s * 0.55 * S3 * 0.5, y]);
    const pod = cluster(R, 1, 0.8, s * 0.7, 0.6, "tertiary", ["hatch", "handle"]), off = s * S3 * (bodyR + 0.6);
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
