//! The few math functions whose last digit differs between implementations (sin, cos, atan2, hypot).
//!
//! In the browser these are the page's own `Math` functions, handed in when the engine starts. While part of the
//! simulation is still JavaScript, both halves must round the same way or a seed stops replaying the same with the
//! engine on and off. Once everything that simulates is here, these can become Rust's own and a seed will replay the
//! same across browsers too. Outside the browser (the tests) they are the standard library's.
//!
//! `min`, `max` and `sign` follow JavaScript's rules (a NaN in gives NaN out; -0 is less than 0), which Rust's do not.

#[cfg(target_arch = "wasm32")]
mod host {
    #[link(wasm_import_module = "math")]
    extern "C" {
        pub fn sin(x: f64) -> f64;
        pub fn cos(x: f64) -> f64;
        pub fn atan2(y: f64, x: f64) -> f64;
        pub fn hypot(x: f64, y: f64) -> f64;
        pub fn pow(x: f64, y: f64) -> f64;
        pub fn exp(x: f64) -> f64;
        pub fn hypot3(x: f64, y: f64, z: f64) -> f64;
    }
}

#[cfg(target_arch = "wasm32")]
#[inline]
pub fn sin(x: f64) -> f64 {
    unsafe { host::sin(x) }
}
#[cfg(target_arch = "wasm32")]
#[inline]
pub fn cos(x: f64) -> f64 {
    unsafe { host::cos(x) }
}
#[cfg(target_arch = "wasm32")]
#[inline]
pub fn atan2(y: f64, x: f64) -> f64 {
    unsafe { host::atan2(y, x) }
}
#[cfg(target_arch = "wasm32")]
#[inline]
pub fn hypot(x: f64, y: f64) -> f64 {
    unsafe { host::hypot(x, y) }
}

#[cfg(target_arch = "wasm32")]
#[inline]
pub fn pow(x: f64, y: f64) -> f64 {
    unsafe { host::pow(x, y) }
}
#[cfg(target_arch = "wasm32")]
#[inline]
pub fn exp(x: f64) -> f64 {
    unsafe { host::exp(x) }
}
#[cfg(target_arch = "wasm32")]
#[inline]
pub fn hypot3(x: f64, y: f64, z: f64) -> f64 {
    unsafe { host::hypot3(x, y, z) }
}
#[cfg(not(target_arch = "wasm32"))]
pub fn exp(x: f64) -> f64 {
    x.exp()
}
/// Math.hypot with three numbers (not two hypots in a row, which round differently).
#[cfg(not(target_arch = "wasm32"))]
pub fn hypot3(x: f64, y: f64, z: f64) -> f64 {
    (x * x + y * y + z * z).sqrt()
}
#[cfg(not(target_arch = "wasm32"))]
pub fn pow(x: f64, y: f64) -> f64 {
    x.powf(y)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn sin(x: f64) -> f64 {
    x.sin()
}
#[cfg(not(target_arch = "wasm32"))]
pub fn cos(x: f64) -> f64 {
    x.cos()
}
#[cfg(not(target_arch = "wasm32"))]
pub fn atan2(y: f64, x: f64) -> f64 {
    y.atan2(x)
}
#[cfg(not(target_arch = "wasm32"))]
pub fn hypot(x: f64, y: f64) -> f64 {
    x.hypot(y)
}

pub const DEG: f64 = std::f64::consts::PI / 180.0;

/// JavaScript's Math.min for two numbers.
#[inline]
pub fn min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() { a } else { b }
    } else if a < b {
        a
    } else {
        b
    }
}
/// JavaScript's Math.max for two numbers.
#[inline]
pub fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() { b } else { a }
    } else if a > b {
        a
    } else {
        b
    }
}
/// JavaScript's Math.sign.
#[inline]
pub fn sign(a: f64) -> f64 {
    if a > 0.0 {
        1.0
    } else if a < 0.0 {
        -1.0
    } else {
        a // 0, -0 or NaN, as given
    }
}
/// An angle brought into -pi..pi, as the tank does it.
#[inline]
pub fn wrap(a: f64) -> f64 {
    atan2(sin(a), cos(a))
}
/// Ease v toward target at a rate, over dt.
#[inline]
pub fn smooth(v: f64, target: f64, rate: f64, dt: f64) -> f64 {
    v + (target - v) * min(1.0, dt * rate)
}
/// JavaScript's `x || fallback` for a number: the fallback when x is 0 or NaN.
#[inline]
pub fn or(x: f64, fallback: f64) -> f64 {
    if x == 0.0 || x.is_nan() { fallback } else { x }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn min_max_follow_javascript() {
        assert!(min(f64::NAN, 1.0).is_nan() && max(1.0, f64::NAN).is_nan());
        assert!(min(0.0, -0.0).is_sign_negative() && min(-0.0, 0.0).is_sign_negative());
        assert!(max(0.0, -0.0).is_sign_positive() && max(-0.0, 0.0).is_sign_positive());
        assert_eq!(min(2.0, 3.0), 2.0);
        assert_eq!(max(2.0, 3.0), 3.0);
    }
    #[test]
    fn sign_keeps_zero_and_nan() {
        assert_eq!(sign(3.0), 1.0);
        assert_eq!(sign(-0.5), -1.0);
        assert!(sign(-0.0).is_sign_negative() && sign(-0.0) == 0.0);
        assert!(sign(f64::NAN).is_nan());
    }
    #[test]
    fn or_falls_back_on_zero_and_nan() {
        assert_eq!(or(0.0, 1.0), 1.0);
        assert_eq!(or(f64::NAN, 1.0), 1.0);
        assert_eq!(or(2.0, 1.0), 2.0);
    }
}
