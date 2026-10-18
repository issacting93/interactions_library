import { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================
   IMAGE FX LAB
   Upload a photo, stack effects, export. Two effect classes:
   PIXEL (canvas pixel ops) and OVERLAY (vector HUD furniture).
   Pipeline runs in fixed order; each effect has on/off + params.
   ============================================================ */

function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

const BAYER8 = [
  [0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],
  [12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],
  [3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],
  [15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]];

const DUOTONES = [
  { id: "nauto",  name: "ORANGE/TEAL", lo: [12,28,38],  hi: [240,140,40] },
  { id: "acid",   name: "ACID",        lo: [20,20,10],  hi: [242,230,0] },
  { id: "mono",   name: "MONO",        lo: [8,8,10],    hi: [240,240,240] },
  { id: "cyan",   name: "CYAN",        lo: [6,20,24],   hi: [63,216,234] },
  { id: "toxic",  name: "TOXIC GREEN", lo: [8,16,8],    hi: [0,229,120] },
  { id: "blood",  name: "BLOOD",       lo: [18,4,6],    hi: [232,30,30] },
];

/* ---- pixel effects operate on ImageData in place (or return new) ---- */
function fxDuotone(d, W, H, p) {
  const lo = p.lo, hi = p.hi;
  for (let i = 0; i < d.length; i += 4) {
    const g = (0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])/255;
    d[i]   = lo[0]+(hi[0]-lo[0])*g;
    d[i+1] = lo[1]+(hi[1]-lo[1])*g;
    d[i+2] = lo[2]+(hi[2]-lo[2])*g;
  }
}
function fxDither(d, W, H, p) {
  const scale = Math.max(1, Math.round(p.scale));
  const tint = p.tint;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y*W+x)*4;
    const g = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    const th = (BAYER8[Math.floor(y/scale)%8][Math.floor(x/scale)%8]/64)*255;
    const on = g > th*0.9 + p.bias*255*0.4;
    if (tint) {
      d[i]=on?p.hi[0]:p.lo[0]; d[i+1]=on?p.hi[1]:p.lo[1]; d[i+2]=on?p.hi[2]:p.lo[2];
    } else { const v=on?255:0; d[i]=d[i+1]=d[i+2]=v; }
  }
}
function fxHalftone(srcCanvas, p) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const sctx = srcCanvas.getContext("2d");
  const id = sctx.getImageData(0,0,W,H).data;
  const out = document.createElement("canvas"); out.width=W; out.height=H;
  const o = out.getContext("2d");
  o.fillStyle = `rgb(${p.lo[0]},${p.lo[1]},${p.lo[2]})`; o.fillRect(0,0,W,H);
  o.fillStyle = `rgb(${p.hi[0]},${p.hi[1]},${p.hi[2]})`;
  const cell = Math.max(3, p.cell);
  const a = (p.angle*Math.PI)/180, ca=Math.cos(a), sa=Math.sin(a);
  const diag = Math.ceil(Math.hypot(W,H));
  for (let v=-diag; v<diag; v+=cell) for (let u=-diag; u<diag; u+=cell) {
    const x=Math.round(u*ca-v*sa+W/2), y=Math.round(u*sa+v*ca+H/2);
    if (x<0||y<0||x>=W||y>=H) continue;
    const i=(y*W+x)*4;
    const g=(0.299*id[i]+0.587*id[i+1]+0.114*id[i+2])/255;
    const k=1-g, r=(cell/2)*Math.sqrt(k)*1.3;
    if (r>0.4){o.beginPath();o.arc(x,y,r,0,Math.PI*2);o.fill();}
  }
  return out;
}
function fxChroma(srcCanvas, p) {
  const W=srcCanvas.width,H=srcCanvas.height;
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const o=out.getContext("2d");
  const chan=(color)=>{const c=document.createElement("canvas");c.width=W;c.height=H;const t=c.getContext("2d");t.drawImage(srcCanvas,0,0);t.globalCompositeOperation="multiply";t.fillStyle=color;t.fillRect(0,0,W,H);return c;};
  o.fillStyle="#000";o.fillRect(0,0,W,H);
  o.globalCompositeOperation="lighter";
  o.drawImage(chan("#FF0000"),-p.dx,p.dy);
  o.drawImage(chan("#00FF00"),0,0);
  o.drawImage(chan("#0000FF"),p.dx,-p.dy);
  return out;
}
function fxBloom(srcCanvas, p) {
  const W=srcCanvas.width,H=srcCanvas.height;
  const sctx=srcCanvas.getContext("2d");
  const id=sctx.getImageData(0,0,W,H); const d=id.data;
  const bright=document.createElement("canvas");bright.width=W;bright.height=H;
  const bctx=bright.getContext("2d");
  const bd=bctx.createImageData(W,H);
  const th=p.thresh;
  for (let i=0;i<d.length;i+=4){
    const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    const m=Math.max(0,(lum-th)/(255-th));
    bd.data[i]=d[i]*m; bd.data[i+1]=d[i+1]*m; bd.data[i+2]=d[i+2]*m; bd.data[i+3]=255;
  }
  bctx.putImageData(bd,0,0);
  bctx.filter=`blur(${p.radius}px)`;
  const blurred=document.createElement("canvas");blurred.width=W;blurred.height=H;
  const blctx=blurred.getContext("2d"); blctx.filter=`blur(${p.radius}px)`; blctx.drawImage(bright,0,0);
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const o=out.getContext("2d");
  o.drawImage(srcCanvas,0,0);
  o.globalCompositeOperation="screen"; o.globalAlpha=p.amt;
  o.drawImage(blurred,0,0);
  return out;
}
function fxScanlines(d, W, H, p) {
  const gap=Math.max(2,Math.round(p.gap)), dark=p.dark;
  for (let y=0;y<H;y+=gap) for (let x=0;x<W;x++){const i=(y*W+x)*4;d[i]*=(1-dark);d[i+1]*=(1-dark);d[i+2]*=(1-dark);}
}
function fxGrain(d, W, H, p, rng) {
  const amt=p.amt*80;
  for (let i=0;i<d.length;i+=4){const nn=(rng()-0.5)*amt;d[i]+=nn;d[i+1]+=nn;d[i+2]+=nn;}
}
function fxPixelSort(srcCanvas, p, rng) {
  const W=srcCanvas.width,H=srcCanvas.height;
  const ctx=srcCanvas.getContext("2d");
  const id=ctx.getImageData(0,0,W,H); const d=id.data;
  const th=p.thresh*255;
  const rows=Math.min(H,Math.round(H*p.coverage));
  for (let ri=0;ri<rows;ri++){
    const y=Math.floor(rng()*H);
    let x=0;
    while(x<W){
      const i=(y*W+x)*4;
      const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      if(lum>th){
        let x2=x;
        while(x2<W){const j=(y*W+x2)*4;if(0.299*d[j]+0.587*d[j+1]+0.114*d[j+2]<=th)break;x2++;}
        const seg=[];
        for(let k=x;k<x2;k++){const j=(y*W+k)*4;seg.push([d[j],d[j+1],d[j+2],d[j+3]]);}
        seg.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
        for(let k=0;k<seg.length;k++){const j=(y*W+(x+k))*4;d[j]=seg[k][0];d[j+1]=seg[k][1];d[j+2]=seg[k][2];}
        x=x2;
      } else x++;
    }
  }
  ctx.putImageData(id,0,0);
  return srcCanvas;
}
function fxSlices(srcCanvas, p, rng) {
  const W=srcCanvas.width,H=srcCanvas.height;
  const snap=document.createElement("canvas");snap.width=W;snap.height=H;
  snap.getContext("2d").drawImage(srcCanvas,0,0);
  const ctx=srcCanvas.getContext("2d");
  const n=Math.round(p.count);
  for(let i=0;i<n;i++){
    const y=Math.floor(rng()*H); const h=Math.floor(4+rng()*(6+p.amt*60));
    const dx=Math.round((rng()-0.5)*p.amt*160);
    ctx.drawImage(snap,0,y,W,h,dx,y,W,h);
  }
  return srcCanvas;
}
function fxPosterize(d, W, H, p) {
  const levels=Math.max(2,Math.round(p.levels));
  const step=255/(levels-1);
  for(let i=0;i<d.length;i+=4){d[i]=Math.round(d[i]/step)*step;d[i+1]=Math.round(d[i+1]/step)*step;d[i+2]=Math.round(d[i+2]/step)*step;}
}
function fxThreshold(d, W, H, p) {
  const th=p.level*255;
  for(let i=0;i<d.length;i+=4){const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];const v=lum>th?255:0;d[i]=v;d[i+1]=v;d[i+2]=v;}
}
function fxInvert(d) { for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];} }

/* ---- overlay (vector HUD furniture drawn over the photo) ---- */
function drawOverlay(ctx, W, H, p, rng, accent) {
  ctx.save();
  ctx.strokeStyle = accent; ctx.fillStyle = accent;
  ctx.lineWidth = 1.5 * (W/900);
  const S = Math.min(W,H);
  const cx = W*p.cx, cy = H*p.cy;
  ctx.globalAlpha = p.opacity;
  // concentric tracking rings
  if (p.rings) {
    const R = S*0.42;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
    // gapped inner
    for(let i=0;i<5;i++){const a0=(i/5)*Math.PI*2+0.1;ctx.beginPath();ctx.arc(cx,cy,R*0.78,a0,a0+0.9);ctx.stroke();}
    // dashed outer
    ctx.setLineDash([2, S*0.02]); ctx.beginPath(); ctx.arc(cx,cy,R*1.18,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  }
  // tracking dot + vertical scan line in accent
  if (p.tracker) {
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.moveTo(cx, cy-S*0.42); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, S*0.05, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, S*0.012, 0, Math.PI*2); ctx.fill();
    ctx.font = `${Math.round(S*0.016)}px 'Courier New', monospace`;
    ctx.fillText(`${Math.round(rng()*360)}\u00B0`, cx+S*0.02, cy+S*0.06);
  }
  // corner data blocks
  if (p.corners) {
    ctx.fillStyle = "#fff"; ctx.strokeStyle="rgba(255,255,255,0.5)";
    const fs = Math.round(S*0.02);
    ctx.font = `700 ${fs}px 'Courier New', monospace`;
    const code = (len)=>Array.from({length:len},()=>("ABCDEFGHJKLMNPRSTVWXYZ0123456789"[Math.floor(rng()*32)])).join("");
    ctx.textAlign="left";
    ctx.fillText(`C\u2014${code(4)}_ID`, W*0.04, H*0.06);
    ctx.fillStyle=accent; ctx.font=`900 ${Math.round(S*0.05)}px 'Arial Black',sans-serif`;
    ctx.fillText(String(Math.floor(rng()*90+10)), W*0.04, H*0.13);
    ctx.fillStyle="#fff"; ctx.font=`700 ${fs}px 'Courier New', monospace`;
    ["BI_","4T_","PS_","9H_","OM_","HEX TXT"].forEach((t,i)=>ctx.fillText(t,W*0.04,H*0.20+i*fs*1.4));
    // bottom corners
    ctx.fillText(`BA-${code(4)}`, W*0.04, H*0.90);
    ctx.fillText(`ED ${Math.floor(rng()*60)}/60`, W*0.04, H*0.925);
    ctx.fillText(`LNK ${code(4)}`, W*0.04, H*0.95);
    ctx.textAlign="right";
    ctx.fillText(`REF ${code(4)}`, W*0.96, H*0.90);
    ctx.fillText(`REF ${code(4)}`, W*0.96, H*0.925);
    ctx.textAlign="left";
  }
  // annotation leaders on right (M56 style)
  if (p.leaders) {
    ctx.strokeStyle="rgba(255,255,255,0.6)"; ctx.fillStyle="#fff";
    ctx.lineWidth=1*(W/900);
    for(let i=0;i<3;i++){
      const py=H*(0.5+i*0.13), px=W*0.62;
      ctx.beginPath();
      ctx.moveTo(px,py);
      ctx.lineTo(px+W*0.06,py-H*0.02);
      ctx.lineTo(px+W*0.24,py-H*0.02);
      ctx.stroke();
      ctx.beginPath();ctx.arc(px,py,2.5,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.restore();
}

const PIXEL_FX = [
  ["duotone","DUOTONE"],["dither","DITHER"],["halftone","HALFTONE"],["posterize","POSTERIZE"],
  ["threshold","THRESHOLD"],["invert","INVERT"],["chroma","CHROMATIC"],["pixelsort","PIXEL SORT"],
  ["slices","SLICES"],["bloom","BLOOM/GLOW"],["scanlines","SCANLINES"],["grain","GRAIN"],
];

export default function ImageFXLab() {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [hasImg, setHasImg] = useState(false);
  const [seed, setSeed] = useState(22);
  const [duoId, setDuoId] = useState("nauto");
  const [accent, setAccent] = useState("#00E5A0");
  const [fx, setFx] = useState({
    duotone:{on:false},
    dither:{on:false, scale:1, bias:0, tint:false},
    halftone:{on:false, cell:6, angle:45},
    posterize:{on:false, levels:5},
    threshold:{on:false, level:0.5},
    invert:{on:false},
    chroma:{on:false, dx:6, dy:2},
    pixelsort:{on:false, thresh:0.4, coverage:0.3},
    slices:{on:false, count:14, amt:0.35},
    bloom:{on:false, thresh:180, amt:0.8, radius:8},
    scanlines:{on:false, gap:3, dark:0.35},
    grain:{on:false, amt:0.3},
  });
  const [overlay, setOverlay] = useState({
    on:false, cx:0.45, cy:0.4, opacity:0.9,
    rings:true, tracker:true, corners:true, leaders:true,
  });

  const render = useCallback(() => {
    const img = imgRef.current, canvas = canvasRef.current;
    if (!img || !canvas) return;
    const maxW = 1000;
    const scale = Math.min(1, maxW/img.width);
    const W = Math.round(img.width*scale), H = Math.round(img.height*scale);
    canvas.width = W; canvas.height = H;
    let work = document.createElement("canvas"); work.width=W; work.height=H;
    let wctx = work.getContext("2d");
    wctx.drawImage(img,0,0,W,H);
    const duo = DUOTONES.find(d=>d.id===duoId);
    const rng = mulberry32(seed);

    // whole-canvas ops (return new canvas)
    const canvasOps = { halftone:fxHalftone, chroma:fxChroma, bloom:fxBloom, pixelsort:fxPixelSort, slices:fxSlices };
    // per-pixel ops (mutate ImageData)
    const applyPixel = (fn, p, useRng) => {
      const id = wctx.getImageData(0,0,W,H);
      fn(id.data, W, H, p, useRng?rng:undefined);
      wctx.putImageData(id,0,0);
    };

    // fixed pipeline order
    if (fx.duotone.on) applyPixel(fxDuotone,{...fx.duotone,lo:duo.lo,hi:duo.hi});
    if (fx.posterize.on) applyPixel(fxPosterize, fx.posterize);
    if (fx.threshold.on) applyPixel(fxThreshold, fx.threshold);
    if (fx.dither.on) applyPixel(fxDither,{...fx.dither,lo:duo.lo,hi:duo.hi});
    if (fx.invert.on) applyPixel(fxInvert, fx.invert);
    if (fx.halftone.on) { work = fxHalftone(work,{...fx.halftone,lo:duo.lo,hi:duo.hi}); wctx=work.getContext("2d"); }
    if (fx.chroma.on) { work = fxChroma(work, fx.chroma); wctx=work.getContext("2d"); }
    if (fx.pixelsort.on) { work = fxPixelSort(work, fx.pixelsort, rng); wctx=work.getContext("2d"); }
    if (fx.slices.on) { work = fxSlices(work, fx.slices, rng); wctx=work.getContext("2d"); }
    if (fx.bloom.on) { work = fxBloom(work, fx.bloom); wctx=work.getContext("2d"); }
    if (fx.scanlines.on) applyPixel(fxScanlines, fx.scanlines);
    if (fx.grain.on) applyPixel(fxGrain, fx.grain, true);

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(work,0,0);
    if (overlay.on) drawOverlay(ctx, W, H, overlay, mulberry32(seed^0x99), accent);
  }, [fx, overlay, duoId, accent, seed]);

  useEffect(() => { const t=setTimeout(render,50); return ()=>clearTimeout(t); }, [render]);

  const loadImage = (e) => {
    const f = e.target.files?.[0]; if(!f) return;
    const img = new Image();
    img.onload = () => { imgRef.current = img; setHasImg(true); render(); };
    img.src = URL.createObjectURL(f);
  };
  const setP = (fxId, key, val) => setFx(p=>({...p,[fxId]:{...p[fxId],[key]:val}}));
  const toggle = (fxId) => setFx(p=>({...p,[fxId]:{...p[fxId],on:!p[fxId].on}}));
  const exportPNG = () => { const a=document.createElement("a"); a.download=`fx_${seed}.png`; a.href=canvasRef.current.toDataURL("image/png"); a.click(); };

  const P = (id,key,label,min,max,step)=>(
    <div className="flex items-center gap-2">
      <span className="text-[9px] tracking-[0.14em] text-neutral-500 w-[70px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={fx[id][key]} disabled={!fx[id].on}
        onChange={e=>setP(id,key,parseFloat(e.target.value))}
        className="flex-1 accent-emerald-400 h-1 disabled:opacity-25"/>
      <span className="text-[9px] text-neutral-400 w-8 text-right tabular-nums">{typeof fx[id][key]==="number"?(max<=1?Math.round(fx[id][key]*100):Math.round(fx[id][key])):""}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-neutral-100 font-sans">
      <div className="border-b border-neutral-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-black text-base tracking-tight">FX LAB</span>
          <span className="text-neutral-500 text-[10px] tracking-[0.25em]">IMAGE PROCESSOR</span>
        </div>
        <div className="flex gap-2 items-center">
          <label className="px-3 py-1.5 border border-neutral-700 text-[10px] font-bold tracking-widest cursor-pointer hover:border-neutral-500">
            {hasImg?"REPLACE":"UPLOAD IMAGE"}
            <input type="file" accept="image/*" className="hidden" onChange={loadImage}/>
          </label>
          <button onClick={()=>setSeed(Math.floor(Math.random()*1e9))} className="px-2.5 py-1.5 border border-neutral-700 text-[10px] font-bold hover:border-neutral-500">SEED ⟳</button>
          <button onClick={exportPNG} disabled={!hasImg} className="px-3 py-1.5 bg-emerald-400 text-black text-[10px] font-black tracking-widest hover:bg-emerald-300 disabled:opacity-30">EXPORT PNG</button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 bg-neutral-950 border-b lg:border-b-0 lg:border-r border-neutral-800 p-4 flex items-center justify-center min-h-[300px]">
          {hasImg ? <canvas ref={canvasRef} className="max-w-full max-h-[80vh] h-auto shadow-2xl"/>
            : <div className="text-neutral-600 text-sm tracking-widest text-center">
                UPLOAD AN IMAGE TO BEGIN<br/><span className="text-[10px] text-neutral-700">stack effects · adjust · export</span>
              </div>}
        </div>

        <div className="w-full lg:w-[380px] p-3 flex flex-col gap-3 max-h-[calc(100vh-52px)] overflow-y-auto">
          <div className="border border-neutral-800">
            <div className="px-3 py-1.5 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center">
              <span className="text-[9px] tracking-[0.25em] text-neutral-400">DUOTONE / ACCENT</span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-1">
                {DUOTONES.map(d=>(
                  <button key={d.id} onClick={()=>setDuoId(d.id)}
                    className={`py-1.5 text-[8px] font-bold tracking-wider border ${duoId===d.id?"border-emerald-400 text-emerald-400":"border-neutral-800 text-neutral-600"}`}>
                    {d.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] tracking-[0.14em] text-neutral-500">OVERLAY ACCENT</span>
                <input type="color" value={accent} onChange={e=>setAccent(e.target.value)} className="w-8 h-6 bg-transparent border border-neutral-700"/>
              </div>
            </div>
          </div>

          <div className="border border-neutral-800">
            <div className="px-3 py-1.5 border-b border-neutral-800 bg-neutral-950 text-[9px] tracking-[0.25em] text-neutral-400">PIXEL FX — PIPELINE ORDER</div>
            <div className="p-2 flex flex-col">
              {PIXEL_FX.map(([id,label])=>(
                <div key={id} className={`border-b border-neutral-900 last:border-0 py-2 px-1 ${fx[id].on?"":"opacity-60"}`}>
                  <button onClick={()=>toggle(id)} className={`text-[10px] font-bold tracking-wider mb-1 ${fx[id].on?"text-emerald-400":"text-neutral-600"}`}>
                    {fx[id].on?"● ":"○ "}{label}
                  </button>
                  {id==="dither" && fx.dither.on && <>
                    {P("dither","scale","PIXEL SIZE",1,6,1)}
                    {P("dither","bias","BIAS",-1,1,0.01)}
                    <button onClick={()=>setP("dither","tint",!fx.dither.tint)} className={`text-[8px] font-bold tracking-wider mt-1 ${fx.dither.tint?"text-emerald-400":"text-neutral-600"}`}>{fx.dither.tint?"● ":"○ "}TINT WITH DUOTONE</button>
                  </>}
                  {id==="halftone" && fx.halftone.on && <>{P("halftone","cell","DOT SIZE",3,20,1)}{P("halftone","angle","ANGLE",0,90,1)}</>}
                  {id==="posterize" && fx.posterize.on && P("posterize","levels","LEVELS",2,10,1)}
                  {id==="threshold" && fx.threshold.on && P("threshold","level","LEVEL",0,1,0.01)}
                  {id==="chroma" && fx.chroma.on && <>{P("chroma","dx","X SHIFT",0,30,1)}{P("chroma","dy","Y SHIFT",0,20,1)}</>}
                  {id==="pixelsort" && fx.pixelsort.on && <>{P("pixelsort","thresh","THRESHOLD",0,1,0.01)}{P("pixelsort","coverage","COVERAGE",0,1,0.01)}</>}
                  {id==="slices" && fx.slices.on && <>{P("slices","count","COUNT",2,40,1)}{P("slices","amt","AMOUNT",0,1,0.01)}</>}
                  {id==="bloom" && fx.bloom.on && <>{P("bloom","thresh","THRESHOLD",60,240,1)}{P("bloom","amt","AMOUNT",0,1,0.01)}{P("bloom","radius","RADIUS",1,24,1)}</>}
                  {id==="scanlines" && fx.scanlines.on && <>{P("scanlines","gap","GAP",2,8,1)}{P("scanlines","dark","DARKNESS",0,1,0.01)}</>}
                  {id==="grain" && fx.grain.on && P("grain","amt","AMOUNT",0,1,0.01)}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-neutral-800">
            <div className="px-3 py-1.5 border-b border-neutral-800 bg-neutral-950 flex justify-between">
              <span className="text-[9px] tracking-[0.25em] text-neutral-400">HUD OVERLAY</span>
              <button onClick={()=>setOverlay(o=>({...o,on:!o.on}))} className={`text-[9px] font-bold ${overlay.on?"text-emerald-400":"text-neutral-600"}`}>{overlay.on?"● ON":"○ OFF"}</button>
            </div>
            <div className={`p-3 flex flex-col gap-2 ${overlay.on?"":"opacity-40 pointer-events-none"}`}>
              <div className="grid grid-cols-2 gap-1">
                {[["rings","RINGS"],["tracker","TRACKER"],["corners","CORNER DATA"],["leaders","LEADERS"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setOverlay(o=>({...o,[k]:!o[k]}))} className={`py-1.5 text-[9px] font-bold tracking-wider border ${overlay[k]?"border-emerald-400 text-emerald-400":"border-neutral-800 text-neutral-600"}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-2"><span className="text-[9px] text-neutral-500 w-[70px]">TARGET X</span><input type="range" min="0" max="1" step="0.01" value={overlay.cx} onChange={e=>setOverlay(o=>({...o,cx:parseFloat(e.target.value)}))} className="flex-1 accent-emerald-400 h-1"/></div>
              <div className="flex items-center gap-2"><span className="text-[9px] text-neutral-500 w-[70px]">TARGET Y</span><input type="range" min="0" max="1" step="0.01" value={overlay.cy} onChange={e=>setOverlay(o=>({...o,cy:parseFloat(e.target.value)}))} className="flex-1 accent-emerald-400 h-1"/></div>
              <div className="flex items-center gap-2"><span className="text-[9px] text-neutral-500 w-[70px]">OPACITY</span><input type="range" min="0" max="1" step="0.01" value={overlay.opacity} onChange={e=>setOverlay(o=>({...o,opacity:parseFloat(e.target.value)}))} className="flex-1 accent-emerald-400 h-1"/></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
