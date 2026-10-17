import { useCallback, useRef, useState } from "react";
import type { EditableContour, CubicSegment, Point } from "../types";

interface PenTool {
  isDrawing: boolean;
  previewPoint: Point | null;
  startContour: (pos: Point, contours: EditableContour[]) => EditableContour[];
  addPoint: (pos: Point, contours: EditableContour[]) => EditableContour[];
  finishContour: (contours: EditableContour[]) => EditableContour[];
  updatePreview: (pos: Point) => void;
  extendExistingContour: (
    contourIndex: number,
    pos: Point,
    contours: EditableContour[],
  ) => EditableContour[];
}

/**
 * Pen tool for adding cubic segments.
 * Click to add cubic segments. Click existing endpoint to extend contour.
 * Escape to finish.
 */
export function usePenTool(): PenTool {
  const [isDrawing, setIsDrawing] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const activeContourRef = useRef<number | null>(null);

  const startContour = useCallback(
    (pos: Point, contours: EditableContour[]): EditableContour[] => {
      setIsDrawing(true);
      const newContour: EditableContour = {
        closed: false,
        segments: [],
      };
      const result = [...contours, newContour];
      activeContourRef.current = result.length - 1;
      // Store start position by creating a zero-length first segment
      // that will be replaced on next click
      return result;
    },
    [],
  );

  const addPoint = useCallback(
    (pos: Point, contours: EditableContour[]): EditableContour[] => {
      const ci = activeContourRef.current;
      if (ci == null || ci >= contours.length) {
        // Start a new contour with just a start point recorded
        const newContours = [...contours];
        const newContour: EditableContour = {
          closed: false,
          segments: [],
        };
        newContours.push(newContour);
        activeContourRef.current = newContours.length - 1;
        setIsDrawing(true);

        // We need to remember the start point for the first segment
        // Store it as a degenerate segment that'll get p3 set on next click
        // Actually, let's store the start pos and create segment on second click
        startPointRef.current = pos;
        return newContours;
      }

      const newContours = structuredClone(contours);
      const contour = newContours[ci]!;

      let start: Point;
      if (contour.segments.length === 0) {
        // First segment — use stored start point or pos
        start = startPointRef.current ?? pos;
        if (start[0] === pos[0] && start[1] === pos[1]) {
          startPointRef.current = pos;
          return newContours;
        }
      } else {
        start = contour.segments[contour.segments.length - 1]!.p3;
      }

      // Create a straight cubic segment (control points at 1/3 and 2/3)
      const seg: CubicSegment = {
        p0: start,
        c1: [
          start[0] + (pos[0] - start[0]) / 3,
          start[1] + (pos[1] - start[1]) / 3,
        ],
        c2: [
          start[0] + (2 * (pos[0] - start[0])) / 3,
          start[1] + (2 * (pos[1] - start[1])) / 3,
        ],
        p3: pos,
      };

      contour.segments.push(seg);
      startPointRef.current = null;
      return newContours;
    },
    [],
  );

  const startPointRef = useRef<Point | null>(null);

  const finishContour = useCallback(
    (contours: EditableContour[]): EditableContour[] => {
      setIsDrawing(false);
      activeContourRef.current = null;
      startPointRef.current = null;
      setPreviewPoint(null);
      return contours;
    },
    [],
  );

  const updatePreview = useCallback((pos: Point) => {
    setPreviewPoint(pos);
  }, []);

  const extendExistingContour = useCallback(
    (
      contourIndex: number,
      pos: Point,
      contours: EditableContour[],
    ): EditableContour[] => {
      setIsDrawing(true);
      activeContourRef.current = contourIndex;
      startPointRef.current = null;

      const newContours = structuredClone(contours);
      const contour = newContours[contourIndex]!;
      const lastSeg = contour.segments[contour.segments.length - 1];
      if (!lastSeg) return newContours;

      const start = lastSeg.p3;
      const seg: CubicSegment = {
        p0: start,
        c1: [
          start[0] + (pos[0] - start[0]) / 3,
          start[1] + (pos[1] - start[1]) / 3,
        ],
        c2: [
          start[0] + (2 * (pos[0] - start[0])) / 3,
          start[1] + (2 * (pos[1] - start[1])) / 3,
        ],
        p3: pos,
      };

      contour.segments.push(seg);
      return newContours;
    },
    [],
  );

  return {
    isDrawing,
    previewPoint,
    startContour,
    addPoint,
    finishContour,
    updatePreview,
    extendExistingContour,
  };
}
