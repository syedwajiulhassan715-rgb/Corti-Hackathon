/**
 * Cubic-bezier easing, evaluated in JS.
 *
 * The flight is driven by requestAnimationFrame rather than a CSS transition,
 * because the establishing child has to resolve detail in step with the camera
 * -- it needs the eased value every frame, not just at the ends. So the curve
 * that CSS would have applied is solved here instead, and the same number
 * drives both the transform and the onZoom callback. One curve, one clock.
 *
 * No dependency: this is the standard Newton-then-bisection solve for x(t) = x,
 * exactly what a browser does for `transition-timing-function`.
 */

const NEWTON_ITERATIONS = 6;
const BISECTION_ITERATIONS = 12;
const EPSILON = 1e-6;

function bezier(a: number, b: number, t: number): number {
  // (1-t)^3*0 + 3(1-t)^2*t*a + 3(1-t)*t^2*b + t^3*1, in Horner form.
  const c = 3 * a;
  const d = 3 * (b - a) - c;
  const e = 1 - c - d;
  return ((e * t + d) * t + c) * t;
}

function slope(a: number, b: number, t: number): number {
  const c = 3 * a;
  const d = 3 * (b - a) - c;
  const e = 1 - c - d;
  return (3 * e * t + 2 * d) * t + c;
}

/** Returns an easing function f(progress 0..1) -> eased 0..1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const linear = x1 === y1 && x2 === y2;
  return (x: number): number => {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    if (linear) return x;

    let t = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
      const derivative = slope(x1, x2, t);
      if (Math.abs(derivative) < EPSILON) break;
      const error = bezier(x1, x2, t) - x;
      if (Math.abs(error) < EPSILON) return bezier(y1, y2, t);
      t -= error / derivative;
    }

    // Newton can walk out of range on flat segments; finish with bisection,
    // which cannot.
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
      const current = bezier(x1, x2, t);
      if (Math.abs(current - x) < EPSILON) break;
      if (current > x) high = t;
      else low = t;
      t = (low + high) / 2;
    }
    return bezier(y1, y2, t);
  };
}

/**
 * The camera curve. Fast commit, long settle -- the move reads as one optical
 * push that decelerates into the ward rather than a swoop that arrives and
 * bounces. Deliberately not a spring: nothing clinical should overshoot.
 */
export const EASE_CAMERA = cubicBezier(0.16, 0.84, 0.24, 1);

/** Cross-fades want a gentler shoulder than the move itself. */
export const EASE_FADE = cubicBezier(0.4, 0, 0.2, 1);

/** Maps v from [from, to] onto 0..1, clamped. */
export function ramp(value: number, from: number, to: number): number {
  if (to <= from) return value >= to ? 1 : 0;
  const t = (value - from) / (to - from);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
