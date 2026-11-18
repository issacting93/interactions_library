"""Replay check for the tank's world: the same seed and the same input, stepped the same, must end in the same place.
  python3 -m http.server 8731        (at the repo root, in another shell)
  python3 world/forges/fish-tool/tests/replay.py [seed]
Starts a run of The Maw twice from a seed (two fresh pages), walks and lunges on a script for 30 s of world time, through a gate into the second ring,, and compares a
digest of every creature. Also prints what each system costs a step."""
import os, sys
from playwright.sync_api import sync_playwright
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 4242
JS = r"""(seed) => { paused = true; runBegin(seed); __eco.camSnap(); const out = [];
  const script = (i) => { const a = Math.floor(i / 90) * 1.3; EcologyMaw.input(maw, { move: i % 240 < 200 ? [Math.cos(a), Math.sin(a)] : null, aim: [Math.cos(a), Math.sin(a)], hold: i % 240 >= 200 && i % 240 < 232 }); };
  for (let k = 0; k < 6; k++) { __eco.steps(300, (i) => script(k * 300 + i)); out.push(__eco.digest());
    if (k === 2) { stageTally.meals = 99; const v = EcologyMaw.view(maw), g = __run.rings[__run.i].gate; g.x = v.x / tankW(); g.y = v.y / tankH(); } }   // half way: the key in hand and the gate underfoot, so the replay crosses into the next ring
  return { marks: out, ring: __run.i, meals: __run.meals, cost: __eco.systems.report(), entities: __eco.world.alive.size, steps: __eco.clock.steps }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    runs = []
    for k in range(2):
        pg = b.new_page(viewport={"width": 1000, "height": 700}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://localhost:8731/world/forges/fish-tool/Cybernetic%20Ecology.html?run"); pg.wait_for_function("window.__maw && window.walkers && walkers.W", timeout=60000); pg.wait_for_timeout(500 + 700 * k)
        runs.append(pg.evaluate(JS, SEED)); pg.close()
        if errs: print("PAGE ERRORS", errs[:3])
    a, c = runs
    for i, (x, y) in enumerate(zip(a["marks"], c["marks"])): print(("PASS" if x == y else "FAIL"), f"replay at {5 * (i + 1)} s ::", x, "" if x == y else y)
    print("entities", a["entities"], "· ring", a["ring"], "· meals", a["meals"], "· steps", a["steps"]); print("ms a step:", a["cost"])
    b.close()
