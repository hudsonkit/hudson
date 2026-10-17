import type { PathCommand } from "../types";
import type { EditableContour, CubicSegment, Point } from "../editor/types";

/**
 * Convert quadratic control point to cubic control points.
 * Quad→cubic is exact: c1 = start + 2/3*(ctrl-start), c2 = end + 2/3*(ctrl-end)
 */
function quadToCubic(
  start: Point,
  ctrl: Point,
  end: Point,
): { c1: Point; c2: Point } {
  return {
    c1: [
      start[0] + (2 / 3) * (ctrl[0] - start[0]),
      start[1] + (2 / 3) * (ctrl[1] - start[1]),
    ],
    c2: [
      end[0] + (2 / 3) * (ctrl[0] - end[0]),
      end[1] + (2 / 3) * (ctrl[1] - end[1]),
    ],
  };
}

/**
 * Convert a degenerate line to a cubic segment.
 * Control points are placed at 1/3 and 2/3 along the line.
 */
function lineToCubic(start: Point, end: Point): { c1: Point; c2: Point } {
  return {
    c1: [
      start[0] + (end[0] - start[0]) / 3,
      start[1] + (end[1] - start[1]) / 3,
    ],
    c2: [
      start[0] + (2 * (end[0] - start[0])) / 3,
      start[1] + (2 * (end[1] - start[1])) / 3,
    ],
  };
}

/**
 * Detect the source format of path commands.
 */
export function detectSourceFormat(
  commands: PathCommand[],
): "quadratic" | "cubic" | "mixed" {
  let hasQuad = false;
  let hasCubic = false;
  for (const cmd of commands) {
    if (cmd.type === "quadraticCurveTo") hasQuad = true;
    if (cmd.type === "bezierCurveTo") hasCubic = true;
  }
  if (hasQuad && hasCubic) return "mixed";
  if (hasQuad) return "quadratic";
  return "cubic";
}

/**
 * Convert PathCommand[] to EditableContour[] (all cubic segments).
 *
 * For each moveTo…closePath group:
 * - lineTo → degenerate cubic (c1/c2 at 1/3 and 2/3)
 * - quadraticCurveTo → exact cubic via 2/3 rule
 * - bezierCurveTo → direct CubicSegment mapping
 * - closePath → closing segment if needed
 */
export function pathToContours(commands: PathCommand[]): EditableContour[] {
  const contours: EditableContour[] = [];

  let currentContour: CubicSegment[] = [];
  let currentPos: Point = [0, 0];
  let contourStart: Point = [0, 0];

  function pushSegment(seg: CubicSegment) {
    currentContour.push(seg);
    currentPos = seg.p3;
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case "moveTo": {
        // Start a new contour — flush previous if it has segments
        if (currentContour.length > 0) {
          contours.push({ closed: false, segments: currentContour });
          currentContour = [];
        }
        currentPos = [cmd.x, cmd.y];
        contourStart = [cmd.x, cmd.y];
        break;
      }

      case "lineTo": {
        const start = currentPos;
        const end: Point = [cmd.x, cmd.y];
        const { c1, c2 } = lineToCubic(start, end);
        pushSegment({ p0: start, c1, c2, p3: end });
        break;
      }

      case "quadraticCurveTo": {
        const start = currentPos;
        const ctrl: Point = [cmd.x1, cmd.y1];
        const end: Point = [cmd.x, cmd.y];
        const { c1, c2 } = quadToCubic(start, ctrl, end);
        pushSegment({ p0: start, c1, c2, p3: end });
        break;
      }

      case "bezierCurveTo": {
        const start = currentPos;
        pushSegment({
          p0: start,
          c1: [cmd.x1, cmd.y1],
          c2: [cmd.x2, cmd.y2],
          p3: [cmd.x, cmd.y],
        });
        break;
      }

      case "closePath": {
        // Add closing segment if current position differs from contour start
        const dx = currentPos[0] - contourStart[0];
        const dy = currentPos[1] - contourStart[1];
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          const { c1, c2 } = lineToCubic(currentPos, contourStart);
          pushSegment({ p0: currentPos, c1, c2, p3: contourStart });
        }
        if (currentContour.length > 0) {
          contours.push({ closed: true, segments: currentContour });
          currentContour = [];
        }
        currentPos = contourStart;
        break;
      }
    }
  }

  // Flush any remaining open contour
  if (currentContour.length > 0) {
    contours.push({ closed: false, segments: currentContour });
  }

  return contours;
}

/**
 * Convert EditableContour[] back to PathCommand[].
 * Always outputs cubic bezierCurveTo commands.
 */
export function contoursToPath(contours: EditableContour[]): PathCommand[] {
  const commands: PathCommand[] = [];

  for (const contour of contours) {
    if (contour.segments.length === 0) continue;

    // moveTo the first segment's start
    const first = contour.segments[0]!;
    commands.push({ type: "moveTo", x: first.p0[0], y: first.p0[1] });

    for (const seg of contour.segments) {
      commands.push({
        type: "bezierCurveTo",
        x1: seg.c1[0],
        y1: seg.c1[1],
        x2: seg.c2[0],
        y2: seg.c2[1],
        x: seg.p3[0],
        y: seg.p3[1],
      });
    }

    if (contour.closed) {
      commands.push({ type: "closePath" });
    }
  }

  return commands;
}

/**
 * Build SVG path d attribute directly from contours (for editor rendering).
 */
export function contoursToSvgD(contours: EditableContour[]): string {
  const parts: string[] = [];

  for (const contour of contours) {
    if (contour.segments.length === 0) continue;

    const first = contour.segments[0]!;
    parts.push(`M${first.p0[0]} ${first.p0[1]}`);

    for (const seg of contour.segments) {
      parts.push(
        `C${seg.c1[0]} ${seg.c1[1]} ${seg.c2[0]} ${seg.c2[1]} ${seg.p3[0]} ${seg.p3[1]}`,
      );
    }

    if (contour.closed) {
      parts.push("Z");
    }
  }

  return parts.join("");
}
