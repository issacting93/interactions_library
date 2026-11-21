//! Fear: which hunters could matter to a creature. Steering used to weigh every hunter in the tank for every creature;
//! this hands it only the ones near enough, found through a grid.
//!
//! A hunter that chases matters within three neighbour radii. One that stings matters within its sting's reach of the
//! furthest point of its body, and one that lures within its lure's reach, both of which depend on the creature asking;
//! those few are kept in a short list and tested one by one. The answer is a list of hunter numbers in rising order
//! (the order steering weighs them in), and may hold a few too many but never too few: steering's own tests decide.

use crate::math::max;
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
    #[test]
    fn no_hunters_no_answer() {
        let mut f = Fear::new();
        f.build(0, 100.0);
        assert_eq!(f.query(5.0, 5.0, 10.0, 1.0), 0);
    }
}
