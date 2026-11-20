"""The floor crew moved body first (EcologyWalkers intend: CreatureBody.steer on level ground), against the old way (off).
  python3 -m http.server 8731        (at the repo root, in another shell)
  python3 world/forges/fish-tool/tests/crew-steer.py [seconds]      default 30 s of tank time, on the Floor ring, seed 7
For each: any NaN, how far planted feet slide a step, how fast the crew walk, how far a body carries on past a turn of its wish (in its own
lengths: the wish turns by more than 60 degrees, and the carry is how far the body still travels along the old way after), and the share of
steps steered. Needs playwright and Chrome (CHROME for its path)."""
import os, sys, json
from playwright.sync_api import sync_playwright
SECS = float(sys.argv[1]) if len(sys.argv) > 1 else 30
URL = os.environ.get("URL", "http://localhost:8731/world/forges/fish-tool/Cybernetic%20Ecology.html")
JS = r"""([secs, on])=>{ paused = true; __ed.ED.id = 'floor'; document.getElementById('ed-seed').value = 7; document.getElementById('ed-auto').checked = true; __ed.edPlay();
 walkers.steer = on; const crew = walkers.crew, N = Math.round(secs*60), S = crew.map(c => ({ feet: null, slide: 0, slideN: 0, dist: 0, steered: 0, steps: 0, prev: null, wish: null, turn: null, carry: [], len: 0 }));
 let nan = false;
 for (let i = 0; i < N; i++) { __eco.steps(1);
   crew.forEach((c, k) => { const b = c.body, s = S[k], h = b.chunks[0].p, mid = b.chunks[b.chunks.length >> 1].p; if (!isFinite(h.x + h.y + h.z)) nan = true;
     if (c.away > 0 || b.mode !== 'walk') { s.feet = null; s.prev = null; s.turn = null; return; }
     if (!s.len) { let L = 0; for (let j = 1; j < b.chunks.length; j++) L += Math.hypot(b.chunks[j].p.x - b.chunks[j-1].p.x, b.chunks[j].p.z - b.chunks[j-1].p.z); s.len = L || 1; }
     const f = b.legs.map(L => ({ x: L.foot.x, z: L.foot.z, pl: L.planted && !L.stepping }));
     if (s.feet && s.feet.length === f.length) for (let j = 0; j < f.length; j++) if (s.feet[j].pl && f[j].pl) { s.slide += Math.hypot(f[j].x - s.feet[j].x, f[j].z - s.feet[j].z); s.slideN++; } s.feet = f;
     if (s.prev) s.dist += Math.hypot(mid.x - s.prev.x, mid.z - s.prev.z);
     s.steps++; if (b.steer) s.steered++;
     const it = c.intent, w = it && Math.hypot(it.x, it.z) > 0.2 ? Math.atan2(it.z, it.x) : null;
     if (s.turn) { const dx = mid.x - s.turn.x, dz = mid.z - s.turn.z, along = dx*Math.cos(s.turn.a) + dz*Math.sin(s.turn.a); if (along > s.turn.far) s.turn.far = along; if (++s.turn.n > 90) { s.carry.push(s.turn.far / s.len); s.turn = null; } }
     if (w != null && s.wish != null && !s.turn) { let d = Math.abs(w - s.wish); if (d > Math.PI) d = 2*Math.PI - d; if (d > 1.05 && s.prev) s.turn = { x: mid.x, z: mid.z, a: s.wish, far: 0, n: 0 }; }
     if (w != null) s.wish = w; s.prev = { x: mid.x, z: mid.z }; }); }
 const sum = (f) => S.reduce((a, s) => a + f(s), 0), carry = S.flatMap(s => s.carry).sort((a, b) => a - b);
 return { nan, slide: sum(s => s.slide) / Math.max(1, sum(s => s.slideN)), speed: sum(s => s.dist) / Math.max(1, sum(s => s.steps)) * 60, steered: sum(s => s.steered) / Math.max(1, sum(s => s.steps)),
   turns: carry.length, carryMedian: carry.length ? carry[carry.length >> 1] : null, carryMax: carry.length ? carry[carry.length - 1] : null, crew: crew.length }; }"""
if __name__ == "__main__":
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"])
        for on in (True, False):
            pg = b.new_page(viewport={"width": 1000, "height": 700}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL); pg.wait_for_function("window.__ed && window.__maw && window.walkers && walkers.W", timeout=60000); pg.wait_for_timeout(1200)
            r = pg.evaluate(JS, [SECS, on]); pg.close()
            f = lambda v, d=3: "-" if v is None else f"{v:.{d}f}"
            print(f"{'body first' if on else 'old way   '}: crew {r['crew']}  nan {r['nan']}  errors {len(errs)}  slide/planted step {f(r['slide'],4)}  speed {f(r['speed'],2)}/s  steered {f(r['steered']*100,0)}% of steps  turns {r['turns']}  carry median {f(r['carryMedian'],2)} max {f(r['carryMax'],2)} body lengths")
        b.close()
