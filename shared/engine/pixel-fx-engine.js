/* INTERACTIONS — Pixel FX engine.
   Extracted 2026-10-31 from library/tools/image-fx-lab/image-fx-lab.html — the raster image-effects
   pipeline: 17 stackable effects (split-tone, duotone, posterize, threshold, dither, invert, edge
   detect, glyph mosaic, halftone, displace, VHS wobble, chromatic aberration, pixel sort, slices,
   bloom, scanlines, grain), nine of them pure per-pixel functions over a raw ImageData buffer
   `(d, W, H, params[, rng, frame])`, eight of them canvas-to-canvas functions for effects that
   need neighbourhood/offset access `(canvas, params[, rng, frame]) -> canvas`. A default duotone
   palette (`DUOTONES`) and canvas blend-mode list (`BLENDS`) ride along since every effect reads
   its lo/hi colors from whichever duotone is active, the same way `engine/naqsh-pattern-engine.js`'s
   generators read from `PAL`.

   This file is the shared engine only — it has no UI, no layer stack, no mask/opacity/blend
   compositing, no recipe/PNG-provenance export, no "foundry-bridge" HUD overlay. Those orchestrate
   *how* effects combine and stay in image-fx-lab.html exactly as they were; this file only holds
   *what* each effect does to pixels. Every effect that needs randomness takes an `rng` function as
   a parameter (dependency injection) rather than calling a global RNG, so this module has no seeded-
   RNG of its own — pair it with `shared/engine/rng.js` or any `() => float` generator.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../../shared/engine/pixel-fx-engine.js"></script>
   then use window.PixelFX.
*/
(function () {
  'use strict';

/* ---------- default duotone palette + blend modes ---------- */
const DUOTONES=[
 {id:"nauto",name:"ORANGE/TEAL",lo:[12,28,38],hi:[240,140,40]},
 {id:"acid",name:"ACID",lo:[20,20,10],hi:[242,230,0]},
 {id:"mono",name:"MONO",lo:[8,8,10],hi:[240,240,240]},
 {id:"cyan",name:"CYAN",lo:[6,20,24],hi:[63,216,234]},
 {id:"toxic",name:"TOXIC",lo:[8,16,8],hi:[0,229,120]},
 {id:"marathon",name:"MARATHON",lo:[16,20,6],hi:[198,245,62]},
 {id:"custom",name:"CUSTOM",lo:[10,10,12],hi:[230,230,230]},
];
const BLENDS=["source-over","screen","multiply","overlay","lighter","difference"];
const BAYER8=[[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]];
const KATA="ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ";

/* ---------- pixel FX: operate in place on an ImageData.data buffer ---------- */
function fxDuotone(d,W,H,p){const lo=p.lo,hi=p.hi;for(let i=0;i<d.length;i+=4){const g=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])/255;d[i]=lo[0]+(hi[0]-lo[0])*g;d[i+1]=lo[1]+(hi[1]-lo[1])*g;d[i+2]=lo[2]+(hi[2]-lo[2])*g;}}
function fxSplittone(d,W,H,p){
  const sh=p.lo,hi=p.hi,bal=p.balance,con=p.contrast;
  for(let i=0;i<d.length;i+=4){
    let l=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])/255;
    l=Math.min(1,Math.max(0,(l-0.5)*con+0.5)); l=l*l*(3-2*l);
    const t=Math.min(1,Math.max(0,(l-bal)/(1-bal+1e-6)));
    for(let c=0;c<3;c++){
      const tint=sh[c]*(1-t)+hi[c]*t;
      d[i+c]=(tint*0.85+d[i+c]*0.15)*(0.3+0.7*l);
    }
  }
}
function fxDither(d,W,H,p){const s=Math.max(1,Math.round(p.scale));for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];const th=(BAYER8[Math.floor(y/s)%8][Math.floor(x/s)%8]/64)*255;const on=g>th*0.9+p.bias*102;if(p.tint){d[i]=on?p.hi[0]:p.lo[0];d[i+1]=on?p.hi[1]:p.lo[1];d[i+2]=on?p.hi[2]:p.lo[2];}else{const v=on?255:0;d[i]=d[i+1]=d[i+2]=v;}}}
function fxPosterize(d,W,H,p){const lv=Math.max(2,Math.round(p.levels)),st=255/(lv-1);for(let i=0;i<d.length;i+=4){d[i]=Math.round(d[i]/st)*st;d[i+1]=Math.round(d[i+1]/st)*st;d[i+2]=Math.round(d[i+2]/st)*st;}}
function fxThreshold(d,W,H,p){const th=p.level*255;for(let i=0;i<d.length;i+=4){const v=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])>th?255:0;d[i]=d[i+1]=d[i+2]=v;}}
function fxInvert(d){for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}}
function fxScanlines(d,W,H,p,rng,frame){const gap=Math.max(2,Math.round(p.gap)),dark=p.dark,off=frame?Math.round(frame*p.gap*0.5)%gap:0;for(let y=off;y<H;y+=gap)for(let x=0;x<W;x++){const i=(y*W+x)*4;d[i]*=(1-dark);d[i+1]*=(1-dark);d[i+2]*=(1-dark);}}
function fxGrain(d,W,H,p,rng){const amt=p.amt*80;for(let i=0;i<d.length;i+=4){const nn=(rng()-0.5)*amt;d[i]+=nn;d[i+1]+=nn;d[i+2]+=nn;}}
function fxEdge(d,W,H,p){
  const g=new Float32Array(W*H);
  for(let i=0,j=0;i<d.length;i+=4,j++)g[j]=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  const t=p.tint;
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const idx=y*W+x;
    const gx=-g[idx-W-1]+g[idx-W+1]-2*g[idx-1]+2*g[idx+1]-g[idx+W-1]+g[idx+W+1];
    const gy=-g[idx-W-1]-2*g[idx-W]-g[idx-W+1]+g[idx+W-1]+2*g[idx+W]+g[idx+W+1];
    const m=Math.min(1,Math.hypot(gx,gy)/255*p.gain);
    const i4=idx*4;d[i4]=m*t[0];d[i4+1]=m*t[1];d[i4+2]=m*t[2];
  }
}

/* ---------- canvas FX: need neighbourhood/offset access, take+return a canvas ---------- */
function fxDisplace(srcCanvas,p,rng){
  const W=srcCanvas.width,H=srcCanvas.height;
  const ctx=srcCanvas.getContext("2d");
  const id=ctx.getImageData(0,0,W,H);const s=id.data;
  const out=ctx.createImageData(W,H);const o=out.data;
  const ph=[rng()*6,rng()*6,rng()*6,rng()*6];
  const f=p.freq*0.03,amp=p.amp;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const dx=amp*(Math.sin(y*f*6+ph[0])*Math.cos(x*f*4+ph[1]));
    const dy=amp*(Math.cos(y*f*5+ph[2])*Math.sin(x*f*6+ph[3]));
    const sx=Math.min(W-1,Math.max(0,Math.round(x+dx)));
    const sy=Math.min(H-1,Math.max(0,Math.round(y+dy)));
    const si=(sy*W+sx)*4,di=(y*W+x)*4;
    o[di]=s[si];o[di+1]=s[si+1];o[di+2]=s[si+2];o[di+3]=255;
  }
  ctx.putImageData(out,0,0);return srcCanvas;
}
function fxVHS(srcCanvas,p,rng,frame){
  const W=srcCanvas.width,H=srcCanvas.height;
  const snap=document.createElement("canvas");snap.width=W;snap.height=H;
  snap.getContext("2d").drawImage(srcCanvas,0,0);
  const ctx=srcCanvas.getContext("2d");
  const ph=rng()*6+(frame||0)*0.4;
  for(let y=0;y<H;y++){
    const off=Math.round(p.amp*Math.sin(y*0.05+ph)+(rng()<p.tear?(rng()-0.5)*60:0));
    ctx.drawImage(snap,0,y,W,1,off,y,W,1);
  }
  return srcCanvas;
}
function fxGlyphs(srcCanvas,p){
  const W=srcCanvas.width,H=srcCanvas.height;
  const sctx=srcCanvas.getContext("2d");
  const id=sctx.getImageData(0,0,W,H).data;
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const o=out.getContext("2d");
  o.fillStyle=`rgb(${p.lo[0]},${p.lo[1]},${p.lo[2]})`;o.fillRect(0,0,W,H);
  const cell=Math.max(6,p.cell);
  o.font=`${cell}px 'Courier New', monospace`;o.textBaseline="top";
  for(let y=0;y<H;y+=cell)for(let x=0;x<W;x+=cell){
    let sum=0,cnt=0;
    for(let yy=y;yy<Math.min(y+cell,H);yy+=2)for(let xx=x;xx<Math.min(x+cell,W);xx+=2){const i=(yy*W+xx)*4;sum+=0.299*id[i]+0.587*id[i+1]+0.114*id[i+2];cnt++;}
    const g=sum/cnt/255;if(g<0.06)continue;
    const ch=KATA[Math.min(KATA.length-1,Math.floor(g*KATA.length))];
    o.fillStyle=g>0.7?`rgb(${p.hi[0]},${p.hi[1]},${p.hi[2]})`:`rgba(${p.hi[0]},${p.hi[1]},${p.hi[2]},${0.25+g*0.6})`;
    o.fillText(ch,x,y);
  }
  return out;
}
function fxChroma(srcCanvas,p){
  const W=srcCanvas.width,H=srcCanvas.height;
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const o=out.getContext("2d");
  const chan=(c)=>{const cv=document.createElement("canvas");cv.width=W;cv.height=H;const t=cv.getContext("2d");t.drawImage(srcCanvas,0,0);t.globalCompositeOperation="multiply";t.fillStyle=c;t.fillRect(0,0,W,H);return cv;};
  o.fillStyle="#000";o.fillRect(0,0,W,H);o.globalCompositeOperation="lighter";
  o.drawImage(chan("#FF0000"),-p.dx,p.dy);o.drawImage(chan("#00FF00"),0,0);o.drawImage(chan("#0000FF"),p.dx,-p.dy);
  return out;
}
function fxBloom(srcCanvas,p){
  const W=srcCanvas.width,H=srcCanvas.height;
  const sctx=srcCanvas.getContext("2d");const id=sctx.getImageData(0,0,W,H);const d=id.data;
  const bright=document.createElement("canvas");bright.width=W;bright.height=H;
  const bctx=bright.getContext("2d");const bd=bctx.createImageData(W,H);
  for(let i=0;i<d.length;i+=4){const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];const m=Math.max(0,(lum-p.thresh)/(255-p.thresh));bd.data[i]=d[i]*m;bd.data[i+1]=d[i+1]*m;bd.data[i+2]=d[i+2]*m;bd.data[i+3]=255;}
  bctx.putImageData(bd,0,0);
  const blurred=document.createElement("canvas");blurred.width=W;blurred.height=H;
  const bl=blurred.getContext("2d");bl.filter=`blur(${p.radius}px)`;bl.drawImage(bright,0,0);
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const o=out.getContext("2d");o.drawImage(srcCanvas,0,0);
  o.globalCompositeOperation="screen";o.globalAlpha=p.amt;o.drawImage(blurred,0,0);
  return out;
}
function fxPixelSort(srcCanvas,p,rng){
  const W=srcCanvas.width,H=srcCanvas.height;
  const ctx=srcCanvas.getContext("2d");const id=ctx.getImageData(0,0,W,H);const d=id.data;
  const th=p.thresh*255,rows=Math.min(H,Math.round(H*p.coverage));
  for(let ri=0;ri<rows;ri++){
    const y=Math.floor(rng()*H);let x=0;
    while(x<W){
      const i=(y*W+x)*4;
      if(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]>th){
        let x2=x;
        while(x2<W){const j=(y*W+x2)*4;if(0.299*d[j]+0.587*d[j+1]+0.114*d[j+2]<=th)break;x2++;}
        const seg=[];for(let k=x;k<x2;k++){const j=(y*W+k)*4;seg.push([d[j],d[j+1],d[j+2]]);}
        seg.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
        for(let k=0;k<seg.length;k++){const j=(y*W+(x+k))*4;d[j]=seg[k][0];d[j+1]=seg[k][1];d[j+2]=seg[k][2];}
        x=x2;
      }else x++;
    }
  }
  ctx.putImageData(id,0,0);return srcCanvas;
}
function fxSlices(srcCanvas,p,rng){
  const W=srcCanvas.width,H=srcCanvas.height;
  const snap=document.createElement("canvas");snap.width=W;snap.height=H;
  snap.getContext("2d").drawImage(srcCanvas,0,0);
  const ctx=srcCanvas.getContext("2d");
  for(let i=0;i<Math.round(p.count);i++){
    const y=Math.floor(rng()*H);const h=Math.floor(4+rng()*(6+p.amt*60));
    const dx=Math.round((rng()-0.5)*p.amt*160);
    ctx.drawImage(snap,0,y,W,h,dx,y,W,h);
  }
  return srcCanvas;
}
function fxHalftone(srcCanvas,p){
  const W=srcCanvas.width,H=srcCanvas.height;
  const sctx=srcCanvas.getContext("2d");const id=sctx.getImageData(0,0,W,H).data;
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const o=out.getContext("2d");
  o.fillStyle=`rgb(${p.lo[0]},${p.lo[1]},${p.lo[2]})`;o.fillRect(0,0,W,H);
  o.fillStyle=`rgb(${p.hi[0]},${p.hi[1]},${p.hi[2]})`;
  const cell=Math.max(3,p.cell),a=(p.angle*Math.PI)/180,ca=Math.cos(a),sa=Math.sin(a);
  const diag=Math.ceil(Math.hypot(W,H));
  for(let v=-diag;v<diag;v+=cell)for(let u=-diag;u<diag;u+=cell){
    const x=Math.round(u*ca-v*sa+W/2),y=Math.round(u*sa+v*ca+H/2);
    if(x<0||y<0||x>=W||y>=H)continue;
    const i=(y*W+x)*4;const g=(0.299*id[i]+0.587*id[i+1]+0.114*id[i+2])/255;
    const r=(cell/2)*Math.sqrt(1-g)*1.3;
    if(r>0.4){o.beginPath();o.arc(x,y,r,0,Math.PI*2);o.fill();}
  }
  return out;
}

/* ---------- registry: ties effect ids to their function, mode, label and param schema ---------- */
const FX_ORDER=["splittone","duotone","posterize","threshold","dither","invert","edge","glyphs","halftone","displace","vhs","chroma","pixelsort","slices","bloom","scanlines","grain"];
const FX_LABELS={splittone:"SPLIT-TONE",duotone:"DUOTONE",posterize:"POSTERIZE",threshold:"THRESHOLD",dither:"DITHER",invert:"INVERT",edge:"EDGE DETECT",glyphs:"GLYPH MOSAIC",halftone:"HALFTONE",displace:"DISPLACE",vhs:"VHS WOBBLE",chroma:"CHROMATIC",pixelsort:"PIXEL SORT",slices:"SLICES",bloom:"BLOOM",scanlines:"SCANLINES",grain:"GRAIN"};
const CANVAS_FX=new Set(["halftone","displace","vhs","chroma","pixelsort","slices","bloom","glyphs"]);
const PIXEL_FNS={splittone:fxSplittone,duotone:fxDuotone,posterize:fxPosterize,threshold:fxThreshold,dither:fxDither,invert:fxInvert,edge:fxEdge,scanlines:fxScanlines,grain:fxGrain};
const CANVAS_FNS={halftone:fxHalftone,displace:fxDisplace,vhs:fxVHS,chroma:fxChroma,pixelsort:fxPixelSort,slices:fxSlices,bloom:fxBloom,glyphs:fxGlyphs};
/* per-effect numeric-param schema: [key, min, max, step] — opacity/blend/mask are generic, handled
   by the consuming tool's own layer stack, not part of an effect's own params */
const numParams={splittone:[["balance",0,1,0.01],["contrast",0.5,2.5,0.01]],posterize:[["levels",2,10,1]],threshold:[["level",0,1,0.01]],dither:[["scale",1,6,1],["bias",-1,1,0.01]],edge:[["gain",0.5,5,0.1]],glyphs:[["cell",6,24,1]],halftone:[["cell",3,20,1],["angle",0,90,1]],displace:[["amp",2,40,1],["freq",0.2,3,0.05]],vhs:[["amp",1,20,1],["tear",0,0.1,0.005]],chroma:[["dx",0,30,1],["dy",0,20,1]],pixelsort:[["thresh",0,1,0.01],["coverage",0,1,0.01]],slices:[["count",2,40,1],["amt",0,1,0.01]],bloom:[["thresh",60,240,1],["amt",0,1,0.01],["radius",1,24,1]],scanlines:[["gap",2,8,1],["dark",0,1,0.01]],grain:[["amt",0,1,0.01]]};

/* default per-effect param values, before a tool's own opacity/blend/mask wrapper is added */
function defaultFx(){
  const base={};
  const mk=(params)=>({on:false,opacity:1,blend:"source-over",mask:{mode:"none",lum:false,lumLo:0,lumHi:1,invert:false,x:0.2,y:0.2,w:0.6,h:0.6,feather:0},...params});
  base.splittone=mk({balance:0.35,contrast:1.2});
  base.duotone=mk({});
  base.posterize=mk({levels:5});
  base.threshold=mk({level:0.5});
  base.dither=mk({scale:1,bias:0,tint:false});
  base.invert=mk({});
  base.edge=mk({gain:2,tint:[198,245,62]});
  base.glyphs=mk({cell:10});
  base.halftone=mk({cell:6,angle:45});
  base.displace=mk({amp:12,freq:1});
  base.vhs=mk({amp:5,tear:0.02});
  base.chroma=mk({dx:6,dy:2});
  base.pixelsort=mk({thresh:0.4,coverage:0.3});
  base.slices=mk({count:14,amt:0.35});
  base.bloom=mk({thresh:180,amt:0.8,radius:8});
  base.scanlines=mk({gap:3,dark:0.35});
  base.grain=mk({amt:0.3});
  return base;
}

  window.PixelFX = {
    DUOTONES, BLENDS, BAYER8, KATA,
    fxDuotone, fxSplittone, fxDither, fxPosterize, fxThreshold, fxInvert, fxScanlines, fxGrain, fxEdge,
    fxDisplace, fxVHS, fxGlyphs, fxChroma, fxBloom, fxPixelSort, fxSlices, fxHalftone,
    FX_ORDER, FX_LABELS, CANVAS_FX, PIXEL_FNS, CANVAS_FNS, numParams, defaultFx,
  };
})();
