// Runs inside the Walker Bestiary page (rig-sheets.py evaluates it there).
// Builds a flat, top-down rig sheet SVG for every walker: one group per leg, one closed outline per bone.
(() => {
  const { CREATURES, PARTS, mapPart, sliceLimb } = window.WalkerBestiary;
  const f = (n) => (Math.round(n * 100) / 100).toString();
  const BONE_NAMES = { 3: ["femur", "tibia", "tarsus"], 4: ["coxa", "femur", "tibia", "tarsus"] };
  const boneNames = (n) => BONE_NAMES[n] || Array.from({ length: n }, (_, i) => "seg" + (i + 1));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // join consecutive [x1,y1,x2,y2] segments into polylines
  function pathFromSegs(segs) {
    let d = "", lx = Infinity, ly = Infinity;
    for (const s of segs) {
      if (Math.abs(s[0] - lx) > 1e-3 || Math.abs(s[1] - ly) > 1e-3) d += `M${f(s[0])} ${f(s[1])}`;
      d += `L${f(s[2])} ${f(s[3])}`; lx = s[2]; ly = s[3];
    }
    return d;
  }
  function pathFromPolys(polys, closed) {
    return polys.map((p) => "M" + p.map((q) => f(q[0]) + " " + f(q[1])).join("L") + (closed ? "Z" : "")).join("");
  }

  function build(key, C) {
    const pv = C.param ? C.param.value : 0;
    const def = C.build(pv);
    const U = 100;                                   // px per world unit before fitting
    const P = (x, z) => [-x * U, -z * U];            // top view: creature's left on the left, head up
    const bbox = [1e9, 1e9, -1e9, -1e9];
    const grow = (p) => { bbox[0] = Math.min(bbox[0], p[0]); bbox[1] = Math.min(bbox[1], p[1]); bbox[2] = Math.max(bbox[2], p[0]); bbox[3] = Math.max(bbox[3], p[1]); };
    const L = { veil: [], body: [], orn: [], accent: [], carve: [], halo: [], legs: [], arms: [], guides: [], prey: [] };
    const vf = def.flatLimbs ? 1 : 0.6;

    // body segments laid straight, nose up
    let zOff = 0;
    def.segs.forEach((sd, si) => {
      zOff -= sd.gap || 0;
      const segPaths = [];
      for (const e of sd.parts) {
        const polys = e.polys || PARTS[e.id].polys, mir = e.polys ? !!e.mirror : PARTS[e.id].side === "left";
        for (const m of mir ? [false, true] : [false]) {
          const out = polys.map((pl) => { const q = []; for (let j = 0; j < pl.length; j += 2) { const w = mapPart(e, pl[j], pl[j + 1], m); const p = P(w[0], w[2] + zOff); grow(p); q.push(p); } return q; });
          segPaths.push({ id: e.id || (e.mirror ? "ornaments" : "body"), d: pathFromPolys(out, false), orn: !!(e.polys && e.mirror) });
        }
      }
      L.body.push({ si, paths: segPaths, gap: sd.gap || 0, h: sd.h });

      // legs: each drawn limb keeps its drawn shape, turned to its rig direction; every bone is a closed outline
      const sideCount = { 1: 0, "-1": 0 };
      sd.legs.forEach((ld, li) => {
        const sides = ld.radial ? [0] : [1, -1];
        for (const side of sides) {
          const a = ld.ang * Math.PI / 180, sx = side || 1;
          const s = ld.radial ? (Math.sin(a) >= 0 ? 1 : -1) : side;
          const hip = [ld.hip[0] * sx, ld.hip[2] + zOff], dir = [Math.sin(a) * sx, Math.cos(a)];
          const art = ld.artObj || sliceLimb(ld.art, ld.fracs);
          const lens = ld.fracs.map((fr) => fr * ld.len);
          const name = ld.radial ? "A" + (li + 1) : (side > 0 ? "L" : "R") + (++sideCount[side] + L.legs.filter((x) => x.seg < si && x.side === side).length);
          const pl = placeLimb(art, hip, dir, s, ld.len / art.L, boneNames(lens.length));
          const rest = P(hip[0] + dir[0] * ld.len * ld.reach, hip[1] + dir[1] * ld.len * ld.reach);
          L.legs.push({ name, side, seg: si, bones: pl.bones.map((b, i) => ({ ...b, len: lens[i] })), joints: pl.joints, guide: pl.guide, rest, hip: pl.joints[0], ang: ld.ang, len: ld.len, reach: ld.reach, part: ld.art || "chain", tentacle: !!ld.tentacle });
        }
      });
      sd.arms.forEach((ad) => {
        for (const side of [1, -1]) {
          const mount = [ad.mount[0] * side, ad.mount[2] + zOff], rest = [ad.rest[0] * side, ad.rest[2] + zOff];
          let dir = [rest[0] - mount[0], rest[1] - mount[1]]; const dl = Math.hypot(dir[0], dir[1]) || 1; dir = [dir[0] / dl, dir[1] / dl];
          const art = sliceLimb(ad.art, ad.fracs);
          const pl = placeLimb(art, mount, dir, side, ad.len / art.L, ["upper", "fore", "claw"]);
          L.arms.push({ name: (side > 0 ? "L" : "R") + "-claw", bones: pl.bones.map((b, i) => ({ ...b, len: ad.fracs[i] * ad.len })), joints: pl.joints, guide: pl.guide, part: ad.art, len: ad.len });
        }
      });

      // Turn a drawn limb into closed per-bone outlines, placed rigidly (rotate + scale only) at its hip
      function placeLimb(art, hip, dir, s, k, names) {
        const { polys, spine, fracs } = art.src;
        const J = spine[0], Tt = spine[spine.length - 1];
        const cl = Math.hypot(Tt[0] - J[0], Tt[1] - J[1]) || 1, ux = (Tt[0] - J[0]) / cl, uy = (Tt[1] - J[1]) / cl;
        const perp = [-dir[1] * s, dir[0] * s];
        const map = (x, y) => { const rx = x - J[0], ry = y - J[1], al = rx * ux + ry * uy, v = -rx * uy + ry * ux; const p = P(hip[0] + (dir[0] * al + perp[0] * v) * k, hip[1] + (dir[1] * al + perp[1] * v) * k); grow(p); return p; };
        const cum = [0]; for (let i = 0; i + 1 < spine.length; i++) cum.push(cum[i] + Math.hypot(spine[i + 1][0] - spine[i][0], spine[i + 1][1] - spine[i][1]));
        const Ls = cum[cum.length - 1] || 1, last = spine.length - 2;
        const proj = (x, y) => {
          let best = null;
          for (let i = 0; i <= last; i++) {
            const A = spine[i], B = spine[i + 1], ax = B[0] - A[0], ay = B[1] - A[1], l = Math.hypot(ax, ay) || 1;
            let u = ((x - A[0]) * ax + (y - A[1]) * ay) / (l * l); if (i > 0) u = Math.max(0, u); if (i < last) u = Math.min(1, u);
            const d2 = (x - A[0] - ax * u) ** 2 + (y - A[1] - ay * u) ** 2;
            if (!best || d2 < best[1]) best = [cum[i] + u * l, d2];
          }
          return best[0];
        };
        const cuts = []; fracs.reduce((acc, fr) => (cuts.push((acc + fr) * Ls), acc + fr), 0); cuts.pop();
        const boneOf = (t) => { let b = 0; while (b < cuts.length && t >= cuts[b]) b++; return b; };
        const out = fracs.map(() => []);
        for (const poly of polys) {
          // densify so bone membership changes in small steps
          let pts = [];
          for (let i = 0; i + 3 < poly.length; i += 2) {
            const n = Math.max(1, Math.ceil(Math.hypot(poly[i + 2] - poly[i], poly[i + 3] - poly[i + 1]) / 1.5));
            for (let q = 0; q < n; q++) pts.push([poly[i] + ((poly[i + 2] - poly[i]) * q) / n, poly[i + 1] + ((poly[i + 3] - poly[i + 1]) * q) / n]);
          }
          pts.push([poly[poly.length - 2], poly[poly.length - 1]]);
          const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01;
          if (closed) pts.pop();
          const t = pts.map((p) => proj(p[0], p[1])), b = t.map(boneOf);
          if (b.every((x) => x === b[0])) { out[b[0]].push({ pts, closed }); continue; }
          let seq = pts, bt = b, tt = t;
          if (closed) {
            let r = 1; while (r < pts.length && b[r] === b[r - 1]) r++;
            if (r >= pts.length) r = 0;
            seq = pts.slice(r).concat(pts.slice(0, r)); bt = b.slice(r).concat(b.slice(0, r)); tt = t.slice(r).concat(t.slice(0, r));
            seq = seq.concat([seq[0]]); bt = bt.concat([bt[0]]); tt = tt.concat([tt[0]]);
          }
          const runs = []; let cur = { b: bt[0], pts: [seq[0]] };
          for (let j = 1; j < seq.length; j++) {
            if (bt[j] === cur.b) { cur.pts.push(seq[j]); continue; }
            // crossing: walk every cut between the two bones
            const step = bt[j] > cur.b ? 1 : -1;
            for (let bb = cur.b; bb !== bt[j]; bb += step) {
              const ct = cuts[step > 0 ? bb : bb - 1], f0 = (ct - tt[j - 1]) / ((tt[j] - tt[j - 1]) || 1), fc = Math.max(0, Math.min(1, f0));
              const c = [seq[j - 1][0] + (seq[j][0] - seq[j - 1][0]) * fc, seq[j - 1][1] + (seq[j][1] - seq[j - 1][1]) * fc];
              cur.pts.push(c); runs.push(cur); cur = { b: bb + step, pts: [c] };
            }
            cur.pts.push(seq[j]);
          }
          runs.push(cur);
          if (closed) {
            // the last run wraps back into the first: merge, then join each bone's runs in order and close along the cuts
            if (runs.length > 1 && runs[runs.length - 1].b === runs[0].b) { const lr = runs.pop(); runs[0].pts = lr.pts.concat(runs[0].pts.slice(1)); }
            const byBone = new Map();
            for (const r of runs) { if (!byBone.has(r.b)) byBone.set(r.b, []); byBone.get(r.b).push(...r.pts); }
            for (const [bb, p] of byBone) out[bb].push({ pts: p, closed: true });
          } else for (const r of runs) out[r.b].push({ pts: r.pts, closed: false });
        }
        const bones = out.map((parts, i) => ({
          name: names[i] || "seg" + (i + 1),
          d: parts.map((pp) => "M" + pp.pts.map((q) => { const m = map(q[0], q[1]); return f(m[0]) + " " + f(m[1]); }).join("L") + (pp.closed ? "Z" : "")).join(""),
        }));
        const at = (tv) => { let i = 0; while (i < spine.length - 2 && cum[i + 1] < tv) i++; const A = spine[i], B = spine[i + 1], l = (cum[i + 1] - cum[i]) || 1, u = Math.min(1, Math.max(0, (tv - cum[i]) / l)); return map(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u); };
        const joints = [map(J[0], J[1]), ...cuts.map(at), map(Tt[0], Tt[1])];
        const guide = spine.map((p) => map(p[0], p[1]));
        return { bones, joints, guide };
      }
    });

    // Forge-export extras: veil, accent fills, carve lines, halos
    const X = def.extras;
    if (X) {
      const { spec, k } = X;
      const sp = (pl) => { const q = []; for (let j = 0; j < pl.length; j += 2) { const p = P((200 - pl[j]) * k, (spec.cy - pl[j + 1]) * k); grow(p); q.push(p); } return q; };
      L.veil = spec.veil.map(sp);
      L.accent = spec.accent.concat(spec.accent.map((pl) => pl.map((v, j) => (j % 2 ? v : 400 - v)))).map(sp);
      L.carve = spec.carve.map(sp);
      if (X.M.halo) L.halo = spec.halos.flatMap((h) => h.polys.map(sp));
    }
    if (def.prey) {
      const pp = PARTS[def.prey.id].polys.map((pl) => { const q = []; for (let j = 0; j < pl.length; j += 2) q.push([(pl[j] - 200) * def.prey.k * U, (pl[j + 1] - 35.2) * def.prey.k * U]); return q; });
      L.prey = { polys: pp, k: def.prey.k, kind: def.prey.kind, id: def.prey.id };
    }

    // fit: scale so the longest side is ~900px, pad 60, put the label band on top
    const W0 = bbox[2] - bbox[0], H0 = bbox[3] - bbox[1], fit = 900 / Math.max(W0, H0), pad = 60, top = 70;
    const Wd = Math.max(720, W0 * fit + pad * 2), Hd = H0 * fit + pad + top + (L.prey.polys ? 120 : 40);
    const tx = (Wd - W0 * fit) / 2 - bbox[0] * fit, ty = top - bbox[1] * fit;
    const sw = f(1.2 / fit);  // keep strokes ~1.2px after scaling
    const lay = (id, label, inner, attrs = "") => `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}"${attrs}>${inner}</g>`;
    const meta = `${esc(C.name)} — ${L.legs.length} legs${L.arms.length ? ", " + L.arms.length + " claws" : ""}, ${def.segs.length} body segment${def.segs.length > 1 ? "s" : ""}`;

    const legsSvg = L.legs.map((g) => `<g id="leg-${g.name}" data-hip="${f(g.hip[0])},${f(g.hip[1])}" data-angle="${f(g.ang)}" data-length="${f(g.len)}" data-reach="${f(g.reach)}" data-source="${esc(g.part)}"${g.tentacle ? ' data-tentacle="true"' : ""}>` +
      g.bones.map((b) => `<path id="leg-${g.name}-${b.name}" data-bone-length="${f(b.len)}" d="${b.d}"/>`).join("") + `</g>`).join("");
    const armsSvg = L.arms.map((g) => `<g id="arm-${g.name}" data-length="${f(g.len)}" data-source="${esc(g.part)}">` + g.bones.map((b) => `<path id="arm-${g.name}-${b.name}" d="${b.d}"/>`).join("") + `</g>`).join("");
    const bodySvg = L.body.map((s) => `<g id="segment-${s.si}" data-gap="${f(s.gap)}" data-height="${f(s.h)}">` + s.paths.filter((p) => !p.orn).map((p) => `<path data-source="${esc(p.id)}" d="${p.d}"/>`).join("") + `</g>`).join("");
    const ornSvg = L.body.flatMap((s) => s.paths.filter((p) => p.orn)).map((p) => `<path d="${p.d}"/>`).join("");
    const guides = [...L.legs, ...L.arms].map((g) => {
      const j = g.joints;
      const line = `<path d="M${(g.guide || j).map((p) => f(p[0]) + " " + f(p[1])).join("L")}" stroke="#e8b04a" fill="none"/>`;
      const dots = j.map((p, i) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f((i === 0 ? 3.2 : 2.2) / fit)}" fill="${i === 0 ? "#e8b04a" : "#161618"}" stroke="#e8b04a"/>`).join("");
      const r = g.rest ? (() => { const c = 5 / fit, p = g.rest; return `<path d="M${f(p[0] - c)} ${f(p[1])}L${f(p[0] + c)} ${f(p[1])}M${f(p[0])} ${f(p[1] - c)}L${f(p[0])} ${f(p[1] + c)}" stroke="#5cc8e0"/>`; })() : "";
      return `<g id="guide-${g.name}">${line}${dots}${r}</g>`;
    }).join("") + (L.body.length > 1 ? `<path id="guide-spine" d="M${L.body.map((s, i) => { let z = 0; for (let q = 0; q <= i; q++) z -= def.segs[q].gap || 0; const p = P(0, z); return f(p[0]) + " " + f(p[1]); }).join("L")}" stroke="#e8b04a" stroke-dasharray="${f(4 / fit)} ${f(3 / fit)}" fill="none"/>` : "");

    const g = (inner) => `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(fit)})">${inner}</g>`;
    const preySvg = L.prey.polys ? `<g id="prey" inkscape:groupmode="layer" inkscape:label="Prey (${esc(L.prey.kind)})" transform="translate(${f(Wd / 2)} ${f(Hd - 60)})" fill="none" stroke="#5cc8e0" stroke-width="1.2" data-source="${L.prey.id}"><path d="${pathFromPolys(L.prey.polys.map((pl) => pl.map((q) => [q[0] * fit * 0.4 * 6, q[1] * fit * 0.4 * 6])), false)}"/><text y="44" text-anchor="middle" fill="#8a867d" stroke="none" font-family="IBM Plex Mono, monospace" font-size="11">${esc(L.prey.kind)} · ${L.prey.id}</text></g>` : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 ${f(Wd)} ${f(Hd)}" width="${f(Wd)}" height="${f(Hd)}" data-walker="${key}" data-px-per-unit="${f(U * fit)}">
<title>${esc(C.name)} rig</title>
${lay("plate", "Plate (locked)", `<rect width="100%" height="100%" fill="#161618"/>`, ' sodipodi:insensitive="true"')}
${lay("label", "Label", `<text x="${pad}" y="34" fill="#ece8de" font-family="Martian Mono, IBM Plex Mono, monospace" font-size="18">${esc(C.name)}</text><text x="${pad}" y="54" fill="#8a867d" font-family="IBM Plex Mono, monospace" font-size="11">${meta} · top view, nose up, limbs as drawn</text>`)}
${L.veil.length ? lay("veil", "Veil", g(`<path fill="#343334" d="${pathFromPolys(L.veil, true)}"/>`)) : ""}
${lay("legs", "Legs (one group per leg, one path per bone)", g(legsSvg), ` fill="none" stroke="#5fd38d" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`)}
${L.arms.length ? lay("arms", "Claws", g(armsSvg), ` fill="none" stroke="#5fd38d" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`) : ""}
${lay("body", "Body (one group per segment)", g(bodySvg), ` fill="none" stroke="#5fd38d" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`)}
${ornSvg ? lay("ornaments", "Ornaments (mirrored pairs)", g(ornSvg), ` fill="none" stroke="#5fd38d" stroke-width="${sw}"`) : ""}
${L.accent.length ? lay("accent", "Accent fills", g(`<path fill="#61e56a" fill-rule="evenodd" d="${pathFromPolys(L.accent, true)}"/>`)) : ""}
${L.carve.length ? lay("carve", "Carve lines", g(`<path fill="none" stroke="#121214" stroke-width="${sw}" d="${pathFromPolys(L.carve, false)}"/>`)) : ""}
${L.halo.length ? lay("halo", "Halo (stands upright in 3D)", g(`<path fill="none" stroke="#5fd38d" stroke-width="${sw}" d="${pathFromPolys(L.halo, false)}"/>`)) : ""}
${lay("rig-guides", "Rig guides: bones, joints, foot targets", g(guides), ` stroke-width="${f(1 / fit)}" opacity="0.9"`)}
${preySvg}
</svg>`;
    return { svg: svg.replace(/<path[^>]* d=""\/>/g, "").replace(/<g id="ornaments"[^>]*>(<g [^>]*>)?(<\/g>)?<\/g>\n?/g, ""), w: Wd, h: Hd, name: C.name };
  }

  const out = {};
  for (const [key, C] of Object.entries(window.WalkerBestiary.CREATURES)) out[key] = build(key, C);
  return out;
})();
