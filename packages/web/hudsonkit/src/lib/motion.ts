// Spring motion as plain CSS. A damped spring is sampled into a `linear()`
// easing, so any `transition` or `animate()` call gets spring movement without
// a JS animation loop. Most of the travel happens in the first third; the rest
// is a short, soft settle.

/**
 * Sample a damped spring (unit mass, starting at rest) into a CSS `linear()`
 * easing. Stiffness is scaled so the spring settles at t = 1, which makes the
 * transition's duration the settle time.
 *
 * - `dampingRatio` 1 never overshoots; 0.8 overshoots about 1.5%; 0.6 about 9%.
 */
export function springEasing(dampingRatio = 0.8, samples = 32): string {
  const zeta = Math.min(Math.max(dampingRatio, 0.05), 1);
  const omega = Math.log(1000) / zeta;
  const at = (t: number): number => {
    if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t)
      * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t));
  };
  const points = Array.from({ length: samples + 1 }, (_, i) => (i === samples ? 1 : at(i / samples)));
  return `linear(${points.map((p) => Number(p.toFixed(4))).join(', ')})`;
}

/** Hudson's default spring: smooth, with a slight settle. Mirrors --hud-ease-spring. */
export const HUD_SPRING = {
  easing: springEasing(0.8),
  durationMs: 460,
} as const;

/** `transition` shorthand for one or more properties on the default spring. */
export function springTransition(...properties: string[]): string {
  return properties
    .map((property) => `${property} ${HUD_SPRING.durationMs}ms ${HUD_SPRING.easing}`)
    .join(', ');
}
