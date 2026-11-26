'use client';

/**
 * EmbedTour — a guided walk through the live workspace, running inside the
 * embed iframe so it works whether the host page is same-origin (dev) or
 * cross-origin (hudsonkit.com → app.hudsonkit.com).
 *
 * It drives the shell only through the hooks the shell already exposes:
 *   - `hudson:set-panel-collapsed` window events (left / right panels)
 *   - the window-level ⌘K listener (command palette), Escape to close
 *   - `data-frame-panel` attributes for spotlight targets
 *
 * Protocol with the host page (no data beyond step numbers crosses it):
 *   host → embed  { type: 'hudson:tour', action: 'start', step?: number }
 *                 { type: 'hudson:tour', action: 'stop' }
 *   embed → host  { type: 'hudson:tour-state', step: number, total: number }
 *                 (step = -1 when the tour is not running)
 * Starting a demo is harmless, so any parent frame may start it; we only
 * require that the message comes from our own parent window.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type Rect = { top: number; left: number; width: number; height: number };

type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Runs when the step becomes active. */
  enter?: () => void;
  /** Runs when leaving the step (forward, back, or stop). */
  exit?: () => void;
  /** Where to draw the spotlight; null = no spotlight. */
  target: () => Rect | null;
  voice?: boolean;
};

const VOICE_UTTERANCE = 'Open the inspector.';
const VOICE_INTENT = 'shell:toggle-right';
const VOICE_REPLY = 'Inspector is open.';

function setPanel(side: 'left' | 'right', collapsed: boolean) {
  window.dispatchEvent(
    new CustomEvent('hudson:set-panel-collapsed', { detail: { side, collapsed } }),
  );
}

function openPalette() {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }),
  );
}

function closePalette() {
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  const input = dialog?.querySelector('input') ?? dialog;
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function rectOf(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** The open canvas: everything between the top navigation and the status bar. */
function canvasRect(): Rect | null {
  const nav = document.querySelector('[data-frame-panel="navigation"]')?.getBoundingClientRect();
  const status = document.querySelector('[data-frame-panel="status-bar"]')?.getBoundingClientRect();
  const top = nav ? nav.bottom : 0;
  const bottom = status ? status.top : window.innerHeight;
  return { top, left: 0, width: window.innerWidth, height: Math.max(0, bottom - top) };
}

/**
 * Prefer the natural-sounding voices browsers ship (Apple premium/enhanced,
 * Microsoft "Natural", Google's network voices) over the robotic default.
 */
const PREFERRED_VOICES = [
  /\b(Ava|Zoe|Evan|Nathan|Samantha|Allison)\b.*\((Premium|Enhanced)\)/i,
  /Microsoft (Aria|Jenny|Guy|Ava|Andrew).*Natural/i,
  /^Google US English$/i,
  /\b(Samantha|Ava|Allison|Serena|Daniel)\b/i,
  /Google UK English (Female|Male)/i,
];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
  for (const pattern of PREFERRED_VOICES) {
    const hit = voices.find(v => pattern.test(v.name));
    if (hit) return hit;
  }
  return voices.find(v => !v.localService) ?? voices.find(v => v.default) ?? voices[0];
}

function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = 0.98;
    u.pitch = 1;
    synth.speak(u);
  } catch {
    /* speech is a nicety; the transcript carries the reply */
  }
}

// Voices load asynchronously in Chrome; touch the list early so the first
// reply doesn't fall back to the default voice.
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
}

const STEPS: TourStep[] = [
  {
    id: 'canvas',
    title: 'One canvas for every app',
    body: 'Apps open as windows on a persistent spatial canvas. Pan and zoom to move between the whole workspace and a single app.',
    target: canvasRect,
  },
  {
    id: 'navigation',
    title: 'Navigation rail',
    body: 'The left rail holds the focused app’s navigation. The app fills a slot; the shell draws the chrome around it.',
    enter: () => setPanel('left', false),
    exit: () => setPanel('left', true),
    target: () => rectOf('[data-frame-panel="manifest"]'),
  },
  {
    id: 'inspector',
    title: 'Inspector',
    body: 'The inspector shows what is selected. Same slot contract, on the other side of the canvas.',
    enter: () => setPanel('right', false),
    exit: () => setPanel('right', true),
    target: () => rectOf('[data-frame-panel="inspector"]'),
  },
  {
    id: 'palette',
    title: 'Command palette',
    body: 'Every command and intent an app declares is searchable from ⌘K: the shell’s own, and each app’s.',
    enter: openPalette,
    exit: closePalette,
    target: () => rectOf('[role="dialog"][aria-modal="true"]'),
  },
  {
    id: 'status',
    title: 'Status bar',
    body: 'Live state from the focused app and the shell: position, zoom, and connection status at a glance.',
    target: () => rectOf('[data-frame-panel="status-bar"]'),
  },
  {
    id: 'voice',
    title: 'Speak, and it answers',
    body: 'The same intents are reachable by voice. Hudson captures speech, matches an intent, runs it, and speaks the result back.',
    exit: () => setPanel('right', true),
    target: () => rectOf('[data-frame-panel="inspector"]') ?? canvasRect(),
    voice: true,
  },
];

type VoicePhase = 'idle' | 'listening' | 'matched' | 'replied';

function postState(step: number) {
  try {
    window.parent?.postMessage({ type: 'hudson:tour-state', step, total: STEPS.length }, '*');
  } catch {
    /* no parent */
  }
}

export function EmbedTour() {
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [heard, setHeard] = useState('');
  const stepRef = useRef(-1);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const goTo = useCallback(
    (next: number) => {
      const prev = stepRef.current;
      if (prev === next) return;
      clearTimers();
      if (prev >= 0) STEPS[prev].exit?.();
      stepRef.current = next;
      setStep(next);
      setVoicePhase('idle');
      setHeard('');
      postState(next);
      if (next >= 0) {
        STEPS[next].enter?.();
      } else {
        setRect(null);
        try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
      }
    },
    [clearTimers],
  );

  // Host page control.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || window.parent === window) return;
      const data = e.data as { type?: string; action?: string; step?: number } | null;
      if (!data || data.type !== 'hudson:tour') return;
      if (data.action === 'start') {
        const s = typeof data.step === 'number' ? Math.max(0, Math.min(STEPS.length - 1, data.step)) : 0;
        goTo(s);
      } else if (data.action === 'stop') {
        goTo(-1);
      }
    };
    window.addEventListener('message', onMessage);
    postState(-1);
    return () => window.removeEventListener('message', onMessage);
  }, [goTo]);

  // Keep the spotlight on its target while panels animate and the frame resizes.
  useEffect(() => {
    if (step < 0) return;
    let raf = 0;
    const tick = () => {
      const r = STEPS[step].target();
      setRect(prev =>
        prev && r && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 &&
        Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
          ? prev
          : r,
      );
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [step]);

  // Keyboard: arrows to move, Escape to leave (unless the palette step owns Escape).
  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      if (e.key === 'ArrowRight') goTo(step + 1 < STEPS.length ? step + 1 : -1);
      else if (e.key === 'ArrowLeft' && step > 0) goTo(step - 1);
      else if (e.key === 'Escape' && STEPS[step].id !== 'palette') goTo(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goTo]);

  const runVoiceDemo = useCallback(() => {
    clearTimers();
    setPanel('right', true);
    setVoicePhase('listening');
    setHeard('');
    const words = VOICE_UTTERANCE.split(' ');
    words.forEach((_, i) => later(() => setHeard(words.slice(0, i + 1).join(' ')), 260 + i * 220));
    const afterSpeech = 260 + words.length * 220 + 300;
    later(() => setVoicePhase('matched'), afterSpeech);
    later(() => setPanel('right', false), afterSpeech + 500);
    later(() => {
      setVoicePhase('replied');
      speak(VOICE_REPLY);
    }, afterSpeech + 1100);
  }, [clearTimers, later]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const current = step >= 0 ? STEPS[step] : null;
  const isLast = step === STEPS.length - 1;

  const spotlight = useMemo<CSSProperties | null>(() => {
    if (!rect) return null;
    const pad = 6;
    return {
      position: 'fixed',
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
      borderRadius: 10,
      boxShadow: '0 0 0 1px var(--hud-accent, oklch(0.76 0.13 64)), 0 0 0 9999px oklch(0.08 0.005 250 / 0.55)',
      transition: 'top 260ms cubic-bezier(0.25,1,0.5,1), left 260ms cubic-bezier(0.25,1,0.5,1), width 260ms cubic-bezier(0.25,1,0.5,1), height 260ms cubic-bezier(0.25,1,0.5,1)',
      pointerEvents: 'none',
    };
  }, [rect]);

  if (!current) return null;

  return (
    <div className="hudson-embed-tour" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, pointerEvents: 'none' }}>
      {spotlight ? (
        <div style={spotlight} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'oklch(0.08 0.005 250 / 0.55)' }} />
      )}

      <section
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${STEPS.length}: ${current.title}`}
        style={card}
      >
        <header style={cardHead}>
          <span>
            {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
          </span>
          <button type="button" onClick={() => goTo(-1)} style={linkBtn}>
            End tour
          </button>
        </header>

        <h2 style={cardTitle}>{current.title}</h2>
        <p style={cardBody}>{current.body}</p>

        {current.voice && (
          <div style={voiceBox}>
            <div style={voiceRow}>
              <span style={voiceLabel}>You</span>
              <span style={{ color: heard ? 'var(--hud-ink, #eef0f2)' : 'var(--hud-ink-3, #8b9099)' }}>
                {heard ? `“${heard}”` : voicePhase === 'listening' ? 'Listening…' : '—'}
              </span>
            </div>
            <div style={voiceRow}>
              <span style={voiceLabel}>Intent</span>
              <code style={{ color: voicePhase === 'idle' || voicePhase === 'listening' ? 'var(--hud-ink-3, #8b9099)' : 'var(--hud-ink, #eef0f2)' }}>
                {voicePhase === 'matched' || voicePhase === 'replied' ? VOICE_INTENT : '—'}
              </code>
            </div>
            <div style={voiceRow}>
              <span style={voiceLabel}>Hudson</span>
              <span style={{ color: voicePhase === 'replied' ? 'var(--hud-ink, #eef0f2)' : 'var(--hud-ink-3, #8b9099)' }}>
                {voicePhase === 'replied' ? `“${VOICE_REPLY}”` : '—'}
              </span>
            </div>
            <button type="button" onClick={runVoiceDemo} style={{ ...ghostBtn, marginTop: 10 }}>
              {voicePhase === 'idle' ? 'Play the voice loop' : 'Play again'}
            </button>
            <p style={note}>
              Simulated in this preview. In Hudson, speech runs through the local voice runtime and the reply is spoken back.
            </p>
          </div>
        )}

        <footer style={cardFoot}>
          <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0} style={{ ...ghostBtn, opacity: step === 0 ? 0.4 : 1 }}>
            Back
          </button>
          <button type="button" onClick={() => goTo(isLast ? -1 : step + 1)} style={primaryBtn}>
            {isLast ? 'Finish' : 'Next'}
          </button>
        </footer>
      </section>
    </div>
  );
}

const card: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 44,
  transform: 'translateX(-50%)',
  width: 'min(380px, calc(100vw - 24px))',
  padding: '14px 16px 14px',
  borderRadius: 8,
  border: '1px solid var(--hud-line, oklch(0.36 0.007 250))',
  background: 'color-mix(in oklch, var(--hud-bg, oklch(0.235 0.008 250)) 94%, transparent)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 18px 48px -16px oklch(0.05 0.01 250 / 0.7)',
  color: 'var(--hud-ink-1, #d9dce0)',
  fontFamily: 'var(--hud-font-body, system-ui, sans-serif)',
  pointerEvents: 'auto',
};
const cardHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 10,
  letterSpacing: '0.16em',
  color: 'var(--hud-ink-3, #8b9099)',
  marginBottom: 8,
};
const cardTitle: CSSProperties = {
  margin: '0 0 6px',
  fontFamily: 'var(--hud-font-display, Georgia, serif)',
  fontWeight: 400,
  fontSize: 20,
  lineHeight: 1.15,
  color: 'var(--hud-ink, #eef0f2)',
};
const cardBody: CSSProperties = { margin: 0, fontSize: 12.5, lineHeight: 1.55 };
const cardFoot: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 };
const baseBtn: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 10.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '8px 12px',
  borderRadius: 4,
  cursor: 'pointer',
};
const primaryBtn: CSSProperties = {
  ...baseBtn,
  border: '1px solid var(--hud-ink-1, #d9dce0)',
  background: 'var(--hud-ink-1, #d9dce0)',
  color: 'var(--hud-bg, #1b1d21)',
};
const ghostBtn: CSSProperties = {
  ...baseBtn,
  border: '1px solid var(--hud-line, oklch(0.36 0.007 250))',
  background: 'transparent',
  color: 'var(--hud-ink-1, #d9dce0)',
};
const linkBtn: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  letterSpacing: 'inherit',
  color: 'var(--hud-ink-2, #b4b8be)',
  cursor: 'pointer',
};
const voiceBox: CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid var(--hud-line, oklch(0.36 0.007 250))',
  fontSize: 12,
};
const voiceRow: CSSProperties = { display: 'grid', gridTemplateColumns: '56px 1fr', gap: 8, padding: '3px 0' };
const voiceLabel: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--hud-ink-3, #8b9099)',
  paddingTop: 2,
};
const note: CSSProperties = { margin: '8px 0 0', fontSize: 11, lineHeight: 1.45, color: 'var(--hud-ink-3, #8b9099)' };
