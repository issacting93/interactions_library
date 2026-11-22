/* INTERACTIONS: SkinLeg. A walker's leg as one solid that bends at the knee, with the drawing's detail carried on its surface.

   Two solids are made from the same leg drawing, once, in the rest pose (PartSolid; both have the same points, only their heights differ):
     shape    a rounded solid ("belly"): the leg's mass. Every vertex rides its own bone, and near a joint it is shared with the next bone
              (skin weights), so the knee bends through the solid instead of splitting it.
     detail   a carved solid ("blade", with creases): the drawn plates and grooves. Only its normals are kept, one per vertex, in the leg's
              own frame (along the bone, across it, off its plane), the way a normal map is baked from a detailed model onto a smooth one.
   Every frame (pose):
     each vertex is placed on its bone, and on the next one, and the two are mixed by its weight: the leg is continuous through the joint
     the shape's normals are taken from the posed solid; the detail normals are turned with their bones; the two are blended, the detail
     fading out near a joint (where the weights mix), so the plates melt into the knee rather than meeting at a seam

   The leg drawings are the walker's own (LimbArt): one drawing cut along its spine (sliceSpine: src = { polys, spine, fracs }), or one part
   per bone (segmentArt: src = { parts, fracs }). Its frames are the ones KitLook lays a leg's lines in, so the solid and the lines agree.

     const B = SkinLeg.bake(legDef, { thick, detail, knee })     once per leg drawing (both legs of a pair can share it); null if it cannot be made
     SkinLeg.pose(B, limb, legDef, out)                          every frame: limb = skeleton limb (joints, plane, side); out = { pos, nrm } (made if missing)
     SkinLeg.mesh(B)                                             { pos, nrm, idx, ver }: what EcologyRender.solids draws (pose bumps ver)        */
(function () {
  "use strict";
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t); };
  const DEF = { thick: 0.55, detail: 0.75, knee: 0.1, res: 36 };

  // vertex normals of an indexed triangle mesh (area weighted)
  function normals(P, I, out) {
    const N = out || new Float32Array(P.length); N.fill(0);
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx; N[a] += x; N[a + 1] += y; N[a + 2] += z; N[b] += x; N[b + 1] += y; N[b + 2] += z; N[c] += x; N[c + 1] += y; N[c + 2] += z; }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    return N;
  }

  // one drawing made solid twice: the shape (rounded) and the detail (carved), on the same points
  function twin(polys, o) {
    const PS = window.PartSolid; if (!PS || !window.Delaunator || !polys || !polys.length) return null;
    let part; try { part = PS.read(polys, { join: polys.length <= 240 }); } catch (e) { return null; } if (!part.outer.length) return null;
    let a, b; try { a = PS.build(part, { mode: "belly", thick: o.thick, inner: 0.15, crease: 0.1, edge: 0.05, res: o.res });
      b = PS.build(part, { mode: "blade", thick: o.thick, inner: 0.45, crease: 0.8, edge: 0.05, res: o.res }); } catch (e) { return null; }
    if (!a || a.empty || !b || b.positions.length !== a.positions.length) return null;
    return { a, b };
  }

  function bake(ld, opts) {
    const o = Object.assign({}, DEF, opts || {}), src = ld && ld.artObj && ld.artObj.src; if (!src) return null;
    const pieces = [];   // { a, b, map(sx, sy) -> [t, v], bone(t), sc }
    let Ls, starts;
    if (src.parts) {   // one drawing per bone (segmentArt, A = 100 along the whole leg): each laid end to end in the leg's frame, a knee drawn
      // across every joint so the pieces are one outline, and that outline made solid as one shape. Each part, made solid on its own (carved),
      // gives the detail: its normals are looked up from the shape's points, nearest first, so the plates of the thigh lie on the thigh
      const A = 100, fr = src.fracs; starts = []; let acc = 0; for (let b = 0; b < fr.length; b++) { starts.push(acc * A); acc += fr[b]; } Ls = acc * A;
      const laid = [], halfW = [];   // per bone: its polys in (t, v), and its half-width near each end
      src.parts.forEach((polys, bi) => {
        const pts = []; for (const pl of polys) for (let i = 0; i + 1 < pl.length; i += 2) pts.push([pl[i], pl[i + 1]]); if (!pts.length) return;
        const st = Math.max(1, Math.floor(pts.length / 200)), sm = pts.filter((_, i) => i % st === 0); let p = sm[0], q = sm[0], best = -1;
        for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) { const d = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2; if (d > best) { best = d; p = sm[i]; q = sm[j]; } }
        if (p[0] < q[0]) [p, q] = [q, p];
        const Li = Math.sqrt(best) || 1, ux = (q[0] - p[0]) / Li, uy = (q[1] - p[1]) / Li, sc = ((fr[bi] || 0) * A) / Li;
        const map = (x, y) => [starts[bi] + ((x - p[0]) * ux + (y - p[1]) * uy) * sc, ((x - p[0]) * -uy + (y - p[1]) * ux) * sc];
        const L = polys.map((pl) => { const o2 = new Array(pl.length); for (let i = 0; i + 1 < pl.length; i += 2) { const m = map(pl[i], pl[i + 1]); o2[i] = m[0]; o2[i + 1] = m[1]; } return o2; });
        // its half-width within 12% of each end: how wide the knee across that joint should be
        const end = (t0) => { let w = 0; for (const pl of L) for (let i = 0; i + 1 < pl.length; i += 2) if (Math.abs(pl[i] - t0) < 0.12 * fr[bi] * A) w = Math.max(w, Math.abs(pl[i + 1])); return w; };
        laid[bi] = L; halfW[bi] = [end(starts[bi]), end(starts[bi] + fr[bi] * A)];
      });
      const all = []; laid.forEach((L) => L && all.push(...L));
      for (let b = 1; b < fr.length; b++) { if (!laid[b] || !laid[b - 1]) continue;   // the knee: an oval across the joint, as wide as the narrower side
        const r = Math.max(1.2, 0.85 * Math.min(halfW[b - 1][1] || 3, halfW[b][0] || 3)), rl = Math.max(r * 1.4, 0.06 * A), c = starts[b], K = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; K.push(c + Math.cos(a) * rl, Math.sin(a) * r); } all.push(K); }
      const shape = twin(all, o); if (!shape) return null;
      const det = []; laid.forEach((L, bi) => { if (!L) return; const tw = twin(L, o); if (tw) det.push({ so: tw.b, bi }); });
      pieces.push({ a: shape.a, b: shape.a, sc: 1, bone: null, map: (x, y) => [x, y], det });
    } else if (src.polys && src.spine) {   // one drawing cut along its spine: every point measured along the spine (as sliceSpine does its lines)
      const spine = src.spine, cum = [0]; for (let i = 0; i + 1 < spine.length; i++) cum.push(cum[i] + Math.hypot(spine[i + 1][0] - spine[i][0], spine[i + 1][1] - spine[i][1]));
      Ls = cum[cum.length - 1] || 1; starts = [0]; src.fracs.reduce((acc, f) => (starts.push((acc + f) * Ls), acc + f), 0); starts.pop();
      const last = spine.length - 2;
      const proj = (x, y) => { let best = null; for (let i = 0; i <= last; i++) { const a = spine[i], b = spine[i + 1], ax = b[0] - a[0], ay = b[1] - a[1], l = Math.hypot(ax, ay) || 1;
        let u = ((x - a[0]) * ax + (y - a[1]) * ay) / (l * l); if (i > 0) u = Math.max(0, u); if (i < last) u = Math.min(1, u);
        const qx = a[0] + ax * u, qy = a[1] + ay * u, d2 = (x - qx) ** 2 + (y - qy) ** 2; if (!best || d2 < best[2]) best = [cum[i] + u * l, ((x - a[0]) * -ay + (y - a[1]) * ax) / l, d2]; } return best; };
      const tw = twin(src.polys, o); if (tw) pieces.push({ ...tw, sc: 1, bone: null, map: (x, y) => { const r = proj(x, y); return [r[0], r[1]]; } });
    }
    if (!pieces.length) return null;
    const nb = starts.length, boneAt = (t) => { let b = 0; while (b + 1 < nb && t >= starts[b + 1]) b++; return b; };
    let n = 0; for (const p of pieces) n += p.a.positions.length / 3;
    const rec = new Float32Array(n * 3), drec = new Float32Array(n * 3), b0 = new Uint8Array(n), b1 = new Uint8Array(n), w = new Float32Array(n), Is = [];
    const Z = o.knee * Ls; let off = 0;
    for (const pc of pieces) {
      const A = pc.a.positions, D = pc.b.positions, c = A.length / 3;
      for (let i = 0; i < c; i++) { const sx = pc.a.cx + A[i * 3], sy = pc.a.cy - A[i * 3 + 1], [t, v] = pc.map(sx, sy), j = off + i;
        rec[j * 3] = t; rec[j * 3 + 1] = v; rec[j * 3 + 2] = A[i * 3 + 2] * pc.sc; drec[j * 3] = t; drec[j * 3 + 1] = v; drec[j * 3 + 2] = D[i * 3 + 2] * pc.sc;
        // skin: its own bone, and the nearer neighbour shares it within Z of the joint (half and half at the joint itself)
        const b = pc.bone ? pc.bone() : boneAt(t); b0[j] = b; b1[j] = b; w[j] = 0;
        const dPrev = b > 0 ? t - starts[b] : Infinity, dNext = b + 1 < nb ? starts[b + 1] - t : Infinity;
        if (dPrev < dNext && dPrev < Z) { b1[j] = b - 1; w[j] = 0.5 * (1 - smooth(0, Z, Math.max(0, dPrev))); }
        else if (dNext < Z) { b1[j] = b + 1; w[j] = 0.5 * (1 - smooth(0, Z, Math.max(0, dNext))); } }
      for (const t of pc.a.indices) Is.push(t + off);
      off += c;
    }
    const I = new Uint32Array(Is);
    // the detail's normals, baked in the leg's frame, facing out of the face they lie on (+h on the top face, -h on the bottom)
    const dn = normals(drec, I); for (let i = 0; i < n; i++) if (dn[i * 3 + 2] * drec[i * 3 + 2] < 0) { dn[i * 3] *= -1; dn[i * 3 + 1] *= -1; dn[i * 3 + 2] *= -1; }
    if (pieces[0].det) {   // the detail from the parts, carved one by one: nearest point on the same face, within a few units, else none (the knee)
      const pts = [], nrm = [], cell = 2.5, H = new Map(), key = (x, y) => Math.floor(x / cell) + "," + Math.floor(y / cell);
      for (const { so } of pieces[0].det) { const P = so.positions, m = P.length / 3, R2 = new Float32Array(P.length); for (let i = 0; i < m; i++) { R2[i * 3] = so.cx + P[i * 3]; R2[i * 3 + 1] = so.cy - P[i * 3 + 1]; R2[i * 3 + 2] = P[i * 3 + 2]; }
        const N = normals(R2, so.indices); for (let i = 0; i < m; i++) { if (N[i * 3 + 2] * R2[i * 3 + 2] < 0) { N[i * 3] *= -1; N[i * 3 + 1] *= -1; N[i * 3 + 2] *= -1; }
          const j = pts.length / 3; pts.push(R2[i * 3], R2[i * 3 + 1], R2[i * 3 + 2]); nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); const k2 = key(R2[i * 3], R2[i * 3 + 1]); (H.get(k2) || H.set(k2, []).get(k2)).push(j); } }
      for (let i = 0; i < n; i++) { const x = rec[i * 3], y = rec[i * 3 + 1], z = rec[i * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell); let best = -1, bd = 9 * cell * cell;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const j of H.get((cx + dx) + "," + (cy + dy)) || []) { if (pts[j * 3 + 2] * z < 0) continue; const d = (pts[j * 3] - x) ** 2 + (pts[j * 3 + 1] - y) ** 2; if (d < bd) { bd = d; best = j; } }
        if (best >= 0) { dn[i * 3] = nrm[best * 3]; dn[i * 3 + 1] = nrm[best * 3 + 1]; dn[i * 3 + 2] = nrm[best * 3 + 2]; } }
    }
    let hmax = 0; for (let i = 0; i < n; i++) hmax = Math.max(hmax, Math.abs(rec[i * 3 + 2]));
    return { n, I, rec, dn, b0, b1, w, starts, Ls, L: ld.artObj.L, detail: o.detail, hmax, mesh: null };
  }

  // a bone's frame, as KitLook lays a leg's lines: d along the bone, pv across it (the drawing's plane, tilted to read from the side), nn off it
  function frames(B, limb, ld) {
    const J = limb.joints, k = ld.len / B.L, lens = ld.fracs.map((f) => f * ld.len), out = [], pl = limb.plane;
    for (let bi = 0; bi < lens.length; bi++) {
      const a = J[bi], b = J[bi + 1]; let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      let qx = pl.x, qy = pl.y, qz = pl.z; if (ld.faceUp) { const cl = Math.hypot(dz, dx) || 1; qx = dz / cl; qy = 0; qz = -dx / cl; }
      let vx = qy * dz - qz * dy, vy = qz * dx - qx * dz, vz = qx * dy - qy * dx; const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
      const s2 = ld.faceUp ? 1 : limb.side; let px = qx * s2 * 0.906 + vx * 0.423, py = qy * s2 * 0.906 + vy * 0.423, pz = qz * s2 * 0.906 + vz * 0.423; const pq = Math.hypot(px, py, pz) || 1; px /= pq; py /= pq; pz /= pq;
      out.push({ ax: a.x, ay: a.y, az: a.z, dx, dy, dz, px, py, pz, nx: dy * pz - dz * py, ny: dz * px - dx * pz, nz: dx * py - dy * px, ks: (l / lens[bi]) * k, k });
    }
    return out;
  }

  function pose(B, limb, ld, out) {
    const n = B.n; out = out || mesh(B); const P = out.pos, Nn = out.nrm, F = frames(B, limb, ld), R = B.rec, k = ld.len / B.L;
    const at = (f, bone, i, o) => { const s = (R[i * 3] - B.starts[bone]) * f.ks, v = R[i * 3 + 1] * k, h = R[i * 3 + 2] * k;
      o[0] = f.ax + f.dx * s + f.px * v + f.nx * h; o[1] = f.ay + f.dy * s + f.py * v + f.ny * h; o[2] = f.az + f.dz * s + f.pz * v + f.nz * h; };
    const p0 = [0, 0, 0], p1 = [0, 0, 0];
    for (let i = 0; i < n; i++) { const f0 = F[B.b0[i]], wi = B.w[i]; at(f0, B.b0[i], i, p0);
      if (wi > 0 && F[B.b1[i]]) { at(F[B.b1[i]], B.b1[i], i, p1); P[i * 3] = p0[0] + (p1[0] - p0[0]) * wi; P[i * 3 + 1] = p0[1] + (p1[1] - p0[1]) * wi; P[i * 3 + 2] = p0[2] + (p1[2] - p0[2]) * wi; }
      else { P[i * 3] = p0[0]; P[i * 3 + 1] = p0[1]; P[i * 3 + 2] = p0[2]; } }
    normals(P, B.I, Nn);
    // the posed solid's own normals face out of its faces: the top face's along +nn of its bone, as the detail's do
    let agree = 0; for (let i = 0; i < n; i += 7) { const h = R[i * 3 + 2]; if (Math.abs(h) < 0.3 * B.hmax) continue; const f = F[B.b0[i]]; agree += Math.sign(h) * (Nn[i * 3] * f.nx + Nn[i * 3 + 1] * f.ny + Nn[i * 3 + 2] * f.nz); }
    const flip = agree < 0 ? -1 : 1, D = B.dn, det = B.detail;
    for (let i = 0; i < n; i++) {
      const wi = B.w[i], f0 = F[B.b0[i]], f1 = F[B.b1[i]] || f0, nt = D[i * 3], nv = D[i * 3 + 1], nh = D[i * 3 + 2];
      // the detail normal turned with its bone (and the next one, by the skin weight)
      let x = 0, y = 0, z = 0;
      for (const [f, q] of [[f0, 1 - wi], [f1, wi]]) { if (!q) continue; const a = nt / f.ks, b = nv / f.k, c = nh / f.k;
        x += q * (f.dx * a + f.px * b + f.nx * c); y += q * (f.dy * a + f.py * b + f.ny * c); z += q * (f.dz * a + f.pz * b + f.nz * c); }
      const dl = Math.hypot(x, y, z) || 1, m = det * (1 - 2 * wi);   // none at the joint itself
      let sx = Nn[i * 3] * flip, sy = Nn[i * 3 + 1] * flip, sz = Nn[i * 3 + 2] * flip;
      sx += (x / dl - sx) * m; sy += (y / dl - sy) * m; sz += (z / dl - sz) * m; const sl = Math.hypot(sx, sy, sz) || 1;
      Nn[i * 3] = sx / sl; Nn[i * 3 + 1] = sy / sl; Nn[i * 3 + 2] = sz / sl;
    }
    out.ver = (out.ver || 0) + 1;
    return out;
  }
  function mesh(B) { return { pos: new Float32Array(B.n * 3), nrm: new Float32Array(B.n * 3), idx: B.I.slice(), ver: 0, dynamic: true }; }

  window.SkinLeg = { bake, pose, mesh, frames, DEF };
})();
