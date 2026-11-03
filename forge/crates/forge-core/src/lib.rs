//! Tower Forge core.
//!
//! Recipe ([`Spec`]) → plan ([`TowerPlan`]) → geometry ([`geometry::build`]). No engine, no window,
//! no GPU: the same crate runs inside the desktop app, the command line, tests and (later) the
//! browser through WebAssembly.

pub mod compile;
pub mod geometry;
pub mod metrics;
pub mod plan;
pub mod rng;
pub mod spec;

pub use compile::compile;
pub use metrics::{score, Score, Trait};
pub use plan::{Diagnostic, MatSlot, Motion, Part, Severity, Shape, Socket, TowerPlan};
pub use spec::Spec;

/// The starting towers, shared with the browser Tower Forge.
pub mod presets {
    use crate::spec::Spec;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Entry { name: String, spec: Spec }

    const JSON: &str = include_str!("presets.json");

    /// (key, display name, spec) for every preset, in a stable order.
    pub fn all() -> Vec<(String, String, Spec)> {
        let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(JSON).expect("presets.json is valid");
        map.into_iter().map(|(k, v)| { let e: Entry = serde_json::from_value(v).expect("preset is a valid spec"); (k, e.name, e.spec) }).collect()
    }
    pub fn get(key: &str) -> Option<Spec> { all().into_iter().find(|(k, _, _)| k == key).map(|(_, _, s)| s) }
}
