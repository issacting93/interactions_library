//! The panels: top bar, controls, status line, atlas and code windows.

use bevy::prelude::*;
use bevy_egui::{egui, EguiContexts};
use egui::{Color32, LayerId, RichText, Ui, UiBuilder};
use forge_core::metrics::Trait;
use forge_core::spec::*;
use forge_core::{presets, Severity};

use crate::{Forge, Tab};

fn combo<T: Copy + PartialEq>(ui: &mut Ui, label: &str, v: &mut T, all: &[T], name: impl Fn(T) -> String) {
    ui.horizontal(|ui| {
        ui.label(label);
        egui::ComboBox::from_id_salt(label).selected_text(name(*v)).show_ui(ui, |ui| { for &a in all { ui.selectable_value(v, a, name(a)); } });
    });
}
// Dense panels (10+ fields per tab) want to be scanned and set precisely, not just turned like a
// synth knob — so every field here routes through the knob+slider `param_control` composite
// rather than a bare `knob()`. See theme.rs's doc comment on `param_control` for why.
fn slide(ui: &mut Ui, label: &str, v: &mut f32, lo: f32, hi: f32) { crate::theme::param_control(ui, v, lo, hi, crate::theme::accent(), label); }
fn slide_u(ui: &mut Ui, label: &str, v: &mut u32, lo: u32, hi: u32) {
    let mut f = *v as f32;
    crate::theme::param_control(ui, &mut f, lo as f32, hi as f32, crate::theme::accent(), label);
    *v = f.round().clamp(lo as f32, hi as f32) as u32;
}
fn colour(ui: &mut Ui, label: &str, hex: &mut String) {
    let c = hex_rgb(hex); let mut rgb = [(c[0] * 255.0) as u8, (c[1] * 255.0) as u8, (c[2] * 255.0) as u8];
    ui.horizontal(|ui| { if ui.color_edit_button_srgb(&mut rgb).changed() { *hex = format!("#{:02x}{:02x}{:02x}", rgb[0], rgb[1], rgb[2]); } ui.label(label); });
}
fn heading(ui: &mut Ui, s: &str) { ui.add_space(6.0); ui.label(RichText::new(s).small().color(crate::theme::ink2())); }
/// `ui.button` wrapper routed through the themed ghost button — see `theme::ghost_button`.
fn btn(ui: &mut Ui, text: &str) -> egui::Response { ui.add(crate::theme::ghost_button(text)) }
fn toggle(ui: &mut Ui, on: &mut bool, label: &str) -> egui::Response { crate::theme::led_toggle(ui, on, label, crate::theme::accent()) }

pub fn panels(mut contexts: EguiContexts, mut forge: ResMut<Forge>) -> Result {
    let ctx = contexts.ctx_mut()?.clone();
    ctx.set_visuals(crate::theme::visuals());
    crate::theme::apply_style(&ctx);
    let f: &mut Forge = &mut forge;
    let before = f.spec.clone();
    let mut root = Ui::new(ctx.clone(), "root".into(), UiBuilder::new().layer_id(LayerId::background()).max_rect(ctx.viewport_rect()));

    egui::Panel::top("top").show(&mut root, |ui| {
        ui.horizontal_wrapped(|ui| {
            // a letter-spaced wordmark — egui has no true CSS letter-spacing, so this interleaves
            // thin spaces (U+2009) by hand; only worth it for a short, roomy display label like this.
            let wordmark: String = "TOWER FORGE".chars().map(|c| c.to_string()).collect::<Vec<_>>().join("\u{2009}");
            ui.label(RichText::new(wordmark).monospace().strong().size(18.0).color(crate::theme::accent()));
            ui.separator();
            let current = presets::all().into_iter().find(|(k, _, _)| *k == f.preset).map(|(_, n, _)| n).unwrap_or_else(|| "Custom".into());
            egui::ComboBox::from_id_salt("preset").selected_text(current).width(240.0).show_ui(ui, |ui| {
                for (k, name, spec) in presets::all() { if ui.selectable_label(f.preset == k, name).clicked() { f.load(spec, &k, true); } }
            });
            if ui.add_enabled(f.hist_i > 0, crate::theme::ghost_button("↶ Undo")).clicked() { f.undo(); }
            if ui.add_enabled(f.hist_i + 1 < f.history.len(), crate::theme::ghost_button("↷ Redo")).clicked() { f.redo(); }
            toggle(ui, &mut f.animate, "Animate");
            if ui.selectable_label(f.atlas_open, "Atlas").clicked() { f.atlas_open = !f.atlas_open; if f.atlas.cells.is_empty() { f.atlas.reference = f.spec.clone(); f.atlas.seed(); f.atlas.step(600); } }
            if ui.selectable_label(f.code_open, "Code").clicked() { f.code_open = !f.code_open; f.code_text = f.spec.to_json(); }
            if btn(ui, "Export .glb").clicked() { export(f, true); }
            if btn(ui, "Save .json").clicked() { export(f, false); }
            if btn(ui, "Frame").clicked() { f.refit = true; f.dirty = true; }
            if !f.message.is_empty() { ui.label(RichText::new(&f.message).weak()); }
        });
    });

    egui::Panel::bottom("status").show(&mut root, |ui| {
        ui.horizontal_wrapped(|ui| {
            let s = &f.score;
            ui.label(format!("coherence {:.2} · stability {:.2} · joints {:.2} · proportion {:.2}", s.coherence, s.stability, s.joints, s.proportion));
            ui.separator();
            ui.label(RichText::new(&f.stats).weak());
        });
        for d in &f.plan.diagnostics {
            let col = match d.severity { Severity::Problem => Color32::from_rgb(230, 90, 80), Severity::Warning => Color32::from_rgb(220, 170, 60), Severity::Note => Color32::GRAY };
            ui.label(RichText::new(format!("{:?}: {}", d.severity, d.message)).color(col).small());
        }
        for n in &f.score.notes { ui.label(RichText::new(n).small().weak()); }
    });

    egui::Panel::left("controls").resizable(true).show(&mut root, |ui| {
        ui.set_min_width(300.0);
        ui.horizontal(|ui| {
            ui.selectable_value(&mut f.tab, Tab::Tiers, "Tiers");
            ui.selectable_value(&mut f.tab, Tab::CrownFoot, "Crown & foot");
            ui.selectable_value(&mut f.tab, Tab::Aura, "Aura");
            ui.selectable_value(&mut f.tab, Tab::Look, "Look");
        });
        ui.separator();
        egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| match f.tab {
            Tab::Tiers => tiers_ui(ui, f),
            Tab::CrownFoot => crown_ui(ui, &mut f.spec),
            Tab::Aura => aura_ui(ui, &mut f.spec),
            Tab::Look => look_ui(ui, &mut f.spec),
        });
    });

    let mut open = f.atlas_open;
    egui::Window::new("Atlas · MAP-Elites").collapsible(false).open(&mut open).default_width(460.0).show(&ctx, |ui| atlas_ui(ui, f));
    f.atlas_open = open;
    let mut open = f.code_open;
    egui::Window::new("Tower as code").collapsible(false).open(&mut open).default_width(520.0).show(&ctx, |ui| {
        ui.label(RichText::new("The same JSON as the browser Tower Forge. Edit, then load it back.").small());
        ui.horizontal(|ui| {
            if btn(ui, "Load into the tower").clicked() { match Spec::from_text(&f.code_text) { Ok(s) => { f.load(s, "custom", true); f.message = "Loaded from code".into(); } Err(e) => f.message = format!("Could not read the code: {e}") } }
            if btn(ui, "Refresh from the tower").clicked() { f.code_text = f.spec.to_json(); }
            if btn(ui, "Copy").clicked() { ui.ctx().copy_text(f.code_text.clone()); f.message = "Copied".into(); }
        });
        egui::ScrollArea::vertical().max_height(520.0).show(ui, |ui| { ui.add(egui::TextEdit::multiline(&mut f.code_text).code_editor().desired_width(f32::INFINITY).desired_rows(24)); });
    });
    f.code_open = open;

    if f.spec != before {
        f.dirty = true;
        f.preset = if f.preset == "custom" { f.preset.clone() } else { "custom".into() };
    }
    // commit to history once the pointer is released, so a slider drag is one undo step
    if !ctx.input(|i| i.pointer.any_down()) { f.commit(); }
    Ok(())
}

fn tiers_ui(ui: &mut Ui, f: &mut Forge) {
    let n = f.spec.tiers.len();
    ui.label(RichText::new("Stack (top first)").small());
    for i in (0..n).rev() { if ui.selectable_label(f.tier == i, format!("Tier {}  ·  {:.1} m", i + 1, f.spec.tiers[i].h)).clicked() { f.tier = i; } }
    ui.horizontal_wrapped(|ui| {
        let t = f.tier;
        if btn(ui, "+ Tier above").clicked() && n < 8 {
            let base = f.spec.tiers[t].clone(); let top = base.r_at(1.0);
            let mut nt = base; nt.h = (nt.h * 0.6 * 10.0).round() / 10.0; nt.r0 = (top * 0.9 * 100.0).round() / 100.0; nt.r1 = (top * 0.8 * 100.0).round() / 100.0; nt.sp_n = 0;
            f.spec.tiers.insert(t + 1, nt); f.tier += 1;
        }
        if btn(ui, "Duplicate").clicked() && n < 8 { let c = f.spec.tiers[t].clone(); f.spec.tiers.insert(t + 1, c); f.tier += 1; }
        if btn(ui, "↑").on_hover_text("Move up").clicked() && t + 1 < n { f.spec.tiers.swap(t, t + 1); f.tier += 1; }
        if btn(ui, "↓").on_hover_text("Move down").clicked() && t > 0 { f.spec.tiers.swap(t, t - 1); f.tier -= 1; }
        if btn(ui, "Delete").clicked() && n > 1 { f.spec.tiers.remove(t); f.tier = f.tier.saturating_sub(1); }
    });
    let ti = f.tier.min(f.spec.tiers.len() - 1);
    let t = &mut f.spec.tiers[ti];
    heading(ui, "SHAPE");
    slide(ui, "Height (m)", &mut t.h, 0.5, 40.0); slide(ui, "Radius at base", &mut t.r0, 0.2, 12.0); slide(ui, "Radius at top", &mut t.r1, 0.2, 12.0);
    combo(ui, "Plan", &mut t.sides, &[0, 3, 4, 6, 8, 12], |s| match s { 0 => "Round".into(), 3 => "Triangle".into(), 4 => "Square".into(), 6 => "Hexagon".into(), 8 => "Octagon".into(), n => format!("{n} sides") });
    combo(ui, "Profile", &mut t.prof, Profile::ALL, |p| p.label());
    slide(ui, "Profile strength", &mut t.amp, 0.0, 1.0); slide(ui, "Twist (°)", &mut t.twist, -180.0, 180.0);
    heading(ui, "SURFACE");
    combo(ui, "Material", &mut t.mat, Mat::ALL, |m| m.label());
    slide_u(ui, "Ribs", &mut t.ribs, 0, 48); if t.ribs > 0 { slide(ui, "Rib depth", &mut t.rib_d, 0.02, 0.8); }
    slide_u(ui, "Glowing channels", &mut t.chan, 0, 6);
    heading(ui, "OPENINGS");
    slide_u(ui, "Window rows", &mut t.win_rows, 0, 10);
    if t.win_rows > 0 { slide_u(ui, "Per row", &mut t.win_per, 1, 16); combo(ui, "Shape", &mut t.win_kind, WinKind::ALL, |k| k.label()); toggle(ui, &mut t.win_glow, "Lit"); }
    heading(ui, "BAND AT THE TOP");
    combo(ui, "Band", &mut t.band, Band::ALL, |b| b.label());
    if t.band != Band::None { slide(ui, "Band size", &mut t.band_size, 0.1, 2.5); }
    heading(ui, "TURRETS, STAIRS, CLOTH, BUTTRESSES");
    slide_u(ui, "Turrets", &mut t.sp_n, 0, 12); if t.sp_n > 0 { slide(ui, "Turret height (×)", &mut t.sp_h, 0.1, 1.3); slide(ui, "Turret radius", &mut t.sp_r, 0.1, 2.0); }
    slide(ui, "Spiral stair turns", &mut t.stair, 0.0, 5.0);
    slide_u(ui, "Banners", &mut t.ban_n, 0, 16); if t.ban_n > 0 { slide(ui, "Banner length", &mut t.ban_len, 1.0, 24.0); }
    slide_u(ui, "Flying buttresses", &mut t.but_n, 0, 12); if t.but_n > 0 { slide(ui, "Buttress reach", &mut t.but_r, 1.0, 16.0); }
}

fn crown_ui(ui: &mut Ui, s: &mut Spec) {
    heading(ui, "CROWN");
    combo(ui, "Crown", &mut s.crown.kind, CrownKind::ALL, |k| k.label());
    slide(ui, "Crown height", &mut s.crown.h, 0.2, 20.0);
    combo(ui, "Crown material", &mut s.crown.mat, Mat::ALL, |m| m.label());
    toggle(ui, &mut s.crown.finial, "Finial");
    heading(ui, "FOOT");
    combo(ui, "Foot", &mut s.foot.kind, FootKind::ALL, |k| k.label());
    if s.foot.kind != FootKind::None { slide(ui, "Foot height", &mut s.foot.h, 0.2, 16.0); slide(ui, "Spread (×)", &mut s.foot.spread, 1.0, 3.0); }
    if s.foot.kind == FootKind::Roots { slide_u(ui, "Buttress fins", &mut s.foot.fins, 0, 12); }
    slide(ui, "Lean (°)", &mut s.foot.lean, -15.0, 15.0);
}

fn aura_ui(ui: &mut Ui, s: &mut Spec) {
    heading(ui, "HALOS");
    let mut remove = None;
    for (i, h) in s.halos.iter_mut().enumerate() {
        egui::CollapsingHeader::new(format!("Halo {} · {}", i + 1, h.kind.label())).id_salt(("halo", i)).default_open(i == 0).show(ui, |ui| {
            combo(ui, &format!("Kind##{i}"), &mut h.kind, HaloKind::ALL, |k| k.label());
            slide(ui, "Radius", &mut h.r, 0.5, 20.0); slide(ui, "Height from top", &mut h.y, -30.0, 15.0);
            slide(ui, "Tilt (°)", &mut h.tilt, -90.0, 90.0); slide(ui, "Facing (°)", &mut h.face, 0.0, 360.0); slide(ui, "Offset", &mut h.off, 0.0, 10.0);
            if matches!(h.kind, HaloKind::Portal | HaloKind::Armillary) { slide_u(ui, "Rings", &mut h.n, 1, 8); }
            slide(ui, "Spin", &mut h.spin, -2.0, 2.0);
            if btn(ui, "Remove").clicked() { remove = Some(i); }
        });
    }
    if let Some(i) = remove { s.halos.remove(i); }
    ui.horizontal_wrapped(|ui| { ui.label("Add:"); for k in HaloKind::ALL { if ui.small_button(k.label()).clicked() && s.halos.len() < 6 { let r = s.top_radius(); s.halos.push(Halo { kind: *k, r: if *k == HaloKind::Armillary { r * 2.4 } else { r * 1.2 }, y: 1.0, ..Halo::default() }); } } });
    let a = &mut s.aura;
    heading(ui, "FLOATING DEBRIS");
    slide_u(ui, "Pieces", &mut a.deb_n, 0, 220);
    if a.deb_n > 0 { combo(ui, "Debris", &mut a.deb_kind, DebrisKind::ALL, |k| k.label()); slide(ui, "Orbit radius", &mut a.deb_r, 1.0, 40.0); slide(ui, "Spread", &mut a.deb_spread, 0.0, 30.0); slide(ui, "Size", &mut a.deb_size, 0.1, 3.0); slide(ui, "Lowest (× height)", &mut a.deb_low, 0.0, 1.0); slide(ui, "Drift", &mut a.drift, 0.0, 2.0); }
    heading(ui, "LIGHT");
    toggle(ui, &mut a.beam, "Beam from the first portal"); if a.beam { slide(ui, "Beam length", &mut a.beam_len, 5.0, 120.0); }
    slide_u(ui, "Glowing motes", &mut a.motes, 0, 600);
    heading(ui, "BRIDGE");
    toggle(ui, &mut a.bridge, "Bridge");
    if a.bridge { slide(ui, "Length", &mut a.bridge_len, 10.0, 140.0); slide(ui, "Deck height (×)", &mut a.bridge_at, 0.05, 0.9); slide(ui, "Direction (°)", &mut a.bridge_face, 0.0, 360.0); toggle(ui, &mut a.bridge_broken, "Broken off"); }
    heading(ui, "ROOTS");
    slide_u(ui, "Roots", &mut a.roots, 0, 14); if a.roots > 0 { slide(ui, "Reach (×)", &mut a.roots_h, 0.1, 1.0); toggle(ui, &mut a.roots_glow, "Roots glow"); }
    heading(ui, "SATELLITE PILLARS");
    slide_u(ui, "Pillars", &mut a.sat_n, 0, 10); if a.sat_n > 0 { slide(ui, "Distance", &mut a.sat_r, 4.0, 40.0); slide(ui, "Scale (×)", &mut a.sat_scale, 0.15, 0.9); toggle(ui, &mut a.sat_glow, "Lit tops"); }
}

fn look_ui(ui: &mut Ui, s: &mut Spec) {
    heading(ui, "SKY");
    let cur = sky(&s.look.sky).name;
    egui::ComboBox::from_id_salt("sky").selected_text(cur).show_ui(ui, |ui| { for k in SKIES { if ui.selectable_label(s.look.sky == k.key, k.name).clicked() { s.look.sky = k.key.into(); } } });
    heading(ui, "COLOURS");
    colour(ui, "Body", &mut s.look.body); colour(ui, "Accent metal", &mut s.look.accent); colour(ui, "Dark stone", &mut s.look.dark); colour(ui, "Glow", &mut s.look.glow); colour(ui, "Cloth", &mut s.look.cloth);
    slide(ui, "Weathering", &mut s.look.weather, 0.0, 1.0); slide(ui, "Bloom", &mut s.look.bloom, 0.0, 2.5);
    heading(ui, "SEED");
    ui.add(egui::DragValue::new(&mut s.seed).range(1..=999_999)).on_hover_text("Changes weathering, debris and ring placement");
}

fn atlas_ui(ui: &mut Ui, f: &mut Forge) {
    let (mut x, mut y, mut n) = (f.atlas.x, f.atlas.y, f.atlas.n);
    ui.horizontal_wrapped(|ui| {
        combo(ui, "Across", &mut x, &Trait::ALL, |t| t.label().into());
        combo(ui, "Up", &mut y, &Trait::ALL, |t| t.label().into());
        combo(ui, "Grid", &mut n, &[6, 8, 10, 12], |v| format!("{v} × {v}"));
    });
    if (x, y, n) != (f.atlas.x, f.atlas.y, f.atlas.n) { f.atlas.regrid(x, y, n); }
    ui.horizontal_wrapped(|ui| {
        if btn(ui, "Evolve 500").clicked() { f.atlas.step(500); }
        toggle(ui, &mut f.auto_evolve, "Keep evolving");
        if btn(ui, "★ Pin current").clicked() { let s = f.spec.clone(); f.atlas.pin(s); }
        if btn(ui, "Reset").clicked() { f.atlas.reference = f.spec.clone(); f.atlas.seed(); }
    });
    ui.horizontal_wrapped(|ui| {
        ui.label(RichText::new("Keep fixed:").small());
        let l = &mut f.atlas.locks;
        toggle(ui, &mut l.stack, "Tiers"); toggle(ui, &mut l.crown, "Crown"); toggle(ui, &mut l.foot, "Foot"); toggle(ui, &mut l.aura, "Aura"); toggle(ui, &mut l.look, "Look");
    });
    ui.add(egui::Slider::new(&mut f.atlas.crossover_rate, 0.0..=0.8).text("Crossover share"));
    ui.label(RichText::new(format!("{}/{} cells · {:.0}% coverage · QD {:.1} · best {:.2} · {} tried · {} preferences learned",
        f.atlas.cells.len(), f.atlas.n * f.atlas.n, f.atlas.coverage() * 100.0, f.atlas.qd_score(), f.atlas.best(), f.atlas.tried, f.atlas.preference.pairs)).small().weak());
    ui.add_space(4.0);
    let n = f.atlas.n; let size = (400.0 / n as f32).clamp(22.0, 48.0);
    let mut load = None; let mut pin = None;
    ui.horizontal(|ui| {
        ui.vertical(|ui| { ui.add_space(size * n as f32 / 2.0 - 10.0); ui.label(RichText::new(format!("{} ↑", f.atlas.y.label())).small()); });
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing = egui::vec2(2.0, 2.0);
            for j in (0..n).rev() {
                ui.horizontal(|ui| {
                    for i in 0..n {
                        let key = (i, j);
                        match f.atlas.cells.get(&key) {
                            Some(e) => {
                                let v = (e.fitness * 255.0) as u8; let fill = Color32::from_rgb(40 + v / 4, 60 + v / 3, 110 + v / 2);
                                let mut b = egui::Button::new(RichText::new(e.spec.crown.kind.key()[..1].to_uppercase()).small().color(Color32::WHITE)).fill(fill)
                                    .stroke(egui::Stroke::new(1.0, crate::theme::line(3))).corner_radius(egui::CornerRadius::same(4)).min_size(egui::vec2(size, size));
                                if f.atlas_cur == Some(key) { b = b.stroke(egui::Stroke::new(2.0, crate::theme::accent())); }
                                let r = ui.add(b).on_hover_text(format!("{} {:.1} · {} {:.1}\nfitness {:.2} (coherence {:.2})\n{} tiers · {} crown · {} foot\nclick to open · right-click to pin",
                                    f.atlas.x.label(), e.x, f.atlas.y.label(), e.y, e.fitness, e.coherence, e.spec.tiers.len(), e.spec.crown.kind.label(), e.spec.foot.kind.label()));
                                if r.clicked() { load = Some(key); }
                                if r.secondary_clicked() { pin = Some(key); }
                            }
                            None => { ui.add_enabled(false, egui::Button::new("").stroke(egui::Stroke::new(1.0, crate::theme::line(1))).corner_radius(egui::CornerRadius::same(4)).min_size(egui::vec2(size, size))); }
                        }
                    }
                });
            }
            ui.label(RichText::new(format!("{} →", f.atlas.x.label())).small());
        });
    });
    if let Some(k) = load {
        let s = f.atlas.cells[&k].spec.clone();
        f.atlas.record_choice(k); f.atlas_cur = Some(k);
        f.load(s, "custom", true);
    }
    if let Some(k) = pin { let s = f.atlas.cells[&k].spec.clone(); f.atlas.pin(s); f.message = "Pinned: the search now favours towers like it".into(); }
    if !f.atlas.pinned.is_empty() {
        ui.horizontal_wrapped(|ui| {
            ui.label(RichText::new("Pinned:").small());
            let mut unpin = None; let mut open = None;
            for (i, p) in f.atlas.pinned.iter().enumerate() {
                if ui.small_button(format!("{} · {:.0} m", p.crown.kind.label(), p.tower_height() + p.crown.h)).on_hover_text("open").clicked() { open = Some(p.clone()); }
                if ui.small_button("×").on_hover_text("unpin").clicked() { unpin = Some(i); }
            }
            if let Some(i) = unpin { f.atlas.unpin(i); }
            if let Some(s) = open { f.load(s, "custom", true); }
        });
        if f.atlas.pinned.len() >= 2 && btn(ui, "Breed from the last two pins").clicked() {
            let k = f.atlas.pinned.len(); let (a, b) = (f.atlas.pinned[k - 2].clone(), f.atlas.pinned[k - 1].clone());
            f.atlas.breed(&a, &b, 60);
        }
    }
}

fn export(f: &mut Forge, glb: bool) {
    let dir = std::path::Path::new("exports");
    if let Err(e) = std::fs::create_dir_all(dir) { f.message = format!("Cannot create exports folder: {e}"); return; }
    let name = format!("tower-{}-{}", if f.preset == "custom" { "custom" } else { &f.preset }, f.spec.seed);
    let (path, bytes) = if glb { (dir.join(format!("{name}.glb")), forge_gltf::export_glb(&f.spec, &f.plan, f.time)) } else { (dir.join(format!("{name}.json")), f.spec.to_json().into_bytes()) };
    f.message = match std::fs::write(&path, bytes) { Ok(_) => format!("Saved {}", path.display()), Err(e) => format!("Could not save: {e}") };
}
