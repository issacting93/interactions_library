//! `forge`: build towers and atlases without a window.
//!
//!   forge presets
//!   forge build <preset | spec.json> [-o tower.glb] [--time 0]
//!   forge plan  <preset | spec.json>
//!   forge atlas [--from preset|spec.json] [--x height] [--y ornament] [--n 8] [--iters 5000] [--seed 1] [-o atlas.json] [--glb-dir dir]

use std::{env, fs, process::exit, time::Instant};

use forge_core::{compile, presets, score, Spec, Trait};
use forge_search::Atlas;

fn load(arg: &str) -> Spec {
    if let Some(s) = presets::get(arg) { return s; }
    let text = fs::read_to_string(arg).unwrap_or_else(|e| { eprintln!("cannot read {arg}: {e}"); exit(1) });
    if arg.ends_with(".glb") { return forge_gltf::spec_from_glb(text.as_bytes()).unwrap_or_else(|| { eprintln!("{arg} has no Tower Forge recipe"); exit(1) }); }
    Spec::from_text(&text).unwrap_or_else(|e| { eprintln!("{arg}: {e}"); exit(1) })
}
fn flag(args: &[String], name: &str) -> Option<String> { args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned()) }
fn trait_named(s: &str) -> Trait {
    Trait::ALL.into_iter().find(|t| format!("{t:?}").to_lowercase() == s.to_lowercase() || t.label().to_lowercase().starts_with(&s.to_lowercase()))
        .unwrap_or_else(|| { eprintln!("unknown trait {s}; try one of {:?}", Trait::ALL); exit(1) })
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("presets") => { for (k, name, s) in presets::all() { println!("{k:12} {name:40} {:>5.1} m", s.tower_height() + s.crown.h); } }
        Some("build") => {
            let spec = load(args.get(1).map(String::as_str).unwrap_or("monolith"));
            let out = flag(&args, "-o").unwrap_or_else(|| "tower.glb".into());
            let t: f32 = flag(&args, "--time").and_then(|v| v.parse().ok()).unwrap_or(0.0);
            let t0 = Instant::now();
            let plan = compile(&spec);
            let bytes = forge_gltf::export_glb(&spec, &plan, t);
            fs::write(&out, &bytes).unwrap_or_else(|e| { eprintln!("cannot write {out}: {e}"); exit(1) });
            println!("{out}: {} parts, {} copies, {} sockets, {:.1} KB in {:.1} ms", plan.parts.len(), plan.instance_count(), plan.sockets.len(), bytes.len() as f32 / 1024.0, t0.elapsed().as_secs_f32() * 1000.0);
            for d in &plan.diagnostics { println!("  {:?}: {}", d.severity, d.message); }
        }
        Some("plan") => {
            let spec = load(args.get(1).map(String::as_str).unwrap_or("monolith"));
            let plan = compile(&spec);
            let s = score(&spec, Some(&plan));
            println!("height {:.1} m · top {:.1} m · reach {:.1} m · {} parts · {} copies", plan.measures.h, plan.measures.top, plan.measures.reach, plan.parts.len(), plan.instance_count());
            println!("coherence {:.2} (stability {:.2}, joints {:.2}, proportion {:.2})", s.coherence, s.stability, s.joints, s.proportion);
            for t in Trait::ALL { println!("  {:22} {:.2}", t.label(), t.of(&spec)); }
            println!("sockets:"); for k in &plan.sockets { println!("  {:12} {:?} {:?} → {}", k.id, k.kind, k.rule, k.connected_to.as_deref().unwrap_or("open")); }
            for d in plan.diagnostics.iter().chain(s.notes.iter().map(|n| Box::leak(Box::new(forge_core::Diagnostic { severity: forge_core::Severity::Note, message: n.clone() })) as &_)) { println!("{:?}: {}", d.severity, d.message); }
            println!("fingerprint {:016x}", plan.fingerprint());
        }
        Some("atlas") => {
            let from = flag(&args, "--from").map(|f| load(&f)).unwrap_or_else(|| presets::get("monolith").unwrap());
            let x = trait_named(&flag(&args, "--x").unwrap_or("height".into())); let y = trait_named(&flag(&args, "--y").unwrap_or("ornament".into()));
            let n: usize = flag(&args, "--n").and_then(|v| v.parse().ok()).unwrap_or(8);
            let iters: usize = flag(&args, "--iters").and_then(|v| v.parse().ok()).unwrap_or(5000);
            let seed: u64 = flag(&args, "--seed").and_then(|v| v.parse().ok()).unwrap_or(1);
            let mut a = Atlas::new(x, y, n, seed, from);
            let t0 = Instant::now();
            a.seed();
            let mut done = 0;
            while done < iters { let k = (iters - done).min(500); a.step(k); done += k; println!("{:6} tried · {:3.0}% coverage · QD {:6.1} · best {:.2}", a.tried, a.coverage() * 100.0, a.qd_score(), a.best()); }
            println!("{} towers in {:.2} s ({:.0} per second)", a.tried, t0.elapsed().as_secs_f32(), a.tried as f32 / t0.elapsed().as_secs_f32());
            if let Some(out) = flag(&args, "-o") {
                let cells: Vec<_> = a.cells.iter().map(|(k, e)| serde_json::json!({"cell": [k.0, k.1], "fitness": e.fitness, "x": e.x, "y": e.y, "spec": e.spec})).collect();
                fs::write(&out, serde_json::to_string_pretty(&serde_json::json!({"x": format!("{:?}", a.x), "y": format!("{:?}", a.y), "n": a.n, "cells": cells})).unwrap()).unwrap();
                println!("wrote {out}");
            }
            if let Some(dir) = flag(&args, "--glb-dir") {
                fs::create_dir_all(&dir).ok();
                for (k, e) in &a.cells { fs::write(format!("{dir}/cell_{}_{}.glb", k.0, k.1), forge_gltf::export_glb(&e.spec, &compile(&e.spec), 0.0)).ok(); }
                println!("wrote {} towers to {dir}", a.cells.len());
            }
        }
        _ => {
            println!("forge: Tower Forge on the command line\n\n  forge presets\n  forge build <preset|spec.json> [-o tower.glb] [--time 0]\n  forge plan  <preset|spec.json>\n  forge atlas [--from preset|spec.json] [--x height] [--y ornament] [--n 8] [--iters 5000] [--seed 1] [-o atlas.json] [--glb-dir dir]\n\nTraits: height, slenderness, ornament, aura, habitat, tiers, symmetry, silhouette");
        }
    }
}
