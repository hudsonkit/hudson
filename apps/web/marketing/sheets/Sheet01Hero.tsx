'use client';

import { useState } from 'react';
import { Counter } from '@/marketing/lib/animate';
import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { LiveDimensions } from '@/marketing/primitives/LiveDimensions';
import { Sheet } from '@/marketing/primitives/Sheet';
import { REPOSITORY_URL } from '@/site/seo';

const INSTALL_CMD = 'bun add hudsonkit';
const GITHUB_URL = REPOSITORY_URL;

const CALLOUTS = ['Capability map', 'Command dock', 'Status bar', 'Canvas · pan / zoom'];

const STATS: Array<[string, string, string]> = [
  ['Surfaces', '3', 'iOS · macOS · Web'],
  ['Primitives', '8', 'Frame · Nav · Panel · Status · Canvas · Palette · Drawer · Assistant'],
  ['Apps live', '5', 'Talkie · OpenScout · Linea · Lattices · Vox'],
  ['License', 'Apache 2.0', 'free for commercial use'],
];

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
        left: ['CLIENT', 'open-source'],
        mid: 'BUILD THE TOOL · HUDSON PROVIDES THE WORKSPACE',
        right: ['STATUS', 'shipped'],
      }}
    >
      <div className="hero-intro" style={{ maxWidth: 1100, margin: '96px auto 0', position: 'relative' }}>

        <h1
          className="h-display"
          style={{ marginBottom: 32, position: 'relative' }}
          data-cal
          data-cal-label="hero headline"
        >
          Build the <em>tool</em>.
          <br />
          Hudson provides the <span className="boxed">workspace</span>.
        </h1>

        <p className="subhead" style={{ marginBottom: 36, fontSize: 16 }}>
          Canvas, side rails, commands, persistence, logging, and agent-ready infrastructure —
          already working together. Your team owns the model, renderer, and interactions that make
          the product yours.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 72 }} data-cal data-cal-label="hero CTAs">
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

        <div
          data-cal
          data-cal-label="stats grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            maxWidth: 880,
            overflow: 'hidden',
          }}
        >
          {STATS.map((c, i) => (
            <div
              key={c[0]}
              style={{
                padding: '16px 20px',
                borderRight: i < 3 ? '1px solid color-mix(in oklch, var(--line) 60%, transparent)' : 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  color: 'var(--ink-2)',
                  textTransform: 'uppercase',
                }}
              >
                {c[0]}
              </div>
              <div
                style={{
                  fontSize: 24,
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-display)',
                  marginTop: 4,
                  lineHeight: 1,
                }}
              >
                {c[0] === 'License' ? c[1] : <Counter to={parseInt(c[1], 10)} />}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--ink-2)',
                  marginTop: 6,
                  letterSpacing: '0.04em',
                  lineHeight: 1.4,
                }}
              >
                {c[2]}
              </div>
            </div>
          ))}
        </div>

        <div className="hero-stage" style={{ marginTop: 112, position: 'relative' }}>
          <div
            className="embed-plate__caption"
            style={{ position: 'static', marginBottom: 16, justifyContent: 'space-between' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span className="live" />
              Fig. 01 · live workspace
            </span>
            <span style={{ color: 'var(--ink-3)' }}>The real shell, rendered from the SDK</span>
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
