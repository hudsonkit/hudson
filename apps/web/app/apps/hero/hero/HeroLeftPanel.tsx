// @ts-nocheck
'use client';

import { createElement, useState } from 'react';
import { ParamSection } from 'hudsonkit/controls';
import { useLibrary } from '../library/LibraryProvider';
import { useHeroApp } from './HeroAppContext';
import type { DisplayOptions } from '../editor/components/DisplaySidebar';
import { libraryFontLabel, loadedFontLabel } from './labels';

const DISPLAY_TOGGLES: { key: keyof DisplayOptions; label: string; icon: string }[] = [
  { key: 'showPoints', label: 'Points', icon: '●' },
  { key: 'showHandles', label: 'Handles', icon: '◇' },
  { key: 'showTangents', label: 'Tangents', icon: '∠' },
  { key: 'showLabels', label: 'Labels', icon: 'Aa' },
  { key: 'showGuides', label: 'Guides', icon: '┄' },
  { key: 'showFill', label: 'Fill', icon: '▮' },
];

// Library samples are shown in their own typeface; faces load as the list renders.
function libraryFaceName(id: string) {
  return `hero-lib-${id.replace(/[^a-z0-9]/gi, '-')}`;
}

function LibraryFaces({ fonts }: { fonts: { id: string; sampleUrl?: string }[] }) {
  const css = fonts
    .filter((f) => f.sampleUrl)
    .map((f) => `@font-face{font-family:'${libraryFaceName(f.id)}';src:url('${f.sampleUrl}') format('truetype');font-display:swap;}`)
    .join('');
  return <style>{css}</style>;
}

export function HeroLeftPanel() {
  const { fonts, activeIndex, setActiveIndex, setView, handleOpenFromLibrary, handleRemoveFont, view, editorState, handleExitEditor } = useHeroApp();
  const library = useLibrary();

  // ── Editor mode ──
  if (view === 'editor' && editorState) {
    return (
      <div className="flex flex-col h-full text-[10px] px-3 py-1">
        <button
          onClick={handleExitEditor}
          className="flex items-center gap-1.5 px-2 py-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-[10px]"
        >
          <span>←</span>
          <span>Back to glyphs</span>
        </button>

        <ParamSection label="Display" defaultExpanded>
          <div className="space-y-0.5">
            {DISPLAY_TOGGLES.map((t) => (
              <button
                key={t.key}
                onClick={() =>
                  editorState.setDisplay({
                    ...editorState.display,
                    [t.key]: !editorState.display[t.key],
                  })
                }
                className={`
                  flex items-center gap-2.5 px-2 py-1.5 text-[10px] cursor-pointer transition-colors w-full text-left
                  ${editorState.display[t.key]
                    ? 'text-foreground bg-muted/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }
                `}
              >
                <span className="w-4 text-center text-xs opacity-70">{t.icon}</span>
                <span>{t.label}</span>
                <span className="ml-auto">
                  {editorState.display[t.key] ? (
                    <span className="text-accent">●</span>
                  ) : (
                    <span className="opacity-30">○</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </ParamSection>
      </div>
    );
  }

  // ── Wordmark / Font Studio work on Talkie's own outlines ──
  if (view === 'talkie' || view === 'talkie-font') {
    return (
      <div className="px-5 py-4 text-[10px] text-muted-foreground leading-relaxed">
        {view === 'talkie'
          ? 'Wordmark tunes the Talkie logotype letter by letter. Controls are on the right.'
          : 'Font Studio builds Talkie variants from JetBrains Mono. Pick a variant above the preview.'}
      </div>
    );
  }

  // ── Grid / Compare mode ──
  return (
    <div className="flex flex-col h-full text-[10px] px-3 py-1">
      {fonts.length > 0 && (
        <ParamSection label="Open" defaultExpanded>
          <div className="space-y-0.5">
            {fonts.map((f, i) => (
              <div
                key={i}
                className={`group flex items-center gap-1.5 px-2 py-1.5 transition-colors cursor-pointer ${
                  i === activeIndex
                    ? 'bg-muted/50 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
                onClick={() => {
                  setActiveIndex(i);
                  if (view !== 'compare' && view !== 'pick') setView('grid');
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: i === activeIndex ? 'hsl(var(--accent))' : 'transparent',
                    border: i === activeIndex ? 'none' : '1px solid hsl(var(--muted-foreground) / 0.3)',
                  }}
                />
                <span className="truncate flex-1">
                  {loadedFontLabel(f)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFont(i);
                  }}
                  aria-label="Close font"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </ParamSection>
      )}
      <LibraryFaces fonts={library.fonts} />
      <ParamSection label="Library" defaultExpanded>
        <div className="space-y-px">
          {library.isLoading ? (
            <div className="px-2 py-3 text-muted-foreground">Loading...</div>
          ) : (
            library.fonts.map((meta) => (
              <button
                key={meta.id}
                onClick={() => handleOpenFromLibrary(meta.id)}
                className="w-full text-left px-2 py-1.5 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-2"
              >
                <span
                  className="truncate text-[13px]"
                  style={meta.sampleUrl ? { fontFamily: `'${libraryFaceName(meta.id)}', var(--font-sans)` } : undefined}
                >
                  {libraryFontLabel(meta)}
                </span>
                {meta.glyphCount > 0 && (
                  <span className="ml-auto opacity-40 shrink-0">{meta.glyphCount}</span>
                )}
              </button>
            ))
          )}
        </div>
      </ParamSection>

    </div>
  );
}
