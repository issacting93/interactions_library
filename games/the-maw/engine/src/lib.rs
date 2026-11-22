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
