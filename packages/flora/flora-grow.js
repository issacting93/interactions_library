/* Plants grown by rule. Each one comes out as a kit plant (the same record as window.KitPlants holds), so EcologyFlora stands it,
   sways it, puts it on the food chain and EcologyRender.lines draws it, with nothing new in the renderer.

   A recipe is data: { method, seed, ...numbers, key, name, kind, role, eco }. Five methods:
     lsystem      a string rewritten by rules, then walked by a turtle (Lindenmayer; Prusinkiewicz and Lindenmayer 1990)
     colonize     branches grow toward points scattered in a crown and use them up (Runions, Lane, Prusinkiewicz 2007)
     phyllotaxis  one leaf every 137.5 degrees (Vogel 1979): a floor rosette, a head on a stalk, or a spiral of leaves up a stem
     branching    stems that bear stems, each level with its own numbers (Honda 1971; Weber and Penn 1995; ez-tree)
     tuft         one drawn shape repeated, each copy with its own lean, height and turn: grass
   What they draw with is the kit: stems are stacked stem pieces, leaves and heads are kit parts (window.KitPlantParts,
   written by world/forges/fish-tool/plant-parts.py). A grown tree's limbs are its only lines that are not a kit drawing.

     const def = FloraGrow.grow(recipe)          -> { key, name, kind, eco, kit, wide, tall, segs, lines, frame, still, leafLine, limbs, recipe }   (leafLine: 1 for a leaf's line, 0 for wood)
     FloraGrow.add(flora, def)                   makes it plantable: EcologyFlora.plant(flora, def.key, x, y)
     FloraGrow.PRESETS                           recipes to start from; FloraGrow.KNOBS[method]: the numbers worth turning

   Depth. A hand-composed plant is flat: lines [x, y, ...] in thousandths of its height. A grown one's lines are each drawn in a plane
   of their own, anywhere in space: def.frame holds nine numbers a line (where the plane's origin is, the direction its x runs, the
   direction its y runs), and the line's points are x, y in that plane. So a kit part stays a flat drawing, but a leaf can lie level,
   a petal can cup, and a stem piece can be drawn twice, crossed, so it is never seen edge on.
   def.still marks the plain lines (a tree's limbs), which must stay joined: they bend with the plant but do not quiver on their own.
   def.limbs is each stem's centre line and thickness, for EcologyFlora.solids to make solid.
   Lines are in the order they grew (stem first), so showing the first part of the list is the plant part grown.

   Shapes. Besides the kit's parts there are a few drawn here (DRAWN, ids starting "D:"): grass blades, a leaf, a seed head, a needle
   spray, a bamboo joint, bark, a cactus rib. They are a dozen segments each, for plants that repeat one shape hundreds of times. */
(function () {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180, GOLD = 137.508 * DEG;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- a kit part, laid along its own length: a from its root (0) to its tip (1), b across ----
  const shaped = {};
  // shapes drawn here, already laid along their length: [a, b, a, b, ...] a line. fit: its width is ±1 and is made the stem's thickness
  const grass = (curve, w, kink) => { const n = 6, up = [], dn = []; for (let i = 0; i <= n; i++) { const t = i / n, c = curve * t * t - (kink && t > 0.55 ? kink * (t - 0.55) : 0), h = w * Math.pow(1 - t, 0.6); up.push(t, c + h); dn.unshift(t, c - h); } return [up.concat(dn)]; };
  const lance = (curve, w) => { const n = 6, up = [], dn = [], mid = []; for (let i = 0; i <= n; i++) { const t = i / n, c = curve * t * t, h = w * Math.sin(Math.PI * Math.pow(t, 0.7)); up.push(t, c + h); dn.unshift(t, c - h); if (i % 3 === 0) mid.push(t, c); } return [up.concat(dn), mid]; };
  // closed outlines, so a leaf is filled as well as drawn: a ring of n points round (cx, cy), rx along, ry across, starting from angle a0
  const ring = (cx, cy, rx, ry, n, a0 = Math.PI) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + i / n * TAU; o.push(+(cx + Math.cos(a) * rx).toFixed(3), +(cy + Math.sin(a) * ry).toFixed(3)); } return o; };
  // a lobe from a centre out round a circle and back to it (a fan from the centre fills it)
  const lobe = (cx, cy, a, r, d) => { const ox = cx + Math.cos(a) * d, oy = cy + Math.sin(a) * d, o = [cx, cy]; for (let i = 0; i <= 10; i++) { const t = a - 1.9 + i / 10 * 3.8; o.push(+(ox + Math.cos(t) * r).toFixed(3), +(oy + Math.sin(t) * r).toFixed(3)); } o.push(cx, cy); return o; };
  const DRAWN = {
    'D:blade-a': { lines: grass(0.06, 0.032) }, 'D:blade-b': { lines: grass(0.34, 0.03) }, 'D:blade-c': { lines: grass(0.75, 0.026) }, 'D:blade-d': { lines: grass(0.3, 0.03, 0.9) },
    'D:leaf': { lines: lance(0.1, 0.13) }, 'D:twig': { lines: [[0, 0, 1, 0]] },
    'D:seed': { lines: [[0, 0, 0.5, 0.02, 1, 0.09]].concat([0.55, 0.63, 0.71, 0.79, 0.87, 0.95].map((t, i) => [t, 0.03 + (t - 0.5) * 0.12, t + 0.06, 0.03 + (t - 0.5) * 0.12 + (i % 2 ? 0.05 : -0.05)])) },
    'D:leaflet': { lines: [[0, 0, 0.35, 0.13, 0.75, 0.1, 1, 0.04, 0.7, -0.07, 0.3, -0.1, 0, 0]] },
    'D:spray': { lines: [[0, 0, 1, 0]].concat([0.12, 0.3, 0.48, 0.66, 0.84].flatMap((t) => [[t, 0, t + 0.08, 0.17 * (1 - 0.55 * t)], [t, 0, t + 0.08, -0.17 * (1 - 0.55 * t)]])) },
    // the understory clump: a round leaf on a long stalk, a clover's three lobes, a five-petalled flower, a berry
    'D:round': { lines: [[0, 0, 0.46, 0.01], ring(0.72, 0, 0.27, 0.25, 16), [0.46, 0, 0.97, 0]] },
    'D:heart': { lines: [[0, 0, 0.5, 0], [0.5, 0, 0.56, 0.12, 0.7, 0.22, 0.86, 0.18, 0.97, 0.07, 1, 0, 0.97, -0.07, 0.86, -0.18, 0.7, -0.22, 0.56, -0.12, 0.5, 0], [0.5, 0, 0.95, 0]] },
    'D:clover': { lines: [[0, 0, 0.66, 0]].concat([-1.75, 0.15, 1.95].map((a) => lobe(0.7, 0, a, 0.13, 0.12))) },
    'D:flower': { lines: [0, 1, 2, 3, 4].map((i) => lobe(0.5, 0, i / 5 * TAU, 0.17, 0.19)).concat([ring(0.5, 0, 0.09, 0.09, 8)]) },
    'D:berry': { lines: [ring(0.5, 0, 0.42, 0.38, 12), [0.08, 0, 0, 0.18], [0.08, 0, 0, -0.18]] },
    'D:culm': { fit: true, lines: [[0, -1, 1, -0.94], [0, 1, 1, 0.94], [0, -1.25, 0, 1.25], [0.03, -1.1, 0.03, 1.1]] },
    'D:bark': { fit: true, lines: [[0, -1, 1, -1], [0, 1, 1, 1], [0.05, -0.5, 0.4, -0.38, 0.95, -0.55], [0.1, 0.1, 0.55, -0.02, 0.9, 0.12], [0, 0.55, 0.5, 0.62, 0.8, 0.5]] },
    'D:cactus': { fit: true, lines: [[0, -1, 0.5, -1.06, 1, -1], [0, 1, 0.5, 1.06, 1, 1], [0, -0.4, 1, -0.4], [0, 0.4, 1, 0.4], [0.25, -1.03, 0.3, -1.35], [0.25, -1.03, 0.18, -1.3], [0.7, -1.03, 0.75, -1.35], [0.7, -1.03, 0.63, -1.3], [0.25, 1.03, 0.3, 1.35], [0.25, 1.03, 0.18, 1.3], [0.7, 1.03, 0.75, 1.35], [0.7, 1.03, 0.63, 1.3]] },
  };
  function shape(id) {
    if (shaped[id]) return shaped[id];
    if (DRAWN[id]) { const lines = DRAWN[id].lines.map((l) => Float32Array.from(l)); return (shaped[id] = { lines, fit: !!DRAWN[id].fit, drawn: true, segs: lines.reduce((n, l) => n + l.length / 2 - 1, 0) }); }
    const P = (window.KitPlantParts || {})[id]; if (!P) throw new Error('FloraGrow: no kit part ' + id);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const pts = [];
    for (const a of P.lines) for (let j = 0; j < a.length; j += 2) { pts.push(a[j], a[j + 1]); x0 = Math.min(x0, a[j]); x1 = Math.max(x1, a[j]); y0 = Math.min(y0, a[j + 1]); y1 = Math.max(y1, a[j + 1]); }
    let rx, ry, tx, ty;
    if (P.side === 'center') { rx = 0; ry = y1; tx = 0; ty = y0; }       // a centre part grows up from the middle of its foot
    else {                                                                // a side part: its two farthest points; the root is the one nearer the centre line
      let best = -1, a = 0, b = 0; const n = pts.length / 2, st = Math.max(1, Math.floor(n / 160));
      for (let i = 0; i < n; i += st) for (let j = i + st; j < n; j += st) { const d = (pts[i * 2] - pts[j * 2]) ** 2 + (pts[i * 2 + 1] - pts[j * 2 + 1]) ** 2; if (d > best) { best = d; a = i; b = j; } }
      if (pts[a * 2] < pts[b * 2]) { const t = a; a = b; b = t; }
      rx = pts[a * 2]; ry = pts[a * 2 + 1]; tx = pts[b * 2]; ty = pts[b * 2 + 1];
    }
    const len = Math.hypot(tx - rx, ty - ry) || 1, dx = (tx - rx) / len, dy = (ty - ry) / len;
    const lines = P.lines.map((l) => { const o = new Float32Array(l.length); for (let j = 0; j < l.length; j += 2) { const px = l[j] - rx, py = l[j + 1] - ry; o[j] = (px * dx + py * dy) / len; o[j + 1] = (px * -dy + py * dx) / len; } return o; });
    return (shaped[id] = { lines, segs: lines.reduce((s, l) => s + l.length / 2 - 1, 0), slim: (P.side === 'center' ? P.w : Math.min(P.w, P.h)) / len });
  }

  // ---- what a method draws into. A place is { x, d, z }: across, back, up. A direction is [x, d, z] ----
  // from a plane's angle round the upright (phi), a heading in it (th up from level) and a roll about that heading: the heading, and what is across it
  function axes(phi, th, roll) { const c = Math.cos(th), s = Math.sin(th), cp = Math.cos(phi), sp = Math.sin(phi), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
    return [[c * cp, c * sp, s], [-s * cp * cr - sp * sr, -s * sp * cr + cp * sr, c * cr]]; }
  function builder() {
    const L = [], M = [], used = {};
    const B = {
      // a shape: its root at O, its length along H, its width along A; side -1 mirrors it; rank: when it grew; r: a stem's thickness, for a shape that fits it
      put(id, O, H, A, len, side, rank, r) { const S = shape(id), m = side < 0 ? -1 : 1, bw = S.fit && r ? r * 1.12 : len;      // a fitted shape stands just proud of the solid stem, so its edges show if (!S.drawn) used[id] = 1;
        for (const l of S.lines) { const o = new Array(l.length); for (let j = 0; j < l.length; j += 2) { o[j] = l[j] * len; o[j + 1] = l[j + 1] * bw * m; } L.push({ p: o, f: [O.x, O.d, O.z, H[0], H[1], H[2], A[0], A[1], A[2]], r: rank, id }); } },
      // the same, by angles: in the upright plane at phi, pointing th up from level, rolled about its own length
      part(id, at, phi, th, len, side, rank, roll, r) { const [H, A] = axes(phi, th, roll); B.put(id, at, H, A, len, side, rank, r); },
      // a stem piece drawn twice, crossed, so it reads from every side
      cross(id, at, phi, th, len, rank, r) { B.part(id, at, phi, th, len, 1, rank, 0, r); B.part(id, at, phi, th, len, 1, rank, Math.PI / 2, r); },
      // a leaf to each side of a stem heading (phi, th): the pair's own plane is rolled about the stem, so roll 90 degrees lays them level
      pair(id, at, phi, th, roll, la, len, rank) { const [H, A] = axes(phi, th, roll), c = Math.cos(la), s = Math.sin(la);
        for (const g of [1, -1]) B.put(id, at, [H[0] * c + g * A[0] * s, H[1] * c + g * A[1] * s, H[2] * c + g * A[2] * s], [A[0] * c - g * H[0] * s, A[1] * c - g * H[1] * s, A[2] * c - g * H[2] * s], len, g, rank); },
      // a plain line: points [u, z, ...] in the upright plane through the place (u along the plane from it, z up from the ground)
      stroke(pts, at, phi, rank) { L.push({ p: Array.from(pts), f: [at.x, at.d, 0, Math.cos(phi), Math.sin(phi), 0, 0, 0, 1], r: rank, still: 1 }); },
      // from a place, a step of len in the plane phi at th up from level
      step: (at, phi, th, len) => ({ x: at.x + Math.cos(th) * Math.cos(phi) * len, d: at.d + Math.cos(th) * Math.sin(phi) * len, z: at.z + Math.sin(th) * len }),
      // a limb to be made solid: pts [{ x, d, z, r }, ...] from its foot to its tip, r its thickness there
      limb(pts, rank) { if (pts.length > 1) M.push({ pts, r: rank }); },
      // a line that is not part of the plant (a trellis bar): drawn, never made solid, never hidden
      frame(pts, at, phi) { B.stroke(pts, at, phi, -1); L[L.length - 1].still = 2; },
      lines: L, limbs: M, used,
    };
    return B;
  }
  // the record EcologyFlora reads. Upright plants: thousandths of their height, from the foot. Flat ones (a floor rosette): thousandths of their width, no frames
  function finish(B, recipe, flat) {
    const L = B.lines.slice().sort((a, b) => a.r - b.r); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, far = 0;
    const W = L.map((l) => { const f = l.f, o = new Float32Array(l.p.length / 2 * 3); for (let j = 0, q = 0; j < l.p.length; j += 2, q += 3) { const a = l.p[j], b = l.p[j + 1]; o[q] = f[0] + a * f[3] + b * f[6]; o[q + 1] = f[1] + a * f[4] + b * f[7]; o[q + 2] = f[2] + a * f[5] + b * f[8];
      x0 = Math.min(x0, o[q]); x1 = Math.max(x1, o[q]); y0 = Math.min(y0, o[q + 2]); y1 = Math.max(y1, o[q + 2]); far = Math.max(far, Math.hypot(o[q], o[q + 1])); } return o; });
    const k = 1000 / Math.max(1e-6, flat ? Math.max(x1 - x0, y1 - y0) : Math.max(y1 - y0, far * 0.6)),      // an upright plant is measured by its height, unless it lies so low that its width says more (fallen leaves)
       cx = flat ? (x0 + x1) / 2 : 0, base = flat ? (y0 + y1) / 2 : y0;
    // which shapes are this plant's leaves (and blades, heads, tips): whatever its recipe names as one. The rest is wood
    const leafy = new Set(), names = (o) => { for (const k of ['leaf', 'head', 'heart', 'tip', 'shapes', 'seedShape']) for (const v of [].concat(o[k] || [])) leafy.add(v); }; names(recipe); for (const V of recipe.levels || []) names(V);
    const lines = [], frame = [], still = [], ranks = [], role = [];
    L.forEach((l, i) => { const a = [], w = W[i];
      for (let j = 0, q = 0; j < l.p.length; j += 2, q += 3) { const x = Math.round(flat ? (w[q] - cx) * k : l.p[j] * k), y = Math.round(flat ? (w[q + 2] - base) * k : l.p[j + 1] * k); if (a.length < 2 || a[a.length - 2] !== x || a[a.length - 1] !== y) a.push(x, y); }
      if (a.length < 4) return; lines.push(a); still.push(l.still || 0); ranks.push(l.r); role.push(l.id && leafy.has(l.id) ? 1 : 0); const f = l.f; frame.push(f[0] * k, f[1] * k, (f[2] - base) * k, f[3], f[4], f[5], f[6], f[7], f[8]); });
    // limbs, in the same units: [x, depth, y, thickness, born] a point, born being how far through the growing (0 to 1) it appears
    const born = (r) => { let a = 0, b = ranks.length; while (a < b) { const m = (a + b) >> 1; if (ranks[m] < r) a = m + 1; else b = m; } return a / Math.max(1, ranks.length); };
    const limbs = flat ? [] : B.limbs.map((m) => { const o = new Float32Array(m.pts.length * 5); m.pts.forEach((p, i) => { o[i * 5] = (p.x - cx) * k; o[i * 5 + 1] = p.d * k; o[i * 5 + 2] = (p.z - base) * k; o[i * 5 + 3] = p.r * k; o[i * 5 + 4] = born(m.r + i * (m.pts.step || 0)); }); return o; });
    const eco = Object.assign({}, recipe.eco); if (flat) eco.flat = true;
    return { key: recipe.key, name: recipe.name || recipe.key, kind: recipe.kind || 'food', role: recipe.role || '', eco, kit: Object.keys(B.used).sort(), grown: recipe.method,
      wide: Math.round(flat ? (x1 - x0) * k : 2 * far * k), tall: Math.round((y1 - y0) * k), segs: lines.reduce((s, a) => s + a.length / 2 - 1, 0), lines, frame: flat ? null : new Float32Array(frame), still: still.some(Boolean) ? Uint8Array.from(still) : null, leafLine: Uint8Array.from(role), limbs: limbs.length ? limbs : null, recipe };
  }
  const pick = (v, R) => Array.isArray(v) ? v[Math.floor(R() * v.length) % v.length] : v;

  // ---- 1. L-system: rewrite a string by rules, then a turtle walks it ----
  //   F a stem piece forward    + - turn in its plane    / twist the plane round the upright (by o.twist)    [ ] a side shoot: remember, come back
  //   L a leaf pair (o.leaf)    l one leaf, on the side last turned to    K a head (o.head)    ! shorter from here    any other letter: a bud, drawn as nothing
  //   A rule is a string, or a list of [chance, string] of which one is drawn each time.
  function lsystem(o, R, B) {
    let s = o.axiom;
    for (let i = 0; i < o.n; i++) { let out = ''; for (const ch of s) { const r = o.rules[ch]; if (r == null) { out += ch; continue; }
      if (typeof r === 'string') { out += r; continue; } let u = R() * r.reduce((a, q) => a + q[0], 0), got = r[r.length - 1][1]; for (const q of r) { if ((u -= q[0]) <= 0) { got = q[1]; break; } } out += got; } s = out; if (s.length > 6000) break; }
    if (o.close) { let out = ''; for (const ch of s) out += o.rules[ch] != null ? o.close : ch; s = out; }      // the buds left at the end become a leaf pair or a head
    const ang = (o.angle || 25) * DEG, jit = (o.jitter ?? 0.15), stack = [];
    let T = { at: { x: 0, d: 0, z: 0 }, phi: 0, th: Math.PI / 2, len: 1, n: 0, side: 1 };
    for (const ch of s) {
      if (ch === 'F') { const len = T.len * (1 + (R() - 0.5) * jit), a0 = T.at, r = (o.radius ?? 0.11) * T.len; if (o.cross === false) B.part(pick(o.stem, R), T.at, T.phi, T.th, len * 1.06, 1, T.n); else B.cross(pick(o.stem, R), T.at, T.phi, T.th, len * 1.06, T.n); T.at = B.step(T.at, T.phi, T.th, len);
        B.limb([{ x: a0.x, d: a0.d, z: a0.z, r }, { x: T.at.x, d: T.at.d, z: T.at.z, r: r * 0.9 }], T.n); T.n += 1;
        T.th += (o.lean || 0) * DEG * Math.cos(T.th) + (R() - 0.5) * jit * 0.3; }                                   // lean: a side shoot bends up (+) or droops (-) as it goes
      else if (ch === '+' || ch === '-') { T.side = ch === '+' ? 1 : -1; T.th -= T.side * ang * (1 + (R() - 0.5) * jit); }
      else if (ch === '/') T.phi += (o.twist ?? 137.5) * DEG;
      else if (ch === '!') T.len *= o.shrink ?? 0.8;
      else if (ch === '[') { stack.push(Object.assign({}, T, { at: Object.assign({}, T.at) })); T.len *= o.shoot ?? 0.7; }
      else if (ch === ']') T = stack.pop();
      else if (ch === 'L' || ch === 'l') { const la = (o.leafAngle ?? 55) * DEG, len = T.len * (o.leafSize ?? 1.6), id = pick(o.leaf, R);
        if (ch === 'L') B.pair(id, T.at, T.phi, T.th, (o.leafRoll || 0) * DEG + (R() - 0.5) * 0.5, la, len, T.n + 0.5);
        else B.part(id, T.at, T.phi, T.th - la * T.side, len, T.side, T.n + 0.5, (o.leafRoll || 0) * DEG + (R() - 0.5) * 0.5); }      // one leaf, on the side the shoot last turned to
      else if (ch === 'K') B.cross(pick(o.head, R), T.at, T.phi, T.th, T.len * (o.headSize ?? 1.5), T.n + 1);
    }
  }

  // ---- 2. Space colonization: scatter points where the crown should be; every step each point pulls its nearest branch end toward it,
  //         and a point a branch has reached is used up. The limbs' thickness comes from what they carry (the pipe model) ----
  function colonize(o, R, B) {
    const H = 1, h0 = o.crownFrom ?? 0.35, rx = o.spread ?? 0.42, di = o.reach ?? 0.3, dk = o.kill ?? 0.07, st = o.step ?? 0.035, pts = [];
    const cz = (h0 + H) / 2, rz = (H - h0) / 2;
    for (let tries = 0; pts.length < (o.points || 260) && tries < 20000; tries++) {
      const x = (R() * 2 - 1), d = (R() * 2 - 1), z = (R() * 2 - 1), q = x * x + d * d + z * z; if (q > 1) continue; const t = (z + 1) / 2;
      if (o.crown === 'cone' && Math.hypot(x, d) > 1 - t) continue;                    // wide at the bottom, a point at the top
      if (o.crown === 'umbrella' && (q < 0.45 || z < -0.1)) continue;                  // a shell: the upper outside only
      if (o.crown === 'lean' && x < -0.2 + z * 0.3) continue;                          // blown to one side
      pts.push([x * rx, d * rx, cz + z * rz]);
    }
    const N = [{ p: [0, 0, 0], par: -1, kids: [] }]; const near = (a) => { let b = -1, bd = 1e9; for (let i = 0; i < N.length; i++) { const p = N[i].p, q = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2 + (p[2] - a[2]) ** 2; if (q < bd) { bd = q; b = i; } } return [b, Math.sqrt(bd)]; };
    const add = (par, p) => { N.push({ p, par, kids: [] }); N[par].kids.push(N.length - 1); return N.length - 1; };
    for (let i = 0, top = 0; i < 200; i++) { let m = 1e9; for (const a of pts) m = Math.min(m, Math.hypot(a[0] - N[top].p[0], a[1] - N[top].p[1], a[2] - N[top].p[2])); if (m < di) break; const p = N[top].p; top = add(top, [p[0] + (R() - 0.5) * st * (o.wander ?? 0.25), p[1] + (R() - 0.5) * st * (o.wander ?? 0.25), p[2] + st]); }
    for (let it = 0; it < 160 && pts.length && N.length < 2600; it++) {
      const pull = new Map(); for (const a of pts) { const [b, dist] = near(a); if (dist > di) continue; const p = N[b].p, v = pull.get(b) || [0, 0, 0]; v[0] += (a[0] - p[0]) / dist; v[1] += (a[1] - p[1]) / dist; v[2] += (a[2] - p[2]) / dist; pull.set(b, v); }
      if (!pull.size) break; let grew = 0;
      for (const [b, v] of pull) { v[2] += (o.lift ?? 0.2); const l = Math.hypot(v[0], v[1], v[2]) || 1, p = N[b].p, q = [p[0] + v[0] / l * st, p[1] + v[1] / l * st, p[2] + v[2] / l * st];
        if (N[b].kids.some((k) => Math.hypot(N[k].p[0] - q[0], N[k].p[1] - q[1], N[k].p[2] - q[2]) < st * 0.3)) continue; add(b, q); grew++; }
      if (!grew) break;
      for (let i = pts.length - 1; i >= 0; i--) if (near(pts[i])[1] < dk) pts.splice(i, 1);
    }
    // thickness: a tip is o.twig thick; a limb is as thick as what it carries, summed with the pipe exponent
    const e = o.pipe ?? 2.4, r0 = o.twig ?? 0.004; for (let i = N.length - 1; i >= 0; i--) { const n = N[i]; n.r = n.kids.length ? Math.pow(n.kids.reduce((s, k) => s + Math.pow(N[k].r, e), 0), 1 / e) : r0; n.w = n.kids.reduce((s, k) => s + N[k].w, 1); }
    // limbs: from each start, follow the heaviest child; the others start limbs of their own. Each limb is drawn in one upright plane
    const thin = o.thin ?? 0.007, todo = [{ i: 0, at: { x: 0, d: 0, z: 0 }, len: 0 }];
    while (todo.length) {
      const job = todo.pop(), chain = [job.i]; for (let c = job.i; N[c].kids.length;) { c = N[c].kids.reduce((a, k) => N[k].w > N[a].w ? k : a, N[c].kids[0]); chain.push(c); }
      const a = N[chain[0]].p, b = N[chain[chain.length - 1]].p, phi = Math.atan2(b[1] - a[1], b[0] - a[0]) || 0, cp = Math.cos(phi), sp = Math.sin(phi);
      const U = chain.map((c) => (N[c].p[0] - a[0]) * cp + (N[c].p[1] - a[1]) * sp), Z = chain.map((c) => job.at.z + N[c].p[2] - a[2]), at = job.at;
      const place = (j) => ({ x: at.x + U[j] * cp, d: at.d + U[j] * sp, z: Z[j] });
      for (let j = 0; j + 1 < chain.length; j += 4) {                          // in runs of four pieces, so it grows a run at a time
        const end = Math.min(chain.length - 1, j + 4), left = [], right = [], mid = []; let fat = true;
        for (let q = j; q <= end; q++) { const p0 = Math.max(0, q - 1), p1 = Math.min(chain.length - 1, q + 1), tx = U[p1] - U[p0], tz = Z[p1] - Z[p0], tl = Math.hypot(tx, tz) || 1, r = N[chain[q]].r;
          if (r < thin) fat = false; left.push(U[q] - tz / tl * r, Z[q] + tx / tl * r); right.push(U[q] + tz / tl * r, Z[q] - tx / tl * r); mid.push(U[q], Z[q]); }
        const rank = job.len + j; if (fat) { B.stroke(left, at, phi, rank); B.stroke(right, at, phi, rank); } else B.stroke(mid, at, phi, rank);
      }
      { const pts = chain.map((c, j) => Object.assign(place(j), { r: N[c].r })); pts.step = 1; B.limb(pts, job.len); }
      for (let j = 0; j < chain.length; j++) { const n = N[chain[j]], next = chain[j + 1];
        for (const k of n.kids) if (k !== next) todo.push({ i: k, at: place(j), len: job.len + j });
        const tip = !n.kids.length, bare = !tip && o.leafy && n.r < thin * 1.2 && R() < o.leafy;
        if (tip || bare) { const p0 = Math.max(0, j - 1), th = Math.atan2(Z[j] - Z[p0], U[j] - U[p0]), n2 = tip ? (o.leaves ?? 2) : 1;
          for (let q = 0; q < n2; q++) B.part(pick(o.leaf, R), place(j), phi + (R() - 0.5) * 2.2, th + (R() - 0.5) * 1.3, (o.leafSize ?? 0.085) * (0.75 + R() * 0.5), R() < 0.5 ? 1 : -1, job.len + j + 3, R() * Math.PI);
          if (tip && o.fruit && R() < o.fruit) B.part(pick(o.head, R), place(j), phi, -Math.PI / 2, (o.leafSize ?? 0.085) * 0.9, 1, job.len + j + 5); } }
    }
  }

  // ---- 3. Phyllotaxis: leaf n sits 137.5 degrees round from leaf n - 1 (Vogel). Three ways to stand it ----
  //   form 'floor'  a rosette lying on the ground, r = c * sqrt(n): a trap you walk onto
  //   form 'head'   the same disc face on, on a stalk
  //   form 'spiral' leaves up a short stem, each in its own upright plane: young and steep in the middle, old and low outside
  function phyllotaxis(o, R, B) {
    const n = o.count || 34, div = (o.divergence ?? 137.508) * DEG, org = { x: 0, d: 0, z: 0 };
    if (o.form === 'spiral') {
      const h = o.stem ?? 0.25;
      for (let i = 0; i < Math.ceil(h / 0.09); i++) B.cross(pick(o.stemPart || 'P704', R), { x: 0, d: 0, z: i * 0.09 }, 0, Math.PI / 2, 0.1, i * 0.1);
      for (let i = 0; i < n; i++) { const t = i / (n - 1 || 1), th = ((o.low ?? 8) + ((o.steep ?? 82) - (o.low ?? 8)) * Math.pow(t, o.open ?? 1.4)) * DEG, len = (o.leafSize ?? 0.8) * (1 - 0.55 * t) * (0.9 + R() * 0.2);
        B.part(pick(o.leaf, R), { x: 0, d: 0, z: h * (0.15 + 0.85 * t) }, i * div, th, len, i % 2 ? 1 : -1, 1 + i, (R() - 0.5) * (o.leafRoll ?? 60) * DEG); }
      if (o.head) B.cross(pick(o.head, R), { x: 0, d: 0, z: h }, 0, Math.PI / 2, o.headSize ?? 0.5, n + 2);
      return false;
    }
    const flat = o.form !== 'head', c = 1 / Math.sqrt(n); let top = org;
    if (!flat) { const segs = o.stalk ?? 7; let th = Math.PI / 2; for (let i = 0; i < segs; i++) { B.cross(pick(o.stemPart || 'P704', R), top, 0, th, 0.2 * 1.06, i * 0.2); top = B.step(top, 0, th, 0.2); th += (o.nod ?? 0.05) * (i - segs * 0.4); } }
    const r0 = o.core ?? 0.16;
    if (flat) {
      if (o.heart) B.part(pick(o.heart, R), { x: 0, d: 0, z: -r0 * 1.15 }, 0, Math.PI / 2, r0 * 2.3, 1, 2);
      for (let i = 1; i <= n; i++) { const a = i * div, r = r0 + (1 - r0) * c * Math.sqrt(i) * (o.radius ?? 0.5), t = i / n, len = (o.leafSize ?? 0.5) * (0.35 + 0.65 * Math.pow(t, o.open ?? 1)) * (0.92 + R() * 0.16);
        B.part(pick(o.leaf, R), { x: Math.cos(a) * r, d: 0, z: Math.sin(a) * r }, 0, a, len, i % 2 ? 1 : -1, 2 + t * 6); }
      return true;
    }
    // a head on a stalk: the disc leans back (tilt) and each petal lifts out of it (cup), more toward the middle, so the head is a bowl, not a plate
    const tl = (o.tilt ?? 35) * DEG, U = [1, 0, 0], V = [0, -Math.sin(tl), Math.cos(tl)], Nn = [0, Math.cos(tl), Math.sin(tl)];
    if (o.heart) for (const g of [0, 1]) B.put(pick(o.heart, R), { x: top.x, d: top.d - V[1] * r0 * 1.15, z: top.z - V[2] * r0 * 1.15 }, V, g ? Nn : U, r0 * 2.3, 1, 2);
    for (let i = 1; i <= n; i++) { const a = i * div, r = r0 + (1 - r0) * c * Math.sqrt(i) * (o.radius ?? 0.5), t = i / n, len = (o.leafSize ?? 0.5) * (0.35 + 0.65 * Math.pow(t, o.open ?? 1)) * (0.92 + R() * 0.16);
      const ca = Math.cos(a), sa = Math.sin(a), out = [ca * U[0] + sa * V[0], ca * U[1] + sa * V[1], ca * U[2] + sa * V[2]], side = [-sa * U[0] + ca * V[0], -sa * U[1] + ca * V[1], -sa * U[2] + ca * V[2]], cup = (o.cup ?? 40) * DEG * (1 - 0.6 * t), cc = Math.cos(cup), cs = Math.sin(cup);
      B.put(pick(o.leaf, R), { x: top.x + out[0] * r, d: top.d + out[1] * r, z: top.z + out[2] * r }, [out[0] * cc + Nn[0] * cs, out[1] * cc + Nn[1] * cs, out[2] * cc + Nn[2] * cs], side, len, i % 2 ? 1 : -1, 2 + t * 6); }
    return false;
  }

  // ---- 4. Branching by level: a stem bears the next level's stems, each level with its own count, angle, length and curve.
  //         Off an upright stem the children go round it 137.5 degrees apart; off a leaning one they fan to either side and lift.
  //         Three things after ez-tree (Daniel Greenheck, MIT), all of them stronger on a thin stem than a thick one:
  //           gnarl    each piece's heading is knocked a little off (level.gnarl, times o.gnarl)
  //           force    every piece turns toward a direction: o.force { x, d, z, strength }; a negative strength turns it away (down for a pine)
  //           trellis  every piece within reach turns toward the nearest bar of a grid: o.trellis { d, width, height, spacing, reach, strength, falloff } ----
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  // turn a toward b by ang (never past it); a negative ang turns it away
  function toward(a, b, ang) { const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), full = Math.acos(dot), t = norm([b[0] - a[0] * dot, b[1] - a[1] * dot, b[2] - a[2] * dot]);
    if (full < 1e-4 || Math.PI - full < 1e-4) return a; const g = ang > 0 ? Math.min(ang, full) : Math.max(ang, full - Math.PI + 0.05), c = Math.cos(g), sn = Math.sin(g); return norm([a[0] * c + t[0] * sn, a[1] * c + t[1] * sn, a[2] * c + t[2] * sn]); }
  function nearBar(T, p) { const h = T.height, w = T.width, sp = T.spacing, x = Math.max(-w / 2, Math.min(w / 2, p.x)), z = Math.max(0, Math.min(h, p.z)), d = T.d || 0;
    const bz = Math.max(0, Math.min(h, Math.round(z / sp) * sp)), bx = Math.max(-w / 2, Math.min(w / 2, Math.round((x + w / 2) / sp) * sp - w / 2)), A = [x, d, bz], Bp = [bx, d, z];
    const da = Math.hypot(A[0] - p.x, A[1] - p.d, A[2] - p.z), db = Math.hypot(Bp[0] - p.x, Bp[1] - p.d, Bp[2] - p.z); return da < db ? [A, da] : [Bp, db]; }
  function branching(o, R, B) {
    const LV = o.levels, R0 = o.radius ?? 0.032, F = o.force, T = o.trellis, G = o.gnarl ?? 1;
    if (T && T.show !== false) { const d0 = { x: 0, d: T.d || 0, z: 0 }; for (let z = 0; z <= T.height + 1e-6; z += T.spacing) B.frame([-T.width / 2, z, T.width / 2, z], d0, 0); for (let x = -T.width / 2; x <= T.width / 2 + 1e-6; x += T.spacing) B.frame([x, 0, x, T.height], d0, 0); }
    const stem = function (lv, at, dir, len, rank, full, rad, phi0) {
      const V = LV[lv], n = Math.max(1, Math.round(V.segs * Math.max(0.35, Math.min(1.2, len / full)))), sl = len / n, P = [], limb = []; let a = at, phi = phi0;
      for (let i = 0; i < n; i++) {
        const r = rad * (1 - (V.taper2 ?? 0.6) * i / n) * (1 + (V.flare || 0) * Math.exp(-i / n * 9)), thin = Math.min(6, Math.sqrt(R0 / r));
        if (Math.hypot(dir[0], dir[1]) > 0.18) phi = Math.atan2(dir[1], dir[0]);                          // the plane this piece is drawn in; an upright piece keeps the last one
        const u = dir[0] * Math.cos(phi) + dir[1] * Math.sin(phi), th = Math.atan2(dir[2], u);
        P.push({ at: a, dir, phi, th, r }); limb.push({ x: a.x, d: a.d, z: a.z, r });
        if (lv <= (o.crossTo ?? 0)) B.cross(pick(V.stem, R), a, phi, th, sl * 1.07, rank + i, r); else B.part(pick(V.stem, R), a, phi, th, sl * 1.07, 1, rank + i, 0, r); a = { x: a.x + dir[0] * sl, d: a.d + dir[1] * sl, z: a.z + dir[2] * sl };
        if (V.leaf && i >= (V.leafFrom ?? 0) * n) { const la = (V.leafAngle ?? 50) * DEG, ll = len * (V.leafSize ?? 0.3) * (V.leafTaper ? 1 - V.leafTaper * i / n : 1);
          if (V.whorl) for (let q = 0; q < V.whorl; q++) B.part(pick(V.leaf, R), a, q / V.whorl * TAU + i * 0.7, th - la + (R() - 0.5) * 0.2, ll * (0.85 + R() * 0.3), 1, rank + i + 0.5);      // a ring of them round the joint
          else B.pair(pick(V.leaf, R), a, phi, th, (V.leafRoll ?? 90) * DEG + (R() - 0.5) * 0.9, la, ll, rank + i + 0.5); }                                                // a pair, lying level unless leafRoll says otherwise
        if (V.curve) { const c = (V.curve * DEG / n); dir = toward(dir, [0, 0, 1], lv ? c : 0); if (!lv) dir = norm([dir[0] + Math.sin(-c), dir[1], dir[2]]); }      // a bough curls up (+) or droops (-); a trunk leans
        const g = (V.gnarl ?? V.wobble ?? 0.1) * G * thin * 0.5; if (g) dir = norm([dir[0] + (R() - 0.5) * g, dir[1] + (R() - 0.5) * g, dir[2] + (R() - 0.5) * g]);
        if (F && F.strength) dir = toward(dir, norm([F.x || 0, F.d || 0, F.z ?? 1]), Math.max(-0.5, Math.min(0.5, F.strength * thin * thin)));
        if (T) { const [q, dist] = nearBar(T, a); if (dist < T.reach && dist > 1e-4) dir = toward(dir, norm([q[0] - a.x, q[1] - a.d, q[2] - a.z]), Math.min(0.9, T.strength * Math.pow(1 - dist / T.reach, T.falloff ?? 1) * thin)); }
      }
      P.push({ at: a, dir, phi, th: P[n - 1].th, r: rad * (1 - (V.taper2 ?? 0.6)) }); limb.push({ x: a.x, d: a.d, z: a.z, r: P[n].r * (LV[lv + 1] ? 1 : 0.35) }); limb.step = 1; B.limb(limb, rank);
      if (V.tip) B.part(pick(V.tip, R), a, phi, P[n].th, len * (V.tipSize ?? 0.25), 1, rank + n + 1);
      const C = LV[lv + 1]; if (!C) return;
      const off = R() * TAU, from = C.from ?? 0.3;
      for (let j = 0; j < C.count; j++) { const f = from + (1 - from) * (j + 0.5 + (R() - 0.5) * 0.6) / C.count, g = Math.min(n - 1e-6, f * n), q = Math.floor(g), w = g - q, p0 = P[q], p1 = P[q + 1];
        const pos = { x: p0.at.x + (p1.at.x - p0.at.x) * w, d: p0.at.d + (p1.at.d - p0.at.d) * w, z: p0.at.z + (p1.at.z - p0.at.z) * w }, tf = (f - from) / (1 - from || 1);
        const cl = len * (C.ratio ?? 0.6) * (C.taper != null ? 1 - C.taper * tf : 1) * (0.85 + R() * 0.3), down = (C.down ?? 50) * DEG * (1 + (R() - 0.5) * 0.3) + (C.downTop != null ? (C.downTop - (C.down ?? 50)) * DEG * tf : 0);
        const cr = Math.min(p0.r * 0.75, rad * (C.thick ?? 0.5)) * (C.taper != null ? 1 - 0.5 * C.taper * tf : 1); let cd, cp;
        if (p0.dir[2] > 0.93) { const az = off + j * GOLD; cp = az; cd = norm([p0.dir[0] * Math.cos(down) + Math.cos(az) * Math.sin(down), p0.dir[1] * Math.cos(down) + Math.sin(az) * Math.sin(down), p0.dir[2] * Math.cos(down)]); }
        else { const sd = j % 2 ? 1 : -1, th = p0.th + (C.lift ?? 15) * DEG * (R() - 0.2); cp = p0.phi + sd * (C.fan ?? 45) * DEG * (0.7 + R() * 0.6); cd = [Math.cos(th) * Math.cos(cp), Math.cos(th) * Math.sin(cp), Math.sin(th)]; }
        stem(lv + 1, pos, cd, cl, rank + g + 1, len * (C.ratio ?? 0.6), cr, cp); }
    };
    // one stem, or a clump of them standing round a middle: o.clump { count, spread, small }
    const C = o.clump, n = C ? C.count : 1;
    for (let i = 0; i < n; i++) { const a = R() * TAU, rr = C ? Math.sqrt((i + 0.3) / n) * C.spread : 0, sc = C ? 1 - (C.small ?? 0.4) * R() : 1, ln = ((o.lean || 0) + (C ? rr / C.spread * (C.lean ?? 8) : 0)) * DEG, az = C ? a : 0;
      stem(0, { x: Math.cos(a) * rr, d: Math.sin(a) * rr, z: 0 }, norm([Math.sin(ln) * Math.cos(az), Math.sin(ln) * Math.sin(az), Math.cos(ln)]), (LV[0].len || 1) * sc, i * 3, LV[0].len || 1, R0 * (C ? 0.6 + 0.4 * sc : 1), az); }
  }

  // ---- 5. Repeat: one drawn shape, many times, each with its own lean, height, turn and roll. Grass is this and nothing else:
  //         a bunchgrass is blades from one crown (small spread, leaning out); a sod is the same blades over a patch (wide spread, any way) ----
  function tuft(o, R, B) {
    const n = o.count || 16, sp = o.spread ?? 0.08, lo = o.lean ? o.lean[0] : 4, hi = o.lean ? o.lean[1] : 38, low = o.short ?? 0.45, patch = sp > 0.3;
    for (let i = 0; i < n; i++) { const a = R() * TAU, rr = Math.sqrt(R()) * sp, at = { x: Math.cos(a) * rr, d: Math.sin(a) * rr, z: 0 }, out = patch ? R() * TAU : a + (R() - 0.5) * 1.4;
      const lean = (lo + (hi - lo) * Math.pow(R(), 1.3) * (patch ? 1 : 0.4 + 0.6 * rr / (sp || 1))) * DEG, len = (low + (1 - low) * R()) * (patch ? 0.5 + 0.5 * R() : 1);
      B.part(pick(o.shapes, R), at, out, Math.PI / 2 - lean, len, -1, (patch ? rr * 8 : i * 0.4) + len, (R() - 0.5) * (o.roll ?? 70) * DEG); }
    for (let i = 0; i < (o.seeds || 0); i++) { const a = R() * TAU, rr = Math.sqrt(R()) * sp * 0.6; B.part(o.seedShape || 'D:seed', { x: Math.cos(a) * rr, d: Math.sin(a) * rr, z: 0 }, a, Math.PI / 2 - (3 + R() * 10) * DEG, 1.1 + R() * 0.25, R() < 0.5 ? 1 : -1, n + i, R() * 3); }
  }

  const METHODS = { lsystem, colonize, phyllotaxis, branching, tuft };
  function grow(recipe) { const R = rng((recipe.seed || 1) * 2654435761), B = builder(), flat = METHODS[recipe.method](recipe, R, B) === true; return finish(B, recipe, flat); }
  function add(flora, def) { flora.defs[def.key] = def; return def; }

  // ---- recipes to start from. kind and eco are what EcologyFlora reads, as for the hand-composed plants ----
  const PRESETS = [
    { key: 'grown-fern', name: 'Rule fern', method: 'lsystem', kind: 'food', role: 'Five fronds arching out from one crown. Each is one rule applied over and over: a stem piece, a pair of sickles lying level, a shorter step.',
      axiom: '[+A]/[+A]/[+A]/[+A]/[+A]', rules: { A: 'FL!A' }, close: 'K', n: 7, angle: 22, twist: 72, shrink: 0.9, shoot: 1, leafAngle: 62, leafSize: 1.5, leafRoll: 90, headSize: 0.8, lean: -9, jitter: 0.12, cross: false, stem: 'P694', leaf: 'P290', head: 'P685', eco: { height: 1.3, bites: 6, regrow: 25, meal: 1 } },
    { key: 'grown-bush', name: 'Fork bush', method: 'lsystem', kind: 'food', role: 'Every bud becomes a stem with two side shoots and a new bud. Which of three rules a bud takes is drawn by chance, so no two are alike.',
      axiom: 'X', rules: { X: [[5, 'F[+X]/[-X]!FX'], [3, 'F[+X]!F/X'], [2, 'F/[-X]!FX']] }, close: 'L', n: 3, angle: 34, twist: 70, shrink: 0.85, shoot: 0.8, leafAngle: 38, leafSize: 1.9, lean: 5, jitter: 0.25, stem: ['P704', 'P694'], leaf: 'P663', head: 'P714', eco: { height: 1.8, bites: 8, regrow: 20, meal: 1 } },
    { key: 'grown-raceme', name: 'Whorl spike', method: 'lsystem', kind: 'chain', role: 'A stalk that puts out one flowered side shoot at each joint, each a turn of 137.5 degrees round from the last.',
      axiom: 'FFA', rules: { A: 'F/[+F!FK]A' }, close: 'K', n: 8, angle: 62, twist: 137.5, shrink: 0.9, shoot: 0.62, headSize: 2.2, lean: 9, jitter: 0.1, stem: 'P704', leaf: 'P663', head: ['P673', 'P714'], eco: { height: 2.2, trigger: 'meal', near: 2.5, bloom: 14, gives: 'spores' } },
    { key: 'grown-oak', name: 'Crown oak', method: 'colonize', kind: 'chain', role: 'Limbs grown toward points scattered through a round crown, each point used up as a limb reaches it. A walker under it shakes leaves loose.',
      crown: 'round', points: 650, spread: 0.46, crownFrom: 0.3, reach: 0.2, kill: 0.045, step: 0.026, lift: 0.04, leaves: 1, leafSize: 0.09, leafy: 0.05, leaf: 'P663', head: 'P717', fruit: 0, eco: { height: 3.4, trigger: 'walker', near: 1.6, bloom: 20, gives: 'litter', cover: true, tree: true } },
    { key: 'grown-umbrella', name: 'Shade thorn', method: 'colonize', kind: 'chain', role: 'The same growth with the points only in the upper outside of the crown, so the limbs run out bare and leaf at the rim.',
      crown: 'umbrella', points: 380, spread: 0.6, crownFrom: 0.45, reach: 0.4, kill: 0.055, step: 0.03, lift: 0.03, leaves: 2, leafSize: 0.075, leafy: 0, leaf: 'P183', head: 'P717', fruit: 0.25, eco: { height: 3.0, trigger: 'walker', near: 1.8, bloom: 20, gives: 'litter', cover: true, tree: true } },
    { key: 'grown-cypress', name: 'Spire cypress', method: 'colonize', kind: 'food', role: 'The points in a cone: wide low down, a point at the top.',
      crown: 'cone', points: 520, spread: 0.3, crownFrom: 0.12, reach: 0.2, kill: 0.04, step: 0.025, lift: 0.3, leaves: 1, leafSize: 0.07, leafy: 0.1, leaf: 'P663', head: 'P717', fruit: 0, eco: { height: 3.6, bites: 10, regrow: 30, meal: 1, tree: true } },
    { key: 'grown-sundew', name: 'Floor sundew', method: 'phyllotaxis', kind: 'trapper', role: 'A rosette on the ground, one blade every 137.5 degrees, longer the further out. What walks onto it, it closes over.',
      form: 'floor', count: 34, divergence: 137.5, radius: 0.5, leafSize: 0.5, open: 1, core: 0.16, leaf: 'P183', heart: 'P707', eco: { size: 2.4, height: 0.3, reach: 0.9, hold: 6, digest: 9, jaw: 0.6, ground: true } },
    { key: 'grown-sunhead', name: 'Disc bloom', method: 'phyllotaxis', kind: 'chain', role: 'The same spiral face on, on a nodding stalk. It opens when something has eaten close by.',
      form: 'head', count: 26, divergence: 137.5, radius: 0.42, leafSize: 0.62, open: 0.6, core: 0.2, tilt: 38, cup: 42, stalk: 8, nod: 0.03, leaf: 'P183', heart: 'P707', stemPart: 'P704', eco: { height: 2.0, trigger: 'meal', near: 2.5, bloom: 18, gives: 'fruit' } },
    { key: 'grown-agave', name: 'Sickle agave', method: 'phyllotaxis', kind: 'trapper', role: 'Blades up a short stem, each standing in its own upright plane: steep in the middle, low and long at the outside.',
      form: 'spiral', count: 17, divergence: 137.5, stem: 0.22, leafSize: 0.8, low: 6, steep: 84, open: 1.5, leaf: 'P290', head: 'P714', headSize: 0.28, stemPart: 'P676', eco: { height: 1.5, reach: 0.8, hold: 7, digest: 8, jaw: 0.55, air: true } },
    { key: 'grown-pine', name: 'Tier pine', method: 'branching', kind: 'food', role: 'A straight trunk, boughs round it in turn, shorter toward the top, each bough with needles to either side.',
      levels: [{ len: 1, segs: 9, stem: 'P694', wobble: 0.04, tip: 'P685', tipSize: 0.1 }, { count: 16, from: 0.22, ratio: 0.42, taper: 0.78, down: 80, downTop: 48, segs: 6, stem: 'P704', leaf: 'P663', leafSize: 0.22, leafAngle: 42, gnarl: 0.08 }], force: { x: 0, d: 0, z: 1, strength: -0.012 }, gnarl: 1, eco: { height: 3.6, bites: 10, regrow: 30, meal: 1, tree: true } },
    { key: 'grown-palm', name: 'Frond palm', method: 'branching', kind: 'chain', role: 'A leaning trunk with all its fronds at the top; each frond droops and carries leaflets that shorten toward its tip.',
      lean: 4, gnarl: 1, force: { x: 1, d: 0, z: 0, strength: 0.02 }, levels: [{ len: 1, segs: 10, stem: 'P676', gnarl: 0.05 }, { count: 9, from: 0.97, ratio: 0.5, down: 38, downTop: 110, segs: 7, curve: -70, stem: 'P700', leaf: 'P183', leafSize: 0.34, leafAngle: 62, leafTaper: 0.6, wobble: 0.06 }], eco: { height: 3.4, trigger: 'walker', near: 1.5, bloom: 20, gives: 'litter', cover: true, tree: true } },
    { key: 'grown-fork', name: 'Three-tier fork', method: 'branching', kind: 'chain', role: 'Three levels: a trunk, limbs, twigs. The fork oak drawn by hand, as numbers.',
      gnarl: 1, force: { x: 0, d: 0, z: 1, strength: 0.004 }, levels: [{ len: 1, segs: 5, stem: 'P680', wobble: 0.06 }, { count: 5, from: 0.5, ratio: 0.6, down: 46, segs: 4, curve: 18, stem: 'P694', wobble: 0.14 }, { count: 4, from: 0.35, ratio: 0.55, fan: 50, lift: 25, segs: 3, curve: 10, stem: 'P704', leaf: 'P663', leafSize: 0.45, leafFrom: 0.3, leafAngle: 48, tip: 'P663', tipSize: 0.5 }], eco: { height: 3.2, trigger: 'walker', near: 1.5, bloom: 20, gives: 'litter', cover: true, tree: true } },
    // ---- ten kinds of plant, by how each one grows (see the project note) ----
    { key: 'grown-grass', name: 'Tussock grass', method: 'tuft', kind: 'food', type: 'Grass', role: 'A bunchgrass: every blade comes from one crown at the ground and leans out. Four drawn blades, repeated; a few seed stalks stand above.',
      count: 26, spread: 0.07, lean: [3, 46], short: 0.4, roll: 80, seeds: 4, shapes: ['D:blade-a', 'D:blade-b', 'D:blade-b', 'D:blade-c', 'D:blade-d'], eco: { height: 0.9, bites: 8, regrow: 12, meal: 1 } },
    { key: 'grown-turf', name: 'Meadow patch', method: 'tuft', kind: 'food', type: 'Grass', role: 'A sod grass: the same blades over a patch of ground, leaning any way, taller toward the middle.',
      count: 70, spread: 1.6, lean: [2, 34], short: 0.35, roll: 90, seeds: 6, shapes: ['D:blade-a', 'D:blade-b', 'D:blade-c', 'D:blade-d'], eco: { height: 0.6, bites: 10, regrow: 10, meal: 1 } },
    { key: 'grown-swordfern', name: 'Sword fern', method: 'lsystem', kind: 'food', type: 'Fern', role: 'A crown of arching fronds, each a midrib with a drawn leaflet to either side, shorter toward the tip. The fern of the redwood floor.',
      axiom: '[+A]/[+A]/[+A]/[+A]/[+A]/[+A]', rules: { A: 'FL!A' }, close: 'L', n: 9, angle: 20, twist: 60, shrink: 0.9, shoot: 1, leafAngle: 68, leafSize: 1.6, leafRoll: 90, lean: -6, jitter: 0.18, cross: false, radius: 0.03, stem: 'D:twig', leaf: 'D:leaflet', head: 'D:leaflet', eco: { height: 1.1, bites: 6, regrow: 20, meal: 1 } },
    { key: 'grown-horsetail', name: 'Horsetail', method: 'branching', kind: 'food', type: 'Horsetail', role: 'Jointed upright stems in a clump, a ring of thin rays at every joint. The oldest plan here: it has looked like this since before there were trees.',
      clump: { count: 5, spread: 0.16, small: 0.45, lean: 6 }, gnarl: 0.5, radius: 0.012, crossTo: 0, levels: [{ len: 1, segs: 11, stem: 'D:culm', gnarl: 0.05, taper2: 0.55, leaf: 'D:twig', whorl: 7, leafSize: 0.2, leafAngle: 38, leafFrom: 0.15, leafTaper: 0.7, tip: 'P714', tipSize: 0.07 }], eco: { height: 1.4, bites: 6, regrow: 18, meal: 1 } },
    { key: 'grown-bamboo', name: 'Bamboo', method: 'branching', kind: 'food', type: 'Bamboo', role: 'A clump of jointed canes that hardly taper, thin leafy side shoots from the upper joints, the tops nodding over.',
      clump: { count: 6, spread: 0.2, small: 0.35, lean: 7 }, gnarl: 0.6, radius: 0.012, crossTo: 0, force: { x: 0, d: 0, z: 1, strength: -0.0022 },
      levels: [{ len: 1, segs: 12, stem: 'D:culm', gnarl: 0.04, taper2: 0.4 }, { count: 9, from: 0.4, ratio: 0.22, down: 52, segs: 4, stem: 'D:twig', leaf: 'D:leaf', leafSize: 0.5, leafAngle: 40, leafRoll: 70, gnarl: 0.3, thick: 0.25 }], eco: { height: 3.6, bites: 8, regrow: 25, meal: 1, tree: true } },
    { key: 'grown-redwood', name: 'Coast redwood', method: 'branching', kind: 'chain', type: 'Conifer', solid: true, role: 'A straight column with a flared foot, bare for its lower third, then short boughs that droop and carry flat sprays of needles. Tall for its width more than anything else.',
      gnarl: 0.5, radius: 0.03, crossTo: 0, force: { x: 0, d: 0, z: 1, strength: -0.01 },
      levels: [{ len: 1, segs: 14, stem: 'D:bark', gnarl: 0.02, taper2: 0.78, flare: 0.7 }, { count: 26, from: 0.46, ratio: 0.2, taper: 0.62, down: 82, downTop: 55, segs: 3, stem: 'D:twig', leaf: 'D:spray', leafSize: 0.62, leafAngle: 55, leafRoll: 90, gnarl: 0.12, thick: 0.16 }], eco: { height: 10, trigger: 'walker', near: 2, bloom: 20, gives: 'litter', cover: true, tree: true } },
    { key: 'grown-willow', name: 'Weeping willow', method: 'branching', kind: 'chain', type: 'Broadleaf', solid: true, role: 'A short trunk, limbs that rise, and long thin withes that the downward force bends over until they hang. Drawn leaves in pairs down each one.',
      gnarl: 1.2, radius: 0.035, crossTo: 0, force: { x: 0, d: 0, z: 1, strength: -0.035 },
      levels: [{ len: 0.42, segs: 4, stem: 'D:bark', gnarl: 0.08, taper2: 0.3, flare: 0.4 }, { count: 5, from: 0.55, ratio: 1.1, down: 38, segs: 6, stem: 'D:twig', gnarl: 0.1, thick: 0.6, taper2: 0.6 }, { count: 7, from: 0.25, ratio: 0.95, fan: 60, lift: 30, segs: 10, stem: 'D:twig', leaf: 'D:leaf', leafSize: 0.11, leafAngle: 35, leafRoll: 40, leafFrom: 0.15, gnarl: 0.05, thick: 0.18 }], eco: { height: 3.2, trigger: 'walker', near: 1.6, bloom: 20, gives: 'litter', cover: true, tree: true } },
    { key: 'grown-cactus', name: 'Column cactus', method: 'branching', kind: 'trapper', type: 'Cactus', solid: true, role: 'A thick ribbed column that barely tapers. A few arms leave it level and the upward force turns them to stand beside it.',
      gnarl: 0.3, radius: 0.085, crossTo: 1, force: { x: 0, d: 0, z: 1, strength: 0.45 },
      levels: [{ len: 1, segs: 7, stem: 'D:cactus', gnarl: 0.02, taper2: 0.12 }, { count: 3, from: 0.3, ratio: 0.55, taper: 0.5, down: 88, segs: 7, stem: 'D:cactus', gnarl: 0.04, thick: 0.72, taper2: 0.15 }], eco: { height: 2.6, reach: 0.7, hold: 6, digest: 9, jaw: 0.5, air: true, tree: true } },
    // ---- an autumn wood (after Zac's photographs, Nov 2026): dark forked trunks, fine twigs, a few leaves left on ----
    { key: 'wood-tree', name: 'Wood tree', method: 'colonize', kind: 'chain', solid: true, role: 'A tall trunk that forks into rising limbs and ends in fine twigs, most of its leaves gone. Limbs grown toward points in a tall crown.',
      crown: 'round', points: 520, spread: 0.3, crownFrom: 0.3, reach: 0.2, kill: 0.042, step: 0.024, lift: 0.3, wander: 0.9, twig: 0.0026, pipe: 2.25, leaves: 2, leafSize: 0.024, leafy: 0.3, leaf: 'D:leaflet', head: 'D:leaflet', fruit: 0, eco: { height: 8, trigger: 'walker', near: 1.6, bloom: 20, gives: 'litter', cover: true, tree: true } },
    { key: 'wood-sapling', name: 'Sapling', method: 'branching', kind: 'food', role: 'A thin crooked stem with a few side shoots and leaves still on: the understory.',
      gnarl: 1.6, radius: 0.011, crossTo: -1, force: { x: 0, d: 0, z: 1, strength: 0.004 },
      levels: [{ len: 1, segs: 10, stem: 'D:twig', gnarl: 0.22, taper2: 0.7 }, { count: 8, from: 0.3, ratio: 0.42, taper: 0.4, down: 52, segs: 5, stem: 'D:twig', leaf: 'D:leaflet', leafSize: 0.24, leafAngle: 42, leafRoll: 60, leafFrom: 0.2, gnarl: 0.3, thick: 0.4 }], eco: { height: 3.4, bites: 6, regrow: 20, meal: 1, tree: true } },
    // the understory clump (after a Blender study by wattmaggle): ferns arching out over round leaves, clover, and small flowers and berries
    { key: 'clump-fern', name: 'Arching fern', method: 'lsystem', kind: 'food', role: 'Long fronds from one crown bending out and down to the ground, the leaflets drawn and filled.',
      axiom: '[+A]/[+A]/[+A]/[+A]/[+A]/[+A]/[+A]', rules: { A: 'FL!A' }, close: 'L', n: 13, angle: 46, twist: 51, shrink: 0.94, shoot: 1, leafAngle: 70, leafSize: 1.5, leafRoll: 90, lean: -5, jitter: 0.16, cross: false, radius: 0.02, stem: 'D:twig', leaf: 'D:leaflet', head: 'D:leaflet', eco: { height: 0.8, bites: 6, regrow: 20, meal: 1 } },
    { key: 'clump-round', name: 'Round leaves', method: 'tuft', kind: 'food', role: 'A rosette of round leaves, each on its own long stalk, leaning out at any angle.',
      count: 11, spread: 0.06, lean: [18, 72], short: 0.55, roll: 70, seeds: 0, shapes: ['D:round', 'D:round', 'D:heart'], eco: { height: 0.55, bites: 6, regrow: 14, meal: 1 } },
    { key: 'clump-clover', name: 'Clover', method: 'tuft', kind: 'food', role: 'Three-lobed leaves on thin stalks over a patch, almost level at the edge.',
      count: 22, spread: 0.5, lean: [10, 60], short: 0.5, roll: 60, seeds: 0, shapes: ['D:clover'], eco: { height: 0.3, bites: 4, regrow: 10, meal: 1 } },
    { key: 'clump-flower', name: 'Small flowers', method: 'branching', kind: 'food', role: 'A few thin stems from one root, a five-petalled flower at each tip.',
      clump: { count: 4, spread: 0.1, small: 0.55, lean: 16 }, gnarl: 1.2, radius: 0.008, crossTo: -1,
      levels: [{ len: 1, segs: 5, stem: 'D:twig', gnarl: 0.3, taper2: 0.6, tip: 'D:flower', tipSize: 0.42 }], eco: { height: 0.7, bites: 4, regrow: 12, meal: 1 } },
    { key: 'clump-berry', name: 'Berries', method: 'branching', kind: 'food', role: 'Short arching stems, a berry hanging at each tip.',
      clump: { count: 5, spread: 0.12, small: 0.5, lean: 40 }, gnarl: 1.6, radius: 0.008, crossTo: -1,
      levels: [{ len: 1, segs: 5, stem: 'D:twig', gnarl: 0.5, taper2: 0.6, tip: 'D:berry', tipSize: 0.2 }], eco: { height: 0.45, bites: 4, regrow: 12, meal: 1 } },
    { key: 'wood-shrub', name: 'Shrub', method: 'branching', kind: 'food', role: 'A few stems from one root, bushy with leaves.',
      clump: { count: 5, spread: 0.12, small: 0.4, lean: 22 }, gnarl: 1.4, radius: 0.012, crossTo: -1,
      levels: [{ len: 1, segs: 6, stem: 'D:twig', gnarl: 0.25, taper2: 0.6 }, { count: 6, from: 0.25, ratio: 0.45, down: 48, segs: 4, stem: 'D:twig', leaf: 'D:leaflet', leafSize: 0.34, leafAngle: 45, leafRoll: 50, gnarl: 0.3, thick: 0.4 }], eco: { height: 1.3, bites: 6, regrow: 16, meal: 1 } },
    { key: 'wood-litter', name: 'Leaf litter', method: 'tuft', kind: 'food', role: 'Fallen leaves: the same drawn leaf lying almost flat, any way round.',
      count: 46, spread: 1.4, lean: [80, 89], short: 0.5, roll: 180, seeds: 0, shapes: ['D:leaflet'], eco: { height: 0.22, bites: 4, regrow: 30, meal: 1 } },
    { key: 'grown-vine', name: 'Trellis vine', method: 'branching', kind: 'food', role: 'One long stem and its side shoots, each piece turning toward the nearest bar of a grid within reach. Put towers and walls where the grid is and it climbs them.',
      lean: 14, gnarl: 1, radius: 0.02, trellis: { d: 0, width: 1.2, height: 1.5, spacing: 0.3, reach: 0.4, strength: 0.3, falloff: 1 }, force: { x: 0, d: 0, z: 1, strength: 0.02 },
      levels: [{ len: 2.0, segs: 30, stem: 'P704', gnarl: 0.3, taper2: 0.5 }, { count: 8, from: 0.15, ratio: 0.26, down: 60, fan: 70, lift: 30, segs: 8, stem: 'P700', leaf: 'P663', leafSize: 0.32, leafFrom: 0.2, leafAngle: 55, gnarl: 0.3, tip: 'P714', tipSize: 0.16 }], eco: { height: 2.4, bites: 8, regrow: 20, meal: 1 } },
    { key: 'grown-windswept', name: 'Wind thorn', method: 'branching', kind: 'chain', role: 'The fork tree with a steady force from one side: the trunk holds, the limbs give a little, the twigs give most.',
      gnarl: 1.6, force: { x: 1, d: 0.2, z: 0.1, strength: 0.03 }, levels: [{ len: 1, segs: 6, stem: 'P680', gnarl: 0.1 }, { count: 6, from: 0.4, ratio: 0.62, down: 55, segs: 6, stem: 'P694', gnarl: 0.16 }, { count: 4, from: 0.3, ratio: 0.5, fan: 50, lift: 20, segs: 4, stem: 'P704', leaf: 'P663', leafSize: 0.42, leafFrom: 0.3, leafAngle: 48, tip: 'P663', tipSize: 0.5, gnarl: 0.2 }], eco: { height: 3.0, trigger: 'walker', near: 1.5, bloom: 20, gives: 'litter', cover: true, tree: true } },
  ];
  const KNOBS = {
    lsystem: [['n', 'Times applied', 2, 9, 1], ['angle', 'Turn', 10, 80, 1], ['twist', 'Twist', 0, 180, 0.5], ['shrink', 'Shorter each step', 0.6, 1, 0.01]],
    colonize: [['points', 'Points', 80, 900, 10], ['spread', 'Crown width', 0.2, 0.7, 0.01], ['reach', 'Pull from', 0.12, 0.5, 0.01], ['kill', 'Used up at', 0.03, 0.14, 0.005]],
    phyllotaxis: [['count', 'Leaves', 8, 60, 1], ['divergence', 'Turn each leaf', 90, 180, 0.1], ['leafSize', 'Leaf length', 0.2, 1.2, 0.01], ['open', 'Opening', 0.4, 2.5, 0.05]],
    tuft: [['count', 'Blades', 4, 140, 1], ['spread', 'Spread', 0.02, 2.4, 0.01], ['lean.1', 'Lean', 5, 85, 1], ['seeds', 'Seed stalks', 0, 16, 1]],
    branching: [['levels.1.count', 'Boughs', 2, 40, 1], ['levels.1.down', 'Angle from trunk', 15, 110, 1], ['gnarl', 'Gnarl', 0, 4, 0.05], ['force.strength', 'Force', -0.06, 0.06, 0.001], ['trellis.strength', 'Pull to trellis', 0, 1, 0.01]],
  };
  // a part drawn by hand (Flora Forge): lines in the shape's own space (0 at the foot, 1 at the tip, across from -0.5 to 0.5); a closed line fills.
  // Registered under its id, it is used like any built-in shape (a recipe's leaf, head, tip or shapes)
  function part(id, lines) { if (lines) DRAWN[id] = { lines }; else delete DRAWN[id]; delete shaped[id]; return id; }
  // the same recipe with a part put in every leaf place (leaf, head, a level's leaf or tip, a tuft's shapes); its stems stay as they are
  function swap(recipe, id, places) {
    const r = JSON.parse(JSON.stringify(recipe)), all = !places, want = (k) => all || places.includes(k);
    for (const k of ['leaf', 'head', 'tip']) if (r[k] && want(k)) r[k] = id;
    if (r.shapes && want('shapes')) r.shapes = r.shapes.map(() => id);
    for (const L of r.levels || []) for (const k of ['leaf', 'tip']) if (L[k] && want(k)) L[k] = id;
    return r;
  }
  window.FloraGrow = { grow, add, PRESETS, KNOBS, DRAWN, shape, rng, part, swap };
})();
