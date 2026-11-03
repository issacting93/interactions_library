//! The tower recipe: every value the designer (or the search) can change.
//!
//! Field names match the browser Tower Forge spec exactly, so a tower copied
//! from its Code dialog loads here unchanged, and the other way round.

use serde::{Deserialize, Deserializer, Serialize};

/// Counts arrive from JavaScript as numbers that may be written as floats.
fn de_count<'de, D: Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    let v = f64::deserialize(d)?;
    Ok(v.max(0.0).round() as u32)
}

macro_rules! str_enum {
    ($(#[$m:meta])* $name:ident { $($variant:ident = $s:literal),+ $(,)? } default $def:ident) => {
        $(#[$m])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
        pub enum $name { $(#[serde(rename = $s)] $variant),+ }
        impl Default for $name { fn default() -> Self { $name::$def } }
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$variant),+];
            pub fn key(self) -> &'static str { match self { $($name::$variant => $s),+ } }
            pub fn label(self) -> String {
                let s = self.key(); let mut c = s.chars();
                match c.next() { Some(f) => f.to_uppercase().collect::<String>() + c.as_str(), None => String::new() }
            }
        }
    };
}

str_enum!(/// The outline a tier follows between its base and top radius.
Profile { Straight = "straight", Bulge = "bulge", Onion = "onion", Flare = "flare", Neck = "neck", Bell = "bell" } default Straight);
str_enum!(/// Surface material slot; colours come from [`Look`].
Mat { Body = "body", Accent = "accent", Dark = "dark", Glow = "glow" } default Body);
str_enum!(WinKind { Arch = "arch", Slit = "slit", Round = "round" } default Arch);
str_enum!(Band { None = "none", Ring = "ring", Beads = "beads", Crenel = "crenel", Balcony = "balcony", Corbel = "corbel", Drops = "drops", Glyphs = "glyphs" } default None);
str_enum!(CrownKind { Flat = "flat", Dome = "dome", Onion = "onion", Cone = "cone", Spire = "spire", Spikes = "spikes", Crenel = "crenel", Lantern = "lantern", Crescent = "crescent", Gothic = "gothic", Belfry = "belfry", Broken = "broken" } default Flat);
str_enum!(FootKind { None = "none", Plinth = "plinth", Steps = "steps", Roots = "roots", Buried = "buried", Crag = "crag" } default None);
str_enum!(HaloKind { Portal = "portal", Armillary = "armillary", Gear = "gear", Ring = "ring", Orb = "orb" } default Portal);
str_enum!(DebrisKind { Rock = "rock", Block = "block", Shard = "shard", Crystal = "crystal" } default Rock);

/// One storey of the stack.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Tier {
    pub h: f32,
    pub r0: f32,
    pub r1: f32,
    /// 0 = round; otherwise the number of flat sides.
    #[serde(deserialize_with = "de_count")]
    pub sides: u32,
    pub prof: Profile,
    pub amp: f32,
    /// Degrees of twist from bottom to top.
    pub twist: f32,
    pub mat: Mat,
    /// Naqsh pattern name ("none" for plain). Kept for round trips; the native renderer does not draw patterns yet.
    pub pat: String,
    pub pal: String,
    pub tile: f32,
    #[serde(deserialize_with = "de_count")]
    pub ribs: u32,
    #[serde(rename = "ribD")]
    pub rib_d: f32,
    #[serde(deserialize_with = "de_count")]
    pub chan: u32,
    #[serde(rename = "winRows", deserialize_with = "de_count")]
    pub win_rows: u32,
    #[serde(rename = "winPer", deserialize_with = "de_count")]
    pub win_per: u32,
    #[serde(rename = "winKind")]
    pub win_kind: WinKind,
    #[serde(rename = "winGlow")]
    pub win_glow: bool,
    pub band: Band,
    #[serde(rename = "bandSize")]
    pub band_size: f32,
    #[serde(rename = "spN", deserialize_with = "de_count")]
    pub sp_n: u32,
    #[serde(rename = "spH")]
    pub sp_h: f32,
    #[serde(rename = "spR")]
    pub sp_r: f32,
    /// Spiral stair turns (0 = none).
    pub stair: f32,
    #[serde(rename = "banN", deserialize_with = "de_count")]
    pub ban_n: u32,
    #[serde(rename = "banLen")]
    pub ban_len: f32,
    #[serde(rename = "butN", deserialize_with = "de_count")]
    pub but_n: u32,
    #[serde(rename = "butR")]
    pub but_r: f32,
}
impl Default for Tier {
    fn default() -> Self {
        Tier { h: 6.0, r0: 3.0, r1: 2.8, sides: 0, prof: Profile::Straight, amp: 0.3, twist: 0.0, mat: Mat::Body, pat: "none".into(), pal: "dome".into(), tile: 3.0,
            ribs: 0, rib_d: 0.15, chan: 0, win_rows: 0, win_per: 4, win_kind: WinKind::Arch, win_glow: false, band: Band::None, band_size: 0.5,
            sp_n: 0, sp_h: 0.6, sp_r: 0.5, stair: 0.0, ban_n: 0, ban_len: 6.0, but_n: 0, but_r: 5.0 }
    }
}
impl Tier {
    /// Radius of the outline at height fraction `t` (0 = base, 1 = top).
    pub fn r_at(&self, t: f32) -> f32 {
        let base = self.r0.max(self.r1);
        let pi = std::f32::consts::PI;
        let mut r = self.r0 + (self.r1 - self.r0) * t;
        match self.prof {
            Profile::Bulge => r += self.amp * base * (pi * t).sin() * 0.6,
            Profile::Onion => r += self.amp * base * (pi * t.powf(0.6)).sin() * 0.7,
            Profile::Flare => r += self.amp * self.r0 * (1.0 - t).powi(3) * 1.4,
            Profile::Neck => r -= self.amp * base * (pi * t).sin() * 0.45,
            Profile::Bell => r += self.amp * self.r0 * (1.0 - t).powf(1.6) * 0.9,
            Profile::Straight => {}
        }
        r.max(0.05)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Foot {
    pub kind: FootKind,
    pub h: f32,
    pub spread: f32,
    #[serde(deserialize_with = "de_count")]
    pub fins: u32,
    /// Degrees the whole body leans toward +x.
    pub lean: f32,
}
impl Default for Foot { fn default() -> Self { Foot { kind: FootKind::None, h: 2.0, spread: 1.6, fins: 0, lean: 0.0 } } }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Crown { pub kind: CrownKind, pub h: f32, pub mat: Mat, pub finial: bool }
impl Default for Crown { fn default() -> Self { Crown { kind: CrownKind::Flat, h: 2.0, mat: Mat::Body, finial: false } } }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Halo {
    pub kind: HaloKind,
    pub r: f32,
    /// Metres above (or below, if negative) the top of the tiers.
    pub y: f32,
    pub tilt: f32,
    pub face: f32,
    #[serde(deserialize_with = "de_count")]
    pub n: u32,
    pub spin: f32,
    pub off: f32,
}
impl Default for Halo { fn default() -> Self { Halo { kind: HaloKind::Portal, r: 3.0, y: 0.0, tilt: 0.0, face: 0.0, n: 2, spin: 0.4, off: 0.0 } } }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Aura {
    #[serde(rename = "debN", deserialize_with = "de_count")]
    pub deb_n: u32,
    #[serde(rename = "debKind")]
    pub deb_kind: DebrisKind,
    #[serde(rename = "debR")]
    pub deb_r: f32,
    #[serde(rename = "debSpread")]
    pub deb_spread: f32,
    #[serde(rename = "debSize")]
    pub deb_size: f32,
    #[serde(rename = "debLow")]
    pub deb_low: f32,
    pub drift: f32,
    pub beam: bool,
    #[serde(rename = "beamLen")]
    pub beam_len: f32,
    #[serde(deserialize_with = "de_count")]
    pub motes: u32,
    #[serde(rename = "satN", deserialize_with = "de_count")]
    pub sat_n: u32,
    #[serde(rename = "satR")]
    pub sat_r: f32,
    #[serde(rename = "satScale")]
    pub sat_scale: f32,
    #[serde(rename = "satGlow")]
    pub sat_glow: bool,
    pub bridge: bool,
    #[serde(rename = "bridgeLen")]
    pub bridge_len: f32,
    #[serde(rename = "bridgeAt")]
    pub bridge_at: f32,
    #[serde(rename = "bridgeFace")]
    pub bridge_face: f32,
    #[serde(rename = "bridgeBroken")]
    pub bridge_broken: bool,
    #[serde(deserialize_with = "de_count")]
    pub roots: u32,
    #[serde(rename = "rootsH")]
    pub roots_h: f32,
    #[serde(rename = "rootsGlow")]
    pub roots_glow: bool,
    pub clouds: f32,
    #[serde(rename = "cloudsAt")]
    pub clouds_at: f32,
}
impl Default for Aura {
    fn default() -> Self {
        Aura { deb_n: 0, deb_kind: DebrisKind::Rock, deb_r: 10.0, deb_spread: 6.0, deb_size: 0.6, deb_low: 0.3, drift: 0.4, beam: false, beam_len: 50.0, motes: 0,
            sat_n: 0, sat_r: 10.0, sat_scale: 0.5, sat_glow: false, bridge: false, bridge_len: 50.0, bridge_at: 0.35, bridge_face: 200.0, bridge_broken: false,
            roots: 0, roots_h: 0.5, roots_glow: false, clouds: 0.0, clouds_at: 0.45 }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Look {
    pub sky: String,
    pub body: String,
    pub accent: String,
    pub dark: String,
    pub glow: String,
    pub cloth: String,
    pub weather: f32,
    pub bloom: f32,
}
impl Default for Look {
    fn default() -> Self {
        Look { sky: "dusk".into(), body: "#d8cdb8".into(), accent: "#c9a24a".into(), dark: "#3e4642".into(), glow: "#ffd27a".into(), cloth: "#b8322a".into(), weather: 0.35, bloom: 1.1 }
    }
}

/// The whole recipe.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Spec {
    pub seed: u32,
    #[serde(rename = "base")]
    pub foot: Foot,
    pub tiers: Vec<Tier>,
    pub crown: Crown,
    pub halos: Vec<Halo>,
    pub aura: Aura,
    pub look: Look,
}
impl Default for Spec {
    fn default() -> Self { Spec { seed: 7, foot: Foot::default(), tiers: vec![Tier::default()], crown: Crown::default(), halos: vec![], aura: Aura::default(), look: Look::default() } }
}

impl Spec {
    /// Reads JSON, or the text of Tower Forge's Code dialog (`const tower = {...};`).
    pub fn from_text(text: &str) -> Result<Spec, String> {
        let a = text.find('{').ok_or("no { found")?;
        let b = text.rfind('}').ok_or("no } found")?;
        let mut s: Spec = serde_json::from_str(&text[a..=b]).map_err(|e| e.to_string())?;
        s.sanitize();
        Ok(s)
    }
    pub fn to_json(&self) -> String { serde_json::to_string_pretty(self).unwrap_or_default() }
    /// Keeps values inside the ranges the builder can handle.
    pub fn sanitize(&mut self) {
        if self.tiers.is_empty() { self.tiers.push(Tier::default()); }
        self.tiers.truncate(8);
        for t in &mut self.tiers {
            t.h = t.h.clamp(0.3, 60.0); t.r0 = t.r0.clamp(0.1, 20.0); t.r1 = t.r1.clamp(0.1, 20.0);
            if t.sides == 1 || t.sides == 2 { t.sides = 3; }
            t.sides = t.sides.min(24); t.ribs = t.ribs.min(64); t.chan = t.chan.min(8); t.win_rows = t.win_rows.min(12); t.win_per = t.win_per.clamp(1, 24);
            t.sp_n = t.sp_n.min(16); t.ban_n = t.ban_n.min(24); t.but_n = t.but_n.min(16); t.stair = t.stair.clamp(0.0, 6.0);
        }
        self.halos.truncate(6);
        for h in &mut self.halos { h.r = h.r.clamp(0.2, 40.0); h.n = h.n.clamp(1, 8); }
        self.aura.deb_n = self.aura.deb_n.min(400); self.aura.motes = self.aura.motes.min(1500); self.aura.sat_n = self.aura.sat_n.min(12); self.aura.roots = self.aura.roots.min(16);
    }
    pub fn foot_height(&self) -> f32 { if self.foot.kind == FootKind::None { 0.0 } else { self.foot.h } }
    pub fn tiers_height(&self) -> f32 { self.tiers.iter().map(|t| t.h).sum() }
    /// Total height to the top of the tiers, counting the foot as JS does.
    pub fn tower_height(&self) -> f32 { self.foot_height() + self.tiers_height() }
    pub fn top_radius(&self) -> f32 { self.tiers.last().map(|t| t.r_at(1.0)).unwrap_or(1.0) }
    pub fn max_radius(&self) -> f32 { self.tiers.iter().map(|t| t.r0.max(t.r1).max(t.r_at(0.5))).fold(0.5, f32::max) }
}

/// Sky presets, matching the browser tool.
#[derive(Clone, Copy, Debug)]
pub struct Sky {
    pub key: &'static str,
    pub name: &'static str,
    pub top: &'static str,
    pub mid: &'static str,
    pub bot: &'static str,
    pub fog: &'static str,
    pub sun: &'static str,
    pub sun_i: f32,
    pub hemi_sky: &'static str,
    pub hemi_ground: &'static str,
    pub hemi_i: f32,
    pub ground: &'static str,
    pub sun_dir: [f32; 3],
    pub stars: bool,
}
pub const SKIES: &[Sky] = &[
    Sky { key: "dusk", name: "Dusk", top: "#1b2550", mid: "#6d4f7e", bot: "#d98f63", fog: "#b07e74", sun: "#ffb27a", sun_i: 1.1, hemi_sky: "#9aa6ff", hemi_ground: "#4a3030", hemi_i: 0.55, ground: "#5a3e36", sun_dir: [40.0, 22.0, 30.0], stars: false },
    Sky { key: "verdigris", name: "Verdigris haze", top: "#1c2620", mid: "#4f5e45", bot: "#c9cf96", fog: "#8d9672", sun: "#eef2b8", sun_i: 0.9, hemi_sky: "#c8d6a0", hemi_ground: "#20261a", hemi_i: 0.6, ground: "#242820", sun_dir: [-20.0, 40.0, -30.0], stars: false },
    Sky { key: "night", name: "Starry night", top: "#03050d", mid: "#0c1636", bot: "#27386a", fog: "#121a34", sun: "#8aa4ff", sun_i: 0.45, hemi_sky: "#4a5ab0", hemi_ground: "#0a0c14", hemi_i: 0.45, ground: "#10141f", sun_dir: [30.0, 50.0, -20.0], stars: true },
    Sky { key: "ember", name: "Ember sky", top: "#22101a", mid: "#7a3430", bot: "#c86848", fog: "#8c4a3e", sun: "#ff9a6a", sun_i: 0.8, hemi_sky: "#ff9a8a", hemi_ground: "#2a1214", hemi_i: 0.5, ground: "#3a1e1c", sun_dir: [-30.0, 30.0, 40.0], stars: true },
    Sky { key: "ochre", name: "Ochre haze", top: "#c9b79a", mid: "#d6b994", bot: "#dcc3a4", fog: "#d2b896", sun: "#fff0d8", sun_i: 0.95, hemi_sky: "#fff4e0", hemi_ground: "#8a5a40", hemi_i: 0.7, ground: "#b06c48", sun_dir: [35.0, 45.0, 25.0], stars: false },
    Sky { key: "golden", name: "Golden hour", top: "#3d6ea0", mid: "#86a9c2", bot: "#e8b886", fog: "#d8b08c", sun: "#ffd09a", sun_i: 1.35, hemi_sky: "#bcd8ff", hemi_ground: "#7a4a30", hemi_i: 0.6, ground: "#8a5a3c", sun_dir: [50.0, 26.0, 20.0], stars: false },
    Sky { key: "olive", name: "Olive storm", top: "#2c2c1e", mid: "#5e5c3a", bot: "#a8a070", fog: "#77724e", sun: "#f2e2a8", sun_i: 1.0, hemi_sky: "#e8dca8", hemi_ground: "#2a281a", hemi_i: 0.6, ground: "#3a3826", sun_dir: [30.0, 40.0, 30.0], stars: false },
];
pub fn sky(key: &str) -> &'static Sky { SKIES.iter().find(|s| s.key == key).unwrap_or(&SKIES[0]) }

/// "#rrggbb" to linear-ish sRGB floats in 0..1 (no gamma change; engines convert).
pub fn hex_rgb(hex: &str) -> [f32; 3] {
    let h = hex.trim_start_matches('#');
    let p = |i: usize| u8::from_str_radix(h.get(i..i + 2).unwrap_or("80"), 16).unwrap_or(128) as f32 / 255.0;
    [p(0), p(2), p(4)]
}
