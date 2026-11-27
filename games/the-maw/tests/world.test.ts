// The world and its save (packages/world/world.js, loaded as a page loads it)
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";

const root = path.resolve(__dirname, "../../..");
const g = { window: {} as Record<string, any> };
vm.runInNewContext(fs.readFileSync(path.join(root, "packages/level/level.js"), "utf8"), g);
vm.runInNewContext(fs.readFileSync(path.join(root, "packages/world/world.js"), "utf8"), g);
const L = g.window.ForgeLevel, W = g.window.ForgeWorld;
const file = (n: string) => L.parse(fs.readFileSync(path.join(root, "games/the-maw/levels", n + ".json"), "utf8"));
const FILES = JSON.parse(fs.readFileSync(path.join(root, "games/the-maw/levels/index.json"), "utf8"));

function small() { const w = W.create({ name: "Two rooms", seed: 11 });
  W.addLevel(w, { id: "floor", level: "field", away: "freeze" }); W.addLevel(w, { id: "pit", level: "duel", away: "live" }); W.addLevel(w, { id: "vault", level: "duel" });
  W.link(w, "floor", "pit"); W.link(w, "pit", "vault", { needs: "key", both: false }); return w; }

describe("a world", () => {
  it("checks clean, and says what is wrong when it is not", () => {
    const w = small(); expect(W.validateWorld(w, { files: FILES }).errors).toEqual([]);
    expect(W.validateWorld(w, { files: FILES }).warnings.map((x: any) => x.id)).toEqual(["vault"]);   // no way out of the vault
    const b = small(); b.links.push({ from: "pit", to: "nowhere" }); b.levels[1].away = "sometimes"; b.levels[2].level = "missing";
    expect(W.validateWorld(b, { files: FILES }).errors.length).toBe(3);
    const c = small(); W.addLevel(c, { id: "attic", level: "field" }); expect(W.validateWorld(c).warnings.some((x: any) => x.id === "attic")).toBe(true);
  });
  it("gives each level its own seed, and adding a level moves no other", () => {
    const w = small(), a = W.seedOf(w, "floor"), p = W.seedOf(w, "pit"); expect(a).not.toBe(p);
    W.addLevel(w, { id: "attic", level: "field" }); expect(W.seedOf(w, "floor")).toBe(a); expect(W.seedOf(w, "pit")).toBe(p);
    W.addLevel(w, { id: "fixed", level: "field", seed: 42 }); expect(W.seedOf(w, "fixed")).toBe(42);
  });
  it("the example world in the repo is sound and names real level files", () => {
    const w = W.parse(fs.readFileSync(path.join(root, "games/the-maw/worlds/example.json"), "utf8")), v = W.validateWorld(w, { files: FILES }); expect(v.errors).toEqual([]); expect(v.warnings).toEqual([]);
    const s = W.newSave(w), e = W.go(w, s, w.start); expect(L.validate(W.levelFor(file(e.level), e.changes).level).errors).toEqual([]);
  });
  it("round trips through text", () => { const w = small(); expect(W.parse(W.stringify(w))).toEqual(w); expect(() => W.parse('{"format":"forge-world","version":99}')).toThrow(); });
});

describe("a save", () => {
  it("starts at the world's start and only goes where a link leads", () => {
    const w = small(), s = W.newSave(w); expect(W.canGo(w, s, "pit")).toBe(false); expect(() => W.enter(w, s, "pit")).toThrow();
    const e = W.enter(w, s, "floor"); expect(e).toMatchObject({ level: "field", first: true, away: 0, changes: [] }); expect(W.canGo(w, s, "pit")).toBe(true); expect(W.canGo(w, s, "vault")).toBe(false);
  });
  it("keeps only what differs, and makes the level again from it", () => {
    const w = small(), s = W.newSave(w); W.enter(w, s, "floor");
    const made = file("field"), now = JSON.parse(JSON.stringify(made)), gone = now.entities.find((e: any) => e.type === "encounter"), tower = now.entities.find((e: any) => e.type === "tower");
    now.entities = now.entities.filter((e: any) => e !== gone); tower.x += 5; now.entities.push({ id: "g99", type: "grove", x: 1, y: 2, r: 6, plants: 4 });
    W.tick(s, 30); W.leave(w, s, { made, now, state: { food: 3 } });
    const r = s.levels.floor; expect(r.changes.length).toBe(3); expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(now).length / 4);
    W.enter(w, s, "floor"); const again = W.levelFor(made, s.levels.floor.changes); expect(again.skipped).toBe(0);
    const key = (lv: any) => JSON.stringify([...lv.entities].sort((a: any, b: any) => a.id < b.id ? -1 : 1)); expect(key(again.level)).toBe(key(now));
  });
  it("skips a change that no longer fits instead of failing", () => {
    const made = file("duel"); const out = W.levelFor(made, [{ op: "remove", id: "not-there" }, { op: "set", id: made.entities[0].id, props: { x: 3 } }]);
    expect(out.skipped).toBe(1); expect(out.level.entities[0].x).toBe(3);
  });
  it("a frozen level waits; a living one goes on while you are away", () => {
    const w = small(), s = W.newSave(w); W.go(w, s, "floor"); W.tick(s, 10);
    W.go(w, s, "pit"); W.tick(s, 40); expect(s.levels.floor.leftAt).toBe(10);
    const f = W.go(w, s, "floor"); expect(f.away).toBe(0); expect(f.first).toBe(false); W.tick(s, 25);
    expect(W.awayFor(w, s, "pit")).toBe(25); expect(W.go(w, s, "pit").away).toBe(25); expect(W.awayFor(w, s, "pit")).toBe(0);
  });
  it("a gate opens on a flag", () => { const w = small(), s = W.newSave(w); W.go(w, s, "floor"); W.go(w, s, "pit");
    expect(W.canGo(w, s, "vault")).toBe(false); expect(() => W.go(w, s, "vault")).toThrow(); expect(s.at).toBe("pit"); W.setFlag(s, "key"); expect(W.canGo(w, s, "vault")).toBe(true); expect([...W.reach(w, W.flagsOf(s))].sort()).toEqual(["floor", "pit", "vault"]); });
  it("dying ends the run, keeps what lasts, and treats the levels by the rule", () => {
    for (const rule of ["keep", "reset"]) { const w = small(), s = W.newSave(w, { onDeath: rule }); W.enter(w, s, "floor"); W.setFlag(s, "key"); W.setFlag(s, "met-the-angel", { lasting: true }); W.tick(s, 50);
      W.go(w, s, "pit", { changes: [{ op: "remove", id: "e1" }] }); W.tick(s, 20);
      const d = W.die(w, s, { unlocked: ["sonar"] }); expect(d).toMatchObject({ rule, run: 1, secs: 70 });
      expect(s.run).toMatchObject({ n: 2, flags: {} }); expect(s.lasting).toMatchObject({ runs: 1, unlocked: ["sonar"], flags: { "met-the-angel": true } }); expect(s.at).toBe(null);
      expect(Object.keys(s.levels).length).toBe(rule === "keep" ? 2 : 0); if (rule === "keep") expect(s.levels.floor.changes.length).toBe(1);
      expect(W.validateSave(s, w).errors).toEqual([]); expect(W.enter(w, s, "floor").first).toBe(rule === "reset"); }
  });
  it("the rule is 'keep' until it is decided, and can be given at the moment", () => { const w = small(), s = W.newSave(w); expect(s.rules.onDeath).toBe("keep"); W.enter(w, s, "floor"); expect(W.die(w, s, { onDeath: "reset" }).rule).toBe("reset"); });
  it("round trips through text, and a save of another world is refused", () => {
    const w = small(), s = W.newSave(w); W.enter(w, s, "floor"); W.tick(s, 5); expect(W.parse(W.stringify(s))).toEqual(s); expect(W.stringify(W.parse(W.stringify(s)))).toBe(W.stringify(s));
    const other = W.create({ seed: 12 }); W.addLevel(other, { id: "floor", level: "field" }); expect(W.validateSave(s, other).errors.length).toBe(1);
  });
});

describe("a page loaded again in the middle of a level", () => {
  it("resumes it, keeps the time away until it is played, and counts nothing twice", () => {
    const w = small(), s = W.newSave(w); W.go(w, s, "floor"); W.go(w, s, "pit"); W.tick(s, 40); W.go(w, s, "floor"); W.tick(s, 15);
    const e = W.go(w, s, "pit"); expect(e.away).toBe(15);
    const r = W.resume(w, W.parse(W.stringify(s))); expect(r).toMatchObject({ id: "pit", first: false, away: 15 }); expect(W.resume(w, (() => { const t = W.newSave(w); W.go(w, t, "floor"); return t; })()).first).toBe(true); expect(s.levels.pit.visits).toBe(2);
    W.settle(s); expect(W.resume(w, s).away).toBe(0);
  });
  it("checks a level's exits against the world's links", () => {
    const w = small(), mk = (to: string[]) => ({ entities: to.map((t, i) => ({ id: "e" + i, type: "exit", to: t })) });
    expect(W.checkExits(w, "floor", mk(["pit"]))).toEqual({ errors: [], warnings: [] });
    expect(W.checkExits(w, "floor", mk(["pit", "nowhere"])).errors.length).toBe(1);
    expect(W.checkExits(w, "floor", mk(["vault"])).warnings.length).toBe(2);   // no link floor to vault; and the link to pit has no exit
    expect(W.checkExits(w, "floor", mk([])).warnings.length).toBe(1);
  });
});

describe("the level select", () => {
  it("goes to a level already reached, links or not, and to the start; refuses one not reached", () => {
    const w = small(), s = W.newSave(w); W.go(w, s, w.start);
    expect(() => W.jump(w, s, "pit")).toThrow(/not been reached/);
    W.go(w, s, "pit"); W.go(w, s, "floor");
    const e = W.jump(w, s, "pit"); expect(e.id).toBe("pit"); expect(s.at).toBe("pit");
    const f = W.jump(w, s, w.start); expect(f.id).toBe(w.start); expect(s.at).toBe(w.start);
    expect(W.clearedFlag("pit")).toBe("cleared-pit");
  });
});
