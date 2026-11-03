//! Plan → binary glTF (.glb) for Blender and other tools.
//!
//! - Each part becomes one mesh; each copy becomes a node that reuses it, so repeated pieces
//!   stay instances in Blender.
//! - Parts with a lean (shear) are baked, because glTF node matrices cannot shear.
//! - Every node carries `extras` with its kit tag; every socket becomes an empty node named
//!   `socket:<id>` with its type, direction, rule and partner, so the plan survives the round trip.
//! - The recipe itself rides in the scene's extras, so a .glb can be reopened as an editable tower.

use forge_core::geometry::{part_transforms, shape_mesh, MeshData};
use forge_core::plan::{MatSlot, TowerPlan};
use forge_core::spec::{hex_rgb, Spec};
use glam::Mat4;
use serde_json::{json, Value};

fn srgb_to_linear(c: f32) -> f32 { if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) } }
fn lin(hex: &str) -> [f32; 3] { let c = hex_rgb(hex); [srgb_to_linear(c[0]), srgb_to_linear(c[1]), srgb_to_linear(c[2])] }

/// Material colours for a look, as linear RGB plus roughness, metalness and emission.
pub fn material_values(spec: &Spec, slot: MatSlot) -> ([f32; 3], f32, f32, [f32; 3]) {
    let l = &spec.look;
    let sky = forge_core::spec::sky(&l.sky);
    match slot {
        MatSlot::Body => (lin(&l.body), 0.9, 0.0, [0.0; 3]),
        MatSlot::Dark => (lin(&l.dark), 0.95, 0.0, [0.0; 3]),
        MatSlot::Accent => (lin(&l.accent), 0.35, 0.65, [0.0; 3]),
        MatSlot::Glow => (lin(&l.glow), 1.0, 0.0, lin(&l.glow)),
        MatSlot::Cloth => (lin(&l.cloth), 0.95, 0.0, [0.0; 3]),
        MatSlot::Sand => { let g = lin(sky.ground); let b = lin(&l.body); ([g[0] * 0.65 + b[0] * 0.35, g[1] * 0.65 + b[1] * 0.35, g[2] * 0.65 + b[2] * 0.35], 1.0, 0.0, [0.0; 3]) }
        MatSlot::Rock => { let d = lin(&l.dark); ([d[0] * 1.1, d[1] * 1.1, d[2] * 1.1], 0.95, 0.0, [0.0; 3]) }
        MatSlot::Void => ([0.02, 0.015, 0.012], 1.0, 0.0, [0.0; 3]),
    }
}
pub const SLOTS: [MatSlot; 8] = [MatSlot::Body, MatSlot::Dark, MatSlot::Accent, MatSlot::Glow, MatSlot::Cloth, MatSlot::Sand, MatSlot::Rock, MatSlot::Void];
fn slot_name(s: MatSlot) -> &'static str { match s { MatSlot::Body => "body", MatSlot::Dark => "dark", MatSlot::Accent => "accent", MatSlot::Glow => "glow", MatSlot::Cloth => "cloth", MatSlot::Sand => "sand", MatSlot::Rock => "rock", MatSlot::Void => "opening" } }

struct Writer { bin: Vec<u8>, views: Vec<Value>, accessors: Vec<Value> }
impl Writer {
    fn align(&mut self) { while self.bin.len() % 4 != 0 { self.bin.push(0); } }
    fn view(&mut self, bytes: &[u8], target: u32) -> usize {
        self.align(); let off = self.bin.len(); self.bin.extend_from_slice(bytes);
        self.views.push(json!({"buffer": 0, "byteOffset": off, "byteLength": bytes.len(), "target": target})); self.views.len() - 1
    }
    fn vec3(&mut self, data: &[[f32; 3]], minmax: bool) -> usize {
        let bytes: Vec<u8> = data.iter().flatten().flat_map(|v| v.to_le_bytes()).collect();
        let v = self.view(&bytes, 34962);
        let mut acc = json!({"bufferView": v, "componentType": 5126, "count": data.len(), "type": "VEC3"});
        if minmax {
            let mut lo = [f32::MAX; 3]; let mut hi = [f32::MIN; 3];
            for p in data { for i in 0..3 { lo[i] = lo[i].min(p[i]); hi[i] = hi[i].max(p[i]); } }
            acc["min"] = json!(lo); acc["max"] = json!(hi);
        }
        self.accessors.push(acc); self.accessors.len() - 1
    }
    fn vec4(&mut self, data: &[[f32; 4]]) -> usize {
        let bytes: Vec<u8> = data.iter().flatten().flat_map(|v| v.to_le_bytes()).collect();
        let v = self.view(&bytes, 34962);
        self.accessors.push(json!({"bufferView": v, "componentType": 5126, "count": data.len(), "type": "VEC4"})); self.accessors.len() - 1
    }
    fn indices(&mut self, idx: &[u32]) -> usize {
        let bytes: Vec<u8> = idx.iter().flat_map(|v| v.to_le_bytes()).collect();
        let v = self.view(&bytes, 34963);
        self.accessors.push(json!({"bufferView": v, "componentType": 5125, "count": idx.len(), "type": "SCALAR"})); self.accessors.len() - 1
    }
    fn mesh(&mut self, name: &str, m: &MeshData, material: usize) -> Value {
        let pos = self.vec3(&m.positions, true); let nor = self.vec3(&m.normals, false);
        let mut attrs = json!({"POSITION": pos, "NORMAL": nor});
        if m.colors.iter().any(|c| c[0] < 0.999) { attrs["COLOR_0"] = json!(self.vec4(&m.colors)); }
        let ind = self.indices(&m.indices);
        json!({"name": name, "primitives": [{"attributes": attrs, "indices": ind, "material": material}]})
    }
}

/// Export the plan at time `t` (motion frozen) as a .glb byte buffer.
pub fn export_glb(spec: &Spec, plan: &TowerPlan, t: f32) -> Vec<u8> {
    let mut w = Writer { bin: vec![], views: vec![], accessors: vec![] };
    let materials: Vec<Value> = SLOTS.iter().map(|&s| {
        let (c, rough, metal, em) = material_values(spec, s);
        let mut m = json!({"name": slot_name(s), "pbrMetallicRoughness": {"baseColorFactor": [c[0], c[1], c[2], 1.0], "roughnessFactor": rough, "metallicFactor": metal}, "doubleSided": true});
        if em.iter().any(|v| *v > 0.0) { m["emissiveFactor"] = json!(em); m["extensions"] = json!({"KHR_materials_emissive_strength": {"emissiveStrength": 3.0}}); }
        m
    }).collect();
    let mat_index = |s: MatSlot| SLOTS.iter().position(|x| *x == s).unwrap();
    let (mut meshes, mut nodes, mut children) = (vec![], vec![], vec![]);
    for (pi, part) in plan.parts.iter().enumerate() {
        let local = shape_mesh(&part.shape);
        if local.is_empty() { continue; }
        let transforms = part_transforms(part, t);
        let extras = json!({"tag": part.tag, "part": pi, "material": slot_name(part.mat)});
        let decomposable = |m: &Mat4| { let (s, r, tr) = m.to_scale_rotation_translation(); Mat4::from_scale_rotation_translation(s, r, tr).abs_diff_eq(*m, 1e-3) };
        if transforms.iter().all(decomposable) {
            meshes.push(w.mesh(&format!("{}#{}", part.tag, pi), &local, mat_index(part.mat)));
            let mi = meshes.len() - 1;
            for (k, m) in transforms.iter().enumerate() {
                let (s, r, tr) = m.to_scale_rotation_translation();
                nodes.push(json!({"name": format!("{}.{}", part.tag, k), "mesh": mi, "translation": tr.to_array(), "rotation": r.to_array(), "scale": s.to_array(), "extras": extras}));
                children.push(nodes.len() - 1);
            }
        } else {
            // sheared (leaning) parts are baked into one mesh
            let mut baked = MeshData::default();
            for m in &transforms { baked.append(&local.transformed(*m)); }
            meshes.push(w.mesh(&format!("{}#{}", part.tag, pi), &baked, mat_index(part.mat)));
            nodes.push(json!({"name": part.tag, "mesh": meshes.len() - 1, "extras": extras}));
            children.push(nodes.len() - 1);
        }
    }
    for s in &plan.sockets {
        nodes.push(json!({"name": format!("socket:{}", s.id), "translation": s.pos, "extras": {
            "socket": {"id": s.id, "type": format!("{:?}", s.kind), "direction": format!("{:?}", s.dir), "rule": format!("{:?}", s.rule),
                       "accepts": s.accepts.iter().map(|a| format!("{:?}", a)).collect::<Vec<_>>(), "radius": s.radius, "connected_to": s.connected_to}}}));
        children.push(nodes.len() - 1);
    }
    nodes.push(json!({"name": "tower", "children": children}));
    let root = nodes.len() - 1;
    let doc = json!({
        "asset": {"version": "2.0", "generator": "Tower Forge (forge-gltf)"},
        "extensionsUsed": ["KHR_materials_emissive_strength"],
        "scene": 0,
        "scenes": [{"name": "Tower", "nodes": [root], "extras": {"forge": {"spec": spec, "diagnostics": plan.diagnostics.iter().map(|d| &d.message).collect::<Vec<_>>()}}}],
        "nodes": nodes, "meshes": meshes, "materials": materials,
        "accessors": w.accessors, "bufferViews": w.views,
        "buffers": [{"byteLength": w.bin.len()}],
    });
    let mut json_bytes = serde_json::to_vec(&doc).unwrap();
    while json_bytes.len() % 4 != 0 { json_bytes.push(b' '); }
    w.align();
    let total = 12 + 8 + json_bytes.len() + 8 + w.bin.len();
    let mut out = Vec::with_capacity(total);
    out.extend_from_slice(b"glTF"); out.extend_from_slice(&2u32.to_le_bytes()); out.extend_from_slice(&(total as u32).to_le_bytes());
    out.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes()); out.extend_from_slice(b"JSON"); out.extend_from_slice(&json_bytes);
    out.extend_from_slice(&(w.bin.len() as u32).to_le_bytes()); out.extend_from_slice(b"BIN\0"); out.extend_from_slice(&w.bin);
    out
}

/// Read the recipe back out of a .glb written by [`export_glb`].
pub fn spec_from_glb(bytes: &[u8]) -> Option<Spec> {
    if bytes.len() < 20 || &bytes[0..4] != b"glTF" { return None; }
    let len = u32::from_le_bytes(bytes[12..16].try_into().ok()?) as usize;
    let doc: Value = serde_json::from_slice(bytes.get(20..20 + len)?).ok()?;
    serde_json::from_value(doc["scenes"][0]["extras"]["forge"]["spec"].clone()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use forge_core::{compile, presets};

    #[test]
    fn glb_is_valid_and_round_trips() {
        for (key, _, spec) in presets::all() {
            let plan = compile(&spec);
            let bytes = export_glb(&spec, &plan, 0.0);
            let g = gltf::Gltf::from_slice(&bytes).unwrap_or_else(|e| panic!("{key}: {e}"));
            let doc = &g.document;
            assert!(doc.meshes().count() > 3, "{key}");
            let sockets = doc.nodes().filter(|n| n.name().map_or(false, |s| s.starts_with("socket:"))).count();
            assert_eq!(sockets, plan.sockets.len(), "{key} sockets");
            assert!(doc.nodes().filter(|n| n.mesh().is_some()).all(|n| n.extras().is_some()), "{key} tags");
            let back = spec_from_glb(&bytes).unwrap();
            assert_eq!(compile(&back).fingerprint(), plan.fingerprint(), "{key} recipe rides along");
        }
    }
}
