#!/usr/bin/env python3
"""The level editor and the field page reading a level, in a real (headless) browser.

    python3 games/the-maw/tests/level-editor.py

Checks: the field builds from each level in games/the-maw/levels (its towers, encounters and the Maw's start where the file puts them), from a
draft with no towers, and as it always did with no level; a level that is not there is refused with a message. In the editor, at desktop and
phone sizes: a template opens, the palette places a tower, a drag moves it as one undo step, the inspector edits it, undo takes it back, a level
with an error cannot be played, Play runs the level in the game and Stop comes back to the same edit; a tank stage made from one of the seven
plays in the tank and appears in the tank's menu. Serves the repo itself; needs Python's
playwright and Chrome (CHROME=/path/to/chrome, else /usr/bin/google-chrome)."""
import sys, os, json, threading, functools, http.server, socketserver, subprocess
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
ARGS = ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_address[1]}/games/the-maw/"
fails = []
def check(name, ok, got=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  got: " + str(got)[:300]));
    if not ok: fails.append(name)

def level_text(js):   # a level built in Node with the same script the pages load
    return subprocess.check_output(["node", "-e", "const L=require(process.argv[1]);const l=(" + js + ")(L);process.stdout.write(L.stringify(l))", os.path.join(ROOT, "packages/level/level.js")]).decode()

FIELD = """() => { const a = __arena, WR = a.sim.bounds.w * 0.42, lv = a.levelOf();
  return { level: !!a.LEVEL, towers: a.TOWERS.length, agents: a.AG.length, pats: a.AG.map((x) => x.id).sort().join(','),
    maw: [(a.MAWP.x - a.WC.x) / WR * 100, (a.MAWP.y - a.WC.y) / WR * 100], homes: a.AG.map((x) => [x.id, (x.home0.x - a.WC.x) / WR * 100, (x.home0.y - a.WC.y) / WR * 100]),
    msg: document.getElementById('msg').textContent, out: ForgeLevel.validate(lv).errors.length, outN: lv.entities.length }; }"""
def field(b, hash_, draft=None):
    pg = b.new_page(viewport={"width": 900, "height": 700}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    if draft is not None: pg.goto(BASE + "levels/index.json"); pg.evaluate("t => localStorage.setItem('forge-level-draft', t)", draft)
    pg.goto(BASE + "field/index.html" + hash_); pg.wait_for_function("window.__arena && window.__arena.AG", timeout=240000)
    out = pg.evaluate(FIELD); out["errs"] = errs; pg.close(); return out

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    # ---- the field page ----
    d = field(b, ""); check("no level: the field as it always was (5 towers, 36 creatures)", not d["level"] and d["towers"] == 5 and d["agents"] == 36 and not d["errs"], d)
    check("no level: the field writes itself out as a level with nothing wrong", d["out"] == 0 and d["outN"] == 47, d)
    for name in json.load(open(os.path.join(ROOT, "games/the-maw/levels/index.json"))):
        lv = json.load(open(os.path.join(ROOT, "games/the-maw/levels", name + ".json"))); E = lv["entities"]
        if lv["kind"] != "field":
            r = field(b, "#level=" + name); check(name + ": a tank stage is refused by the field, which says so", not r["level"] and "tank stage" in r["msg"], r); continue
        r = field(b, "#level=" + name)
        towers = [e for e in E if e["type"] == "tower"]; encs = [e for e in E if e["type"] == "encounter"]; st = [e for e in E if e["type"] == "start"][0]
        check(name + ": towers and encounters as the file has them", r["level"] and r["towers"] == len(towers) and r["pats"] == ",".join(sorted(e["pattern"] for e in encs)) and not r["errs"], r)
        check(name + ": the Maw starts where the file puts it", abs(r["maw"][0] - st["x"]) < 10 and abs(r["maw"][1] - st["y"]) < 10, r["maw"])
        want = sorted([e["pattern"], round(e["x"]), round(e["y"])] for e in encs if e["pattern"] != "drop"); got = sorted([h[0], round(h[1]), round(h[2])] for h in r["homes"] if h[0] != "drop")
        check(name + ": every encounter's home is where the file puts it", want == got, [want[:3], got[:3]])
    bare = level_text("(L) => { const l = L.create({ name: 'bare' }); l.entities[0].x = -50; l.entities.push(Object.assign(L.entity('encounter', 20, 20, { pattern: 'gaze' }), { id: 'e2' }), Object.assign(L.entity('encounter', -30, 10, { pattern: 'pack' }), { id: 'e3' }), Object.assign(L.entity('grove', 0, -40), { id: 'e4' })); return l; }")
    r = field(b, "#level=draft", bare); check("a draft with no towers runs", r["level"] and r["towers"] == 0 and r["pats"] == "gaze,pack" and not r["errs"], r)
    r = field(b, "#level=nope"); check("a level that is not there is refused, and says so", not r["level"] and "Level not loaded" in r["msg"] and r["agents"] == 36, r)
    # ---- the editor ----
    for name, vp in [("desktop", {"width": 1280, "height": 800}), ("phone", {"width": 390, "height": 780})]:
        ctx = b.new_context(viewport=vp, has_touch=(name == "phone")); pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + "editor/index.html"); pg.wait_for_function("window.__editor"); pg.wait_for_timeout(400)
        check(name + ": opens on the field template with nothing wrong", pg.evaluate("__editor.level.entities.length === 47 && __editor.checks.errors.length === 0"))
        pg.click("#new"); pg.click("#new-pop button:has-text('One on one')"); check(name + ": New opens a template", pg.evaluate("__editor.level.entities.length") == 3)
        check(name + ": the page is no wider than the screen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), pg.evaluate("document.documentElement.scrollWidth"))
        pg.click("[data-add=tower]"); box = pg.locator("#cv").bounding_box(); pg.mouse.click(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.5)
        e = pg.evaluate("({ n: __editor.level.entities.length, sel: __editor.sel, e: __editor.level.entities[3] })"); check(name + ": the palette places a tower where the scene is tapped, selected", e["n"] == 4 and e["sel"] == "e4" and e["e"]["type"] == "tower" and e["e"]["x"] > 20, e)
        p = pg.evaluate("(() => { const e = __editor.level.entities[3]; return [__editor.sx(e.x), __editor.sy(e.y)]; })()"); pg.mouse.move(box["x"] + p[0], box["y"] + p[1]); pg.mouse.down()
        for i in range(1, 9): pg.mouse.move(box["x"] + p[0] - i * 6, box["y"] + p[1] + i * 4)
        pg.mouse.up(); m = pg.evaluate("({ e: __editor.level.entities[3], undo: __editor.doc.undo.length })"); check(name + ": a drag moves it, as one undo step", m["e"]["x"] < e["e"]["x"] and m["e"]["y"] > e["e"]["y"] and m["undo"] == 2, m)
        pg.fill("#f-radius", "8"); pg.keyboard.press("Tab"); check(name + ": the inspector edits a property", pg.evaluate("__editor.level.entities[3].r") == 8)
        pg.evaluate("document.getElementById('undo').click(); document.getElementById('undo').click()"); u = pg.evaluate("__editor.level.entities[3]"); check(name + ": undo takes the edit and the drag back", u["r"] == 3.9 and u["x"] == e["e"]["x"], u)
        pg.evaluate("__editor.edit({ op: 'set', id: 'e3', props: { x: 300 } })"); check(name + ": a level with an error cannot be played", pg.evaluate("document.getElementById('play').disabled && __editor.checks.errors.length === 1"))
        pg.evaluate("document.getElementById('undo').click()")
        pg.evaluate("window.__ready = null; addEventListener('message', (e) => { if (e.data && e.data.forge) window.__ready = e.data; })"); pg.click("#play")
        try: pg.wait_for_function("window.__ready", timeout=240000); r = pg.evaluate("window.__ready")
        except Exception as ex: r = {"failed": str(ex)[:200]}
        check(name + ": Play runs the level in the game", r.get("level") is True and r.get("agents") == 1, r)
        pg.click("#play"); check(name + ": Stop comes back to the same edit", pg.evaluate("!__editor.playing && __editor.level.entities.length === 4 && !document.getElementById('cv').hidden"))
        # a tank stage: made from one of the seven, changed, played in the tank itself, put in the tank's menu
        pg.click("#new"); pg.click("#new-pop button:has-text('Stage like The Shoals')"); pg.wait_for_timeout(200)
        check(name + ": a stage like one of the seven opens with nothing wrong", pg.evaluate("__editor.level.kind === 'stage' && __editor.checks.errors.length === 0"))
        pg.evaluate("__editor.edit({ op: 'level', path: 'stage.roster', value: { swift: 30, koi: 10, wisp: 12 } }); __editor.edit({ op: 'level', path: 'stage.goal', value: { meals: 3 } }); __editor.edit({ op: 'level', path: 'name', value: 'Swift Water' })")
        pg.evaluate("__editor.edit({ op: 'level', path: 'stage.goal', value: {} })"); check(name + ": a stage with no goal cannot be played", pg.evaluate("document.getElementById('play').disabled")); pg.evaluate("document.getElementById('undo').click()")
        check(name + ": the page is no wider than the screen (stage)", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        pg.evaluate("__editor.setPane('level')"); pg.click("button:has-text('Add to menu')")
        pg.click("#play"); pg.wait_for_timeout(1000); fr = [f for f in pg.frames if "Cybernetic" in f.url]
        try:
            fr[0].wait_for_function("typeof stage !== 'undefined' && stage && stage.id === 'draft' && typeof maw !== 'undefined' && maw && maw.guest", timeout=300000)
            t = fr[0].evaluate("({ name: stage.name, pop: Object.keys(sim.pop).filter((k) => sim.pop[k] > 0).sort().join(','), goal: MawStages.goalText(stage, {}) })")
        except Exception as ex: t = {"failed": str(ex)[:200]}
        check(name + ": Play runs the stage in the tank: its roster and nothing else, its goal", t.get("name") == "Swift Water" and t.get("pop") == "koi,swift,wisp" and t.get("goal") == "Eat 3 creatures", t)
        pg.click("#play")
        # towers placed in the editor stand in the tank where they were put
        pg.evaluate("__editor.edit({ op: 'level', path: 'stage.env.ruins', value: true })"); box = pg.locator("#cv").bounding_box()
        for fx in (0.35, 0.65): pg.click("[data-add=tower]"); pg.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * 0.5)
        placed = pg.evaluate("__editor.level.entities.filter((e) => e.type === 'tower').map((e) => [e.x, e.y, e.r])"); check(name + ": towers on gives a stage a map, and towers are placed on it", len(placed) == 2 and placed[0][0] < 0 < placed[1][0] and pg.evaluate("__editor.checks.errors.length") == 0, placed)
        pg.click("#play"); pg.wait_for_timeout(1000); fr = [f for f in pg.frames if "Cybernetic" in f.url]
        try:
            fr[0].wait_for_function("typeof stage !== 'undefined' && stage && stage.id === 'draft' && typeof maw !== 'undefined' && maw && maw.guest", timeout=300000)
            got = fr[0].evaluate("(() => { const TW = sim.bounds.w, TH = sim.bounds.h, m = Math.min(TW, TH) / 2; return sim.solids.map((s) => (s.x1 == null ? [+((s.x - TW / 2) / m * 100).toFixed(1), +((s.y - TH / 2) / m * 100).toFixed(1), +(s.r / m * 100).toFixed(1)] : 'wall')); })()")
        except Exception as ex: got = str(ex)[:200]
        same = isinstance(got, list) and len(got) == len(placed) and all(g != 'wall' and g[0] == p[0] and g[1] == p[1] and g[2] >= p[2] for g, p in zip(got, placed))   # a tower is never thinner than the tank's least, so on a small screen it may be wider than drawn
        check(name + ": the tank stands those towers where they were put, and no walls", same, [placed, got])
        pg.click("#play"); pg.evaluate("document.getElementById('undo').click(); document.getElementById('undo').click(); document.getElementById('undo').click()"); tk = ctx.new_page(); terr = []; tk.on("pageerror", lambda e: terr.append(str(e)))
        tk.goto(BASE + "../../world/forges/fish-tool/Cybernetic%20Ecology.html"); tk.wait_for_function("typeof MawStages !== 'undefined' && document.querySelector('[data-stage=\"lv-swift-water\"]')", timeout=300000)
        menu = tk.evaluate("[...document.querySelectorAll('[data-stage]')].map((b) => b.dataset.stage)"); check(name + ": the tank's menu lists it after the seven", menu[:9] == ["run", "floor", "frond", "shoals", "deep", "spires", "colony", "apex", "x-swift-water"], menu)
        check(name + ": and the stages that ship as files (levels/index.json)", "lv-swift-water" in menu, menu)
        tk.evaluate("document.querySelector(\"[data-stage='x-swift-water']\").click()"); tk.wait_for_timeout(300); sheet = tk.evaluate("(document.querySelector('.m-sheet') || {}).innerText || ''"); check(name + ": and shows its goal and who lives there", "Eat 3 creatures" in sheet and "Sickle Swift" in sheet and not terr, [sheet[:120], terr]); tk.close()
        if name == "desktop":
            GAME = "document.getElementById('game').contentWindow"
            pg.evaluate("window.__msgs = []; addEventListener('message', (e) => { if (e.data && e.data.forge) __msgs.push(e.data); })")
            # a stage's walls and the Maw's start, and live edits to a running tank
            pg.evaluate("__editor.edit({ op: 'batch', cmds: [{ op: 'level', path: 'stage.env.ruins', value: true }, { op: 'add', entity: ForgeLevel.entity('wall', 0, 25, { len: 40, turn: 90 }) }, { op: 'add', entity: ForgeLevel.entity('start', -45, 0) }, { op: 'add', entity: ForgeLevel.entity('landmark', 30, -30, { kind: 'carcass' }) }, { op: 'add', entity: ForgeLevel.entity('landmark', -20, -40, { kind: 'carcass' }) }] })")
            check(name + ": a stage takes a wall and a Maw start", pg.evaluate("__editor.checks.errors.length === 0 && __editor.level.entities.some((e) => e.type === 'wall')"), pg.evaluate("__editor.checks"))
            pg.click("#play"); pg.wait_for_timeout(1000); fr = [f for f in pg.frames if "Cybernetic" in f.url]
            try:
                fr[0].wait_for_function("typeof stage !== 'undefined' && stage && stage.id === 'draft' && typeof maw !== 'undefined' && maw && maw.guest", timeout=300000)
                t = fr[0].evaluate("(() => { const TW = sim.bounds.w, TH = sim.bounds.h, m = Math.min(TW, TH) / 2, w = sim.solids.find((q) => q.x1 != null), g = maw.guest; return { carcass: propsAt.filter((q) => q.kind === 'carcass').map((q) => [Math.round((q.x - TW / 2) / m * 100), Math.round((q.y - TH / 2) / m * 100)]), wall: w ? [w.x0, w.y0, w.x1, w.y1].map((v, i) => Math.round((v - (i % 2 ? TH : TW) / 2) / m * 100)) : null, walls: sim.solids.filter((q) => q.x1 != null).length, maw: [Math.round((g.x - TW / 2) / m * 100), Math.round((g.y - TH / 2) / m * 100)], time: sim.time }; })()")
            except Exception as ex: t = {"failed": str(ex)[:200]}
            check(name + ": the tank stands the wall where it was drawn, and no others", t.get("wall") == [0, 5, 0, 45] and t.get("walls") == 1, t)
            check(name + ": placed landmarks stand where they were put, and only those of their kind", t.get("carcass") == [[30, -30], [-20, -40]], t)
            check(name + ": the Maw starts where the stage puts it", t.get("maw") and abs(t["maw"][0] + 45) < 14 and abs(t["maw"][1]) < 14, t)
            pg.evaluate("__msgs.length = 0; __editor.edit({ op: 'level', path: 'stage.roster', value: { koi: 20, wisp: 5 } })")
            try: pg.wait_for_function("__msgs.some((m) => m.forge === 'applied')", timeout=30000); how = pg.evaluate("__msgs.find((m) => m.forge === 'applied').how"); lv = fr[0].evaluate("({ pop: Object.keys(sim.pop).filter((k) => sim.pop[k] > 0).sort().join(','), time: sim.time, id: stage && stage.id })")
            except Exception as ex: how = str(ex)[:120]; lv = {}
            check(name + ": a roster change reaches the running tank without starting over", how == "live" and lv.get("pop") == "koi,wisp" and lv.get("time", 0) >= t.get("time", 1e9), [how, lv])
            pg.evaluate("__msgs.length = 0; __editor.edit({ op: 'level', path: 'stage.kit.eyes', value: (__editor.level.stage.kit.eyes || 0) + 1 })")
            try: pg.wait_for_function("__msgs.some((m) => m.forge === 'applied')", timeout=30000); how = pg.evaluate("__msgs.find((m) => m.forge === 'applied').how")
            except Exception as ex: how = str(ex)[:120]
            check(name + ": a change to the Maw's kit asks for the stage to start again", how == "reload", how); pg.click("#play")
            # a field: prefabs, play beside the map with live edits, the 3D scene
            pg.click("#new"); pg.click("#new-pop button:has-text('One on one')"); pg.evaluate("__editor.edit({ op: 'add', entity: ForgeLevel.entity('grove', 12, -50) })"); box = pg.locator("#cv").bounding_box()
            at = lambda i: pg.evaluate("(id) => { const e = __editor.level.entities.find((q) => q.id === id); return [__editor.sx(e.x), __editor.sy(e.y)]; }", i)
            q = at("e2"); pg.mouse.click(box["x"] + q[0], box["y"] + q[1]); q = at("e4"); pg.keyboard.down("Shift"); pg.mouse.click(box["x"] + q[0], box["y"] + q[1]); pg.keyboard.up("Shift")
            check(name + ": shift adds to the selection", pg.evaluate("__editor.multi") == ["e2", "e4"], pg.evaluate("__editor.multi"))
            pg.fill("#f-name", "Tower grove"); pg.click("button:has-text('Make prefab')"); check(name + ": the selection becomes a prefab and one placing of it", pg.evaluate("__editor.level.entities.map((e) => e.type).join() === 'start,encounter,prefab' && !!__editor.level.prefabs['tower-grove'] && __editor.checks.errors.length === 0"))
            pg.select_option("#pf", "tower-grove"); pg.click("[data-add=prefab]"); pg.mouse.click(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.75)
            pg.fill("[aria-label='Radius of part 1']", "6"); pg.keyboard.press("Tab"); check(name + ": a second placing, and a change to the prefab reaches both", pg.evaluate("ForgeLevel.expand(__editor.level).entities.filter((e) => e.type === 'tower').map((e) => e.r)") == [6, 6])
            pg.click("button:has-text('Save to library')"); lib = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('forge-prefabs') || '{}'))"); keep = pg.evaluate("ForgeLevel.stringify(__editor.level)")
            pg.click("#new"); pg.click("#new-pop button:has-text('Empty field')"); opts = pg.evaluate("[...document.getElementById('pf').options].map((o) => o.textContent)"); pg.select_option("#pf", "tower-grove"); pg.click("[data-add=prefab]"); pg.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.7)
            check(name + ": a prefab saved to the library can be placed in another level, which then holds its own copy", lib == ["tower-grove"] and opts == ["Tower grove · library"] and pg.evaluate("!!__editor.level.prefabs['tower-grove'] && __editor.level.entities.some((e) => e.type === 'prefab') && __editor.doc.undo.length === 1"), [lib, opts])
            pg.evaluate("(t) => __editor.load(ForgeLevel.parse(t))", keep)
            pg.evaluate("__msgs.length = 0"); pg.click("#play")
            try: pg.wait_for_function("__msgs.some((m) => m.forge === 'field-ready')", timeout=240000); w = pg.evaluate("[document.getElementById('cv').getBoundingClientRect().width, document.getElementById('game').getBoundingClientRect().width].map(Math.round)")
            except Exception as ex: w = [0, str(ex)[:100]]
            check(name + ": playing, the map and the game stand side by side", w[0] > 200 and w[0] == w[1], w)
            check(name + ": the game holds both placings' towers", pg.evaluate(GAME + ".__arena.TOWERS.length") == 2)
            pg.evaluate("__msgs.length = 0; __editor.edit({ op: 'set', id: 'e3', props: { x: -40, y: -30 } })")
            try: pg.wait_for_function("__msgs.some((m) => m.forge === 'applied')", timeout=30000); r = pg.evaluate("(() => { const a = " + GAME + ".__arena, WR = a.sim.bounds.w * 0.42, A = a.AG.find((q) => q.lid === 'e3'); return { how: __msgs.find((m) => m.forge === 'applied').how, home: [Math.round((A.home0.x - a.WC.x) / WR * 100), Math.round((A.home0.y - a.WC.y) / WR * 100)] }; })()")
            except Exception as ex: r = {"failed": str(ex)[:120]}
            check(name + ": moving an encounter on the map moves its home in the running game", r.get("how") == "live" and r.get("home") == [-40, -30], r)
            pg.evaluate("__msgs.length = 0; __editor.edit({ op: 'set', id: 'e1', props: { x: 20 } })")
            try: pg.wait_for_function("__msgs.some((m) => m.forge === 'field-ready')", timeout=240000); ok = True
            except Exception: ok = False
            check(name + ": moving the Maw's start loads the game again by itself", ok); pg.click("#play")
            pg.evaluate("__msgs.length = 0"); pg.click("#vmode [data-v='3d']")
            try:
                pg.wait_for_function("__msgs.some((m) => m.forge === 'field-ready' && m.edit)", timeout=240000); pg.wait_for_timeout(1500); gb = pg.locator("#game").bounding_box(); fr = [f for f in pg.frames if "field" in f.url][0]
                sp = fr.evaluate("(() => { const A = __arena.AG.find((q) => q.lid === 'e3'); return toScreen(A.home0.x, A.home0.y); })()"); u0 = pg.evaluate("__editor.doc.undo.length")
                pg.mouse.move(gb["x"] + sp[0], gb["y"] + sp[1]); pg.mouse.down()
                for i in range(1, 9): pg.mouse.move(gb["x"] + sp[0] + i * 12, gb["y"] + sp[1] + i * 5)
                pg.mouse.up(); pg.wait_for_timeout(600); r = pg.evaluate("(() => { const e = __editor.level.entities.find((q) => q.id === 'e3'); return { x: e.x, y: e.y, sel: __editor.sel, steps: __editor.doc.undo.length }; })()"); r["u0"] = u0
                n0 = pg.evaluate("__editor.level.entities.length"); pg.click("[data-add=encounter]"); pg.mouse.click(gb["x"] + gb["width"] * 0.3, gb["y"] + gb["height"] * 0.55); pg.wait_for_timeout(900)
                r["added"] = pg.evaluate("__editor.level.entities.length") - n0; r["inGame"] = fr.evaluate("__arena.AG.length")
            except Exception as ex: r = {"failed": str(ex)[:200]}
            check(name + ": in the 3D scene a drag moves a thing, as one undo step, and selects it", r.get("x", -40) > -40 and r.get("y", -30) > -30 and r.get("sel") == "e3" and r.get("steps") == r.get("u0", 0) + 1, r)
            check(name + ": and a tap on the ground places what is held, in the level and in the game", r.get("added") == 1 and r.get("inGame") == 2, r)
            pg.click("#vmode [data-v='map']"); check(name + ": Map puts the game away", pg.evaluate("!__editor.scene3d && document.getElementById('game').hidden"))
            # an exit: a way out to another level of a world. Fields have it, tank stages do not
            pg.click("#new"); pg.click("#new-pop button:has-text('Empty field')"); pg.click("[data-add=exit]"); pg.mouse.click(box["x"] + box["width"] * 0.8, box["y"] + box["height"] * 0.5)
            ex0 = pg.evaluate("__editor.level.entities.filter((e) => e.type === 'exit').length"); err0 = pg.evaluate("__editor.checks.errors.length")
            pg.fill("#f-leads-to", "Pit"); pg.keyboard.press("Tab")
            check(name + ": an exit is placed, says where it leads, and is an error until it does", ex0 == 1 and err0 == 1 and pg.evaluate("__editor.level.entities.find((e) => e.type === 'exit').to === 'pit' && __editor.checks.errors.length === 0 && document.body.textContent.includes('Exit to pit')"), [ex0, err0])
            pg.click("#new"); pg.click("#new-pop button:has-text('A tank stage')"); check(name + ": a tank stage has no Exit button", pg.evaluate("document.querySelector('[data-add=exit]').hidden"))
            pg.click("#new"); pg.click("#new-pop button:has-text('A tank stage')"); pg.evaluate("__editor.edit({ op: 'level', path: 'stage.goal', value: { meals: 3 } })")
        # balance: the tank's autopilot plays the draft out of sight and the editor shows how it went (desktop only: it is the slow part)
        if name == "desktop":
            pg.evaluate("__editor.setPane('checks'); __editor.BAL.secs = 20; __editor.balanceRun()")
            try: pg.wait_for_function("!__editor.BAL.running && __editor.BAL.result", timeout=540000); r = pg.evaluate("__editor.BAL.result")
            except Exception as ex: r = {"error": str(ex)[:200]}
            ok = not r.get("error") and len(r.get("runs", [])) == 3 and all(x["secs"] > 0 and x["perMin"] >= 0 and x["end"] for x in r["runs"]) and r.get("goal") == "Eat 3 creatures"
            check(name + ": a balance run plays the stage three times and reports each", ok, r)
            check(name + ": and the editor shows it, with the tank put away again", pg.evaluate("document.querySelectorAll('.runs tr').length === 4 && !document.getElementById('bal-frame') && document.documentElement.scrollWidth <= innerWidth && document.querySelector('.col.right').scrollWidth <= document.querySelector('.col.right').clientWidth + 1"))
        check(name + ": no script errors", not errs, errs); ctx.close()
    b.close()
print(("FAILED: " + ", ".join(fails)) if fails else "all passed"); sys.exit(1 if fails else 0)
