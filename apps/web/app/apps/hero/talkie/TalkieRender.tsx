/**
 * TalkieRender — live SVG wordmark renderer with guides overlay.
 * Renders the word 'talkie' using modified glyph paths on a dark canvas.
 * Click any glyph to enter draw mode.
 */

import { useMemo } from 'react';
import { pathToSvgD } from '../lib/svg';
import { buildWordmark } from './glyphOps';
import { TalkieGuides } from './TalkieGuides';
import type { TalkieParams } from './types';
import { BRAND } from './types';

interface TalkieRenderProps {
  params: TalkieParams;
  metrics: { ascender: number; descender: number; unitsPerEm: number };
  onGlyphClick?: (char: string) => void;
}

export function TalkieRender({ params, metrics, onGlyphClick }: TalkieRenderProps) {
  const wordGlyphs = useMemo(() => buildWordmark(params), [params]);

  const totalAdvance = wordGlyphs.reduce((sum, g) => sum + g.advanceWidth, 0);
  const maxAscender = metrics.ascender;
  const descender = metrics.descender;
  const viewH = maxAscender - descender;
  const padX = 40;
  const padY = 60;

  // Build per-glyph SVG paths with x-offsets (for click targets)
  const glyphPaths = useMemo(() => {
    let cursor = 0;
    return wordGlyphs.map(glyph => {
      const translated = glyph.path.map(cmd => {
        const c = { ...cmd } as any;
        if ('x' in c) c.x += cursor;
        if ('x1' in c) c.x1 += cursor;
        if ('x2' in c) c.x2 += cursor;
        return c;
      });
      const d = pathToSvgD(translated);
      const startX = cursor;
      cursor += glyph.advanceWidth;
      return { char: glyph.char, d, startX, advance: glyph.advanceWidth };
    });
  }, [wordGlyphs]);

  // Hot Mic dot — rendered as a rounded rect, shape controlled by params
  let dotCx = 0;
  let dotCy = 0;
  let dotW = 0;
  let dotH = 0;
  let dotR = 0;
  if (params.dotOverlay) {
    let iStartX = 0;
    for (let j = 0; j < 4; j++) iStartX += wordGlyphs[j].advanceWidth;
    const iGlyph = wordGlyphs[4];
    // v2 builders auto-center on advance/2; i_offsetX shifts that.
    const iStemCenter = iGlyph.advanceWidth / 2 + (params.i_offsetX ?? 0);
    dotW = params.dot_size;
    dotH = params.dot_size * params.dot_aspect;
    // dot_cornerSoftness is 0–100% of half-min-side. 100% = full pill/circle.
    dotR = (Math.min(dotW, dotH) / 2) * (params.dot_cornerSoftness / 100);
    dotCx = iStartX + iStemCenter + params.dot_offsetX;
    dotCy = params.i_height + dotH * 0.6 + 30 + params.dot_offsetY;
  }

  const scale = params.displayScale;
  const hasGuides = params.guides_horizontal || params.guides_glyphMetrics || params.guides_pairGaps;

  // Extra right margin for guide labels
  const rightMargin = params.guides_horizontal ? 500 : 0;
  const viewBox = `${-padX} ${-(maxAscender + padY)} ${totalAdvance + padX * 2 + rightMargin} ${viewH + padY * 2}`;

  return (
    <div
      className="flex-1 flex items-center justify-center overflow-hidden"
      style={{ background: BRAND.canvas }}
    >
      {params.dotOverlay && (
        <style>{`
          @keyframes talkie-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.55; }
          }
          .talkie-pulse { animation: talkie-pulse 1000ms ease-in-out infinite; }
        `}</style>
      )}
      <svg
        viewBox={viewBox}
        style={{
          width: `${(totalAdvance + rightMargin) * 0.28 * scale}px`,
          height: 'auto',
          maxWidth: '90%',
          maxHeight: '80%',
        }}
      >
        <g transform="scale(1,-1)">
          {/* Guides layer (behind wordmark) */}
          {hasGuides && (
            <TalkieGuides
              params={params}
              glyphs={wordGlyphs}
              totalAdvance={totalAdvance}
              metrics={metrics}
            />
          )}

          {/* Per-glyph paths (clickable for draw mode) */}
          {glyphPaths.map(({ char, d, startX, advance }) => (
            <g
              key={char}
              onClick={onGlyphClick ? () => onGlyphClick(char) : undefined}
              style={onGlyphClick ? { cursor: 'pointer' } : undefined}
            >
              {/* Invisible hit area */}
              <rect
                x={startX}
                y={descender}
                width={advance}
                height={viewH}
                fill="transparent"
              />
              <path d={d} fill={BRAND.ink} />
            </g>
          ))}

          {/* Hot Mic dot — rounded rect with parametric shape.
              y uses positive dotCy because we're inside the scale(1,-1) group:
              positive inner y renders above the baseline (where the dot belongs). */}
          {params.dotOverlay && (
            <rect
              x={dotCx - dotW / 2}
              y={dotCy - dotH / 2}
              width={dotW}
              height={dotH}
              rx={dotR}
              ry={dotR}
              fill={BRAND.accent}
              className="talkie-pulse"
            />
          )}
        </g>
      </svg>

      {/* Click hint */}
      {onGlyphClick && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] px-3 py-1 rounded"
          style={{
            background: BRAND.surface,
            color: BRAND.labelDim,
            fontFamily: BRAND.mono,
          }}
        >
          Click any glyph to edit its path
        </div>
      )}
    </div>
  );
}
