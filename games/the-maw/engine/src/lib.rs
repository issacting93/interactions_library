//! The Maw's simulation engine. Rust, built to WebAssembly and loaded by the tank as `window.EcoEngine`
//! (shared/engine/ecology/eco-engine.js). It takes over the simulation core one piece at a time, each piece
//! checked against the JavaScript it replaces by replaying a seed on both.
//!
//! - `rng`    the one seeded random stream
//! - `clock`  simulated time in whole quanta
//! - `web`    who eats whom, from bodies
//! - `sense`  creature columns and the neighbour grid
//! - `mover`  the swimmers' movement
//! - `math`   the math both halves must round alike
//! - `ffi`    what the browser calls

pub mod clock;
pub mod ffi;
pub mod math;
pub mod mover;
pub mod rng;
pub mod sense;
pub mod web;
