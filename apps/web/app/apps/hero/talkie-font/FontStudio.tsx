/**
 * FontStudio — Talkie font family manager.
 * Manages four variants: Soft, Hard, Mono, Wordmark.
 * Live preview with side-by-side comparison, syntax highlighting,
 * parametric controls including Mono symbol tuning, TTF export.
 */

// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { loadFont, FULL_CHARSET } from './fontLoader';
import type { LoadedFontData, StockGlyph } from './fontLoader';
import {
  transformSoft, transformHard, transformMono,
  DEFAULT_SOFT, DEFAULT_HARD, DEFAULT_MONO,
  VARIANT_META,
} from './variantSpec';
import type { SoftParams, HardParams, MonoParams, VariantId, TransformedGlyph } from './variantSpec';
import { exportTTF, downloadBlob } from './fontExport';
import { pathToSvgD } from '../lib/svg';
import { tokenizeLine, TOKEN_COLORS } from './tokenizer';
import type { Token } from './tokenizer';

const BRAND = {
  // Chrome surfaces/text/borders use HudsonKit semantic tokens so the studio
  // adapts to light + dark themes. Brand accents (cassette/accent/tapeTan) and
  // the preview canvas swatches stay fixed — they identify the Talkie brand and
  // paint the preview artifact, not the surrounding UI.
  canvas: 'oklch(var(--background))',
  canvasLight: '#F4EFE6', // preview-canvas light artifact, not chrome
  ink: 'oklch(var(--foreground))',
  inkDark: '#0E0D0A', // preview-canvas ink artifact, not chrome
  muted: 'oklch(var(--muted-foreground))',
  cassette: '#E68A3C',
  tapeTan: '#7A6E5C',
  surface: 'oklch(var(--muted))',
  border: 'oklch(var(--border))',
  labelDim: 'oklch(var(--muted-foreground))',
  labelMid: 'oklch(var(--muted-foreground))',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

// ── Variant-specific default preview texts ──

const PREVIEW_SOFT = 'The quick brown fox jumps over the lazy dog\n0123456789 — ! ? & @ #';
const PREVIEW_HARD = 'The quick brown fox jumps over the lazy dog\n0123456789 — ! ? & @ #';
const PREVIEW_MONO = `const greeting = (name: string) => {\n  if (!name) return "Hello, world!";\n  return \`Hello, \${name}!\`;\n};\n\ngreeting("Talkie"); // → "Hello, Talkie!"`;
const PREVIEW_WORDMARK = 'talkie';

const VARIANT_PREVIEWS: Record<VariantId, string> = {
  soft: PREVIEW_SOFT, hard: PREVIEW_HARD, mono: PREVIEW_MONO, wordmark: PREVIEW_WORDMARK,
};

// ── Slider ──

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: BRAND.labelMid, fontFamily: BRAND.mono }}>{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: BRAND.ink, fontFamily: BRAND.mono }}>{value}{unit && <span style={{ color: BRAND.labelDim }}>{unit}</span>}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-amber-600"
        style={{ background: BRAND.surface }} />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center gap-2 py-0.5 cursor-pointer">
      <div className="w-6 h-3.5 rounded-full transition-colors relative" style={{ background: value ? BRAND.cassette : BRAND.surface }}>
        <div className="w-2.5 h-2.5 rounded-full absolute top-0.5 transition-all" style={{ left: value ? 11 : 2, background: BRAND.ink }} />
      </div>
      <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: BRAND.labelMid, fontFamily: BRAND.mono }}>{label}</span>
    </button>
  );
}

// ── Preview renderer — supports plain text and syntax-highlighted code ──

function FontPreview({ glyphs, metrics, text, fill, fontSize, syntaxHighlight }: {
  glyphs: Map<string, TransformedGlyph>;
  metrics: { ascender: number; descender: number; unitsPerEm: number };
  text: string;
  fill: string;
  fontSize: number;
  syntaxHighlight?: boolean;
}) {
  const lines = text.split('\n');
  const scale = fontSize / metrics.unitsPerEm;
  const lineH = (metrics.ascender - metrics.descender) * scale * 1.3;

  // Tokenize if syntax highlighting is on
  const tokenizedLines: Token[][] | null = useMemo(() => {
    if (!syntaxHighlight) return null;
    return lines.map(line => tokenizeLine(line));
  }, [lines, syntaxHighlight]);

  const svgContent = useMemo(() => {
    const result: { y: number; chars: { d: string; fill: string }[]; width: number }[] = [];

    for (let li = 0; li < lines.length; li++) {
      const y = metrics.ascender * scale + li * lineH;
      let cursor = 20;
      const chars: { d: string; fill: string }[] = [];

      if (syntaxHighlight && tokenizedLines) {
        // Render with per-token colors
        for (const token of tokenizedLines[li]) {
          const tokenFill = TOKEN_COLORS[token.type];
          for (const ch of token.text) {
            const g = glyphs.get(ch);
            if (!g) { cursor += 300 * scale; continue; }
            const translated = g.path.map(cmd => {
              const c = { ...cmd } as any;
              if (typeof c.x === 'number') c.x = c.x * scale + cursor;
              if (typeof c.x1 === 'number') c.x1 = c.x1 * scale + cursor;
              if (typeof c.x2 === 'number') c.x2 = c.x2 * scale + cursor;
              if (typeof c.y === 'number') c.y = c.y * scale;
              if (typeof c.y1 === 'number') c.y1 = c.y1 * scale;
              if (typeof c.y2 === 'number') c.y2 = c.y2 * scale;
              return c;
            });
            const d = pathToSvgD(translated);
            if (d) chars.push({ d, fill: tokenFill });
            cursor += g.advanceWidth * scale;
          }
        }
      } else {
        // Plain rendering
        for (const ch of lines[li]) {
          const g = glyphs.get(ch);
          if (!g) { cursor += 300 * scale; continue; }
          const translated = g.path.map(cmd => {
            const c = { ...cmd } as any;
            if (typeof c.x === 'number') c.x = c.x * scale + cursor;
            if (typeof c.x1 === 'number') c.x1 = c.x1 * scale + cursor;
            if (typeof c.x2 === 'number') c.x2 = c.x2 * scale + cursor;
            if (typeof c.y === 'number') c.y = c.y * scale;
            if (typeof c.y1 === 'number') c.y1 = c.y1 * scale;
            if (typeof c.y2 === 'number') c.y2 = c.y2 * scale;
            return c;
          });
          const d = pathToSvgD(translated);
          if (d) chars.push({ d, fill });
          cursor += g.advanceWidth * scale;
        }
      }

      result.push({ y, chars, width: cursor });
    }
    return result;
  }, [lines, glyphs, metrics, scale, lineH, fill, syntaxHighlight, tokenizedLines]);

  const totalH = lines.length * lineH + 40;
  const maxW = Math.max(600, ...svgContent.map(l => l.width + 40));

  return (
    <svg viewBox={`0 0 ${maxW} ${totalH}`} style={{ width: '100%', minHeight: 100 }}>
      {svgContent.map((line, li) => (
        <g key={li} transform={`translate(0, ${line.y}) scale(1, -1)`}>
          {line.chars.map((p, pi) => (
            <path key={pi} d={p.d} fill={p.fill} />
          ))}
        </g>
      ))}
    </svg>
  );
}

// ── Section header for controls ──

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="pt-2 pb-1">
      <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: BRAND.tapeTan, fontFamily: BRAND.mono }}>
        {text}
      </span>
    </div>
  );
}

// ── Main ──

export function FontStudio() {
  const [variant, setVariant] = useState<VariantId>('soft');
  const [mediumFont, setMediumFont] = useState<LoadedFontData | null>(null);
  const [regularFont, setRegularFont] = useState<LoadedFontData | null>(null);
  const [wordmarkFont, setWordmarkFont] = useState<LoadedFontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState(PREVIEW_SOFT);
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(48);
  const [exporting, setExporting] = useState(false);
  const [compare, setCompare] = useState(true);

  const userEditedRef = useRef(false);

  const [softParams, setSoftParams] = useState<SoftParams>(DEFAULT_SOFT);
  const [hardParams, setHardParams] = useState<HardParams>(DEFAULT_HARD);
  const [monoParams, setMonoParams] = useState<MonoParams>(DEFAULT_MONO);

  const handleVariantSwitch = useCallback((v: VariantId) => {
    setVariant(v);
    if (!userEditedRef.current) {
      setPreviewText(VARIANT_PREVIEWS[v]);
    }
  }, []);

  const handleTextChange = useCallback((text: string) => {
    setPreviewText(text);
    userEditedRef.current = true;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [medium, regular] = await Promise.all([
          loadFont('/hero/fonts/JetBrainsMono-Medium.ttf'),
          loadFont('/hero/fonts/JetBrainsMono-Regular.ttf'),
        ]);
        setMediumFont(medium);
        setRegularFont(regular);

        const wmRes = await fetch('/hero/fonts/JetBrainsMono-Medium.ttf');
        if (wmRes.ok) {
          const buf = await wmRes.arrayBuffer();
          const { parseFontBuffer } = await import('./fontLoader');
          const wm = parseFontBuffer(buf, 'talkie');
          setWordmarkFont(wm);
        }

        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    }
    load();
  }, []);

  const transformedGlyphs = useMemo(() => {
    if (!mediumFont || !regularFont) return new Map<string, TransformedGlyph>();
    const result = new Map<string, TransformedGlyph>();
    if (variant === 'soft') {
      for (const [ch, glyph] of mediumFont.glyphs) result.set(ch, transformSoft(glyph, softParams));
    } else if (variant === 'hard') {
      for (const [ch, glyph] of mediumFont.glyphs) result.set(ch, transformHard(glyph, hardParams));
    } else if (variant === 'mono') {
      for (const [ch, glyph] of regularFont.glyphs) result.set(ch, transformMono(glyph, monoParams));
    } else if (variant === 'wordmark' && wordmarkFont) {
      for (const [ch, glyph] of wordmarkFont.glyphs) result.set(ch, { ...glyph });
    }
    return result;
  }, [variant, mediumFont, regularFont, wordmarkFont, softParams, hardParams, monoParams]);

  const baseGlyphs = useMemo((): Map<string, TransformedGlyph> => {
    const base = variant === 'mono' ? regularFont : mediumFont;
    if (!base) return new Map();
    const result = new Map<string, TransformedGlyph>();
    for (const [ch, glyph] of base.glyphs) result.set(ch, { ...glyph });
    return result;
  }, [variant, mediumFont, regularFont]);

  const currentMetrics = useMemo(() => {
    if (variant === 'mono' && regularFont) return regularFont.metrics;
    if (mediumFont) return mediumFont.metrics;
    return { unitsPerEm: 1000, ascender: 1020, descender: -300 };
  }, [variant, mediumFont, regularFont]);

  const baseLabel = variant === 'mono' ? 'JBM Regular' : 'JBM Medium';
  const variantLabel = VARIANT_META[variant].label;
  const showCompare = compare && variant !== 'wordmark';
  const useSyntax = variant === 'mono';

  const handleExport = useCallback(async () => {
    if (variant === 'wordmark') return;
    setExporting(true);
    try {
      const glyphs = Array.from(transformedGlyphs.values());
      const meta = VARIANT_META[variant];
      const buffer = exportTTF(glyphs, meta.familyName, currentMetrics);
      downloadBlob(buffer, `${meta.familyName.replace(/\s/g, '-')}.ttf`);
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(false);
  }, [variant, transformedGlyphs, currentMetrics]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: BRAND.canvas }}>
        <span className="text-[11px]" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>Loading fonts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: BRAND.canvas }}>
        <span className="text-[13px]" style={{ color: '#FF5346', fontFamily: BRAND.mono }}>{error}</span>
      </div>
    );
  }

  const meta = VARIANT_META[variant];
  // Font-preview stage is a rendered *artifact*, not chrome — its dark/light
  // toggle stays fixed so the specimen reads identically regardless of app theme.
  const previewFill = darkMode ? '#F4EFE6' : '#0E0D0A';
  const previewBg = darkMode ? '#0E0D0A' : '#F4EFE6';
  const displayText = variant === 'wordmark' ? 'talkie' : previewText;

  return (
    <div className="h-full flex flex-col" style={{ background: BRAND.canvas, color: BRAND.ink }}>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-1 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
        {(['soft', 'hard', 'mono', 'wordmark'] as VariantId[]).map(v => (
          <button key={v} onClick={() => handleVariantSwitch(v)}
            className="px-3 py-1.5 rounded-md text-[11px] uppercase tracking-[0.14em] transition-colors cursor-pointer"
            style={{
              fontFamily: BRAND.mono,
              background: variant === v ? BRAND.cassette + '33' : 'transparent',
              color: variant === v ? BRAND.cassette : BRAND.labelMid,
              border: `1px solid ${variant === v ? BRAND.cassette + '55' : 'transparent'}`,
            }}>
            {VARIANT_META[v].label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px]" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>{meta.description}</span>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex min-h-0">
        {/* Preview area */}
        <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
          <textarea value={previewText} onChange={(e) => handleTextChange(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-md text-[12px] resize-none outline-none"
            style={{ background: BRAND.surface, color: BRAND.ink, fontFamily: BRAND.mono, border: `1px solid ${BRAND.border}` }}
            placeholder="Type preview text..." />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>Size</span>
              <input type="range" min={16} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-24 h-1 rounded-full appearance-none cursor-pointer accent-amber-600" style={{ background: BRAND.surface }} />
              <span className="text-[10px] tabular-nums" style={{ color: BRAND.labelMid, fontFamily: BRAND.mono }}>{fontSize}pt</span>
            </div>
            <button onClick={() => setDarkMode(!darkMode)}
              className="text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded cursor-pointer"
              style={{ color: BRAND.tapeTan, fontFamily: BRAND.mono, background: BRAND.surface }}>
              {darkMode ? 'Light' : 'Dark'}
            </button>
          </div>

          {/* ── Rendered preview ── */}
          <div className="flex-1 overflow-hidden rounded-lg flex" style={{ background: previewBg }}>
            {showCompare ? (
              <>
                {/* Left column: base font */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                  <div className="px-5 pt-4 pb-2 shrink-0">
                    <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: BRAND.tapeTan, fontFamily: BRAND.mono }}>
                      {baseLabel}
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto px-1 pb-4">
                    <FontPreview glyphs={baseGlyphs} metrics={currentMetrics} text={displayText}
                      fill={previewFill} fontSize={fontSize} syntaxHighlight={useSyntax} />
                  </div>
                </div>

                {/* Divider */}
                <div className="shrink-0" style={{ width: 1, background: darkMode ? '#23201a' : '#d4cfc5' }} />

                {/* Right column: Talkie variant */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                  <div className="px-5 pt-4 pb-2 shrink-0">
                    <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: BRAND.cassette, fontFamily: BRAND.mono }}>
                      Talkie {variantLabel}
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto px-1 pb-4">
                    <FontPreview glyphs={transformedGlyphs} metrics={currentMetrics} text={displayText}
                      fill={previewFill} fontSize={fontSize} syntaxHighlight={useSyntax} />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-auto p-1">
                <FontPreview glyphs={transformedGlyphs} metrics={currentMetrics} text={displayText}
                  fill={previewFill} fontSize={fontSize} syntaxHighlight={useSyntax} />
              </div>
            )}
          </div>
        </div>

        {/* Controls panel */}
        <div className="flex-shrink-0 overflow-y-auto flex flex-col" style={{ width: 260, borderLeft: `1px solid ${BRAND.border}` }}>
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
            <span className="text-[11px] uppercase tracking-[0.2em]" style={{ color: BRAND.muted, fontFamily: BRAND.mono }}>
              {meta.label} Controls
            </span>
          </div>

          <div className="px-4 py-3 flex flex-col gap-4 flex-1">
            {variant !== 'wordmark' && (
              <Toggle label="Compare with base" value={compare} onChange={setCompare} />
            )}

            {variant === 'soft' && (
              <>
                <Slider label="Corner softness" value={softParams.cornerSoftness} min={0} max={50} unit="u" onChange={(v) => setSoftParams(p => ({ ...p, cornerSoftness: v }))} />
                <Slider label="Spacing factor" value={softParams.spacingFactor} min={0.85} max={1.20} step={0.01} unit="×" onChange={(v) => setSoftParams(p => ({ ...p, spacingFactor: v }))} />
                <div className="text-[9px] leading-relaxed" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>
                  <div>{transformedGlyphs.size} glyphs · JBM Medium base</div>
                  <div>Advance: {Math.round(600 * softParams.spacingFactor)}u (×{softParams.spacingFactor})</div>
                </div>
              </>
            )}

            {variant === 'hard' && (
              <>
                <Slider label="Corner softness" value={hardParams.cornerSoftness} min={0} max={10} unit="u" onChange={(v) => setHardParams(p => ({ ...p, cornerSoftness: v }))} />
                <Slider label="Spacing factor" value={hardParams.spacingFactor} min={0.85} max={1.05} step={0.01} unit="×" onChange={(v) => setHardParams(p => ({ ...p, spacingFactor: v }))} />
                <div className="text-[9px] leading-relaxed" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>
                  <div>{transformedGlyphs.size} glyphs · JBM Medium base</div>
                  <div>Advance: {Math.round(600 * hardParams.spacingFactor)}u (×{hardParams.spacingFactor})</div>
                </div>
              </>
            )}

            {variant === 'mono' && (
              <>
                <Slider label="Corner softness" value={monoParams.cornerSoftness} min={0} max={15} unit="u" onChange={(v) => setMonoParams(p => ({ ...p, cornerSoftness: v }))} />

                {/* Symbol Tuning section */}
                <SectionLabel text="Symbol Tuning" />

                <Slider label="Symbol curvature" value={monoParams.symbolCurvature} min={0.6} max={1.4} step={0.02} unit="×"
                  onChange={(v) => setMonoParams(p => ({ ...p, symbolCurvature: v }))} />
                <Slider label="Bracket angle" value={monoParams.bracketAngle} min={-20} max={20} unit="°"
                  onChange={(v) => setMonoParams(p => ({ ...p, bracketAngle: v }))} />
                <Slider label="Symbol weight" value={monoParams.symbolWeight} min={-20} max={20} unit="u"
                  onChange={(v) => setMonoParams(p => ({ ...p, symbolWeight: v }))} />

                <div className="text-[9px] leading-relaxed" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>
                  <div>{transformedGlyphs.size} glyphs · JBM Regular base</div>
                  <div>Strict monospace: 600u advance</div>
                  <div>Curvature affects () {} O C S etc.</div>
                  <div>Angle affects [] / \ {'<'} {'>'} etc.</div>
                </div>
              </>
            )}

            {variant === 'wordmark' && (
              <div className="text-[9px] leading-relaxed" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>
                <div>6-glyph bespoke logotype</div>
                <div>Read-only reference</div>
                <div>Edit in Wordmark Studio</div>
              </div>
            )}
          </div>

          {variant !== 'wordmark' && (
            <div className="px-4 py-3" style={{ borderTop: `1px solid ${BRAND.border}` }}>
              <button onClick={handleExport} disabled={exporting}
                className="w-full py-2 rounded-md text-[11px] uppercase tracking-[0.16em] cursor-pointer transition-colors"
                style={{
                  fontFamily: BRAND.mono,
                  background: BRAND.cassette + '22', color: BRAND.cassette,
                  border: `1px solid ${BRAND.cassette}44`, opacity: exporting ? 0.5 : 1,
                }}>
                {exporting ? 'Exporting...' : `Export ${meta.familyName}.ttf`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
