import type { FontMetrics } from "../../types";

interface MetricGuidesProps {
  metrics: FontMetrics;
  advanceWidth: number;
  zoom: number;
}

/**
 * SVG guide lines for baseline, ascender, descender, and advance width.
 * Rendered inside a Y-up coordinate system (parent applies scale(1,-1)).
 */
export function MetricGuides({ metrics, advanceWidth, zoom }: MetricGuidesProps) {
  const strokeWidth = 1 / zoom;
  const dashArray = `${4 / zoom}`;
  const extent = Math.max(advanceWidth, metrics.unitsPerEm) * 1.5;
  const left = -extent * 0.25;
  const right = extent;

  return (
    <g className="metric-guides" opacity={0.6}>
      {/* Baseline */}
      <line
        x1={left} y1={0} x2={right} y2={0}
        stroke="var(--color-baseline)"
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />
      {/* Ascender */}
      <line
        x1={left} y1={metrics.ascender} x2={right} y2={metrics.ascender}
        stroke="var(--color-ascender)"
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />
      {/* Descender */}
      <line
        x1={left} y1={metrics.descender} x2={right} y2={metrics.descender}
        stroke="var(--color-descender)"
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />
      {/* Advance width */}
      <line
        x1={advanceWidth} y1={metrics.descender - 50}
        x2={advanceWidth} y2={metrics.ascender + 50}
        stroke="var(--color-text-muted)"
        strokeWidth={strokeWidth * 0.8}
        strokeDasharray={dashArray}
        opacity={0.5}
      />
      {/* Origin line */}
      <line
        x1={0} y1={metrics.descender - 50}
        x2={0} y2={metrics.ascender + 50}
        stroke="var(--color-text-muted)"
        strokeWidth={strokeWidth * 0.8}
        strokeDasharray={dashArray}
        opacity={0.5}
      />
    </g>
  );
}
