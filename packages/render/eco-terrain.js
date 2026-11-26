// packages/render/eco-terrain.js -- the contour terrain's helpers, shared by the ecology pages (World Scene, Cybernetic Ecology, Field Scan,
// Species Style Lab), which each carried the same copy: a seeded random, value noise for the height field, normalising it to 0..1, marching
// squares for one contour level, and stitching its segments into lines. Plain global functions, as the pages call them.

// the twelve gradient directions of the simplex noise (trMakeNoise)
const TR_G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
function trMulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function trMakeNoise(seed) {
  const r = trMulberry32(seed), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F3 = 1 / 3, G = 1 / 6;
  return function (x, y, z) {
    const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G, x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; } else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; } else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; } }
    else { if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; } else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; } else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; } }
    const x1=x0-i1+G,y1=y0-j1+G,z1=z0-k1+G,x2=x0-i2+2*G,y2=y0-j2+2*G,z2=z0-k2+2*G,x3=x0-1+3*G,y3=y0-1+3*G,z3=z0-1+3*G;
    const ii=i&255,jj=j&255,kk=k&255; let n=0;
    const c = (gx,xx,yy,zz) => { let tt=.6-xx*xx-yy*yy-zz*zz; if (tt<0) return 0; tt*=tt; const g=TR_G3[gx%12]; return tt*tt*(g[0]*xx+g[1]*yy+g[2]*zz); };
    n += c(perm[ii+perm[jj+perm[kk]]], x0,y0,z0);
    n += c(perm[ii+i1+perm[jj+j1+perm[kk+k1]]], x1,y1,z1);
    n += c(perm[ii+i2+perm[jj+j2+perm[kk+k2]]], x2,y2,z2);
    n += c(perm[ii+1+perm[jj+1+perm[kk+1]]], x3,y3,z3);
    return 32 * n;
  };
}
function normalize01(src) {
  let mn = Infinity, mx = -Infinity;
  for (const v of src) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = (src[i] - mn) / (mx - mn);
  return out;
}
function trMarchLevel(vals, nx, ny, level) {
  const segs = [];
  const lerp = (a, b) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = vals[j*nx+i], b = vals[j*nx+i+1], c = vals[(j+1)*nx+i+1], d = vals[(j+1)*nx+i];
    const k = (a>level?8:0)|(b>level?4:0)|(c>level?2:0)|(d>level?1:0);
    if (k === 0 || k === 15) continue;
    const T=[i+lerp(a,b), j], R=[i+1, j+lerp(b,c)], B=[i+lerp(d,c), j+1], L=[i, j+lerp(a,d)];
    const table = {1:[L,B],14:[L,B],2:[B,R],13:[B,R],3:[L,R],12:[L,R],4:[T,R],11:[T,R],5:[L,T,B,R],6:[T,B],9:[T,B],7:[L,T],8:[L,T],10:[T,R,L,B]};
    const s = table[k];
    for (let s2 = 0; s2 < s.length; s2 += 2) segs.push([s[s2], s[s2+1]]);
  }
  return segs;
}
function trStitch(segs) {
  const key = p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const used = new Array(segs.length).fill(false);
  const byPoint = new Map();
  segs.forEach((s, i) => [0, 1].forEach(e => {
    const k = key(s[e]);
    if (!byPoint.has(k)) byPoint.set(k, []);
    byPoint.get(k).push({ i, e });
  }));
  const chains = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = [segs[i][0], segs[i][1]];
    for (const atStart of [false, true]) {
      let guard = 0;
      while (guard++ < segs.length * 2) {
        const end = atStart ? chain[0] : chain[chain.length - 1];
        const cands = (byPoint.get(key(end)) || []).filter(c => !used[c.i]);
        if (!cands.length) break;
        const { i: ci, e } = cands[0];
        used[ci] = true;
        const next = e === 0 ? segs[ci][1] : segs[ci][0];
        if (atStart) chain.unshift(next); else chain.push(next);
      }
    }
    if (chain.length > 1) chains.push(chain);
  }
  return chains;
}
