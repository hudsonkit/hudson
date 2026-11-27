'use client';

import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { usePersistentState, sounds } from 'hudsonkit';
import { layoutDocsCanvas } from './canvas-layout';
import { setMuted as setSoundMuted } from 'hudsonkit';
import { useEffect } from 'react';
import type { ComponentEntry, ViewMode, HudsonSettings } from './types';
import { COMPONENTS, AGENT_DOCS, DEFAULT_SETTINGS } from './data';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface DocsContextValue {
  // View
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;

  // Sheets
  openSheets: Set<string>;
  toggleSheet: (id: string) => void;
  closeSheet: (id: string) => void;
  closeAllSheets: () => void;

  // Selection
  selectedCard: string | null;
  setSelectedCard: (id: string | null) => void;

  // Search
  searchValue: string;
  setSearchValue: (v: string) => void;

  // Nav
  activeNav: string;
  setActiveNav: (id: string) => void;

  // Settings
  settings: HudsonSettings;
  updateSettings: (patch: Partial<HudsonSettings>) => void;
  resetSettings: () => void;

  // Sheet positions (canvas dragging)
  sheetPositions: Record<string, { x: number; y: number }>;
  getSheetPos: (id: string) => { x: number; y: number };
  /** Replace the open sheets with these (canvas view), selecting the first. */
  showSheets: (ids: string[]) => void;
  /** Scale that fits the auto-laid-out canvas into its frame (1 outside a window). */
  canvasScale: number;
  setCanvasFrame: (frame: { width: number; height: number } | null) => void;
  setHubHeight: (h: number) => void;
  handleSheetDragStart: (id: string, e: React.MouseEvent) => void;
  isDraggingRef: React.RefObject<boolean>;

  // Sound
  playSound: (name: 'click' | 'thock' | 'pop' | 'tick' | 'blipUp' | 'blipDown' | 'confirm' | 'error' | 'ping' | 'slideIn' | 'slideOut' | 'whoosh' | 'boot' | 'type') => void;
  handleToggleMute: () => void;

  // Data
  components: ComponentEntry[];
}

const DocsContext = createContext<DocsContextValue | null>(null);

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error('useDocs must be used within DocsProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const INITIAL_COMPONENT = 'status-bar';

export function DocsProvider({ children }: { children: ReactNode }) {
  // View mode
  const [viewMode, setViewMode] = usePersistentState<ViewMode>('hudson.viewMode', 'canvas');

  // Open component doc sheets
  // Open on one real component so the inspector and nav have something to show.
  const [openSheets, setOpenSheets] = useState<Set<string>>(() => new Set([INITIAL_COMPONENT]));

  // Selected card
  const [selectedCard, setSelectedCard] = useState<string | null>(INITIAL_COMPONENT);

  // Search
  const [searchValue, setSearchValue] = useState('');

  // Nav
  const [activeNav, setActiveNav] = useState('overview');

  // Settings
  const [settings, setSettings] = usePersistentState<HudsonSettings>('hudson.settings', DEFAULT_SETTINGS);

  // Sheet positions (canvas dragging)
  const [sheetPositions, setSheetPositions] = useState<Record<string, { x: number; y: number }>>({});
  const isDraggingRef = useRef(false);

  // Auto-layout: tile the hub and open sheets; fit them to the frame.
  const [canvasFrame, setCanvasFrame] = useState<{ width: number; height: number } | null>(null);
  const [hubHeight, setHubHeight] = useState(560);
  const openSheetIds = useMemo(
    () => [
      ...COMPONENTS.filter(c => openSheets.has(c.id)).map(c => c.id),
      ...AGENT_DOCS.filter(d => openSheets.has(`agent:${d.slug}`)).map(d => `agent:${d.slug}`),
    ],
    [openSheets],
  );
  const autoLayout = useMemo(
    () => layoutDocsCanvas(openSheetIds, canvasFrame, hubHeight),
    [openSheetIds, canvasFrame, hubHeight],
  );

  // Sync mute state to sound engine
  useEffect(() => { setSoundMuted(settings.masterMute); }, [settings.masterMute]);

  // Settings updater
  const updateSettings = useCallback((patch: Partial<HudsonSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, [setSettings]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, [setSettings]);

  // Sound wrapper that respects per-category toggles
  const playSound = useCallback((name: 'click' | 'thock' | 'pop' | 'tick' | 'blipUp' | 'blipDown' | 'confirm' | 'error' | 'ping' | 'slideIn' | 'slideOut' | 'whoosh' | 'boot' | 'type') => {
    if (settings.masterMute) return;
    const isTransition = name === 'slideIn' || name === 'slideOut' || name === 'whoosh' || name === 'boot';
    if (isTransition && !settings.uiTransitionSounds) return;
    if (!isTransition && !settings.uiClickSounds) return;
    sounds[name]();
  }, [settings.masterMute, settings.uiClickSounds, settings.uiTransitionSounds]);

  const handleToggleMute = useCallback(() => {
    const next = !settings.masterMute;
    updateSettings({ masterMute: next });
    if (!next) sounds.click();
  }, [settings.masterMute, updateSettings]);

  // Sheet operations
  const toggleSheet = useCallback((id: string) => {
    setOpenSheets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    playSound('click');
  }, [playSound]);

  const closeSheet = useCallback((id: string) => {
    setOpenSheets(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    playSound('thock');
  }, [playSound]);

  const closeAllSheets = useCallback(() => {
    setOpenSheets(new Set());
    playSound('thock');
  }, [playSound]);

  const showSheets = useCallback((ids: string[]) => {
    setViewMode('canvas');
    setOpenSheets(new Set(ids));
    setSheetPositions({});
    setSelectedCard(ids[0] ?? null);
    playSound('click');
  }, [setViewMode, playSound]);

  // Get sheet position (overridden or default) — works for both component and agent doc IDs
  const getSheetPos = useCallback((id: string) => {
    if (sheetPositions[id]) return sheetPositions[id];
    if (autoLayout.positions[id]) return autoLayout.positions[id];
    if (id.startsWith('agent:')) {
      const slug = id.slice(6);
      const doc = AGENT_DOCS.find(d => d.slug === slug);
      return doc?.position ?? { x: 0, y: 0 };
    }
    const comp = COMPONENTS.find(c => c.id === id);
    return comp?.position ?? { x: 0, y: 0 };
  }, [sheetPositions, autoLayout]);

  // Drag handler
  const handleSheetDragStart = useCallback((id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    e.stopPropagation();

    setSelectedCard(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = getSheetPos(id);
    let dragged = false;

    // Read current CSS zoom from the world layer.
    // The zoom is applied two levels above [data-hudson-world]: zoom-div > pan-div > world-div
    const worldEl = document.querySelector('[data-hudson-world]');
    const zoomEl = worldEl?.parentElement?.parentElement;
    const currentScale = zoomEl ? parseFloat(zoomEl.style.zoom || '1') : 1;
    const fitScale = autoLayout.scale;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragged && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dragged = true;
      isDraggingRef.current = true;

      setSheetPositions(prev => ({
        ...prev,
        [id]: {
          x: startPos.x + dx / (currentScale * fitScale),
          y: startPos.y + dy / (currentScale * fitScale),
        },
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setTimeout(() => { isDraggingRef.current = false; }, 0);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [getSheetPos, autoLayout.scale]);

  const value = useMemo<DocsContextValue>(() => ({
    viewMode, setViewMode,
    openSheets, toggleSheet, closeSheet, closeAllSheets,
    selectedCard, setSelectedCard,
    searchValue, setSearchValue,
    activeNav, setActiveNav,
    settings, updateSettings, resetSettings,
    sheetPositions, getSheetPos, showSheets, handleSheetDragStart, isDraggingRef,
    canvasScale: autoLayout.scale, setCanvasFrame, setHubHeight,
    playSound, handleToggleMute,
    components: COMPONENTS,
  }), [
    viewMode, setViewMode, openSheets, toggleSheet, closeSheet, closeAllSheets,
    selectedCard, searchValue, activeNav, settings, updateSettings, resetSettings,
    sheetPositions, getSheetPos, handleSheetDragStart, playSound, handleToggleMute,
    autoLayout.scale, showSheets,
  ]);

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}
