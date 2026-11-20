// The run layer against the tank's real places (shared/engine/ecology/maw-stages.js, loaded as the page loads it)
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import * as Run from "../src/run/run";
import { Rng, seedOf } from "../src/core/rng";

const g = { window: {} as Record<string, unknown>, localStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../../shared/engine/ecology/maw-stages.js"), "utf8"), g);
const PLACES = (g.window.MawStages as { LIST: Run.Place[] }).LIST;

describe("a run", () => {
  it("the same seed draws the same numbers", () => {
    const a = new Rng(42), b = new Rng(42); expect([a.next(), a.next()]).toEqual([b.next(), b.next()]); expect(seedOf("maw")).toBe(seedOf("maw"));
  });
  it("is the seven places in order, varied by its seed, the same seed the same run", () => {
    const a = Run.create(7, PLACES), b = Run.create(7, PLACES), c = Run.create(8, PLACES);
    expect(a.rings.map((r) => r.place.id)).toEqual(PLACES.map((p) => p.id));
    expect(JSON.stringify(a.rings)).toBe(JSON.stringify(b.rings)); expect(JSON.stringify(a.rings)).not.toBe(JSON.stringify(c.rings));
    for (const r of a.rings) { for (const k of Object.keys(PLACES[r.i].roster)) expect(r.place.roster[k]).toBeGreaterThanOrEqual(1);
      expect(r.gate.x).toBeGreaterThan(0.1); expect(r.gate.x).toBeLessThan(0.9); }
    expect(PLACES[0].roster.worm).toBe(8);   // the places themselves are never changed
  });
  it("is written as a mission first: every place needs only what a place before it gave", () => {
    const m = Run.create(7, PLACES).mission;
    expect(m.beats.map((b) => b.id)).toEqual(PLACES.map((p) => p.id)); expect(m.missing).toEqual([]); expect(Run.unmet(m.beats)).toEqual([]);
    expect(m.beats.find((b) => b.id === "deep")).toMatchObject({ needs: ["eyes", "swim"], gives: ["sonar"], optional: false });
    expect(m.beats.filter((b) => b.optional).map((b) => b.id)).toEqual(["spires", "colony"]); expect(m.shortest).toBe(5);
  });
  it("a shorter run leaves out only places nothing later depends on, and never goes below what can be cleared", () => {
    for (let seed = 1; seed <= 40; seed++) for (const n of [6, 5, 3]) { const r = Run.create(seed, PLACES, { rings: n });
      expect(r.rings.length).toBe(Math.max(5, n)); expect(Run.unmet(r.mission.beats)).toEqual([]);
      expect(r.rings[0].place.id).toBe("floor"); expect(r.rings[r.rings.length - 1].place.id).toBe("apex"); expect(r.rings.map((x) => x.i)).toEqual(r.rings.map((_, i) => i));
      for (const d of r.mission.dropped) expect(["spires", "colony"]).toContain(d); }
    const six = new Set(Array.from({ length: 40 }, (_, k) => Run.create(k + 1, PLACES, { rings: 6 }).mission.dropped[0])); expect(six.size).toBe(2);   // the seed chooses which
    // a place draws the same whether or not another was left out
    const full = Run.create(9, PLACES), cut = Run.create(9, PLACES, { rings: 5 }); expect(cut.rings[3].seed).toBe(full.rings[3].seed); expect(cut.rings[4].place.id).toBe("apex"); expect(cut.rings[4].seed).toBe(full.rings[6].seed);
  });
  it("says so when a place is edited into a dead end, and still builds the run", () => {
    const places = PLACES.map((p) => (p.id === "frond" ? { ...p, goal: { meals: 10 } } : p)), r = Run.create(2, places, { rings: 5 });
    expect(r.mission.missing.map((x) => x.id + ":" + x.need)).toContain("shoals:eyes"); expect(r.rings.length).toBeGreaterThanOrEqual(5);
  });
  it("opens a gate on the key, goes inward through it, and is won at the last ring", () => {
    const r = Run.create(3, PLACES);
    expect(Run.advance(r)).toBeNull();                     // shut: no way in yet
    expect(Run.open(r)).toBe("opened"); expect(Run.advance(r)?.place.id).toBe("frond"); expect(r.open).toBe(false);
    while (!Run.last(r)) { Run.open(r); Run.advance(r); }
    expect(Run.open(r)).toBe("won"); expect(r.state).toBe("won");
  });
  it("carries what it saw and ate into the nest, and says what was new", () => {
    const nest = Run.emptyNest(), r = Run.create(5, PLACES);
    Run.ate(r, "worm"); Run.ate(r, "worm"); Run.open(r); Run.advance(r); Run.end(r, "eaten");
    const out = Run.record(nest, r);
    expect(nest.runs).toBe(1); expect(nest.eaten.worm).toBe(2); expect(nest.deepest).toBe(1); expect(out.deeper).toBe(true); expect(out.fresh.length).toBeGreaterThan(5);
    const r2 = Run.create(6, PLACES); Run.end(r2, "starved"); expect(Run.record(nest, r2).fresh).toEqual(r2.seen.filter((k) => !out.fresh.includes(k)));
    expect(Run.readNest(JSON.stringify(nest)).runs).toBe(2); expect(Run.readNest("{bad").runs).toBe(0);
  });
  it("tracks any ability a place names, and what a place says outright", () => {
    const P = (id: string, kit: Record<string, unknown>, goal: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ ...PLACES[0], id, kit, goal, ...more });
    const ok = [P("a", {}, { cloak: 1, meals: 4 }), P("b", { cloak: 1 }, { form: "swim" }, { gives: ["climb"] }), P("c", { form: "swim", mass: 12 }, { tier: 2 }, { needs: ["climb"] })];
    expect(Run.unmet(ok.map(Run.beatOf))).toEqual([]);
    expect(Run.beatOf(ok[1])).toMatchObject({ needs: ["cloak"], gives: ["swim", "climb"] }); expect(Run.beatOf(ok[2]).needs).toEqual(["swim", "climb"]);   // sizes and counts are not abilities
    const bad = [ok[0], P("b", { leap: 1 }, {}), P("c", {}, {}, { needs: ["climb"] })];
    expect(Run.unmet(bad.map(Run.beatOf)).map((x) => x.id + ":" + x.need)).toEqual(["b:leap", "c:climb"]);
  });
});
