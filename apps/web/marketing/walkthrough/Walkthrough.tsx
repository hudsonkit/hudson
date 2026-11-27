'use client';

/**
 * Walkthrough — drives the hero's live embed through a narrated sequence.
 *
 * It starts on its own once the hero is on screen and the embed reports
 * ready (not under prefers-reduced-motion). Captions always show; the
 * pre-rendered voiceover plays only when the visitor turns sound on. A real
 * click, key press or scroll inside the embed pauses it: the visitor has the
 * controls.
 *
 * Audio plays here, in the top-level page, so it isn't subject to the
 * iframe's autoplay rules. Moves are relayed to the embed's EmbedDriver.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { WALKTHROUGH, WALKTHROUGH_RESET, type WalkthroughMove } from './script';
import voice from './voice.json';

type VoiceClip = { src: string; duration: number };
const VOICE = voice as Record<string, VoiceClip | undefined>;

type Phase = 'waiting' | 'playing' | 'paused' | 'done';

const WIDE_FRAME = 960;
const START_DELAY_MS = 1400;
const STEP_TAIL_MS = 700;

/** Seconds a caption stays up without audio. */
function readingTime(text: string): number {
  return Math.max(4.5, text.split(/\s+/).length * 0.36 + 1.6);
}

function stepDuration(index: number, sound: boolean): number {
  const step = WALKTHROUGH[index];
  const clip = VOICE[step.id];
  const lastMove = step.moves.reduce((max, m) => Math.max(max, m.at), 0);
  const base = sound && clip ? clip.duration : readingTime(step.say);
  return Math.max(base, lastMove + 1.2) * 1000 + STEP_TAIL_MS;
}

export function Walkthrough({ frameSelector }: { frameSelector: string }) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [index, setIndex] = useState(0);
  const [sound, setSound] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  /** The visitor has used the narration toggle; stop pointing at it. */
  const [soundTouched, setSoundTouched] = useState(false);
  const timers = useRef<number[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);

  const frame = useCallback(
    () => document.querySelector<HTMLIFrameElement>(frameSelector),
    [frameSelector],
  );

  const send = useCallback(
    (move: Omit<WalkthroughMove, 'at'>) => {
      const el = frame();
      if (!el?.contentWindow) return;
      if (move.wide && el.clientWidth < WIDE_FRAME) return;
      el.contentWindow.postMessage({ type: 'hudson:drive', name: move.name, args: move.args ?? {} }, '*');
    },
    [frame],
  );

  const clearTimers = useCallback(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
    audio.current?.pause();
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Play one step: its moves on schedule, its line if sound is on. */
  const play = useCallback(
    (i: number, withSound: boolean) => {
      clearTimers();
      setIndex(i);
      setPhase('playing');
      const step = WALKTHROUGH[i];
      for (const move of step.moves) later(() => send(move), move.at * 1000);

      const clip = VOICE[step.id];
      if (withSound && clip) {
        const el = audio.current ?? new Audio();
        audio.current = el;
        el.src = clip.src;
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      }

      later(() => {
        if (i + 1 < WALKTHROUGH.length) play(i + 1, withSound);
        else setPhase('done');
      }, stepDuration(i, withSound));
    },
    [clearTimers, later, send],
  );

  /** Jump to a step: reset, replay earlier steps' moves at once, then play. */
  const jump = useCallback(
    (i: number) => {
      clearTimers();
      WALKTHROUGH_RESET.forEach(send);
      WALKTHROUGH.slice(0, i).forEach(step => step.moves.forEach(send));
      play(i, sound);
    },
    [clearTimers, play, send, sound],
  );

  const pause = useCallback(() => {
    clearTimers();
    setPhase(p => (p === 'playing' ? 'paused' : p));
  }, [clearTimers]);

  // Embed handshake and visitor takeover.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const el = frame();
      if (!el || e.source !== el.contentWindow) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === 'hudson:drive-ready') setReady(true);
      else if (type === 'hudson:drive-interrupted') pause();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frame, pause]);

  // Start only while the hero is actually on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (autoStarted.current || !ready || !visible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    autoStarted.current = true;
    const id = window.setTimeout(() => play(0, false), START_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [play, ready, visible]);

  // Scrolled away: pause rather than move things nobody is watching.
  useEffect(() => {
    if (!visible && phase === 'playing') pause();
  }, [pause, phase, visible]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundTouched(true);
    // Restart the current line so audio and motion stay in step.
    if (phase === 'playing') play(index, next);
  };

  const onPrimary = () => {
    if (phase === 'playing') pause();
    else if (phase === 'done' || phase === 'waiting') jump(0);
    else play(index, sound);
  };

  const step = WALKTHROUGH[index];
  const showing = phase !== 'waiting';
  // Point out the narration early on, while it is still off.
  const calloutOn = phase === 'playing' && !sound && !soundTouched && index <= 2;

  return (
    <div ref={rootRef} className="walkthrough" data-phase={phase}>
      <div className="walkthrough__bar">
        <button
          type="button"
          className="walkthrough__play"
          onClick={onPrimary}
          aria-label={phase === 'playing' ? 'Pause walkthrough' : phase === 'done' ? 'Replay walkthrough' : 'Play walkthrough'}
        >
          {phase === 'playing' ? <PauseIcon /> : phase === 'done' ? <ReplayIcon /> : <PlayIcon />}
        </button>

        <p className="walkthrough__caption" aria-live="polite">
          {showing ? step.say : 'A short walkthrough of the live workspace starts here.'}
        </p>

        <div className="walkthrough__sound-wrap">
          <button
            type="button"
            className="walkthrough__sound"
            aria-pressed={sound}
            onClick={toggleSound}
            title={sound ? 'Mute narration' : 'Play narration'}
          >
            {sound ? <SoundOnIcon /> : <SoundOffIcon />}
            <span>{sound ? 'Narration on' : 'Narration off'}</span>
          </button>
          {/* A caliper on the toggle with a leader up to a note: it's narrated. */}
          <span className="narration-callout" data-on={calloutOn || undefined} aria-hidden>
            <span className="narration-callout__jaws" />
            <span className="narration-callout__leader" />
            <span className="narration-callout__note">Narrated · turn on to listen</span>
          </span>
        </div>
      </div>

      <ol className="walkthrough__steps" aria-label="Walkthrough steps">
        {WALKTHROUGH.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={showing && i === index ? 'step' : undefined}
              data-done={showing && i < index ? '' : undefined}
              onClick={() => jump(i)}
            >
              <span className="walkthrough__num">{String(i + 1).padStart(2, '0')}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

const iconProps = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true } as const;
function PlayIcon() {
  return <svg {...iconProps}><path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" /></svg>;
}
function PauseIcon() {
  return <svg {...iconProps}><path d="M5 3.5h2v9H5zM9 3.5h2v9H9z" fill="currentColor" /></svg>;
}
function ReplayIcon() {
  return <svg {...iconProps}><path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 3v2.5H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function SoundOnIcon() {
  return <svg {...iconProps}><path d="M3 6.5h2l3-2.5v8l-3-2.5H3z" fill="currentColor" /><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 4a5.5 5.5 0 0 1 0 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
function SoundOffIcon() {
  return <svg {...iconProps}><path d="M3 6.5h2l3-2.5v8l-3-2.5H3z" fill="currentColor" /><path d="m10.5 6 3 4m0-4-3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
