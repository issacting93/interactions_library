/* A planting: a community of plants described as roles, not code. Flora Forge edits these; a stage or a page stands one with FloraGPU.

     planting = { id, name, seed, footprint: { shape, w, d }, density, roles: [role] }
       footprint.shape   "mound" (an oval, r 0 at the middle, 1 at the edge), "ring" (r 0 on the ring's line, 1 at its two edges, the middle
                         empty), "drift" (a long tapering oval), "floor" (the whole rectangle in patches; r is how far into a patch's edge)
       footprint.w, d    its width and depth in bodies
       density           a multiplier on every role's count
     role = { id, label, count, where: [r0, r1], size: [a, b], rise, colours: [[r,g,b]], grow, sway, plants: [{ key, w, part }] }
       where             the band of r this role stands in (0..1, a little past 1 reaches out beyond the edge)
       size              a random scale between a and b (1: the recipe as drawn)
       rise              0..1: how much taller a plant is toward the middle (r 0) than at the edge
       colours           a plant takes one at random, a little varied
       grow              0..1: when this role grows in (0 first); plants nearer the middle grow a little before those at the edge
       plants            recipes by preset key, chosen by weight w; part: a drawn part's id put in every leaf place (FloraGrow.swap)

     FloraPlanting.stand(planting, { W, H, U })  ->  { list, kinds, count }    list: for FloraGPU.set, centred in W x H (tank units, U a body)
     FloraPlanting.PRESETS                        the starting plantings
     FloraPlanting.ROLES                          the four roles' names and what each is for
   Needs FloraGrow. Classic script. */
(function () {
  "use strict";
  const G = () => window.FloraGrow;
  const cache = new Map();   // grown recipes by key, seed and part: changing a colour or a count does not grow anything again
  function grown(key, part, seed) {
    const id = key + '|' + (part || '') + '|' + seed; if (cache.has(id)) return cache.get(id);
    const FG = G(), base = FG.PRESETS.find((p) => p.key === key); if (!base) return null;
    const r = part && FG.DRAWN[part] ? FG.swap(base, part) : JSON.parse(JSON.stringify(base));
    r.key = key + (part ? '+' + part : '') + '-s' + seed; r.seed = seed;
    const d = FG.grow(r); cache.set(id, d); return d;
  }
  // a part drawn again: what was grown from it goes
  function forget(part) { for (const k of [...cache.keys()]) if (!part || k.split('|')[1] === part) cache.delete(k); }

  // where a footprint puts a plant: [x, y, r] in bodies from the middle
  function sample(fp, rnd) {
    const w = fp.w / 2, d = fp.d / 2;
    if (fp.shape === 'ring') { const a = rnd() * 6.283, rr = 0.5 + rnd() * 0.5; return [Math.cos(a) * rr * w, Math.sin(a) * rr * d, Math.abs(rr - 0.75) / 0.25]; }
    if (fp.shape === 'floor') { const x = (rnd() - 0.5) * fp.w, y = (rnd() - 0.5) * fp.d, n = 0.5 + 0.25 * Math.sin(x * 0.9 + 1.3) * Math.cos(y * 1.1 - 0.4) + 0.25 * Math.sin(x * 0.37 - y * 0.53 + 2.1); return [x, y, Math.min(1, Math.abs(1 - 2 * n) * 1.2)]; }
    const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * 1.06;
    if (fp.shape === 'drift') { const along = Math.cos(a) * rr; return [along * w, Math.sin(a) * rr * d * (1 - 0.55 * along * along), rr]; }
    return [Math.cos(a) * rr * w, Math.sin(a) * rr * d, rr];
  }
  function stand(P, o) {
    const FG = G(), rnd = FG.rng((P.seed || 7) * 7919 + 13), U = o.U, cx = o.W / 2, cy = o.H / 2, list = [], kinds = new Set(), dens = P.density == null ? 1 : P.density;
    for (const R of P.roles) {
      const plants = (R.plants || []).filter((p) => (p.w == null ? 1 : p.w) > 0 && FG.PRESETS.some((q) => q.key === p.key)); if (!plants.length) continue;
      const total = plants.reduce((n, p) => n + (p.w == null ? 1 : p.w), 0), n = Math.round((R.count || 0) * dens), [r0, r1] = R.where || [0, 1], [s0, s1] = R.size || [0.8, 1.2], cols = R.colours && R.colours.length ? R.colours : [[0.3, 0.6, 0.45]];
      for (let i = 0, tries = 0; i < n && tries < n * 40 + 40; tries++) {
        const [x, y, r] = sample(P.footprint, rnd); if (r < r0 || r > r1) continue;
        let pick = rnd() * total, p = plants[0]; for (const q of plants) { pick -= q.w == null ? 1 : q.w; if (pick <= 0) { p = q; break; } }
        const def = grown(p.key, p.part, 1 + (i % 2)); if (!def) continue; kinds.add(def.key);
        const rise = 1 + (R.rise || 0) * (0.45 + 1.1 * (1 - Math.min(1, r) ** 2) - 1), c = cols[Math.floor(rnd() * cols.length)], v = 0.92 + rnd() * 0.16;
        list.push({ def, x: cx + x * U, y: cy + y * U, size: def.eco.height * (s0 + rnd() * (s1 - s0)) * rise * U / 1000, yaw: rnd() * 6.283, phase: rnd() * 6.283, dz: 0,
          delay: (R.grow || 0) * 3 + Math.min(1, r) * 2.2 + rnd() * 0.6, tint: [c[0] * v, c[1] * v, c[2] * v], sway: R.sway == null ? 1 : R.sway });
        i++;
      }
    }
    return { list, kinds: kinds.size, count: list.length };
  }

  const ROLES = { centre: 'Stands in the middle and gives the planting its height.', edge: 'Reaches out past the edge: the outline.', filler: 'Fills the ground between.', accent: 'A few bright things through it: flowers, berries.' };
  const GREENS = [[0.16, 0.52, 0.44], [0.2, 0.6, 0.5], [0.13, 0.44, 0.38], [0.3, 0.64, 0.44], [0.24, 0.66, 0.56]], BLOOMS = [[0.95, 0.93, 0.9], [0.98, 0.84, 0.86], [0.86, 0.2, 0.24], [0.58, 0.42, 0.86]];
  const role = (id, label, o) => Object.assign({ id, label, count: 20, where: [0, 1], size: [0.8, 1.2], rise: 0.5, colours: GREENS, grow: 0.5, sway: 1, plants: [] }, o);
  const PRESETS = [
    { id: 'fern-mound', name: 'Fern mound', seed: 7, footprint: { shape: 'mound', w: 5.6, d: 3.8 }, density: 1, roles: [
      role('centre', 'Centre', { count: 18, where: [0, 0.6], size: [0.75, 1.05], rise: 0.6, grow: 0.55, plants: [{ key: 'grown-swordfern', w: 1 }] }),
      role('edge', 'Edge', { count: 26, where: [0.55, 1.06], size: [0.75, 1.05], rise: 0.3, grow: 0.7, plants: [{ key: 'clump-fern', w: 1 }] }),
      role('filler', 'Filler', { count: 160, where: [0, 1], size: [0.5, 1.1], rise: 0.6, grow: 0.15, plants: [{ key: 'clump-round', w: 0.35 }, { key: 'clump-clover', w: 0.5 }, { key: 'grown-grass', w: 0.15 }] }),
      role('accent', 'Accent', { count: 56, where: [0, 0.95], size: [0.6, 1.3], rise: 0.6, grow: 0.35, colours: BLOOMS, plants: [{ key: 'clump-flower', w: 0.7 }, { key: 'clump-berry', w: 0.3 }] }) ] },
    { id: 'meadow-drift', name: 'Meadow drift', seed: 11, footprint: { shape: 'drift', w: 9, d: 3 }, density: 1, roles: [
      role('centre', 'Centre', { count: 30, where: [0, 0.7], size: [0.8, 1.2], rise: 0.4, grow: 0.5, plants: [{ key: 'grown-grass', w: 1 }, { key: 'grown-horsetail', w: 0.3 }] }),
      role('edge', 'Edge', { count: 40, where: [0.6, 1.06], size: [0.6, 0.9], rise: 0, grow: 0.3, plants: [{ key: 'clump-clover', w: 1 }] }),
      role('filler', 'Filler', { count: 140, where: [0, 1], size: [0.6, 1.1], rise: 0.4, grow: 0.1, colours: [[0.42, 0.7, 0.32], [0.5, 0.74, 0.3], [0.36, 0.62, 0.34]], plants: [{ key: 'grown-grass', w: 1 }, { key: 'grown-turf', w: 0.6 }] }),
      role('accent', 'Accent', { count: 90, where: [0, 1], size: [0.8, 1.4], rise: 0.3, grow: 0.6, colours: [[0.96, 0.84, 0.3], [0.95, 0.93, 0.9], [0.58, 0.42, 0.86], [0.92, 0.5, 0.3]], plants: [{ key: 'clump-flower', w: 1 }] }) ] },
    { id: 'fern-ring', name: 'Fern ring', seed: 5, footprint: { shape: 'ring', w: 7, d: 5 }, density: 1, roles: [
      role('centre', 'Ring', { count: 34, where: [0, 0.5], size: [0.8, 1.1], rise: 0.5, grow: 0.5, plants: [{ key: 'grown-swordfern', w: 1 }, { key: 'clump-fern', w: 0.6 }] }),
      role('edge', 'Edges', { count: 30, where: [0.5, 1], size: [0.6, 0.9], rise: 0.3, grow: 0.3, plants: [{ key: 'clump-round', w: 1 }] }),
      role('filler', 'Filler', { count: 110, where: [0, 1], size: [0.5, 1], rise: 0.5, grow: 0.1, plants: [{ key: 'clump-clover', w: 1 }, { key: 'grown-grass', w: 0.3 }] }),
      role('accent', 'Accent', { count: 24, where: [0, 0.8], size: [0.7, 1.2], rise: 0.4, grow: 0.7, colours: BLOOMS.slice(2), plants: [{ key: 'clump-flower', w: 1 }] }) ] },
    { id: 'autumn-floor', name: 'Autumn floor', seed: 3, footprint: { shape: 'floor', w: 10, d: 7 }, density: 1, roles: [
      role('centre', 'Saplings', { count: 16, where: [0, 0.5], size: [0.35, 0.55], rise: 0, grow: 0.6, colours: [[0.86, 0.74, 0.24], [0.9, 0.62, 0.2], [0.74, 0.76, 0.3]], plants: [{ key: 'wood-sapling', w: 1 }] }),
      role('edge', 'Shrubs', { count: 14, where: [0.4, 1], size: [0.6, 0.9], rise: 0, grow: 0.4, colours: [[0.8, 0.8, 0.36], [0.9, 0.62, 0.2]], plants: [{ key: 'wood-shrub', w: 1 }] }),
      role('filler', 'Litter', { count: 260, where: [0, 1], size: [0.8, 1.4], rise: 0, grow: 0, sway: 0, colours: [[0.6, 0.38, 0.2], [0.72, 0.5, 0.24], [0.5, 0.3, 0.18]], plants: [{ key: 'wood-litter', w: 1 }] }),
      role('accent', 'Grass', { count: 40, where: [0.5, 1], size: [0.6, 1], rise: 0, grow: 0.2, colours: [[0.62, 0.6, 0.34]], plants: [{ key: 'grown-grass', w: 1 }] }) ] },
  ];
  window.FloraPlanting = { stand, sample, grown, forget, PRESETS, ROLES, GREENS, BLOOMS };
})();
