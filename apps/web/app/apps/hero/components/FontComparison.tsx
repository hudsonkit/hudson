import { useMemo, useState } from "react";
import type { HeroFont, HeroGlyph } from "../types";
import { pathToSvgD, glyphViewBox } from "../lib/svg";
import { useLibrary } from "../library/LibraryProvider";
import { libraryFontLabel, loadedFontLabel } from "../hero/labels";

type CompareMode = "side-by-side" | "overlay";

interface LoadedFont {
  font: HeroFont;
  fileName: string;
}

interface FontComparisonProps {
  fonts: LoadedFont[];
  onAddFromLibrary?: (id: string) => void;
}

const OVERLAY_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f97316", // orange
  "#06b6d4", // cyan
  "#eab308", // yellow
];

function findGlyph(font: HeroFont, char: string): HeroGlyph | undefined {
  const cp = char.codePointAt(0);
  if (cp == null) return undefined;
  return font.glyphs.find((g) => g.unicode === cp);
}

export function FontComparison({ fonts, onAddFromLibrary }: FontComparisonProps) {
  const [mode, setMode] = useState<CompareMode>("side-by-side");
  const [inputChar, setInputChar] = useState("A");
  const library = useLibrary();
  const addable = library.fonts.filter((f) => !fonts.some((l) => l.fileName === f.fileName));

  const results = useMemo(() => {
    return fonts.map(({ font, fileName }) => ({
      font,
      fileName,
      glyph: findGlyph(font, inputChar),
    }));
  }, [fonts, inputChar]);

  if (fonts.length < 2) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-[13px] text-foreground mb-1">Add a font to compare</div>
          <div className="text-[11px] text-muted-foreground mb-4">
            {fonts.length === 1 ? `Comparing against ${loadedFontLabel(fonts[0]!)}.` : "Compare needs two fonts."}
          </div>
          <div className="border-t border-border">
            {addable.map((f) => (
              <button
                key={f.id}
                onClick={() => onAddFromLibrary?.(f.id)}
                className="w-full flex items-center justify-between px-1 py-2 border-b border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <span className="truncate">{libraryFontLabel(f)}</span>
                <span className="text-[10px] font-mono">+</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[11px] text-muted-foreground">Character</label>
        <input
          type="text"
          value={inputChar}
          onChange={(e) => setInputChar(e.target.value.slice(-1) || "A")}
          maxLength={2}
          className="
            w-12 px-2 py-1 text-center text-lg rounded-md
            bg-card border border-border
            text-foreground focus:outline-none focus:border-foreground/40
          "
        />
        <div className="flex gap-1 ml-4">
          {(["side-by-side", "overlay"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`
                px-2.5 py-1 text-[11px] transition-colors cursor-pointer
                ${mode === m
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {m === "side-by-side" ? "Side by side" : "Overlay"}
            </button>
          ))}
        </div>
        {/* Quick character buttons */}
        <div className="flex gap-1 ml-auto">
          {["A", "a", "g", "R", "0", "&", "@"].map((c) => (
            <button
              key={c}
              onClick={() => setInputChar(c)}
              className={`
                w-7 h-7 text-xs cursor-pointer transition-colors
                ${inputChar === c
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {c}
            </button>
          ))}
        </div>
        {onAddFromLibrary && addable.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onAddFromLibrary(e.target.value)}
            className="px-2 py-1 text-[11px] bg-card border border-border rounded-md text-muted-foreground cursor-pointer focus:outline-none"
          >
            <option value="">Add font…</option>
            {addable.map((f) => (
              <option key={f.id} value={f.id}>{libraryFontLabel(f)}</option>
            ))}
          </select>
        )}
      </div>

      {mode === "side-by-side" ? (
        <SideBySide results={results} />
      ) : (
        <Overlay results={results} />
      )}

      {/* Delta metrics */}
      <DeltaMetrics results={results} />
    </div>
  );
}

interface CompareResult {
  font: HeroFont;
  fileName: string;
  glyph: HeroGlyph | undefined;
}

function SideBySide({ results }: { results: CompareResult[] }) {
  return (
    <div className="grid gap-3 flex-1" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
      {results.map((r, i) => {
        const g = r.glyph;
        if (!g) {
          return (
            <div key={i} className="flex flex-col items-center gap-2 border border-border rounded-lg p-4">
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Not found
              </div>
              <span className="text-xs text-muted-foreground truncate">{r.fileName}</span>
            </div>
          );
        }
        const d = pathToSvgD(g.path);
        const [vx, vy, vw, vh] = glyphViewBox(g, r.font.metrics);
        return (
          <div key={i} className="flex flex-col items-center gap-2 border border-border rounded-lg p-4">
            <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="w-full max-h-64" overflow="visible">
              <g transform="scale(1,-1)">
                {/* Baseline */}
                <line x1={vx} y1={0} x2={vx + vw} y2={0}
                  stroke="var(--color-baseline)" strokeWidth={r.font.metrics.unitsPerEm * 0.003}
                  strokeDasharray={`${r.font.metrics.unitsPerEm * 0.01}`} />
                <path d={d} fill="currentColor" className="text-foreground" />
              </g>
            </svg>
            <span className="text-xs text-muted-foreground truncate max-w-full">
              {loadedFontLabel(r)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Overlay({ results }: { results: CompareResult[] }) {
  // Use the first font's metrics as reference
  const ref = results[0]!;
  const metrics = ref.font.metrics;
  const width = metrics.unitsPerEm;
  const height = metrics.ascender - metrics.descender;
  const vx = 0;
  const vy = -metrics.ascender;

  return (
    <div className="flex-1 flex flex-col items-center gap-3">
      <svg viewBox={`${vx} ${vy} ${width} ${height}`} className="w-full max-h-80" overflow="visible">
        <g transform="scale(1,-1)">
          <line x1={vx} y1={0} x2={vx + width} y2={0}
            stroke="var(--color-baseline)" strokeWidth={metrics.unitsPerEm * 0.003}
            strokeDasharray={`${metrics.unitsPerEm * 0.01}`} />
          {results.map((r, i) => {
            if (!r.glyph) return null;
            const d = pathToSvgD(r.glyph.path);
            return (
              <path
                key={i}
                d={d}
                fill={OVERLAY_COLORS[i % OVERLAY_COLORS.length]}
                fillOpacity={0.45}
              />
            );
          })}
        </g>
      </svg>
      <div className="flex gap-4">
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-sm" style={{ background: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }} />
            <span className="text-muted-foreground">{loadedFontLabel(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeltaMetrics({ results }: { results: CompareResult[] }) {
  const withGlyphs = results.filter((r) => r.glyph != null);
  if (withGlyphs.length < 2) return null;

  return (
    <div className="border border-border rounded-lg p-4">
      <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Metrics Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-1 pr-4">Font</th>
              <th className="text-right py-1 px-2">Advance W</th>
              <th className="text-right py-1 px-2">BBox W</th>
              <th className="text-right py-1 px-2">BBox H</th>
              <th className="text-right py-1 px-2">UPM</th>
            </tr>
          </thead>
          <tbody>
            {withGlyphs.map((r, i) => {
              const g = r.glyph!;
              const bb = g.boundingBox;
              return (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-4">{loadedFontLabel(r)}</td>
                  <td className="text-right py-1 px-2">{g.advanceWidth}</td>
                  <td className="text-right py-1 px-2">{bb ? bb.x2 - bb.x1 : "—"}</td>
                  <td className="text-right py-1 px-2">{bb ? bb.y2 - bb.y1 : "—"}</td>
                  <td className="text-right py-1 px-2">{r.font.metrics.unitsPerEm}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
