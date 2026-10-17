import { useMemo } from "react";
import type { HeroFont, HeroGlyph } from "../types";
import { pathToSvgD } from "../lib/svg";

function glyphFor(font: HeroFont, char: string): HeroGlyph | undefined {
  const cp = char.codePointAt(0);
  return cp == null ? undefined : font.glyphs.find((g) => g.unicode === cp);
}

/** Cap height and x-height read from H and x, since the metrics don't carry them. */
export function verticalGuides(font: HeroFont) {
  const top = (c: string) => glyphFor(font, c)?.boundingBox?.y2 ?? null;
  return {
    ascender: font.metrics.ascender,
    capHeight: top("H"),
    xHeight: top("x"),
    baseline: 0,
    descender: font.metrics.descender,
  };
}

const GUIDE_LABELS: [keyof ReturnType<typeof verticalGuides>, string][] = [
  ["ascender", "asc"],
  ["capHeight", "cap"],
  ["xHeight", "x"],
  ["baseline", "base"],
  ["descender", "desc"],
];

/** A glyph drawn large inside its advance width, with the font's vertical guides. */
export function GlyphStage({ glyph, font }: { glyph: HeroGlyph; font: HeroFont }) {
  const guides = useMemo(() => verticalGuides(font), [font]);
  const { unitsPerEm, ascender, descender } = font.metrics;
  const advance = glyph.advanceWidth || unitsPerEm * 0.5;
  const bb = glyph.boundingBox;
  const minX = Math.min(0, bb?.x1 ?? 0);
  const maxX = Math.max(advance, bb?.x2 ?? 0);
  const minY = Math.min(descender, bb?.y1 ?? 0);
  const maxY = Math.max(ascender, bb?.y2 ?? 0);
  const padX = unitsPerEm * 0.3;
  const padY = unitsPerEm * 0.08;
  const vx = minX - padX;
  const vw = maxX - minX + padX * 2;
  const vy = -maxY - padY;
  const vh = maxY - minY + padY * 2;
  const hair = unitsPerEm * 0.002;
  const label = unitsPerEm * 0.045;

  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="w-full h-auto" overflow="visible">
      {GUIDE_LABELS.map(([key, name]) => {
        const y = guides[key];
        if (y == null) return null;
        return (
          <g key={key} className="text-border">
            <line x1={vx} x2={vx + vw} y1={-y} y2={-y} stroke="currentColor" strokeWidth={hair} />
            <text
              x={vx + unitsPerEm * 0.02}
              y={-y - unitsPerEm * 0.015}
              fontSize={label}
              className="fill-muted-foreground font-mono"
            >
              {name}
            </text>
          </g>
        );
      })}
      <g className="text-border">
        <line x1={0} x2={0} y1={-maxY} y2={-minY} stroke="currentColor" strokeWidth={hair} strokeDasharray={`${unitsPerEm * 0.01}`} />
        <line x1={advance} x2={advance} y1={-maxY} y2={-minY} stroke="currentColor" strokeWidth={hair} strokeDasharray={`${unitsPerEm * 0.01}`} />
      </g>
      <g transform="scale(1,-1)">
        <path d={pathToSvgD(glyph.path)} fill="currentColor" className="text-foreground" />
      </g>
    </svg>
  );
}

/** A line of text set from the font's own outlines (advance widths, no kerning). */
export function Specimen({ font, text, className }: { font: HeroFont; text: string; className?: string }) {
  const { paths, width } = useMemo(() => {
    let x = 0;
    const out: { d: string; x: number }[] = [];
    for (const ch of Array.from(text)) {
      const g = glyphFor(font, ch);
      if (!g) {
        x += font.metrics.unitsPerEm * 0.3;
        continue;
      }
      if (g.path.length) out.push({ d: pathToSvgD(g.path), x });
      x += g.advanceWidth;
    }
    return { paths: out, width: x };
  }, [font, text]);
  const { ascender, descender } = font.metrics;

  return (
    <svg viewBox={`0 ${-ascender} ${Math.max(width, 1)} ${ascender - descender}`} className={className} preserveAspectRatio="xMinYMid meet">
      <g transform="scale(1,-1)" className="text-foreground">
        {paths.map((p, i) => (
          <path key={i} d={p.d} transform={`translate(${p.x} 0)`} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}
