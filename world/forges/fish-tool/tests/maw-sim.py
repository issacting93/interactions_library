"""Simulations of the Maw driven by its own brain (maw.auto): how well it moves and how well it catches.
  python3 -m http.server 8731        (at the repo root, in another shell)
  python3 world/forges/fish-tool/tests/maw-sim.py [runs] [seconds]      defaults: 3 runs of 60 s of tank time
Each run loads the tank fresh, starts as the Maw with the brain on and steps the world by hand (1/30 s), so it does not
depend on the frame rate. Measured: the walk (speed, floor contact, feet that slide while planted), the strikes (how many,
the charge, the distance, the hit rate), the meals, the time to the first one, and whether it stayed alive.
Needs playwright and Chrome (CHROME for its path)."""
import os, sys, json
from playwright.sync_api import sync_playwright
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
SECS = float(sys.argv[2]) if len(sys.argv) > 2 else 60
URL = os.environ.get("URL", "http://localhost:8731/world/forges/fish-tool/Cybernetic%20Ecology.html")
JS = r"""(secs)=>{ paused=true;
 const m=__maw, ai=EcologyMawAI.create(), g=m.guest, dt=1/30, n=Math.round(secs/dt), D=EcologyDiet; window.__mawAI=ai;
 const feet=()=>m.body.legs.map(L=>({x:L.foot.x,z:L.foot.z,pl:L.planted&&!L.stepping}));
 let pf=feet(), slide=0, slideN=0, nan=false, walkT=0, walkD=0, hmax=0, hsum=0, hn=0, dist=0, dead=null, lastP=null, stuck=0, stuckMax=0, stuckInfo=null, maxSpeed=0, nBody=m.body, caughtT=0, lastEnergy=g.diet?g.diet.energy:null;
 const e0=g.diet?g.diet.energy:null; let eMin=e0, heldBy=null;
 for(let i=0;i<n;i++){
   EcologyWalkers.step(walkers,dt,()=>EcologySim.step(sim,dt)); D.step(diet,dt); EcologyMawAI.step(ai,m,dt); EcologyMaw.step(m,dt);
   if(!m.guest){dead=i*dt;break}
   if(g.caught){caughtT+=dt; heldBy=heldBy||SPECIES[g.caught.sp].name}
   const b=m.body; if(b!==nBody){nBody=b; pf=feet()}
   const h=b.chunks[0].p, mid=b.chunks[b.chunks.length>>1].p; if(!isFinite(h.x+h.y+h.z)){nan=true;break}
   const nf=feet(); if(nf.length===pf.length) for(let k=0;k<nf.length;k++) if(pf[k].pl&&nf[k].pl){slide+=Math.hypot(nf[k].x-pf[k].x,nf[k].z-pf[k].z);slideN++} pf=nf;
   if(!g.caught){ const gr=walkers.W.H(mid.x,mid.z), hs=mid.y-gr-b.def.segs[b.def.segs.length>>1].h; hmax=Math.max(hmax,Math.abs(hs)); hsum+=Math.abs(hs); hn++;
     const v=b.vel(b.chunks[b.chunks.length>>1]), sp=Math.hypot(v.x,v.z); maxSpeed=Math.max(maxSpeed,sp);
     if(m.state==='walk'&&ai.mode!=='strike'){walkT+=dt;walkD+=sp*dt}
     if(lastP){ if(Math.hypot(mid.x-lastP.x,mid.z-lastP.z)<0.01&&m.state==='walk'&&ai.mode!=='strike'){stuck+=dt;stuckMax=Math.max(stuckMax,stuck); if(stuck>4&&!stuckInfo){const W=walkers.W,t=ai.target; stuckInfo={at:+(i*dt).toFixed(1), mode:ai.mode, x:+h.x.toFixed(2), z:+h.z.toFixed(2), free:W.nav.free(h.x,h.z), wp:ai.wp, tgt:t?SPECIES[t.sp].name:null, speed:b.S.speed, planted:b.legs.map(L=>L.planted), vWant:+b.vWant.toFixed(2), tower:+Math.min(...W.towers.map(q=>Math.hypot(q.x-h.x,q.z-h.z))).toFixed(1)}}}else stuck=0 } lastP={x:mid.x,z:mid.z}; }
   if(g.diet) eMin=Math.min(eMin,g.diet.energy);
 }
 const s=EcologyMawAI.stats(ai), b=m.body;
 return {secs:n*dt, dead, nan, caughtT, heldBy, def:b?{len:b.def.len, speed:b.def.speed, stride:b.def.stride}:null,
   walk:{speed:walkT?walkD/walkT:0, maxSpeed, floorMean:hn?hsum/hn:0, floorMax:hmax, slidePerPlantedStep:slideN?slide/slideN:0, stuckMax},
   strikes:{n:s.strikes, hits:s.hits, misses:s.misses, hitRate:s.hitRate, charge:s.charge, dist:s.dist},
   meals:{n:s.meals, first:s.firstMeal, perMin:s.meals/(n*dt/60)}, modes:s.modes, flee:s.flee, tier:g.diet?g.diet.tier:null, mass:g.diet?g.diet.mass:null, energy:[e0,g.diet?g.diet.energy:null,eMin],
   grown:m.lv, stuckInfo};
}"""
def run(pw, i):
    b = pw.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"])
    pg = b.new_page(viewport={"width": 1000, "height": 700}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("[data-pick=maw]", timeout=60000); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('[data-pick=maw]').click()"); pg.wait_for_timeout(1500)
    r = pg.evaluate(JS, SECS); r["errors"] = errs[:3]; b.close(); return r
def fmt(v, d=2): return "-" if v is None else (f"{v:.{d}f}" if isinstance(v, float) else str(v))
if __name__ == "__main__":
    res = []
    with sync_playwright() as pw:
        for i in range(RUNS):
            r = run(pw, i); res.append(r); w, s, m = r["walk"], r["strikes"], r["meals"]
            print(f"run {i+1}: {fmt(r['secs'],0)} s  dead={fmt(r['dead'])} nan={r['nan']}  errors={len(r['errors'])}")
            print(f"  walk    speed {fmt(w['speed'])} (def {fmt(r['def']['speed']) if r['def'] else '-'})  max {fmt(w['maxSpeed'])}  floor err mean {fmt(w['floorMean'],3)} max {fmt(w['floorMax'],3)}  slide/planted step {fmt(w['slidePerPlantedStep'],4)}  stuck max {fmt(w['stuckMax'],1)} s")
            print(f"  strikes {s['n']}  hits {s['hits']}  misses {s['misses']}  hit rate {fmt(s['hitRate'])}  charge hit {fmt(s['charge']['hit'])} miss {fmt(s['charge']['miss'])}  dist hit {fmt(s['dist']['hit'])} miss {fmt(s['dist']['miss'])}")
            print(f"  meals {m['n']}  first {fmt(m['first'],1)} s  per min {fmt(m['perMin'])}  held by hunters {fmt(r['caughtT'],1)} s ({r['heldBy']})  tier {r['tier']} mass {fmt(r['mass'],1)}  grown {r['grown']}  energy {r['energy']}")
            print(f"  modes {json.dumps({k: round(v, 1) for k, v in r['modes'].items()})}  flee {fmt(r['flee'],1)} s")
            if r.get("stuckInfo"): print("  STUCK", json.dumps(r["stuckInfo"]))
            if r["errors"]: print("  ERRORS", r["errors"])
