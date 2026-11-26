'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * EmbedReveal — the first appearance of a live embed.
 *
 * The frame waits as a flat dark panel with one quiet loader: a hairline
 * with a short segment gliding along it. When the embed reports it has
 * actually painted (`hudson:embed-painted`: windows arranged, fonts ready),
 * the product fades up out of a slight blur. No gradients, no glow.
 *
 * Mount it as a sibling of the iframe inside an `.embed-plate`. The iframe
 * stays hidden while this reports `data-phase="waiting"` (CSS :has), so the
 * shell never shows itself half-assembled.
 *
 * Fallbacks: `hudson:embed-ready` + a grace period (older embed bundles), and
 * a hard timeout so the product can never stay hidden.
 */

type Phase = 'waiting' | 'revealing' | 'live';

const REVEAL_MS = 900;
const READY_GRACE_MS = 1400;
const HARD_TIMEOUT_MS = 6000;

export function EmbedReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('waiting');

  useEffect(() => {
    const plate = ref.current?.parentElement;
    const iframe = plate?.querySelector('iframe');
    if (!plate) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    let started = false;

    const reveal = () => {
      if (started) return;
      started = true;
      // One frame so the "waiting" styles are committed before transitioning.
      window.requestAnimationFrame(() => {
        setPhase('revealing');
        timers.push(window.setTimeout(() => setPhase('live'), reduce ? 350 : REVEAL_MS));
      });
    };

    const onMessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === 'hudson:embed-painted') reveal();
      else if (type === 'hudson:embed-ready') timers.push(window.setTimeout(reveal, READY_GRACE_MS));
    };
    window.addEventListener('message', onMessage);
    timers.push(window.setTimeout(reveal, HARD_TIMEOUT_MS));

    return () => {
      window.removeEventListener('message', onMessage);
      timers.forEach(id => window.clearTimeout(id));
    };
  }, []);

  return (
    <div ref={ref} className="embed-reveal" data-phase={phase} aria-hidden="true">
      {phase !== 'live' && (
        <div className="embed-reveal__glass">
          <div className="embed-reveal__loader">
            <span className="embed-reveal__track" />
            <span className="embed-reveal__label">Loading workspace</span>
          </div>
        </div>
      )}
    </div>
  );
}
