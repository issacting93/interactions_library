//! The walking body's physics core: one substep of a creature body's chunks (shared/engine/motion/creature-body.js
//! `tick`, from "forces, then Verlet" through the joints). Each chunk is pushed by gravity, by its planted feet toward
//! standing height, by gripping feet toward the speed it wants (or the hand steering it), by the slither or the swim
//! wave, by the water's drag, and by the twist when turning in place; then it moves by Verlet, and the joints between
//! chunks are solved six times over.
//!
//! What needs the world (the ground under each foot and chunk, the towers) stays in the page: it works out each
//! chunk's distance from the surface and its normal before, and pushes chunks back out of the surface after. In water
//! the page also hands over the height of the ground (or the ceiling) under each chunk.
//!
//! Operation for operation the same as the JavaScript, so a seed plays out the same either way. Keep the order of
//! arithmetic when editing.

use crate::math::{min, or, pow, sin};

/// Numbers per chunk in `chunks`.
pub const CH: usize = 20;
pub const PX: usize = 0; // where it is
pub const PY: usize = 1;
pub const PZ: usize = 2;
pub const QX: usize = 3; // where it was a substep ago
pub const QY: usize = 4;
pub const QZ: usize = 5;
pub const NX: usize = 6; // the way out of the surface under it
pub const NY: usize = 7;
pub const NZ: usize = 8;
pub const FX: usize = 9; // its own forward, level
pub const FY: usize = 10;
pub const FZ: usize = 11;
pub const SUP: usize = 12; // how much of it planted feet hold up
pub const GRIP: usize = 13; // how much it grips the ground
pub const DRIVE: usize = 14; // the grip it is driven with (the hand's least grip counted)
pub const D: usize = 15; // how far it is from the surface
pub const SEG_H: usize = 16; // its piece's standing height
pub const SK: usize = 17; // how much of it the hand steers (0: none)
pub const GROUND: usize = 18; // in water: the height of the ground (or ceiling) under it

/// Numbers in `prm`, the body's settings for the substep.
pub const PRM: usize = 40;
pub const P_H: usize = 0; // the substep
pub const P_HZ: usize = 1; // substeps a second (velocity = displacement * hz)
pub const P_SWIM: usize = 2; // 1 in water or the air
pub const P_LEGS: usize = 3; // 1 if it has legs
pub const P_LEN0: usize = 4;
pub const P_WAVE_PH: usize = 5;
pub const P_RUN_BOB: usize = 6;
pub const P_V: usize = 7; // the speed it wants
pub const P_HDX: usize = 8; // its heading
pub const P_HDY: usize = 9;
pub const P_HDZ: usize = 10;
pub const P_CLING: usize = 11;
pub const P_STEER: usize = 12; // 1 when a hand is on it, and the velocity it is sent at
pub const P_STX: usize = 13;
pub const P_STY: usize = 14;
pub const P_STZ: usize = 15;
pub const P_HEIGHT: usize = 16; // the settings' height
pub const P_WAVES: usize = 17; // the swim's numbers
pub const P_AMP: usize = 18;
pub const P_AMP_POW: usize = 19;
pub const P_BEND: usize = 20;
pub const P_RISE: usize = 21; // how far above its ground it floats
pub const P_RIGID: usize = 22; // 1: one rigid piece
pub const P_PACE: usize = 23;
pub const P_G: usize = 24; // the tuning (CreatureBody.K)
pub const P_HOLD: usize = 25;
pub const P_HOLD_D: usize = 26;
pub const P_KDRIVE: usize = 27;
pub const P_CLIMB: usize = 28;
pub const P_TURN: usize = 29;
pub const P_AIR: usize = 30;
pub const P_W_ALONG: usize = 31;
pub const P_W_ACROSS: usize = 32;
pub const P_W_FLOAT: usize = 33;
pub const P_W_FLOAT_D: usize = 34;
pub const P_W_THRUST: usize = 35;
pub const P_W_WAVE: usize = 36;
pub const P_SOFT: usize = 37;

#[derive(Default, Debug)]
pub struct Bodies {
    pub chunks: Vec<f64>,
    /// The joints' rest lengths, chunk to chunk.
    pub rest: Vec<f64>,
    pub prm: Vec<f64>,
}

impl Bodies {
    pub fn new() -> Self {
        Bodies { chunks: Vec::new(), rest: Vec::new(), prm: vec![0.0; PRM] }
    }
    /// Room for a body of n chunks; returns the room.
    pub fn reserve(&mut self, n: usize) -> usize {
        if n * CH > self.chunks.len() {
            let cap = n.next_power_of_two().max(32);
            self.chunks.resize(cap * CH, 0.0);
            self.rest.resize(cap, 0.0);
        }
        self.chunks.len() / CH
    }
    /// One substep of a body of n chunks.
    pub fn integrate(&mut self, n: usize) {
        let n = n.min(self.chunks.len() / CH);
        integrate(&mut self.chunks[..n * CH], &self.rest[..n.saturating_sub(1)], &self.prm, n);
    }
}

#[inline]
fn normalize(v: &mut [f64; 3]) {
    // as the page's V3: multiplied by 1 / length, and left alone when it has none
    let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if l > 1e-12 {
        let s = 1.0 / l;
        v[0] *= s;
        v[1] *= s;
        v[2] *= s;
    }
}
#[inline]
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/// Keep two chunks `len` apart (a joint), each moved half the way, by `stiff`.
#[inline]
fn keep(c: &mut [f64], a: usize, b: usize, len: f64, stiff: f64) {
    let (ao, bo) = (a * CH, b * CH);
    let f = [c[bo + PX] - c[ao + PX], c[bo + PY] - c[ao + PY], c[bo + PZ] - c[ao + PZ]];
    let d = or((f[0] * f[0] + f[1] * f[1] + f[2] * f[2]).sqrt(), 1e-6);
    let k = ((d - len) / d) * 0.5 * stiff;
    c[ao + PX] += f[0] * k;
    c[ao + PY] += f[1] * k;
    c[ao + PZ] += f[2] * k;
    let mk = -k;
    c[bo + PX] += f[0] * mk;
    c[bo + PY] += f[1] * mk;
    c[bo + PZ] += f[2] * mk;
}

/// One substep: forces, Verlet, then the joints.
pub fn integrate(c: &mut [f64], rest: &[f64], p: &[f64], n: usize) {
    let h = p[P_H];
    let hz = p[P_HZ];
    let swim = p[P_SWIM] != 0.0;
    let legs = p[P_LEGS] != 0.0;
    let v = p[P_V];
    let hd = [p[P_HDX], p[P_HDY], p[P_HDZ]];
    let pi2 = std::f64::consts::PI * 2.0;
    for i in 0..n {
        let o = i * CH;
        let vel = [(c[o + PX] - c[o + QX]) * hz, (c[o + PY] - c[o + QY]) * hz, (c[o + PZ] - c[o + QZ]) * hz];
        let nm = [c[o + NX], c[o + NY], c[o + NZ]];
        let cf = [c[o + FX], c[o + FY], c[o + FZ]];
        let (mut ax, mut ay, mut az) = (0.0f64, 0.0f64, 0.0f64);
        let fwd = if i == 0 { hd } else { cf };
        if !swim {
            ay -= p[P_G];
            // planted feet carry its weight, push it toward standing height along the normal, and damp it
            let ty = c[o + SEG_H] * p[P_HEIGHT] * (1.0 + p[P_RUN_BOB]);
            let s = c[o + SUP];
            if s > 0.0 {
                let vn = vel[0] * nm[0] + vel[1] * nm[1] + vel[2] * nm[2];
                let push = s * (p[P_HOLD] * (ty - c[o + D]) - p[P_HOLD_D] * vn);
                ay += s * p[P_G];
                ax += push * nm[0];
                ay += push * nm[1];
                az += push * nm[2];
            }
            // gripping: its velocity along the surface goes toward the one it wants (or the hand's)
            let sk = c[o + SK];
            let grip = c[o + DRIVE];
            if grip > 0.0 {
                let vn = vel[0] * nm[0] + vel[1] * nm[1] + vel[2] * nm[2];
                let kg = grip * p[P_KDRIVE] * (1.0 + p[P_CLIMB] * p[P_CLING]);
                let steered = p[P_STEER] != 0.0 && sk != 0.0 && !sk.is_nan();
                let wx = if steered { fwd[0] * v * (1.0 - sk) + p[P_STX] * sk } else { fwd[0] * v };
                let wy = if steered { fwd[1] * v * (1.0 - sk) + p[P_STY] * sk } else { fwd[1] * v };
                let wz = if steered { fwd[2] * v * (1.0 - sk) + p[P_STZ] * sk } else { fwd[2] * v };
                ax += kg * (wx - (vel[0] - nm[0] * vn));
                ay += kg * (wy - (vel[1] - nm[1] * vn));
                az += kg * (wz - (vel[2] - nm[2] * vn));
            }
            if !legs && n > 1 {
                // no legs: it slithers, a wave running down it as it goes
                let t = i as f64 / (n - 1) as f64;
                let lat = 0.5 * p[P_W_WAVE] * p[P_AMP] * (0.2 + 0.8 * t) * p[P_LEN0] * sin(p[P_WAVE_PH] - pi2 * p[P_WAVES] * t) * min(1.0, p[P_PACE] + 0.3);
                ax -= (nm[1] * cf[2] - nm[2] * cf[1]) * lat;
                ay -= (nm[2] * cf[0] - nm[0] * cf[2]) * lat;
                az -= (nm[0] * cf[1] - nm[1] * cf[0]) * lat;
            }
            ax -= vel[0] * p[P_AIR];
            ay -= vel[1] * p[P_AIR];
            az -= vel[2] * p[P_AIR];
        } else {
            // water: it floats at its cruising height; drag is far stronger across the body than along it
            let ty = c[o + GROUND] + c[o + SEG_H] + p[P_RISE] + 0.05 * p[P_LEN0] * sin(p[P_WAVE_PH] * 0.5 - i as f64 * 0.6);
            ay += p[P_W_FLOAT] * (ty - c[o + PY]) - p[P_W_FLOAT_D] * vel[1];
            let along = vel[0] * cf[0] + vel[2] * cf[2];
            let ax0 = vel[0] - cf[0] * along;
            let az0 = vel[2] - cf[2] * along;
            ax -= cf[0] * along * p[P_W_ALONG] + ax0 * p[P_W_ACROSS];
            az -= cf[2] * along * p[P_W_ALONG] + az0 * p[P_W_ACROSS];
            // the wave: a sideways push down the body, bigger toward the tail
            let t = if n > 1 { i as f64 / (n - 1) as f64 } else { 0.0 };
            let a = p[P_W_WAVE] * p[P_AMP] * p[P_BEND] * (0.12 + 0.88 * pow(t, p[P_AMP_POW])) * p[P_LEN0];
            let lat = a * sin(p[P_WAVE_PH] - pi2 * p[P_WAVES] * t);
            ax += -cf[2] * lat;
            az += cf[0] * lat;
            if i == 0 {
                // the head pulls toward the heading at the speed it wants
                let along0 = vel[0] * hd[0] + vel[2] * hd[2];
                ax += hd[0] * p[P_W_THRUST] * (v - along0);
                az += hd[2] * p[P_W_THRUST] * (v - along0);
            }
        }
        // turning in place: the head pushed round toward the heading, the tail the other way
        if n > 1 && (i == 0 || i == n - 1) {
            let (z0, zl) = (0, (n - 1) * CH);
            let mut f0 = [c[z0 + PX] - c[zl + PX], c[z0 + PY] - c[zl + PY], c[z0 + PZ] - c[zl + PZ]];
            let s = -(f0[0] * nm[0] + f0[1] * nm[1] + f0[2] * nm[2]);
            f0[0] += nm[0] * s;
            f0[1] += nm[1] * s;
            f0[2] += nm[2] * s;
            normalize(&mut f0);
            let g = cross(f0, hd);
            let tw = nm[0] * g[0] + nm[1] * g[1] + nm[2] * g[2];
            let k = p[P_TURN] * (if swim { 0.6 } else { 0.3 + 0.7 * (c[z0 + GRIP] + c[zl + GRIP]) / 2.0 }) * (if i == 0 { 1.0 } else { -1.0 });
            let g = cross(nm, f0);
            ax += g[0] * tw * k;
            ay += g[1] * tw * k;
            az += g[2] * tw * k;
        }
        // Verlet
        let nx = c[o + PX] + (c[o + PX] - c[o + QX]) + ax * h * h;
        let ny = c[o + PY] + (c[o + PY] - c[o + QY]) + ay * h * h;
        let nz = c[o + PZ] + (c[o + PZ] - c[o + QZ]) + az * h * h;
        c[o + QX] = c[o + PX];
        c[o + QY] = c[o + PY];
        c[o + QZ] = c[o + PZ];
        c[o + PX] = nx;
        c[o + PY] = ny;
        c[o + PZ] = nz;
    }

    // the joints between chunks
    let rigid = p[P_RIGID] != 0.0;
    for _ in 0..6 {
        for i in 0..n.saturating_sub(1) {
            keep(c, i, i + 1, rest[i], 1.0);
        }
        if rigid && n == 3 {
            keep(c, 0, 2, rest[0] + rest[1], 1.0);
        } else {
            for i in 1..n.saturating_sub(1) {
                // a spine resists sagging between its legs (height only), and folding back on itself
                let (ao, bo, co) = ((i - 1) * CH, (i + 1) * CH, i * CH);
                let k = if swim { 0.02 } else { p[P_SOFT] };
                let sg = k * (((c[ao + PX] + c[bo + PX]) / 2.0 - c[co + PX]) * c[co + NX] + ((c[ao + PY] + c[bo + PY]) / 2.0 - c[co + PY]) * c[co + NY] + ((c[ao + PZ] + c[bo + PZ]) / 2.0 - c[co + PZ]) * c[co + NZ]);
                c[co + PX] += sg * c[co + NX];
                c[co + PY] += sg * c[co + NY];
                c[co + PZ] += sg * c[co + NZ];
                let (dx, dy, dz) = (c[ao + PX] - c[bo + PX], c[ao + PY] - c[bo + PY], c[ao + PZ] - c[bo + PZ]);
                let d = (dx * dx + dy * dy + dz * dz).sqrt();
                let lo = 0.75 * (rest[i - 1] + rest[i]);
                if d < lo {
                    keep(c, i - 1, i + 1, lo, 0.5);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A body of n chunks in a line along z, standing at height 0.5 on flat ground, legs planted.
    fn standing(n: usize) -> Bodies {
        let mut b = Bodies::new();
        b.reserve(n);
        for i in 0..n {
            let o = i * CH;
            let z = -(i as f64) * 0.5;
            for (k, v) in [(PX, 0.0), (PY, 0.5), (PZ, z), (QX, 0.0), (QY, 0.5), (QZ, z), (NY, 1.0), (FZ, 1.0), (SUP, 1.0), (GRIP, 1.0), (DRIVE, 1.0), (D, 0.5), (SEG_H, 0.5)] {
                b.chunks[o + k] = v;
            }
            if i + 1 < n {
                b.rest[i] = 0.5;
            }
        }
        let p = &mut b.prm;
        for (k, v) in [(P_H, 1.0 / 120.0), (P_HZ, 120.0), (P_LEGS, 1.0), (P_LEN0, 0.4), (P_HDZ, 1.0), (P_HEIGHT, 1.0), (P_WAVES, 0.9), (P_AMP, 1.0), (P_AMP_POW, 1.6), (P_BEND, 1.0), (P_RISE, 0.36), (P_G, 9.8), (P_HOLD, 260.0), (P_HOLD_D, 34.0), (P_KDRIVE, 9.0), (P_CLIMB, 1.5), (P_TURN, 26.0), (P_AIR, 0.25), (P_W_ALONG, 0.9), (P_W_ACROSS, 6.0), (P_W_FLOAT, 9.0), (P_W_FLOAT_D, 6.0), (P_W_THRUST, 7.0), (P_W_WAVE, 7.0), (P_SOFT, 0.12)] {
            p[k] = v;
        }
        b
    }

    #[test]
    fn standing_on_its_feet_it_stays_put() {
        let mut b = standing(4);
        for _ in 0..600 {
            b.integrate(4);
        }
        for i in 0..4 {
            assert!((b.chunks[i * CH + PY] - 0.5).abs() < 1e-9, "chunk {i} keeps its height");
            assert!(b.chunks[i * CH + PZ].abs() < 2.0);
        }
    }
    #[test]
    fn with_no_feet_down_it_falls() {
        let mut b = standing(3);
        for i in 0..3 {
            b.chunks[i * CH + SUP] = 0.0;
            b.chunks[i * CH + DRIVE] = 0.0;
        }
        for _ in 0..60 {
            b.integrate(3);
        }
        assert!(b.chunks[PY] < 0.5 - 1.0, "half a second of falling");
    }
    #[test]
    fn wanting_to_go_it_walks_forward_and_the_joints_hold() {
        let mut b = standing(4);
        b.prm[P_V] = 1.0;
        for _ in 0..240 {
            b.integrate(4);
        }
        let v = (b.chunks[PZ] - b.chunks[QZ]) * 120.0;
        assert!((v - 1.0).abs() < 0.05, "at the speed it wants, not {v}");
        for i in 0..3 {
            let d = (b.chunks[i * CH + PZ] - b.chunks[(i + 1) * CH + PZ]).abs();
            assert!((d - 0.5).abs() < 0.01, "joint {i} at {d}");
        }
    }
    #[test]
    fn a_hand_on_it_sends_it_sideways() {
        let mut b = standing(3);
        b.prm[P_STEER] = 1.0;
        b.prm[P_STX] = 1.0;
        for i in 0..3 {
            b.chunks[i * CH + SK] = 1.0;
        }
        for _ in 0..240 {
            b.integrate(3);
        }
        assert!((b.chunks[PX] - b.chunks[QX]) * 120.0 > 0.9);
    }
    #[test]
    fn in_water_it_floats_up_to_its_cruising_height() {
        let mut b = standing(3);
        b.prm[P_SWIM] = 1.0;
        for _ in 0..1200 {
            b.integrate(3);
        }
        let want = 0.0 + 0.5 + 0.36;
        assert!((b.chunks[CH + PY] - want).abs() < 0.08, "near {want}, at {}", b.chunks[CH + PY]);
    }
}
