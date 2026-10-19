'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULTS,
  DISPLAY_FONTS,
  BODY_FONTS,
  MONO_FONTS,
  ACCENTS,
  PAPERS,
  PRESETS,
  STUDIO_COOKIE,
  type StudioState,
  type Preset,
} from '@/marketing/theme/defaults';
import { useStudio } from '@/marketing/theme/StudioContext';

function applyVars(target: HTMLElement, vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    target.style.setProperty(k, v);
  }
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writeStudioCookie(state: StudioState) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${STUDIO_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export function StudioConsole() {
  const [open, setOpen] = useState(false);
  // The tuner is a design tool, not a visitor feature: its button only shows
  // in dev or with ?tune in the URL. The effect below still applies the theme.
  const [tunable, setTunable] = useState(false);
  useEffect(() => {
    setTunable(
      process.env.NODE_ENV === 'development' ||
        new URLSearchParams(window.location.search).has('tune'),
    );
  }, []);
  const { state, setState, set, reset, hydrated } = useStudio();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.hudson-site');
    if (!root) return;

    const display = DISPLAY_FONTS.find((f) => f.id === state.display) ?? DISPLAY_FONTS[0];
    const body = BODY_FONTS.find((f) => f.id === state.body) ?? BODY_FONTS[0];
    const mono = MONO_FONTS.find((f) => f.id === state.mono) ?? MONO_FONTS[0];
    const accent = ACCENTS.find((a) => a.id === state.accent) ?? ACCENTS[0];
    const paper = PAPERS.find((p) => p.id === state.paper) ?? PAPERS[0];

    applyVars(root, paper.vars);
    applyVars(root, accent.vars);
    root.setAttribute('data-paper', paper.id);
    applyVars(root, {
      '--font-display': display.cssValue,
      '--font-body': body.cssValue,
      '--font-mono': mono.cssValue,
      '--font-weight-body': String(state.bodyWeight ?? DEFAULTS.bodyWeight),
      '--grid-opacity-minor': String(state.gridMinor),
      '--grid-opacity-major': String(state.gridMajor),
      '--stroke-w': `${state.strokeW ?? DEFAULTS.strokeW}px`,
      '--radius-ui': `${state.radiusUI ?? DEFAULTS.radiusUI}px`,
      '--radius-card': `${state.radiusCard ?? DEFAULTS.radiusCard}px`,
    });

    root.classList.toggle('snap', state.snap);
    root.classList.toggle('grain', state.grain);

    window.dispatchEvent(new CustomEvent('hudson:theme-change'));

    window.__hudAudio?.setEnabled?.(state.audio);
    window.__hudAudio?.setCategory?.('ui', state.audioUI);
    window.__hudAudio?.setCategory?.('count', state.audioCount);
    window.__hudAudio?.setCategory?.('type', state.audioType);
    window.__hudAudio?.setCategory?.('page', state.audioPage);

    if (hydrated) {
      // The theme-boot script in <head> injects a !important style rule for
      // first-paint correctness; once we're hydrated and applying inline
      // element styles ourselves, strip it so Studio Console toggles take effect.
      const boot = document.getElementById('hudson-theme-boot');
      if (boot) boot.remove();
      writeStudioCookie(state);
    }
  }, [state, hydrated]);

  function applyPreset(preset: Preset) {
    setState(preset.patch);
    window.__hudAudio?.whoosh?.({ cat: 'ui' });
  }

  if (!open) {
    if (!tunable) return null;
    return (
      <div className="studio-console">
        <button
          className="studio-console__toggle"
          onClick={() => setOpen(true)}
          aria-label="Open studio console"
        >
          <span className="dot" />
          STUDIO
        </button>
      </div>
    );
  }

  return (
    <div className="studio-console">
      <div className="studio-console__panel" role="dialog" aria-label="Studio Console">
        <div className="studio-console__head">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="26" height="26" stroke="currentColor" strokeWidth="1.5" />
              <rect
                x="9"
                y="9"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.5"
              />
              <rect x="13" y="13" width="6" height="6" fill="currentColor" />
            </svg>
            STUDIO CONSOLE
          </span>
          <button
            className="studio-console__close"
            onClick={() => setOpen(false)}
            aria-label="Close studio console"
          >
            ✕
          </button>
        </div>

        <div className="studio-console__body">
          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Theme</span>
              <span className="meta">preset bundles</span>
            </div>
            <div className="studio-console__chips">
              {PRESETS.map((p) => {
                const active = Object.entries(p.patch).every(
                  ([k, v]) => state[k as keyof StudioState] === v,
                );
                return (
                  <button
                    key={p.id}
                    className="studio-console__chip"
                    aria-pressed={active}
                    onClick={() => applyPreset(p)}
                    title={p.hint}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Effects</span>
              <span className="meta">scroll · grain · sound</span>
            </div>
            <div className="studio-console__chips">
              <button
                className="studio-console__chip"
                aria-pressed={state.snap}
                onClick={() => set('snap', !state.snap)}
              >
                Snap
              </button>
              <button
                className="studio-console__chip"
                aria-pressed={state.grain}
                onClick={() => set('grain', !state.grain)}
              >
                Grain
              </button>
              <button
                className="studio-console__chip"
                aria-pressed={state.audio}
                onClick={() => set('audio', !state.audio)}
              >
                Sound
              </button>
            </div>
            {state.audio && (
              <div className="studio-console__chips" style={{ marginTop: 6 }}>
                <button
                  className="studio-console__chip"
                  aria-pressed={state.audioUI}
                  onClick={() => set('audioUI', !state.audioUI)}
                  title="Button clicks · UI feedback"
                >
                  · UI
                </button>
                <button
                  className="studio-console__chip"
                  aria-pressed={state.audioCount}
                  onClick={() => set('audioCount', !state.audioCount)}
                  title="Number count-ups in hero stats"
                >
                  · Counts
                </button>
                <button
                  className="studio-console__chip"
                  aria-pressed={state.audioType}
                  onClick={() => set('audioType', !state.audioType)}
                  title="Typewriter effect on ship block"
                >
                  · Type
                </button>
                <button
                  className="studio-console__chip"
                  aria-pressed={state.audioPage}
                  onClick={() => set('audioPage', !state.audioPage)}
                  title="Sheet flips · preset whoosh"
                >
                  · Pages
                </button>
              </div>
            )}
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Display</span>
              <span className="meta">headlines · h-display</span>
            </div>
            <div className="studio-console__chips">
              {DISPLAY_FONTS.map((f) => (
                <button
                  key={f.id}
                  className="studio-console__chip"
                  aria-pressed={state.display === f.id}
                  onClick={() => set('display', f.id)}
                  style={{ fontFamily: f.cssValue, letterSpacing: '0.02em', textTransform: 'none' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Body</span>
              <span className="meta">subhead · paragraphs</span>
            </div>
            <div className="studio-console__chips">
              {BODY_FONTS.map((f) => (
                <button
                  key={f.id}
                  className="studio-console__chip"
                  aria-pressed={state.body === f.id}
                  onClick={() => set('body', f.id)}
                  style={{ fontFamily: f.cssValue, letterSpacing: '0.02em', textTransform: 'none' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Mono</span>
              <span className="meta">labels · code · spec</span>
            </div>
            <div className="studio-console__chips">
              {MONO_FONTS.map((f) => (
                <button
                  key={f.id}
                  className="studio-console__chip"
                  aria-pressed={state.mono === f.id}
                  onClick={() => set('mono', f.id)}
                  style={{ fontFamily: f.cssValue, letterSpacing: '0.02em', textTransform: 'none' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Accent</span>
              <span className="meta">links · ticks · live</span>
            </div>
            <div className="studio-console__chips">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className="studio-console__chip"
                  aria-pressed={state.accent === a.id}
                  onClick={() => set('accent', a.id)}
                >
                  <span className="swatch" style={{ background: a.swatch }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Paper</span>
              <span className="meta">sheet · ink</span>
            </div>
            <div className="studio-console__chips">
              {PAPERS.map((p) => (
                <button
                  key={p.id}
                  className="studio-console__chip"
                  aria-pressed={state.paper === p.id}
                  onClick={() => set('paper', p.id)}
                >
                  <span className="swatch" style={{ background: p.swatch }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Line</span>
              <span className="meta">{(state.strokeW ?? DEFAULTS.strokeW).toFixed(2)} px stroke</span>
            </div>
            <div className="studio-console__row">
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
                WEIGHT
              </span>
              <input
                aria-label="Line weight"
                type="range"
                min={0.5}
                max={3}
                step={0.25}
                value={state.strokeW ?? DEFAULTS.strokeW}
                onChange={(e) => set('strokeW', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Radius</span>
              <span className="meta">UI · cards</span>
            </div>
            <div className="studio-console__row">
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
                UI · {state.radiusUI ?? DEFAULTS.radiusUI}
              </span>
              <input
                aria-label="UI radius"
                type="range"
                min={0}
                max={10}
                step={1}
                value={state.radiusUI ?? DEFAULTS.radiusUI}
                onChange={(e) => set('radiusUI', Number(e.target.value))}
              />
            </div>
            <div className="studio-console__row">
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
                CARD · {state.radiusCard ?? DEFAULTS.radiusCard}
              </span>
              <input
                aria-label="Card radius"
                type="range"
                min={0}
                max={16}
                step={1}
                value={state.radiusCard ?? DEFAULTS.radiusCard}
                onChange={(e) => set('radiusCard', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Body weight</span>
              <span className="meta">{state.bodyWeight ?? DEFAULTS.bodyWeight}</span>
            </div>
            <div className="studio-console__row">
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
                WEIGHT
              </span>
              <input
                aria-label="Body weight"
                type="range"
                min={300}
                max={700}
                step={100}
                value={state.bodyWeight ?? DEFAULTS.bodyWeight}
                onChange={(e) => set('bodyWeight', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="studio-console__group">
            <div className="studio-console__label">
              <span>Grid</span>
              <span className="meta">12 / 72 px</span>
            </div>
            <div className="studio-console__row">
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
                MINOR
              </span>
              <input
                aria-label="Minor grid opacity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.gridMinor}
                onChange={(e) => set('gridMinor', Number(e.target.value))}
              />
            </div>
            <div className="studio-console__row">
              <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
                MAJOR
              </span>
              <input
                aria-label="Major grid opacity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.gridMajor}
                onChange={(e) => set('gridMajor', Number(e.target.value))}
              />
            </div>
          </div>

          <button
            className="studio-console__reset"
            onClick={() => reset()}
          >
            ↺ Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
