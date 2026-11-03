//! Plan → triangles. Shapes become indexed meshes in their local space; engines place the copies.

use std::f32::consts::{PI, TAU};

use glam::{Mat3, Mat4, Vec3};

use crate::plan::{MatSlot, Motion, Opening, Part, Shape, TowerPlan};
use crate::rng::vnoise;

/// An indexed triangle mesh. `colors` carries weathering as a grey multiplier (1 = clean).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MeshData {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
    pub colors: Vec<[f32; 4]>,
    pub indices: Vec<u32>,
}

impl MeshData {
    pub fn triangle_count(&self) -> usize { self.indices.len() / 3 }
    pub fn is_empty(&self) -> bool { self.indices.is_empty() }
    fn fill_defaults(&mut self) {
        let n = self.positions.len();
        if self.uvs.len() != n { self.uvs = vec![[0.0, 0.0]; n]; }
        if self.colors.len() != n { self.colors = vec![[1.0; 4]; n]; }
        if self.normals.len() != n { self.smooth_normals(); }
    }
    /// Area-weighted vertex normals.
    pub fn smooth_normals(&mut self) {
        let mut acc = vec![Vec3::ZERO; self.positions.len()];
        for t in self.indices.chunks_exact(3) {
            let (a, b, c) = (Vec3::from(self.positions[t[0] as usize]), Vec3::from(self.positions[t[1] as usize]), Vec3::from(self.positions[t[2] as usize]));
            let n = (b - a).cross(c - a);
            for &i in t { acc[i as usize] += n; }
        }
        self.normals = acc.into_iter().map(|n| n.normalize_or(Vec3::Y).to_array()).collect();
    }
    /// Split every triangle so each face gets its own normal (crisp polygons and rocks).
    pub fn flat(&self) -> MeshData {
        let mut o = MeshData::default();
        for t in self.indices.chunks_exact(3) {
            let p: Vec<Vec3> = t.iter().map(|&i| Vec3::from(self.positions[i as usize])).collect();
            let n = (p[1] - p[0]).cross(p[2] - p[0]).normalize_or(Vec3::Y).to_array();
            for (k, &i) in t.iter().enumerate() {
                o.positions.push(p[k].to_array()); o.normals.push(n);
                o.uvs.push(*self.uvs.get(i as usize).unwrap_or(&[0.0, 0.0]));
                o.colors.push(*self.colors.get(i as usize).unwrap_or(&[1.0; 4]));
                o.indices.push(o.indices.len() as u32);
            }
        }
        o
    }
    /// Add both windings so thin shells (cloth, open cylinders, discs) show from either side.
    pub fn double_sided(&mut self) {
        let n = self.positions.len() as u32;
        let (p, nn, uv, c) = (self.positions.clone(), self.normals.clone(), self.uvs.clone(), self.colors.clone());
        self.positions.extend(p); self.normals.extend(nn.iter().map(|v| [-v[0], -v[1], -v[2]])); self.uvs.extend(uv); self.colors.extend(c);
        let back: Vec<u32> = self.indices.chunks_exact(3).flat_map(|t| [t[0] + n, t[2] + n, t[1] + n]).collect();
        self.indices.extend(back);
    }
    pub fn transformed(&self, m: Mat4) -> MeshData {
        let nm = Mat3::from_mat4(m).inverse().transpose();
        let mut o = self.clone();
        for p in o.positions.iter_mut() { *p = m.transform_point3(Vec3::from(*p)).to_array(); }
        for n in o.normals.iter_mut() { *n = (nm * Vec3::from(*n)).normalize_or(Vec3::Y).to_array(); }
        if m.determinant() < 0.0 { for t in o.indices.chunks_exact_mut(3) { t.swap(1, 2); } }
        o
    }
    pub fn append(&mut self, other: &MeshData) {
        let base = self.positions.len() as u32;
        self.positions.extend_from_slice(&other.positions); self.normals.extend_from_slice(&other.normals);
        self.uvs.extend_from_slice(&other.uvs); self.colors.extend_from_slice(&other.colors);
        self.indices.extend(other.indices.iter().map(|i| i + base));
    }
}

fn phi0(n: u32) -> f32 { if n > 0 { PI / n as f32 } else { 0.0 } }

/// Revolve (radius, y) points round y. Matches the browser: angle 0 points at +z.
pub fn lathe_mesh(outline: &[[f32; 2]], sides: u32, twist: f32, weather: f32, seed: u32) -> MeshData {
    let seg = if sides == 0 { 48 } else { sides };
    let m = lathe_core(outline, seg, phi0(sides), twist, weather, seed);
    if sides > 0 && sides <= 16 { m.flat() } else { m }
}
/// Welded, smooth-shaded revolve with `seg` segments starting at angle `phase`.
fn lathe_core(outline: &[[f32; 2]], seg: u32, phase: f32, twist: f32, weather: f32, seed: u32) -> MeshData {
    let seg = seg.max(3) as usize;
    let ys: Vec<f32> = outline.iter().map(|p| p[1]).collect();
    let (y0, y1) = (ys.iter().cloned().fold(f32::MAX, f32::min), ys.iter().cloned().fold(f32::MIN, f32::max));
    let span = (y1 - y0).max(1e-3);
    let off = (seed % 1000) as f32 * 0.37;
    let mut m = MeshData::default();
    let mut vlen = vec![0.0f32; outline.len()];
    for i in 1..outline.len() { vlen[i] = vlen[i - 1] + ((outline[i][0] - outline[i - 1][0]).powi(2) + (outline[i][1] - outline[i - 1][1]).powi(2)).sqrt(); }
    for (i, p) in outline.iter().enumerate() {
        for j in 0..=seg {
            let tw = twist * (p[1] - y0) / span;
            let a = phase + j as f32 / seg as f32 * TAU + tw;
            let pos = [p[0].max(0.0) * a.sin(), p[1], p[0].max(0.0) * a.cos()];
            m.positions.push(pos);
            m.uvs.push([j as f32 / seg as f32, vlen[i] / vlen.last().copied().unwrap_or(1.0).max(1e-3)]);
            let v = if weather > 0.0 {
                let ang = pos[0].atan2(pos[2]);
                let streak = vnoise(ang * 9.0 + off) * vnoise(p[1] * 0.15 + ang * 3.0 + off);
                let grime = (1.0 - (p[1] - y0) / span).powi(4);
                1.0 - weather * (0.45 * streak + 0.25 * grime + 0.12 * vnoise(p[1] * 1.7 + ang * 20.0))
            } else { 1.0 };
            m.colors.push([v, v, v, 1.0]);
        }
    }
    let row = seg as u32 + 1;
    for i in 0..outline.len() as u32 - 1 {
        for j in 0..seg as u32 {
            let (a, b, c, d) = (i * row + j, i * row + j + 1, (i + 1) * row + j + 1, (i + 1) * row + j);
            m.indices.extend_from_slice(&[a, b, c, a, c, d]);
        }
    }
    m.smooth_normals();
    // the seam: average normals of the duplicated first and last columns
    for i in 0..outline.len() {
        let (a, b) = (i * (seg + 1), i * (seg + 1) + seg);
        let n = (Vec3::from(m.normals[a]) + Vec3::from(m.normals[b])).normalize_or(Vec3::Y).to_array();
        m.normals[a] = n; m.normals[b] = n;
    }
    m
}

fn strips_mesh(outline: &[[f32; 2]], sides: u32, twist: f32, angles: &[f32], width: f32, depth: f32) -> MeshData {
    let ys: Vec<f32> = outline.iter().map(|p| p[1]).collect();
    let (y0, y1) = (ys[0], *ys.last().unwrap());
    let span = (y1 - y0).max(1e-3);
    let poly = |r: f32, th: f32| crate::compile::poly_r(r, sides, th);
    let mut m = MeshData::default();
    for &th in angles {
        let rings: Vec<[Vec3; 4]> = outline.iter().map(|p| {
            let a = th + twist * (p[1] - y0) / span; let r = poly(p[0], a); let d = width / 2.0 / r.max(0.2);
            let pt = |rr: f32, aa: f32| Vec3::new(rr * aa.sin(), p[1], rr * aa.cos());
            [pt(r - 0.03, a - d), pt(r + depth, a - d), pt(r + depth, a + d), pt(r - 0.03, a + d)]
        }).collect();
        for i in 0..rings.len() - 1 {
            for k in 0..3 {
                let base = m.positions.len() as u32;
                for v in [rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]] { m.positions.push(v.to_array()); }
                m.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
            }
        }
    }
    m.smooth_normals();
    m.flat()
}

fn cuboid(size: [f32; 3]) -> MeshData {
    let h = Vec3::from(size) * 0.5;
    let faces = [(Vec3::X, Vec3::Z, Vec3::Y), (Vec3::NEG_X, Vec3::NEG_Z, Vec3::Y), (Vec3::Y, Vec3::X, Vec3::NEG_Z), (Vec3::NEG_Y, Vec3::X, Vec3::Z), (Vec3::Z, Vec3::X, Vec3::Y), (Vec3::NEG_Z, Vec3::NEG_X, Vec3::Y)];
    let mut m = MeshData::default();
    for (n, u, v) in faces {
        let base = m.positions.len() as u32;
        for (su, sv) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] {
            let p = n * h + u * h * su + v * h * sv;
            m.positions.push(p.to_array()); m.normals.push(n.to_array()); m.uvs.push([(su + 1.0) / 2.0, (sv + 1.0) / 2.0]);
        }
        // wind counter-clockwise seen from outside
        if u.cross(v).dot(n) > 0.0 { m.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]); }
        else { m.indices.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]); }
    }
    m
}

fn cylinder(r_top: f32, r_bottom: f32, h: f32, seg: u32, open: bool) -> MeshData {
    let mut pts = vec![];
    if !open { pts.push([0.0, -h / 2.0]); }
    pts.push([r_bottom, -h / 2.0]); pts.push([r_top, h / 2.0]);
    if !open { pts.push([0.0, h / 2.0]); }
    let mut m = round_lathe(&pts, seg);
    if open { m.double_sided(); }
    m
}
/// Round lathe with a chosen segment count: smooth from 10 segments up, faceted below.
fn round_lathe(pts: &[[f32; 2]], seg: u32) -> MeshData {
    let m = lathe_core(pts, seg, 0.0, 0.0, 0.0, 0);
    if seg < 10 { m.flat() } else { m }
}
fn cone(r: f32, h: f32, seg: u32) -> MeshData {
    let pts = [[0.0, -h / 2.0], [r, -h / 2.0], [0.0001, h / 2.0]];
    let m = round_lathe(&pts, seg);
    if seg == 4 { m.transformed(Mat4::from_rotation_y(-PI / 4.0)) } else { m }
}
fn sphere(r: f32, seg: u32) -> MeshData {
    let rings = (seg / 2).max(3);
    let pts: Vec<[f32; 2]> = (0..=rings).map(|i| { let a = -PI / 2.0 + PI * i as f32 / rings as f32; [r * a.cos(), r * a.sin()] }).collect();
    round_lathe(&pts, seg.max(4))
}
fn torus(r: f32, tube: f32, arc: f32, seg: u32) -> MeshData {
    let radial = 10u32; let tubular = seg.max(6);
    let mut m = MeshData::default();
    for j in 0..=radial {
        for i in 0..=tubular {
            let u = i as f32 / tubular as f32 * arc; let v = j as f32 / radial as f32 * TAU;
            let p = Vec3::new((r + tube * v.cos()) * u.cos(), (r + tube * v.cos()) * u.sin(), tube * v.sin());
            let c = Vec3::new(r * u.cos(), r * u.sin(), 0.0);
            m.positions.push(p.to_array()); m.normals.push((p - c).normalize_or(Vec3::Z).to_array()); m.uvs.push([i as f32 / tubular as f32, j as f32 / radial as f32]);
        }
    }
    for j in 1..=radial { for i in 1..=tubular {
        let a = (tubular + 1) * j + i - 1; let b = (tubular + 1) * (j - 1) + i - 1; let c = (tubular + 1) * (j - 1) + i; let d = (tubular + 1) * j + i;
        m.indices.extend_from_slice(&[a, b, d, b, c, d]);
    } }
    m
}
/// A 1 × 1 opening outline facing +z, triangulated as a fan.
fn opening(kind: Opening) -> MeshData {
    let mut pts: Vec<[f32; 2]> = vec![];
    match kind {
        Opening::Round => { for i in 0..32 { let a = i as f32 / 32.0 * TAU; pts.push([0.5 * a.cos(), 0.5 * a.sin()]); } }
        Opening::Slit => { pts = vec![[-0.16, -0.5], [0.16, -0.5], [0.16, 0.5], [-0.16, 0.5]]; }
        Opening::Arch => {
            pts.push([-0.45, -0.5]); pts.push([0.45, -0.5]); pts.push([0.45, 0.1]);
            for i in 1..12 { let t = i as f32 / 12.0; let a = t * PI; let x = 0.45 * a.cos(); let y = 0.1 + (1.0 - (x.abs() / 0.45).powf(1.6)).max(0.0).powf(0.7) * 0.4; pts.push([x, y]); }
            pts.push([-0.45, 0.1]);
        }
    }
    let mut m = MeshData::default();
    m.positions.push([0.0, 0.0, 0.0]);
    for p in &pts { m.positions.push([p[0], p[1], 0.0]); }
    let n = pts.len() as u32;
    for i in 0..n { m.indices.extend_from_slice(&[0, 1 + i, 1 + (i + 1) % n]); }
    m.normals = vec![[0.0, 0.0, 1.0]; m.positions.len()];
    m.uvs = m.positions.iter().map(|p| [p[0] + 0.5, p[1] + 0.5]).collect();
    m
}
fn extrusion(outline: &[[f32; 2]], holes: &[Vec<[f32; 2]>], depth: f32) -> MeshData {
    let mut flat: Vec<f64> = outline.iter().flat_map(|p| [p[0] as f64, p[1] as f64]).collect();
    let mut hole_idx = vec![];
    let mut rings: Vec<Vec<[f32; 2]>> = vec![outline.to_vec()];
    for h in holes { hole_idx.push(flat.len() / 2); flat.extend(h.iter().flat_map(|p| [p[0] as f64, p[1] as f64])); rings.push(h.clone()); }
    let tris = earcutr::earcut(&flat, &hole_idx, 2).unwrap_or_default();
    let all: Vec<[f32; 2]> = rings.iter().flatten().copied().collect();
    let z = depth / 2.0;
    let mut m = MeshData::default();
    // caps
    for (side, zz) in [(1.0f32, z), (-1.0, -z)] {
        let base = m.positions.len() as u32;
        for p in &all { m.positions.push([p[0], p[1], zz]); m.normals.push([0.0, 0.0, side]); m.uvs.push([p[0] * 0.25, p[1] * 0.25]); }
        for t in tris.chunks_exact(3) {
            let (a, b, c) = (t[0] as u32 + base, t[1] as u32 + base, t[2] as u32 + base);
            let (pa, pb, pc) = (all[t[0]], all[t[1]], all[t[2]]);
            let ccw = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) > 0.0;
            if ccw == (side > 0.0) { m.indices.extend_from_slice(&[a, b, c]); } else { m.indices.extend_from_slice(&[a, c, b]); }
        }
    }
    // walls
    for ring in &rings {
        let n = ring.len();
        let area: f32 = (0..n).map(|i| { let (a, b) = (ring[i], ring[(i + 1) % n]); a[0] * b[1] - b[0] * a[1] }).sum();
        for i in 0..n {
            let (a, b) = (ring[i], ring[(i + 1) % n]);
            let base = m.positions.len() as u32;
            let e = Vec3::new(b[0] - a[0], b[1] - a[1], 0.0);
            let mut nrm = Vec3::new(e.y, -e.x, 0.0).normalize_or(Vec3::Y);
            if area < 0.0 { nrm = -nrm; }
            for p in [[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], -z], [a[0], a[1], -z]] { m.positions.push(p); m.normals.push(nrm.to_array()); m.uvs.push([0.0, 0.0]); }
            let out = nrm;
            let tri_n = Vec3::new(b[0] - a[0], b[1] - a[1], 0.0).cross(Vec3::new(0.0, 0.0, -depth));
            if tri_n.dot(out) >= 0.0 { m.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]); }
            else { m.indices.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]); }
        }
    }
    m
}
/// Catmull-Rom sampled tube with parallel-transport frames.
fn tube(points: &[[f32; 3]], radius: f32, taper: f32) -> MeshData {
    let p: Vec<Vec3> = points.iter().map(|q| Vec3::from(*q)).collect();
    if p.len() < 2 { return MeshData::default(); }
    let get = |i: isize| p[i.clamp(0, p.len() as isize - 1) as usize];
    let mut samples = vec![];
    for i in 0..p.len() - 1 {
        for k in 0..6 {
            let t = k as f32 / 6.0; let (p0, p1, p2, p3) = (get(i as isize - 1), get(i as isize), get(i as isize + 1), get(i as isize + 2));
            let t2 = t * t; let t3 = t2 * t;
            samples.push(0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3));
        }
    }
    samples.push(*p.last().unwrap());
    let radial = 8usize; let mut m = MeshData::default();
    let mut normal = { let t = (samples[1] - samples[0]).normalize_or(Vec3::Y); let up = if t.y.abs() > 0.9 { Vec3::X } else { Vec3::Y }; t.cross(up).normalize() };
    let n = samples.len();
    for (i, c) in samples.iter().enumerate() {
        let tng = (samples[(i + 1).min(n - 1)] - samples[i.saturating_sub(1)]).normalize_or(Vec3::Y);
        normal = (normal - tng * normal.dot(tng)).normalize_or(Vec3::X);
        let bin = tng.cross(normal);
        let r = radius * (1.0 - (1.0 - taper) * i as f32 / (n - 1) as f32);
        for j in 0..=radial {
            let a = j as f32 / radial as f32 * TAU; let d = normal * a.cos() + bin * a.sin();
            m.positions.push((*c + d * r).to_array()); m.normals.push(d.to_array()); m.uvs.push([j as f32 / radial as f32, i as f32 / n as f32]);
        }
    }
    let row = radial as u32 + 1;
    for i in 0..n as u32 - 1 { for j in 0..radial as u32 {
        let (a, b, c, d) = (i * row + j, i * row + j + 1, (i + 1) * row + j + 1, (i + 1) * row + j);
        m.indices.extend_from_slice(&[a, d, c, a, c, b]);
    } }
    m
}
fn cloth(w: f32, len: f32) -> MeshData {
    let rows = 14u32; let mut m = MeshData::default();
    for i in 0..=rows { for (k, x) in [-w / 2.0, w / 2.0].iter().enumerate() {
        let v = i as f32 / rows as f32;
        // a gentle resting curve outward so the cloth reads as fabric
        m.positions.push([*x, -v * len, v * v * 0.35]); m.uvs.push([k as f32, v]);
    } }
    for i in 0..rows { let a = i * 2; m.indices.extend_from_slice(&[a, a + 2, a + 1, a + 1, a + 2, a + 3]); }
    m.smooth_normals(); m.double_sided();
    m
}

/// Unit icosphere, `level` subdivisions.
pub fn icosphere(level: u32) -> MeshData {
    let t = (1.0 + 5f32.sqrt()) / 2.0;
    let mut v: Vec<Vec3> = [[-1.0, t, 0.0], [1.0, t, 0.0], [-1.0, -t, 0.0], [1.0, -t, 0.0], [0.0, -1.0, t], [0.0, 1.0, t], [0.0, -1.0, -t], [0.0, 1.0, -t], [t, 0.0, -1.0], [t, 0.0, 1.0], [-t, 0.0, -1.0], [-t, 0.0, 1.0]]
        .iter().map(|p| Vec3::from(*p).normalize()).collect();
    let mut f: Vec<[u32; 3]> = vec![[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for _ in 0..level {
        let mut cache = std::collections::HashMap::new(); let mut nf = vec![];
        let mut mid = |a: u32, b: u32, v: &mut Vec<Vec3>| -> u32 { *cache.entry((a.min(b), a.max(b))).or_insert_with(|| { v.push(((v[a as usize] + v[b as usize]) * 0.5).normalize()); v.len() as u32 - 1 }) };
        for [a, b, c] in f { let ab = mid(a, b, &mut v); let bc = mid(b, c, &mut v); let ca = mid(c, a, &mut v); nf.extend([[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]); }
        f = nf;
    }
    let mut m = MeshData { positions: v.iter().map(|p| p.to_array()).collect(), indices: f.into_iter().flatten().collect(), ..Default::default() };
    m.smooth_normals();
    m
}

/// Build one shape's mesh in its own space.
pub fn shape_mesh(shape: &Shape) -> MeshData {
    let mut m = match shape {
        Shape::Lathe { outline, sides, twist, weather, seed } => lathe_mesh(outline, *sides, *twist, *weather, *seed),
        Shape::Strips { outline, sides, twist, angles, width, depth } => strips_mesh(outline, *sides, *twist, angles, *width, *depth),
        Shape::Cuboid { size } => cuboid(*size),
        Shape::Cylinder { r_top, r_bottom, h, segments, open } => cylinder(*r_top, *r_bottom, *h, *segments, *open),
        Shape::Cone { r, h, segments } => cone(*r, *h, *segments),
        Shape::Sphere { r, segments } => sphere(*r, *segments),
        Shape::Torus { r, tube: t, arc, segments } => torus(*r, *t, *arc, *segments),
        Shape::Opening { kind } => { let mut m = opening(*kind); m.double_sided(); m }
        Shape::Extrusion { outline, holes, depth } => extrusion(outline, holes, *depth),
        Shape::Tube { points, radius, taper } => tube(points, *radius, *taper),
        Shape::Cloth { w, len } => cloth(*w, *len),
        Shape::Raw { positions, indices } => { let mut m = MeshData { positions: positions.clone(), indices: indices.clone(), ..Default::default() }; m.smooth_normals(); m.flat() }
    };
    m.fill_defaults();
    m
}

/// A part's mesh ready to draw: its local mesh plus where each copy goes at time `t`.
pub struct Placed<'a> { pub part: &'a Part, pub mesh: MeshData, pub transforms: Vec<Mat4> }

/// Where each copy of a part sits at time `t` seconds, motion included.
pub fn part_transforms(p: &Part, t: f32) -> Vec<Mat4> {
    let pivot = p.pivot();
    p.instances.iter().enumerate().map(|(i, m)| {
        let m = Mat4::from_cols_array(m);
        match p.motion {
            Motion::Still => pivot * m,
            Motion::Spin { axis, speed } => pivot * Mat4::from_axis_angle(Vec3::from(axis).normalize_or(Vec3::Y), t * speed) * m,
            Motion::Swing { axis, speed, amount } => pivot * Mat4::from_axis_angle(Vec3::from(axis).normalize_or(Vec3::X), (t * speed).sin() * amount) * m,
            Motion::Sway { speed, amount } => pivot * m * Mat4::from_rotation_x((t * speed + i as f32 * 1.7).sin() * amount),
            Motion::Orbit { speed } => Mat4::from_rotation_y(t * speed) * pivot * m,
        }
    }).collect()
}

/// Where copy `i` of a part sits at time `t` (cheaper than [`part_transforms`] for one copy).
pub fn part_transform(p: &Part, i: usize, t: f32) -> Mat4 {
    let pivot = p.pivot(); let m = Mat4::from_cols_array(&p.instances[i]);
    match p.motion {
        Motion::Still => pivot * m,
        Motion::Spin { axis, speed } => pivot * Mat4::from_axis_angle(Vec3::from(axis).normalize_or(Vec3::Y), t * speed) * m,
        Motion::Swing { axis, speed, amount } => pivot * Mat4::from_axis_angle(Vec3::from(axis).normalize_or(Vec3::X), (t * speed).sin() * amount) * m,
        Motion::Sway { speed, amount } => pivot * m * Mat4::from_rotation_x((t * speed + i as f32 * 1.7).sin() * amount),
        Motion::Orbit { speed } => Mat4::from_rotation_y(t * speed) * pivot * m,
    }
}

/// Every part's mesh with its placements at time `t`.
pub fn build(plan: &TowerPlan, t: f32) -> Vec<Placed<'_>> {
    plan.parts.iter().map(|p| Placed { part: p, mesh: shape_mesh(&p.shape), transforms: part_transforms(p, t) }).collect()
}

/// All copies of all parts baked into world space, one mesh per material: for export and for sheared parts.
pub fn bake(plan: &TowerPlan, t: f32) -> Vec<(MatSlot, MeshData)> {
    let mut out: Vec<(MatSlot, MeshData)> = vec![];
    for placed in build(plan, t) {
        let entry = match out.iter_mut().position(|(m, _)| *m == placed.part.mat) { Some(i) => i, None => { out.push((placed.part.mat, MeshData::default())); out.len() - 1 } };
        for tr in &placed.transforms { out[entry].1.append(&placed.mesh.transformed(*tr)); }
    }
    out
}
