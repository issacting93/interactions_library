/* shared/city/city-grammar.js — the ancient city as a grammar, in four layers.

   The old radial WFC (city-wfc.js) picks one whole block per cell, so neighbours never shape each
   other. This one follows Bad North / Townscaper instead:

     1. HEIGHT    the city sits on terraces, highest at the centre (the tower) and stepping down
                  outward. Plain parameters, no solver.
     2. ZONING    which district each lot belongs to (university round the tower, villas high,
                  dense housing low, markets where avenues cross, shrines, gardens, a canal) comes
                  from rules in districts.csv, not from the solver.
     3. MODULES   per terrace, a DUAL GRID: the lots are the corners of the tiles, and each tile
                  picks a module from which of its four corners are built (end, edge, inner,
                  saddle, full). Modules carry a facade socket on the street edge their contour
                  crosses; a small WFC makes neighbouring sockets meet (sockets.csv), so arcades
                  run on, shrine fronts stay sacred, and a run stops against a plain wall. Then
                  each tile stacks floors (base/body/top, vertical sockets) and takes a roof.
     4. STITCHING where the layers meet: retaining walls and stairs between terraces, a sacred
                  gate where an avenue enters the sanctum, bridges over the canal, wells, the
                  city wall and its gates, stone lanterns.

   The grammar itself is three spreadsheets in shared/city/grammar/ (modules, districts, sockets).
   Add a row there and the generator uses it; put a Forge object id in a module's `part` column and a
   viewer can drop that handmade piece in where the module stands.

     CityGrammar.load(base?) -> Promise<sheet>        fetch + parse the three CSVs
     CityGrammar.parseCSV(text) -> [{col: value}]
     CityGrammar.build(seed, sheet, opts?) -> city    pure: same seed + sheet -> same city
       city = { seed, terraces, tiles, stitches, spokes, lights, tower, levelY(level), sheet, stats }
       tile = { terrace, i, j, quad: [[x,z] x4], corners: [lot x4], mask, shape, rot, district,
                module, sides: [socket|null x4], floors, stack: [row], roof, y }
       lot  = { district, solid, floors, open, x, z }
     opts: { terraces, spokes, levelStep, floorH }

   Space is CITY-LOCAL, y up, the same units as shared/city/city-wfc.js (outer wall ~15.3), so the
   result can stand where World Scene / Route Scene put the old city.
   Classic script; no dependencies. */
(function () {
  "use strict";

  // ── the three sheets ────────────────────────────────────────────────────────────────────────
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map((h) => h.trim());
    return rows.filter((r) => r.some((c) => c.trim() !== "")).map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] || "").trim()])));
  }
  const list = (s) => (s || "").split(";").map((x) => x.trim()).filter(Boolean);
  const num = (s, d) => (s === "" || s == null || isNaN(+s) ? d : +s);

  function compile(raw) {
    const districts = raw.districts.map((d) => ({ ...d, terraces: list(d.terrace).map(Number), count: num(d.count, 1), span: num(d.span, 1),
      solid: num(d.solid, 0.5), floorsMin: num(d.floors_min, 1), floorsMax: num(d.floors_max, 1) }));
    const modules = raw.modules.map((m) => ({ ...m, districts: list(m.district), on: list(m.on), weight: num(m.weight, 1) }));
    const meets = {};
    for (const s of raw.sockets) meets[s.socket] = new Set(list(s.meets));
    return { raw, districts, modules, meets, byId: Object.fromEntries(districts.map((d) => [d.id, d])) };
  }
  async function load(base) {
    base = base || new URL("grammar/", BASE_SCRIPT || location.href).href;
    const get = (n) => fetch(base + n, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(n + ": " + r.status); return r.text(); });
    const [modules, districts, sockets] = await Promise.all([get("modules.csv"), get("districts.csv"), get("sockets.csv")]);
    return compile({ modules: parseCSV(modules), districts: parseCSV(districts), sockets: parseCSV(sockets) });
  }
  const BASE_SCRIPT = document.currentScript ? document.currentScript.src : null;

  // ── seeded randomness ───────────────────────────────────────────────────────────────────────
  function rngOf(seed, tag) {
    let h = (seed >>> 0) ^ 0x9e3779b9;
    for (const c of tag || "") h = Math.imul(h ^ c.charCodeAt(0), 0x85ebca6b) >>> 0;
    return () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash2(seed, a, b) { let h = Math.imul((seed >>> 0) ^ Math.imul(a, 374761393) ^ Math.imul(b, 668265263), 0x27d4eb2d); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
  // smooth value noise in (ring, angle) so built lots clump into blocks instead of salt-and-pepper
  function noise(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = (t) => t * t * (3 - 2 * t);
    const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi), c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1);
    return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
  }
  function pick(rows, R, w) {
    let tot = 0; for (const r of rows) tot += w ? w(r) : r.weight;
    let x = R() * tot;
    for (const r of rows) { x -= w ? w(r) : r.weight; if (x <= 0) return r; }
    return rows[rows.length - 1];
  }

  // ── layer 1: height ─────────────────────────────────────────────────────────────────────────
  // terraces, centre highest. rings = tile rings (vertex rings = rings + 1). The gaps between them
  // are ring roads at the outer terrace's level, with a retaining wall up to the inner one.
  const TERRACES = [
    { r0: 1.7, r1: 3.3, sectors: 16, rings: 2, level: 3 },
    { r0: 3.75, r1: 6.5, sectors: 28, rings: 3, level: 2 },
    { r0: 6.95, r1: 10.1, sectors: 44, rings: 4, level: 1 },
    { r0: 10.55, r1: 14.45, sectors: 64, rings: 5, level: 0 },
  ];
  const WALL = { r0: 14.45, r1: 15.3 };

  function build(seed, sheetIn, opts) {
    seed = seed >>> 0; opts = opts || {};
    const sheet = sheetIn.districts ? sheetIn : compile(sheetIn);
    const TER = (opts.terraces || TERRACES).map((t, k) => ({ ...t, index: k }));
    const levelStep = opts.levelStep != null ? opts.levelStep : 0.85, floorH = opts.floorH || 0.34;
    const levelY = (lv) => lv * levelStep;
    const R = rngOf(seed, "grammar");
    const nSpokes = opts.spokes || 6, spoke0 = R() * Math.PI * 2 / nSpokes;
    const spokes = Array.from({ length: nSpokes }, (_, k) => spoke0 + k * Math.PI * 2 / nSpokes);
    const D = sheet.byId, stats = { contradictions: 0, seams: 0, restarts: 0 };

    // ── layer 2: zoning ──────────────────────────────────────────────────────────────────────
    for (const T of TER) {
      T.y = levelY(T.level);
      T.radii = Array.from({ length: T.rings + 1 }, (_, i) => T.r0 + (T.r1 - T.r0) * i / T.rings);
      T.spokeCols = new Set(spokes.map((a) => ((Math.round(a / (Math.PI * 2) * T.sectors) % T.sectors) + T.sectors) % T.sectors));
      const base = sheet.districts.find((d) => d.placement === "base" && d.terraces.includes(T.index));
      T.lots = T.radii.map((r, i) => Array.from({ length: T.sectors }, (_, j) => {
        const a = j / T.sectors * Math.PI * 2;
        return { i, j, a, r, x: Math.cos(a) * r, z: Math.sin(a) * r, district: base ? base.id : "dense", spoke: T.spokeCols.has(j) };
      }));
    }
    const lotsOf = (T) => T.lots.flat();
    const gridDist = (T, a, b) => { const dj = Math.min(Math.abs(a.j - b.j), T.sectors - Math.abs(a.j - b.j)); return Math.hypot(a.i - b.i, dj * (2 * Math.PI * a.r / T.sectors) / ((T.r1 - T.r0) / T.rings)); };
    for (const d of sheet.districts) {
      const ZR = rngOf(seed, "zone:" + d.id);
      const terr = TER.filter((T) => d.terraces.includes(T.index));
      if (!terr.length) continue;
      if (d.placement === "arc") {
        for (const T of terr) {
          const a0 = ZR() * Math.PI * 2, span = d.span * Math.PI * 2;
          for (const L of lotsOf(T)) { const da = ((L.a - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (da < span) L.district = d.id; }
        }
      } else if (d.placement === "patch") {
        for (let n = 0; n < d.count; n++) {
          const T = terr[n % terr.length], i = Math.floor(ZR() * (T.rings + 1));
          let j = Math.floor(ZR() * T.sectors); if (T.spokeCols.has(j)) j = (j + 2) % T.sectors;
          const c = T.lots[i][j];
          for (const L of lotsOf(T)) if (gridDist(T, c, L) <= d.span) L.district = d.id;
        }
      } else if (d.placement === "spoke") {
        for (const T of terr) {
          const mid = Math.round(T.rings / 2);   // the middle ring of lots
          let k = 0;
          for (const j of T.spokeCols) { if (k++ >= d.count) break; const c = T.lots[mid][j]; for (const L of lotsOf(T)) if (gridDist(T, c, L) <= d.span) L.district = d.id; }
        }
      } else if (d.placement === "ring") {
        for (const T of terr) { const i = Math.min(T.rings, Math.max(0, Math.round(d.span))); for (const L of T.lots[i]) L.district = d.id; T.canalRing = i; }
      }
    }
    // built or open, how tall. Value noise keeps built lots together, so blocks form.
    for (const T of TER) for (const L of lotsOf(T)) {
      const d = D[L.district] || { solid: 0.5, floorsMin: 1, floorsMax: 2, open: "lane" };
      const n = noise(seed + T.index * 977, L.i * 0.9, L.j * 0.55 * 44 / T.sectors);
      L.solid = !L.spoke && d.open !== "water" && n < d.solid + 0.04;
      L.open = L.spoke ? "street" : d.open || "lane";
      const h = noise(seed + 31 + T.index * 131, L.i * 0.7, L.j * 0.4);
      L.floors = L.solid ? Math.round(d.floorsMin + (d.floorsMax - d.floorsMin) * h) : 0;
    }

    // ── layer 3: modules on the dual grid ────────────────────────────────────────────────────
    // corners a=(i,j) b=(i,j+1) c=(i+1,j+1) d=(i+1,j); sides 0:a-b (inward) 1:b-c 2:c-d (outward) 3:d-a
    const SHAPE = { 0: "empty", 1: "end", 2: "end", 4: "end", 8: "end", 3: "edge", 6: "edge", 12: "edge", 9: "edge", 5: "saddle", 10: "saddle", 7: "inner", 14: "inner", 13: "inner", 11: "inner", 15: "full" };
    const tiles = [];
    for (const T of TER) {
      T.tiles = [];
      for (let i = 0; i < T.rings; i++) {
        T.tiles.push([]);
        for (let j = 0; j < T.sectors; j++) {
          const jn = (j + 1) % T.sectors, cs = [T.lots[i][j], T.lots[i][jn], T.lots[i + 1][jn], T.lots[i + 1][j]];
          const mask = cs.reduce((m, L, k) => m | (L.solid ? 1 << k : 0), 0);
          const solidC = cs.filter((L) => L.solid), count = {};
          for (const L of solidC.length ? solidC : cs) count[L.district] = (count[L.district] || 0) + 1;
          const district = Object.keys(count).sort((p, q) => count[q] - count[p])[0];
          const sideState = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([p, q]) => (cs[p].solid && cs[q].solid ? "in" : cs[p].solid || cs[q].solid ? "half" : "out"));
          const t = { terrace: T.index, i, j, quad: cs.map((L) => [L.x, L.z]), corners: cs, mask, shape: SHAPE[mask], district, sideState, y: T.y,
            floors: solidC.length ? Math.max(1, Math.round(solidC.reduce((s, L) => s + L.floors, 0) / solidC.length)) : 0 };
          T.tiles[i].push(t); tiles.push(t);
        }
      }
    }
    const meets = (a, b) => !sheet.meets[a] || sheet.meets[a].has("*") || sheet.meets[a].has(b) || (sheet.meets[b] && (sheet.meets[b].has("*") || sheet.meets[b].has(a)));
    const neighbour = (T, t, side) => {
      const { i, j } = t, n = T.sectors;
      if (side === 0) return i > 0 ? [T.tiles[i - 1][j], 2] : null;
      if (side === 2) return i < T.rings - 1 ? [T.tiles[i + 1][j], 0] : null;
      if (side === 1) return [T.tiles[i][(j + 1) % n], 3];
      return [T.tiles[i][(j - 1 + n) % n], 1];
    };
    const footRows = sheet.modules.filter((m) => m.layer === "footprint");
    const domainOf = (t) => {
      if (t.shape === "empty") return [];
      let d = footRows.filter((m) => m.shape === t.shape && (m.districts.includes(t.district) || m.districts.includes("*")));
      if (!d.length) d = footRows.filter((m) => m.shape === t.shape && m.districts.includes("dense"));
      if (!d.length) d = [{ id: "generic-" + t.shape, name: "Generic " + t.shape, shape: t.shape, socket: t.shape === "full" ? "blank" : "plain", weight: 1, districts: ["*"] }];
      // where two districts meet, their fronts may share no socket (a market's arcade against a shrine's
      // sacred front). A district with no plain row of this shape gets a rare plain one -- a pier where
      // the run stops -- so the solver always has a way out.
      if (t.shape !== "full" && !d.some((m) => m.socket === "plain")) d = d.concat({ ...d[0], id: d[0].id + "~plain", name: d[0].name + " (plain end)", socket: "plain", weight: 0.08 });
      return d;
    };
    for (const T of TER) {
      const TR = T.tiles.flat().filter((t) => t.shape !== "empty");
      let ok = false;
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        const WR = rngOf(seed, "wfc:" + T.index + ":" + attempt);
        for (const t of TR) { t.dom = domainOf(t); t.module = null; }
        const allowSeams = attempt === 5;
        ok = true;
        // arc consistency over every shared "half" side: keep a row only if the neighbour still has a row whose socket meets it
        const revise = (t, side) => {
          const nb = neighbour(T, t, side); if (!nb || t.sideState[side] !== "half") return false;
          const [u, us] = nb; if (!u.dom || u.sideState[us] !== "half") return false;
          const keep = t.dom.filter((m) => u.dom.some((o) => meets(m.socket, o.socket)));
          if (keep.length === t.dom.length) return false;
          if (!keep.length) { stats.contradictions++; if (allowSeams) { stats.seams++; return false; } ok = false; return false; }
          t.dom = keep; return true;
        };
        const propagate = (start) => {
          const queue = [start];
          while (queue.length && ok) {
            const t = queue.shift();
            for (let s = 0; s < 4; s++) {
              const nb = neighbour(T, t, s); if (!nb) continue;
              const [u, us] = nb; if (!u.dom || u.module) continue;
              if (revise(u, us)) queue.push(u);
            }
          }
        };
        const open = TR.slice();
        while (open.length && ok) {
          // lowest entropy first, ties broken at random
          let best = null, bestE = Infinity;
          for (const t of open) { const e = t.dom.length + WR() * 0.5; if (e < bestE) { bestE = e; best = t; } }
          open.splice(open.indexOf(best), 1);
          // affinity: a socket already chosen across a shared street edge is three times as likely again,
          // so runs of arcade or door front continue instead of flickering
          const nbSockets = [];
          for (let s = 0; s < 4; s++) { const nb = neighbour(T, best, s); if (nb && best.sideState[s] === "half" && nb[0].module) nbSockets.push(nb[0].module.socket); }
          const m = pick(best.dom, WR, (r) => r.weight * (1 + 2 * nbSockets.filter((x) => x === r.socket).length));
          best.module = m; best.dom = [m];
          propagate(best);
        }
        if (!ok) stats.restarts++;
      }
      for (const t of TR) {
        t.sides = t.sideState.map((s) => (s === "half" ? t.module.socket : null));
        delete t.dom;
      }
    }

    // vertical: base / body / top bands, then the roof that fits the top band and the footprint
    const stackRows = sheet.modules.filter((m) => m.layer === "stack"), roofRows = sheet.modules.filter((m) => m.layer === "roof");
    const forD = (rows, d) => { const own = rows.filter((m) => m.districts.includes(d)); return own.length ? own.concat(rows.filter((m) => m.districts.includes("*"))) : rows.filter((m) => m.districts.includes("*")); };
    for (const t of tiles) {
      if (!t.module) continue;
      const SR = rngOf(seed, "stack:" + t.terrace + ":" + t.i + ":" + t.j), rows = forD(stackRows, t.district);
      const of = (shape, below) => rows.filter((m) => m.shape === shape && (!below || m.below === below));
      t.stack = [];
      if (t.floors >= 2) {
        t.stack.push(pick(of("base", "ground"), SR));
        for (let f = 1; f < t.floors - 1; f++) t.stack.push(pick(of("body", "floor"), SR));
      }
      const tops = of("top", "floor"); t.stack.push(pick(tops.length ? tops : of("top"), SR));
      const capSock = t.stack[t.stack.length - 1].above;
      let roofs = forD(roofRows, t.district).filter((m) => m.below === capSock && (m.on.includes("*") || m.on.includes(t.shape)));
      if (!roofs.length) roofs = roofRows.filter((m) => m.below === capSock);
      t.roof = roofs.length ? pick(roofs, SR) : null;
    }

    // ── layer 4: stitching ───────────────────────────────────────────────────────────────────
    const stitchRow = (where) => sheet.modules.find((m) => m.layer === "stitch" && m.shape === where);
    const stitches = [], add = (where, o) => { const row = stitchRow(where); if (row) stitches.push({ module: row, kind: where, ...o }); };
    for (let k = 1; k < TER.length; k++) {
      const hi = TER[k - 1], lo = TER[k], rWall = hi.r1, rRoad = (hi.r1 + lo.r0) / 2;
      // a retaining wall the full ring, broken where each avenue climbs it as a stair
      add("terrace-edge", { r: rWall, y0: lo.y, y1: hi.y, gaps: spokes, road: { r0: hi.r1, r1: lo.r0, y: lo.y } });
      for (const a of spokes) {
        add("spoke-edge", { a, r0: lo.r0, r1: hi.r1, y0: lo.y, y1: hi.y, x: Math.cos(a) * rRoad, z: Math.sin(a) * rRoad });
        const aw = a + 0.9 / rRoad;
        add("ring-spoke", { a: aw, r: rRoad, x: Math.cos(aw) * rRoad, z: Math.sin(aw) * rRoad, y: lo.y });
      }
    }
    for (const a of spokes) add("sanctum-spoke", { a, r: TER[0].r1, x: Math.cos(a) * TER[0].r1, z: Math.sin(a) * TER[0].r1, y: TER[0].y });
    for (const T of TER) if (T.canalRing != null) for (const a of spokes) { const r = T.radii[T.canalRing]; add("canal-spoke", { a, r, x: Math.cos(a) * r, z: Math.sin(a) * r, y: T.y }); }
    const last = TER[TER.length - 1];
    add("wall", { r0: WALL.r0, r1: WALL.r1, y: last.y, gaps: spokes });
    for (const a of spokes) add("wall-spoke", { a, r: (WALL.r0 + WALL.r1) / 2, x: Math.cos(a) * (WALL.r0 + WALL.r1) / 2, z: Math.sin(a) * (WALL.r0 + WALL.r1) / 2, y: last.y });
    for (const T of TER.slice(0, 2)) for (const a of spokes) for (let r = T.r0 + 0.35; r < T.r1; r += 0.9) for (const s of [-1, 1]) {
      const aa = a + s * 0.32 / r; add("path", { a: aa, r, x: Math.cos(aa) * r, z: Math.sin(aa) * r, y: T.y });
    }

    // the lit places (for a style frame's lanterns): the tower, the sacred gates, the markets
    const lights = [{ x: 0, y: TER[0].y + 1.2, z: 0, radius: 4.2 }];
    for (const s of stitches.filter((s) => s.kind === "sanctum-spoke").slice(0, 3)) lights.push({ x: s.x, y: s.y + 0.6, z: s.z, radius: 1.8 });
    const markets = tiles.filter((t) => t.district === "market" && t.shape !== "empty");
    for (let k = 0; k < markets.length && lights.length < 8; k += Math.max(1, Math.floor(markets.length / 4))) { const t = markets[k]; const c = t.corners[0]; lights.push({ x: c.x, y: t.y + 0.5, z: c.z, radius: 2.4 }); }

    return { seed, terraces: TER, tiles, stitches, spokes, lights, levelY, floorH, levelStep, wall: WALL,
      tower: { x: 0, z: 0, r: TER[0].r0, y: TER[0].y, floors: (D.tower && D.tower.floorsMax) || 9 }, sheet, stats };
  }

  // a quick count for the tests and the inspector: modules used, by layer
  function summary(city) {
    const by = {};
    for (const t of city.tiles) if (t.module) by[t.module.id] = (by[t.module.id] || 0) + 1;
    for (const s of city.stitches) by[s.module.id] = (by[s.module.id] || 0) + 1;
    return by;
  }

  window.CityGrammar = { load, parseCSV, compile, build, summary, TERRACES, WALL, BASE: BASE_SCRIPT };
})();
