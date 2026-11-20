// Who eats whom from bodies (shared/engine/ecology/ecology-diet.js, loaded as the tank loads it) over a small made-up tank
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";

type Fish = { sp: number; scale: number; x: number; y: number; z: number; vx: number; vy: number; diet?: { traits: string[]; frame: string; tier: number }; guest?: boolean; hunter?: boolean };
const KEYS = ["wisp", "koi", "hunter", "pincer", "newcomer", "giant"], LEN = [0.32, 1, 2.2, 1.15, 1, 5], MENU: Record<string, string[]> = { koi: ["wisp"], hunter: ["koi", "wisp"], pincer: ["koi"], giant: ["hunter"] };
function tank() {
  const SP = KEYS.map((key, i) => ({ key, name: key, swim: { len: LEN[i] }, beh: { school: key === "koi" ? 1.25 : 0 }, preySet: new Set((MENU[key] ?? []).map((k) => KEYS.indexOf(k))) }));
  const sim = { speciesRT: SP, fish: [] as Fish[], hooks: { lurers: [] } as Record<string, any>, cfg: { size: 10 }, _bodyLen: (f: Fish) => 10 * f.scale * SP[f.sp].swim.len };
  const g: any = { window: {}, Math, performance: { now: () => 0 } }; g.window.EcologySim = { bodyLen: (s: typeof sim, f: Fish) => s._bodyLen(f) };
  vm.createContext(g); for (const file of ["eco-core.js", "ecology-diet.js"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../../shared/engine/ecology/" + file), "utf8"), g);   // the core first: the web itself is its (src/core/web.ts)
  const D = g.window.EcologyDiet, diet = D.create(sim, { species: { TIER2_KEYS: ["hunter"], TIER3_KEYS: ["giant"] } });
  const add = (key: string, scale = 1): Fish => { const f: Fish = { sp: KEYS.indexOf(key), scale, x: 0, y: 0, z: 0.5, vx: 9, vy: 0 }; sim.fish.push(f); sim.hooks.onSpawn(f); (f.diet as any).gut = []; return f; };
  return { sim, diet, D, add, eats: (f: Fish, o: Fish) => { const e = sim.hooks.eats(f, o); return e !== undefined ? e : SP[f.sp].preySet.has(o.sp) && sim.hooks.canEat(f, o); } };
}

describe("the food web from bodies", () => {
  it("a hunter eats a kind nobody wrote on its menu, when the weights fit", () => {
    const t = tank(), h = t.add("hunter"), n = t.add("newcomer");
    expect(t.D.ratio(t.diet, h, n)).toBeCloseTo(2.2 ** 3, 5); expect(t.eats(h, n)).toBe(true);
    t.diet.web = "lists"; expect(t.eats(h, n)).toBe(false);          // the hand-written menus alone
  });
  it("prey too near its own weight is refused, and a big one of the same kind takes what a small one cannot", () => {
    const t = tank(), small = t.add("pincer", 0.8), big = t.add("pincer", 1.3), n = t.add("newcomer");
    t.diet.web = "body"; (small.diet as any).frame = "shoal"; (big.diet as any).frame = "shoal";   // without their claws
    expect(t.eats(small, n)).toBe(false); expect(t.eats(big, n)).toBe(true);
  });
  it("claws take on heavier prey; plate asks for a heavier hunter", () => {
    const t = tank(), p = t.add("pincer"), n = t.add("newcomer"), h = t.add("hunter", 0.7), m = t.add("newcomer");
    expect(t.eats(p, n)).toBe(true);                                 // 1.52 times its weight, 2.5 with claws
    expect(t.eats(h, m)).toBe(true); (m.diet as any).traits = ["plate"]; expect(t.eats(h, m)).toBe(false);
  });
  it("a grazer never hunts, a species' own menu still holds, and no one eats its own kind", () => {
    const t = tank(), k = t.add("koi", 1.3), n = t.add("newcomer", 0.65), h = t.add("hunter"), h2 = t.add("hunter", 0.65), k2 = t.add("koi");
    expect(t.eats(k, n)).toBe(false); expect(t.eats(h, k2)).toBe(true); expect(t.eats(h, h2)).toBe(false);
  });
  it("prey fear what could eat them, though its kind is on no list of theirs", () => {
    const t = tank(), h = t.add("hunter"), n = t.add("newcomer"), k = t.add("koi");
    expect(t.sim.hooks.fears(n, h)).toBe(true); expect(t.sim.hooks.fears(h, n)).toBe(false); expect(t.sim.hooks.fears(n, k)).toBe(false);
  });
});
