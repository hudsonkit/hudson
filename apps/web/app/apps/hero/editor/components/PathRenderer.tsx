import { memo } from "react";
import type { EditableContour, SelectedPoint, Point } from "../types";
import { contoursToSvgD } from "../../lib/path-convert";
import type { DisplayOptions } from "./DisplaySidebar";

interface PathRendererProps {
  contours: EditableContour[];
  selectedPoint: SelectedPoint | null;
  smoothStates: Record<string, boolean>;
  zoom: number;
  display: DisplayOptions;
}

function pointKey(ci: number, si: number, pt: string): string {
  return `${ci}-${si}-${pt}`;
}

function isSelected(
  sel: SelectedPoint | null,
  ci: number,
  si: number,
  pt: string,
): boolean {
  return (
    sel !== null &&
    sel.contourIndex === ci &&
    sel.segmentIndex === si &&
    sel.pointType === pt
  );
}

function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
}

/**
 * SVG renderer for editable contours: filled path, control handles, anchor circles,
 * optional labels and tangent angle indicators.
 */
export const PathRenderer = memo(function PathRenderer({
  contours,
  selectedPoint,
  smoothStates,
  zoom,
  display,
}: PathRendererProps) {
  const d = contoursToSvgD(contours);

  // Scale-independent sizes
  const anchorR = 5 / zoom;
  const anchorSelectedR = 8 / zoom;
  const controlR = 4 / zoom;
  const controlSelectedR = 7 / zoom;
  const handleStroke = 1 / zoom;
  const fontSize = 10 / zoom;
  const tangentLen = 20 / zoom;
  const tangentStroke = 1.2 / zoom;

  return (
    <g className="path-renderer">
      {/* Filled path */}
      {display.showFill && (
        <path d={d} fill="var(--color-text)" fillOpacity={0.15} />
      )}
      <path
        d={d}
        fill="none"
        stroke="var(--color-text)"
        strokeWidth={1.5 / zoom}
        strokeOpacity={0.8}
      />

      {contours.map((contour, ci) =>
        contour.segments.map((seg, si) => {
          const p0Selected = isSelected(selectedPoint, ci, si, "p0");
          const p3Selected = isSelected(selectedPoint, ci, si, "p3");
          const c1Selected = isSelected(selectedPoint, ci, si, "c1");
          const c2Selected = isSelected(selectedPoint, ci, si, "c2");

          const p0Key = pointKey(ci, si, "p0");
          const p3Key = pointKey(ci, si, "p3");
          const p0Smooth = smoothStates[p0Key] ?? false;
          const p3Smooth = smoothStates[p3Key] ?? false;

          return (
            <g key={`${ci}-${si}`}>
              {/* Handle lines */}
              {display.showHandles && (
                <>
                  <line
                    x1={seg.p0[0]} y1={seg.p0[1]}
                    x2={seg.c1[0]} y2={seg.c1[1]}
                    stroke="#3b82f6" strokeWidth={handleStroke} opacity={0.6}
                  />
                  <line
                    x1={seg.p3[0]} y1={seg.p3[1]}
                    x2={seg.c2[0]} y2={seg.c2[1]}
                    stroke="#3b82f6" strokeWidth={handleStroke} opacity={0.6}
                  />

                  {/* Control points */}
                  <circle
                    cx={seg.c1[0]} cy={seg.c1[1]}
                    r={c1Selected ? controlSelectedR : controlR}
                    fill={c1Selected ? "#eab308" : "#3b82f6"}
                    data-point={`${ci}-${si}-c1`}
                  />
                  <circle
                    cx={seg.c2[0]} cy={seg.c2[1]}
                    r={c2Selected ? controlSelectedR : controlR}
                    fill={c2Selected ? "#eab308" : "#3b82f6"}
                    data-point={`${ci}-${si}-c2`}
                  />
                </>
              )}

              {/* Tangent angles at anchors */}
              {display.showTangents && (
                <>
                  {/* Tangent from p0 → c1 */}
                  {si === 0 && (
                    <TangentIndicator
                      anchor={seg.p0}
                      control={seg.c1}
                      zoom={zoom}
                      len={tangentLen}
                      stroke={tangentStroke}
                      fontSize={fontSize}
                    />
                  )}
                  {/* Tangent from p3 → c2 */}
                  <TangentIndicator
                    anchor={seg.p3}
                    control={seg.c2}
                    zoom={zoom}
                    len={tangentLen}
                    stroke={tangentStroke}
                    fontSize={fontSize}
                  />
                </>
              )}

              {/* Anchor points */}
              {display.showPoints && (
                <>
                  {si === 0 && (
                    <circle
                      cx={seg.p0[0]} cy={seg.p0[1]}
                      r={p0Selected ? anchorSelectedR : anchorR}
                      fill={p0Selected ? "#eab308" : p0Smooth ? "#22c55e" : "#ef4444"}
                      data-point={`${ci}-${si}-p0`}
                    />
                  )}
                  <circle
                    cx={seg.p3[0]} cy={seg.p3[1]}
                    r={p3Selected ? anchorSelectedR : anchorR}
                    fill={p3Selected ? "#eab308" : p3Smooth ? "#22c55e" : "#ef4444"}
                    data-point={`${ci}-${si}-p3`}
                  />
                </>
              )}

              {/* Labels */}
              {display.showLabels && (
                <>
                  {si === 0 && (
                    <text
                      x={seg.p0[0] + 8 / zoom}
                      y={seg.p0[1] + 4 / zoom}
                      fontSize={fontSize}
                      fill="var(--color-text-muted)"
                      style={{ transform: `scaleY(-1)`, transformOrigin: `${seg.p0[0]}px ${seg.p0[1]}px` }}
                    >
                      {ci}.{si}.p0
                    </text>
                  )}
                  <text
                    x={seg.p3[0] + 8 / zoom}
                    y={seg.p3[1] + 4 / zoom}
                    fontSize={fontSize}
                    fill="var(--color-text-muted)"
                    style={{ transform: `scaleY(-1)`, transformOrigin: `${seg.p3[0]}px ${seg.p3[1]}px` }}
                  >
                    {ci}.{si}.p3
                  </text>
                </>
              )}
            </g>
          );
        }),
      )}
    </g>
  );
});

function TangentIndicator({
  anchor,
  control,
  zoom,
  len,
  stroke,
  fontSize,
}: {
  anchor: Point;
  control: Point;
  zoom: number;
  len: number;
  stroke: number;
  fontSize: number;
}) {
  const dx = control[0] - anchor[0];
  const dy = control[1] - anchor[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.5) return null;

  const angle = angleDeg(anchor, control);
  const nx = dx / dist;
  const ny = dy / dist;

  return (
    <g>
      {/* Tangent line extension */}
      <line
        x1={anchor[0]}
        y1={anchor[1]}
        x2={anchor[0] + nx * len}
        y2={anchor[1] + ny * len}
        stroke="#f97316"
        strokeWidth={stroke}
        strokeDasharray={`${3 / zoom}`}
        opacity={0.5}
      />
      {/* Angle label */}
      <text
        x={anchor[0] + nx * (len + 6 / zoom)}
        y={anchor[1] + ny * (len + 6 / zoom)}
        fontSize={fontSize * 0.85}
        fill="#f97316"
        opacity={0.7}
        style={{ transform: `scaleY(-1)`, transformOrigin: `${anchor[0] + nx * (len + 6 / zoom)}px ${anchor[1] + ny * (len + 6 / zoom)}px` }}
      >
        {Math.round(angle)}°
      </text>
    </g>
  );
}
