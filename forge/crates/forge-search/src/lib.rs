//! MAP-Elites for towers.
//!
//! Each tower tried is placed in a grid cell by two traits; each cell keeps its fittest tower.
//! Offspring come from small mutations and from gene-by-gene crossover of two elites
//! (Hutchinson et al. 2026 found the mix beats either alone). Pins and clicks train a small
//! preference model (after Gallotta et al.'s preference-learning emitters) that steers which
//! towers become parents and adds a "taste" term to fitness. Same seed, same atlas.

use std::collections::BTreeMap;

use forge_core::metrics::{features, similarity};
use forge_core::rng::{Fnv, Rng};
use forge_core::spec::*;
use forge_core::{compile, presets, score, Trait};
use serde::{Deserialize, Serialize};

/// Parts kept fixed while exploring; locked parts are copied from the reference tower.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Locks { pub stack: bool, pub crown: bool, pub foot: bool, pub aura: bool, pub look: bool }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Elite {
    pub spec: Spec,
    pub fitness: f32,
    pub coherence: f32,
    pub x: f32,
    pub y: f32,
    /// Increases whenever the cell gets a new tower, so viewers know to redraw thumbnails.
    pub version: u64,
}

/// A tiny logistic ranking model over [`features`]: learns "this one over those".
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Preference { pub w: Vec<f32>, pub pairs: u32 }
impl Preference {
    pub fn score(&self, s: &Spec) -> f32 {
        if self.pairs == 0 { return 0.5; }
        let f = features(s); let z: f32 = f.iter().zip(&self.w).map(|(a, b)| a * b).sum();
        1.0 / (1.0 + (-z).exp())
    }
    /// One preference: `chosen` was picked over each of `others`.
    pub fn record(&mut self, chosen: &Spec, others: &[Spec]) {
        let fc = features(chosen);
        if self.w.len() != fc.len() { self.w = vec![0.0; fc.len()]; }
        for o in others {
            let fo = features(o);
            for _ in 0..8 {
                let d: Vec<f32> = fc.iter().zip(&fo).map(|(a, b)| a - b).collect();
                let z: f32 = d.iter().zip(&self.w).map(|(a, b)| a * b).sum();
                let g = 1.0 - 1.0 / (1.0 + (-z).exp());
                for (w, x) in self.w.iter_mut().zip(&d) { *w += 0.3 * g * x - 0.002 * *w; }
            }
            self.pairs += 1;
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Atlas {
    pub x: Trait,
    pub y: Trait,
    pub n: usize,
    pub cells: BTreeMap<(usize, usize), Elite>,
    /// Every elite ever accepted, so the grid can be rebuilt when the axes change.
    pub pool: Vec<Spec>,
    pub pinned: Vec<Spec>,
    pub preference: Preference,
    pub locks: Locks,
    /// The tower being worked on; locked parts come from here.
    pub reference: Spec,
    pub tried: u64,
    /// Chance of crossover (versus mutation) per offspring.
    pub crossover_rate: f32,
    pub wildness: f32,
    rng_state: u64,
    version: u64,
}

impl Atlas {
    pub fn new(x: Trait, y: Trait, n: usize, seed: u64, reference: Spec) -> Atlas {
        Atlas { x, y, n: n.clamp(2, 24), cells: BTreeMap::new(), pool: vec![], pinned: vec![], preference: Preference::default(), locks: Locks::default(),
            reference, tried: 0, crossover_rate: 0.3, wildness: 0.7, rng_state: seed, version: 0 }
    }
    fn rng(&mut self) -> Rng { self.rng_state = self.rng_state.wrapping_add(0x9E37_79B9); Rng::new(self.rng_state) }

    pub fn cell_of(&self, s: &Spec) -> ((usize, usize), f32, f32) {
        let (vx, vy) = (self.x.of(s), self.y.of(s));
        let idx = |t: Trait, v: f32| { let (lo, hi) = t.range(); (((v - lo) / (hi - lo) * self.n as f32).floor().max(0.0) as usize).min(self.n - 1) };
        ((idx(self.x, vx), idx(self.y, vy)), vx, vy)
    }
    /// Coherence, blended with taste once you have pinned or picked towers.
    pub fn fitness(&self, s: &Spec) -> (f32, f32) {
        let plan = compile(s);
        let c = score(s, Some(&plan)).coherence;
        let mut taste = None;
        if !self.pinned.is_empty() { taste = Some(self.pinned.iter().map(|p| similarity(s, p)).fold(0.0, f32::max)); }
        if self.preference.pairs > 0 { let p = self.preference.score(s); taste = Some(taste.map_or(p, |t| 0.5 * t + 0.5 * p)); }
        (match taste { Some(t) => 0.65 * c + 0.35 * t, None => c }, c)
    }
    /// Offer a tower to the archive; true if it took a cell.
    pub fn insert(&mut self, s: Spec) -> bool { self.insert_inner(s, true) }
    fn insert_inner(&mut self, mut s: Spec, keep: bool) -> bool {
        s.sanitize();
        let (key, vx, vy) = self.cell_of(&s);
        let (fit, coh) = self.fitness(&s);
        let better = self.cells.get(&key).map_or(true, |e| fit > e.fitness + 1e-6);
        if better {
            self.version += 1;
            if keep { self.pool.push(s.clone()); if self.pool.len() > 4000 { self.pool.drain(0..500); } }
            self.cells.insert(key, Elite { spec: s, fitness: fit, coherence: coh, x: vx, y: vy, version: self.version });
        }
        better
    }
    /// Start from the presets, the reference tower and a few mixes of them.
    pub fn seed(&mut self) {
        self.cells.clear(); self.pool.clear(); self.tried = 0;
        let mut starts: Vec<Spec> = presets::all().into_iter().map(|(_, _, s)| s).collect();
        starts.push(self.reference.clone());
        let mut rng = self.rng();
        for _ in 0..24 {
            let a = starts[rng.below(12)].clone(); let b = starts[rng.below(12)].clone();
            starts.push(mutate(&crossover(&a, &b, &mut rng), &mut rng, 0.8, &Locks::default()));
        }
        for s in starts { let s = apply_locks(s, &self.reference, &self.locks); self.insert(s); }
    }
    /// Run `k` offspring.
    pub fn step(&mut self, k: usize) {
        if self.cells.is_empty() { self.seed(); }
        let mut rng = self.rng();
        let mut keys: Vec<(usize, usize)> = self.cells.keys().copied().collect();
        for _ in 0..k {
            let parent = self.pick_parent(&keys, &mut rng);
            let child = if keys.len() > 1 && rng.chance(self.crossover_rate) {
                let other = self.cells[&keys[rng.below(keys.len())]].spec.clone();
                mutate(&crossover(&parent, &other, &mut rng), &mut rng, 0.3, &self.locks)
            } else {
                let w = 0.35 + rng.f() * self.wildness * 1.3;
                mutate(&parent, &mut rng, w, &self.locks)
            };
            let child = apply_locks(child, &self.reference, &self.locks);
            if self.insert(child) { keys = self.cells.keys().copied().collect(); }
            self.tried += 1;
        }
    }
    fn pick_parent(&self, keys: &[(usize, usize)], rng: &mut Rng) -> Spec {
        if !self.pinned.is_empty() && rng.chance(0.35) { return self.pinned[rng.below(self.pinned.len())].clone(); }
        if self.preference.pairs > 0 {
            // tournament of three, judged by the learned preference
            let mut best: Option<&Elite> = None;
            for _ in 0..3 { let e = &self.cells[&keys[rng.below(keys.len())]]; if best.map_or(true, |b| self.preference.score(&e.spec) > self.preference.score(&b.spec)) { best = Some(e); } }
            return best.unwrap().spec.clone();
        }
        self.cells[&keys[rng.below(keys.len())]].spec.clone()
    }
    /// Change axes or grid size and re-place every known elite.
    pub fn regrid(&mut self, x: Trait, y: Trait, n: usize) { self.x = x; self.y = y; self.n = n.clamp(2, 24); self.rebin(); }
    pub fn rebin(&mut self) {
        let pool = self.pool.clone(); self.cells.clear();
        for s in pool { self.insert_inner(s, false); }
        for p in self.pinned.clone() { self.insert_inner(p, false); }
    }
    pub fn pin(&mut self, s: Spec) { self.pinned.push(s.clone()); if self.pinned.len() > 8 { self.pinned.remove(0); } self.insert(s); self.rebin(); }
    pub fn unpin(&mut self, i: usize) { if i < self.pinned.len() { self.pinned.remove(i); self.rebin(); } }
    /// The designer opened cell `key`: it is preferred over its filled neighbours.
    pub fn record_choice(&mut self, key: (usize, usize)) {
        let Some(chosen) = self.cells.get(&key).map(|e| e.spec.clone()) else { return };
        let mut others = vec![];
        for dx in -1i32..=1 { for dy in -1i32..=1 {
            if dx == 0 && dy == 0 { continue; }
            let k = ((key.0 as i32 + dx) as usize, (key.1 as i32 + dy) as usize);
            if let Some(e) = self.cells.get(&k) { others.push(e.spec.clone()); }
        } }
        self.preference.record(&chosen, &others);
    }
    /// Breed from two specs (for "breed from these"): their crossover children go straight into the archive.
    pub fn breed(&mut self, a: &Spec, b: &Spec, children: usize) {
        let mut rng = self.rng();
        for _ in 0..children { let c = mutate(&crossover(a, b, &mut rng), &mut rng, 0.25, &self.locks); let c = apply_locks(c, &self.reference, &self.locks); self.insert(c); self.tried += 1; }
    }
    pub fn coverage(&self) -> f32 { self.cells.len() as f32 / (self.n * self.n) as f32 }
    pub fn qd_score(&self) -> f32 { self.cells.values().map(|e| e.fitness).sum() }
    pub fn best(&self) -> f32 { self.cells.values().map(|e| e.fitness).fold(0.0, f32::max) }
    pub fn fingerprint(&self) -> u64 {
        let mut h = Fnv::default();
        for (k, e) in &self.cells { h.u(k.0 as u64); h.u(k.1 as u64); h.u(compile(&e.spec).fingerprint()); }
        h.0
    }
}

// ---------- variation ----------

fn jit(v: &mut f32, lo: f32, hi: f32, step: f32, rng: &mut Rng, wild: f32) {
    let span = hi - lo; let nv = (*v + rng.signed() * span * 0.18 * wild).clamp(lo, hi);
    *v = if step >= 1.0 { nv.round() } else { (nv / step).round() * step };
}
fn jit_u(v: &mut u32, lo: u32, hi: u32, rng: &mut Rng, wild: f32) { let mut f = *v as f32; jit(&mut f, lo as f32, hi as f32, 1.0, rng, wild); *v = f as u32; }
fn pick<T: Copy>(v: &mut T, all: &[T], rng: &mut Rng, wild: f32) { if rng.chance(0.12 * wild) { *v = all[rng.below(all.len())]; } }
fn flip(v: &mut bool, rng: &mut Rng, wild: f32) { if rng.chance(0.08 * wild) { *v = !*v; } }

fn mutate_tier(t: &mut Tier, r: &mut Rng, w: f32) {
    jit(&mut t.h, 0.5, 40.0, 0.1, r, w); jit(&mut t.r0, 0.2, 12.0, 0.05, r, w); jit(&mut t.r1, 0.2, 12.0, 0.05, r, w);
    if r.chance(0.12 * w) { t.sides = [0, 3, 4, 6, 8, 12][r.below(6)]; }
    pick(&mut t.prof, Profile::ALL, r, w); jit(&mut t.amp, 0.0, 1.0, 0.01, r, w); jit(&mut t.twist, -180.0, 180.0, 1.0, r, w * 0.5);
    pick(&mut t.mat, Mat::ALL, r, w * 0.5);
    jit_u(&mut t.ribs, 0, 48, r, w); jit(&mut t.rib_d, 0.02, 0.8, 0.01, r, w); jit_u(&mut t.chan, 0, 6, r, w);
    jit_u(&mut t.win_rows, 0, 10, r, w); jit_u(&mut t.win_per, 1, 16, r, w); pick(&mut t.win_kind, WinKind::ALL, r, w); flip(&mut t.win_glow, r, w);
    pick(&mut t.band, Band::ALL, r, w); jit(&mut t.band_size, 0.1, 2.5, 0.05, r, w);
    jit_u(&mut t.sp_n, 0, 12, r, w); jit(&mut t.sp_h, 0.1, 1.3, 0.01, r, w); jit(&mut t.sp_r, 0.1, 2.0, 0.05, r, w);
    jit(&mut t.stair, 0.0, 5.0, 0.25, r, w * 0.6); jit_u(&mut t.ban_n, 0, 16, r, w * 0.6); jit(&mut t.ban_len, 1.0, 24.0, 0.5, r, w);
    jit_u(&mut t.but_n, 0, 12, r, w * 0.6); jit(&mut t.but_r, 1.0, 16.0, 0.5, r, w);
    t.r1 = t.r1.min(t.r0 * 1.6);
}

/// Small changes: numbers nudged, a few choices swapped, sometimes a tier or halo added or dropped.
pub fn mutate(s: &Spec, r: &mut Rng, wild: f32, locks: &Locks) -> Spec {
    let mut o = s.clone();
    o.seed = r.below(1_000_000) as u32;
    if !locks.stack {
        for t in o.tiers.iter_mut() { mutate_tier(t, r, wild * 0.8); }
        for i in 1..o.tiers.len() { if r.chance(0.6) { o.tiers[i].r0 = ((o.tiers[i - 1].r1 * r.range(0.8, 1.1)) * 100.0).round() / 100.0; } }
        if r.chance(0.18 * wild) && o.tiers.len() < 6 {
            let i = r.below(o.tiers.len()); let mut t = o.tiers[i].clone();
            t.h = (t.h * r.range(0.4, 0.9) * 10.0).round() / 10.0; t.r0 = (o.tiers[i].r1 * 0.85 * 100.0).round() / 100.0; t.r1 = t.r0;
            o.tiers.insert(i + 1, t);
        }
        if r.chance(0.12 * wild) && o.tiers.len() > 1 { let i = r.below(o.tiers.len()); o.tiers.remove(i); }
    }
    if !locks.crown { let c = &mut o.crown; pick(&mut c.kind, CrownKind::ALL, r, wild); jit(&mut c.h, 0.2, 20.0, 0.1, r, wild); pick(&mut c.mat, Mat::ALL, r, wild); flip(&mut c.finial, r, wild); }
    if !locks.foot { let f = &mut o.foot; pick(&mut f.kind, FootKind::ALL, r, wild); jit(&mut f.h, 0.2, 12.0, 0.1, r, wild); jit(&mut f.spread, 1.0, 3.0, 0.05, r, wild); jit_u(&mut f.fins, 0, 12, r, wild); jit(&mut f.lean, -15.0, 15.0, 0.5, r, wild * 0.5); }
    if !locks.aura {
        let w = wild * 0.7;
        for h in o.halos.iter_mut() {
            pick(&mut h.kind, HaloKind::ALL, r, w); jit(&mut h.r, 0.5, 20.0, 0.1, r, w); jit(&mut h.y, -30.0, 15.0, 0.1, r, w); jit(&mut h.tilt, -90.0, 90.0, 1.0, r, w);
            jit(&mut h.face, 0.0, 360.0, 1.0, r, w); jit_u(&mut h.n, 1, 8, r, w); jit(&mut h.spin, -2.0, 2.0, 0.05, r, w); jit(&mut h.off, 0.0, 10.0, 0.1, r, w);
        }
        let a = &mut o.aura; let w = wild * 0.6;
        jit_u(&mut a.deb_n, 0, 220, r, w); pick(&mut a.deb_kind, DebrisKind::ALL, r, w); jit(&mut a.deb_r, 1.0, 40.0, 0.5, r, w); jit(&mut a.deb_spread, 0.0, 30.0, 0.5, r, w);
        jit(&mut a.deb_size, 0.1, 3.0, 0.05, r, w); jit(&mut a.deb_low, 0.0, 1.0, 0.01, r, w); jit(&mut a.drift, 0.0, 2.0, 0.05, r, w);
        flip(&mut a.beam, r, w); jit(&mut a.beam_len, 5.0, 120.0, 1.0, r, w); jit_u(&mut a.motes, 0, 800, r, w);
        jit_u(&mut a.sat_n, 0, 10, r, w); jit(&mut a.sat_r, 4.0, 40.0, 0.5, r, w); jit(&mut a.sat_scale, 0.15, 0.9, 0.01, r, w); flip(&mut a.sat_glow, r, w);
        flip(&mut a.bridge, r, w); jit(&mut a.bridge_len, 10.0, 140.0, 1.0, r, w); jit(&mut a.bridge_at, 0.05, 0.9, 0.01, r, w); jit(&mut a.bridge_face, 0.0, 360.0, 1.0, r, w); flip(&mut a.bridge_broken, r, w);
        jit_u(&mut a.roots, 0, 14, r, w); jit(&mut a.roots_h, 0.1, 1.0, 0.01, r, w); flip(&mut a.roots_glow, r, w); jit(&mut a.clouds, 0.0, 1.0, 0.05, r, w); jit(&mut a.clouds_at, 0.05, 1.0, 0.01, r, w);
        if r.chance(0.15 * wild) && o.halos.len() < 4 {
            o.halos.push(Halo { kind: HaloKind::ALL[r.below(HaloKind::ALL.len())], r: r.range(2.0, 8.0), y: -r.f() * 6.0, spin: r.signed() * 0.8, face: (r.f() * 360.0).round(), ..Halo::default() });
        }
        if r.chance(0.1 * wild) && !o.halos.is_empty() { let i = r.below(o.halos.len()); o.halos.remove(i); }
    }
    o.sanitize();
    o
}

/// Gene-by-gene crossover: every slot and every number comes from one parent or the other.
/// Tier stacks are spliced (lower tiers of one parent under the upper tiers of the other),
/// then each shared tier position swaps individual genes.
pub fn crossover(a: &Spec, b: &Spec, r: &mut Rng) -> Spec {
    let mut o = a.clone();
    let ca = 1 + r.below(a.tiers.len()); let cb = r.below(b.tiers.len());
    let mut tiers: Vec<Tier> = a.tiers[..ca].iter().cloned().chain(b.tiers[cb..].iter().cloned()).take(6).collect();
    for (i, t) in tiers.iter_mut().enumerate() {
        if let Some(other) = b.tiers.get(i) {
            macro_rules! g { ($($f:ident),+) => { $( if r.chance(0.5) { t.$f = other.$f.clone(); } )+ } }
            g!(prof, amp, mat, ribs, rib_d, chan, win_rows, win_per, win_kind, win_glow, band, band_size, sp_n, sp_h, sp_r, stair, ban_n, ban_len, but_n, but_r);
        }
    }
    for i in 1..tiers.len() {
        let top = tiers[i - 1].r1;
        if (tiers[i].r0 - top).abs() > top * 0.35 { let k = top * 0.92 / tiers[i].r0; tiers[i].r0 *= k; tiers[i].r1 *= k; }
    }
    o.tiers = tiers;
    if r.chance(0.5) { o.crown = b.crown.clone(); }
    if r.chance(0.5) { o.crown.h = b.crown.h; }
    if r.chance(0.5) { o.foot = b.foot.clone(); }
    if r.chance(0.5) { o.halos = b.halos.clone(); }
    macro_rules! ga { ($($f:ident),+) => { $( if r.chance(0.5) { o.aura.$f = b.aura.$f.clone(); } )+ } }
    ga!(deb_n, deb_kind, deb_r, deb_spread, deb_size, deb_low, drift, beam, beam_len, motes, sat_n, sat_r, sat_scale, sat_glow, bridge, bridge_len, bridge_at, bridge_face, bridge_broken, roots, roots_h, roots_glow, clouds, clouds_at);
    if r.chance(0.5) { o.look = b.look.clone(); }
    o.seed = r.below(1_000_000) as u32;
    o.sanitize();
    o
}

pub fn apply_locks(mut o: Spec, reference: &Spec, l: &Locks) -> Spec {
    if l.stack { o.tiers = reference.tiers.clone(); }
    if l.crown { o.crown = reference.crown.clone(); }
    if l.foot { o.foot = reference.foot.clone(); }
    if l.aura { o.halos = reference.halos.clone(); o.aura = reference.aura.clone(); }
    if l.look { o.look = reference.look.clone(); }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atlas(seed: u64) -> Atlas { Atlas::new(Trait::Height, Trait::Ornament, 8, seed, presets::get("monolith").unwrap()) }

    #[test]
    fn fills_the_grid_and_is_deterministic() {
        let mut a = atlas(1); a.step(1500);
        let mut b = atlas(1); b.step(1500);
        assert_eq!(a.fingerprint(), b.fingerprint(), "same seed, same atlas");
        assert!(a.coverage() > 0.6, "coverage {}", a.coverage());
        assert!(a.best() > 0.95);
        let mut c = atlas(2); c.step(1500);
        assert_ne!(a.fingerprint(), c.fingerprint());
        println!("coverage {:.0}% qd {:.1} best {:.2} tried {}", a.coverage() * 100.0, a.qd_score(), a.best(), a.tried);
    }

    #[test]
    fn locks_hold() {
        let mut a = atlas(3);
        a.reference = presets::get("divine").unwrap();
        a.locks = Locks { crown: true, look: true, ..Locks::default() };
        a.seed(); a.step(400);
        for e in a.cells.values() { assert_eq!(e.spec.crown, a.reference.crown); assert_eq!(e.spec.look, a.reference.look); }
    }

    #[test]
    fn preferences_steer() {
        let mut a = atlas(4); a.step(600);
        let keys: Vec<_> = a.cells.keys().copied().collect();
        // keep choosing towers with a dome crown, if there are any
        let domed: Vec<_> = keys.iter().filter(|k| a.cells[k].spec.crown.kind == CrownKind::Dome).copied().collect();
        for k in domed.iter().take(6) { a.record_choice(*k); }
        if !domed.is_empty() {
            let dome = a.cells[&domed[0]].spec.clone();
            let mut flat = dome.clone(); flat.crown.kind = CrownKind::Flat;
            assert!(a.preference.score(&dome) > a.preference.score(&flat), "learned to like domes");
        }
    }

    #[test]
    fn crossover_mixes_genes() {
        let mut r = Rng::new(9);
        let (a, b) = (presets::get("gilded").unwrap(), presets::get("pilgrim").unwrap());
        let kids: Vec<Spec> = (0..40).map(|_| crossover(&a, &b, &mut r)).collect();
        assert!(kids.iter().any(|k| k.crown == a.crown) && kids.iter().any(|k| k.crown == b.crown));
        assert!(kids.iter().all(|k| compile(k).problems().next().is_none()));
    }
}
