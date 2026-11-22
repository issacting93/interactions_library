//! Fear: which hunters could matter to a creature. Steering used to weigh every hunter in the tank for every creature;
//! this hands it only the ones near enough, found through a grid.
//!
//! A hunter that chases matters within three neighbour radii. One that stings matters within its sting's reach of the
//! furthest point of its body, and one that lures within its lure's reach, both of which depend on the creature asking;
//! those few are kept in a short list and tested one by one. The answer is a list of hunter numbers in rising order
//! (the order steering weighs them in), and may hold a few too many but never too few: steering's own tests decide.

use crate::math::{cos, hypot, max, or, sin};
use crate::sense::Sense;

pub const CHASES: u8 = 0;
pub const STINGS: u8 = 1;
pub const LURES: u8 = 2;

#[derive(Default, Debug)]
pub struct Fear {
    // one entry per hunter, written by the caller before `build`
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub kind: Vec<u8>,
    /// Stings: its sting's reach plus its body's. Lures: its lure's reach, before the asker's own weakness for lures.
    pub a: Vec<f64>,
    /// Lures: how far ahead of it the lure hangs.
    pub b: Vec<f64>,
    // what `weigh` reads of each hunter, as it stands now
    /// Species.
    pub sp: Vec<i32>,
    /// Body length.
    pub hl: Vec<f64>,
    /// How strongly it stings and lures (0: it does not).
    pub sting: Vec<f64>,
    pub lure: Vec<f64>,
    pub ang: Vec<f64>,
    pub dash_t: Vec<f64>,
    pub alert: Vec<f64>,
    pub cloak: Vec<f64>,
    /// Not 0: it can pass for other species, so the page is asked whether it passes for this one.
    pub mimic: Vec<u8>,
    /// Seven points down its body (x then y), for a sting.
    pub body: Vec<f64>,
    /// predators[prey species * species + hunter species] is not 0 where the hunter's species is one the prey's species flees.
    pub predators: Vec<u8>,
    pub species: usize,
    /// The slot of each hunter, as they were last noted (the page writes it).
    pub hs: Vec<i32>,
    /// What `weigh` found: the force (x, y), the threat, and the way to flee (x, y).
    pub weighed: [f64; 5],
    /// The answer to the last `query`.
    pub out: Vec<u32>,
    grid: Sense,
    wide: Vec<u32>,
    r3: f64,
    n: usize,
    gridded: bool,
}

/// The distance within which a hunter matters, with a little slack for rounding.
#[inline]
fn slack(far: f64) -> f64 {
    far * 1.001 + 1.0
}

impl Fear {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn capacity(&self) -> usize {
        self.x.len()
    }
    pub fn reserve(&mut self, n: usize) {
        if n <= self.capacity() {
            return;
        }
        let cap = n.next_power_of_two().max(64);
        self.x.resize(cap, 0.0);
        self.y.resize(cap, 0.0);
        self.kind.resize(cap, 0);
        self.a.resize(cap, 0.0);
        self.b.resize(cap, 0.0);
        self.out.reserve(cap);
        for c in [&mut self.hl, &mut self.sting, &mut self.lure, &mut self.ang, &mut self.dash_t, &mut self.alert, &mut self.cloak] {
            c.resize(cap, 0.0);
        }
        self.sp.resize(cap, 0);
        self.hs.resize(cap, -1);
        self.mimic.resize(cap, 0);
        self.body.resize(cap * BODY, 0.0);
        self.grid.reserve(cap);
    }
    /// Note the first n hunters. r3 is three neighbour radii.
    pub fn build(&mut self, n: usize, r3: f64) {
        let n = n.min(self.capacity());
        self.n = n;
        self.r3 = r3;
        self.wide.clear();
        for k in 0..n {
            self.grid.x[k] = self.x[k];
            self.grid.y[k] = self.y[k];
            if self.kind[k] != CHASES {
                self.wide.push(k as u32);
            }
        }
        // a cell as wide as a chaser's reach, so the nine cells around a creature hold every chaser that could matter
        self.gridded = self.grid.build(n, slack(r3));
    }
    /// The hunters that could matter to a creature at (x, y) of body length bl, in rising order, into `out`.
    /// `lured` is how much more than most it is drawn to a lure (1 for most).
    pub fn query(&mut self, x: f64, y: f64, bl: f64, lured: f64) -> usize {
        self.out.clear();
        let far0 = slack(self.r3);
        let within = |k: usize, far: f64| {
            let (ux, uy) = (x - self.x[k], y - self.y[k]);
            !(ux * ux + uy * uy > far * far)
        };
        if self.gridded {
            let cell = self.grid.cell;
            let (gx, gy) = ((x / cell).floor(), (y / cell).floor());
            if gx.is_finite() && gy.is_finite() && gx.abs() < 1e12 && gy.abs() < 1e12 {
                for oy in -1..=1i64 {
                    for ox in -1..=1i64 {
                        for &k in self.grid.at(gx as i64 + ox, gy as i64 + oy) {
                            if self.kind[k as usize] == CHASES && within(k as usize, far0) {
                                self.out.push(k);
                            }
                        }
                    }
                }
            }
            for &k in &self.wide {
                let k = k as usize;
                let far = if self.kind[k] == STINGS { bl * 0.6 + self.a[k] } else { max(self.r3, self.a[k] * lured + self.b[k]) };
                if within(k, slack(far)) {
                    self.out.push(k as u32);
                }
            }
            self.out.sort_unstable();
        } else {
            // no grid (a hunter somewhere that is not a number): every hunter, as it used to be
            self.out.extend(0..self.n as u32);
        }
        self.out.len()
    }
}

/// Numbers per hunter in `body`: seven points, x then y.
pub const BODY: usize = 14;

/// The creature that is weighing its hunters.
#[derive(Clone, Copy, Debug)]
pub struct Prey {
    pub x: f64,
    pub y: f64,
    pub sp: usize,
    pub bl: f64,
    /// How much more than most it is drawn to a lure (1 for most).
    pub lured: f64,
    /// A swimmer walking the floor with its head down: it notices a hunter late.
    pub head_down: bool,
    /// The neighbour radius.
    pub r: f64,
    pub max_f: f64,
    /// The host has its own say on who fears whom (asked of hunters its species does not already flee).
    pub host_fears: bool,
}

impl Fear {
    /// Room for the table of which species flee which.
    pub fn set_species(&mut self, species: usize) {
        self.species = species;
        self.predators.clear();
        self.predators.resize(species * species, 0);
    }
    /// What the hunters near a creature do to its steering: the fear loop of `phSteer` in ecology-sim.js, operation for
    /// operation, over the hunters `query` finds. (fx, fy) is the force so far; the answer goes to `weighed`.
    /// `fears(k)` asks the host whether this creature fears hunter k; `mimics(k)` whether hunter k passes for its kind.
    pub fn weigh(&mut self, p: &Prey, mut fx: f64, mut fy: f64, mut fears: impl FnMut(usize) -> bool, mut mimics: impl FnMut(usize) -> bool) {
        let near = self.query(p.x, p.y, p.bl, p.lured);
        let (mut threat, mut fl_x, mut fl_y) = (0.0f64, 0.0f64, 0.0f64);
        for q in 0..near {
            let k = self.out[q] as usize;
            let (hx, hy) = (self.x[k], self.y[k]);
            let flees = p.sp < self.species && (self.sp[k] as usize) < self.species && self.predators[p.sp * self.species + self.sp[k] as usize] != 0;
            if !flees {
                if !p.host_fears {
                    continue;
                }
                let (ex, ey) = (p.x - hx, p.y - hy);
                if ex * ex + ey * ey > 9.0 * p.r * p.r || !fears(k) {
                    continue;
                }
            }
            if self.mimic[k] != 0 && mimics(k) {
                continue; // it looks like one of them: no reason to run
            }
            let (dx, dy) = (p.x - hx, p.y - hy);
            let d = or(hypot(dx, dy), 1.0);
            let hl = self.hl[k];
            let (sting, lure) = (self.sting[k], self.lure[k]);
            if sting != 0.0 && !sting.is_nan() {
                // the nearest point of its body
                let (mut dm, mut qx, mut qy) = (1e9f64, 0.0f64, 0.0f64);
                for b in 0..BODY / 2 {
                    let (ex, ey) = (p.x - self.body[k * BODY + b * 2], p.y - self.body[k * BODY + b * 2 + 1]);
                    let e = hypot(ex, ey);
                    if e < dm {
                        dm = e;
                        qx = ex;
                        qy = ey;
                    }
                }
                let rs = p.bl * 0.6 + hl * 0.12 * sting;
                if dm < rs {
                    let w = 1.0 - dm / rs;
                    fx += qx / or(dm, 1.0) * p.max_f * 2.0 * w;
                    fy += qy / or(dm, 1.0) * p.max_f * 2.0 * w;
                    threat = max(threat, w * 0.6);
                    fl_x += qx / or(dm, 1.0) * w;
                    fl_y += qy / or(dm, 1.0) * w;
                }
                continue;
            }
            if lure != 0.0 && !lure.is_nan() && self.dash_t[k] <= 0.0 {
                // a lure hangs ahead of it and draws the creature in
                let (lx, ly) = (hx + cos(self.ang[k]) * hl * 0.35, hy + sin(self.ang[k]) * hl * 0.35);
                let ld = or(hypot(lx - p.x, ly - p.y), 1.0);
                let lr = lure * hl * p.lured;
                if ld < lr {
                    let w = (1.0 - ld / lr) * p.lured;
                    fx += (lx - p.x) / ld * p.max_f * 0.7 * w;
                    fy += (ly - p.y) / ld * p.max_f * 0.7 * w;
                }
                continue;
            }
            let rf = p.r * (if self.dash_t[k] > 0.0 || self.alert[k] > 0.5 { 3.0 } else { 1.8 }) * (if self.cloak[k] > 0.6 { 0.4 } else { 1.0 }) * (if p.head_down { 0.45 } else { 1.0 });
            if d < rf {
                let w = 1.0 - d / rf;
                fx += dx / d * p.max_f * 2.2 * w;
                fy += dy / d * p.max_f * 2.2 * w;
                threat = max(threat, w);
                fl_x += dx / d * w;
                fl_y += dy / d * w;
            }
        }
        self.weighed = [fx, fy, threat, fl_x, fl_y];
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Rng;

    #[test]
    fn it_finds_every_hunter_a_plain_search_would_and_in_order() {
        let mut r = Rng::new(21);
        let (n, r3) = (400usize, 135.0);
        let mut f = Fear::new();
        f.reserve(n);
        for k in 0..n {
            f.x[k] = r.range(-500.0, 2500.0);
            f.y[k] = r.range(-300.0, 1700.0);
            f.kind[k] = if r.chance(0.1) { STINGS } else if r.chance(0.1) { LURES } else { CHASES };
            f.a[k] = r.range(20.0, 400.0);
            f.b[k] = r.range(5.0, 60.0);
        }
        f.build(n, r3);
        for _ in 0..500 {
            let (x, y, bl, lured) = (r.range(-600.0, 2600.0), r.range(-400.0, 1800.0), r.range(10.0, 120.0), r.range(1.0, 2.0));
            let got = f.query(x, y, bl, lured);
            let mut want = Vec::new();
            for k in 0..n {
                let far = match f.kind[k] {
                    STINGS => bl * 0.6 + f.a[k],
                    LURES => max(r3, f.a[k] * lured + f.b[k]),
                    _ => r3,
                };
                let far = slack(far);
                if !((x - f.x[k]).powi(2) + (y - f.y[k]).powi(2) > far * far) {
                    want.push(k as u32);
                }
            }
            assert_eq!(&f.out[..got], &want[..]);
        }
    }
    #[test]
    fn a_hunter_that_is_nowhere_means_all_of_them() {
        let mut f = Fear::new();
        f.reserve(3);
        f.x[1] = f64::NAN;
        f.build(3, 100.0);
        assert_eq!(f.query(0.0, 0.0, 10.0, 1.0), 3);
        assert_eq!(f.out, vec![0, 1, 2]);
    }
    fn one_hunter(kind: u8) -> Fear {
        let mut f = Fear::new();
        f.reserve(1);
        f.set_species(2);
        f.predators[0 * 2 + 1] = 1; // species 0 flees species 1
        f.x[0] = 100.0;
        f.y[0] = 0.0;
        f.sp[0] = 1;
        f.hl[0] = 40.0;
        f.kind[0] = kind;
        for b in 0..BODY / 2 {
            f.body[b * 2] = 100.0 + 6.0 * b as f64;
        }
        f
    }
    const PREY: Prey = Prey { x: 60.0, y: 0.0, sp: 0, bl: 20.0, lured: 1.0, head_down: false, r: 45.0, max_f: 100.0, host_fears: false };

    #[test]
    fn a_chaser_near_pushes_it_away_and_frightens_it() {
        let mut f = one_hunter(CHASES);
        f.build(1, 135.0);
        f.weigh(&PREY, 0.0, 0.0, |_| false, |_| false);
        let [fx, fy, threat, fl_x, _] = f.weighed;
        assert!(fx < 0.0 && fy == 0.0, "pushed away from the hunter");
        assert!((threat - (1.0 - 40.0 / 81.0)).abs() < 1e-12);
        assert!(fl_x < 0.0);
        // seen from further off when it is dashing
        f.dash_t[0] = 0.4;
        f.weigh(&PREY, 0.0, 0.0, |_| false, |_| false);
        assert!(f.weighed[2] > threat);
        // and barely at all when cloaked
        f.dash_t[0] = 0.0;
        f.cloak[0] = 1.0;
        f.weigh(&PREY, 0.0, 0.0, |_| false, |_| false);
        assert_eq!(f.weighed[2], 0.0);
    }
    #[test]
    fn a_species_it_does_not_flee_is_the_hosts_call_and_a_mimic_is_let_by() {
        let mut f = one_hunter(CHASES);
        f.sp[0] = 0; // its own species: not in its list
        f.build(1, 135.0);
        f.weigh(&PREY, 0.0, 0.0, |_| true, |_| false);
        assert_eq!(f.weighed[2], 0.0, "no host say, no fear");
        let p = Prey { host_fears: true, ..PREY };
        f.weigh(&p, 0.0, 0.0, |_| false, |_| false);
        assert_eq!(f.weighed[2], 0.0);
        f.weigh(&p, 0.0, 0.0, |_| true, |_| false);
        assert!(f.weighed[2] > 0.0);
        f.mimic[0] = 1;
        f.weigh(&p, 0.0, 0.0, |_| true, |_| true);
        assert_eq!(f.weighed[2], 0.0);
    }
    #[test]
    fn a_sting_pushes_from_the_nearest_point_of_the_body_and_a_lure_pulls() {
        let mut f = one_hunter(STINGS);
        f.sting[0] = 1.0;
        f.a[0] = 40.0 * 0.12 + 36.0;
        f.build(1, 135.0);
        let p = Prey { x: 118.0, y: 8.0, ..PREY };
        f.weigh(&p, 0.0, 0.0, |_| false, |_| false);
        assert!(f.weighed[1] > 0.0 && f.weighed[2] > 0.0 && f.weighed[2] <= 0.6);
        let mut f = one_hunter(LURES);
        f.lure[0] = 3.0;
        f.a[0] = 120.0;
        f.b[0] = 14.0;
        f.ang[0] = std::f64::consts::PI; // facing the prey
        f.build(1, 135.0);
        f.weigh(&PREY, 0.0, 0.0, |_| false, |_| false);
        assert!(f.weighed[0] > 0.0, "drawn toward the lure");
        assert_eq!(f.weighed[2], 0.0, "and not frightened");
        // while it dashes the lure is in, and it is a hunter like any other
        f.dash_t[0] = 0.3;
        f.weigh(&PREY, 0.0, 0.0, |_| false, |_| false);
        assert!(f.weighed[0] < 0.0 && f.weighed[2] > 0.0);
    }

    #[test]
    fn no_hunters_no_answer() {
        let mut f = Fear::new();
        f.build(0, 100.0);
        assert_eq!(f.query(5.0, 5.0, 10.0, 1.0), 0);
    }
}
