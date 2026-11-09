/*
 * Forge — creature rig. Builds a rig for a species straight from its parts and their
 * attach points (attach-points.js), and poses it with procedural motion clips.
 *
 *   spine      centre parts, chained head to tail, each hinged at its joint. A centre part
 *              that starts well inside the link above it rides that link rigidly ("fixed").
 *   pendulum   any part with a hang point swings from the spine link at that height.
 *   wing       side parts hinge on the spine link nearest their joint, mirrored across the axis.
 *   leg        a side part with a "limb" point: cut into femur/tibia/tarsus bands by
 *              CreatureWalk.slice (creature-walk.js). In the Walk clip a page poses the bands
 *              with CreatureWalk; in the other clips a leg moves like a stiff wing.
 *
 * Motion uses the SAME swim parameters the ecology species carry (shared/engine/ecology/
 * ecology-species.js: swim.waves/amp/ampPow/bend/fin/speed/len), so a rig tuned here can
 * be pushed into EcologySim and vice versa.
 *
 *   CreatureRig.build(speciesId, parts, attachStore) -> rig
 *   CreatureRig.pose(rig, time, clip, swim) -> { world: [mat], mirror: [mat|null], angles: [deg] }
 *       mat = [a,b,c,d,e,f] (SVG matrix(), sheet px). mirror[i] is the right-hand copy of a
 *       side part, already posed (both wings beat together, both follow a bending spine).
 *   CreatureRig.svg(rig, opts) -> markup with one <g id="b{i}"> (+ "m{i}") per bone, for a
 *       page to update with setAttribute("transform", "matrix(...)") each frame.
 *   CreatureRig.recipeBones(rig) -> bones as a rig record stores them (legs keep limb geometry).
 *   CreatureRig.ecologyKeyFor(speciesId, keys) -> the matching ecology species key or null.
 *   CreatureRig.CLIPS, CreatureRig.DEFAULT_SWIM
 *
 * Pure: no DOM. Depends on AttachPoints (attach-points.js). Load creature-walk.js BEFORE this
 * file wherever rigs are built, or legs fall back to wings (and a recook would save them so).
 * Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200, TAU = Math.PI * 2, DEG = Math.PI / 180;
  const DEFAULT_SWIM = { len: 1, waves: 0.9, amp: 1, ampPow: 1.6, bend: 1, fin: 0.21, speed: 1 };

  // per clip: spine amplitude, frequency multiplier, wing beat, wing hold (deg), pendulum swing
  const CLIPS = {
    swim:    { label: "Swim",    spine: 1.0,  freq: 1.0, wing: 1.0, hold: 0,  swing: 1.0 },
    glide:   { label: "Glide",   spine: 0.22, freq: 0.6, wing: 0.15, hold: 14, swing: 0.5 },
    turn:    { label: "Turn",    spine: 0.7,  freq: 0.8, wing: 0.7, hold: 0,  swing: 1.2, bias: 16 },
    idle:    { label: "Idle",    spine: 0.12, freq: 0.3, wing: 0.25, hold: 4, swing: 0.4 },
    startle: { label: "Startle", spine: 1.8,  freq: 2.2, wing: 1.6, hold: 0,  swing: 1.6 },
    walk:    { label: "Walk",    spine: 0.08, freq: 0.5, wing: 0.1, hold: 0,  swing: 0.3, walk: true },
  };

  /* ---------- 2D affine helpers: [a,b,c,d,e,f] like SVG matrix() ---------- */
  const I = () => [1, 0, 0, 1, 0, 0];
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function rotAbout(px, py, deg) {
    const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
    return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py];
  }
  const MIRROR = [-1, 0, 0, 1, 2 * AXIS, 0];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  /* ---------- build ---------- */
  function extentY(part) { return [part.oy - part.h / 2, part.oy + part.h / 2]; }

  function build(speciesId, parts, store) {
    const AP = window.AttachPoints;
    const sp = parts.filter((p) => p.species === speciesId);
    const bones = [];
    const center = [], pend = [], side = [];
    for (const p of sp) {
      const pts = AP.get(p, store);
      if (p.side === "center") (pts.some((q) => q.kind === "hang") ? pend : center).push(p);
      else side.push(p);
    }
    // spine: by the y of each part's joint (or its top), head first
    const topOf = (p) => { const j = AP.sheetPoint(p, store, "joint"); return j ? j.y : extentY(p)[0]; };
    center.sort((a, b) => topOf(a) - topOf(b));
    const chain = [];
    for (const p of center) {
      const [y0, y1] = extentY(p), jy = topOf(p);
      const last = chain.length ? bones[chain[chain.length - 1]] : null;
      if (last) {
        const [ly0, ly1] = extentY(last.part);
        // starts well inside the link above (overlapping head plates, halos, rings): ride it
        if (jy < ly1 - 0.35 * (ly1 - ly0) && y1 <= ly1 + 0.5 * (ly1 - ly0)) {
          bones.push({ id: bones.length, part: p, kind: "fixed", parent: last.id, pivot: [AXIS, jy] });
          continue;
        }
      }
      const b = { id: bones.length, part: p, kind: "spine", parent: last ? last.id : -1, pivot: [AXIS, jy] };
      bones.push(b); chain.push(b.id);
    }
    // spine position 0..1 along the chain
    chain.forEach((id, i) => { bones[id].t = chain.length > 1 ? i / (chain.length - 1) : 0; });
    const linkAt = (y) => {
      if (!chain.length) return -1;
      let best = chain[0], bd = Infinity;
      for (const id of chain) {
        const [y0, y1] = extentY(bones[id].part);
        const d = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
        if (d < bd || (d === 0 && Math.abs(bones[id].pivot[1] - y) < Math.abs(bones[best].pivot[1] - y))) { bd = d; best = id; }
      }
      return best;
    };
    for (const p of pend) {
      const h = AP.sheetPoint(p, store, "hang");
      bones.push({ id: bones.length, part: p, kind: "pendulum", parent: linkAt(h.y), pivot: [AXIS + (h.x - AXIS), h.y] });
    }
    side.sort((a, b) => a.oy - b.oy);
    side.forEach((p, k) => {
      const limb = window.CreatureWalk && AP.sheetPoint(p, store, "limb");
      if (limb) {
        bones.push({ id: bones.length, part: p, kind: "leg", parent: linkAt(limb.y), pivot: [limb.x, limb.y], mirror: true, k, limb: window.CreatureWalk.slice(p, limb) });
        return;
      }
      const j = AP.sheetPoint(p, store, "joint") || AP.sheetPoint(p, store, "rim") || { x: p.ox + p.w / 2, y: p.oy };
      bones.push({ id: bones.length, part: p, kind: "wing", parent: linkAt(j.y), pivot: [j.x, j.y], mirror: true, k });
    });
    // parents must come before children for a single forward FK pass
    const order = [];
    const seen = new Set();
    const visit = (b) => { if (seen.has(b.id)) return; if (b.parent >= 0) visit(bones[b.parent]); seen.add(b.id); order.push(b.id); };
    bones.forEach(visit);
    const counts = bones.reduce((c, b) => ((c[b.kind] = (c[b.kind] || 0) + 1), c), {});
    return { species: speciesId, bones, order, chain, counts, axis: AXIS };
  }

  /* ---------- pose ---------- */
  function pose(rig, time, clipName, swim) {
    const S = { ...DEFAULT_SWIM, ...(swim || {}) }, C = CLIPS[clipName] || CLIPS.swim;
    const w = TAU * 1.1 * S.speed * C.freq;
    const maxBend = 16 * S.bend * S.amp * C.spine;            // degrees at the tail
    const world = new Array(rig.bones.length), mirror = new Array(rig.bones.length).fill(null), angles = new Array(rig.bones.length).fill(0);
    const worldAngle = new Array(rig.bones.length).fill(0);
    for (const id of rig.order) {
      const b = rig.bones[id];
      const P = b.parent >= 0 ? world[b.parent] : I();
      const parentAngle = b.parent >= 0 ? worldAngle[b.parent] : 0;
      let local = 0;
      if (b.kind === "spine") {
        const env = 0.18 + Math.pow(b.t, S.ampPow);
        const target = maxBend * env * Math.sin(TAU * S.waves * b.t - w * time) + (C.bias || 0) * b.t;
        local = target - parentAngle;
      } else if (b.kind === "wing" || b.kind === "leg") {
        const beat = S.fin * 120 * C.wing * (b.kind === "leg" ? 0.3 : 1);   // fin 0.21 -> ~25°
        local = C.hold + beat * Math.sin(w * 1.6 * time - b.k * 0.5);
      } else if (b.kind === "pendulum") {
        // hang under gravity: cancel most of the parent's turn, then swing with a lag
        local = -parentAngle * 0.85 + 7 * C.swing * Math.sin(w * 0.8 * time - 1.1);
      }
      angles[id] = local;
      worldAngle[id] = parentAngle + local;
      const L = rotAbout(b.pivot[0], b.pivot[1], local);
      world[id] = mul(P, L);
      if (b.mirror) mirror[id] = mul(mul(P, MIRROR), L);
    }
    return { world, mirror, angles };
  }

  /* ---------- markup ---------- */
  function svg(rig, opts) {
    opts = opts || {};
    const defs = [...new Set(rig.bones.map((b) => b.part.defs).filter(Boolean))].join("");
    // draw back to front: wings, then spine/fixed, then pendulums on top
    const layer = { leg: 0, wing: 0, spine: 1, fixed: 1, pendulum: 2 };
    const ids = rig.bones.map((b) => b.id).sort((a, b) => layer[rig.bones[a].kind] - layer[rig.bones[b].kind]);
    let g = "", clips = "";
    for (const id of ids) {
      const b = rig.bones[id], body = `<g transform="translate(${b.part.ox} ${b.part.oy})">${b.part.svg}</g>`;
      if (b.kind === "leg") {
        // three bands, each clipped to its slice of the drawn leg; b{id}k{n} / m{id}k{n}
        b.limb.bands.forEach((poly, n) => {
          const cp = `lc${id}k${n}`;
          clips += `<clipPath id="${cp}" clipPathUnits="userSpaceOnUse"><polygon points="${poly.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")}"/></clipPath>`;
          g += `<g id="b${id}k${n}"><g clip-path="url(#${cp})">${body}</g></g>`;
          g += `<g id="m${id}k${n}"><g clip-path="url(#${cp})">${body}</g></g>`;
        });
        continue;
      }
      g += `<g id="b${id}">${body}</g>`;
      if (b.mirror) g += `<g id="m${id}">${body}</g>`;
    }
    return `${defs || clips ? `<defs>${defs}${clips}</defs>` : ""}${g}`;
  }

  // bone overlay positions for a pose: [ [x1,y1,x2,y2,kind], ... ] from each pivot to its parent's
  function overlay(rig, P) {
    const out = [];
    for (const b of rig.bones) {
      if (b.parent < 0 || b.kind === "fixed") continue;
      const a = apply(P.world[b.id], b.pivot[0], b.pivot[1]), pb = rig.bones[b.parent];
      const c = apply(P.world[pb.id], pb.pivot[0], pb.pivot[1]);
      out.push([c[0], c[1], a[0], a[1], b.kind, b.id]);
      if (b.mirror) { const m = apply(P.mirror[b.id], b.pivot[0], b.pivot[1]); out.push([c[0], c[1], m[0], m[1], b.kind, b.id]); }
    }
    return out;
  }

  // the bones as a rig record stores them; legs keep their sliced geometry
  function recipeBones(rig) {
    return rig.bones.map((b) => ({ part: b.part.id, kind: b.kind, parent: b.parent, pivot: b.pivot,
      ...(b.limb ? { limb: { joint: b.limb.joint, tip: b.limb.tip, lens: b.limb.lens } } : {}) }));
  }

  function ecologyKeyFor(speciesId, keys) {
    const name = speciesId.replace(/^sheet-/, "");
    const strip = (k) => k.replace(/-[0-9a-f]{4}$/, "").replace(/-mk\d+$/, "");
    return keys.find((k) => k === name) || keys.find((k) => strip(k) === name) ||
      keys.find((k) => name.endsWith("-" + k)) || keys.find((k) => name.split("-").includes(k)) || null;
  }

  window.CreatureRig = { build, pose, svg, overlay, recipeBones, ecologyKeyFor, CLIPS, DEFAULT_SWIM, mat: { mul, rotAbout, apply } };
})();
