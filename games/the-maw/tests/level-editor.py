#!/usr/bin/env python3
"""The level editor and the field page reading a level, in a real (headless) browser.

    python3 games/the-maw/tests/level-editor.py

Checks: the field builds from each level in games/the-maw/levels (its towers, encounters and the Maw's start where the file puts them), from a
draft with no towers, and as it always did with no level; a level that is not there is refused with a message. In the editor, at desktop and
phone sizes: a template opens, the palette places a tower, a drag moves it as one undo step, the inspector edits it, undo takes it back, a level
with an error cannot be played, Play runs the level in the game and Stop comes back to the same edit. Serves the repo itself; needs Python's
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
        lv = json.load(open(os.path.join(ROOT, "games/the-maw/levels", name + ".json"))); E = lv["entities"]; r = field(b, "#level=" + name)
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
        check(name + ": no script errors", not errs, errs); ctx.close()
    b.close()
print(("FAILED: " + ", ".join(fails)) if fails else "all passed"); sys.exit(1 if fails else 0)
