/* shared/skins/relief.js — a look, not a mechanism: any Forge drawing as a carved or cast relief.
   Takes the SVG a generator returns (lines on a dark plate, as every Forge generator draws) and
   turns it into a lit surface, by displacement mapping in three.js:

     1. mask      the drawing rasterised as brightness: lines white, the plate black
     2. heights   three layers added together:
                    panels  what the lines enclose, raised a little and softened, so a body reads
                            as a plate standing off the ground (the same flood fill as the Seraph's fill)
                    ridges  the lines, blurred twice (wide and narrow), so they rise with a rounded
                            bevel instead of a cliff
                    rim     a low border, so the piece reads as a tablet
                  carve flips the lines into grooves cut into the panels
     3. surface   a dense plane pushed up by the heights (displacementMap), with a normal map made
                  from the same heights (fine lines catch the light) and a low raking light
     4. material  stone, plaster, bronze or gold, lit by a room environment for the metals

     const r = await Relief.create(hostElement);   // loads three.js 0.169 from jsDelivr once
     await r.setSvg(svgString);                     // rebuild the heights from a drawing
     r.set({ material, depth, carve, light });      // material: "stone" | "plaster" | "bronze" | "gold"
                                                    // depth 0..1, carve true|false, light 0..1 (raking → overhead)
     r.snapshot() -> data URL; r.dispose()
   Classic script; three.js is fetched with a dynamic import, so it can sit in any page. */
(function () {
  "use strict";
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
  let threeP = null;
  const loadThree = () => (threeP = threeP || import(THREE_URL).then((T) => ({ T })));
  // a small studio for the metals to reflect: a dim room with a few bright panels (after three's
  // RoomEnvironment, built here because that addon imports "three" by bare name, which needs an import map)
  function studio(T) {
    const room = new T.Scene(), box = new T.BoxGeometry();
    const walls = new T.Mesh(box, new T.MeshBasicMaterial({ color: 0x3a3631, side: T.BackSide }));
    walls.scale.set(12, 10, 12); room.add(walls);
    const panel = (x, y, z, sx, sy, sz, c, k) => { const m = new T.Mesh(box, new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k) })); m.position.set(x, y, z); m.scale.set(sx, sy, sz); room.add(m); };
    panel(-4.5, 3.5, 3, 0.2, 3, 5, 0xfff0d8, 6);     // key softbox, upper left
    panel(4.8, 1, 2, 0.2, 2.5, 3, 0xdfe8ff, 2.2);     // cool fill, right
    panel(0, 4.9, 0, 6, 0.2, 4, 0xffffff, 1.6);       // ceiling
    panel(0, -2, 5.9, 5, 1.2, 0.2, 0xffe2b0, 1.2);    // warm bounce in front
    return room;
  }

  const MATERIALS = {
    stone:   { label: "Stone",   color: 0xb9b1a3, roughness: 0.92, metalness: 0.0, env: 0.35, ground: 0x2a2724 },
    plaster: { label: "Plaster", color: 0xece6da, roughness: 0.85, metalness: 0.0, env: 0.4,  ground: 0x37332e },
    bronze:  { label: "Bronze",  color: 0x9a6a3a, roughness: 0.42, metalness: 0.92, env: 0.9, ground: 0x1c1712 },
    gold:    { label: "Gold",    color: 0xd9a650, roughness: 0.3,  metalness: 1.0,  env: 1.0,  ground: 0x1b1610 },
  };
  const RES = 1024;                                   // height map resolution (longest side)

  // Forge draws mint on a dark plate: every colour becomes its brightness, the plate black
  function brightness(svg) {
    return svg.replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => {
      const L = Math.max(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)) / 255;
      if (L < 0.2) return "#000000";
      const v = Math.round(Math.min(1, L / 0.75) * 255).toString(16).padStart(2, "0");
      return "#" + v + v + v;
    });
  }
  function viewBoxOf(svg) {
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    const [, , w, h] = vb ? vb.trim().split(/[\s,]+/).map(Number) : [0, 0, 600, 600];
    return { w: w || 600, h: h || 600 };
  }
  function loadImage(svg) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("The drawing could not be read as an image")); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
  }

  // what the lines enclose, at a quarter of the resolution: close gaps, flood the outside in from the edges
  function enclosed(maskCv, W, H) {
    const step = 4, w = Math.ceil(W / step), h = Math.ceil(H / step), n = w * h, R = 2;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(maskCv, 0, 0, w, h);
    const px = x.getImageData(0, 0, w, h).data, a = new Uint8Array(n), b = new Uint8Array(n), q = new Int32Array(n);
    for (let i = 0; i < n; i++) a[i] = px[i * 4] > 40 ? 1 : 0;
    const grow = (src, dst) => {
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let m = 0; for (let k = -R; k <= R && !m; k++) { const t = xx + k; if (t >= 0 && t < w && src[y * w + t]) m = 1; } dst[y * w + xx] = m; }
      for (let xx = 0; xx < w; xx++) for (let y = 0; y < h; y++) { let m = 0; for (let k = -R; k <= R && !m; k++) { const t = y + k; if (t >= 0 && t < h && dst[t * w + xx]) m = 1; } src[y * w + xx] = m; }
    };
    grow(a, b);
    b.fill(0); let qh = 0, qt = 0;
    const seed = (i) => { if (!a[i] && !b[i]) { b[i] = 1; q[qt++] = i; } };
    for (let i = 0; i < w; i++) { seed(i); seed((h - 1) * w + i); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) { const i = q[qh++], xx = i % w; if (xx > 0) seed(i - 1); if (xx < w - 1) seed(i + 1); if (i >= w) seed(i - w); if (i < n - w) seed(i + w); }
    grow(b, a);
    const img = x.createImageData(w, h);
    for (let i = 0; i < n; i++) { const v = b[i] ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  }

  // the three height layers, kept apart so carve and depth can recombine them without redrawing
  async function buildLayers(svg) {
    const vb = viewBoxOf(svg), k = RES / Math.max(vb.w, vb.h);
    const W = Math.max(64, Math.round(vb.w * k)), H = Math.max(64, Math.round(vb.h * k));
    const im = await loadImage(brightness(svg));
    const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
    const m = mask.getContext("2d", { willReadFrequently: true });
    m.fillStyle = "#000"; m.fillRect(0, 0, W, H);
    // a margin, so the relief does not touch the tablet's rim
    const pad = Math.round(Math.min(W, H) * 0.07);
    m.drawImage(im, pad, pad, W - 2 * pad, H - 2 * pad);
    const blur = (src, r) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.filter = `blur(${r}px)`; x.drawImage(src, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
    const panel = enclosed(mask, W, H);
    const wide = blur(mask, 6), narrow = blur(mask, 1.6), pan = blur(panel, 7);
    const n = W * H, ridge = new Float32Array(n), body = new Float32Array(n), rim = new Float32Array(n);
    let top = 1e-6;
    for (let i = 0; i < n; i++) { const r = 0.45 * wide[i * 4] / 255 + 0.75 * narrow[i * 4] / 255; ridge[i] = r; if (r > top) top = r; }
    for (let i = 0; i < n; i++) { ridge[i] = Math.min(1, ridge[i] / top); body[i] = pan[i * 4] / 255; }
    // the rim: a soft raised border round the tablet
    const e = Math.min(W, H) * 0.028;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.min(x, y, W - 1 - x, H - 1 - y); rim[y * W + x] = d < e ? 1 - Math.pow(Math.max(0, d - e * 0.45) / (e * 0.55), 2) : 0; }
    return { W, H, ridge, body, rim };
  }

  async function create(host, opts) {
    const { T } = await loadThree();
    const o = Object.assign({ material: "stone", depth: 0.55, carve: false, light: 0.25 }, opts || {});
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
    host.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(studio(T), 0.04).texture;
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    const key = new T.DirectionalLight(0xfff1dc, 3.2), fill = new T.HemisphereLight(0xdfe6ff, 0x1a1410, 0.35);
    scene.add(key, fill);
    const mat = new T.MeshStandardMaterial({ color: 0xffffff });
    let mesh = null, layers = null, heightTex = null, normalTex = null, aspect = 1;
    const tilt = { x: -0.18, y: 0.12, tx: -0.18, ty: 0.12 };

    function combine() {
      const { W, H, ridge, body, rim } = layers, n = W * H, h = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        // raised: panels stand off the ground, lines ride on top; carved: lines are cut into the panels
        const v = o.carve ? 0.32 + 0.3 * body[i] - 0.62 * ridge[i] : 0.3 * body[i] + 0.7 * ridge[i];
        h[i] = Math.max(0, Math.min(1, Math.max(v, 0) * 0.9 + rim[i] * 0.55));
      }
      // height texture (displacement) and its normal map (lighting of the fine lines)
      const hc = document.createElement("canvas"); hc.width = W; hc.height = H;
      const hx = hc.getContext("2d"), hi = hx.createImageData(W, H);
      for (let i = 0; i < n; i++) { const v = Math.round(h[i] * 255); hi.data[i * 4] = hi.data[i * 4 + 1] = hi.data[i * 4 + 2] = v; hi.data[i * 4 + 3] = 255; }
      hx.putImageData(hi, 0, 0);
      const nc = document.createElement("canvas"); nc.width = W; nc.height = H;
      const nx = nc.getContext("2d"), ni = nx.createImageData(W, H), s = 5.5;
      const at = (x, y) => h[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * s, dy = (at(x, y + 1) - at(x, y - 1)) * s, l = Math.hypot(dx, dy, 1), j = (y * W + x) * 4;
        ni.data[j] = Math.round((-dx / l * 0.5 + 0.5) * 255); ni.data[j + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); ni.data[j + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); ni.data[j + 3] = 255;
      }
      nx.putImageData(ni, 0, 0);
      if (heightTex) heightTex.dispose(); if (normalTex) normalTex.dispose();
      heightTex = new T.CanvasTexture(hc); normalTex = new T.CanvasTexture(nc);
      for (const t of [heightTex, normalTex]) { t.colorSpace = T.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; }
    }
    function applyMaterial() {
      const M = MATERIALS[o.material] || MATERIALS.stone;
      mat.color.setHex(M.color); mat.roughness = M.roughness; mat.metalness = M.metalness; mat.envMapIntensity = M.env;
      mat.displacementMap = heightTex; mat.normalMap = normalTex; mat.normalScale.set(1.1, 1.1);
      mat.displacementScale = 0.04 + 0.16 * o.depth; mat.displacementBias = 0;
      mat.needsUpdate = true;
      scene.background = new T.Color(M.ground);
      // the key light: low and raking from the upper left (light 0), up to overhead (light 1)
      const el = 0.14 + 1.2 * o.light, az = -2.35;
      key.position.set(Math.cos(az) * Math.cos(el) * 6, -Math.sin(az) * Math.cos(el) * 6, Math.sin(el) * 6);
    }
    function rebuildMesh() {
      if (mesh) { mesh.geometry.dispose(); scene.remove(mesh); }
      const w = aspect >= 1 ? 2 : 2 * aspect, h = aspect >= 1 ? 2 / aspect : 2;
      const seg = 600;
      const geo = new T.PlaneGeometry(w, h, Math.round(seg * (w / Math.max(w, h))), Math.round(seg * (h / Math.max(w, h))));
      mesh = new T.Mesh(geo, mat); scene.add(mesh);
      frame();
    }
    function frame() {
      const r = host.getBoundingClientRect(), cw = Math.max(1, r.width), ch = Math.max(1, r.height);
      renderer.setSize(cw, ch, false); camera.aspect = cw / ch;
      // fit the tablet in view, whichever side is longer
      const w = aspect >= 1 ? 2 : 2 * aspect, h = aspect >= 1 ? 2 / aspect : 2, fov = (camera.fov * Math.PI) / 180;
      const dist = Math.max(h / 2 / Math.tan(fov / 2), w / 2 / (Math.tan(fov / 2) * camera.aspect)) * 1.3;
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      draw();
    }
    function draw() { if (mesh) { mesh.rotation.x = tilt.x; mesh.rotation.y = tilt.y; } renderer.render(scene, camera); }

    // drag to turn the tablet a little in the light; it eases back when let go
    let drag = null, raf = 0;
    const settle = () => { tilt.x += (tilt.tx - tilt.x) * 0.15; tilt.y += (tilt.ty - tilt.y) * 0.15; draw(); if (Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.001) raf = requestAnimationFrame(settle); else raf = 0; };
    const kick = () => { if (!raf) raf = requestAnimationFrame(settle); };
    renderer.domElement.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, tx: tilt.tx, ty: tilt.ty }; renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.style.cursor = "grabbing"; });
    renderer.domElement.addEventListener("pointermove", (e) => { if (!drag) return; tilt.ty = Math.max(-0.7, Math.min(0.7, drag.ty + (e.clientX - drag.x) * 0.005)); tilt.tx = Math.max(-0.7, Math.min(0.4, drag.tx + (e.clientY - drag.y) * 0.005)); kick(); });
    const up = () => { if (!drag) return; drag = null; renderer.domElement.style.cursor = "grab"; tilt.tx = -0.18; tilt.ty = 0.12; kick(); };
    renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up);
    const ro = new ResizeObserver(() => frame()); ro.observe(host);

    const api = {
      async setSvg(svg) {
        const vb = viewBoxOf(svg), a = vb.w / vb.h;
        layers = await buildLayers(svg);
        combine(); applyMaterial();
        if (!mesh || Math.abs(a - aspect) > 1e-3) { aspect = a; rebuildMesh(); } else draw();
      },
      set(p) {
        const carveChanged = p && "carve" in p && p.carve !== o.carve;
        Object.assign(o, p || {});
        if (layers && carveChanged) combine();
        applyMaterial(); draw();
      },
      get options() { return { ...o }; },
      snapshot() { draw(); return renderer.domElement.toDataURL("image/png"); },
      dispose() { cancelAnimationFrame(raf); ro.disconnect(); if (mesh) mesh.geometry.dispose(); mat.dispose(); if (heightTex) heightTex.dispose(); if (normalTex) normalTex.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); },
    };
    return api;
  }

  window.Relief = { create, MATERIALS };
})();
