/**
 * TalkieStudio — wordmark design studio.
 * Live glyph manipulation with parameter controls, guides overlay,
 * draw mode for direct path editing, and localStorage persistence.
 */

// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { TalkieRender } from './TalkieRender';
import { TalkiePreview } from './TalkiePreview';
import { TalkieDrawMode } from './TalkieDrawMode';
import { TalkieProvider } from './TalkieContext';
import {
  setStockGlyphs, buildWordmark, setAllPathOverrides, getPathOverrides, clearPathOverride,
  migrateOverridesToZeroPadLeft, migrateParamsV1ToV2, migrateOverridesV1ToV2,
} from './glyphOps';
import { parseFontBuffer } from '../lib/parser';
import { useHeroApp } from '../hero/HeroAppContext';
import { decodeShareUrl, clearShareHash, encodeShareUrl } from './shareUrl';
import type { TalkieParams } from './types';
import { DEFAULT_PARAMS, BRAND } from './types';
import type { PathCommand } from '../types';

const STORAGE_KEY = 'talkie-studio';
// v1: legacy padLeft-baked overrides.
// v2: padLeft applied at the assembler; overrides stored in the padLeft=0 frame.
// v3: builders auto-center on advance/2; padLeft → offsetX rename; both params
//     and overrides migrated forward.
const STORAGE_VERSION = 3;

interface PersistedState {
  v?: number;
  params: any; // typed as TalkieParams after migration, may be v1/v2 on disk
  overrides: Record<string, PathCommand[]>;
}

function loadPersistedState(): { params: TalkieParams; overrides: Record<string, PathCommand[]> } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    const fromVersion = parsed.v ?? 1;
    let params = parsed.params;
    let overrides = parsed.overrides || {};

    // v1 → v2: bake padLeft out of override paths.
    if (fromVersion < 2 && overrides) {
      overrides = migrateOverridesToZeroPadLeft(overrides, params);
    }

    // v2 → v3: rename padLeft → offsetX and shift overrides for the new auto-centered builders.
    if (fromVersion < 3) {
      // Order matters: migrate overrides using v1/v2 params BEFORE param rename.
      overrides = migrateOverridesV1ToV2(overrides, params);
      params = migrateParamsV1ToV2(params);
    }

    return { params: params as TalkieParams, overrides };
  } catch {
    return null;
  }
}

function persistState(params: TalkieParams, overrides: Record<string, PathCommand[]>) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, params, overrides }),
    );
  } catch { /* noop */ }
}

export function TalkieStudio() {
  const [params, setParams] = useState<TalkieParams>(DEFAULT_PARAMS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawChar, setDrawChar] = useState<string | null>(null);
  const [pathOverridesVersion, setPathOverridesVersion] = useState(0);
  const metricsRef = useRef<{ ascender: number; descender: number; unitsPerEm: number } | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setTalkieDrawState, setTalkieControlsBridge } = useHeroApp();

  // Debounced persistence
  const schedulePersist = useCallback((p: TalkieParams) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistState(p, getPathOverrides());
    }, 500);
  }, []);

  // Load JBM Medium source glyphs on mount
  useEffect(() => {
    async function loadFont() {
      try {
        const res = await fetch('/hero/fonts/JetBrainsMono-Medium.ttf');
        if (!res.ok) throw new Error(`Failed to fetch font: ${res.status}`);
        const buffer = await res.arrayBuffer();
        const heroFont = parseFontBuffer(buffer, 'JetBrainsMono-Medium.ttf');

        metricsRef.current = heroFont.metrics;

        const chars = ['t', 'a', 'l', 'k', 'i', 'e'];
        const stock: Record<string, { path: any[]; advanceWidth: number }> = {};
        for (const ch of chars) {
          const glyph = heroFont.glyphs.find((g) => g.character === ch);
          if (glyph) {
            stock[ch] = { path: glyph.path, advanceWidth: glyph.advanceWidth };
          }
        }

        setStockGlyphs(stock);

        // Restore state: URL wins over localStorage. Always merge with
        // DEFAULT_PARAMS so newly-added keys get defaults (avoids undefined →
        // defined flips that turn controlled inputs uncontrolled on first render).
        // URL payloads may be v1/v2 (pre-rename, pre-auto-center). Run them
        // through migrateParamsV1ToV2 first so the rename + delta apply.
        const urlState = decodeShareUrl();
        if (urlState) {
          let urlParams: any = urlState.params;
          let urlOverrides = urlState.overrides || {};
          const urlVer = (urlParams as any).paramsVersion ?? 1;
          if (urlVer < 2) {
            urlOverrides = migrateOverridesV1ToV2(urlOverrides, urlParams);
            urlParams = migrateParamsV1ToV2(urlParams);
          }
          const merged = { ...DEFAULT_PARAMS, ...urlParams };
          setParams(merged);
          if (Object.keys(urlOverrides).length > 0) {
            setAllPathOverrides(urlOverrides);
            setPathOverridesVersion(v => v + 1);
          }
          clearShareHash();
          persistState(merged, urlOverrides);
        } else {
          const saved = loadPersistedState();
          if (saved) {
            setParams({ ...DEFAULT_PARAMS, ...saved.params });
            if (saved.overrides && Object.keys(saved.overrides).length > 0) {
              setAllPathOverrides(saved.overrides);
              setPathOverridesVersion(v => v + 1);
            }
          }
        }

        setLoaded(true);
      } catch (e: any) {
        console.error('Failed to load JBM Medium:', e);
        setError(e.message || 'Failed to load font');
      }
    }

    loadFont();
  }, []);

  const handleChange = useCallback((p: TalkieParams) => {
    setParams(p);
    schedulePersist(p);
  }, [schedulePersist]);

  const handleGlyphClick = useCallback((char: string) => {
    setDrawChar(char);
    const overrides = getPathOverrides();
    setTalkieDrawState({ char, hasPathOverride: !!overrides[char] });
  }, [setTalkieDrawState]);

  const handleDrawExit = useCallback(() => {
    setDrawChar(null);
    setTalkieDrawState(null);
    setPathOverridesVersion(v => v + 1);
    schedulePersist(params);
  }, [params, schedulePersist, setTalkieDrawState]);

  const handleDrawPathChange = useCallback((path: PathCommand[]) => {
    setPathOverridesVersion(v => v + 1);
    if (drawChar) {
      setTalkieDrawState({ char: drawChar, hasPathOverride: true });
    }
  }, [drawChar, setTalkieDrawState]);

  // ── Share: copy edit link to clipboard ──
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'copied-slim'>('idle');
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleShare = useCallback((includeOverrides: boolean) => {
    const url = encodeShareUrl(params, getPathOverrides(), includeOverrides);
    navigator.clipboard.writeText(url).then(() => {
      setShareStatus(includeOverrides ? 'copied' : 'copied-slim');
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => setShareStatus('idle'), 1500);
    }).catch(() => {
      // Fallback: no clipboard API
    });
  }, [params]);

  // ── Reset all: restore defaults, clear overrides, clear localStorage ──
  const handleResetAll = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    setAllPathOverrides({});
    setPathOverridesVersion(v => v + 1);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, []);

  // ── Reset single glyph: restore that glyph's params + clear its override ──
  const handleResetGlyph = useCallback((char: string) => {
    // Build a map of which DEFAULT_PARAMS keys belong to this glyph
    const prefix = char + '_';
    const resetted = { ...params };
    for (const key of Object.keys(DEFAULT_PARAMS) as (keyof TalkieParams)[]) {
      if (key.startsWith(prefix)) {
        (resetted as any)[key] = DEFAULT_PARAMS[key];
      }
    }
    resetted.preset = 'custom';
    setParams(resetted);
    clearPathOverride(char);
    setPathOverridesVersion(v => v + 1);
    if (drawChar === char) {
      setTalkieDrawState({ char, hasPathOverride: false });
    }
    schedulePersist(resetted);
  }, [params, drawChar, setTalkieDrawState, schedulePersist]);

  if (error) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: BRAND.canvas }}
      >
        <div className="text-center">
          <div
            className="text-[13px] mb-2"
            style={{ color: BRAND.accent, fontFamily: BRAND.mono }}
          >
            Font load error
          </div>
          <div
            className="text-[11px] max-w-xs"
            style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}
          >
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: BRAND.canvas }}
      >
        <div
          className="text-[11px]"
          style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}
        >
          Loading JetBrains Mono Medium...
        </div>
      </div>
    );
  }

  // Draw mode: render inline editor for the selected glyph with sibling context
  if (drawChar) {
    const glyphs = buildWordmark(params);
    const glyph = glyphs.find(g => g.char === drawChar);
    if (glyph) {
      return (
        <TalkieProvider params={params} onChange={handleChange} onResetAll={handleResetAll} onResetGlyph={handleResetGlyph}>
          <TalkieDrawMode
            char={drawChar}
            path={glyph.path}
            advanceWidth={glyph.advanceWidth}
            allGlyphs={glyphs}
            onExit={handleDrawExit}
            onPathChange={handleDrawPathChange}
          />
        </TalkieProvider>
      );
    }
  }

  return (
    <TalkieStudioInner
      params={params}
      onChange={handleChange}
      onResetAll={handleResetAll}
      onResetGlyph={handleResetGlyph}
      onShare={handleShare}
      shareStatus={shareStatus}
      pathOverridesVersion={pathOverridesVersion}
      metrics={metricsRef.current!}
      onGlyphClick={handleGlyphClick}
      setTalkieControlsBridge={setTalkieControlsBridge}
    />
  );
}

interface TalkieStudioInnerProps {
  params: TalkieParams;
  onChange: (p: TalkieParams) => void;
  onResetAll: () => void;
  onResetGlyph: (char: string) => void;
  onShare: (includeOverrides: boolean) => void;
  shareStatus: 'idle' | 'copied' | 'copied-slim';
  pathOverridesVersion: number;
  metrics: { ascender: number; descender: number; unitsPerEm: number };
  onGlyphClick: (char: string) => void;
  setTalkieControlsBridge: (b: any) => void;
}

function TalkieStudioInner({
  params, onChange, onResetAll, onResetGlyph, onShare, shareStatus,
  pathOverridesVersion, metrics, onGlyphClick, setTalkieControlsBridge,
}: TalkieStudioInnerProps) {
  // Publish controls bridge so the AppShell Inspector slot can render the
  // wordmark controls (consolidates the two-bar UI into one).
  useEffect(() => {
    setTalkieControlsBridge({ params, onChange, onResetAll, onResetGlyph, onShare, shareStatus });
    return () => setTalkieControlsBridge(null);
  }, [params, onChange, onResetAll, onResetGlyph, onShare, shareStatus, setTalkieControlsBridge]);

  return (
    <TalkieProvider params={params} onChange={onChange} onResetAll={onResetAll} onResetGlyph={onResetGlyph}>
      <div className="h-full flex flex-col" style={{ background: BRAND.canvas }}>
        <div className="flex-1 min-h-0">
          <TalkieRender
            params={params}
            metrics={metrics}
            onGlyphClick={onGlyphClick}
            key={pathOverridesVersion}
          />
        </div>
        <div style={{ height: 240, flexShrink: 0 }}>
          <TalkiePreview params={params} key={`preview-${pathOverridesVersion}`} />
        </div>
      </div>
    </TalkieProvider>
  );
}
