/* ─────────────────────────────────────────────────────────────
   PIECE · MURMURATION ROSETTE
   Rosette's dial (decor rings, Graphite Halo, 50-tick ring, 8 nodes,
   centre button) ported verbatim, plus a new BOIDS layer underneath:
   a 3D flock (separation/alignment/cohesion) that the NODE control
   calls to whichever node is selected, same as it already drives the
   tick ring. The flock is a WebGL scene, but the stage/capture/Figma
   pipeline only knows how to flatten SVG — so each frame the flock is
   rendered offscreen and the frame is embedded as a plain SVG <image>
   in the 'boids' layer. capture.mjs and export-figma.mjs need no
   changes: as far as they're concerned this is still just SVG.

   Determinism: the flock has no closed form (unlike the halo's spring/
   integral, it's a genuine N-body sim), so it can't be a pure function
   of u the way pose() is. Instead it's a deterministic REPLAY: a
   seeded RNG (mulberry32, same as the halo) seeds the initial boids,
   and the sim advances in fixed 1/60 s steps. capture.mjs always seeks
   forward in order (0, 1/fps, 2/fps, …) and so does normal playback,
   so stepping incrementally from the last-seen step reproduces the
   same result every run. A backward jump (manual scrub, or a STORY/
   EXPLODED loop wrapping back to 0) resets and replays from step 0 —
   correct but O(steps), so it's cheap during normal forward playback
   and only pays the replay cost on an actual rewind.
   ───────────────────────────────────────────────────────────── */
(() => {

let THREE = null;
import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js').then(mod => {
  THREE = mod;
  threeReady();
  // the piece may already have been built (without the boids layer) before THREE finished
  // loading — if it's the one on screen, rebuild now so the layer appears
  if (typeof build === 'function' && typeof S !== 'undefined' && S.piece === 'murmuration-rosette') build();
});

const BD_LABELS = ['SENSE', 'MOTION', 'STRUCTURE', 'RHYTHM', 'SPACE', 'SIGNAL', 'FORM', 'LAYER'];
const BD_GLYPHS = BD_LABELS.map(l => l.slice(0, 2));

/* ── GRAPHITE HALO (verbatim port of pieces/rosette/piece.js) ── */
const HALO = { seed: 4108, warp: .11, scale: 8.5, density: .5, spread: .065, layers: 3, K: 600, speed: .12, spin: .35, boil: .11 };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
function makeNoise(seed) {
  const r = mulberry32(seed), p = new Uint8Array(256);
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
    const c = (gx,xx,yy,zz) => { let tt=.6-xx*xx-yy*yy-zz*zz; if (tt<0) return 0; tt*=tt; const g=G3[gx%12]; return tt*tt*(g[0]*xx+g[1]*yy+g[2]*zz); };
    n += c(perm[ii+perm[jj+perm[kk]]], x0,y0,z0);
    n += c(perm[ii+i1+perm[jj+j1+perm[kk+k1]]], x1,y1,z1);
    n += c(perm[ii+i2+perm[jj+j2+perm[kk+k2]]], x2,y2,z2);
    n += c(perm[ii+1+perm[jj+1+perm[kk+1]]], x3,y3,z3);
    return 32 * n;
  };
}
const HN = makeNoise(HALO.seed);
const fbm = (x, y, z, oct) => { let a=.5,f=1,s=0; for (let o=0;o<oct;o++){ s+=a*HN(x*f,y*f,z+o*17.3); f*=2.03; a*=.5; } return s; };
function haloField(n, z, warp = HALO.warp) {
  const P = HALO, ang = z * P.spin, rc0 = Math.cos(ang), rs0 = Math.sin(ang);
  const m = Math.ceil(n / 5) + 1, wx = new Float32Array(m * m), wy = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const u0 = i/(m-1)-.5, v0 = j/(m-1)-.5, u = u0*rc0-v0*rs0, v = u0*rs0+v0*rc0;
    wx[j*m+i] = fbm(u*2.2, v*2.2, z, 3); wy[j*m+i] = fbm(u*2.2+5.2, v*2.2+1.3, z+9.1, 3);
  }
  const vals = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const gy = j/(n-1)*(m-1), j0 = Math.min(m-2, gy|0), fy = gy-j0;
    for (let i = 0; i < n; i++) {
      const gx = i/(n-1)*(m-1), i0 = Math.min(m-2, gx|0), fx = gx-i0, k = j0*m+i0;
      const qx = (wx[k]*(1-fx)+wx[k+1]*fx)*(1-fy) + (wx[k+m]*(1-fx)+wx[k+m+1]*fx)*fy;
      const qy = (wy[k]*(1-fx)+wy[k+1]*fx)*(1-fy) + (wy[k+m]*(1-fx)+wy[k+m+1]*fx)*fy;
      const u0 = i/(n-1)-.5, v0 = j/(n-1)-.5, u = u0*rc0-v0*rs0, v = u0*rs0+v0*rc0;
      const wu = u+warp*qx, wv = v+warp*qy;
      const r = Math.hypot(wu,wv), th = Math.atan2(v,u);
      const lobe = .5+.5*HN(Math.cos(th)*1.4, Math.sin(th)*1.4, z*.5+40);
      const rcB = .335+.03*lobe, bw = P.spread*(.55+1.1*lobe);
      const band = Math.exp(-(((r-rcB)/bw)**2));
      if (band < .02) { vals[j*n+i] = .18*fbm(wu*P.scale, wv*P.scale, z+3.7, 2)-.04; continue; }
      const detail = fbm(wu*P.scale, wv*P.scale, z+3.7, 4);
      vals[j*n+i] = band*(.35+.85*lobe)*(.55+.9*(detail+.5)) + .18*detail - .04;
    }
  }
  return vals;
}
function haloContours(vals, n, bt, density = HALO.density) {
  const P = HALO, step = 1/(n-1), buckets = [[],[],[],[]], f = v => (v*P.K).toFixed(1);
  for (let L = 0; L < P.layers; L++) {
    const lv = density + L*.13, lerp = (a,b) => (lv-a)/(b-a);
    for (let j = 0; j < n-1; j++) for (let i = 0; i < n-1; i++) {
      const a = vals[j*n+i], b = vals[j*n+i+1], c = vals[(j+1)*n+i+1], d = vals[(j+1)*n+i];
      const k = (a>lv?8:0)|(b>lv?4:0)|(c>lv?2:0)|(d>lv?1:0);
      if (k === 0 || k === 15) continue;
      const x = i*step-.5, y = j*step-.5;
      const T=[x+lerp(a,b)*step,y], R=[x+step,y+lerp(b,c)*step], B=[x+lerp(d,c)*step,y+step], Lf=[x,y+lerp(a,d)*step];
      const segs = ({1:[Lf,B],14:[Lf,B],2:[B,R],13:[B,R],3:[Lf,R],12:[Lf,R],4:[T,R],11:[T,R],5:[Lf,T,B,R],6:[T,B],9:[T,B],7:[Lf,T],8:[Lf,T],10:[T,R,Lf,B]})[k];
      const pr = .5+.5*HN((x+.5)*9, (y+.5)*9, 77+bt*3.1);
      const bk = buckets[Math.min(3, Math.floor(pr*4))];
      for (let s2 = 0; s2 < segs.length; s2 += 2) bk.push(`M${f(segs[s2][0])} ${f(segs[s2][1])}L${f(segs[s2+1][0])} ${f(segs[s2+1][1])}`);
    }
  }
  return buckets.map(b => b.join(''));
}
const HALO_CACHE = new Map();
function haloAt(t, T, o) {
  const capture = document.body.classList.contains('capture');
  const n = t == null || capture ? 200 : 120;
  const key = (t == null ? `still/${n}` : `${t.toFixed(4)}/${T}/${n}`) + (o ? `/${o.z.toFixed(4)}/${o.warp.toFixed(3)}/${o.density.toFixed(3)}` : '');
  if (HALO_CACHE.has(key)) return HALO_CACHE.get(key);
  let d;
  if (o) d = haloContours(haloField(n, o.z, o.warp), n, Math.floor((t ?? 0) / HALO.boil) % 97, o.density);
  else if (t == null) d = haloContours(haloField(n, 0), n, 0);
  else {
    const a = clamp(t / T), A = haloField(n, t * HALO.speed), B = haloField(n, (t - T) * HALO.speed);
    for (let i = 0; i < A.length; i++) A[i] = A[i] * (1 - a) + B[i] * a;
    d = haloContours(A, n, Math.floor(t / HALO.boil) % 97);
  }
  if (HALO_CACHE.size > 8) HALO_CACHE.clear();
  HALO_CACHE.set(key, d);
  return d;
}

const BD_R = 130;
const nodeXY = i => { const a = rad(i * 45 - 90); return [Math.cos(a) * BD_R, Math.sin(a) * BD_R]; };
const BD_TAPS = [
  { at: 0.30, node: 2, layer: 'nodes' },
  { at: 1.30, node: 5, layer: 'nodes' },
  { at: 2.30, centre: 0, layer: 'core' },
  { at: 3.00, centre: 1, layer: 'core' },
  { at: 3.60, centre: 2, layer: 'core' },
];

/* ─────────────────────────────────────────────────────────────
   BOIDS: a deterministic, seeded, fixed-step 3D flock. Plain {x,y,z}
   objects, not THREE.Vector3 — the physics doesn't need THREE at all,
   only the rendering does, so the sim can start stepping (and the
   piece can register) before the three.js module has even loaded.
   ───────────────────────────────────────────────────────────── */
const BOID = {
  count: 80, ringR: 7.5, radialK: 1.7, perception: 4.2, lineDist: 2.0, maxLines: 420,
  maxSpeed: 3.0, maxForce: 4.6, wSep: 2.4, wAli: 0.9, wCoh: 0.45, wSeek: 2.8,
  dt: 1 / 60, seed: 7781, trailLen: 16,
};
// three.js is Y-up, the SVG dial is Y-down — flip Y so a node lines up on screen with its dial node
function node3D(i) { const a = rad(i * 45 - 90); return { x: Math.cos(a) * BOID.ringR, y: -Math.sin(a) * BOID.ringR, z: 0 }; }

function makeBoidSim() {
  const rng = mulberry32(BOID.seed);
  const boids = Array.from({ length: BOID.count }, () => {
    // seed on the shell sphere itself (standard random-point-on-sphere), not a cube — so frame 0
    // already reads as a globe instead of spreading out from a block
    const th = Math.acos(2 * rng() - 1), ph = 2 * Math.PI * rng(), r = BOID.ringR * (0.9 + 0.2 * rng());
    const pos = { x: r * Math.sin(th) * Math.cos(ph), y: r * Math.sin(th) * Math.sin(ph), z: r * Math.cos(th) };
    const vx = rng() - .5, vy = rng() - .5, vz = rng() - .5, len = Math.hypot(vx, vy, vz) || 1, s = BOID.maxSpeed * .4 / len;
    const trail = new Float32Array(BOID.trailLen * 3);
    for (let k = 0; k < BOID.trailLen; k++) { trail[k*3]=pos.x; trail[k*3+1]=pos.y; trail[k*3+2]=pos.z; }
    return { pos, vel: { x: vx * s, y: vy * s, z: vz * s }, trail, trailHead: 0 };
  });
  return { step: 0, boids, lineN: 0, lines: new Float32Array(BOID.maxLines * 6) };
}
function stepBoids(sim, targetIdx) {
  const target = targetIdx == null ? null : node3D(targetIdx);
  const { boids } = sim, n = boids.length;
  const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
  let lineN = 0;
  const steer = (dx, dy, dz, vx, vy, vz, w, out) => {
    let len = Math.hypot(dx, dy, dz);
    if (!len) return;
    const k = BOID.maxSpeed / len; dx = dx * k - vx; dy = dy * k - vy; dz = dz * k - vz;
    let fl = Math.hypot(dx, dy, dz);
    if (fl > BOID.maxForce) { const fk = BOID.maxForce / fl; dx *= fk; dy *= fk; dz *= fk; }
    out.x += dx * w; out.y += dy * w; out.z += dz * w;
  };
  for (let i = 0; i < n; i++) {
    const b = boids[i];
    let sepx=0,sepy=0,sepz=0, alix=0,aliy=0,aliz=0, cohx=0,cohy=0,cohz=0, cnt=0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = boids[j];
      const dx = b.pos.x - o.pos.x, dy = b.pos.y - o.pos.y, dz = b.pos.z - o.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 0 && d < BOID.perception) {
        const inv = 1 / (d * d);
        sepx += dx * inv; sepy += dy * inv; sepz += dz * inv;
        alix += o.vel.x; aliy += o.vel.y; aliz += o.vel.z;
        cohx += o.pos.x; cohy += o.pos.y; cohz += o.pos.z; cnt++;
      }
      if (j > i && d > 0 && d < BOID.lineDist && lineN < BOID.maxLines) {
        const k = lineN++ * 6;
        sim.lines[k]=b.pos.x; sim.lines[k+1]=b.pos.y; sim.lines[k+2]=b.pos.z;
        sim.lines[k+3]=o.pos.x; sim.lines[k+4]=o.pos.y; sim.lines[k+5]=o.pos.z;
      }
    }
    const out = { x: 0, y: 0, z: 0 };
    if (cnt > 0) {
      steer(sepx, sepy, sepz, b.vel.x, b.vel.y, b.vel.z, BOID.wSep, out);
      steer(alix/cnt, aliy/cnt, aliz/cnt, b.vel.x, b.vel.y, b.vel.z, BOID.wAli, out);
      steer(cohx/cnt-b.pos.x, cohy/cnt-b.pos.y, cohz/cnt-b.pos.z, b.vel.x, b.vel.y, b.vel.z, BOID.wCoh, out);
    }
    if (target) steer(target.x-b.pos.x, target.y-b.pos.y, target.z-b.pos.z, b.vel.x, b.vel.y, b.vel.z, BOID.wSeek, out);
    // radial spring toward the shell radius, not a box — this is what keeps the flock a sphere
    // instead of a cloud, while separation/alignment/cohesion/seek still move boids freely across it
    const r = Math.hypot(b.pos.x, b.pos.y, b.pos.z) || 1, pull = (BOID.ringR - r) * BOID.radialK;
    out.x += (b.pos.x / r) * pull; out.y += (b.pos.y / r) * pull; out.z += (b.pos.z / r) * pull;
    ax[i] = out.x; ay[i] = out.y; az[i] = out.z;
  }
  for (let i = 0; i < n; i++) {
    const b = boids[i];
    b.vel.x += ax[i] * BOID.dt; b.vel.y += ay[i] * BOID.dt; b.vel.z += az[i] * BOID.dt;
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    if (sp > BOID.maxSpeed) { const k = BOID.maxSpeed / sp; b.vel.x *= k; b.vel.y *= k; b.vel.z *= k; }
    b.pos.x += b.vel.x * BOID.dt; b.pos.y += b.vel.y * BOID.dt; b.pos.z += b.vel.z * BOID.dt;
    b.trail[b.trailHead*3] = b.pos.x; b.trail[b.trailHead*3+1] = b.pos.y; b.trail[b.trailHead*3+2] = b.pos.z;
    b.trailHead = (b.trailHead + 1) % BOID.trailLen;
  }
  sim.step++;
  sim.lineN = lineN;
}
// advance (or, on a backward jump, reset and replay) sim to targetStep, using targetIdx throughout
function simAt(sim, targetIdx, targetStep) {
  if (targetStep < sim.step) { const fresh = makeBoidSim(); sim.step = fresh.step; sim.boids = fresh.boids; }
  while (sim.step < targetStep) stepBoids(sim, targetIdx);
}

/* ─────────────────────────────────────────────────────────────
   three.js side: an offscreen scene rendered to a small canvas and
   read back as a PNG data URL, embedded as the 'boids' layer's
   <image>. Lazily built once THREE has loaded.
   ───────────────────────────────────────────────────────────── */
let renderer3D = null, scene3D = null, camera3D = null, points3D = null, pointsGeo3D = null, pointsPos3D = null;
let lines3D = null, linesGeo3D = null, coreSphere3D = null, grid3D = null, trails3D = null, trailsGeo3D = null, trailsPos3D = null, trailsCol3D = null;
const RES = 440; // offscreen render resolution — small on purpose, this runs every frame

// concentric latitude rings + radiating longitude meridians — a clean graticule, not a triangulated
// wireframe sphere, so it reads as a grid rather than a mesh
function buildPolarGrid(R, latCount, lonCount, seg) {
  const pos = [];
  for (let l = 1; l < latCount; l++) {
    const phi = Math.PI * l / latCount, ringR = R * Math.sin(phi), y = R * Math.cos(phi);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      pos.push(Math.cos(a0)*ringR, y, Math.sin(a0)*ringR, Math.cos(a1)*ringR, y, Math.sin(a1)*ringR);
    }
  }
  for (let m = 0; m < lonCount; m++) {
    const a = m / lonCount * Math.PI * 2;
    for (let i = 0; i < seg; i++) {
      const p0 = Math.PI * i / seg, p1 = Math.PI * (i + 1) / seg;
      pos.push(Math.sin(p0)*R*Math.cos(a), R*Math.cos(p0), Math.sin(p0)*R*Math.sin(a),
                Math.sin(p1)*R*Math.cos(a), R*Math.cos(p1), Math.sin(p1)*R*Math.sin(a));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xece8de, transparent: true, opacity: 0.16, fog: true }));
}

function threeReady() {
  const canvas = document.createElement('canvas'); // detached: never appended, WebGL still works
  renderer3D = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer3D.setSize(RES, RES, false);
  scene3D = new THREE.Scene();
  scene3D.background = new THREE.Color(0x161618);
  scene3D.fog = new THREE.FogExp2(0x161618, 0.024);
  camera3D = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

  pointsPos3D = new Float32Array(BOID.count * 3);
  pointsGeo3D = new THREE.BufferGeometry();
  pointsGeo3D.setAttribute('position', new THREE.BufferAttribute(pointsPos3D, 3));
  points3D = new THREE.Points(pointsGeo3D, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: true }));
  scene3D.add(points3D);

  linesGeo3D = new THREE.BufferGeometry();
  linesGeo3D.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOID.maxLines * 6), 3));
  lines3D = new THREE.LineSegments(linesGeo3D, new THREE.LineBasicMaterial({ color: 0xece8de, transparent: true, opacity: 0.12, fog: true }));
  scene3D.add(lines3D);

  grid3D = buildPolarGrid(BOID.ringR, 6, 12, 48);
  scene3D.add(grid3D);

  // trails: one LineSegments buffer holding every boid's last BOID.trailLen points, colour fading
  // from the shell-grid ink tone (old) to white (newest) along each trail
  const segsPerBoid = BOID.trailLen - 1;
  trailsPos3D = new Float32Array(BOID.count * segsPerBoid * 2 * 3);
  trailsCol3D = new Float32Array(BOID.count * segsPerBoid * 2 * 3);
  trailsGeo3D = new THREE.BufferGeometry();
  trailsGeo3D.setAttribute('position', new THREE.BufferAttribute(trailsPos3D, 3));
  trailsGeo3D.setAttribute('color', new THREE.BufferAttribute(trailsCol3D, 3));
  trails3D = new THREE.LineSegments(trailsGeo3D, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, fog: true }));
  scene3D.add(trails3D);

  const fresnelShader = {
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 u_color; uniform float u_fresnelPower; uniform float u_opacity;
      varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - dot(normalize(vV), vN), u_fresnelPower); gl_FragColor = vec4(mix(u_color, vec3(1.0), f), u_opacity); }`,
  };
  coreSphere3D = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 32, 32),
    new THREE.ShaderMaterial({
      vertexShader: fresnelShader.vertexShader, fragmentShader: fresnelShader.fragmentShader,
      uniforms: { u_color: { value: new THREE.Color(0xe8b04a) }, u_fresnelPower: { value: 4.2 }, u_opacity: { value: 0.85 } },
      transparent: true,
    })
  );
  scene3D.add(coreSphere3D);
}

// render sim's current state to the offscreen canvas and return a PNG data URL
function renderBoidFrame(sim, t, active) {
  for (let i = 0; i < BOID.count; i++) {
    const b = sim.boids[i];
    pointsPos3D[i*3] = b.pos.x; pointsPos3D[i*3+1] = b.pos.y; pointsPos3D[i*3+2] = b.pos.z;
  }
  pointsGeo3D.attributes.position.needsUpdate = true;
  linesGeo3D.attributes.position.array.set(sim.lines.subarray(0, sim.lineN * 6));
  linesGeo3D.setDrawRange(0, sim.lineN * 2);
  linesGeo3D.attributes.position.needsUpdate = true;

  // trails: walk each boid's ring buffer oldest → newest, fading colour along the way
  const segsPerBoid = BOID.trailLen - 1;
  let p = 0, c = 0;
  for (let i = 0; i < BOID.count; i++) {
    const b = sim.boids[i];
    for (let k = 0; k < segsPerBoid; k++) {
      const iA = (b.trailHead + k) % BOID.trailLen, iB = (b.trailHead + k + 1) % BOID.trailLen;
      const fA = k / segsPerBoid, fB = (k + 1) / segsPerBoid;
      trailsPos3D[p] = b.trail[iA*3]; trailsPos3D[p+1] = b.trail[iA*3+1]; trailsPos3D[p+2] = b.trail[iA*3+2]; p += 3;
      trailsPos3D[p] = b.trail[iB*3]; trailsPos3D[p+1] = b.trail[iB*3+1]; trailsPos3D[p+2] = b.trail[iB*3+2]; p += 3;
      trailsCol3D[c] = 0.12 + 0.88*fA; trailsCol3D[c+1] = 0.12 + 0.88*fA; trailsCol3D[c+2] = 0.14 + 0.86*fA; c += 3;
      trailsCol3D[c] = 0.12 + 0.88*fB; trailsCol3D[c+1] = 0.12 + 0.88*fB; trailsCol3D[c+2] = 0.14 + 0.86*fB; c += 3;
    }
  }
  trailsGeo3D.attributes.position.needsUpdate = true;
  trailsGeo3D.attributes.color.needsUpdate = true;

  const sa = t * 0.09;
  camera3D.position.set(Math.sin(sa) * 3.4, 2.2 + Math.sin(sa * 0.7) * 1, BOID.ringR * 2.3);
  camera3D.lookAt(0, 0, 0);
  coreSphere3D.rotation.y = t * 0.3;
  coreSphere3D.rotation.x = t * 0.11;
  coreSphere3D.material.uniforms.u_color.value.set(active == null ? 0xe8b04a : 0xece8de);
  grid3D.rotation.y = t * 0.025;

  renderer3D.render(scene3D, camera3D);
  return renderer3D.domElement.toDataURL('image/png');
}

/* ─────────────────────────────────────────────────────────────
   the piece
   ───────────────────────────────────────────────────────────── */
registerPiece({
  id: 'murmuration-rosette',
  code: 'MUR-12', series: 'B', n: '12',
  name: 'MURMURATION ROSETTE',
  mechanic: 'RADIAL MENU · CALLS A 3D FLOCK',
  source: 'COMPONENTS/INTERACTION/MURMURATION-ROSETTE',
  hero: { v: '8', u: 'NODES · 45° APART' },
  extent: 280,
  spec: [
    ['INPUT', 'TAP CENTRE · TAP NODE'],
    ['FLOCK', `${BOID.count} BOIDS · SEPARATION/ALIGNMENT/COHESION`],
    ['MOTION', 'SPRINGS 70/10 · 48/8 · SEEDED FIXED-STEP SIM'],
    ['BUILT', 'DOM · SVG · THREE.JS · ANIME.JS 4 · SIMPLEX HALO'],
  ],
  layers: [
    { id: 'boids', name: 'BOID FIELD', note: `${BOID.count} BOIDS · CALLED TO THE ACTIVE NODE`, edge: 280 },
    { id: 'decor', name: 'DECOR RINGS', note: 'Ø420 · Ø560 · STATIC', edge: 280 },
    { id: 'halo',  name: 'GRAPHITE HALO', note: 'NOISE ISOLINES · 3 LV', edge: 290 },
    { id: 'ticks', name: 'TICK RING',   note: '50 × 7.2° · 48/8', edge: 170 },
    { id: 'nodes', name: 'NODE RING',   note: '8 × 45° · R130', edge: 156 },
    { id: 'core',  name: 'CENTRE',      note: 'SCALE .15 · .55 · 1', edge: 36 },
    { id: 'input', name: 'INPUT',       note: 'TOUCH · HIT TEST', edge: 300 },
  ],
  callouts: [
    { at: [Math.cos(rad(-55)) * 280, Math.sin(rad(-55)) * 280], title: 'BOID FIELD', note: `${BOID.count} BOIDS · FIXED-STEP SIM` },
    { at: [Math.cos(rad(-70)) * 280, Math.sin(rad(-70)) * 280], title: 'DECOR', note: 'Ø420 · Ø560' },
    { at: [Math.cos(rad(-28)) * 232, Math.sin(rad(-28)) * 232], title: 'GRAPHITE HALO', note: 'NOISE ISOLINES · 3 LEVELS' },
    { at: nodeXY(1),                 title: 'NODE RING',   note: '8 × 45° · R130 · FLOCK ATTRACTOR' },
    { at: nodeXY(2),                 title: 'ACTIVE NODE', note: 'FILL = SELECTED · CALLS THE FLOCK' },
    { at: [Math.cos(rad(22.5)) * 36, Math.sin(rad(22.5)) * 36], title: 'CENTRE', note: 'TAP TO STEP 0 → 1 → 2' },
    { at: [Math.cos(rad(70)) * 165, Math.sin(rad(70)) * 165], title: 'TICK RING', note: 'SPRINGS TO THE CHOICE' },
  ],
  taps: BD_TAPS,
  specU: 0.95,

  controls: [
    { id: 'node',    label: 'NODE',    kind: 'knob',   min: 0,  max: 7,   value: 0,             fmt: v => `0${Math.round(v) + 1} ${BD_LABELS[Math.round(v)]}` },
    { id: 'density', label: 'DENSITY', kind: 'slider', min: .2, max: .9,  value: HALO.density,  fmt: v => `${(v * 100).toFixed(0).padStart(2, '0')}%` },
    { id: 'warp',    label: 'WARP',    kind: 'slider', min: 0,  max: .25, value: HALO.warp,     fmt: v => v.toFixed(3) },
    { id: 'morph',   label: 'MORPH',   kind: 'knob',   min: 0,  max: 3,   value: 1,             fmt: v => `×${v.toFixed(2)}` },
  ],
  story: {
    tweaks: [
      { id: 'node',    to: 5 },
      { id: 'density', to: .25 },
      { id: 'warp',    to: .23 },
      { id: 'morph',   to: 2.6 },
    ],
  },
  exploded: { live: 4.4, poseEnd: 7 },
  assembly: {
    seeds: [[0, 0], ...Array.from({ length: 8 }, (_, i) => nodeXY(i))],
    live: 2.8,
    end: 3.3,
    draw: t => ({
      t,
      decor: [dOn(t, .7, 1.7) * dOff(t, 6.3, 7.1), dOn(t, .9, 1.9) * dOff(t, 6.2, 7.0)],
      ticks: Array.from({ length: 50 }, (_, i) => {
        const a = .9 + stag(i, 50, 1.1 / 50), b = 6.0 + stag(49 - i, 50, .9 / 50);
        return dOn(t, a, a + .35) * dOff(t, b, b + .35);
      }),
      nodes: Array.from({ length: 8 }, (_, i) => dOn(t, 1.3 + stag(i, 8, .07), 1.9 + stag(i, 8, .07))),
      icons: Array.from({ length: 8 }, (_, i) => dOn(t, 1.9 + stag(i, 8, .06), 2.5 + stag(i, 8, .06))),
      halo: dOn(t, 1.2, 2.6) * dOff(t, 6.0, 6.9),
      core: dOn(t, 1.0, 1.7) * dOff(t, 6.7, 7.3),
      coreIcon: dOn(t, 1.6, 2.3) * dOff(t, 6.6, 7.1),
    }),
  },

  build(L, sw) {
    const h = {};
    h.sim = makeBoidSim();
    // the boids layer: a single <image>, square, centred on the piece's own coordinate system
    // (-extent..extent) so it scales and transforms exactly like every other layer
    const E = this.extent;
    h.img3d = el('image', { x: -E, y: -E, width: 2 * E, height: 2 * E, preserveAspectRatio: 'xMidYMid slice', opacity: THREE ? 1 : 0 }, L.boids);

    h.decor = [210, 280].map((r, i) => drawable(el('circle', { r, fill: 'none', class: i ? 'minor' : 'mid', 'stroke-width': sw.minor }, L.decor)));
    const mid = `halo-mask-${Math.random().toString(36).slice(2, 8)}`;
    const mask = el('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: -400, y: -400, width: 800, height: 800 }, L.halo);
    h.haloSweep = drawable(el('circle', { r: 235, fill: 'none', stroke: '#fff', 'stroke-width': 114, transform: 'rotate(-90)' }, mask));
    h.halo = el('g', { mask: `url(#${mid})`, 'stroke-linecap': 'round', fill: 'none' }, L.halo);
    const alphas = [.35, .6, .8, .95];
    h.haloPaths = alphas.map(al => [
      el('path', { class: 'ink', 'stroke-width': sw.minor * 2.6, opacity: al * .1 }, h.halo),
      el('path', { class: 'mid', 'stroke-width': sw.minor * .85, opacity: al }, h.halo),
    ]);
    h.haloKey = null;
    h.rotor = el('g', {}, L.ticks);
    h.ticks = [];
    for (let i = 0; i < 50; i++) {
      const a = rad(i * 7.2 - 90);
      h.ticks.push(el('line', {
        x1: Math.cos(a) * 160, y1: Math.sin(a) * 160, x2: Math.cos(a) * 170, y2: Math.sin(a) * 170,
        class: i === 0 ? 'ink' : 'mid', 'stroke-width': i === 0 ? sw.main : sw.minor,
      }, h.rotor));
    }
    h.nodes = BD_GLYPHS.map((gl, i) => {
      const [x, y] = nodeXY(i);
      const g = el('g', { transform: `translate(${x} ${y})` }, L.nodes);
      const inner = el('g', {}, g);
      const disc = el('circle', { r: 26, class: 'disc' }, inner);
      const ring = drawable(el('circle', { r: 26, fill: 'none', class: 'ink', 'stroke-width': sw.main }, inner));
      const glyph = el('text', {
        x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        style: "font-family:'Stray Robotalk'", 'font-size': 21, class: 'icondot',
      }, inner);
      glyph.textContent = gl;
      glyph.dot = true;
      return { g, inner, disc, ring, parts: [glyph] };
    });
    h.coreG = el('g', {}, L.core);
    el('circle', { r: 36, class: 'disc' }, h.coreG);
    h.coreRing = drawable(el('circle', { r: 36, fill: 'none', class: 'ink', 'stroke-width': sw.main }, h.coreG));
    h.coreIcon = [
      el('circle', { r: 10, fill: 'none', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
      el('circle', { r: 3.5, fill: 'none', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
      el('path', { d: 'M0 -13 V-7 M0 7 V13 M-13 0 H-7 M7 0 H13', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
    ].map(drawable);
    return h;
  },

  pose(u, ctl) {
    if (ctl) {
      const DT = 1 / 120, i = Math.round(ctl.v.node);
      let k = 0, prev = null, tick = 360 - i * 45, pick = -1;
      ctl.integ(c => {
        const t = (k++ + .5) * DT, j = Math.round(c.node);
        if (prev == null) tick = 360 - j * 45;
        else if (j !== prev) {
          const d = ((-(j - prev) * 45 + 180) % 360 + 360) % 360 - 180;
          tick += d * springStep(u - t, 48, 8);
          pick = t;
        }
        prev = j;
        return 0;
      });
      const pop = pick < 0 ? 0 : .14 * Math.sin(Math.PI * win(u, pick, pick + .32));
      return {
        tick, btn: 1, active: i,
        nodes: Array.from({ length: 8 }, (_, n) => n === i ? 1 + pop : 1),
        halo: { z: ctl.integ(c => HALO.speed * c.morph), warp: ctl.v.warp, density: ctl.v.density },
      };
    }
    const T = this.taps;
    const tickSteps = [], btnSteps = [];
    let tick = 360, active = null;
    let fold = null, bloom = null;
    for (const tp of T) {
      if (tp.node != null) {
        let target = 360 - tp.node * 45;
        target = tick + (((target - tick + 180) % 360 + 360) % 360 - 180);
        tickSteps.push({ at: tp.at, to: target, k: 48, c: 8 });
        tick = target;
        if (u >= tp.at) active = tp.node;
      } else {
        const st = tp.centre;
        const target = [0, 180, 360][st];
        const to = tick + (((target - tick + 180) % 360 + 360) % 360 - 180);
        tickSteps.push({ at: tp.at, to, k: 48, c: 8 });
        tick = to;
        btnSteps.push({ at: tp.at, to: [0.15, 0.55, 1][st], k: 70, c: 10 });
        if (st === 0) { fold = tp.at; if (u >= tp.at) active = null; }
        if (st === 2) bloom = tp.at;
      }
    }
    const nodes = [];
    for (let i = 0; i < 8; i++) {
      let v = 1;
      if (fold != null && u >= fold) v = 1 - oq(win(u, fold + .018 * (7 - i), fold + .018 * (7 - i) + .2));
      if (bloom != null && u >= bloom) {
        const d = .035 * Math.abs(i - 3.5);
        v = clamp(springStep(u - bloom - d, 90, 12), 0, 1.2);
      }
      nodes.push(v);
    }
    return { tick: sprung(360, tickSteps, u), btn: sprung(1, btnSteps, u), nodes, active };
  },

  finger(u) {
    const T = this.taps;
    const pt = tp => tp.node != null ? nodeXY(tp.node) : [0, 0];
    let from = [210, 230], prevAt = -0.6;
    for (const tp of T) {
      const to = pt(tp);
      const a = Math.max(prevAt + .12, tp.at - .5), b = tp.at - .04;
      if (u < b) {
        const k = io(win(u, a, b));
        return { x: lerp(from[0], to[0], k), y: lerp(from[1], to[1], k), pulse: null };
      }
      if (u < tp.at + .5) return { x: to[0], y: to[1], pulse: win(u, tp.at, tp.at + .5), tap: tp };
      from = to; prevAt = tp.at;
    }
    return { x: from[0], y: from[1], pulse: null };
  },

  apply(h, p, draw) {
    h.rotor.setAttribute('transform', `rotate(${p.tick})`);
    h.halo.setAttribute('transform', `rotate(${14 * Math.sin(rad(p.tick))})`);
    const haloOn = !draw || (draw.halo ?? 1) > 0;
    const o = p.halo;
    const key = (p.t == null ? 'still' : p.t.toFixed(4)) + (o ? `/${o.z.toFixed(4)}/${o.warp.toFixed(3)}/${o.density.toFixed(3)}` : '');
    if (haloOn && key !== h.haloKey) {
      haloAt(p.t, p.T, o).forEach((d, i) => h.haloPaths[i].forEach(pa => pa.setAttribute('d', d)));
      h.haloKey = key;
    }
    h.coreG.setAttribute('transform', `scale(${p.btn})`);
    h.nodes.forEach((n, i) => {
      let v = p.nodes[i];
      if (p.halo && draw) v *= 1 - oq(win(draw.t, 6.2 + .018 * (7 - i), 6.4 + .018 * (7 - i)));
      n.inner.setAttribute('transform', `scale(${0.85 + 0.15 * v})`);
      n.g.setAttribute('opacity', clamp(v));
      n.g.classList.toggle('on', p.active === i);
    });
    if (!draw) draw = {};
    h.decor.forEach((c, i) => setDraw(c, draw.decor ? draw.decor[i] : 1));
    h.ticks.forEach((t, i) => t.setAttribute('opacity', draw.ticks ? draw.ticks[i] : 1));
    h.nodes.forEach((n, i) => {
      setDraw(n.ring, draw.nodes ? draw.nodes[i] : 1);
      n.disc.setAttribute('opacity', draw.nodes ? draw.nodes[i] : 1);
      n.parts.forEach(pp => pp.dot ? pp.setAttribute('opacity', draw.icons ? draw.icons[i] : 1) : setDraw(pp, draw.icons ? draw.icons[i] : 1));
    });
    setDraw(h.haloSweep, draw.halo ?? 1);
    setDraw(h.coreRing, draw.core ?? 1);
    h.coreIcon.forEach(c => setDraw(c, draw.coreIcon ?? 1));

    // ── the boids layer: step the deterministic sim up to p.t and re-embed the rendered frame.
    // p.t is undefined in SPEC (no clock there), so bake one still frame instead of animating.
    if (!THREE) return;
    h.img3d.setAttribute('opacity', 1);
    if (p.t == null) {
      if (!h.boidsBaked) {
        simAt(h.sim, p.active, 180);
        h.img3d.setAttribute('href', renderBoidFrame(h.sim, 3, p.active));
        h.boidsBaked = true;
      }
      return;
    }
    const targetStep = Math.max(0, Math.floor(p.t * 60));
    simAt(h.sim, p.active, targetStep);
    h.img3d.setAttribute('href', renderBoidFrame(h.sim, p.t, p.active));
  },
});
})();
