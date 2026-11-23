//! The Maw's simulation engine. Rust, built to WebAssembly and loaded by the tank as `window.EcoEngine`
//! (shared/engine/ecology/eco-engine.js). It takes over the simulation core one piece at a time, each piece
//! checked against the JavaScript it replaces by replaying a seed on both.
//!
//! - `rng`    the one seeded random stream
//! - `clock`  simulated time in whole quanta
//! - `web`    who eats whom, from bodies
//! - `eat`    who is food and who is feared, from the diet's rules as data
//! - `world`  the swimmers' world: every creature's numbers in columns, sensed, steered among and moved in place
//! - `sense`  the neighbour grid
//! - `fear`   which hunters could matter to a creature
//! - `mover`  the swimmers' movement
//! - `math`   the math both halves must round alike
//! - `body`   the walking body's physics: one substep of a creature body's chunks
//! - `ffi`    what the browser calls

// Lints the engine keeps on purpose (`cargo clippy -- -D warnings` runs in CI with these allowed):
// - comparisons like `!(x >= 0.0)` are JavaScript's way of letting NaN through: rewriting them changes what NaN does
// - the hand-written clamps and checked divisions follow the JavaScript they mirror operation for operation (NaN, order of operations)
// - worlds and fears are boxed so their addresses stay put while the page is called back mid-pass
// - the raw-pointer passes are `unsafe` for one reason, said where they are defined: no reference to a world is held across a call to the page
// - `Rng::next` is the generator's own step, not an iterator; index loops walk several arrays by the same index
// - a value declared first and set in each branch (`let want; if .. { want = .. }`) keeps the JavaScript's shape
// - CI pins the Rust version (.github/workflows/checks.yml): a new release's lints are taken on purpose, not by surprise
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::manual_clamp, clippy::manual_checked_ops, clippy::vec_box, clippy::missing_safety_doc, clippy::should_implement_trait, clippy::needless_range_loop, clippy::needless_late_init)]

pub mod body;
pub mod clock;
pub mod eat;
pub mod fear;
pub mod ffi;
pub mod math;
pub mod mover;
pub mod rng;
pub mod sense;
pub mod web;
pub mod world;

// the walking body's surface (surface.js as data)
pub mod surface;
