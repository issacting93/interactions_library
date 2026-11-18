import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={"width":393,"height":852}, device_scale_factor=2); errs=[]
    pg.on("pageerror", lambda e: errs.append("PE "+str(e.stack)[:600]))
    pg.goto("http://localhost:8731/world/forges/fish-tool/Cybernetic%20Ecology.html", wait_until="domcontentloaded"); pg.wait_for_timeout(15000)
    pg.evaluate("()=>{ stageBegin(MawStages.get('floor')); }"); pg.wait_for_timeout(3000)
    pg.evaluate("()=>{ EcologyMaw.kit(maw, { abil: ['harpoon','infect','sting','mimic','puff'] }); }"); pg.wait_for_timeout(800)
    park="""window.__park=()=>{ const hd=maw.body.chunks[0].p, d=maw.body.hdir, ks=walkers.ks, D=window.__D; const p=window.__prey; if(p&&!p.dead&&!p.caught){ p.x=(hd.x+d.x*D)/ks+walkers.tw/2; p.y=(hd.z+d.z*D)/ks+walkers.th/2; p.z=maw.guest.z; p.vx=p.vy=0; } if(window.__parkOn) requestAnimationFrame(window.__park); };"""
    # harpoon: prey 5 neck lengths ahead
    print("harpoon", pg.evaluate("""()=>{ window.__prey=sim.fish.find(f=>EcologyMaw.edible(maw,f)&&!f.hidden); window.__D=4; """+park+""" window.__parkOn=true; __park(); return SPECIES[__prey.sp].key }"""))
    pg.wait_for_timeout(500); pg.evaluate("()=>{ window.__parkOn=false; EcologyMaw.equip(maw,'harpoon'); maw.cd={}; maw.aimW={x:maw.body.hdir.x,y:0,z:maw.body.hdir.z}; EcologyMaw.use(maw); }")
    print(" ", pg.evaluate("()=>({tow: !!maw.on.tow, heavy: maw.on.tow&&maw.on.tow.heavy, d0: Math.hypot(__prey.x-maw.guest.x, __prey.y-maw.guest.y).toFixed(1)})"))
    pg.wait_for_timeout(2500)
    print(" ", pg.evaluate("()=>({tow: !!maw.on.tow, d1: Math.hypot(__prey.x-maw.guest.x, __prey.y-maw.guest.y).toFixed(1), ev:(diet.events||[]).slice(-2).map(e=>e.text)})"))
    # infect: prime, park prey close, lunge
    pg.evaluate("""()=>{ EcologyMaw.equip(maw,'infect'); maw.cd={}; maw.on.infect=true; window.__prey=sim.fish.find(f=>EcologyMaw.edible(maw,f)&&!f.mawEgg); window.__D=2.2; """+park+""" window.__parkOn=true; __park(); mawHeld=true; }""")
    pg.wait_for_function("()=>maw.charge>0.8", timeout=60000); print(" coil", pg.evaluate("()=>({st:maw.state, lock:!!maw.lock, hit:!!(maw.lockAt&&maw.lockAt.hit), inf: maw.on.infect})")); pg.evaluate("()=>{ mawHeld=false; }"); pg.wait_for_timeout(2500); pg.evaluate("()=>{ window.__parkOn=false; }")
    print("infect", pg.evaluate("()=>({eggs: maw.eggs.length, preyDead: __prey.dead, egg: __prey.mawEgg, ev:(diet.events||[]).slice(-3).map(e=>e.text)})"))
    pg.evaluate("()=>{ for (const o of maw.eggs) o.mawEgg = 0.2; }"); pg.wait_for_timeout(2500)
    print(" hatch", pg.evaluate("()=>({lives: maw.lives, ev:(diet.events||[]).slice(-2).map(e=>e.text)})"))
    # spare life saves from a jaw
    print(" saved", pg.evaluate("""()=>{ const g=maw.guest, h=sim.fish.find(x=>x!==g&&!x.dead&&!x.hidden&&sim.isPredator[x.sp]); h.x=g.x; h.y=g.y; h.z=g.z; const ok=EcologySim.grab(sim,h,g); return {grab: ok, caught: !!g.caught} }"""))
    pg.wait_for_timeout(1500)
    print("  ", pg.evaluate("()=>({caught: !!maw.guest.caught, lives: maw.lives, ev:(diet.events||[]).slice(-1).map(e=>e.text)})"))
    # sting and puff via the catch hook; mimic via eats
    print("STNG", pg.evaluate("""()=>{ const g=maw.guest, h=sim.fish.find(x=>x!==g&&!x.dead&&!x.hidden&&sim.isPredator[x.sp]); const r=sim.hooks.onCatch(h,g); return {catchOk:r, hFull:h.full} }"""))
    pg.evaluate("""()=>{ const g=maw.guest; window.__msp=sim.fish.find(x=>x!==g&&!x.dead&&!x.hidden&&sim.isPredator[x.sp]).sp; maw.eatenSp[SPECIES[__msp].key]=3; }"""); pg.wait_for_timeout(2500)
    print("mimic", pg.evaluate("""()=>{ const g=maw.guest, a=sim.fish.find(x=>x.sp===__msp&&!x.hidden); return {mimic: JSON.stringify([...(g.mimic||[])]), sp: __msp, eatsYou: sim.hooks.eats(a,g)} }"""))
    print(errs[:4]); b.close()
