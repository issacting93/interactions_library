/* INTERACTIONS — Bloom: the rosette that opens on whatever you clicked.
   Click a cell (a part on a creature, a plot in a city, a socket on a building) and its options open in a
   ring around it, so a pick always knows where it is going. This file is the mechanism only: where the
   options sit, and which options to offer. It draws nothing; shared/look/forge-ds/bloom-picker.js is the
   Forge Console look for it.

   Three layouts, all around a centre (cx, cy):
     full  options evenly round a circle, the first straight up
     arc   a half-bloom that opens toward empty space (dir, in degrees: 0 = right, 90 = down, 180 = left)
     hex   options take the six hex cells round the centre, then the next ring out; for hex grids, where
           the rosette and the grid are the same shape

   And one ranking: rank(candidates, current) picks candidates by how close their shape is to the
   current one and, when it has only a few places to fill, by how unlike each other they are (aspect first, then size; and, where the caller knows them, how densely drawn the part
   is and which sheet it came from), so whatever the bloom offers fits the slot and looks like it belongs.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../../shared/engine/bloom.js"></script>      → window.Bloom
*/
(function () {
  'use strict';

  const RAD = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Keep a bloom of radius r (plus its option size) inside a w × h box with some padding.
  function fitCentre(cx, cy, r, bounds) {
    if (!bounds) return [cx, cy];
    const pad = (bounds.pad ?? 8) + r + (bounds.node ?? 48) / 2;
    return [clamp(cx, pad, Math.max(pad, bounds.w - pad)), clamp(cy, pad, Math.max(pad, bounds.h - pad))];
  }

  // Positions for n options round (cx, cy).
  //   opts.mode   'full' | 'arc' | 'hex'          (default 'full')
  //   opts.radius ring radius in px               (default 88; hex uses opts.cell instead)
  //   opts.dir    arc only: the direction it opens toward, degrees (default 0, to the right)
  //   opts.span   arc only: how wide, degrees     (default 170)
  //   opts.cell   hex only: [w, h] of a flat-top hex cell (default [56, 48])
  //   opts.node   option size in px: the ring grows so neighbours never overlap
//   opts.bounds { w, h, pad, node }: shift the centre so the whole bloom stays inside
  // Returns { cx, cy, radius, points: [{ x, y, angle }], from, to }, angles in degrees (0 = right).
  function layout(n, cx, cy, opts = {}) {
    const mode = opts.mode || 'full';
    if (mode === 'hex') {
      const [w, h] = opts.cell || [56, 48];
      const dx = w * 0.75, dy = h / 2;
      const ring1 = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
      const ring2 = [[0, -4], [1, -3], [2, -2], [2, 0], [2, 2], [1, 3], [0, 4], [-1, 3], [-2, 2], [-2, 0], [-2, -2], [-1, -3]];
      const reach = (n > 6 ? 2 : 1) * Math.max(dx, h);
      [cx, cy] = fitCentre(cx, cy, reach, opts.bounds && Object.assign({ node: Math.max(w, h) }, opts.bounds));
      const cells = ring1.concat(ring2).slice(0, n);
      return { cx, cy, radius: reach, points: cells.map(([q, r]) => ({ x: cx + q * dx, y: cy + r * dy, angle: Math.atan2(r * dy, q * dx) / RAD })) };
    }
    let a0, step;
    if (mode === 'arc') {
      const span = opts.span ?? 170, dir = opts.dir ?? 0;
      a0 = dir - span / 2; step = n > 1 ? span / (n - 1) : 0;
      if (n === 1) a0 = dir;
    } else {
      a0 = -90; step = 360 / Math.max(1, n);
    }
    // Grow the ring until neighbouring options (opts.node px wide) don't touch.
    const node = opts.node ?? (opts.bounds && opts.bounds.node) ?? 0;
    const minR = node && n > 1 && step ? (node + 6) / (2 * Math.sin((Math.abs(step) * RAD) / 2)) : 0;
    const radius = Math.max(opts.radius ?? 88, minR);
    [cx, cy] = fitCentre(cx, cy, radius, opts.bounds);
    const points = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + i * step;
      points.push({ x: cx + radius * Math.cos(a * RAD), y: cy + radius * Math.sin(a * RAD), angle: a });
    }
    return { cx, cy, radius, points, from: a0, to: a0 + step * Math.max(0, n - 1) };
  }

  // Which way an arc should open: away from a body's centre (bx, by), or a fixed side.
  function awayFrom(cx, cy, bx, by) {
    if (Math.abs(cx - bx) < 1 && Math.abs(cy - by) < 1) return -90;
    return Math.atan2(cy - by, cx - bx) / RAD;
  }

  // Shape distance between two { w, h } boxes: aspect difference, then size difference (both in log space,
  // so twice as tall and half as tall count the same).
  function shapeDistance(a, b, opts = {}) {
    const wa = opts.aspect ?? 1, ws = opts.size ?? 0.4;
    const asp = Math.abs(Math.log((a.h || 1) / (a.w || 1)) - Math.log((b.h || 1) / (b.w || 1)));
    const size = Math.abs(Math.log(Math.max(a.w, a.h, 1) / Math.max(b.w, b.h, 1)));
    // two optional extras, used when both boxes carry them: how densely drawn the part is (ink: stroke
    // length over its size, so a filigree part doesn't replace a plain plate) and which sheet it came
    // from (family: parts drawn together look right together)
    const ink = a.ink && b.ink ? (opts.ink ?? 0.5) * Math.abs(Math.log(a.ink / b.ink)) : 0;
    const fam = a.family && b.family && a.family !== b.family ? (opts.family ?? 0.3) : 0;
    return wa * asp + ws * size + ink + fam;
  }

  // Dispersion, after Design Galleries (Marks et al., SIGGRAPH 1997): a bloom has room for a handful of options, and the nearest handful are
  // often near-twins of each other. So the options are drawn from a wider window of good fits (the closest room x (1 + 3 x spread) of them) and
  // chosen to be as unlike each other as that window allows: the closest fit first, then each time the one furthest (in the same shape
  // distance) from everything already chosen. They are returned closest first, so the ring still reads from the best fit round.
  //   scored  [{ c, d }] sorted by d (distance to the current part)     room  how many to offer     spread  0..1
  function disperse(scored, room, spread, box, opts) {
    const win = scored.slice(0, Math.min(scored.length, Math.ceil(room * (1 + 3 * spread)))), boxes = win.map((p) => box(p.c));
    const far = win.map(() => Infinity), used = win.map(() => false), out = [];
    let at = 0;
    for (let n = 0; n < room && n < win.length; n++) {
      used[at] = true; out.push(win[at]);
      let best = -1, bd = -1;
      for (let i = 0; i < win.length; i++) { if (used[i]) continue; const d = shapeDistance(boxes[at], boxes[i], opts); if (d < far[i]) far[i] = d; if (far[i] > bd + 1e-12) { bd = far[i]; best = i; } }   // ties go to the closer fit (the earlier one)
      if (best < 0) break; at = best;
    }
    return out.sort((p, q) => p.d - q.d);
  }

  // Order candidates by shape distance to `current`.
  //   opts.box(item)  → { w, h }   (default: the item itself)
  //   opts.accept(item) → bool     (filter, e.g. same side)
  //   opts.limit       how many to return (default all)
  //   opts.keep        ids to keep at the front in this order, e.g. the original part (opts.id gives an item's id)
  //   opts.aspect, opts.size: weights for shapeDistance
  //   opts.spread      0..1: how far past the nearest `limit` to look for options that differ from each other (default 0.5 with a limit; 0: the nearest only)
  function rank(candidates, current, opts = {}) {
    const box = opts.box || ((x) => x), id = opts.id || ((x) => x.id);
    const cur = box(current), curId = id(current);
    const keep = (opts.keep || []).filter((k) => k != null && k !== curId);
    const pool = candidates.filter((c) => id(c) !== curId && !keep.includes(id(c)) && (!opts.accept || opts.accept(c)));
    const scored = pool.map((c) => ({ c, d: shapeDistance(cur, box(c), opts) })).sort((p, q) => p.d - q.d);
    const front = keep.map((k) => candidates.find((c) => id(c) === k)).filter(Boolean);
    const room = opts.limit ? Math.max(0, opts.limit - front.length) : scored.length, sp = opts.spread ?? (opts.limit ? 0.5 : 0);
    const picked = sp > 0 && room > 1 && scored.length > room ? disperse(scored, room, sp, box, opts) : scored;
    const out = front.concat(picked.map((p) => p.c));
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  window.Bloom = { layout, awayFrom, shapeDistance, rank, disperse, fitCentre };
})();
