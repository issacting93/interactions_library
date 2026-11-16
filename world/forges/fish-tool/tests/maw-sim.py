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
 const m=__maw; m.auto=true; const b=m.member.body, dt=1/30, n=Math.round(secs/dt), D=EcologyDiet, f=m.host;
 const feet=()=>b.legs.map(L=>({x:L.foot.x,z:L.foot.z,pl:L.planted&&!L.stepping}));
 let stuckInfo=null, pf=feet(), slide=0, slideN=0, nan=false, dist=0, walkT=0, walkD=0, hmax=0, hsum=0, hn=0, modes={}, tilt=0, maxSpeed=0, dead=null, lastP=null, stuck=0, stuckMax=0, ext=0;
 const e0=f.diet?f.diet.energy:null; let eMin=e0;
 for(let i=0;i<n;i++){
   EcologyWalkers.step(walkers,dt,()=>EcologySim.step(sim,dt)); D.step(diet,dt); EcologyMaw.step(m,dt);
   if(!m.host){dead=i*dt;break}
   const h=b.chunks[0].p; if(!isFinite(h.x+h.y+h.z)){nan=true;break}
   const nf=feet(); for(let k=0;k<nf.length;k++) if(pf[k].pl&&nf[k].pl){slide+=Math.hypot(nf[k].x-pf[k].x,nf[k].z-pf[k].z);slideN++} pf=nf;
   const g=walkers.W.H(h.x,h.z), up=h.y-g, hs=up-m.def.segs[0].h; hmax=Math.max(hmax,Math.abs(hs)); hsum+=Math.abs(hs); hn++;
   const v=b.vel(b.chunks[0]), sp=Math.hypot(v.x,v.z); maxSpeed=Math.max(maxSpeed,sp);
   if(m.state==='walk'&&m.brain.mode!=='roam'||m.brain.mode==='roam'&&m.state==='walk'){ if(m.brain.mode!=='aim'){walkT+=dt;walkD+=sp*dt;} }
   modes[m.brain.mode]=(modes[m.brain.mode]||0)+dt;
   if(lastP){ if(Math.hypot(h.x-lastP.x,h.z-lastP.z)<0.01&&m.state==='walk'&&m.brain.mode!=='aim'){stuck+=dt;stuckMax=Math.max(stuckMax,stuck); if(stuck>4&&!stuckInfo){const W=walkers.W,t=m.brain.target; stuckInfo={at:+(i*dt).toFixed(1), mode:m.brain.mode, caught:!!f.caught, holding:!!f.holding, x:+h.x.toFixed(2), z:+h.z.toFixed(2), free:W.nav.free(h.x,h.z), wp:m.brain.wp, tgt:t?SPECIES[t.sp].name:null, speed:b.S.speed, planted:b.legs.map(L=>L.planted), vWant:+b.vWant.toFixed(2), tdist:+Math.hypot(b.target.x-h.x,b.target.z-h.z).toFixed(2), tower:W.towers.map(q=>+Math.hypot(q.x-h.x,q.z-h.z).toFixed(1)).sort((a,b)=>a-b)[0]}}}else stuck=0 } lastP={x:h.x,z:h.z};
   if(f.diet) eMin=Math.min(eMin,f.diet.energy);
 }
 const s=EcologyMaw.stats(m), L=s.log, hits=L.filter(x=>x.hit), mis=L.filter(x=>!x.hit);
 const avg=(a,k)=>a.length?a.reduce((q,x)=>q+(x[k]||0),0)/a.length:null;
 return {secs:n*dt, dead, nan, def:{len:m.def.len, speed:m.def.speed, stride:m.def.stride, Lm:m.def.Lm},
   walk:{speed:walkT?walkD/walkT:0, maxSpeed, distance:s.walked, floorMean:hn?hsum/hn:0, floorMax:hmax, slidePerPlantedStep:slideN?slide/slideN:0, stuckMax},
   strikes:{n:s.strikes, hits:s.hits, misses:s.misses, hitRate:s.hitRate, charge:{hit:avg(hits,'charge'),miss:avg(mis,'charge')}, dist:{hit:avg(hits,'d'),miss:avg(mis,'d')}, reachMax:s.reachMax},
   meals:{n:s.meals, first:s.firstMeal, perMin:s.meals/(n*dt/60), escaped:s.escaped}, modes, flee:s.flee, tier:f.diet?f.diet.tier:null, mass:f.diet?f.diet.mass:null, energy:[e0,f.diet?f.diet.energy:null,eMin],
   grown:m.lv, caught:!!f.caught, stuckInfo, deathBy:dead!=null?{caught:!!f.caught,by:f.caught?SPECIES[f.caught.sp].name:null}:null};
}"""
def run(pw, i):
    b = pw.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"])
    pg = b.new_page(viewport={"width": 1000, "height": 700}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("[data-pick=maw]", timeout=60000); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('[data-pick=maw]').click()"); pg.wait_for_timeout(800)
    r = pg.evaluate(JS, SECS); r["errors"] = errs[:3]; b.close(); return r
def fmt(v, d=2): return "-" if v is None else (f"{v:.{d}f}" if isinstance(v, float) else str(v))
if __name__ == "__main__":
    res = []
    with sync_playwright() as pw:
        for i in range(RUNS):
            r = run(pw, i); res.append(r); w, s, m = r["walk"], r["strikes"], r["meals"]
            print(f"run {i+1}: {fmt(r['secs'],0)} s  dead={fmt(r['dead'])} nan={r['nan']}  errors={len(r['errors'])}")
            print(f"  walk    speed {fmt(w['speed'])} (def {fmt(r['def']['speed'])})  max {fmt(w['maxSpeed'])}  floor err mean {fmt(w['floorMean'],3)} max {fmt(w['floorMax'],3)}  slide/planted step {fmt(w['slidePerPlantedStep'],4)}  stuck max {fmt(w['stuckMax'],1)} s")
            print(f"  strikes {s['n']}  hits {s['hits']}  misses {s['misses']}  hit rate {fmt(s['hitRate'])}  charge hit {fmt(s['charge']['hit'])} miss {fmt(s['charge']['miss'])}  dist hit {fmt(s['dist']['hit'])} miss {fmt(s['dist']['miss'])}  reachMax {fmt(s['reachMax'])}")
            print(f"  meals {m['n']}  first {fmt(m['first'],1)} s  per min {fmt(m['perMin'])}  escaped {m['escaped']}  tier {r['tier']} mass {fmt(r['mass'],1)}  grown {r['grown']}  energy {r['energy']}")
            print(f"  modes {json.dumps({k: round(v, 1) for k, v in r['modes'].items()})}  flee {fmt(r['flee'],1)} s")
            if r.get("stuckInfo"): print("  STUCK", json.dumps(r["stuckInfo"]))
            if r["errors"]: print("  ERRORS", r["errors"])
