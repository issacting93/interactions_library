/* INTERACTIONS — Radial city mesh-building engine.
   Extracted 2026-10-31 from tools/city-gen/Round City Generator.html so the ground-truth
   geometry builders (palette, materials, mashrabiya lattice screens, the courtyard/arm/dome/
   minaret/tree primitives, and the buildPiece()/buildModule() switch statements that turn one
   solved WFC cell into a THREE.Group) can be reused by another scene without dragging along
   Round City Generator's own renderer, camera, DOM status text, or reveal animation — those
   stay in that file and now call into this module instead of a local copy.

   Deliberately NOT included here: buildCity() itself (owns `scene`/`cityRoot`/DOM status
   text — page wiring, not geometry) and the Naqsh ornament-overlay system (SLOT_DEFS/SLOTS/
   radialWarp/matsOf/applyOrnament — a UI feature layered on top of these materials after the
   fact, not needed to place a city in a scene).

   Depends on shared/city/city-wfc.js being loaded first (reads STREET_KINDS/STOREY_H/groundTop from
   window.CityWFC) and on THREE being loaded first. Classic script (not a module), works from
   file://. Load order:
     <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
     <script src="../../shared/city/city-wfc.js"></script>
     <script src="../../shared/city/city-mesh-engine.js"></script>
     (then your own script that reads window.CityMesh)
*/
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const { STREET_KINDS, STOREY_H, groundTop } = CityWFC;

  // ---------- palette (scene materials are fixed; a consumer's UI can follow its own theme) ----------
  const C = {
    adobe: 0xdcc29a, adobeDark: 0xc6a77c, adobeLight: 0xeadbbb, plaster: 0xf2ead8,
    brick: 0xbd8a5f, brickDark: 0x9d6c48, paving: 0xbfae90, avenue: 0xe3b660, plaza: 0xf1e8d6,
    lapis: 0x2a4ea3, turq: 0x2aa39b, green: 0x3f8f6b, gold: 0xd8a441, ink: 0x2a2c38,
    water: 0x3d9cc6, grass: 0x84a85e, cypress: 0x2f5b3e, fruit: 0x6f9a4a, trunk: 0x6b4a2f,
    wall: 0xc9a06c, wallTop: 0xb48c5b, desert: 0xbfae8c, kerb: 0xd8ccb2,
  };

const G = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0),
  oct: new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0),
  hemi: new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  cone: new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0),
};
const matCache = {};
function M(hex, rough = 0.9) {
  const k = hex + '|' + rough;
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
}
const GLAZE = hex => M(hex, 0.35);
const WATER = new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.15, metalness: 0.1, emissive: 0x1d6a8a, emissiveIntensity: 0.25 });

// ---------- mashrabiya lattice screens (carved window grilles) ----------
// Same chord-star construction as the karbandi generator: n points on a
// circle, every i connected to i+k. Drawn in white on black so the texture
// can sit in a material's alphaMap — the star becomes the solid wood/stone
// members, the gaps between chords become the carved-through openings.
const LATTICE_VARIANTS = [[8, 3], [9, 2], [9, 4], [10, 3], [12, 5], [16, 6], [7, 2], [11, 4]];
const latticeCache = new Map();
function latticeTexture(n, k) {
  const key = n + '/' + k;
  if (latticeCache.has(key)) return latticeCache.get(key);
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2, R = s * 0.46;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineJoin = 'round';
  x.lineWidth = s * 0.05;
  x.beginPath();
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + k) % n]; x.moveTo(x1, y1); x.lineTo(x2, y2); }
  x.stroke();
  x.beginPath(); x.arc(cx, cy, R * 0.16, 0, TAU); x.fill();
  x.lineWidth = s * 0.055;
  x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  latticeCache.set(key, t);
  return t;
}
function latticeFor(rnd) {
  const [n, k] = LATTICE_VARIANTS[Math.floor(rnd() * LATTICE_VARIANTS.length)];
  return latticeTexture(n, k);
}
const screenMatCache = new Map();
function screenMat(tex, hex) {
  const key = tex.uuid + '|' + hex;
  if (screenMatCache.has(key)) return screenMatCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: hex, alphaMap: tex, alphaTest: 0.1, roughness: 0.85, side: THREE.DoubleSide });
  screenMatCache.set(key, m);
  return m;
}
// Pierced screen plane. (nx, nz) is the outward-facing normal in the cell's
// local frame; the plane is rotated so its face looks that way.
function screen(g, x, y, z, w, h, nx, nz, rnd, hex = C.adobeDark) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat(latticeFor(rnd), hex));
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.atan2(nx, nz);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Street- or arcade-facing walls of a courtyard footprint get a screen. gt is
// the ground tile (for its edge sockets), fp a 4-wall array from wallFP().
const WALL_SIDE = ['in', 'out', 'ccw', 'cw'];
const WALL_NORMAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function facadeScreens(g, fp, gt, h, rnd, hex) {
  fp.forEach((b, i) => {
    const side = WALL_SIDE[i];
    if (!(gt[side] === 'S' || gt[side] === 'M')) return;
    if (rnd() < 0.4) return;
    const [nx, nz] = WALL_NORMAL[i];
    const thick = Math.min(b.sx, b.sz), long = Math.max(b.sx, b.sz);
    const off = thick / 2 + 0.01;
    screen(g, b.x + nx * off, h * 0.5, b.z + nz * off, long * 0.6, h * 0.62, nx, nz, rnd, hex);
  });
}
function wallFP(D, Wd, t, x0 = 0) {
  return [
    { x: x0 - D / 2 + t / 2, z: 0, sx: t, sz: Wd },
    { x: x0 + D / 2 - t / 2, z: 0, sx: t, sz: Wd },
    { x: x0, z: -Wd / 2 + t / 2, sx: D - 2 * t, sz: t },
    { x: x0, z: Wd / 2 - t / 2, sx: D - 2 * t, sz: t },
  ];
}

function starTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  x.fillStyle = '#efe4cc'; x.fillRect(0, 0, s, s);
  function star(cx, cy, R) {
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 + Math.PI / 8;
      const rr = i % 2 ? R : R * 0.7654; // two overlapping squares → khatam
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath();
  }
  const pts = [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]];
  for (const [cx, cy] of pts) {
    star(cx, cy, s * 0.3); x.fillStyle = '#2f8f8a'; x.fill();
    x.lineWidth = 5; x.strokeStyle = '#26478f'; x.stroke();
    star(cx, cy, s * 0.15); x.fillStyle = '#d7a64a'; x.fill();
  }
  // cross-shaped interstitials
  for (const [cx, cy] of [[s / 2, 0], [0, s / 2], [s, s / 2], [s / 2, s]]) {
    x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
    x.fillStyle = '#c9b38a'; x.fillRect(-s * 0.06, -s * 0.06, s * 0.12, s * 0.12); x.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  t.anisotropy = 4;
  return t;
}
const PLAZA_MAT = new THREE.MeshStandardMaterial({ map: starTexture(), roughness: 0.75 });

// ---------- geometry helpers (cell-local frame: +x radial outward, +z increasing angle) ----------
function frameOf(cell) {
  if (cell.ring === 0) return { rm: 0, am: 0, depth: cell.r1 * 2, width: cell.r1 * 2, da: TAU };
  const rm = (cell.r0 + cell.r1) / 2, am = (cell.a0 + cell.a1) / 2;
  return { rm, am, depth: cell.r1 - cell.r0, width: rm * (cell.a1 - cell.a0), da: cell.a1 - cell.a0 };
}
function L(cell, r, a, y = 0) {
  const f = cell.f;
  const dx = r * Math.cos(a) - f.rm * Math.cos(f.am), dz = r * Math.sin(a) - f.rm * Math.sin(f.am);
  return new THREE.Vector3(dx * Math.cos(f.am) + dz * Math.sin(f.am), y, -dx * Math.sin(f.am) + dz * Math.cos(f.am));
}
function W(r, a, y = 0) { return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)); }

function add(g, geom, mat, x, y, z, sx, sy, sz, ry = 0) {
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m); return m;
}
function sectorSlab(cell, inset, depth, mat) {
  const { r0, r1, a0, a1 } = cell, s = new THREE.Shape();
  const ri = r0 + inset, ro = r1 - inset;
  const n = Math.max(4, Math.ceil((a1 - a0) * r1 / 0.2));
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + inset / ro + (a1 - a0 - 2 * inset / ro) * i / n; pts.push(L(cell, ro, a)); }
  for (let i = n; i >= 0; i--) { const a = a0 + inset / ri + (a1 - a0 - 2 * inset / ri) * i / n; pts.push(L(cell, ri, a)); }
  pts.forEach((p, i) => (i ? s.lineTo(p.x, -p.z) : s.moveTo(p.x, -p.z)));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}
function ribbon(g, pts, w, y, mat) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    pos.push(p.x - dz * w / 2, y, p.z + dx * w / 2, p.x + dz * w / 2, y, p.z - dx * w / 2);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.material.side = THREE.DoubleSide;
  m.receiveShadow = true;
  g.add(m); return m;
}
function arc(cell, r, aFrom, aTo, y, steps = 6) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(L(cell, r, aFrom + (aTo - aFrom) * i / steps, y));
  return pts;
}
function armPaths(cell, side) {
  const f = cell.f, { r0, r1, a0, a1, ring } = cell;
  const c = new THREE.Vector3(0, 0, 0);
  if (side === 'in') return [[c, L(cell, r0, f.am)]];
  if (side === 'cw') return [arc(cell, f.rm, f.am, a1, 0)];
  if (side === 'ccw') return [arc(cell, f.rm, f.am, a0, 0)];
  const paths = [[c, L(cell, r1, f.am)]];
  if (ring < RINGS.length - 1 && RINGS[ring + 1] > RINGS[ring]) paths.push(arc(cell, r1, f.am - f.da / 4, f.am + f.da / 4, 0, 4));
  return paths;
}
const ARM = {
  S: { w: 0.5, y: 0.108, mat: () => M(C.paving, 0.95) },
  M: { w: 0.56, y: 0.109, mat: () => M(C.brickDark) },
  c: { w: 0.16, y: 0.112, mat: () => WATER },
};
function arms(g, cell, t) {
  for (const side of ['in', 'out', 'cw', 'ccw']) {
    const lab = t[side], spec = ARM[lab];
    if (!spec) continue;
    let w = spec.w, mat = spec.mat();
    if (lab === 'S' && isAvenueCell(cell) && (side === 'in' || side === 'out')) { w = 0.7; mat = M(C.avenue, 0.95); }
    for (const path of armPaths(cell, side)) {
      if (lab !== 'c') ribbon(g, path, w + 0.2, 0.104, M(C.kerb, 0.95));
      ribbon(g, path, w, spec.y, mat);
    }
    if (lab === 'M') arcadeDomes(g, cell, side);
  }
}
function arcadeDomes(g, cell, side) {
  for (const path of armPaths(cell, side).slice(0, 1)) {
    const total = path.reduce((s, p, i) => s + (i ? p.distanceTo(path[i - 1]) : 0), 0);
    const n = Math.max(1, Math.round(total / 0.42));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n * total;
      let acc = 0;
      for (let i = 1; i < path.length; i++) {
        const seg = path[i].distanceTo(path[i - 1]);
        if (acc + seg >= u) {
          const p = path[i - 1].clone().lerp(path[i], (u - acc) / seg);
          const ang = Math.atan2(path[i].z - path[i - 1].z, path[i].x - path[i - 1].x);
          add(g, G.box, M(C.brick), p.x, 0.1, p.z, 0.4, 0.2, 0.58, -ang);
          add(g, G.hemi, M(C.adobeLight), p.x, 0.3, p.z, 0.17, 0.15, 0.17);
          break;
        }
        acc += seg;
      }
    }
  }
}

// ---------- piece builders ----------
function dome(g, x, y, z, r, mat, drum = true) {
  if (drum) add(g, G.cyl, M(C.adobeLight), x, y, z, r * 0.95, r * 0.4, r * 0.95);
  const top = y + (drum ? r * 0.4 : 0);
  add(g, G.hemi, mat, x, top, z, r, r * 1.12, r);
  add(g, G.cone, M(C.gold, 0.4), x, top + r * 1.08, z, r * 0.12, r * 0.4, r * 0.12);
}
function minaret(g, x, z, h, r = 0.09) {
  add(g, G.cyl, M(C.plaster), x, 0.1, z, r, h, r);
  add(g, G.cyl, M(C.adobeDark), x, 0.1 + h * 0.78, z, r * 1.6, h * 0.04, r * 1.6);
  add(g, G.cone, GLAZE(C.turq), x, 0.1 + h, z, r * 1.05, r * 3.2, r * 1.05);
}
function tree(g, x, z, rnd, kind) {
  if (kind === 'cypress' || (kind == null && rnd() < 0.45)) {
    add(g, G.cone, M(C.cypress), x, 0.1, z, 0.1, 0.62 + rnd() * 0.3, 0.1);
  } else {
    add(g, G.cyl, M(C.trunk), x, 0.1, z, 0.025, 0.2, 0.025);
    add(g, G.sphere, M(C.fruit), x, 0.38, z, 0.16, 0.14, 0.16);
  }
}
function badgir(g, x, z, base) {
  add(g, G.box, M(C.adobeDark), x, base, z, 0.12, 0.42, 0.12);
  add(g, G.box, M(C.adobe), x, base + 0.42, z, 0.15, 0.04, 0.15);
}
function courtyard(g, D, Wd, h, wallMat, x0 = 0) {
  const t = Math.min(D, Wd) * 0.24, fp = wallFP(D, Wd, t, x0);
  for (const b of fp) add(g, G.box, wallMat, b.x, 0.1, b.z, b.sx, h, b.sz);
  return { t, fp };
}
// corner lots sit outside the road and its pavement
function cornerBox(cell, su, sv) {
  const f = cell.f, h = isAvenueCell(cell) ? 0.47 : 0.37;
  const ld = Math.max(0, f.depth / 2 - h - 0.02), lw = Math.max(0, f.width / 2 - h - 0.02);
  return { x: su * (f.depth / 2 - 0.02 - ld / 2), z: sv * (f.width / 2 - 0.02 - lw / 2), sx: ld, sz: lw };
}
function corners(g, cell, zone, rnd) {
  const f = cell.f;
  for (const [su, sv] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const b = cornerBox(cell, su, sv), x = b.x, z = b.z, sx = b.sx, sz = b.sz;
    if (zone === 'garden') { tree(g, su * f.depth * 0.3, sv * f.width * 0.3, rnd); continue; }
    if (sx < 0.08 || sz < 0.08) continue;
    if (zone === 'wall') continue;
    const bazaar = zone === 'bazaar' || zone === 'sanctum';
    const h = bazaar ? 0.36 + rnd() * 0.14 : 0.4 + rnd() * 0.1;
    const tone = bazaar ? (rnd() < 0.5 ? C.brick : C.adobeDark) : [C.adobe, C.adobeLight, C.adobeDark][Math.floor(rnd() * 3)];
    add(g, G.box, M(tone), x, 0.1, z, sx, h, sz);
    if (bazaar && rnd() < 0.35) add(g, G.hemi, M(C.adobeLight), x, 0.1 + h, z, Math.min(sx, sz) * 0.35, Math.min(sx, sz) * 0.32, Math.min(sx, sz) * 0.35);
  }
}
const STREETISH = new Set(['avenue', 'chaharsu', 'chaharsu-t', 'chaharsu-o', 'arcade', 'arcade-end', 'avenue-h', 'lane', 'cross', 't-in', 't-out', 't-side', 'bend-in', 'bend-out', 'kucheh', 'kucheh-o', 'kucheh-s', 'qanat', 'garden-path', 'garden-end', 'garden-canal']);

function buildPiece(g, cell, t, rnd) {
  const f = cell.f, kind = t.base || t.id, D = f.depth, Wd = f.width;
  if (kind !== 'core' && cell.ring !== 1) arms(g, cell, t);
  else if (cell.ring === 1) arms(g, cell, t);
  if (STREETISH.has(kind)) corners(g, cell, cell.zone, rnd);
  switch (kind) {
    case 'core': {
      add(g, G.box, M(C.plaster), 0, 0.1, 0, 2.3, 0.55, 2.3);
      add(g, G.box, M(C.adobeLight), 0, 0.65, 0, 1.6, 0.25, 1.6);
      dome(g, 0, 0.9, 0, 0.82, GLAZE(C.green));
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) minaret(g, sx * 1.3, sz * 1.3, 2.5, 0.1);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, x = Math.cos(a) * 1.15, z = Math.sin(a) * 1.15;
        add(g, G.box, GLAZE(C.lapis), x, 0.1, z, 0.3, 1.0, 0.7, -a);
      }
      break;
    }
    case 'iwan': {
      const x = D * 0.3, w = Math.min(1.2, Wd * 0.45);
      add(g, G.box, GLAZE(C.lapis), x, 0.1, 0, 0.3, 1.25, w);
      add(g, G.box, M(C.ink, 1), x + 0.13, 0.1, 0, 0.06, 0.85, w * 0.5);
      add(g, G.box, M(C.gold, 0.5), x, 1.35, 0, 0.32, 0.06, w * 1.02);
      break;
    }
    case 'fountain':
      add(g, G.oct, M(C.adobeDark), 0, 0.1, 0, 0.55, 0.12, 0.55, Math.PI / 8);
      add(g, G.oct, WATER, 0, 0.11, 0, 0.47, 0.13, 0.47, Math.PI / 8);
      add(g, G.cyl, M(C.plaster), 0, 0.1, 0, 0.06, 0.4, 0.06);
      break;
    case 'minaret':
      add(g, G.oct, M(C.adobeDark), 0, 0.1, 0, 0.26, 0.5, 0.26, Math.PI / 8);
      break;
    case 'caravanserai': {
      const d = D * 0.82, w = Wd * 0.82;
      const { fp } = courtyard(g, d, w, 0.5, M(C.brick));
      facadeScreens(g, fp, t, 0.5, rnd, C.brickDark);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, G.cyl, M(C.brickDark), sx * d / 2, 0.1, sz * w / 2, 0.12, 0.62, 0.12);
      add(g, G.box, GLAZE(C.lapis), -d / 2, 0.1, 0, 0.12, 0.72, 0.4);
      add(g, G.box, M(C.paving), 0, 0.1, 0, d * 0.5, 0.02, w * 0.5);
      break;
    }
    case 'madrasa': {
      const d = D * 0.78, w = Wd * 0.78;
      const { fp } = courtyard(g, d, w, 0.55, M(C.adobeLight), 0.04);
      facadeScreens(g, fp, t, 0.55, rnd, C.lapis);
      add(g, G.box, GLAZE(C.lapis), -d / 2 + 0.04, 0.1, 0, 0.18, 0.9, Math.min(0.6, w * 0.4));
      dome(g, d / 2 - 0.2, 0.65, 0, 0.26, GLAZE(C.turq), false);
      add(g, G.box, WATER, 0.04, 0.1, 0, d * 0.25, 0.03, w * 0.2);
      break;
    }
    case 'house': {
      const d = D * 0.8, w = Wd * 0.8, h = 0.45 + rnd() * 0.05;
      const { fp } = courtyard(g, d, w, h, M(rnd() < 0.5 ? C.adobe : C.adobeLight));
      facadeScreens(g, fp, t, h, rnd, C.adobeDark);
      add(g, G.box, M(C.grass), 0, 0.1, 0, d * 0.45, 0.02, w * 0.45);
      add(g, G.box, WATER, 0, 0.1, 0, d * 0.16, 0.035, w * 0.16);
      break;
    }
    case 'hammam': {
      add(g, G.box, M(C.adobeDark), 0, 0.1, 0, D * 0.7, 0.32, Wd * 0.7);
      for (const z of [-0.28, 0, 0.28]) add(g, G.hemi, M(C.plaster, 0.6), 0, 0.42, z * Wd, 0.2, 0.18, 0.2);
      break;
    }
    case 'bayt-al-hikma': {
      const d = D * 0.74, w = Wd * 0.74;
      const { fp } = courtyard(g, d, w, 0.6, M(C.adobeLight));
      facadeScreens(g, fp, t, 0.6, rnd, C.lapis);
      dome(g, 0, 0.62, 0, 0.3, GLAZE(C.lapis), false);
      add(g, G.box, GLAZE(C.turq), -d / 2 + 0.05, 0.1, 0, 0.14, 0.95, Math.min(0.7, w * 0.42));
      break;
    }
    case 'bimaristan': {
      const d = D * 0.76, w = Wd * 0.76;
      const { fp } = courtyard(g, d, w, 0.5, M(C.plaster));
      facadeScreens(g, fp, t, 0.5, rnd, C.adobeDark);
      dome(g, d * 0.22, 0.52, 0, 0.22, M(C.adobeLight), false);
      add(g, G.box, WATER, 0, 0.1, 0, d * 0.2, 0.03, w * 0.18);
      break;
    }
    case 'masjid': {
      add(g, G.box, M(C.adobeLight), D * 0.12, 0.1, 0, D * 0.55, 0.42, Wd * 0.62);
      dome(g, D * 0.12, 0.52, 0, 0.26, GLAZE(C.turq), false);
      minaret(g, -D * 0.12, Wd * 0.27, 1.25, 0.06);
      break;
    }
    case 'ab-anbar': {
      dome(g, -D * 0.08, 0.1, 0, Math.min(0.46, Wd * 0.28), M(C.adobe), false);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = -D * 0.08 + sx * 0.5, z = sz * Math.min(0.5, Wd * 0.32);
        add(g, G.box, M(C.adobeDark), x, 0.1, z, 0.13, 0.95, 0.13);
      }
      break;
    }
    case 'orchard': {
      for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) tree(g, (i - 0.5) * D * 0.5, (k - 1) * Wd * 0.3, rnd);
      break;
    }
    case 'pool-garden': {
      ribbon(g, [new THREE.Vector3(-D * 0.4, 0, 0), new THREE.Vector3(D * 0.4, 0, 0)], 0.1, 0.112, WATER);
      ribbon(g, [new THREE.Vector3(0, 0, -Wd * 0.4), new THREE.Vector3(0, 0, Wd * 0.4)], 0.1, 0.112, WATER);
      add(g, G.oct, M(C.plaster), 0, 0.1, 0, 0.26, 0.05, 0.26, Math.PI / 8);
      add(g, G.oct, WATER, 0, 0.1, 0, 0.21, 0.06, 0.21, Math.PI / 8);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) tree(g, sx * D * 0.25, sz * Wd * 0.25, rnd, 'cypress');
      break;
    }
    case 'pavilion': {
      corners(g, cell, 'garden', rnd);
      add(g, G.box, M(C.plaster), 0, 0.1, 0, 0.6, 0.08, 0.6);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, G.cyl, M(C.adobeLight), sx * 0.24, 0.18, sz * 0.24, 0.03, 0.42, 0.03);
      add(g, G.box, M(C.adobeDark), 0, 0.6, 0, 0.62, 0.06, 0.62);
      dome(g, 0, 0.66, 0, 0.18, GLAZE(C.turq), false);
      break;
    }
    case 'wall': case 'tower': case 'gate': case 'inlet': {
      const thick = D * 0.72;
      if (kind !== 'gate') {
        add(g, G.box, M(C.wall), 0, 0.1, 0, thick, 0.95, Wd * 1.04);
        add(g, G.box, M(C.wallTop), 0, 1.05, 0, thick * 1.08, 0.08, Wd * 1.04);
      }
      if (kind === 'tower') {
        add(g, G.cyl, M(C.wall), D * 0.15, 0.1, 0, 0.42, 1.35, 0.42);
        add(g, G.cyl, M(C.wallTop), D * 0.15, 1.45, 0, 0.46, 0.08, 0.46);
      }
      if (kind === 'gate') {
        for (const s of [-1, 1]) {
          add(g, G.cyl, M(C.wall), 0, 0.1, s * 0.42, 0.3, 1.45, 0.3);
          add(g, G.box, M(C.wall), 0, 0.1, s * (Wd * 0.52 + 0.21), thick, 0.95, Math.max(0.05, Wd * 0.04 + 0.4 - 0.42));
        }
        add(g, G.box, M(C.wallTop), 0, 0.95, 0, thick, 0.4, 0.7);
        ribbon(g, [L(cell, cell.r1 - 0.05, f.am), L(cell, cell.r1 + 6, f.am)], 0.5, 0.012, M(C.paving, 1));
      }
      if (kind === 'inlet') {
        add(g, G.box, M(C.ink, 1), D * 0.37, 0.1, 0, 0.02, 0.3, 0.3);
        for (let k = 1; k <= 6; k++) {
          const p = L(cell, cell.r1 + k * 1.05, f.am);
          add(g, G.hemi, M(C.adobeDark), p.x, 0, p.z, 0.16, 0.1, 0.16);
        }
      }
      break;
    }
  }
}

// ---------- stacked modules (layers above the ground piece) ----------
function baseY(kind) {
  return { minaret: 0.6, tower: 1.53, 'ab-anbar': 1.05, wall: 1.13, inlet: 1.13, gate: 1.35 }[kind] || 0.6;
}
function footprint(cell, kind) {
  const f = cell.f, D = f.depth, Wd = f.width;
  if (STREET_KINDS.includes(kind)) {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([su, sv]) => cornerBox(cell, su, sv)).filter(b => b.sx >= 0.08 && b.sz >= 0.08);
  }
  const k = kind === 'caravanserai' ? 0.82 : 0.8, d = D * k, w = Wd * k, t = Math.min(d, w) * 0.24;
  return wallFP(d, w, t);
}
const biggest = fp => fp.reduce((a, b) => (b.sx * b.sz > a.sx * a.sz ? b : a));
function parapets(g, fp) {
  for (const b of fp) add(g, G.box, M(C.plaster), b.x, 0, b.z, b.sx * 0.98, 0.07, b.sz * 0.98);
}
function buildModule(g, cell, m, gt, rnd) {
  const f = cell.f, D = f.depth, Wd = f.width, kind = gt.base || gt.id, H = STOREY_H;
  const fp = groundTop(kind) === 'F' ? footprint(cell, kind) : [];
  switch (m.id) {
    case 'storey': case 'sabat': {
      const tone = [C.adobe, C.adobeLight, C.adobeDark][Math.floor(rnd() * 3)];
      for (const b of fp) {
        add(g, G.box, M(tone), b.x, 0, b.z, b.sx * 0.95, H * 0.94, b.sz * 0.95);
        add(g, G.box, M(C.adobeDark), b.x, H * 0.9, b.z, b.sx * 0.99, 0.04, b.sz * 0.99);
      }
      facadeScreens(g, fp, gt, H, rnd, kind === 'caravanserai' ? C.brickDark : C.adobeDark);
      if (m.id === 'sabat') {
        for (const side of ['in', 'out', 'cw', 'ccw']) {
          if (gt[side] !== 'S') continue;
          const path = armPaths(cell, side)[0], a = path[0], b = path[path.length - 1];
          const mid = a.clone().lerp(b, 0.5), len = a.distanceTo(b) + 0.05;
          const ang = Math.atan2(b.z - a.z, b.x - a.x);
          add(g, G.box, M(C.adobeLight), mid.x, 0.08, mid.z, len, H * 0.8, 0.46, -ang);
          add(g, G.box, M(C.brickDark), mid.x, 0.04, mid.z, len, 0.05, 0.5, -ang);
        }
      }
      break;
    }
    case 'roof':
      parapets(g, fp);
      if (fp.length && rnd() < 0.3) { const b = fp[Math.floor(rnd() * fp.length)]; add(g, G.box, M(C.adobeLight), b.x, 0, b.z, Math.min(b.sx, 0.3), 0.22, Math.min(b.sz, 0.3)); }
      break;
    case 'dome': {
      parapets(g, fp);
      const b = biggest(fp);
      dome(g, b.x, 0, b.z, Math.min(b.sx, b.sz) * 0.42, rnd() < 0.55 ? GLAZE(C.turq) : M(C.adobeLight), false);
      break;
    }
    case 'badgir': {
      parapets(g, fp);
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n && i < fp.length; i++) {
        const b = fp[(i * 2 + Math.floor(rnd() * 2)) % fp.length];
        add(g, G.box, M(C.adobeDark), b.x, 0, b.z, 0.15, 0.78, 0.15);
        add(g, G.box, M(C.adobe), b.x, 0.78, b.z, 0.19, 0.05, 0.19);
        add(g, G.box, M(C.ink, 1), b.x, 0.55, b.z, 0.16, 0.12, 0.05);
      }
      break;
    }
    case 'talar': {
      parapets(g, fp);
      const b = biggest(fp), hx = b.sx * 0.38, hz = b.sz * 0.38;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, G.cyl, M(C.plaster), b.x + sx * hx, 0.07, b.z + sz * hz, 0.025, 0.36, 0.025);
      add(g, G.box, M(C.brick), b.x, 0.43, b.z, b.sx * 0.9, 0.05, b.sz * 0.9);
      break;
    }
    case 'shaft':
      if (kind === 'minaret') {
        add(g, G.cyl, M(C.plaster), 0, 0, 0, 0.12, H, 0.12);
        add(g, G.cyl, GLAZE(C.turq), 0, H * 0.8, 0, 0.13, 0.06, 0.13);
      } else if (kind === 'tower') {
        add(g, G.cyl, M(C.wall), D * 0.15, 0, 0, 0.4, H, 0.4);
      } else if (kind === 'ab-anbar') {
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, G.box, M(C.adobeDark), -D * 0.08 + sx * 0.5, 0, sz * Math.min(0.5, Wd * 0.32), 0.13, H, 0.13);
      }
      break;
    case 'cap':
      if (kind === 'minaret') {
        add(g, G.cyl, M(C.adobeDark), 0, 0, 0, 0.2, 0.06, 0.2);
        add(g, G.cyl, M(C.plaster), 0, 0.06, 0, 0.1, 0.18, 0.1);
        add(g, G.cone, GLAZE(C.turq), 0, 0.24, 0, 0.12, 0.42, 0.12);
        add(g, G.cone, M(C.gold, 0.4), 0, 0.64, 0, 0.025, 0.12, 0.025);
      } else if (kind === 'tower') {
        add(g, G.cyl, M(C.wallTop), D * 0.15, 0, 0, 0.46, 0.08, 0.46);
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(g, G.box, M(C.wallTop), D * 0.15 + Math.cos(a) * 0.4, 0.08, Math.sin(a) * 0.4, 0.1, 0.14, 0.1, -a); }
      } else if (kind === 'ab-anbar') {
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const x = -D * 0.08 + sx * 0.5, z = sz * Math.min(0.5, Wd * 0.32);
          add(g, G.box, M(C.ink, 1), x, 0, z, 0.14, 0.12, 0.14);
          add(g, G.box, M(C.adobe), x, 0.12, z, 0.18, 0.05, 0.18);
        }
      }
      break;
    case 'battlement': {
      const n = Math.max(3, Math.round(Wd / 0.24));
      for (let i = 0; i < n; i++) add(g, G.box, M(C.wallTop), D * 0.3, 0, -Wd * 0.52 + (i + 0.5) * Wd * 1.04 / n, 0.1, 0.15, 0.12);
      break;
    }
    case 'gatehouse':
      add(g, G.box, M(C.wallTop), 0, 0, 0, D * 0.62, 0.4, 0.95);
      dome(g, 0, 0.4, 0, 0.3, GLAZE(C.green), false);
      break;
  }
}

  window.CityMesh = {
    PALETTE: C,
    G, matCache, M, GLAZE, WATER,
    latticeTexture, latticeFor, screenMat, screen, facadeScreens, wallFP,
    starTexture, PLAZA_MAT,
    frameOf, L, W, add, sectorSlab, ribbon, arc, armPaths, arms, arcadeDomes,
    dome, minaret, tree, badgir, courtyard, cornerBox, corners,
    STREETISH, buildPiece, baseY, footprint, biggest, parapets, buildModule,
  };
})();
