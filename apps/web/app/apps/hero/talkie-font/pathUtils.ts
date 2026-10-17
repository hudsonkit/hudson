/**
 * Path manipulation utilities shared across font variants.
 * Vendored from talkie/glyphOps to avoid cross-module coupling.
 */

import type { PathCommand } from '../types';

/** Shift every x-coordinate in a path by dx. */
export function translatePath(path: PathCommand[], dx: number): PathCommand[] {
  if (dx === 0) return path;
  return path.map((cmd) => {
    const c = { ...cmd } as any;
    if (typeof c.x === 'number') c.x += dx;
    if (typeof c.x1 === 'number') c.x1 += dx;
    if (typeof c.x2 === 'number') c.x2 += dx;
    return c;
  });
}

/** Scale all y-coordinates by ratio. */
export function scalePathY(path: PathCommand[], ratio: number): PathCommand[] {
  if (ratio === 1) return path;
  return path.map((cmd) => {
    const c = { ...cmd } as any;
    if (typeof c.y === 'number') c.y *= ratio;
    if (typeof c.y1 === 'number') c.y1 *= ratio;
    if (typeof c.y2 === 'number') c.y2 *= ratio;
    return c;
  });
}

/**
 * Round line-to-line and curve-to-line corners by `radius` UPM.
 * Radius is capped at 45% of the shorter neighbouring edge length.
 */
export function roundCornersInPath(path: PathCommand[], radius: number): PathCommand[] {
  if (radius <= 0) return path;
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

    const r = Math.min(radius, inAvail, outAvail);
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
