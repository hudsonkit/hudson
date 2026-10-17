import { memo } from "react";
import type { HeroGlyph, FontMetrics } from "../types";
import { pathToSvgD, glyphViewBox } from "../lib/svg";

interface GlyphCellProps {
  glyph: HeroGlyph;
  metrics: FontMetrics;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}

export const GlyphCell = memo(function GlyphCell({
  glyph,
  metrics,
  isSelected,
  onClick,
  onDoubleClick,
}: GlyphCellProps) {
  const d = pathToSvgD(glyph.path);
  const [vx, vy, vw, vh] = glyphViewBox(glyph, metrics);
  const label = glyph.character ?? glyph.name ?? `#${glyph.index}`;

  return (
    <button
      data-glyph-index={glyph.index}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`${label} — U+${glyph.unicode?.toString(16).toUpperCase().padStart(4, "0") ?? "????"} — ${glyph.name ?? "unnamed"}`}
      className={`
        group flex flex-col items-center gap-1 px-1.5 pt-2 pb-1.5 transition-colors cursor-pointer
        ${isSelected
          ? "bg-muted text-foreground"
          : "bg-background text-foreground/85 hover:bg-muted/50"
        }
      `}
    >
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        className="w-3/4 aspect-square"
        overflow="visible"
      >
        <g transform="scale(1,-1)">
          <path d={d} fill="currentColor" />
        </g>
      </svg>
      <span className={`text-[9px] font-mono text-muted-foreground truncate w-full text-center leading-none transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {label}
      </span>
    </button>
  );
});
