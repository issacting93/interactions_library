// The level format (packages/level/level.js, loaded as a page loads it) and the level files kept in games/the-maw/levels
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";

const root = path.resolve(__dirname, "../../..");
const g = { window: {} as Record<string, any> };
vm.runInNewContext(fs.readFileSync(path.join(root, "packages/level/level.js"), "utf8"), g);
const L = g.window.ForgeLevel;
const gs = { window: {} as Record<string, any>, localStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(fs.readFileSync(path.join(root, "packages/maw/maw-stages.js"), "utf8"), gs);
const STAGES = gs.window.MawStages;
const gc = { window: {} as Record<string, any> }; vm.runInNewContext(fs.readFileSync(path.join(root, "packages/level/catalog.js"), "utf8"), gc);
const ALL = gc.window.ForgeCatalog.species.map((x: any) => x[0]);
const fieldPage = fs.readFileSync(path.join(root, "games/the-maw/field/index.html"), "utf8");

describe("the level format", () => {
  it("lists the same encounters as the field page's patterns", () => {
    const ids = [...fieldPage.matchAll(/\{ id: '([a-z]+)', name: '([^']+)', key: '/g)].map((m) => m[1] + ":" + m[2]).sort();
    expect(ids.length).toBe(21); expect(L.ENCOUNTERS.map((e: any) => e.id + ":" + e.name).sort()).toEqual(ids);
    const mobile = /const MOBILE = new Set\(\[([^\]]+)\]\)/.exec(fieldPage)![1]; for (const e of L.ENCOUNTERS) if (e.needs === "tower") expect(mobile).not.toContain("'" + e.id + "'");
  });
  it("every template is a level with nothing wrong", () => {
    for (const key of Object.keys(L.TEMPLATES)) { const lv = L.template(key), v = L.validate(lv, { speciesAll: ALL }); expect(v.errors, key).toEqual([]); expect(lv.entities.filter((e: any) => e.type === "start").length).toBe(lv.kind === "stage" ? 0 : 1); }
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

describe("tank stages as levels", () => {
  it("the catalogue is the kit's own species list, up to date", () => {
    const w: any = { console }; w.window = w; vm.runInNewContext(fs.readFileSync(path.join(root, "packages/kit/ecology-species.js"), "utf8"), w);
    const S = (w.EcologySpecies && w.EcologySpecies.SPECIES) || w.SPECIES; expect(gc.window.ForgeCatalog.species).toEqual(S.map((x: any) => [x.key, x.name]));
  });
  it("each of the seven shipped stages can be written as a level and comes back the same", () => {
    expect(STAGES.LIST.length).toBe(7);
    for (const st of STAGES.LIST) { const lv = L.parse(L.stringify(L.fromStage(st))), v = L.validate(lv, { speciesAll: ALL }); expect(v.errors, st.id).toEqual([]);
      const back = L.toStage(lv, st.id); for (const k of ["name", "place", "verb", "brief", "trick", "roster", "crew", "props", "env", "kit", "goal", "press"]) expect(back[k], st.id + "." + k).toEqual(st[k] === undefined ? {} : st[k]);
      expect(STAGES.goalText(back, {})).toBe(STAGES.goalText(st, {})); }
  });
  it("a version 1 file is brought forward as a field", () => {
    const old = JSON.parse(L.stringify(L.template("duel"))); old.version = 1; delete old.kind; const lv = L.migrate(old); expect(lv.version).toBe(L.VERSION); expect(lv.kind).toBe("field"); const two = JSON.parse(L.stringify(L.template("stage"))); two.version = 2; expect(L.validate(L.migrate(two), { speciesAll: ALL }).errors).toEqual([]); expect(L.validate(lv).errors).toEqual([]);
  });
  it("says what is wrong with a stage", () => {
    const msgs = (lv: any) => L.validate(lv, { speciesAll: ALL }).errors.map((e: any) => e.msg).join(" | "), base = () => L.template("stage");
    { const lv = base(); lv.stage.roster = {}; expect(msgs(lv)).toMatch(/roster is empty/); }
    { const lv = base(); lv.stage.roster.dodo = 4; expect(msgs(lv)).toMatch(/"dodo", which is not a species/); }
    { const lv = base(); lv.stage.roster.worm = 500; expect(msgs(lv)).toMatch(/Roster count for worm/); }
    { const lv = base(); lv.stage.crew = { ghost: 2 }; expect(msgs(lv)).toMatch(/not a walker/); }
    { const lv = base(); lv.stage.goal = {}; expect(msgs(lv)).toMatch(/no goal/); }
    { const lv = base(); lv.stage.env.dark = 3; expect(msgs(lv)).toMatch(/Dark must be 0 to 1/); }
    { const lv = base(); lv.stage.goal = { eat: [{ keys: ["nobody"], n: 2 }] }; expect(msgs(lv)).toMatch(/Eat goal names "nobody"/); }
    { const lv = base(); delete lv.stage; expect(msgs(lv)).toMatch(/no stage settings/); }
    { const lv = base(); lv.kind = "zone"; expect(msgs(lv)).toMatch(/Unknown kind/); }
  });
  it("a stage can place its own towers, and they go with it only while its towers are on", () => {
    const lv = L.template("stage"); lv.stage.env.ruins = true; lv.entities.push({ ...L.entity("tower", -40, 0, { r: 8 }), id: "e1" }, { ...L.entity("tower", 40, 10, { r: 6, height: 0.6 }), id: "e2" });
    expect(L.validate(lv, { speciesAll: ALL })).toEqual({ ok: true, errors: [], warnings: [] }); const want = { towers: [{ x: -40, y: 0, r: 8, height: 0.82 }, { x: 40, y: 10, r: 6, height: 0.6 }] };
    expect(L.toStage(lv, "x").layout).toEqual(want); expect(STAGES.fromLevel(JSON.parse(L.stringify(lv)), "lv-x").layout).toEqual(want);   // the editor's way and the tank's way agree
    lv.stage.env.ruins = false; expect(L.toStage(lv, "x").layout).toBeUndefined(); expect(STAGES.fromLevel(JSON.parse(L.stringify(lv)), "lv-x").layout).toBeUndefined(); expect(L.validate(lv).warnings.map((w: any) => w.msg).join()).toMatch(/Towers is off/);
    lv.entities.push({ ...L.entity("grove", 0, 0), id: "e3" }); expect(L.validate(lv).errors.map((e: any) => e.msg).join()).toMatch(/towers, walls, landmarks and the Maw's start/);
    lv.entities.pop(); lv.entities[1].x = -36; expect(L.validate(lv).errors.map((e: any) => e.msg).join()).toMatch(/towers overlap/);
    expect(STAGES.fromLevel(L.template("duel"), "x")).toBe(null);
  });
  it("a stage can place walls and say where the Maw starts; the field cannot have walls yet", () => {
    const lv = L.template("stage"); lv.stage.env.ruins = true; lv.entities.push({ ...L.entity("wall", 0, 20, { len: 40, turn: 90 }), id: "e1" }, { ...L.entity("start", -30, 0), id: "e2" });
    expect(L.validate(lv, { speciesAll: ALL })).toEqual({ ok: true, errors: [], warnings: [] }); expect(L.toStage(lv, "x").layout).toEqual({ walls: [{ x0: 0, y0: 0, x1: 0, y1: 40, height: 0.14 }], start: [-30, 0] });
    lv.stage.env.ruins = false; expect(L.toStage(lv, "x").layout).toEqual({ start: [-30, 0] });   // the start holds whether or not anything stands
    lv.entities.push({ ...L.entity("start", 10, 0), id: "e3" }); expect(L.validate(lv).errors.map((e: any) => e.msg).join()).toMatch(/More than one Maw start/);
    const f = L.template("duel"); f.entities.push({ ...L.entity("wall", 20, 20), id: "e9" }); expect(L.validate(f).errors.map((e: any) => e.msg).join()).toMatch(/Walls are for tank stages/);
  });
  it("a stage can place landmarks; a kind that is placed stands in for its count", () => {
    const lv = L.template("stage"); lv.entities.push({ ...L.entity("landmark", 10, 10, { kind: "carcass" }), id: "e1" }, { ...L.entity("landmark", -20, 5, { kind: "boulder" }), id: "e2" });
    const v = L.validate(lv, { speciesAll: ALL }); expect(v.errors).toEqual([]); expect(v.warnings.map((w: any) => w.msg).join()).toMatch(/Placed boulder landmarks stand in place of the count/);
    expect(L.toStage(lv, "x").layout).toEqual({ props: [{ kind: "carcass", x: 10, y: 10 }, { kind: "boulder", x: -20, y: 5 }] });   // towers off: landmarks still go
    lv.entities[0].kind = "statue"; expect(L.validate(lv).errors.map((e: any) => e.msg).join()).toMatch(/unknown kind "statue"/);
    const f = L.template("duel"); f.entities.push({ ...L.entity("landmark", 20, 20), id: "e9" }); expect(L.validate(f).errors.map((e: any) => e.msg).join()).toMatch(/Landmarks are for tank stages/);
  });
  it("the stage list takes more places without touching the seven, and cleans what they say", () => {
    const store: Record<string, string> = {}, w: any = { window: {}, localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } };
    const src = fs.readFileSync(path.join(root, "packages/maw/maw-stages.js"), "utf8"); vm.runInNewContext(src, w); const M = w.window.MawStages;
    const lv = L.template("stage"); lv.name = "Swift <b>Water</b>"; lv.stage.brief = "<img src=x onerror=1>hello"; const st = M.add(L.toStage(lv, "x-swift"));
    expect(M.LIST.length).toBe(7); expect(M.EXTRA.length).toBe(1); expect(st.n).toBe(8); expect(st.name).toBe("Swift bWater/b"); expect(st.brief).not.toMatch(/[<>]/); expect(M.get("x-swift")).toBe(st); expect(M.next("x-swift")).toBe(null);
    expect(M.add(L.toStage(lv, "floor"))).toBe(null); expect(M.add(L.toStage(lv, "bad id!"))).toBe(null); expect(M.check(st, { meals: 10 }).ok).toBe(true);
    const w2: any = { window: {}, localStorage: w.localStorage }; store["forge-level-draft"] = L.stringify(lv); vm.runInNewContext(src, w2); const M2 = w2.window.MawStages;   // a fresh page: kept ones come back, and the editor's draft is there as "draft"
    expect(M2.EXTRA.map((s: any) => s.id)).toEqual(["x-swift", "draft"]); expect(M2.get("draft").roster).toEqual(lv.stage.roster); M2.remove("x-swift"); expect(JSON.parse(store["maw-stages-extra"])).toEqual({});
  });
});

describe("prefabs", () => {
  const snap = (d: any) => L.stringify(d.level);
  const start = () => { const d = L.doc(L.template("duel")); L.apply(d, { op: "add", entity: L.entity("grove", 10, -20) }); L.apply(d, { op: "set", id: "e3", props: { pattern: "drop", tower: "e2", x: 0, y: -55 } }); return d; };
  it("some things become one prefab and one placing, standing where they stood", () => {
    const d = start(), flat = L.expand(d.level).entities.map((e: any) => [e.type, e.x, e.y]), m = L.makePrefab(d.level, ["e2", "e3", "e4"], "Drop tower"); L.apply(d, m.cmd);
    expect(d.level.entities.map((e: any) => e.type)).toEqual(["start", "prefab"]); expect(m.key).toBe("drop-tower"); expect(d.level.prefabs[m.key].parts.length).toBe(3);
    const X = L.expand(d.level); expect(X.entities.map((e: any) => [e.type, e.x, e.y])).toEqual(flat); const inst = d.level.entities[1].id; expect(X.entities.find((e: any) => e.type === "encounter").tower).toBe(inst + ".0"); expect(X.entities.filter((e: any) => e.from === inst).length).toBe(3);
    expect(L.validate(d.level).errors).toEqual([]); expect(L.stringify(L.parse(snap(d)))).toBe(snap(d));
    expect(L.makePrefab(d.level, ["e1"], "x")).toBe(null); expect(L.makePrefab(d.level, [inst], "x")).toBe(null);
  });
  it("a change to the prefab reaches every placing; a placing turns its parts", () => {
    const d = start(), m = L.makePrefab(d.level, ["e2", "e4"], "Tower grove"); L.apply(d, m.cmd); L.apply(d, { op: "add", entity: { ...L.entity("prefab", 40, 40), prefab: m.key, turn: 90 } });
    const P = d.level.prefabs[m.key]; L.apply(d, { op: "level", path: "prefabs." + m.key, value: { ...P, parts: P.parts.map((q: any) => (q.type === "tower" ? { ...q, r: 6 } : q)) } });
    const X = L.expand(d.level), tw = X.entities.filter((e: any) => e.type === "tower"); expect(tw.map((e: any) => e.r)).toEqual([6, 6]);
    const a = d.level.entities.find((e: any) => e.type === "prefab" && !e.turn), b = d.level.entities.find((e: any) => e.turn === 90), pt = P.parts.find((q: any) => q.type === "tower");
    expect([tw[0].x, tw[0].y]).toEqual([L.round(a.x + pt.dx), L.round(a.y + pt.dy)]); expect([tw[1].x, tw[1].y]).toEqual([L.round(b.x - pt.dy), L.round(b.y + pt.dx)]);   // a quarter turn
  });
  it("what is wrong with a part is said of its placing; a placing of nothing is an error", () => {
    const d = start(), m = L.makePrefab(d.level, ["e2", "e4"], "Tower grove"); L.apply(d, m.cmd); L.apply(d, { op: "add", entity: { ...L.entity("prefab", 96, 0), prefab: m.key } });
    const far = d.level.entities[d.level.entities.length - 1].id, v = L.validate(d.level); expect(v.ok).toBe(false); expect(v.errors.length).toBeGreaterThan(0); expect(v.errors.every((e: any) => e.id === far)).toBe(true); expect(v.errors.map((e: any) => e.msg).join()).toMatch(/outside the field/);
    L.undo(d); L.apply(d, { op: "add", entity: { ...L.entity("prefab", 0, 0), prefab: "nope" } }); expect(L.validate(d.level).errors.map((e: any) => e.msg).join()).toMatch(/does not have/);
  });
  it("unpacking gives the parts back as things of their own, and every step undoes exactly", () => {
    const d = start(), s0 = snap(d), m = L.makePrefab(d.level, ["e2", "e3", "e4"], "Drop tower"); L.apply(d, m.cmd); const s1 = snap(d); L.apply(d, L.unpackPrefab(d.level, d.level.entities[1].id));
    expect(d.level.entities.map((e: any) => e.type)).toEqual(["start", "tower", "encounter", "grove"]); const enc = d.level.entities.find((e: any) => e.type === "encounter"); expect(L.byId(d.level, enc.tower).type).toBe("tower"); expect(L.validate(d.level).errors).toEqual([]);
    L.undo(d); expect(snap(d)).toBe(s1); L.undo(d); expect(snap(d)).toBe(s0); L.redo(d); expect(snap(d)).toBe(s1);
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

describe("exits", () => {
  it("a field can place an exit and names the level it leads to; a tank stage cannot", () => {
    const f = L.template("field"); f.entities.push(Object.assign(L.entity("exit", 80, 0), { id: "e99", to: "pit" }));
    expect(L.validate(f).errors.map((e: any) => e.msg)).toEqual([]);
    f.entities[f.entities.length - 1].to = ""; expect(L.validate(f).errors.length).toBe(1);
    const s = L.template("stage"); s.entities.push(Object.assign(L.entity("exit", 10, 0), { id: "e9", to: "pit" })); expect(L.validate(s).errors.some((e: any) => /exit/i.test(e.msg))).toBe(true);
  });
});

describe("creatures and the Maw (version 4)", () => {
  it("a version 3 file comes forward to the current version, and every preset is a pattern as the field plays it", () => {
    const v3 = Object.assign(L.template("field"), { version: 3 }); const up = L.migrate(JSON.parse(JSON.stringify(v3))); expect(up.version).toBe(L.VERSION); expect(up.entities).toEqual(v3.entities);
    expect(Object.keys(L.PRESETS).sort()).toEqual(L.ENCOUNTERS.map((e: any) => e.id).sort()); expect(L.PRESETS.territory).toMatchObject({ from: "dragon", hp: 5 }); expect(L.PRESETS.charge.hp).toBe(3);
  });
  it("a creature made from a preset can be placed, checked and written, and a bad one is caught", () => {
    const lv = L.template("field"), d = L.doc(lv), r = L.creatureFrom(lv, "rage", "Starved hunter"); L.apply(d, r.cmd);
    const e = d.level.entities.find((q: any) => q.type === "encounter"); L.apply(d, { op: "set", id: e.id, props: { creature: r.key, pattern: "rage" } });
    expect(L.validate(d.level, { speciesAll: ["hunter"] }).errors).toEqual([]); expect(L.creatureOf(d.level, d.level.entities.find((q: any) => q.id === e.id)).name).toBe("Starved hunter");
    L.apply(d, { op: "level", path: "creatures." + r.key, value: Object.assign({}, r.value, { hp: 99, from: "nobody" }) });
    expect(L.validate(d.level, { speciesAll: ["hunter"] }).errors.map((x: any) => x.msg).length).toBe(2);
    L.apply(d, { op: "set", id: e.id, props: { creature: "gone" } }); expect(L.validate(d.level).errors.some((x: any) => /does not have/.test(x.msg))).toBe(true);
  });
  it("the Maw's body, legs and kit are checked, and nothing empty is written", () => {
    const lv = L.template("field"); lv.maw = { body: "serpent", legs: "raptor", kit: { eyes: 2, abil: ["spit"] } }; expect(L.validate(lv).errors).toEqual([]);
    lv.maw = { body: "blob", legs: "raptor", kit: { eyes: 3, abil: ["fly"] } }; expect(L.validate(lv).errors.length).toBe(3);
    const t = L.stringify(L.template("field")); expect(t).not.toMatch(/"creature": ""/); expect(t).not.toMatch(/"creatures"/);
  });
});

describe("the goal (version 5)", () => {
  const field = () => { const l = L.template("field"); return l; };
  const ok = (l: any) => L.validate(l, { species: L.AMBIENT.map((a: any) => a[0]) });
  it("a new level has no goal, and an older file comes forward with exits that open on the goal", () => {
    expect(L.create().goal.type).toBe("none");
    const old: any = L.create(); old.version = 4; delete old.goal; old.entities.push({ id: "e2", type: "exit", x: 10, y: 0, to: "next", r: 5 });
    const up = L.migrate(JSON.parse(JSON.stringify(old))); expect(up.goal.type).toBe("none"); expect(up.entities.find((e: any) => e.type === "exit").opens).toBe("goal");
  });
  it("each kind of goal is checked", () => {
    const l: any = field(); l.goal = { type: "eat", n: 5, species: "", target: "all", secs: 60 }; expect(ok(l).ok).toBe(true);
    l.goal.n = 0; expect(ok(l).errors.some((e: any) => /Eat/.test(e.msg))).toBe(true);
    l.goal = { type: "kill", n: 1, species: "", target: "e999", secs: 60 }; expect(ok(l).errors.some((e: any) => /Defeat/.test(e.msg))).toBe(true);
    l.goal.target = "all"; expect(ok(l).ok).toBe(true);
    l.goal = { type: "reach", n: 1, species: "", target: "all", secs: 60 }; expect(ok(l).errors.some((e: any) => /beacon/.test(e.msg))).toBe(true);
    l.entities.push(L.entity ? L.entity("beacon", 30, 30) : { id: "b1", type: "beacon", x: 30, y: 30, r: 6 }); l.entities[l.entities.length - 1].id = "b1"; expect(ok(l).ok).toBe(true);
    l.goal = { type: "survive", n: 1, species: "", target: "all", secs: 2 }; expect(ok(l).errors.some((e: any) => /Survive/.test(e.msg))).toBe(true);
    l.goal.secs = 90; expect(ok(l).ok).toBe(true);
  });
  it("says the goal in a line", () => {
    expect(L.goalText({ type: "eat", n: 8, species: "koi" })).toBe("Eat 8 Sigil Koi"); expect(L.goalText({ type: "survive", secs: 45 })).toBe("Survive 45 s"); expect(L.goalText({ type: "none" })).toBe("");
  });
});
