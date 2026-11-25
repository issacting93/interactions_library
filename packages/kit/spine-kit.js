/* Spine Machines, as a kit: the machine grammar and part builders of the Spine Machines bench (its seed rolls tiers on a spine, a Gothic
   spire or a core with capsules), with nothing of its page. A machine comes back as plain meshes, one per role (bone, dark, accent), and
   its edge lines, in its own space: y up, the foot at y 0 on the axis.

     const kit = makeKit(THREE, mergeGeometries)
     kit.machine({ seed, arch: "spine" | "spire" | "core", tiers, sym, sil, grow, greeble, clump, flute, panelSeed })
        -> { roles: { bone|dark|accent: { pos, nrm, idx } }, edges: { bone|dark|accent: Float32Array of x, y, z pairs }, top, maxR, parts, M }
   The generator code below is the bench's own, unchanged; only addMesh (which there made a lit three.js mesh) and the bake are new. */
export function makeKit(THREE, mergeGeometries) {
const clamp = (v,a,b) => Math.min(b, Math.max(a, v)), lerp = (a,b,t) => a + (b-a)*t, TAU = Math.PI*2;
function rng(seed){ let a = seed>>>0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1|a); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296; }; }
let M = null, sel = -1, OPT = { tiers:7, sym:0, sil:'seed', kit:false, arch:'spine', grow:0.85 }, FIN = { greeble:0.15, clump:0.5, seed:1, flute:0.12 };
let bench = new THREE.Group(), items = [], groups = [], gimbals = [], stats = { parts:0, maxR:1, top:4 };
const paint = () => {}, frame = () => {}, syncUI = () => {}, syncGiz = () => {}, render = () => {};
function addMesh(geo, role, matrix, tier, tex, parent){ const m = new THREE.Mesh(geo); if (matrix) m.applyMatrix4(matrix); m.userData = { role: role === 'kit' ? 'bone' : role, tier };
  if (!geo.userData.edges) geo.userData.edges = new THREE.EdgesGeometry(geo, 22); (parent || bench).add(m); items.push({ m, parent }); stats.parts++; return m; }

/* part shapes: flat profiles cut like plate, in the plane of the spine (x outward, y up) */
function strip(pts, w0, w1){ const L = [], R = [], n = pts.length; for (let i=0;i<n;i++){ const a = pts[Math.max(0,i-1)], b = pts[Math.min(n-1,i+1)], tx = b[0]-a[0], ty = b[1]-a[1], l = Math.hypot(tx,ty) || 1, w = lerp(w0, w1, i/(n-1))/2; L.push(new THREE.Vector2(pts[i][0]-ty/l*w, pts[i][1]+tx/l*w)); R.push(new THREE.Vector2(pts[i][0]+ty/l*w, pts[i][1]-tx/l*w)); } return new THREE.Shape([...L, ...R.reverse()]); }
function disc(x, y, r, hole){ const s = new THREE.Shape(); s.absarc(x, y, r, 0, TAU, false); if (hole){ const h = new THREE.Path(); h.absarc(x, y, hole, 0, TAU, true); s.holes.push(h); } return s; }
function plate(shapes, th){ const bt = Math.min(0.007, th*0.28), g = new THREE.ExtrudeGeometry(shapes, { depth:th-2*bt, bevelEnabled:true, bevelThickness:bt, bevelSize:bt, bevelOffset:-bt, bevelSegments:1, curveSegments:8 }); g.translate(0, 0, -(th-2*bt)/2);
  const e = new THREE.ExtrudeGeometry(shapes, { depth:th, bevelEnabled:false, curveSegments:8 }); e.translate(0, 0, -th/2); let edges = new THREE.EdgesGeometry(e, 22); e.dispose();
  const boxes = greebles(shapes, th); let out = g;
  if (boxes.length){ out = mergeGeometries([g, ...boxes.map(b => b.toNonIndexed())]); const parts = [edges, ...boxes.map(b => new THREE.EdgesGeometry(b, 22))], n = parts.reduce((a, q) => a + q.attributes.position.array.length, 0), P = new Float32Array(n); let o = 0; for (const q of parts){ P.set(q.attributes.position.array, o); o += q.attributes.position.array.length; } edges = new THREE.BufferGeometry(); edges.setAttribute('position', new THREE.BufferAttribute(P, 3)); }
  out.userData.edges = edges; out.userData.unit = true; return out; }
function inPoly(x, y, poly){ let c = false; for (let i=0, j=poly.length-1; i<poly.length; j=i++){ const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y) + a.x) c = !c; } return c; }
function vn2(x, y, s){ const xi = Math.floor(x), yi = Math.floor(y); let fx = x-xi, fy = y-yi; fx = fx*fx*(3-2*fx); fy = fy*fy*(3-2*fy); const h = (a, b) => { let q = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(s, 1274126177); q = Math.imul(q ^ q>>>13, 1103515245); return ((q ^ q>>>16)>>>0)/4294967295; }; return lerp(lerp(h(xi,yi), h(xi+1,yi), fx), lerp(h(xi,yi+1), h(xi+1,yi+1), fx), fy); }
/* Kinnear & Kaplan style panelling: snap to a grid, split into sub-panels with T-junctions that avoid slivers, plate every panel as its own
   prism with a gap between, then raise risers, cylinders, pyramids and wedges on some of them. A density field clumps the detail, and the
   same layout is mirrored on both faces, so large-scale symmetry holds. Risers big enough get a second, smaller round of detail. */
function greebles(shapes, th){
  const out = []; if (FIN.greeble < 0.02) return out;
  for (const sh of shapes){ const pts = sh.getPoints(6), holes = sh.holes.map(q => q.getPoints(6)); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of pts){ x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const W = x1-x0, H = y1-y0, sm = Math.min(W, H); if (sm < 0.035) continue;
    const r = rng(Math.round(W*977 + H*131 + pts.length*7) + FIN.seed*13), g = Math.max(0.016, Math.min(W, H)/5), snap = v => Math.max(g, Math.round(v/g)*g), gap = Math.min(0.006, g*0.14), lift = 0.0035;
    const ok = (x, y) => inPoly(x, y, pts) && !holes.some(q => inPoly(x, y, q)), fits = (x, y, w, h) => [[0.06,0.06],[0.94,0.06],[0.94,0.94],[0.06,0.94],[0.5,0.5]].every(([a, b]) => ok(x + a*w, y + b*h));
    const leaves = [], split = (x, y, w, h, d) => { const big = Math.max(w, h);
      if (d > 0 && big >= 2*g - 1e-6 && (big > sm*0.6 || !fits(x, y, w, h) || r() < 0.7)){ const along = w >= h ? w : h, a = snap(along*lerp(0.3, 0.7, r())); if (a < along - g*0.99){ if (w >= h){ split(x, y, a, h, d-1); split(x+a, y, w-a, h, d-1); } else { split(x, y, w, a, d-1); split(x, y+a, w, h-a, d-1); } return; } }
      if (fits(x, y, w, h)) leaves.push([x, y, w, h]); };
    split(x0, y0, W, H, 9);
    const box = (cx, cy, w, h, d, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(cx, cy, z); return b; }, both = (make, z) => { out.push(make(z)); out.push(make(-z)); };
    for (const [x, y, w, h] of leaves){ const cx = x + w/2, cy = y + h/2, pw = w - gap, ph = h - gap, m = Math.min(pw, ph); if (m <= 0) continue;
      both(z => box(cx, cy, pw, ph, lift, Math.sign(z)*(th/2 + lift/2)), 1); // every panel is its own plate, so the gaps read as seams
      const dens = lerp(1, clamp((vn2(cx*3.1, cy*3.1, FIN.seed) - 0.3)*2.2, 0, 1), FIN.clump), p = FIN.greeble*dens, k = r(), top = th/2 + lift;
      if (k < p*0.45){ const hr = lerp(0.006, 0.022, r())*Math.min(1, m*12), iw = pw*lerp(0.55, 0.85, r()), ih = ph*lerp(0.55, 0.85, r()); both(z => box(cx, cy, iw, ih, hr, Math.sign(z)*(top + hr/2)), 1); // riser
        if (Math.min(iw, ih) > g*1.6 && r() < 0.6){ const n = 2 + Math.floor(r()*2), alongX = iw > ih; for (let i=0;i<n;i++){ const sw = (alongX ? iw : ih)/n, bw = alongX ? sw*0.6 : iw*0.5, bh = alongX ? ih*0.5 : sw*0.6, ox = alongX ? -iw/2 + sw*(i+0.5) : 0, oy = alongX ? 0 : -ih/2 + sw*(i+0.5), h2 = hr*lerp(0.4, 0.9, r()); both(z => box(cx+ox, cy+oy, bw, bh, h2, Math.sign(z)*(top + hr + h2/2)), 1); } } } // second round of detail
      else if (k < p*0.62 && m > g*0.6){ const cr = m*0.28, ch = lerp(0.006, 0.016, r()); both(z => { const c = new THREE.CylinderGeometry(cr, cr, ch, 12); c.rotateX(Math.PI/2); c.translate(cx, cy, Math.sign(z)*(top + ch/2)); return c; }, 1); }
      else if (k < p*0.76 && m > g*0.6){ const pr = m*0.36, phh = lerp(0.008, 0.02, r()); both(z => { const c = new THREE.ConeGeometry(pr, phh, 4); c.rotateY(Math.PI/4); c.rotateX(Math.sign(z) > 0 ? Math.PI/2 : -Math.PI/2); c.translate(cx, cy, Math.sign(z)*(top + phh/2)); return c; }, 1); }
      else if (k < p*0.9){ const wh = lerp(0.008, 0.02, r()); both(z => { const b = box(cx, cy, pw*0.8, ph*0.8, wh, 0), P = b.attributes.position.array; for (let i=0;i<P.length;i+=3) if (P[i] < cx && P[i+2] > 0) P[i+2] = -wh/2 + 0.0015; b.computeVertexNormals(); if (z < 0) b.scale(1, 1, -1); b.translate(0, 0, Math.sign(z)*(top + wh/2)); return b; }, 1); } // wedge
    } }
  return out; }
const both = (g, f) => { f(g); if (g.userData.edges) f(g.userData.edges); return g; }; // move a plate and its line drawing together
function flat(shape, th){ return both(plate([shape], th), q => q.rotateX(-Math.PI/2)); } // a plate lying level
/* signed distance parts: shapes written as maths, blended with smooth unions, then meshed (surface nets) and shaded from the field's gradient */
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5*(b-a)/k, 0, 1); return lerp(b, a, h) - k*h*(1-h); };
function cone(px, py, pz, a, b, ra, rb){ const bx = b[0]-a[0], by = b[1]-a[1], bz = b[2]-a[2], qx = px-a[0], qy = py-a[1], qz = pz-a[2], t = clamp((qx*bx+qy*by+qz*bz)/(bx*bx+by*by+bz*bz), 0, 1); return Math.hypot(qx-bx*t, qy-by*t, qz-bz*t) - lerp(ra, rb, t); }
const ball = (px, py, pz, c, r) => Math.hypot(px-c[0], py-c[1], pz-c[2]) - r;
const SDFS = {
  bone(L){ const R0 = [-Math.min(0.09, L*0.12), 0, 0], K = [0.5*L, 0.3*L, 0], T = [L, -0.12*L, 0], B0 = [0.1*L, -0.07*L, 0], B1 = [0.43*L, 0.15*L, 0], k = 0.045*L;
    return { box:[[R0[0]-0.1*L, -0.28*L, -0.13*L], [L + 0.06*L, 0.44*L, 0.13*L]], f(x, y, z){ z *= 1.4; let d = cone(x, y, z, R0, K, 0.075*L, 0.05*L); d = smin(d, cone(x, y, z, K, T, 0.05*L, 0.009*L), k); d = smin(d, ball(x, y, z, K, 0.072*L), 0.6*k); d = smin(d, cone(x, y, z, B0, B1, 0.034*L, 0.026*L), k*1.1); d = smin(d, ball(x, y, z, [0, 0, 0], 0.09*L), k); return d/1.4; } }; },
  knot(L){ const k = 0.03*L, C = [0.5*L, 0, 0], r = 0.17*L;
    return { box:[[-0.12*L - 0.1, -0.24*L, -0.24*L], [0.96*L, 0.24*L, 0.24*L]], f(x, y, z){ let d = cone(x, y, z, [-Math.min(0.09, L*0.12), 0, 0], [0.88*L, 0, 0], 0.036*L, 0.028*L);
      const qx = x-C[0], qy = y, qz = z, ang = Math.atan2(qz, qy), rr = r*(1 + 0.08*Math.cos(12*ang)); d = smin(d, (Math.hypot(qx/1.35, qy, qz) - rr)*0.75, k);
      d = smin(d, Math.hypot(Math.hypot(y, z) - 0.075*L, x - 0.2*L) - 0.02*L, k*0.6); d = smin(d, Math.hypot(Math.hypot(y, z) - 0.06*L, x - 0.76*L) - 0.016*L, k*0.6); d = smin(d, ball(x, y, z, [0.9*L, 0, 0], 0.055*L), k); return d; } }; },
};
const sdfCache = new Map();
function sdfGeo(kind, L){ const key = kind + '|' + L.toFixed(3); if (sdfCache.has(key)) return sdfCache.get(key);
  const S = SDFS[kind](L), [lo, hi] = S.box, f = S.f, cell = Math.max(0.006, L/60), nx = Math.ceil((hi[0]-lo[0])/cell)+1, ny = Math.ceil((hi[1]-lo[1])/cell)+1, nz = Math.ceil((hi[2]-lo[2])/cell)+1, V = new Float32Array(nx*ny*nz), at = (i, j, k) => (k*ny + j)*nx + i;
  for (let k=0;k<nz;k++) for (let j=0;j<ny;j++) for (let i=0;i<nx;i++) V[at(i,j,k)] = f(lo[0]+i*cell, lo[1]+j*cell, lo[2]+k*cell);
  const cid = (i, j, k) => (k*(ny-1) + j)*(nx-1) + i, vid = new Int32Array((nx-1)*(ny-1)*(nz-1)).fill(-1), pos = [], E = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]], C = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  for (let k=0;k<nz-1;k++) for (let j=0;j<ny-1;j++) for (let i=0;i<nx-1;i++){ const v = C.map(c => V[at(i+c[0], j+c[1], k+c[2])]); let neg = 0; for (const q of v) if (q < 0) neg++; if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0; for (const [a, b] of E){ if ((v[a] < 0) === (v[b] < 0)) continue; const t = v[a]/(v[a]-v[b]); sx += C[a][0] + (C[b][0]-C[a][0])*t; sy += C[a][1] + (C[b][1]-C[a][1])*t; sz += C[a][2] + (C[b][2]-C[a][2])*t; n++; }
    vid[cid(i,j,k)] = pos.length/3; pos.push(lo[0] + (i + sx/n)*cell, lo[1] + (j + sy/n)*cell, lo[2] + (k + sz/n)*cell); }
  const idx = [], quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k=1;k<nz-1;k++) for (let j=1;j<ny-1;j++) for (let i=0;i<nx-1;i++) if ((V[at(i,j,k)] < 0) !== (V[at(i+1,j,k)] < 0)) quad(vid[cid(i,j-1,k-1)], vid[cid(i,j,k-1)], vid[cid(i,j,k)], vid[cid(i,j-1,k)]);
  for (let k=1;k<nz-1;k++) for (let j=0;j<ny-1;j++) for (let i=1;i<nx-1;i++) if ((V[at(i,j,k)] < 0) !== (V[at(i,j+1,k)] < 0)) quad(vid[cid(i-1,j,k-1)], vid[cid(i,j,k-1)], vid[cid(i,j,k)], vid[cid(i-1,j,k)]);
  for (let k=0;k<nz-1;k++) for (let j=1;j<ny-1;j++) for (let i=1;i<nx-1;i++) if ((V[at(i,j,k)] < 0) !== (V[at(i,j,k+1)] < 0)) quad(vid[cid(i-1,j-1,k)], vid[cid(i,j-1,k)], vid[cid(i,j,k)], vid[cid(i-1,j,k)]);
  const N = new Float32Array(pos.length), e = cell*0.5; for (let q=0;q<pos.length;q+=3){ const x = pos[q], y = pos[q+1], z = pos[q+2], gx = f(x+e,y,z)-f(x-e,y,z), gy = f(x,y+e,z)-f(x,y-e,z), gz = f(x,y,z+e)-f(x,y,z-e), l = Math.hypot(gx, gy, gz) || 1; N[q] = gx/l; N[q+1] = gy/l; N[q+2] = gz/l; }
  for (let t=0;t<idx.length;t+=3){ const a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3, ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2], vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2], cx = uy*vz-uz*vy, cy = uz*vx-ux*vz, cz = ux*vy-uy*vx;
    if (cx*(N[a]+N[b]+N[c]) + cy*(N[a+1]+N[b+1]+N[c+1]) + cz*(N[a+2]+N[b+2]+N[c+2]) < 0){ const s = idx[t+1]; idx[t+1] = idx[t+2]; idx[t+2] = s; } } // wind every triangle to face out along the gradient
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length/3*2), 2)); g.setIndex(idx);
  g.userData.edges = new THREE.EdgesGeometry(g, 50); g.userData.outline = true; g.userData.unit = true; sdfCache.set(key, g); if (sdfCache.size > 40) sdfCache.delete(sdfCache.keys().next().value); return g; }

const PARTS = {
  hook:{ label:'Hook', build(L){ const a = L*0.42, rc = L*0.5, pts = [[0,0],[a*0.5,0],[a,0]]; for (let i=1;i<=12;i++){ const f = (i/12)*2.3; pts.push([a + rc*Math.sin(f), rc - rc*Math.cos(f)]); } const tip = pts[pts.length-1];
      return [{ geo:plate([strip(pts, L*0.085, L*0.03), disc(tip[0], tip[1], L*0.055, L*0.022), disc(0, 0, L*0.07, L*0.025)], L*0.035), role:'bone' }]; } },
  fin:{ label:'Fin', build(L){ const h = L*0.3, s = new THREE.Shape([[0,-h],[L*0.22,-h*0.55],[L,-L*0.03],[L,L*0.035],[L*0.3,h*0.75],[0,h]].map(p => new THREE.Vector2(p[0], p[1]))); s.holes.push(new THREE.Path([[L*0.08,-h*0.6],[L*0.1,h*0.6],[L*0.32,h*0.38],[L*0.62,0],[L*0.28,-h*0.35]].map(p => new THREE.Vector2(p[0], p[1]))));
      return [{ geo:plate([s], L*0.03), role:'bone' }, { geo:plate([disc(L*0.8, 0, L*0.035, 0)], L*0.07), role:'dark' }]; } },
  arm:{ label:'Arm', build(L){ const k = [L*0.48, L*0.34], e = [L, -L*0.3]; return [{ geo:plate([strip([[0,0],[k[0]*0.5,k[1]*0.55],k], L*0.1, L*0.075), disc(0,0,L*0.085,L*0.03), disc(k[0],k[1],L*0.075,L*0.028)], L*0.05), role:'bone' },
      { geo:plate([strip([k,[lerp(k[0],e[0],0.5), lerp(k[1],e[1],0.45)],e], L*0.07, L*0.012)], L*0.032), role:'bone' }, { geo:(() => { const g = new THREE.CylinderGeometry(L*0.045, L*0.045, L*0.11, 8); g.rotateX(Math.PI/2); g.translate(k[0], k[1], 0); return g; })(), role:'dark' }]; } },
  panel:{ label:'Panel', build(L){ const w = L*0.62, d = L*0.56, s = new THREE.Shape([[0,-d/2],[w,-d/2],[w,d/2],[0,d/2]].map(p => new THREE.Vector2(p[0], p[1]))); for (let i=0;i<5;i++){ const x = w*(0.1+i*0.17); s.holes.push(new THREE.Path([[x,-d*0.4],[x,d*0.4],[x+w*0.08,d*0.4],[x+w*0.08,-d*0.4]].map(p => new THREE.Vector2(p[0], p[1])))); }
      const g = both(flat(s, L*0.025), q => { q.rotateZ(-0.6); q.translate(L*0.42, L*0.06, 0); }); return [{ geo:g, role:'bone' }, { geo:plate([strip([[0,0],[L*0.25,L*0.02],[L*0.5,-L*0.02]], L*0.07, L*0.04), disc(0,0,L*0.06,L*0.022)], L*0.04), role:'dark' }]; } },
  pod:{ label:'Pod', build(L){ const g = new THREE.CylinderGeometry(L*0.2, L*0.2, L*0.5, 6); g.rotateX(Math.PI/2); g.translate(L*0.82, 0, 0); const c = new THREE.CylinderGeometry(L*0.23, L*0.23, L*0.06, 6); c.rotateX(Math.PI/2); c.translate(L*0.82, 0, 0);
      return [{ geo:g, role:'bone' }, { geo:c, role:'dark' }, { geo:plate([strip([[0,0],[L*0.35,0],[L*0.64,0]], L*0.06, L*0.045)], L*0.05), role:'dark' }]; } },
  deck:{ label:'Deck', build(L, o){ const r0 = o.r0, ri = r0 + L*0.06, ro = r0 + L, half = Math.PI/o.count*0.8, arc = (R, a0, a1, n) => Array.from({ length:n+1 }, (_, i) => { const a = lerp(a0, a1, i/n); return new THREE.Vector2(R*Math.cos(a) - r0, R*Math.sin(a)); });
      const s = new THREE.Shape([...arc(ri, -half, half, 6), ...arc(ro, half, -half, 12)]); s.holes.push(new THREE.Path([...arc(ri + L*0.22, half*0.7, -half*0.7, 6), ...arc(ro - L*0.14, -half*0.7, half*0.7, 10)]));
      return [{ geo:flat(s, L*0.03), role:'bone' }, { geo:plate([strip([[0,-L*0.3],[L*0.4,-L*0.12],[L*0.85,-L*0.01]], L*0.05, L*0.025)], L*0.025), role:'dark' }]; } },
  bone:{ label:'Bone', build(L){ return [{ geo:sdfGeo('bone', L), role:'bone' }]; } },
  knot:{ label:'Knot', build(L){ return [{ geo:sdfGeo('knot', L), role:'bone' }]; } },
  gimbal:{ label:'Gimbal', special:true, build(){ return []; } },
  buttress:{ label:'Buttress', fam:'spire', build(L, o){ const h = o.h || 0.8, pw = clamp(L*0.24, 0.05, 0.13), x1 = L - pw, V = a => a.map(p => new THREE.Vector2(p[0], p[1]));
      const pier = new THREE.Shape(V([[x1,0],[L,0],[L,h*0.8],[L - pw/2,h],[x1,h*0.8]])), foot = new THREE.Shape(V([[x1 - pw*0.18,0],[L + pw*0.12,0],[L + pw*0.12,h*0.09],[x1 - pw*0.18,h*0.09]]));
      if (pw > 0.07 && h > 0.5) pier.holes.push(new THREE.Path(V([[x1 + pw*0.3,h*0.3],[L - pw*0.3,h*0.3],[L - pw*0.3,h*0.62],[L - pw/2,h*0.7],[x1 + pw*0.3,h*0.62]]))); // lancet slot
      const flyer = (yt, yb, k) => { const top = [], bot = []; for (let i=0;i<=10;i++){ const u = i/10, x = u*(x1 + pw*0.05); top.push([x, lerp(yt, yt - h*0.16, u)]); bot.push([x, lerp(yt - h*0.07, yb, u) + Math.sin(Math.PI*u)*h*0.06*k]); } return new THREE.Shape(V([...top, ...bot.reverse()])); };
      const fl = [flyer(h*0.76, h*0.46, 1)]; if (h > 0.6 && L > 0.25) fl.push(flyer(h*0.47, h*0.24, 0.8));
      return [{ geo:plate([pier, foot], pw), role:'bone' }, { geo:plate(fl, Math.max(0.025, pw*0.45)), role:'bone' }, { geo:plate([new THREE.Shape(V([[L - pw*0.7,h*0.8],[L - pw*0.3,h*0.8],[L - pw/2,h*1.05]]))], pw*0.6), role:'dark' }]; } },
  pinnacle:{ label:'Pinnacle', fam:'spire', build(L){ const w = clamp(L*0.4, 0.035, 0.09), g = new THREE.LatheGeometry([[0,0],[w*0.72,0],[w*0.72,L*1.1],[w*0.9,L*1.1],[w*0.9,L*1.2],[0,L*2.4]].map(p => new THREE.Vector2(p[0], p[1])), 4).toNonIndexed(); g.computeVertexNormals(); g.rotateY(Math.PI/4); g.translate(L*0.55, 0, 0);
      return [{ geo:g, role:'bone' }]; } },
  crocket:{ label:'Crocket', fam:'spire', build(L){ return [{ geo:plate([strip([[0,0],[L*0.45,L*0.25],[L*0.75,L*0.7],[L*0.6,L*1.0]], L*0.32, L*0.08), disc(L*0.6, L*1.0, L*0.12, 0)], L*0.22), role:'bone' }]; } },
  capsule:{ label:'Capsule', fam:'core', build(L, o){ const h = o.h || 0.2, w = Math.min(h*1.05, 2*o.r0*Math.sin(Math.PI/o.count)*0.94 + L*0.25), rr = h*0.16, x0 = 0.03, s = new THREE.Shape();
      s.moveTo(x0, -h/2); s.lineTo(L - rr, -h/2); s.absarc(L - rr, -h/2 + rr, rr, -Math.PI/2, 0); s.lineTo(L, h/2 - rr); s.absarc(L - rr, h/2 - rr, rr, 0, Math.PI/2); s.lineTo(x0, h/2); s.lineTo(x0, -h/2);
      const win = new THREE.CylinderGeometry(h*0.27, h*0.27, 0.03, 28); win.rotateZ(Math.PI/2); win.translate(L + 0.004, h*0.02, 0); const fr = new THREE.CylinderGeometry(h*0.34, h*0.34, 0.02, 28); fr.rotateZ(Math.PI/2); fr.translate(L - 0.002, h*0.02, 0);
      const plug = new THREE.BoxGeometry(x0 + 0.02, h*0.6, w*0.6); plug.translate((x0 + 0.02)/2 - 0.01, 0, 0);
      return [{ geo:plate([s], w), role:'bone' }, { geo:fr, role:'bone' }, { geo:win, role:'dark' }, { geo:plug, role:'dark' }]; } },
  socket:{ label:'Empty socket', fam:'none', build(L, o){ const h = o.h || 0.2, w = Math.min(h*1.05, 2*o.r0*Math.sin(Math.PI/o.count)*0.94 + L*0.25), g = new THREE.BoxGeometry(0.03, h*0.9, w*0.9); g.translate(0.015, 0, 0); const b = new THREE.BoxGeometry(0.05, h*0.3, w*0.3); b.translate(0.025, 0, 0);
      return [{ geo:g, role:'dark' }, { geo:b, role:'accent' }]; } },
  kitArm:{ label:'Robot arm', kit:'armL', build(L, o){ return kitPart(o.donor, 'armL', L); } },
  kitLeg:{ label:'Robot leg', kit:'legL', build(L, o){ return kitPart(o.donor, 'legL', L); } },
};
const GEN_PARTS = ['hook','fin','arm','panel','pod','deck','bone','knot'], ROLL_PARTS = ['hook','fin','arm','panel','pod','deck']; // rolls use the cut-plate family only
const DONORS = {}; let kitReady = false;
function kitPart(donor, slot, L){ const d = DONORS[donor] || Object.values(DONORS)[0]; if (!d || !d[slot]) return PARTS.arm.build(L); const g = d[slot].geo.clone(), f = d[slot].from; g.translate(-f.x, -f.y, -f.z); g.rotateZ(Math.PI/2); g.computeBoundingBox(); const k = L/Math.max(1e-6, g.boundingBox.max.x); g.scale(k, k, k); return [{ geo:g, role:'kit', tex:d.gray }]; }
/* the grammar: a seed stacks tiers on a spine */
const SILS = { spindle:t => 0.45 + 0.75*Math.sin(Math.PI*t), tree:t => 1.25 - 0.95*t, mace:t => 0.4 + 0.95*t*t, hourglass:t => 0.45 + 0.85*Math.abs(2*t-1) }, SPINES = { shaft:'Shaft', column:'Column', lattice:'Lattice' };
const PALS = { bone:{ bone:'#e6e1d6', dark:'#2b2e34', accent:'#f2c400' }, gunmetal:{ bone:'#7c838d', dark:'#17191d', accent:'#35e0d0' }, oxblood:{ bone:'#e8dfd2', dark:'#4a0f1a', accent:'#ff5a36' } };
function rollSpine(seed){ const r = rng(seed*7919 + 5), N = OPT.sym || [3,4,5,6,6,8][Math.floor(r()*6)], nt = OPT.tiers, silName = OPT.sil === 'seed' ? Object.keys(SILS)[Math.floor(r()*4)] : OPT.sil, sil = SILS[silName], H = 1.2 + nt*0.56, pool = OPT.kit && kitReady ? [...ROLL_PARTS, 'kitArm', 'kitLeg'] : ROLL_PARTS, dn = Object.keys(DONORS);
  const tiers = []; let last = '';
  for (let i=0;i<nt;i++){ const t = nt === 1 ? 0.5 : i/(nt-1); let part = pool[Math.floor(r()*pool.length)]; if (part === last) part = pool[Math.floor(r()*pool.length)]; if (i === nt-1 && r() < 0.6) part = 'hook'; if (i === 0 && r() < 0.5) part = 'fin'; last = part;
    const count = part === 'deck' ? N : [N, N*2, N*2, Math.max(2, Math.round(N/2))][Math.floor(r()*4)], up = i === nt-1 ? 1 : 0;
    tiers.push({ part, count, y:lerp(0.75, H-0.45, t) + (r()-0.5)*0.12, reach:clamp(sil(t)*lerp(1.0, 1.35, r()), 0.4, 1.9), tilt:part === 'deck' || part === 'pod' ? 0 : Math.round(up ? lerp(35, 70, r()) : lerp(-30, 35, r())), size:1, stagger:i % 2 === 1, ring:r() < 0.35, donor:dn.length ? dn[Math.floor(r()*dn.length)] : '' });
    if (r() < 0.4 && part !== 'deck'){ const e = { ...tiers[tiers.length-1] }; e.y += 0.2; e.size = 0.58; e.stagger = !e.stagger; e.ring = false; e.tilt = clamp(e.tilt + 18, -70, 80); tiers.push(e); } } // an echo: the same part again, smaller and turned half a step
  if (nt > 2 && r() < 0.5){ const t = tiers[1 + Math.floor(r()*(tiers.length-1))]; t.part = 'gimbal'; t.count = 2 + Math.floor(r()*3); t.tilt = Math.round(lerp(18, 40, r())); t.reach = clamp(t.reach, 0.7, 1.6); t.size = 1; t.ring = false; }
  tiers.sort((a, b) => a.y - b.y);
  return { arch:'spine', pipes:false, seed, N, H, sil:silName, spine:Object.keys(SPINES)[Math.floor(r()*3)], helix:r() < 0.3, pal:M ? M.pal : 'bone', tiers }; }
function roll(seed){ return OPT.arch === 'spire' ? rollSpire(seed) : OPT.arch === 'core' ? rollCore(seed) : rollSpine(seed); }

/* archetypes: a mass model fixes the outline first, then one family of parts dresses it (the CGA order: mass, facade, detail) */
const ARCHS = { spine:'Reference', spire:'Spire', core:'Core & capsules' };
const ARCH_HINT = { spire:'Gothic tower. A strict taper set by stepped stages and a needle; buttresses grow from each stage and are sized to stay inside the taper line, so the base stage is always the hero.',
  core:'Metabolist tower. One permanent core carries identical capsules. Growth sets how many sockets are filled; empty sockets wait for a new unit. The silhouette sets how far each floor\'s clusters spread.',
  spine:'The machines built from your reference plates: cut-plate parts repeated in tiers round a spine, with gimbals. Smooth Bone and Knot parts and pipes are still available but no longer rolled.' };
function spireR(M, y){ const nd = M.needle; if (y >= nd.y0) return nd.r*(1 - clamp((y - nd.y0)/(nd.y1 - nd.y0), 0, 1)); for (const st of M.stages) if (y < st.y1 + 0.07) return lerp(st.r0, st.r1, clamp((y - st.y0)/(st.y1 - st.y0), 0, 1)); return M.stages[0].r0; }
function rollSpire(seed){ const r = rng(seed*6151 + 11), nt = OPT.tiers, N = OPT.sym || [4,4,8,8,8,6][Math.floor(r()*6)], S = clamp(Math.round(nt*0.45), 2, 5), Rb = lerp(0.42, 0.6, r()), top = 1.7 + nt*0.56;
  const base = 0.2, nf = lerp(0.36, 0.5, r()), Hb = (top - base)*(1 - nf), shrink = lerp(0.72, 0.86, r()), k = Array.from({ length:S }, (_, i) => Math.pow(shrink, i)), ks = k.reduce((a, b) => a + b, 0), stages = []; let y = base, rad = Rb;
  for (let i=0;i<S;i++){ const h = Hb*k[i]/ks - 0.07, st = { y0:y, y1:y + h, r0:rad, r1:rad*0.95 }; stages.push(st); y += h + 0.07; rad = st.r1*lerp(0.7, 0.8, r()); }
  const needle = { y0:y, y1:top, r:stages[S-1].r1*lerp(0.7, 0.85, r()) }, E0 = Rb*lerp(1.8, 2.15, r()), env = q => E0*(1 - q/(top*1.04)), tiers = []; let key = 0;
  stages.forEach((st, i) => { const h = (st.y1 - st.y0)*(i === S-1 ? 0.72 : 0.86), reach = Math.max(0.07, Math.min(env(st.y0 + h), env(st.y0)*0.92, i ? stages[i-1].r1*1.03 : 9) - st.r0); tiers.push({ key:key++, part:'buttress', count:N, y:st.y0, reach:+reach.toFixed(3), h, tilt:0, size:1, stagger:false, ring:false, phase:-Math.PI/2, donor:'' }); });
  tiers.push({ key:key++, part:'pinnacle', count:N, y:needle.y0, reach:+Math.max(0.05, (stages[S-1].r1 - needle.r)*0.7).toFixed(3), tilt:0, size:1, stagger:false, ring:false, phase:-Math.PI/2, donor:'' });
  const nc = Math.max(1, nt - S - 1); for (let i=0;i<nc;i++){ const f = lerp(0.18, 0.82, nc === 1 ? 0.5 : i/(nc-1)); tiers.push({ key:key++, part:'crocket', count:N, y:lerp(needle.y0, needle.y1, f), reach:+(0.085*(1 - f*0.45)).toFixed(3), tilt:0, size:1, stagger:false, ring:false, phase:-Math.PI/2, donor:'' }); }
  return { arch:'spire', seed, N, H:top - 0.5, sil:'taper', stages, needle, open:r() < 0.5, pal:M ? M.pal : 'bone', tiers }; }
function rollCore(seed){ const r = rng(seed*4447 + 23), nt = OPT.tiers, F = nt + 4, rc = lerp(0.3, 0.46, r()), h = lerp(0.19, 0.24, r()), L = lerp(0.36, 0.56, r()), pitch = h + 0.035, y0 = 0.5 + h/2;
  const count = OPT.sym || clamp(Math.round(Math.PI/Math.asin(clamp(h*1.08/(2*(rc + 0.02)), 0.1, 0.95))), 5, 14), silName = OPT.sil === 'seed' ? Object.keys(SILS)[Math.floor(r()*4)] : OPT.sil, sil = SILS[silName], c = [1,2,2,3,3,4][Math.floor(r()*6)], twist = r() < 0.3 ? lerp(0.15, 0.35, r()) : 0, tiers = [];
  for (let i=0;i<F;i++){ const t = F === 1 ? 0.5 : i/(F-1); tiers.push({ key:i, part:'capsule', count, y:y0 + i*pitch, reach:+L.toFixed(3), h, spread:+clamp((sil(t) - 0.3)/1.05, 0.2, 1).toFixed(2), tilt:0, size:1, stagger:i % 2 === 1 && r() < 0.6, ring:false, phase:twist*i, donor:'' }); }
  return { arch:'core', seed, N:count, H:y0 + F*pitch, sil:silName, rc, clusters:c, cphase:r()*TAU, crane:r() < 0.65, craneA:r()*TAU, pal:M ? M.pal : 'bone', tiers }; }


function lathe(profile, segs, flutes){ const a = FIN.flute; if (!flutes || a < 0.01) return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), segs);
  const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), flutes*6), P = g.attributes.position.array; // real displacement: concave flutes meeting at sharp arrises
  for (let i=0;i<P.length;i+=3){ const f = Math.atan2(P[i], P[i+2]), k = 1 - a*Math.abs(Math.sin(flutes*f/2)); P[i] *= k; P[i+2] *= k; } g.computeVertexNormals(); return g; }
function bandRing(R, w, h){ return lathe([[R-w,-h],[R+w,-h],[R+w,h],[R-w,h],[R-w,-h]], 72); }
function facet(profile, n, rot){ const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), n).toNonIndexed(); g.computeVertexNormals(); if (rot) g.rotateY(rot); return g; }
function rods(pairs, rad){ const gs = pairs.map(([a, b]) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(rad, rad, d.length(), 6, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate((a.x + b.x)/2, (a.y + b.y)/2, (a.z + b.z)/2); return g; }), g = mergeGeometries(gs); g.userData.edges = new THREE.EdgesGeometry(g, 80); g.userData.outline = true; return g; }
function buildSpireMass(){ const { stages, needle, N } = M, Rb = stages[0].r0, prof = [[0,0],[Rb*1.32,0],[Rb*1.32,0.1],[Rb*1.12,0.16],[Rb*1.05,0.2]];
  stages.forEach((st, i) => { const nx = stages[i+1] ? stages[i+1].r0 : needle.r*1.15; prof.push([st.r0, st.y0 + 0.001], [st.r1, st.y1 - 0.045], [st.r1*1.06, st.y1 - 0.045], [st.r1*1.06, st.y1], [nx, st.y1 + 0.07]); });
  addMesh(facet(prof.concat([[0, needle.y0 + 0.001]]), N), 'bone', null, -1);
  for (const st of stages) addMesh(facet([[st.r1*1.065, st.y1 - 0.05],[st.r1*1.065, st.y1 - 0.035],[st.r1*0.9, st.y1 - 0.035],[st.r1*0.9, st.y1 - 0.05]], N), 'dark', null, -1); // string course at each set-off
  const n0 = needle.y0, n1 = needle.y1, apex = new THREE.Vector3(0, n1 - 0.06, 0), C = (rad, y, k) => { const f = k/N*TAU; return new THREE.Vector3(rad*Math.sin(f), y, rad*Math.cos(f)); };
  if (M.open){ const pairs = [], lv = [0, 0.22, 0.44, 0.64, 0.82]; for (let k=0;k<N;k++) pairs.push([C(needle.r, n0, k), apex]);
    for (let j=0;j<lv.length-1;j++){ const ya = lerp(n0, n1, lv[j]), yb = lerp(n0, n1, lv[j+1]), ra = needle.r*(1 - lv[j]), rb = needle.r*(1 - lv[j+1]); for (let k=0;k<N;k++){ pairs.push([C(ra, ya, k), C(rb, yb, k+1)], [C(ra, ya, k+1), C(rb, yb, k)]); } if (j) for (let k=0;k<N;k++) pairs.push([C(ra, ya, k), C(ra, ya, k+1)]); }
    addMesh(rods(pairs, 0.011), 'bone', null, -1); addMesh(rods([[new THREE.Vector3(0, n0, 0), apex]], 0.02), 'dark', null, -1); addMesh(facet([[needle.r*1.08, n0],[needle.r*1.08, n0 + 0.05],[0, n0 + 0.05]], N), 'bone', null, -1); }
  else { addMesh(facet([[needle.r, n0],[0.012, n1 - 0.06],[0, n1 - 0.06]], N), 'bone', null, -1); for (const f of [0.3, 0.6]) addMesh(facet([[needle.r*(1 - f) + 0.018, lerp(n0, n1, f) - 0.012],[needle.r*(1 - f) + 0.018, lerp(n0, n1, f) + 0.012],[needle.r*(1 - f) - 0.01, lerp(n0, n1, f) + 0.012]], N), 'dark', null, -1); }
  const fy = n1 - 0.07; addMesh(lathe([[0, fy],[0.035, fy + 0.03],[0.022, fy + 0.07],[0.03, fy + 0.1],[0, fy + 0.13]], 12), 'accent', null, -1); // finial
  const V = a => new THREE.Shape(a.map(p => new THREE.Vector2(p[0], p[1]))); addMesh(plate([V([[-0.012, fy + 0.12],[0.012, fy + 0.12],[0.012, fy + 0.34],[-0.012, fy + 0.34]]), V([[-0.07, fy + 0.25],[0.07, fy + 0.25],[0.07, fy + 0.275],[-0.07, fy + 0.275]])], 0.018), 'accent', null, -1);
  stats.maxR = Math.max(stats.maxR, Rb*1.32); }
function buildCoreMass(){ const rc = M.rc, top = M.H, L = M.tiers[0] ? M.tiers[0].reach : 0.45, Rp = rc + L*0.9;
  addMesh(lathe([[0,0],[Rp,0],[Rp,0.16],[Rp*0.92,0.2],[rc*1.3,0.24],[rc*1.3,0.36],[rc*1.05,0.4],[0,0.4]], 48), 'dark', null, -1); // podium
  addMesh(lathe([[rc*1.04,0.36],[rc,0.42],[rc, top],[rc*1.06, top + 0.02],[rc*1.06, top + 0.1],[0, top + 0.1]], 48, 0), 'bone', null, -1); // the permanent core
  for (const t of M.tiers) addMesh(bandRing(rc + 0.012, 0.014, 0.008).translate(0, t.y - (t.h || 0.2)/2 - 0.017, 0), 'dark', null, -1); // floor slabs
  for (let i=0;i<2;i++){ const g = new THREE.BoxGeometry(0.07, top - 0.4, 0.07), a = M.cphase + Math.PI/M.clusters + i*Math.PI; g.translate(Math.cos(a)*rc, (top + 0.4)/2, -Math.sin(a)*rc); addMesh(g, 'dark', null, -1); } // service shafts in the gaps
  addMesh(lathe([[0, top + 0.1],[rc*0.7, top + 0.1],[rc*0.7, top + 0.34],[rc*0.5, top + 0.4],[0, top + 0.4]], 8), 'dark', null, -1); // machine room
  if (M.crane){ const a = M.craneA, ca = Math.cos(a), sa = -Math.sin(a), yj = top + 0.95, J = rc + L + 0.45, rot = new THREE.Matrix4().makeRotationY(a); // the craneway that swaps capsules (Plug-In City)
    const mast = new THREE.BoxGeometry(0.08, 0.6, 0.08); mast.translate(0, top + 0.68, 0); addMesh(mast, 'accent', null, -1);
    const jib = new THREE.BoxGeometry(J + rc*0.9, 0.06, 0.07); jib.translate((J - rc*0.9)/2, yj, 0); addMesh(jib, 'accent', rot, -1); const cw = new THREE.BoxGeometry(0.16, 0.12, 0.12); cw.translate(-rc*0.8, yj - 0.08, 0); addMesh(cw, 'dark', rot, -1);
    const tie = rods([[new THREE.Vector3(0, yj + 0.28, 0), new THREE.Vector3(J*0.95, yj + 0.03, 0)], [new THREE.Vector3(0, yj + 0.28, 0), new THREE.Vector3(-rc*0.8, yj + 0.03, 0)], [new THREE.Vector3(0, top + 0.38, 0), new THREE.Vector3(0, yj + 0.3, 0)]], 0.008); addMesh(tie, 'dark', rot, -1);
    const t0 = M.tiers[M.tiers.length-1], hy = t0 ? t0.y + 0.08 : top - 0.2, cab = rods([[new THREE.Vector3(J*0.92, yj, 0), new THREE.Vector3(J*0.92, hy + (t0 ? t0.h : 0.2)/2, 0)]], 0.005); addMesh(cab, 'dark', rot, -1);
    if (t0) for (const p of PARTS.capsule.build(t0.reach, { count:t0.count, r0:rc, h:t0.h })) addMesh(p.geo, p.role, new THREE.Matrix4().makeTranslation(J*0.92*ca, hy, J*0.92*sa).multiply(new THREE.Matrix4().makeRotationY(a + Math.PI/2)).multiply(new THREE.Matrix4().makeTranslation(-t0.reach/2, 0, 0)), -1);
    stats.maxR = Math.max(stats.maxR, J); }
  stats.maxR = Math.max(stats.maxR, Rp); }
function rebuild(reframe){
  for (const { m, ln, parent } of items){ m.material.dispose(); ln.material.dispose(); (parent || bench).remove(m); } for (const q of groups) bench.remove(q); groups = []; gimbals = []; items = []; stats = { parts:0, maxR:0.6, top:M.H + 0.5 };
  const H = M.H, col = M.spine === 'column', lat = M.spine === 'lattice', rs = col ? 0.17 : lat ? 0.14 : 0.085, r0 = rs*1.9, ys = M.tiers.map(t => t.y);
  const arch = M.arch || 'spine', rT = t => arch === 'spire' ? spireR(M, t.y) : arch === 'core' ? M.rc : r0, partCache = new Map();
  if (arch === 'spire') buildSpireMass(); else if (arch === 'core') buildCoreMass(); else {
  // spine, foot and finial
  if (lat){ for (let i=0;i<4;i++){ const a = Math.PI/4 + i*Math.PI/2, g = new THREE.BoxGeometry(0.035, H-0.2, 0.035); g.translate(Math.cos(a)*rs, H/2+0.1, Math.sin(a)*rs); addMesh(g, 'dark', null, -1); } for (const y of [...ys, ...ys.slice(1).map((v, i) => (v+ys[i])/2)]){ const g = new THREE.BoxGeometry(rs*2.9, 0.022, rs*2.9); g.translate(0, y, 0); addMesh(g, 'bone', null, -1); } }
  else { const prof = [[rs, 0.2]]; for (const y of ys){ prof.push([rs, y-0.07], [r0, y-0.05], [r0, y+0.05], [rs, y+0.07]); if (col) prof.push([rs*0.8, y+0.2]); } prof.push([rs*0.8, H]); addMesh(lathe(prof, 12, 12), 'dark', null, -1); for (const y of ys) addMesh(lathe([[r0*1.5, y-0.012],[r0*1.5, y+0.012],[rs, y+0.012],[rs, y-0.012]], 12), 'bone', null, -1); }
  addMesh(lathe([[0,0],[0.62,0],[0.62,0.06],[0.34,0.12],[rs*1.6,0.46],[rs,0.5],[0,0.5]], 8, 16), 'dark', null, -1); addMesh(bandRing(0.5, 0.03, 0.015).translate(0, 0.09, 0), 'accent', null, -1);
  addMesh(lathe([[0,H+0.5],[rs*1.4,H],[rs*0.8,H-0.06],[0,H-0.06]], 8, 8), 'bone', null, -1);
  if (M.helix){ const y0 = ys[0], y1 = ys[ys.length-1], turns = Math.max(1, Math.round((y1-y0)/1.3)), n = turns*40, Ri = r0 + 0.28, Ro = Ri + 0.2, pos = [], idx = []; for (let i=0;i<=n;i++){ const a = TAU*turns*i/n, y = lerp(y0, y1, i/n); pos.push(Ri*Math.cos(a), y, Ri*Math.sin(a), Ro*Math.cos(a), y, Ro*Math.sin(a)); if (i < n) idx.push(i*2, i*2+1, i*2+3, i*2, i*2+3, i*2+2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); addMesh(g, 'bone', null, -1);
    for (let i=0;i<=n;i+=10){ const a = TAU*turns*i/n, y = lerp(y0, y1, i/n), s = new THREE.BoxGeometry(Ri - rs, 0.02, 0.02); s.translate((Ri+rs)/2, 0, 0); addMesh(s, 'dark', new THREE.Matrix4().makeTranslation(0, y, 0).multiply(new THREE.Matrix4().makeRotationY(-a)), -1); } stats.maxR = Math.max(stats.maxR, Ro); } }
  // tiers: one part, repeated round the axis
  M.tiers.forEach((t, ti) => { const def = PARTS[t.part];
    if (def.special){ // gimbal: hoops round the spine, each pivoting inside the one before
      const n = clamp(Math.round(t.count), 2, 5), R0 = r0 + t.reach*t.size, tl = t.tilt*Math.PI/180; let parent = new THREE.Group(); parent.position.y = t.y; parent.rotation.y = t.phase || 0; bench.add(parent); groups.push(parent);
      for (let i=0;i<4;i++){ const sp = new THREE.BoxGeometry(R0 - rs, 0.03, 0.03); sp.translate((R0+rs)/2, 0, 0); addMesh(sp, 'dark', new THREE.Matrix4().makeRotationY(i*Math.PI/2 + Math.PI/4), ti, null, parent); }
      for (let k=0;k<n;k++){ const R = R0*(1 - k*0.16), axis = k % 2 ? 'z' : 'x'; if (k > 0){ const g2 = new THREE.Group(); g2.rotation[axis] = tl; parent.add(g2); gimbals.push({ g:g2, axis, base:tl, speed:0.5 + k*0.23, ph:k*1.7 + ti }); const Rp = R0*(1 - (k-1)*0.16);
          for (const sg of [1,-1]){ const pin = new THREE.CylinderGeometry(0.022, 0.022, Rp - R + 0.05, 8); pin.rotateZ(Math.PI/2); pin.translate(sg*(Rp+R)/2, 0, 0); if (axis === 'z') pin.rotateY(Math.PI/2); addMesh(pin, 'dark', null, ti, null, g2); } parent = g2; }
        addMesh(bandRing(R, 0.028, 0.02), k === n-1 ? 'accent' : 'bone', null, ti, null, parent); }
      t._ext = R0; stats.maxR = Math.max(stats.maxR, R0); return; }
    const rr0 = rT(t), count = Math.round(t.count), o = { count, r0:rr0, donor:t.donor, h:t.h }, ck = [t.part, t.reach, count, rr0.toFixed(3), t.h, t.donor].join('|'), get = (part, key) => { if (!partCache.has(key)) partCache.set(key, PARTS[part].build(t.reach, o)); return partCache.get(key); };
    const pieces = get(t.part, ck), step = TAU/count, tilt = t.tilt*Math.PI/180, ext = rr0 + t.reach*t.size*Math.max(0.35, Math.cos(tilt)), cl = M.clusters || 1; let built = 0;
    for (let k=0;k<count;k++){ const a0 = step*k + (t.stagger ? step/2 : 0), a = a0 + (t.phase || 0); let use = pieces;
      if (t.part === 'capsule'){ let d = 1e9; for (let j=0;j<cl;j++){ let q = Math.abs(((a0 - M.cphase - j*TAU/cl) % TAU + TAU) % TAU); d = Math.min(d, q, TAU - q); } if (d > (t.spread ?? 1)*Math.PI/cl + 1e-6) continue; // outside this floor's cluster spread
        if (rng((M.seed*1009 + (t.key || 0)*9176 + k*131) >>> 0)() > OPT.grow) use = get('socket', 'socket|' + ck); else built++; } else built++;
      const mx = new THREE.Matrix4().makeTranslation(0, t.y, 0).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(rr0, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(tilt)).multiply(new THREE.Matrix4().makeScale(t.size, t.size, t.size)); for (const p of use) addMesh(p.geo, p.role, mx, ti, p.tex); }
    t._n = built;
    if (t.ring) addMesh(bandRing(ext, 0.018, 0.012).translate(0, t.y + t.reach*t.size*Math.sin(tilt)*0.92, 0), 'accent', null, ti);
    t._ext = ext; stats.maxR = Math.max(stats.maxR, ext); });
  if (arch === 'spine' && M.pipes){ // Kinnear & Kaplan pipe routing, reduced to the spine: short runs with few bends, joining each tier to the next, with clamps
    const pr = rng(M.seed*733 + 9), n = M.N >= 6 ? M.N/2 : M.N, step = TAU/n, off = step/2 + (pr()-0.5)*0.3;
    for (let i=0;i<M.tiers.length-1;i++){ const ya = M.tiers[i].y, yb = M.tiers[i+1].y; if (yb - ya < 0.22 || pr() < 0.25) continue; const rad = lerp(0.011, 0.02, pr()), rp = r0 + lerp(0.06, 0.16, pr()), jog = pr() < 0.4;
      for (let k=0;k<n;k++){ const a = off + step*k, c = Math.cos(a), sN = Math.sin(a), P = (r, y) => new THREE.Vector3(c*r, y, sN*r), y0 = ya + 0.07, y1 = yb - 0.07, pts = [P(rs*0.9, y0), P(rp, y0)];
        if (jog){ const ym = (y0 + y1)/2, a2 = a + step*0.18, P2 = (r, y) => new THREE.Vector3(Math.cos(a2)*r, y, Math.sin(a2)*r); pts.push(P(rp, ym - 0.06), P2(rp, ym + 0.06)); pts.push(P2(rp, y1), P2(rs*0.9, y1)); } else pts.push(P(rp, y1), P(rs*0.9, y1));
        const path = new THREE.CurvePath(); let prev = pts[0]; for (let q=1;q<pts.length;q++){ const A = pts[q-1], Bq = pts[q], Cq = pts[q+1]; if (!Cq){ path.add(new THREE.LineCurve3(prev, Bq)); break; } const d1 = Bq.clone().sub(A).normalize(), d2 = Cq.clone().sub(Bq).normalize(), f = Math.min(0.05, A.distanceTo(Bq)/2, Bq.distanceTo(Cq)/2), p1 = Bq.clone().addScaledVector(d1, -f), p2 = Bq.clone().addScaledVector(d2, f); path.add(new THREE.LineCurve3(prev, p1)); path.add(new THREE.QuadraticBezierCurve3(p1, Bq.clone(), p2)); prev = p2; }
        const tg = new THREE.TubeGeometry(path, Math.max(24, Math.round(path.getLength()*40)), rad, 8, false); tg.userData.edges = new THREE.EdgesGeometry(tg, 80); tg.userData.outline = true; addMesh(tg, 'dark', null, -1);
        for (let y=y0+0.18; y<y1-0.1; y+=0.36){ if (jog && Math.abs(y - (y0+y1)/2) < 0.12) continue; const cl = new THREE.CylinderGeometry(rad*1.9, rad*1.9, 0.03, 10); cl.translate(c*rp, y, sN*rp); addMesh(cl, 'bone', null, -1); } } } }
  bench.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(bench); stats.top = bb.max.y; stats.maxR = Math.max(stats.maxR, bb.max.x, -bb.min.x, bb.max.z, -bb.min.z);
  paint(); if (reframe) frame(); syncUI(); syncGiz(); render(); }
function bake(){ const out = { roles:{}, edges:{} }, acc = {}, v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const { m } of items){ const role = m.userData.role, a = acc[role] || (acc[role] = { pos:[], nrm:[], idx:[], edge:[] }), g = m.geometry; m.updateWorldMatrix(true, false); const W = m.matrixWorld; nm.getNormalMatrix(W);
    if (!g.attributes.normal) g.computeVertexNormals(); const P = g.attributes.position, N = g.attributes.normal, base = a.pos.length/3, flip = W.determinant() < 0;
    for (let i=0;i<P.count;i++){ v.fromBufferAttribute(P, i).applyMatrix4(W); a.pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); a.nrm.push(v.x, v.y, v.z); }
    if (g.index){ const I = g.index.array; for (let i=0;i<I.length;i+=3) a.idx.push(base + I[i], base + I[flip ? i+2 : i+1], base + I[flip ? i+1 : i+2]); } else for (let i=0;i<P.count;i+=3) a.idx.push(base + i, base + (flip ? i+2 : i+1), base + (flip ? i+1 : i+2));
    const E = g.userData.edges && g.userData.edges.attributes.position; if (E) for (let i=0;i<E.count;i++){ v.fromBufferAttribute(E, i).applyMatrix4(W); a.edge.push(v.x, v.y, v.z); } }
  for (const [role, a] of Object.entries(acc)){ out.roles[role] = { pos:new Float32Array(a.pos), nrm:new Float32Array(a.nrm), idx:new Uint32Array(a.idx) }; out.edges[role] = new Float32Array(a.edge); }
  return out; }
function machine(o){ o = o || {}; OPT = { tiers:o.tiers || 7, sym:o.sym || 0, sil:o.sil || 'seed', kit:false, arch:o.arch || 'spine', grow:o.grow == null ? 0.85 : o.grow };
  FIN = { greeble:o.greeble == null ? 0.15 : o.greeble, clump:o.clump == null ? 0.5 : o.clump, seed:o.panelSeed || 1, flute:o.flute == null ? 0.12 : o.flute };
  bench = new THREE.Group(); items = []; groups = []; gimbals = []; M = null; M = roll(o.seed || 1); if (o.edit) o.edit(M); rebuild(false);
  const out = bake(); out.top = stats.top; out.maxR = stats.maxR; out.parts = stats.parts; out.M = M; out.arch = OPT.arch; return out; }
return { machine, ARCHS, SILS };
}
