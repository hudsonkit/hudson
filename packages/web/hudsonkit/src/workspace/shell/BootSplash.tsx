'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sounds } from '../../index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type BootPhase = 'brand' | 'image-in' | 'badge-in' | 'loading' | 'chrome-in' | 'panels-in' | 'dismissible' | 'done';

interface BootSplashProps {
  onPhaseChange: (phase: BootPhase) => void;
  onBooted: () => void;
  mode: 'full' | 'condensed';
}

// ---------------------------------------------------------------------------
// Phase ordering helper
// ---------------------------------------------------------------------------
const PHASE_ORDER: BootPhase[] = ['brand', 'image-in', 'badge-in', 'loading', 'chrome-in', 'panels-in', 'dismissible', 'done'];

function phaseIndex(phase: BootPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function phaseAtLeast(current: BootPhase, target: BootPhase): boolean {
  return phaseIndex(current) >= phaseIndex(target);
}

// ---------------------------------------------------------------------------
// BootSplash
// ---------------------------------------------------------------------------
export function BootSplash({ onPhaseChange, onBooted, mode }: BootSplashProps) {
  const [phase, setPhase] = useState<BootPhase>('brand');
  const phaseRef = useRef<BootPhase>('brand');

  const advance = useCallback((next: BootPhase) => {
    phaseRef.current = next;
    setPhase(next);
    onPhaseChange(next);
  }, [onPhaseChange]);

  // --- Timed sequence ---
  // Full:      brand (400ms) → image-in (1200ms) → badge-in (1200ms) → loading (wait for click)
  // Condensed: brand (600ms) → chrome-in (350ms) → panels-in (500ms) → done
  useEffect(() => {
    if (mode === 'full') {
      sounds.boot();
      const t1 = setTimeout(() => advance('image-in'), 400);
      const t2 = setTimeout(() => advance('badge-in'), 1600);
      const t3 = setTimeout(() => advance('loading'), 2800);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } else {
      // Condensed: quick reveal, no sounds
      const t1 = setTimeout(() => advance('chrome-in'), 600);
      const t2 = setTimeout(() => advance('panels-in'), 950);
      const t3 = setTimeout(() => advance('done'), 1450);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [mode, advance]);

  // --- Dismiss on click/key (full mode, loading phase) ---
  useEffect(() => {
    if (mode !== 'full' || phase !== 'loading') return;

    const dismiss = () => {
      sounds.whoosh();
      advance('chrome-in');
      setTimeout(() => advance('panels-in'), 600);
      setTimeout(() => advance('done'), 1000);
    };
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', dismiss);
    };
  }, [mode, phase, advance]);

  const showSplash = phase !== 'done';
  const beforeChrome = !phaseAtLeast(phase, 'chrome-in');

  // --- Condensed mode (unchanged from original) ---
  if (mode === 'condensed') {
    return (
      <AnimatePresence onExitComplete={onBooted}>
        {showSplash && (
          <>
            {/* Background layer */}
            <AnimatePresence>
              {beforeChrome && (
                <motion.div
                  key="bg"
                  className="fixed inset-0 z-[200]"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  style={{ background: '#0a0a0a' }}
                />
              )}
            </AnimatePresence>

            {/* Logo overlay */}
            <motion.div
              key="splash-overlay"
              className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeIn' }}
              style={{
                background: phaseAtLeast(phase, 'chrome-in')
                  ? 'rgba(10,10,10,0.85)'
                  : 'transparent',
              }}
            >
              <motion.div
                className="relative flex flex-col items-center gap-4 px-16 py-12 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{
                  background: '#111113',
                  border: '1px solid #27272a',
                  boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.2)',
                }}
              >
                {/* Metallic sheen highlight */}
                <div
                  className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 55%, transparent 60%)',
                  }}
                />

                <h1 className="text-[42px] font-brand font-bold tracking-[0.3em] text-white relative">
                  HUDSON
                </h1>

                {/* Accent line */}
                <div className="w-10 h-px bg-emerald-400" />

                <span className="text-[11px] font-brand tracking-[0.5em] text-neutral-500 uppercase">
                  OS
                </span>

                {/* Spacer */}
                <div className="h-8 mt-2" />

                {/* Domain + credit */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-mono tracking-[0.2em] text-neutral-600">
                    hudsonkit.com
                  </span>
                  <span className="text-[9px] font-mono tracking-[0.15em] text-neutral-700">
                    by @arach
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // --- Full mode (hero image splash) ---
  return (
    <AnimatePresence onExitComplete={onBooted}>
      {showSplash && (
        <>
          {/* Dark background — visible until chrome-in */}
          <AnimatePresence>
            {beforeChrome && (
              <motion.div
                key="bg-dark"
                className="fixed inset-0 z-[200]"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ background: '#0a0a0a' }}
              />
            )}
          </AnimatePresence>

          {/* Hero image — fades in at image-in, out at chrome-in */}
          <AnimatePresence>
            {phaseAtLeast(phase, 'image-in') && beforeChrome && (
              <motion.div
                key="hero"
                className="fixed inset-0 z-[201]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              >
                <img
                  src="/demo/hero.png"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: 'center 45%' }}
                />
                {/* Vignette overlay */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10,10,10,0.7) 100%)',
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Badge + hint overlay — the element AnimatePresence tracks for onExitComplete */}
          <motion.div
            key="splash-overlay"
            className="fixed inset-0 z-[202] flex flex-col items-center justify-center pointer-events-none"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeIn' }}
          >
            {/* Metallic badge — rises in at badge-in, exits at chrome-in */}
            <AnimatePresence>
              {phaseAtLeast(phase, 'badge-in') && beforeChrome && (
                <motion.div
                  key="badge"
                  className="relative flex flex-col items-center gap-4 px-16 py-12 rounded-2xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
                  style={{
                    marginTop: '-8vh',
                    background: '#111113',
                    border: '1px solid #27272a',
                    boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.2)',
                  }}
                >
                  {/* Metallic sheen highlight */}
                  <div
                    className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
                    style={{
                      background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 55%, transparent 60%)',
                    }}
                  />

                  <h1 className="text-[42px] font-brand font-bold tracking-[0.3em] text-white relative">
                    HUDSON
                  </h1>

                  {/* Accent line */}
                  <div className="w-10 h-px bg-emerald-400" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Click/key hint — only visible during loading phase */}
            <AnimatePresence>
              {phase === 'loading' && (
                <motion.span
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mt-19 text-[9px] font-mono tracking-[0.2em] text-neutral-500"
                >
                  click or press any key
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
