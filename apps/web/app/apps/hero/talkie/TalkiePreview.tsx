/**
 * TalkiePreview — consumer-side preview strip.
 *
 * Shows the wordmark with the same downstream transforms that
 * narrative-studio's squeeze-lab applies: per-pair letter-spacing (squeeze),
 * stroke-thinning erode, and the consumer Hot Mic dot. Sits beneath the
 * main editable wordmark so any glyph tweak in the studio is immediately
 * legible in the lockup it actually ships in.
 *
 * Keep this in sync with narrative-studio/src/app/deck/talkie/_brand/wordmark.tsx
 * — once the studio + consumer renderer are stable, factor into a shared pkg.
 */

import { useMemo, useState } from 'react';
import { pathToSvgD } from '../lib/svg';
import { buildWordmark } from './glyphOps';
import type { TalkieParams } from './types';
import { BRAND } from './types';

interface TalkiePreviewProps {
  params: TalkieParams;
}

// Defaults mirror narrative-studio/squeeze-lab. If you tune those, tune these.
const DEFAULTS = {
  squeeze: 0.88,
  thinness: 0.4,
  dotScale: 1.7,
  dotGap: 2.2,
  monotone: false,
};

// Per-pair extra tightening (UPM), matching wordmark.tsx's DEFAULT_KERN.
const KERN = { ta: 0, al: 0, lk: 30, ki: 30, ie: 0 };

const PAIR_ORDER = ['ta', 'al', 'lk', 'ki', 'ie'] as const;

export function TalkiePreview({ params }: TalkiePreviewProps) {
  const [squeeze, setSqueeze] = useState(DEFAULTS.squeeze);
  const [thinness, setThinness] = useState(DEFAULTS.thinness);
  const [monotone, setMonotone] = useState(DEFAULTS.monotone);

  const wordGlyphs = useMemo(() => buildWordmark(params), [params]);

  const totalAdvanceNatural = wordGlyphs.reduce((sum, g) => sum + g.advanceWidth, 0);
  const baseGap = (totalAdvanceNatural * (1 - squeeze)) / 5;

  // Cumulative x positions per glyph, with per-pair kern applied on top of
  // squeeze. "talkie" is always exactly 6 glyphs — buildWordmark contract.
  const xs = useMemo(() => {
    const out: number[] = [0];
    for (let i = 0; i < 5; i++) {
      const pair = PAIR_ORDER[i]!;
      const gap = baseGap + KERN[pair];
      out.push(out[i]! + wordGlyphs[i]!.advanceWidth - gap);
    }
    return out;
  }, [wordGlyphs, baseGap]);

  const totalAdvance = xs[5]! + wordGlyphs[5]!.advanceWidth;

  // Build translated per-glyph paths
  const glyphPaths = useMemo(() => {
    return wordGlyphs.map((glyph, i) => {
      const dx = xs[i]!;
      const translated = glyph.path.map((cmd) => {
        const c = { ...cmd } as any;
        if ('x' in c) c.x += dx;
        if ('x1' in c) c.x1 += dx;
        if ('x2' in c) c.x2 += dx;
        return c;
      });
      return { char: glyph.char, d: pathToSvgD(translated) };
    });
  }, [wordGlyphs, xs]);

  // Dot position — track the i stem center under v2 auto-centered builders.
  // Stem center sits at advance/2, shifted by i_offsetX.
  const iGlyph = wordGlyphs[4]!;
  const iStemCenterLocal = iGlyph.advanceWidth / 2 + (params.i_offsetX ?? 0);
  const dotCx = xs[4]! + iStemCenterLocal;
  // Dot diameter proportional to rendered i-stem width (post-erode equivalent
  // is approximate here since erode runs at SVG-px scale, not UPM — close
  // enough at preview scale).
  const dotR = (params.i_stemWidth / 2) * DEFAULTS.dotScale;
  const dotCy = params.i_height + dotR * DEFAULTS.dotGap;

  const padX = 60;
  const padY = 80;
  const viewBox = `${-padX} ${-padY - params.i_height - dotR * 3} ${totalAdvance + padX * 2} ${
    params.i_height + dotR * 3 + padY * 2
  }`;

  const filterId = `talkie-preview-thin-${Math.round(thinness * 100)}`;
  const dotColor = monotone ? BRAND.ink : BRAND.accent;

  return (
    <div
      className="h-full flex"
      // background '#0a0907' is the preview *canvas* (the dark stage the light
      // wordmark renders onto) — kept as a content artifact. Only the chrome
      // separator border is tokenized.
      style={{ background: '#0a0907', borderTop: `1px solid oklch(var(--border))` }}
    >
      {/* Preview canvas */}
      <div className="flex-1 flex items-center justify-center px-6 py-4 min-w-0">
        <svg
          viewBox={viewBox}
          style={{ width: '100%', maxHeight: '100%', height: 'auto' }}
        >
          {thinness > 0 && (
            <defs>
              <filter id={filterId} x="-2%" y="-2%" width="104%" height="104%">
                <feMorphology operator="erode" radius={thinness * 8} />
              </filter>
            </defs>
          )}
          <g transform="scale(1,-1)">
            <g filter={thinness > 0 ? `url(#${filterId})` : undefined}>
              {glyphPaths.map(({ char, d }) => (
                <path key={char} d={d} fill={BRAND.ink} />
              ))}
            </g>
            <circle cx={dotCx} cy={dotCy} r={dotR} fill={dotColor} />
          </g>
        </svg>
      </div>

      {/* Mini controls */}
      <div
        className="flex flex-col gap-3 px-5 py-4"
        style={{
          borderLeft: `1px solid oklch(var(--border))`,
          minWidth: 200,
          fontFamily: BRAND.mono,
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: 'oklch(var(--muted-foreground))',
          }}
        >
          · Consumer Preview
        </div>
        <MiniSlider label="squeeze" value={squeeze} min={0.78} max={1} step={0.01} onChange={setSqueeze} />
        <MiniSlider label="thinness" value={thinness} min={0} max={1.4} step={0.05} onChange={setThinness} />
        <button
          type="button"
          onClick={() => setMonotone((m) => !m)}
          style={{
            fontSize: 9,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            padding: '6px 10px',
            border: `1px solid ${monotone ? 'oklch(var(--foreground))' : 'oklch(var(--border))'}`,
            background: monotone ? 'oklch(var(--foreground) / 0.06)' : 'transparent',
            color: monotone ? 'oklch(var(--foreground))' : 'oklch(var(--muted-foreground))',
            cursor: 'pointer',
            borderRadius: 2,
            textAlign: 'left',
          }}
        >
          {monotone ? '● monotone on' : '○ monotone off'}
        </button>
        <div
          style={{
            fontSize: 8,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'oklch(var(--muted-foreground))',
            marginTop: 'auto',
          }}
        >
          Mirrors narrative-studio /squeeze-lab
        </div>
      </div>
    </div>
  );
}

function MiniSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-baseline justify-between"
        style={{
          fontSize: 9,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'oklch(var(--muted-foreground))',
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'oklch(var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: BRAND.accent }}
      />
    </div>
  );
}
