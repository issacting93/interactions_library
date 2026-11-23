"""How the Maw's game plays, measured with its own autopilot (EcologyMawAI): meals, strikes, energy, being caught, per mode.
  python3 world/forges/fish-tool/tests/maw-balance.py                    run and endless, seeds 4242 7 99, 120 s each; compares with the baseline
  python3 world/forges/fish-tool/tests/maw-balance.py --write            ... and saves what it measured as the new baseline
  python3 world/forges/fish-tool/tests/maw-balance.py --modes run --seeds 4242 --secs 60
No server needed: the pages are served from the repo's files. Needs playwright and Chrome (CHROME, else /usr/bin/google-chrome).
The baseline (maw-balance.json) is the game's feel as numbers: a change that moves them is a design change, so say so in its commit and
update the baseline with --write. A number outside its band (BANDS) prints DRIFT; --strict makes drift fail (exit 1)."""
import os, sys, json, argparse, mimetypes, urllib.parse
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
BASE = os.path.join(HERE, "maw-balance.json")
# how far a mean may move before it is called drift: (relative, absolute), whichever is wider
BANDS = {"perMin": (0.25, 1.0), "hitRate": (0.2, 0.1), "eMin": (0.15, 0.8), "held": (0.5, 1.0), "glance": (0.5, 2.0), "dodge": (0.5, 1.0), "confuse": (0.5, 1.0)}

def serve(route):
    path = os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(urllib.parse.urlparse(route.request.url).path).lstrip("/")))
    if not path.startswith(ROOT) or not os.path.isfile(path): return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream", body=open(path, "rb").read())

JS = r"""([mode, seed, secs]) => { paused = true;
  if (mode === 'run') runBegin(seed); else { endlessBegin(seed); compOpen(false); }   // Endless opens on the Mutate rig: close it, as the player's Go does
  __eco.camSnap(); const m = __maw, ai = EcologyMawAI.create(), dt = 1 / 60; window.__mawAI = ai;
  let eMin = 99, heldT = 0, held = 0, wasHeld = false, end = null, e0 = null; const curve = [];
  for (let i = 0; i < secs * 60; i++) { __eco.steps(1, () => EcologyMawAI.step(ai, m, dt));
    const g = m.guest; if (!g) { end = 'gone at ' + (i / 60).toFixed(1); break; }
    const d = g.diet; if (d) { if (e0 == null) e0 = d.energy; eMin = Math.min(eMin, d.energy); if (i % 600 === 0) curve.push(+d.energy.toFixed(1)); }
    if (g.caught) { heldT += dt; if (!wasHeld) held++; wasHeld = true; } else wasHeld = false;
    if (diet.run && diet.run.state !== 'play') { end = diet.run.state + ' (' + diet.run.why + ') at ' + (i / 60).toFixed(1); break; } }
  const s = EcologyMawAI.stats(ai), ev = {}; for (const e of (diet.events || [])) ev[e.kind] = (ev[e.kind] || 0) + 1;
  return { mode, seed, end, meals: s.meals, perMin: +(s.meals / (secs / 60)).toFixed(2), first: s.firstMeal, hitRate: +(s.hitRate || 0).toFixed(3), strikes: s.strikes,
    eMin: +eMin.toFixed(2), energy: curve, held, heldT: +heldT.toFixed(1), flee: +(s.flee || 0).toFixed(1), glance: ev.glance || 0, dodge: ev.dodge || 0, confuse: ev.confuse || 0, eaten: m.eatenSp }; }"""

def measure(modes, seeds, secs):
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for mode in modes:
            for seed in seeds:
                pg = b.new_page(viewport={"width": 1000, "height": 700}); pg.route("http://tank.test/**", serve)
                pg.route("**/*", lambda r: r.abort() if "fonts.g" in r.request.url else r.fallback())
                pg.goto("http://tank.test/world/forges/fish-tool/Cybernetic%20Ecology.html?" + mode, wait_until="domcontentloaded", timeout=120000)
                pg.wait_for_function("window.__maw && window.walkers && walkers.W", timeout=240000); pg.wait_for_timeout(800)
                r = pg.evaluate(JS, [mode, seed, secs]); out.append(r); pg.close()
                print(f"  {mode:8} seed {seed:<6} meals/min {r['perMin']:5}  hit {r['hitRate']:.2f} of {r['strikes']:3}  lowest energy {r['eMin']:5}  caught {r['held']}  glance {r['glance']} dodge {r['dodge']} lost in a school {r['confuse']}" + (f"  END {r['end']}" if r["end"] else ""), flush=True)
        b.close()
    return out

def summary(rows):
    by = {}
    for r in rows: by.setdefault(r["mode"], []).append(r)
    return {mode: {k: round(sum(r[k] for r in rs) / len(rs), 3) for k in BANDS} | {"n": len(rs)} for mode, rs in by.items()}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modes", nargs="+", default=["run", "endless"]); ap.add_argument("--seeds", nargs="+", type=int, default=[4242, 7, 99])
    ap.add_argument("--secs", type=int, default=120); ap.add_argument("--write", action="store_true"); ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    rows = measure(a.modes, a.seeds, a.secs); now = summary(rows)
    base = json.load(open(BASE)) if os.path.exists(BASE) else {}
    drift = 0
    print("\n| mode | " + " | ".join(BANDS) + " |\n|---|" + "---|" * len(BANDS))
    for mode, v in now.items():
        b = base.get("modes", {}).get(mode); cells = []
        for k, (rel, ab) in BANDS.items():
            if not b or k not in b: cells.append(f"{v[k]}"); continue
            off = abs(v[k] - b[k]) > max(abs(b[k]) * rel, ab); drift += off
            cells.append(f"{v[k]} (was {b[k]}){' DRIFT' if off else ''}")
        print(f"| {mode} | " + " | ".join(cells) + " |")
    if a.write:
        json.dump({"secs": a.secs, "seeds": a.seeds, "modes": {**base.get("modes", {}), **now}, "runs": rows}, open(BASE, "w"), indent=1); print("\nbaseline written:", os.path.relpath(BASE, ROOT))
    elif drift: print(f"\n{drift} number(s) moved past their band: a design change? Say so, and save it with --write.")
    sys.exit(1 if drift and a.strict and not a.write else 0)

if __name__ == "__main__": main()
