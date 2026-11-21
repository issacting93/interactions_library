//! The swimmers' world: every creature's numbers live here, one column per field, one row (a slot) per creature.
//! The page's creature objects read and write these columns directly, so nothing is copied in or out: sensing,
//! the neighbour pass of steering and movement all work on them in place.
//!
//! A creature keeps its slot for as long as it lives. The page's list of creatures is in its own order (it is sorted
//! for drawing, added to and cut from), so each step the page says which slot stands at each place in its list
//! (`ord`); the grid and the passes number creatures by place, as the page does, and look their slot up here.

use crate::fear::{Fear, Prey};
use crate::math::{atan2, cos, hypot, max, min, or, pow, sin, smooth};
use crate::mover::{self, move_one, Tank, K};
use crate::sense::Sense;

// the columns of `f`, by name
pub const X: usize = 0;
pub const Y: usize = 1;
pub const Z: usize = 2;
pub const VX: usize = 3;
pub const VY: usize = 4;
pub const ANG: usize = 5;
pub const SCALE: usize = 6;
pub const DEPTH: usize = 7;
pub const FADE: usize = 8;
pub const PHASE: usize = 9;
pub const ALARM: usize = 10;
pub const FLEE_X: usize = 11;
pub const FLEE_Y: usize = 12;
pub const DASH_T: usize = 13;
pub const SPIN_T: usize = 14;
pub const TURN_S: usize = 15;
pub const TUCK: usize = 16;
pub const PUFF: usize = 17;
pub const ALERT: usize = 18;
pub const CLOAK: usize = 19;
pub const GLIDE: usize = 20;
pub const FLAP: usize = 21;
pub const GROUND: usize = 22;
// what steering keeps between steps
pub const COOL: usize = 23;
pub const NEXT_DASH: usize = 24;
pub const FULL: usize = 25;
pub const GULP: usize = 26;
pub const HIDE: usize = 27; // may be unset (NaN)
pub const BOLDNESS: usize = 28;
pub const PULSE_T: usize = 29;
pub const NEXT_SPIN: usize = 30;
pub const SETTLE_T: usize = 31;
pub const GROUND_GOAL: usize = 32; // may be unset
pub const WANDER_A: usize = 33;
pub const WANDER_MUL: usize = 34;
pub const RING: usize = 35;
pub const Z_PREF: usize = 36;
pub const Z_GOAL: usize = 37;
pub const Z_GOAL_HOST: usize = 38; // may be unset
pub const SEED: usize = 39;
pub const TUCK_GOAL: usize = 40; // may be unset
pub const DASH_ANG: usize = 41; // may be unset
/// How many fields.
pub const FIELDS: usize = 42;
/// Numbers per creature in `f` (the fields, and spares so a row is a round size).
pub const ROW: usize = 48;

// the columns of `species`: what a species' swim gives every creature of it
pub const S_SEP: usize = 0;
pub const S_LEN: usize = 1;
pub const S_SPEED: usize = 2;
pub const S_WAVES: usize = 3;
pub const S_BEND: usize = 4;
pub const S_WING: usize = 5;
/// Not 0: the species hunts.
pub const S_PRED: usize = 6;
/// Not 0: something hunts the species (it has hunters to fear).
pub const S_PREDS: usize = 7;
/// Not 0: the species rides along with hosts.
pub const S_HOSTS: usize = 8;
pub const SPECIES: usize = 9;

// the columns of `beh`: a behaviour, as steering reads it (the page writes one row per behaviour object it uses)
pub const B_SCHOOL: usize = 0;
pub const B_TRAIN: usize = 1;
pub const B_SEP_MUL: usize = 2; // already `sepMul || 1`
pub const B_CONTAGION: usize = 3;
/// 1 bolt, 2 scatter, 3 hide, 4 none, 0 anything else.
pub const B_FLEE: usize = 4;
pub const B_PUFF: usize = 5;
/// 0 no dash, 1 periodic, 2 chase, 3 another kind.
pub const B_DASH: usize = 6;
pub const B_DASH_DUR: usize = 7;
pub const B_DASH_E0: usize = 8; // every: the range between periodic dashes
pub const B_DASH_E1: usize = 9;
pub const B_DASH_COOL: usize = 10; // already `cool || 0`
/// 0 it does not walk, 1 its home is the water, 2 the ground, 3 elsewhere.
pub const B_AMPHI: usize = 11;
pub const B_SETTLE0: usize = 12; // already `settle || [5, 10]`
pub const B_SETTLE1: usize = 13;
pub const B_RISE0: usize = 14; // already `rise || [8, 16]`
pub const B_RISE1: usize = 15;
pub const B_LIGHT: usize = 16;
pub const B_STOPGO: usize = 17;
pub const B_PULSE: usize = 18;
pub const B_PULSE_PERIOD: usize = 19;
pub const B_PULSE_GAIN: usize = 20;
pub const B_SPIN: usize = 21;
pub const B_SPIN_DUR: usize = 22;
pub const B_SPIN_E0: usize = 23;
pub const B_SPIN_E1: usize = 24;
pub const B_VORTEX: usize = 25;
pub const B_Z0: usize = 26;
pub const B_Z1: usize = 27;
pub const B_DIVE: usize = 28;
pub const B_WANDER_RATE: usize = 29;
pub const B_WANDER: usize = 30;
pub const B_LURED: usize = 31; // already `lured || 1`
pub const BEH: usize = 32;

/// Numbers per vortex in `vort`: x, y, radius, strength, and whether only some species feel it (then `vort_sp` says which).
pub const VORT: usize = 5;

// `io`: what passes between steering and the page while a creature steers, and what it hands back at the end
pub const IO_FX: usize = 0;
pub const IO_FY: usize = 1;
pub const IO_CRUISE: usize = 2;
pub const IO_DASHING: usize = 3;
pub const IO_THREAT: usize = 4;
pub const IO_TARGET: usize = 5; // it has a target (1) or not (0), and where the target is
pub const IO_TX: usize = 6;
pub const IO_TY: usize = 7;
pub const IO_TZ: usize = 8;
pub const IO: usize = 16;

/// Numbers per moving creature in `movers`: its slot, its flags (mover.rs F_ bits), its tuck goal, the steering wish
/// (force x, y, cruise, threat) and its behaviour's speed multiplier, dash multiplier, least speed, turn rate and glide.
pub const MOVER: usize = 12;

// what `neighbours` finds for one creature, in `out`
pub const NB_OUT: usize = 17;
pub const NB_SX: usize = 0; // separation: the push away from those too near
pub const NB_SY: usize = 1;
pub const NB_AX: usize = 2; // its own kind ahead and beside: their velocities, positions and depths summed, and how many
pub const NB_AY: usize = 3;
pub const NB_CX: usize = 4;
pub const NB_CY: usize = 5;
pub const NB_ZS: usize = 6;
pub const NB_N: usize = 7;
pub const NB_ALX: usize = 8; // alarm among them: the way they flee weighted by alarm, the alarm summed, and how many were asked
pub const NB_ALY: usize = 9;
pub const NB_ALN: usize = 10;
pub const NB_ALC: usize = 11;
pub const NB_CX2: usize = 12; // much bigger harmless creatures of another kind (it shelters near them)
pub const NB_CY2: usize = 13;
pub const NB_N2: usize = 14;
pub const NB_LEAD: usize = 15; // the nearest of its kind ahead, for those that swim in a train: its place, or -1
pub const NB_LEAD_D: usize = 16;

#[derive(Debug)]
pub struct World {
    /// The creatures' numbers, a row of ROW per slot: `f[slot * ROW + FIELD]`. A creature's fields sit together, so the
    /// page reads one with a single index into one array.
    pub f: Vec<f64>,
    /// Species, by slot.
    pub sp: Vec<i32>,
    /// Not 0: dead or held, so it is neither counted nor counts. By slot; the page keeps it.
    pub skip: Vec<u8>,
    /// The spine, by slot: K points (x then y), its depth, its roll.
    pub chain: Vec<f32>,
    pub cz: Vec<f32>,
    pub croll: Vec<f32>,
    /// `species[species index * SPECIES + S_..]`.
    pub species: Vec<f64>,
    pub n_species: usize,
    /// The slot at each place in the page's list, and how many places.
    pub ord: Vec<u32>,
    pub n: usize,
    /// The neighbour grid over the places, and the density count.
    pub grid: Sense,
    pub out: [f64; NB_OUT],
    pub movers: Vec<f64>,
    pub solids: Vec<f64>,
    /// The behaviours, BEH numbers each, by the number the page gave each one.
    pub beh: Vec<f64>,
    /// The vortices (VORT numbers each), and for each the species that feel it (`n_species` bytes each).
    pub vort: Vec<f64>,
    pub vort_sp: Vec<u8>,
    /// The slots of the creatures that were spinning when the tank was sensed, in the page's order.
    pub spin: Vec<u32>,
    pub io: [f64; IO],
    /// The tank, as this step's steering reads it.
    pub tank: SteerTank,
}

/// The tank's settings and state for a step of steering.
#[derive(Clone, Copy, Debug, Default)]
pub struct SteerTank {
    pub dt: f64,
    pub body_px: f64,
    /// The neighbour radius.
    pub r: f64,
    pub max_sp: f64,
    pub max_f: f64,
    pub w: f64,
    pub h: f64,
    pub margin: f64,
    pub personal: bool,
    pub align: f64,
    pub coh: f64,
    pub sep: f64,
    pub dz: f64,
    pub size: f64,
    /// The sim's own seconds.
    pub sim_t: f64,
    /// The whole tank turns about one centre (the tank's flow is "vortex"), at (vx0, vy0).
    pub flow_vortex: bool,
    pub vx0: f64,
    pub vy0: f64,
    pub vradius: f64,
    pub swirl: f64,
    /// The pointer is in the tank and matters; whether it scatters (or attracts).
    pub ptr_on: bool,
    pub ptr_x: f64,
    pub ptr_y: f64,
    pub ptr_scatter: bool,
    /// The host's share of the tank kept near the floor (0: none).
    pub lowland: f64,
    /// The host has its own say on who fears whom.
    pub host_fears: bool,
    /// The host has individuals with lures.
    pub has_lurers: bool,
    pub n_vort: usize,
    pub n_solids: usize,
}

/// One creature about to steer: what the page has worked out for it.
#[derive(Clone, Copy, Debug)]
pub struct Me {
    /// Its behaviour's number in `beh`.
    pub bid: usize,
    pub can_bite: bool,
    pub bite_any: bool,
    /// A hand on it: the way it is sent, and whether it keeps to its own business as well.
    pub steer: Option<(f64, f64, bool)>,
    /// A host's hunter.
    pub hunter: bool,
    /// A host's guest.
    pub guest: bool,
    /// The host has individuals with lures just now.
    pub lurers: bool,
    pub reach: f64,
    pub bl: f64,
    pub sp0: f64,
}

/// What steering asks of the page.
pub trait Host {
    /// Is the creature at place j food for the one at place i.
    fn edible(&mut self, i: usize, j: usize) -> bool;
    /// Do the biting; returns whether it now bites anything in reach.
    fn bite(&mut self, i: usize, j: usize) -> bool;
    /// Does this creature fear hunter k (the host's food web), and does hunter k pass for its kind.
    fn fears(&mut self, k: usize) -> bool;
    fn mimics(&mut self, k: usize) -> bool;
    /// Make sure the hunters are noted as they are now.
    fn fear_prep(&mut self);
    /// The hunt (run: the creature may hunt now), and in any case where its target is: reads and writes `io`.
    fn hunt(&mut self, run: bool);
    /// Riding with a host: reads and writes `io`.
    fn host(&mut self);
    /// Individuals' lures: reads and writes `io`.
    fn lurers(&mut self);
    /// A hunter changed in a way the hunters' notes must hear about.
    fn dirty(&mut self);
    /// The next number from the one random stream.
    fn rnd(&mut self) -> f64;
}

/// JavaScript's truth of a number: neither 0 nor NaN.
#[inline]
fn truthy(x: f64) -> bool {
    x != 0.0 && !x.is_nan()
}

impl Default for World {
    fn default() -> Self {
        World {
            f: Vec::new(),
            sp: Vec::new(),
            skip: Vec::new(),
            chain: Vec::new(),
            cz: Vec::new(),
            croll: Vec::new(),
            species: Vec::new(),
            n_species: 0,
            ord: Vec::new(),
            n: 0,
            grid: Sense::new(),
            out: [0.0; NB_OUT],
            movers: Vec::new(),
            solids: Vec::new(),
            beh: Vec::new(),
            vort: Vec::new(),
            vort_sp: Vec::new(),
            spin: Vec::new(),
            io: [0.0; IO],
            tank: SteerTank::default(),
        }
    }
}

impl World {
    pub fn new() -> Self {
        Self::default()
    }
    /// How many slots there is room for.
    pub fn slots(&self) -> usize {
        self.sp.len()
    }
    /// Room for so many slots. Grows by doubling; what is there is kept.
    pub fn reserve(&mut self, slots: usize) {
        if slots <= self.slots() {
            return;
        }
        let cap = slots.next_power_of_two().max(256);
        self.f.resize(cap * ROW, 0.0);
        self.sp.resize(cap, 0);
        self.skip.resize(cap, 0);
        self.chain.resize(cap * K * 2, 0.0);
        self.cz.resize(cap * K, 0.0);
        self.croll.resize(cap * K, 0.0);
    }
    /// Room for so many places in the list, so many moving creatures and so many solids.
    pub fn reserve_list(&mut self, n: usize, solids: usize) {
        if n > self.ord.len() {
            let cap = n.next_power_of_two().max(256);
            self.ord.resize(cap, 0);
            self.movers.resize(cap * MOVER, 0.0);
            self.grid.reserve(cap);
        }
        if solids * mover::SOLID > self.solids.len() {
            self.solids.resize(solids.next_power_of_two().max(16) * mover::SOLID, 0.0);
        }
    }
    /// Room for so many behaviours and vortices.
    pub fn reserve_tables(&mut self, behaviours: usize, vortices: usize) {
        if behaviours * BEH > self.beh.len() {
            self.beh.resize(behaviours.next_power_of_two().max(32) * BEH, 0.0);
        }
        if vortices * VORT > self.vort.len() || vortices * self.n_species > self.vort_sp.len() {
            let cap = vortices.next_power_of_two().max(8);
            self.vort.resize(cap * VORT, 0.0);
            self.vort_sp.resize(cap * self.n_species.max(1), 0);
        }
    }
    pub fn set_species(&mut self, n: usize) {
        self.n_species = n;
        self.species.clear();
        self.species.resize(n * SPECIES, 0.0);
    }
    #[inline]
    fn of_species(&self, slot: usize, what: usize) -> f64 {
        self.species[(self.sp[slot] as usize) * SPECIES + what]
    }
    /// Every slot in `ord` is one there is room for, and every species one there is a row for.
    fn sound(&self, n: usize) -> bool {
        n <= self.ord.len() && self.ord[..n].iter().all(|&s| (s as usize) < self.slots() && self.sp[s as usize] >= 0 && (self.sp[s as usize] as usize) < self.n_species)
    }
    /// Sense: build the neighbour grid over the first n places, and count density if asked. False if it cannot
    /// (a position that is not a number, creatures spread too far, a slot or species out of range): the page falls back.
    pub fn sense(&mut self, n: usize, cell: f64, density: bool) -> bool {
        self.n = 0;
        if !self.sound(n) {
            return false;
        }
        self.grid.reserve(n);
        for i in 0..n {
            let s = self.ord[i] as usize;
            self.grid.x[i] = self.f[s * ROW + X];
            self.grid.y[i] = self.f[s * ROW + Y];
            self.grid.sp[i] = self.sp[s];
            self.grid.skip[i] = self.skip[s];
        }
        if !self.grid.build(n, cell) {
            return false;
        }
        if density {
            self.grid.count_density();
        }
        // those spinning now (personal tanks only, as the page does it)
        self.spin.clear();
        if density {
            for i in 0..n {
                let s = self.ord[i] as usize;
                if self.f[s * ROW + SPIN_T] > 0.0 {
                    self.spin.push(s as u32);
                }
            }
        }
        self.n = n;
        true
    }
    /// Move: every creature listed in `movers`, in place (mover.rs `move_one`, which is the page's phMove).
    pub fn step_move(&mut self, movers: usize, solids: usize, dt: f64, t: &Tank) {
        let movers = movers.min(self.movers.len() / MOVER);
        let solids = (solids * mover::SOLID).min(self.solids.len());
        let mut r = [0.0f64; mover::STRIDE];
        for k in 0..movers {
            let m = &self.movers[k * MOVER..(k + 1) * MOVER];
            let s = m[0] as usize;
            if s >= self.slots() || self.sp[s] < 0 || self.sp[s] as usize >= self.n_species {
                continue;
            }
            // the row movement works on: the creature's own numbers, its species' swim, and what steering handed over
            for (to, from) in [(mover::X, X), (mover::Y, Y), (mover::Z, Z), (mover::VX, VX), (mover::VY, VY), (mover::ANG, ANG), (mover::DEPTH, DEPTH), (mover::SCALE, SCALE), (mover::ALARM, ALARM), (mover::SPIN_T, SPIN_T), (mover::GROUND, GROUND), (mover::TURN_S, TURN_S), (mover::TUCK, TUCK), (mover::PUFF, PUFF), (mover::ALERT, ALERT), (mover::CLOAK, CLOAK), (mover::GLIDE, GLIDE), (mover::FLAP, FLAP), (mover::PHASE, PHASE), (mover::FADE, FADE)] {
                r[to] = self.f[s * ROW + from];
            }
            for (to, from) in [(mover::SW_SPEED, S_SPEED), (mover::SW_LEN, S_LEN), (mover::SW_WAVES, S_WAVES), (mover::SW_BEND, S_BEND), (mover::WING, S_WING)] {
                r[to] = self.of_species(s, from);
            }
            for (to, from) in [(mover::FLAGS, 1), (mover::TUCK_GOAL, 2), (mover::FX, 3), (mover::FY, 4), (mover::CRUISE, 5), (mover::THREAT, 6), (mover::SPEED_MUL, 7), (mover::DASH_MULT, 8), (mover::MIN_SP, 9), (mover::TURN, 10), (mover::B_GLIDE, 11)] {
                r[to] = m[from];
            }
            move_one(&mut r, &mut self.chain[s * K * 2..(s + 1) * K * 2], &mut self.cz[s * K..(s + 1) * K], &mut self.croll[s * K..(s + 1) * K], &self.solids[..solids], dt, t);
            for (from, to) in [(mover::X, X), (mover::Y, Y), (mover::Z, Z), (mover::VX, VX), (mover::VY, VY), (mover::ANG, ANG), (mover::TURN_S, TURN_S), (mover::TUCK, TUCK), (mover::PUFF, PUFF), (mover::ALERT, ALERT), (mover::CLOAK, CLOAK), (mover::GLIDE, GLIDE), (mover::FLAP, FLAP), (mover::PHASE, PHASE), (mover::FADE, FADE)] {
                self.f[s * ROW + to] = r[from];
            }
        }
    }
}

/// What steering knows about the one creature whose neighbours are being read.
#[derive(Clone, Copy, Debug)]
pub struct Nb {
    /// The neighbour radius.
    pub r: f64,
    pub body_px: f64,
    /// The tank's depth scale.
    pub dz: f64,
    /// The tank's base body size.
    pub size: f64,
    pub personal: bool,
    /// It may bite this step.
    pub can_bite: bool,
    pub reach: f64,
    /// How near in depth a bite must be.
    pub bite_tol: f64,
    /// It bites anything in reach (false: only what is well inside its reach). The host's answer to a bite replaces this.
    pub bite_any: bool,
    pub sep_mul: f64,
    pub train: bool,
    /// Its body length and speed as they stood when its turn began.
    pub bl: f64,
    pub sp0: f64,
}

/// Read the neighbours of the creature at place i from the grid into `out`: the neighbour loop of `phSteer` in
/// ecology-sim.js, operation for operation and in the same order.
///
/// A bite is the host's business: when a neighbour is within biting reach, `edible(i, j)` asks whether it is food and
/// `bite(i, j)` lets the host do the biting; `bite` returns the new `bite_any`. The host may change any creature
/// during either call (a bite kills, frees and frightens, and may add creatures), so this reads the columns through
/// the pointer afresh every time and holds nothing across a call.
///
/// # Safety
/// `this` must point to a live `World` that has been sensed, with place i in its list.
pub unsafe fn neighbours(this: *mut World, i: usize, p: &Nb, mut edible: impl FnMut(usize, usize) -> bool, mut bite: impl FnMut(usize, usize) -> bool) {
    // a creature's number, by slot
    macro_rules! at {
        ($field:expr, $s:expr) => {
            *(*this).f.as_ptr().add($s * ROW + $field)
        };
    }
    macro_rules! slot {
        ($j:expr) => {
            *(*this).ord.as_ptr().add($j) as usize
        };
    }
    macro_rules! sp {
        ($s:expr) => {
            *(*this).sp.as_ptr().add($s)
        };
    }
    macro_rules! species {
        ($s:expr, $what:expr) => {
            *(*this).species.as_ptr().add((sp!($s) as usize) * SPECIES + $what)
        };
    }
    let cell = (*this).grid.cell;
    let me = slot!(i);
    let (gx, gy) = ((at!(X, me) / cell).floor() as i64, (at!(Y, me) / cell).floor() as i64);
    let (mut sx, mut sy, mut ax, mut ay, mut cx, mut cy, mut zs, mut n) = (0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let (mut al_x, mut al_y, mut al_n, mut al_c, mut cx2, mut cy2, mut n2) = (0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let (mut lead, mut lead_d) = (-1.0f64, 1e9f64);
    let mut bite_any = p.bite_any;
    let mid = (K >> 1) * 2;
    for ox in -1..=1i64 {
        for oy in -1..=1i64 {
            // the cell's stretch of the grid's list: the grid itself does not change during the pass
            let g = std::ptr::addr_of!((*this).grid);
            let (cxi, cyi) = (gx + ox - i64::from((*g).gx0), gy + oy - i64::from((*g).gy0));
            if (*g).n == 0 || cxi < 0 || cyi < 0 || cxi >= i64::from((*g).cols) || cyi >= i64::from((*g).rows) {
                continue;
            }
            let c = (cxi + cyi * i64::from((*g).cols)) as usize;
            let (q0, q1) = (*(*g).starts.as_ptr().add(c) as usize, *(*g).starts.as_ptr().add(c + 1) as usize);
            for q in q0..q1 {
                let j = *(*g).order.as_ptr().add(q) as usize;
                if j == i || j >= (*this).n {
                    continue;
                }
                let o = slot!(j);
                if *(*this).skip.as_ptr().add(o) != 0 {
                    continue;
                }
                let me = slot!(i);
                let (fx, fy, fz) = (at!(X, me), at!(Y, me), at!(Z, me));
                let (dx, dy) = (at!(X, o) - fx, at!(Y, o) - fy);
                let d2 = dx * dx + dy * dy;
                if d2 > p.r * p.r || d2 < 1e-6 {
                    continue;
                }
                if p.can_bite && d2 < p.reach * p.reach && (at!(Z, o) - fz).abs() * p.dz < p.bite_tol && (bite_any || d2 < p.reach * p.reach * 0.36) && edible(i, j) {
                    bite_any = bite(i, j);
                    continue;
                }
                let d = d2.sqrt();
                let z_near = max(0.0, 1.0 - (at!(Z, o) - fz).abs() * 4.0 * p.dz);
                if z_near <= 0.0 {
                    continue;
                }
                // how much room the two keep: each one's scale times depth times its species' separation
                let sep = p.body_px * 0.6 * (at!(SCALE, me) * at!(DEPTH, me) * species!(me, S_SEP) + at!(SCALE, o) * at!(DEPTH, o) * species!(o, S_SEP)) * p.sep_mul;
                let (mx, my) = (f64::from(*(*this).chain.as_ptr().add(o * K * 2 + mid)) - fx, f64::from(*(*this).chain.as_ptr().add(o * K * 2 + mid + 1)) - fy);
                let dm = or(hypot(mx, my), 1.0);
                if d < sep {
                    let k = (1.0 - d / sep) * z_near;
                    sx -= dx / d * k * k * 2.0 + dx / d * k;
                    sy -= dy / d * k * k * 2.0 + dy / d * k;
                }
                if dm < sep * 0.8 {
                    let k = (1.0 - dm / (sep * 0.8)) * z_near;
                    sx -= mx / dm * k;
                    sy -= my / dm * k;
                }
                let (fvx, fvy) = (at!(VX, me), at!(VY, me));
                if (dx * fvx + dy * fvy) < -0.5 * d * p.sp0 {
                    continue; // behind it: not seen
                }
                let same = sp!(o) == sp!(me);
                if p.personal && !same && species!(me, S_PRED) == 0.0 && species!(o, S_PRED) == 0.0 && p.size * at!(SCALE, o) * at!(DEPTH, o) * species!(o, S_LEN) > p.bl * 1.3 {
                    cx2 += at!(X, o);
                    cy2 += at!(Y, o);
                    n2 += 1.0;
                }
                if !same {
                    continue;
                }
                ax += at!(VX, o);
                ay += at!(VY, o);
                cx += at!(X, o);
                cy += at!(Y, o);
                zs += at!(Z, o);
                n += 1.0;
                al_c += 1.0;
                let alarm = at!(ALARM, o);
                if alarm > 0.05 {
                    al_x += at!(FLEE_X, o) * alarm;
                    al_y += at!(FLEE_Y, o) * alarm;
                    al_n += alarm;
                }
                if p.train && (dx * fvx + dy * fvy) > 0.3 * d * p.sp0 && d < lead_d {
                    lead = j as f64;
                    lead_d = d;
                }
            }
        }
    }
    let out = std::ptr::addr_of_mut!((*this).out) as *mut f64;
    for (k, v) in [sx, sy, ax, ay, cx, cy, zs, n, al_x, al_y, al_n, al_c, cx2, cy2, n2, lead, lead_d].into_iter().enumerate() {
        *out.add(k) = v;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NB: Nb = Nb { r: 60.0, body_px: 40.0, dz: 1.0, size: 40.0, personal: true, can_bite: false, reach: 0.0, bite_tol: 0.25, bite_any: true, sep_mul: 1.0, train: false, bl: 40.0, sp0: 1.0 };

    /// A world of creatures in a row along x, in slots in reverse of their places (so place and slot are never confused).
    fn row(xs: &[f64], sps: &[i32]) -> World {
        let (n, mut w) = (xs.len(), World::new());
        w.reserve(n);
        w.reserve_list(n, 0);
        w.set_species(2);
        for s in 0..2 {
            w.species[s * SPECIES + S_SEP] = 1.0;
            w.species[s * SPECIES + S_LEN] = 1.0;
            w.species[s * SPECIES + S_SPEED] = 1.0;
            w.species[s * SPECIES + S_WAVES] = 1.0;
            w.species[s * SPECIES + S_BEND] = 1.0;
        }
        for i in 0..n {
            let s = n - 1 - i;
            w.ord[i] = s as u32;
            w.f[s * ROW + X] = xs[i];
            w.f[s * ROW + Y] = 100.0;
            w.f[s * ROW + Z] = 0.5;
            w.f[s * ROW + VX] = 1.0;
            w.f[s * ROW + SCALE] = 1.0;
            w.f[s * ROW + DEPTH] = 1.0;
            w.f[s * ROW + FADE] = 1.0;
            w.sp[s] = sps[i];
            w.chain[s * K * 2 + (K >> 1) * 2] = (xs[i] - 20.0) as f32;
            w.chain[s * K * 2 + (K >> 1) * 2 + 1] = 100.0;
        }
        assert!(w.sense(n, 60.0, true));
        w
    }

    #[test]
    fn a_neighbour_too_near_pushes_away_and_its_own_kind_is_counted() {
        let mut w = row(&[100.0, 110.0], &[0, 0]);
        unsafe { neighbours(&mut w, 0, &NB, |_, _| false, |_, _| true) };
        assert!(w.out[NB_SX] < 0.0, "pushed back from the one ahead");
        assert_eq!(w.out[NB_N], 1.0);
        assert_eq!(w.out[NB_CX], 110.0);
        assert_eq!(w.out[NB_LEAD], -1.0);
        // the one behind is not seen, but still keeps its distance
        unsafe { neighbours(&mut w, 1, &NB, |_, _| false, |_, _| true) };
        assert_eq!(w.out[NB_N], 0.0);
        assert!(w.out[NB_SX] > 0.0);
        assert_eq!(w.grid.density[0], 1.0);
    }
    #[test]
    fn another_kind_is_not_schooled_with_and_a_train_follows_the_one_ahead() {
        let mut w = row(&[100.0, 110.0], &[0, 1]);
        unsafe { neighbours(&mut w, 0, &NB, |_, _| false, |_, _| true) };
        assert_eq!(w.out[NB_N], 0.0);
        let mut w = row(&[100.0, 130.0], &[0, 0]);
        unsafe { neighbours(&mut w, 0, &Nb { train: true, ..NB }, |_, _| false, |_, _| true) };
        assert_eq!(w.out[NB_LEAD], 1.0);
        assert_eq!(w.out[NB_LEAD_D], 30.0);
    }
    #[test]
    fn a_bite_is_the_hosts_and_what_it_changes_is_seen_at_once() {
        let mut w = row(&[100.0, 110.0, 112.0], &[0, 1, 0]);
        let p = Nb { can_bite: true, reach: 15.0, ..NB };
        let this: *mut World = &mut w;
        let (mut asked, mut bitten) = (Vec::new(), Vec::new());
        // the host eats the creature at place 1 and, in the same bite, takes the one at place 2 out as well: it must not be counted
        unsafe {
            neighbours(this, 0, &p, |_, j| { asked.push(j); j == 1 }, |_, j| {
                bitten.push(j);
                for place in [1usize, 2] {
                    let s = *(*this).ord.as_ptr().add(place) as usize;
                    *(*this).skip.as_mut_ptr().add(s) = 1;
                }
                true
            })
        };
        assert_eq!(asked, vec![1]);
        assert_eq!(bitten, vec![1]);
        assert_eq!(w.out[NB_N], 0.0);
        assert_eq!(w.out[NB_SX], 0.0);
    }
    #[test]
    fn out_of_reach_is_never_asked_about() {
        let mut w = row(&[100.0, 140.0], &[0, 1]);
        let mut asked = 0;
        unsafe { neighbours(&mut w, 0, &Nb { can_bite: true, reach: 15.0, ..NB }, |_, _| { asked += 1; true }, |_, _| true) };
        assert_eq!(asked, 0);
    }
    #[test]
    fn it_moves_its_creatures_in_place() {
        let mut w = row(&[100.0, 300.0], &[0, 1]);
        let t = Tank { max_sp: 64.0, max_f: 140.8, personal: true, size: 40.0, speed: 1.0, bank: 1.0, flex: 1.0, depth: 600.0 };
        let s = w.ord[1] as usize; // only the creature at place 1 moves
        w.f[s * ROW + VX] = 30.0;
        w.movers[..MOVER].copy_from_slice(&[s as f64, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.8, 0.35, 180.0, 0.0]);
        w.step_move(1, 0, 1.0 / 60.0, &t);
        assert!((w.f[s * ROW + X] - 300.5).abs() < 1e-9);
        assert_eq!(w.chain[s * K * 2], w.f[s * ROW + X] as f32);
        assert_eq!(w.f[(w.ord[0] as usize) * ROW + X], 100.0);
    }
    /// A page that asks nothing: no food, no fear, no hunt, and the one random stream.
    struct Quiet(crate::rng::Rng, usize);
    impl Host for Quiet {
        fn edible(&mut self, _: usize, _: usize) -> bool { false }
        fn bite(&mut self, _: usize, _: usize) -> bool { false }
        fn fears(&mut self, _: usize) -> bool { false }
        fn mimics(&mut self, _: usize) -> bool { false }
        fn fear_prep(&mut self) {}
        fn hunt(&mut self, _: bool) { self.1 += 1; }
        fn host(&mut self) {}
        fn lurers(&mut self) {}
        fn dirty(&mut self) {}
        fn rnd(&mut self) -> f64 { self.0.next() }
    }

    #[test]
    fn steering_keeps_off_the_edge_settles_its_depth_and_asks_the_page_once_about_the_hunt() {
        let mut w = row(&[10.0, 900.0], &[0, 1]);
        w.reserve_tables(1, 0);
        // a behaviour that neither schools nor wanders, at a depth of 0.2 to 0.4
        for (k, v) in [(B_SCHOOL, 0.0), (B_SEP_MUL, 1.0), (B_VORTEX, 1.0), (B_Z0, 0.2), (B_Z1, 0.4), (B_WANDER, 0.0), (B_LURED, 1.0), (B_DASH_COOL, 0.0)] {
            w.beh[k] = v;
        }
        let s = w.ord[0] as usize;
        for (k, v) in [(Z_PREF, 0.5), (SEED, 0.0), (WANDER_A, 0.0), (WANDER_MUL, 1.0), (COOL, 1.0), (BOLDNESS, 1.0), (Z_GOAL_HOST, f64::NAN), (DASH_ANG, f64::NAN)] {
            w.f[s * ROW + k] = v;
        }
        w.tank = SteerTank { dt: 1.0 / 60.0, body_px: 40.0, r: 60.0, max_sp: 64.0, max_f: 140.8, w: 2000.0, h: 1200.0, margin: 60.0, personal: true, align: 1.0, coh: 1.0, sep: 1.0, dz: 1.0, size: 40.0, ..SteerTank::default() };
        let mut fear = Fear::new();
        fear.build(0, 180.0);
        let me = Me { bid: 0, can_bite: false, bite_any: false, steer: None, hunter: false, guest: false, lurers: false, reach: 0.0, bl: 40.0, sp0: 1.0 };
        let mut host = Quiet(crate::rng::Rng::new(5), 0);
        unsafe { steer(&mut w, &mut fear, 0, &me, &mut host) };
        assert!(w.io[IO_FX] > 0.0, "pushed in from the left edge");
        assert_eq!(w.io[IO_CRUISE], 1.0);
        assert_eq!(w.io[IO_THREAT], 0.0);
        assert_eq!(host.1, 1);
        assert!((w.f[s * ROW + Z_GOAL] - 0.3).abs() < 1e-12, "the middle of its depth band");
        assert!(w.f[s * ROW + Z] > 0.3 && w.f[s * ROW + Z] < 0.5, "and heading there");
        assert_eq!(w.f[s * ROW + COOL], 1.0 - 1.0 / 60.0);
    }

    #[test]
    fn a_slot_or_species_out_of_range_is_refused() {
        let mut w = row(&[100.0, 110.0], &[0, 0]);
        w.ord[1] = 9999;
        assert!(!w.sense(2, 60.0, true));
        w.ord[1] = 0;
        w.sp[0] = 7;
        assert!(!w.sense(2, 60.0, true));
    }
}

/// Steer the creature at place i: `phSteer` in ecology-sim.js, operation for operation and in the same order, from the
/// neighbour pass to the solids. What it wants (the force, cruise, whether it dashes, the threat) goes to `io`.
///
/// The page does what needs its objects: a bite, the hunt, riding a host, individuals' lures, and the food web's say
/// on fear. It may change any creature while it does, so every number is read from the world afresh where it is used.
///
/// # Safety
/// `this` and `fear` must point to a live, sensed `World` and a built `Fear`, with place i in the list.
pub unsafe fn steer<H: Host>(this: *mut World, fear: *mut Fear, i: usize, me: &Me, host: &mut H) {
    let t = (*this).tank;
    let s = *(*this).ord.as_ptr().add(i) as usize;
    let hp: *mut H = host;
    macro_rules! g {
        ($k:expr) => {
            *(*this).f.as_ptr().add(s * ROW + $k)
        };
    }
    macro_rules! w {
        ($k:expr, $v:expr) => {{
            let v = $v;
            *(*this).f.as_mut_ptr().add(s * ROW + $k) = v;
        }};
    }
    macro_rules! b {
        ($k:expr) => {
            *(*this).beh.as_ptr().add(me.bid * BEH + $k)
        };
    }
    macro_rules! io {
        ($k:expr) => {
            *(std::ptr::addr_of_mut!((*this).io) as *mut f64).add($k)
        };
    }
    let sp = *(*this).sp.as_ptr().add(s) as usize;
    macro_rules! spc {
        ($k:expr) => {
            *(*this).species.as_ptr().add(sp * SPECIES + $k)
        };
    }
    let rand = |a: f64, b: f64| a + (*hp).rnd() * (b - a);
    let (max_sp, max_f, bl) = (t.max_sp, t.max_f, me.bl);

    // the neighbours (a bite among them is the page's)
    let nb = Nb { r: t.r, body_px: t.body_px, dz: t.dz, size: t.size, personal: t.personal, can_bite: me.can_bite, reach: me.reach, bite_tol: if b!(B_AMPHI) != 0.0 { 0.45 } else { 0.25 }, bite_any: me.bite_any, sep_mul: b!(B_SEP_MUL), train: truthy(b!(B_TRAIN)), bl, sp0: me.sp0 };
    neighbours(this, i, &nb, |a, c| (*hp).edible(a, c), |a, c| (*hp).bite(a, c));
    let o = (*this).out;
    let (sx, sy, ax, ay, cx, cy, zs, n) = (o[NB_SX], o[NB_SY], o[NB_AX], o[NB_AY], o[NB_CX], o[NB_CY], o[NB_ZS], o[NB_N]);
    let (al_x, al_y, al_n, al_c, cx2, cy2, n2, lead) = (o[NB_ALX], o[NB_ALY], o[NB_ALN], o[NB_ALC], o[NB_CX2], o[NB_CY2], o[NB_N2], o[NB_LEAD]);

    let (mut fx, mut fy) = (0.0f64, 0.0f64);
    let school = b!(B_SCHOOL);
    if truthy(n) && school > 0.0 {
        let sp_ = or(hypot(ax, ay), 1.0);
        fx += (ax / sp_ * max_sp - g!(VX)) * t.align * 1.2 * school;
        fy += (ay / sp_ * max_sp - g!(VY)) * t.align * 1.2 * school;
        let (tx, ty) = (cx / n - g!(X), cy / n - g!(Y));
        let td = or(hypot(tx, ty), 1.0);
        let huddle = 1.0 + 2.0 * g!(ALARM);
        fx += (tx / td * max_sp - g!(VX)) * t.coh * 0.6 * school * huddle;
        fy += (ty / td * max_sp - g!(VY)) * t.coh * 0.6 * school * huddle;
    }
    if truthy(n2) {
        let (tx2, ty2) = (cx2 / n2 - g!(X), cy2 / n2 - g!(Y));
        let td2 = or(hypot(tx2, ty2), 1.0);
        fx += (tx2 / td2 * max_sp - g!(VX)) * 0.18;
        fy += (ty2 / td2 * max_sp - g!(VY)) * 0.18;
    }
    fx += sx * max_sp * t.sep * 4.0;
    fy += sy * max_sp * t.sep * 4.0;
    if let Some((stx, sty, keep)) = me.steer {
        let k = if keep { 1.2 } else { 3.5 };
        fx += (stx * max_sp * 1.4 - g!(VX)) * k;
        fy += (sty * max_sp * 1.4 - g!(VY)) * k;
    }
    if lead >= 0.0 {
        let ls = *(*this).ord.as_ptr().add(lead as usize) as usize;
        let lc = (*this).chain.as_ptr().add(ls * K * 2);
        let (tx, ty) = (f64::from(*lc.add((K - 1) * 2)) - g!(X), f64::from(*lc.add((K - 1) * 2 + 1)) - g!(Y));
        let td = or(hypot(tx, ty), 1.0);
        fx += (tx / td * max_sp - g!(VX)) * b!(B_TRAIN);
        fy += (ty / td * max_sp - g!(VY)) * b!(B_TRAIN);
    }

    let mut cruise = 1.0f64;
    let mut dashing = g!(DASH_T) > 0.0;
    let mut threat = 0.0f64;
    let (mut fl_x, mut fl_y) = (0.0f64, 0.0f64);
    let target: Option<(f64, f64, f64)>;
    macro_rules! read_target {
        () => {
            target = if io!(IO_TARGET) != 0.0 { Some((io!(IO_TX), io!(IO_TY), io!(IO_TZ))) } else { None }
        };
    }
    let amphi = b!(B_AMPHI);
    if t.personal {
        if spc!(S_PREDS) != 0.0 || t.host_fears {
            (*hp).fear_prep();
            let prey = Prey { x: g!(X), y: g!(Y), sp, bl, lured: b!(B_LURED), head_down: amphi == 1.0 && g!(GROUND) > 0.5, r: t.r, max_f, host_fears: t.host_fears };
            (*fear).weigh(&prey, fx, fy, |k| (*hp).fears(k), |k| (*hp).mimics(k));
            let wd = (*fear).weighed;
            fx = wd[0];
            fy = wd[1];
            threat = wd[2];
            fl_x = wd[3];
            fl_y = wd[4];
        }
        let fl = hypot(fl_x, fl_y);
        if fl > 0.0 {
            w!(FLEE_X, fl_x / fl);
            w!(FLEE_Y, fl_y / fl);
        }
        w!(ALARM, max(threat, g!(ALARM) * max(0.0, 1.0 - t.dt * 1.5)));
        let contagion = b!(B_CONTAGION);
        if truthy(contagion) && al_n > 0.0 {
            let avg = al_n / max(1.0, al_c);
            let k = min(1.0, avg * 1.5) * contagion;
            let ll = or(hypot(al_x, al_y), 1.0);
            fx += al_x / ll * max_f * 1.6 * k;
            fy += al_y / ll * max_f * 1.6 * k;
            w!(ALARM, max(g!(ALARM), avg * 0.6));
            if fl == 0.0 {
                w!(FLEE_X, al_x / ll);
                w!(FLEE_Y, al_y / ll);
            }
        }
        let flee = b!(B_FLEE);
        if flee == 1.0 && threat > 0.45 * g!(BOLDNESS) && g!(COOL) <= 0.0 && g!(DASH_T) <= 0.0 {
            w!(DASH_T, 0.6);
            w!(DASH_ANG, atan2(g!(FLEE_Y), g!(FLEE_X)));
            w!(COOL, 2.5);
        }
        if flee == 2.0 && threat > 0.25 * g!(BOLDNESS) && g!(DASH_T) <= 0.0 && g!(COOL) <= 0.0 {
            w!(DASH_T, 0.3);
            let a = atan2(g!(FLEE_Y), g!(FLEE_X));
            w!(DASH_ANG, a + rand(-1.1, 1.1));
            w!(COOL, 0.6);
        }
        if flee == 3.0 && threat > 0.2 * g!(BOLDNESS) {
            w!(HIDE, 1.0);
        } else {
            w!(HIDE, max(0.0, or(g!(HIDE), 0.0) - t.dt));
        }
        if g!(FULL) > 0.0 {
            w!(FULL, g!(FULL) - t.dt);
            cruise *= 0.7;
        }
        w!(GULP, max(0.0, g!(GULP) - t.dt * 1.5));
        // being drawn into a spinner's whirl
        let n_spin = (*this).spin.len();
        for q in 0..n_spin {
            let j = *(*this).spin.as_ptr().add(q) as usize;
            if j == s || *(*this).sp.as_ptr().add(j) as usize == sp {
                continue;
            }
            let jf = (*this).f.as_ptr().add(j * ROW);
            let (dx, dy) = (*jf.add(X) - g!(X), *jf.add(Y) - g!(Y));
            let d = or(hypot(dx, dy), 1.0);
            let jl = *(*this).species.as_ptr().add((*(*this).sp.as_ptr().add(j) as usize) * SPECIES + S_LEN);
            let rr = t.size * *jf.add(SCALE) * *jf.add(DEPTH) * jl * 2.2;
            if d < rr {
                let k = 1.0 - d / rr;
                fx += (dx / d * 0.6 - dy / d) * max_f * 1.4 * k;
                fy += (dy / d * 0.6 + dx / d) * max_f * 1.4 * k;
            }
        }
        if me.lurers {
            io!(IO_FX) = fx;
            io!(IO_FY) = fy;
            (*hp).lurers();
            fx = io!(IO_FX);
            fy = io!(IO_FY);
        }
        if truthy(b!(B_PUFF)) && t.ptr_on && hypot(t.ptr_x - g!(X), t.ptr_y - g!(Y)) < t.body_px * 3.5 {
            threat = max(threat, 0.8);
        }
        // the hunt is the page's
        io!(IO_FX) = fx;
        io!(IO_FY) = fy;
        io!(IO_CRUISE) = cruise;
        io!(IO_DASHING) = if dashing { 1.0 } else { 0.0 };
        (*hp).hunt(true);
        fx = io!(IO_FX);
        fy = io!(IO_FY);
        cruise = io!(IO_CRUISE);
        read_target!();
        if b!(B_DASH) == 1.0 {
            w!(NEXT_DASH, g!(NEXT_DASH) - t.dt);
            if g!(NEXT_DASH) <= 0.0 {
                w!(DASH_T, b!(B_DASH_DUR));
                w!(DASH_ANG, g!(ANG));
                let (e0, e1) = (b!(B_DASH_E0), b!(B_DASH_E1));
                w!(NEXT_DASH, rand(e0, e1));
            }
        }
        if truthy(b!(B_PUFF)) {
            cruise *= 1.0 - 0.8 * g!(PUFF);
        }
        // walk or swim
        if amphi != 0.0 {
            let scared = threat > 0.3 || g!(ALARM) > 0.5;
            let want;
            if amphi == 2.0 {
                let off_floor = matches!(target, Some((_, _, tz)) if (1.0 - tz) * t.dz > 0.12);
                let flee = b!(B_FLEE);
                let mut wv = if !(scared && flee != 4.0) && !(dashing && (off_floor || target.is_none())) && !(scared && flee == 4.0 && threat > 0.6) { 1.0 } else { 0.0 };
                if let Some((tx, ty, _)) = target {
                    if hypot(tx - g!(X), ty - g!(Y)) < (if off_floor { 5.0 } else { 4.0 }) * bl {
                        wv = 0.0;
                    }
                }
                want = wv;
            } else {
                w!(SETTLE_T, g!(SETTLE_T) - t.dt);
                if g!(SETTLE_T) <= 0.0 {
                    w!(GROUND_GOAL, if truthy(g!(GROUND_GOAL)) { 0.0 } else { 1.0 });
                    let (a, c) = if truthy(g!(GROUND_GOAL)) { (b!(B_SETTLE0), b!(B_SETTLE1)) } else { (b!(B_RISE0), b!(B_RISE1)) };
                    w!(SETTLE_T, rand(a, c));
                }
                want = if scared || target.is_some() { 0.0 } else if truthy(g!(GROUND_GOAL)) { 1.0 } else { 0.0 };
            }
            let gr = g!(GROUND);
            w!(GROUND, smooth(gr, want, if want > gr { 0.9 } else { 3.5 }, t.dt));
            if g!(GROUND) > 0.5 && !dashing {
                cruise *= 0.55;
            } else if target.is_some() && amphi == 2.0 {
                cruise *= 2.0;
            }
        }
        let light = b!(B_LIGHT);
        if truthy(light) && t.ptr_on {
            let (dx, dy) = (t.ptr_x - g!(X), t.ptr_y - g!(Y));
            let d = or(hypot(dx, dy), 1.0);
            fx += (dx / d * max_sp - g!(VX)) * light * min(1.0, d / (bl * 0.6));
            fy += (dy / d * max_sp - g!(VY)) * light * min(1.0, d / (bl * 0.6));
        }
        let stopgo = b!(B_STOPGO);
        if truthy(stopgo) && !dashing && !(amphi != 0.0 && g!(GROUND) < 0.5) {
            cruise *= if sin((t.sim_t * 1000.0) * 0.001 * stopgo * 2.0 + g!(SEED)) > 0.15 { 1.0 } else { 0.06 };
        }
        if spc!(S_HOSTS) != 0.0 {
            io!(IO_FX) = fx;
            io!(IO_FY) = fy;
            (*hp).host();
            fx = io!(IO_FX);
            fy = io!(IO_FY);
        }
        if b!(B_PULSE) != 0.0 {
            w!(PULSE_T, g!(PULSE_T) + t.dt);
            let pz = pow(max(0.0, sin(g!(PULSE_T) * 2.0 * std::f64::consts::PI / b!(B_PULSE_PERIOD))), 4.0);
            fx += cos(g!(ANG)) * max_f * b!(B_PULSE_GAIN) * pz;
            fy += sin(g!(ANG)) * max_f * b!(B_PULSE_GAIN) * pz;
            w!(VX, g!(VX) * (1.0 - min(0.5, t.dt * 1.4)));
            w!(VY, g!(VY) * (1.0 - min(0.5, t.dt * 1.4)));
            w!(TUCK_GOAL, pz);
        }
        if b!(B_SPIN) != 0.0 {
            w!(NEXT_SPIN, g!(NEXT_SPIN) - t.dt);
            if g!(NEXT_SPIN) <= 0.0 && g!(SPIN_T) <= 0.0 {
                w!(SPIN_T, b!(B_SPIN_DUR));
                let (e0, e1) = (b!(B_SPIN_E0), b!(B_SPIN_E1));
                w!(NEXT_SPIN, rand(e0, e1));
            }
            if g!(SPIN_T) > 0.0 {
                w!(SPIN_T, g!(SPIN_T) - t.dt);
                fx += -g!(VY) * 14.0;
                fy += g!(VX) * 14.0;
            }
        }
        if g!(DASH_T) > 0.0 {
            w!(DASH_T, g!(DASH_T) - t.dt);
            dashing = true;
            let a = if g!(DASH_ANG).is_nan() { g!(ANG) } else { g!(DASH_ANG) };
            fx += cos(a) * max_f * 2.5;
            fy += sin(a) * max_f * 2.5;
            if g!(DASH_T) <= 0.0 && b!(B_DASH) == 2.0 {
                w!(COOL, b!(B_DASH_COOL));
            }
        } else {
            w!(COOL, g!(COOL) - t.dt);
        }
    } else {
        (*hp).hunt(false);
        read_target!();
    }

    // the flow of the tank, and the depth it wants
    if t.flow_vortex {
        let rmax = min(t.w, t.h) * 0.46 * t.vradius;
        let (dx, dy) = (g!(X) - t.vx0, g!(Y) - t.vy0);
        let r = or(hypot(dx, dy), 1.0);
        let ring = g!(RING);
        let rp = rmax * (0.12 + 0.88 * ring);
        let (tx, ty) = (-dy / r, dx / r);
        let tang = max_sp * (1.25 - 0.45 * ring) * max(0.3, cruise);
        let radial = max(-1.0, min(1.0, (rp - r) / (rp * 0.5))) * max_sp * 0.9;
        let (dvx, dvy) = (tx * tang + dx / r * radial, ty * tang + dy / r * radial);
        let wv = t.swirl * 1.6 * b!(B_VORTEX) * if dashing { 0.2 } else { 1.0 };
        fx += (dvx - g!(VX)) * wv;
        fy += (dvy - g!(VY)) * wv;
        w!(Z_GOAL, 0.75 * (1.0 - min(1.0, r / rmax)) + 0.35 * g!(Z_PREF));
        if t.personal {
            w!(Z_GOAL, g!(Z_GOAL) * 0.4 + (b!(B_Z0) + (b!(B_Z1) - b!(B_Z0)) * g!(Z_PREF)) * 0.6);
        }
    } else {
        w!(Z_GOAL, b!(B_Z0) + (b!(B_Z1) - b!(B_Z0)) * g!(Z_PREF) + 0.12 * sin((t.sim_t * 1000.0) * 0.0001 + g!(SEED)));
    }
    if truthy(n) && school > 0.0 {
        w!(Z_GOAL, g!(Z_GOAL) * 0.7 + (zs / n) * 0.3);
    }
    if let Some((_, _, tz)) = target {
        w!(Z_GOAL, g!(Z_GOAL) * 0.5 + tz * 0.5);
    }
    if t.personal && !g!(Z_GOAL_HOST).is_nan() {
        w!(Z_GOAL, g!(Z_GOAL_HOST));
    }
    if t.personal && truthy(b!(B_DIVE)) {
        w!(Z_GOAL, g!(Z_GOAL) + 0.4 * g!(ALARM));
    }
    if g!(GROUND) > 0.0 {
        w!(Z_GOAL, g!(Z_GOAL) * (1.0 - g!(GROUND)) + 0.97 * g!(GROUND));
    }
    if truthy(t.lowland) && !me.guest && g!(Z_PREF) < t.lowland {
        w!(Z_GOAL, 0.945 + 0.02 * sin((t.sim_t * 1000.0) * 0.0002 + g!(SEED)));
    }
    let swim_hunt = t.personal && amphi != 0.0 && target.is_some() && g!(GROUND) < 0.5;
    let hunting = me.hunter && target.is_some();
    if swim_hunt || hunting {
        if let Some((_, _, tz)) = target {
            w!(Z_GOAL, tz);
        }
    }
    let rate = if g!(GROUND) > 0.5 || swim_hunt || hunting { 1.4 } else { 0.4 };
    w!(Z, g!(Z) + (min(1.0, max(0.0, g!(Z_GOAL))) - g!(Z)) * min(1.0, t.dt * rate));
    if g!(DEPTH) != 1.0 {
        (*hp).dirty();
    }
    w!(DEPTH, 1.0);
    let wr = or(b!(B_WANDER_RATE), 2.0);
    let dw = rand(-1.0, 1.0) * t.dt * wr * g!(WANDER_MUL);
    w!(WANDER_A, g!(WANDER_A) + dw);
    fx += cos(g!(WANDER_A)) * max_sp * b!(B_WANDER);
    fy += sin(g!(WANDER_A)) * max_sp * b!(B_WANDER);
    // the tank's edges
    let (x, y, m) = (g!(X), g!(Y), t.margin);
    if x < m {
        fx += (m - x) / m * max_f;
    } else if x > t.w - m {
        fx -= (x - (t.w - m)) / m * max_f;
    }
    if y < m {
        fy += (m - y) / m * max_f;
    } else if y > t.h - m {
        fy -= (y - (t.h - m)) / m * max_f;
    }
    // local whirlpools
    for v in 0..t.n_vort {
        let vv = (*this).vort.as_ptr().add(v * VORT);
        let (vdx, vdy) = (g!(X) - *vv, g!(Y) - *vv.add(1));
        let vr = or(hypot(vdx, vdy), 1.0);
        let radius = *vv.add(2);
        if vr > radius || (*vv.add(4) != 0.0 && *(*this).vort_sp.as_ptr().add(v * (*this).n_species + sp) == 0) {
            continue;
        }
        let fall = 1.0 - vr / radius;
        let (vtx, vty) = (-vdy / vr, vdx / vr);
        let orbit_r = radius * 0.45;
        let radial = max(-1.0, min(1.0, (orbit_r - vr) / (orbit_r * 0.6))) * max_sp * 0.5 * fall;
        let tang = max_sp * *vv.add(3) * fall;
        fx += vtx * tang + vdx / vr * radial;
        fy += vty * tang + vdy / vr * radial;
    }
    // the pointer
    if t.ptr_on {
        let (dx, dy) = (t.ptr_x - g!(X), t.ptr_y - g!(Y));
        let d = or(hypot(dx, dy), 1.0);
        let rp = t.body_px * 3.0;
        if d < rp {
            let k = (1.0 - d / rp) * (1.0 - 0.8 * g!(Z) * t.dz);
            if t.ptr_scatter && !(t.personal && truthy(b!(B_LIGHT))) {
                fx -= dx / d * max_f * 3.0 * k;
                fy -= dy / d * max_f * 3.0 * k;
            } else {
                fx += dx / d * max_f * 0.8 * k;
                fy += dy / d * max_f * 0.8 * k;
            }
        }
    }
    // solid things: below a solid's top, turn away from it and slide along it
    let n_solids = t.n_solids.min((*this).solids.len() / mover::SOLID);
    for q in 0..n_solids {
        let so = std::slice::from_raw_parts((*this).solids.as_ptr().add(q * mover::SOLID), mover::SOLID);
        if g!(Z) < so[8] - 0.04 {
            continue;
        }
        let (d, nx, ny) = mover::solid_near(so, g!(X), g!(Y));
        let look = t.body_px * 2.6;
        let gap = d - so[7];
        if gap > look {
            continue;
        }
        let k = 1.0 - max(0.0, gap) / look;
        let (tx, ty) = (-ny, nx);
        let side = if (g!(VX) * tx + g!(VY) * ty) >= 0.0 { 1.0 } else { -1.0 };
        fx += (nx * 2.4 + tx * side * 1.2) * max_f * k * k;
        fy += (ny * 2.4 + ty * side * 1.2) * max_f * k * k;
    }
    io!(IO_FX) = fx;
    io!(IO_FY) = fy;
    io!(IO_CRUISE) = cruise;
    io!(IO_DASHING) = if dashing { 1.0 } else { 0.0 };
    io!(IO_THREAT) = threat;
}
