import { useCallback, useRef, useState } from "react";
import type { EditableContour, CubicSegment, SelectedPoint, Point } from "../types";

const HIT_RADIUS = 8; // Screen pixels

interface PointEditing {
  selectedPoint: SelectedPoint | null;
  isDragging: boolean;
  setSelectedPoint: (p: SelectedPoint | null) => void;
  hitTest: (canvasPos: Point, contours: EditableContour[], zoom: number) => SelectedPoint | null;
  startDrag: (point: SelectedPoint) => void;
  drag: (canvasPos: Point, contours: EditableContour[], shiftKey: boolean) => EditableContour[] | null;
  endDrag: () => void;
  nudge: (dx: number, dy: number, contours: EditableContour[]) => EditableContour[] | null;
  deletePoint: (contours: EditableContour[]) => EditableContour[] | null;
  toggleSmooth: (contours: EditableContour[]) => { contours: EditableContour[]; isSmooth: boolean } | null;
}

function getPoint(seg: CubicSegment, type: SelectedPoint["pointType"]): Point {
  return seg[type];
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/**
 * Point selection, dragging, nudging, smooth/corner toggle, and deletion.
 */
export function usePointEditing(): PointEditing {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point | null>(null);
  const dragOrigRef = useRef<Point | null>(null);

  const hitTest = useCallback(
    (canvasPos: Point, contours: EditableContour[], zoom: number): SelectedPoint | null => {
      const threshold = HIT_RADIUS / zoom;

      // Test anchors first (p0/p3), then control points (c1/c2)
      // Anchors have priority since they're more important to select
      for (let ci = 0; ci < contours.length; ci++) {
        const contour = contours[ci]!;
        for (let si = 0; si < contour.segments.length; si++) {
          const seg = contour.segments[si]!;
          // Test p3 (end anchor)
          if (distance(canvasPos, seg.p3) < threshold) {
            return { contourIndex: ci, segmentIndex: si, pointType: "p3" };
          }
          // Test p0 only for first segment (otherwise it's previous segment's p3)
          if (si === 0 && distance(canvasPos, seg.p0) < threshold) {
            return { contourIndex: ci, segmentIndex: si, pointType: "p0" };
          }
        }
      }

      // Then test control points
      for (let ci = 0; ci < contours.length; ci++) {
        const contour = contours[ci]!;
        for (let si = 0; si < contour.segments.length; si++) {
          const seg = contour.segments[si]!;
          if (distance(canvasPos, seg.c1) < threshold) {
            return { contourIndex: ci, segmentIndex: si, pointType: "c1" };
          }
          if (distance(canvasPos, seg.c2) < threshold) {
            return { contourIndex: ci, segmentIndex: si, pointType: "c2" };
          }
        }
      }

      return null;
    },
    [],
  );

  const startDrag = useCallback(
    (point: SelectedPoint) => {
      setIsDragging(true);
      setSelectedPoint(point);
      dragStartRef.current = null;
      dragOrigRef.current = null;
    },
    [],
  );

  const drag = useCallback(
    (canvasPos: Point, contours: EditableContour[], shiftKey: boolean): EditableContour[] | null => {
      if (!selectedPoint || !isDragging) return null;

      const { contourIndex, segmentIndex, pointType } = selectedPoint;
      const contour = contours[contourIndex];
      if (!contour) return null;
      const seg = contour.segments[segmentIndex];
      if (!seg) return null;

      const currentPt = getPoint(seg, pointType);

      if (!dragOrigRef.current) {
        dragOrigRef.current = currentPt;
        dragStartRef.current = canvasPos;
      }

      const dx = canvasPos[0] - dragStartRef.current![0];
      const dy = canvasPos[1] - dragStartRef.current![1];

      const newX = dragOrigRef.current[0] + dx;
      const newY = dragOrigRef.current[1] + dy;

      const newContours = structuredClone(contours);
      const newSeg = newContours[contourIndex]!.segments[segmentIndex]!;

      if (pointType === "p0" || pointType === "p3") {
        // Moving an anchor — move its control handles too (unless shift is held)
        const oldPt = newSeg[pointType];
        const moveDx = newX - oldPt[0];
        const moveDy = newY - oldPt[1];
        newSeg[pointType] = [newX, newY];

        if (!shiftKey) {
          if (pointType === "p0") {
            newSeg.c1 = [newSeg.c1[0] + moveDx, newSeg.c1[1] + moveDy];
            // Also move previous segment's c2 and p3 if it connects
            if (segmentIndex > 0) {
              const prevSeg = newContours[contourIndex]!.segments[segmentIndex - 1]!;
              prevSeg.p3 = [newX, newY];
              prevSeg.c2 = [prevSeg.c2[0] + moveDx, prevSeg.c2[1] + moveDy];
            } else if (contour.closed && contour.segments.length > 0) {
              // First segment p0 connects to last segment p3
              const lastSeg = newContours[contourIndex]!.segments[contour.segments.length - 1]!;
              lastSeg.p3 = [newX, newY];
              lastSeg.c2 = [lastSeg.c2[0] + moveDx, lastSeg.c2[1] + moveDy];
            }
          } else {
            // p3
            newSeg.c2 = [newSeg.c2[0] + moveDx, newSeg.c2[1] + moveDy];
            // Also move next segment's c1 and p0 if it connects
            const segs = newContours[contourIndex]!.segments;
            if (segmentIndex < segs.length - 1) {
              const nextSeg = segs[segmentIndex + 1]!;
              nextSeg.p0 = [newX, newY];
              nextSeg.c1 = [nextSeg.c1[0] + moveDx, nextSeg.c1[1] + moveDy];
            } else if (contour.closed && segs.length > 0) {
              const firstSeg = segs[0]!;
              firstSeg.p0 = [newX, newY];
              firstSeg.c1 = [firstSeg.c1[0] + moveDx, firstSeg.c1[1] + moveDy];
            }
          }
        }
      } else {
        // Moving a control point
        newSeg[pointType] = [newX, newY];
      }

      return newContours;
    },
    [selectedPoint, isDragging],
  );

  const endDrag = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
    dragOrigRef.current = null;
  }, []);

  const nudge = useCallback(
    (dx: number, dy: number, contours: EditableContour[]): EditableContour[] | null => {
      if (!selectedPoint) return null;
      const { contourIndex, segmentIndex, pointType } = selectedPoint;
      const newContours = structuredClone(contours);
      const seg = newContours[contourIndex]?.segments[segmentIndex];
      if (!seg) return null;

      const pt = seg[pointType];
      seg[pointType] = [pt[0] + dx, pt[1] + dy];

      // If anchor, sync connected segments
      if (pointType === "p3") {
        const segs = newContours[contourIndex]!.segments;
        if (segmentIndex < segs.length - 1) {
          segs[segmentIndex + 1]!.p0 = [...seg.p3];
        } else if (contours[contourIndex]!.closed) {
          segs[0]!.p0 = [...seg.p3];
        }
      } else if (pointType === "p0" && segmentIndex > 0) {
        newContours[contourIndex]!.segments[segmentIndex - 1]!.p3 = [...seg.p0];
      }

      return newContours;
    },
    [selectedPoint],
  );

  const deletePoint = useCallback(
    (contours: EditableContour[]): EditableContour[] | null => {
      if (!selectedPoint) return null;
      const { contourIndex, segmentIndex, pointType } = selectedPoint;
      if (pointType === "c1" || pointType === "c2") return null; // can't delete controls

      const newContours = structuredClone(contours);
      const contour = newContours[contourIndex];
      if (!contour) return null;

      // Remove the segment
      contour.segments.splice(segmentIndex, 1);

      // Fix up connections after removal
      if (contour.segments.length > 0 && segmentIndex < contour.segments.length) {
        const prevSeg = segmentIndex > 0 ? contour.segments[segmentIndex - 1] : null;
        if (prevSeg) {
          contour.segments[segmentIndex]!.p0 = [...prevSeg.p3];
        }
      }

      // Remove empty contours
      if (contour.segments.length === 0) {
        newContours.splice(contourIndex, 1);
      }

      setSelectedPoint(null);
      return newContours;
    },
    [selectedPoint],
  );

  const toggleSmooth = useCallback(
    (contours: EditableContour[]): { contours: EditableContour[]; isSmooth: boolean } | null => {
      if (!selectedPoint) return null;
      const { contourIndex, segmentIndex, pointType } = selectedPoint;
      if (pointType !== "p0" && pointType !== "p3") return null;

      const contour = contours[contourIndex];
      if (!contour) return null;

      // Find the two control handles around this anchor
      const segs = contour.segments;
      let prevC2: Point | null = null;
      let nextC1: Point | null = null;
      let anchor: Point;

      if (pointType === "p3") {
        anchor = segs[segmentIndex]!.p3;
        prevC2 = segs[segmentIndex]!.c2;
        if (segmentIndex < segs.length - 1) {
          nextC1 = segs[segmentIndex + 1]!.c1;
        } else if (contour.closed) {
          nextC1 = segs[0]!.c1;
        }
      } else {
        anchor = segs[segmentIndex]!.p0;
        nextC1 = segs[segmentIndex]!.c1;
        if (segmentIndex > 0) {
          prevC2 = segs[segmentIndex - 1]!.c2;
        } else if (contour.closed) {
          prevC2 = segs[segs.length - 1]!.c2;
        }
      }

      if (!prevC2 || !nextC1) return null;

      // Check if currently smooth (control points are collinear with anchor)
      const v1: Point = [prevC2[0] - anchor[0], prevC2[1] - anchor[1]];
      const v2: Point = [nextC1[0] - anchor[0], nextC1[1] - anchor[1]];
      const cross = v1[0] * v2[1] - v1[1] * v2[0];
      const isCurrentlySmooth = Math.abs(cross) < 1;

      const newContours = structuredClone(contours);

      if (!isCurrentlySmooth) {
        // Make smooth: average the angles, keep distances
        const d1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
        const d2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
        if (d1 < 0.01 || d2 < 0.01) return null;

        const angle = Math.atan2(v1[1] / d1 - v2[1] / d2, v1[0] / d1 - v2[0] / d2);
        const newPrevC2: Point = [
          anchor[0] + d1 * Math.cos(angle),
          anchor[1] + d1 * Math.sin(angle),
        ];
        const newNextC1: Point = [
          anchor[0] - d2 * Math.cos(angle),
          anchor[1] - d2 * Math.sin(angle),
        ];

        // Apply
        if (pointType === "p3") {
          newContours[contourIndex]!.segments[segmentIndex]!.c2 = newPrevC2;
          if (segmentIndex < segs.length - 1) {
            newContours[contourIndex]!.segments[segmentIndex + 1]!.c1 = newNextC1;
          } else if (contour.closed) {
            newContours[contourIndex]!.segments[0]!.c1 = newNextC1;
          }
        } else {
          newContours[contourIndex]!.segments[segmentIndex]!.c1 = newNextC1;
          if (segmentIndex > 0) {
            newContours[contourIndex]!.segments[segmentIndex - 1]!.c2 = newPrevC2;
          } else if (contour.closed) {
            newContours[contourIndex]!.segments[segs.length - 1]!.c2 = newPrevC2;
          }
        }
      }

      return { contours: newContours, isSmooth: !isCurrentlySmooth };
    },
    [selectedPoint],
  );

  return {
    selectedPoint,
    isDragging,
    setSelectedPoint,
    hitTest,
    startDrag,
    drag,
    endDrag,
    nudge,
    deletePoint,
    toggleSmooth,
  };
}
