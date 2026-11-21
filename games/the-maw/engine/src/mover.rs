//! Move: the swimmers' movement. What steering wished for (a force) becomes velocity, a turn no sharper than the
//! creature can make, a new position kept out of solid things, the spine that trails behind the head, and the eased
//! body state the drawing reads (bank, tuck, puff, glide, wing beat).
//!
//! This is `phMove` of shared/engine/ecology/ecology-sim.js, operation for operation, so that a seed gives the same
//! numbers with it or with the JavaScript. Keep the order of arithmetic when editing: a regrouped sum rounds differently.
//!
//! Each creature that moves this step is one row of `rows` (see the column names below) plus its spine in `chain`
//! (K points, x then y), `cz` (the spine's depth) and `croll` (its roll), which are 32-bit as the tank keeps them.

use crate::math::{atan2, cos, hypot, max, min, or, sign, sin, smooth, wrap, DEG};

/// Spine points per creature.
pub const K: usize = 20;
/// Numbers per creature in `rows`.
pub const STRIDE: usize = 40;

// position and motion (read and written)
pub const X: usize = 0;
pub const Y: usize = 1;
pub const Z: usize = 2;
pub const VX: usize = 3;
pub const VY: usize = 4;
pub const ANG: usize = 5;
// what it is right now (read)
pub const DEPTH: usize = 6;
pub const SCALE: usize = 7;
pub const ALARM: usize = 8;
pub const SPIN_T: usize = 9;
pub const FLAGS: usize = 10;
pub const TUCK_GOAL: usize = 11;
pub const GROUND: usize = 12;
// the wish from steering (read)
pub const FX: usize = 13;
pub const FY: usize = 14;
pub const CRUISE: usize = 15;
pub const THREAT: usize = 16;
// eased body state (read and written)
pub const TURN_S: usize = 17;
pub const TUCK: usize = 18;
pub const PUFF: usize = 19;
pub const ALERT: usize = 20;
pub const CLOAK: usize = 21;
pub const GLIDE: usize = 22;
pub const FLAP: usize = 23;
pub const PHASE: usize = 24;
pub const FADE: usize = 25;
// its species' swim and its behaviour (read)
pub const SW_SPEED: usize = 26;
pub const SW_LEN: usize = 27;
pub const SW_WAVES: usize = 28;
pub const SW_BEND: usize = 29;
pub const WING: usize = 30;
pub const SPEED_MUL: usize = 31;
pub const DASH_MULT: usize = 32;
pub const MIN_SP: usize = 33;
pub const TURN: usize = 34;
pub const B_GLIDE: usize = 35;

// bits of FLAGS
pub const F_DASHING: u32 = 1;
pub const F_TARGET: u32 = 2;
pub const F_PUFFS: u32 = 4;
/// Its behaviour both chases and dashes.
pub const F_CHASE_DASH: u32 = 8;
pub const F_CLOAKS: u32 = 16;
pub const F_PULSES: u32 = 32;

/// Numbers per solid in `solids`: x, y, x0, y0, x1, y1, is-a-wall (1) or a post (0), radius, top.
pub const SOLID: usize = 9;

/// The tank's settings a step of movement reads.
#[derive(Clone, Copy, Debug)]
pub struct Tank {
    pub max_sp: f64,
    pub max_f: f64,
    /// Creatures behave by their species (the tank's "beh" is on).
    pub personal: bool,
    pub size: f64,
    pub speed: f64,
    pub bank: f64,
    pub flex: f64,
    pub depth: f64,
}

#[derive(Default, Debug)]
pub struct Mover {
    pub rows: Vec<f64>,
    pub chain: Vec<f32>,
    pub cz: Vec<f32>,
    pub croll: Vec<f32>,
    pub solids: Vec<f64>,
}

impl Mover {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn capacity(&self) -> usize {
        self.rows.len() / STRIDE
    }
    pub fn reserve(&mut self, n: usize) {
        if n <= self.capacity() {
            return;
        }
        let cap = n.next_power_of_two().max(128);
        self.rows.resize(cap * STRIDE, 0.0);
        self.chain.resize(cap * K * 2, 0.0);
        self.cz.resize(cap * K, 0.0);
        self.croll.resize(cap * K, 0.0);
    }
    pub fn reserve_solids(&mut self, n: usize) {
        if n * SOLID > self.solids.len() {
            self.solids.resize(n.next_power_of_two().max(16) * SOLID, 0.0);
        }
    }
    /// Move the first n creatures by dt, among the first `solids` solids.
    pub fn step(&mut self, n: usize, solids: usize, dt: f64, t: &Tank) {
        let n = n.min(self.capacity());
        let solids = &self.solids[..(solids * SOLID).min(self.solids.len())];
        for i in 0..n {
            move_one(
                &mut self.rows[i * STRIDE..(i + 1) * STRIDE],
                &mut self.chain[i * K * 2..(i + 1) * K * 2],
                &mut self.cz[i * K..(i + 1) * K],
                &mut self.croll[i * K..(i + 1) * K],
                solids,
                dt,
                t,
            );
        }
    }
}

/// Move one creature: its row of numbers and its spine.
pub fn move_one(r: &mut [f64], chain: &mut [f32], cz: &mut [f32], croll: &mut [f32], solids: &[f64], dt: f64, t: &Tank) {
    let flags = r[FLAGS] as u32;
    let (dashing, target) = (flags & F_DASHING != 0, flags & F_TARGET != 0);
    let personal = t.personal;
    let (cruise, threat) = (r[CRUISE], r[THREAT]);
    let (scale, depth) = (r[SCALE], r[DEPTH]);

    // the wish, capped, into velocity
    let (mut fx, mut fy) = (r[FX], r[FY]);
    let fm = hypot(fx, fy);
    let fcap = t.max_f * if dashing { 6.0 } else { 3.0 };
    if fm > fcap {
        fx *= fcap / fm;
        fy *= fcap / fm;
    }
    let (mut vx, mut vy) = (r[VX] + fx * dt, r[VY] + fy * dt);
    let mut sp = hypot(vx, vy);
    let cap = t.max_sp * (0.85 + 0.3 * scale) * r[SW_SPEED] * r[SPEED_MUL] * (if dashing { r[DASH_MULT] } else { cruise }) * (1.0 + 0.45 * min(1.0, threat + r[ALARM] * 0.5));
    let min_sp = t.max_sp * r[MIN_SP];
    if sp > cap {
        let k = if dashing { cap / sp } else { 1.0 - min(1.0, dt * 3.0) * (1.0 - cap / sp) };
        vx *= k;
        vy *= k;
        sp = hypot(vx, vy);
    }
    if sp < min_sp {
        let k = min_sp / or(sp, 1.0);
        vx *= k;
        vy *= k;
        sp = min_sp;
    }

    // turn toward where it is going, no faster than it can
    let want = atan2(vy, vx);
    let mut d_a = wrap(want - r[ANG]);
    let max_turn = r[TURN] * DEG * dt * if r[SPIN_T] > 0.0 { 3.0 } else { 1.0 };
    if d_a.abs() > max_turn {
        d_a = sign(d_a) * max_turn;
        let a = r[ANG] + d_a;
        vx = cos(a) * sp;
        vy = sin(a) * sp;
    }
    let ang = wrap(r[ANG] + d_a);
    let (mut x, mut y, mut z) = (r[X] + vx * dt * depth, r[Y] + vy * dt * depth, r[Z]);

    // it cannot be inside a solid: coming down onto the top it lands there, from the side it is put back out
    for so in solids.chunks_exact(SOLID) {
        let (radius, z_top) = (so[7], so[8]);
        if z <= z_top {
            continue;
        }
        let (d, nx, ny) = solid_near(so, x, y);
        if d >= radius {
            continue;
        }
        if z - z_top < 0.04 {
            z = z_top;
            continue;
        }
        let push = radius - d;
        x += nx * push;
        y += ny * push;
        let vn = vx * nx + vy * ny;
        if vn < 0.0 {
            vx -= vn * nx;
            vy -= vn * ny;
        }
    }

    // the spine follows the head: each point a segment behind the last, bending no more than the body allows
    let body_len = t.size * scale * depth * r[SW_LEN];
    let seg = body_len / (K as f64 - 1.0);
    let max_bend = t.flex * DEG * r[SW_BEND] * 11.0 / (K as f64 - 1.0);
    chain[0] = x as f32;
    chain[1] = y as f32;
    let mut prev = atan2(-vy, -vx);
    for i in 1..K {
        let (px, py) = (f64::from(chain[(i - 1) * 2]), f64::from(chain[(i - 1) * 2 + 1]));
        let mut a = atan2(f64::from(chain[i * 2 + 1]) - py, f64::from(chain[i * 2]) - px);
        let d = atan2(sin(a - prev), cos(a - prev));
        if d > max_bend {
            a = prev + max_bend;
        } else if d < -max_bend {
            a = prev - max_bend;
        }
        chain[i * 2] = (px + cos(a) * seg) as f32;
        chain[i * 2 + 1] = (py + sin(a) * seg) as f32;
        prev = a;
    }

    // the spine's depth and roll trail the same way (the roll banks into the turn, by last step's turn rate)
    let k = max(0.0, min(1.0, sp * dt / max(1.0, seg) * 1.2));
    let roll_goal = max(-1.1, min(1.1, -r[TURN_S] * t.bank * (1.0 + 0.6 * r[WING]) * 1.3));
    let max_span = body_len * 1.2;
    cz[0] = (z * t.depth) as f32;
    croll[0] = (f64::from(croll[0]) + (roll_goal - f64::from(croll[0])) * min(1.0, dt * 5.0)) as f32;
    for i in 1..K {
        cz[i] = (f64::from(cz[i]) + (f64::from(cz[i - 1]) - f64::from(cz[i])) * k) as f32;
        let d = f64::from(cz[i]) - f64::from(cz[0]);
        if d > max_span {
            cz[i] = (f64::from(cz[0]) + max_span) as f32;
        } else if d < -max_span {
            cz[i] = (f64::from(cz[0]) - max_span) as f32;
        }
        croll[i] = (f64::from(croll[i]) + (f64::from(croll[i - 1]) - f64::from(croll[i])) * k) as f32;
    }

    // the eased body state the drawing reads
    let tuck_goal = or(r[TUCK_GOAL], 0.0);
    let turn_rate = if dt > 0.0 { d_a / dt / (min(r[TURN], 300.0) * DEG) } else { 0.0 };
    let turn_s = smooth(r[TURN_S], max(-1.0, min(1.0, turn_rate)), 6.0, dt);
    let tuck = smooth(r[TUCK], if personal { if dashing { 1.0 } else { tuck_goal } } else { 0.0 }, if dashing { 10.0 } else { 4.0 }, dt);
    let puff = smooth(r[PUFF], if personal && flags & F_PUFFS != 0 { min(1.0, threat * 1.6) } else { 0.0 }, if threat > 0.1 { 5.0 } else { 0.7 }, dt);
    let alert = smooth(r[ALERT], if personal && ((flags & F_CHASE_DASH != 0 && target) || (dashing && target)) { 1.0 } else { 0.0 }, 4.0, dt);
    let cloak = smooth(r[CLOAK], if personal && flags & F_CLOAKS != 0 && target && !dashing { 1.0 } else { 0.0 }, if dashing { 8.0 } else { 0.8 }, dt);
    let b_glide = r[B_GLIDE];
    let glide_goal = if personal {
        if b_glide != 0.0 && !b_glide.is_nan() { b_glide * if dashing { 0.0 } else { 1.0 } } else { max(0.0, 0.6 - sp / max(1.0, cap)) * 0.5 }
    } else {
        0.0
    };
    let glide = smooth(r[GLIDE], glide_goal, 2.0, dt);
    let flap = (1.0 - 0.6 * glide) * (1.0 - 0.4 * tuck) * (1.0 + 0.6 * puff) * (1.0 - 0.7 * or(r[GROUND], 0.0));
    let beat = if flags & F_PULSES != 0 { 2.0 + 10.0 * tuck_goal } else { 3.0 + 9.0 * sp / t.max_sp };
    let phase = r[PHASE] + dt * beat * t.speed.sqrt() / (scale * max(0.6, r[SW_LEN] / r[SW_WAVES])).sqrt();
    if r[FADE] < 1.0 {
        r[FADE] = min(1.0, r[FADE] + dt * 0.8);
    }

    r[X] = x;
    r[Y] = y;
    r[Z] = z;
    r[VX] = vx;
    r[VY] = vy;
    r[ANG] = ang;
    r[TURN_S] = turn_s;
    r[TUCK] = tuck;
    r[PUFF] = puff;
    r[ALERT] = alert;
    r[CLOAK] = cloak;
    r[GLIDE] = glide;
    r[FLAP] = flap;
    r[PHASE] = phase;
}

/// How far (x, y) is from a solid's centre line, and the way out of it.
pub fn solid_near(so: &[f64], x: f64, y: f64) -> (f64, f64, f64) {
    let (mut qx, mut qy) = (so[0], so[1]);
    if so[6] != 0.0 {
        let (x0, y0) = (so[2], so[3]);
        let (ex, ey) = (so[4] - x0, so[5] - y0);
        let l2 = ex * ex + ey * ey;
        let mut u = if l2 != 0.0 && !l2.is_nan() { ((x - x0) * ex + (y - y0) * ey) / l2 } else { 0.0 };
        u = max(0.0, min(1.0, u));
        qx = x0 + ex * u;
        qy = y0 + ey * u;
    }
    let (dx, dy) = (x - qx, y - qy);
    let d = hypot(dx, dy);
    if d > 1e-6 { (d, dx / d, dy / d) } else { (d, 1.0, 0.0) }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TANK: Tank = Tank { max_sp: 64.0, max_f: 140.8, personal: true, size: 40.0, speed: 1.0, bank: 1.0, flex: 1.0, depth: 600.0 };

    fn one(m: &mut Mover) -> &mut [f64] {
        m.reserve(1);
        let r = &mut m.rows[..STRIDE];
        r.fill(0.0);
        for (k, v) in [(DEPTH, 1.0), (SCALE, 1.0), (CRUISE, 1.0), (SW_SPEED, 1.0), (SW_LEN, 1.0), (SW_WAVES, 1.0), (SW_BEND, 1.0), (SPEED_MUL, 1.0), (DASH_MULT, 1.8), (MIN_SP, 0.35), (TURN, 180.0), (FADE, 1.0), (VX, 30.0)] {
            r[k] = v;
        }
        r
    }

    #[test]
    fn it_moves_the_way_it_is_going() {
        let mut m = Mover::new();
        one(&mut m);
        m.step(1, 0, 1.0 / 60.0, &TANK);
        let r = &m.rows[..STRIDE];
        assert!((r[X] - 0.5).abs() < 1e-9 && r[Y].abs() < 1e-9);
        assert_eq!(m.chain[0], r[X] as f32);
    }
    #[test]
    fn it_keeps_a_least_speed_and_a_top_speed() {
        let mut m = Mover::new();
        let r = one(&mut m);
        r[VX] = 1.0;
        m.step(1, 0, 1.0 / 60.0, &TANK);
        assert!((hypot(m.rows[VX], m.rows[VY]) - 64.0 * 0.35).abs() < 1e-9);
        let r = one(&mut m);
        r[VX] = 500.0;
        r[FLAGS] = f64::from(F_DASHING);
        m.step(1, 0, 1.0 / 60.0, &TANK);
        let cap = 64.0 * 1.15 * 1.8;
        assert!((hypot(m.rows[VX], m.rows[VY]) - cap).abs() < 1e-9);
    }
    #[test]
    fn it_turns_no_faster_than_it_can() {
        let mut m = Mover::new();
        let r = one(&mut m);
        r[VX] = 0.0;
        r[VY] = 30.0; // heading 90 degrees, facing 0
        m.step(1, 0, 1.0 / 60.0, &TANK);
        assert!((m.rows[ANG] - 180.0 * DEG / 60.0).abs() < 1e-9);
        assert!(m.rows[TURN_S] > 0.0);
    }
    #[test]
    fn a_post_puts_it_back_out_and_a_top_is_landed_on() {
        let mut m = Mover::new();
        m.reserve_solids(1);
        m.solids[..SOLID].copy_from_slice(&[10.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5.0, 0.3]);
        let r = one(&mut m);
        r[X] = 5.5;
        r[Z] = 0.9;
        m.step(1, 1, 1.0 / 60.0, &TANK);
        assert!((hypot(m.rows[X] - 10.0, m.rows[Y]) - 5.0).abs() < 1e-9); // on its edge
        assert!(m.rows[VX].abs() < 1e-9); // no longer heading in
        let r = one(&mut m);
        r[X] = 8.0;
        r[Z] = 0.32;
        m.step(1, 1, 1.0 / 60.0, &TANK);
        assert_eq!(m.rows[Z], 0.3);
        let r = one(&mut m);
        r[X] = 8.0;
        r[Z] = 0.1; // below the top: it passes (steering is what turns it away down here)
        m.step(1, 1, 1.0 / 60.0, &TANK);
        assert!(m.rows[X] > 8.0);
    }
    #[test]
    fn the_spine_keeps_its_length() {
        let mut m = Mover::new();
        one(&mut m);
        for _ in 0..200 {
            m.rows[FX] = 40.0;
            m.rows[FY] = 90.0;
            m.step(1, 0, 1.0 / 60.0, &TANK);
        }
        let seg = 40.0 / 19.0;
        for i in 1..K {
            let d = hypot(f64::from(m.chain[i * 2] - m.chain[i * 2 - 2]), f64::from(m.chain[i * 2 + 1] - m.chain[i * 2 - 1]));
            assert!((d - seg).abs() < 1e-3, "segment {i} is {d}");
        }
    }
    #[test]
    fn fade_only_rises_to_one() {
        let mut m = Mover::new();
        let r = one(&mut m);
        r[FADE] = 0.99;
        m.step(1, 0, 1.0 / 60.0, &TANK);
        assert_eq!(m.rows[FADE], 1.0);
    }
}
