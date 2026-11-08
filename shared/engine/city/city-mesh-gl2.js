  /* INTERACTIONS — Radial city mesh-building engine, WebGL2-native port.

    Ported 2026-11-01 from shared/engine/city/city-mesh-engine.js so the same procedural city geometry
    (palette, mashrabiya lattice screens, courtyard/arm/dome/minaret/tree primitives, and the
    buildPiece()/buildModule() switch statements) can feed a hand-written raw-WebGL2 renderer
    instead of Three.js. ZERO `THREE.*` usage anywhere in this file — every builder below
    returns plain typed arrays (Float32Array / Uint32Array) and plain {x,y,z} objects, never a
    THREE object. No `gl.*` calls either: this file only produces CPU-side data. A separate
    integration step uploads it via gl.bufferData / gl.texImage2D and does the actual drawing.

    ---------------------------------------------------------------------------------------
    LOAD ORDER / DEPENDENCIES — read this before wiring it up:
    ---------------------------------------------------------------------------------------
    1. shared/engine/city/city-wfc.js must be loaded first (this file destructures STREET_KINDS, STOREY_H
        and groundTop off window.CityWFC, exactly like the original engine does).
    2. HIDDEN GLOBALS (carried over unchanged from city-mesh-engine.js's own bug/quirk): two
        helpers below — armPaths() and cornerBoxGL2()/armsGL2() — reference `RINGS` and
        `isAvenueCell` as bare free identifiers, NOT as `CityWFC.RINGS`/`CityWFC.isAvenueCell`.
        This mirrors the original file exactly (it has the same quirk — see World Scene.html's
        `window.RINGS = RINGS; window.isAvenueCell = isAvenueCell;` workaround for proof). The
        integration step MUST do the same here:
          window.RINGS = CityWFC.RINGS;
          window.isAvenueCell = CityWFC.isAvenueCell;
        before calling anything in this file that builds arms, corners, or stacked modules.
    3. `cell.f` (the cached result of frameOf(cell)) is likewise never assigned inside the
        original engine file — it's an implicit precondition that whatever calls buildPiece/
        buildModule has already set `cell.f = CityMesh.frameOf(cell)` per cell. Same contract
        here: buildPieceGL2/buildModuleGL2 assume `cell.f` already exists. buildCityGL2()
        (the new top-level entry point, see below) sets it for you automatically.

    ---------------------------------------------------------------------------------------
    KNOWN GAPS / design notes (read before trusting a geometry 1:1):
    ---------------------------------------------------------------------------------------
    - buildCity() itself (world placement of each cell's group, the Y-stacking of module
      layers via baseY()+STOREY_H, and ring-specific ground dressing like the ring-0 plaza
      disc) was *never part of* city-mesh-engine.js — it lives in each consuming page
      (confirmed by reading world/scenes/world-scene/World Scene.html). There is therefore no
      original buildCity() to port verbatim. buildCityGL2() below is NEW code that
      reconstructs the placement math by reading World Scene.html's actual usage:
        g.position.copy(W(cell.f.rm, cell.f.am, yOffset)); g.rotation.y = -cell.f.am;
      This has been verified against that file line-for-line (see its city build loop) and
      is baked into composeTRSY()-based per-cell transforms inside buildCityGL2(). It does
      NOT reproduce World Scene's extra ring-based ground-slab dressing (plaza disc for ring
      0, sectorSlab for ring>1) since that is page-specific set-dressing, not an engine
      responsibility — sectorSlabGL2() is exported so an integration step can add that itself.
    - sectorSlabGL2() is a direct fan/strip triangulation standing in for the original's
      THREE.Shape + ExtrudeGeometry (no CPU-geometry equivalent exists to copy verbatim, since
      ExtrudeGeometry's cap/wall construction is internal to Three). It reconstructs the same
      solid annulus-sector prism (two caps + 4 walls) using self-correcting winding (see
      pushQuad/pushTri below) so face orientation is always right even though the exact
      vertex order differs from whatever ExtrudeGeometry produced. NOTE: like the original,
      sectorSlab/sectorSlabGL2 is not called anywhere inside buildPiece/buildModule's own
      switch statements — it's exported for an external caller (World Scene.html calls the
      original directly as a per-cell ground slab). Same here: exported, not auto-invoked.
    - badgir(g,x,z,base) is likewise defined+exported in the original but never called from
      buildPiece/buildModule internally (the module-stack 'badgir' case inlines its own,
      different box geometry instead). badgirGL2() below is ported for parity/export
      completeness only, matching that same (apparently intentional) dead-internal-use status.
    - starTextureGL2()'s canvas has no equivalent of the original's
      `texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(7,7);
      texture.anisotropy = 4;` — those are GL sampler/texture-object settings, not canvas
      pixels, so they can't be returned from a canvas-drawing function. The PLAZA_TAG material
      descriptor (see MATERIAL REGISTRY below) carries `wrap:'repeat', repeat:7` as metadata so
      the integration step knows to set GL_REPEAT + 7x7 tiling when it uploads this texture.
    - Materials are not THREE.Material objects (there's nothing to construct them with here).
      Every M()/GLAZE()/WATER/PLAZA_MAT call site has been replaced with a `materialTag`
      string plus a lazily-populated descriptor registry (`materialRegistry`, i.e. the old
      matCache/screenMatCache) that an integration step reads to build real GL materials. See
      "MATERIAL TAG CONVENTION" comment below for the exact string shapes.

    ---------------------------------------------------------------------------------------
    MATRIX CONVENTION for addGL2()'s `matrix` (and every customPart's `matrix`):
    ---------------------------------------------------------------------------------------
    COLUMN-MAJOR Float32Array(16), the standard WebGL/GLSL layout — i.e. safe to pass straight
    into `gl.uniformMatrix4fv(loc, false, matrix)` or into an instanced-attribute buffer read
    the same way. Composition order matches Three.js's own Object3D.updateMatrix() semantics
    (matrix = Translate * RotateY * Scale, column-major), so for the same (x,y,z,sx,sy,sz,ry)
    addGL2() produces exactly the matrix a `THREE.Mesh` with position/rotation.y/scale set to
    those values would have. See composeTRSY() for the exact 16 floats.

    buildCityGL2()'s per-cell world placement is implemented the same way: a second
    composeTRSY() call for (cell center, yOffset, rotation -cell.f.am) is left-multiplied
    (multiplyMat4(cellMatrix, localMatrix)) onto every instance/customPart matrix a cell's
    buildPieceGL2/buildModuleGL2 call produced, so everything buildCityGL2() returns is
    already in final world space — no further per-cell transform needed downstream.

    ---------------------------------------------------------------------------------------
    MATERIAL TAG CONVENTION:
    ---------------------------------------------------------------------------------------
      'std:<hex6>:<roughness>'   — matTag(hex, rough)  e.g. 'std:dcc29a:0.9'
      'water'                    — the one fixed WATER material
      'plaza'                    — the one fixed plaza-ground material (starTextureGL2)
      'screen:<n>-<k>:<hex6>'    — screenTag(n,k,hex), a mashrabiya lattice screen variant
    Every tag is also a key into `materialRegistry` (same object as the old matCache), whose
    value is a plain descriptor object ({type, color, roughness, ...}) the integration step
    turns into real GL state — never a THREE.Material.

    Classic script (not a module). Load order:
      <script src="city-wfc.js"></script>
      <script src="city-mesh-gl2.js"></script>
      (then your own script that sets window.RINGS/window.isAvenueCell and reads
        window.CityMeshGL2)
  */
  (function () {
    'use strict';
    const TAU = Math.PI * 2;
    const { STREET_KINDS, STOREY_H, groundTop } = CityWFC;

    // ---------- palette (identical to city-mesh-engine.js) ----------
    const C = {
      adobe: 0xdcc29a, adobeDark: 0xc6a77c, adobeLight: 0xeadbbb, plaster: 0xf2ead8,
      brick: 0xbd8a5f, brickDark: 0x9d6c48, paving: 0xbfae90, avenue: 0xe3b660, plaza: 0xf1e8d6,
      lapis: 0x2a4ea3, turq: 0x2aa39b, green: 0x3f8f6b, gold: 0xd8a441, ink: 0x2a2c38,
      water: 0x3d9cc6, grass: 0x84a85e, cypress: 0x2f5b3e, fruit: 0x6f9a4a, trunk: 0x6b4a2f,
      wall: 0xc9a06c, wallTop: 0xb48c5b, desert: 0xbfae8c, kerb: 0xd8ccb2,
    };

    // =======================================================================================
    // Small vector / matrix utilities (no THREE — plain {x,y,z} objects and Float32Array(16)).
    // =======================================================================================
    function vsub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
    function vcross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
    function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function vnorm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
    function vdist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    function vlerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }

    // Column-major TRS compose: matrix = Translate(x,y,z) * RotateY(ry) * Scale(sx,sy,sz).
    // Matches THREE.Object3D.updateMatrix() exactly for the same position/rotation.y/scale.
    function composeTRSY(x, y, z, sx, sy, sz, ry = 0) {
      const c = Math.cos(ry), s = Math.sin(ry);
      return new Float32Array([
        c * sx, 0, -s * sx, 0,
        0, sy, 0, 0,
        s * sz, 0, c * sz, 0,
        x, y, z, 1,
      ]);
    }
    function identityMat4() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
    // Column-major 4x4 multiply: returns a*b (apply b first, then a).
    function multiplyMat4(a, b) {
      const out = new Float32Array(16);
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
          out[col * 4 + row] = sum;
        }
      }
      return out;
    }

    // Self-correcting quad/triangle pushers: given a rough vertex order and a "this should
    // roughly face this way" hint vector, they compute the real cross-product normal and flip
    // winding if it disagrees with the hint — so callers never have to hand-verify winding.
    function pushQuad(P, N, UV, I, a, b, c, d, hint) {
      let n = vnorm(vcross(vsub(b, a), vsub(c, a)));
      let verts = [a, b, c, d];
      if (vdot(n, hint) < 0) { verts = [a, d, c, b]; n = { x: -n.x, y: -n.y, z: -n.z }; }
      const base = P.length / 3;
      for (const v of verts) { P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); }
      UV.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    function pushTri(P, N, UV, I, a, b, c, hint) {
      let n = vnorm(vcross(vsub(b, a), vsub(c, a)));
      let verts = [a, b, c];
      if (vdot(n, hint) < 0) { verts = [a, c, b]; n = { x: -n.x, y: -n.y, z: -n.z }; }
      const base = P.length / 3;
      for (const v of verts) { P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); }
      UV.push(0, 0, 1, 0, 0.5, 1);
      I.push(base, base + 1, base + 2);
    }
    // Like pushTri but with exact per-vertex normals already known (used by sphereGeom, where
    // normal = normalized position is exact — winding is still picked via the cross product
    // vs. the averaged vertex normal, so poles / degenerate triangles are always harmless).
    function pushTriSmooth(P, N, UV, I, va, vb, vc) {
      const cr = vcross(vsub(vb.pos, va.pos), vsub(vc.pos, va.pos));
      const avgN = { x: va.normal.x + vb.normal.x + vc.normal.x, y: va.normal.y + vb.normal.y + vc.normal.y, z: va.normal.z + vb.normal.z + vc.normal.z };
      let order = [va, vb, vc];
      if (vdot(cr, avgN) < 0) order = [va, vc, vb];
      const base = P.length / 3;
      for (const v of order) { P.push(v.pos.x, v.pos.y, v.pos.z); N.push(v.normal.x, v.normal.y, v.normal.z); UV.push(v.uv.x, v.uv.y); }
      I.push(base, base + 1, base + 2);
    }

    // =======================================================================================
    // 1. Base primitive builders — raw equivalents of city-mesh-engine.js's `G` geometry cache.
    //    Each matches the ORIGINAL's post-.translate() placement: box/cyl/oct/cone sit with
    //    their base at y=0 and span up to y=1 (unit-sized); sphere is centered at the origin;
    //    hemi is the upper half of a unit sphere, also sitting base-down at y=0 up to y=1.
    //    Vertices are NOT shared/deduplicated between adjacent triangles (simpler, and the
    //    original's own translate()/rotateX() calls effectively bake per-instance anyway) —
    //    `indices` are simple sequential triangle lists, still valid Uint32Array index data.
    // =======================================================================================
    function boxGeom() {
      const P = [], N = [], UV = [], I = [];
      const c = {
        n000: { x: -0.5, y: 0, z: -0.5 }, n100: { x: 0.5, y: 0, z: -0.5 },
        n010: { x: -0.5, y: 1, z: -0.5 }, n110: { x: 0.5, y: 1, z: -0.5 },
        n001: { x: -0.5, y: 0, z: 0.5 }, n101: { x: 0.5, y: 0, z: 0.5 },
        n011: { x: -0.5, y: 1, z: 0.5 }, n111: { x: 0.5, y: 1, z: 0.5 },
      };
      pushQuad(P, N, UV, I, c.n100, c.n101, c.n111, c.n110, { x: 1, y: 0, z: 0 });
      pushQuad(P, N, UV, I, c.n000, c.n001, c.n011, c.n010, { x: -1, y: 0, z: 0 });
      pushQuad(P, N, UV, I, c.n010, c.n011, c.n111, c.n110, { x: 0, y: 1, z: 0 });
      pushQuad(P, N, UV, I, c.n000, c.n001, c.n101, c.n100, { x: 0, y: -1, z: 0 });
      pushQuad(P, N, UV, I, c.n001, c.n101, c.n111, c.n011, { x: 0, y: 0, z: 1 });
      pushQuad(P, N, UV, I, c.n000, c.n100, c.n110, c.n010, { x: 0, y: 0, z: -1 });
      return { positions: new Float32Array(P), normals: new Float32Array(N), uv: new Float32Array(UV), indices: new Uint32Array(I) };
    }
    function cylinderGeom(segments, radiusTop = 1, radiusBottom = 1) {
      const P = [], N = [], UV = [], I = [];
      for (let i = 0; i < segments; i++) {
        const a0 = i / segments * TAU, a1 = (i + 1) / segments * TAU, am = (a0 + a1) / 2;
        const bA = { x: radiusBottom * Math.cos(a0), y: 0, z: radiusBottom * Math.sin(a0) };
        const bB = { x: radiusBottom * Math.cos(a1), y: 0, z: radiusBottom * Math.sin(a1) };
        const tA = { x: radiusTop * Math.cos(a0), y: 1, z: radiusTop * Math.sin(a0) };
        const tB = { x: radiusTop * Math.cos(a1), y: 1, z: radiusTop * Math.sin(a1) };
        const hint = { x: Math.cos(am), y: 0, z: Math.sin(am) };
        pushQuad(P, N, UV, I, bA, bB, tB, tA, hint);
      }
      if (radiusTop > 0) {
        const topCenter = { x: 0, y: 1, z: 0 };
        for (let i = 0; i < segments; i++) {
          const a0 = i / segments * TAU, a1 = (i + 1) / segments * TAU;
          pushTri(P, N, UV, I, topCenter,
            { x: radiusTop * Math.cos(a0), y: 1, z: radiusTop * Math.sin(a0) },
            { x: radiusTop * Math.cos(a1), y: 1, z: radiusTop * Math.sin(a1) },
            { x: 0, y: 1, z: 0 });
        }
      }
      if (radiusBottom > 0) {
        const botCenter = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < segments; i++) {
          const a0 = i / segments * TAU, a1 = (i + 1) / segments * TAU;
          pushTri(P, N, UV, I, botCenter,
            { x: radiusBottom * Math.cos(a0), y: 0, z: radiusBottom * Math.sin(a0) },
            { x: radiusBottom * Math.cos(a1), y: 0, z: radiusBottom * Math.sin(a1) },
            { x: 0, y: -1, z: 0 });
        }
      }
      return { positions: new Float32Array(P), normals: new Float32Array(N), uv: new Float32Array(UV), indices: new Uint32Array(I) };
    }
    function coneGeom(segments) { return cylinderGeom(segments, 0, 1); }
    function sphereGeom(widthSegments = 12, heightSegments = 8, phiStart = 0, phiLength = TAU, thetaStart = 0, thetaLength = Math.PI) {
      const P = [], N = [], UV = [], I = [];
      const grid = [];
      for (let iy = 0; iy <= heightSegments; iy++) {
        const row = [];
        const vf = iy / heightSegments;
        const theta = thetaStart + vf * thetaLength;
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        for (let ix = 0; ix <= widthSegments; ix++) {
          const uf = ix / widthSegments;
          const phi = phiStart + uf * phiLength;
          const x = -Math.cos(phi) * sinT, y = cosT, z = Math.sin(phi) * sinT;
          row.push({ pos: { x, y, z }, normal: { x, y, z }, uv: { x: uf, y: 1 - vf } });
        }
        grid.push(row);
      }
      for (let iy = 0; iy < heightSegments; iy++) {
        for (let ix = 0; ix < widthSegments; ix++) {
          const v00 = grid[iy][ix], v10 = grid[iy][ix + 1], v11 = grid[iy + 1][ix + 1], v01 = grid[iy + 1][ix];
          pushTriSmooth(P, N, UV, I, v00, v10, v11);
          pushTriSmooth(P, N, UV, I, v00, v11, v01);
        }
      }
      return { positions: new Float32Array(P), normals: new Float32Array(N), uv: new Float32Array(UV), indices: new Uint32Array(I) };
    }

    // baseShapeKey strings below match these cache keys 1:1 (same names as the original `G`).
    const G2 = {
      box: boxGeom(),
      cyl: cylinderGeom(16),
      oct: cylinderGeom(8),
      hemi: sphereGeom(20, 10, 0, TAU, 0, Math.PI / 2),
      sphere: sphereGeom(12, 8),
      cone: coneGeom(10),
    };

    // ---------- material tag registry (replaces matCache/M/GLAZE/WATER/screenMat/PLAZA_MAT) ----------
    const materialRegistry = {};
    function hexStr(hex) { return hex.toString(16).padStart(6, '0'); }
    function matTag(hex, rough = 0.9) {
      const key = 'std:' + hexStr(hex) + ':' + rough;
      if (!materialRegistry[key]) materialRegistry[key] = { type: 'standard', color: hex, roughness: rough };
      return key;
    }
    function glazeTag(hex) { return matTag(hex, 0.35); }
    const WATER_TAG = 'water';
    materialRegistry[WATER_TAG] = { type: 'water', color: C.water, roughness: 0.15, metalness: 0.1, emissive: 0x1d6a8a, emissiveIntensity: 0.25 };
    const PLAZA_TAG = 'plaza';
    materialRegistry[PLAZA_TAG] = { type: 'plaza', roughness: 0.75, texture: 'starTextureGL2', wrap: 'repeat', repeat: 7 };
    function screenTag(n, k, hex) {
      const key = 'screen:' + n + '-' + k + ':' + hexStr(hex);
      if (!materialRegistry[key]) materialRegistry[key] = { type: 'screen', color: hex, lattice: { n, k }, alphaTest: 0.1, roughness: 0.85, doubleSided: true, texture: 'latticeTextureGL2' };
      return key;
    }

    // =======================================================================================
    // 2. Instance accumulation — replaces the original's add()/g.add(mesh).
    // =======================================================================================
    function addGL2(buffers, baseShapeKey, materialTag, x, y, z, sx, sy, sz, ry = 0) {
      buffers.instances.push({ baseShapeKey, materialTag, matrix: composeTRSY(x, y, z, sx, sy, sz, ry) });
    }

    // =======================================================================================
    // 5. Canvas textures — port of latticeTexture()/starTexture(). Canvas-drawing logic is
    //    byte-identical to the original; only the THREE.CanvasTexture wrap is dropped.
    // =======================================================================================
    const LATTICE_VARIANTS = [[8, 3], [9, 2], [9, 4], [10, 3], [12, 5], [16, 6], [7, 2], [11, 4]];
    const latticeCacheGL2 = new Map();
    function latticeTextureGL2(n, k) {
      const key = n + '/' + k;
      if (latticeCacheGL2.has(key)) return latticeCacheGL2.get(key);
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
      const result = { canvas: cv, label: 'lattice-' + n + '-' + k };
      latticeCacheGL2.set(key, result);
      return result;
    }
    function latticeForGL2(rnd) {
      const [n, k] = LATTICE_VARIANTS[Math.floor(rnd() * LATTICE_VARIANTS.length)];
      const tex = latticeTextureGL2(n, k);
      return { n, k, canvas: tex.canvas, label: tex.label };
    }
    function starTextureGL2() {
      const s = 256, cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const x = cv.getContext('2d');
      x.fillStyle = '#efe4cc'; x.fillRect(0, 0, s, s);
      function star(cx, cy, R) {
        x.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = i * Math.PI / 8 + Math.PI / 8;
          const rr = i % 2 ? R : R * 0.7654;
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
      for (const [cx, cy] of [[s / 2, 0], [0, s / 2], [s, s / 2], [s / 2, s]]) {
        x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
        x.fillStyle = '#c9b38a'; x.fillRect(-s * 0.06, -s * 0.06, s * 0.12, s * 0.12); x.restore();
      }
      // Sampler state the integration step must set when uploading this canvas as a texture:
      // GL_REPEAT wrap on both axes, 7x7 UV tiling (see PLAZA_TAG's wrap/repeat metadata above).
      return { canvas: cv, label: 'plaza-star' };
    }

    // =======================================================================================
    // ---------- cell-local frame helpers (pure math, no THREE in the original either) ----------
    // =======================================================================================
    function frameOf(cell) {
      if (cell.ring === 0) return { rm: 0, am: 0, depth: cell.r1 * 2, width: cell.r1 * 2, da: TAU };
      const rm = (cell.r0 + cell.r1) / 2, am = (cell.a0 + cell.a1) / 2;
      return { rm, am, depth: cell.r1 - cell.r0, width: rm * (cell.a1 - cell.a0), da: cell.a1 - cell.a0 };
    }
    function L(cell, r, a, y = 0) {
      const f = cell.f;
      const dx = r * Math.cos(a) - f.rm * Math.cos(f.am), dz = r * Math.sin(a) - f.rm * Math.sin(f.am);
      return { x: dx * Math.cos(f.am) + dz * Math.sin(f.am), y, z: -dx * Math.sin(f.am) + dz * Math.cos(f.am) };
    }
    function W(r, a, y = 0) { return { x: r * Math.cos(a), y, z: r * Math.sin(a) }; }

    // =======================================================================================
    // 4. Bespoke / non-primitive geometry — ribbon() and sectorSlab() ports.
    // =======================================================================================
    function ribbonGL2(buffers, pts, w, y, materialTag) {
      const pos = [], idx = [], nrm = [], uv = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        pos.push(p.x - dz * w / 2, y, p.z + dx * w / 2, p.x + dz * w / 2, y, p.z - dx * w / 2);
        // Flat horizontal ribbon: computeVertexNormals() on the original would yield (0,1,0)
        // everywhere since every point shares the same y; material is double-sided anyway.
        nrm.push(0, 1, 0, 0, 1, 0);
        const vlen = (pts.length - 1) || 1;
        uv.push(0, i / vlen, 1, i / vlen);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      buffers.customParts.push({
        positions: new Float32Array(pos), normals: new Float32Array(nrm), uv: new Float32Array(uv),
        indices: new Uint32Array(idx), materialTag, matrix: identityMat4(),
      });
    }
    // Direct fan/strip triangulation of the closed-form annulus-sector prism the original built
    // via THREE.Shape + ExtrudeGeometry + rotateX(-PI/2). See top-of-file KNOWN GAPS note.
    function sectorSlabGL2(cell, inset, depth, materialTag) {
      const { r0, r1, a0, a1 } = cell;
      const ri = r0 + inset, ro = r1 - inset;
      const n = Math.max(4, Math.ceil((a1 - a0) * r1 / 0.2));
      const outer = [], inner = [];
      for (let i = 0; i <= n; i++) outer.push(L(cell, ro, a0 + inset / ro + (a1 - a0 - 2 * inset / ro) * i / n));
      for (let i = 0; i <= n; i++) inner.push(L(cell, ri, a0 + inset / ri + (a1 - a0 - 2 * inset / ri) * i / n));
      const P = [], N = [], UV = [], I = [];
      const UP = { x: 0, y: 1, z: 0 }, DOWN = { x: 0, y: -1, z: 0 };
      const at = (p, y) => ({ x: p.x, y, z: p.z });
      for (let i = 0; i < n; i++) {
        pushQuad(P, N, UV, I, at(outer[i], depth), at(outer[i + 1], depth), at(inner[i + 1], depth), at(inner[i], depth), UP);
        pushQuad(P, N, UV, I, at(outer[i], 0), at(outer[i + 1], 0), at(inner[i + 1], 0), at(inner[i], 0), DOWN);
        const oMid = vnorm({ x: (outer[i].x + outer[i + 1].x) / 2, y: 0, z: (outer[i].z + outer[i + 1].z) / 2 });
        pushQuad(P, N, UV, I, at(outer[i], 0), at(outer[i + 1], 0), at(outer[i + 1], depth), at(outer[i], depth), oMid);
        pushQuad(P, N, UV, I, at(inner[i], 0), at(inner[i + 1], 0), at(inner[i + 1], depth), at(inner[i], depth), { x: -oMid.x, y: 0, z: -oMid.z });
      }
      const eN0 = vnorm(vcross(vsub(at(inner[0], 0), at(outer[0], 0)), { x: 0, y: 1, z: 0 }));
      pushQuad(P, N, UV, I, at(outer[0], 0), at(inner[0], 0), at(inner[0], depth), at(outer[0], depth), eN0);
      pushQuad(P, N, UV, I, at(outer[n], 0), at(inner[n], 0), at(inner[n], depth), at(outer[n], depth), { x: -eN0.x, y: 0, z: -eN0.z });
      return {
        positions: new Float32Array(P), normals: new Float32Array(N), uv: new Float32Array(UV), indices: new Uint32Array(I),
        materialTag, matrix: identityMat4(),
      };
    }
    // Pierced screen plane — bespoke quad (not a cached primitive), ported from screen().
    // (nx, nz) is the outward-facing normal in the cell's local frame.
    function screenGL2(buffers, x, y, z, w, h, nx, nz, rnd, hex = C.adobeDark) {
      const variant = latticeForGL2(rnd);
      const tag = screenTag(variant.n, variant.k, hex);
      const ry = Math.atan2(nx, nz);
      const c = Math.cos(ry), s = Math.sin(ry);
      const local = [{ x: -w / 2, y: -h / 2, z: 0 }, { x: w / 2, y: -h / 2, z: 0 }, { x: w / 2, y: h / 2, z: 0 }, { x: -w / 2, y: h / 2, z: 0 }];
      const corners = local.map(p => ({ x: p.x * c + p.z * s + x, y: p.y + y, z: -p.x * s + p.z * c + z }));
      const normal = vnorm({ x: nx, y: 0, z: nz });
      const P = [], N = [], UV = [0, 0, 1, 0, 1, 1, 0, 1];
      for (const p of corners) { P.push(p.x, p.y, p.z); N.push(normal.x, normal.y, normal.z); }
      buffers.customParts.push({
        positions: new Float32Array(P), normals: new Float32Array(N), uv: new Float32Array(UV),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]), materialTag: tag, matrix: identityMat4(),
        lattice: { n: variant.n, k: variant.k }, // extra convenience field, additive only
      });
      return tag;
    }

    // ---------- plain structural helpers (unchanged math) ----------
    const WALL_SIDE = ['in', 'out', 'ccw', 'cw'];
    const WALL_NORMAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    function facadeScreensGL2(buffers, fp, gt, h, rnd, hex) {
      fp.forEach((b, i) => {
        const side = WALL_SIDE[i];
        if (!(gt[side] === 'S' || gt[side] === 'M')) return;
        if (rnd() < 0.4) return;
        const [nx, nz] = WALL_NORMAL[i];
        const thick = Math.min(b.sx, b.sz), long = Math.max(b.sx, b.sz);
        const off = thick / 2 + 0.01;
        screenGL2(buffers, b.x + nx * off, h * 0.5, b.z + nz * off, long * 0.6, h * 0.62, nx, nz, rnd, hex);
      });
    }
    function wallFPGL2(D, Wd, t, x0 = 0) {
      return [
        { x: x0 - D / 2 + t / 2, z: 0, sx: t, sz: Wd },
        { x: x0 + D / 2 - t / 2, z: 0, sx: t, sz: Wd },
        { x: x0, z: -Wd / 2 + t / 2, sx: D - 2 * t, sz: t },
        { x: x0, z: Wd / 2 - t / 2, sx: D - 2 * t, sz: t },
      ];
    }
    function arc(cell, r, aFrom, aTo, y, steps = 6) {
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(L(cell, r, aFrom + (aTo - aFrom) * i / steps, y));
      return pts;
    }
    // NOTE: references the bare global `RINGS` — see top-of-file hidden-globals note.
    function armPaths(cell, side) {
      const f = cell.f, { r0, r1, a0, a1, ring } = cell;
      const c = { x: 0, y: 0, z: 0 };
      if (side === 'in') return [[c, L(cell, r0, f.am)]];
      if (side === 'cw') return [arc(cell, f.rm, f.am, a1, 0)];
      if (side === 'ccw') return [arc(cell, f.rm, f.am, a0, 0)];
      const paths = [[c, L(cell, r1, f.am)]];
      if (ring < RINGS.length - 1 && RINGS[ring + 1] > RINGS[ring]) paths.push(arc(cell, r1, f.am - f.da / 4, f.am + f.da / 4, 0, 4));
      return paths;
    }
    const ARM_GL2 = {
      S: { w: 0.5, y: 0.108, tag: () => matTag(C.paving, 0.95) },
      M: { w: 0.56, y: 0.109, tag: () => matTag(C.brickDark) },
      c: { w: 0.16, y: 0.112, tag: () => WATER_TAG },
    };
    // NOTE: references the bare global `isAvenueCell` — see top-of-file hidden-globals note.
    function armsGL2(buffers, cell, t) {
      for (const side of ['in', 'out', 'cw', 'ccw']) {
        const lab = t[side], spec = ARM_GL2[lab];
        if (!spec) continue;
        let w = spec.w, tag = spec.tag();
        if (lab === 'S' && isAvenueCell(cell) && (side === 'in' || side === 'out')) { w = 0.7; tag = matTag(C.avenue, 0.95); }
        for (const path of armPaths(cell, side)) {
          if (lab !== 'c') ribbonGL2(buffers, path, w + 0.2, 0.104, matTag(C.kerb, 0.95));
          ribbonGL2(buffers, path, w, spec.y, tag);
        }
        if (lab === 'M') arcadeDomesGL2(buffers, cell, side);
      }
    }
    function arcadeDomesGL2(buffers, cell, side) {
      for (const path of armPaths(cell, side).slice(0, 1)) {
        const total = path.reduce((s, p, i) => s + (i ? vdist(p, path[i - 1]) : 0), 0);
        const n = Math.max(1, Math.round(total / 0.42));
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n * total;
          let acc = 0;
          for (let i = 1; i < path.length; i++) {
            const seg = vdist(path[i], path[i - 1]);
            if (acc + seg >= u) {
              const p = vlerp(path[i - 1], path[i], (u - acc) / seg);
              const ang = Math.atan2(path[i].z - path[i - 1].z, path[i].x - path[i - 1].x);
              addGL2(buffers, 'box', matTag(C.brick), p.x, 0.1, p.z, 0.4, 0.2, 0.58, -ang);
              addGL2(buffers, 'hemi', matTag(C.adobeLight), p.x, 0.3, p.z, 0.17, 0.15, 0.17);
              break;
            }
            acc += seg;
          }
        }
      }
    }

    // ---------- piece builders (ports of dome/minaret/tree/badgir/courtyard/cornerBox/corners) ----------
    function domeGL2(buffers, x, y, z, r, matTagVal, drum = true) {
      if (drum) addGL2(buffers, 'cyl', matTag(C.adobeLight), x, y, z, r * 0.95, r * 0.4, r * 0.95);
      const top = y + (drum ? r * 0.4 : 0);
      addGL2(buffers, 'hemi', matTagVal, x, top, z, r, r * 1.12, r);
      addGL2(buffers, 'cone', matTag(C.gold, 0.4), x, top + r * 1.08, z, r * 0.12, r * 0.4, r * 0.12);
    }
    function minaretGL2(buffers, x, z, h, r = 0.09) {
      addGL2(buffers, 'cyl', matTag(C.plaster), x, 0.1, z, r, h, r);
      addGL2(buffers, 'cyl', matTag(C.adobeDark), x, 0.1 + h * 0.78, z, r * 1.6, h * 0.04, r * 1.6);
      addGL2(buffers, 'cone', glazeTag(C.turq), x, 0.1 + h, z, r * 1.05, r * 3.2, r * 1.05);
    }
    function treeGL2(buffers, x, z, rnd, kind) {
      if (kind === 'cypress' || (kind == null && rnd() < 0.45)) {
        addGL2(buffers, 'cone', matTag(C.cypress), x, 0.1, z, 0.1, 0.62 + rnd() * 0.3, 0.1);
      } else {
        addGL2(buffers, 'cyl', matTag(C.trunk), x, 0.1, z, 0.025, 0.2, 0.025);
        addGL2(buffers, 'sphere', matTag(C.fruit), x, 0.38, z, 0.16, 0.14, 0.16);
      }
    }
    function badgirGL2(buffers, x, z, base) {
      addGL2(buffers, 'box', matTag(C.adobeDark), x, base, z, 0.12, 0.42, 0.12);
      addGL2(buffers, 'box', matTag(C.adobe), x, base + 0.42, z, 0.15, 0.04, 0.15);
    }
    function courtyardGL2(buffers, D, Wd, h, matTagVal, x0 = 0) {
      const t = Math.min(D, Wd) * 0.24, fp = wallFPGL2(D, Wd, t, x0);
      for (const b of fp) addGL2(buffers, 'box', matTagVal, b.x, 0.1, b.z, b.sx, h, b.sz);
      return { t, fp };
    }
    // NOTE: references the bare global `isAvenueCell` — see top-of-file hidden-globals note.
    function cornerBoxGL2(cell, su, sv) {
      const f = cell.f, h = isAvenueCell(cell) ? 0.47 : 0.37;
      const ld = Math.max(0, f.depth / 2 - h - 0.02), lw = Math.max(0, f.width / 2 - h - 0.02);
      return { x: su * (f.depth / 2 - 0.02 - ld / 2), z: sv * (f.width / 2 - 0.02 - lw / 2), sx: ld, sz: lw };
    }
    function cornersGL2(buffers, cell, zone, rnd) {
      const f = cell.f;
      for (const [su, sv] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const b = cornerBoxGL2(cell, su, sv), x = b.x, z = b.z, sx = b.sx, sz = b.sz;
        if (zone === 'garden') { treeGL2(buffers, su * f.depth * 0.3, sv * f.width * 0.3, rnd); continue; }
        if (sx < 0.08 || sz < 0.08) continue;
        if (zone === 'wall') continue;
        const bazaar = zone === 'bazaar' || zone === 'sanctum';
        const h = bazaar ? 0.36 + rnd() * 0.14 : 0.4 + rnd() * 0.1;
        const tone = bazaar ? (rnd() < 0.5 ? C.brick : C.adobeDark) : [C.adobe, C.adobeLight, C.adobeDark][Math.floor(rnd() * 3)];
        addGL2(buffers, 'box', matTag(tone), x, 0.1, z, sx, h, sz);
        if (bazaar && rnd() < 0.35) addGL2(buffers, 'hemi', matTag(C.adobeLight), x, 0.1 + h, z, Math.min(sx, sz) * 0.35, Math.min(sx, sz) * 0.32, Math.min(sx, sz) * 0.35);
      }
    }
    const STREETISH = new Set(['avenue', 'chaharsu', 'chaharsu-t', 'chaharsu-o', 'arcade', 'arcade-end', 'avenue-h', 'lane', 'cross', 't-in', 't-out', 't-side', 'bend-in', 'bend-out', 'kucheh', 'kucheh-o', 'kucheh-s', 'qanat', 'garden-path', 'garden-end', 'garden-canal']);

    // =======================================================================================
    // 3. buildPieceGL2 — port of buildPiece(g, cell, t, rnd). Same branches, same math; every
    //    add()/arms()/corners() call site replaced 1:1 with its *GL2 equivalent.
    //    PRECONDITION (same as the original): cell.f must already be set.
    // =======================================================================================
    function buildPieceGL2(buffers, cell, t, rnd) {
      const f = cell.f, kind = t.base || t.id, D = f.depth, Wd = f.width;
      if (kind !== 'core' && cell.ring !== 1) armsGL2(buffers, cell, t);
      else if (cell.ring === 1) armsGL2(buffers, cell, t);
      if (STREETISH.has(kind)) cornersGL2(buffers, cell, cell.zone, rnd);
      switch (kind) {
        case 'core': {
          addGL2(buffers, 'box', matTag(C.plaster), 0, 0.1, 0, 2.3, 0.55, 2.3);
          addGL2(buffers, 'box', matTag(C.adobeLight), 0, 0.65, 0, 1.6, 0.25, 1.6);
          domeGL2(buffers, 0, 0.9, 0, 0.82, glazeTag(C.green));
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) minaretGL2(buffers, sx * 1.3, sz * 1.3, 2.5, 0.1);
          for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2, x = Math.cos(a) * 1.15, z = Math.sin(a) * 1.15;
            addGL2(buffers, 'box', glazeTag(C.lapis), x, 0.1, z, 0.3, 1.0, 0.7, -a);
          }
          break;
        }
        case 'iwan': {
          const x = D * 0.3, w = Math.min(1.2, Wd * 0.45);
          addGL2(buffers, 'box', glazeTag(C.lapis), x, 0.1, 0, 0.3, 1.25, w);
          addGL2(buffers, 'box', matTag(C.ink, 1), x + 0.13, 0.1, 0, 0.06, 0.85, w * 0.5);
          addGL2(buffers, 'box', matTag(C.gold, 0.5), x, 1.35, 0, 0.32, 0.06, w * 1.02);
          break;
        }
        case 'fountain':
          addGL2(buffers, 'oct', matTag(C.adobeDark), 0, 0.1, 0, 0.55, 0.12, 0.55, Math.PI / 8);
          addGL2(buffers, 'oct', WATER_TAG, 0, 0.11, 0, 0.47, 0.13, 0.47, Math.PI / 8);
          addGL2(buffers, 'cyl', matTag(C.plaster), 0, 0.1, 0, 0.06, 0.4, 0.06);
          break;
        case 'minaret':
          addGL2(buffers, 'oct', matTag(C.adobeDark), 0, 0.1, 0, 0.26, 0.5, 0.26, Math.PI / 8);
          break;
        case 'caravanserai': {
          const d = D * 0.82, w = Wd * 0.82;
          const { fp } = courtyardGL2(buffers, d, w, 0.5, matTag(C.brick));
          facadeScreensGL2(buffers, fp, t, 0.5, rnd, C.brickDark);
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addGL2(buffers, 'cyl', matTag(C.brickDark), sx * d / 2, 0.1, sz * w / 2, 0.12, 0.62, 0.12);
          addGL2(buffers, 'box', glazeTag(C.lapis), -d / 2, 0.1, 0, 0.12, 0.72, 0.4);
          addGL2(buffers, 'box', matTag(C.paving), 0, 0.1, 0, d * 0.5, 0.02, w * 0.5);
          break;
        }
        case 'madrasa': {
          const d = D * 0.78, w = Wd * 0.78;
          const { fp } = courtyardGL2(buffers, d, w, 0.55, matTag(C.adobeLight), 0.04);
          facadeScreensGL2(buffers, fp, t, 0.55, rnd, C.lapis);
          addGL2(buffers, 'box', glazeTag(C.lapis), -d / 2 + 0.04, 0.1, 0, 0.18, 0.9, Math.min(0.6, w * 0.4));
          domeGL2(buffers, d / 2 - 0.2, 0.65, 0, 0.26, glazeTag(C.turq), false);
          addGL2(buffers, 'box', WATER_TAG, 0.04, 0.1, 0, d * 0.25, 0.03, w * 0.2);
          break;
        }
        case 'house': {
          const d = D * 0.8, w = Wd * 0.8, h = 0.45 + rnd() * 0.05;
          const { fp } = courtyardGL2(buffers, d, w, h, matTag(rnd() < 0.5 ? C.adobe : C.adobeLight));
          facadeScreensGL2(buffers, fp, t, h, rnd, C.adobeDark);
          addGL2(buffers, 'box', matTag(C.grass), 0, 0.1, 0, d * 0.45, 0.02, w * 0.45);
          addGL2(buffers, 'box', WATER_TAG, 0, 0.1, 0, d * 0.16, 0.035, w * 0.16);
          break;
        }
        case 'hammam': {
          addGL2(buffers, 'box', matTag(C.adobeDark), 0, 0.1, 0, D * 0.7, 0.32, Wd * 0.7);
          for (const z of [-0.28, 0, 0.28]) addGL2(buffers, 'hemi', matTag(C.plaster, 0.6), 0, 0.42, z * Wd, 0.2, 0.18, 0.2);
          break;
        }
        case 'bayt-al-hikma': {
          const d = D * 0.74, w = Wd * 0.74;
          const { fp } = courtyardGL2(buffers, d, w, 0.6, matTag(C.adobeLight));
          facadeScreensGL2(buffers, fp, t, 0.6, rnd, C.lapis);
          domeGL2(buffers, 0, 0.62, 0, 0.3, glazeTag(C.lapis), false);
          addGL2(buffers, 'box', glazeTag(C.turq), -d / 2 + 0.05, 0.1, 0, 0.14, 0.95, Math.min(0.7, w * 0.42));
          break;
        }
        case 'bimaristan': {
          const d = D * 0.76, w = Wd * 0.76;
          const { fp } = courtyardGL2(buffers, d, w, 0.5, matTag(C.plaster));
          facadeScreensGL2(buffers, fp, t, 0.5, rnd, C.adobeDark);
          domeGL2(buffers, d * 0.22, 0.52, 0, 0.22, matTag(C.adobeLight), false);
          addGL2(buffers, 'box', WATER_TAG, 0, 0.1, 0, d * 0.2, 0.03, w * 0.18);
          break;
        }
        case 'masjid': {
          addGL2(buffers, 'box', matTag(C.adobeLight), D * 0.12, 0.1, 0, D * 0.55, 0.42, Wd * 0.62);
          domeGL2(buffers, D * 0.12, 0.52, 0, 0.26, glazeTag(C.turq), false);
          minaretGL2(buffers, -D * 0.12, Wd * 0.27, 1.25, 0.06);
          break;
        }
        case 'ab-anbar': {
          domeGL2(buffers, -D * 0.08, 0.1, 0, Math.min(0.46, Wd * 0.28), matTag(C.adobe), false);
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const x = -D * 0.08 + sx * 0.5, z = sz * Math.min(0.5, Wd * 0.32);
            addGL2(buffers, 'box', matTag(C.adobeDark), x, 0.1, z, 0.13, 0.95, 0.13);
          }
          break;
        }
        case 'orchard': {
          for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) treeGL2(buffers, (i - 0.5) * D * 0.5, (k - 1) * Wd * 0.3, rnd);
          break;
        }
        case 'pool-garden': {
          ribbonGL2(buffers, [{ x: -D * 0.4, y: 0, z: 0 }, { x: D * 0.4, y: 0, z: 0 }], 0.1, 0.112, WATER_TAG);
          ribbonGL2(buffers, [{ x: 0, y: 0, z: -Wd * 0.4 }, { x: 0, y: 0, z: Wd * 0.4 }], 0.1, 0.112, WATER_TAG);
          addGL2(buffers, 'oct', matTag(C.plaster), 0, 0.1, 0, 0.26, 0.05, 0.26, Math.PI / 8);
          addGL2(buffers, 'oct', WATER_TAG, 0, 0.1, 0, 0.21, 0.06, 0.21, Math.PI / 8);
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) treeGL2(buffers, sx * D * 0.25, sz * Wd * 0.25, rnd, 'cypress');
          break;
        }
        case 'pavilion': {
          cornersGL2(buffers, cell, 'garden', rnd);
          addGL2(buffers, 'box', matTag(C.plaster), 0, 0.1, 0, 0.6, 0.08, 0.6);
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addGL2(buffers, 'cyl', matTag(C.adobeLight), sx * 0.24, 0.18, sz * 0.24, 0.03, 0.42, 0.03);
          addGL2(buffers, 'box', matTag(C.adobeDark), 0, 0.6, 0, 0.62, 0.06, 0.62);
          domeGL2(buffers, 0, 0.66, 0, 0.18, glazeTag(C.turq), false);
          break;
        }
        case 'wall': case 'tower': case 'gate': case 'inlet': {
          const thick = D * 0.72;
          if (kind !== 'gate') {
            addGL2(buffers, 'box', matTag(C.wall), 0, 0.1, 0, thick, 0.95, Wd * 1.04);
            addGL2(buffers, 'box', matTag(C.wallTop), 0, 1.05, 0, thick * 1.08, 0.08, Wd * 1.04);
          }
          if (kind === 'tower') {
            addGL2(buffers, 'cyl', matTag(C.wall), D * 0.15, 0.1, 0, 0.42, 1.35, 0.42);
            addGL2(buffers, 'cyl', matTag(C.wallTop), D * 0.15, 1.45, 0, 0.46, 0.08, 0.46);
          }
          if (kind === 'gate') {
            for (const s of [-1, 1]) {
              addGL2(buffers, 'cyl', matTag(C.wall), 0, 0.1, s * 0.42, 0.3, 1.45, 0.3);
              addGL2(buffers, 'box', matTag(C.wall), 0, 0.1, s * (Wd * 0.52 + 0.21), thick, 0.95, Math.max(0.05, Wd * 0.04 + 0.4 - 0.42));
            }
            addGL2(buffers, 'box', matTag(C.wallTop), 0, 0.95, 0, thick, 0.4, 0.7);
            ribbonGL2(buffers, [L(cell, cell.r1 - 0.05, f.am), L(cell, cell.r1 + 6, f.am)], 0.5, 0.012, matTag(C.paving, 1));
          }
          if (kind === 'inlet') {
            addGL2(buffers, 'box', matTag(C.ink, 1), D * 0.37, 0.1, 0, 0.02, 0.3, 0.3);
            for (let k = 1; k <= 6; k++) {
              const p = L(cell, cell.r1 + k * 1.05, f.am);
              addGL2(buffers, 'hemi', matTag(C.adobeDark), p.x, 0, p.z, 0.16, 0.1, 0.16);
            }
          }
          break;
        }
      }
    }

    // =======================================================================================
    // ---------- stacked modules (layers above the ground piece) ----------
    // =======================================================================================
    function baseY(kind) {
      return { minaret: 0.6, tower: 1.53, 'ab-anbar': 1.05, wall: 1.13, inlet: 1.13, gate: 1.35 }[kind] || 0.6;
    }
    function footprintGL2(cell, kind) {
      const f = cell.f, D = f.depth, Wd = f.width;
      if (STREET_KINDS.includes(kind)) {
        return [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([su, sv]) => cornerBoxGL2(cell, su, sv)).filter(b => b.sx >= 0.08 && b.sz >= 0.08);
      }
      const k = kind === 'caravanserai' ? 0.82 : 0.8, d = D * k, w = Wd * k, t = Math.min(d, w) * 0.24;
      return wallFPGL2(d, w, t);
    }
    const biggest = fp => fp.reduce((a, b) => (b.sx * b.sz > a.sx * a.sz ? b : a));
    function parapetsGL2(buffers, fp) {
      for (const b of fp) addGL2(buffers, 'box', matTag(C.plaster), b.x, 0, b.z, b.sx * 0.98, 0.07, b.sz * 0.98);
    }

    // =======================================================================================
    // 3. buildModuleGL2 — port of buildModule(g, cell, m, gt, rnd). Same switch, same math.
    //    PRECONDITION (same as the original): cell.f must already be set.
    // =======================================================================================
    function buildModuleGL2(buffers, cell, m, gt, rnd) {
      const f = cell.f, D = f.depth, Wd = f.width, kind = gt.base || gt.id, H = STOREY_H;
      const fp = groundTop(kind) === 'F' ? footprintGL2(cell, kind) : [];
      switch (m.id) {
        case 'storey': case 'sabat': {
          const tone = [C.adobe, C.adobeLight, C.adobeDark][Math.floor(rnd() * 3)];
          for (const b of fp) {
            addGL2(buffers, 'box', matTag(tone), b.x, 0, b.z, b.sx * 0.95, H * 0.94, b.sz * 0.95);
            addGL2(buffers, 'box', matTag(C.adobeDark), b.x, H * 0.9, b.z, b.sx * 0.99, 0.04, b.sz * 0.99);
          }
          facadeScreensGL2(buffers, fp, gt, H, rnd, kind === 'caravanserai' ? C.brickDark : C.adobeDark);
          if (m.id === 'sabat') {
            for (const side of ['in', 'out', 'cw', 'ccw']) {
              if (gt[side] !== 'S') continue;
              const path = armPaths(cell, side)[0], a = path[0], b = path[path.length - 1];
              const mid = vlerp(a, b, 0.5), len = vdist(a, b) + 0.05;
              const ang = Math.atan2(b.z - a.z, b.x - a.x);
              addGL2(buffers, 'box', matTag(C.adobeLight), mid.x, 0.08, mid.z, len, H * 0.8, 0.46, -ang);
              addGL2(buffers, 'box', matTag(C.brickDark), mid.x, 0.04, mid.z, len, 0.05, 0.5, -ang);
            }
          }
          break;
        }
        case 'roof':
          parapetsGL2(buffers, fp);
          if (fp.length && rnd() < 0.3) { const b = fp[Math.floor(rnd() * fp.length)]; addGL2(buffers, 'box', matTag(C.adobeLight), b.x, 0, b.z, Math.min(b.sx, 0.3), 0.22, Math.min(b.sz, 0.3)); }
          break;
        case 'dome': {
          parapetsGL2(buffers, fp);
          const b = biggest(fp);
          domeGL2(buffers, b.x, 0, b.z, Math.min(b.sx, b.sz) * 0.42, rnd() < 0.55 ? glazeTag(C.turq) : matTag(C.adobeLight), false);
          break;
        }
        case 'badgir': {
          parapetsGL2(buffers, fp);
          const n = 1 + Math.floor(rnd() * 2);
          for (let i = 0; i < n && i < fp.length; i++) {
            const b = fp[(i * 2 + Math.floor(rnd() * 2)) % fp.length];
            addGL2(buffers, 'box', matTag(C.adobeDark), b.x, 0, b.z, 0.15, 0.78, 0.15);
            addGL2(buffers, 'box', matTag(C.adobe), b.x, 0.78, b.z, 0.19, 0.05, 0.19);
            addGL2(buffers, 'box', matTag(C.ink, 1), b.x, 0.55, b.z, 0.16, 0.12, 0.05);
          }
          break;
        }
        case 'talar': {
          parapetsGL2(buffers, fp);
          const b = biggest(fp), hx = b.sx * 0.38, hz = b.sz * 0.38;
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addGL2(buffers, 'cyl', matTag(C.plaster), b.x + sx * hx, 0.07, b.z + sz * hz, 0.025, 0.36, 0.025);
          addGL2(buffers, 'box', matTag(C.brick), b.x, 0.43, b.z, b.sx * 0.9, 0.05, b.sz * 0.9);
          break;
        }
        case 'shaft':
          if (kind === 'minaret') {
            addGL2(buffers, 'cyl', matTag(C.plaster), 0, 0, 0, 0.12, H, 0.12);
            addGL2(buffers, 'cyl', glazeTag(C.turq), 0, H * 0.8, 0, 0.13, 0.06, 0.13);
          } else if (kind === 'tower') {
            addGL2(buffers, 'cyl', matTag(C.wall), D * 0.15, 0, 0, 0.4, H, 0.4);
          } else if (kind === 'ab-anbar') {
            for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addGL2(buffers, 'box', matTag(C.adobeDark), -D * 0.08 + sx * 0.5, 0, sz * Math.min(0.5, Wd * 0.32), 0.13, H, 0.13);
          }
          break;
        case 'cap':
          if (kind === 'minaret') {
            addGL2(buffers, 'cyl', matTag(C.adobeDark), 0, 0, 0, 0.2, 0.06, 0.2);
            addGL2(buffers, 'cyl', matTag(C.plaster), 0, 0.06, 0, 0.1, 0.18, 0.1);
            addGL2(buffers, 'cone', glazeTag(C.turq), 0, 0.24, 0, 0.12, 0.42, 0.12);
            addGL2(buffers, 'cone', matTag(C.gold, 0.4), 0, 0.64, 0, 0.025, 0.12, 0.025);
          } else if (kind === 'tower') {
            addGL2(buffers, 'cyl', matTag(C.wallTop), D * 0.15, 0, 0, 0.46, 0.08, 0.46);
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; addGL2(buffers, 'box', matTag(C.wallTop), D * 0.15 + Math.cos(a) * 0.4, 0.08, Math.sin(a) * 0.4, 0.1, 0.14, 0.1, -a); }
          } else if (kind === 'ab-anbar') {
            for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
              const x = -D * 0.08 + sx * 0.5, z = sz * Math.min(0.5, Wd * 0.32);
              addGL2(buffers, 'box', matTag(C.ink, 1), x, 0, z, 0.14, 0.12, 0.14);
              addGL2(buffers, 'box', matTag(C.adobe), x, 0.12, z, 0.18, 0.05, 0.18);
            }
          }
          break;
        case 'battlement': {
          const n = Math.max(3, Math.round(Wd / 0.24));
          for (let i = 0; i < n; i++) addGL2(buffers, 'box', matTag(C.wallTop), D * 0.3, 0, -Wd * 0.52 + (i + 0.5) * Wd * 1.04 / n, 0.1, 0.15, 0.12);
          break;
        }
        case 'gatehouse':
          addGL2(buffers, 'box', matTag(C.wallTop), 0, 0, 0, D * 0.62, 0.4, 0.95);
          domeGL2(buffers, 0, 0.4, 0, 0.3, glazeTag(C.green), false);
          break;
      }
    }

    // =======================================================================================
    // 6. Top-level entry point — NEW code (buildCity() was never part of the original engine
    //    file; see top-of-file KNOWN GAPS note for how this placement math was reconstructed
    //    from World Scene.html's actual usage of CityMesh).
    // =======================================================================================
    function bakeCellTransform(local, cell, yOffset) {
      const f = cell.f;
      const cellMat = composeTRSY(f.rm * Math.cos(f.am), yOffset, f.rm * Math.sin(f.am), 1, 1, 1, -f.am);
      for (const inst of local.instances) inst.matrix = multiplyMat4(cellMat, inst.matrix);
      for (const part of local.customParts) part.matrix = multiplyMat4(cellMat, part.matrix);
    }
    function buildCityGL2(wfcResult, seed, opts) {
      const buffers = { instances: [], customParts: [] };
      const rnd = CityWFC.mulberry32(seed >>> 0);
      const cells = wfcResult.cells, tiles = wfcResult.tiles, result = wfcResult.result;
      // ring 0 is always the single hub cell (RINGS[0] === 1) and always solves to the 'core' tile —
      // a caller that wants to stand its own landmark there instead (e.g. a Tower Forge tower) passes
      // skipCore so this cell contributes no geometry of its own, rather than both overlapping.
      const skipCore = !!(opts && opts.skipCore);

      for (const cell of cells) {
        if (skipCore && cell.ring === 0) continue;
        if (!cell.f) cell.f = frameOf(cell);
        const tile = tiles[result[cell.id]];
        const local = { instances: [], customParts: [] };
        buildPieceGL2(local, cell, tile, rnd);
        bakeCellTransform(local, cell, 0);
        buffers.instances.push(...local.instances);
        buffers.customParts.push(...local.customParts);
      }

      const upper = CityWFC.stack(wfcResult, seed);
      if (upper) {
        for (const node of upper.nodes) {
          const modIdx = upper.result[node.id];
          if (modIdx == null || modIdx < 0) continue;
          const mod = upper.mods[modIdx];
          if (mod.id === 'air') continue;
          const cell = node.cell;
          const groundTile = tiles[result[cell.id]];
          const kind = groundTile.base || groundTile.id;
          const yOffset = baseY(kind) + (node.k - 1) * STOREY_H;
          const local = { instances: [], customParts: [] };
          buildModuleGL2(local, cell, mod, groundTile, rnd);
          bakeCellTransform(local, cell, yOffset);
          buffers.instances.push(...local.instances);
          buffers.customParts.push(...local.customParts);
        }
      }

      return {
        instances: buffers.instances,
        customParts: buffers.customParts,
        groundLevel: 0,
        cellCount: cells.length,
        seed: wfcResult.seed != null ? wfcResult.seed : seed,
      };
    }

    window.CityMeshGL2 = {
      PALETTE: C,
      boxGeom, cylinderGeom, sphereGeom, coneGeom, G: G2,
      materialRegistry, matTag, glazeTag, WATER_TAG, PLAZA_TAG, screenTag,
      latticeTextureGL2, latticeForGL2, starTextureGL2,
      frameOf, L, W, arc, armPaths,
      composeTRSY, multiplyMat4, identityMat4, addGL2,
      ribbonGL2, sectorSlabGL2, screenGL2, facadeScreensGL2, wallFPGL2,
      armsGL2, arcadeDomesGL2,
      domeGL2, minaretGL2, treeGL2, badgirGL2, courtyardGL2, cornerBoxGL2, cornersGL2,
      STREETISH, buildPieceGL2,
      baseY, footprintGL2, biggest, parapetsGL2, buildModuleGL2,
      buildCityGL2,
    };
  })();
