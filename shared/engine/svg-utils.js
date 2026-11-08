/**
 * INTERACTIONS — Shared SVG Utilities
 *
 * Usage (from a component 3 levels deep):
 *   import { mk, p2c, describeArc, gooDefs, lerp } from '../../../shared/svg-utils.js';
 */

export const NS = 'http://www.w3.org/2000/svg';

// ── Element creation ──────────────────────────────────────────────────────────

/** Create an SVG element with attributes in one call. */
export function mk(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Shorthand: set an attribute on an element by id. */
export function setAttr(id, attr, val) {
  document.getElementById(id).setAttribute(attr, val);
}

/** Shorthand: set text content on an element by id. */
export function setText(id, val) {
  document.getElementById(id).textContent = val;
}

// ── Polar geometry ────────────────────────────────────────────────────────────

/**
 * Convert polar coordinates (0° = 12 o'clock, clockwise) to Cartesian.
 * @param {number} cx - Centre x
 * @param {number} cy - Centre y
 * @param {number} r  - Radius
 * @param {number} angleDeg - Angle in degrees (0 = top)
 */
export function p2c(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Build an SVG arc path string.
 * @param {number} cx - Centre x
 * @param {number} cy - Centre y
 * @param {number} r  - Radius
 * @param {number} startAngle - Start angle in degrees
 * @param {number} endAngle   - End angle in degrees
 */
export function describeArc(cx, cy, r, startAngle, endAngle) {
  const s = p2c(cx, cy, r, endAngle);
  const e = p2c(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

// ── Goo / metaball filters ────────────────────────────────────────────────────

/**
 * Return SVG <filter> markup for a two-layer goo/metaball effect.
 * Paste inside an SVG <defs> block.
 *
 * @param {number} outerSD - Outer blur stdDeviation (default 14)
 * @param {number} innerSD - Inner blur stdDeviation (default 10)
 */
export function gooDefs(outerSD = 14, innerSD = 10) {
  return `
    <filter id="gooOuter" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${outerSD}" result="blur"/>
      <feColorMatrix in="blur" mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -14"/>
    </filter>
    <filter id="gooInner" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${innerSD}" result="blur"/>
      <feColorMatrix in="blur" mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 30 -15"/>
    </filter>`;
}

// ── Animation helpers ─────────────────────────────────────────────────────────

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Resolve the shortest angular distance from `current` to `target` (degrees).
 * Useful for RAF-lerped dial rotation to avoid spinning the long way around.
 */
export function shortAngleLerp(current, target, t) {
  let d = ((target - current + 180) % 360) - 180;
  return current + d * t;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}
