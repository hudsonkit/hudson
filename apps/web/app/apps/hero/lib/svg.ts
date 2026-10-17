import type { PathCommand, HeroGlyph, FontMetrics } from "../types";

/**
 * Convert HeroFont PathCommand[] to SVG path `d` attribute string.
 * Font coordinates are preserved as-is (Y-up); the SVG element should
 * use transform="scale(1,-1)" to flip to SVG's Y-down system.
 */
export function pathToSvgD(commands: PathCommand[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case "moveTo":
        parts.push(`M${cmd.x} ${cmd.y}`);
        break;
      case "lineTo":
        parts.push(`L${cmd.x} ${cmd.y}`);
        break;
      case "quadraticCurveTo":
        parts.push(`Q${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`);
        break;
      case "bezierCurveTo":
        parts.push(`C${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`);
        break;
      case "closePath":
        parts.push("Z");
        break;
    }
  }
  return parts.join("");
}

/**
 * Calculate the viewBox for a glyph SVG.
 * Returns [minX, minY, width, height] in font units.
 *
 * Uses the em-square as a baseline frame, then expands to include the
 * glyph's actual bounding box so accents, cedillas, and other parts
 * that extend beyond the ascender/descender are never clipped.
 */
export function glyphViewBox(
  glyph: HeroGlyph,
  metrics: FontMetrics
): [number, number, number, number] {
  // Em-square bounds (font coordinates, Y-up)
  let minX = 0;
  let maxX = glyph.advanceWidth || metrics.unitsPerEm;
  let minY = metrics.descender; // typically negative
  let maxY = metrics.ascender;

  // Expand to include glyph's actual bounding box
  const bb = glyph.boundingBox;
  if (bb) {
    minX = Math.min(minX, bb.x1);
    maxX = Math.max(maxX, bb.x2);
    minY = Math.min(minY, bb.y1);
    maxY = Math.max(maxY, bb.y2);
  }

  // Small padding (5% of em) so glyphs don't touch the cell edges
  const pad = metrics.unitsPerEm * 0.05;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;

  const width = maxX - minX;
  const height = maxY - minY;

  // In the flipped coordinate system (scale(1,-1)), SVG y = -fontY
  // So font maxY maps to SVG minY = -maxY
  return [minX, -maxY, width, height];
}

/**
 * Extract individual points from path commands (for control point visualization).
 */
export function extractPoints(
  commands: PathCommand[]
): { x: number; y: number; type: "on" | "control" }[] {
  const points: { x: number; y: number; type: "on" | "control" }[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case "moveTo":
      case "lineTo":
        points.push({ x: cmd.x, y: cmd.y, type: "on" });
        break;
      case "quadraticCurveTo":
        points.push({ x: cmd.x1, y: cmd.y1, type: "control" });
        points.push({ x: cmd.x, y: cmd.y, type: "on" });
        break;
      case "bezierCurveTo":
        points.push({ x: cmd.x1, y: cmd.y1, type: "control" });
        points.push({ x: cmd.x2, y: cmd.y2, type: "control" });
        points.push({ x: cmd.x, y: cmd.y, type: "on" });
        break;
    }
  }
  return points;
}
