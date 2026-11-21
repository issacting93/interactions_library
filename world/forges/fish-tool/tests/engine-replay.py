"""The Rust engine against the JavaScript it replaces: the same seed and the same input must end in the same place on both.
  python3 world/forges/fish-tool/tests/engine-replay.py [seed] [seed ...]
Plays the replay script (replay.py's: 30 s of a run of The Maw, walking and lunging, through a gate into the second ring) once with the
engine off (?engine=js) and once with it on (?engine=rust), and compares the digest of every creature at six marks. Also prints what the
sense system costs a step on each. No server needed: the pages are served to the browser straight from the repo's files."""
import os, sys, mimetypes, urllib.parse
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SEEDS = [int(a) for a in sys.argv[1:]] or [4242]
URL = "http://tank.test/world/forges/fish-tool/Cybernetic%20Ecology.html?run&engine="
JS = r"""(seed) => { paused = true; runBegin(seed); __eco.camSnap(); const out = [];
  const script = (i) => { const a = Math.floor(i / 90) * 1.3; EcologyMaw.input(maw, { move: i % 240 < 200 ? [Math.cos(a), Math.sin(a)] : null, aim: [Math.cos(a), Math.sin(a)], hold: i % 240 >= 200 && i % 240 < 232 }); };
  for (let k = 0; k < 6; k++) { __eco.steps(300, (i) => script(k * 300 + i)); out.push(__eco.digest());
    if (k === 2) { stageTally.meals = 99; const v = EcologyMaw.view(maw), g = __run.rings[__run.i].gate; g.x = v.x / tankW(); g.y = v.y / tankH(); } }
  return { marks: out, ring: __run.i, cost: __eco.systems.report(), steps: __eco.clock.steps, draws: EcoCore.random(), engine: { on: EcoEngine.on, why: EcoEngine.why, parts: EcoEngine.parts } }; }"""
def serve(route):
    path = os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(urllib.parse.urlparse(route.request.url).path).lstrip("/")))
    if not path.startswith(ROOT) or not os.path.isfile(path): return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream", body=open(path, "rb").read())
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for seed in SEEDS:
        runs = {}
        for which in ("js", "rust"):
            pg = b.new_page(viewport={"width": 1000, "height": 700}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.route("http://tank.test/**", serve)
            pg.goto(URL + which, wait_until="domcontentloaded", timeout=120000); pg.wait_for_function("window.__maw && window.walkers && walkers.W", timeout=90000); pg.wait_for_timeout(500)
            runs[which] = pg.evaluate(JS, seed); pg.close()
            if errs: bad += 1; print("PAGE ERRORS", which, errs[:3])
        j, r = runs["js"], runs["rust"]
        if j["engine"]["on"] or not r["engine"]["on"]: bad += 1; print("FAIL engine switch ::", j["engine"], r["engine"])
        for i, (x, y) in enumerate(zip(j["marks"], r["marks"])):
            ok = x == y; bad += not ok; print(("PASS" if ok else "FAIL"), f"seed {seed}, engine on and off agree at {5 * (i + 1)} s ::", x, "" if ok else y)
        ok = j["draws"] == r["draws"]; bad += not ok; print(("PASS" if ok else "FAIL"), f"seed {seed}, the random stream stands at the same draw ::", j["draws"], "" if ok else r["draws"])
        print("   ring", r["ring"], "· steps", r["steps"], "· rust takes", r["engine"]["parts"])
        print("   ms a step, engine off:", j["cost"]); print("   ms a step, engine on: ", r["cost"])
    b.close()
sys.exit(1 if bad else 0)
