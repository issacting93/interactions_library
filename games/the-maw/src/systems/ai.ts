// What each creature wants to do, as a heading and a pace. Prey graze and wander, school with their own kind, and flee what is big
// enough to eat them; hunters and apexes hunt what they can eat (you too). Rings that are not yours think less often (the light tier).
import type { Game } from "../game";
import { RULES } from "../game";
import { BY_KEY } from "../content/data";

const near: number[] = [];
export function aiSystem(g: Game, dt: number): void {
  const w = g.w, pr = g.ringOf(g.player), pp = w.get(g.player, "pos")!, step = g.clock.steps;
  const maw = g.maw, cloaked = maw.traits.cloak > 0 && Math.hypot(maw.input.x, maw.input.y) < 0.1 && !maw.strike;
  for (const [e, pos, body, mind, ring, alt] of w.query("pos", "body", "mind", "ring", "alt")) {
    const sp = BY_KEY[body.species]; if (!sp) continue;
    const light = Math.abs(ring.i - pr) >= 1;
    mind.light = light;
    if (light && (step + e) % RULES.lightEvery) continue;          // the light tier: think once in a while
    const k = light ? dt * RULES.lightEvery : dt;
    mind.t -= k; mind.calm = Math.max(0, mind.calm - k);
    const sight = Math.max(160, sp.sight * body.len * 1.4), L = body.len;
    let vx = 0, vy = 0, pace = 0.45 + sp.wander * 0.5, threat = 0;

    // fear: the nearest thing that can eat it, within sight
    if (!light) for (const o of g.grid.near(pos.x, pos.y, sight, near)) {
      if (o === e) continue; const ob = w.get(o, "body"); if (!ob || ob.len < L * 1.22) continue;
      if (o === g.player ? !g.canEat(o, e) || cloaked : !(BY_KEY[ob.species]?.role !== "prey")) continue;
      const op = w.get(o, "pos")!, dx = pos.x - op.x, dy = pos.y - op.y, d = Math.hypot(dx, dy);
      if (d < sight && d > 1) { const f = (1 - d / sight) * 2; vx += (dx / d) * f; vy += (dy / d) * f; threat = Math.max(threat, f); }
    }
    if (threat > 0.15) { mind.mode = "flee"; pace = 1.25; }
    else if (sp.role !== "prey" && mind.calm <= 0) {
      // hunt: the nearest thing it can eat; you, if you are in reach and it can
      let best = 0, bd = sight * 1.2;
      for (const o of g.grid.near(pos.x, pos.y, sight * 1.2, near)) {
        if (o === e || !g.canEat(e, o)) continue;
        if (o === g.player && (cloaked || maw.state === "climb" || maw.state === "leap")) continue;
        const op = w.get(o, "pos")!, d = Math.hypot(op.x - pos.x, op.y - pos.y) * (o === g.player ? 0.8 : 1);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { const tp = w.get(best, "pos")!, d = Math.hypot(tp.x - pos.x, tp.y - pos.y) || 1; vx = (tp.x - pos.x) / d; vy = (tp.y - pos.y) / d; mind.mode = "hunt"; mind.target = best; pace = 1.15;
        const ta = w.get(best, "alt"); if (ta) alt.goal = Math.max(alt.lo, Math.min(alt.hi, ta.z)); }
      else mind.mode = "wander";
    } else mind.mode = "wander";

    if ((mind.mode as string) === "wander") {
      if (mind.t <= 0) { mind.t = 1.5 + g.rng.next() * 3; mind.wander += g.rng.range(-1.2, 1.2); alt.goal = g.rng.range(alt.lo, alt.hi);
        if (sp.stopgo && g.rng.chance(0.4)) { mind.mode = "rest"; } }
      vx += Math.cos(mind.wander); vy += Math.sin(mind.wander);
      // school: the same kind close by, the way they go and toward their middle
      if (sp.school > 0.3 && !light) { let ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
        for (const o of g.grid.near(pos.x, pos.y, 180, near)) { if (o === e) continue; const ob = w.get(o, "body"); if (!ob || ob.species !== body.species) continue; const ov = w.get(o, "vel")!, op = w.get(o, "pos")!; ax += ov.x; ay += ov.y; cx += op.x; cy += op.y; n++; }
        if (n) { const s = sp.school * 0.6, al = Math.hypot(ax, ay) || 1; vx += (ax / al) * s + ((cx / n - pos.x) / 180) * s; vy += (ay / al) * s + ((cy / n - pos.y) / 180) * s; mind.mode = "school"; } }
    }
    if (mind.mode === "rest") { pace = 0.05; if (mind.t <= 0) mind.mode = "wander"; }

    // stay in its own ring: a push back from either edge (the apex keeps to its island)
    const map = g.map, R = Math.hypot(pos.x, pos.y) || 1, rg = map.rings[ring.i], r0 = ring.i === 3 ? 0 : rg.r0, r1 = ring.i === 3 ? map.moat.r0 - 30 : rg.r1;
    const edge = 120;
    if (R < r0 + edge) { const f = (r0 + edge - R) / edge * 2.5; vx += (pos.x / R) * f; vy += (pos.y / R) * f; }
    if (R > r1 - edge) { const f = (R - (r1 - edge)) / edge * 2.5; vx -= (pos.x / R) * f; vy -= (pos.y / R) * f; }

    const vl = Math.hypot(vx, vy);
    if (vl > 1e-3) {
      const want = Math.atan2(vy, vx), da = Math.atan2(Math.sin(want - body.heading), Math.cos(want - body.heading)), turn = (sp.turn * Math.PI / 180) * k;
      body.heading += Math.max(-turn, Math.min(turn, da));
    }
    const speed = 95 * sp.speed * Math.pow(L / 50, 0.35) * pace * (mind.mode === "flee" ? 1.2 : 1);
    const v = w.get(e, "vel")!; v.x = Math.cos(body.heading) * speed; v.y = Math.sin(body.heading) * speed;
    if (light) { pos.x += v.x * k; pos.y += v.y * k; }   // the light tier moves here, coarsely; the full tier in motion
  }
  void pp;
}
