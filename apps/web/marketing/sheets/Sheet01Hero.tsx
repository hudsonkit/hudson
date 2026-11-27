'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'hudsonkit/icons';
import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { EmbedReveal } from '@/marketing/primitives/EmbedReveal';
import { LiveDimensions } from '@/marketing/primitives/LiveDimensions';
import { Sheet } from '@/marketing/primitives/Sheet';
import { REPOSITORY_URL } from '@/site/seo';
import { Walkthrough } from '@/marketing/walkthrough/Walkthrough';

const INSTALL_CMD = 'bun add hudsonkit';
const GITHUB_URL = REPOSITORY_URL;
const STARS_API = 'https://api.github.com/repos/hudsonkit/hudson';
/** Below this, a count reads as a weakness; show the call to action alone. */
const SHOW_STARS_FROM = 10;

async function loadStars(): Promise<number | null> {
  try {
    const cached = sessionStorage.getItem('hudson.gh-stars');
    if (cached) return Number(cached);
  } catch {
    /* storage blocked */
  }
  const res = await fetch(STARS_API);
  if (!res.ok) return null;
  const data = (await res.json()) as { stargazers_count?: number };
  if (typeof data.stargazers_count !== 'number') return null;
  try { sessionStorage.setItem('hudson.gh-stars', String(data.stargazers_count)); } catch { /* noop */ }
  return data.stargazers_count;
}

/** Public star count, cached for the session; null until known (or on failure). */
function useGitHubStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStars()
      .then(count => {
        if (!cancelled && count !== null) setStars(count);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return stars;
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function Sheet01Hero() {
  const [copied, setCopied] = useState(false);
  const stars = useGitHubStars();
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

        <div className="hero-ctas" data-cal data-cal-label="hero CTAs">
          <button
            type="button"
            className="cmd-copy"
            onClick={handleInstallClick}
            aria-label={copied ? 'Install command copied to clipboard' : `Copy install command: ${INSTALL_CMD}`}
          >
            <span className="cmd-copy__prompt" aria-hidden>$</span>
            <code className="cmd-copy__text">{INSTALL_CMD}</code>
            <span className="cmd-copy__action" aria-hidden data-copied={copied || undefined}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </span>
          </button>
          <a
            className="gh-star"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => window.__hudAudio?.tick?.({ cat: 'ui', gain: 0.08 })}
          >
            <GitHubMark />
            <span>Star on GitHub</span>
            {stars !== null && stars >= SHOW_STARS_FROM && (
              <span className="gh-star__count" aria-label={`${stars} stars`}>
                <StarGlyph />
                {formatStars(stars)}
              </span>
            )}
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

          <Walkthrough frameSelector="#hero iframe" />
        </div>
      </div>
    </Sheet>
  );
}

function GitHubMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 .9l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.4l-4.5 2.3.9-5L.8 6.2l5-.7L8 .9Z" />
    </svg>
  );
}
