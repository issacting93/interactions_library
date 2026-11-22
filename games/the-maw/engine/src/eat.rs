//! Who is food for whom, answered in the engine from data instead of asking the page mid-step.
//!
//! The same rules as ecology-sim.js `edible` with the diet's hooks (ecology-diet.js `bodyEats`, `mineEats`, `canEat`,
//! `webEats`) and the diet's `hooks.fears`, operation for operation. The page writes what only it knows of each creature
//! into its row once a step (and again after anything that can change it mid-step): the columns E_* below. What changes
//! while steering runs (depth, position, speed, puff) is read from the row where it is used.
//!
//! `io[IO_EAT]` says how to answer: 0 ask the page (a host with rules the engine does not know), 1 the species' menus
//! alone (no hooks), 2 the diet's rules; its higher bits are the diet's switches (EAT_*).

use crate::fear::Fear;
use crate::math::{atan2, cos, hypot, max, min, sin};
use crate::world::*;

// the columns the page writes for the eating rules (after the named fields, before ROW)
/// The body's kind: its species, or -1 for the Maw.
pub const E_KIND: usize = 70;
/// The body's weight (length cubed), 0 without the web.
pub const E_W: usize = 71;
/// The body's jaw factor (0: none).
pub const E_JAW: usize = 72;
/// The diet's tier.
pub const E_TIER: usize = 73;
/// Bits, EF_*.
pub const E_FL: usize = 74;

pub const EF_DIET: u32 = 1;
pub const EF_GUEST: u32 = 2;
/// The one played by hand (diet.mine).
pub const EF_MINE: u32 = 4;
/// Its species hunts more than wisps, or it is a hunter (diet.preyer, f.hunter).
pub const EF_HUNTS: u32 = 8;
pub const EF_CLOAK: u32 = 16;
pub const EF_HARPOON: u32 = 32;
/// A leg frame it was not born with: bound to the floor.
pub const EF_LEG: u32 = 64;
/// Its behaviour grazes or spins its catch.
pub const EF_GRAZE: u32 = 128;
/// Its behaviour schools at 0.9 or more.
pub const EF_SCHOOL: u32 = 256;
// the body's flags
pub const EF_B_PLATE: u32 = 512;
pub const EF_B_CLAW: u32 = 1024;
pub const EF_B_SIEVE: u32 = 2048;
pub const EF_B_SCHOOLS: u32 = 4096;
/// It carries the sting trait (a bite on it fails, while the diet is on).
pub const EF_STING: u32 = 8192;
/// The rest after a meal, of the behaviour it steers by (BID's) and of its species' own behaviour.
pub const E_REST: usize = 75;
pub const E_REST_SP: usize = 76;

// io: how to answer, the wisp's species, the web's rules
pub const IO_EAT: usize = 12;
pub const IO_WISP: usize = 13;
pub const IO_BAND_LO: usize = 14;
pub const IO_BAND_HI: usize = 15;
pub const IO_PLATE: usize = 16;
pub const IO_CLAW: usize = 17;
/// How a bite and the end of a struggle are done: 0 by the page, 1 in the engine with no veto, 2 in the engine with the diet's sting.
pub const IO_CATCH: usize = 18;

// what happened, for the page to hear after the step (World::events, EV numbers each: kind, a slot, b slot (-1 none))
pub const EV: usize = 3;
/// a grazer or spinner swallowed b whole (a: the eater)
pub const EV_SWALLOW: f64 = 1.0;
/// a took hold of b
pub const EV_CATCH: f64 = 2.0;
/// a bit b and was stung
pub const EV_STING: f64 = 3.0;
/// a twisted free of b
pub const EV_ESCAPE: f64 = 4.0;
/// a was eaten at the end of its struggle (b: the eater)
pub const EV_EATEN: f64 = 5.0;
// bits of io[IO_EAT] above the mode (mode = value & 3)
pub const EAT_ON: u32 = 4;
pub const EAT_BODY: u32 = 8;
pub const EAT_FEAR_MINE: u32 = 16;
/// The host's say on fear is the diet's own: answered here too.
pub const EAT_FEARS: u32 = 32;

struct C<'a> {
    w: &'a World,
    size: f64,
    on: bool,
    body: bool,
}

impl C<'_> {
    #[inline]
    fn g(&self, s: usize, k: usize) -> f64 {
        self.w.f[s * ROW + k]
    }
    #[inline]
    fn fl(&self, s: usize) -> u32 {
        self.g(s, E_FL) as u32
    }
    #[inline]
    fn sp(&self, s: usize) -> usize {
        self.w.sp[s] as usize
    }
    fn menu(&self, f: usize, o: usize) -> bool {
        let n = self.w.n_species;
        self.w.prey[self.sp(f) * n + self.sp(o)] != 0
    }
    // ecology-sim.js bodyLen
    fn blen(&self, s: usize) -> f64 {
        self.size * self.g(s, SCALE) * self.g(s, DEPTH) * self.w.species[self.sp(s) * SPECIES + S_LEN]
    }
    // EcoCore.Web.eats over the two bodies (web.ts eats)
    fn web_eats(&self, f: usize, o: usize) -> bool {
        if !self.body {
            return false;
        }
        if self.g(f, E_KIND) == self.g(o, E_KIND) {
            return false;
        }
        let io = &self.w.io;
        let (ff, of) = (self.fl(f), self.fl(o));
        let mut r = self.g(f, E_W) / self.g(o, E_W);
        if of & EF_B_PLATE != 0 {
            r /= io[IO_PLATE];
        }
        let jaw = self.g(f, E_JAW);
        let edge = (if ff & EF_B_CLAW != 0 { io[IO_CLAW] } else { 1.0 }).min(if jaw > 0.0 { jaw } else { 1.0 });
        let r = r / edge;
        if r < io[IO_BAND_LO] {
            return false;
        }
        if r > io[IO_BAND_HI] {
            return ff & EF_B_SIEVE != 0 || of & EF_B_SCHOOLS != 0;
        }
        true
    }
    // ecology-diet.js canEat
    fn can_eat(&self, f: usize, o: usize, by_body: bool) -> bool {
        let (ff, of) = (self.fl(f), self.fl(o));
        if ff & EF_DIET == 0 || of & EF_DIET == 0 {
            return true;
        }
        let (ta, tb) = (self.g(f, E_TIER), self.g(o, E_TIER));
        if !by_body && tb > ta {
            return false;
        }
        if ff & EF_LEG != 0 && self.g(o, Z) < 0.6 && ff & EF_HARPOON == 0 {
            return false;
        }
        if !by_body && ta - tb >= 2.0 && ff & EF_GRAZE == 0 && of & EF_SCHOOL == 0 {
            return false;
        }
        if of & EF_CLOAK != 0 && hypot(self.g(o, VX), self.g(o, VY)) < self.size * 0.45 {
            return false;
        }
        if self.g(o, PUFF) > 0.5 && self.blen(f) < 2.0 * self.blen(o) {
            return false;
        }
        true
    }
    // ecology-diet.js mineEats
    fn mine_eats(&self, f: usize, o: usize) -> bool {
        let of = self.fl(o);
        if of & EF_GUEST != 0 || of & EF_DIET == 0 {
            return false;
        }
        if !self.body && self.sp(o) == self.sp(f) {
            return false;
        }
        if !self.body {
            return self.can_eat(f, o, false) && self.blen(o) <= self.blen(f) * 2.6;
        }
        self.web_eats(f, o) && self.can_eat(f, o, true)
    }
    // ecology-diet.js bodyEats: None leaves it to the species' menu
    fn body_eats(&self, f: usize, o: usize) -> Option<bool> {
        let (ff, of) = (self.fl(f), self.fl(o));
        if !self.body || ff & EF_DIET == 0 || of & EF_DIET == 0 || of & EF_GUEST != 0 {
            return None;
        }
        if self.menu(f, o) || ff & EF_HUNTS == 0 || self.sp(o) as f64 == self.w.io[IO_WISP] {
            return None;
        }
        Some(self.web_eats(f, o) && self.can_eat(f, o, false))
    }
    // ecology-sim.js edible, with the diet's hooks
    fn edible(&self, f: usize, o: usize) -> bool {
        let e = if !self.on { None } else if self.fl(f) & EF_MINE != 0 { Some(self.mine_eats(f, o)) } else { self.body_eats(f, o) };
        match e {
            Some(v) => v,
            None => self.menu(f, o) && (!self.on || self.can_eat(f, o, false)),
        }
    }
    // ecology-diet.js hooks.fears: does prey f run from hunter h
    fn fears(&self, f: usize, h: usize) -> bool {
        let io = self.w.io[IO_EAT] as u32;
        self.on && self.body && self.fl(f) & EF_GUEST == 0 && if self.fl(h) & EF_MINE != 0 { io & EAT_FEAR_MINE != 0 && self.web_eats(h, f) } else { self.body_eats(h, f) == Some(true) }
    }
}

fn ctx(w: &World) -> C<'_> {
    let m = w.io[IO_EAT] as u32;
    C { w, size: w.tank.size, on: m & EAT_ON != 0, body: m & EAT_BODY != 0 }
}

/// Is the creature in slot o food for the one in slot f, when the engine can say (None: ask the page).
pub fn edible(w: &World, f: usize, o: usize) -> Option<bool> {
    let m = w.io[IO_EAT] as u32;
    match m & 3 {
        1 => Some(w.prey[(w.sp[f] as usize) * w.n_species + w.sp[o] as usize] != 0),
        2 => Some(ctx(w).edible(f, o)),
        _ => None,
    }
}

/// Does the creature in slot f fear the hunter in slot h by the host's food web, when the engine can say.
pub fn fears(w: &World, f: usize, h: usize) -> Option<bool> {
    let m = w.io[IO_EAT] as u32;
    if m & 3 == 2 && m & EAT_FEARS != 0 {
        Some(ctx(w).fears(f, h))
    } else {
        None
    }
}

/// A host that answers who is food and who is feared from the rows, and asks the page the rest.
pub struct DataHost<'a, H: Host> {
    pub inner: &'a mut H,
    pub w: *mut World,
    pub fear: *mut Fear,
}

impl<H: Host> Host for DataHost<'_, H> {
    fn edible(&mut self, i: usize, j: usize) -> bool {
        // places in the list: their slots
        let w = unsafe { &*self.w };
        let (f, o) = (w.ord[i] as usize, w.ord[j] as usize);
        match edible(w, f, o) {
            Some(v) => v,
            None => self.inner.edible(i, j),
        }
    }
    fn bite(&mut self, i: usize, j: usize) -> bool {
        match unsafe { bite(self.w, i, j, self.inner) } {
            Some(v) => v,
            None => self.inner.bite(i, j),
        }
    }
    fn fears(&mut self, i: usize, k: usize) -> bool {
        let w = unsafe { &*self.w };
        let hs = if self.fear.is_null() || i == u32::MAX as usize { -1 } else { unsafe { let f = &*self.fear; *f.hs.get(k).unwrap_or(&-1) } };
        if hs >= 0 && i < w.ord.len() {
            if let Some(v) = fears(w, w.ord[i] as usize, hs as usize) {
                return v;
            }
        }
        self.inner.fears(i, k)
    }
    fn mimics(&mut self, i: usize, k: usize) -> bool {
        self.inner.mimics(i, k)
    }
    fn fear_prep(&mut self) {
        self.inner.fear_prep()
    }
    fn hunt(&mut self, i: usize) {
        self.inner.hunt(i)
    }
    fn host(&mut self, i: usize) {
        self.inner.host(i)
    }
    fn lurers(&mut self, i: usize) {
        self.inner.lurers(i)
    }
    fn struggle(&mut self, i: usize) {
        self.inner.struggle(i)
    }
    fn hold(&mut self, i: usize) -> bool {
        self.inner.hold(i)
    }
    fn catch_end(&mut self, i: usize, escaped: bool) {
        if !unsafe { catch_end(self.w, i, escaped) } {
            self.inner.catch_end(i, escaped)
        }
    }
    fn dirty(&mut self) {
        self.inner.dirty()
    }
    fn rnd(&mut self) -> f64 {
        self.inner.rnd()
    }
}

// ---- the bite and the end of a struggle (ecology-sim.js nbHost.bite, biteDo, breakFree, finishCatch), done in the rows ----

#[inline]
unsafe fn at(w: *mut World, s: usize, k: usize) -> *mut f64 {
    (*w).f.as_mut_ptr().add(s * ROW + k)
}
unsafe fn blen(w: *mut World, s: usize) -> f64 {
    (*w).tank.size * *at(w, s, SCALE) * *at(w, s, DEPTH) * *(*w).species.as_ptr().add((*(*w).sp.as_ptr().add(s) as usize) * SPECIES + S_LEN)
}
unsafe fn skip_set(w: *mut World, s: usize, bit: u8, on: bool) {
    let p = (*w).skip.as_mut_ptr().add(s);
    *p = if on { *p | bit } else { *p & !bit };
}
unsafe fn event(w: *mut World, kind: f64, a: usize, b: f64) {
    (*w).events.extend_from_slice(&[kind, a as f64, b]);
}
// what a meal rests it for, against the prey's size (mealRestMul)
unsafe fn rest_mul(w: *mut World, pred: usize, prey: usize) -> f64 {
    max(0.4, min(2.2, blen(w, prey) / max(1.0, blen(w, pred)) * 1.6 + 0.4))
}
// a slot reference that is not one the engine holds (-2) leaves the whole thing to the page
unsafe fn slot_ref(w: *mut World, s: usize, k: usize) -> Option<Option<usize>> {
    let v = *at(w, s, k);
    if v >= 0.0 {
        Some(Some(v as usize))
    } else if v == -2.0 {
        None
    } else {
        Some(None)
    }
}
// what it held lets go: the held one is no longer caught (o.holding.caught = null; o.holding = null)
unsafe fn let_go(w: *mut World, s: usize, held: Option<usize>) {
    if let Some(h) = held {
        *at(w, h, CAUGHT_BY) = -1.0;
        skip_set(w, h, CAUGHT, false);
    }
    *at(w, s, HOLDING) = -1.0;
    *at(w, s, HOLDS) = 0.0;
}

/// The bite of the creature at place i on the one at place j: Some(whether it now bites anything in reach), or None
/// when it is the page's to do (a rule the engine does not know, the Maw, a catch held by something the engine does not hold).
pub unsafe fn bite<H: Host>(w: *mut World, i: usize, j: usize, host: &mut H) -> Option<bool> {
    let mode = (*w).io[IO_CATCH] as u32;
    if mode == 0 {
        return None;
    }
    let (f, o) = (*(*w).ord.as_ptr().add(i) as usize, *(*w).ord.as_ptr().add(j) as usize);
    let cf = *at(w, f, CF) as u32;
    if cf & CF_MAW != 0 || *at(w, o, CF) as u32 & CF_MAW != 0 {
        return None;
    }
    let held = slot_ref(w, o, HOLDING)?;
    let bid = *at(w, f, BID);
    if !(bid >= 0.0) || (bid as usize + 1) * BEH > (*w).beh.len() {
        return None;
    }
    let bb = (bid as usize) * BEH;
    let bp = (*w).beh.as_ptr().add(bb);
    let b = |k: usize| *bp.add(k);
    let bites_any = |w: *mut World| truthy(b(B_GRAZE)) || truthy(b(B_SPIN_CATCH)) || b(B_DASH) == 0.0 || *at(w, f, DASH_T) > 0.0 || cf & CF_HUNTER != 0;
    // confusion: a dense school is hard to pick from
    let dv = std::ptr::addr_of!((*w).grid.density);
    let dens = if j < (*dv).len() { f64::from(*(*dv).as_ptr().add(j)) } else { 0.0 };
    let confusion = min(0.7, dens * 0.05);
    if confusion > 0.0 && host.rnd() < confusion {
        return Some(bites_any(w));
    }
    // biteDo
    (*w).io[IO_DIRTY] = 1.0;
    if truthy(b(B_GRAZE)) || truthy(b(B_SPIN_CATCH)) {
        skip_set(w, o, DEAD, true);
        *at(w, f, FULL) = *at(w, f, E_REST) * rest_mul(w, f, o);
        *at(w, f, DASH_T) = 0.0;
        *at(w, f, GULP) = 1.0;
        *at(w, f, TARGET) = -1.0;
        if held.is_some() {
            let_go(w, o, held);
        }
        event(w, EV_SWALLOW, f, o as f64);
    } else if mode == 2 && (*w).io[IO_EAT] as u32 & EAT_ON != 0 && (*at(w, o, E_FL) as u32) & (EF_DIET | EF_STING) == EF_DIET | EF_STING {
        // the diet's onCatch: a stinging prey makes the bite fail, and the hunter leaves it be a while
        *at(w, f, FULL) = max(*at(w, f, FULL), 2.0);
        *at(w, f, IGNORE) = o as f64;
        *at(w, f, IGNORE_T) = 4.0;
        *at(w, o, ALARM) = 1.0;
        event(w, EV_STING, f, o as f64);
        *at(w, f, TARGET) = -1.0;
        *at(w, f, DASH_T) = 0.0;
    } else {
        *at(w, o, CAUGHT_BY) = f as f64;
        skip_set(w, o, CAUGHT, true);
        // struggleDur(o, f)
        let r = host.rnd();
        let d = (1.1 + r * (1.8 - 1.1)) * max(0.35, min(1.4, blen(w, o) / max(1.0, blen(w, f)) + 0.3));
        *at(w, o, STRUGGLE_T) = d;
        *at(w, o, STRUGGLE_T0) = d;
        *at(w, f, HOLDING) = o as f64;
        *at(w, f, HOLDS) = 1.0;
        *at(w, f, DASH_T) = 0.0;
        *at(w, f, TARGET) = -1.0;
        event(w, EV_CATCH, f, o as f64);
    }
    Some(bites_any(w))
}

/// The end of the struggle of the creature at place i (its holder is one the engine holds, alive, not the Maw: struggle
/// in world.rs has seen to that): it twists free or is eaten. False when it is the page's to do.
pub unsafe fn catch_end(w: *mut World, i: usize, escaped: bool) -> bool {
    if (*w).io[IO_CATCH] as u32 == 0 {
        return false;
    }
    let prey = *(*w).ord.as_ptr().add(i) as usize;
    let pred = *at(w, prey, CAUGHT_BY);
    if !(pred >= 0.0) {
        return false;
    }
    let pred = pred as usize;
    let Some(held) = slot_ref(w, prey, HOLDING) else { return false };
    (*w).io[IO_DIRTY] = 1.0;
    *at(w, prey, CAUGHT_BY) = -1.0;
    skip_set(w, prey, CAUGHT, false);
    if escaped {
        // breakFree
        *at(w, prey, ALARM) = 1.0;
        *at(w, prey, COOL) = 1.5;
        let a = atan2(*at(w, prey, Y) - *at(w, pred, Y), *at(w, prey, X) - *at(w, pred, X));
        *at(w, prey, DASH_T) = 0.7;
        *at(w, prey, DASH_ANG) = a;
        *at(w, prey, FLEE_X) = cos(a);
        *at(w, prey, FLEE_Y) = sin(a);
        *at(w, pred, HOLDING) = -1.0;
        *at(w, pred, HOLDS) = 0.0;
        *at(w, pred, COOL) = 2.5;
        *at(w, pred, TARGET) = -1.0;
        *at(w, pred, IGNORE) = prey as f64;
        *at(w, pred, IGNORE_T) = 4.0;
        event(w, EV_ESCAPE, prey, pred as f64);
    } else {
        // finishCatch
        skip_set(w, prey, DEAD, true);
        *at(w, pred, HOLDING) = -1.0;
        *at(w, pred, HOLDS) = 0.0;
        *at(w, pred, FULL) = *at(w, pred, E_REST_SP) * rest_mul(w, pred, prey);
        *at(w, pred, GULP) = 1.0;
        *at(w, pred, TARGET) = -1.0;
        if held.is_some() {
            let_go(w, prey, held);
        }
        event(w, EV_EATEN, prey, pred as f64);
    }
    true
}

/// JavaScript's truth of a number: neither 0 nor NaN.
#[inline]
fn truthy(x: f64) -> bool {
    x != 0.0 && !x.is_nan()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Rnd(f64);
    impl Host for Rnd {
        fn edible(&mut self, _: usize, _: usize) -> bool { panic!("asked the page") }
        fn bite(&mut self, _: usize, _: usize) -> bool { panic!("asked the page") }
        fn fears(&mut self, _: usize, _: usize) -> bool { panic!("asked the page") }
        fn mimics(&mut self, _: usize, _: usize) -> bool { false }
        fn fear_prep(&mut self) {}
        fn hunt(&mut self, _: usize) {}
        fn host(&mut self, _: usize) {}
        fn lurers(&mut self, _: usize) {}
        fn struggle(&mut self, _: usize) {}
        fn hold(&mut self, _: usize) -> bool { true }
        fn catch_end(&mut self, _: usize, _: bool) { panic!("asked the page") }
        fn dirty(&mut self) {}
        fn rnd(&mut self) -> f64 { self.0 }
    }

    /// Two creatures: a hunter (species 0, slot 1, place 0) and its prey (species 1, slot 0, place 1), with the diet's rules.
    fn two() -> World {
        let mut w = World::new();
        w.reserve(2);
        w.reserve_list(2, 0);
        w.set_species(2);
        w.reserve_tables(1, 0);
        for s in 0..2 {
            w.species[s * SPECIES + S_LEN] = 1.0;
        }
        w.prey[1] = 1; // species 0 eats species 1
        w.ord[0] = 1;
        w.ord[1] = 0;
        w.n = 2;
        w.tank.size = 40.0;
        w.io[IO_EAT] = f64::from(2 | EAT_ON | EAT_BODY);
        w.io[IO_WISP] = -1.0;
        w.io[IO_BAND_LO] = 2.0;
        w.io[IO_BAND_HI] = 100.0;
        w.io[IO_PLATE] = 2.0;
        w.io[IO_CLAW] = 0.6;
        w.io[IO_CATCH] = 2.0;
        w.sp[1] = 0;
        w.sp[0] = 1;
        for (s, kind, len, tier) in [(1usize, 0.0, 2.0, 1.0), (0, 1.0, 1.0, 0.0)] {
            let r = s * ROW;
            w.f[r + SCALE] = 1.0;
            w.f[r + DEPTH] = 1.0;
            w.f[r + CAUGHT_BY] = -1.0;
            w.f[r + HOLDING] = -1.0;
            w.f[r + TARGET] = -1.0;
            w.f[r + E_KIND] = kind;
            w.f[r + E_W] = len * len * len;
            w.f[r + E_TIER] = tier;
            w.f[r + E_FL] = f64::from(EF_DIET | EF_HUNTS);
            w.f[r + E_REST] = 3.0;
            w.f[r + E_REST_SP] = 3.0;
        }
        w.f[ROW + DASH_T] = 1.0; // the hunter is mid-dash
        w.f[ROW + BID] = 0.0;
        w.beh[B_DASH] = 1.0; // it dashes (so it bites anything only while dashing)
        w
    }

    #[test]
    fn the_menu_then_the_body() {
        let mut w = two();
        // on its menu: food, and the diet's own conditions hold (a tier at or below its own)
        assert_eq!(edible(&w, 1, 0), Some(true));
        w.f[E_TIER] = 2.0; // the prey grows a tier above it
        assert_eq!(edible(&w, 1, 0), Some(false));
        w.f[E_TIER] = 0.0;
        // off its menu, it hunts: by the bodies (8 times heavier: food)
        w.prey[1] = 0;
        assert_eq!(edible(&w, 1, 0), Some(true));
        w.f[ROW + E_W] = 1.5; // too near its own weight
        assert_eq!(edible(&w, 1, 0), Some(false));
        // ... and the prey runs from it only by the bodies too
        w.f[ROW + E_W] = 8.0;
        assert_eq!(fears(&w, 0, 1), None, "the host's say on fear is not the diet's");
        w.io[IO_EAT] += f64::from(EAT_FEARS);
        assert_eq!(fears(&w, 0, 1), Some(true));
        // menus alone (no hooks)
        w.io[IO_EAT] = 1.0;
        assert_eq!(edible(&w, 1, 0), Some(false));
    }

    #[test]
    fn a_bite_holds_and_a_sting_fails() {
        let mut w = two();
        let mut h = Rnd(0.5);
        let got = unsafe { bite(&mut w, 0, 1, &mut h) };
        assert_eq!(got, Some(false), "it stopped dashing: no longer bites anything in reach");
        assert_eq!(w.f[CAUGHT_BY], 1.0);
        assert_eq!(w.skip[0], CAUGHT);
        assert_eq!(w.f[ROW + HOLDING], 0.0);
        assert!(w.f[STRUGGLE_T] > 0.0);
        assert_eq!(w.events, vec![EV_CATCH, 1.0, 0.0]);
        // eaten at the end of the struggle
        assert!(unsafe { catch_end(&mut w, 1, false) });
        assert_eq!(w.skip[0], DEAD);
        assert_eq!(w.f[ROW + HOLDING], -1.0);
        assert_eq!(w.f[ROW + FULL], 3.0 * 2.0, "rest times the meal's size: prey as long as itself");
        assert_eq!(&w.events[3..], &[EV_EATEN, 0.0, 1.0]);

        let mut w = two();
        w.f[E_FL] = f64::from(EF_DIET | EF_STING);
        unsafe { bite(&mut w, 0, 1, &mut h) };
        assert_eq!(w.skip[0], 0, "stung: nothing taken");
        assert_eq!(w.f[ROW + IGNORE], 0.0);
        assert_eq!(w.f[ROW + FULL], 2.0);
        assert_eq!(w.events, vec![EV_STING, 1.0, 0.0]);
    }
}
