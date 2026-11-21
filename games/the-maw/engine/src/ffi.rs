//! What the browser calls. Plain numbers in and out, and pointers into the engine's memory for the columns, so the
//! page reads and writes creature data in place (typed arrays over `memory`) with nothing copied or converted.
//! One engine per page; WebAssembly here is single threaded.

use crate::clock::Clock;
use crate::fear::Fear;
use crate::mover::{Mover, Tank};
use crate::rng::Rng;
use crate::sense::Sense;
use crate::web::{self, WebRules};
use std::cell::RefCell;

struct Engine {
    rng: Rng,
    clocks: Vec<Clock>,
    // boxed, so a sense stays where it is while the page is called back mid-pass
    senses: Vec<Box<Sense>>,
    movers: Vec<Mover>,
    fears: Vec<Fear>,
}

thread_local! {
    static ENGINE: RefCell<Engine> = RefCell::new(Engine { rng: Rng::new(1), clocks: Vec::new(), senses: Vec::new(), movers: Vec::new(), fears: Vec::new() });
}
fn with<T>(f: impl FnOnce(&mut Engine) -> T) -> T {
    ENGINE.with(|e| f(&mut e.borrow_mut()))
}

/// The engine's version, so the page can tell a stale build: major * 1000 + minor.
#[no_mangle]
pub extern "C" fn eco_version() -> u32 {
    4
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
        e.senses.push(Box::new(Sense::new()));
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
sense_ptr!(sense_z, z, f64);
sense_ptr!(sense_vx, vx, f64);
sense_ptr!(sense_vy, vy, f64);
sense_ptr!(sense_sepw, sepw, f64);
sense_ptr!(sense_blen, blen, f64);
sense_ptr!(sense_alarm, alarm, f64);
sense_ptr!(sense_flee_x, flee_x, f64);
sense_ptr!(sense_flee_y, flee_y, f64);
sense_ptr!(sense_mid_x, mid_x, f64);
sense_ptr!(sense_mid_y, mid_y, f64);
sense_ptr!(sense_pred, pred, u8);
sense_ptr!(sense_out, out, f64);

// What a bite needs of the page: is creature j food for creature i, and do the biting (returns whether i now bites
// anything in reach). The page may call back into the engine and change any column while it answers.
#[cfg(target_arch = "wasm32")]
mod host {
    #[link(wasm_import_module = "steer")]
    extern "C" {
        pub fn edible(i: u32, j: u32) -> u32;
        pub fn bite(i: u32, j: u32) -> u32;
    }
}
#[cfg(not(target_arch = "wasm32"))]
mod host {
    pub unsafe fn edible(_: u32, _: u32) -> u32 {
        0
    }
    pub unsafe fn bite(_: u32, _: u32) -> u32 {
        0
    }
}
/// The neighbour pass of steering for creature i: fills the sense's `out`. Flags: 1 personal, 2 can bite, 4 bites
/// anything in reach, 8 swims in a train.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn sense_neighbours(s: u32, i: u32, flags: u32, r: f64, body_px: f64, dz: f64, reach: f64, bite_tol: f64, sep_mul: f64, bl: f64, sp0: f64) {
    use crate::sense::{neighbours, Nb};
    // the engine is not held while this runs: the page's answers come back in through the other calls here
    let this: *mut Sense = with(|e| &mut *e.senses[s as usize] as *mut Sense);
    let p = Nb { r, body_px, dz, personal: flags & 1 != 0, can_bite: flags & 2 != 0, reach, bite_tol, bite_any: flags & 4 != 0, sep_mul, train: flags & 8 != 0, bl, sp0 };
    unsafe {
        if (i as usize) < (*this).capacity() {
            neighbours(this, i as usize, &p, |a, b| host::edible(a as u32, b as u32) != 0, |a, b| host::bite(a as u32, b as u32) != 0);
        }
    }
}
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

// ---- move: the swimmers' movement ----
#[no_mangle]
pub extern "C" fn mover_new() -> u32 {
    with(|e| {
        e.movers.push(Mover::new());
        (e.movers.len() - 1) as u32
    })
}
/// Room for n creatures and so many solids; returns the creature capacity. The arrays may move: take their pointers again.
#[no_mangle]
pub extern "C" fn mover_reserve(m: u32, n: u32, solids: u32) -> u32 {
    with(|e| {
        let m = &mut e.movers[m as usize];
        m.reserve(n as usize);
        m.reserve_solids(solids as usize);
        m.capacity() as u32
    })
}
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn mover_step(m: u32, n: u32, solids: u32, dt: f64, max_sp: f64, max_f: f64, personal: u32, size: f64, speed: f64, bank: f64, flex: f64, depth: f64) {
    let t = Tank { max_sp, max_f, personal: personal != 0, size, speed, bank, flex, depth };
    with(|e| e.movers[m as usize].step(n as usize, solids as usize, dt, &t));
}
macro_rules! mover_ptr {
    ($name:ident, $field:ident, $t:ty) => {
        #[no_mangle]
        pub extern "C" fn $name(m: u32) -> *const $t {
            with(|e| e.movers[m as usize].$field.as_ptr())
        }
    };
}
mover_ptr!(mover_rows, rows, f64);
mover_ptr!(mover_chain, chain, f32);
mover_ptr!(mover_cz, cz, f32);
mover_ptr!(mover_croll, croll, f32);
mover_ptr!(mover_solids, solids, f64);
#[no_mangle]
pub extern "C" fn mover_solids_cap(m: u32) -> u32 {
    with(|e| (e.movers[m as usize].solids.len() / crate::mover::SOLID) as u32)
}

// ---- fear: which hunters could matter to a creature ----
#[no_mangle]
pub extern "C" fn fear_new() -> u32 {
    with(|e| {
        e.fears.push(Fear::new());
        (e.fears.len() - 1) as u32
    })
}
/// Room for n hunters; returns the capacity. The arrays may move: take their pointers again afterwards.
#[no_mangle]
pub extern "C" fn fear_reserve(f: u32, n: u32) -> u32 {
    with(|e| {
        let f = &mut e.fears[f as usize];
        f.reserve(n as usize);
        f.capacity() as u32
    })
}
#[no_mangle]
pub extern "C" fn fear_build(f: u32, n: u32, r3: f64) {
    with(|e| e.fears[f as usize].build(n as usize, r3));
}
/// The hunters that could matter to a creature, in rising order, into `out`: returns how many.
#[no_mangle]
pub extern "C" fn fear_query(f: u32, x: f64, y: f64, bl: f64, lured: f64) -> u32 {
    with(|e| e.fears[f as usize].query(x, y, bl, lured) as u32)
}
macro_rules! fear_ptr {
    ($name:ident, $field:ident, $t:ty) => {
        #[no_mangle]
        pub extern "C" fn $name(f: u32) -> *const $t {
            with(|e| e.fears[f as usize].$field.as_ptr())
        }
    };
}
fear_ptr!(fear_x, x, f64);
fear_ptr!(fear_y, y, f64);
fear_ptr!(fear_kind, kind, u8);
fear_ptr!(fear_a, a, f64);
fear_ptr!(fear_b, b, f64);
fear_ptr!(fear_out, out, u32);
