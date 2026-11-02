/* INTERACTIONS — Radial city Wave Function Collapse engine.
   Extracted 2026-10-31 from tools/city_gen/Round City Generator.html (byte-identical in
   Sigil City.html in the same folder) so the grid/tile/solver core can be reused for other
   radial WFC layouts, not just the desert round-city grammar. The ring geometry, tile
   grammar (TILE_DEFS), and the renderer stay in each consuming tool — this file is just the
   solver: build a ring/sector grid, give it a tile set with directional sockets, and it
   collapses a seeded, backtracking, globally-connected layout.

   TILE_DEFS/RINGS etc. are exposed as plain data on the returned object (not closed over
   privately) so a consumer can swap in a different tile grammar for a different kind of
   radial layout (a station ring, a dungeon, a garden) while reusing the same solver.

   generate()/prune() accept an optional `opts.weight` so a consumer can bias tile selection
   (e.g. Sigil City's bazaarWeight) without forking the solver — Round City Generator doesn't
   pass one and gets the original tiles[t].weight behaviour unchanged.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../shared/city-wfc.js"></script>
     (then your own script that reads window.CityWFC)
*/
(function () {
  'use strict';

  // Sockets: in / out (radial), cw / ccw (around the ring).
  // Labels: p plaza, S street, M bazaar arcade, b party wall, c qanat water,
  //         g garden, w city wall, X outside.

  const RINGS = [1, 8, 16, 32, 32, 32, 32, 64, 64];
  const RADII = [0, 2.4, 4.6, 6.2, 7.8, 9.4, 11.0, 12.8, 14.4, 15.3];
  const RING_ZONE = ['core', 'sanctum', 'bazaar', 'bazaar', 'housing', 'housing', 'housing', 'garden', 'wall'];
  const ZONES = {
    core:    { name: 'Sacred core',  rings: '0' },
    sanctum: { name: 'Sanctum ring', rings: '1' },
    bazaar:  { name: 'Bazaar ring',  rings: '2–3' },
    housing: { name: 'Mahalle quarters', rings: '4–6' },
    garden:  { name: 'Chahar bagh gardens', rings: '7' },
    wall:    { name: 'Round wall', rings: '8' },
  };
  const PASSABLE = { S: 1, M: 1, p: 1 };
  const GATE_POSITIONS = [0, 16, 32, 48];
  const GATE_NAMES = ['Khorasan Gate', 'Basra Gate', 'Kufa Gate', 'Syria Gate'];

  // [id, name, zone, [in, out, cw, ccw], weight, mirror?, note]
  const TILE_DEFS = [
    ['core', 'Great Mosque & Green Dome', 'core', ['X', 'p', 'X', 'X'], 1, false, 'Fixed centre. Opens to the plaza on every side.'],

    ['iwan', 'Iwan portal', 'sanctum', ['p', 'S', 'p', 'p'], 2, false, 'Vaulted gateway from the plaza onto a radial avenue.'],
    ['fountain', 'Plaza fountain', 'sanctum', ['p', 'b', 'p', 'p'], 1.4, false, 'Octagonal pool; closed to the bazaar behind it.'],
    ['minaret', 'Minaret court', 'sanctum', ['p', 'b', 'p', 'p'], 0.9, false, 'Free-standing minaret on the plaza edge.'],
    ['bayt-al-hikma', 'House of Wisdom', 'sanctum', ['p', 'b', 'p', 'p'], 0.5, false, 'Library and academy of translators; a domed reading hall screened against the plaza glare.'],

    ['avenue', 'Avenue', 'bazaar', ['S', 'S', 'b', 'b'], 3, false, 'Radial street with shopfronts.'],
    ['chaharsu', 'Chahar-su crossing', 'bazaar', ['S', 'S', 'M', 'M'], 2, false, 'Domed crossing where an avenue meets the arcade.'],
    ['chaharsu-t', 'Chahar-su, inner end', 'bazaar', ['S', 'b', 'M', 'M'], 1, false, 'Avenue ends at the arcade.'],
    ['chaharsu-o', 'Chahar-su, outer start', 'bazaar', ['b', 'S', 'M', 'M'], 1, false, 'Avenue leaves the arcade outward.'],
    ['arcade', 'Covered arcade', 'bazaar', ['b', 'b', 'M', 'M'], 4, false, 'Vaulted bazaar street running round the ring.'],
    ['arcade-end', 'Arcade end', 'bazaar', ['b', 'b', 'M', 'b'], 1.2, true, 'Arcade terminates in a shop.'],
    ['caravanserai', 'Caravanserai', 'bazaar', ['b', 'b', 'b', 'b'], 1.6, false, 'Courtyard inn for traders.'],
    ['madrasa', 'Madrasa', 'bazaar', ['S', 'b', 'b', 'b'], 0.9, false, 'Four-iwan school at the end of a street.'],

    ['avenue-h', 'Avenue', 'housing', ['S', 'S', 'b', 'b'], 3, false, 'Radial street between houses.'],
    ['lane', 'Ring lane', 'housing', ['b', 'b', 'S', 'S'], 2, false, 'Lane running round the quarter.'],
    ['cross', 'Crossroads', 'housing', ['S', 'S', 'S', 'S'], 0.8, false, 'Avenue meets ring lane.'],
    ['t-in', 'Junction, avenue ends', 'housing', ['S', 'b', 'S', 'S'], 1, false, 'Avenue meets a lane and stops.'],
    ['t-out', 'Junction, avenue starts', 'housing', ['b', 'S', 'S', 'S'], 1, false, 'Avenue leaves a lane outward.'],
    ['t-side', 'Junction, side lane', 'housing', ['S', 'S', 'S', 'b'], 1, true, 'Lane branches off one side of the avenue.'],
    ['bend-in', 'Bend, inward', 'housing', ['S', 'b', 'S', 'b'], 0.9, true, 'Avenue turns into a lane.'],
    ['bend-out', 'Bend, outward', 'housing', ['b', 'S', 'S', 'b'], 0.9, true, 'Lane turns outward.'],
    ['house', 'Courtyard house', 'housing', ['b', 'b', 'b', 'b'], 5, false, 'Inward-facing house around a garden court.'],
    ['kucheh', 'Kucheh dead end', 'housing', ['S', 'b', 'b', 'b'], 1.4, false, 'Cul-de-sac ending at house doors.'],
    ['kucheh-o', 'Kucheh, outer', 'housing', ['b', 'S', 'b', 'b'], 0.8, false, 'Cul-de-sac reached from outside.'],
    ['kucheh-s', 'Kucheh, side', 'housing', ['b', 'b', 'S', 'b'], 0.8, true, 'Cul-de-sac off a ring lane.'],
    ['hammam', 'Hammam', 'housing', ['b', 'b', 'b', 'b'], 0.6, false, 'Bathhouse with glass-studded domes.'],
    ['bimaristan', 'Bimaristan', 'housing', ['b', 'b', 'b', 'b'], 0.4, false, 'Hospital courtyard with wards and a dispensary around a running channel.'],
    ['masjid', 'Neighbourhood masjid', 'housing', ['S', 'b', 'b', 'b'], 0.5, false, 'Small mosque at the head of a lane.'],
    ['qanat', 'Qanat channel', 'housing', ['c', 'c', 'b', 'b'], 0.8, false, 'Underground water channel surfacing in a stream.'],
    ['ab-anbar', 'Ab anbar cistern', 'housing', ['b', 'c', 'b', 'b'], 0.5, false, 'Domed cistern with windcatchers; end of the qanat.'],
    // Weight 0: never picked by the normal weighted-random collapse, only reachable by pinning a
    // cell's domain to exactly this tile before solving (solve()'s opts.domain / generate()'s own
    // forwarding of it, added 2026-11-02) -- same closed ['b','b','b','b'] sockets as 'house', so a
    // pinned cell slots into the housing fabric exactly as safely as an ordinary house would, and
    // the solver builds real, socket-consistent streets around it instead of a landmark tower being
    // placed on an already-solved cell after the fact. A consumer that wants a landmark tower to
    // occupy a specific WFC cell pins it to this tile; the renderer (e.g. shared/creature-city.js)
    // leaves it alone since no per-cell case matches an id with no building/street meaning.
    ['belvedere', 'Belvedere court (reserved)', 'housing', ['b', 'b', 'b', 'b'], 0, false, 'Open court reserved for a freestanding landmark structure -- never chosen by the solver on its own, only by a host pinning this cell before solving.'],

    ['orchard', 'Orchard', 'garden', ['b', 'g', 'g', 'g'], 4, false, 'Pomegranate and cypress rows.'],
    ['pool-garden', 'Pool garden', 'garden', ['b', 'g', 'g', 'g'], 1, false, 'Chahar bagh with a central pool.'],
    ['pavilion', 'Pavilion', 'garden', ['b', 'g', 'g', 'g'], 0.6, false, 'Kushk pavilion on pillars.'],
    ['garden-path', 'Garden avenue', 'garden', ['S', 'S', 'g', 'g'], 1, false, 'Avenue running through to a gate.'],
    ['garden-end', 'Garden walk', 'garden', ['S', 'g', 'g', 'g'], 1.2, false, 'Avenue ends in the gardens.'],
    ['garden-canal', 'Garden rill', 'garden', ['c', 'c', 'g', 'g'], 1, false, 'Qanat water crossing the gardens.'],

    ['wall', 'Curtain wall', 'wall', ['g', 'X', 'w', 'w'], 5, false, 'Mud-brick round wall.'],
    ['tower', 'Bastion', 'wall', ['g', 'X', 'w', 'w'], 1.6, false, 'Round tower on the wall.'],
    ['gate', 'City gate', 'wall', ['S', 'X', 'w', 'w'], 1, false, 'One of four gates; only at the cardinal points.'],
    ['inlet', 'Qanat inlet', 'wall', ['c', 'X', 'w', 'w'], 0.6, false, 'Where the qanat passes under the wall.'],
  ];

  // defs (optional): an override tile-def array in the same [id, name, zone, sockets,
  // weight, mirror?, note] shape as TILE_DEFS, for a consumer that wants a different tile
  // grammar (e.g. a subset, or a whole new set of pieces) on the same solver.
  function buildTiles(defs) {
    defs = defs || TILE_DEFS;
    const tiles = [];
    for (const [id, name, zone, s, weight, mirror, note] of defs) {
      tiles.push({ id, name, zone, in: s[0], out: s[1], cw: s[2], ccw: s[3], weight, note, mirrored: false });
      if (mirror) tiles.push({ id: id + '~', base: id, name, zone, in: s[0], out: s[1], cw: s[3], ccw: s[2], weight, note, mirrored: true });
    }
    tiles.forEach((t, i) => (t.index = i));
    return tiles;
  }

  function buildGrid() {
    const cells = [];
    const start = [];
    let k = 0;
    for (let r = 0; r < RINGS.length; r++) {
      start[r] = k;
      for (let j = 0; j < RINGS[r]; j++) {
        const n = RINGS[r];
        cells.push({ id: k++, ring: r, j, zone: RING_ZONE[r],
          r0: RADII[r], r1: RADII[r + 1], a0: (j / n) * Math.PI * 2, a1: ((j + 1) / n) * Math.PI * 2 });
      }
    }
    const at = (r, j) => start[r] + ((j % RINGS[r]) + RINGS[r]) % RINGS[r];
    for (const c of cells) {
      const r = c.ring, j = c.j, n = RINGS[r];
      c.nb = []; // [neighbourId, mySide, theirSide]
      if (r > 0) {
        c.nb.push([at(r, j + 1), 'cw', 'ccw']);
        c.nb.push([at(r, j - 1), 'ccw', 'cw']);
        const ni = RINGS[r - 1];
        c.nb.push([at(r - 1, Math.floor(j * ni / n)), 'in', 'out']);
      }
      if (r < RINGS.length - 1) {
        const no = RINGS[r + 1], f = no / n;
        for (let q = 0; q < f; q++) c.nb.push([at(r + 1, j * f + q), 'out', 'in']);
      }
    }
    return { cells, at };
  }

  // Ring grammar: which tiles a cell may hold before solving.
  // 1. Zoning: a tile may only appear in its own ring.
  // 2. Gates: exactly four, at the cardinal points of the wall.
  // 3. Royal avenues: the cells on each gate's bearing must carry a street
  //    straight through (in and out), so every gate reaches the core.
  function isAvenueCell(cell) {
    if (cell.ring === 0) return false;
    const n = RINGS[cell.ring];
    return [0, 0.25, 0.5, 0.75].some(f => cell.j === Math.round(f * n));
  }
  function initialDomain(cell, tiles) {
    let d = tiles.filter(t => t.zone === cell.zone);
    if (cell.zone === 'wall') {
      const isGate = GATE_POSITIONS.includes(cell.j);
      d = d.filter(t => (t.id === 'gate') === isGate);
    } else if (isAvenueCell(cell)) {
      d = d.filter(t => t.out === 'S' && (cell.ring === 1 || t.in === 'S'));
    }
    return d.map(t => t.index);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function solve(seed, opts = {}) {
    const tiles = opts.tiles || buildTiles();
    const cells = opts.cells || buildGrid().cells;
    const T = tiles.length, N = cells.length;
    const rand = mulberry32(seed >>> 0);
    let dom = new Uint8Array(N * T);
    const init = opts.domain || (c => initialDomain(c, tiles));
    const wt = opts.weight || ((i, t) => tiles[t].weight);
    const compat = opts.compat;
    const fits = (labels, lab) => {
      if (!compat) return labels.has(lab);
      for (const l of labels) if (compat(l, lab)) return true;
      return false;
    };
    for (const c of cells) for (const t of init(c)) dom[c.id * T + t] = 1;

    const order = []; // collapse order, for animated replay
    let backtracks = 0;

    function propagate(stack) {
      while (stack.length) {
        const a = stack.pop();
        for (const [b, side, other] of cells[a].nb) {
          const labels = new Set();
          for (let t = 0; t < T; t++) if (dom[a * T + t]) labels.add(tiles[t][side]);
          let changed = false, left = 0;
          for (let u = 0; u < T; u++) {
            if (!dom[b * T + u]) continue;
            if (!fits(labels, tiles[u][other])) { dom[b * T + u] = 0; changed = true; }
            else left++;
          }
          if (left === 0) return false;
          if (changed) stack.push(b);
        }
      }
      return true;
    }

    if (!propagate(cells.map(c => c.id))) return { ok: false, reason: 'grammar has no solution' };

    const history = []; // decision stack for backtracking
    let steps = 0;
    const maxSteps = opts.maxSteps || 20000;
    while (steps++ < maxSteps) {
      // lowest weighted entropy cell
      let best = -1, bestE = Infinity;
      for (let i = 0; i < N; i++) {
        let sw = 0, swl = 0, cnt = 0;
        for (let t = 0; t < T; t++) if (dom[i * T + t]) { const w = wt(i, t); sw += w; swl += w * Math.log(w); cnt++; }
        if (cnt <= 1) continue;
        const e = Math.log(sw) - swl / sw + rand() * 1e-3;
        if (e < bestE) { bestE = e; best = i; }
      }
      if (best < 0) break; // all collapsed
      // weighted pick
      const opts2 = [];
      let total = 0;
      for (let t = 0; t < T; t++) if (dom[best * T + t]) { opts2.push(t); total += wt(best, t); }
      let x = rand() * total, pick = opts2[opts2.length - 1];
      for (const t of opts2) { x -= wt(best, t); if (x <= 0) { pick = t; break; } }

      history.push({ snap: dom.slice(), cell: best, tile: pick, orderLen: order.length });
      for (let t = 0; t < T; t++) dom[best * T + t] = t === pick ? 1 : 0;
      order.push(best);
      let ok = propagate([best]);
      while (!ok) {
        backtracks++;
        const h = history.pop();
        if (!h) return { ok: false, reason: 'contradiction' };
        dom = h.snap;
        order.length = h.orderLen;
        dom[h.cell * T + h.tile] = 0;
        let any = false;
        for (let t = 0; t < T; t++) if (dom[h.cell * T + t]) any = true;
        ok = any && propagate([h.cell]);
      }
    }
    const result = cells.map(c => {
      for (let t = 0; t < T; t++) if (dom[c.id * T + t]) return t;
      return -1;
    });
    // cells fixed by propagation alone also need a place in the reveal order
    const seen = new Set(order);
    const fixed = cells.filter(c => !seen.has(c.id)).map(c => c.id);
    const fullOrder = opts.plain ? [...fixed, ...order] : [0, ...fixed.filter(i => i !== 0), ...order.filter(i => i !== 0)];
    const conn = opts.plain ? {} : connectivity(cells, tiles, result);
    return { ok: true, tiles, cells, result, order: fullOrder, backtracks, ...conn };
  }

  // Global rule: every street, arcade and plaza must link back to the core.
  function connectivity(cells, tiles, result) {
    const seen = new Uint8Array(cells.length);
    const q = [0]; seen[0] = 1;
    while (q.length) {
      const a = q.pop();
      for (const [b, side, other] of cells[a].nb) {
        const la = tiles[result[a]][side], lb = tiles[result[b]][other];
        if (la === lb && PASSABLE[la] && !seen[b]) { seen[b] = 1; q.push(b); }
      }
    }
    let orphan = 0;
    for (const c of cells) {
      const t = tiles[result[c.id]];
      const hasStreet = ['in', 'out', 'cw', 'ccw'].some(s => PASSABLE[t[s]]);
      if (hasStreet && !seen[c.id]) orphan++;
    }
    return { orphans: orphan, reached: seen };
  }

  // Pruning pass: streets that never reach the core are re-solved as
  // buildings, keeping every boundary socket the rest of the city fixed.
  // opts.weight (optional): passed through to the second solve() pass so a
  // consumer's custom weighting (e.g. Sigil City's bazaarWeight) still applies.
  function prune(res, seed, opts = {}) {
    const { tiles, cells, result, reached } = res;
    const orphan = new Set();
    for (const c of cells) {
      const t = tiles[result[c.id]];
      if (!reached[c.id] && ['in', 'out', 'cw', 'ccw'].some(s => PASSABLE[t[s]])) orphan.add(c.id);
    }
    const closed = t => !['in', 'out', 'cw', 'ccw'].some(s => PASSABLE[t[s]]);
    const second = solve(seed ^ 0x9e3779b9, {
      tiles, cells,
      domain: c => orphan.has(c.id)
        ? tiles.filter(t => t.zone === c.zone && closed(t)).map(t => t.index)
        : [result[c.id]],
      weight: opts.weight,
    });
    if (!second.ok) return null;
    // keep the original collapse order; pruned cells reveal where they were
    return { ...second, order: res.order, backtracks: res.backtracks + second.backtracks, pruned: orphan.size };
  }

  // opts.weight (optional): a custom (cellIndex, tileIndex) -> weight function, threaded
  // through to both solve() passes. Omit it to get the plain tiles[t].weight behaviour.
  // opts.tiles/opts.cells (optional): override the tile set / grid passed into the first
  // solve() pass (e.g. a filtered TILE_DEFS subset). prune()'s second pass reuses whatever
  // tiles/cells the first pass actually resolved, so it doesn't need these separately.
  // opts.domain (optional, 2026-11-02): a (cell) -> [tileIndex, ...] override forwarded to the
  // first solve() pass, for a host that wants specific cells pinned before collapse (e.g. "this
  // cell is occupied by a landmark tower, not a WFC-chosen tile" -- pin it to a single-tile domain,
  // typically the zero-weight 'belvedere' tile, so the solver builds everything else consistently
  // around it). Cells NOT covered by the override should still fall through to the normal
  // initialDomain(cell, tiles) grammar -- that's the caller's job, not this function's; opts.domain
  // entirely replaces the default when given, same as solve()'s own opts.domain contract.
  function generate(seed, opts = {}) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const s = (seed + attempt * 7919) >>> 0;
      const res = solve(s, { tiles: opts.tiles, cells: opts.cells, weight: opts.weight, domain: opts.domain });
      if (!res.ok) continue;
      const out = res.orphans === 0 ? { ...res, pruned: 0 } : prune(res, s, opts);
      if (out && out.orphans === 0) return { ...out, attempts: attempt + 1, seed };
    }
    return { ok: false, seed, reason: 'no connected city found' };
  }


  // ===== Stacked WFC: storeys above the street plan =====
  // Each cell becomes a column of LAYERS slots above its ground piece.
  // Vertical sockets: up / down must be equal. Labels:
  //   F floor that can carry more, A open sky, T tower shaft, W wall top, G gate top.
  // Side sockets: a open, f built storey, k sabat bridge. A sabat needs built
  // neighbours (f or k) on every side at its own level.
  const LAYERS = 4;
  const STOREY_H = 0.5;
  const STREET_KINDS = ['avenue', 'chaharsu', 'chaharsu-t', 'chaharsu-o', 'arcade', 'arcade-end', 'avenue-h', 'lane', 'cross', 't-in', 't-out', 't-side', 'bend-in', 'bend-out', 'kucheh', 'kucheh-o', 'kucheh-s', 'qanat'];
  const GROUND_TOP = { house: 'F', caravanserai: 'F', minaret: 'T', tower: 'T', 'ab-anbar': 'T', wall: 'W', inlet: 'W', gate: 'G' };
  STREET_KINDS.forEach(k => (GROUND_TOP[k] = 'F'));
  const groundTop = kind => GROUND_TOP[kind] || 'A';

  // [id, name, down, up, side, weight, note]
  const MOD_DEFS = [
    ['air', 'Open sky', 'A', 'A', 'a', 1, 'Nothing here.'],
    ['storey', 'Upper storey', 'F', 'F', 'f', 2, 'Another floor on the same footprint.'],
    ['sabat', 'Sabat storey', 'F', 'F', 'k', 0.8, 'A floor that bridges the lane below. Needs built floors on every side.'],
    ['roof', 'Roof terrace', 'F', 'A', 'a', 1.6, 'Flat roof with a parapet, used for sleeping in summer.'],
    ['dome', 'Rooftop dome', 'F', 'A', 'a', 0.7, 'A dome over the main room.'],
    ['badgir', 'Windcatcher roof', 'F', 'A', 'a', 0.8, 'Roof with badgir towers that pull cool air down.'],
    ['talar', 'Rooftop talar', 'F', 'A', 'a', 0.4, 'Columned porch on the roof.'],
    ['shaft', 'Tower shaft', 'T', 'T', 'a', 1.5, 'One more stage of a minaret, bastion or windcatcher.'],
    ['cap', 'Tower cap', 'T', 'A', 'a', 1, 'Lantern, cone or crenellation that ends a tower.'],
    ['battlement', 'Battlements', 'W', 'A', 'a', 1, 'Merlons along the wall walk.'],
    ['gatehouse', 'Gatehouse', 'G', 'A', 'a', 1, 'Domed chamber over the gate passage.'],
  ];
  const HCOMPAT = { aa: 1, af: 1, fa: 1, ff: 1, fk: 1, kf: 1, kk: 1 };
  const stackCompat = (x, y) => x === y || !!HCOMPAT[x + y];

  function buildModules() {
    return MOD_DEFS.map(([id, name, down, up, side, weight, note], index) =>
      ({ id, name, down, up, in: side, out: side, cw: side, ccw: side, weight, note, index, zone: 'stack' }));
  }
  function maxHeight(cell, kind) {
    if (kind === 'minaret') return 4;
    if (cell.zone === 'bazaar') return 2;
    if (cell.zone === 'housing') return cell.ring === 6 ? 2 : 3;
    if (kind === 'tower') return 2;
    if (cell.zone === 'wall') return 1;
    return 0;
  }
  const HEIGHT_RULES = [
    ['Sanctum minarets', 4], ['Bazaar ring', 2], ['Quarters, rings 4–5', 3], ['Quarters, ring 6', 2],
    ['Wall bastions', 2], ['Wall, gates', 1], ['Core, plaza, gardens', 0],
  ];

  // socket-letter legend, same meaning wherever a tile/module's in/out/cw/ccw (or down/up/side)
  // fields are shown to a person -- was duplicated inline in tools/city_gen/Round City
  // Generator.html; lives here now so every reader of this module's tile data can label it the
  // same way (pass: true means fish/walkers can cross that edge).
  const LABEL = {
    p: { css: '#e8cf8f', name: 'Plaza paving', pass: true },
    S: { css: '#f0dca8', name: 'Street', pass: true },
    M: { css: '#b36c42', name: 'Bazaar arcade', pass: true },
    b: { css: '#9a8a74', name: 'Party wall (closed)', pass: false },
    c: { css: '#4aa6cf', name: 'Qanat water', pass: false },
    g: { css: '#6aa553', name: 'Garden edge', pass: false },
    w: { css: '#8a6a49', name: 'City wall', pass: false },
    X: { css: '#c7c2b8', name: 'Outside the grid', pass: false },
  };

  function stack(city, seed) {
    const mods = buildModules();
    const N = city.cells.length;
    const nodes = [];
    for (let k = 1; k <= LAYERS; k++) for (const c of city.cells) {
      const id = (k - 1) * N + c.id;
      const nb = c.nb.map(([b, side, other]) => [(k - 1) * N + b, side, other]);
      if (k < LAYERS) nb.push([id + N, 'up', 'down']);
      if (k > 1) nb.push([id - N, 'down', 'up']);
      nodes.push({ id, cell: c, k, nb });
    }
    const groundOf = c => city.tiles[city.result[c.id]];
    const kindOf = c => { const t = groundOf(c); return t.base || t.id; };
    const hasStreet = c => { const t = groundOf(c); return ['in', 'out', 'cw', 'ccw'].some(s => t[s] === 'S'); };
    const domain = n => {
      const c = n.cell, kind = kindOf(c), top = groundTop(kind), maxH = maxHeight(c, kind);
      return mods.filter(m => {
        if (n.k === 1 && m.down !== top) return false;
        if (n.k === LAYERS && m.up !== 'A') return false;
        if (n.k > maxH) return m.id === 'air';
        if (m.id === 'sabat') return hasStreet(c) && n.k <= 2;
        if (m.id === 'badgir' || m.id === 'talar') return c.zone === 'housing' || c.zone === 'bazaar';
        return true;
      }).map(m => m.index);
    };
    const weight = (i, t) => {
      const n = nodes[i], m = mods[t], c = n.cell;
      let w = m.weight;
      if (m.id === 'storey' || m.id === 'sabat') {
        const zf = c.zone === 'bazaar' ? 1 : c.ring === 4 ? 1.6 : c.ring === 5 ? 1.1 : 0.6;
        w *= zf * Math.pow(0.6, n.k - 1);
      }
      if (m.id === 'roof') w *= 1 + 0.4 * n.k;
      if (m.id === 'shaft' && kindOf(c) === 'minaret') w *= 3;
      return w;
    };
    const res = solve(seed ^ 0x51ed27, { tiles: mods, cells: nodes, domain, compat: stackCompat, weight, plain: true });
    if (!res.ok) return null;
    return { mods, nodes, result: res.result, order: res.order, backtracks: res.backtracks };
  }

  const CityWFC = {
    RINGS, RADII, RING_ZONE, ZONES, PASSABLE, GATE_POSITIONS, GATE_NAMES, TILE_DEFS,
    buildTiles, buildGrid, isAvenueCell, initialDomain, mulberry32,
    solve, connectivity, prune, generate,
    LAYERS, STOREY_H, STREET_KINDS, GROUND_TOP, groundTop, MOD_DEFS, HCOMPAT, stackCompat,
    buildModules, maxHeight, HEIGHT_RULES, stack, LABEL,
  };

  if (typeof window !== 'undefined') window.CityWFC = CityWFC;
  if (typeof module !== 'undefined') module.exports = CityWFC;
})();
