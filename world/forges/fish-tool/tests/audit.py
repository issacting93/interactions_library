"""The rule audit for Cybernetic Ecology: every diet rule, the pod chain, steering and a run, checked in a headless browser.
  python3 -m http.server 8731        (at the repo root, in another shell)
  python3 world/forges/fish-tool/tests/audit.py
Prints one PASS or FAIL line per rule with what it measured. Needs playwright and Chrome (set CHROME to its path if not /usr/bin/google-chrome).
The sim is stepped by hand, so it does not depend on the frame rate."""
import os
from playwright.sync_api import sync_playwright
JS=r"""()=>{ paused=true; const out=[], ok=(name,pass,ev)=>out.push((pass?'PASS ':'FAIL ')+name+' :: '+ev);
 const dt=1/30, D=EcologyDiet, R=D.RULES, K=(k)=>SPECIES.findIndex(s=>s.key===k), stepN=(n)=>{for(let i=0;i<n;i++){EcologySim.step(sim,dt);D.step(diet,dt);}};
 const live=(pred)=>sim.fish.filter(f=>f.diet&&!f.guest&&!f.dead&&!f.caught&&!f.holding&&pred(f));
 const fake=(sp)=>({sp, diet:{traits:[],gut:[]}});   // a meal of that species, as onMeal sees it
 const feed=(f,key,n=1)=>{for(let i=0;i<n;i++) sim.hooks.onMeal(f,fake(K(key)));};
 const fresh=(f)=>{ const d=f.diet; d.gut=[]; d.traits=[]; d.frame=d.nativeFrame; d.mass=[2,14,30][d.native]; d.tier=d.native; d.passed=''; D.drop(diet,f,'x'); D.take(diet,f,'frame',d.nativeFrame); feed; return d; };
 diet.adapt=false;
 // ---- R1 gut
 let f=live(x=>SPECIES[x.sp].key==='hunter')[0]||live(x=>sim.isPredator[x.sp])[0]; let d=f.diet; d.gut=[]; d.traits=[]; d.mass=30; d.tier=2; feed(f,'wisp',15);
 ok('gut keeps the last 12 meals', d.gut.length===12, 'after 15 meals gut='+d.gut.length);
 // ---- R3 offers
 d.gut=[]; d.frame='shoal'; d.passed=''; feed(f,'carapace-strider',4); let r=D.describe(diet,f); const a4=r.offers.frames.includes('leg'); feed(f,'carapace-strider',1); r=D.describe(diet,f);
 ok('frame offered at 5 of 12, not at 4', !a4 && r.offers.frames.includes('leg'), 'at 4: '+a4+', at 5: '+r.offers.frames);
 const t2=r.offers.traits.includes('plate');   // 5 striders carry plate already
 d.gut=[]; d.frame='leg'; feed(f,'strike-lance',2); r=D.describe(diet,f); const h2=r.offers.traits.includes('harpoon'); feed(f,'strike-lance',1); r=D.describe(diet,f);
 ok('trait offered at 3 of 12, not at 2', !h2 && r.offers.traits.includes('harpoon'), 'at 2: '+h2+', at 3: '+r.offers.traits);
 // ---- R2 slots
 d.gut=[K('strike-lance'),K('strike-lance'),K('strike-lance'),K('plated-scavenger'),K('plated-scavenger'),K('plated-scavenger'),K('siphon'),K('siphon'),K('siphon')]; d.traits=[];
 const s1=D.take(diet,f,'trait','harpoon'), s2=D.take(diet,f,'trait','plate'), s3=D.take(diet,f,'trait','sting'), s4=D.take(diet,f,'trait','sting','harpoon');
 ok('two trait slots; a third needs one given up', s1&&s2&&!s3&&s4&&d.traits.length===2, [s1,s2,s3,s4]+' held '+d.traits);
 // ---- upkeep arithmetic
 d.traits=['plate']; d.frame='leg'; d.tier=1; r=D.describe(diet,f); ok('upkeep = tier x frame x traits', Math.abs(r.upkeep-5*0.8*1.2)<1e-6, 'mid leg plate = '+r.upkeep.toFixed(2)+' (expect 4.80)');
 // ---- R4 shed
 d.gut=[K('plated-scavenger')]; d.traits=['plate']; d.mass=30; d.tier=2; feed(f,'wisp',12); ok('a trait is shed when its prey has left the gut', !d.traits.includes('plate'), 'after 12 other meals traits='+(d.traits.join()||'none'));
 // ---- trait limits
 d.gut=Array(3).fill(K('strike-lance')).concat(Array(3).fill(K('leech')),Array(3).fill(K('koi')),Array(3).fill(K('pincer'))); d.traits=[]; d.frame='shoal'; d.tier=2; d.mass=30; d.passed=''; feed(f,'pincer',1); r=D.describe(diet,f);
 ok('large shoal body: no harpoon (shoal), no hitch (small only), no shoal trait (small/mid), no leap (leg/claw only)', !r.offers.traits.some(t=>['harpoon','hitch','shoal','leap'].includes(t)), 'offers '+(r.offers.traits.join()||'none'));
 d.frame='claw'; d.tier=0; d.mass=2; d.passed=''; d.gut=Array(3).fill(K('strike-lance')).concat(Array(3).fill(K('leech')),Array(3).fill(K('koi')),Array(2).fill(K('pincer'))); feed(f,'pincer',1); r=D.describe(diet,f);
 ok('small claw body is offered harpoon, hitch, shoal, leap', ['harpoon','hitch','shoal','leap'].every(t=>r.offers.traits.includes(t)), 'offers '+r.offers.traits.join());
 // ---- R5 tiers and size
 f=live(x=>SPECIES[x.sp].key==='koi')[0]; d=f.diet; d.gut=[]; d.traits=[]; const s0=d.scale0; d.mass=8; d.tier=0; d.native=d.native; feed(f,'wisp',1); feed(f,'wisp',1);
 ok('mass 10 is mid tier', d.tier===1 && d.mass===10, 'mass '+d.mass+' tier '+d.tier);
 stepN(150); const want=s0*(1+R.scaleStep*(d.tier-d.native)); ok('the body grows to its tier', Math.abs(f.scale-want)<0.03, 'scale '+f.scale.toFixed(3)+' want '+want.toFixed(3)+' (native tier '+d.native+')');
 // starving
 f=live(x=>sim.isPredator[x.sp]&&x.diet.tier>=1)[0]; d=f.diet; const m0=d.mass, t0=d.tier; d.mass=Math.max(d.mass, R.tiers[t0][0]+1); const m1=d.mass; d.energy=0.001; stepN(3);
 ok('a starved hunter loses mass, and a tier when it crosses the line', d.mass===Math.max(0,m1-R.starve), 'mass '+m1+' -> '+d.mass+', tier '+t0+' -> '+d.tier);
 // ---- R6 eating
 const small=live(x=>x.diet.tier===0)[0], mid=live(x=>x.diet.tier===1)[0], big=live(x=>x.diet.tier===2&&!(x.beh||sim.speciesRT[x.sp].beh).graze&&!(x.beh||sim.speciesRT[x.sp].beh).spinCatch)[0];
 const lone=live(x=>x.diet.tier===0&&!(((x.beh||sim.speciesRT[x.sp].beh).school||0)>=0.9))[0], schooler=live(x=>x.diet.tier===0&&((x.beh||sim.speciesRT[x.sp].beh).school||0)>=0.9)[0];
 ok('cannot eat above its tier', small&&mid&&sim.hooks.canEat(small,mid)===false && sim.hooks.canEat(mid,small)===true, 'small eats mid: '+sim.hooks.canEat(small,mid)+', mid eats small: '+sim.hooks.canEat(mid,small));
 ok('large ignores prey two tiers down unless it schools', big&&lone&&schooler&&sim.hooks.canEat(big,lone)===false&&sim.hooks.canEat(big,schooler)===true, big?('large '+SPECIES[big.sp].name+' eats lone '+(lone&&SPECIES[lone.sp].name)+': '+(lone&&sim.hooks.canEat(big,lone))+', eats schooling '+(schooler&&SPECIES[schooler.sp].name)+': '+(schooler&&sim.hooks.canEat(big,schooler))):'no large non-grazer alive');
 // ---- frames act
 const fr=(key)=>{ const c=live(x=>x.diet.nativeFrame==='shoal'&&x.diet.frame==='shoal'&&!x.diet.traits.length&&!sim.speciesRT[x.sp].beh.amphi).filter(x=>!used.has(x))[0]; used.add(c); D.take(diet,c,'frame',key); return c; }, used=new Set([f,small,mid,big,lone,schooler]);
 const calm=live(x=>!used.has(x)&&x.diet.nativeFrame==='shoal'&&sim.isPredator[x.sp]&&x.diet.tier===2&&!sim.speciesRT[x.sp].beh.amphi)[0]; used.add(calm); D.take(diet,calm,'frame','leg'); const leg=calm, wing=fr('wing'), claw=fr('claw'); const acc={leg:{z:0,g:0},wing:{z:0},claw:{z:0}}; let n=0;
 stepN(600); for(let i=0;i<300;i++){ stepN(1); n++; acc.leg.z+=leg.z; acc.leg.g+=(leg.ground||0); acc.wing.z+=wing.z; acc.claw.z+=claw.z; }
 ok('leg frame keeps to the floor (it lifts off to rush prey, as the tank\'s walkers do)', acc.leg.z/n>0.7, SPECIES[leg.sp].name+': ground '+(acc.leg.g/n).toFixed(2)+', depth '+(acc.leg.z/n).toFixed(2)+' (dead '+leg.dead+')');
 ok('wing frame keeps to the upper water', acc.wing.z/n<0.45, SPECIES[wing.sp].name+': depth '+(acc.wing.z/n).toFixed(2)+' (dead '+wing.dead+')');
 ok('claw frame keeps low and can pounce', acc.claw.z/n>0.55 && !!(claw.beh&&claw.beh.dash), SPECIES[claw.sp].name+': depth '+(acc.claw.z/n).toFixed(2)+', dash '+!!(claw.beh&&claw.beh.dash));
 // ---- traits act
 const tr=(key,pred)=>{ const c=live(x=>!used.has(x)&&x.diet.frame!=='shoal'||!used.has(x)&&!['harpoon','plate'].includes(key)).filter(pred||(()=>true))[0]; used.add(c); c.diet.gut=Array(4).fill(K(D.TRAITS[key].from[0])); if(D.TRAITS[key].maxTier!=null){c.diet.tier=0;c.diet.mass=2;} const okk=D.take(diet,c,'trait',key); return okk?c:null; };
 const pl=tr('plate',x=>x.diet.frame!=='shoal'); ok('plate: twice the chance to twist free, slower', pl&&pl.escMul===2&&Math.abs(pl.beh.speedMul-0.8*(sim.speciesRT[pl.sp].beh.speedMul||1))<1e-6, pl?('escMul '+pl.escMul+', speed x'+pl.beh.speedMul.toFixed(2)):'could not take');
 const st=tr('sting'); const ev0=diet.events.length; const bit=st&&sim.hooks.onCatch(big||mid, st); ok('sting: a bite on it fails', st&&bit===false&&diet.events.slice(ev0).some(e=>e.kind==='sting'), 'bite allowed: '+bit+', speed x'+(st&&st.beh.speedMul.toFixed(2)));
 const lu=tr('lure'); ok('lure: it is among the lights that draw small prey', lu&&sim.hooks.lurers.includes(lu), 'lurers '+sim.hooks.lurers.length);
 const cl=tr('cloak'); if(cl){ cl.diet.tier=0; cl.vx=0; cl.vy=0; const still=sim.hooks.canEat(big||mid,cl); cl.vx=sim.cfg.size; const moving=sim.hooks.canEat(mid,cl); const tierOk=mid.diet.tier>=cl.diet.tier; ok('cloak: unseen while still, seen when it moves', still===false&&(moving===true||!tierOk), 'still: '+still+', moving: '+moving); } else ok('cloak', false, 'could not take');
 const pu=tr('puff'); if(pu){ pu.puff=1; const hunter=live(x=>x.diet.tier>=pu.diet.tier&&EcologySim.bodyLen(sim,x)<2*EcologySim.bodyLen(sim,pu)&&x!==pu)[0], giant=live(x=>EcologySim.bodyLen(sim,x)>=2*EcologySim.bodyLen(sim,pu)&&x.diet.tier>=pu.diet.tier)[0]; ok('puff: nothing under twice its size can swallow it', hunter&&sim.hooks.canEat(hunter,pu)===false, 'similar size eats it: '+(hunter&&sim.hooks.canEat(hunter,pu))+', one twice its size: '+(giant?sim.hooks.canEat(giant,pu):'none alive')+', beh.puff '+!!pu.beh.puff); } else ok('puff', false, 'could not take');
 const hi=tr('hitch',x=>x.diet.native===0); if(hi){ stepN(240); const h=hi.diet.host; ok('hitch: it rides beside something much larger', !!h&&Math.hypot(h.x-hi.x,h.y-hi.y)<EcologySim.bodyLen(sim,h)*1.2, h?('host '+SPECIES[h.sp].name+', distance '+(Math.hypot(h.x-hi.x,h.y-hi.y)/EcologySim.bodyLen(sim,h)).toFixed(2)+' host lengths'):'no host found (dead '+hi.dead+')'); } else ok('hitch', false, 'could not take');
 const sh=tr('shoal',x=>x.diet.native<=1&&live(y=>y.sp===x.sp).length>2); if(sh){ sh.diet.gut=Array(4).fill(K('koi')).concat([K('wisp')]); const sig=sh.diet.gut.join(); sim.hooks.onMeal(big||mid, sh); const heir=sim.fish.find(o=>o!==sh&&o.sp===sh.sp&&o.diet&&o.diet.gut.join()===sig&&o.diet.traits.includes('shoal')); ok('shoal: when eaten, its record passes to the nearest of its kind', !!heir, heir?'heir found':'no heir'); } else ok('shoal trait', false, 'could not take');
 // ---- rivals and yours
 diet.adapt=true; const riv=live(x=>!used.has(x)&&sim.isPredator[x.sp])[0], me=live(x=>!used.has(x)&&x!==riv&&sim.isPredator[x.sp])[0]; diet.mine=me;
 for(const c of [riv,me]){ c.diet.traits=[]; c.diet.frame='leg'; c.diet.gut=[]; c.diet.passed=''; feed(c,'plated-scavenger',3); } const offR=!!D.describe(diet,riv).offers.traits.length, offM=!!D.describe(diet,me).offers.traits.length;
 for(let i=0;i<240;i++){ D.step(diet,dt); diet.mine=me; }
 ok('a rival takes its offer within 6 s; yours waits for you', offR&&offM&&riv.diet.traits.includes('plate')&&!me.diet.traits.includes('plate')&&D.describe(diet,me).offers.traits.includes('plate'), 'rival traits '+(riv.diet.traits.join()||'none')+', yours '+(me.diet.traits.join()||'none')+', your offer still open '+D.describe(diet,me).offers.traits.includes('plate'));
 // ---- inherit, guests
 const parent=live(x=>x.diet.traits.length>0)[0]; let inh=0, tries=0; if(parent){ for(let i=0;i<40;i++){ const g={sp:parent.sp, scale:1, x:0,y:0}; sim.hooks.onSpawn(g); tries++; if(g.diet.traits.length||g.diet.frame!==g.diet.nativeFrame) inh++; } }
 ok('a newcomer can inherit a changed record from a survivor', inh>0, inh+' of '+tries+' newcomers of '+(parent&&SPECIES[parent.sp].name)+' arrived changed');
 stepN(2); const guests=sim.fish.filter(x=>x.guest); ok('walkers stand outside the rules', guests.every(g=>!g.diet||(g.diet.gut.length===0&&!g.diet.traits.length)), guests.length+' walker guests; with a gut or traits: '+guests.filter(g=>g.diet&&(g.diet.gut.length||g.diet.traits.length)).length);
 // ---- off switch
 D.setOn(diet,false); const offOk=sim.fish.every(x=>!x.beh)&&sim.hooks.canEat(small,mid)!==false; D.setOn(diet,true); ok('rules off: every creature behaves as its species; on again restores', offOk&&!!pl.beh, 'off clears behaviours: '+offOk+', on restores plate: '+!!pl.beh);
 // ---- play: yours feeds
 const play=(key)=>{ const me2=live(x=>SPECIES[x.sp].key===key&&!used.has(x))[0]; if(!me2) return key+': none alive'; used.add(me2); diet.mine=me2; me2.diet.gut=[]; me2.diet.traits=[]; const m0=me2.diet.meals; let targeted=0, held=0; for(let i=0;i<1800;i++){ diet.mine=me2; EcologySim.step(sim,dt); D.step(diet,dt); if(me2.target)targeted++; if(me2.holding)held++; if(me2.dead)break; } const r2=D.describe(diet,me2); return SPECIES[me2.sp].name+': meals '+(me2.diet.meals-m0)+' in 60 s, gut '+r2.gut.map(g=>g.name).join(', ')+' | chasing '+Math.round(targeted/18)+'% holding '+Math.round(held/18)+'% dead '+me2.dead+' hunter '+me2.hunter; };
 const p1=play('koi'), p2=play('eel'), p3=play('serpent');
 ok('yours feeds: a koi (whose own menu is wisps only), an eel and a serpent each eat within a minute', [p1,p2,p3].every(t=>/meals [1-9]/.test(t)), [p1,p2,p3].join(' || '));
 const me3=live(x=>SPECIES[x.sp].key==='serpent'&&!used.has(x))[0]||live(x=>x.diet.tier===1&&!used.has(x))[0]; diet.mine=me3; D.step(diet,dt); const tgt=live(x=>x.sp!==me3.sp&&x.diet.tier<=me3.diet.tier&&EcologySim.bodyLen(sim,x)<=EcologySim.bodyLen(sim,me3))[0], bigT=live(x=>x.diet.tier>me3.diet.tier)[0];
 const hh1=D.hunt(diet,tgt), hh2=bigT?D.hunt(diet,bigT):'none'; ok('tap to hunt: it goes after what it may eat, and says why not otherwise', hh1===true&&me3.target===tgt&&hh2!==true, 'edible: '+hh1+', a tier above: '+hh2);
 // ---- the page's own modules arrived (the walker crew and the kit load as a module; a bad path fails silently)
 ok('the walker crew and the kit loaded', !!walkers && walkers.crew.length>0 && !!kit, 'walkers '+(walkers?walkers.crew.length:'none')+', kit '+(!!kit));
 // ---- the pod chain
 { const p=diet.pods[0], cr=live(x=>(x.diet.frame==='claw'||x.diet.frame==='leg'))[0]; p.open=false; p.work=0; diet.spores.length=0; const e0=cr.diet.energy=5;
   for(let i=0;i<50&&!p.open;i++){ cr.x=p.x; cr.y=p.y; cr.z=0.93; EcologySim.step(sim,dt); cr.x=p.x; cr.y=p.y; cr.z=0.93; D.step(diet,dt); }
   ok('a crawler at a pod cracks it: spores out, energy in', p.open&&diet.spores.length>=1&&diet.spores.length<=R.pods.spores&&cr.diet.energy>e0, 'open '+p.open+', spores '+diet.spores.length+' of '+R.pods.spores+' (one may be eaten at once)'+', energy '+e0+' -> '+cr.diet.energy.toFixed(1));
   const h=live(x=>x.diet.tier<=1&&!x.diet.para&&x!==cr&&!x.diet.traits.length)[0]; h.diet.energy=4; const sp=diet.spores[0];
   const sp0=diet.spores.length, put=()=>{ const q=diet.spores[diet.spores.length-1]; if(q){ h.x=q.x; h.y=q.y; h.z=q.z; } }; for(let i=0;i<20&&!h.diet.para&&diet.spores.length&&!h.dead;i++){ put(); EcologySim.step(sim,dt); put(); h.diet.energy=4; D.step(diet,dt); }
   const rr=h.diet.para?D.describe(diet,h):null; ok('a spore gives a parasite: one slot fewer, upkeep x1.5', !!rr&&rr.slots===R.slots-1&&Math.abs(rr.upkeep-R.tiers[h.diet.tier][2]*D.FRAMES[h.diet.frame].up*1.5)<1e-6, rr?('slots '+rr.slots+', upkeep '+rr.upkeep.toFixed(2)):('not infested; spores '+sp0+' -> '+diet.spores.length+', host tier '+h.diet.tier+' energy '+h.diet.energy.toFixed(1)+' dead '+h.dead+' caught '+!!h.caught));
   if(h.diet.para){ h.diet.para.meals=R.para.meals; D.step(diet,dt); } ok('three meals pass the parasite', !h.diet.para, 'para '+JSON.stringify(h.diet.para)); }
 // ---- by hand
 { const me=live(x=>x.diet.tier<=1&&sim.isPredator[x.sp]&&!x.diet.para)[0]; me.diet.passed=me.diet.gut.join(); diet.mine=me; D.step(diet,dt);
   ok('adopting a creature offers again what it passed up as a rival', me.diet.passed==='', 'passed "'+me.diet.passed+'"');
   const x0=me.x,y0=me.y; for(let i=0;i<60;i++){ D.steer(diet,1,0); EcologySim.step(sim,dt); D.step(diet,dt); } const dx=me.x-x0, dy=me.y-y0;
   ok('steering moves yours along the heading', dx>EcologySim.bodyLen(sim,me)*0.3&&Math.abs(dy)<Math.abs(dx), 'moved '+dx.toFixed(0)+', '+dy.toFixed(0)+' in 2 s (body '+EcologySim.bodyLen(sim,me).toFixed(0)+')');
   const e1=me.diet.energy, d1=D.dash(diet), d2=D.dash(diet); ok('dash costs energy and has a cooldown', d1&&!d2&&me.diet.energy<e1&&diet.dashCool>0, 'first '+d1+', again '+d2+', energy '+e1.toFixed(1)+' -> '+me.diet.energy.toFixed(1));
   D.infest(diet,me,'test'); for(let i=0;i<R.para.shake;i++){ diet.dashCool=0; D.dash(diet); } ok('three dashes shake a parasite off', !me.diet.para, 'para '+JSON.stringify(me.diet.para));
   D.steer(diet,0,0);
   D.startRun(diet,me); me.diet.mass=0; me.diet.tier=0; me.diet.energy=0.0001; D.step(diet,dt); const lostS=diet.run.state+' '+diet.run.why;
   D.startRun(diet,me); me.diet.tier=R.goal.tier; me.diet.mass=30; me.diet.gut=Array(6).fill(K('plated-scavenger')).concat(Array(6).fill(K('siphon'))); me.diet.traits=['plate','sting']; D.step(diet,dt); const wonS=diet.run.state;
   D.startRun(diet,me); const prey0=me; EcologySim.kill(sim,me); D.step(diet,dt); const eatS=diet.run.state+' '+diet.run.why;
   ok('a run ends: starved at the smallest, eaten, or won at the goal', lostS==='lost starved'&&wonS==='won'&&eatS==='lost eaten', [lostS,wonS,eatS].join(' | ')); diet.run=null; }
 // ---- the Maw: a walker of the tank (it needs the walkers' world and the kit)
 { const M=window.EcologyMaw, m=window.__maw;
   if(!M||!m||!window.walkers||!walkers.W){ ok('the Maw is loaded (module, kit, walkers world)', false, 'maw '+!!m+', walkers '+!!window.walkers); }
   else { const g=M.attach(m,{sim,diet,walkers}), b=m.body, ks=walkers.ks, run=(s)=>{ for(let i=0;i<Math.round(s*60);i++){ EcologySim.step(sim,dt); D.step(diet,dt); M.step(m,dt); } }, sh=()=>b.chunks[m.ia].p;
     ok('the Maw is a creature of the tank, a hidden one riding the diet rules', !!g&&g.hidden&&g.maw&&!g.guest&&sim.fish.includes(g), 'guest '+!!g);
     run(2); const q0=[sh().x,sh().z]; run(3); const idle=Math.hypot(sh().x-q0[0],sh().z-q0[1]);
     ok('at rest it stands: planted feet, no drift', idle<0.3&&b.legs.every(L=>L.planted), 'drifted '+idle.toFixed(2)+', planted '+b.legs.map(L=>+L.planted).join(''));
     const gy=walkers.W.H(sh().x,sh().z); ok('it stands on the ground, not above it', Math.abs(sh().y-gy)<b.def.Lm*1.2&&sh().y>gy-0.2, 'shoulders '+sh().y.toFixed(2)+', ground '+gy.toFixed(2));
     M.input(m,{move:[1,0],aim:[1,0]}); const w0=[sh().x,sh().z]; run(6); const walked=Math.hypot(sh().x-w0[0],sh().z-w0[1]); M.input(m,{move:null});
     ok('sent, it walks on its feet', walked>1, 'walked '+walked.toFixed(2)+' walker units in 6 s');
     run(2); const hd=b.chunks[0].p, dir=b.hdir, prey=sim.fish.find(x=>x!==g&&!x.dead&&!x.guest&&x.diet&&M.edible(m,x));
     if(!prey) ok('a lunge catches something in front of it', false, 'nothing edible in the tank');
     else { const put=()=>{ prey.x=(hd.x+dir.x*1.4)/ks+walkers.tw/2; prey.y=(hd.z+dir.z*1.4)/ks+walkers.th/2; prey.z=g.z; prey.vx=prey.vy=0; };
       const s0=[sh().x,sh().z]; M.input(m,{aim:[dir.x,dir.z],hold:true}); for(let i=0;i<70;i++){ put(); run(dt); } const charged=m.charge; M.input(m,{hold:false});
       let ext=0; for(let i=0;i<50;i++){ if(i<25) put(); run(dt); ext=Math.max(ext,m.ext); }
       ok('a lunge throws the head, not the body: the neck reaches, the shoulders stay', charged>0.9&&ext>m.neckLen*0.8&&Math.hypot(sh().x-s0[0],sh().z-s0[1])<0.5, 'charge '+charged.toFixed(2)+', reach '+ext.toFixed(2)+' of neck '+m.neckLen.toFixed(2)+', shoulders moved '+Math.hypot(sh().x-s0[0],sh().z-s0[1]).toFixed(2));
       run(1.2); ok('a lunge catches what is in front of it, and the meal is kept for a choice, not worn at once', prey.dead&&m.stock.length>=1&&m.lv.wide+m.lv.bulk+m.lv.reach===0, 'prey dead '+prey.dead+', stock '+m.stock.length+', xp '+m.xp+', lv '+JSON.stringify(m.lv)); }
     run(1); M.input(m,{hold:true,aim:[dir.x,dir.z]}); run(0.5); M.input(m,{hold:false}); run(1.2); ok('a miss recovers: it walks again', m.state==='walk'&&m.ext===0, 'state '+m.state+', ext '+m.ext.toFixed(2));
     const v=M.view(m); ok('a camera can find it: the middle of the body on the ground', !!v&&isFinite(v.x+v.y+v.z)&&v.len>0, JSON.stringify(v&&[v.x,v.y,v.z,v.len].map(x=>+x.toFixed(0))));
     let bad=0; for(const c of b.chunks) if(!isFinite(c.p.x+c.p.y+c.p.z)) bad++; ok('no broken numbers in the Maw', bad===0, bad+' bad pieces');
     // ---- levels: a threshold, then exactly one part of the person's choosing
     { m.stock=[]; m.xp=0; m.owed=0; m.offer=null; m.lvls=0; const n0=M.need(m), kinds=['plated-scavenger','strike-lance'].map(K); let i=0; while(m.owed===0&&i<20){ M.feed(m,kinds[i%2]); run(1.2); i++; }
       const offered=(m.offer||[]).map(o=>o.kind), lvSum=()=>m.lv.wide+m.lv.bulk+m.lv.reach, l0=lvSum();
       ok('a level comes only at the threshold, and offers a part from what it ate', i===n0&&m.owed===1&&offered.length>=1&&l0===0, 'meals '+i+' of '+n0+', owed '+m.owed+', offered '+offered);
       const ch=M.choose(m,offered[0]); run(0.1); const none=M.choose(m,offered[0]);
       ok('the choice grows exactly one part, then the level is spent', ch&&lvSum()===l0+1&&m.owed===0&&!none&&M.need(m)>n0, 'chose '+offered[0]+', lv '+JSON.stringify(m.lv)+', next threshold '+M.need(m)+' (was '+n0+')'); }
     // ---- soft lock-on: the nearest edible thing in the cone of the aim, marked; and it leans the strike toward it
     { run(1.5); const hd2=m.body.chunks[0].p, dr=m.body.hdir, ed=sim.fish.filter(x=>x!==g&&!x.dead&&!x.guest&&x.diet&&M.edible(m,x)), pr=ed[0];
       if(!pr) ok('the strike is marked on the nearest edible thing near the aim', false, 'nothing edible in the tank');
       else { const at=(ang,dist)=>{ pr.x=(hd2.x+Math.cos(ang)*dist)/ks+walkers.tw/2; pr.y=(hd2.z+Math.sin(ang)*dist)/ks+walkers.th/2; pr.z=g.z; pr.vx=pr.vy=0; }, a0=Math.atan2(dr.z,dr.x);
         const park=sim.fish.filter(x=>x!==pr&&x!==g&&!x.dead&&!x.guest&&x.diet&&M.edible(m,x)).map(x=>[x,x.x,x.y]); for(const [x] of park){ x.x=-9999; x.y=-9999; }
         M.input(m,{aim:[Math.cos(a0),Math.sin(a0)]}); for(let k=0;k<5;k++){ at(a0+0.3,1.4); run(0.1); } const near=m.lock===pr;
         for(let k=0;k<5;k++){ at(a0+2.5,1.4); run(0.1); } const behind=m.lock!==pr;
         ok('the strike is marked on what is near the aim, and not on what is behind it', near&&behind, 'near the aim '+near+', behind '+behind); M.input(m,{aim:null}); } }
     // ---- the shot: flat on the floor it stays as it is; a climb tilts it, and a summit swings it out on its own and gives it back
     { const S0=M.RULES.shot, r=m.rev, B=m.body, Lb=B.rest0.reduce((q,x)=>q+x,0), P=B.chunks[m.ia].p;   // the body was rebuilt by the growth above
        r.on=false; r.up=0; r.flat=0; r.low=null; r.cool=0; m.lean=0.02;
       let ever=false; for(let k=0;k<150;k++){ if(M.shot(m,dt,0).hold) ever=true; } const flatTilt=M.shot(m,dt,0).tilt;
       ok('walking on the flat never starts a swing', !ever&&Math.abs(flatTilt-S0.tilt*Math.PI/180)<1e-6, 'swing '+ever+', tilt '+(flatTilt*180/Math.PI).toFixed(1));
       const y0=P.y; m.lean=1.3; for(let k=0;k<45;k++) M.shot(m,dt,0); const climbTilt=M.shot(m,dt,0).tilt, swung=r.on;
       ok('climbing lowers the camera toward the horizon, without a swing mid-climb', climbTilt>(S0.tilt+10)*Math.PI/180&&!swung, 'tilt '+(climbTilt*180/Math.PI).toFixed(1)+', swing '+swung);
       P.y=y0+Lb*1.2; m.lean=0.05; for(let k=0;k<30;k++) M.shot(m,dt,0); const on=r.on; let hold=true, peak=0, dyawMax=0, t=0; for(;t<S0.dur+1;t+=dt){ const q=M.shot(m,dt,0); if(r.on&&!q.hold) hold=false; peak=Math.max(peak,q.tilt); dyawMax=Math.max(dyawMax,Math.abs(q.dyaw)); }
       const end=M.shot(m,dt,0); P.y=y0;
       ok('at the summit the camera swings out on its own, then hands itself back', on&&hold&&peak>(S0.revTilt-1)*Math.PI/180&&dyawMax>0.3&&!r.on&&Math.abs(end.dyaw)<1e-6&&end.dist===1, 'started '+on+', controls held '+hold+', peak tilt '+(peak*180/Math.PI).toFixed(0)+', turn '+dyawMax.toFixed(2)+' rad, over '+!r.on);
       let again=false; r.up=0; r.flat=0; r.low=P.y; m.lean=1.3; for(let k=0;k<45;k++) M.shot(m,dt,0); P.y=y0+Lb*1.2; m.lean=0.05; for(let k=0;k<30;k++) if(M.shot(m,dt,0).hold) again=true; P.y=y0;
       ok('it does not swing again straight away', !again, 'swung again '+again); r.on=false; r.up=0; r.low=null; }
     M.detach(m); ok('letting it go removes its creature', g.dead||!sim.fish.includes(g), 'still in the tank '+sim.fish.includes(g)); } }
 diet.mine=null;
 let nan=0; for(const x of sim.fish) if(!isFinite(x.x+x.y+x.z+x.scale)) nan++; ok('no broken numbers after all of this', nan===0, nan+' creatures with a bad position or size');
 return out; }"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"),args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={"width":1000,"height":700}); errs=[]
    pg.on("pageerror", lambda e: errs.append("PE "+str(e.stack)[:500]))
    pg.route("**/*", lambda r: r.abort() if "fonts.g" in r.request.url else r.continue_())
    pg.goto("http://localhost:8731/world/forges/fish-tool/Cybernetic%20Ecology.html#bench", wait_until="domcontentloaded"); pg.wait_for_timeout(16000)
    try:
        out=pg.evaluate(JS); print("\n".join(out))
    except Exception as e: print("HARNESS ERROR", str(e)[:900])
    print(errs[:4]); b.close()
