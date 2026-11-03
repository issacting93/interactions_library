//! Minimal habitat-weighted creature placement.
//!
//! Not a simulation: no species, no predation, no movement toward anything. This is a
//! presentational reading of `forge-core`'s own `metrics::habitat()` score — a few small
//! markers idling at the same tier bands, stairs, buttresses, roots and crown features that
//! score already counts as "livable," so what the atlas calls habitat-rich is what actually
//! looks lived-in here. A real ecosystem (species, predation, pressure) stays in
//! `shared/ecology-sim.js`, ported to `tools/world-scene/` in the browser — out of scope for
//! this engine-free Rust core until there's a real reason to simulate behaviour, not just place it.

use bevy::prelude::*;
use forge_core::geometry::part_transform;
use forge_core::plan::TowerPlan;

/// A placed creature marker: its resting point plus enough per-instance variation that a
/// cluster of them doesn't bob and spin in lockstep.
#[derive(Component)]
pub struct Creature {
    base: Vec3,
    phase: f32,
    bob_speed: f32,
    bob_amount: f32,
    spin_speed: f32,
}

/// Mirrors `forge_core::metrics::habitat()`'s weighting by tag family, so creature density
/// follows the same "what makes a tower livable" read the atlas already scores a tower by.
fn habitat_weight(tag: &str) -> f32 {
    match tag {
        "band_balcony" => 2.0,
        "band_crenel" => 1.5,
        "band_corbel" => 1.2,
        "band_ring" | "band_beads" => 0.5,
        "band_glyphs" | "band_drops" => 0.3,
        "stair" => 1.2,
        "banner" => 0.6,
        "root" => 1.0,
        "bridge_deck" => 1.5,
        "crown_lantern" | "crown_belfry" | "crown_crenel" => 1.2,
        "foot_crag" | "foot_roots" => 1.0,
        t if t.starts_with("buttress") => 1.5,
        _ => 0.0,
    }
}

/// Spawn a handful of creature markers on the plan's most habitat-scoring surfaces, parented to
/// `root` so they share the tower's despawn/rebuild lifecycle (no leak across "New seed").
/// `scale_ref` sizes the markers relative to the tower (its height/reach), not a fixed constant.
pub fn spawn_creatures(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    mats: &mut Assets<StandardMaterial>,
    root: Entity,
    plan: &TowerPlan,
    scale_ref: f32,
) {
    let mut candidates: Vec<(Vec3, f32)> = vec![];
    for part in &plan.parts {
        let w = habitat_weight(&part.tag);
        if w <= 0.0 {
            continue;
        }
        for i in 0..part.instances.len() {
            // forge-core pins its own glam version, distinct from Bevy's — cross over as a plain
            // array and rebuild as Bevy's own Mat4, same as scene.rs's `bevy_mat` helper does.
            let m = Mat4::from_cols_array(&part_transform(part, i, 0.0).to_cols_array());
            candidates.push((m.transform_point3(Vec3::ZERO), w));
        }
    }
    if candidates.is_empty() {
        return;
    }
    // highest-habitat spots first; a tower with little going on gets few or no creatures
    candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let want = (candidates.len() / 3).clamp(1, 24);
    candidates.truncate(want);

    let radius = (scale_ref * 0.012).clamp(0.08, 0.55);
    let mesh = meshes.add(Sphere::new(radius).mesh().uv(12, 6));
    // TAPE08 loop/green signal colour (shared/tape08-tokens.css: --t8-loop #5BE39A) — a living
    // accent distinct from the tower's own stone/metal/glow materials.
    let mat = mats.add(StandardMaterial {
        base_color: Color::srgb_u8(0x5B, 0xE3, 0x9A),
        emissive: LinearRgba::rgb(0.25, 1.1, 0.65),
        perceptual_roughness: 0.6,
        ..default()
    });

    for (idx, (pos, _)) in candidates.iter().enumerate() {
        // nudge outward from the tower's vertical axis so the marker clears the part's own mesh
        let out = Vec3::new(pos.x, 0.0, pos.z).normalize_or(Vec3::X) * (radius * 2.2);
        let jitter_y = (idx as f32 * 2.399_963).sin() * radius * 1.5;
        let base = *pos + out + Vec3::new(0.0, jitter_y, 0.0);
        let phase = idx as f32 * 1.7;
        commands.spawn((
            Mesh3d(mesh.clone()),
            MeshMaterial3d(mat.clone()),
            Transform::from_translation(base),
            ChildOf(root),
            Creature {
                base,
                phase,
                bob_speed: 0.9 + (idx as f32 * 0.37).fract() * 0.6,
                bob_amount: radius * 1.8,
                spin_speed: 0.6 + (idx as f32 * 0.61).fract() * 0.8,
            },
        ));
    }
}

/// Idle bob + spin, driven by `forge.time` (advanced in [`crate::scene::animate`]) so creatures
/// stay in step with the rest of the tower's motion and pause together with it.
pub fn animate_creatures(forge: Res<crate::Forge>, mut q: Query<(&Creature, &mut Transform)>) {
    if !forge.animate {
        return;
    }
    let t = forge.time;
    for (c, mut tr) in &mut q {
        tr.translation = c.base + Vec3::Y * (t * c.bob_speed + c.phase).sin() * c.bob_amount;
        tr.rotation = Quat::from_rotation_y(t * c.spin_speed + c.phase);
    }
}
