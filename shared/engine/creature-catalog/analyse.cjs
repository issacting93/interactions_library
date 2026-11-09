// Renders every part in shared/data/creature-parts.json at 48px and records how much ink it has and a 12x12
// signature, so build.py can hide empty drawings and exact repeats. Needs Playwright:
//   node shared/engine/creature-catalog/analyse.cjs && python3 shared/engine/creature-catalog/build.py
// render every part to a 48px canvas; measure ink coverage, contrast, and a 12x12 signature for duplicates
const { chromium } = require('playwright'); const fs=require('fs');
const P=JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '..', 'data', 'creature-parts.json'),'utf8'));
(async()=>{const b=await chromium.launch();const pg=await b.newPage();
 await pg.setContent('<canvas id=c width=48 height=48></canvas>');
 const out=await pg.evaluate(async(P)=>{
  const c=document.getElementById('c'),x=c.getContext('2d',{willReadFrequently:true});const res={};
  for(const p of P){const m=Math.max(+p.w,+p.h)/2+6;
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${2*m} ${2*m}" width="48" height="48">${p.defs?`<defs>${p.defs}</defs>`:''}${p.svg}</svg>`;
   const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
   try{await img.decode();}catch(e){res[p.id]={err:1};continue;}
   x.fillStyle='#000';x.fillRect(0,0,48,48);x.drawImage(img,0,0,48,48);
   const d=x.getImageData(0,0,48,48).data;let ink=0,lum=0;const sig=new Array(144).fill(0);
   for(let i=0;i<48*48;i++){const L=(d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11);if(L>18){ink++;lum+=L;const yy=Math.floor(Math.floor(i/48)/4),xx=Math.floor((i%48)/4);sig[yy*12+xx]++;}}
   res[p.id]={ink,lum:ink?Math.round(lum/ink):0,sig:sig.map(v=>v>3?1:0).join('')};}
  return res;},P);
 fs.writeFileSync(require('path').join(__dirname, 'analysis.json'),JSON.stringify(out));await b.close();})();
