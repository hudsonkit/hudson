// @ts-nocheck
'use client';

import { useCallback } from 'react';
import { useHeroApp } from './HeroAppContext';
import { pathToSvgD, glyphViewBox } from '../lib/svg';

/**
 * Port output hook for Hero.
 * Emits the selected glyph as a normalized 512x512 SVG string.
 */
export function useHeroPortOutput() {
  const { selectedGlyph, activeFont } = useHeroApp();

  return useCallback((portId: string): unknown | null => {
    if (portId !== 'glyph-svg') return null;
    if (!selectedGlyph || !activeFont) return null;

    const d = pathToSvgD(selectedGlyph.path);
    if (!d) return null;

    const metrics = activeFont.font.metrics;
    const [vx, vy, vw, vh] = glyphViewBox(selectedGlyph, metrics);

    // Emit as a self-contained SVG normalized to a square viewBox
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}">
  <g transform="scale(1,-1)">
    <path d="${d}" fill="currentColor" />
  </g>
</svg>`;
  }, [selectedGlyph, activeFont]);
}
