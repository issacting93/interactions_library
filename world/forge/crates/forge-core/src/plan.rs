//! The tower plan: the readable middle between the recipe and the triangles.
//!
//! A plan lists every part of the tower as a parametric shape, a material, where its copies
//! go, the sockets it offers, and how it moves. It holds no triangles: scoring, export and
//! debugging all read the plan, and [`crate::geometry`] turns shapes into meshes on demand.

use glam::{Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};

use crate::rng::Fnv;

/// Material slots. Colours come from the spec's look, so a plan is colour-independent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub enum MatSlot { Body, Dark, Accent, Glow, Cloth, Sand, Rock, Void }

/// A window or niche outline.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Opening { Arch, Slit, Round }

/// Parametric shapes. Every shape is described in its own local space; [`Part::instances`] place it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Shape {
    /// Revolve an outline of (radius, y) points round the y axis. `sides` 0 = smooth (48 segments),
    /// otherwise a polygon with a flat face toward +z. `twist` (radians) turns the top relative to the bottom.
    Lathe { outline: Vec<[f32; 2]>, sides: u32, twist: f32, weather: f32, seed: u32 },
    /// Strips that follow a tier outline: ribs, pilasters, glowing channels.
    Strips { outline: Vec<[f32; 2]>, sides: u32, twist: f32, angles: Vec<f32>, width: f32, depth: f32 },
    /// Unit-centred box scaled by `size`.
    Cuboid { size: [f32; 3] },
    /// Cylinder centred on the origin, axis y.
    Cylinder { r_top: f32, r_bottom: f32, h: f32, segments: u32, open: bool },
    /// Cone centred on the origin, axis y, apex up.
    Cone { r: f32, h: f32, segments: u32 },
    Sphere { r: f32, segments: u32 },
    /// Torus in the xy plane round the origin; `arc` in radians, starting at +x.
    Torus { r: f32, tube: f32, arc: f32, segments: u32 },
    /// A flat opening outline, 1 × 1, centred, facing +z.
    Opening { kind: Opening },
    /// A polygon (with holes) in the xy plane, extruded along z and centred on z = 0.
    Extrusion { outline: Vec<[f32; 2]>, holes: Vec<Vec<[f32; 2]>>, depth: f32 },
    /// A tube along a curve, narrowing to `taper` × radius at the far end.
    Tube { points: Vec<[f32; 3]>, radius: f32, taper: f32 },
    /// A hanging cloth strip, `w` wide and `len` long, hanging down from the origin.
    Cloth { w: f32, len: f32 },
    /// Triangles computed by the compiler (stairs, dunes, rocks). Kept small.
    Raw { positions: Vec<[f32; 3]>, indices: Vec<u32> },
}

/// How a part moves in the viewer. Engines apply it; export ignores it.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Default)]
pub enum Motion {
    #[default]
    Still,
    /// Spin round the part's local axis (in its own space, before placement).
    Spin { axis: [f32; 3], speed: f32 },
    /// Orbit the tower's vertical axis (debris, clouds).
    Orbit { speed: f32 },
    /// Swing gently, like a bell or a banner.
    Swing { axis: [f32; 3], speed: f32, amount: f32 },
    /// Each copy sways on its own top edge, like cloth (offset per copy).
    Sway { speed: f32, amount: f32 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SocketType { Ground, FootTop, TierBase, TierTop, CrownBase, BandRing, OpeningCut, HaloMount }
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SocketDir { Up, Down, Out }
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SocketRule { MustConnect, Optional, Blocked }

/// A typed connection point. The plan pairs sockets up; anything required and left open is reported.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Socket {
    pub id: String,
    pub kind: SocketType,
    pub dir: SocketDir,
    pub rule: SocketRule,
    pub accepts: Vec<SocketType>,
    pub pos: [f32; 3],
    /// Radius of the ring this socket stands for (0 for a point).
    pub radius: f32,
    pub connected_to: Option<String>,
}

/// One part of the tower: a shape, its copies, and what it is.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Part {
    /// Kit-style tag, for example "tier", "band_balcony", "crown_dome", "halo_portal".
    pub tag: String,
    pub mat: MatSlot,
    pub shape: Shape,
    /// Column-major 4×4 matrices. Usually translation, rotation and scale only; a leaning
    /// body adds a shear, which engines must bake into the mesh (see [`Part::sheared`]).
    pub instances: Vec<[f32; 16]>,
    pub motion: Motion,
    /// True when the part is part of the leaning body.
    pub body: bool,
    /// Extra pivot applied after the motion (for halos: where the halo hangs).
    pub pivot: [f32; 16],
}
impl Part {
    pub fn new(tag: &str, mat: MatSlot, shape: Shape) -> Part {
        Part { tag: tag.into(), mat, shape, instances: vec![], motion: Motion::Still, body: false, pivot: Mat4::IDENTITY.to_cols_array() }
    }
    pub fn at(mut self, m: Mat4) -> Part { self.instances.push(m.to_cols_array()); self }
    pub fn moving(mut self, m: Motion) -> Part { self.motion = m; self }
    pub fn pivot(&self) -> Mat4 { Mat4::from_cols_array(&self.pivot) }
    /// True when an instance cannot be expressed as translation, rotation and scale.
    pub fn sheared(&self) -> bool {
        self.instances.iter().any(|m| {
            let m = Mat4::from_cols_array(m);
            let (s, r, t) = m.to_scale_rotation_translation();
            let back = Mat4::from_scale_rotation_translation(s, r, t);
            !back.abs_diff_eq(m, 1e-3)
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity { Note, Warning, Problem }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Diagnostic { pub severity: Severity, pub message: String }

/// Measurements taken while compiling, reused by scoring and the viewer.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Measures {
    /// Height of the top of the tiers.
    pub h: f32,
    /// Height of the highest point, crown and halos included.
    pub top: f32,
    /// Widest body radius.
    pub r_max: f32,
    /// Horizontal reach, aura included, for framing a camera.
    pub reach: f32,
    /// Shear factor of the lean (x += y × lean).
    pub lean: f32,
    /// Where each tier starts and ends: (y0, y1).
    pub tier_spans: Vec<[f32; 2]>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TowerPlan {
    pub parts: Vec<Part>,
    pub sockets: Vec<Socket>,
    pub diagnostics: Vec<Diagnostic>,
    pub measures: Measures,
}

impl TowerPlan {
    /// A fingerprint of the plan's structure and numbers, for regression tests.
    pub fn fingerprint(&self) -> u64 {
        let mut h = Fnv::default();
        for p in &self.parts {
            h.s(&p.tag); h.u(p.mat as u64); h.u(p.instances.len() as u64);
            for m in &p.instances { for v in m { h.f(*v); } }
            h.s(&format!("{:?}", std::mem::discriminant(&p.shape)));
            shape_hash(&p.shape, &mut h);
        }
        for s in &self.sockets { h.s(&s.id); h.u(s.connected_to.is_some() as u64); }
        h.0
    }
    pub fn problems(&self) -> impl Iterator<Item = &Diagnostic> { self.diagnostics.iter().filter(|d| d.severity == Severity::Problem) }
    pub fn instance_count(&self) -> usize { self.parts.iter().map(|p| p.instances.len()).sum() }
}

fn shape_hash(s: &Shape, h: &mut Fnv) {
    match s {
        Shape::Lathe { outline, sides, twist, .. } | Shape::Strips { outline, sides, twist, .. } => { for p in outline { h.f(p[0]); h.f(p[1]); } h.u(*sides as u64); h.f(*twist); }
        Shape::Cuboid { size } => { for v in size { h.f(*v); } }
        Shape::Cylinder { r_top, r_bottom, h: hh, segments, .. } => { h.f(*r_top); h.f(*r_bottom); h.f(*hh); h.u(*segments as u64); }
        Shape::Cone { r, h: hh, segments } => { h.f(*r); h.f(*hh); h.u(*segments as u64); }
        Shape::Sphere { r, .. } => h.f(*r),
        Shape::Torus { r, tube, arc, .. } => { h.f(*r); h.f(*tube); h.f(*arc); }
        Shape::Opening { kind } => h.u(*kind as u64),
        Shape::Extrusion { outline, depth, .. } => { for p in outline { h.f(p[0]); h.f(p[1]); } h.f(*depth); }
        Shape::Tube { points, radius, .. } => { for p in points { h.f(p[0]); h.f(p[1]); h.f(p[2]); } h.f(*radius); }
        Shape::Cloth { w, len } => { h.f(*w); h.f(*len); }
        Shape::Raw { positions, .. } => { h.u(positions.len() as u64); if let Some(p) = positions.first() { h.f(p[0]); h.f(p[1]); } }
    }
}

// ---------- small placement helpers shared by the compiler ----------

/// Point at radius `r`, angle `th` (0 = +z, turning toward +x), height `y`.
pub fn at(r: f32, th: f32, y: f32) -> Vec3 { Vec3::new(r * th.sin(), y, r * th.cos()) }
/// Translation × rotation (yaw `ry`, then pitch `rx`) × scale, matching the browser tool's helper.
pub fn trs(p: Vec3, ry: f32, s: Vec3, rx: f32) -> Mat4 {
    Mat4::from_scale_rotation_translation(s, Quat::from_euler(glam::EulerRot::YXZ, ry, rx, 0.0), p)
}
pub fn place(p: Vec3) -> Mat4 { Mat4::from_translation(p) }
