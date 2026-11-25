// The level format (packages/level/level.js, loaded as a page loads it) and the level files kept in games/the-maw/levels
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";

const root = path.resolve(__dirname, "../../..");
const g = { window: {} as Record<string, any> };
vm.runInNewContext(fs.readFileSync(path.join(root, "packages/level/level.js"), "utf8"), g);
const L = g.window.ForgeLevel;
const fieldPage = fs.readFileSync(path.join(root, "games/the-maw/field/index.html"), "utf8");

describe("the level format", () => {
  it("lists the same encounters as the field page's patterns", () => {
    const ids = [...fieldPage.matchAll(/\{ id: '([a-z]+)', name: '([^']+)', key: '/g)].map((m) => m[1] + ":" + m[2]).sort();
    expect(ids.length).toBe(21); expect(L.ENCOUNTERS.map((e: any) => e.id + ":" + e.name).sort()).toEqual(ids);
    const mobile = /const MOBILE = new Set\(\[([^\]]+)\]\)/.exec(fieldPage)![1]; for (const e of L.ENCOUNTERS) if (e.needs === "tower") expect(mobile).not.toContain("'" + e.id + "'");
  });
  it("every template is a level with nothing wrong", () => {
    for (const key of Object.keys(L.TEMPLATES)) { const lv = L.template(key), v = L.validate(lv); expect(v.errors, key).toEqual([]); expect(lv.entities.filter((e: any) => e.type === "start").length).toBe(1); }
    const f = L.template("field"); expect(f.entities.filter((e: any) => e.type === "tower").length).toBe(5); expect(f.entities.filter((e: any) => e.type === "grove").length).toBe(5);
    expect(f.entities.filter((e: any) => e.type === "encounter").length).toBe(L.FIELD_ROSTER.reduce((a: number, r: any) => a + r[1], 0));
    expect(L.validate(f).warnings).toEqual([]);
  });
  it("places by rule the same way from the same seed, and differently from another", () => {
    const a = L.stringify(L.template("field", { seed: 3 })), b = L.stringify(L.template("field", { seed: 3 })), c = L.stringify(L.template("field", { seed: 4 }));
    expect(a).toBe(b); expect(a).not.toBe(c);
  });
  it("a file comes back as the level it was, and the same level is always the same file", () => {
    const lv = L.template("field"), text = L.stringify(lv), back = L.parse(text);
    expect(L.stringify(back)).toBe(text); expect(back.entities.length).toBe(lv.entities.length); expect(text.endsWith("\n")).toBe(true);
    expect(() => L.parse("{")).toThrow(/not JSON/); expect(() => L.parse('{"format":"other"}')).toThrow(/not a Forge level/);
    expect(() => L.parse(JSON.stringify({ ...lv, version: 99 }))).toThrow(/reads up to/);
  });
  it("says what is wrong", () => {
    const msgs = (lv: any) => L.validate(lv).errors.map((e: any) => e.msg).join(" | ");
    const base = () => L.template("duel");
    { const lv = base(); lv.entities = lv.entities.filter((e: any) => e.type !== "start"); expect(msgs(lv)).toMatch(/No Maw start/); }
    { const lv = base(); lv.entities.push({ ...lv.entities[0], id: "e9" }); expect(msgs(lv)).toMatch(/More than one Maw start/); }
    { const lv = base(); lv.entities[2].x = 400; expect(msgs(lv)).toMatch(/outside the field/); }
    { const lv = base(); lv.entities[2].pattern = "nope"; expect(msgs(lv)).toMatch(/unknown pattern/); }
    { const lv = base(); lv.entities[1].r = 99; expect(msgs(lv)).toMatch(/Radius must be/); }
    { const lv = base(); lv.entities[2].id = "e2"; expect(msgs(lv)).toMatch(/share the id/); }
    { const lv = base(); lv.entities[2].tower = "e77"; expect(msgs(lv)).toMatch(/not in the level/); }
    { const lv = base(); lv.entities[2].pattern = "drop"; lv.entities.splice(1, 1); expect(msgs(lv)).toMatch(/needs a tower/); }
    { const lv = base(); lv.entities[2].x = lv.entities[1].x; lv.entities[2].y = lv.entities[1].y; expect(msgs(lv)).toMatch(/inside a tower/); }
    { const lv = base(); lv.entities.push({ ...lv.entities[1], id: "e8", x: lv.entities[1].x + 1 }); expect(msgs(lv)).toMatch(/towers overlap/); }
    { const lv = base(); lv.life.ambient[0].species = "dodo"; expect(L.validate(lv, { species: ["koi", "worm"] }).errors.map((e: any) => e.msg).join()).toMatch(/unknown species: dodo/); }
    { const lv = base(); lv.field.crowd = 5; expect(msgs(lv)).toMatch(/Field size/); }
    expect(L.validate(L.create()).warnings.map((w: any) => w.msg).join()).toMatch(/No towers.*No encounters/);
  });
});

describe("edits", () => {
  const snap = (d: any) => L.stringify(d.level);
  it("every command undoes and redoes exactly", () => {
    const d = L.doc(L.template("duel")), s0 = snap(d);
    L.apply(d, { op: "add", entity: L.entity("encounter", 20, 20, { pattern: "gaze" }) }); const s1 = snap(d); expect(d.level.entities.length).toBe(4); expect(d.level.entities[3].id).toBe("e4");
    L.apply(d, { op: "set", id: "e4", props: { x: -30, pattern: "slam" } }); const s2 = snap(d);
    L.apply(d, { op: "level", path: "field.crowd", value: 200 }); const s3 = snap(d);
    L.apply(d, { op: "level", path: "name", value: "Renamed" }); const s4 = snap(d);
    L.apply(d, { op: "batch", cmds: [{ op: "remove", id: "e3" }, { op: "add", entity: L.entity("grove", 5, 5) }] }); const s5 = snap(d);
    for (const want of [s4, s3, s2, s1, s0]) { expect(L.undo(d)).toBe(true); expect(snap(d)).toBe(want); } expect(L.undo(d)).toBe(false);
    for (const want of [s1, s2, s3, s4, s5]) { expect(L.redo(d)).toBe(true); expect(snap(d)).toBe(want); } expect(L.redo(d)).toBe(false);
  });
  it("removing a tower clears what pointed at it, and undo puts both back in place", () => {
    const d = L.doc(L.template("duel")); L.apply(d, { op: "set", id: "e3", props: { pattern: "drop", tower: "e2" } }); const before = snap(d);
    L.apply(d, { op: "remove", id: "e2" }); expect(L.byId(d.level, "e3").tower).toBe(""); expect(L.byId(d.level, "e2")).toBe(null);
    L.undo(d); expect(snap(d)).toBe(before); expect(d.level.entities[1].id).toBe("e2");
  });
  it("a drag is one undo step; a new edit after an undo drops the redo", () => {
    const d = L.doc(L.template("duel")), s0 = snap(d);
    for (let i = 1; i <= 10; i++) L.apply(d, { op: "set", id: "e3", props: { x: i, y: -10 - i } }, { merge: "drag:e3" }); L.seal(d);
    expect(d.undo.length).toBe(1); const dragged = snap(d); L.undo(d); expect(snap(d)).toBe(s0); L.redo(d); expect(snap(d)).toBe(dragged);
    L.apply(d, { op: "set", id: "e3", props: { x: 50 } }, { merge: "drag:e3" }); expect(d.undo.length).toBe(2);   // after seal: a new step
    L.undo(d); L.apply(d, { op: "level", path: "seed", value: 9 }); expect(L.redo(d)).toBe(false);
    expect(L.apply(d, { op: "remove", id: "nope" })).toBe(false);
  });
});

describe("the levels in games/the-maw/levels", () => {
  const dir = path.join(root, "games/the-maw/levels"), files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json") : [];
  it("there is at least one, and index.json (what the editor's Open lists) names exactly them", () => { expect(files.length).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")).slice().sort()).toEqual(files.map((f) => f.replace(/\.json$/, "")).sort()); });
  for (const f of files) it(f + " has nothing wrong and is written the standard way", () => {
    const text = fs.readFileSync(path.join(dir, f), "utf8"), lv = L.parse(text), v = L.validate(lv, { species: L.AMBIENT.map((a: any) => a[0]) });
    expect(v.errors).toEqual([]); expect(L.stringify(lv)).toBe(text);
  });
});
