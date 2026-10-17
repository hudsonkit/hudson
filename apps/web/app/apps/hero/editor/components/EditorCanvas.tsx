import { useCallback, useEffect, useRef } from "react";
import type { FontMetrics } from "../../types";
import type { EditableContour, SelectedPoint, EditorTool, Point } from "../types";
import type { DisplayOptions } from "./DisplaySidebar";
import { MetricGuides } from "./MetricGuides";
import { PathRenderer } from "./PathRenderer";

interface EditorCanvasProps {
  contours: EditableContour[];
  metrics: FontMetrics;
  advanceWidth: number;
  selectedPoint: SelectedPoint | null;
  smoothStates: Record<string, boolean>;
  tool: EditorTool;
  pan: Point;
  zoom: number;
  isPanning: boolean;
  display: DisplayOptions;
  mousePos: Point | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onCanvasClick: (e: React.MouseEvent) => void;
}

/**
 * Pan/zoom SVG canvas for glyph editing.
 * Renders metric guides + path with handles inside a transformed SVG.
 */
export function EditorCanvas({
  contours,
  metrics,
  advanceWidth,
  selectedPoint,
  smoothStates,
  tool,
  pan,
  zoom,
  isPanning,
  display,
  mousePos,
  containerRef,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onCanvasClick,
}: EditorCanvasProps) {
  const divRef = useRef<HTMLDivElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      divRef.current = el;
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [containerRef],
  );

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const cursor = isPanning
    ? "grabbing"
    : tool === "hand"
      ? "grab"
      : tool === "pen"
        ? "crosshair"
        : "default";

  const height = metrics.ascender - metrics.descender;
  const centerY = metrics.descender + height / 2;

  return (
    <div
      ref={setRefs}
      className="flex-1 overflow-hidden bg-[var(--color-bg)] relative"
      style={{ cursor }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onClick={onCanvasClick}
    >
      <svg
        className="w-full h-full"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <g
          transform={`
            translate(${pan[0]}, ${pan[1]})
            scale(${zoom}, ${-zoom})
            translate(${advanceWidth * -0.3}, ${-centerY})
          `}
        >
          {display.showGuides && (
            <MetricGuides
              metrics={metrics}
              advanceWidth={advanceWidth}
              zoom={zoom}
            />
          )}
          <PathRenderer
            contours={contours}
            selectedPoint={selectedPoint}
            smoothStates={smoothStates}
            zoom={zoom}
            display={display}
          />

          {/* Crosshair at mouse position in font-space */}
          {mousePos && tool === "select" && (
            <g opacity={0.4}>
              <line
                x1={mousePos[0] - 12 / zoom} y1={mousePos[1]}
                x2={mousePos[0] + 12 / zoom} y2={mousePos[1]}
                stroke="var(--color-accent)" strokeWidth={0.5 / zoom}
              />
              <line
                x1={mousePos[0]} y1={mousePos[1] - 12 / zoom}
                x2={mousePos[0]} y2={mousePos[1] + 12 / zoom}
                stroke="var(--color-accent)" strokeWidth={0.5 / zoom}
              />
            </g>
          )}
        </g>
      </svg>

      {/* Coordinate display */}
      {mousePos && (
        <div className="absolute bottom-3 left-3 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2 py-1 rounded tabular-nums">
          x: {Math.round(mousePos[0])} y: {Math.round(mousePos[1])}
        </div>
      )}
    </div>
  );
}
