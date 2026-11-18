// Moving: the full tier integrates velocity, altitude drifts toward its goal, and every spine follows its head (a chain of points,
// each a fixed distance behind the last, so a body bends through its own path). The player is steered by its input here.
import type { Game } from "../game";
import { RULES } from "../game";

export function motionSystem(g: Game, dt: number): void {
  const w = g.w, m = g.maw;
  // the player: the stick sets where it goes; the body turns toward it quickly but not at once
  { const pos = w.get(g.player, "pos")!, body = w.get(g.player, "body")!, v = w.get(g.player, "vel")!, alt = w.get(g.player, "alt")!;
    if (m.move) {   // a climb or a leap: carried along a path
      m.move.t += dt; const u = Math.min(1, m.move.t / m.move.dur), s = u * u * (3 - 2 * u);
      pos.x = m.move.from.x + (m.move.to.x - m.move.from.x) * s; pos.y = m.move.from.y + (m.move.to.y - m.move.from.y) * s;
      body.heading = Math.atan2(m.move.to.y - m.move.from.y, m.move.to.x - m.move.from.x);
      alt.z = m.state === "leap" ? 0.2 + Math.sin(u * Math.PI) * 0.8 : m.state === "climb" ? Math.sin(u * Math.PI) * 1.2 : alt.z;
      if (u >= 1) { m.move = null; m.state = m.traits.swim > 0 && m.state !== "climb" && alt.goal > 0.3 ? "swim" : "walk"; }
      v.x = v.y = 0;
    } else if (m.state === "walk" || m.state === "swim") {
      const ix = m.input.x, iy = m.input.y, il = Math.min(1, Math.hypot(ix, iy)), coiling = m.holding ? 1 - 0.7 * m.coil : 1;
      if (il > 0.08) { const want = Math.atan2(iy, ix), da = Math.atan2(Math.sin(want - body.heading), Math.cos(want - body.heading)); body.heading += da * Math.min(1, RULES.turn * dt); }
      const sp = (m.state === "swim" ? RULES.swim * (1 + 0.15 * (m.traits.swim - 1)) : RULES.walk) * Math.pow(body.len / 50, 0.25) * il * coiling * (m.stunT > 0 ? 0.3 : 1);
      v.x += (Math.cos(body.heading) * sp - v.x) * Math.min(1, 10 * dt); v.y += (Math.sin(body.heading) * sp - v.y) * Math.min(1, 10 * dt);
      pos.x += v.x * dt; pos.y += v.y * dt;
      alt.goal = m.state === "swim" ? 0.55 : 0; alt.z += (alt.goal - alt.z) * Math.min(1, 3 * dt);
    }
  }
  for (const [e, pos, v, alt, mind] of w.query("pos", "vel", "alt", "mind")) {
    if (!mind.light) { pos.x += v.x * dt; pos.y += v.y * dt; }
    alt.z += (alt.goal - alt.z) * Math.min(1, 0.6 * dt);
    void e;
  }
  // spines: each point follows the one ahead at its distance (and a creature's wave, by its pace)
  for (const [e, pos, sp, body] of w.query("pos", "spine", "body")) {
    const P = sp.pts, mind = w.get(e, "mind");
    if (mind?.light && (g.clock.steps + e) % RULES.lightEvery) continue;
    const v = w.get(e, "vel")!, pace = Math.hypot(v.x, v.y);
    body.phase += dt * (2 + pace / Math.max(20, body.len) * 4);
    sp.seg = body.len / 8;
    // the head swims with a little sway, so the body behind it waves
    const sway = e === g.player ? 0 : Math.sin(body.phase) * body.len * 0.012 * Math.min(1, pace / 60);
    P[0] = pos.x + Math.cos(body.heading + Math.PI / 2) * sway; P[1] = pos.y + Math.sin(body.heading + Math.PI / 2) * sway;
    for (let i = 2; i < P.length; i += 2) {
      const dx = P[i] - P[i - 2], dy = P[i + 1] - P[i - 1], d = Math.hypot(dx, dy) || 1e-6;
      P[i] = P[i - 2] + (dx / d) * sp.seg; P[i + 1] = P[i - 1] + (dy / d) * sp.seg;
    }
  }
}
