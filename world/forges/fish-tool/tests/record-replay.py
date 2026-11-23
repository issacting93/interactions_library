"""A recording plays back exactly: a run (and Endless) is played on a script in one page while the page records it, then the recording is
replayed in a fresh page, and both must end in the same world (the digest of every creature) at the same random draw.
Endless is played too and reported, but not required to match: it starts from the tank as it is (grown in real time), not from its seed.
  python3 world/forges/fish-tool/tests/record-replay.py [seed ...]
The script presses the way a player does, from outside the world's step (EcologyMaw.input, a held lunge, Mutate opened and closed, a ping),
with uneven step sizes as a real frame rate gives. No server needed: the pages are served from the repo's files. Needs playwright and Chrome."""
import os, sys, json, mimetypes, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
SEEDS = [int(a) for a in sys.argv[1:]] or [4242]

def serve(route):
    path = os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(urllib.parse.urlparse(route.request.url).path).lstrip("/")))
    if not path.startswith(ROOT) or not os.path.isfile(path): return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream", body=open(path, "rb").read())

PLAY = r"""([mode, seed]) => { paused = true;
  if (mode === 'run') runBegin(seed); else { endlessBegin(seed); compOpen(false); }
  const M = EcologyMaw, sizes = [20, 20, 19, 21, 24, 20, 16, 20];   // uneven frames, in the clock's quanta
  for (let i = 0; i < 60 * 25; i++) {
    const ph = Math.floor(i / 90) % 6, a = i * 0.013;
    if (ph < 3) M.input(__maw, { move: [Math.cos(a), Math.sin(a)], aim: [Math.cos(a), Math.sin(a)], hold: false });
    else if (ph === 3) M.input(__maw, { move: null, aim: [1, 0.2], hold: i % 90 < 50 });
    else M.input(__maw, { move: [-0.6, 0.8], hold: false });
    if (i === 400) M.ping(__maw);
    if (i === 700) { compOpen(true); } if (i === 760) compOpen(false);
    worldStep(clock.fixed(sizes[i % sizes.length]));
  }
  return { digest: __eco.digest(), draw: EcoCore.random(), rec: __eco.record() }; }"""

def main():
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        def page():
            pg = b.new_page(viewport={"width": 1000, "height": 700}); pg.route("http://tank.test/**", serve)
            pg.route("**/*", lambda r: r.abort() if "fonts.g" in r.request.url else r.fallback())
            pg.goto("http://tank.test/world/forges/fish-tool/Cybernetic%20Ecology.html?play", wait_until="domcontentloaded", timeout=120000)
            pg.wait_for_function("window.__maw && window.walkers && walkers.W && window.__eco && typeof __eco.replay === 'function'", timeout=240000); pg.wait_for_timeout(800)
            return pg
        for mode in ("run", "endless"):
            for seed in SEEDS:
                pa = page(); a = pa.evaluate(PLAY, [mode, seed]); pa.close()
                rec = a["rec"]; size = len(json.dumps(rec))
                pb = page(); r = pb.evaluate("(rec) => ({ digest: __eco.replay(rec), draw: EcoCore.random() })", rec); pb.close()
                ok = r["digest"] == a["digest"] and r["draw"] == a["draw"]; bad += (not ok) and mode == "run"
                print(("PASS" if ok else "FAIL" if mode == "run" else "DIFFERS (known)"), f"{mode} seed {seed}: replayed in a fresh page, the same world ::", a["digest"], "draw", a["draw"],
                      "" if ok else f"replayed {r['digest']} draw {r['draw']}", f"({len(rec['dts'])} steps, {len(rec['calls'])} calls, {size // 1024} KB)")
        b.close()
    sys.exit(1 if bad else 0)

if __name__ == "__main__": main()
