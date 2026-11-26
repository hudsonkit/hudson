'use client';

import { useState } from 'react';
import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { LiveDimensions } from '@/marketing/primitives/LiveDimensions';
import { Sheet } from '@/marketing/primitives/Sheet';
import { REPOSITORY_URL } from '@/site/seo';

const INSTALL_CMD = 'bun add hudsonkit';
const GITHUB_URL = REPOSITORY_URL;

const CALLOUTS = ['Capability map', 'Command dock', 'Status bar', 'Canvas · pan / zoom'];

export function Sheet01Hero() {
  const [copied, setCopied] = useState(false);

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
      <div className="hero-intro" style={{ maxWidth: 1100, margin: '72px auto 0', position: 'relative' }}>

        <h1
          className="h-display hero-title"
          style={{ marginBottom: 20, position: 'relative' }}
          data-cal
          data-cal-label="hero headline"
        >
          Hudson gives your tools a <span className="boxed">workspace</span>.
        </h1>

        <p className="subhead" style={{ marginBottom: 28, fontSize: 16 }}>
          A spatial canvas for your apps, with the shell, commands, and persistence already built.
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
            View source · GitHub
          </a>
        </div>

        <div className="hero-stage" style={{ marginTop: 64, position: 'relative' }}>
          <div
            className="embed-plate__caption"
            style={{ position: 'static', marginBottom: 16, justifyContent: 'space-between' }}
          >
            <span>Fig. 01 · Hudson workspace</span>
          </div>

          <div data-cal data-cal-label="workspace embed · 760h">
          <LiveDimensions>
          <EmbedFrame height={760}>
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
            />
          </EmbedFrame>
          </LiveDimensions>
          </div>

          <ol className="hero-callouts">
            {CALLOUTS.map((label, i) => (
              <li key={label}>
                <span className="hero-callouts__num">{String(i + 1).padStart(2, '0')}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Sheet>
  );
}
