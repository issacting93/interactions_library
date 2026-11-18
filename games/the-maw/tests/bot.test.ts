// A bot plays whole runs headless (in Node, in milliseconds): it heads for the nearest thing it can eat, strikes, takes gate traits
// first, and walks to the gates once it has their key. It is the balance check: runs should last minutes, and progress inward.
import { describe, it, expect } from "vitest";
import { Game } from "../src/game";
import { choose } from "../src/systems/feed";
import { BY_KEY } from "../src/content/data";

export function botRun(seed: number, maxMin = 14) {
  const g = new Game(seed), w = g.w, order = ["climb", "eyes", "swim", "leap", "sting", "bulk", "cloak"];
  const log: string[] = []; g.ev.on("level", (e) => log.push(`${g.stats.t.toFixed(0)}s L${e.level}`)); g.ev.on("climbed", (e) => log.push(`${g.stats.t.toFixed(0)}s climbed ${e.from}->${e.to}`));
  g.ev.on("mutated", (e) => log.push(`${g.stats.t.toFixed(0)}s +${e.trait}${e.rank}`)); g.ev.on("apex", (e) => log.push(`${g.stats.t.toFixed(0)}s APEX ${e.species}`));
  let strikeT = 0;
  for (let s = 0; s < maxMin * 3600 && g.maw.state !== "dead" && g.maw.state !== "won"; s++) {
    const m = g.maw, p = w.get(g.player, "pos")!, ri = g.ringOf(g.player);
    if (g.offer) { const i = g.offer.map((o) => order.indexOf(o.trait)).reduce((bi, v, i, a) => (v < a[bi] ? i : bi), 0); choose(g, i); }
    // a gate it can open: go to it
    let goal: { x: number; y: number } | null = null;
    const key = ri === 0 ? "climb" : ri === 1 ? "eyes" : null;
    if (key && m.traits[key] > 0) { const gs = g.map.gates.filter((q) => q.ring === ri).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); goal = gs[0]; }
    if (ri === 2 && (m.traits.swim > 0)) goal = { x: 0, y: 0 };
    if (ri === 3) { const d = [...w.query("body", "pos")].find(([, b]) => b.species === "dragon"); if (d && g.canEat(g.player, d[0])) goal = d[2]; else goal = null; }
    // else food: the nearest it can eat
    if (!goal || m.energy < 0.35) { let bd = 1e9; for (const [e, b, q] of w.query("body", "pos", "mind")) { if (!g.canEat(g.player, e) || (BY_KEY[b.species]?.alt[0] ?? 0) > 0.4 && m.state !== "swim" || g.ringOf(e) !== ri) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; goal = q; } } }
    if (goal) { const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy) || 1; m.input = { x: dx / d, y: dy / d }; m.holding = d < 200 && (strikeT += 1) % 50 < 35; }
    g.step();
  }
  return { g, log, t: g.stats.t, state: g.maw.state, cause: g.cause, level: g.maw.level, ring: g.stats.maxRing, meals: g.stats.meals, traits: g.maw.traits };
}

describe("a run", () => {
  it("plays out, the same seed the same way", () => {
    const a = botRun(11, 3), b = botRun(11, 3);
    expect(a.t).toBe(b.t); expect(a.meals).toBe(b.meals);
  });
  it("lasts minutes and makes progress (balance report)", () => {
    const rs = [1, 2, 3, 4, 5, 6].map((s) => botRun(s));
    for (const r of rs) console.log(`seed ${r.g.seed}: ${r.state} ${r.cause} at ${(r.t / 60).toFixed(1)} min, level ${r.level}, deepest ring ${r.ring}, meals ${r.meals}, traits ${Object.entries(r.traits).filter(([, v]) => v).map(([k, v]) => k + v).join(" ")}\n   ${r.log.join(" · ")}`);
    expect(rs.some((r) => r.ring >= 1)).toBe(true);
  }, 120000);
});
