/* INTERACTIONS — ground walkers: saved creatures that walk the city, seen from above.
   Ecology's swimmers are baked into ecology-species.js. Anything else that walks (a kit mech, a
   Blender solid, a Bestiary walker) carries its own top view on its record (recipe.flat, baked by
   the 3D Bestiary; see shared/engine/creature-record.js), and this file walks that round the
   buildings: it picks a building, walks to its ring, lingers, picks another. Feet plant in the city
   and step by the shared gait rules (shared/engine/motion/gaits.js); a creature that runs breaks
   into its gait on a long crossing. A tail trails behind like a rope; a neck carries the head.

     const G = GroundWalkers.create({ bounds: { w, h }, landmarks: () => [{ x, y, radius }], size: 90 });
     G.setSpecies([{ id, name, flat, motion, count, color }]);   // flat = record.recipe.flat
     G.step(dt);
     G.draw(ctx, [a, b, c, d, e, f]);                            // canvas transform from city units to pixels
     G.agents, G.count(id)

   Mechanism and a plain stroke drawing; no page, no world file. Classic script -> window.GroundWalkers. */
(function () {
  "use strict";
  const STEP_T = 0.24, ease = (u) => u * u * (3 - 2 * u), TAU = Math.PI * 2;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function create(opts) {
    const G = { bounds: opts.bounds, landmarks: opts.landmarks || (() => []), size: opts.size || 90, species: [], agents: [], t: 0 };
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    // a creature's flat rig, sized for the city: its body becomes `size` units long
    function prep(sp) {
      const F = sp.flat, k = (sp.size || G.size) / Math.max(0.2, F.len), path = new Path2D(), head = new Path2D();
      for (let i = 0; i + 3 < F.body.length; i += 4) { path.moveTo(F.body[i], F.body[i + 1]); path.lineTo(F.body[i + 2], F.body[i + 3]); }
      for (let i = 0; i + 3 < (F.head || []).length; i += 4) { head.moveTo(F.head[i], F.head[i + 1]); head.lineTo(F.head[i + 2], F.head[i + 3]); }
      const rows = Math.max(1, ...F.legs.map((l) => l.i % 100));
      // seen from above a leg is shorter than it is: what is left once it has reached down to the ground
      const legs = F.legs.map((l) => ({ ...l, flatLen: Math.max(Math.hypot(l.home[0] - l.hip[0], l.home[1] - l.hip[1]) * 1.25, Math.sqrt(Math.max(0.01, l.len * l.len - F.h * F.h)) * 1.05), group: ((l.i % 100) + (l.side > 0 ? 0 : 1)) % 2 }));
      const run = window.Gaits && sp.motion && sp.motion.run && sp.motion.run !== "none" ? window.Gaits.RUN[sp.motion.run] : null;
      return { ...sp, F, k, path, head, legs, rows, run, walk: Math.max(12, F.speed * k * 0.9), stride: Math.max(0.08, F.stride) * k * 0.5, tailLen: F.tail ? Math.hypot(F.tail.to[0] - F.tail.from[0], F.tail.to[1] - F.tail.from[1]) * k : 0 };
    }
    function pickGoal(a) {
      const L = G.landmarks(), B = G.bounds;
      if (L.length) {
        // nearer buildings are likelier, the one it is at now is not
        let best = null, bw = -1;
        for (const l of L) { if (l === a.at) continue; const d = Math.hypot(l.x - a.x, l.y - a.y), w = rnd() / (0.4 + d / B.w); if (w > bw) { bw = w; best = l; } }
        best = best || L[0]; a.at = best;
        const ang = rnd() * TAU, r = (best.radius || 120) * (0.55 + rnd() * 0.5);
        a.gx = best.x + Math.cos(ang) * r; a.gy = best.y + Math.sin(ang) * r;
      } else { a.gx = B.w * (0.15 + rnd() * 0.7); a.gy = B.h * (0.15 + rnd() * 0.7); }
      a.gx = Math.min(B.w - 40, Math.max(40, a.gx)); a.gy = Math.min(B.h - 40, Math.max(40, a.gy));
    }
    const toWorld = (a, p, k) => { const c = Math.cos(a.yaw), s = Math.sin(a.yaw); return [a.x + (p[1] * c - p[0] * s) * k, a.y + (p[1] * s + p[0] * c) * k]; };   // local +z is forward
    function spawn(P) {
      const a = { sp: P, x: 0, y: 0, yaw: rnd() * TAU, v: 0, wait: rnd() * 2, phase: rnd(), pace: 0, gait: null, legs: [], tail: [] };
      pickGoal(a); a.x = a.gx; a.y = a.gy; a.at = null; pickGoal(a);
      a.legs = P.legs.map((l) => { const h = toWorld(a, l.home, P.k); return { l, fx: h[0], fy: h[1], from: [h[0], h[1]], stepping: false, u: 0, lift: 0 }; });
      if (P.F.tail) { const b = toWorld(a, P.F.tail.from, P.k); for (let i = 0; i < 9; i++) a.tail.push([b[0] - Math.cos(a.yaw) * (P.tailLen / 8) * i, b[1] - Math.sin(a.yaw) * (P.tailLen / 8) * i]); }
      return a;
    }
    G.setSpecies = (list) => {
      const old = G.agents; G.species = list.filter((s) => s.flat && s.flat.body && s.flat.legs).map(prep); G.agents = [];
      for (const P of G.species) {
        // keep the ones already walking, so changing a count doesn't reshuffle the city
        const mine = old.filter((a) => a.sp.id === P.id && a.sp.F.of === P.F.of).slice(0, P.count);
        for (const a of mine) a.sp = P;
        while (mine.length < (P.count || 0)) mine.push(spawn(P));
        G.agents.push(...mine);
      }
    };
    G.count = (id) => G.agents.filter((a) => a.sp.id === id).length;

    G.step = (dt) => {
      G.t += dt;
      for (const a of G.agents) {
        const P = a.sp, dx = a.gx - a.x, dy = a.gy - a.y, dist = Math.hypot(dx, dy);
        // go: turn toward the goal, walk; a runner runs the long crossings
        let want = 0;
        if (a.wait > 0) { a.wait -= dt; if (a.wait <= 0) pickGoal(a); }
        else if (dist < P.k * P.F.len * 0.5) { a.wait = 1.5 + rnd() * 4; }
        else {
          const err = wrap(Math.atan2(dy, dx) - a.yaw); a.yaw += Math.sign(err) * Math.min(Math.abs(err), 1.6 * dt);
          want = P.walk * (P.run && dist > P.k * P.F.len * 5 ? 1.9 : 1) * Math.min(1, dist / (P.k * P.F.len * 1.5) + 0.25) * (0.3 + 0.7 * Math.max(0, Math.cos(err)));
        }
        a.v += (want - a.v) * Math.min(1, dt * 3);
        const vx = Math.cos(a.yaw) * a.v, vy = Math.sin(a.yaw) * a.v; a.x += vx * dt; a.y += vy * dt;
        // gait: on a clock when running, on demand otherwise
        // pace is its share of top speed, as in the 3D walker, so it changes gait at the same moments there and here
        const legLen = P.legs.length ? P.legs[0].len * P.k : 1; a.pace += (a.v / (P.walk * 1.9) - a.pace) * Math.min(1, dt * 3);
        const pick = !P.run || a.pace < P.run.walkBelow ? null : a.pace > P.run.fastAbove ? P.run.fast : P.run.slow;
        if (pick && !(a.gait == null && a.legs.some((L) => L.stepping))) { a.gait = pick; a.landing = false; } else if (a.gait && !pick) a.landing = true;
        const home = (L, lead) => { const h = toWorld(a, L.l.home, P.k); return [h[0] + vx * lead, h[1] + vy * lead]; };
        if (a.gait) {
          const g = a.gait, f = Math.min(3, Math.max(0.7, a.v / (legLen * g.reach))); a.phase += f * dt; let air = 0;
          for (const L of a.legs) {
            const u = window.Gaits.swing(g, a.phase, L.l.i % 100, L.l.side, P.rows);
            if (u < 0 || (a.landing && !L.stepping)) { L.stepping = false; L.lift = 0; continue; }
            air++; if (!L.stepping) { L.stepping = true; L.from = [L.fx, L.fy]; }
            const to = home(L, (1 - u) * (1 - g.duty) / f + g.duty / f * 0.5), e = ease(u);
            L.fx = L.from[0] + (to[0] - L.from[0]) * e; L.fy = L.from[1] + (to[1] - L.from[1]) * e; L.lift = Math.sin(Math.PI * u);
          }
          if (a.landing && !air) { a.gait = null; a.landing = false; }
        } else {
          for (const L of a.legs) { const h = home(L, 0); L.err = Math.hypot(L.fx - h[0], L.fy - h[1]); }
          const view = a.legs.map((L) => ({ i: L.l.i, side: L.l.side, group: L.l.group, stepping: L.stepping }));
          a.legs.map((L, i) => [L, i]).filter(([L]) => !L.stepping && L.err > P.stride).sort((p, q) => q[0].err - p[0].err).forEach(([L, i]) => {
            if (L.err > P.stride * 2.6 || !window.Gaits || window.Gaits.mayStep("alt", view[i], view)) { L.stepping = true; L.u = 0; L.from = [L.fx, L.fy]; view[i].stepping = true; }
          });
          for (const L of a.legs) {
            if (!L.stepping) { L.lift = 0; continue; }
            L.u = Math.min(1, L.u + dt / STEP_T); const to = home(L, STEP_T * 0.6), e = ease(L.u);
            L.fx = L.from[0] + (to[0] - L.from[0]) * e; L.fy = L.from[1] + (to[1] - L.from[1]) * e; L.lift = Math.sin(Math.PI * L.u);
            if (L.u >= 1) { L.stepping = false; L.lift = 0; }
          }
        }
        // the tail: a rope pulled along by its root, with a little sway
        if (a.tail.length) {
          const b = toWorld(a, P.F.tail.from, P.k), seg = P.tailLen / (a.tail.length - 1); a.tail[0] = b;
          for (let i = 1; i < a.tail.length; i++) {
            const p = a.tail[i], q = a.tail[i - 1]; let ex = p[0] - q[0], ey = p[1] - q[1]; const d = Math.hypot(ex, ey) || 1;
            const sw = Math.sin(G.t * 2.4 - i * 0.7 + a.phase * 6) * seg * 0.05 * i; ex = ex / d * seg - Math.sin(a.yaw) * sw; ey = ey / d * seg + Math.cos(a.yaw) * sw;
            const d2 = Math.hypot(ex, ey) || 1; a.tail[i] = [q[0] + ex / d2 * seg, q[1] + ey / d2 * seg];
          }
        }
      }
    };

    G.draw = (ctx, view) => {
      const px = Math.hypot(view[0], view[1]) || 1;                   // pixels per city unit
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const a of G.agents) {
        const P = a.sp, col = P.color || "#5be39a"; ctx.strokeStyle = col; ctx.fillStyle = col;
        // legs first, under the body: hip, a knee pushed outward, the foot where it is planted
        ctx.setTransform(view[0], view[1], view[2], view[3], view[4], view[5]); ctx.lineWidth = 1.5 / px; ctx.globalAlpha = 0.85;
        for (const L of a.legs) {
          const h = toWorld(a, L.l.hip, P.k), dx = L.fx - h[0], dy = L.fy - h[1], d = Math.hypot(dx, dy) || 1, len = L.l.flatLen * P.k;
          const bend = Math.sqrt(Math.max(0, (len * len - d * d) / 4)) * 0.8, out = toWorld(a, [L.l.hip[0] * 2, L.l.hip[1]], P.k);
          let nx = -dy / d, ny = dx / d; if ((out[0] - h[0]) * nx + (out[1] - h[1]) * ny < 0) { nx = -nx; ny = -ny; }
          const kx = h[0] + dx / 2 + nx * bend, ky = h[1] + dy / 2 + ny * bend;
          ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(kx, ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
          ctx.beginPath(); ctx.arc(L.fx, L.fy, (1.6 + 1.6 * L.lift) / px, 0, TAU); if (L.lift > 0.05) ctx.stroke(); else ctx.fill();
        }
        if (a.tail.length) {
          ctx.globalAlpha = 0.9;
          for (let i = 0; i + 1 < a.tail.length; i++) { ctx.lineWidth = (2.6 * (1 - i / a.tail.length) + 0.6) / px; ctx.beginPath(); ctx.moveTo(a.tail[i][0], a.tail[i][1]); ctx.lineTo(a.tail[i + 1][0], a.tail[i + 1][1]); ctx.stroke(); }
          const e = a.tail[a.tail.length - 1], q = a.tail[a.tail.length - 2], ang = Math.atan2(e[1] - q[1], e[0] - q[0]); ctx.lineWidth = 0.8 / px;
          for (let j = 0; j < Math.min(7, P.F.tail.tuft || 0); j++) { const t = ang + (j / 6 - 0.5) * 1.3; ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(e[0] + Math.cos(t) * P.tailLen * 0.18, e[1] + Math.sin(t) * P.tailLen * 0.18); ctx.stroke(); }
        }
        // the body's own strokes, in its own frame (+z forward lies along the heading)
        ctx.translate(a.x, a.y); ctx.rotate(a.yaw); ctx.transform(0, P.k, P.k, 0, 0, 0);
        ctx.globalAlpha = 0.95; ctx.lineWidth = 1 / (px * P.k); ctx.stroke(P.path);
        if (P.F.neck) {
          const n = P.F.neck; ctx.lineWidth = 2.4 / (px * P.k); ctx.beginPath(); ctx.moveTo(n.from[0], n.from[1]); ctx.lineTo(n.to[0], n.to[1]); ctx.stroke();
          ctx.translate(n.to[0], n.to[1]); ctx.lineWidth = 1 / (px * P.k); ctx.stroke(P.head);
        }
      }
      ctx.restore();
    };
    return G;
  }
  window.GroundWalkers = { create };
})();
