//! Tower Forge desktop app: Bevy viewport, egui panels, MAP-Elites atlas.
//!
//! The app holds a recipe ([`Spec`]). Every edit recompiles it into a plan and respawns the
//! tower; parts that repeat share one mesh and material, so Bevy draws them as instances.

mod ecology;
mod scene;
mod theme;
mod ui;

use std::path::PathBuf;
use std::time::SystemTime;

use bevy::prelude::*;
use bevy_egui::{EguiPlugin, EguiPrimaryContextPass};
use forge_core::metrics::Trait;
use forge_core::{compile, presets, score, Score, Spec, TowerPlan};
use forge_search::Atlas;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tab { Tiers, CrownFoot, Aura, Look }

/// Everything the app knows about the tower being worked on.
#[derive(Resource)]
pub struct Forge {
    pub spec: Spec,
    pub plan: TowerPlan,
    pub score: Score,
    pub preset: String,
    pub tier: usize,
    pub tab: Tab,
    /// Recompile and respawn on the next frame.
    pub dirty: bool,
    /// Reframe the camera after the next rebuild.
    pub refit: bool,
    pub history: Vec<String>,
    pub hist_i: usize,
    pub time: f32,
    pub animate: bool,
    pub message: String,
    pub code_open: bool,
    pub code_text: String,
    pub atlas_open: bool,
    pub auto_evolve: bool,
    pub atlas: Atlas,
    pub atlas_cur: Option<(usize, usize)>,
    /// A spec file being watched: edits saved elsewhere reload here.
    pub watch: Option<(PathBuf, Option<SystemTime>)>,
    pub stats: String,
}

impl Forge {
    pub fn new(spec: Spec, preset: &str) -> Forge {
        let plan = compile(&spec);
        let score = score(&spec, Some(&plan));
        let atlas = Atlas::new(Trait::Height, Trait::Ornament, 8, 1, spec.clone());
        let json = serde_json::to_string(&spec).unwrap_or_default();
        Forge { spec, plan, score, preset: preset.into(), tier: 0, tab: Tab::Tiers, dirty: true, refit: true, history: vec![json], hist_i: 0, time: 0.0, animate: true,
            message: String::new(), code_open: false, code_text: String::new(), atlas_open: false, auto_evolve: false, atlas, atlas_cur: None, watch: None, stats: String::new() }
    }
    /// Replace the tower (from a preset, the atlas, a file or the code window).
    pub fn load(&mut self, spec: Spec, preset: &str, refit: bool) {
        self.spec = spec; self.spec.sanitize(); self.preset = preset.into(); self.tier = self.tier.min(self.spec.tiers.len() - 1);
        self.dirty = true; self.refit = refit; self.commit();
    }
    /// Record the current recipe in the undo history if it changed.
    pub fn commit(&mut self) {
        let json = serde_json::to_string(&self.spec).unwrap_or_default();
        if self.history.get(self.hist_i) == Some(&json) { return; }
        self.history.truncate(self.hist_i + 1); self.history.push(json);
        if self.history.len() > 100 { self.history.remove(0); }
        self.hist_i = self.history.len() - 1;
        self.atlas.reference = self.spec.clone();
    }
    pub fn undo(&mut self) { if self.hist_i > 0 { self.hist_i -= 1; self.restore(); } }
    pub fn redo(&mut self) { if self.hist_i + 1 < self.history.len() { self.hist_i += 1; self.restore(); } }
    fn restore(&mut self) {
        if let Ok(s) = serde_json::from_str::<Spec>(&self.history[self.hist_i]) { self.spec = s; self.tier = self.tier.min(self.spec.tiers.len() - 1); self.dirty = true; }
    }
}

/// A preset name, a .json spec (watched), or a Tower Forge .glb.
fn load_spec(arg: &str) -> (Spec, String, Option<PathBuf>) {
    if let Some(s) = presets::get(arg) { return (s, arg.to_string(), None); }
    let read = if arg.ends_with(".glb") {
        std::fs::read(arg).ok().and_then(|b| forge_gltf::spec_from_glb(&b))
    } else {
        std::fs::read_to_string(arg).ok().and_then(|t| Spec::from_text(&t).ok())
    };
    match read {
        Some(s) => (s, "custom".into(), if arg.ends_with(".json") { Some(PathBuf::from(arg)) } else { None }),
        None => { eprintln!("could not read {arg}; starting from the monolith"); (presets::get("monolith").unwrap(), "monolith".into(), None) }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    // `tower-forge --render <preset|spec.json> [out.png] [width height] [time]` renders without a window.
    if args.get(1).map(String::as_str) == Some("--render") {
        let spec = load_spec(args.get(2).map(String::as_str).unwrap_or("monolith")).0;
        let out = args.get(3).cloned().unwrap_or_else(|| "render.png".into());
        let w = args.get(4).and_then(|v| v.parse().ok()).unwrap_or(1280);
        let h = args.get(5).and_then(|v| v.parse().ok()).unwrap_or(960);
        let t = args.get(6).and_then(|v| v.parse().ok()).unwrap_or(2.0);
        scene::render_headless(spec, out, w, h, t);
        return;
    }
    // `tower-forge path/to/spec.json` opens and watches a spec file.
    let arg = args.get(1).cloned();
    let (spec, preset, watch) = load_spec(arg.as_deref().unwrap_or("monolith"));
    let mut forge = Forge::new(spec, &preset);
    if let Some(p) = watch { forge.message = format!("Watching {} for changes", p.display()); forge.watch = Some((p, None)); }

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window { title: "Tower Forge".into(), resolution: (1440, 900).into(), ..default() }),
            ..default()
        }))
        .add_plugins(EguiPlugin::default())
        .insert_resource(forge)
        .insert_resource(ClearColor(Color::srgb(0.2, 0.2, 0.25)))
        .add_systems(Startup, scene::setup)
        .add_systems(EguiPrimaryContextPass, ui::panels)
        .add_systems(Update, (scene::watch_file, scene::drop_files, scene::shortcuts, scene::evolve, scene::rebuild, scene::animate, ecology::animate_creatures, scene::orbit_camera).chain())
        .run();
}
