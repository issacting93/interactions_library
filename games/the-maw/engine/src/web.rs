//! Who eats whom, from bodies. The same relation as `src/core/web.ts`: a hunter takes prey between 2 and 100 times
//! lighter than itself (weight is length cubed). Plate makes prey count heavier; claws or a jaw let a hunter take prey
//! nearer its own weight. Hand-written menus are the caller's business: exceptions sit on top of the web, not in it.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Medium {
    Water,
    Ground,
    Air,
}

#[derive(Clone, Copy, Debug)]
pub struct Body {
    /// Its species: nothing eats its own kind.
    pub kind: u32,
    pub length: f64,
    pub weight: f64,
    pub plate: bool,
    pub claw: bool,
    /// 0: none. Otherwise the factor its mouth gives it (under 1: it takes prey nearer its own weight).
    pub jaw: f64,
    /// Grazes or spins its food in: prey far lighter than itself is still food.
    pub sieve: bool,
    /// Keeps to a school: worth a big hunter's while though each is small.
    pub schools: bool,
    /// Eats other creatures at all.
    pub hunts: bool,
    pub medium: Medium,
}

impl Body {
    pub fn new(kind: u32, length: f64) -> Self {
        let mut b = Body { kind, length: 0.0, weight: 0.0, plate: false, claw: false, jaw: 0.0, sieve: false, schools: false, hunts: false, medium: Medium::Water };
        b.resize(length);
        b
    }
    /// A body that grew or shrank: its weight follows its length.
    pub fn resize(&mut self, length: f64) {
        self.length = length;
        self.weight = length * length * length;
    }
}

#[derive(Clone, Copy, Debug)]
pub struct WebRules {
    pub band: [f64; 2],
    pub plate: f64,
    pub claw: f64,
}

pub const WEB: WebRules = WebRules { band: [2.0, 100.0], plate: 2.0, claw: 0.6 };

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Verdict {
    Food = 0,
    OwnKind = 1,
    TooBig = 2,
    TooSmall = 3,
}

/// How many times heavier the hunter is than the prey, as the band reads it.
pub fn ratio(a: &Body, b: &Body, r: &WebRules) -> f64 {
    ratio_raw(a.weight, b.weight, b.plate, a.claw, a.jaw, r)
}

/// The same from plain numbers (what crosses from JavaScript).
pub fn ratio_raw(a_weight: f64, b_weight: f64, b_plate: bool, a_claw: bool, a_jaw: f64, r: &WebRules) -> f64 {
    let mut x = a_weight / b_weight;
    if b_plate {
        x /= r.plate;
    }
    // claws and a jaw do not add up: the better of the two counts
    let edge = (if a_claw { r.claw } else { 1.0 }).min(if a_jaw > 0.0 { a_jaw } else { 1.0 });
    x / edge
}

pub fn verdict_raw(same_kind: bool, ratio: f64, a_sieve: bool, b_schools: bool, r: &WebRules) -> Verdict {
    if same_kind {
        Verdict::OwnKind
    } else if ratio < r.band[0] {
        Verdict::TooBig // too near its own weight to bring down
    } else if ratio > r.band[1] && !(a_sieve || b_schools) {
        Verdict::TooSmall // too small to be worth it, unless it sieves or they school
    } else {
        Verdict::Food
    }
}

/// Why b is or is not food for a.
pub fn verdict(a: &Body, b: &Body, r: &WebRules) -> Verdict {
    verdict_raw(a.kind == b.kind, ratio(a, b, r), a.sieve, b.schools, r)
}
/// Is b food for a, by their bodies alone.
pub fn eats(a: &Body, b: &Body, r: &WebRules) -> bool {
    verdict(a, b, r) == Verdict::Food
}
/// Should prey run from hunter.
pub fn fears(prey: &Body, hunter: &Body, r: &WebRules) -> bool {
    hunter.hunts && eats(hunter, prey, r)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(kind: u32, length: f64) -> Body {
        Body::new(kind, length)
    }

    #[test]
    fn the_band() {
        let big = b(1, 2.2);
        assert!(eats(&big, &b(2, 1.0), &WEB)); // about 10.6 times heavier
        assert!(!eats(&big, &b(2, 2.0), &WEB)); // too near its own weight
        assert_eq!(verdict(&big, &b(2, 2.0), &WEB), Verdict::TooBig);
        assert_eq!(verdict(&b(1, 10.0), &b(2, 1.0), &WEB), Verdict::TooSmall); // 1000 times
    }
    #[test]
    fn nothing_eats_its_own_kind() {
        assert_eq!(verdict(&b(3, 3.0), &b(3, 1.0), &WEB), Verdict::OwnKind);
    }
    #[test]
    fn plate_counts_heavier() {
        let hunter = b(1, 1.4); // 2.744 times a body of length 1
        let mut prey = b(2, 1.0);
        assert!(eats(&hunter, &prey, &WEB));
        prey.plate = true;
        assert!(!eats(&hunter, &prey, &WEB));
    }
    #[test]
    fn claws_and_jaw_take_the_better() {
        let mut hunter = b(1, 1.1); // 1.331 times
        let prey = b(2, 1.0);
        assert!(!eats(&hunter, &prey, &WEB));
        hunter.claw = true; // 1.331 / 0.6 = 2.2
        assert!(eats(&hunter, &prey, &WEB));
        hunter.jaw = 0.35;
        assert!((ratio(&hunter, &prey, &WEB) - 1.331 / 0.35).abs() < 1e-9);
    }
    #[test]
    fn sieves_and_schools_reach_past_the_band() {
        let mut whale = b(1, 10.0);
        let mut krill = b(2, 1.0);
        assert!(!eats(&whale, &krill, &WEB));
        whale.sieve = true;
        assert!(eats(&whale, &krill, &WEB));
        whale.sieve = false;
        krill.schools = true;
        assert!(eats(&whale, &krill, &WEB));
    }
    #[test]
    fn fear_follows_the_web() {
        let mut hunter = b(1, 2.2);
        let prey = b(2, 1.0);
        assert!(!fears(&prey, &hunter, &WEB)); // it does not hunt
        hunter.hunts = true;
        assert!(fears(&prey, &hunter, &WEB));
        assert!(!fears(&hunter, &prey, &WEB));
    }
}
