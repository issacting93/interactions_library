//! Small deterministic random numbers and hashing, so a seed always gives the same tower.

/// SplitMix64: fast, seedable, identical on every platform.
#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self { Rng(seed ^ 0x9E37_79B9_7F4A_7C15) }
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform in [0, 1).
    pub fn f(&mut self) -> f32 { (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32 }
    pub fn range(&mut self, a: f32, b: f32) -> f32 { a + (b - a) * self.f() }
    /// Uniform integer in [0, n).
    pub fn below(&mut self, n: usize) -> usize { if n == 0 { 0 } else { (self.next_u64() % n as u64) as usize } }
    pub fn chance(&mut self, p: f32) -> bool { self.f() < p }
    pub fn signed(&mut self) -> f32 { self.f() * 2.0 - 1.0 }
}

/// FNV-1a, used to fingerprint plans in tests and to name cached meshes.
#[derive(Clone, Copy, Debug)]
pub struct Fnv(pub u64);
impl Default for Fnv { fn default() -> Self { Fnv(0xcbf2_9ce4_8422_2325) } }
impl Fnv {
    pub fn bytes(&mut self, b: &[u8]) { for x in b { self.0 ^= *x as u64; self.0 = self.0.wrapping_mul(0x0100_0000_01b3); } }
    /// Floats are rounded to 1/1000 so tiny platform differences do not change the hash.
    pub fn f(&mut self, v: f32) { self.bytes(&((v * 1000.0).round() as i64).to_le_bytes()); }
    pub fn u(&mut self, v: u64) { self.bytes(&v.to_le_bytes()); }
    pub fn s(&mut self, s: &str) { self.bytes(s.as_bytes()); self.bytes(&[0]); }
}

/// Smooth 1D value noise in [0, 1].
pub fn vnoise(x: f32) -> f32 {
    let h = |n: f32| { let s = (n * 127.1 + 311.7).sin() * 43758.547; s - s.floor() };
    let i = x.floor(); let f = x - i; let u = f * f * (3.0 - 2.0 * f);
    h(i) * (1.0 - u) + h(i + 1.0) * u
}
