// builds flora.json for the Flora Specimens page: plants (drawing + numbers) and example prey by the tank's weight band
const fs=require('fs'),vm=require('vm'),path=require('path');const R=process.argv[2],OUT=process.argv[3];
const c={window:{},console};vm.createContext(c);
for(const f of ['shared/engine/ecology/eco-core.js','shared/engine/ecology/ecology-species.js'])vm.runInContext(fs.readFileSync(path.join(R,f),'utf8'),c);
const E=c.window.EcologySpecies,W=c.window.EcoCore.Web,S=E.SPECIES;
const inner=f=>{const s=fs.readFileSync(f,'utf8');const vb=(s.match(/viewBox="([^"]+)"/)||[])[1];const g=s.replace(/^[\s\S]*?<g[^>]*>/,'').replace(/<\/g>\s*<\/svg>\s*$/,'').replace(/<title>[\s\S]*?<\/title>/g,'').replace(/ vector-effect="non-scaling-stroke"/g,'').replace(/\n\s*/g,'');return{vb,g}};
const plants=JSON.parse(fs.readFileSync(path.join(R,'shared/data/kit-plants.json'),'utf8')).plants;
const cdir=path.join(R,'world/forges/fish-tool/exports/creatures-svg');
const sp={};for(const s of S){const b=E.BEH[s.key]||{},e=E.ECO[s.key]||{},z=b.z||[0.2,0.8];
  sp[s.key]={key:s.key,name:s.name,sci:s.sci,order:s.order,len:s.swim.len,graze:!!e.graze,hunts:!!(e.eats&&e.eats.length&&!e.graze),zmid:(z[0]+z[1])/2,schools:(b.school||0)>=0.9,file:path.join(cdir,s.key+'.svg')};}
sp.maw={key:'maw',name:'The Maw',sci:'the one you play',order:'',len:1.2,graze:false,hunts:true,zmid:1,ground:true,file:path.join(cdir,'pincer.svg')};
const have=k=>sp[k]&&fs.existsSync(sp[k].file);
const bodyOf=s=>W.body({kind:s.key,length:s.len,schools:s.schools,medium:'water'});
const used=new Set();
const reach=(p,s)=>p.eco.air?s.zmid<0.5:p.eco.ground?(s.zmid>=0.55||s.ground):!s.ground||true;
const CHAIN={
 'carrion-crown':{by:[['hunter','Its kill leaves the carcass'],['eel','Its kill leaves the carcass']],to:[['plated-scavenger','Feeds on the bloom'],['leech','Feeds on the bloom'],['pincer','Feeds on the bloom']]},
 'spore-lantern':{by:[['jelly','Eats close by: the pod bursts'],['dragon','Eats close by: the pod bursts']],to:[['koi','Eats spores, carries them off'],['puffer','Eats spores, carries them off']]},
 'ladder-bloom':{by:[['hunter','Each meal near it adds a rung'],['angler','Each meal near it adds a rung']],to:[['serpent','Eats the fruit'],['manta','Eats the fruit']]},
 'fork-oak':{by:[['maw','Walks under it: leaves fall'],['pincer','Walks under it: leaves fall'],['carapace-strider','Walks under it: leaves fall']],to:[['wisp','Feeds on the litter'],['leech','Feeds on the litter']]},
 'thorn-nurse':{by:[],to:[['swift','Shelters in the thorns'],['puffer','Shelters in the thorns'],['wisp','Shelters in the thorns']]}};
const out=[];
for(const p of plants){const d=inner(path.join(R,'world/forges/fish-tool/exports/kit-plants',p.key+'.svg'));
  const ids={};(function walk(a){for(const q of a){const id=q.part||q.ring||q.array;if(id)ids[id]=(ids[id]||0)+(q.count||1)*(q.ring||q.free||q.x==null?1:2);}})(p.parts);
  const o={key:p.key,name:p.name,kind:p.kind,role:p.role,eco:p.eco,vb:d.vb,g:d.g,kit:Object.keys(ids),segs:(d.g.match(/[MLCQZ]/g)||[]).length,groups:[]};
  if(p.kind==='trapper'){const size=p.eco.size||p.eco.height,B=W.body({kind:'plant:'+p.key,length:size,jaw:p.eco.jaw,hunts:true,medium:'ground'});o.size=size;o.weight=+B.weight.toFixed(2);
    const rows=Object.values(sp).filter(s=>have(s.key)&&reach(p,s)&&(s.key!=='maw'||!p.eco.air)).map(s=>{const b=bodyOf(s);return{key:s.key,why:W.refusal(B,b),ratio:+W.ratio(B,b).toFixed(1),w:b.weight}});
    const pick=(why,n,sort)=>{const seen=new Set(),r=[];for(const x of rows.filter(x=>x.why===why).sort(sort)){const t=x.w.toFixed(2)+(sp[x.key].order||'m');if(x.key!=='maw'&&seen.has(t))continue;seen.add(t);r.push(x);if(r.length>=n)break;}return r};
    const maw=rows.filter(x=>x.key==='maw');const add=(title,why,n,sort,act)=>{let r=pick(why,n,sort);for(const m of maw)if(m.why===why&&!r.includes(m))r.unshift(m);if(r.length)o.groups.push({title,act,items:r.map(x=>({key:x.key,note:'weighs '+(+x.w.toFixed(1))}))})};
    add('Holds','',5,(a,b)=>b.w-a.w,'hold');add('Too heavy to hold','too big',3,(a,b)=>a.w-b.w,'break');add('Too small to close for','too small',2,(a,b)=>b.w-a.w,'pass');
  } else if(p.kind==='food'){const g=Object.values(sp).filter(s=>have(s.key)&&s.graze&&(!p.eco.air||s.zmid<0.5)).sort((a,b)=>a.len-b.len).filter((s,i,a)=>!i||s.len!==a[i-1].len||i<2).slice(0,5);
    o.groups.push({title:'Grazed by',act:'graze',items:g.map(s=>({key:s.key,note:'grazer · weighs '+(+(s.len**3).toFixed(1))}))});
    const h=Object.values(sp).filter(s=>have(s.key)&&s.hunts&&!s.ground).sort((a,b)=>b.len-a.len).slice(0,2);
    o.groups.push({title:'Left alone by',act:'pass',items:h.map(s=>({key:s.key,note:'hunter: eats no plants'}))});
  } else {const C=CHAIN[p.key];if(C.by.length)o.groups.push({title:'Set off by',act:'trigger',items:C.by.filter(x=>have(x[0])).map(x=>({key:x[0],note:x[1]}))});
    o.groups.push({title:p.key==='thorn-nurse'?'Shelters':'Feeds',act:'feed',items:C.to.filter(x=>have(x[0])).map(x=>({key:x[0],note:x[1]}))});}
  for(const g of o.groups)for(const i of g.items)used.add(i.key);out.push(o);}
const creatures={};for(const k of used){const s=sp[k],d=inner(s.file);creatures[k]={name:s.name,sci:s.sci,order:s.order,len:s.len,weight:+(s.len**3).toFixed(2),vb:d.vb,g:d.g};}
fs.writeFileSync(OUT,JSON.stringify({band:W.WEB.band,plants:out,creatures}));
for(const o of out)console.log(o.key.padEnd(16),o.kit.join(','),'|',o.groups.map(g=>g.title+': '+g.items.map(i=>i.key).join(',')).join(' | '));
console.log(Object.keys(creatures).length,'creatures',(fs.statSync(OUT).size/1024|0)+' KB');
