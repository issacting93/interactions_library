/* INTERACTIONS — Naqsh pattern engine.
   Extracted 2026-10-31 from tools/naqsh-workbench/naqsh-workbench.html (then also duplicated,
   independently, into tools/naqsh-forge/naqsh-forge.html and into a "Patterns" tab bolted onto
   a city-generator variant) — five parametric Persian/Islamic ornament generators sharing one
   seeded-RNG + SVG-path-building + palette toolkit: Girih (Hankin polygons-in-contact), Banna'i
   (brick/Kufic-maze glazing), Eslimi (spiral scrollwork), Tongbori (cut-vessel vaults/niches),
   and Facade (a region-layout compositor that fills a dome or minaret's parts with the other
   four). This file is the shared engine only — it has no UI, no tabs, no <canvas> of its own,
   and no theme opinion; it doesn't replace naqsh-workbench's parameter panel, construction
   playback, contact sheet or recipe UI, which stay in that HTML file (and in naqsh-forge's own
   node-graph UI) exactly as they were.

   Every generator shares the call signature (ctx, params, palette, seed, buildFraction) ->
   statusString, already standardized on by naqsh-forge before this extraction — callers unchanged.
   `drawFacade` additionally accepts an optional 6th `otherParams` argument: a {mode: params}
   lookup used to fill its sub-regions with "the other generators' current settings" (as
   naqsh-workbench's UI does) instead of reaching into a global; pass nothing to just use each
   region's own override values.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../shared/naqsh-pattern-engine.js"></script>
   then use window.NAQSH.
*/
(function () {
  'use strict';

/* ---------- palettes drawn from the reference tilework ---------- */
const PAL={
  dome:{name:'Dome tile · turquoise, lapis, gold',ground:'#1F8F89',ground2:'#1C3474',band:'#D8B15A',edge:'#4B330F',a1:'#1C3474',a2:'#33A89D',a3:'#C2502C',light:'#F1EAD7',dark:'#0C1A36',brick:'#B98A52',mortar:'#E6DECA',plaster:'#C98A55',cut:'#2B1610',wall:'#7A4A2C',line:'#3F6FAE'},
  minaret:{name:'Minaret glaze · turquoise on brick',ground:'#2FB0A4',ground2:'#1E3C8C',band:'#F0E3C0',edge:'#13244B',a1:'#2FB0A4',a2:'#1E3C8C',a3:'#E0B23C',light:'#F4EEDC',dark:'#1A2433',brick:'#C38A43',mortar:'#E9DEC5',plaster:'#D4A26A',cut:'#241510',wall:'#8A5A30',line:'#1E3C8C'},
  aliqapu:{name:'Ali Qapu plaster · ochre and blue',ground:'#C77B45',ground2:'#8E4A2A',band:'#4A7FC0',edge:'#1F3355',a1:'#E0A56C',a2:'#4A7FC0',a3:'#7A2E1D',light:'#F2D6AC',dark:'#2A1510',brick:'#B9763F',mortar:'#E7CBA2',plaster:'#CF8650',cut:'#2A1510',wall:'#8A4F2F',line:'#4378B8'},
  night:{name:'Night lapis · gold and turquoise',ground:'#15234F',ground2:'#0B1430',band:'#D8B45A',edge:'#070C1E',a1:'#2C9C95',a2:'#24407A',a3:'#B9462F',light:'#EFE6CC',dark:'#070C1E',brick:'#8C6A44',mortar:'#2A3550',plaster:'#3B4C7E',cut:'#060A18',wall:'#1C2850',line:'#D8B45A'},
  dusk:{name:'Desert dusk · rose sand and ember',ground:'#C9705A',ground2:'#5A2E4A',band:'#F2C77A',edge:'#3A1A22',a1:'#7A3B5A',a2:'#E09A6A',a3:'#F2C77A',light:'#F6DCC0',dark:'#2A1420',brick:'#B8714A',mortar:'#EBCDB0',plaster:'#D48A68',cut:'#2A1218',wall:'#7A3A34',line:'#5A2E4A'}
};

/* ---------- utilities ---------- */
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash(i,j,s){let h=Math.imul(i|0,374761393)+Math.imul(j|0,668265263)+Math.imul(s|0,-2048144789);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
function hx(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function mix(a,b,t){const A=hx(a),B=hx(b);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')}
function reg(cx,cy,n,R,rot){const p=[];for(let i=0;i<n;i++){const a=rot+i*2*Math.PI/n;p.push([cx+R*Math.cos(a),cy+R*Math.sin(a)])}return p}
function isect(p,d,q,e){const den=d[0]*e[1]-d[1]*e[0];if(Math.abs(den)<1e-9)return null;const t=((q[0]-p[0])*e[1]-(q[1]-p[1])*e[0])/den,u=((q[0]-p[0])*d[1]-(q[1]-p[1])*d[0])/den;if(t<=0||u<=0)return null;return[p[0]+t*d[0],p[1]+t*d[1]]}
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),f1=v=>Math.round(v*10)/10;

/* Path builder: draws on canvas and records SVG path data for cutting files */
class PB{constructor(){this.d=[];this.has=false;this._p=null;this.sub=[];this.cur=null}
  pt(x,y){if(!this.cur){this.cur=[];this.sub.push(this.cur)}this.cur.push([x,y])}
  last(){return this.cur&&this.cur.length?this.cur[this.cur.length-1]:[0,0]}
  moveTo(x,y){this.d.push('M'+f1(x)+' '+f1(y));this.has=true;this.cur=null;this.pt(x,y)}
  lineTo(x,y){this.d.push((this.has?'L':'M')+f1(x)+' '+f1(y));this.has=true;this.pt(x,y)}
  quadraticCurveTo(a,b,x,y){const[x0,y0]=this.last();for(let i=1;i<=8;i++){const t=i/8,u=1-t;this.pt(u*u*x0+2*u*t*a+t*t*x,u*u*y0+2*u*t*b+t*t*y)}this.d.push('Q'+[a,b,x,y].map(f1).join(' '))}
  bezierCurveTo(a,b,c,d,x,y){const[x0,y0]=this.last();for(let i=1;i<=10;i++){const t=i/10,u=1-t;this.pt(u*u*u*x0+3*u*u*t*a+3*u*t*t*c+t*t*t*x,u*u*u*y0+3*u*u*t*b+3*u*t*t*d+t*t*t*y)}this.d.push('C'+[a,b,c,d,x,y].map(f1).join(' '))}
  get area(){let A=0;for(const s of this.sub){let a=0;for(let i=0;i<s.length;i++){const p=s[i],q=s[(i+1)%s.length];a+=p[0]*q[1]-q[0]*p[1]}A+=Math.abs(a)/2}return A}
  arc(cx,cy,r,a0,a1){const n=Math.max(2,Math.ceil(Math.abs(a1-a0)/(Math.PI/36)));for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;this.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a))}}
  closePath(){this.d.push('Z');this.cur=null}
  get str(){return this.d.join('')}
  get P(){return this._p||(this._p=new Path2D(this.str))}}
let LOG=null;

/* ---------- Girih: Hankin polygons-in-contact (Kaplan 2005) ---------- */
function hankin(P,th){
  const n=P.length;let cx=0,cy=0;for(const v of P){cx+=v[0];cy+=v[1]}cx/=n;cy/=n;
  const c=Math.cos(th),s=Math.sin(th),star=[];
  const inward=(e,m)=>{const a=[-e[1],e[0]];return((cx-m[0])*a[0]+(cy-m[1])*a[1])>0?a:[e[1],-e[0]]};
  for(let i=0;i<n;i++){
    const A=P[i],B=P[(i+1)%n],C=P[(i+2)%n];
    const m1=[(A[0]+B[0])/2,(A[1]+B[1])/2],m2=[(B[0]+C[0])/2,(B[1]+C[1])/2];
    let e1=[B[0]-A[0],B[1]-A[1]];const l1=Math.hypot(e1[0],e1[1]);e1=[e1[0]/l1,e1[1]/l1];
    let e2=[C[0]-B[0],C[1]-B[1]];const l2=Math.hypot(e2[0],e2[1]);e2=[e2[0]/l2,e2[1]/l2];
    const n1=inward(e1,m1),n2=inward(e2,m2);
    const d1=[c*e1[0]+s*n1[0],c*e1[1]+s*n1[1]],d2=[-c*e2[0]+s*n2[0],-c*e2[1]+s*n2[1]];
    star.push(m1,isect(m1,d1,m2,d2)||B);
  }
  return star;
}
function tilesFor(kind,sc){
  const T=[],lo=-160,hi=1160,ok=(x,y)=>x>lo&&x<hi&&y>lo&&y<hi;
  if(kind==='488'){const a=sc*.42,s=a*(1+Math.SQRT2),R=a/(2*Math.sin(Math.PI/8));
    for(let i=-1;i<1000/s+2;i++)for(let j=-1;j<1000/s+2;j++){
      if(ok(i*s,j*s))T.push({p:reg(i*s,j*s,8,R,Math.PI/8),big:1});
      if(ok((i+.5)*s,(j+.5)*s))T.push({p:reg((i+.5)*s,(j+.5)*s,4,a/Math.SQRT2,0),big:0});}}
  else if(kind==='666'){const R=sc*.45,w=Math.sqrt(3)*R;
    for(let j=-1;j<1000/(1.5*R)+2;j++)for(let i=-1;i<1000/w+2;i++){const x=i*w+(j%2?w/2:0),y=j*1.5*R;if(ok(x,y))T.push({p:reg(x,y,6,R,Math.PI/6),big:1})}}
  else if(kind==='31212'){const a=sc*.26,ap=a/(2*Math.tan(Math.PI/12)),d=2*ap,R12=a/(2*Math.sin(Math.PI/12)),h=d*Math.sqrt(3)/2;
    for(let j=-2;j<1000/h+3;j++)for(let i=-2-Math.ceil(j/2);i<1000/d+3-Math.floor(j/2);i++){
      const cx=i*d+j*d/2,cy=j*h;
      if(ok(cx,cy))T.push({p:reg(cx,cy,12,R12,Math.PI/12),big:1});
      if(ok(cx+d/2,cy+d/(2*Math.sqrt(3))))T.push({p:reg(cx+d/2,cy+d/(2*Math.sqrt(3)),3,a/Math.sqrt(3),Math.PI/6),big:0});
      if(ok(cx+d,cy+d/Math.sqrt(3)))T.push({p:reg(cx+d,cy+d/Math.sqrt(3),3,a/Math.sqrt(3),Math.PI/2),big:0});}}
  else{const s=sc*.6;for(let i=-1;i<1000/s+2;i++)for(let j=-1;j<1000/s+2;j++)T.push({p:reg(i*s,j*s,4,s/Math.SQRT2,Math.PI/4),big:1})}
  return T;
}
/* Each tile yields chevrons midpoint → star tip → next midpoint. Taking every chevron as
   "over" at its starting midpoint and "under" at its end is consistent across neighbouring
   tiles, so strands alternate over and under at each crossing. */
function girihGeom(p){
  const G=[];
  for(const t of tilesFor(p.tiling,p.scale)){
    let cx=0;for(const v of t.p)cx+=v[0];cx/=t.p.length;
    const th=(p.theta+p.deform*((cx-500)/500))*Math.PI/180,st=hankin(t.p,th),ch=[];
    for(let i=0;i<st.length/2;i++)ch.push([st[2*i],st[2*i+1],st[(2*i+2)%st.length]]);
    G.push({t,st,ch,th});
  }
  return G;
}
function drawGirih(ctx,p,P,seed,b=1){
  ctx.fillStyle=P.ground;ctx.fillRect(0,0,1000,1000);
  const G=girihGeom(p),done=b>=1;
  const ph1=done?1:clamp(b/.3),ph2=done?1:clamp((b-.3)/.45),ph3=done?1:clamp((b-.75)/.25);
  if(!done){ctx.save();ctx.globalAlpha=.85*(1-ph3);ctx.strokeStyle=P.light;ctx.lineWidth=1.6;ctx.setLineDash([6,5]);
    const k=Math.ceil(ph1*G.length),sc=new Path2D();
    for(let i=0;i<k;i++){const q=G[i].t.p;sc.moveTo(q[0][0],q[0][1]);for(const v of q)sc.lineTo(v[0],v[1]);sc.closePath()}
    ctx.stroke(sc);ctx.restore()}
  if(p.fill&&ph3>0){ctx.save();ctx.globalAlpha=ph3;
    for(const g of G){const pa=new Path2D();pa.moveTo(g.st[0][0],g.st[0][1]);for(const q of g.st)pa.lineTo(q[0],q[1]);pa.closePath();ctx.fillStyle=g.t.big?P.a1:P.a2;ctx.fill(pa)}
    ctx.restore()}
  const label=G.length+' tiles';
  if(ph2<=0)return label+' · laying out the tiling';
  const wB=1.6+(p.band-1.6)*ph3,all=new Path2D(),L=(a,c,t)=>[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t];
  for(const g of G)for(const[m,X,m2]of g.ch){
    if(ph2>=1){all.moveTo(m[0],m[1]);all.lineTo(X[0],X[1]);all.lineTo(m2[0],m2[1])}
    else{const a=L(m,X,ph2),c=L(m2,X,ph2);all.moveTo(m[0],m[1]);all.lineTo(a[0],a[1]);all.moveTo(m2[0],m2[1]);all.lineTo(c[0],c[1])}}
  ctx.lineJoin='round';ctx.lineCap='round';
  if(wB>2){ctx.strokeStyle=P.edge;ctx.lineWidth=wB+3;ctx.stroke(all)}
  ctx.strokeStyle=ph3>0?P.band:P.light;ctx.lineWidth=wB;ctx.stroke(all);
  let cross=0;
  if(p.weave&&ph2>=1&&wB>2){
    const ov=new Path2D();
    for(const g of G){const s2=Math.max(.3,Math.abs(Math.sin(2*g.th)));
      for(const[m,X]of g.ch){const dx=X[0]-m[0],dy=X[1]-m[1],d=Math.hypot(dx,dy);if(d<1e-6)continue;
        const l=Math.min(d*.8,(wB+6)/s2);ov.moveTo(m[0],m[1]);ov.lineTo(m[0]+dx/d*l,m[1]+dy/d*l);cross++}}
    ctx.lineCap='butt';ctx.strokeStyle=P.edge;ctx.lineWidth=wB+3;ctx.stroke(ov);ctx.strokeStyle=P.band;ctx.lineWidth=wB;ctx.stroke(ov);ctx.lineCap='round';
  }
  if(!done)return label+(ph2<1?' · casting rays':' · banding straps');
  return label+' · '+(p.weave?Math.round(cross/2).toLocaleString()+' woven crossings':G.reduce((a,g)=>a+g.ch.length,0).toLocaleString()+' chevrons');
}
function girihSVG(p){
  const d=girihGeom(p).flatMap(g=>g.ch.map(([m,X,m2])=>`M${f1(m[0])} ${f1(m[1])}L${f1(X[0])} ${f1(X[1])}L${f1(m2[0])} ${f1(m2[1])}`)).join('');
  return`<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="300mm" viewBox="0 0 1000 1000">
<defs><clipPath id="sheet"><rect width="1000" height="1000"/></clipPath></defs>
<g id="strap-centrelines" clip-path="url(#sheet)" fill="none" stroke="#000000" stroke-width="1" stroke-linejoin="round"><path d="${d}"/></g>
<rect id="sheet-edge" width="1000" height="1000" fill="none" stroke="#FF0000" stroke-width="0.5"/>
</svg>`;
}

/* ---------- Banna'i: square Kufic maze and brick glazing ---------- */
function kufic(k,prune,r,cover){
  const Q=2*k-1,g=new Uint8Array(Q*Q),seen=new Uint8Array(k*k),br=new Int8Array(k*k);
  const sx=Math.floor(r()*k),sy=Math.floor(r()*k),st=[[sx,sy]];let nb=0;
  seen[sy*k+sx]=1;g[(2*sy)*Q+2*sx]=1;let vis=1;const lim=Math.max(2,Math.round(cover*k*k));
  while(st.length&&vis<lim){
    const[x,y]=st[st.length-1];
    const o=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>{const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&nx<k&&ny<k&&!seen[ny*k+nx]});
    if(!o.length){st.pop();continue}
    const[dx,dy]=o[Math.floor(r()*o.length)],nx=x+dx,ny=y+dy;seen[ny*k+nx]=1;vis++;
    const b=(x===sx&&y===sy)?(nb++)%2:br[y*k+x];br[ny*k+nx]=b;const tone=b?2:1;
    g[(2*ny)*Q+2*nx]=tone;if(r()>=prune)g[(2*y+dy)*Q+(2*x+dx)]=tone;
    st.push([nx,ny]);
  }
  return{g,Q};
}
/* Invented script: a seeded alphabet of square glyphs that sit on a shared baseline,
   written as words. It reads as writing without being any real script (cf. Journey's glyphs). */
const GH=7,GW=5;
function makeGlyph(r){
  const g=new Uint8Array(GH*GW),set=(x,y)=>{if(x>=0&&x<4&&y>=0&&y<GH)g[y*GW+x]=1};
  for(let x=0;x<GW;x++)g[(GH-1)*GW+x]=1;
  const el=Math.floor(r()*4);
  if(el===0){const x=r()<.5?0:2,top=r()<.5?0:1;for(let y=top;y<GH;y++)set(x,y);const hk=r();if(hk<.4)set(x+1,top);else if(hk<.7&&x>0)set(x-1,top)}
  else if(el===1){const x0=r()<.5?0:1;for(let y=3;y<GH;y++){set(x0,y);set(x0+2,y)}for(let x=x0;x<=x0+2;x++)set(x,3)}
  else if(el===2){for(const x of[0,2])for(let y=4;y<GH;y++)set(x,y)}
  else{const x=r()<.5?0:1;for(let k=x;k<=x+2;k++)set(k,2);for(let y=2;y<GH;y++)set(x+2,y)}
  if(r()<.35&&el!==1){for(let y=r()<.5?1:3;y<GH;y++)set(3,y)}
  return g;
}
function makeScript(r,n,wordLen){
  const A=[],seen=new Set();for(let t=0;t<60&&A.length<n;t++){const g=makeGlyph(r),k=g.join('');if(!seen.has(k)){seen.add(k);A.push(g)}}
  const line=()=>{const cols=[];let w=0;while(cols.length<64){const L=wordLen,tone=1+(w%2);
      for(let i=0;i<L;i++){const g=A[Math.floor(r()*A.length)],last=i===L-1;
        for(let x=0;x<GW;x++){const col=new Uint8Array(GH);for(let y=0;y<GH;y++){const v=g[y*GW+x];col[y]=v&&!(last&&x===GW-1)?tone:0}cols.push(col)}}
      cols.push(new Uint8Array(GH));w++}
    return cols};
  return{n:A.length,lines:[line(),line()]};
}
function bannaiVal(p,K){
  const m=(a,b)=>((a%b)+b)%b;
  if(p.motif==='plain')return()=>0;
  if(p.motif==='glyphs'){const LH=GH+2;return(i,j)=>{const L=Math.floor(j/LH),y=m(j,LH);if(y<1||y>GH)return 0;
    const cols=K.lines[m(L,2)],c=cols[m(i+L*13,cols.length)];const v=c[y-1];return v?(p.twotone?v:1):0}}
  if(p.motif==='kufic'){const{g,Q}=K,Pd=2*(Q-1);return(i,j)=>{let x=m(i,Pd),y=m(j,Pd);if(x>=Q)x=Pd-x;if(y>=Q)y=Pd-y;return g[y*Q+x]}}
  if(p.motif==='lozenge'){const Pd=2*p.k+2;return(i,j)=>{const u=m(i,Pd)-(Pd-1)/2,v=m(j,Pd)-(Pd-1)/2;return[1,0,2,0][Math.floor(Math.abs(u)+Math.abs(v))%4]}}
  const Pd=2*p.k;return(i,j)=>[1,0,2,0][Math.floor((i+Math.abs(m(j,Pd)-p.k))/2)%4];
}
function drawBannai(ctx,p,P,seed,b=1){
  const r=rng(seed),K=p.motif==='kufic'?kufic(p.k,p.prune/100,r,p.cover/100):p.motif==='glyphs'?makeScript(r,Math.max(5,p.k+3),Math.max(2,p.k-1)):null,val=bannaiVal(p,K);
  const c=p.cell,gap=p.mortar?c*.14:.8,glaze=[null,P.a1,p.twotone?P.a2:P.a1],rel=p.relief&&p.motif!=='plain';
  const brick=(i,j)=>{const h=hash(i,j,seed);return mix(rel?mix(P.brick,'#000000',.2):P.brick,h>.5?'#FFFFFF':'#000000',Math.abs(h-.5)*.22)};
  const rows=Math.ceil(1000/c),laid=j=>b>=1||(rows-1-j)/rows<b;let n=0;
  /* relief: glazed bricks stand proud of the wall and cast a painted shadow down and to the right */
  const lay=(x,y,w,hh,v,i,j,sx)=>{if(rel&&v){ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(x+c*.16*sx,y+c*.18,w,hh)}
    ctx.fillStyle=v?glaze[v]:brick(i,j);ctx.fillRect(x,y,w,hh);
    if(rel&&v){ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(x,y,w,Math.max(1,c*.1))}};
  if(p.view==='flat'){
    ctx.fillStyle=rel?mix(P.mortar,'#000000',.15):P.mortar;ctx.fillRect(0,0,1000,1000);
    for(let j=0;j<rows;j++){if(!laid(j))continue;for(let i=0;i<rows;i++){lay(i*c+gap/2,j*c+gap/2,c-gap,c-gap,val(i,j),i,j,1);n++}}
  }else{
    ctx.fillStyle=P.dark;ctx.fillRect(0,0,1000,1000);
    const R=330,C=Math.max(12,Math.round(TAU*R/c)),turn=p.turn*Math.PI/180;
    for(let i=0;i<C;i++){
      const f0=i/C*TAU+turn,f1v=(i+1)/C*TAU+turn,fm=(f0+f1v)/2;if(Math.cos(fm)<=0)continue;
      const x0=500+R*Math.sin(f0),x1=500+R*Math.sin(f1v),w=x1-x0,gx=gap*w/c;
      ctx.fillStyle=P.mortar;ctx.fillRect(x0,0,w+.6,1000);
      for(let j=0;j<rows;j++){if(!laid(j))continue;lay(x0+gx/2,j*c+gap/2,Math.max(.4,w-gx),c-gap,val(i,j),i,j,w/c);n++}
      const lit=.3+.7*Math.max(0,Math.cos(fm+.45));ctx.fillStyle='rgba(0,0,0,'+((1-lit)*.72).toFixed(3)+')';ctx.fillRect(x0,0,w+.6,1000);
    }
  }
  return n.toLocaleString()+' bricks'+(b<1?' laid':'')+' · '+(p.motif==='kufic'?'maze on '+p.k+'×'+p.k+' nodes':p.motif==='glyphs'?'script of '+K.n+' glyphs, '+Math.max(2,p.k-1)+'-letter words':p.motif==='plain'?'unglazed':'period '+(p.motif==='lozenge'?2*p.k+2:2*p.k)+' cells');
}

/* ---------- Eslimi: tightening spiral scrolls under symmetry ---------- */
function stemOf(pts,sw,t0){const path=new Path2D();path.moveTo(pts[0][0],pts[0][1]);for(const q of pts)path.lineTo(q[0],q[1]);return{pts,path,sw,t0}}
/* A stem is a spiral whose curvature rises with arc length, so it tightens into an eye */
function makeGrower(p,r,M){
  const grow=(x,y,h,len,curl,depth,sw,t0,leafy,os)=>{
    const N=Math.max(10,Math.round(len/5)),ds=len/N,k0=curl*2/len,pts=[[x,y]],sp=[];
    for(let i=1;i<=N;i++){const t=i/N;h+=k0*(.5+2.5*t*t)*ds;x+=Math.cos(h)*ds;y+=Math.sin(h)*ds;pts.push([x,y]);
      if((depth>0||leafy)&&(i===Math.round(N*.36)||i===Math.round(N*.64)))sp.push([x,y,h,i/N])}
    const stem=stemOf(pts,sw,t0);M.stems.push(stem);M.T=Math.max(M.T,t0+1.3);
    const s=os||Math.max(10,sw*2.4+len*.09);
    if(r()<p.flowers/100)M.orn.push({t:'f',x,y,s,k:5+Math.floor(r()*4),h,at:t0+1});
    else M.orn.push({t:'l',x,y,h:h+Math.sign(curl)*.6,L:os?os*1.3:Math.max(14,len*.15+sw*2),at:t0+1});
    for(const[a,bb,c,fr]of sp){const sg=Math.sign(curl)||1;
      M.orn.push({t:'l',x:a,y:bb,h:c+sg*1.3,L:sw*2.2+8,at:t0+fr});
      if(depth>0)grow(a,bb,c-sg*(.9+.4*r()),len*(.46+.14*r()),-curl*(.85+.3*r()),depth-1,Math.max(1.2,sw*.68),t0+fr)}
    return stem;
  };
  return grow;
}
function genEslimi(p,r,seeds){
  const M={stems:[],orn:[],T:1},grow=makeGrower(p,r,M);
  for(const s of seeds)grow(s[0],s[1],s[2],s[3],s[4],p.depth,p.stroke,0);
  return M;
}
/* Circle packing after Hamekasi & Samavati: pack circles largest-first, link each to its
   nearest larger neighbour, inscribe one spiral per circle and sprout it from the parent's outer turn. */
function genPacked(p,r,reg){
  const M={stems:[],orn:[],T:1},grow=makeGrower(p,r,M),C=[],gap=p.stroke*1.2+3;
  /* size circles from the region's area so the requested count can actually fit */
  const rmax=Math.min(reg.rmax,1.3*Math.sqrt(reg.area*.5/(Math.PI*p.density))),rmin=Math.min(rmax*.85,Math.max(p.stroke*1.6+4,rmax*.42));
  for(let it=0;it<p.density;it++){let best=null;
    for(let k=0;k<120;k++){const[x,y]=reg.sample(r);let rad=Math.min(reg.dist(x,y)-p.stroke,rmax);
      for(const c of C)rad=Math.min(rad,Math.hypot(x-c.x,y-c.y)-c.r-gap);
      if(rad>=rmin&&(!best||rad>best.r))best={x,y,r:rad}}
    if(!best)break;C.push(best)}
  C.forEach((c,i)=>{let par=null,bd=1e9;for(let j=0;j<i;j++){const d=Math.hypot(c.x-C[j].x,c.y-C[j].y)-C[j].r;if(d<bd){bd=d;par=C[j]}}c.par=par;c.dep=par?par.dep+1:0});
  for(const c of C){
    const tx=c.par?c.par.x:reg.root[0],ty=c.par?c.par.y:reg.root[1],phi=Math.atan2(ty-c.y,tx-c.x),sg=c.dep%2?1:-1;
    const S=[c.x+c.r*Math.cos(phi),c.y+c.r*Math.sin(phi)],h0=phi+Math.PI-sg*Math.PI/2,len=1.55*Math.PI*c.r;
    let t0=0;
    if(c.par&&c.par.stem){
      const pp=c.par.stem.pts,lim=Math.max(2,Math.floor(pp.length*.45));let bi=1,bd2=1e18;
      for(let k=1;k<lim;k++){const d=(pp[k][0]-S[0])**2+(pp[k][1]-S[1])**2;if(d<bd2){bd2=d;bi=k}}
      const A=pp[bi],B=pp[Math.min(bi+1,pp.length-1)],ha=Math.atan2(B[1]-A[1],B[0]-A[0]),d=Math.sqrt(bd2);
      const c1=[A[0]+Math.cos(ha)*d*.5,A[1]+Math.sin(ha)*d*.5],c2=[S[0]-Math.cos(h0)*d*.5,S[1]-Math.sin(h0)*d*.5],pts=[];
      for(let k=0;k<=16;k++){const t=k/16,u=1-t;pts.push([u*u*u*A[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*S[0],u*u*u*A[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*S[1]])}
      const ct0=c.par.stem.t0+bi/(pp.length-1);M.stems.push(stemOf(pts,Math.max(1.5,p.stroke*.85),ct0));M.T=Math.max(M.T,ct0+1);t0=ct0+.35;
      if(d>p.stroke*4)M.orn.push({t:'l',x:pts[8][0],y:pts[8][1],h:ha-sg*1.1,L:p.stroke*2+8,at:ct0+.2});
    }
    c.stem=grow(S[0],S[1],h0,len,sg*len/c.r,0,c.par?p.stroke:p.stroke*1.15,t0,true,Math.max(9,c.r*.36));
  }
  M.circles=C.length;return M;
}
function underPal(P){return Object.assign({},P,{band:mix(P.ground,P.light,.55),edge:mix(P.ground,P.dark,.3),a1:mix(P.ground,P.light,.3),a3:mix(P.ground,P.light,.75),light:P.ground})}
function eslimiLayers(p,r,seedsFn,reg){
  const make=(q,rr)=>q.method==='packing'?genPacked(q,rr,reg):genEslimi(q,rr,seedsFn(q,rr));
  const main=make(p,r);
  const under=p.under?make(Object.assign({},p,{stroke:Math.max(1.2,p.stroke*.42),flowers:75,density:Math.round(p.density*1.7),stems:p.stems+1,depth:Math.max(1,p.depth-1)}),rng((r()*1e9)|0)):null;
  return{main,under};
}
function drawMotif(ctx,M,P,cart,b=1){
  const tt=b>=1?Infinity:b*M.T,ca=b>=1?1:clamp((b-.7)/.3);
  if(cart&&ca>0){ctx.save();ctx.globalAlpha=ca;ctx.fillStyle=P.ground2;ctx.fill(cart.region);ctx.restore()}
  const paths=M.stems.map(s=>{const f=tt-s.t0;if(f>=1)return s.path;if(f<=0)return null;
    const k=Math.max(1,Math.floor(f*(s.pts.length-1))),q=new Path2D();q.moveTo(s.pts[0][0],s.pts[0][1]);for(let i=1;i<=k;i++)q.lineTo(s.pts[i][0],s.pts[i][1]);return q});
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle=P.edge;M.stems.forEach((s,i)=>{if(paths[i]){ctx.lineWidth=s.sw+3;ctx.stroke(paths[i])}});
  ctx.strokeStyle=P.band;M.stems.forEach((s,i)=>{if(paths[i]){ctx.lineWidth=s.sw;ctx.stroke(paths[i])}});
  if(cart&&ca>0){ctx.save();ctx.globalAlpha=ca;ctx.strokeStyle=P.edge;ctx.lineWidth=11;ctx.stroke(cart.curve);ctx.strokeStyle=P.band;ctx.lineWidth=6;ctx.stroke(cart.curve);ctx.restore()}
  for(const o of M.orn){
    const g=tt===Infinity?1:clamp((tt-o.at)/.25);if(g<=0)continue;
    ctx.save();ctx.translate(o.x,o.y);ctx.scale(g,g);
    if(o.t==='l'){ctx.rotate(o.h);const L=o.L;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(L*.5,-L*.4,L,0);ctx.quadraticCurveTo(L*.5,L*.4,0,0);
      ctx.fillStyle=P.a1;ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle=P.band;ctx.stroke();
      ctx.beginPath();ctx.moveTo(L*.15,0);ctx.lineTo(L*.8,0);ctx.stroke()}
    else{ctx.rotate(o.h);const s=o.s;
      for(let i=0;i<o.k;i++){ctx.save();ctx.rotate(i*TAU/o.k);ctx.beginPath();ctx.ellipse(s*.55,0,s*.5,s*.27,0,0,TAU);
        ctx.fillStyle=P.a3;ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle=P.edge;ctx.stroke();ctx.restore()}
      ctx.beginPath();ctx.arc(0,0,s*.32,0,TAU);ctx.fillStyle=P.light;ctx.fill();ctx.strokeStyle=P.edge;ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,s*.12,0,TAU);ctx.fillStyle=P.band;ctx.fill()}
    ctx.restore();
  }
}
function drawEslimi(ctx,p,P,seed,b=1){
  const r=rng(seed);
  const UP=underPal(P),both=(c,L,cart)=>{if(L.under)drawMotif(c,L.under,UP,null,b);drawMotif(c,L.main,P,cart,b)};
  if(p.comp==='medallion'){
    const R=430,n=p.folds,al=Math.PI/n;
    const seedsFn=(q,rr)=>{const S=[];for(let s=0;s<q.stems;s++){const rad=R*(.1+.55*(s+.5)/q.stems),a=al*(.25+.5*rr());
      S.push([rad*Math.cos(a),rad*Math.sin(a),a+(s%2?1:-1)*(.35+.3*rr()),R*(.32+.22*rr()),(s%2?1:-1)*q.curl])}return S};
    const reg={sample:rr=>{const rad=R*Math.sqrt(.02+.98*rr()),a=al*rr();return[rad*Math.cos(a),rad*Math.sin(a)]},
      dist:(x,y)=>{const rad=Math.hypot(x,y),a=Math.atan2(y,x);return Math.min(R-14-rad,y,rad*Math.sin(al-a))},rmax:R*.21,area:.5*al*R*R,root:[0,0]};
    const Ls=eslimiLayers(p,r,seedsFn,reg),M=Ls.main,pol=(rad,a)=>[rad*Math.cos(a),rad*Math.sin(a)];
    let cart=null;if(p.cart){const A=pol(R*.3,0),B=pol(R*.93,al),c1=pol(R*.78,al*.08),c2=pol(R*.55,al*.92);
      const curve=new Path2D();curve.moveTo(A[0],A[1]);curve.bezierCurveTo(c1[0],c1[1],c2[0],c2[1],B[0],B[1]);
      const region=new Path2D();region.moveTo(A[0],A[1]);region.bezierCurveTo(c1[0],c1[1],c2[0],c2[1],B[0],B[1]);region.lineTo(0,0);region.closePath();cart={curve,region}}
    const med=(cx,cy,sc)=>{
      ctx.save();ctx.translate(cx,cy);ctx.scale(sc,sc);
      ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.fillStyle=P.ground;ctx.fill();
      for(let k=0;k<n;k++)for(const m of[1,-1]){ctx.save();ctx.rotate(k*2*al);ctx.scale(1,m);
        ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,R,0,al);ctx.closePath();ctx.clip();both(ctx,Ls,cart);ctx.restore()}
      ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.lineWidth=16;ctx.strokeStyle=P.edge;ctx.stroke();ctx.lineWidth=9;ctx.strokeStyle=P.band;ctx.stroke();
      ctx.restore()};
    ctx.fillStyle=P.ground2;ctx.fillRect(0,0,1000,1000);
    for(const[x,y]of[[0,0],[1000,0],[0,1000],[1000,1000]])med(x,y,.6);
    med(500,500,1);
    return'shamseh · '+n+'-fold mirror · '+(p.method==='packing'?M.circles+' packed circles · ':'')+M.stems.length*2*n+' stems'+(Ls.under?' + under-layer':'')+(b<1?' growing':'');
  }
  const S=p.cell,h=S/2;
  const seedsFn=(q,rr)=>{const A=[];for(let s=0;s<q.stems;s++)A.push([h*(.15+.7*rr()),h*(.15+.7*rr()),rr()*TAU,h*(.55+.45*rr()),(s%2?1:-1)*q.curl]);return A};
  const reg={sample:rr=>[h*rr(),h*rr()],dist:(x,y)=>Math.min(x,y,h-x,h-y),rmax:h*.3,area:h*h,root:[0,0]};
  const Ls=eslimiLayers(p,r,seedsFn,reg),M=Ls.main;let cart=null;
  if(p.cart){const curve=new Path2D();curve.moveTo(h*.22,0);curve.bezierCurveTo(h*.95,h*.05,h*.3,h*.75,h,h*.82);
    const region=new Path2D();region.moveTo(h*.22,0);region.bezierCurveTo(h*.95,h*.05,h*.3,h*.75,h,h*.82);region.lineTo(h,0);region.closePath();cart={curve,region}}
  ctx.fillStyle=P.ground;ctx.fillRect(0,0,1000,1000);let tiles=0;
  for(let ix=0;ix*S<1000+S;ix++)for(let iy=0;iy*S<1000+S;iy++){tiles++;
    for(const[sx,sy]of[[1,1],[-1,1],[1,-1],[-1,-1]]){ctx.save();ctx.translate(ix*S,iy*S);ctx.scale(sx,sy);
      ctx.beginPath();ctx.rect(0,0,h,h);ctx.clip();both(ctx,Ls,cart);ctx.restore()}}
  return'p4m field · '+(p.method==='packing'?M.circles+' packed circles · ':M.stems.length+' stems · ')+tiles+' repeats'+(Ls.under?' + under-layer':'');
}

/* ---------- Tongbori: cut-out vessel vault (Ali Qapu) ---------- */
function makeProfile(r){
  if(r()<.22)return{arch:1};
  const bY=.2+.18*r(),bW=.3+.2*r(),nW=.05+.06*r(),sY=bY+.18+.12*r(),nY=Math.min(.84,sY+.08+.1*r());
  return{knots:[[0,.1+.1*r()],[.04,.13+.1*r()],[bY,bW],[sY,(bW+nW)*.45],[nY,nW],[.93,nW*(1+.5*r())],[1,nW+.04+.05*r()]]};
}
function hwAt(K,y){for(let i=0;i<K.length-1;i++)if(y<=K[i+1][0]){const t=(y-K[i][0])/(K[i+1][0]-K[i][0]),s=t*t*(3-2*t);return K[i][1]+(K[i+1][1]-K[i][1])*s}return K[K.length-1][1]}
function vesselPath(pr,fx,fy,ang,H,Wmax){
  const ux=Math.cos(ang),uy=Math.sin(ang),px=-uy,py=ux,M=(lx,ly)=>[fx+px*lx+ux*ly,fy+py*lx+uy*ly],p=new PB();
  if(pr.arch){const w=Math.min(Wmax*.5,H*.3),sH=H*.55,c=sH+(H-sH)*.75;
    let a=M(-w,0);p.moveTo(a[0],a[1]);a=M(-w,sH);p.lineTo(a[0],a[1]);
    let q=M(-w,c),bb=M(0,H);p.quadraticCurveTo(q[0],q[1],bb[0],bb[1]);q=M(w,c);bb=M(w,sH);p.quadraticCurveTo(q[0],q[1],bb[0],bb[1]);
    a=M(w,0);p.lineTo(a[0],a[1]);p.closePath();return p}
  const mw=Math.max(...pr.knots.map(k=>k[1])),k=Math.min(1,(Wmax/2)/(mw*H)),N=30,L=[],Rt=[];
  for(let i=0;i<=N;i++){const y=i/N,w=hwAt(pr.knots,y)*H*k;L.push(M(-w,y*H));Rt.push(M(w,y*H))}
  p.moveTo(L[0][0],L[0][1]);for(const q of L)p.lineTo(q[0],q[1]);for(let i=Rt.length-1;i>=0;i--)p.lineTo(Rt[i][0],Rt[i][1]);p.closePath();return p;
}
function archPath(x,y,w,h){const rise=Math.min(h*.5,w*.7),q=new PB();q.moveTo(x,y+h);q.lineTo(x,y+rise);
  q.quadraticCurveTo(x,y+rise*.2,x+w/2,y);q.quadraticCurveTo(x+w,y+rise*.2,x+w,y+rise);q.lineTo(x+w,y+h);q.closePath();return q}
let OPEN=null;
/* single wall: the hole shows its own cut edge and darkness behind.
   double wall (as at Ali Qapu): a lit back plane shows through, shadowed along the front edge. */
function cut(ctx,path,P,d,dbl){if(LOG)LOG.cut.push(path.str);if(OPEN)OPEN.a+=path.area;ctx.save();
  if(dbl){ctx.fillStyle=P.cut;ctx.fill(path.P);ctx.clip(path.P);ctx.translate(d*.9,d*.8);ctx.fillStyle=mix(P.plaster,P.cut,.5);ctx.fill(path.P);
    ctx.translate(d*.5,d*.4);ctx.fillStyle=mix(P.plaster,P.cut,.32);ctx.fill(path.P)}
  else{ctx.fillStyle=P.wall;ctx.fill(path.P);ctx.clip(path.P);ctx.translate(d*.75,d*.65);ctx.fillStyle=P.cut;ctx.fill(path.P)}
  ctx.restore()}
function outline(ctx,path,P,dots,w=5){if(LOG)LOG.score.push(path.str);ctx.lineJoin='round';ctx.strokeStyle=P.line;ctx.lineWidth=w;ctx.stroke(path.P);
  if(dots){ctx.save();ctx.setLineDash([.1,7]);ctx.lineCap='round';ctx.strokeStyle=P.light;ctx.lineWidth=1.8;ctx.stroke(path.P);ctx.restore()}}
function drawTongbori(ctx,p,P,seed,b=1){
  const r=rng(seed),pool=[];for(let i=0;i<1+Math.round(p.variety/100*5);i++)pool.push(makeProfile(r));
  const pick=i=>pool[((i%pool.length)+pool.length)%pool.length],on=t=>b>=1||b>=t,vs=(p.vsize||100)/100,dbl=!!p.double;let cuts=0;
  const fin=(surface,s)=>{const pct=OPEN&&OPEN.t?Math.round(OPEN.a/OPEN.t*100):null;if(b>=1)LASTOPEN=pct;OPEN=null;return s+(pct!==null&&b>=1?' · '+pct+'% open':'')};
  OPEN={a:0,t:0};
  if(p.comp==='vault'){
    const cx=500,cy=500,R=490,n=p.order,T=p.tiers,r0=R*.17,aspect={coarse:2.1,medium:1.4,fine:.85}[p.split||'medium'];
    OPEN.t=Math.PI*R*R;
    ctx.fillStyle=mix(P.plaster,'#000000',.35);ctx.fillRect(0,0,1000,1000);
    ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.fillStyle=P.plaster;ctx.fill();
    for(let t=T-1;t>=0;t--){
      const s0=(T-1-t)/T*.7;if(!on(s0))continue;
      const ri=r0+(R-r0)*t/T,ro=r0+(R-r0)*(t+1)/T,D=ro-ri,off=(t%2)*.5;
      /* selective subdivision (after Hansmeyer): split a ring while its cells are wider than they are deep */
      let m=n;while((ri+D*.5)*TAU/m>D*aspect&&m<n*16)m*=2;
      const tone=t%2?mix(P.plaster,P.light,.18):P.plaster;
      for(let c=0;c<m;c++){
        const a0=(c+off)/m*TAU,a1=(c+1+off)/m*TAU,am=(a0+a1)/2,cell=new PB();
        cell.moveTo(cx+ri*Math.cos(a0),cy+ri*Math.sin(a0));cell.arc(cx,cy,ri,a0,a1);
        for(let i=24;i>=0;i--){const u=i/12-1,a=a0+(a1-a0)*i/24,rr=ro-D*.45*(1-(1-Math.abs(u))**2);cell.lineTo(cx+rr*Math.cos(a),cy+rr*Math.sin(a))}
        cell.closePath();ctx.fillStyle=tone;ctx.fill(cell.P);
        if(on(s0+.18)){
          const pr=pick(t*3+(p.variety>50&&c%2?1:0)),fr=ri+D*.86;
          cut(ctx,vesselPath(pr,cx+fr*Math.cos(am),cy+fr*Math.sin(am),am+Math.PI,D*.66*vs,(ri+D*.45)*(a1-a0)*.62*vs),P,p.depth,dbl);cuts++;
          const sr=ro-D*.04;cut(ctx,vesselPath(pick(t+5),cx+sr*Math.cos(a0),cy+sr*Math.sin(a0),a0+Math.PI,D*.3*vs,Math.min(D*.2,(ro-D*.45)*(a1-a0)*.5)*vs),P,p.depth*.5,dbl);cuts++}
        outline(ctx,cell,P,p.dots);
      }
    }
    if(on(.88)){
      const oc=new PB();oc.arc(cx,cy,r0,0,TAU);oc.closePath();ctx.fillStyle=mix(P.plaster,P.light,.3);ctx.fill(oc.P);
      for(let k=0;k<n;k++){const a=(k+.5)/n*TAU,fr=r0*.95;cut(ctx,vesselPath(pick(7),cx+fr*Math.cos(a),cy+fr*Math.sin(a),a+Math.PI,r0*.68*vs,TAU*r0*.8/n*vs),P,p.depth*.6,dbl);cuts++}
      const st=hankin(reg(cx,cy,n,r0*.3,0),Math.PI/3),sp=new PB();sp.moveTo(st[0][0],st[0][1]);for(const q of st)sp.lineTo(q[0],q[1]);sp.closePath();
      ctx.fillStyle=P.line;ctx.fill(sp.P);if(LOG)LOG.score.push(sp.str);outline(ctx,oc,P,p.dots);
    }
    return fin('vault',n+'-fold vault · '+T+' tiers · '+cuts+' cut-outs');
  }
  const C=p.cols,cw=1000/C,MC=Math.floor((C-1)/2);ctx.fillStyle=mix(P.plaster,P.line,.12);ctx.fillRect(0,0,1000,1000);OPEN.t=1000*940;
  for(let c=0;c<C;c++){
    const mc=Math.min(c,C-1-c),s0=(MC-mc)/(MC+1)*.55;if(!on(s0))continue;
    const x=c*cw,m=cw*.07,w=cw-2*m,y0=30,aH=420;
    const big=archPath(x+m,y0,w,aH);ctx.fillStyle=P.plaster;ctx.fill(big.P);
    if(on(s0+.2)){cut(ctx,vesselPath(pick(mc*7),x+cw/2,y0+aH-18,-Math.PI/2,aH*.7*vs,w*.78*vs),P,p.depth,dbl);cuts++}
    outline(ctx,big,P,p.dots);
    const top=y0+aH+16,rh=(970-top)/p.rows,two=w>110,g=8,sw=two?(w-g)/2:w;
    for(let j=0;j<p.rows;j++){const sj=s0+.07*(j+1);if(!on(sj))continue;
      for(let s=0;s<(two?2:1);s++){
        const sx=x+m+s*(sw+g),sy=top+j*rh,cell=archPath(sx,sy,sw,rh-g),sub=c<C/2?s:1-s;
        ctx.fillStyle=j%2?mix(P.plaster,P.light,.15):P.plaster;ctx.fill(cell.P);
        if(on(sj+.2)){cut(ctx,vesselPath(pick(mc*7+j*3+sub+1),sx+sw/2,sy+rh-g-10,-Math.PI/2,(rh-g)*.72*vs,sw*.8*vs),P,p.depth*.8,dbl);cuts++}
        outline(ctx,cell,P,p.dots)}}
  }
  return fin('wall','wall of '+C+' bays · '+cuts+' cut-outs');
}
let LASTOPEN=null;
function tongboriSVG(p,P,seed){
  LOG={cut:[],score:[]};const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.setTransform(.008,0,0,.008,0,0);
  drawTongbori(x,p,P,seed,1);const L=LOG;LOG=null;
  const edge=p.comp==='vault'?'<circle cx="500" cy="500" r="490"/>':'<rect width="1000" height="1000"/>';
  return`<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="300mm" viewBox="0 0 1000 1000">
<g id="cut-through-vessels" fill="none" stroke="#FF0000" stroke-width="0.5">${L.cut.map(d=>`<path d="${d}"/>`).join('')}</g>
<g id="engrave-cells" fill="none" stroke="#0000FF" stroke-width="0.5">${L.score.map(d=>`<path d="${d}"/>`).join('')}</g>
<g id="sheet-edge" fill="none" stroke="#FF0000" stroke-width="0.5">${edge}</g>
</svg>`;
}

/* ---------- Facade: layout first, then fill (composer) ----------
   fillIn's trailing `other` argument replaces a former dependency on a global UI `state`
   object: pass a {mode: params} lookup (naqsh-workbench passes its full `state.params`) to let
   ornamented regions fall back to "the other generators' current settings"; omit it to fall
   back to {} and rely only on each region's own override values. */
function rectPB(x,y,w,h){const q=new PB();q.moveTo(x,y);q.lineTo(x+w,y);q.lineTo(x+w,y+h);q.lineTo(x,y+h);q.closePath();return q}
function onion(cx,base,hw,apex){const H=base-apex,q=new PB();q.moveTo(cx-hw,base);
  q.bezierCurveTo(cx-hw*1.32,base-H*.45,cx-hw*.5,base-H*.78,cx,apex);q.bezierCurveTo(cx+hw*.5,base-H*.78,cx+hw*1.32,base-H*.45,cx+hw,base);q.closePath();return q}
function sky(ctx,P){const g=ctx.createLinearGradient(0,0,0,1000);g.addColorStop(0,mix(P.ground2,'#FFFFFF',.5));g.addColorStop(.8,P.light);g.addColorStop(1,P.light);ctx.fillStyle=g;ctx.fillRect(0,0,1000,1000)}
function fillIn(ctx,clip,x,y,w,h,mode,over,P,seed,other){ctx.save();ctx.clip(clip.P);const s=Math.max(w,h)/1000;ctx.translate(x+w/2-500*s,y+h/2-500*s);ctx.scale(s,s);
  MODES[mode].draw(ctx,Object.assign({},(other&&other[mode])||{},over),P,seed,1);ctx.restore()}
function plain(ctx,clip,col){ctx.fillStyle=col;ctx.fill(clip.P)}
function clipped(ctx,clip,fn){ctx.save();ctx.clip(clip.P);fn();ctx.restore()}
function cylLight(ctx,x,y,w,h){const g=ctx.createLinearGradient(x,0,x+w,0);g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(.28,'rgba(0,0,0,.08)');g.addColorStop(.4,'rgba(255,255,255,.16)');g.addColorStop(.62,'rgba(0,0,0,.06)');g.addColorStop(1,'rgba(0,0,0,.5)');ctx.fillStyle=g;ctx.fillRect(x,y,w,h)}
function domeLight(ctx,clip,cx,cy,r){clipped(ctx,clip,()=>{const g=ctx.createRadialGradient(cx-r*.35,cy-r*.3,r*.05,cx,cy,r*1.15);g.addColorStop(0,'rgba(255,255,255,.24)');g.addColorStop(.45,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(0,0,0,.5)');ctx.fillStyle=g;ctx.fillRect(cx-r*1.6,cy-r*1.6,r*3.2,r*3.2)})}
function rule(ctx,x,y,w,P,t=6){ctx.fillStyle=P.edge;ctx.fillRect(x,y-t/2-1.5,w,t+3);ctx.fillStyle=P.band;ctx.fillRect(x,y-t/2,w,t)}
function ribs(ctx,clip,cx,base,hw,apex,P){clipped(ctx,clip,()=>{ctx.strokeStyle=mix(P.ground,'#000000',.3);ctx.lineWidth=3;const H=base-apex;
  for(let k=-6;k<=6;k++){const u=k/6,q=new Path2D();q.moveTo(cx+u*hw,base);q.bezierCurveTo(cx+u*hw*1.32,base-H*.45,cx+u*hw*.5,base-H*.78,cx,apex);ctx.stroke(q)}})}
function finial(ctx,x,y,P,s){ctx.lineCap='round';ctx.strokeStyle=P.edge;ctx.lineWidth=7*s;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-95*s);ctx.stroke();ctx.strokeStyle=P.band;ctx.lineWidth=4*s;ctx.stroke();
  for(const[dy,r]of[[22,13],[48,10],[70,7]]){ctx.beginPath();ctx.arc(x,y-dy*s,r*s,0,TAU);ctx.fillStyle=P.band;ctx.fill();ctx.lineWidth=2*s;ctx.strokeStyle=P.edge;ctx.stroke()}}
function nicheBand(ctx,clip,x,y,w,h,n,P,seed){clipped(ctx,clip,()=>{ctx.fillStyle=P.plaster;ctx.fillRect(x,y,w,h);
  const r=rng(seed+7),pool=[makeProfile(r),makeProfile(r)],cw=w/n;
  for(let i=0;i<n;i++){const m=cw*.08,a=archPath(x+i*cw+m,y+h*.08,cw-2*m,h*.84);ctx.fillStyle=mix(P.plaster,P.light,.18);ctx.fill(a.P);
    cut(ctx,vesselPath(pool[Math.min(i,n-1-i)%2],x+i*cw+cw/2,y+h*.92-6,-Math.PI/2,h*.62,(cw-2*m)*.75),P,5);outline(ctx,a,P,false,3)}})}
function domeRegions(p,P,seed,other){
  const D=[185,630],plinth=rectPB(150,925,700,75),frieze=rectPB(D[0],752,D[1],163),kband=rectPB(D[0],658,D[1],86),dome=onion(500,650,315,205);
  return[
    {rank:4,name:'plinth',draw:(c,o)=>{if(o)fillIn(c,plinth,150,925,700,75,'bannai',{view:'flat',motif:'zigzag',cell:22,k:3,mortar:true,twotone:false},Object.assign({},P,{a1:mix(P.mortar,P.brick,.4)}),seed,other);else plain(c,plinth,P.mortar);c.fillStyle='rgba(0,0,0,.18)';c.fillRect(150,925,700,6)}},
    {rank:2,name:'floral frieze',draw:(c,o)=>{if(o)fillIn(c,frieze,D[0],752,D[1],163,'eslimi',{comp:'wallpaper',cell:250,cart:false,depth:Math.min(3,((other&&other.eslimi)||{}).depth??3)},Object.assign({},P,{ground:P.ground2,a1:P.a2}),seed+1,other);else plain(c,frieze,P.ground2);if(p.light)cylLight(c,D[0],752,D[1],163)}},
    {rank:3,name:'inscription band',draw:(c,o)=>{if(o)fillIn(c,kband,D[0],658,D[1],86,'bannai',{view:'flat',motif:'glyphs',cell:500/31.5,k:4,mortar:false,twotone:false,relief:false},Object.assign({},P,{brick:P.light,mortar:P.light,a1:P.ground2}),seed+2,other);else plain(c,kband,P.light);
      if(p.light)cylLight(c,D[0],658,D[1],86);rule(c,D[0],658,D[1],P);rule(c,D[0],748,D[1],P);rule(c,D[0],916,D[1],P,8)}},
    {rank:1,name:'dome',draw:(c,o)=>{if(o){if(p.field==='girih')fillIn(c,dome,120,205,760,445,'girih',{scale:110,deform:0},P,seed,other);else fillIn(c,dome,120,205,760,445,'eslimi',{comp:'wallpaper',cell:290},P,seed+3,other)}
      else{plain(c,dome,P.ground);ribs(c,dome,500,650,315,205,P)}
      if(p.light)domeLight(c,dome,500,450,330);c.lineWidth=3;c.strokeStyle=P.edge;c.stroke(dome.P);rule(c,178,652,644,P,8)}},
    {rank:0,name:'finial',draw:c=>finial(c,500,207,P,1)}
  ];
}
function minaretRegions(p,P,seed,other){
  const lower=rectPB(390,650,220,350),kb=rectPB(380,606,240,44),trap=new PB(),par=rectPB(322,442,356,62),upper=rectPB(405,214,190,228),ring=rectPB(395,196,210,20),cap=onion(500,198,98,108);
  trap.moveTo(380,606);trap.lineTo(620,606);trap.lineTo(672,508);trap.lineTo(328,508);trap.closePath();
  const shaft=Object.assign({},P),wood=Object.assign({},P,{ground:P.dark,band:P.brick,edge:P.wall});
  return[
    {rank:1,name:'lower shaft',draw:(c,o)=>{fillIn(c,lower,390,650,220,350,'bannai',{view:'flat',motif:o?p.shaft:'plain',cell:34,k:4,mortar:true,cover:60},shaft,seed,other);if(p.light)cylLight(c,390,650,220,350)}},
    {rank:4,name:'inscription band',draw:(c,o)=>{if(o)fillIn(c,kb,380,606,240,44,'bannai',{view:'flat',motif:'glyphs',cell:500/22.5,k:3,mortar:false,twotone:false,relief:false},Object.assign({},P,{brick:P.light,mortar:P.light,a1:P.ground2}),seed+2,other);else plain(c,kb,P.light);
      if(p.light)cylLight(c,380,606,240,44);rule(c,380,606,240,P,4);rule(c,380,650,240,P,4)}},
    {rank:3,name:'muqarnas corbel',draw:(c,o)=>{if(o)nicheBand(c,trap,328,508,344,98,7,P,seed);else{plain(c,trap,P.plaster);c.strokeStyle=mix(P.plaster,'#000000',.3);c.lineWidth=2;for(let i=1;i<4;i++){const y=508+i*24.5;c.beginPath();c.moveTo(300,y);c.lineTo(700,y);clipped(c,trap,()=>c.stroke())}}
      if(p.light)clipped(c,trap,()=>cylLight(c,328,508,344,98));c.lineWidth=2;c.strokeStyle=P.edge;c.stroke(trap.P)}},
    {rank:2,name:'lattice balcony',draw:(c,o)=>{if(o)fillIn(c,par,322,442,356,62,'girih',{scale:110,band:8,fill:false,weave:true,deform:0},wood,seed,other);
      else{plain(c,par,P.brick);c.fillStyle=P.wall;for(let x=330;x<678;x+=14)c.fillRect(x,446,4,54)}
      if(p.light)cylLight(c,322,442,356,62);c.fillStyle=P.wall;c.fillRect(312,434,376,10);c.fillRect(312,502,376,8)}},
    {rank:5,name:'upper shaft',draw:(c,o)=>{fillIn(c,upper,405,214,190,228,'bannai',{view:'flat',motif:o?'zigzag':'plain',cell:40,k:3,mortar:true},P,seed+4,other);if(p.light)cylLight(c,405,214,190,228)}},
    {rank:0,name:'ring',draw:c=>{plain(c,ring,P.ground2);if(p.light)cylLight(c,395,196,210,20);rule(c,395,196,210,P,3);rule(c,395,216,210,P,3)}},
    {rank:6,name:'cap dome',draw:(c,o)=>{if(o)fillIn(c,cap,300,108,400,95,'girih',{scale:150,band:5,deform:0},P,seed,other);else{plain(c,cap,P.ground);ribs(c,cap,500,198,98,108,P)}
      if(p.light)domeLight(c,cap,500,160,105);c.lineWidth=2;c.strokeStyle=P.edge;c.stroke(cap.P)}},
    {rank:0,name:'spire',draw:c=>finial(c,500,110,P,.8)}
  ];
}
function facadeRegions(p,P,seed,other){return p.layout==='minaret'?minaretRegions(p,P,seed,other):domeRegions(p,P,seed,other)}
function budgetCount(p){const N=p.layout==='minaret'?6:4;return{N,k:Math.round(p.budget/100*N)}}
function drawFacade(ctx,p,P,seed,b=1,other){
  sky(ctx,P);const R=facadeRegions(p,P,seed,other),{N,k}=budgetCount(p);let orn=0,shown=0;
  R.forEach((reg,i)=>{if(b<1&&b<i/R.length)return;shown++;const o=reg.rank>0&&reg.rank<=k;if(o)orn++;reg.draw(ctx,o)});
  return(p.layout==='minaret'?'minaret':'dome')+' facade · '+(b<1?shown+' of '+R.length+' regions built':k+' of '+N+' regions ornamented');
}

/* ---------- modes, parameters, recipes ---------- */
const SRC={
  kaplan05:['Kaplan (2005), Islamic Star Patterns from Polygons in Contact','https://graphicsinterface.org/?p=4811','Hankin’s method; contact angle; parquet deformations'],
  kaplanDiss:['Kaplan (2002), Computer Graphics and Geometric Ornamental Design','https://cs.uwaterloo.ca/~csk/other/phd/kaplan_diss_full_print.pdf','Decorating star patterns: bands and interlacing'],
  zellij:['Kaplan (2022), Generative Zellij','https://archive.bridgesmathart.org/2022/bridges2022-285.html','Lay out regions first, then fill each with a pattern'],
  mirage:['Assassin’s Creed Mirage art blast (ArtStation)','https://magazine.artstation.com/2023/10/ubisoft-assassins-creed-mirage-art-blast/','Rich glazed ornament against plain mud brick'],
  journey:['Mysterious Journey (Computer Graphics World, 2012)','https://www.cgw.com/Publications/CGW/2012/Volume-35-Issue-4-June-July-2012/Mysterious-Journey.aspx','Colour on an emotional curve; light painted into textures'],
  hussain:['Zarah Hussain (Bridge Projects)','https://www.bridgeprojects.com/artists/zarah-hussain','Hand construction animated with code']
};
const MODES={
 girih:{label:'Girih',fa:'گره',pal:'night',fid:['Documented method',1],draw:(c,p,P,s,b)=>drawGirih(c,p,P,s,b),params:[
  {id:'tiling',label:'Underlying tiling',type:'select',v:'488',opts:[['488','Octagon and square · 4.8.8'],['31212','Dodecagon and triangle · 3.12.12'],['666','Hexagon · 6.6.6'],['44','Square · 4⁴']]},
  {id:'theta',label:'Contact angle θ',type:'range',min:15,max:80,step:1,v:58,u:'°'},
  {id:'deform',label:'Parquet deformation',type:'range',min:0,max:30,step:1,v:0,u:'°'},
  {id:'scale',label:'Tile scale',type:'range',min:80,max:280,step:2,v:170},
  {id:'band',label:'Strap width',type:'range',min:1,max:22,step:1,v:10},
  {id:'weave',label:'Over-under interlace',type:'check',v:true},
  {id:'fill',label:'Fill rosettes',type:'check',v:true}],
  steps:p=>[`Tile the plane with the ${{'488':'4.8.8 octagon–square','31212':'3.12.12 dodecagon–triangle','666':'6.6.6 hexagon','44':'square'}[p.tiling]} tiling at scale ${p.scale}.`,
   `From every edge midpoint, cast two rays inward at θ = ${p.theta}°${p.deform?`, sweeping θ by ±${p.deform}° from left to right (parquet deformation)`:''}.`,
   'Extend each ray until it meets the ray from the neighbouring edge, then discard the tiling.',
   `Draw the result as ${p.band}-unit straps${p.fill?', fill each rosette by its parent polygon':''}${p.weave?', and weave: each strand passes over at one crossing and under at the next':''}. No randomness: the seed is ignored.`],
  src:['kaplan05','kaplanDiss']},
 bannai:{label:'Banna’i',fa:'بنایی',pal:'minaret',fid:['Documented grid logic',1],draw:(c,p,P,s,b)=>drawBannai(c,p,P,s,b),params:[
  {id:'motif',label:'Motif',type:'select',v:'glyphs',opts:[['glyphs','Invented script'],['kufic','Square Kufic maze'],['lozenge','Hazarbaf lozenges'],['zigzag','Zigzag chevrons']]},
  {id:'view',label:'View',type:'select',v:'minaret',opts:[['minaret','Minaret shaft'],['flat','Flat wall']]},
  {id:'turn',label:'Shaft rotation',type:'range',min:0,max:360,step:1,v:20,u:'°',when:s=>s.view==='minaret'},
  {id:'cell',label:'Brick size',type:'range',min:8,max:34,step:1,v:20},
  {id:'k',label:'Motif size',type:'range',min:3,max:9,step:1,v:4},
  {id:'cover',label:'Glyph coverage',type:'range',min:20,max:100,step:1,v:55,u:'%',when:s=>s.motif==='kufic'},
  {id:'prune',label:'Glyph breaks',type:'range',min:0,max:50,step:1,v:8,u:'%',when:s=>s.motif==='kufic'},
  {id:'twotone',label:'Two glazes',type:'check',v:true},
  {id:'relief',label:'Raised glazed bricks',type:'check',v:true},
  {id:'mortar',label:'Show mortar joints',type:'check',v:true}],
  steps:p=>[...(p.motif==='glyphs'?[
     `Invent an alphabet of ${Math.max(5,p.k+3)} square glyphs on a 4×7 brick grid from four stroke types: a tall stem with an optional hook, a closed counter, a pair of teeth, and a hooked descender. Every glyph sits on the same baseline.`,
     `Write ${Math.max(2,p.k-1)}-letter words: letters join along the baseline and the baseline breaks between words. Two lines of text alternate, each offset so words never stack.`]:[]),
   ...(p.motif==='glyphs'?[]:[p.motif==='kufic'?`Lay a ${2*p.k-1}×${2*p.k-1} cell grid with nodes on even cells; carve a depth-first random tree through ${p.cover}% of nodes so strokes stay one cell wide with one-cell gaps.`:
     p.motif==='lozenge'?`Score each cell by diamond distance |u|+|v| from the centre of a ${2*p.k+2}-cell repeat and glaze every second ring.`:`Offset each column by |row mod ${2*p.k} − ${p.k}| to bend bands into zigzags; glaze every second band.`,
   p.motif==='kufic'?`Break ${p.prune}% of the links between nodes, ${p.twotone?'colour the two root branches in two glazes, ':''}then mirror the quarter on both axes (p4m) and repeat.`:`Repeat the motif across the wall${p.twotone?', alternating two glazes':''}.`]),
   'Leave the remaining cells as unglazed brick, each with a small random variation in tone. Lay courses from the bottom up.',
   ...(p.relief?['Set glazed bricks proud of the wall and plain ones back, then paint a fixed shadow down and to the right of each raised brick so the pattern reads in raking light.']:[]),
   p.view==='minaret'?`Wrap the grid round a cylinder, rotated ${p.turn}°, and shade by facing angle.`:`Render flat with ${p.mortar?'mortar joints':'tight joints'}.`],
  src:[['Sabetfard & Nadimi (2019), Generating Square Kufic Patterns Using Cellular Automata','https://finearts.ut.ac.ir/~mojtabasabetfard/articles','Kufic as a grid pattern that fills a shape'],
       ['Development of Banna’i Kufic Script (JIAS, 2022)','https://jias.kashanu.ac.ir/article_111772.html?lang=en','Grid units, swappable positive and negative space'],
       ['Viana et al. (2022), Symmetry and Variance in brick patterns','https://arxiv.org/pdf/2210.12856','Per-brick variation inside a fixed pattern'],
       ['Banna’i (Wikipedia)','https://en.wikipedia.org/wiki/Banna%27i','Raised and recessed brick rows that read through shadow'],
       'journey']},
 eslimi:{label:'Eslimi',fa:'اسلیمی',pal:'dome',fid:['Interpretive',0],draw:(c,p,P,s,b)=>drawEslimi(c,p,P,s,b),params:[
  {id:'comp',label:'Composition',type:'select',v:'medallion',opts:[['medallion','Shamseh medallion'],['wallpaper','Repeat field (p4m)']]},
  {id:'folds',label:'Rotational order',type:'range',min:4,max:16,step:1,v:6,when:s=>s.comp==='medallion'},
  {id:'cell',label:'Repeat size',type:'range',min:220,max:520,step:10,v:340,when:s=>s.comp==='wallpaper'},
  {id:'method',label:'Scroll layout',type:'select',v:'packing',opts:[['packing','Circle packing (Hamekasi–Samavati)'],['growth','Branching growth']]},
  {id:'density',label:'Circles packed',type:'range',min:4,max:30,step:1,v:14,when:s=>s.method==='packing'},
  {id:'stems',label:'Main stems',type:'range',min:1,max:4,step:1,v:3,when:s=>s.method==='growth'},
  {id:'curl',label:'Spiral curl',type:'range',min:.6,max:3,step:.1,v:1.8,when:s=>s.method==='growth'},
  {id:'depth',label:'Branching depth',type:'range',min:1,max:4,step:1,v:3,when:s=>s.method==='growth'},
  {id:'flowers',label:'Khatai blossoms',type:'range',min:0,max:100,step:1,v:55,u:'%'},
  {id:'stroke',label:'Stem weight',type:'range',min:2,max:10,step:.5,v:6},
  {id:'under',label:'Under-layer of fine scrolls',type:'check',v:true},
  {id:'cart',label:'Ogee cartouche',type:'check',v:true}],
  steps:p=>[p.comp==='medallion'?`Cut one wedge of ${(180/p.folds).toFixed(1)}° from a ${p.folds}-fold shamseh.`:`Take one quadrant of a ${p.cell}-unit square repeat.`,
   ...(p.method==='packing'?[
   `Pack up to ${p.density} circles into it, largest first: each try keeps the biggest circle that fits inside the region and clears its neighbours by a stem’s width.`,
   'Link every circle to its nearest larger neighbour, forming a tree, and alternate the spiral direction at each level.',
   'Inscribe one spiral per circle: it starts tangent on the side facing its parent, and its curvature rises from 1/r to 6/r so it winds about two turns into an eye.',
   `Sprout each spiral from its parent’s outer turn with an S-curved stem, add leaves along the stems, and end every eye in a khatai blossom (${p.flowers}% chance) or a leaf.`]:[
   `Plant ${p.stems} stem${p.stems>1?'s':''} heading outward along the wedge and grow each as a spiral whose curvature rises with arc length (curl ${p.curl}).`,
   `At 36% and 64% along every stem, branch a counter-rotating scroll at half length, ${p.depth} level${p.depth>1?'s':''} deep, with a leaf at each fork. Children start growing when the parent reaches the fork.`,
   `End each spiral eye in a khatai blossom (${p.flowers}% chance) or a pointed leaf.`]),
   ...(p.under?['Repeat the layout underneath at about 40% stem weight, in pale glaze without outlines, so the gold scrolls ride over a finer floral ground, as on Safavid domes.']:[]),
   `${p.cart?'Lay a gold ogee cartouche over a lapis ground, then m':'M'}irror and ${p.comp==='medallion'?'rotate into '+p.folds*2+' copies, with half-scale lachak corners.':'reflect on both axes (p4m) and tile.'}`],
  src:[['Hamekasi & Samavati (2012), Designing Persian Floral Patterns Using Circle Packing','https://scitepress.org/Documents/2012/38501/','Floral patterns as circles, angles and symmetry'],
       ['Huang, Non-Overlapping Procedural Floral Patterns (MIT Media Lab)','https://www.media.mit.edu/projects/non-overlapping-floral-patterns/overview/','Procedural foliage filling a region']]},
 tongbori:{label:'Tongbori',fa:'تنگ‌بری',pal:'aliqapu',fid:['Interpretive',0],draw:(c,p,P,s,b)=>drawTongbori(c,p,P,s,b),params:[
  {id:'comp',label:'Surface',type:'select',v:'vault',opts:[['vault','Vault, looking up'],['wall','Wall of niches']]},
  {id:'order',label:'Rotational order',type:'range',min:6,max:16,step:1,v:12,when:s=>s.comp==='vault'},
  {id:'tiers',label:'Tiers',type:'range',min:2,max:5,step:1,v:4,when:s=>s.comp==='vault'},
  {id:'cols',label:'Bays',type:'range',min:3,max:7,step:1,v:5,when:s=>s.comp==='wall'},
  {id:'rows',label:'Niche rows',type:'range',min:2,max:5,step:1,v:3,when:s=>s.comp==='wall'},
  {id:'split',label:'Subdivision',type:'select',v:'medium',opts:[['coarse','Coarse · few large cells'],['medium','Medium'],['fine','Fine · many small cells']],when:s=>s.comp==='vault'},
  {id:'variety',label:'Vessel variety',type:'range',min:0,max:100,step:1,v:55,u:'%'},
  {id:'vsize',label:'Vessel size',type:'range',min:60,max:130,step:1,v:100,u:'%'},
  {id:'depth',label:'Cut depth',type:'range',min:0,max:18,step:1,v:9},
  {id:'double',label:'Double wall (back plane shows through)',type:'check',v:true},
  {id:'dots',label:'Painted dot borders',type:'check',v:true}],
  steps:p=>{const pool=1+Math.round(p.variety/100*5),open=LASTOPEN!==null?` At these settings about ${LASTOPEN}% of the surface is open.`:'';return p.comp==='vault'?[
   `Divide the plan into ${p.tiers} concentric tiers of ${p.order}-fold cells, staggering alternate tiers by half a cell.`,
   `Subdivide selectively: double a ring’s cell count while its cells are more than ${{coarse:2.1,medium:1.4,fine:.85}[p.split]}× wider than they are deep, so outer rings refine and inner rings stay bold.`,
   'Give each cell a pointed outer edge so neighbouring arches leave small spandrels.',
   `Draw ${pool} vessel profile${pool>1?'s':''} (foot, belly, shoulder, neck, lip; about one in five is a pointed niche) and assign one per tier so each ring repeats.`,
   `Cut each vessel neck-inward into its cell at ${p.vsize}% size, plus a small one in every spandrel.${open} Open area is what turns the vault into a sound diffuser in Azad’s simulations.`,
   p.double?`Show a lit back plane through each cut-out, shadowed ${p.depth} units along the front edge, as in Ali Qapu’s double-walled plaster.`:`Show darkness behind each cut-out, with a ${p.depth}-unit cut edge.`,
   'Finish with a vessel oculus and a central star. Plan view only, not a solved 3D muqarnas. The SVG puts vessels on a red cut layer and cells on a blue engrave layer.']:[
   `Divide the wall into ${p.cols} bays, each a tall pointed arch over ${p.rows} rows of paired niches.`,
   `Draw ${pool} vessel profile${pool>1?'s':''} and assign them mirror-symmetrically about the centre bay.`,
   `Cut each vessel upright into its niche at ${p.vsize}% size.${open}`,
   p.double?'Show a lit back plane through each cut-out, shadowed along the front edge, as in Ali Qapu’s double-walled plaster.':`Show darkness behind each cut-out, with a ${p.depth}-unit cut edge.`,
   'Outline every niche with a painted blue border. The SVG puts vessels on a red cut layer and niches on a blue engrave layer.']},
  src:[['Azad, Ali Qapu: Persian Historical Music Room (IOA)','https://www.ioa.org.uk/system/files/proceedings/h_azad_ali_qapu_persian_historical_music_room.pdf','Cut-outs as acoustic diffusers; the room’s double-walled plaster'],
       ['Hansmeyer, Muqarnas','https://michael-hansmeyer.com/muqarnas','Selective subdivision: refine cells where there is room'],
       ['Razzaghmanesh & Gürer, Muqarnas Generation Through Graph Theory','https://research.itu.edu.tr/en/publications/exploring-muqarnas-generation-through-graph-theory-node-and-surfa/','Isfahan muqarnas plans as graphs']]},
 facade:{label:'Facade',fa:'نما',pal:'dome',fid:['Composite',0],draw:(c,p,P,s,b,other)=>drawFacade(c,p,P,s,b,other),params:[
  {id:'layout',label:'Layout',type:'select',v:'dome',opts:[['dome','Dome over a drum'],['minaret','Minaret with balcony']]},
  {id:'field',label:'Dome field',type:'select',v:'eslimi',opts:[['eslimi','Eslimi scrolls'],['girih','Girih star pattern']],when:s=>s.layout==='dome'},
  {id:'shaft',label:'Shaft pattern',type:'select',v:'lozenge',opts:[['lozenge','Hazarbaf lozenges'],['glyphs','Invented script'],['kufic','Square Kufic'],['zigzag','Zigzag chevrons']],when:s=>s.layout==='minaret'},
  {id:'budget',label:'Ornament budget',type:'range',min:0,max:100,step:1,v:75,u:'%'},
  {id:'light',label:'Painted light',type:'check',v:true}],
  steps:p=>{const{N,k}=budgetCount(p),names=facadeRegions(p,PAL.dome,0).filter(r=>r.rank).sort((a,b)=>a.rank-b.rank).map(r=>r.name);return[
   p.layout==='minaret'?'Lay out the minaret as regions: brick shaft, inscription band, muqarnas corbel, lattice balcony, upper shaft and cap dome.':'Lay out the dome as regions: plinth, inscription band, floral frieze, drum and onion dome.',
   `Rank regions by importance (${names.join(', ')}) and spend the ornament budget from the top: ${k} of ${N} get pattern${k<N?'; the rest stay plain brick, plaster or glaze so the ornament reads by contrast':''}.`,
   'Fill each ornamented region with another tab’s generator, using your settings from that tab at a scale suited to the region.',
   p.light?'Paint light on top as fixed gradients: cylinder shading on shafts and drums, a highlight on domes. Nothing is lit in 3D.':'Leave every surface flat-lit.']},
  src:['zellij','mirage','journey']}
};

/* ---------- generic dispatch helpers (mode-agnostic; operate only on MODES/PAL above) ----------
   Added for consumers that pick a mode by name at runtime (e.g. a "paint this surface with
   generator X" UI) rather than wiring one mode's controls directly, as naqsh-workbench's own
   per-tab UI does. */
const def=()=>{const o={};for(const k in MODES){o[k]={};for(const p of MODES[k].params)o[k][p.id]=p.v}return o};
function renderTo(ctx,px,spec){
  ctx.setTransform(px/1000,0,0,px/1000,0,0);ctx.clearRect(0,0,1000,1000);
  const st=MODES[spec.mode].draw(ctx,spec.params,PAL[spec.pal],spec.seed,spec.b);
  const a=spec.arc;
  if(a&&a.to&&PAL[a.to]&&a.to!==spec.pal){
    const o=document.createElement('canvas');o.width=px;o.height=px;const oc=o.getContext('2d');
    oc.setTransform(px/1000,0,0,px/1000,0,0);MODES[spec.mode].draw(oc,spec.params,PAL[a.to],spec.seed,spec.b);
    const g=a.dir==='r'?oc.createRadialGradient(500,500,60,500,500,700):oc.createLinearGradient(0,950,0,80);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,1)');
    oc.globalCompositeOperation='destination-in';oc.fillStyle=g;oc.fillRect(0,0,1000,1000);
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(o,0,0);
  }
  return st;
}

  window.NAQSH = {
    PAL, SRC, MODES, def, renderTo,
    rng, hash, hx, mix, reg, isect, TAU, clamp, f1, PB,
    hankin, tilesFor, girihGeom, drawGirih, girihSVG,
    kufic, GH, GW, makeGlyph, makeScript, bannaiVal, drawBannai,
    stemOf, makeGrower, genEslimi, genPacked, underPal, eslimiLayers, drawMotif, drawEslimi,
    makeProfile, hwAt, vesselPath, archPath, cut, outline, drawTongbori, tongboriSVG,
    rectPB, onion, sky, fillIn, plain, clipped, cylLight, domeLight, rule, ribs, finial, nicheBand,
    domeRegions, minaretRegions, facadeRegions, budgetCount, drawFacade
  };
})();
