// Eating. The Maw coils while the button is held and strikes when it is let go: the head throws out along its aim and takes what it
// meets that it can eat and can reach (walking, only what comes low; swimming, anything). Hunters catch what they can eat. Hunger
// always drains. Meals fill a level; each level offers mutations drawn from the families you ate since the last one.
import type { Game } from "../game";
import { RULES } from "../game";
import { BY_KEY, TRAIT_INFO, type Trait } from "../content/data";

const near: number[] = [];

// where the mouth is now (the head plus the strike's throw)
export function mouthAt(g: Game): { x: number; y: number; r: number } {
  const p = g.w.get(g.player, "pos")!, b = g.w.get(g.player, "body")!, m = g.maw;
  let ext = b.len * 0.22;
  if (m.strike) { const s = m.strike, u = s.t < RULES.strikeOut ? s.t / RULES.strikeOut : 1 - (s.t - RULES.strikeOut) / RULES.strikeBack; ext += s.reach * Math.max(0, u); }
  const a = m.strike ? m.strike.dir : b.heading;
  return { x: p.x + Math.cos(a) * ext, y: p.y + Math.sin(a) * ext, r: b.len * RULES.mouth };
}
const reachable = (g: Game, e: number) => { const a = g.w.get(e, "alt")!, m = g.maw; return m.state === "swim" ? Math.abs(a.z - g.w.get(g.player, "alt")!.z) < 0.55 : a.z <= RULES.reachWalk + 0.25 * m.coil + 0.1 * m.traits.leap; };

function eat(g: Game, by: number, prey: number): void {
  const pb = g.w.get(prey, "body")!, sp = BY_KEY[pb.species];
  g.ev.emit({ type: "ate", by, prey, species: pb.species, family: sp?.family ?? "", size: pb.len, isPlayer: by === g.player });
  g.w.despawn(prey); g.w.remove(prey, "pos");   // gone from every query this step
  if (by !== g.player) { const mind = g.w.get(by, "mind"); if (mind) { mind.calm = RULES.hunterRest; mind.mode = "rest"; } return; }
  const m = g.maw, me = g.w.get(g.player, "body")!, k = Math.min(1.4, pb.len / me.len);
  m.energy = Math.min(1, m.energy + RULES.mealEnergy * k);
  m.xp += k; m.meals++; g.stats.meals++; m.ate[pb.species] = (m.ate[pb.species] ?? 0) + 1;
  if (sp) m.since[sp.family] = (m.since[sp.family] ?? 0) + k;
  if (sp?.role === "apex") { g.ev.emit({ type: "apex", species: sp.key, ring: g.ringOf(g.player) }); if (sp.key === "dragon") { m.state = "won"; g.ev.emit({ type: "won" }); } m.xp += 3; }
  while (m.xp >= need(m.level)) { m.xp -= need(m.level); m.level++; m.owed++; g.ev.emit({ type: "level", level: m.level }); }
  if (m.owed && !g.offer) g.offer = offers(g);
}
export const need = (level: number) => RULES.xpBase + (level - 1) * RULES.xpStep;

// three mutations: a rank in the trait of each family you ate since the last level (the most eaten first), then anything you have eaten
export function offers(g: Game): { trait: Trait; family: string; rank: number }[] {
  const m = g.maw, fams = Object.entries(m.since).sort((a, b) => b[1] - a[1]).map(([f]) => f), out: { trait: Trait; family: string; rank: number }[] = [];
  const tryAdd = (fam: string) => { const t = (g.hab && famTrait(fam)) as Trait | null; if (!t || out.some((o) => o.trait === t) || m.traits[t] >= 3) return; out.push({ trait: t, family: fam, rank: m.traits[t] + 1 }); };
  for (const f of fams) tryAdd(f);
  for (const k of Object.keys(m.ate)) tryAdd(BY_KEY[k]?.family ?? "");
  if (out.length < 3 && m.traits.bulk < 3 && !out.some((o) => o.trait === "bulk")) out.push({ trait: "bulk", family: "dragons", rank: m.traits.bulk + 1 });
  return out.slice(0, 3);
}
const famTrait = (fam: string): Trait | null => ({ crawlers: "climb", fish: "eyes", swifts: "swim", wyrms: "leap", drifters: "sting", monarchs: "cloak", dragons: "bulk" } as Record<string, Trait>)[fam] ?? null;

// the player picked one (or -1: later)
export function choose(g: Game, i: number): void {
  const m = g.maw, o = g.offer?.[i]; if (!o) return;
  m.traits[o.trait] = Math.min(3, m.traits[o.trait] + 1); m.owed--;
  const b = g.w.get(g.player, "body")!; b.len *= RULES.grow * (o.trait === "bulk" ? 1.12 : 1);
  m.since = {};
  g.ev.emit({ type: "mutated", id: o.trait, family: o.family, trait: TRAIT_INFO[o.trait].name, rank: m.traits[o.trait] });
  g.offer = m.owed ? offers(g) : null;
}

export function feedSystem(g: Game, dt: number): void {
  const w = g.w, m = g.maw, me = w.get(g.player, "body")!, pos = w.get(g.player, "pos")!;
  // hunger
  m.energy -= RULES.drain * dt * (m.state === "swim" ? 1.15 : 1) * Math.pow(me.len / 50, 0.15);
  m.stunT = Math.max(0, m.stunT - dt); m.cool = Math.max(0, m.cool - dt);
  if (m.energy <= 0) { die(g, "starved"); return; }
  // the lunge: hold to coil, let go to strike. It snaps toward the best thing to eat in a cone ahead
  if (m.holding && !m.strike && m.state !== "climb") m.coil = Math.min(1, m.coil + dt / RULES.coil);
  if (!m.holding && m.coil > 0 && !m.strike && m.cool <= 0 && m.state !== "climb" && m.state !== "leap") {
    let dir = Math.hypot(m.input.x, m.input.y) > 0.2 ? Math.atan2(m.input.y, m.input.x) : me.heading;
    const reach = me.len * (RULES.reach[0] + RULES.reach[1] * m.coil);
    let best = 0, bs = 0;
    for (const o of g.grid.near(pos.x, pos.y, reach + me.len, near)) { if (!g.canEat(g.player, o) || !reachable(g, o)) continue; const op = w.get(o, "pos")!, dx = op.x - pos.x, dy = op.y - pos.y, d = Math.hypot(dx, dy);
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - dir), Math.cos(Math.atan2(dy, dx) - dir))); if (d > reach + me.len * 0.4 || da > RULES.cone) continue;
      const s = (1 - da / RULES.cone) * (1 - d / (reach + me.len)); if (s > bs) { bs = s; best = o; } }
    if (best) { const op = w.get(best, "pos")!; dir = Math.atan2(op.y - pos.y, op.x - pos.x); }
    m.strike = { t: 0, dir, reach };
    // a leap: the whole body goes with the strike (and can cross the moat)
    if (m.traits.leap > 0 && m.coil > 0.6) { const L = reach * RULES.leapK[m.traits.leap]; let tx = pos.x + Math.cos(dir) * L, ty = pos.y + Math.sin(dir) * L;
      // a leap never clears a wall (those need their own keys): it lands short of the ring's inner edge
      const ri = g.ringOf(g.player); if (ri <= 1) { const R0 = g.map.rings[ri].r0 + me.len * 0.7, tr = Math.hypot(tx, ty); if (tr < R0) { tx *= R0 / tr; ty *= R0 / tr; } }
      m.state = "leap"; m.move = { t: 0, dur: 0.55, from: { x: pos.x, y: pos.y }, to: { x: tx, y: ty } }; }
    m.coil = 0;
  }
  if (m.strike) {
    m.strike.t += dt;
    const mo = mouthAt(g);
    for (const o of g.grid.near(mo.x, mo.y, mo.r + 60, near)) { if (!g.canEat(g.player, o) || !reachable(g, o)) continue; const op = w.get(o, "pos"); if (!op) continue;
      const ob = w.get(o, "body")!; if (Math.hypot(op.x - mo.x, op.y - mo.y) < mo.r + ob.len * 0.3) eat(g, g.player, o); }
    if (m.strike.t > RULES.strikeOut + RULES.strikeBack) { m.strike = null; m.cool = RULES.cool; }
  }
  // hunters catch what they hunt when their mouth meets it (and it is at their height)
  for (const [e, p, body, mind, alt] of w.query("pos", "body", "mind", "alt")) {
    if (mind.light || mind.mode !== "hunt" || !mind.target) continue;
    const t = mind.target, tp = w.get(t, "pos"); if (!tp) { mind.target = 0; continue; }
    const hx = p.x + Math.cos(body.heading) * body.len * 0.3, hy = p.y + Math.sin(body.heading) * body.len * 0.3, tb = w.get(t, "body")!, ta = w.get(t, "alt")!;
    if (Math.hypot(tp.x - hx, tp.y - hy) > body.len * 0.35 + tb.len * 0.3 || Math.abs(ta.z - alt.z) > 0.35) continue;
    if (t === g.player) bitten(g, e); else if (g.canEat(e, t)) eat(g, e, t);
  }
}

// a hunter bit you: Sting makes it let go and stuns it; otherwise it costs you dearly, and when you are empty, you are eaten
function bitten(g: Game, by: number): void {
  const m = g.maw, mind = g.w.get(by, "mind")!, b = g.w.get(by, "body")!;
  if (m.stunT > 0) return;
  mind.calm = RULES.hunterRest * (m.traits.sting > 0 ? 1 + m.traits.sting : 1); mind.mode = "rest"; mind.target = 0;
  if (m.traits.sting > 0) { m.stunT = 0.4; return; }
  m.energy -= RULES.bite; m.stunT = 1.1;
  g.ev.emit({ type: "caught", by, prey: g.player });
  if (m.energy <= 0) die(g, "eaten", BY_KEY[b.species]?.name);
}
function die(g: Game, cause: "eaten" | "starved", by?: string): void {
  const m = g.maw; if (m.state === "dead") return; m.state = "dead"; g.cause = cause === "eaten" ? `Eaten by ${by ?? "something"}` : "Starved";
  g.ev.emit({ type: "died", who: g.player, cause, by });
}
