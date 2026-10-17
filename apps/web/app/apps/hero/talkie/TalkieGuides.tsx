/**
 * TalkieGuides — measurement overlay for the wordmark.
 * Renders behind the wordmark in font coordinates (Y-up, pre scale(1,-1)).
 */

import type { TalkieParams } from './types';
import type { WordGlyph } from './glyphOps';
import { BRAND } from './types';

interface TalkieGuidesProps {
  params: TalkieParams;
  glyphs: WordGlyph[];
  totalAdvance: number;
  metrics: { ascender: number; descender: number; unitsPerEm: number };
}

const GUIDE_COLOR = BRAND.tapeTan;
const LABEL_SIZE = 32; // in font units, scales with the SVG

// Per-metric visual hierarchy. Baseline is the reference and gets a solid
// stroke at full intensity; cap/x-height are secondary (dashed, mid); ascender
// and descender are extremes (dashed, dimmer). All share the brand color so
// the guides feel like a single system, not a rainbow of intent.
const HORIZONTAL_GUIDES = [
  { key: 'descender', label: 'descender', strokeOpacity: 0.18, labelOpacity: 0.4,  dashed: true,  fontWeight: 400 },
  { key: 'baseline',  label: 'baseline',  strokeOpacity: 0.55, labelOpacity: 0.75, dashed: false, fontWeight: 500 },
  { key: 'xHeight',   label: 'x-height',  strokeOpacity: 0.32, labelOpacity: 0.55, dashed: true,  fontWeight: 400 },
  { key: 'capHeight', label: 'cap',       strokeOpacity: 0.32, labelOpacity: 0.55, dashed: true,  fontWeight: 400 },
  { key: 'ascender',  label: 'ascender',  strokeOpacity: 0.18, labelOpacity: 0.4,  dashed: true,  fontWeight: 400 },
] as const;

export function TalkieGuides({ params, glyphs, totalAdvance, metrics }: TalkieGuidesProps) {
  const xHeight = 550; // JBM x-height
  const capHeight = 730; // JBM cap height
  const { ascender, descender } = metrics;
  const yByKey: Record<string, number> = { baseline: 0, xHeight, capHeight, ascender, descender };

  // Stack labels in a column off the right edge in a fixed order so labels
  // never overlap, even when two metric lines sit close together. Y position
  // = the line's y (no collision math needed since the list above is sorted).
  const labelGutterX = totalAdvance + 28;

  return (
    <g className="talkie-guides">
      {/* ── Horizontal metrics ── */}
      {params.guides_horizontal && (
        <g>
          {HORIZONTAL_GUIDES.map(({ key, label, strokeOpacity, labelOpacity, dashed, fontWeight }) => {
            const y = yByKey[key];
            const value = Math.round(y);
            return (
              <g key={key}>
                <line
                  x1={-32}
                  y1={y}
                  x2={totalAdvance + 20}
                  y2={y}
                  stroke={GUIDE_COLOR}
                  strokeWidth={key === 'baseline' ? 1.5 : 1}
                  opacity={strokeOpacity}
                  strokeDasharray={dashed ? '6 4' : undefined}
                />
                {/* Right-gutter label: name + value, mono, ranged left at gutter */}
                <g transform={`translate(${labelGutterX}, ${y}) scale(1,-1)`}>
                  <text
                    x={0}
                    y={LABEL_SIZE * 0.35}
                    fontSize={LABEL_SIZE}
                    fill={GUIDE_COLOR}
                    opacity={labelOpacity}
                    fontWeight={fontWeight}
                    fontFamily={BRAND.mono}
                  >
                    {label}
                  </text>
                  <text
                    x={LABEL_SIZE * 8}
                    y={LABEL_SIZE * 0.35}
                    fontSize={LABEL_SIZE}
                    fill={GUIDE_COLOR}
                    opacity={labelOpacity * 0.7}
                    fontFamily={BRAND.mono}
                    textAnchor="end"
                  >
                    {value}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      )}

      {/* ── Per-glyph metrics ── */}
      {params.guides_glyphMetrics && (
        <g>
          {(() => {
            let cursor = 0;
            return glyphs.map((g, idx) => {
              const x = cursor;
              cursor += g.advanceWidth;
              // Compute ink bbox from path
              let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
              for (const cmd of g.path) {
                const c = cmd as any;
                if (c.x !== undefined) { bx1 = Math.min(bx1, c.x); bx2 = Math.max(bx2, c.x); }
                if (c.y !== undefined) { by1 = Math.min(by1, c.y); by2 = Math.max(by2, c.y); }
                if (c.x1 !== undefined) { bx1 = Math.min(bx1, c.x1); bx2 = Math.max(bx2, c.x1); }
                if (c.y1 !== undefined) { by1 = Math.min(by1, c.y1); by2 = Math.max(by2, c.y1); }
              }

              return (
                <g key={idx}>
                  {/* Advance boundary (vertical line at right edge) */}
                  <line
                    x1={x + g.advanceWidth} y1={descender}
                    x2={x + g.advanceWidth} y2={ascender}
                    stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.45}
                  />
                  {/* Advance tick below baseline */}
                  <line
                    x1={x + g.advanceWidth} y1={-20}
                    x2={x + g.advanceWidth} y2={-60}
                    stroke={GUIDE_COLOR} strokeWidth={2} opacity={0.7}
                  />
                  {/* Glyph char label at tick */}
                  <g transform={`translate(${x + g.advanceWidth / 2}, ${-90}) scale(1,-1)`}>
                    <text
                      x={0} y={0}
                      textAnchor="middle"
                      fontSize={LABEL_SIZE}
                      fill={GUIDE_COLOR}
                      opacity={0.85}
                      fontFamily={BRAND.mono}
                    >
                      {g.char}
                    </text>
                  </g>
                  {/* BBox outline */}
                  {isFinite(bx1) && (
                    <rect
                      x={x + bx1} y={by1}
                      width={bx2 - bx1} height={by2 - by1}
                      fill="none"
                      stroke={GUIDE_COLOR}
                      strokeWidth={1}
                      opacity={0.35}
                      strokeDasharray="6 4"
                    />
                  )}
                </g>
              );
            });
          })()}
        </g>
      )}

      {/* ── Pair gaps ── */}
      {params.guides_pairGaps && (
        <g>
          {(() => {
            let cursor = 0;
            const results: React.ReactNode[] = [];
            for (let idx = 0; idx < glyphs.length - 1; idx++) {
              const left = glyphs[idx];
              const right = glyphs[idx + 1];
              cursor += (idx === 0 ? 0 : 0); // cursor already advanced

              // Compute right-side bearing of left glyph
              let leftMaxX = -Infinity;
              for (const cmd of left.path) {
                const c = cmd as any;
                if (c.x !== undefined) leftMaxX = Math.max(leftMaxX, c.x);
                if (c.x1 !== undefined) leftMaxX = Math.max(leftMaxX, c.x1);
              }

              // Compute left-side bearing of right glyph
              let rightMinX = Infinity;
              for (const cmd of right.path) {
                const c = cmd as any;
                if (c.x !== undefined) rightMinX = Math.min(rightMinX, c.x);
                if (c.x1 !== undefined) rightMinX = Math.min(rightMinX, c.x1);
              }

              // Position in composed space
              let leftGlyphStart = 0;
              for (let j = 0; j < idx; j++) leftGlyphStart += glyphs[j].advanceWidth;
              const rightGlyphStart = leftGlyphStart + left.advanceWidth;

              const gapLeft = leftGlyphStart + leftMaxX;
              const gapRight = rightGlyphStart + rightMinX;
              const gapWidth = gapRight - gapLeft;

              if (gapWidth > 0 && isFinite(gapWidth)) {
                results.push(
                  <g key={`gap-${idx}`}>
                    {/* Tinted band */}
                    <rect
                      x={gapLeft} y={0}
                      width={gapWidth} height={xHeight}
                      fill={BRAND.cassette}
                      opacity={0.06}
                    />
                    {/* Gap value label */}
                    <g transform={`translate(${gapLeft + gapWidth / 2}, ${xHeight / 2}) scale(1,-1)`}>
                      <text
                        x={0} y={0}
                        textAnchor="middle"
                        fontSize={LABEL_SIZE * 0.75}
                        fill={BRAND.cassette}
                        opacity={0.5}
                        fontFamily={BRAND.mono}
                      >
                        {Math.round(gapWidth)}u
                      </text>
                    </g>
                  </g>,
                );
              }
            }
            return results;
          })()}
        </g>
      )}
    </g>
  );
}
