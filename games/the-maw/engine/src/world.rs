//! The swimmers' world: every creature's numbers live here, one column per field, one row (a slot) per creature.
//! The page's creature objects read and write these columns directly, so nothing is copied in or out: sensing,
//! the neighbour pass of steering and movement all work on them in place.
//!
//! A creature keeps its slot for as long as it lives. The page's list of creatures is in its own order (it is sorted
//! for drawing, added to and cut from), so each step the page says which slot stands at each place in its list
//! (`ord`); the grid and the passes number creatures by place, as the page does, and look their slot up here.

use crate::math::{hypot, max, or};
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
/// How many fields.
pub const FIELDS: usize = 23;
/// Numbers per creature in `f` (the fields, and one spare so a row is a round size).
pub const ROW: usize = 24;

// the columns of `species`: what a species' swim gives every creature of it
pub const S_SEP: usize = 0;
pub const S_LEN: usize = 1;
pub const S_SPEED: usize = 2;
pub const S_WAVES: usize = 3;
pub const S_BEND: usize = 4;
pub const S_WING: usize = 5;
/// Not 0: the species hunts.
pub const S_PRED: usize = 6;
pub const SPECIES: usize = 7;

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
