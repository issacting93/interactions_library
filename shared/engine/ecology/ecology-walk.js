/*
 * Ecology walk — CreatureWalk (shared/engine/generators/creature-walk.js) for the GPU creatures.
 *
 * The WebGL renderers (ecology-render.js, World Scene.html, route-scene.html) draw each species
 * from its baked geometry in ecology-species.js, where legs are already their own parts, one per
 * side ("…-leg-L" / "…-leg-R" in sp.ids). For a walking species this module:
 *
 *   - finds those legs: hip = the part's anchor, foot = its outline point furthest from the hip,
 *     cut into femur/tibia/tarsus at CreatureWalk.FRACS;
 *   - keeps a CreatureWalk walker per creature, its feet planted in tank coordinates, each leg on
 *     the spine frame at its anchor (the same frame the shader puts the part on);
 *   - writes, per leg, three band transforms (cos, sin, tx, ty) into the creature's spine-texture
 *     row, from column COL0, for the vertex shader to pose each vertex by its band.
 *
 * A renderer adds one column to its part texture (partCol(sp): slot+1, axis.x, axis.y, length;
 * zeros for non-legs), widens its spine rows to TEX_W, calls write() per creature, and inserts
 * GLSL (the LEG_GLSL helper) before its rigid-part branch. Species that never walk cost nothing:
 * write() leaves their flag texel at 0 and the shader keeps the old path.
 *
 *   EcologyWalk.isWalker(sp)              crawlers by default; EcologyWalk.walkers is a Set to edit
 *   EcologyWalk.legs(sp)                  -> [{ part, pair, side, joint, tip, u, L, lens, anchorY }] | null
 *   EcologyWalk.partTex(sp)               -> Float32Array, 5 texels per part (the 4 baked + leg column)
 *   EcologyWalk.write(data, row, f, sp, spine, sc, dt, params, K, BY0, LEN)
 *       params    walk settings, or (speciesKey) -> walk settings (e.g. from each species' rig)
 *       data/row  the Float32Array and float offset of this creature's spine row
 *       spine     (k) -> [x, y] spine point k on the tank plane, as the renderer wrote it
 *       sc        species units -> tank units (the renderer's prm.z)
 *   EcologyWalk.stepLegs(f, legs, spine, K, sc, BY0, LEN, dt, params) -> walker; bands(W, leg) -> 3 × [cos, sin, tx, ty]
 *       for a renderer with its own per-creature layout (route-scene.html)
 *   EcologyWalk.COL0, MAX_LEGS, TEX_EXTRA, LEG_GLSL
 *
 * Classic script. Depends on CreatureWalk.
 */
(function () {
  "use strict";
  const MAX_LEGS = 8, BANDS = 3;
  const COL0 = 24;                                   // first texel after K=20 spine + 4 param texels
  const TEX_EXTRA = MAX_LEGS * BANDS;                // texels a renderer adds to each spine row
  const walkers = new Set(["carapace-strider", "pincer", "plated-scavenger"]);
  const cache = new Map();
  const b64 = (s, T) => { if (!s) return new T(0); const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };
  // the baked part table: World Scene moves it to partTexData and reuses partTex for the GL texture
  const rawPT = (sp) => sp.partTexData || (Array.isArray(sp.partTex) || ArrayBuffer.isView(sp.partTex) ? sp.partTex : []);
  const baseKey = (k) => String(k).split("~")[0];

  function isWalker(sp) { return !!sp && walkers.has(baseKey(sp.key)) && !!legs(sp); }

  // geo: optional { lineV, fillV } when the drawing lives apart from the species record
  function legs(sp, geo) {
    if (!sp || !sp.ids) return null;
    if (cache.has(sp)) return cache.get(sp);
    if (geo) sp = { ...sp, lineV: geo.lineV, fillV: geo.fillV };
    const PT = rawPT(sp);
    const found = [];
    sp.ids.forEach((id, part) => { const m = /-(\d+)-legs?-([LR])$/.exec(id); if (m) found.push({ part, side: m[2] === "L" ? 0 : 1, n: +m[1] }); });
    if (!found.length) { cache.set(arguments[0], null); return null; }
    // foot = the vertex furthest from the hip, over the line (or fill) geometry
    const lineV = b64(sp.lineV, Float32Array), fillV = lineV.length ? null : b64(sp.fillV, Float32Array);
    const V = lineV.length ? lineV : fillV, st = lineV.length ? 5 : 3, pi = lineV.length ? 4 : 2;
    const out = [];
    const lefts = found.filter((g) => g.side === 0).sort((a, b) => a.n - b.n);
    for (const g of found) {
      const A = PT.slice(g.part * 16, g.part * 16 + 4), R = PT.slice(g.part * 16 + 8, g.part * 16 + 12);
      const J = [A[2], A[3]];
      let tip = null, bd = -1;
      for (let k = 0; k < V.length; k += st) {
        if (Math.round(V[k + pi]) !== g.part) continue;
        const d = Math.hypot(V[k] - J[0], V[k + 1] - J[1]);
        if (d > bd) { bd = d; tip = [V[k], V[k + 1]]; }
      }
      if (!tip || bd < 1) continue;
      const u = [(tip[0] - J[0]) / bd, (tip[1] - J[1]) / bd];
      // pair index: the left leg's order; a right leg takes the left leg nearest its height
      const pair = g.side === 0 ? lefts.indexOf(g) : lefts.reduce((b, l, i) => (Math.abs(PT[l.part * 16 + 3] - A[3]) < Math.abs(PT[lefts[b].part * 16 + 3] - A[3]) ? i : b), 0);
      out.push({ part: g.part, pair, side: g.side, joint: J, tip, u, L: bd, lens: window.CreatureWalk.FRACS.map((f) => f * bd), anchorY: R[3] });
    }
    const res = out.length ? out.slice(0, MAX_LEGS).map((l, slot) => ({ ...l, slot })) : null;
    cache.set(arguments[0], res);
    return res;
  }

  function partTex(sp) {
    const PT = rawPT(sp), n = sp.parts || 0, out = new Float32Array(n * 20);
    for (let i = 0; i < n; i++) for (let c = 0; c < 16; c++) out[i * 20 + c] = PT[i * 16 + c] || 0;
    for (const l of legs(sp) || []) out.set([l.slot + 1, l.u[0], l.u[1], l.L], l.part * 20 + 16);
    return out;
  }

  function makeWalker(spec) {
    const legs = spec.map((g) => {
      const cuts = [0, ...window.CreatureWalk.FRACS.reduce((a, f) => (a.push((a.length ? a[a.length - 1] : 0) + f * g.L), a), [])];
      return { bone: g.slot, i: g.pair, side: g.side, own: true, axis: 0, name: (g.side ? "R" : "L") + (g.pair + 1), lens: g.lens.slice(),
        hip: g.joint.slice(), home: g.tip.slice(), foot: g.tip.slice(), rest: cuts.map((t) => [g.joint[0] + g.u[0] * t, g.joint[1] + g.u[1] * t]),
        restU: g.u, joints: [g.joint, g.joint, g.tip, g.tip], group: (g.pair + g.side) % 2, stepping: false, u: 0, anchorY: g.anchorY };
    });
    return { legs, t: 0, steps: 0 };
  }

  // the spine frame at species height y, on the tank plane, as the shader's frame3() builds it
  function frameAt(spine, K, s, sc, anchorY) {
    const f = Math.max(0, Math.min(1, s)) * (K - 1), i0 = Math.max(0, Math.min(K - 2, Math.floor(f))), t = Math.min(1, Math.max(0, f - i0));
    const a = spine(i0), b = spine(i0 + 1);
    const tan = (i) => { const p = spine(Math.min(K - 1, i + 1)), q = spine(Math.max(0, i - 1)); const dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const t0 = tan(i0), t1 = tan(i0 + 1);
    let T = [t0[0] + (t1[0] - t0[0]) * t, t0[1] + (t1[1] - t0[1]) * t]; const tl = Math.hypot(T[0], T[1]) || 1; T = [T[0] / tl, T[1] / tl];
    const L = [T[1], -T[0]], P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return [L[0] * sc, L[1] * sc, T[0] * sc, T[1] * sc, P[0] - T[0] * sc * anchorY, P[1] - T[1] * sc * anchorY];
  }

  // per creature: step its walker (kept on the creature as f._walk) against its spine this frame
  function stepLegs(f, spec, spine, K, sc, BY0, LEN, dt, params) {
    if (!f._walk || f._walk.spec !== spec) f._walk = { spec, W: makeWalker(spec) };
    const W = f._walk.W, frames = {};
    for (const L of W.legs) if (!frames[L.anchorY]) frames[L.anchorY] = frameAt(spine, K || 20, (L.anchorY - BY0) / LEN, sc, L.anchorY);
    window.CreatureWalk.stepAt(W, Math.max(0, Math.min(0.05, dt)), (L) => frames[L.anchorY], params);
    return W;
  }
  // band transforms of one leg as (cos, sin, tx, ty) rows
  const bands = (W, L) => [0, 1, 2].map((n) => { const m = window.CreatureWalk.bandMatrix(W, L, n); return [m[0], m[1], m[4], m[5]]; });

  // per creature: step its walker and write the flag + band transforms into its spine row
  function write(data, row, f, sp, spine, sc, dt, params, K, BY0, LEN) {
    const spec = isWalker(sp) ? legs(sp) : null;
    data[row + (COL0 - 1) * 4 + 3] = spec ? 1 : 0;   // flag: texel K+3 .w
    if (!spec) return;
    if (typeof params === "function") params = params(baseKey(sp.key));
    const W = stepLegs(f, spec, spine, K, sc, BY0, LEN, dt, params);
    for (const L of W.legs) for (let n = 0; n < BANDS; n++) {
      const m = window.CreatureWalk.bandMatrix(W, L, n), o = row + (COL0 + L.bone * BANDS + n) * 4;
      data[o] = m[0]; data[o + 1] = m[1]; data[o + 2] = m[4]; data[o + 3] = m[5];
    }
  }

  // GLSL: legPose(part, aPos, p, row) -> posed p in species units, or p untouched (returns false)
  // needs PT(i, c) for the part texture and a sampler uSpine with this creature's row
  const LEG_GLSL = `
bool legPose(int pi, vec2 aP, inout vec2 p, int rowI) {
  vec4 LG = texelFetch(uParts, ivec2(4, pi), 0);
  if (LG.x < 0.5) return false;
  if (texelFetch(uSpine, ivec2(${COL0 - 1}, rowI), 0).w < 0.5) return false;
  vec4 A = texelFetch(uParts, ivec2(0, pi), 0);
  float t = dot(aP - A.zw, LG.yz);
  int band = t < ${(0.4).toFixed(2)} * LG.w ? 0 : (t < ${(0.76).toFixed(2)} * LG.w ? 1 : 2);
  vec4 M = texelFetch(uSpine, ivec2(${COL0} + (int(LG.x + 0.5) - 1) * ${BANDS} + band, rowI), 0);
  p = vec2(M.x * p.x - M.y * p.y + M.z, M.y * p.x + M.x * p.y + M.w);
  return true;
}`;

  window.EcologyWalk = { isWalker, legs, partTex, write, stepLegs, bands, frameAt, walkers, COL0, MAX_LEGS, TEX_EXTRA, LEG_GLSL, DEFAULT: { gait: "tetrapod", stride: 0.42, lift: 0.12 } };
})();
