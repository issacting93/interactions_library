"""The swimmers' step, timed in headless Chrome with the diet on (the real game), with the Rust engine and without, against a speed budget.
  python3 games/the-maw/tests/engine-bench.py              220 and 1,000 creatures; fails (exit 1) when the engine's step is over budget
  BUDGET_220=3 BUDGET_1000=16 python3 games/the-maw/tests/engine-bench.py      a looser budget (a slow or shared machine)
Times vary by about 20% from run to run, and double when another job shares the machine: the budget is set with room for that.
No server needed: the pages are served from the repo's files. Needs playwright and Chrome (CHROME, else /usr/bin/google-chrome)."""
import os, sys, json, mimetypes, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
# ms a step for the engine (sense + steer + move + upkeep), measured 22 Nov 2026 at 1.7 and 11.8 with room
BUDGET = {220: float(os.environ.get("BUDGET_220", 2.5)), 1000: float(os.environ.get("BUDGET_1000", 16))}

def serve(route):
    path = os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(urllib.parse.urlparse(route.request.url).path).lstrip("/")))
    if not path.startswith(ROOT) or not os.path.isfile(path): return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream", body=open(path, "rb").read())

JS = r"""(count) => { const cfg = { size: 40, speed: 1, beh: 'on', sep: 1, align: 1, coh: 1, flow: 'free', vradius: 0.3, swirl: 1, ptr: 'ignore', dz: 1, wiggle: 1, flex: 1, bank: 1, species: 'mixed', count };
  EcoCore.reseed(5); const s = EcologySim.create(cfg); EcologySim.resize(s, 900 * Math.sqrt(count / 220), 600 * Math.sqrt(count / 220)); EcologySim.setSpecies(s, 'mixed');
  const d = EcologyDiet.create(s, { species: EcologySpecies });
  const T = { sense: 0, steer: 0, move: 0, upkeep: 0 }, N = 400;
  for (let i = 0; i < 100; i++) { for (const k in T) EcologySim.phase(s, k, 1 / 60); EcologyDiet.step(d, 1 / 60); }
  for (let i = 0; i < N; i++) { for (const k in T) { const a = performance.now(); EcologySim.phase(s, k, 1 / 60); T[k] += performance.now() - a; } EcologyDiet.step(d, 1 / 60); }
  for (const k in T) T[k] = +(T[k] / N).toFixed(3); T.total = +(T.sense + T.steer + T.move + T.upkeep).toFixed(3); T.n = s.fish.length; return T; }"""

def main():
    res, over = {}, []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for eng in ("rust", "js"):
            pg = b.new_page(); pg.route("http://tank.test/**", serve)
            pg.goto("http://tank.test/world/forges/fish-tool/Cybernetic%20Ecology.html?engine=" + eng, wait_until="domcontentloaded", timeout=120000)
            pg.wait_for_function("window.EcologySim && window.EcoEngine && window.EcologyDiet", timeout=90000); pg.evaluate("paused = true")
            on = pg.evaluate("EcoEngine.on")
            for n in BUDGET:
                t = pg.evaluate(JS, n); res[f"{eng} {n}"] = t
                flag = ""
                if eng == "rust":
                    if not on: flag = "  ENGINE DID NOT START"; over.append(f"{n}: engine off")
                    elif t["total"] > BUDGET[n]: flag = f"  OVER BUDGET ({BUDGET[n]} ms)"; over.append(f"{n}: {t['total']} > {BUDGET[n]}")
                print(f"{eng:5} {n:5} creatures  {t['total']:7.3f} ms a step  (sense {t['sense']}, steer {t['steer']}, move {t['move']}, upkeep {t['upkeep']}){flag}", flush=True)
            pg.close()
        b.close()
    if os.environ.get("BENCH_JSON"): json.dump(res, open(os.environ["BENCH_JSON"], "w"), indent=1)
    if over: print("over budget:", "; ".join(over)); sys.exit(1)

if __name__ == "__main__": main()
