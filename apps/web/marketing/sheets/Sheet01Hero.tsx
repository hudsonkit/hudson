'use client';

import { useCallback, useEffect, useState } from 'react';
import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { EmbedReveal } from '@/marketing/primitives/EmbedReveal';
import { LiveDimensions } from '@/marketing/primitives/LiveDimensions';
import { Sheet } from '@/marketing/primitives/Sheet';
import { REPOSITORY_URL } from '@/site/seo';

const INSTALL_CMD = 'bun add hudsonkit';
const GITHUB_URL = REPOSITORY_URL;

/** Mirrors the steps of EmbedTour inside the iframe (same order). */
const TOUR_STEPS = ['Canvas', 'Workspaces', 'Navigation', 'Inspector', 'Command palette', 'Status bar', 'Voice'];

function heroFrame(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>('#hero iframe');
}

export function Sheet01Hero() {
  const [copied, setCopied] = useState(false);
  const [tourStep, setTourStep] = useState(-1);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const frame = heroFrame();
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as { type?: string; step?: number } | null;
      if (data?.type === 'hudson:tour-state' && typeof data.step === 'number') setTourStep(data.step);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const tour = useCallback((action: 'start' | 'stop', step?: number) => {
    const frame = heroFrame();
    if (!frame?.contentWindow) return;
    if (action === 'start') {
      const r = frame.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    frame.contentWindow.postMessage({ type: 'hudson:tour', action, step }, '*');
  }, []);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    window.__hudAudio?.chime?.({ cat: 'ui' });
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context, denied permission) — keep silent;
      // the user can still select-and-copy the visible text.
    }
  };

  return (
    <Sheet
      id="hero"
      slugTitle="HERO"
      slugSub="general arrangement"
      sheetTitle="General Arrangement"
      style={{ minHeight: '100vh' }}
      footer={{
        left: ['LICENSE', 'Apache 2.0'],
        mid: 'iOS · macOS · Web — Talkie · OpenScout · Linea · Lattices · Vox',
        right: ['CLIENT', 'open-source'],
      }}
    >
      <div className="hero-intro" style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>

        <h1
          className="h-display hero-title"
          style={{ marginBottom: 20, position: 'relative' }}
          data-cal
          data-cal-label="hero headline"
        >
          Hudson gives apps a shared <span className="boxed">workspace</span>.
        </h1>

        <p className="subhead" style={{ marginBottom: 28, fontSize: 16 }}>
          A spatial canvas for your apps on iOS, macOS, and the web. The same primitives everywhere: a terminal, commands, and actions your agents can run.
        </p>

        <div style={{ display: 'flex', gap: 12 }} data-cal data-cal-label="hero CTAs">
          <button
            type="button"
            className="btn"
            onClick={handleInstallClick}
            aria-label={copied ? 'Install command copied to clipboard' : `Copy install command: ${INSTALL_CMD}`}
            style={{ minWidth: 220 }}
          >
            {copied ? '✓ Copied to clipboard' : `$ ${INSTALL_CMD}`}
          </button>
          <a
            className="btn btn--ghost"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => window.__hudAudio?.tick?.({ cat: 'ui', gain: 0.08 })}
          >
            <span className="hide-narrow">View source · </span>GitHub
          </a>
        </div>

        <div className="hero-stage" style={{ marginTop: 48, position: 'relative' }}>
          <div data-cal data-cal-label="workspace embed">
          <LiveDimensions label="Fig. 01 · Hudson workspace">
          <EmbedFrame height="clamp(560px, calc(100svh - 112px), 860px)">
            <HudsonEmbed
              src="/embed/hudson/workspace"
              surface="workspace"
              sizing={{ mode: 'fill' }}
              density="comfy"
              workspace="self"
              template="hudson"
              consumerId="hudsonos"
              expects={{
                manifestPanel: true,
                heroPinned: true,
                inspector: true,
                buildStrip: true,
                legend: true,
              }}
              title="Hudson workspace · live embed"
              priority="eager"
              collapse={['left', 'right:narrow']}
              workspaces={['developer-mode', 'document-lab', 'hero-studio']}
              accent="harbor"
              apps={['hudson-docs']}
              theme="light"
            />
            <EmbedReveal />
          </EmbedFrame>
          </LiveDimensions>
          </div>

          <div className="hero-tour">
            <button
              type="button"
              className="hero-tour__start"
              onClick={() => (tourStep >= 0 ? tour('stop') : tour('start', 0))}
            >
              {tourStep >= 0 ? 'End tour' : 'Take the tour →'}
            </button>
            <ol className="hero-callouts" aria-label="Tour steps">
              {TOUR_STEPS.map((label, i) => (
                <li key={label}>
                  <button
                    type="button"
                    className="hero-callouts__step"
                    aria-current={tourStep === i ? 'step' : undefined}
                    onClick={() => tour('start', i)}
                  >
                    <span className="hero-callouts__num">{String(i + 1).padStart(2, '0')}</span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
