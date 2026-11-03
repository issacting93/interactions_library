//! What a tower is like (descriptors) and how well it holds together (fitness).

use serde::{Deserialize, Serialize};

use crate::plan::{Severity, TowerPlan};
use crate::spec::*;

/// The traits a gallery can be laid out by.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub enum Trait { Height, Slenderness, Ornament, Aura, Habitat, Tiers, Symmetry, Silhouette }

impl Trait {
    pub const ALL: [Trait; 8] = [Trait::Height, Trait::Slenderness, Trait::Ornament, Trait::Aura, Trait::Habitat, Trait::Tiers, Trait::Symmetry, Trait::Silhouette];
    pub fn label(self) -> &'static str {
        match self { Trait::Height => "Height", Trait::Slenderness => "Slenderness", Trait::Ornament => "Ornament", Trait::Aura => "Aura", Trait::Habitat => "Habitat for creatures", Trait::Tiers => "Tiers", Trait::Symmetry => "Symmetry", Trait::Silhouette => "Silhouette variety" }
    }
    /// The range mapped onto a gallery axis.
    pub fn range(self) -> (f32, f32) {
        match self { Trait::Height => (8.0, 70.0), Trait::Slenderness => (1.0, 9.0), Trait::Ornament => (0.0, 12.0), Trait::Aura => (0.0, 10.0), Trait::Habitat => (0.0, 14.0), Trait::Tiers => (0.5, 6.5), Trait::Symmetry => (0.0, 1.0), Trait::Silhouette => (0.0, 8.0) }
    }
    pub fn of(self, s: &Spec) -> f32 {
        match self {
            Trait::Height => s.tower_height() + s.crown.h,
            Trait::Slenderness => (s.tower_height() + s.crown.h) / (2.0 * s.tiers.iter().map(|t| t.r0.max(t.r1)).fold(0.1, f32::max)),
            Trait::Ornament => ornament(s),
            Trait::Aura => aura(s),
            Trait::Habitat => habitat(s),
            Trait::Tiers => s.tiers.len() as f32,
            Trait::Symmetry => symmetry(s),
            Trait::Silhouette => silhouette_turns(s) as f32,
        }
    }
}

pub fn ornament(s: &Spec) -> f32 {
    let mut o = 0.0;
    for t in &s.tiers {
        o += match t.band { Band::None => 0.0, Band::Glyphs | Band::Balcony => 1.4, _ => 1.0 };
        if t.ribs > 0 { o += (t.ribs as f32 / 12.0).min(1.2); }
        o += (t.chan as f32 * 0.5).min(1.5);
        o += (t.win_rows as f32 * t.win_per as f32 / 10.0).min(1.5);
        if t.sp_n > 0 { o += 1.0; } if t.pat != "none" { o += 1.2; } if t.ban_n > 0 { o += 1.0; } if t.stair > 0.0 { o += 0.8; } if t.but_n > 0 { o += 1.2; }
    }
    o += match s.crown.kind { CrownKind::Flat => 0.0, CrownKind::Broken => 0.3, CrownKind::Cone => 0.5, CrownKind::Dome | CrownKind::Crenel => 0.8, CrownKind::Onion | CrownKind::Spire => 1.0, CrownKind::Spikes => 1.2, CrownKind::Lantern | CrownKind::Crescent | CrownKind::Belfry => 1.5, CrownKind::Gothic => 2.0 };
    if s.crown.finial { o += 0.3; }
    if s.foot.kind != FootKind::None { o += 0.5; }
    o
}
pub fn aura(s: &Spec) -> f32 {
    let a = &s.aura;
    let mut v: f32 = s.halos.iter().map(|h| if h.kind == HaloKind::Armillary { 2.4 } else { 1.8 }).sum();
    v += (a.deb_n as f32 / 40.0).min(2.5) + (a.motes as f32 / 250.0).min(2.0) + if a.beam { 1.0 } else { 0.0 } + (a.sat_n as f32 * 0.4).min(2.0)
        + (a.roots as f32 * 0.25).min(2.0) + a.clouds * 1.5 + if a.bridge { 1.5 } else { 0.0 };
    v
}
pub fn habitat(s: &Spec) -> f32 {
    let mut h = 0.0;
    for t in &s.tiers {
        h += match t.band { Band::None => 0.0, Band::Ring | Band::Beads => 0.5, Band::Glyphs | Band::Drops => 0.3, Band::Crenel => 1.5, Band::Balcony => 2.0, Band::Corbel => 1.2 };
        h += (t.win_rows as f32 * t.win_per as f32 / 6.0).min(3.0);
        if t.sp_n > 0 { h += 1.0; } if t.stair > 0.0 { h += 1.2; } if t.but_n > 0 { h += 1.5; } if t.ban_n > 0 { h += 0.6; } if t.ribs > 0 { h += 0.4; }
    }
    h += (s.aura.roots as f32 * 0.35).min(3.0);
    if s.aura.bridge { h += 1.5; }
    if matches!(s.crown.kind, CrownKind::Lantern | CrownKind::Belfry | CrownKind::Crenel) { h += 1.2; }
    if matches!(s.foot.kind, FootKind::Crag | FootKind::Roots) { h += 1.0; }
    h
}
/// 1 for perfect rotational symmetry; lowered by lean, offset halos, twist and odd-sided ornament.
pub fn symmetry(s: &Spec) -> f32 {
    let mut v = 1.0 - (s.foot.lean.abs() / 15.0) * 0.4;
    v -= s.halos.iter().map(|h| (h.off / (h.r + 1.0)).min(1.0) * 0.15 + (h.tilt.abs() / 90.0) * 0.05).sum::<f32>();
    v -= s.tiers.iter().map(|t| (t.twist.abs() / 180.0) * 0.1 + if t.stair > 0.0 { 0.08 } else { 0.0 }).sum::<f32>();
    if s.aura.bridge { v -= 0.2; }
    if s.crown.kind == CrownKind::Crescent { v -= 0.1; }
    v.clamp(0.0, 1.0)
}
/// How many times the outline turns from widening to narrowing (or back), going up.
pub fn silhouette_turns(s: &Spec) -> u32 {
    let mut rs = vec![];
    if s.foot.kind != FootKind::None { rs.push(s.tiers[0].r0 * s.foot.spread); }
    for t in &s.tiers { for i in 0..=8 { rs.push(t.r_at(i as f32 / 8.0)); } }
    let mut turns = 0; let mut last = 0i32;
    for w in rs.windows(2) {
        let d = w[1] - w[0];
        let sgn = if d > 0.05 { 1 } else if d < -0.05 { -1 } else { 0 };
        if sgn != 0 { if last != 0 && sgn != last { turns += 1; } last = sgn; }
    }
    turns
}

/// Breakdown of the coherence score, so the viewer can say why a tower scored as it did.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Score {
    pub coherence: f32,
    /// 0–1: centre of mass over the base, tiers resting on tiers.
    pub stability: f32,
    /// 0–1: how smoothly tiers meet (width jump and change of slope at each joint).
    pub joints: f32,
    pub proportion: f32,
    pub notes: Vec<String>,
}

/// Coherence with its parts. Uses the plan for socket problems and the recipe for shape.
pub fn score(s: &Spec, plan: Option<&TowerPlan>) -> Score {
    let t = &s.tiers; let h = s.tower_height(); let r_top = s.top_radius().max(0.3);
    let mut notes = vec![];

    // joints: C0 (width jump) and C1 (slope change) at each tier boundary
    let mut joints = 1.0f32;
    for i in 1..t.len() {
        let top = t[i - 1].r_at(1.0); let jump = (top - t[i].r0).abs() / top.max(t[i].r0);
        let slope_a = (t[i - 1].r_at(1.0) - t[i - 1].r_at(0.95)) / (0.05 * t[i - 1].h);
        let slope_b = (t[i].r_at(0.05) - t[i].r_at(0.0)) / (0.05 * t[i].h);
        let kink = (slope_a - slope_b).abs().min(2.0) / 2.0;
        joints -= 0.25 * ((jump - 0.12).max(0.0) * 2.5).min(1.0) + 0.06 * kink;
        if jump > 0.35 { notes.push(format!("Tier {} jumps {}% in width.", i + 1, (jump * 100.0).round())); }
    }

    // stability: volume-weighted centre of mass against the base footprint
    let lean = s.foot.lean.to_radians().tan();
    let (mut mass, mut mx, mut my) = (0.0f32, 0.0f32, 0.0f32);
    let mut y = s.foot_height();
    for tier in t {
        for k in 0..4 {
            let u0 = k as f32 / 4.0; let u1 = (k + 1) as f32 / 4.0; let r = tier.r_at((u0 + u1) / 2.0);
            let v = std::f32::consts::PI * r * r * tier.h / 4.0; let yc = y + tier.h * (u0 + u1) / 2.0;
            mass += v; my += v * yc; mx += v * yc * lean;
        }
        y += tier.h;
    }
    let com_x = if mass > 0.0 { mx / mass } else { 0.0 };
    let com_y = if mass > 0.0 { my / mass } else { 0.0 };
    let base_r = t[0].r0 * if s.foot.kind == FootKind::None { 1.0 } else { s.foot.spread.max(1.0) };
    let mut stability = 1.0 - (com_x.abs() / (base_r * 0.8)).min(1.0);
    let upper = t.iter().skip(t.len() / 2).map(|x| x.r0.max(x.r1)).fold(0.0, f32::max);
    if upper > t[0].r0 * 1.35 { stability -= 0.25; notes.push("Top-heavy: the upper tiers are much wider than the base.".into()); }
    if com_y > h * 0.62 { stability -= 0.15; }
    for i in 1..t.len() { if t[i].r0 > t[i - 1].r_at(1.0) * 1.6 { stability -= 0.1; } }
    stability = stability.clamp(0.0, 1.0);

    // proportion: crown, halos, bands, slenderness
    let mut proportion = 1.0f32;
    let ch = s.crown.h / r_top; if !(0.25..=4.5).contains(&ch) { proportion -= 0.12; }
    let sl = Trait::Slenderness.of(s); if !(0.9..=10.0).contains(&sl) { proportion -= 0.15; }
    for hl in &s.halos { if hl.r > r_top * 7.0 + 6.0 { proportion -= 0.08; } if hl.y < -h * 0.9 || hl.y > h * 0.6 { proportion -= 0.08; } }
    for tier in t { if tier.band != Band::None && tier.band_size > tier.r0.max(tier.r1) * 0.9 { proportion -= 0.05; } if tier.h < 0.8 && tier.band == Band::None { proportion -= 0.05; } }
    if s.aura.deb_n > 150 && s.aura.motes > 500 { proportion -= 0.05; }
    proportion = proportion.clamp(0.0, 1.0);

    let mut coherence = (0.4 * joints.clamp(0.0, 1.0) + 0.3 * stability + 0.3 * proportion).clamp(0.0, 1.0);
    if let Some(p) = plan { let n = p.diagnostics.iter().filter(|d| d.severity == Severity::Problem).count(); coherence = (coherence - 0.2 * n as f32).max(0.0); }
    Score { coherence, stability, joints: joints.clamp(0.0, 1.0), proportion, notes }
}

/// Similarity in 0–1: nearby trait values plus shared parts.
pub fn similarity(a: &Spec, b: &Spec) -> f32 {
    let mut num = 0.0; let traits = [Trait::Height, Trait::Slenderness, Trait::Ornament, Trait::Aura, Trait::Habitat, Trait::Tiers];
    for t in traits { let (lo, hi) = t.range(); num += 1.0 - ((t.of(a) - t.of(b)).abs() / (hi - lo)).min(1.0); }
    let mut cat = 0.0; let mut n = 0.0;
    let mut eq = |x: bool| { if x { cat += 1.0; } n += 1.0; };
    eq(a.crown.kind == b.crown.kind); eq(a.foot.kind == b.foot.kind); eq(a.look.sky == b.look.sky); eq(a.tiers[0].sides == b.tiers[0].sides); eq(a.tiers[0].prof == b.tiers[0].prof);
    let hk = |s: &Spec| { let mut v: Vec<_> = s.halos.iter().map(|h| h.kind).collect(); v.sort(); v };
    eq(hk(a) == hk(b));
    0.6 * num / traits.len() as f32 + 0.4 * cat / n
}

/// A numeric feature vector for learning preferences (normalised trait values plus part one-hots).
pub fn features(s: &Spec) -> Vec<f32> {
    let mut f: Vec<f32> = Trait::ALL.iter().map(|t| { let (lo, hi) = t.range(); ((t.of(s) - lo) / (hi - lo)).clamp(0.0, 1.0) }).collect();
    for k in CrownKind::ALL { f.push((s.crown.kind == *k) as u8 as f32); }
    for k in FootKind::ALL { f.push((s.foot.kind == *k) as u8 as f32); }
    for k in HaloKind::ALL { f.push(s.halos.iter().filter(|h| h.kind == *k).count().min(2) as f32 / 2.0); }
    f.push((s.tiers[0].sides as f32 / 12.0).min(1.0));
    f.push(s.look.weather);
    f
}
