/* A wood put together: which recipes, how many, where each stands, how big, what colour. The Flora Grow page and the Maw's Frond Forest
   both stand their trees from this, so the wood looks the same in both.

     FloraForest.compose(kind, { W, H, U, seed, trees, under, ground, skip })  ->  { list, trees, first, kinds }
        kind     "wood" (forked trunks, bare twigs, yellow saplings, fallen leaves) or "redwood" (rings of redwoods, ferns, grass)
        W, H     the floor's width and depth, in tank units;  U: one body (a plant's size is its height in bodies times U)
        trees, under   how many trees and how many plants beneath them (litter comes on top of these)
        seed     the same seed gives the same wood
        ground(x, y)   how far the floor lies from the flat floor fz there (negative: nearer the camera); each plant's foot takes it
        skip(x, y)     true where nothing should stand (a boulder, a tower, steep ground)
        litter   fallen leaves per plant beneath (default 1.6)
        scale, low     how big a tree is, and how big what stands beneath it is, against the recipes (1: as drawn; a tree is 8 bodies tall). A tank
                       whose camera sits close wants smaller trees
        list     [{ def, x, y, size, yaw, phase, delay, dz, tint, sway }] for FloraGPU.set
        trees    [[x, y]] where the trees stand (the Maw's habitat reads these as cover)
        first    one tree's recipe, for the page's captions
   Needs FloraGrow (and the kit parts it draws from). Classic script. */
(function () {
  "use strict";
  const G = () => window.FloraGrow, mix = (c, w, t) => [c[0] + (w[0] - c[0]) * t, c[1] + (w[1] - c[1]) * t, c[2] + (w[2] - c[2]) * t];
  function compose(kind, o) {
    const FG = G(), tree = o.scale == null ? 1 : o.scale, low = o.low == null ? tree : o.low, W = o.W, H = o.H, U = o.U, seed = o.seed == null ? 7 : o.seed, rnd = FG.rng(seed * 7919 + (kind === "wood" ? 5 : 0)), ground = o.ground || (() => 0), skip = o.skip || (() => false);
    const P = (k) => FG.PRESETS.find((p) => p.key === k);
    const grow = (k, n, vary) => Array.from({ length: n }, (_, i) => FG.grow(Object.assign({}, JSON.parse(JSON.stringify(P(k))), vary ? vary(i) : {}, { key: k + "-s" + i, seed: seed * 13 + i * 7 + 1 })));
    const list = [], spots = [], free = (x, y, gap) => x > U * 0.5 && y > U * 0.5 && x < W - U * 0.5 && y < H - U * 0.5 && !skip(x, y) && spots.every((q) => Math.hypot(q[0] - x, q[1] - y) > gap);
    const stand = (d, x, y, sc, tint, sway) => list.push({ def: d, x, y, size: d.eco.height * sc * U * (d.eco.height > 5 ? tree : low) / 1000, yaw: rnd() * 6.283, phase: rnd() * 6.283, dz: ground(x, y), delay: Math.hypot(x - W / 2, y - H / 2) / W * 4 + (d.eco.height < 2 ? 1.5 : 0), tint, sway: sway == null ? 1 : sway });
    // gap: nearest allowed neighbour; near: the share of tries that start beside a tree
    const scatter = (n, gap, put, near) => { for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) { const t = near && rnd() < near && trees.length ? trees[Math.floor(rnd() * trees.length)] : null, a = rnd() * 6.283, rr = (0.8 + rnd() * 1.8) * U, x = t ? t[0] + Math.cos(a) * rr : rnd() * W, y = t ? t[1] + Math.sin(a) * rr : rnd() * H; if (gap ? !free(x, y, gap) : (skip(x, y) || x < 0 || y < 0 || x > W || y > H)) continue; if (gap) spots.push([x, y]); put(x, y, i); i++; } };
    let trees = [], first, kinds = 0;
    if (kind === "wood") {
      // six trees: crowns narrow or wide, starting low or high, some leaning. Rust, brown and ochre left in the canopy; yellow and orange beneath
      const big = grow("wood-tree", 6, (i) => ({ crown: ["round", "round", "lean", "umbrella", "round", "lean"][i], spread: [0.24, 0.32, 0.28, 0.36, 0.2, 0.3][i], crownFrom: [0.42, 0.34, 0.46, 0.55, 0.5, 0.38][i] })), sap = grow("wood-sapling", 4), shrub = grow("wood-shrub", 2), lit = grow("wood-litter", 3), tuft = grow("grown-grass", 2); first = big[0]; kinds = 6 + 4 + 2 + 3 + 2;
      const canopy = [[0.6, 0.24, 0.12], [0.47, 0.2, 0.12], [0.7, 0.4, 0.14], [0.55, 0.3, 0.16]], under = [[0.86, 0.74, 0.24], [0.74, 0.76, 0.3], [0.9, 0.62, 0.2], [0.8, 0.8, 0.36]], fallen = [[0.6, 0.38, 0.2], [0.72, 0.5, 0.24], [0.5, 0.3, 0.18]];
      scatter(o.trees, 1.25 * U * Math.max(0.6, tree), (x, y, i) => stand(big[i % 6], x, y, 0.9 + rnd() * 0.55, canopy[Math.floor(rnd() * 4)], 0.7)); trees = spots.slice();
      scatter(o.under, 0.45 * U * Math.max(0.6, low), (x, y, i) => { const u = rnd(); if (u < 0.68) stand(sap[i % 4], x, y, 0.55 + rnd() * 0.8, under[Math.floor(rnd() * 4)]); else if (u < 0.9) stand(shrub[i % 2], x, y, 0.7 + rnd() * 0.7, under[Math.floor(rnd() * 4)]); else stand(tuft[i % 2], x, y, 0.7 + rnd() * 0.5, [0.62, 0.6, 0.34]); });
      scatter(Math.round(o.under * (o.litter == null ? 1.6 : o.litter)) + 60, 0, (x, y, i) => stand(lit[i % 3], x, y, 0.8 + rnd() * 0.8, fallen[Math.floor(rnd() * 3)], 0));
    } else {
      const reds = grow("grown-redwood", 4), ferns = grow("grown-swordfern", 2), tufts = grow("grown-grass", 3), turf = grow("grown-turf", 2), tails = grow("grown-horsetail", 1); first = reds[0]; kinds = 4 + 2 + 3 + 2 + 1;
      // redwoods sprout in a ring round where a parent stood: rings first, then the rest scattered, a few young ones among them
      const rings = [[W * 0.3, H * 0.4], [W * 0.68, H * 0.32], [W * 0.55, H * 0.72], [W * 0.2, H * 0.78], [W * 0.84, H * 0.7]], n = Math.round(o.trees * 0.75);
      for (let i = 0, tries = 0; i < n && tries < 5000; tries++) { const c = rings[i % 5], ring = i < n * 0.7, a = rnd() * 6.283, rr = ring ? (1.6 + rnd() * 1.4) * U : 0, x = ring ? c[0] + Math.cos(a) * rr : rnd() * W, y = ring ? c[1] + Math.sin(a) * rr : rnd() * H;
        if (!free(x, y, 1.4 * U * Math.max(0.6, tree))) continue; const young = !ring && rnd() < 0.4; spots.push([x, y]); stand(reds[i % 4], x, y, young ? 0.25 + rnd() * 0.2 : 0.7 + rnd() * 0.4, [0.42, 0.6, 0.4], 0.6); i++; } trees = spots.slice();
      scatter(o.under, 0.5 * U * Math.max(0.6, low), (x, y, i) => { const u = rnd(); if (u < 0.5) stand(ferns[i % 2], x, y, 0.75 + rnd() * 0.6, [0.5, 0.72, 0.42]); else if (u < 0.6) stand(tails[0], x, y, 0.8 + rnd() * 0.5, [0.55, 0.7, 0.45]); else if (u < 0.85) stand(tufts[i % 3], x, y, 0.75 + rnd() * 0.6, [0.68, 0.74, 0.42]); else stand(turf[i % 2], x, y, 0.8 + rnd() * 0.5, [0.6, 0.72, 0.4]); }, 0.5);
    }
    return { list, trees, first, kinds };
  }
  window.FloraForest = { compose, mix };
})();
