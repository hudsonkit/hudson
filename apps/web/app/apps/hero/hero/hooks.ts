// @ts-nocheck
'use client';

import { createElement, useCallback, useMemo } from 'react';
import type { CommandOption, SearchConfig, StatusColor } from 'hudsonkit';
import { useHeroApp } from './HeroAppContext';
import { useSession } from '../session/SessionProvider';

// ── useCommands ──────────────────────────────────────────────────────

export function useHeroCommands(): CommandOption[] {
  const {
    setView,
    handleImportFont,
    handleStartSession,
    activeFont,
    selectedGlyph,
    handleEditGlyph,
  } = useHeroApp();
  const { session, closeSession, exportSessionFile, exportFontJSON } =
    useSession();

  return useMemo(() => {
    const cmds: CommandOption[] = [
      {
        id: 'hero:view:grid',
        label: 'Grid View',
        action: () => setView('grid'),
        shortcut: 'Cmd+1',
      },
      {
        id: 'hero:view:compare',
        label: 'Compare View',
        action: () => setView('compare'),
        shortcut: 'Cmd+2',
      },
      {
        id: 'hero:view:talkie',
        label: 'Talkie Studio',
        action: () => setView('talkie'),
        shortcut: 'Cmd+3',
      },
      {
        id: 'hero:view:talkie-font',
        label: 'Font Studio',
        action: () => setView('talkie-font'),
        shortcut: 'Cmd+4',
      },
      {
        id: 'hero:import-font',
        label: 'Import Font',
        action: handleImportFont,
        shortcut: 'Cmd+O',
      },
    ];

    if (activeFont && !session) {
      cmds.push({
        id: 'hero:start-session',
        label: 'Start Editing Session',
        action: handleStartSession,
      });
    }

    if (session) {
      cmds.push(
        {
          id: 'hero:export-hero',
          label: 'Export .hero File',
          action: exportSessionFile,
          shortcut: 'Cmd+S',
        },
        {
          id: 'hero:export-json',
          label: 'Export Font JSON',
          action: exportFontJSON,
          shortcut: 'Cmd+Shift+S',
        },
        {
          id: 'hero:close-session',
          label: 'Close Session',
          action: closeSession,
        },
      );
    }

    if (session && selectedGlyph) {
      cmds.push({
        id: 'hero:edit-glyph',
        label: `Edit Glyph "${selectedGlyph.character ?? selectedGlyph.name ?? '#' + selectedGlyph.index}"`,
        action: () => handleEditGlyph(selectedGlyph),
        shortcut: 'Enter',
      });
    }

    return cmds;
  }, [
    setView,
    handleImportFont,
    handleStartSession,
    activeFont,
    session,
    selectedGlyph,
    handleEditGlyph,
    closeSession,
    exportSessionFile,
    exportFontJSON,
  ]);
}

// ── useStatus ────────────────────────────────────────────────────────

export function useHeroStatus(): { label: string; color: StatusColor } {
  const { session, saveStatus } = useSession();
  const { fonts, view } = useHeroApp();

  if (!session) {
    if (fonts.length === 0) return { label: 'No font', color: 'neutral' };
    return { label: `${fonts.length} font${fonts.length > 1 ? 's' : ''} loaded`, color: 'neutral' };
  }

  switch (saveStatus) {
    case 'saved':
      return { label: 'Saved', color: 'emerald' };
    case 'saving':
      return { label: 'Saving...', color: 'amber' };
    case 'unsaved':
      return { label: 'Unsaved', color: 'amber' };
  }
}

// ── useSearch ────────────────────────────────────────────────────────

export function useHeroSearch(): SearchConfig {
  const { glyphSearch, setGlyphSearch } = useHeroApp();

  return useMemo(
    () => ({
      value: glyphSearch,
      onChange: setGlyphSearch,
      placeholder: 'Search glyphs...',
    }),
    [glyphSearch, setGlyphSearch],
  );
}

// ── useNavCenter ─────────────────────────────────────────────────────

// Hero's views live in its own bar above the content (HeroViewBar), so the
// shell's nav keeps its workspace tabs to itself.
export function useHeroNavCenter(): React.ReactNode | null {
  return null;
}

// ── useNavActions ────────────────────────────────────────────────────

const NAV_BUTTON =
  'px-2.5 py-1 text-[11px] cursor-pointer text-muted-foreground hover:text-foreground transition-colors';

export function useHeroNavActions(): React.ReactNode | null {
  const { view, handleImportFont } = useHeroApp();
  const { session, exportSessionFile } = useSession();

  if (view === 'editor') return null;

  return createElement(
    'div',
    { className: 'flex items-center gap-1' },
    session &&
      createElement('button', { key: 'export', onClick: exportSessionFile, className: NAV_BUTTON }, 'Export'),
    createElement('button', { key: 'import', onClick: handleImportFont, className: NAV_BUTTON }, 'Import font'),
  );
}

// ── useLayoutMode ────────────────────────────────────────────────────

export function useHeroLayoutMode(): 'canvas' | 'panel' {
  return 'panel';
}
