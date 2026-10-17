// @ts-nocheck
'use client';

import { useState, useCallback } from 'react';
import { GlyphGrid } from '../components/GlyphGrid';
import { FontComparison } from '../components/FontComparison';
import { GlyphEditorView } from '../editor/GlyphEditorView';
import { TalkieStudio } from '../talkie/TalkieStudio';
import { FontStudio } from '../talkie-font/FontStudio';
import { useHeroApp } from './HeroAppContext';
import { useLibrary } from '../library/LibraryProvider';
import { libraryFontLabel, loadedFontLabel } from './labels';

// ---------------------------------------------------------------------------
// Empty State — inline font loading so Hero works without sidebar
// ---------------------------------------------------------------------------

function EmptyState() {
  const { handleImportFont, handleOpenFromLibrary } = useHeroApp();
  const library = useLibrary();
  const [loading, setLoading] = useState<string | null>(null);

  const openFont = useCallback(async (id: string) => {
    setLoading(id);
    try { await handleOpenFromLibrary(id); } finally { setLoading(null); }
  }, [handleOpenFromLibrary]);

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-[13px] text-foreground mb-1">Open a font</div>
        <div className="text-[11px] text-muted-foreground mb-4">
          Pick one from the library, or{' '}
          <button onClick={handleImportFont} className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground cursor-pointer">
            import a file
          </button>
          .
        </div>
        <div className="border-t border-border">
          {library.fonts.map((f) => (
            <button
              key={f.id}
              onClick={() => openFont(f.id)}
              disabled={loading !== null}
              className="w-full flex items-center justify-between px-1 py-2 border-b border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer disabled:opacity-40"
            >
              <span className="truncate">{libraryFontLabel(f)}</span>
              <span className="text-[10px] font-mono">{loading === f.id ? 'opening…' : '→'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Content Router
// ---------------------------------------------------------------------------

const VIEW_TABS = [
  { id: 'grid', label: 'Glyphs' },
  { id: 'compare', label: 'Compare' },
  { id: 'talkie', label: 'Wordmark' },
  { id: 'talkie-font', label: 'Font Studio' },
] as const;

const VIEW_HINTS: Record<string, string> = {
  grid: 'Type a key to jump · double-click to edit',
  compare: 'Same text, every loaded font',
  talkie: 'Tune the wordmark letter by letter',
  'talkie-font': 'Variants of Talkie built from JetBrains Mono',
};

function HeroViewBar() {
  const { view, setView, activeFont } = useHeroApp();
  const fontViews = view === 'grid';

  return (
    <div className="h-10 shrink-0 flex items-stretch gap-5 px-4 border-b border-border">
      {VIEW_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          className={`-mb-px border-b text-[11px] tracking-wide transition-colors cursor-pointer ${
            view === t.id
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground min-w-0">
        {fontViews && activeFont && (
          <span className="text-foreground truncate">{loadedFontLabel(activeFont)}</span>
        )}
        <span className="truncate">{VIEW_HINTS[view]}</span>
      </div>
    </div>
  );
}

export function HeroContent() {
  const {
    view,
    fonts,
    activeFont,
    selectedGlyph,
    setSelectedGlyph,
    editingGlyph,
    glyphSearch,
    handleEditGlyph,
    handleExitEditor,
    handleOpenFromLibrary,
  } = useHeroApp();

  return (
    <div className="h-full flex flex-col relative">
      {view !== 'editor' && <HeroViewBar />}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'talkie' ? (
          <TalkieStudio />
        ) : view === 'talkie-font' ? (
          <FontStudio />
        ) : view === 'editor' && editingGlyph && activeFont ? (
          <GlyphEditorView
            glyph={editingGlyph}
            metrics={activeFont.font.metrics}
            onExit={handleExitEditor}
          />
        ) : view === 'grid' && activeFont ? (
          <div className="px-4 pt-3 h-full">
            <GlyphGrid
              font={activeFont.font}
              selectedIndex={selectedGlyph?.index ?? null}
              onSelectGlyph={setSelectedGlyph}
              onEditGlyph={handleEditGlyph}
              externalSearch={glyphSearch}
            />
          </div>
        ) : view === 'compare' ? (
          <div className="p-4 h-full">
            <FontComparison
              fonts={fonts}
              onAddFromLibrary={handleOpenFromLibrary}
            />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
