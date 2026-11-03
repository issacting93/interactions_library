//! The 3D side: materials, spawning the plan, motion, lighting, camera and file handling.

use std::collections::HashMap;

use bevy::asset::RenderAssetUsages;
use bevy::camera::Hdr;
use bevy::input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::pbr::{DistanceFog, FogFalloff};
use bevy::post_process::bloom::Bloom;
use bevy::prelude::*;
use bevy::window::FileDragAndDrop;
use bevy_egui::EguiContexts;
use forge_core::geometry::{part_transform, shape_mesh, MeshData};
use forge_core::plan::{MatSlot, Motion};
use forge_core::spec::{hex_rgb, sky};
use forge_core::{compile, score, Spec};

use crate::ecology;
use crate::Forge;

#[derive(Component)]
pub struct TowerRoot;
/// A copy of a moving part: which part and which copy, so its transform can be recomputed.
#[derive(Component)]
pub struct Moving { part: usize, index: usize }
#[derive(Component)]
pub struct Sun;
#[derive(Component)]
pub struct Ground;
#[derive(Component)]
pub struct OrbitCam { pub target: Vec3, pub yaw: f32, pub pitch: f32, pub dist: f32 }

pub fn setup(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>, mut mats: ResMut<Assets<StandardMaterial>>) {
    let cam = OrbitCam { target: Vec3::new(0.0, 15.0, 0.0), yaw: 0.55, pitch: 0.12, dist: 80.0 };
    commands.spawn((
        Camera3d::default(), Hdr, Bloom::NATURAL,
        Transform::from_translation(orbit_pos(&cam)).looking_at(cam.target, Vec3::Y),
        DistanceFog { color: Color::srgb(0.6, 0.5, 0.5), falloff: FogFalloff::Linear { start: 150.0, end: 600.0 }, ..default() },
        AmbientLight { color: Color::WHITE, brightness: 400.0, ..default() },
        cam,
    ));
    commands.spawn((DirectionalLight { illuminance: 9000.0, shadow_maps_enabled: true, ..default() }, Transform::from_xyz(40.0, 30.0, 30.0).looking_at(Vec3::ZERO, Vec3::Y), Sun));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(2000.0, 2000.0))),
        MeshMaterial3d(mats.add(StandardMaterial { base_color: Color::srgb(0.35, 0.3, 0.28), perceptual_roughness: 1.0, ..default() })),
        Transform::from_xyz(0.0, -0.02, 0.0), Ground,
    ));
}

pub fn orbit_pos(c: &OrbitCam) -> Vec3 { c.target + Vec3::new(c.yaw.sin() * c.pitch.cos(), c.pitch.sin(), c.yaw.cos() * c.pitch.cos()) * c.dist }

fn srgb(hex: &str) -> Color { let c = hex_rgb(hex); Color::srgb(c[0], c[1], c[2]) }

fn material_for(spec: &Spec, slot: MatSlot) -> StandardMaterial {
    let (c, rough, metal, em) = forge_gltf::material_values(spec, slot);
    let mut m = StandardMaterial {
        base_color: Color::linear_rgb(c[0], c[1], c[2]), perceptual_roughness: rough, metallic: metal,
        double_sided: true, cull_mode: None, ..default()
    };
    if slot == MatSlot::Glow {
        let k = 6.0 * (0.4 + spec.look.bloom);
        m.emissive = LinearRgba::rgb(em[0] * k, em[1] * k, em[2] * k);
    }
    if slot == MatSlot::Void { m.unlit = true; }
    m
}

fn to_bevy_mesh(m: &MeshData) -> Mesh {
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, m.positions.clone())
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, m.normals.clone())
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, m.uvs.clone())
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, m.colors.clone())
        .with_inserted_indices(Indices::U32(m.indices.clone()))
}
/// The core uses its own glam version, so matrices cross over as plain arrays.
fn bevy_mat(cols: [f32; 16]) -> Mat4 { Mat4::from_cols_array(&cols) }
fn to_transform(m: Mat4) -> Transform { let (s, r, t) = m.to_scale_rotation_translation(); Transform { translation: t, rotation: r, scale: s } }

/// Recompile when the recipe changed, respawn the tower, and set the sky.
#[allow(clippy::too_many_arguments)]
pub fn rebuild(
    mut commands: Commands, mut forge: ResMut<Forge>, mut meshes: ResMut<Assets<Mesh>>, mut mats: ResMut<Assets<StandardMaterial>>,
    roots: Query<Entity, With<TowerRoot>>, mut clear: ResMut<ClearColor>,
    mut cam: Query<(&mut OrbitCam, &mut DistanceFog, &mut Bloom, &mut AmbientLight)>,
    mut sun: Query<(&mut DirectionalLight, &mut Transform), With<Sun>>,
    ground: Query<&MeshMaterial3d<StandardMaterial>, With<Ground>>,
) {
    if !forge.dirty { return; }
    forge.dirty = false;
    let started = std::time::Instant::now();
    let spec = forge.spec.clone();
    let plan = compile(&spec);
    forge.score = score(&spec, Some(&plan));
    for e in &roots { commands.entity(e).despawn(); }

    let mut handles: HashMap<MatSlot, Handle<StandardMaterial>> = HashMap::new();
    let root = commands.spawn((TowerRoot, Transform::default(), Visibility::default())).id();
    let (mut entities, mut tris) = (0usize, 0usize);
    for (pi, part) in plan.parts.iter().enumerate() {
        let mesh = shape_mesh(&part.shape);
        if mesh.is_empty() { continue; }
        let mat = handles.entry(part.mat).or_insert_with(|| mats.add(material_for(&spec, part.mat))).clone();
        if part.sheared() {
            // a leaning body: bake the copies, since a Bevy transform cannot shear
            let mut baked = MeshData::default();
            for i in 0..part.instances.len() { baked.append(&mesh.transformed(part_transform(part, i, 0.0))); }
            tris += baked.triangle_count();
            commands.spawn((Mesh3d(meshes.add(to_bevy_mesh(&baked))), MeshMaterial3d(mat), Transform::default(), ChildOf(root)));
            entities += 1;
            continue;
        }
        // copies share one mesh and material, so Bevy batches them
        let handle = meshes.add(to_bevy_mesh(&mesh));
        tris += mesh.triangle_count() * part.instances.len();
        for i in 0..part.instances.len() {
            let mut e = commands.spawn((Mesh3d(handle.clone()), MeshMaterial3d(mat.clone()), to_transform(bevy_mat(part_transform(part, i, forge.time).to_cols_array())), ChildOf(root)));
            if part.motion != Motion::Still { e.insert(Moving { part: pi, index: i }); }
            entities += 1;
        }
    }
    ecology::spawn_creatures(&mut commands, &mut meshes, &mut mats, root, &plan, plan.measures.top.max(plan.measures.reach));

    // sky, fog, light, ground
    let sk = sky(&spec.look.sky);
    clear.0 = srgb(sk.mid);
    let m = &plan.measures;
    let span = m.top.max(m.reach * 1.6).max(10.0);
    if let Ok((mut oc, mut fog, mut bloom, mut amb)) = cam.single_mut() {
        fog.color = srgb(sk.fog);
        fog.falloff = FogFalloff::Linear { start: span * 2.2, end: span * 9.0 };
        bloom.intensity = 0.12 + 0.12 * spec.look.bloom;
        amb.color = srgb(sk.hemi_sky); amb.brightness = 250.0 + 700.0 * sk.hemi_i;
        if forge.refit {
            oc.target = Vec3::new(0.0, m.top * 0.5, 0.0);
            oc.dist = (m.top * 1.05).max(m.reach * 2.0) / (2.0 * (0.39f32).tan()) * 1.35;
            forge.refit = false;
        }
    }
    if let Ok((mut light, mut tr)) = sun.single_mut() {
        light.color = srgb(sk.sun); light.illuminance = 6000.0 * sk.sun_i;
        let d = Vec3::from(sk.sun_dir).normalize();
        *tr = Transform::from_translation(d * span * 2.0).looking_at(Vec3::new(0.0, m.top * 0.3, 0.0), Vec3::Y);
    }
    if let Ok(h) = ground.single() { if let Some(mut g) = mats.get_mut(&h.0) { g.base_color = srgb(sk.ground); } }

    forge.stats = format!("{} parts · {} copies · {} entities · {} triangles · built in {:.1} ms",
        plan.parts.len(), plan.instance_count(), entities, tris, started.elapsed().as_secs_f32() * 1000.0);
    forge.plan = plan;
}

/// Spin, swing, sway and orbit.
pub fn animate(time: Res<Time>, mut forge: ResMut<Forge>, mut q: Query<(&Moving, &mut Transform)>) {
    if !forge.animate { return; }
    forge.time += time.delta_secs();
    let t = forge.time;
    for (mv, mut tr) in &mut q {
        if let Some(p) = forge.plan.parts.get(mv.part) { if mv.index < p.instances.len() { *tr = to_transform(bevy_mat(part_transform(p, mv.index, t).to_cols_array())); } }
    }
}

/// Left drag orbits, right drag pans, the wheel zooms; ignored while the pointer is over a panel.
pub fn orbit_camera(
    mut contexts: EguiContexts, buttons: Res<ButtonInput<MouseButton>>, motion: Res<AccumulatedMouseMotion>, scroll: Res<AccumulatedMouseScroll>,
    mut q: Query<(&mut OrbitCam, &mut Transform)>,
) {
    let over_ui = contexts.ctx_mut().map(|c| c.egui_wants_pointer_input() || c.is_pointer_over_egui()).unwrap_or(false);
    let Ok((mut c, mut tr)) = q.single_mut() else { return };
    if !over_ui {
        let d = motion.delta;
        if buttons.pressed(MouseButton::Left) { c.yaw -= d.x * 0.006; c.pitch = (c.pitch + d.y * 0.004).clamp(-0.05, 1.45); }
        if buttons.pressed(MouseButton::Right) || buttons.pressed(MouseButton::Middle) {
            let right = Vec3::new(c.yaw.cos(), 0.0, -c.yaw.sin());
            let k = c.dist * 0.0015; c.target += -right * d.x * k + Vec3::Y * d.y * k;
        }
        if scroll.delta.y != 0.0 { c.dist = (c.dist * (1.0 - scroll.delta.y * 0.08)).clamp(3.0, 3000.0); }
    }
    *tr = Transform::from_translation(orbit_pos(&c)).looking_at(c.target, Vec3::Y);
}

/// Keep evolving the atlas while it is open.
pub fn evolve(mut forge: ResMut<Forge>) { if forge.atlas_open && forge.auto_evolve { forge.atlas.step(120); } }

/// Ctrl/Cmd + Z undoes, with Shift redoes.
pub fn shortcuts(keys: Res<ButtonInput<KeyCode>>, mut forge: ResMut<Forge>, mut contexts: EguiContexts) {
    if contexts.ctx_mut().map(|c| c.egui_wants_keyboard_input()).unwrap_or(false) { return; }
    let cmd = keys.any_pressed([KeyCode::ControlLeft, KeyCode::ControlRight, KeyCode::SuperLeft, KeyCode::SuperRight]);
    if cmd && keys.just_pressed(KeyCode::KeyZ) { if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) { forge.redo(); } else { forge.undo(); } }
    if keys.just_pressed(KeyCode::Space) { forge.animate = !forge.animate; }
}

/// Reload a watched spec file when it changes on disk.
pub fn watch_file(mut forge: ResMut<Forge>, time: Res<Time>, mut acc: Local<f32>) {
    *acc += time.delta_secs();
    if *acc < 0.5 { return; }
    *acc = 0.0;
    let Some((path, seen)) = forge.watch.clone() else { return };
    let Ok(modified) = std::fs::metadata(&path).and_then(|m| m.modified()) else { return };
    if seen == Some(modified) { return; }
    forge.watch = Some((path.clone(), Some(modified)));
    if seen.is_none() { return; }
    match std::fs::read_to_string(&path).map_err(|e| e.to_string()).and_then(|t| Spec::from_text(&t)) {
        Ok(s) => { forge.load(s, "custom", false); forge.message = format!("Reloaded {}", path.display()); }
        Err(e) => forge.message = format!("{}: {e}", path.display()),
    }
}

/// Drop a .json spec or a Tower Forge .glb onto the window to open it.
pub fn drop_files(mut drops: MessageReader<FileDragAndDrop>, mut forge: ResMut<Forge>) {
    for ev in drops.read() {
        if let FileDragAndDrop::DroppedFile { path_buf, .. } = ev {
            let spec = if path_buf.extension().is_some_and(|e| e == "glb") {
                std::fs::read(path_buf).ok().and_then(|b| forge_gltf::spec_from_glb(&b)).ok_or_else(|| "no Tower Forge recipe inside".to_string())
            } else {
                std::fs::read_to_string(path_buf).map_err(|e| e.to_string()).and_then(|t| Spec::from_text(&t))
            };
            match spec {
                Ok(s) => { forge.load(s, "custom", true); forge.watch = Some((path_buf.clone(), None)); forge.message = format!("Opened and watching {}", path_buf.display()); }
                Err(e) => forge.message = format!("{}: {e}", path_buf.display()),
            }
        }
    }
}

// ---------- rendering without a window ----------

#[derive(Resource)]
struct Snapshot { image: Handle<Image>, out: String, frame: u32, time: f32, started: Option<std::time::Instant>, wait: f32, requested: bool }

/// Render a tower to a PNG with no window: for previews, thumbnails and machines without a display.
pub fn render_headless(spec: Spec, out: String, w: u32, h: u32, time: f32) {
    use bevy::app::ScheduleRunnerPlugin;
    use bevy::window::ExitCondition;
    use bevy::winit::WinitPlugin;
    let mut forge = Forge::new(spec, "custom");
    forge.time = time; forge.animate = false;
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin { primary_window: None, exit_condition: ExitCondition::DontExit, close_when_requested: false, ..default() }).disable::<WinitPlugin>())
        .add_plugins(ScheduleRunnerPlugin::run_loop(std::time::Duration::from_secs_f64(0.25)))
        .insert_resource(forge)
        .insert_resource(ClearColor(Color::srgb(0.2, 0.2, 0.25)))
        .insert_resource(SnapshotSize(w, h, out))
        .add_systems(Startup, (setup, snapshot_target).chain())
        .add_systems(Update, (rebuild, place_camera, snapshot).chain())
        .run();
}

#[derive(Resource)]
struct SnapshotSize(u32, u32, String);

fn snapshot_target(mut commands: Commands, mut images: ResMut<Assets<Image>>, size: Res<SnapshotSize>, cams: Query<Entity, With<OrbitCam>>, forge: Res<Forge>) {
    use bevy::camera::RenderTarget;
    use bevy::render::render_resource::TextureFormat;
    let mut img = Image::new_target_texture(size.0, size.1, TextureFormat::Rgba8UnormSrgb, None);
    img.texture_descriptor.usage |= bevy::render::render_resource::TextureUsages::COPY_SRC;
    let handle = images.add(img);
    for c in &cams { commands.entity(c).insert(RenderTarget::Image(handle.clone().into())); }
    let wait = std::env::var("FORGE_RENDER_WAIT").ok().and_then(|v| v.parse().ok()).unwrap_or(3.0);
    commands.insert_resource(Snapshot { image: handle, out: size.2.clone(), frame: 0, time: forge.time, started: None, wait, requested: false });
}

fn place_camera(mut q: Query<(&OrbitCam, &mut Transform)>) {
    for (c, mut tr) in &mut q { *tr = Transform::from_translation(orbit_pos(c)).looking_at(c.target, Vec3::Y); }
}

fn snapshot(mut commands: Commands, mut snap: ResMut<Snapshot>, mut exit: MessageWriter<AppExit>, forge: Res<Forge>, mut moving: Query<(&Moving, &mut Transform)>) {
    snap.frame += 1;
    if snap.frame == 2 {
        let t = snap.time;
        for (mv, mut tr) in &mut moving { if let Some(p) = forge.plan.parts.get(mv.part) { *tr = to_transform(bevy_mat(part_transform(p, mv.index, t).to_cols_array())); } }
    }
    // shaders compile in the background (slowly on software GPUs), so wait on the clock, not frames
    if snap.frame == 3 { snap.started = Some(std::time::Instant::now()); }
    let ready = snap.started.map_or(false, |t| t.elapsed().as_secs_f32() > snap.wait);
    if ready && !snap.requested {
        snap.requested = true;
        use bevy::render::view::screenshot::{save_to_disk, Screenshot};
        commands.spawn(Screenshot::image(snap.image.clone())).observe(save_to_disk(snap.out.clone()));
    }
    // the image is read back from the GPU a few frames later; quit once it is on disk
    if snap.requested && std::path::Path::new(&snap.out).exists() { println!("rendered {}", snap.out); exit.write(AppExit::Success); }
    if snap.started.map_or(false, |t| t.elapsed().as_secs_f32() > snap.wait + 120.0) { eprintln!("gave up waiting for the render"); exit.write(AppExit::error()); }
}
