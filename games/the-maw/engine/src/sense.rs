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
    // more columns, read by the neighbour pass of steering (`neighbours`)
    pub z: Vec<f64>,
    pub vx: Vec<f64>,
    pub vy: Vec<f64>,
    /// How much room it keeps: scale times depth times its species' separation.
    pub sepw: Vec<f64>,
    /// Body length.
    pub blen: Vec<f64>,
    pub alarm: Vec<f64>,
    pub flee_x: Vec<f64>,
    pub flee_y: Vec<f64>,
    /// The middle of its spine.
    pub mid_x: Vec<f64>,
    pub mid_y: Vec<f64>,
    /// Not 0: its species hunts.
    pub pred: Vec<u8>,
    /// What `neighbours` found for one creature (see the NB_ names).
    pub out: [f64; NB_OUT],
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
        for c in [&mut self.z, &mut self.vx, &mut self.vy, &mut self.sepw, &mut self.blen, &mut self.alarm, &mut self.flee_x, &mut self.flee_y, &mut self.mid_x, &mut self.mid_y] {
            c.resize(cap, 0.0);
        }
        self.pred.resize(cap, 0);
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

// ---- the neighbour pass of steering ----

/// Numbers in `Sense::out`.
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
pub const NB_LEAD: usize = 15; // the nearest of its kind ahead, for those that swim in a train: its index, or -1
pub const NB_LEAD_D: usize = 16;

/// What steering knows about the one creature whose neighbours are being read.
#[derive(Clone, Copy, Debug)]
pub struct Nb {
    /// The neighbour radius.
    pub r: f64,
    pub body_px: f64,
    /// The tank's depth scale.
    pub dz: f64,
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

/// Read creature i's neighbours from the grid into `out`: `phSteer`'s neighbour loop in ecology-sim.js, operation for
/// operation and in the same order.
///
/// A bite is the host's business: when a neighbour is within biting reach, `edible(i, j)` asks whether it is food and
/// `bite(i, j)` lets the host do the biting; `bite` returns the new `bite_any`. The host may change any column during
/// either call (a bite kills, frees and frightens), so this reads the columns through the pointer afresh every time
/// and holds nothing across a call.
///
/// # Safety
/// `this` must point to a live `Sense` whose grid was built, with i inside it.
pub unsafe fn neighbours(this: *mut Sense, i: usize, p: &Nb, mut edible: impl FnMut(usize, usize) -> bool, mut bite: impl FnMut(usize, usize) -> bool) {
    use crate::math::{hypot, max, or};
    macro_rules! col {
        ($f:ident, $j:expr) => {
            *(*this).$f.as_ptr().add($j)
        };
    }
    let cell = (*this).cell;
    let (gx, gy) = ((col!(x, i) / cell).floor() as i64, (col!(y, i) / cell).floor() as i64);
    let (mut sx, mut sy, mut ax, mut ay, mut cx, mut cy, mut zs, mut n) = (0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let (mut al_x, mut al_y, mut al_n, mut al_c, mut cx2, mut cy2, mut n2) = (0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let (mut lead, mut lead_d) = (-1.0f64, 1e9f64);
    let mut bite_any = p.bite_any;
    for ox in -1..=1i64 {
        for oy in -1..=1i64 {
            // the cell's stretch of `order`: the grid itself does not change during the pass
            let (cxi, cyi) = (gx + ox - i64::from((*this).gx0), gy + oy - i64::from((*this).gy0));
            if (*this).n == 0 || cxi < 0 || cyi < 0 || cxi >= i64::from((*this).cols) || cyi >= i64::from((*this).rows) {
                continue;
            }
            let c = (cxi + cyi * i64::from((*this).cols)) as usize;
            let (q0, q1) = (*(*this).starts.as_ptr().add(c) as usize, *(*this).starts.as_ptr().add(c + 1) as usize);
            for q in q0..q1 {
                let j = *(*this).order.as_ptr().add(q) as usize;
                if j == i || col!(skip, j) != 0 {
                    continue;
                }
                let (fx, fy, fz) = (col!(x, i), col!(y, i), col!(z, i));
                let (dx, dy) = (col!(x, j) - fx, col!(y, j) - fy);
                let d2 = dx * dx + dy * dy;
                if d2 > p.r * p.r || d2 < 1e-6 {
                    continue;
                }
                if p.can_bite && d2 < p.reach * p.reach && (col!(z, j) - fz).abs() * p.dz < p.bite_tol && (bite_any || d2 < p.reach * p.reach * 0.36) && edible(i, j) {
                    bite_any = bite(i, j);
                    continue;
                }
                let d = d2.sqrt();
                let z_near = max(0.0, 1.0 - (col!(z, j) - fz).abs() * 4.0 * p.dz);
                if z_near <= 0.0 {
                    continue;
                }
                let sep = p.body_px * 0.6 * (col!(sepw, i) + col!(sepw, j)) * p.sep_mul;
                let (mx, my) = (col!(mid_x, j) - fx, col!(mid_y, j) - fy);
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
                let (fvx, fvy) = (col!(vx, i), col!(vy, i));
                if (dx * fvx + dy * fvy) < -0.5 * d * p.sp0 {
                    continue; // behind it: not seen
                }
                let (same, fpred) = (col!(sp, j) == col!(sp, i), col!(pred, i) != 0);
                if p.personal && !same && !fpred && col!(pred, j) == 0 && col!(blen, j) > p.bl * 1.3 {
                    cx2 += col!(x, j);
                    cy2 += col!(y, j);
                    n2 += 1.0;
                }
                if !same {
                    continue;
                }
                ax += col!(vx, j);
                ay += col!(vy, j);
                cx += col!(x, j);
                cy += col!(y, j);
                zs += col!(z, j);
                n += 1.0;
                al_c += 1.0;
                let alarm = col!(alarm, j);
                if alarm > 0.05 {
                    al_x += col!(flee_x, j) * alarm;
                    al_y += col!(flee_y, j) * alarm;
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
    const NB: Nb = Nb { r: 60.0, body_px: 40.0, dz: 1.0, personal: true, can_bite: false, reach: 0.0, bite_tol: 0.25, bite_any: true, sep_mul: 1.0, train: false, bl: 40.0, sp0: 1.0 };

    fn pair(dx: f64, same: bool) -> Sense {
        let mut s = Sense::new();
        s.reserve(2);
        for i in 0..2 {
            s.x[i] = 100.0 + dx * i as f64;
            s.y[i] = 100.0;
            s.z[i] = 0.5;
            s.vx[i] = 1.0;
            s.sepw[i] = 1.0;
            s.blen[i] = 40.0;
            s.mid_x[i] = s.x[i] - 20.0;
            s.mid_y[i] = 100.0;
            s.sp[i] = if same { 0 } else { i as i32 };
        }
        assert!(s.build(2, 60.0));
        s
    }

    #[test]
    fn a_neighbour_too_near_pushes_away_and_its_own_kind_is_counted() {
        let mut s = pair(10.0, true);
        unsafe { neighbours(&mut s, 0, &NB, |_, _| false, |_, _| true) };
        assert!(s.out[NB_SX] < 0.0, "pushed back from the one ahead");
        assert_eq!(s.out[NB_N], 1.0);
        assert_eq!(s.out[NB_CX], 110.0);
        assert_eq!(s.out[NB_LEAD], -1.0);
        // the one behind is not seen, but still keeps its distance
        unsafe { neighbours(&mut s, 1, &NB, |_, _| false, |_, _| true) };
        assert_eq!(s.out[NB_N], 0.0);
        assert!(s.out[NB_SX] > 0.0);
    }
    #[test]
    fn another_kind_is_not_schooled_with_and_a_train_follows_the_one_ahead() {
        let mut s = pair(10.0, false);
        unsafe { neighbours(&mut s, 0, &NB, |_, _| false, |_, _| true) };
        assert_eq!(s.out[NB_N], 0.0);
        let mut s = pair(30.0, true);
        unsafe { neighbours(&mut s, 0, &Nb { train: true, ..NB }, |_, _| false, |_, _| true) };
        assert_eq!(s.out[NB_LEAD], 1.0);
        assert_eq!(s.out[NB_LEAD_D], 30.0);
    }
    #[test]
    fn a_bite_is_the_hosts_and_what_it_changes_is_seen_at_once() {
        let mut s = pair(10.0, false);
        s.reserve(3);
        s.x[2] = 112.0;
        s.y[2] = 100.0;
        s.z[2] = 0.5;
        s.sp[2] = 0;
        s.vx[2] = 1.0;
        s.sepw[2] = 1.0;
        assert!(s.build(3, 60.0));
        let p = Nb { can_bite: true, reach: 15.0, ..NB };
        let this: *mut Sense = &mut s;
        let (mut asked, mut bitten) = (Vec::new(), Vec::new());
        // the host eats creature 1 and, in the same bite, takes creature 2 out as well: 2 must not be counted afterwards
        unsafe {
            neighbours(this, 0, &p, |_, j| { asked.push(j); j == 1 }, |_, j| { bitten.push(j); *(*this).skip.as_mut_ptr().add(1) = 1; *(*this).skip.as_mut_ptr().add(2) = 1; true })
        };
        assert_eq!(asked, vec![1]);
        assert_eq!(bitten, vec![1]);
        assert_eq!(s.out[NB_N], 0.0);
        assert_eq!(s.out[NB_SX], 0.0);
    }
    #[test]
    fn out_of_reach_is_never_asked_about() {
        let mut s = pair(40.0, false);
        let mut asked = 0;
        unsafe { neighbours(&mut s, 0, &Nb { can_bite: true, reach: 15.0, ..NB }, |_, _| { asked += 1; true }, |_, _| true) };
        assert_eq!(asked, 0);
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
