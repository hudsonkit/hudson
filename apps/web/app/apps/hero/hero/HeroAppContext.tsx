// @ts-nocheck
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { HeroFont, HeroGlyph, LoadedFont } from '../types';
import type { EditableContour, SelectedPoint } from '../editor/types';
import type { DisplayOptions } from '../editor/components/DisplaySidebar';
import { parseFontBuffer } from '../lib/parser';
import { useSession } from '../session/SessionProvider';
import { useLibrary } from '../library/LibraryProvider';

type HeroView = 'grid' | 'compare' | 'pick' | 'editor' | 'talkie' | 'talkie-font';

export interface EditorState {
  contours: EditableContour[];
  selectedPoint: SelectedPoint | null;
  smoothStates: Record<string, boolean>;
  display: DisplayOptions;
  setDisplay: (d: DisplayOptions) => void;
}

export interface TalkieDrawState {
  char: string;
  hasPathOverride: boolean;
}

/**
 * Bridge that lets TalkieStudio (Content slot) expose its controls to the
 * Inspector slot. Without this, the two slots are siblings under HeroProvider
 * and can't share a TalkieContext.
 */
export interface TalkieControlsBridge {
  params: import('../talkie/types').TalkieParams;
  onChange: (p: import('../talkie/types').TalkieParams) => void;
  onResetAll: () => void;
  onResetGlyph: (char: string) => void;
  onShare: (includeOverrides: boolean) => void;
  shareStatus: 'idle' | 'copied' | 'copied-slim';
}

export interface HeroAppContextValue {
  view: HeroView;
  setView: (v: HeroView) => void;
  fonts: LoadedFont[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  activeFont: LoadedFont | undefined;
  selectedGlyph: HeroGlyph | null;
  setSelectedGlyph: (g: HeroGlyph | null) => void;
  editingGlyph: HeroGlyph | null;
  glyphSearch: string;
  setGlyphSearch: (s: string) => void;
  handleFontLoaded: (font: HeroFont, fileName: string) => void;
  handleRemoveFont: (index: number) => void;
  handleOpenFromLibrary: (id: string) => Promise<void>;
  handleStartSession: () => void;
  handleEditGlyph: (glyph: HeroGlyph) => void;
  handleExitEditor: () => void;
  handleImportFont: () => void;
  editorState: EditorState | null;
  setEditorState: (s: EditorState) => void;
  clearEditorState: () => void;
  talkieDrawState: TalkieDrawState | null;
  setTalkieDrawState: (s: TalkieDrawState | null) => void;
  talkieControlsBridge: TalkieControlsBridge | null;
  setTalkieControlsBridge: (b: TalkieControlsBridge | null) => void;
}

const HeroAppContext = createContext<HeroAppContextValue | null>(null);

export function useHeroApp() {
  const ctx = useContext(HeroAppContext);
  if (!ctx) throw new Error('useHeroApp must be used within HeroAppProvider');
  return ctx;
}

// Simple persistence helpers
function loadStored<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`hero.${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function storeValue(key: string, value: unknown) {
  try { localStorage.setItem(`hero.${key}`, JSON.stringify(value)); } catch { /* noop */ }
}

export function HeroAppProvider({ children }: { children: React.ReactNode }) {
  const [fonts, setFonts] = useState<LoadedFont[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedGlyph, setSelectedGlyph] = useState<HeroGlyph | null>(null);
  const [view, setView] = useState<HeroView>('grid');
  // Restore persisted view after mount (avoids SSR hydration mismatch)
  const viewRestored = useRef(false);
  useEffect(() => {
    if (viewRestored.current) return;
    viewRestored.current = true;
    const saved = loadStored<HeroView>('view', 'grid');
    // Pick folded into the glyph grid (type a key to jump).
    if (saved !== 'grid' && saved !== 'pick') setView(saved);
  }, []);
  const [editingGlyph, setEditingGlyph] = useState<HeroGlyph | null>(null);
  const [glyphSearch, setGlyphSearch] = useState('');
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [talkieDrawState, setTalkieDrawState] = useState<TalkieDrawState | null>(null);
  const [talkieControlsBridge, setTalkieControlsBridge] = useState<TalkieControlsBridge | null>(null);
  const storedGlyphChar = useRef<string | null>(loadStored('selectedChar', null));
  const clearEditorState = useCallback(() => setEditorState(null), []);

  const sessionFontIndexRef = useRef<number>(0);

  const { session, createSession } = useSession();
  const library = useLibrary();

  // Persist view and glyph selection
  const wrappedSetView = useCallback((v: HeroView) => {
    setView(v);
    storeValue('view', v);
  }, []);
  const wrappedSetSelectedGlyph = useCallback((g: HeroGlyph | null) => {
    setSelectedGlyph(g);
    if (g?.character) storeValue('selectedChar', g.character);
  }, []);

  const handleFontLoaded = useCallback((font: HeroFont, fileName: string) => {
    setFonts((prev) => {
      const next = [...prev, { font, fileName }];
      setActiveIndex(next.length - 1);
      // Restore previously selected glyph character
      const savedChar = storedGlyphChar.current;
      if (savedChar) {
        const glyph = font.glyphs.find((g: HeroGlyph) => g.character === savedChar);
        if (glyph) setSelectedGlyph(glyph);
      }
      return next;
    });
  }, []);

  const handleRemoveFont = useCallback((index: number) => {
    setFonts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setActiveIndex(0);
      } else {
        setActiveIndex((ai) => Math.min(ai, next.length - 1));
      }
      return next;
    });
  }, []);

  const handleOpenFromLibrary = useCallback(
    async (id: string) => {
      try {
        const { font, fileName } = await library.openFont(id);
        handleFontLoaded(font, fileName);
        // Stay in Compare; leave the editor and studios for the glyphs.
        setView((v) => (v === 'compare' || v === 'pick' || v === 'grid' ? v : 'grid'));
      } catch (e) {
        console.error('Failed to open font:', e);
      }
    },
    [library, handleFontLoaded],
  );

  // activeFont always respects the user's font selection
  const activeFont = fonts[activeIndex];

  // Land on a font: open the first library font when nothing else is loaded.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || library.isLoading || session) return;
    if (fonts.length > 0 || library.fonts.length === 0) return;
    autoOpened.current = true;
    const first = library.fonts.find((f) => f.familyName === 'Inter') ?? library.fonts[0];
    library.openFont(first.id).then(({ font, fileName }) => handleFontLoaded(font, fileName)).catch(() => {});
  }, [library, fonts.length, session, handleFontLoaded]);

  // Hydrate fonts array when session restores from IndexedDB
  useEffect(() => {
    if (!session) return;
    if (fonts.length === 0) {
      setFonts([{ font: session.font, fileName: session.source.fileName }]);
      setActiveIndex(0);
      sessionFontIndexRef.current = 0;
    } else if (!fonts.some((f) => f.fileName === session.source.fileName)) {
      // A restored session arrived after the landing font opened.
      sessionFontIndexRef.current = fonts.length;
      setFonts((prev) => [...prev, { font: session.font, fileName: session.source.fileName }]);
      setActiveIndex(fonts.length);
    }
  }, [session]);

  // Sync session font edits back to the session's slot in the fonts array
  useEffect(() => {
    if (session && fonts.length > 0) {
      const idx = sessionFontIndexRef.current;
      setFonts((prev) =>
        prev.map((f, i) =>
          i === idx ? { ...f, font: session.font } : f,
        ),
      );
    }
  }, [session?.font]);

  const handleStartSession = useCallback(() => {
    if (activeFont) {
      sessionFontIndexRef.current = activeIndex;
      createSession(activeFont.font, activeFont.fileName);
    }
  }, [activeFont, activeIndex, createSession]);

  // Editing opens a session on the active font, so a double-click is all it takes.
  const handleEditGlyph = useCallback(
    (glyph: HeroGlyph) => {
      if (!session) {
        if (!activeFont) return;
        sessionFontIndexRef.current = activeIndex;
        createSession(activeFont.font, activeFont.fileName);
      }
      setEditingGlyph(glyph);
      setView('editor');
    },
    [session, activeFont, activeIndex, createSession],
  );

  const handleExitEditor = useCallback(() => {
    setEditingGlyph(null);
    setView('grid');
  }, []);

  const handleImportFont = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.ttf,.otf,.woff,.woff2';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.name.toLowerCase().endsWith('.json')) {
          const text = await file.text();
          const font: HeroFont = JSON.parse(text);
          if (!font.glyphs || !font.metrics) throw new Error('Invalid');
          handleFontLoaded(font, file.name);
        } else {
          const buffer = await file.arrayBuffer();
          await library.addFont(buffer, file.name);
          const font = parseFontBuffer(buffer, file.name);
          handleFontLoaded(font, file.name);
        }
      } catch (e) {
        console.error('Failed to load font:', e);
      }
    };
    input.click();
  }, [handleFontLoaded, library]);

  // Keyboard navigation for glyph detail
  useEffect(() => {
    if (!selectedGlyph || !activeFont) return;
    const handler = (e: KeyboardEvent) => {
      const glyphs = activeFont.font.glyphs;
      const idx = glyphs.findIndex((g) => g.index === selectedGlyph.index);
      if (idx === -1) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = glyphs[idx + 1];
        if (next) setSelectedGlyph(next);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = glyphs[idx - 1];
        if (prev) setSelectedGlyph(prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedGlyph, activeFont]);

  return (
    <HeroAppContext.Provider
      value={{
        view,
        setView: wrappedSetView,
        fonts,
        activeIndex,
        setActiveIndex,
        activeFont,
        selectedGlyph,
        setSelectedGlyph: wrappedSetSelectedGlyph,
        editingGlyph,
        glyphSearch,
        setGlyphSearch,
        handleFontLoaded,
        handleRemoveFont,
        handleOpenFromLibrary,
        handleStartSession,
        handleEditGlyph,
        handleExitEditor,
        handleImportFont,
        editorState,
        setEditorState,
        clearEditorState,
        talkieDrawState,
        setTalkieDrawState,
        talkieControlsBridge,
        setTalkieControlsBridge,
      }}
    >
      {children}
    </HeroAppContext.Provider>
  );
}
