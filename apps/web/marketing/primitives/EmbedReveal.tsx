'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * EmbedReveal — the loading moment for a live embed.
 *
 * Until the iframe reports `hudson:embed-ready`, the frame shows the shell as
 * a technical drawing (top bar, rails, status bar, a few window outlines)
 * that plots itself in over a fine grid. On ready, a single band of light
 * sweeps across; the drawing gives way to the live product behind it, and the
 * plate settles into a faint top rim and glow.
 *
 * Mount it as a sibling of the iframe inside an `.embed-plate`.
 * Reduced motion → a plain crossfade. No ready message → reveal anyway after
 * a timeout, so the drawing can never stick.
 */

type Phase = 'drawing' | 'revealing' | 'live';

const READY_FALLBACK_MS = 6000;
/** Ready fires as the embed's handshake mounts; give the shell a beat to paint. */
const PAINT_GRACE_MS = 280;
const REVEAL_MS = 900;

// Window outlines in % of the frame: [left, top, width, height].
const WINDOWS: Array<[number, number, number, number]> = [
  [9, 16, 30, 44],
  [43, 12, 34, 34],
  [43, 51, 22, 30],
  [69, 51, 22, 22],
];

export function EmbedReveal({ label = 'Workspace' }: { label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('drawing');

  useEffect(() => {
    const root = ref.current;
    const plate = root?.parentElement;
    const iframe = plate?.querySelector('iframe');
    if (!root || !plate) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let done = false;
    const timers: number[] = [];

    const reveal = () => {
      if (done) return;
      done = true;
      timers.push(
        window.setTimeout(() => {
          setPhase('revealing');
          plate.setAttribute('data-live', '');
          timers.push(window.setTimeout(() => setPhase('live'), reduce ? 320 : REVEAL_MS));
        }, PAINT_GRACE_MS),
      );
    };

    const onMessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      if ((e.data as { type?: string } | null)?.type === 'hudson:embed-ready') reveal();
    };
    window.addEventListener('message', onMessage);
    timers.push(window.setTimeout(reveal, READY_FALLBACK_MS));

    return () => {
      window.removeEventListener('message', onMessage);
      timers.forEach(id => window.clearTimeout(id));
    };
  }, []);

  return (
    <div ref={ref} className="embed-reveal" data-phase={phase} aria-hidden="true">
      {phase !== 'live' && (
        <div className="embed-reveal__drawing">
          <div className="embed-reveal__grid" />

          {/* Chrome: drawn as single hairlines */}
          <span className="embed-reveal__line embed-reveal__line--h" style={{ top: 48, left: 0, right: 0, ['--d' as string]: '0ms' }} />
          <span className="embed-reveal__line embed-reveal__line--h" style={{ bottom: 34, left: 0, right: 0, ['--d' as string]: '120ms' }} />
          <span className="embed-reveal__line embed-reveal__line--v" style={{ left: 44, top: 48, bottom: 34, ['--d' as string]: '220ms' }} />
          <span className="embed-reveal__line embed-reveal__line--v" style={{ right: 44, top: 48, bottom: 34, ['--d' as string]: '260ms' }} />

          <span className="embed-reveal__mark">HUDSONKIT</span>
          <span className="embed-reveal__tabs">
            <i /><i /><i /><i />
          </span>

          {/* Windows: outlines plot in, then a few "text" rules fill */}
          {WINDOWS.map(([l, t, w, h], i) => (
            <div
              key={i}
              className="embed-reveal__win"
              style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, ['--d' as string]: `${360 + i * 110}ms` }}
            >
              <svg width="100%" height="100%" preserveAspectRatio="none">
                <rect x="0" y="0" width="100%" height="100%" rx="4" pathLength={1} />
              </svg>
              <span className="embed-reveal__bar" />
              <span className="embed-reveal__rule" style={{ width: '58%' }} />
              <span className="embed-reveal__rule" style={{ width: '42%' }} />
              <span className="embed-reveal__rule" style={{ width: '50%' }} />
            </div>
          ))}

          <span className="embed-reveal__caption">{label} · drawing</span>
        </div>
      )}

      {phase === 'revealing' && <div className="embed-reveal__sweep" />}
    </div>
  );
}
