//! The surface: what a walking body stands, walks and climbs on. shared/engine/motion/surface.js, operation for
//! operation: the ground (a height field), towers (solids of revolution, measured in their (radius, y) half plane)
//! and walls (slabs), and a world of them whose normal blends across parts about as near as the nearest.
//!
//! The ground's height is either a constant (a flat floor, as the tank's) or a function the page owns, asked through
//! `Heights` (the page's function, called back). Everything else is data held here.

use crate::math::{exp, hypot, hypot3, max, min};

/// Where a ground's height comes from.
#[derive(Clone, Copy, Debug)]
pub enum Height {
    /// The same everywhere.
    Flat(f64),
    /// The page's function number `id`.
    Page(u32),
}

/// Asks the page for a height.
pub trait Heights {
    fn height(&mut self, id: u32, x: f64, z: f64) -> f64;
}

impl Height {
    #[inline]
    pub fn at<P: Heights>(self, x: f64, z: f64, page: &mut P) -> f64 {
        match self {
            Height::Flat(v) => v,
            Height::Page(id) => page.height(id, x, z),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Tower {
    cx: f64,
    cz: f64,
    /// The closed outline (the profile, then across the top to the axis and down it), for inside or out.
    ring: Vec<[f64; 2]>,
    /// The real boundary: up the profile, across the top, across the bottom.
    edges: Vec<[f64; 4]>,
    r: f64,
    y0: f64,
    y1: f64,
    /// The nearest boundary point found last, and its edge's direction (kept between calls, as the page's is).
    q: [f64; 4],
}

#[derive(Clone, Debug)]
pub struct Wall {
    x0: f64,
    z0: f64,
    t: f64,
    y0: f64,
    y1: f64,
    ux: f64,
    uz: f64,
    hu: f64,
    hy: f64,
    ym: f64,
    r: f64,
    cx: f64,
    cz: f64,
}

#[derive(Clone, Debug)]
pub enum Part {
    Ground(Height),
    Tower(Tower),
    Wall(Wall),
}

/// A point's distance from a surface (+ outside, - inside) and the way out.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Sample {
    pub d: f64,
    pub nx: f64,
    pub ny: f64,
    pub nz: f64,
}

impl Tower {
    /// profile: (radius, y) pairs up the tower's outside, base first. At least two.
    pub fn new(cx: f64, cz: f64, profile: &[[f64; 2]]) -> Option<Tower> {
        if profile.len() < 2 {
            return None;
        }
        let pts: Vec<[f64; 2]> = profile.to_vec();
        let (top, bot) = (pts[pts.len() - 1], pts[0]);
        let mut ring = pts.clone();
        ring.push([0.0, top[1]]);
        ring.push([0.0, bot[1]]);
        let mut edges = Vec::new();
        for i in 0..pts.len() - 1 {
            edges.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
        }
        edges.push([top[0], top[1], 0.0, top[1]]);
        edges.push([0.0, bot[1], bot[0], bot[1]]);
        let (mut r, mut y0, mut y1) = (0.0f64, 1e9f64, -1e9f64);
        for q in &pts {
            r = max(r, q[0]);
            y0 = min(y0, q[1]);
            y1 = max(y1, q[1]);
        }
        Some(Tower { cx, cz, ring, edges, r, y0, y1, q: [0.0; 4] })
    }
    fn inside(&self, px: f64, py: f64) -> bool {
        let mut c = false;
        let n = self.ring.len();
        let mut j = n - 1;
        for i in 0..n {
            let (a, b) = (self.ring[i], self.ring[j]);
            if (a[1] > py) != (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0] {
                c = !c;
            }
            j = i;
        }
        c
    }
    fn nearest(&mut self, px: f64, py: f64) -> f64 {
        let mut best = 1e18f64;
        for e in &self.edges {
            let (ax, ay, bx, by) = (e[0], e[1], e[2], e[3]);
            let (dx, dy) = (bx - ax, by - ay);
            let l2 = dx * dx + dy * dy;
            let mut t = if l2 > 0.0 { ((px - ax) * dx + (py - ay) * dy) / l2 } else { 0.0 };
            t = if t < 0.0 { 0.0 } else if t > 1.0 { 1.0 } else { t };
            let (qx, qy) = (ax + dx * t, ay + dy * t);
            let d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
            if d2 < best {
                best = d2;
                self.q = [qx, qy, dx, dy];
            }
        }
        best.sqrt()
    }
    fn near(&self, x: f64, y: f64, z: f64, r: f64) -> bool {
        let rho = hypot(x - self.cx, z - self.cz);
        max(max(max(rho - self.r, self.y0 - y), y - self.y1), 0.0) <= r
    }
    fn sample(&mut self, x: f64, y: f64, z: f64) -> Sample {
        let (dx, dz) = (x - self.cx, z - self.cz);
        let rho = hypot(dx, dz);
        let (ux, uz) = if rho > 1e-9 { (dx / rho, dz / rho) } else { (1.0, 0.0) };
        let dist = self.nearest(rho, y);
        let is_in = self.inside(rho, y);
        let (nr, ny);
        if dist > 1e-7 {
            let s = if is_in { -1.0 } else { 1.0 };
            nr = ((rho - self.q[0]) / dist) * s;
            ny = ((y - self.q[1]) / dist) * s;
        } else {
            let l = hypot(self.q[2], self.q[3]);
            let l = if l == 0.0 || l.is_nan() { 1.0 } else { l };
            nr = self.q[3] / l;
            ny = -self.q[2] / l;
        }
        Sample { d: if is_in { -dist } else { dist }, nx: nr * ux, ny, nz: nr * uz }
    }
    fn project(&mut self, x: f64, y: f64, z: f64) -> [f64; 3] {
        let (dx, dz) = (x - self.cx, z - self.cz);
        let rho = hypot(dx, dz);
        let (ux, uz) = if rho > 1e-9 { (dx / rho, dz / rho) } else { (1.0, 0.0) };
        self.nearest(rho, y);
        [self.cx + self.q[0] * ux, self.q[1], self.cz + self.q[0] * uz]
    }
}

impl Wall {
    pub fn new(x0: f64, z0: f64, x1: f64, z1: f64, t: f64, y0: f64, y1: f64) -> Wall {
        let (dx, dz) = (x1 - x0, z1 - z0);
        let l = hypot(dx, dz);
        let l = if l == 0.0 || l.is_nan() { 1e-6 } else { l };
        let (ux, uz) = (dx / l, dz / l);
        let (hu, hy, ym) = (l / 2.0, (y1 - y0) / 2.0, (y0 + y1) / 2.0);
        Wall { x0, z0, t, y0, y1, ux, uz, hu, hy, ym, r: hu + t, cx: (x0 + x1) / 2.0, cz: (z0 + z1) / 2.0 }
    }
    /// along, across, up
    fn frame(&self, x: f64, y: f64, z: f64) -> [f64; 3] {
        let (px, pz) = (x - self.x0, z - self.z0);
        [px * self.ux + pz * self.uz - self.hu, -px * self.uz + pz * self.ux, y - self.ym]
    }
    fn near(&self, x: f64, y: f64, z: f64, r: f64) -> bool {
        max(max(max(hypot(x - self.cx, z - self.cz) - self.r, self.y0 - y), y - self.y1), 0.0) <= r
    }
    fn sample(&self, x: f64, y: f64, z: f64) -> Sample {
        let [a, b, c] = self.frame(x, y, z);
        let (qa, qb, qc) = (a.abs() - self.hu, b.abs() - self.t, c.abs() - self.hy);
        let (oa, ob, oc) = (max(qa, 0.0), max(qb, 0.0), max(qc, 0.0));
        let out = hypot3(oa, ob, oc);
        let sgn = |v: f64| if v < 0.0 { -1.0 } else { 1.0 };
        let (mut na, mut nb, mut nc, d);
        if out > 0.0 {
            d = out;
            na = (oa / out) * sgn(a);
            nb = (ob / out) * sgn(b);
            nc = (oc / out) * sgn(c);
        } else {
            d = max(max(qa, qb), qc);
            na = 0.0;
            nb = 0.0;
            nc = 0.0;
            if d == qa {
                na = sgn(a);
            } else if d == qb {
                nb = sgn(b);
            } else {
                nc = sgn(c);
            }
        }
        Sample { d, nx: na * self.ux - nb * self.uz, nz: na * self.uz + nb * self.ux, ny: nc }
    }
    fn project(&self, x: f64, y: f64, z: f64) -> [f64; 3] {
        let [mut a, mut b, mut c] = self.frame(x, y, z);
        let (qa, qb, qc) = (a.abs() - self.hu, b.abs() - self.t, c.abs() - self.hy);
        let sgn = |v: f64| if v < 0.0 { -1.0 } else { 1.0 };
        if qa > 0.0 || qb > 0.0 || qc > 0.0 {
            a = max(-self.hu, min(self.hu, a));
            b = max(-self.t, min(self.t, b));
            c = max(-self.hy, min(self.hy, c));
        } else {
            let m = max(max(qa, qb), qc);
            if m == qa {
                a = self.hu * sgn(a);
            } else if m == qb {
                b = self.t * sgn(b);
            } else {
                c = self.hy * sgn(c);
            }
        }
        [self.x0 + (a + self.hu) * self.ux - b * self.uz, c + self.ym, self.z0 + (a + self.hu) * self.uz + b * self.ux]
    }
}

impl Part {
    fn near(&self, x: f64, y: f64, z: f64, r: f64) -> bool {
        match self {
            Part::Ground(_) => true,
            Part::Tower(t) => t.near(x, y, z, r),
            Part::Wall(w) => w.near(x, y, z, r),
        }
    }
    fn sample<P: Heights>(&mut self, x: f64, y: f64, z: f64, page: &mut P) -> Sample {
        match self {
            Part::Ground(h) => Sample { d: y - h.at(x, z, page), nx: 0.0, ny: 1.0, nz: 0.0 },
            Part::Tower(t) => t.sample(x, y, z),
            Part::Wall(w) => w.sample(x, y, z),
        }
    }
    fn project<P: Heights>(&mut self, x: f64, y: f64, z: f64, page: &mut P) -> [f64; 3] {
        match self {
            Part::Ground(h) => [x, h.at(x, z, page), z],
            Part::Tower(t) => t.project(x, y, z),
            Part::Wall(w) => w.project(x, y, z),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Surface {
    pub parts: Vec<Part>,
    /// How far apart two parts' distances may be and still blend their normals.
    pub soft: f64,
    /// A part farther than this from a point is not asked.
    pub cull: f64,
    hit: Vec<(Sample, bool)>,
}

impl Surface {
    pub fn new(soft: f64, cull: f64) -> Surface {
        Surface { parts: Vec::new(), soft, cull, hit: Vec::new() }
    }
    pub fn add(&mut self, p: Part) {
        self.parts.push(p);
        self.hit.push((Sample::default(), false));
    }
    /// The same world with only its ground.
    pub fn ground_only(&self) -> Surface {
        let mut g = Surface::new(self.soft, self.cull);
        for p in &self.parts {
            if let Part::Ground(_) = p {
                g.add(p.clone());
            }
        }
        g
    }
    /// The nearest surface at a point: its distance, and a normal blended across any other part about as near.
    pub fn sample<P: Heights>(&mut self, x: f64, y: f64, z: f64, page: &mut P) -> Sample {
        let n = self.parts.len();
        if n == 1 {
            return self.parts[0].sample(x, y, z, page);
        }
        let mut dmin = 1e18f64;
        for i in 0..n {
            let on = self.parts[i].near(x, y, z, self.cull);
            self.hit[i].1 = on;
            if on {
                let s = self.parts[i].sample(x, y, z, page);
                self.hit[i].0 = s;
                if s.d < dmin {
                    dmin = s.d;
                }
            }
        }
        let (mut nx, mut ny, mut nz, mut w0) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
        for i in 0..n {
            let (h, on) = self.hit[i];
            if !on {
                continue;
            }
            let w = exp(-(h.d.abs() - dmin.abs()) / self.soft);
            if w < 0.02 {
                continue;
            }
            nx += h.nx * w;
            ny += h.ny * w;
            nz += h.nz * w;
            w0 += w;
        }
        let _ = w0;
        let l = hypot3(nx, ny, nz);
        let l = if l == 0.0 || l.is_nan() { 1.0 } else { l };
        Sample { d: dmin, nx: nx / l, ny: ny / l, nz: nz / l }
    }
    /// The nearest point on the nearest part.
    pub fn project<P: Heights>(&mut self, x: f64, y: f64, z: f64, page: &mut P) -> [f64; 3] {
        let n = self.parts.len();
        if n == 1 {
            return self.parts[0].project(x, y, z, page);
        }
        let (mut best, mut bd) = (usize::MAX, 1e18f64);
        for i in 0..n {
            if !self.parts[i].near(x, y, z, self.cull) {
                continue;
            }
            let d = self.parts[i].sample(x, y, z, page).d.abs();
            if d < bd {
                bd = d;
                best = i;
            }
        }
        if best == usize::MAX {
            best = 0;
        }
        self.parts[best].project(x, y, z, page)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Hills;
    impl Heights for Hills {
        fn height(&mut self, _: u32, x: f64, z: f64) -> f64 {
            0.2 * (x * 0.7).sin() + 0.15 * (z * 0.5).cos()
        }
    }
    fn tower() -> Part {
        Part::Tower(Tower::new(4.0, 0.0, &[[1.2, -1.0], [1.1, 2.0], [0.9, 3.5]]).unwrap())
    }

    #[test]
    fn the_ground_is_its_height_with_a_normal_straight_up() {
        let mut s = Surface::new(0.18, 3.0);
        s.add(Part::Ground(Height::Flat(0.5)));
        assert_eq!(s.sample(3.0, 2.0, 1.0, &mut Hills), Sample { d: 1.5, nx: 0.0, ny: 1.0, nz: 0.0 });
        assert_eq!(s.project(3.0, 2.0, 1.0, &mut Hills), [3.0, 0.5, 1.0]);
        let mut h = Surface::new(0.18, 3.0);
        h.add(Part::Ground(Height::Page(0)));
        assert!((h.sample(0.0, 1.0, 0.0, &mut Hills).d - 0.85).abs() < 1e-12);
    }
    #[test]
    fn a_tower_is_measured_to_its_outline() {
        let mut s = Surface::new(0.18, 3.0);
        s.add(tower());
        let a = s.sample(8.0, 0.0, 0.0, &mut Hills); // well outside, beside the trunk
        assert!(a.d > 2.7 && a.d < 2.9 && a.nx > 0.99);
        let b = s.sample(4.0, 1.0, 0.0, &mut Hills); // on the axis: inside
        assert!(b.d < 0.0);
        let top = s.sample(4.0, 5.0, 0.0, &mut Hills); // above the roof
        assert!((top.d - 1.5).abs() < 1e-12 && (top.ny - 1.0).abs() < 1e-12);
        let p = s.project(8.0, 0.0, 0.0, &mut Hills);
        assert!(p[0] > 5.1 && p[0] < 5.2 && p[1].abs() < 0.2, "on the trunk's side: {p:?}");
    }
    #[test]
    fn a_wall_is_a_box() {
        let mut s = Surface::new(0.18, 3.0);
        s.add(Part::Wall(Wall::new(0.0, 0.0, 4.0, 0.0, 0.3, -0.8, 1.7)));
        let a = s.sample(2.0, 0.5, 1.0, &mut Hills);
        assert!((a.d - 0.7).abs() < 1e-12 && (a.nz - 1.0).abs() < 1e-12);
        let b = s.sample(2.0, 0.5, 0.0, &mut Hills); // inside: the nearest face is a side
        assert!((b.d + 0.3).abs() < 1e-12);
        assert_eq!(s.project(2.0, 0.5, 1.0, &mut Hills), [2.0, 0.5, 0.3]);
    }
    #[test]
    fn a_world_takes_the_nearest_part_and_blends_normals_near_a_corner() {
        let mut s = Surface::new(0.18, 3.0);
        s.add(Part::Ground(Height::Flat(0.0)));
        s.add(tower());
        let far = s.sample(-10.0, 1.0, 0.0, &mut Hills); // only the ground is near
        assert_eq!(far, Sample { d: 1.0, nx: 0.0, ny: 1.0, nz: 0.0 });
        let corner = s.sample(5.3, 0.15, 0.0, &mut Hills); // near both the floor and the trunk
        assert!(corner.nx > 0.1 && corner.ny > 0.1);
        let g = s.ground_only();
        assert_eq!(g.parts.len(), 1);
    }
}
