//! The simulation's clock, as in `src/core/clock.ts`: frame time is cut into quanta and each frame runs one step of a
//! whole number of them, so a step's dt is one of a few exact values and a run replays.

#[derive(Clone, Debug)]
pub struct Clock {
    pub quanta: f64,
    pub max_q: f64,
    pub q: f64,
    /// Simulated seconds.
    pub t: f64,
    pub steps: u32,
    /// Slows the world (hit-stop, a choice open).
    pub scale: f64,
    acc: f64,
}

impl Clock {
    pub fn new(quanta: f64, max_q: f64) -> Self {
        Clock { quanta, max_q, q: 1.0 / quanta, t: 0.0, steps: 0, scale: 1.0, acc: 0.0 }
    }
    /// Wall seconds since the last frame, to this frame's step in sim seconds (0: nothing to run yet).
    pub fn advance(&mut self, wall: f64) -> f64 {
        self.acc += wall.max(0.0);
        let mut k = (self.acc / self.q + 1e-9).floor();
        if k <= 0.0 {
            return 0.0;
        }
        self.acc -= k * self.q;
        if k > self.max_q {
            // fell behind (a hidden tab): drop the backlog
            k = self.max_q;
            self.acc = 0.0;
        }
        self.tick(k * self.q * self.scale)
    }
    /// A step of exactly n quanta, for headless runs.
    pub fn fixed(&mut self, n: f64) -> f64 {
        self.tick(n * self.q * self.scale)
    }
    fn tick(&mut self, dt: f64) -> f64 {
        self.t += dt;
        self.steps += 1;
        dt
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_are_whole_quanta() {
        let mut c = Clock::new(240.0, 12.0);
        let dt = c.advance(1.0 / 60.0);
        assert!((dt * 240.0 - (dt * 240.0).round()).abs() < 1e-9);
        assert_eq!(c.steps, 1);
    }
    #[test]
    fn too_short_a_frame_waits() {
        let mut c = Clock::new(240.0, 12.0);
        assert_eq!(c.advance(0.001), 0.0);
        assert_eq!(c.steps, 0);
        assert!(c.advance(0.004) > 0.0);
    }
    #[test]
    fn a_backlog_is_dropped() {
        let mut c = Clock::new(240.0, 12.0);
        assert_eq!(c.advance(5.0), 12.0 / 240.0);
        assert_eq!(c.advance(0.0), 0.0);
    }
    #[test]
    fn scale_slows_the_step() {
        let mut c = Clock::new(240.0, 12.0);
        c.scale = 0.5;
        assert_eq!(c.fixed(4.0), 4.0 / 240.0 * 0.5);
    }
}
