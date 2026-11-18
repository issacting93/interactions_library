// The director (ported from the tank's EcologyDirector), for your ring only, once a second and never in view: enough to eat (in the
// ring and close by), not too many hunters that can eat you (the farthest off screen leave). What counts as either is asked of
// your size each time, so as you grow, yesterday's hunters become food.
import type { Game } from "../game";
import { RULES } from "../game";
import { SPECIES, BY_KEY } from "../content/data";

export const DIRECTOR = { every: 1, food: 18, near: 6, born: 3, flood: 3, hunters: [2, 3, 3, 0], leave: 2 };
export function directorStep(g: Game): { food: number; near: number; threats: number; born: number; left: number } {
  const w = g.w, ri = g.ringOf(g.player), pp = w.get(g.player, "pos")!, D = DIRECTOR, out = { food: 0, near: 0, threats: 0, born: 0, left: 0 };
  if (ri === 3) return out;
  const reach = RULES.view * 1.5, here: number[] = [];
  for (const [e, , r] of w.query("pos", "ring", "mind")) if (r.i === ri) here.push(e);
  const low = (e: number) => g.maw.state === "swim" || w.get(e, "alt")!.lo <= 0.4;   // food you can reach as you are
  const food = here.filter((e) => g.canEat(g.player, e) && low(e)), threats = here.filter((e) => BY_KEY[w.get(e, "body")!.species]?.role !== "prey" && g.canEat(e, g.player));
  out.food = food.length; out.threats = threats.length;
  out.near = food.filter((e) => { const p = w.get(e, "pos")!; return Math.hypot(p.x - pp.x, p.y - pp.y) < reach; }).length;
  const want = food.length >= D.food * D.flood ? 0 : Math.min(D.born, Math.max(D.food - food.length, D.near - out.near));
  if (want > 0) {
    const id = g.map.rings[ri].id, kinds = SPECIES.filter((s) => s.rings.includes(id) && s.role === "prey" && (g.maw.state === "swim" || s.alt[0] <= 0.4));
    const offscreen = (x: number, y: number) => Math.hypot(x - pp.x, y - pp.y) < RULES.view;
    for (let n = 0; n < want; n++) {
      // a kind you can eat now (a test against your size), born a little way out of sight
      const fit = kinds.filter((s) => s.tier <= 2 && (s.tier === 1 || w.get(g.player, "body")!.len > 70 * 1.05));
      const sp = g.rng.pick(fit.length ? fit : kinds); if (!sp) break;
      out.born += g.birth(sp, ri, { x: pp.x, y: pp.y, d0: RULES.view * 1.05, d1: RULES.view * 1.5 }, offscreen).length;
    }
  }
  const cap = D.hunters[ri] ?? 3;
  if (threats.length > cap) {
    const far = threats.map((e) => ({ e, d: Math.hypot(w.get(e, "pos")!.x - pp.x, w.get(e, "pos")!.y - pp.y) })).filter((o) => o.d > RULES.view && BY_KEY[w.get(o.e, "body")!.species]?.role !== "apex").sort((a, b) => b.d - a.d);
    for (const o of far.slice(0, Math.min(D.leave, threats.length - cap))) { w.despawn(o.e); w.remove(o.e, "pos"); out.left++; }
  }
  return out;
}
export let lastDirector = { food: 0, near: 0, threats: 0, born: 0, left: 0 };
export function directorSystem(g: Game, dt: number): void { if ((g.timers.director += dt) < DIRECTOR.every) return; g.timers.director = 0; lastDirector = directorStep(g); }
