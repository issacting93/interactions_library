//! What the browser calls. Plain numbers in and out, and pointers into the engine's memory for the columns, so the
//! page reads and writes creature data in place (typed arrays over `memory`) with nothing copied or converted.
//! One engine per page; WebAssembly here is single threaded.

use crate::clock::Clock;
use crate::rng::Rng;
use crate::sense::Sense;
use crate::web::{self, WebRules};
use std::cell::RefCell;

struct Engine {
    rng: Rng,
    clocks: Vec<Clock>,
    senses: Vec<Sense>,
}

thread_local! {
    static ENGINE: RefCell<Engine> = RefCell::new(Engine { rng: Rng::new(1), clocks: Vec::new(), senses: Vec::new() });
}
fn with<T>(f: impl FnOnce(&mut Engine) -> T) -> T {
    ENGINE.with(|e| f(&mut e.borrow_mut()))
}

/// The engine's version, so the page can tell a stale build: major * 1000 + minor.
#[no_mangle]
pub extern "C" fn eco_version() -> u32 {
    1
}

// ---- random ----
#[no_mangle]
pub extern "C" fn rng_seed(seed: u32) {
    with(|e| e.rng = Rng::new(seed));
}
#[no_mangle]
pub extern "C" fn rng_next() -> f64 {
    with(|e| e.rng.next())
}
#[no_mangle]
pub extern "C" fn rng_state() -> u32 {
    with(|e| e.rng.state())
}

// ---- clocks ----
#[no_mangle]
pub extern "C" fn clock_new(quanta: f64, max_q: f64) -> u32 {
    with(|e| {
        e.clocks.push(Clock::new(quanta, max_q));
        (e.clocks.len() - 1) as u32
    })
}
#[no_mangle]
pub extern "C" fn clock_advance(c: u32, wall: f64) -> f64 {
    with(|e| e.clocks[c as usize].advance(wall))
}
#[no_mangle]
pub extern "C" fn clock_fixed(c: u32, n: f64) -> f64 {
    with(|e| e.clocks[c as usize].fixed(n))
}
#[no_mangle]
pub extern "C" fn clock_t(c: u32) -> f64 {
    with(|e| e.clocks[c as usize].t)
}
#[no_mangle]
pub extern "C" fn clock_set_t(c: u32, t: f64) {
    with(|e| e.clocks[c as usize].t = t);
}
#[no_mangle]
pub extern "C" fn clock_steps(c: u32) -> u32 {
    with(|e| e.clocks[c as usize].steps)
}
#[no_mangle]
pub extern "C" fn clock_scale(c: u32) -> f64 {
    with(|e| e.clocks[c as usize].scale)
}
#[no_mangle]
pub extern "C" fn clock_set_scale(c: u32, s: f64) {
    with(|e| e.clocks[c as usize].scale = s);
}

// ---- the food web ----
#[no_mangle]
pub extern "C" fn web_ratio(a_weight: f64, b_weight: f64, b_plate: u32, a_claw: u32, a_jaw: f64, r_plate: f64, r_claw: f64) -> f64 {
    web::ratio_raw(a_weight, b_weight, b_plate != 0, a_claw != 0, a_jaw, &WebRules { band: [0.0, 0.0], plate: r_plate, claw: r_claw })
}
/// 0 food, 1 own kind, 2 too big, 3 too small.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn web_verdict(same_kind: u32, a_weight: f64, b_weight: f64, b_plate: u32, a_claw: u32, a_jaw: f64, a_sieve: u32, b_schools: u32, lo: f64, hi: f64, r_plate: f64, r_claw: f64) -> u32 {
    let r = WebRules { band: [lo, hi], plate: r_plate, claw: r_claw };
    let x = web::ratio_raw(a_weight, b_weight, b_plate != 0, a_claw != 0, a_jaw, &r);
    web::verdict_raw(same_kind != 0, x, a_sieve != 0, b_schools != 0, &r) as u32
}

// ---- sense: the columns and the grid ----
#[no_mangle]
pub extern "C" fn sense_new() -> u32 {
    with(|e| {
        e.senses.push(Sense::new());
        (e.senses.len() - 1) as u32
    })
}
/// Room for n creatures; returns the capacity. The columns may move: take their pointers again afterwards.
#[no_mangle]
pub extern "C" fn sense_reserve(s: u32, n: u32) -> u32 {
    with(|e| {
        let s = &mut e.senses[s as usize];
        s.reserve(n as usize);
        s.capacity() as u32
    })
}
/// Build the grid over the first n creatures, and count density if asked. 1 if built, 0 if the caller must fall back.
#[no_mangle]
pub extern "C" fn sense_build(s: u32, n: u32, cell: f64, density: u32) -> u32 {
    with(|e| {
        let s = &mut e.senses[s as usize];
        if !s.build(n as usize, cell) {
            return 0;
        }
        if density != 0 {
            s.count_density();
        }
        1
    })
}
macro_rules! sense_ptr {
    ($name:ident, $field:ident, $t:ty) => {
        #[no_mangle]
        pub extern "C" fn $name(s: u32) -> *const $t {
            with(|e| e.senses[s as usize].$field.as_ptr())
        }
    };
}
sense_ptr!(sense_x, x, f64);
sense_ptr!(sense_y, y, f64);
sense_ptr!(sense_sp, sp, i32);
sense_ptr!(sense_skip, skip, u8);
sense_ptr!(sense_density, density, f32);
sense_ptr!(sense_order, order, u32);
sense_ptr!(sense_starts, starts, u32);
#[no_mangle]
pub extern "C" fn sense_gx0(s: u32) -> i32 {
    with(|e| e.senses[s as usize].gx0)
}
#[no_mangle]
pub extern "C" fn sense_gy0(s: u32) -> i32 {
    with(|e| e.senses[s as usize].gy0)
}
#[no_mangle]
pub extern "C" fn sense_cols(s: u32) -> u32 {
    with(|e| e.senses[s as usize].cols)
}
#[no_mangle]
pub extern "C" fn sense_rows(s: u32) -> u32 {
    with(|e| e.senses[s as usize].rows)
}
