(opts) => {
  const { Person, S, THREE } = window.Townsfolk;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0), TAU = Math.PI * 2, PPM = opts.ppm;
  const POINTS = ["P", "mid", "chest", "nb", "neckTop", "hc"], PARRS = ["hips", "knees", "ankles", "heels", "toes", "sh", "els", "wrs", "tips"];
  const DIRS = ["pf", "pl", "pu", "cu", "cf", "cl", "cf0", "hf", "hl", "hu"];

  // pose relative to the person: root on the origin, facing +z
  function rel(p) {
    const yaw = p.yaw, root = p.root.clone().setY(0), q = {};
    const pt = (v) => v.clone().sub(root).applyAxisAngle(UP, -yaw), dr = (v) => v.clone().applyAxisAngle(UP, -yaw);
    for (const k of POINTS) q[k] = pt(p.pose[k]);
    for (const k of PARRS) q[k] = p.pose[k].map(pt);
    for (const k of DIRS) q[k] = dr(p.pose[k]);
    if (p.cp) { q.cp = p.cp.map(pt); q.coatW = p.coatW.map(pt); }
    return q;
  }
  function make(idx, taken) {
    Object.assign(S, { stride: taken ? 0.9 : 0, joints: taken ? 0.9 : 0, gaze: 0, weight: 0, time: 0, speed: 1 });
    const p = new Person(idx);
    p.sus = 1; p.pace = 1.2; p.noGlance = true; p.cool = 1e9; p.tracking = false;
    if (opts.override) Object.assign(p, opts.override);
    return p;
  }
  function place(p, x, z, yaw) {
    p.root.set(x, 0, z); p.yaw = yaw; p.cp = null;
    p.feet.forEach((f) => { f.pos.set(x + Math.cos(yaw) * f.side * p.d.hipHalf, 0, z - Math.sin(yaw) * f.side * p.d.hipHalf); f.yaw = yaw; f.stepping = false; });
  }
  function walkCycle(idx, taken) {
    const p = make(idx, taken);
    place(p, -7, 5, Math.PI / 2); p.goal.set(9, 0, 5); p.wait = 0;
    const dt = 1 / 240, snaps = [], lands = []; let t = 0, prev = p.next;
    for (let i = 0; i < 240 * 10; i++) {
      t += dt; p.update(dt, t, []);
      if (t > 3.5) {
        snaps.push({ t, q: rel(p), st: p.feet.map((f) => f.stepping) });
        if (p.next !== prev && p.next === 1) lands.push(t);
      }
      prev = p.next;
      if (lands.length >= 3) break;
    }
    const t0 = lands[1], period = lands[2] - lands[1], frames = [];
    for (let k = 0; k < 8; k++) {
      const tk = t0 + (k * period) / 8;
      let best = snaps[0]; for (const s of snaps) if (Math.abs(s.t - tk) < Math.abs(best.t - tk)) best = s;
      frames.push(best.q);
    }
    const info = { name: p.name, H: p.H, build: p.build, d: p.d, hat: p.hat, coat: p.coat, period, speed: p.speed };
    p.dispose();
    return { frames, info };
  }
  function idle(idx, taken) {
    const p = make(idx, taken);
    place(p, 0, 5.5, 0.3); p.goal.copy(p.root); p.wait = 1e9;
    const dt = 1 / 240; let t = 0;
    for (let i = 0; i < 240 * 3; i++) { t += dt; p.update(dt, t, []); }
    const q = rel(p); p.dispose(); return q;
  }

  /* ---------- flat projection of the line-art skin, one closed shape per body part ---------- */
  function hull(pts) {
    const a = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const lo = [], hi = [];
    for (const p of a) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  function frameSVG(q, info, az, el, taken) {
    const D = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const R = V().crossVectors(UP, V(Math.sin(az), 0, Math.cos(az))).normalize();
    const U = V().crossVectors(D, R).normalize();
    const pr = (p) => [p.dot(R) * PPM, -p.dot(U) * PPM];
    const dep = (p) => -p.dot(D);
    const f = (n) => (Math.round(n * 10) / 10).toString();
    const path2 = (pts, closed) => "M" + pts.map((a) => f(a[0]) + " " + f(a[1])).join("L") + (closed ? "Z" : "");
    const path3 = (pts, closed) => path2(pts.map(pr), closed);
    const H = info.H, b = info.build, d = info.d;
    const groups = [];
    const group = (name, layer, depth) => { const g = { name, layer, depth, paths: [] }; groups.push(g); return g; };
    const shape = (g, name, pts3, closed = true) => g.paths.push({ name, cls: "part", d: path3(pts3, closed) });
    const detail = (g, name, pts3, cls = "detail") => g.paths.push({ name, cls, d: path3(pts3, false) });

    function tube(A, B, rA, rB, rM = (rA + rB) / 2, capA = false, capB = false) {
      const dir = V().subVectors(B, A), len = dir.length(); dir.divideScalar(len || 1);
      const s = V().crossVectors(dir, D); if (s.lengthSq() < 1e-8) s.crossVectors(dir, UP); if (s.lengthSq() < 1e-8) s.set(1, 0, 0); s.normalize();
      const M = V().addVectors(A, B).multiplyScalar(0.5), pts = [];
      pts.push(A.clone().addScaledVector(s, rA), M.clone().addScaledVector(s, rM), B.clone().addScaledVector(s, rB));
      if (capB) for (let j = 1; j < 6; j++) { const th = (j / 6) * Math.PI; pts.push(B.clone().addScaledVector(s, rB * Math.cos(th)).addScaledVector(dir, rB * Math.sin(th))); }
      pts.push(B.clone().addScaledVector(s, -rB), M.clone().addScaledVector(s, -rM), A.clone().addScaledVector(s, -rA));
      if (capA) for (let j = 1; j < 6; j++) { const th = (j / 6) * Math.PI; pts.push(A.clone().addScaledVector(s, -rA * Math.cos(th)).addScaledVector(dir, -rA * Math.sin(th))); }
      return pts;
    }
    function ellipse(c, upAxis, rx, ry, jaw = 0, tip = 0, n = 28) {
      const u = upAxis.clone().addScaledVector(D, -upAxis.dot(D)); if (u.lengthSq() < 1e-8) u.set(0, 1, 0); u.normalize();
      const r = V().crossVectors(u, D).normalize(), pts = [];
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU, sy = Math.sin(th);
        const x = Math.cos(th) * rx * (1 - jaw * Math.max(0, -sy));
        let y = sy * ry; if (tip && sy > 0) y *= 1 + tip * Math.pow(sy, 8);
        pts.push(c.clone().addScaledVector(r, x).addScaledVector(u, y));
      }
      return pts;
    }
    function ring(c, nrm, rA, rB, fwd, n = 28) {
      const a = fwd.clone().addScaledVector(nrm, -fwd.dot(nrm)).normalize(), bb = V().crossVectors(nrm, a).normalize(), pts = [];
      for (let i = 0; i < n; i++) { const th = (i / n) * TAU; pts.push(c.clone().addScaledVector(a, Math.cos(th) * rA).addScaledVector(bb, Math.sin(th) * rB)); }
      return pts;
    }
    const nearHalf = (pts, center) => { // visible (camera-side) runs of a closed ring, as open polylines
      const n = pts.length, vis = pts.map((p) => dep(p) <= dep(center)), runs = [];
      let start = vis.findIndex((v, i) => v && !vis[(i - 1 + n) % n]); if (start < 0) return vis[0] ? [pts.concat([pts[0]])] : [];
      let cur = null;
      for (let k = 0; k <= n; k++) { const i = (start + k) % n; if (vis[i]) { (cur ||= []).push(pts[i]); } else if (cur) { runs.push(cur); cur = null; } }
      if (cur) runs.push(cur);
      return runs.filter((r) => r.length > 1);
    };

    const sideGap = Math.abs(dep(q.sh[0]) - dep(q.sh[1])) > 0.05 * H;
    // legs
    [0, 1].forEach((i) => {
      const g = group(`leg-${i ? "R" : "L"}`, 1, dep(q.knees[i]));
      shape(g, "thigh", tube(q.hips[i], q.knees[i], 0.06 * H * b, 0.045 * H, 0.056 * H * b));
      shape(g, "shin", tube(q.knees[i], q.ankles[i], 0.045 * H, 0.03 * H, 0.043 * H));
      shape(g, "foot", tube(q.heels[i], q.toes[i], 0.028 * H, 0.022 * H, 0.026 * H, true, true));
    });
    const rw = 0.1 * H * b;
    // coat skirt
    if (info.coat !== "none" && q.cp) {
      const g = group("coat", 2, dep(q.P));
      const pts2 = q.coatW.concat(q.cp).map(pr);
      g.paths.push({ name: "skirt", cls: "part", d: path2(hull(pts2), true) });
      nearHalf(q.cp, q.P).forEach((run, k) => detail(g, k ? "hem-" + (k + 1) : "hem", run));
      if (q.pf.dot(D) > 0.2) { const fr = Math.round(q.cp.length / 4); detail(g, "seam", [q.coatW[fr], q.cp[fr]]); }
    }
    // torso
    {
      const g = group("torso", 3, dep(q.P));
      shape(g, "body", tube(q.P, q.chest, rw, d.shoulder * 0.96, rw * 1.08));
      detail(g, "shoulders", [q.sh[0], q.nb, q.sh[1]]);
      if (q.cf.dot(D) > 0.15) {
        if (info.coat !== "none") {
          const lap = q.chest.clone().addScaledVector(q.cu, -0.09 * H).addScaledVector(q.cf, rw * 0.95);
          detail(g, "lapels", [q.nb.clone().addScaledVector(q.cl, 0.035 * H).addScaledVector(q.cf, 0.02 * H), lap, q.nb.clone().addScaledVector(q.cl, -0.035 * H).addScaledVector(q.cf, 0.02 * H)]);
          detail(g, "placket", [lap, q.P.clone().addScaledVector(q.cf, rw * 1.02)]);
          [0.35, 0.55, 0.75].forEach((u, k) => { const c = q.chest.clone().lerp(q.P, u).addScaledVector(q.cf, rw * 1.02); detail(g, "button-" + (k + 1), [c.clone().addScaledVector(q.cl, 0.007 * H), c.clone().addScaledVector(q.cl, -0.007 * H)]); });
        }
      }
      if (info.coat === "none") for (const run of nearHalf(ring(q.P.clone().addScaledVector(UP, 0.01 * H), UP, rw * 1.02, rw * 0.85, q.pf), q.P)) detail(g, "belt", run);
    }
    // arms
    [0, 1].forEach((i) => {
      const far = sideGap && dep(q.sh[i]) > dep(q.sh[1 - i]);
      const g = group(`arm-${i ? "R" : "L"}`, far ? 0 : 5, dep(q.els[i]));
      shape(g, "upper", tube(q.sh[i], q.els[i], 0.042 * H * b, 0.034 * H, 0.04 * H * b, true));
      shape(g, "fore", tube(q.els[i], q.wrs[i], 0.034 * H, 0.025 * H));
      shape(g, "hand", tube(q.wrs[i], q.tips[i], 0.024 * H, 0.018 * H, 0.025 * H, false, true));
    });
    shape(group("neck", 6, dep(q.nb)), "neck", tube(q.nb, q.neckTop, 0.03 * H, 0.027 * H));
    const facing = q.hf.dot(D);
    if (info.hat === "hood") {
      const g = group("hood", facing > 0 ? 6.5 : 7.5, dep(q.hc));
      const hp = ellipse(q.hc.clone().addScaledVector(q.hf, -0.02 * H).addScaledVector(q.hu, 0.012 * H), q.hu, d.headRx * 1.45, d.headRy * 1.32, 0.1, 0.35);
      shape(g, "hood", hp);
      detail(g, "drape-L", [hp[Math.round((28 * 5) / 8)], q.sh[0]]); detail(g, "drape-R", [hp[Math.round((28 * 7) / 8)], q.sh[1]]);
    }
    {
      const g = group("head", 7, dep(q.hc));
      shape(g, "head", ellipse(q.hc, q.hu, d.headRx, d.headRy, 0.25));
      if (facing > 0.15) {
        for (const [s, nm] of [[1, "eye-L"], [-1, "eye-R"]]) {
          const e = q.hc.clone().addScaledVector(q.hf, d.headRx * 0.9).addScaledVector(q.hu, d.headRy * 0.1).addScaledVector(q.hl, s * d.headRx * 0.4);
          const w = (taken ? 0.016 : 0.011) * H;
          detail(g, nm, [e.clone().addScaledVector(q.hl, -w / 2), e.clone().addScaledVector(q.hl, w / 2)], taken ? "eye" : "detail");
          if (taken) detail(g, nm + "-v", [e.clone().addScaledVector(q.hu, 0.006 * H), e.clone().addScaledVector(q.hu, -0.006 * H)], "eye");
        }
        const m = q.hc.clone().addScaledVector(q.hf, d.headRx * 0.85).addScaledVector(q.hu, -d.headRy * 0.45);
        detail(g, "mouth", [m.clone().addScaledVector(q.hl, 0.009 * H), m.clone().addScaledVector(q.hl, -0.009 * H)]);
      }
    }
    const top = q.hc.clone().addScaledVector(q.hu, d.headRy * 0.78);
    if (info.hat === "top") {
      const g = group("hat", 8, dep(top));
      shape(g, "brim", ring(top, q.hu, 0.105 * H, 0.09 * H, q.hf));
      const crown = top.clone().addScaledVector(q.hu, 0.15 * H);
      shape(g, "crown", tube(top, crown, 0.064 * H, 0.07 * H, 0.066 * H));
      shape(g, "crown-top", ring(crown, q.hu, 0.07 * H, 0.062 * H, q.hf));
      const band = top.clone().addScaledVector(q.hu, 0.022 * H);
      for (const run of nearHalf(ring(band, q.hu, 0.066 * H, 0.058 * H, q.hf), band)) detail(g, "band", run);
    } else if (info.hat === "brim") {
      const g = group("hat", 8, dep(top)), base = top.clone().addScaledVector(q.hu, -0.01 * H);
      shape(g, "brim", ring(base, q.hu, 0.165 * H, 0.15 * H, q.hf));
      shape(g, "crown", tube(base, top.clone().addScaledVector(q.hu, 0.06 * H), 0.07 * H, 0.055 * H, 0.068 * H, false, true));
    }
    groups.sort((a, c) => a.layer - c.layer || c.depth - a.depth);

    // skeleton guide
    const bone = [];
    for (let i = 0; i < 2; i++) bone.push([q.P, q.hips[i], q.knees[i], q.ankles[i], q.toes[i]]);
    bone.push([q.P, q.mid, q.chest, q.nb, q.neckTop, q.hc]); bone.push([q.sh[0], q.sh[1]]);
    for (let i = 0; i < 2; i++) bone.push([q.sh[i], q.els[i], q.wrs[i], q.tips[i]]);
    const joints = [q.P, q.chest, q.nb, q.hc, ...q.hips, ...q.knees, ...q.ankles, ...q.sh, ...q.els, ...q.wrs].map(pr).map((a) => [Math.round(a[0] * 10) / 10, Math.round(a[1] * 10) / 10]);
    // bounds
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const g of groups) for (const p of g.paths) { const n = p.d.match(/-?\d+\.?\d*/g).map(Number); for (let j = 0; j < n.length; j += 2) { x0 = Math.min(x0, n[j]); x1 = Math.max(x1, n[j]); y0 = Math.min(y0, n[j + 1]); y1 = Math.max(y1, n[j + 1]); } }
    const nm = { pelvis: q.P, chest: q.chest, "neck-base": q.nb, "neck-top": q.neckTop, head: q.hc, "hip-L": q.hips[0], "hip-R": q.hips[1], "knee-L": q.knees[0], "knee-R": q.knees[1], "ankle-L": q.ankles[0], "ankle-R": q.ankles[1], "toe-L": q.toes[0], "toe-R": q.toes[1], "heel-L": q.heels[0], "heel-R": q.heels[1], "shoulder-L": q.sh[0], "shoulder-R": q.sh[1], "elbow-L": q.els[0], "elbow-R": q.els[1], "wrist-L": q.wrs[0], "wrist-R": q.wrs[1], "fingertip-L": q.tips[0], "fingertip-R": q.tips[1] };
    const named = {}; for (const [k, v] of Object.entries(nm)) { const a = pr(v); named[k] = [Math.round(a[0] * 10) / 10, Math.round(a[1] * 10) / 10, Math.round(dep(v) * 1000) / 1000]; }
    const headTop = pr(q.hc.clone().addScaledVector(q.hu, d.headRy)); named["head-top"] = [Math.round(headTop[0] * 10) / 10, Math.round(headTop[1] * 10) / 10, 0];
    return { named, facing, groups: groups.map((g) => ({ name: g.name, paths: g.paths })), bones: bone.map((ch) => path3(ch, false)).join(""), joints, bounds: [x0, y0, x1, y1] };
  }

  if (opts.template) {
    const q = idle(opts.template, false), info = { H: 0, build: 1 };
    const p = make(opts.template, false); Object.assign(info, { name: p.name, H: p.H, build: p.build, d: p.d, hat: p.hat, coat: p.coat }); p.dispose();
    const el = (opts.elevation * Math.PI) / 180;
    return opts.dirs.map((dd) => ({ ...dd, frame: frameSVG(q, info, (dd.az * Math.PI) / 180, el, false) }));
  }
  const out = [];
  for (const idx of opts.people) for (const taken of [false, true]) {
    const wc = walkCycle(idx, taken), id = idle(idx, taken), el = (opts.elevation * Math.PI) / 180;
    const rows = opts.dirs.map((dd) => ({ ...dd, frames: [...wc.frames, id].map((q) => frameSVG(q, wc.info, (dd.az * Math.PI) / 180, el, taken)) }));
    out.push({ idx, taken, info: { name: wc.info.name, H: wc.info.H, hat: wc.info.hat, coat: wc.info.coat, period: wc.info.period, speed: wc.info.speed }, rows });
  }
  return out;
}
