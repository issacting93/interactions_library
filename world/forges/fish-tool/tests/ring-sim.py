"""How each ring plays on autopilot: the Rings tab's Play, stepped by hand, for every ring over a few seeds.
  python3 -m http.server 8731        (at the repo root, in another shell)
  python3 world/forges/fish-tool/tests/ring-sim.py [rings, comma list or all] [seeds, comma list] [max minutes]
Reported per run: how it ended (won / lost / still going), the time, the first meal, meals a minute, the lowest energy (of the cap),
time spent under a quarter energy, and how far the goal got. EDITS (env, JSON): stage settings to lay over a ring first, e.g.
  EDITS='{"floor":{"goal":{"meals":8},"press":{"upkeep":1.5}}}'
Needs playwright and Chrome (CHROME for its path)."""
import os, sys, json
from playwright.sync_api import sync_playwright
RINGS = sys.argv[1] if len(sys.argv) > 1 else "all"
SEEDS = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "7,11,23").split(",")]
MINS = float(sys.argv[3]) if len(sys.argv) > 3 else 6
EDITS = json.loads(os.environ.get("EDITS", "{}"))
URL = os.environ.get("URL", "http://localhost:8731/world/forges/fish-tool/Cybernetic%20Ecology.html")
JS = r"""([id, seed, mins, edit])=>{ paused = true;
 const st = MawStages.get(id); for (const k in edit||{}) st[k] = (typeof edit[k]==='object' && !Array.isArray(edit[k]) && st[k]) ? Object.assign({}, st[k], edit[k]) : edit[k];
 __ed.ED.id = id; document.getElementById('ed-seed').value = seed; document.getElementById('ed-auto').checked = true; __ed.edPlay();
 if (!diet.run) return { err: 'no run' };
 const cap = EcologyDiet.RULES.energyCap, N = Math.round(mins*3600); let first = null, low = 1, lowT = 0, held = 0, i = 0, end = 'going', why = '';
 for (; i < N; i++) { __eco.steps(1);
   const R = diet.run; if (!R || R.state !== 'play') { end = R ? R.state : 'gone'; why = R && R.why || ''; break; }
   const m = diet.mine; if (!m || !m.diet) { end = 'gone'; break; }
   const e = Math.max(0, m.diet.energy)/cap; if (e < low) low = e; if (e < 0.25) lowT += 1/60; if (m.caught) held += 1/60;
   if (first == null && stageTally && stageTally.meals > 0) first = i/60; }
 const s = stageState(), c = MawStages.check(st, s, null), t = i/60;
 return { end, why, t, first, meals: s.meals, rate: t > 5 ? s.meals/(t/60) : 0, low, lowT, held, tier: s.tier, parts: s.parts, form: s.form,
   goal: c.rows.map(r => r.label + ' ' + r.have + '/' + r.need).join(', '), eaten: s.eaten, alive: sim.fish.filter(f => !f.dead).length }; }"""
def mmss(v): return "-" if v is None else f"{int(v//60)}:{int(v%60):02d}"
if __name__ == "__main__":
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"])
        pg = b.new_page(viewport={"width": 1000, "height": 700}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_function("window.__ed && window.__maw", timeout=60000); pg.wait_for_timeout(1500)
        ids = pg.evaluate("MawStages.LIST.map(s => s.id)") if RINGS == "all" else RINGS.split(",")
        for rid in ids:
            rows = []
            for seed in SEEDS:
                pg.reload(); pg.wait_for_function("window.__ed && window.__maw", timeout=60000); pg.wait_for_timeout(800)
                r = pg.evaluate(JS, [rid, seed, MINS, EDITS.get(rid)]); rows.append(r)
                if r.get("err"): print(f"{rid:8s} seed {seed:3d}  {r['err']}"); continue
                print(f"{rid:8s} seed {seed:3d}  {r['end']:5s} {r['why']:8s} at {mmss(r['t'])}  first meal {mmss(r['first'])}  meals {r['meals']:2d} ({r['rate']:.1f}/min)  low energy {r['low']*100:3.0f}%  under 25% {r['lowT']:4.0f} s  held {r['held']:3.0f} s  tier {r['tier']} parts {r['parts']} {r['form']}  goal: {r["goal"]}  ate {json.dumps(r["eaten"])}", flush=True)
            ok = [r for r in rows if r.get("end") == "won"]
            if rows: print(f"  {rid}: won {len(ok)}/{len(rows)}" + (f", mean {mmss(sum(r['t'] for r in ok)/len(ok))}" if ok else ""), flush=True)
        if errs: print("ERRORS", errs[:3])
        b.close()
