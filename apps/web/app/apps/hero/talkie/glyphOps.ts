/**
 * Glyph path manipulation for the Talkie wordmark studio.
 * All operations work on HeroFont PathCommand arrays in 1000 UPM space.
 *
 * v2 semantics: each builder returns a path auto-centered on its own advance/2.
 * The assembler applies `*_offsetX` as a signed offset from that cell-center.
 * `offsetX = 0` means "stem-center (geometric glyphs) or bbox-center
 * (stock-path glyphs) sits at advance/2" — visually neutral.
 */

import type { PathCommand } from '../types';
import type { TalkieParams } from './types';
import { TALKIE_PARAMS_VERSION } from './types';

// ── Natural heights of stock JBM Medium glyphs (measured from path y_max) ──
const NATURAL_H: Record<string, number> = {
  l: 730,
  k: 730,
  a: 560,
  e: 560,
};

// ── Stock a stem: right edge at x=518, left inner at x=410, width=108u ──
const A_STEM_OUTER_X = 518;
const A_STEM_NATURAL_W = 108;

// ── Stock JBM Medium glyph paths (extracted once, used as templates) ──

let stockGlyphs: Record<string, { path: PathCommand[]; advanceWidth: number }> = {};

export function setStockGlyphs(glyphs: typeof stockGlyphs) {
  stockGlyphs = glyphs;
}

export function getStockGlyphs() {
  return stockGlyphs;
}

// ── Path overrides from draw mode ──

let pathOverrides: Record<string, PathCommand[]> = {};

export function setPathOverride(char: string, path: PathCommand[]) {
  pathOverrides = { ...pathOverrides, [char]: path };
}

export function clearPathOverride(char: string) {
  const next = { ...pathOverrides };
  delete next[char];
  pathOverrides = next;
}

export function getPathOverrides() {
  return pathOverrides;
}

export function setAllPathOverrides(overrides: Record<string, PathCommand[]>) {
  pathOverrides = overrides;
}

// ── Path math helpers ──

function translatePath(path: PathCommand[], dx: number): PathCommand[] {
  if (dx === 0) return path;
  return path.map((cmd) => {
    const c = { ...cmd } as any;
    if (typeof c.x === 'number') c.x += dx;
    if (typeof c.x1 === 'number') c.x1 += dx;
    if (typeof c.x2 === 'number') c.x2 += dx;
    return c;
  });
}

function scalePathY(path: PathCommand[], ratio: number): PathCommand[] {
  if (ratio === 1) return path;
  return path.map((cmd) => {
    const c = { ...cmd } as any;
    if (typeof c.y === 'number') c.y *= ratio;
    if (typeof c.y1 === 'number') c.y1 *= ratio;
    if (typeof c.y2 === 'number') c.y2 *= ratio;
    return c;
  });
}

/** X-extent (bbox) of a path. Used to auto-center stock-path builders. */
function pathBboxX(path: PathCommand[]): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const cmd of path) {
    const c = cmd as any;
    if (typeof c.x === 'number') { min = Math.min(min, c.x); max = Math.max(max, c.x); }
    if (typeof c.x1 === 'number') { min = Math.min(min, c.x1); max = Math.max(max, c.x1); }
    if (typeof c.x2 === 'number') { min = Math.min(min, c.x2); max = Math.max(max, c.x2); }
  }
  if (!isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}

/** Translate a path so its x-bbox center sits at `targetCx`. */
function centerPathAt(path: PathCommand[], targetCx: number): PathCommand[] {
  const { min, max } = pathBboxX(path);
  const currentCx = (min + max) / 2;
  return translatePath(path, targetCx - currentCx);
}

/**
 * Corner radii specification. A single number applies uniformly;
 * an object with ext/int applies different radii to convex (external)
 * vs concave (internal) corners, detected via cross product of
 * incoming × outgoing edge vectors.
 */
type CornerRadii = number | { ext: number; int: number };

function resolveRadii(r: CornerRadii): { ext: number; int: number } {
  if (typeof r === 'number') return { ext: r, int: r };
  return r;
}

/**
 * Resolve effective corner radii for a glyph.
 * If per-glyph override is non-zero, use it uniformly (backward compat).
 * Otherwise use the global external/internal split.
 */
function effectiveRadii(p: TalkieParams, perGlyph: number): CornerRadii {
  if (perGlyph > 0) return perGlyph; // uniform per-glyph override
  if (p.cornerSoftnessExternal > 0 || p.cornerSoftnessInternal > 0) {
    return { ext: p.cornerSoftnessExternal, int: p.cornerSoftnessInternal };
  }
  return 0;
}

// Round line-to-line AND curve-to-line corners in a path.
// Convexity detection: cross product of inDir × outDir.
// Positive cross (CCW turn) = convex/external; negative = concave/internal.
// Radius is capped at 45% of the shorter neighbouring length.
function roundCornersInPath(path: PathCommand[], radii: CornerRadii): PathCommand[] {
  const { ext, int } = resolveRadii(radii);
  if (ext <= 0 && int <= 0) return path;
  const result: PathCommand[] = [];
  let cursor = { x: 0, y: 0 };

  for (let i = 0; i < path.length; i++) {
    const curr = path[i] as any;
    const next = path[i + 1] as any;

    if (curr.type === 'moveTo') {
      result.push(curr);
      cursor = { x: curr.x, y: curr.y };
      continue;
    }
    if (curr.type === 'closePath') {
      result.push(curr);
      continue;
    }
    if (curr.type !== 'lineTo' && curr.type !== 'quadraticCurveTo') {
      result.push(curr);
      if (typeof curr.x === 'number') cursor = { x: curr.x, y: curr.y };
      continue;
    }

    if (!next || next.type !== 'lineTo') {
      result.push(curr);
      cursor = { x: curr.x, y: curr.y };
      continue;
    }

    const P = { x: curr.x, y: curr.y };

    let inDir: { x: number; y: number };
    let inAvail: number;
    if (curr.type === 'lineTo') {
      const vx = P.x - cursor.x, vy = P.y - cursor.y;
      const len = Math.hypot(vx, vy);
      if (len < 1e-6) { result.push(curr); cursor = P; continue; }
      inDir = { x: vx / len, y: vy / len };
      inAvail = len * 0.45;
    } else {
      const vx = P.x - curr.x1, vy = P.y - curr.y1;
      const len = Math.hypot(vx, vy);
      if (len < 1e-6) { result.push(curr); cursor = P; continue; }
      inDir = { x: vx / len, y: vy / len };
      inAvail = len * 0.45;
    }

    const ovx = next.x - P.x, ovy = next.y - P.y;
    const outLen = Math.hypot(ovx, ovy);
    if (outLen < 1e-6) { result.push(curr); cursor = P; continue; }
    const outDir = { x: ovx / outLen, y: ovy / outLen };
    const outAvail = outLen * 0.45;

    const dot = inDir.x * outDir.x + inDir.y * outDir.y;
    if (dot > 0.95) { result.push(curr); cursor = P; continue; }

    // Cross product of inDir × outDir determines convexity.
    // Positive = left turn = convex/external; negative = right turn = concave/internal.
    const cross = inDir.x * outDir.y - inDir.y * outDir.x;
    const baseRadius = cross >= 0 ? ext : int;
    if (baseRadius <= 0) { result.push(curr); cursor = P; continue; }

    const r = Math.min(baseRadius, inAvail, outAvail);
    if (r < 0.5) { result.push(curr); cursor = P; continue; }

    const P_forward = { x: P.x + r * outDir.x, y: P.y + r * outDir.y };

    if (curr.type === 'lineTo') {
      const P_back = { x: P.x - r * inDir.x, y: P.y - r * inDir.y };
      result.push({ type: 'lineTo', x: P_back.x, y: P_back.y });
    } else {
      const dPC = Math.hypot(P.x - curr.x1, P.y - curr.y1);
      const tBack = Math.max(0.5, Math.min(0.99, 1 - r / dPC));
      const S = cursor;
      const C = { x: curr.x1, y: curr.y1 };
      const E = P;
      const C1x = (1 - tBack) * S.x + tBack * C.x;
      const C1y = (1 - tBack) * S.y + tBack * C.y;
      const C2x = (1 - tBack) * C.x + tBack * E.x;
      const C2y = (1 - tBack) * C.y + tBack * E.y;
      const Mx = (1 - tBack) * C1x + tBack * C2x;
      const My = (1 - tBack) * C1y + tBack * C2y;
      result.push({ type: 'quadraticCurveTo', x1: C1x, y1: C1y, x: Mx, y: My } as PathCommand);
    }

    result.push({ type: 'quadraticCurveTo', x1: P.x, y1: P.y, x: P_forward.x, y: P_forward.y } as PathCommand);
    cursor = P_forward;
  }
  return result;
}

// ── Builders ──
//
// Each builder returns a path in the "offsetX=0" frame: stem-center
// (geometric glyphs) or bbox-center (stock-path glyphs) lands at advance/2.
// The assembler is the single place *_offsetX is applied.

/** i: dotless bar, stem-center at i_advance/2. */
function buildI(p: TalkieParams): { path: PathCommand[]; advanceWidth: number } {
  const stemW = p.i_stemWidth;
  const adv = p.i_advance;
  const h = p.i_height;
  const r = p.i_cornerSoftness;

  const center = adv / 2;
  const stemLeft = center - stemW / 2;
  const stemRight = center + stemW / 2;

  const path: PathCommand[] = [
    { type: 'moveTo', x: stemLeft, y: r },
    { type: 'quadraticCurveTo', x1: stemLeft, y1: 0, x: stemLeft + r, y: 0 },
    { type: 'lineTo', x: stemRight - r, y: 0 },
    { type: 'quadraticCurveTo', x1: stemRight, y1: 0, x: stemRight, y: r },
    { type: 'lineTo', x: stemRight, y: h - r },
    { type: 'quadraticCurveTo', x1: stemRight, y1: h, x: stemRight - r, y: h },
    { type: 'lineTo', x: stemLeft + r, y: h },
    { type: 'quadraticCurveTo', x1: stemLeft, y1: h, x: stemLeft, y: h - r },
    { type: 'lineTo', x: stemLeft, y: r },
    { type: 'closePath' },
  ];

  return { path, advanceWidth: adv };
}

/** t: tuned crossbar, hook, height. bbox-center at t_advance/2. */
function buildT(p: TalkieParams): { path: PathCommand[]; advanceWidth: number } {
  const stock = stockGlyphs['t'];
  if (!stock) return { path: [], advanceWidth: 600 };

  const crossbarBottom = 550 - p.t_crossbarThickness;
  const hookScale = p.t_hookTightness / 100;

  const path: PathCommand[] = [];
  for (const cmd of stock.path) {
    const c = { ...cmd } as any;
    if (c.type === 'lineTo' || c.type === 'moveTo') {
      if (c.x === 524 && (c.y === 550 || c.y === 452)) c.x = p.t_crossbarRight;
      if (c.x === 49 && (c.y === 550 || c.y === 452)) c.x = p.t_crossbarLeft;
      if (c.y === 452) c.y = crossbarBottom;
      if (c.y === 705) c.y = p.t_height;
    }
    if (c.type === 'quadraticCurveTo') {
      if (c.x1 === 285 && c.y1 === 0 && c.x === 243 && c.y === 41) {
        c.x1 = 285 + (295 - 285) * (1 - hookScale);
        c.x = 243 + (250 - 243) * (1 - hookScale);
        c.y = 41 - (41 - 36) * (1 - hookScale);
      }
      if (c.x1 === 201 && c.y1 === 82 && c.x === 201 && c.y === 155) {
        c.y1 = 82 - (82 - 68) * (1 - hookScale);
        c.y = 155 - (155 - 130) * (1 - hookScale);
      }
    }
    path.push(c);
  }

  const rounded = roundCornersInPath(path, effectiveRadii(p, p.t_cornerSoftness));
  return { path: centerPathAt(rounded, p.t_advance / 2), advanceWidth: p.t_advance };
}

/** l: bar-only or foot variant. Centered at l_advance/2. */
function buildL(p: TalkieParams): { path: PathCommand[]; advanceWidth: number } {
  const stock = stockGlyphs['l'];
  if (!stock) return { path: [], advanceWidth: 600 };

  const h = p.l_height;

  if (!p.l_foot) {
    const stemW = p.l_stemWidth;
    const center = p.l_advance / 2;
    const stemLeft = center - stemW / 2;
    const stemRight = center + stemW / 2;
    const r = p.l_cornerSoftness;

    const path: PathCommand[] = [
      { type: 'moveTo', x: stemLeft, y: r },
      { type: 'quadraticCurveTo', x1: stemLeft, y1: 0, x: stemLeft + r, y: 0 },
      { type: 'lineTo', x: stemRight - r, y: 0 },
      { type: 'quadraticCurveTo', x1: stemRight, y1: 0, x: stemRight, y: r },
      { type: 'lineTo', x: stemRight, y: h - r },
      { type: 'quadraticCurveTo', x1: stemRight, y1: h, x: stemRight - r, y: h },
      { type: 'lineTo', x: stemLeft + r, y: h },
      { type: 'quadraticCurveTo', x1: stemLeft, y1: h, x: stemLeft, y: h - r },
      { type: 'lineTo', x: stemLeft, y: r },
      { type: 'closePath' },
    ];
    return { path, advanceWidth: p.l_advance };
  }

  // With foot: scale y, round corners, then center bbox at advance/2
  const ratio = h / NATURAL_H['l'];
  let path = stock.path.map((cmd) => ({ ...cmd }));
  path = scalePathY(path, ratio);
  path = roundCornersInPath(path, effectiveRadii(p, p.l_cornerSoftness));
  return { path: centerPathAt(path, p.l_advance / 2), advanceWidth: p.l_advance };
}

/** k: height-scaled stock, bbox-center at k_advance/2. */
function buildK(p: TalkieParams): { path: PathCommand[]; advanceWidth: number } {
  const stock = stockGlyphs['k'];
  if (!stock) return { path: [], advanceWidth: 600 };

  const ratio = p.k_height / NATURAL_H['k'];
  let path = stock.path.map((cmd) => ({ ...cmd }));
  path = scalePathY(path, ratio);
  path = roundCornersInPath(path, effectiveRadii(p, p.k_cornerSoftness));
  return { path: centerPathAt(path, p.k_advance / 2), advanceWidth: p.k_advance };
}

/** a: height-scaled stock + optional stem widening + foot curl. */
function buildA(p: TalkieParams): { path: PathCommand[]; advanceWidth: number } {
  const stock = stockGlyphs['a'];
  if (!stock) return { path: [], advanceWidth: 600 };

  const heightRatio = p.a_height / NATURAL_H['a'];
  const stemDelta = p.a_stemWidth - A_STEM_NATURAL_W;

  const path: PathCommand[] = [];
  for (const cmd of stock.path) {
    const c = { ...cmd } as any;
    if (typeof c.x === 'number' && c.x === A_STEM_OUTER_X) c.x = A_STEM_OUTER_X + stemDelta;
    if (typeof c.x1 === 'number' && c.x1 === A_STEM_OUTER_X) c.x1 = A_STEM_OUTER_X + stemDelta;
    if (p.a_footCurl && p.a_footCurlAmount > 0) {
      if (c.type === 'lineTo' && c.x === A_STEM_OUTER_X + stemDelta && c.y === 0) {
        c.x += p.a_footCurlAmount;
      }
    }
    path.push(c);
  }

  const scaled = roundCornersInPath(scalePathY(path, heightRatio), effectiveRadii(p, p.a_cornerSoftness));
  return { path: centerPathAt(scaled, p.a_advance / 2), advanceWidth: p.a_advance };
}

/** e: height-scaled stock, bbox-center at e_advance/2. */
function buildE(p: TalkieParams): { path: PathCommand[]; advanceWidth: number } {
  const stock = stockGlyphs['e'];
  if (!stock) return { path: [], advanceWidth: 600 };

  const ratio = p.e_height / NATURAL_H['e'];
  let path = stock.path.map((cmd) => ({ ...cmd }));
  path = scalePathY(path, ratio);
  path = roundCornersInPath(path, effectiveRadii(p, p.e_cornerSoftness));
  return { path: centerPathAt(path, p.e_advance / 2), advanceWidth: p.e_advance };
}

// ── Main: build all word glyphs ──

export interface WordGlyph {
  char: string;
  path: PathCommand[];
  advanceWidth: number;
}

export function buildWordmark(p: TalkieParams): WordGlyph[] {
  const t = buildT(p);
  const a = buildA(p);
  const l = buildL(p);
  const k = buildK(p);
  const i = buildI(p);
  const e = buildE(p);

  const glyphs = [
    { char: 't', ...t },
    { char: 'a', ...a },
    { char: 'l', ...l },
    { char: 'k', ...k },
    { char: 'i', ...i },
    { char: 'e', ...e },
  ];

  // Apply path overrides first (override paths are stored in the offsetX=0 frame).
  for (const g of glyphs) {
    if (pathOverrides[g.char]) g.path = pathOverrides[g.char];
  }

  // Then apply offsetX shifts.
  for (const g of glyphs) {
    const offsetX = (p[`${g.char}_offsetX` as keyof TalkieParams] as number) || 0;
    if (offsetX !== 0) g.path = translatePath(g.path, offsetX);
  }

  return glyphs;
}

// ─────────────────────────────────────────────────────────────────────────
// Migration: v1 (padLeft + asymmetric builders) → v2 (offsetX + auto-center)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute where each glyph's reference point sat in the v1 builder frame
 * (`padLeft = 0`). The v2 builders place each reference point at
 * `advance / 2`. The migration delta is `oldNaturalX - newNaturalX`.
 *
 * For pixel-identical visual preservation:
 *   new_offsetX = old_padLeft + (oldNaturalX - advance/2)
 */
function oldNaturalCenterV1(char: string, p: any): number {
  const adv = p[`${char}_advance`] as number;
  switch (char) {
    case 't': {
      // v1 t: stock JBM bbox shifted by crossbar mods only.
      // The bbox-x is determined by crossbarLeft (leftmost) and crossbarRight (rightmost)
      // since these reach further than the stem (49→201 or 309→544 in stock).
      const cl = (p.t_crossbarLeft as number) ?? 49;
      const cr = (p.t_crossbarRight as number) ?? 544;
      return (cl + cr) / 2;
    }
    case 'a': {
      // v1 a: stock bbox [60, 518] with right edge widened by a_stemWidth delta.
      const stemW = (p.a_stemWidth as number) ?? 108;
      return (60 + (518 + (stemW - 108))) / 2;
    }
    case 'l': {
      const foot = p.l_foot as boolean;
      if (!foot) return 263; // hardcoded in old buildL no-foot
      return (29 + 554) / 2; // stock JBM l bbox center (unchanged by y-scale)
    }
    case 'k':
      return (87 + 563) / 2; // 325
    case 'i': {
      // v1 i: lsb = round((adv - stemW) * 0.64), stem-center = lsb + stemW/2
      const stemW = (p.i_stemWidth as number) ?? 108;
      const lsb = Math.round((adv - stemW) * 0.64);
      return lsb + stemW / 2;
    }
    case 'e':
      return (78 + 522) / 2; // 300
    default:
      return adv / 2;
  }
}

/** Glyphs whose v1 saves are subject to migration. */
const MIGRATE_GLYPHS = ['t', 'a', 'l', 'k', 'i', 'e'];

/**
 * Migrate a TalkieParams v1 save (or anything without paramsVersion) into v2.
 * - Renames `*_padLeft` → `*_offsetX`.
 * - Adjusts each `*_offsetX` so the rendered output is pixel-identical
 *   under the new auto-centering builders.
 * - Idempotent: if `paramsVersion >= 2`, returns input unchanged.
 */
export function migrateParamsV1ToV2(rawParams: any): TalkieParams {
  if (rawParams && typeof rawParams === 'object' && (rawParams.paramsVersion ?? 1) >= 2) {
    return rawParams as TalkieParams;
  }

  const p = { ...rawParams };

  for (const ch of MIGRATE_GLYPHS) {
    const padKey = `${ch}_padLeft`;
    const offsetKey = `${ch}_offsetX`;
    const oldPadLeft = (p[padKey] as number) || 0;
    delete p[padKey];

    if (p[`${ch}_advance`] == null) {
      // Param missing entirely; skip (defaults will fill it in elsewhere).
      p[offsetKey] = 0;
      continue;
    }

    const adv = p[`${ch}_advance`] as number;
    const oldNat = oldNaturalCenterV1(ch, p);
    const newNat = adv / 2;
    p[offsetKey] = oldPadLeft + (oldNat - newNat);
  }

  p.paramsVersion = TALKIE_PARAMS_VERSION;
  return p as TalkieParams;
}

/**
 * Migrate path overrides from a v1 save (padLeft baked into the stored path)
 * into a v2 save (override path lives in the offsetX=0 frame).
 *
 * Existing helper retained for the localStorage v1→v2 path that already
 * shipped (the padLeft-bake fix). The params migration above is separate
 * and handles the offsetX rename + auto-center delta.
 */
export function migrateOverridesToZeroPadLeft(
  overrides: Record<string, PathCommand[]>,
  params: any,
): Record<string, PathCommand[]> {
  const migrated: Record<string, PathCommand[]> = {};
  for (const [char, path] of Object.entries(overrides)) {
    const padLeft = (params[`${char}_padLeft`] as number) || 0;
    migrated[char] = padLeft !== 0 ? translatePath(path, -padLeft) : path;
  }
  return migrated;
}

/**
 * Migrate path overrides from v1 to v2. Override paths in v1 were stored
 * in the v1 builder's frame (where each glyph sat at oldNaturalCenter). In
 * v2 the builder places each glyph at advance/2. So we translate each
 * override by (advance/2 - oldNaturalCenter) so it lands at the same
 * visual position relative to the (newly auto-centered) glyph.
 *
 * Run AFTER migrateParamsV1ToV2 has applied (use the v1 params, not v2,
 * to compute oldNaturalCenter — but caller passes the v1 params).
 */
export function migrateOverridesV1ToV2(
  overrides: Record<string, PathCommand[]>,
  v1Params: any,
): Record<string, PathCommand[]> {
  if (!overrides) return overrides;
  const migrated: Record<string, PathCommand[]> = {};
  for (const [char, path] of Object.entries(overrides)) {
    if (!MIGRATE_GLYPHS.includes(char) || v1Params[`${char}_advance`] == null) {
      migrated[char] = path;
      continue;
    }
    const adv = v1Params[`${char}_advance`] as number;
    const oldNat = oldNaturalCenterV1(char, v1Params);
    const newNat = adv / 2;
    const delta = newNat - oldNat; // shift override by (newNat - oldNat) so it sits relative to the new builder frame
    migrated[char] = delta !== 0 ? translatePath(path, delta) : path;
  }
  return migrated;
}
