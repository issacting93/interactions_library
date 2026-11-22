//! Sense: who is near whom. The creatures' positions live here as plain columns (one array per field), and a grid over
//! them answers "who is in this cell" without looking at every creature.
//!
//! The grid is built by a counting sort, so a cell's creatures come out in rising index order: the same order the
//! tank's JavaScript grid (a Map of arrays filled by index) gives, which is what lets a seed replay the same on either.
//!
//!   order[starts[c] .. starts[c + 1]]   the creatures in cell c, where c = (gx - gx0) + (gy - gy0) * cols

/// More cells than this and the grid is not built (something is very far away): the caller falls back.
const MAX_CELLS: u64 = 1 << 22;

#[derive(Default, Debug)]
pub struct Sense {
    // columns, one entry per creature, written by the caller before `build`
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    /// Species.
    pub sp: Vec<i32>,
    /// Not 0: dead or held, so it is neither counted nor counts.
    pub skip: Vec<u8>,
    // results
    /// How many of its own kind are within a cell's width of each creature.
    pub density: Vec<f32>,
    pub order: Vec<u32>,
    pub starts: Vec<u32>,
    pub cell: f64,
    pub gx0: i32,
    pub gy0: i32,
    pub cols: u32,
    pub rows: u32,
    pub n: usize,
    cell_of: Vec<u32>,
}

impl Sense {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn capacity(&self) -> usize {
        self.x.len()
    }
    /// Room for n creatures. Grows by doubling so the columns rarely move.
    pub fn reserve(&mut self, n: usize) {
        if n <= self.capacity() {
            return;
        }
        let cap = n.next_power_of_two().max(256);
        self.x.resize(cap, 0.0);
        self.y.resize(cap, 0.0);
        self.sp.resize(cap, 0);
        self.skip.resize(cap, 0);
        self.density.resize(cap, 0.0);
        self.order.resize(cap, 0);
        self.cell_of.resize(cap, 0);
    }
    /// Build the grid over the first n creatures. False if it cannot (a position that is not a number, or creatures
    /// spread over too many cells): nothing is changed that a lookup would trust, and the caller uses its own grid.
    pub fn build(&mut self, n: usize, cell: f64) -> bool {
        self.n = 0;
        if n > self.capacity() || !(cell > 0.0) || !cell.is_finite() {
            return false;
        }
        if n == 0 {
            self.cell = cell;
            self.cols = 0;
            self.rows = 0;
            self.starts.clear();
            self.starts.push(0);
            return true;
        }
        let (mut x0, mut x1, mut y0, mut y1) = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
        for i in 0..n {
            let (gx, gy) = ((self.x[i] / cell).floor(), (self.y[i] / cell).floor());
            if !gx.is_finite() || !gy.is_finite() {
                return false;
            }
            x0 = x0.min(gx);
            x1 = x1.max(gx);
            y0 = y0.min(gy);
            y1 = y1.max(gy);
        }
        if x0 < -1e9 || x1 > 1e9 || y0 < -1e9 || y1 > 1e9 {
            return false;
        }
        let (cols, rows) = ((x1 - x0) as u64 + 1, (y1 - y0) as u64 + 1);
        if cols * rows > MAX_CELLS {
            return false;
        }
        let cells = (cols * rows) as usize;
        self.cell = cell;
        self.gx0 = x0 as i32;
        self.gy0 = y0 as i32;
        self.cols = cols as u32;
        self.rows = rows as u32;
        self.starts.clear();
        self.starts.resize(cells + 1, 0);
        for i in 0..n {
            let c = (((self.x[i] / cell).floor() - x0) as u64 + ((self.y[i] / cell).floor() - y0) as u64 * cols) as u32;
            self.cell_of[i] = c;
            self.starts[c as usize + 1] += 1;
        }
        for c in 0..cells {
            self.starts[c + 1] += self.starts[c];
        }
        // fill by rising index, so each cell lists its creatures in index order
        let mut next = self.starts[..cells].to_vec();
        for i in 0..n {
            let c = self.cell_of[i] as usize;
            self.order[next[c] as usize] = i as u32;
            next[c] += 1;
        }
        self.n = n;
        true
    }
    /// The creatures in the cell at grid position (gx, gy): empty outside the grid.
    pub fn at(&self, gx: i64, gy: i64) -> &[u32] {
        let (cx, cy) = (gx - i64::from(self.gx0), gy - i64::from(self.gy0));
        if self.n == 0 || cx < 0 || cy < 0 || cx >= i64::from(self.cols) || cy >= i64::from(self.rows) {
            return &[];
        }
        let c = (cx + cy * i64::from(self.cols)) as usize;
        &self.order[self.starts[c] as usize..self.starts[c + 1] as usize]
    }
    /// For each creature that is not skipped: how many others of its species, not skipped, are within one cell's width.
    pub fn count_density(&mut self) {
        let (n, cell) = (self.n, self.cell);
        let r2 = cell * cell;
        for i in 0..n {
            if self.skip[i] != 0 {
                self.density[i] = 0.0;
                continue;
            }
            let (fx, fy, sp) = (self.x[i], self.y[i], self.sp[i]);
            let (gx, gy) = ((fx / cell).floor() as i64, (fy / cell).floor() as i64);
            let mut cnt = 0u32;
            for ox in -1..=1 {
                for oy in -1..=1 {
                    for &j in self.at(gx + ox, gy + oy) {
                        let j = j as usize;
                        if j == i || self.skip[j] != 0 || self.sp[j] != sp {
                            continue;
                        }
                        let (dx, dy) = (self.x[j] - fx, self.y[j] - fy);
                        if dx * dx + dy * dy <= r2 {
                            cnt += 1;
                        }
                    }
                }
            }
            self.density[i] = cnt as f32;
        }
    }
    /// The nearest creature to (x, y) within max_radius that `keep` accepts, searching rings of cells outward as the
    /// tank does. For systems written in Rust; the tank's own lookups walk `starts` and `order` directly.
    pub fn nearest(&self, x: f64, y: f64, max_radius: f64, mut keep: impl FnMut(usize) -> bool) -> Option<usize> {
        let rings = ((max_radius / self.cell).ceil() as i64).max(1);
        let (gx0, gy0) = ((x / self.cell).floor() as i64, (y / self.cell).floor() as i64);
        let (mut best, mut bd) = (None, max_radius);
        for oy in -rings..=rings {
            for ox in -rings..=rings {
                for &j in self.at(gx0 + ox, gy0 + oy) {
                    let j = j as usize;
                    if !keep(j) {
                        continue;
                    }
                    let d = (self.x[j] - x).hypot(self.y[j] - y);
                    if d < bd {
                        bd = d;
                        best = Some(j);
                    }
                }
            }
        }
        best
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Rng;
    use std::collections::HashMap;

    fn scatter(n: usize, seed: u32, span: f64) -> Sense {
        let (mut s, mut r) = (Sense::new(), Rng::new(seed));
        s.reserve(n);
        for i in 0..n {
            s.x[i] = r.range(-span, span);
            s.y[i] = r.range(-span * 0.5, span);
            s.sp[i] = r.int(0, 4);
            s.skip[i] = u8::from(r.chance(0.1));
        }
        s
    }

    #[test]
    fn cells_hold_their_creatures_in_index_order() {
        let (n, cell) = (2000, 37.5);
        let mut s = scatter(n, 11, 900.0);
        assert!(s.build(n, cell));
        // the reference: a map of lists filled by index, as the JavaScript grid is
        let mut map: HashMap<(i64, i64), Vec<u32>> = HashMap::new();
        for i in 0..n {
            map.entry(((s.x[i] / cell).floor() as i64, (s.y[i] / cell).floor() as i64)).or_default().push(i as u32);
        }
        let mut seen = 0;
        for (&(gx, gy), list) in &map {
            assert_eq!(s.at(gx, gy), &list[..]);
            seen += list.len();
        }
        assert_eq!(seen, n);
        assert!(s.at(i64::from(s.gx0) - 1, i64::from(s.gy0)).is_empty());
    }
    #[test]
    fn density_matches_a_plain_count() {
        let (n, cell) = (1500, 40.0);
        let mut s = scatter(n, 5, 400.0);
        assert!(s.build(n, cell));
        s.count_density();
        for i in 0..n {
            let mut want = 0;
            if s.skip[i] == 0 {
                for j in 0..n {
                    let (dx, dy) = (s.x[j] - s.x[i], s.y[j] - s.y[i]);
                    if j != i && s.skip[j] == 0 && s.sp[j] == s.sp[i] && dx * dx + dy * dy <= cell * cell {
                        want += 1;
                    }
                }
            }
            assert_eq!(s.density[i], want as f32, "creature {i}");
        }
    }
    #[test]
    fn nearest_matches_a_plain_search() {
        let (n, cell) = (800, 30.0);
        let mut s = scatter(n, 9, 300.0);
        assert!(s.build(n, cell));
        let mut r = Rng::new(3);
        for _ in 0..200 {
            let (x, y, rad) = (r.range(-300.0, 300.0), r.range(-150.0, 300.0), r.range(5.0, 120.0));
            let got = s.nearest(x, y, rad, |j| s.skip[j] == 0);
            let (mut want, mut bd) = (None, rad);
            for j in 0..n {
                let d = (s.x[j] - x).hypot(s.y[j] - y);
                if s.skip[j] == 0 && d < bd {
                    bd = d;
                    want = Some(j);
                }
            }
            assert_eq!(got.map(|j| (s.x[j] - x).hypot(s.y[j] - y)), want.map(|j| (s.x[j] - x).hypot(s.y[j] - y)));
        }
    }
    #[test]
    fn refuses_what_it_cannot_grid() {
        let mut s = Sense::new();
        s.reserve(4);
        s.x[1] = f64::NAN;
        assert!(!s.build(2, 10.0));
        s.x[1] = 1e12;
        assert!(!s.build(2, 10.0));
        s.x[1] = 5.0;
        assert!(!s.build(2, 0.0));
        assert!(s.build(2, 10.0));
        assert!(s.build(0, 10.0));
        assert!(s.at(0, 0).is_empty());
    }
}
