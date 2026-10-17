import { useEffect, useMemo, useRef, useState } from "react";
import type { HeroFont, HeroGlyph } from "../types";
import { GlyphCell } from "./GlyphCell";
import { Specimen } from "./GlyphStage";

const SPECIMEN = "Hamburgefonstiv 0123";

// The shell can leave focus in a closed drawer's input, parked off screen;
// typing there shouldn't swallow the jump.
function isOnScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

type FilterRange = "all" | "A-Z" | "a-z" | "0-9" | "punct" | "other";

const FILTER_RANGES: { label: string; value: FilterRange }[] = [
  { label: "All", value: "all" },
  { label: "A–Z", value: "A-Z" },
  { label: "a–z", value: "a-z" },
  { label: "0–9", value: "0-9" },
  { label: "Punct", value: "punct" },
  { label: "Other", value: "other" },
];

function matchesRange(glyph: HeroGlyph, range: FilterRange): boolean {
  const cp = glyph.unicode;
  if (cp == null) return range === "other";
  switch (range) {
    case "all":
      return true;
    case "A-Z":
      return cp >= 0x41 && cp <= 0x5a;
    case "a-z":
      return cp >= 0x61 && cp <= 0x7a;
    case "0-9":
      return cp >= 0x30 && cp <= 0x39;
    case "punct":
      return (cp >= 0x20 && cp <= 0x2f) || (cp >= 0x3a && cp <= 0x40) ||
        (cp >= 0x5b && cp <= 0x60) || (cp >= 0x7b && cp <= 0x7e);
    case "other":
      return !matchesRange(glyph, "A-Z") && !matchesRange(glyph, "a-z") &&
        !matchesRange(glyph, "0-9") && !matchesRange(glyph, "punct");
  }
}

interface GlyphGridProps {
  font: HeroFont;
  selectedIndex: number | null;
  onSelectGlyph: (glyph: HeroGlyph) => void;
  onEditGlyph?: (glyph: HeroGlyph) => void;
  externalSearch?: string;
}

export function GlyphGrid({ font, selectedIndex, onSelectGlyph, onEditGlyph, externalSearch }: GlyphGridProps) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<FilterRange>("all");

  const effectiveSearch = externalSearch ?? search;

  const gridRef = useRef<HTMLDivElement>(null);

  // Type a character to jump to its glyph.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) && isOnScreen(t)) return;
      const cp = e.key.codePointAt(0);
      const glyph = font.glyphs.find((g) => g.unicode === cp);
      if (!glyph) return;
      e.preventDefault();
      setRange("all");
      onSelectGlyph(glyph);
      requestAnimationFrame(() => {
        gridRef.current
          ?.querySelector(`[data-glyph-index="${glyph.index}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [font.glyphs, onSelectGlyph]);

  const filtered = useMemo(() => {
    // .notdef and empty outlines (space, controls) have nothing to show.
    let glyphs = font.glyphs.filter((g) => g.path.length > 0 && g.name !== ".notdef");
    if (range !== "all") {
      glyphs = glyphs.filter((g) => matchesRange(g, range));
    }
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      glyphs = glyphs.filter(
        (g) =>
          g.character?.toLowerCase().includes(q) ||
          g.name?.toLowerCase().includes(q) ||
          g.unicode?.toString(16).includes(q)
      );
    }
    return glyphs;
  }, [font.glyphs, range, effectiveSearch]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <Specimen font={font} text={SPECIMEN} className="h-16 w-full shrink-0 mt-2 mb-1" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {externalSearch === undefined && (
          <input
            type="text"
            placeholder="Search glyphs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              px-3 py-1.5 text-sm rounded-lg
              bg-[var(--color-surface)] border border-[var(--color-border)]
              text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]
              focus:outline-none focus:border-[var(--color-accent)]
              w-48
            "
          />
        )}
        <div className="flex gap-1">
          {FILTER_RANGES.map((f) => (
            <button
              key={f.value}
              onClick={() => setRange(f.value)}
              className={`
                px-2.5 py-1 text-[11px] transition-colors cursor-pointer
                ${range === f.value
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground font-mono ml-auto">
          {range === "all" && !effectiveSearch ? `${filtered.length} glyphs` : `${filtered.length} of ${font.glyphCount}`}
        </span>
      </div>

      {/* Grid */}
      <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-px bg-border border border-border overflow-y-auto flex-1 content-start mb-3">
        {filtered.map((glyph) => (
          <GlyphCell
            key={glyph.index}
            glyph={glyph}
            metrics={font.metrics}
            isSelected={glyph.index === selectedIndex}
            onClick={() => onSelectGlyph(glyph)}
            onDoubleClick={onEditGlyph ? () => onEditGlyph(glyph) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
