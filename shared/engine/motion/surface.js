/* INTERACTIONS — the surface: what a creature stands, walks and climbs on.

   The physics body used to stand on a height field H(x, z) with gravity along world Y. A surface
   generalises that to anything a creature can grip: it answers three questions about a point,

     sample(x, y, z, out)    -> out.d (distance from the surface, + in the air, - inside), out.nx/ny/nz (its normal)
     project(x, y, z, out)   -> out.x/y/z (the nearest point on the surface)
     groundOnly()            -> the same world with only the ground in it (what a creature that cannot climb sees)

   and the body does the rest: planted feet hold it at standing height along the normal, the heading
   lives in the tangent plane, feet step onto whatever surface is nearest their rest point. A creature
   walking up to a wall steps its front feet onto the wall, its body follows, and it is climbing; the
   same rule carries it over a ledge or the rim of a roof. There is no mesh and no BVH: a tower is a
   solid of revolution, so a point's distance to it is a 2D distance to its profile.

     Surface.heightfield(H)                      the ground, exactly as the body has always read it
     Surface.tower({ x, z, profile })            a tower: profile = [[radius, y], ...] up its outside, base first
     Surface.world(H, towers)                    ground and towers together

   The ground reports its normal as straight up and its distance as height above H(x, z), on purpose:
   the body reads a slope from where its feet stand (as the walker always did), so the ground's own
   normal would count it twice. A tower reports its true normal.

   Classic script, no dependencies -> window.Surface. */
(function () {
  "use strict";

  /* ---- ground: the height field, read the way the body always read it ---- */
  function groundPart(H) {
    return {
      kind: "ground",
      near() { return true; },
      sample(x, y, z, o) { o.d = y - H(x, z); o.nx = 0; o.ny = 1; o.nz = 0; return o; },
      project(x, y, z, o) { o.x = x; o.y = H(x, z); o.z = z; return o; },
    };
  }

  /* ---- tower: a solid of revolution about the vertical axis through (x, z) ----
     profile: [[r0, y0], [r1, y1], ...] up the tower's outside, base first. The solid is that outline
     closed across the top and bottom and back along the axis, so a roof is just a last point with a
     smaller radius. Distances are measured in the (radius, y) half plane. */
  function towerPart(spec) {
    const cx = spec.x, cz = spec.z, P = spec.profile;
    if (!P || P.length < 2) throw new Error("Surface.tower: a profile needs at least two points");
    // the outline's edges: up the profile, across the top to the axis, across the bottom from the axis
    const pts = P.map((q) => [q[0], q[1]]);
    const top = pts[pts.length - 1], bot = pts[0];
    const ring = pts.concat([[0, top[1]], [0, bot[1]]]);          // the closed polygon, for inside/outside
    const edges = [];                                              // the real boundary (the axis edge is not one)
    for (let i = 0; i + 1 < pts.length; i++) edges.push([pts[i], pts[i + 1]]);
    edges.push([top, [0, top[1]]]);
    edges.push([[0, bot[1]], bot]);
    let R = 0, y0 = 1e9, y1 = -1e9;
    for (const q of pts) { R = Math.max(R, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }

    const inside = (px, py) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
      }
      return c;
    };
    // nearest boundary point to (px, py) in the half plane: into q = [x, y], and its distance
    const nearest = (px, py, q) => {
      let best = 1e18;
      for (const e of edges) {
        const ax = e[0][0], ay = e[0][1], bx = e[1][0], by = e[1][1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t, qy = ay + dy * t, d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
        if (d2 < best) { best = d2; q[0] = qx; q[1] = qy; q[2] = dx; q[3] = dy; }
      }
      return Math.sqrt(best);
    };
    const _q = [0, 0, 0, 0];
    return {
      kind: "tower", spec,
      // a cheap lower bound on |d|: false when the point is farther than `r` from the whole solid
      near(x, y, z, r) {
        const rho = Math.hypot(x - cx, z - cz);
        return Math.max(rho - R, y0 - y, y - y1, 0) <= r;
      },
      sample(x, y, z, o) {
        const dx = x - cx, dz = z - cz, rho = Math.hypot(dx, dz), ux = rho > 1e-9 ? dx / rho : 1, uz = rho > 1e-9 ? dz / rho : 0;
        const dist = nearest(rho, y, _q), isIn = inside(rho, y);
        let nr, ny;
        if (dist > 1e-7) { const s = isIn ? -1 : 1; nr = ((rho - _q[0]) / dist) * s; ny = ((y - _q[1]) / dist) * s; }
        else { const l = Math.hypot(_q[2], _q[3]) || 1; nr = _q[3] / l; ny = -_q[2] / l; }   // on the edge: its own normal (outward is to the right of up)
        o.d = isIn ? -dist : dist; o.nx = nr * ux; o.ny = ny; o.nz = nr * uz; return o;
      },
      project(x, y, z, o) {
        const dx = x - cx, dz = z - cz, rho = Math.hypot(dx, dz), ux = rho > 1e-9 ? dx / rho : 1, uz = rho > 1e-9 ? dz / rho : 0;
        nearest(rho, y, _q); o.x = cx + _q[0] * ux; o.y = _q[1]; o.z = cz + _q[0] * uz; return o;
      },
    };
  }

  /* ---- a world of parts ---- */
  const _s = { d: 0, nx: 0, ny: 1, nz: 0 }, _p = { x: 0, y: 0, z: 0 };
  class Surface {
    constructor(parts, opts = {}) {
      this.parts = parts;
      this.soft = opts.soft ?? 0.18;       // how far apart two surfaces' normals still blend (a concave corner turns smoothly)
      this.cull = opts.cull ?? 3;          // a part farther than this from a point is not asked
    }
    /* the nearest surface at a point: its distance, and a normal blended across any other surface about as near */
    sample(x, y, z, o) {
      const P = this.parts;
      if (P.length === 1) return P[0].sample(x, y, z, o);
      let dmin = 1e18, nx = 0, ny = 0, nz = 0, w0 = 0;
      const hit = this._hit || (this._hit = P.map(() => ({ d: 0, nx: 0, ny: 1, nz: 0, on: false })));
      for (let i = 0; i < P.length; i++) {
        const h = hit[i]; h.on = P[i].near(x, y, z, this.cull);
        if (h.on) { P[i].sample(x, y, z, h); if (h.d < dmin) dmin = h.d; }
      }
      for (let i = 0; i < P.length; i++) {
        const h = hit[i]; if (!h.on) continue;
        const w = Math.exp(-(Math.abs(h.d) - Math.abs(dmin)) / this.soft);
        if (w < 0.02) continue;
        nx += h.nx * w; ny += h.ny * w; nz += h.nz * w; w0 += w;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      o.d = dmin; o.nx = nx / l; o.ny = ny / l; o.nz = nz / l; return o;
    }
    /* the nearest point on the nearest part */
    project(x, y, z, o) {
      const P = this.parts;
      if (P.length === 1) return P[0].project(x, y, z, o);
      let best = -1, bd = 1e18;
      for (let i = 0; i < P.length; i++) {
        if (!P[i].near(x, y, z, this.cull)) continue;
        P[i].sample(x, y, z, _s); const d = Math.abs(_s.d);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) best = 0;
      return P[best].project(x, y, z, o);
    }
    /* the same world with only its ground: what a creature that does not climb stands on */
    groundOnly() { return this._g || (this._g = new Surface(this.parts.filter((p) => p.kind === "ground"), this)); }
  }

  const heightfield = (H) => new Surface([groundPart(H)]);
  const tower = (spec) => new Surface([towerPart(spec)]);
  const world = (H, towers = [], opts) => new Surface([groundPart(H), ...towers.map(towerPart)], opts);
  window.Surface = { Surface, heightfield, tower, world, groundPart, towerPart };
})();
