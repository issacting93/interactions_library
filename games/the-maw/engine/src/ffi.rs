//! What the browser calls. Plain numbers in and out, and pointers into the engine's memory for the columns, so the
//! page reads and writes creature data in place (typed arrays over `memory`) with nothing copied or converted.
//! One engine per page; WebAssembly here is single threaded.

use crate::clock::Clock;
use crate::fear::Fear;
use crate::mover::Tank;
use crate::rng::Rng;
use crate::world::World;
use crate::web::{self, WebRules};
use std::cell::RefCell;

struct Engine {
    rng: Rng,
    clocks: Vec<Clock>,
    // boxed, so a world stays where it is while the page is called back mid-pass
    worlds: Vec<Box<World>>,
    fears: Vec<Box<Fear>>,
}

thread_local! {
    static ENGINE: RefCell<Engine> = RefCell::new(Engine { rng: Rng::new(1), clocks: Vec::new(), worlds: Vec::new(), fears: Vec::new() });
}
fn with<T>(f: impl FnOnce(&mut Engine) -> T) -> T {
    ENGINE.with(|e| f(&mut e.borrow_mut()))
}

/// The engine's version, so the page can tell a stale build: major * 1000 + minor.
#[no_mangle]
pub extern "C" fn eco_version() -> u32 {
    7
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

// ---- the swimmers' world: the creatures' columns, sensed, steered among and moved in place ----
#[no_mangle]
pub extern "C" fn world_new() -> u32 {
    with(|e| {
        e.worlds.push(Box::new(World::new()));
        (e.worlds.len() - 1) as u32
    })
}
/// Room for so many slots; returns the capacity. The columns may move: take their pointers again afterwards.
#[no_mangle]
pub extern "C" fn world_reserve(w: u32, slots: u32) -> u32 {
    with(|e| {
        let w = &mut e.worlds[w as usize];
        w.reserve(slots as usize);
        w.slots() as u32
    })
}
/// Room for so many places in the list and so many solids; returns the list capacity.
#[no_mangle]
pub extern "C" fn world_reserve_list(w: u32, n: u32, solids: u32) -> u32 {
    with(|e| {
        let w = &mut e.worlds[w as usize];
        w.reserve_list(n as usize, solids as usize);
        w.ord.len() as u32
    })
}
#[no_mangle]
pub extern "C" fn world_solids_cap(w: u32) -> u32 {
    with(|e| (e.worlds[w as usize].solids.len() / crate::mover::SOLID) as u32)
}
/// Room for so many behaviours and vortices. The tables may move: take their pointers again afterwards.
#[no_mangle]
pub extern "C" fn world_reserve_tables(w: u32, behaviours: u32, vortices: u32) {
    with(|e| e.worlds[w as usize].reserve_tables(behaviours as usize, vortices as usize));
}
/// Room in each table, as [behaviours, vortices] packed: behaviours * 65536 + vortices.
#[no_mangle]
pub extern "C" fn world_tables_cap(w: u32) -> u32 {
    with(|e| {
        let w = &e.worlds[w as usize];
        let v = if w.n_species == 0 { w.vort.len() / crate::world::VORT } else { (w.vort.len() / crate::world::VORT).min(w.vort_sp.len() / w.n_species) };
        ((w.beh.len() / crate::world::BEH) as u32) * 65536 + v as u32
    })
}
#[no_mangle]
pub extern "C" fn world_set_species(w: u32, n: u32) {
    with(|e| e.worlds[w as usize].set_species(n as usize));
}
/// Sense the first n places. 1 if the grid was built, 0 if the page must fall back to its own.
#[no_mangle]
pub extern "C" fn world_sense(w: u32, n: u32, cell: f64, density: u32) -> u32 {
    with(|e| u32::from(e.worlds[w as usize].sense(n as usize, cell, density != 0)))
}
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn world_move(w: u32, movers: u32, solids: u32, dt: f64, max_sp: f64, max_f: f64, personal: u32, size: f64, speed: f64, bank: f64, flex: f64, depth: f64) {
    let t = Tank { max_sp, max_f, personal: personal != 0, size, speed, bank, flex, depth };
    with(|e| e.worlds[w as usize].step_move(movers as usize, solids as usize, dt, &t));
}
macro_rules! world_ptr {
    ($name:ident, $($field:ident).+, $t:ty) => {
        #[no_mangle]
        pub extern "C" fn $name(w: u32) -> *const $t {
            with(|e| e.worlds[w as usize].$($field).+.as_ptr())
        }
    };
}
world_ptr!(world_data, f, f64);
world_ptr!(world_sp, sp, i32);
world_ptr!(world_skip, skip, u8);
world_ptr!(world_chain, chain, f32);
world_ptr!(world_cz, cz, f32);
world_ptr!(world_croll, croll, f32);
world_ptr!(world_species, species, f64);
world_ptr!(world_ord, ord, u32);
world_ptr!(world_out, out, f64);
world_ptr!(world_movers, movers, f64);
world_ptr!(world_solids, solids, f64);
world_ptr!(world_density, grid.density, f32);
world_ptr!(world_beh, beh, f64);
world_ptr!(world_vort, vort, f64);
world_ptr!(world_vort_sp, vort_sp, u8);
world_ptr!(world_io, io, f64);
world_ptr!(world_order, grid.order, u32);
world_ptr!(world_starts, grid.starts, u32);
#[no_mangle]
pub extern "C" fn world_gx0(w: u32) -> i32 {
    with(|e| e.worlds[w as usize].grid.gx0)
}
#[no_mangle]
pub extern "C" fn world_gy0(w: u32) -> i32 {
    with(|e| e.worlds[w as usize].grid.gy0)
}
#[no_mangle]
pub extern "C" fn world_cols(w: u32) -> u32 {
    with(|e| e.worlds[w as usize].grid.cols)
}
#[no_mangle]
pub extern "C" fn world_rows(w: u32) -> u32 {
    with(|e| e.worlds[w as usize].grid.rows)
}

// What steering asks of the page, beyond a bite (below) and fear (in "fear"): see world.rs `Host`.
#[cfg(target_arch = "wasm32")]
mod steer_host {
    #[link(wasm_import_module = "steer")]
    extern "C" {
        pub fn fear_prep();
        pub fn hunt(run: u32);
        pub fn host_block();
        pub fn lurers();
        pub fn dirty();
    }
}
#[cfg(not(target_arch = "wasm32"))]
mod steer_host {
    pub unsafe fn fear_prep() {}
    pub unsafe fn hunt(_: u32) {}
    pub unsafe fn host_block() {}
    pub unsafe fn lurers() {}
    pub unsafe fn dirty() {}
}

// What a bite needs of the page: is the creature at place j food for the one at place i, and do the biting (returns
// whether i now bites anything in reach). The page may call back into the engine and change any creature while it answers.
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
/// The neighbour pass of steering for the creature at place i: fills the world's `out`. Flags: 1 personal, 2 can bite,
/// 4 bites anything in reach, 8 swims in a train.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn world_neighbours(w: u32, i: u32, flags: u32, r: f64, body_px: f64, dz: f64, size: f64, reach: f64, bite_tol: f64, sep_mul: f64, bl: f64, sp0: f64) {
    use crate::world::{neighbours, Nb};
    // the engine is not held while this runs: the page's answers come back in through the other calls here
    let this: *mut World = with(|e| &mut *e.worlds[w as usize] as *mut World);
    let p = Nb { r, body_px, dz, size, personal: flags & 1 != 0, can_bite: flags & 2 != 0, reach, bite_tol, bite_any: flags & 4 != 0, sep_mul, train: flags & 8 != 0, bl, sp0 };
    unsafe {
        if (i as usize) < (*this).ord.len() {
            neighbours(this, i as usize, &p, |a, b| host::edible(a as u32, b as u32) != 0, |a, b| host::bite(a as u32, b as u32) != 0);
        }
    }
}

// ---- fear: which hunters could matter to a creature ----
#[no_mangle]
pub extern "C" fn fear_new() -> u32 {
    with(|e| {
        e.fears.push(Box::new(Fear::new()));
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
fear_ptr!(fear_sp, sp, i32);
fear_ptr!(fear_hl, hl, f64);
fear_ptr!(fear_sting, sting, f64);
fear_ptr!(fear_lure, lure, f64);
fear_ptr!(fear_ang, ang, f64);
fear_ptr!(fear_dash_t, dash_t, f64);
fear_ptr!(fear_alert, alert, f64);
fear_ptr!(fear_cloak, cloak, f64);
fear_ptr!(fear_mimic, mimic, u8);
fear_ptr!(fear_body, body, f64);
fear_ptr!(fear_predators, predators, u8);
fear_ptr!(fear_weighed, weighed, f64);
#[no_mangle]
pub extern "C" fn fear_set_species(f: u32, species: u32) {
    with(|e| e.fears[f as usize].set_species(species as usize));
}

// What weighing a hunter needs of the page: does the creature now steering fear hunter k (the host's food web), and
// does hunter k pass for its kind. The page may call back into the engine while it answers.
#[cfg(target_arch = "wasm32")]
mod fear_host {
    #[link(wasm_import_module = "fear")]
    extern "C" {
        pub fn fears(k: u32) -> u32;
        pub fn mimics(k: u32) -> u32;
    }
}
#[cfg(not(target_arch = "wasm32"))]
mod fear_host {
    pub unsafe fn fears(_: u32) -> u32 {
        0
    }
    pub unsafe fn mimics(_: u32) -> u32 {
        0
    }
}
/// What the hunters near a creature do to its steering: fills `weighed`. Flags: 1 a swimmer walking with its head down,
/// 2 the host has a say on who fears whom.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn fear_weigh(f: u32, x: f64, y: f64, sp: u32, bl: f64, lured: f64, flags: u32, r: f64, max_f: f64, fx: f64, fy: f64) {
    use crate::fear::Prey;
    // the engine is not held while this runs: the page's answer comes back in through the food web's calls here
    let this: *mut Fear = with(|e| &mut *e.fears[f as usize] as *mut Fear);
    let p = Prey { x, y, sp: sp as usize, bl, lured, head_down: flags & 1 != 0, r, max_f, host_fears: flags & 2 != 0 };
    unsafe { (*this).weigh(&p, fx, fy, |k| fear_host::fears(k as u32) != 0, |k| fear_host::mimics(k as u32) != 0) };
}

/// The tank as this step's steering reads it. flags: 1 personal, 2 the whole tank turns about a centre, 4 the pointer
/// matters, 8 it scatters, 16 the host has a say on fear, 32 the host has individuals with lures.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn world_steer_tank(w: u32, flags: u32, dt: f64, body_px: f64, r: f64, max_sp: f64, max_f: f64, wd: f64, ht: f64, margin: f64, align: f64, coh: f64, sep: f64, dz: f64, size: f64, sim_t: f64, vx0: f64, vy0: f64, vradius: f64, swirl: f64, ptr_x: f64, ptr_y: f64, lowland: f64, n_vort: u32, n_solids: u32) {
    use crate::world::SteerTank;
    let t = SteerTank { dt, body_px, r, max_sp, max_f, w: wd, h: ht, margin, personal: flags & 1 != 0, align, coh, sep, dz, size, sim_t, flow_vortex: flags & 2 != 0, vx0, vy0, vradius, swirl, ptr_on: flags & 4 != 0, ptr_x, ptr_y, ptr_scatter: flags & 8 != 0, lowland, host_fears: flags & 16 != 0, has_lurers: flags & 32 != 0, n_vort: n_vort as usize, n_solids: n_solids as usize };
    with(|e| e.worlds[w as usize].tank = t);
}

struct PageHost;
impl crate::world::Host for PageHost {
    fn edible(&mut self, i: usize, j: usize) -> bool {
        unsafe { host::edible(i as u32, j as u32) != 0 }
    }
    fn bite(&mut self, i: usize, j: usize) -> bool {
        unsafe { host::bite(i as u32, j as u32) != 0 }
    }
    fn fears(&mut self, k: usize) -> bool {
        unsafe { fear_host::fears(k as u32) != 0 }
    }
    fn mimics(&mut self, k: usize) -> bool {
        unsafe { fear_host::mimics(k as u32) != 0 }
    }
    fn fear_prep(&mut self) {
        unsafe { steer_host::fear_prep() }
    }
    fn hunt(&mut self, run: bool) {
        unsafe { steer_host::hunt(u32::from(run)) }
    }
    fn host(&mut self) {
        unsafe { steer_host::host_block() }
    }
    fn lurers(&mut self) {
        unsafe { steer_host::lurers() }
    }
    fn dirty(&mut self) {
        unsafe { steer_host::dirty() }
    }
    fn rnd(&mut self) -> f64 {
        with(|e| e.rng.next())
    }
}

/// Steer the creature at place i (world.rs `steer`): what it wants goes to the world's `io`. flags: 1 can bite, 2 bites
/// anything in reach, 4 a hand on it, 8 it keeps to its own business as well, 16 a host's hunter, 32 a host's guest, 64 the
/// host has individuals with lures just now.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn world_steer(w: u32, f: u32, i: u32, bid: u32, flags: u32, reach: f64, bl: f64, sp0: f64, steer_x: f64, steer_y: f64) {
    use crate::world::{steer, Me};
    // the engine is not held while this runs: the page's answers come back in through the other calls here
    let (this, fear) = with(|e| (&mut *e.worlds[w as usize] as *mut World, &mut *e.fears[f as usize] as *mut Fear));
    let me = Me { bid: bid as usize, can_bite: flags & 1 != 0, bite_any: flags & 2 != 0, steer: if flags & 4 != 0 { Some((steer_x, steer_y, flags & 8 != 0)) } else { None }, hunter: flags & 16 != 0, guest: flags & 32 != 0, lurers: flags & 64 != 0, reach, bl, sp0 };
    unsafe {
        let ok = (i as usize) < (*this).ord.len() && (bid as usize + 1) * crate::world::BEH <= (*this).beh.len();
        if ok {
            steer(this, fear, i as usize, &me, &mut PageHost);
        }
    }
}
