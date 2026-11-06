/* shared/evolve/map-elites.js — MAP-Elites, once, for any kind of thing.
   Quality-diversity search: instead of one best design, keep the best design found for every
   combination of two traits (a grid of niches), so the archive shows the whole range of what a
   generator can make. Ported out of Tower Forge's atlas (shared/tower/tower-forge-ui.js), which
   had its own copy, like Species Forge and Interface Forge; this one knows nothing about towers.

   An item is anything the caller evaluated: { genome, traits: {id: number}, quality: 0..1, ...extra }.
   The engine only files items into cells by two traits and keeps the fittest per cell. Making,
   varying and evaluating genomes is the caller's job (see shared/evolve/chimera.js), so the same
   archive works for towers, creatures, seals or whole assemblies.

     const me = MapElites.create({
       axes: { warmth: { label, min, max }, ink: {...}, ... },   // every trait it may bin on
       x: "warmth", y: "ink", n: 8,                               // the two shown, and grid size
       similarity: (a, b) => 0..1,                                // optional: how alike two items are
       steer: 0.35,                                               // optional: how much pins pull
       keep: 600,                                                 // items remembered for re-binning
     });
     me.insert(item)          -> { cell, placed, replaced }      placed: it is now the cell's elite
     me.pick(rng)             -> an elite to vary (uniform over filled cells), or null
     me.pickTwo(rng)          -> two different elites (for crossover), or null
     me.cells()               -> [{ cell, i, j, item }] filled cells
     me.at(i, j)              -> item | null
     me.setAxes(x, y, n?)     -> re-files everything it remembers on the new traits
     me.pin(item) / me.unpin(item) / me.pins -> items that steer fitness toward themselves
     me.stats()               -> { filled, cells, coverage, qd, evaluated, placed }
     me.fitness(item)         -> quality, pulled toward the pins when there are any
   Classic script, no dependencies. */
(function () {
  "use strict";

  function create(opts) {
    const o = Object.assign({ n: 8, steer: 0.35, keep: 600, similarity: null }, opts || {});
    if (!o.axes || !o.axes[o.x] || !o.axes[o.y]) throw new Error("MapElites.create: x and y must name axes");
    const me = { x: o.x, y: o.y, n: o.n, axes: o.axes, pins: [], grid: new Map(), pool: [], evaluated: 0, placed: 0 };

    const clampI = (v) => Math.max(0, Math.min(me.n - 1, v));
    function binOf(id, v) {
      const a = me.axes[id];
      return clampI(Math.floor(((v - a.min) / (a.max - a.min)) * me.n));
    }
    function cellOf(item) {
      const i = binOf(me.x, item.traits[me.x]), j = binOf(me.y, item.traits[me.y]);
      return { i, j, cell: j * me.n + i };
    }
    me.fitness = function (item) {
      const q = item.quality;
      if (!me.pins.length || !o.similarity) return q;
      return (1 - o.steer) * q + o.steer * Math.max(...me.pins.map((p) => o.similarity(item, p)));
    };
    function file(item) {
      const { cell } = cellOf(item), cur = me.grid.get(cell);
      const f = me.fitness(item);
      if (!cur || f > me.fitness(cur)) { me.grid.set(cell, item); return { cell, placed: true, replaced: cur || null }; }
      return { cell, placed: false, replaced: null };
    }
    me.insert = function (item) {
      me.evaluated++;
      me.pool.push(item);
      if (me.pool.length > o.keep) {
        // forget the oldest that is not an elite or a pin
        const elites = new Set(me.grid.values());
        const k = me.pool.findIndex((p) => !elites.has(p) && !me.pins.includes(p));
        me.pool.splice(k < 0 ? 0 : k, 1);
      }
      const r = file(item);
      if (r.placed) me.placed++;
      return r;
    };
    me.refile = function () {
      me.grid.clear();
      for (const item of me.pool) file(item);
    };
    me.setAxes = function (x, y, n) {
      if (!me.axes[x] || !me.axes[y]) return;
      me.x = x; me.y = y; if (n) me.n = n;
      me.refile();
    };
    me.pin = function (item) { if (!me.pins.includes(item)) { me.pins.push(item); if (!me.pool.includes(item)) me.pool.push(item); me.refile(); } };
    me.unpin = function (item) { const k = me.pins.indexOf(item); if (k >= 0) { me.pins.splice(k, 1); me.refile(); } };
    me.cells = function () {
      return [...me.grid.entries()].map(([cell, item]) => ({ cell, i: cell % me.n, j: Math.floor(cell / me.n), item }));
    };
    me.at = (i, j) => me.grid.get(j * me.n + i) || null;
    me.pick = function (rng) {
      const all = [...me.grid.values()];
      // pins are picked more often: steering is also about where to search, not only what to keep
      if (me.pins.length && rng() < o.steer) return me.pins[Math.floor(rng() * me.pins.length)];
      return all.length ? all[Math.floor(rng() * all.length)] : null;
    };
    me.pickTwo = function (rng) {
      const all = [...me.grid.values()];
      if (all.length < 2) return null;
      const a = me.pick(rng); let b = a, guard = 8;
      while (b === a && guard--) b = all[Math.floor(rng() * all.length)];
      return b === a ? null : [a, b];
    };
    me.stats = function () {
      const cells = me.n * me.n, filled = me.grid.size;
      let qd = 0; for (const it of me.grid.values()) qd += it.quality;
      return { filled, cells, coverage: filled / cells, qd, evaluated: me.evaluated, placed: me.placed };
    };
    return me;
  }

  window.MapElites = { create };
})();
