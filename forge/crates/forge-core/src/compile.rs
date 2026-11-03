//! Recipe → plan. A port of the browser Tower Forge builder, producing parts instead of meshes.

use std::f32::consts::{FRAC_PI_2, FRAC_PI_4, PI, TAU};

use glam::{Mat4, Quat, Vec3};

use crate::geometry;
use crate::plan::*;
use crate::rng::{vnoise, Rng};
use crate::spec::*;

fn phi0(n: u32) -> f32 { if n > 0 { PI / n as f32 } else { 0.0 } }
/// Radius of a polygon (circumradius `r`, `n` sides, flat face toward +z) in direction `th`.
pub fn poly_r(r: f32, n: u32, th: f32) -> f32 {
    if n == 0 { return r; }
    let seg = TAU / n as f32;
    let d = ((th - phi0(n)).rem_euclid(seg)) - seg / 2.0;
    r * (PI / n as f32).cos() / d.cos()
}
fn tier_outline(t: &Tier, y0: f32) -> Vec<[f32; 2]> { (0..=20).map(|i| { let u = i as f32 / 20.0; [t.r_at(u), y0 + t.h * u] }).collect() }
fn mat_of(m: Mat) -> MatSlot { match m { Mat::Body => MatSlot::Body, Mat::Accent => MatSlot::Accent, Mat::Dark => MatSlot::Dark, Mat::Glow => MatSlot::Glow } }
/// Structural pieces never glow, even on a glowing tier.
fn solid(m: Mat) -> MatSlot { if m == Mat::Glow { MatSlot::Body } else { mat_of(m) } }
fn lathe(outline: Vec<[f32; 2]>, sides: u32) -> Shape { Shape::Lathe { outline, sides, twist: 0.0, weather: 0.0, seed: 0 } }
fn unit_box() -> Shape { Shape::Cuboid { size: [1.0, 1.0, 1.0] } }
fn unit_cone(seg: u32) -> Shape { Shape::Cone { r: 1.0, h: 1.0, segments: seg } }
fn unit_sphere() -> Shape { Shape::Sphere { r: 1.0, segments: 12 } }
fn ry(a: f32) -> Mat4 { Mat4::from_rotation_y(a) }

struct B {
    rng: Rng,
    parts: Vec<Part>,
    sockets: Vec<Socket>,
    diags: Vec<Diagnostic>,
    body: bool,
}
impl B {
    fn add(&mut self, mut p: Part) -> usize { p.body = self.body; self.parts.push(p); self.parts.len() - 1 }
    fn one(&mut self, tag: &str, mat: MatSlot, shape: Shape, m: Mat4) -> usize { self.add(Part::new(tag, mat, shape).at(m)) }
    fn many(&mut self, tag: &str, mat: MatSlot, shape: Shape, ms: Vec<Mat4>) -> Option<usize> {
        if ms.is_empty() { return None; }
        let mut p = Part::new(tag, mat, shape);
        p.instances = ms.iter().map(|m| m.to_cols_array()).collect();
        Some(self.add(p))
    }
    fn diag(&mut self, severity: Severity, message: String) { self.diags.push(Diagnostic { severity, message }); }
    fn socket(&mut self, id: String, kind: SocketType, dir: SocketDir, rule: SocketRule, accepts: &[SocketType], pos: Vec3, radius: f32) {
        self.sockets.push(Socket { id, kind, dir, rule, accepts: accepts.to_vec(), pos: pos.to_array(), radius, connected_to: None });
    }
}

/// Compile a recipe into a plan.
pub fn compile(spec: &Spec) -> TowerPlan {
    let mut s = spec.clone();
    s.sanitize();
    let mut b = B { rng: Rng::new(s.seed as u64), parts: vec![], sockets: vec![], diags: vec![], body: true };
    let lean = (s.foot.lean.to_radians()).tan();
    let body = build_body(&mut b, &s, true);
    b.body = false;
    let r_max = s.max_radius() * if s.foot.kind != FootKind::None { s.foot.spread.max(1.0) } else { 1.0 };
    let mut m = Measures { h: body.h, top: body.top, r_max, reach: r_max, lean, tier_spans: body.spans.clone() };
    build_aura(&mut b, &s, &mut m);

    // the lean shears every body part: x += y × lean
    if lean.abs() > 1e-4 {
        let shear = Mat4::from_cols(Vec3::X.extend(0.0), Vec3::new(lean, 1.0, 0.0).extend(0.0), Vec3::Z.extend(0.0), glam::Vec4::W);
        for p in b.parts.iter_mut().filter(|p| p.body) {
            for inst in p.instances.iter_mut() { *inst = (shear * Mat4::from_cols_array(inst)).to_cols_array(); }
        }
        for sk in b.sockets.iter_mut() { sk.pos[0] += sk.pos[1] * lean; }
    }

    // reach, for framing
    for h in &s.halos { m.reach = m.reach.max(h.r + h.off); m.top = m.top.max(m.h + h.y + h.r); }
    if s.aura.deb_n > 0 { m.reach = m.reach.max(s.aura.deb_r + s.aura.deb_spread * 0.5); }
    if s.aura.sat_n > 0 { m.reach = m.reach.max(s.aura.sat_r * 1.1); }
    if s.aura.bridge { m.reach = m.reach.max((s.aura.bridge_len * 0.3).min(25.0)); }
    for t in &s.tiers { if t.but_n > 0 { m.reach = m.reach.max(t.r0.max(t.r1) + t.but_r + 1.0); } }
    if s.aura.roots > 0 { m.reach = m.reach.max(m.r_max * 2.2); }

    connect_sockets(&mut b);
    check(&mut b, &s, &m);
    TowerPlan { parts: b.parts, sockets: b.sockets, diagnostics: b.diags, measures: m }
}

struct BodyInfo { h: f32, top: f32, spans: Vec<[f32; 2]> }

fn build_body(b: &mut B, s: &Spec, sockets: bool) -> BodyInfo {
    let w = s.look.weather;
    let t0 = s.tiers[0].clone();
    let n0 = t0.sides;
    let f = &s.foot;
    let mut y = 0.0;
    if sockets { b.socket("ground".into(), SocketType::Ground, SocketDir::Up, SocketRule::Optional, &[SocketType::TierBase], Vec3::ZERO, 0.0); }
    if f.kind != FootKind::None {
        let r = t0.r0 * f.spread;
        let mat = solid(t0.mat);
        match f.kind {
            FootKind::Plinth => {
                b.one("foot_plinth", mat, Shape::Cuboid { size: [r * 2.0, f.h * 0.85, r * 2.0] }, place(Vec3::new(0.0, f.h * 0.425, 0.0)));
                b.one("foot_plinth", mat, Shape::Cuboid { size: [r * 2.12, f.h * 0.15, r * 2.12] }, place(Vec3::new(0.0, f.h * 0.925, 0.0)));
            }
            FootKind::Steps => {
                for i in 0..3 {
                    let rr = r * (1.0 - i as f32 * 0.13); let (ya, yb) = (f.h * i as f32 / 3.0, f.h * (i + 1) as f32 / 3.0);
                    b.one("foot_steps", mat, lathe(vec![[0.0, ya], [rr, ya], [rr, yb], [0.0, yb]], n0), Mat4::IDENTITY);
                }
            }
            FootKind::Roots => {
                let pts = (0..=20).map(|i| { let t = i as f32 / 20.0; [t0.r0 + (r - t0.r0) * (1.0 - t).powf(2.4), t * f.h] }).collect();
                b.one("foot_roots", solid(t0.mat), Shape::Lathe { outline: pts, sides: n0, twist: 0.0, weather: w, seed: s.seed }, Mat4::IDENTITY);
                if f.fins > 0 {
                    let d = (t0.r0 * 0.16).max(0.3);
                    let fin = Shape::Extrusion { outline: vec![[t0.r0 * 0.85, f.h * 1.25], [r * 1.18, 0.0], [t0.r0 * 0.85, 0.0]], holes: vec![], depth: d };
                    let base = if f.fins == n0 { phi0(n0) } else { 0.0 };
                    let ms = (0..f.fins).map(|i| ry(base + i as f32 * TAU / f.fins as f32 - FRAC_PI_2)).collect();
                    b.many("foot_fin", mat, fin, ms);
                }
            }
            FootKind::Buried => {
                // a dune heaped round the foot
                let r2 = r * 1.5;
                let pts: Vec<[f32; 2]> = (0..=16).map(|i| { let t = i as f32 / 16.0; [t0.r0 * 0.98 + (r2 - t0.r0) * (1.0 - t), f.h * (FRAC_PI_2 * t).sin().powf(0.8)] }).collect();
                let mut mesh = geometry::lathe_mesh(&pts, 64, 0.0, 0.0, 0);
                let off = b.rng.f() * 50.0;
                for p in mesh.positions.iter_mut() {
                    let a = p[0].atan2(p[2]);
                    let k = 1.0 + 0.12 * (vnoise(a * 3.0 + off) - 0.5);
                    let yy = (p[1] * (0.8 + 0.35 * vnoise(a * 2.0 + off + 7.0))).min(f.h);
                    *p = [p[0] * k, yy, p[2] * k];
                }
                b.one("foot_dune", MatSlot::Sand, Shape::Raw { positions: mesh.positions, indices: mesh.indices }, Mat4::IDENTITY);
            }
            FootKind::Crag => {
                let off = b.rng.f() * 40.0;
                let mut pos = vec![]; let mut idx = vec![];
                let mut rock = |rx: f32, ry_: f32, ox: f32, oz: f32| {
                    let m = geometry::icosphere(2);
                    let base = pos.len() as u32;
                    for p in &m.positions {
                        let n = 0.75 + 0.5 * vnoise(p[0] * 2.3 + off) * vnoise(p[2] * 2.1 + p[1] * 1.7 + off);
                        pos.push([p[0] * n * rx + ox, p[1].max(-0.2) * n * ry_, p[2] * n * rx + oz]);
                    }
                    idx.extend(m.indices.iter().map(|i| i + base));
                };
                rock(r * 1.15, f.h * 1.05, 0.0, 0.0);
                for _ in 0..4 { let a = b.rng.f() * TAU; let d = r * b.rng.range(0.8, 1.4); rock(r * b.rng.range(0.35, 0.7), f.h * b.rng.range(0.35, 0.8), a.sin() * d, a.cos() * d); }
                b.one("foot_crag", MatSlot::Rock, Shape::Raw { positions: pos, indices: idx }, Mat4::IDENTITY);
            }
            FootKind::None => {}
        }
        y = match f.kind { FootKind::Buried => 0.0, FootKind::Crag => f.h * 0.82, _ => f.h };
        if sockets { b.socket("foot.top".into(), SocketType::FootTop, SocketDir::Up, SocketRule::MustConnect, &[SocketType::TierBase], Vec3::new(0.0, y, 0.0), t0.r0); }
    }

    let mut spans = vec![];
    let tiers = s.tiers.clone();
    for (ti, t) in tiers.iter().enumerate() {
        let y0 = y; let y1 = y0 + t.h; let n = t.sides; let tw = t.twist.to_radians();
        let outline = tier_outline(t, y0);
        let weather = if t.pat == "none" { w } else { w * 0.5 };
        b.one("tier", mat_of(t.mat), Shape::Lathe { outline: outline.clone(), sides: n, twist: tw, weather, seed: s.seed.wrapping_add(ti as u32) }, Mat4::IDENTITY);
        let r_top = t.r_at(1.0);
        b.one("tier_cap", if t.mat == Mat::Glow { MatSlot::Dark } else { mat_of(t.mat) }, lathe(vec![[0.0, y1], [r_top, y1]], n), ry(tw));
        if sockets {
            b.socket(format!("tier{}.base", ti + 1), SocketType::TierBase, SocketDir::Down, SocketRule::MustConnect, &[SocketType::Ground, SocketType::FootTop, SocketType::TierTop], Vec3::new(0.0, y0, 0.0), t.r0);
            b.socket(format!("tier{}.top", ti + 1), SocketType::TierTop, SocketDir::Up, SocketRule::Optional, &[SocketType::TierBase, SocketType::CrownBase], Vec3::new(0.0, y1, 0.0), r_top);
        }
        if t.ribs > 0 {
            let wid = (TAU * t.r0.min(t.r1) / t.ribs as f32 * 0.32).min(0.7);
            let base = if t.ribs == n { phi0(n) } else { 0.0 };
            let angles = (0..t.ribs).map(|k| base + k as f32 * TAU / t.ribs as f32).collect();
            b.one("tier_ribs", if t.mat == Mat::Glow { MatSlot::Dark } else { mat_of(t.mat) }, Shape::Strips { outline: outline.clone(), sides: n, twist: tw, angles, width: wid, depth: t.rib_d }, Mat4::IDENTITY);
        }
        if t.chan > 0 {
            let angles = (0..t.chan).map(|k| k as f32 * TAU / t.chan as f32).collect();
            b.one("tier_channels", MatSlot::Glow, Shape::Strips { outline: outline.clone(), sides: n, twist: tw, angles, width: 0.2, depth: 0.05 }, Mat4::IDENTITY);
        }
        if t.win_rows > 0 {
            let row_h = t.h / t.win_rows as f32;
            let (wh, ww0) = match t.win_kind { WinKind::Round => (row_h * 0.42, row_h * 0.42), WinKind::Slit => (row_h * 0.62, row_h * 0.62 * 0.32), WinKind::Arch => (row_h * 0.58, row_h * 0.58 * 0.5) };
            let mut ms = vec![];
            for ri in 0..t.win_rows {
                let u = (ri as f32 + 0.5) / t.win_rows as f32; let rr = t.r_at(u);
                let ww = ww0.min(TAU * rr / t.win_per as f32 * 0.55);
                for k in 0..t.win_per {
                    let off = if ri % 2 == 1 && t.win_per > 1 { 0.5 } else { 0.0 };
                    let a = (k as f32 + off) * TAU / t.win_per as f32 + tw * u;
                    ms.push(trs(at(poly_r(rr, n, a) + 0.04, a, y0 + u * t.h), a, Vec3::new(ww, wh, 1.0), 0.0));
                }
            }
            let kind = match t.win_kind { WinKind::Arch => Opening::Arch, WinKind::Slit => Opening::Slit, WinKind::Round => Opening::Round };
            b.many("opening", if t.win_glow { MatSlot::Glow } else { MatSlot::Void }, Shape::Opening { kind }, ms);
        }
        add_band(b, t, y1, r_top, n, ti, sockets);
        if t.stair > 0.0 { add_stair(b, t, y0); }
        if t.ban_n > 0 { add_banners(b, t, y1, r_top, n); }
        if t.but_n > 0 { add_buttresses(b, t, y0); }
        if t.sp_n > 0 {
            let (hh, rr) = (t.sp_h * t.h, t.sp_r);
            let (mut sh, mut cap, mut ball) = (vec![], vec![], vec![]);
            for k in 0..t.sp_n {
                let a = (k as f32 + 0.5) * TAU / t.sp_n as f32; let r = poly_r(t.r0, n, a) + rr * 0.85;
                sh.push(trs(at(r, a, y0 + hh / 2.0), a, Vec3::new(rr, hh, rr), 0.0));
                cap.push(trs(at(r, a, y0 + hh + rr * 1.1), a, Vec3::new(rr * 1.15, rr * 2.2, rr * 1.15), 0.0));
                ball.push(trs(at(r, a, y0 + hh + rr * 2.35), 0.0, Vec3::splat(rr * 0.28), 0.0));
            }
            b.many("turret", solid(t.mat), Shape::Cylinder { r_top: 1.0, r_bottom: 1.08, h: 1.0, segments: 16, open: false }, sh);
            b.many("turret_cap", MatSlot::Accent, unit_cone(16), cap);
            b.many("turret_finial", MatSlot::Accent, unit_sphere(), ball);
        }
        spans.push([y0, y1]);
        y = y1;
    }
    let h = y;
    let tl = tiers.last().unwrap();
    let top = add_crown(b, s, h, tl.r_at(1.0), tl.sides, sockets);
    BodyInfo { h, top, spans }
}

fn add_band(b: &mut B, t: &Tier, y1: f32, rt: f32, n: u32, ti: usize, sockets: bool) {
    let s = t.band_size; let circ = TAU * rt; let mat = solid(t.mat);
    let ring_angles = |k: usize, half: bool| -> Vec<f32> { (0..k).map(|i| (i as f32 + if half { 0.5 } else { 0.0 }) * TAU / k as f32).collect() };
    let tag = format!("band_{}", t.band.key());
    match t.band {
        Band::None => return,
        Band::Ring => {
            let pts = (0..=10).map(|i| { let a = -FRAC_PI_2 + PI * i as f32 / 10.0; [rt + a.cos() * s * 0.35, y1 + a.sin() * s * 0.35] }).collect();
            b.one(&tag, mat, lathe(pts, n), Mat4::IDENTITY);
        }
        Band::Balcony => {
            let o = s * 1.25;
            b.one(&tag, mat, lathe(vec![[rt - 0.02, y1 - 0.18], [rt + o, y1 - 0.18], [rt + o, y1 + 0.12], [rt + o, y1 + 0.12 + s * 0.85], [rt + o - 0.14, y1 + 0.12 + s * 0.85], [rt + o - 0.14, y1 + 0.12], [rt - 0.02, y1 + 0.12]], n), Mat4::IDENTITY);
            let k = 6.max((circ / (s * 1.4).max(0.6)).round() as usize);
            let ms = ring_angles(k, false).into_iter().map(|a| trs(at(poly_r(rt, n, a) + o * 0.55, a, y1 - 0.18 - s * 0.5), a, Vec3::new(o * 0.32, s, o * 0.55), PI)).collect();
            b.many("band_balcony_corbel", mat, unit_cone(4), ms);
        }
        Band::Corbel => {
            b.one(&tag, mat, lathe(vec![[rt - 0.02, y1 - s * 1.6], [rt + s * 0.22, y1 - s * 1.6], [rt + s * 0.22, y1 - s * 1.05], [rt + s * 0.5, y1 - s * 1.05], [rt + s * 0.5, y1 - s * 0.5], [rt + s * 0.8, y1 - s * 0.5], [rt + s * 0.8, y1], [rt - 0.02, y1]], n), Mat4::IDENTITY);
            let k = 8.max((circ / (s * 0.8).max(0.4)).round() as usize);
            let ms = ring_angles(k, true).into_iter().map(|a| trs(at(poly_r(rt, n, a) + s * 0.52, a, y1 - s * 0.78), a, Vec3::new(s * 0.28, s * 0.45, 1.0), 0.0)).collect();
            b.many("band_corbel_niche", MatSlot::Void, Shape::Opening { kind: Opening::Arch }, ms);
        }
        Band::Beads => {
            b.one(&tag, mat, lathe(vec![[rt - 0.02, y1 - s * 1.25], [rt + s * 0.12, y1 - s * 1.25], [rt + s * 0.12, y1], [rt - 0.02, y1]], n), Mat4::IDENTITY);
            let k = 6.max((circ / (s * 1.25)).round() as usize);
            let ms = ring_angles(k, false).into_iter().map(|a| trs(at(poly_r(rt, n, a) + s * 0.16, a, y1 - s * 0.62), a, Vec3::splat(s), 0.0)).collect();
            b.many("band_bead", MatSlot::Accent, Shape::Torus { r: 0.42, tube: 0.09, arc: TAU, segments: 24 }, ms);
        }
        Band::Crenel => {
            let k = 6.max((circ / (s * 1.3)).round() as usize);
            let ms = ring_angles(k, false).into_iter().map(|a| trs(at(poly_r(rt, n, a) - s * 0.2, a, y1 + s * 0.5), a, Vec3::new(s * 0.65, s, s * 0.4), 0.0)).collect();
            b.many(&tag, mat, unit_box(), ms);
        }
        Band::Drops => {
            b.one(&tag, MatSlot::Accent, lathe(vec![[rt - 0.02, y1 - s * 0.5], [rt + s * 0.25, y1 - s * 0.5], [rt + s * 0.25, y1], [rt - 0.02, y1]], n), Mat4::IDENTITY);
            let k = 6.max((circ / (s * 1.5)).round() as usize);
            let angles = ring_angles(k, true);
            let cones = angles.iter().map(|&a| trs(at(poly_r(rt, n, a) + s * 0.18, a, y1 - s * 1.25), a, Vec3::new(s * 0.2, s * 1.3, s * 0.2), PI)).collect();
            let balls = angles.iter().map(|&a| trs(at(poly_r(rt, n, a) + s * 0.18, a, y1 - s * 0.62), a, Vec3::new(s * 0.22, s * 0.3, s * 0.22), 0.0)).collect();
            b.many("band_drop", MatSlot::Accent, unit_cone(10), cones);
            b.many("band_drop_bead", MatSlot::Accent, unit_sphere(), balls);
        }
        Band::Glyphs => {
            b.one(&tag, MatSlot::Dark, lathe(vec![[rt - 0.02, y1 - s * 1.3], [rt + 0.08, y1 - s * 1.3], [rt + 0.08, y1], [rt - 0.02, y1]], n), Mat4::IDENTITY);
            // glyphs: short glowing strokes on a 3×3 grid per cell, standing in for the browser's texture
            let k = 6.max((circ / (s * 0.9)).round() as usize);
            let mut ms = vec![];
            for i in 0..k {
                let a = i as f32 * TAU / k as f32; let r = poly_r(rt, n, a) + 0.1;
                for _ in 0..3 {
                    let gx = b.rng.below(3) as f32 - 1.0; let gy = b.rng.below(3) as f32 - 1.0; let vertical = b.rng.chance(0.5);
                    let cell = s * 0.22; let pos = at(r, a + gx * cell / r, y1 - s * 0.65 + gy * cell);
                    let size = if vertical { Vec3::new(s * 0.06, cell * 1.6, 0.05) } else { Vec3::new(cell * 1.6, s * 0.06, 0.05) };
                    ms.push(trs(pos, a, size, 0.0));
                }
            }
            b.many("band_glyph", MatSlot::Glow, unit_box(), ms);
        }
    }
    if sockets { b.socket(format!("tier{}.band", ti + 1), SocketType::BandRing, SocketDir::Out, SocketRule::Optional, &[SocketType::TierTop], Vec3::new(0.0, y1, 0.0), rt); }
}

fn add_stair(b: &mut B, t: &Tier, y0: f32) {
    let turns = t.stair; let segs = 12.max((turns * 40.0).round() as usize);
    let w = (t.r0.min(t.r1) * 0.38).clamp(0.8, 2.4);
    let (mut pos, mut idx): (Vec<[f32; 3]>, Vec<u32>) = (vec![], vec![]);
    let mut quad = |a: Vec3, b_: Vec3, c: Vec3, d: Vec3| {
        let base = pos.len() as u32;
        for v in [a, b_, c, d] { pos.push(v.to_array()); }
        idx.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    };
    for i in 0..segs {
        let (u0, u1) = (i as f32 / segs as f32, (i + 1) as f32 / segs as f32);
        let (a0, a1) = (u0 * turns * TAU, u1 * turns * TAU);
        let (yy, yn) = (y0 + u0 * t.h * 0.92, y0 + u1 * t.h * 0.92);
        let r0 = poly_r(t.r_at(u0), t.sides, a0) - 0.05; let r1 = poly_r(t.r_at(u1), t.sides, a1) - 0.05;
        let (pa, pb, pc, pd) = (at(r0, a0, yy), at(r0 + w, a0, yy), at(r1 + w, a1, yy), at(r1, a1, yy));
        quad(pa, pb, pc, pd);
        quad(pd, pc, at(r1 + w, a1, yn), at(r1, a1, yn));
        quad(at(r0 + w, a0, yy - 0.35), at(r1 + w, a1, yy - 0.35), at(r1 + w, a1, yn + 0.75), at(r0 + w, a0, yy + 0.75));
        quad(at(r0, a0, yy - 0.35), at(r1, a1, yy - 0.35), at(r1 + w, a1, yy - 0.35), at(r0 + w, a0, yy - 0.35));
    }
    b.one("stair", solid(t.mat), Shape::Raw { positions: pos, indices: idx }, Mat4::IDENTITY);
}

fn add_banners(b: &mut B, t: &Tier, y1: f32, rt: f32, n: u32) {
    let k = t.ban_n; let wdt = (TAU * rt / k as f32 * 0.45).clamp(0.4, 1.6);
    let push_out = match t.band { Band::Balcony => t.band_size * 1.25, Band::None => 0.0, _ => t.band_size * 0.4 };
    let ms = (0..k).map(|i| { let a = (i as f32 + 0.5) * TAU / k as f32; trs(at(poly_r(rt, n, a) + 0.18 + push_out, a, y1 - 0.1), a, Vec3::ONE, 0.0) }).collect();
    if let Some(i) = b.many("banner", MatSlot::Cloth, Shape::Cloth { w: wdt, len: t.ban_len }, ms) {
        b.parts[i].motion = Motion::Sway { speed: 1.6, amount: 0.12 };
    }
}

fn add_buttresses(b: &mut B, t: &Tier, y0: f32) {
    let k = t.but_n; let yp = y0 + t.h * 0.5; let yw = y0 + t.h * 0.85; let th = (t.h * 0.05).max(0.5);
    let dep = (t.r0.min(t.r1) * 0.14).max(0.5);
    let rw = t.r0.min(t.r1) * 0.95; let r = t.r0.max(t.r1) + t.but_r;
    let mut outline = vec![[r - 0.4, yp + th], [rw, yw + th * 0.6], [rw, yw - th * 1.2]];
    for i in 1..=10 { let u = i as f32 / 10.0; outline.push([rw + (r - 0.4 - rw) * u, (yw - th * 1.2) + ((yp - th) - (yw - th * 1.2)) * u - (PI * u).sin() * th * 1.4]); }
    let pier_h = yp + th * 2.2; let pw = (dep * 1.6).max(0.8);
    let angles: Vec<f32> = (0..k).map(|i| (i as f32 + 0.5) * TAU / k as f32).collect();
    let mat = if matches!(t.mat, Mat::Glow | Mat::Accent) { MatSlot::Body } else { mat_of(t.mat) };
    b.many("buttress_flyer", mat, Shape::Extrusion { outline, holes: vec![], depth: dep }, angles.iter().map(|&a| ry(a - FRAC_PI_2)).collect());
    b.many("buttress_pier", mat, unit_box(), angles.iter().map(|&a| trs(at(r, a, pier_h / 2.0), a, Vec3::new(pw, pier_h, pw), 0.0)).collect());
    b.many("buttress_pinnacle", mat, unit_cone(4), angles.iter().map(|&a| trs(at(r, a, pier_h + pw * 1.2), a + FRAC_PI_4, Vec3::new(pw * 0.75, pw * 2.4, pw * 0.75), 0.0)).collect());
}

fn add_crown(b: &mut B, s: &Spec, h0: f32, rt: f32, n: u32, sockets: bool) -> f32 {
    let c = &s.crown; let h = c.h; let mat = mat_of(c.mat);
    let tag = format!("crown_{}", c.kind.key());
    if sockets { b.socket("crown.base".into(), SocketType::CrownBase, SocketDir::Down, SocketRule::MustConnect, &[SocketType::TierTop], Vec3::new(0.0, h0, 0.0), rt); }
    let cap = |b: &mut B, lift: f32, over: f32| { b.one(&tag, mat, lathe(vec![[0.0, h0 + lift], [rt * over, h0 + lift], [rt * over, h0], [rt, h0]], n), Mat4::IDENTITY); };
    let mut top: f32;
    match c.kind {
        CrownKind::Flat => { cap(b, 0.25, 1.04); top = h0 + 0.25; }
        CrownKind::Dome => {
            let pts = (0..=18).map(|i| { let a = FRAC_PI_2 * i as f32 / 18.0; [rt * 0.97 * a.cos(), h0 + h * a.sin()] }).collect();
            b.one(&tag, mat, lathe(pts, 0), Mat4::IDENTITY); top = h0 + h;
        }
        CrownKind::Onion => {
            let p = [[1.0, 0.0], [1.12, 0.14], [1.16, 0.3], [1.02, 0.48], [0.72, 0.66], [0.4, 0.82], [0.14, 0.94], [0.02, 1.0]];
            b.one(&tag, mat, lathe(p.iter().map(|q| [q[0] * rt * 0.88, h0 + q[1] * h]).collect(), 0), Mat4::IDENTITY); top = h0 + h;
        }
        CrownKind::Cone => { b.one(&tag, mat, lathe(vec![[rt * 1.06, h0], [0.02, h0 + h]], n), Mat4::IDENTITY); top = h0 + h; }
        CrownKind::Spire => {
            b.one(&tag, mat, lathe(vec![[rt * 0.55, h0], [rt * 0.42, h0 + h * 0.08], [0.02, h0 + h]], if n > 0 { n } else { 24 }), Mat4::IDENTITY);
            for i in 1..=3 {
                let yy = h0 + h * i as f32 * 0.18; let r = rt * 0.42 * (1.0 - i as f32 * 0.18);
                b.one("crown_spire_ring", MatSlot::Accent, Shape::Torus { r: r + 0.06, tube: 0.08 + rt * 0.02, arc: TAU, segments: 32 }, Mat4::from_translation(Vec3::new(0.0, yy, 0.0)) * Mat4::from_rotation_x(FRAC_PI_2));
            }
            top = h0 + h;
        }
        CrownKind::Spikes => {
            cap(b, 0.2, 1.08);
            let k = 6.max((rt * 3.0).round() as usize);
            let mut ms = vec![];
            for i in 0..k {
                let a = i as f32 * TAU / k as f32; let hh = h * if i % 2 == 1 { 0.28 } else { 0.5 } * b.rng.range(0.8, 1.2); let rr = (rt * 0.08).max(0.08);
                ms.push(trs(at(rt * 0.92, a, h0 + 0.2 + hh / 2.0), 0.0, Vec3::new(rr, hh, rr), 0.0));
            }
            let rr = (rt * 0.16).max(0.12);
            ms.push(trs(Vec3::new(0.0, h0 + 0.2 + h / 2.0, 0.0), 0.0, Vec3::new(rr, h, rr), 0.0));
            b.many("crown_spike", mat, unit_cone(8), ms);
            top = h0 + 0.2 + h;
        }
        CrownKind::Crenel => {
            b.one(&tag, mat, lathe(vec![[0.0, h0 + 0.2], [rt, h0 + 0.2], [rt, h0]], n), Mat4::IDENTITY);
            let k = 6.max((TAU * rt / (h * 0.9).max(0.6)).round() as usize);
            let ms = (0..k).map(|i| { let a = i as f32 * TAU / k as f32; trs(at(poly_r(rt, n, a) - h * 0.15, a, h0 + 0.2 + h * 0.4), a, Vec3::new(h * 0.55, h * 0.8, h * 0.3), 0.0) }).collect();
            b.many("crown_merlon", mat, unit_box(), ms);
            top = h0 + h;
        }
        CrownKind::Lantern => {
            cap(b, 0.2, 1.05);
            let ch = h * 0.55;
            let ms = (0..8).map(|i| { let a = i as f32 * TAU / 8.0; trs(at(rt * 0.82, a, h0 + 0.2 + ch / 2.0), a, Vec3::new(rt * 0.07 + 0.05, ch, rt * 0.07 + 0.05), 0.0) }).collect();
            b.many("crown_lantern_column", mat, Shape::Cylinder { r_top: 1.0, r_bottom: 1.0, h: 1.0, segments: 10, open: false }, ms);
            let mut pts = vec![[0.0, h0 + 0.2 + ch], [rt, h0 + 0.2 + ch], [rt, h0 + 0.45 + ch]];
            for i in 0..=12 { let a = FRAC_PI_2 * i as f32 / 12.0; pts.push([rt * 0.9 * a.cos(), h0 + 0.45 + ch + h * 0.45 * a.sin()]); }
            b.one(&tag, mat, lathe(pts, 0), Mat4::IDENTITY);
            b.one("crown_lantern_light", MatSlot::Glow, Shape::Sphere { r: rt * 0.45, segments: 24 }, place(Vec3::new(0.0, h0 + 0.2 + ch * 0.5, 0.0)));
            top = h0 + 0.45 + ch + h * 0.45;
        }
        CrownKind::Crescent => {
            cap(b, 0.2, 1.05);
            let r = (rt * 1.2).max(h * 0.5); let tube = (rt * 0.42).max(0.3); let arc = PI * 1.4; let seg = 7; let gap = 0.035;
            let centre = Vec3::new(0.0, h0 + 0.2 + r - tube * 0.2, 0.0);
            for i in 0..seg {
                let a0 = -FRAC_PI_2 - arc / 2.0 + arc * i as f32 / seg as f32 + gap;
                let a1 = -FRAC_PI_2 - arc / 2.0 + arc * (i + 1) as f32 / seg as f32 - gap;
                let k = 1.0 - (i as f32 - (seg - 1) as f32 / 2.0).abs() / seg as f32 * 0.6;
                b.one("crown_crescent_block", solid(c.mat), Shape::Torus { r, tube: tube * k, arc: a1 - a0, segments: 10 }, Mat4::from_translation(centre) * Mat4::from_rotation_z(a0));
            }
            top = h0 + r * 2.0;
        }
        CrownKind::Gothic => {
            cap(b, 0.3, 1.04);
            b.one(&tag, mat, lathe(vec![[rt * 0.55, h0 + 0.3], [rt * 0.5, h0 + 0.3 + h * 0.12], [rt * 0.42, h0 + 0.3 + h * 0.12], [0.03, h0 + 0.3 + h]], 8), Mat4::IDENTITY);
            let k = if n >= 4 { n } else { 8 };
            let (mut shafts, mut cones, mut crk) = (vec![], vec![], vec![]);
            for i in 0..k {
                let a = phi0(k) + i as f32 * TAU / k as f32; let r2 = poly_r(rt, n, a) * 0.86; let ph = h * 0.32;
                shafts.push(trs(at(r2, a, h0 + 0.3 + ph * 0.225), a, Vec3::new(rt * 0.14 + 0.1, ph * 0.45, rt * 0.14 + 0.1), 0.0));
                cones.push(trs(at(r2, a, h0 + 0.3 + ph * 0.825), a + FRAC_PI_4, Vec3::new(rt * 0.1 + 0.08, ph * 0.75, rt * 0.1 + 0.08), 0.0));
            }
            for j in 1..=6 { for i in 0..8 {
                let u = 0.12 + j as f32 * 0.13; let a = phi0(8) + i as f32 * FRAC_PI_4; let rr = rt * 0.42 * (1.0 - (u - 0.12) / 0.88) + 0.05;
                crk.push(trs(at(rr + 0.08, a, h0 + 0.3 + h * u), a, Vec3::new(0.12 + rt * 0.03, 0.3 + h * 0.02, 0.12 + rt * 0.03), -0.6));
            } }
            b.many("crown_pinnacle", mat, unit_box(), shafts);
            b.many("crown_pinnacle_spire", mat, unit_cone(4), cones);
            b.many("crown_crocket", mat, unit_cone(4), crk);
            top = h0 + 0.3 + h;
        }
        CrownKind::Belfry => {
            cap(b, 0.25, 1.04);
            let k = if n >= 4 { n } else { 4 }; let ph = h * 0.55;
            let ms = (0..k).map(|i| { let a = phi0(k) + i as f32 * TAU / k as f32; trs(at(poly_r(rt, n, a) * 0.88, a, h0 + 0.25 + ph / 2.0), a, Vec3::new(rt * 0.22 + 0.15, ph, rt * 0.22 + 0.15), 0.0) }).collect();
            b.many("crown_belfry_pier", mat, unit_box(), ms);
            b.one(&tag, mat, lathe(vec![[rt * 0.6, h0 + 0.25 + ph], [rt * 1.02, h0 + 0.25 + ph], [rt * 1.02, h0 + 0.6 + ph], [0.0, h0 + 0.6 + ph]], if n > 0 { n } else { 8 }), Mat4::IDENTITY);
            b.one("crown_belfry_roof", mat, lathe(vec![[rt * 1.12, h0 + 0.6 + ph], [0.02, h0 + 0.6 + ph + h * 0.45]], k), Mat4::IDENTITY);
            let bell = vec![[0.02, 0.0], [rt * 0.12, -0.05], [rt * 0.2, -ph * 0.15], [rt * 0.26, -ph * 0.38], [rt * 0.38, -ph * 0.5], [rt * 0.36, -ph * 0.52]];
            let mut p = Part::new("crown_bell", MatSlot::Accent, lathe(bell, 0)).at(Mat4::IDENTITY);
            p.pivot = Mat4::from_translation(Vec3::new(0.0, h0 + 0.25 + ph * 0.95, 0.0)).to_cols_array();
            p.motion = Motion::Swing { axis: [1.0, 0.0, 0.0], speed: 1.1, amount: 0.18 };
            b.add(p);
            top = h0 + 0.6 + ph + h * 0.45;
        }
        CrownKind::Broken => {
            let mut ms = vec![];
            for _ in 0..7 {
                let a = b.rng.f() * TAU; let r = rt * b.rng.range(0.2, 0.9); let hh = h * b.rng.range(0.2, 1.2);
                let size = Vec3::new(rt * b.rng.range(0.25, 0.65), hh, rt * b.rng.range(0.25, 0.65));
                ms.push(trs(Vec3::new(a.sin() * r, h0 + hh / 2.0, a.cos() * r), b.rng.f() * 3.0, size, 0.0));
            }
            b.many("crown_broken_block", solid(c.mat), unit_box(), ms);
            b.one(&tag, solid(c.mat), lathe(vec![[0.0, h0 + 0.05], [rt, h0 + 0.05], [rt, h0]], n), Mat4::IDENTITY);
            top = h0 + h;
        }
    }
    if c.finial {
        let fh = (h * 0.35).max(1.0);
        b.one("finial", MatSlot::Accent, Shape::Cylinder { r_top: 0.05, r_bottom: 0.08, h: fh, segments: 8, open: false }, place(Vec3::new(0.0, top + fh / 2.0, 0.0)));
        b.one("finial", MatSlot::Accent, Shape::Sphere { r: (rt * 0.06).max(0.14), segments: 12 }, place(Vec3::new(0.0, top + fh * 0.62, 0.0)));
        top += fh;
    }
    top
}

fn radius_at_y(s: &Spec, spans: &[[f32; 2]], y: f32) -> f32 {
    for (i, sp) in spans.iter().enumerate() { if y >= sp[0] && y <= sp[1] { return s.tiers[i].r_at((y - sp[0]) / (sp[1] - sp[0]).max(0.01)); } }
    if y < spans.first().map(|s| s[0]).unwrap_or(0.0) { s.tiers[0].r0 } else { s.top_radius() }
}

fn build_aura(b: &mut B, s: &Spec, m: &mut Measures) {
    let a = &s.aura; let h_top = m.h;
    let mut first_portal: Option<Mat4> = None;
    for (hi, h) in s.halos.iter().enumerate() {
        let face = h.face.to_radians();
        let pos = Vec3::new(face.sin() * h.off + (h_top + h.y) * m.lean, h_top + h.y, face.cos() * h.off);
        let holder = Mat4::from_translation(pos) * Mat4::from_rotation_y(face) * Mat4::from_rotation_x(h.tilt.to_radians());
        let r = h.r; let spin = h.spin;
        let put = |b: &mut B, tag: &str, mat: MatSlot, shape: Shape, inst: Vec<Mat4>, pivot: Mat4, motion: Motion| {
            let mut p = Part::new(tag, mat, shape); p.instances = inst.iter().map(|m| m.to_cols_array()).collect(); p.pivot = pivot.to_cols_array(); p.motion = motion; b.add(p);
        };
        b.socket(format!("halo{}", hi + 1), SocketType::HaloMount, SocketDir::Out, SocketRule::Optional, &[], pos, r);
        match h.kind {
            HaloKind::Portal => {
                for i in 0..h.n.max(1) {
                    let rr = r * (1.0 - i as f32 * 0.14); let tube = if i == 0 { r * 0.045 + 0.04 } else { r * 0.018 + 0.02 };
                    let sp = spin * if i % 2 == 1 { -1.3 } else { 1.0 } * (1.0 + i as f32 * 0.2);
                    put(b, "halo_portal_ring", MatSlot::Glow, Shape::Torus { r: rr, tube, arc: TAU, segments: 96 }, vec![Mat4::IDENTITY], holder, Motion::Spin { axis: [0.0, 0.0, 1.0], speed: sp });
                }
                // rune marks round the inner ring
                let k = 48; let mut marks = vec![]; let mut rng = Rng::new(77 + hi as u64);
                for i in 0..k { let a = i as f32 / k as f32 * TAU; let long = rng.chance(0.5); marks.push(Mat4::from_translation(Vec3::new(a.cos() * r * 0.78, a.sin() * r * 0.78, 0.0)) * Mat4::from_rotation_z(a) * Mat4::from_scale(Vec3::new(if long { r * 0.08 } else { r * 0.03 }, r * 0.02, 0.02))); }
                put(b, "halo_portal_runes", MatSlot::Glow, unit_box(), marks, holder, Motion::Spin { axis: [0.0, 0.0, 1.0], speed: -spin * 0.35 });
                // a spiral swirl at the centre
                let pts: Vec<[f32; 3]> = (0..60).map(|i| { let t = i as f32 / 59.0; let a = t * 9.0; let rr = r * (0.05 + t * 0.55); [a.cos() * rr, a.sin() * rr, 0.02] }).collect();
                put(b, "halo_portal_swirl", MatSlot::Glow, Shape::Tube { points: pts, radius: r * 0.02 + 0.02, taper: 0.2 }, vec![Mat4::IDENTITY], holder, Motion::Spin { axis: [0.0, 0.0, 1.0], speed: spin * 2.2 });
                if first_portal.is_none() { first_portal = Some(holder); }
            }
            HaloKind::Armillary => {
                let mut rng = Rng::new(s.seed as u64 * 31 + hi as u64);
                for i in 0..h.n.max(1) {
                    let rr = r * (1.0 - i as f32 * 0.07);
                    let orient = holder * Mat4::from_quat(Quat::from_euler(glam::EulerRot::XYZ, rng.f() * PI, rng.f() * PI, rng.f() * PI));
                    let axis = Vec3::new(rng.signed(), rng.signed(), rng.signed()).normalize_or(Vec3::Z);
                    let sp = spin * rng.range(0.3, 1.3) * if rng.chance(0.5) { -1.0 } else { 1.0 };
                    let mo = Motion::Spin { axis: axis.to_array(), speed: sp };
                    put(b, "halo_armillary_ring", MatSlot::Accent, Shape::Torus { r: rr, tube: (r * 0.014).max(0.05), arc: TAU, segments: 120 }, vec![Mat4::IDENTITY], orient, mo);
                    let pa = rng.f() * TAU;
                    put(b, "halo_armillary_planet", MatSlot::Accent, Shape::Sphere { r: (r * rng.range(0.04, 0.09)).max(0.2), segments: 20 }, vec![Mat4::from_translation(Vec3::new(pa.cos() * rr, pa.sin() * rr, 0.0))], orient, mo);
                    if i == 0 {
                        let ticks = (0..36).map(|k| { let a = k as f32 / 36.0 * TAU; trs(Vec3::new(a.cos() * rr, a.sin() * rr, 0.0), 0.0, Vec3::new(0.06, 0.06, r * 0.05 + 0.1), 0.0) }).collect();
                        put(b, "halo_armillary_tick", MatSlot::Accent, unit_box(), ticks, orient, mo);
                    }
                }
            }
            HaloKind::Gear => {
                let arc = PI * 1.45; let rot = Mat4::from_rotation_z(-FRAC_PI_2 - arc / 2.0 + PI);
                let mo = Motion::Swing { axis: [0.0, 0.0, 1.0], speed: spin, amount: 0.35 };
                put(b, "halo_gear", MatSlot::Accent, Shape::Torus { r, tube: (r * 0.05).max(0.12), arc, segments: 120 }, vec![rot], holder, mo);
                put(b, "halo_gear_inner", MatSlot::Glow, Shape::Torus { r: r * 0.86, tube: (r * 0.012).max(0.05), arc, segments: 120 }, vec![rot], holder, mo);
                let k = (arc * r / 0.9).round() as usize;
                let teeth = (0..=k).map(|i| { let a = FRAC_PI_2 - arc / 2.0 + arc * i as f32 / k as f32; Mat4::from_translation(Vec3::new(a.cos() * r * 1.07, a.sin() * r * 1.07, 0.0)) * Mat4::from_rotation_z(a) * Mat4::from_scale(Vec3::new(0.49, 0.28, 0.3)) }).collect();
                put(b, "halo_gear_tooth", MatSlot::Accent, unit_box(), teeth, holder, mo);
            }
            HaloKind::Ring => {
                let flat = Mat4::from_rotation_x(FRAC_PI_2);
                let mo = Motion::Spin { axis: [0.0, 1.0, 0.0], speed: spin * 0.6 };
                put(b, "halo_ring", MatSlot::Glow, Shape::Torus { r, tube: (r * 0.012).max(0.04), arc: TAU, segments: 160 }, vec![flat], holder, mo);
                let k = (r * 4.0).round().max(8.0) as usize;
                let dots = (0..k).map(|i| { let a = i as f32 / k as f32 * TAU; place(Vec3::new(a.cos() * r * 1.06, 0.0, a.sin() * r * 1.06)) * Mat4::from_scale(Vec3::splat(0.12)) }).collect();
                put(b, "halo_ring_light", MatSlot::Glow, unit_sphere(), dots, holder, mo);
            }
            HaloKind::Orb => {
                put(b, "halo_orb", MatSlot::Glow, Shape::Sphere { r, segments: 32 }, vec![Mat4::IDENTITY], holder, Motion::Still);
                let mut rng = Rng::new(s.seed as u64 + 991);
                let dust = (0..90).map(|_| { let a = rng.f() * TAU; let rr = r * rng.range(1.5, 3.1); place(Vec3::new(a.cos() * rr, rng.signed() * r * 0.08, a.sin() * rr)) * Mat4::from_scale(Vec3::splat((r * 0.05).max(0.06))) }).collect();
                put(b, "halo_orb_dust", MatSlot::Glow, Shape::Sphere { r: 1.0, segments: 6 }, dust, holder, Motion::Spin { axis: [0.0, 1.0, 0.0], speed: spin });
            }
        }
    }
    if a.beam {
        match first_portal {
            Some(holder) => {
                let mut p = Part::new("beam", MatSlot::Glow, Shape::Cylinder { r_top: 0.12, r_bottom: 0.5, h: a.beam_len, segments: 12, open: true });
                p.instances = vec![(Mat4::from_translation(Vec3::new(0.0, 0.0, a.beam_len / 2.0 + 0.2)) * Mat4::from_rotation_x(FRAC_PI_2)).to_cols_array()];
                p.pivot = holder.to_cols_array();
                b.add(p);
            }
            None => b.diag(Severity::Warning, "The beam needs a portal halo to come from.".into()),
        }
    }
    // debris in three speed bands, each orbiting the tower
    if a.deb_n > 0 {
        let shape = match a.deb_kind {
            DebrisKind::Block => Shape::Cuboid { size: [1.0, 1.3, 1.0] },
            DebrisKind::Shard => octahedron([0.45, 1.6, 0.3]),
            DebrisKind::Crystal => octahedron([0.4, 1.5, 0.4]),
            DebrisKind::Rock => { let m = geometry::icosphere(0); let mut rng = Rng::new(s.seed as u64 + 5); Shape::Raw { positions: m.positions.iter().map(|p| { let k = rng.range(0.75, 1.25); [p[0] * k, p[1] * k, p[2] * k] }).collect(), indices: m.indices } }
        };
        let mat = match a.deb_kind { DebrisKind::Shard => MatSlot::Accent, DebrisKind::Block => MatSlot::Body, DebrisKind::Crystal => MatSlot::Glow, DebrisKind::Rock => MatSlot::Rock };
        let mut bands: [Vec<Mat4>; 3] = [vec![], vec![], vec![]];
        for i in 0..a.deb_n {
            let ang = b.rng.f() * TAU; let r = (a.deb_r + b.rng.signed() * a.deb_spread).max(1.5);
            let y = m.top * (a.deb_low + b.rng.f() * (1.08 - a.deb_low)); let sz = a.deb_size * (0.35 + b.rng.f() * b.rng.f() * 1.6);
            let rot = Quat::from_axis_angle(Vec3::new(b.rng.signed(), b.rng.signed(), b.rng.signed()).normalize_or(Vec3::Y), b.rng.f() * TAU);
            bands[(i % 3) as usize].push(Mat4::from_scale_rotation_translation(Vec3::splat(sz), rot, at(r, ang, y)));
        }
        for (k, ms) in bands.into_iter().enumerate() {
            let speed = a.drift * (0.25 + k as f32 * 0.25) * 2.5 / a.deb_r.max(2.0).sqrt();
            if let Some(i) = b.many("debris", mat, shape.clone(), ms) { b.parts[i].motion = Motion::Orbit { speed }; }
        }
    }
    if a.bridge { add_bridge(b, s, m); }
    if a.roots > 0 { add_roots(b, s, m); }
    if a.sat_n > 0 { add_satellites(b, s, m); }
    if a.motes > 0 {
        let n = a.motes.min(600) as usize; let rm = (m.r_max * 2.2).max(8.0); let hm = m.top * 1.2;
        let ms = (0..n).map(|_| { let ang = b.rng.f() * TAU; let r = b.rng.f().sqrt() * rm; Mat4::from_translation(at(r, ang, b.rng.f() * hm)) * Mat4::from_scale(Vec3::splat(0.07)) }).collect();
        if let Some(i) = b.many("motes", MatSlot::Glow, Shape::Sphere { r: 1.0, segments: 5 }, ms) { b.parts[i].motion = Motion::Orbit { speed: 0.05 }; }
    }
    if a.clouds > 0.0 { b.diag(Severity::Note, "Cloud bands are drawn by the viewer, not stored as geometry.".into()); }
}

fn octahedron(scale: [f32; 3]) -> Shape {
    let p = [[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]];
    let positions = p.iter().map(|v: &[f32; 3]| [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]]).collect();
    Shape::Raw { positions, indices: vec![0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5] }
}

fn add_bridge(b: &mut B, s: &Spec, m: &Measures) {
    let a = &s.aura;
    let yb = (m.h * a.bridge_at).max(3.0); let dir = a.bridge_face.to_radians();
    let r0 = radius_at_y(s, &m.tier_spans, yb) * 0.9; let len = a.bridge_len;
    let span = (yb * 0.7).clamp(6.0, 18.0); let n = (len / span).round().max(1.0) as usize; let spw = len / n as f32;
    let wd = 3.2; let pier = (spw * 0.25).min(2.2);
    let keep = if a.bridge_broken { ((n as f32 * 0.7).ceil() as usize).max(1) } else { n };
    let rot = ry(dir - FRAC_PI_2);
    for i in 0..keep {
        let x0 = r0 + i as f32 * spw; let ah = (yb - 1.4).min(yb * 0.85); let hw = (spw - pier) / 2.0; let cx = x0 + spw / 2.0;
        let mut hole = vec![[cx - hw, 0.0], [cx - hw, (ah - hw).max(0.5)]];
        for k in 1..12 { let t = k as f32 / 12.0; let ang = PI - PI * t; hole.push([cx + hw * ang.cos(), (ah - hw).max(0.5) + (ah - (ah - hw).max(0.5)) * ang.sin()]); }
        hole.push([cx + hw, (ah - hw).max(0.5)]); hole.push([cx + hw, 0.0]);
        b.one("bridge_span", MatSlot::Body, Shape::Extrusion { outline: vec![[x0, 0.0], [x0 + spw, 0.0], [x0 + spw, yb], [x0, yb]], holes: vec![hole], depth: wd }, rot);
    }
    let deck = if a.bridge_broken { keep as f32 * spw * b.rng.range(0.92, 0.98) } else { len };
    b.one("bridge_deck", MatSlot::Body, Shape::Cuboid { size: [deck, 0.7, wd + 0.8] }, rot * place(Vec3::new(r0 + deck / 2.0, yb + 0.35, 0.0)));
    for sd in [-1.0f32, 1.0] { b.one("bridge_parapet", MatSlot::Body, Shape::Cuboid { size: [deck, 1.0, 0.3] }, rot * place(Vec3::new(r0 + deck / 2.0, yb + 1.2, sd * (wd / 2.0 + 0.25)))); }
    if a.bridge_broken {
        let ms = (0..8).map(|_| rot * trs(Vec3::new(r0 + deck + b.rng.f() * spw, 0.4, b.rng.signed() * wd), b.rng.f() * 3.0, Vec3::new(b.rng.range(0.6, 1.6), b.rng.range(0.5, 1.5), b.rng.range(0.6, 1.6)), 0.0)).collect();
        b.many("bridge_rubble", MatSlot::Body, unit_box(), ms);
    }
}

fn add_roots(b: &mut B, s: &Spec, m: &Measures) {
    let a = &s.aura; let reach = m.h * a.roots_h; let mat = if a.roots_glow { MatSlot::Glow } else { MatSlot::Rock };
    b.body = true;
    for i in 0..a.roots {
        let a0 = i as f32 / a.roots as f32 * TAU + b.rng.f() * 0.5; let dir = if b.rng.chance(0.5) { -1.0 } else { 1.0 };
        let tw = b.rng.range(0.6, 2.0) * dir; let top = reach * b.rng.range(0.45, 1.0); let thick = (m.r_max * b.rng.range(0.05, 0.1)).max(0.12);
        let flare_k = b.rng.range(0.8, 1.4);
        let pts = (0..=14).map(|j| {
            let u = j as f32 / 14.0; let y = u * top; let ang = a0 + tw * u + (u * 9.0 + i as f32).sin() * 0.08;
            let flare = (1.0 - (u * 5.0).min(1.0)).powi(2);
            let r = radius_at_y(s, &m.tier_spans, y) + thick * 0.6 + flare * m.r_max * flare_k;
            at(r, ang, y - if j == 0 { 0.3 } else { 0.0 }).to_array()
        }).collect();
        b.one("root", mat, Shape::Tube { points: pts, radius: thick, taper: 0.15 }, Mat4::IDENTITY);
    }
    b.body = false;
}

fn add_satellites(b: &mut B, s: &Spec, m: &Measures) {
    let a = &s.aura;
    for i in 0..a.sat_n {
        let ang = (i as f32 + b.rng.range(0.3, 0.7)) / a.sat_n as f32 * TAU; let r = a.sat_r * b.rng.range(0.75, 1.25); let sc = a.sat_scale * b.rng.range(0.55, 1.25);
        let mut t0 = s.tiers[0].clone();
        t0.h = m.h * sc; t0.r0 = s.tiers[0].r0 * a.sat_scale * b.rng.range(0.6, 1.1); t0.r1 = t0.r0 * b.rng.range(0.65, 0.95);
        t0.win_rows = 0; t0.sp_n = 0; t0.band = Band::None; t0.chan = 0; t0.pat = "none".into(); t0.stair = 0.0; t0.ban_n = 0; t0.but_n = 0;
        let mut sub = s.clone();
        sub.seed = s.seed.wrapping_add(100 + i);
        sub.tiers = vec![t0.clone()]; sub.halos.clear();
        sub.crown = Crown { kind: CrownKind::Broken, h: t0.r0 * 1.5, mat: if s.tiers[0].mat == Mat::Glow { Mat::Dark } else { s.tiers[0].mat }, finial: false };
        sub.foot = Foot { kind: if s.foot.kind == FootKind::Roots { FootKind::Roots } else { FootKind::None }, h: t0.h * 0.15, spread: 1.5, fins: 0, lean: 0.0 };
        let mut sb = B { rng: Rng::new(sub.seed as u64), parts: vec![], sockets: vec![], diags: vec![], body: false };
        let info = build_body(&mut sb, &sub, false);
        let place_m = Mat4::from_translation(at(r, ang, 0.0)) * Mat4::from_rotation_y(b.rng.f() * TAU);
        for mut p in sb.parts {
            p.tag = format!("satellite_{}", p.tag);
            for inst in p.instances.iter_mut() { *inst = (place_m * Mat4::from_cols_array(inst)).to_cols_array(); }
            p.body = false; b.parts.push(p);
        }
        if a.sat_glow {
            let p = Part::new("satellite_light", MatSlot::Glow, Shape::Sphere { r: t0.r0 * 0.45, segments: 16 }).at(place_m * place(Vec3::new(0.0, info.top + t0.r0 * 0.4, 0.0)));
            b.parts.push(p);
        }
    }
}

fn connect_sockets(b: &mut B) {
    // a stack: ground or foot top → tier 1 base, tier i top → tier i+1 base, last top → crown base
    let ids: Vec<(String, SocketType)> = b.sockets.iter().map(|s| (s.id.clone(), s.kind)).collect();
    let find = |k: SocketType, nth: usize| ids.iter().filter(|(_, t)| *t == k).nth(nth).map(|(i, _)| i.clone());
    let mut pairs = vec![];
    let below = find(SocketType::FootTop, 0).or_else(|| find(SocketType::Ground, 0));
    let n_tiers = ids.iter().filter(|(_, t)| *t == SocketType::TierBase).count();
    if let (Some(a), Some(c)) = (below, find(SocketType::TierBase, 0)) { pairs.push((a, c)); }
    for i in 0..n_tiers {
        let top = find(SocketType::TierTop, i);
        let next = if i + 1 < n_tiers { find(SocketType::TierBase, i + 1) } else { find(SocketType::CrownBase, 0) };
        if let (Some(a), Some(c)) = (top, next) { pairs.push((a, c)); }
    }
    for (x, y) in pairs {
        if let Some(s) = b.sockets.iter_mut().find(|s| s.id == x) { s.connected_to = Some(y.clone()); }
        if let Some(s) = b.sockets.iter_mut().find(|s| s.id == y) { s.connected_to = Some(x.clone()); }
    }
}

fn check(b: &mut B, s: &Spec, m: &Measures) {
    let open: Vec<String> = b.sockets.iter().filter(|k| k.rule == SocketRule::MustConnect && k.connected_to.is_none()).map(|k| k.id.clone()).collect();
    for id in open { b.diag(Severity::Problem, format!("Socket {id} must connect but is open.")); }
    for i in 1..s.tiers.len() {
        let top = s.tiers[i - 1].r_at(1.0); let r0 = s.tiers[i].r0; let d = (top - r0).abs() / top.max(r0);
        if d > 0.35 { b.diag(Severity::Warning, format!("Tier {} starts {}% {} than tier {} ends.", i + 1, (d * 100.0).round(), if r0 > top { "wider" } else { "narrower" }, i)); }
    }
    let ch = s.crown.h / s.top_radius().max(0.3);
    if !(0.25..=4.5).contains(&ch) { b.diag(Severity::Warning, format!("The crown is {:.1}× the top radius; between 0.25 and 4.5 reads best.", ch)); }
    for (i, h) in s.halos.iter().enumerate() {
        if h.y < -m.h * 0.9 || h.y > m.h * 0.6 { b.diag(Severity::Warning, format!("Halo {} hangs far from the tower top.", i + 1)); }
    }
    if s.tiers.iter().any(|t| t.pat != "none") { b.diag(Severity::Note, "Naqsh patterns are kept in the recipe but not drawn by the native renderer yet.".into()); }
}
