// @ts-nocheck
'use client';

import { useHeroApp } from './HeroAppContext';
import { useSession } from '../session/SessionProvider';

export function HeroLeftFooter() {
  const { activeFont, fonts, view } = useHeroApp();
  const { session } = useSession();

  if (!activeFont) return null;

  const { font } = activeFont;
  const editCount = session
    ? Object.keys(session.glyphEdits).length
    : 0;

  return (
    <div className="px-3 py-2 text-[9px] text-muted-foreground space-y-0.5 font-mono tabular-nums">
      <div className="flex justify-between">
        <span>{font.glyphCount} glyphs</span>
        <span>{font.metrics.unitsPerEm} UPM</span>
      </div>
      {session && editCount > 0 && (
        <div className="flex justify-between">
          <span>{editCount} edited</span>
          <span>{view}</span>
        </div>
      )}
      {fonts.length > 1 && (
        <div className="text-muted-foreground/70">
          {fonts.length} fonts loaded
        </div>
      )}
    </div>
  );
}
