use forge_core::{compile, geometry, metrics, presets, score, Severity, Spec, Trait};

#[test]
fn every_preset_compiles_cleanly() {
    let all = presets::all();
    assert_eq!(all.len(), 12, "the twelve browser presets");
    for (key, name, spec) in &all {
        let plan = compile(spec);
        let problems: Vec<_> = plan.problems().map(|d| d.message.clone()).collect();
        assert!(problems.is_empty(), "{key}: {problems:?}");
        assert!(plan.parts.len() > 3, "{key} has parts");
        assert!(plan.measures.top > plan.measures.h * 0.5, "{key} has a top");
        // every required socket is connected
        assert!(plan.sockets.iter().filter(|s| s.rule == forge_core::plan::SocketRule::MustConnect).all(|s| s.connected_to.is_some()), "{key} sockets");
        let built = geometry::build(&plan, 0.0);
        let tris: usize = built.iter().map(|p| p.mesh.triangle_count() * p.transforms.len()).sum();
        assert!(tris > 500, "{key} ({name}) has {tris} triangles");
        for p in &built {
            assert!(p.mesh.positions.iter().flatten().all(|v| v.is_finite()), "{key}: {} has non-finite positions", p.part.tag);
            assert!(p.mesh.indices.iter().all(|&i| (i as usize) < p.mesh.positions.len()), "{key}: {} indices in range", p.part.tag);
        }
        let s = score(spec, Some(&plan));
        assert!(s.coherence > 0.5, "{key} coherence {}", s.coherence);
        println!("{key:12} parts {:3} copies {:5} tris {:7} coherence {:.2} stability {:.2} joints {:.2}", plan.parts.len(), plan.instance_count(), tris, s.coherence, s.stability, s.joints);
    }
}

#[test]
fn same_spec_same_plan() {
    for (key, _, spec) in presets::all() {
        assert_eq!(compile(&spec).fingerprint(), compile(&spec).fingerprint(), "{key} is deterministic");
    }
    let a = presets::get("monolith").unwrap();
    let mut b = a.clone(); b.seed += 1;
    assert_ne!(compile(&a).fingerprint(), compile(&b).fingerprint(), "the seed matters");
}

#[test]
fn json_round_trip_and_code_dialog_text() {
    let spec = presets::get("pilgrim").unwrap();
    let text = format!("// Tower Forge spec\nconst tower = {};\n", spec.to_json());
    let back = Spec::from_text(&text).unwrap();
    assert_eq!(compile(&spec).fingerprint(), compile(&back).fingerprint());
    // a minimal spec fills in defaults
    let tiny = Spec::from_text(r#"{"tiers":[{"h":10,"r0":3,"r1":2}]}"#).unwrap();
    assert_eq!(tiny.tiers[0].sides, 0);
    assert!(compile(&tiny).problems().next().is_none());
}

#[test]
fn lean_shears_the_body_and_lowers_stability() {
    let mut s = presets::get("watchtower").unwrap();
    let upright = score(&s, None).stability;
    s.foot.lean = 12.0;
    let plan = compile(&s);
    assert!(plan.parts.iter().any(|p| p.body && p.sheared()), "body parts carry the shear");
    assert!(score(&s, None).stability < upright);
}

#[test]
fn broken_joint_is_reported() {
    let mut s = presets::get("minaret").unwrap();
    s.tiers[1].r0 = s.tiers[0].r1 * 3.0;
    let plan = compile(&s);
    assert!(plan.diagnostics.iter().any(|d| d.severity == Severity::Warning && d.message.contains("wider")));
    assert!(score(&s, Some(&plan)).joints < score(&presets::get("minaret").unwrap(), None).joints);
}

#[test]
fn traits_cover_their_ranges() {
    for t in Trait::ALL {
        let vals: Vec<f32> = presets::all().iter().map(|(_, _, s)| t.of(s)).collect();
        let (lo, hi) = t.range();
        assert!(vals.iter().any(|v| *v >= lo && *v <= hi), "{t:?} lands in range");
    }
    let f = metrics::features(&presets::get("divine").unwrap());
    assert!(f.iter().all(|v| v.is_finite()));
}
