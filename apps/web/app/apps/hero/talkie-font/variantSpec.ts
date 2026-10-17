/**
 * Variant specifications for the Talkie font family.
 * Each variant is a parametric transform: stock glyph → modified glyph.
 */

import type { PathCommand } from '../types';
import type { StockGlyph } from './fontLoader';
import { roundCornersInPath } from './pathUtils';
import { getSymbolCategory, isSymbolGlyph } from './symbolCategories';

// ── Variant parameter types ──

export interface SoftParams {
  cornerSoftness: number;  // 0–50u, def 25
  spacingFactor: number;   // 0.85–1.20, def 1.05
}

export interface HardParams {
  cornerSoftness: number;  // 0–10u, def 0
  spacingFactor: number;   // 0.85–1.05, def 0.95
}

export interface MonoParams {
  cornerSoftness: number;    // 0–15u, def 0
  thinning: number;          // 0–20u, no-op (JBM Regular base)
  symbolCurvature: number;   // 0.6–1.4×, def 1.0
  bracketAngle: number;      // -20..+20°, def 0
  symbolWeight: number;      // -20..+20u, def 0
}

export const DEFAULT_SOFT: SoftParams = { cornerSoftness: 25, spacingFactor: 1.05 };
export const DEFAULT_HARD: HardParams = { cornerSoftness: 0, spacingFactor: 0.95 };
export const DEFAULT_MONO: MonoParams = {
  cornerSoftness: 0,
  thinning: 0,
  symbolCurvature: 1.0,
  bracketAngle: 0,
  symbolWeight: 0,
};

export type VariantId = 'soft' | 'hard' | 'mono' | 'wordmark';

// ── Transform functions ──

export interface TransformedGlyph {
  char: string;
  unicode: number;
  name: string | null;
  path: PathCommand[];
  advanceWidth: number;
}

/** Apply Soft variant transforms to a stock glyph. */
export function transformSoft(glyph: StockGlyph, params: SoftParams): TransformedGlyph {
  const path = roundCornersInPath([...glyph.path], params.cornerSoftness);
  const advanceWidth = Math.round(glyph.advanceWidth * params.spacingFactor);
  return { char: glyph.char, unicode: glyph.unicode, name: glyph.name, path, advanceWidth };
}

/** Apply Hard variant transforms to a stock glyph. */
export function transformHard(glyph: StockGlyph, params: HardParams): TransformedGlyph {
  const path = params.cornerSoftness > 0
    ? roundCornersInPath([...glyph.path], params.cornerSoftness)
    : [...glyph.path];
  const advanceWidth = Math.round(glyph.advanceWidth * params.spacingFactor);
  return { char: glyph.char, unicode: glyph.unicode, name: glyph.name, path, advanceWidth };
}

// ── Mono symbol transforms ──

/** Compute glyph x-centerline from path commands. */
function glyphCenterX(path: PathCommand[], advanceWidth: number): number {
  let minX = Infinity, maxX = -Infinity;
  for (const cmd of path) {
    const c = cmd as any;
    if (typeof c.x === 'number') { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); }
    if (typeof c.x1 === 'number') { minX = Math.min(minX, c.x1); maxX = Math.max(maxX, c.x1); }
    if (typeof c.x2 === 'number') { minX = Math.min(minX, c.x2); maxX = Math.max(maxX, c.x2); }
  }
  if (!isFinite(minX)) return advanceWidth / 2;
  return (minX + maxX) / 2;
}

/** Compute glyph y-centerline from path commands. */
function glyphCenterY(path: PathCommand[]): number {
  let minY = Infinity, maxY = -Infinity;
  for (const cmd of path) {
    const c = cmd as any;
    if (typeof c.y === 'number') { minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
    if (typeof c.y1 === 'number') { minY = Math.min(minY, c.y1); maxY = Math.max(maxY, c.y1); }
    if (typeof c.y2 === 'number') { minY = Math.min(minY, c.y2); maxY = Math.max(maxY, c.y2); }
  }
  if (!isFinite(minY)) return 300;
  return (minY + maxY) / 2;
}

/**
 * Symbol curvature: scale x-distance of control points from glyph centerline.
 * Factor < 1.0 = tighter curves; > 1.0 = wider/more open curves.
 */
function applyCurvature(path: PathCommand[], factor: number, advWidth: number): PathCommand[] {
  if (factor === 1.0) return path;
  const cx = glyphCenterX(path, advWidth);
  return path.map(cmd => {
    const c = { ...cmd } as any;
    // Scale control points (x1, x2) and curve endpoints
    if (typeof c.x === 'number') c.x = cx + (c.x - cx) * factor;
    if (typeof c.x1 === 'number') c.x1 = cx + (c.x1 - cx) * factor;
    if (typeof c.x2 === 'number') c.x2 = cx + (c.x2 - cx) * factor;
    return c;
  });
}

/**
 * Bracket angle: horizontal shear proportional to y-distance from glyph center.
 * Positive angle = forward slant, negative = back slant.
 */
function applyShear(path: PathCommand[], angleDeg: number): PathCommand[] {
  if (angleDeg === 0) return path;
  const cy = glyphCenterY(path);
  const shear = Math.tan((angleDeg * Math.PI) / 180);
  return path.map(cmd => {
    const c = { ...cmd } as any;
    if (typeof c.x === 'number' && typeof c.y === 'number') c.x += (c.y - cy) * shear;
    if (typeof c.x1 === 'number' && typeof c.y1 === 'number') c.x1 += (c.y1 - cy) * shear;
    if (typeof c.x2 === 'number' && typeof c.y2 === 'number') c.x2 += (c.y2 - cy) * shear;
    return c;
  });
}

/**
 * Symbol weight: expand/contract vertical stems in symbol glyphs.
 * Positive = thicker stems, negative = thinner.
 * Works by scaling x from centerline by a small factor derived from weight.
 */
function applySymbolWeight(path: PathCommand[], weight: number, advWidth: number): PathCommand[] {
  if (weight === 0) return path;
  const cx = glyphCenterX(path, advWidth);
  // Convert weight (UPM units) to a scale factor relative to typical glyph width (~300u half-width)
  const halfWidth = 250; // approximate
  const factor = 1 + weight / halfWidth;
  return path.map(cmd => {
    const c = { ...cmd } as any;
    if (typeof c.x === 'number') c.x = cx + (c.x - cx) * factor;
    if (typeof c.x1 === 'number') c.x1 = cx + (c.x1 - cx) * factor;
    if (typeof c.x2 === 'number') c.x2 = cx + (c.x2 - cx) * factor;
    return c;
  });
}

/** Apply Mono variant transforms to a stock glyph (JBM Regular base). */
export function transformMono(glyph: StockGlyph, params: MonoParams): TransformedGlyph {
  let path = params.cornerSoftness > 0
    ? roundCornersInPath([...glyph.path], params.cornerSoftness)
    : [...glyph.path];

  const category = getSymbolCategory(glyph.char);

  // Apply symbol-specific transforms
  if (category === 'curved') {
    if (params.symbolCurvature !== 1.0) {
      path = applyCurvature(path, params.symbolCurvature, glyph.advanceWidth);
    }
    if (params.symbolWeight !== 0) {
      path = applySymbolWeight(path, params.symbolWeight, glyph.advanceWidth);
    }
  } else if (category === 'angular') {
    if (params.bracketAngle !== 0) {
      path = applyShear(path, params.bracketAngle);
    }
    if (params.symbolWeight !== 0) {
      path = applySymbolWeight(path, params.symbolWeight, glyph.advanceWidth);
    }
  } else if (category === 'straight' && isSymbolGlyph(glyph.char)) {
    if (params.symbolWeight !== 0) {
      path = applySymbolWeight(path, params.symbolWeight, glyph.advanceWidth);
    }
  }

  return {
    char: glyph.char,
    unicode: glyph.unicode,
    name: glyph.name,
    path,
    advanceWidth: 600,
  };
}

// ── Variant metadata ──

export const VARIANT_META: Record<VariantId, {
  label: string;
  familyName: string;
  description: string;
}> = {
  soft: {
    label: 'Soft',
    familyName: 'Talkie Soft',
    description: 'Warm display face — rounded corners, generous spacing',
  },
  hard: {
    label: 'Hard',
    familyName: 'Talkie Hard',
    description: 'Precise UI face — sharp corners, tight spacing',
  },
  mono: {
    label: 'Mono',
    familyName: 'Talkie Mono',
    description: 'Terminal face — strict 600u monospace, Regular weight',
  },
  wordmark: {
    label: 'Wordmark',
    familyName: 'Talkie',
    description: 'Bespoke 6-glyph logotype — read-only reference',
  },
};
