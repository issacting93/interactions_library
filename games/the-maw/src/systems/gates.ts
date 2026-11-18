// Gates. Inward is always forward, and every inward boundary needs a key:
//   the Floor's inner wall: climbed only at a tower, with Climb (Climb 3: anywhere on the wall)
//   the Frond's inner wall: passed only at a stair, which only shows to Eyes
//   the moat round the Apex: swum (Swim), or leapt (a Leap strike carries the body across)
// Going back out is always free: you drop down.
import type { Game } from "../game";
import { RULES } from "../game";
import type { Trait } from "../content/data";
import { ringAt } from "../content/world";

export function gateSystem(g: Game, dt: number): void {
  const m = g.maw, pos = g.w.get(g.player, "pos")!, body = g.w.get(g.player, "body")!, map = g.map, r = Math.hypot(pos.x, pos.y) || 1;
  g.timers.hint = Math.max(0, g.timers.hint - dt);
  if (m.move) return;
  const ring = ringAt(map, pos.x, pos.y), hint = (ringI: number, need: string) => { if (g.timers.hint <= 0) { g.ev.emit({ type: "gate", ring: ringI, open: false, need }); g.timers.hint = 3; } };
  const climbTo = (from: { x: number; y: number }, toR: number, a: number, rank: number, ringI: number) => {
    m.state = "climb"; m.move = { t: 0, dur: RULES.climb[Math.max(0, rank - 1)], from: { ...from }, to: { x: Math.cos(a) * toR, y: Math.sin(a) * toR } };
    g.ev.emit({ type: "climbed", from: ringI, to: ringI + 1 });
  };
  // the inner wall of the Floor (ring 0) and of the Frond (ring 1)
  for (const ringI of [0, 1]) {
    const R0 = map.rings[ringI].r0;
    if (ring !== ringI || r > R0 + body.len * 0.6 + 8) continue;
    const key: Trait = ringI === 0 ? "climb" : "eyes", have = m.traits[key];
    const gate = map.gates.filter((q) => q.ring === ringI).find((q) => Math.hypot(q.x - pos.x, q.y - pos.y) < 90 + body.len * 0.5);
    const a = Math.atan2(pos.y, pos.x);
    if (have > 0 && (gate || (key === "climb" && have >= 3))) { climbTo(pos, R0 - 150, gate ? gate.a : a, key === "climb" ? have : 1, ringI); return; }
    // blocked: held at the wall
    const lim = R0 + body.len * 0.6 + 8; pos.x = Math.cos(a) * lim; pos.y = Math.sin(a) * lim;
    hint(ringI, gate ? key : ringI === 0 ? "tower" : "stair");
  }
  // the moat: walkers stop at its edge; a swimmer goes in; a leap across is handled by the strike (feed)
  const mo = map.moat;
  if (r < mo.r1 && r > mo.r0) {
    if (m.traits.swim > 0) { if (m.state === "walk") m.state = "swim"; }
    else { const a = Math.atan2(pos.y, pos.x), lim = mo.r1 + 4; pos.x = Math.cos(a) * lim; pos.y = Math.sin(a) * lim; hint(2, "swim or leap"); }
  }
  // the world's edge
  if (r > map.R - 20) { const a = Math.atan2(pos.y, pos.x); pos.x = Math.cos(a) * (map.R - 20); pos.y = Math.sin(a) * (map.R - 20); }
}
