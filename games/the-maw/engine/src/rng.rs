//! One seeded random stream (mulberry32). Bit for bit the same as `src/core/rng.ts`: a seed that replays in the
//! TypeScript core replays the same here, draw for draw.

#[derive(Clone, Debug)]
pub struct Rng {
    s: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng { s: if seed == 0 { 0x9e37_79b9 } else { seed } }
    }
    /// The next number in [0, 1).
    pub fn next(&mut self) -> f64 {
        self.s = self.s.wrapping_add(0x6d2b_79f5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }
    pub fn state(&self) -> u32 {
        self.s
    }
    pub fn range(&mut self, a: f64, b: f64) -> f64 {
        a + (b - a) * self.next()
    }
    /// a..=b
    pub fn int(&mut self, a: i32, b: i32) -> i32 {
        self.range(f64::from(a), f64::from(b) + 1.0).floor() as i32
    }
    pub fn chance(&mut self, p: f64) -> bool {
        self.next() < p
    }
    /// A separate stream for a sub-task, so a draw added in one place does not reshuffle another.
    /// Matches the TypeScript `fork` for whole-number salts.
    pub fn fork(&self, salt: u32) -> Rng {
        Rng::new((self.s ^ salt).wrapping_mul(2_654_435_761) ^ salt.wrapping_mul(40_503))
    }
}

/// A seed from words (FNV-1a over UTF-16 code units, as `seedOf` does in the TypeScript core).
pub fn seed_of(words: &str) -> u32 {
    let mut h: u32 = 2_166_136_261;
    for u in words.encode_utf16() {
        h ^= u32::from(u);
        h = h.wrapping_mul(16_777_619);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_stream() {
        let (mut a, mut b) = (Rng::new(4242), Rng::new(4242));
        for _ in 0..1000 {
            assert_eq!(a.next().to_bits(), b.next().to_bits());
        }
    }
    #[test]
    fn stays_in_unit_range() {
        let mut r = Rng::new(7);
        for _ in 0..10_000 {
            let v = r.next();
            assert!((0.0..1.0).contains(&v));
        }
    }
    #[test]
    fn zero_seed_is_replaced() {
        assert_eq!(Rng::new(0).state(), 0x9e37_79b9);
    }
    #[test]
    fn int_is_inclusive() {
        let mut r = Rng::new(1);
        let (mut lo, mut hi) = (false, false);
        for _ in 0..2000 {
            let v = r.int(2, 5);
            assert!((2..=5).contains(&v));
            lo |= v == 2;
            hi |= v == 5;
        }
        assert!(lo && hi);
    }
    #[test]
    fn seed_of_words_is_fnv1a() {
        assert_eq!(seed_of(""), 2_166_136_261);
        assert_eq!(seed_of("a"), 0xe40c_292c);
    }
}
