import { useCallback, useRef, useState } from "react";
import type { Point } from "../types";

interface CanvasInteraction {
  pan: Point;
  zoom: number;
  isPanning: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  screenToCanvas: (screenX: number, screenY: number) => Point;
  resetView: () => void;
  setZoom: (z: number | ((prev: number) => number)) => void;
  setPan: (p: Point) => void;
}

/**
 * Manages pan/zoom and coordinate translation for the editor canvas.
 *
 * The SVG transform chain is:
 *   translate(pan) → scale(zoom, -zoom) → translate(glyphOffset)
 *
 * screenToCanvas inverts this to convert mouse events to font-space coordinates.
 */
export function useCanvasInteraction(
  forcePan: boolean,
  glyphOffset: Point = [0, 0],
): CanvasInteraction {
  const [pan, setPan] = useState<Point>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      const el = containerRef.current;
      if (!el) return [0, 0];
      const rect = el.getBoundingClientRect();

      // SVG local coords (origin at top-left of SVG element)
      const svgX = screenX - rect.left;
      const svgY = screenY - rect.top;

      // Invert: translate(pan)
      const x1 = svgX - pan[0];
      const y1 = svgY - pan[1];

      // Invert: scale(zoom, -zoom)
      const x2 = x1 / zoom;
      const y2 = y1 / -zoom;

      // Invert: translate(glyphOffset)
      const fontX = x2 - glyphOffset[0];
      const fontY = y2 - glyphOffset[1];

      return [fontX, fontY];
    },
    [pan, zoom, glyphOffset],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Pinch zoom
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.1, Math.min(50, z * factor)));
    } else {
      // Pan
      setPan(([px, py]) => [px - e.deltaX, py - e.deltaY]);
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (forcePan || e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: pan[0],
          panY: pan[1],
        };
        e.preventDefault();
      }
    },
    [forcePan, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan([panStartRef.current.panX + dx, panStartRef.current.panY + dy]);
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    setPan([0, 0]);
    setZoom(1);
  }, []);

  return {
    pan,
    zoom,
    isPanning,
    containerRef,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    screenToCanvas,
    resetView,
    setZoom,
    setPan,
  };
}
