import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUD_SPRING, springEasing, springTransition } from '../src/lib/motion';

const stops = (easing: string) => easing.slice('linear('.length, -1).split(', ').map(Number);

describe('springEasing', () => {
  it('starts at 0 and ends exactly at 1', () => {
    const points = stops(springEasing());
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
  });

  it('overshoots slightly when underdamped and never when critically damped', () => {
    expect(Math.max(...stops(springEasing(0.8)))).toBeCloseTo(1.015, 2);
    expect(Math.max(...stops(springEasing(1)))).toBeLessThanOrEqual(1);
  });

  it('matches the --hud-ease-spring token', () => {
    const css = readFileSync(resolve(__dirname, '../src/styles/tokens.css'), 'utf8');
    expect(css).toContain(`--hud-ease-spring: ${HUD_SPRING.easing};`);
    expect(css).toContain(`--hud-duration-spring: ${HUD_SPRING.durationMs}ms;`);
  });

  it('builds a transition for several properties', () => {
    expect(springTransition('width', 'opacity')).toMatch(/^width 460ms linear\(.*\), opacity 460ms linear\(/);
  });
});
