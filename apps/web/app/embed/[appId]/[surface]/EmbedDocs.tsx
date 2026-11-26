'use client';

// ─────────────────────────────────────────────────────────────────────────────
// EmbedDocs — The map of Hudson, served at /embed/<appId>/docs
// ─────────────────────────────────────────────────────────────────────────────
// A dense overview of what Hudson actually is: the surfaces it runs on, the
// apps that ship in the workspace, and the primitives the shell exposes.
//
// Three topic cards: Surfaces, Apps, Primitives. Each renders a short pitch
// and a list (label + one-line descriptor) — like a parts list on an
// engineering drawing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react';

const WORKSPACE_URL = 'https://app.hudsonkit.com';
const NPM_URL = 'https://www.npmjs.com/package/hudsonkit';

interface ListItem {
  label: string;
  sub: string;
  href?: string;
  external?: boolean;
}

interface Topic {
  id: string;
  num: string;
  title: string;
  pitch: string;
  items: ListItem[];
  cta: { label: string; href: string; external?: boolean };
}

const TOPICS: Topic[] = [
  {
    id: 'surfaces',
    num: '01',
    title: 'Surfaces',
    pitch:
      'Hudson is the same shell language across four surfaces. The web workspace is the lead surface; macOS and iOS reuse the contract natively; the SDK is the import you reach for.',
    items: [
      { label: 'Web',   sub: 'Workspace at app.hudsonkit.com',     href: WORKSPACE_URL, external: true },
      { label: 'macOS', sub: 'Native shell + Runtime canvas',      href: '/docs/macos-shell' },
      { label: 'iOS',   sub: 'HudsonKit Swift package',            href: '/docs/ios-shell' },
      { label: 'SDK',   sub: 'hudsonkit on npm',                   href: NPM_URL, external: true },
    ],
    cta: { label: 'Read the architecture →', href: '/docs/architecture' },
  },
  {
    id: 'apps',
    num: '02',
    title: 'Apps',
    pitch:
      'Apps plug into the shell through a small HudsonApp contract — Provider for state, slot components for chrome, hooks the shell reads. The workspace ships a wide range of them; the variety is the point.',
    items: [
      { label: 'Hudson Docs',     sub: 'Built-in component reference, agent-friendly' },
      { label: 'Code Editor',     sub: 'Source editing inside the workspace' },
      { label: 'Notepad',         sub: 'Markdown notes with frontmatter' },
      { label: 'API Inspector',   sub: 'HTTP playground + response viewer' },
      { label: 'JSON Explorer',   sub: 'Structured data inspection + diffing' },
      { label: 'Assets',          sub: 'Workspace asset manager' },
      { label: 'Stage Design',    sub: 'Stage + camera composition' },
      { label: 'Theme Designer',  sub: 'Tokens, themes, live preview' },
      { label: 'HudLogger',       sub: 'Agent action trail' },
    ],
    cta: { label: 'Open the workspace ↗', href: WORKSPACE_URL, external: true },
  },
  {
    id: 'primitives',
    num: '03',
    title: 'Primitives',
    pitch:
      'A small set of components owns the chrome. Drop them in, share state through the Hudson context. No app reimplements its own sidebar, palette, or status bar.',
    items: [
      { label: 'Frame',           sub: 'Pan/zoom shell with three layers' },
      { label: 'NavigationBar',   sub: 'Top chrome — title, search, actions' },
      { label: 'SidePanels',      sub: 'Collapsible left + right docks with resize' },
      { label: 'StatusBar',       sub: 'Bottom chrome — status, viewport, clock' },
      { label: 'CommandPalette',  sub: 'Cmd+K fuzzy menu with shortcuts' },
      { label: 'TerminalDrawer',  sub: 'Slide-in console from the status bar' },
      { label: 'Canvas',          sub: 'Pan/zoom engine, dot grid, crosshairs' },
      { label: 'Minimap',         sub: 'Viewport · zoom · click-to-navigate' },
      { label: 'Voice',           sub: 'Local capture + reply, intent dispatch' },
    ],
    cta: { label: 'See the patterns →', href: '/docs/patterns' },
  },
];

export function EmbedDocs() {
  const [activeId, setActiveId] = useState<string>(TOPICS[0].id);
  const active = TOPICS.find((t) => t.id === activeId) ?? TOPICS[0];

  return (
    <div style={ROOT}>
      <Header />
      <div style={BODY}>
        <aside style={SIDEBAR}>
          <div style={SIDEBAR_CAP}>Topics</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {TOPICS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  aria-pressed={t.id === activeId}
                  style={topicButtonStyle(t.id === activeId)}
                >
                  <span style={{ color: 'var(--hud-accent, oklch(0.70 0.11 42))', marginRight: 10 }}>
                    {t.num}
                  </span>
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'auto', paddingTop: 18 }}>
            <a href={WORKSPACE_URL} target="_top" rel="noopener noreferrer" style={CTA_PRIMARY}>
              ↗ Workspace
            </a>
          </div>
        </aside>

        <article style={ARTICLE}>
          <div style={ARTICLE_HEAD}>
            <span style={ARTICLE_NUM}>{active.num}</span>
            <h2 style={ARTICLE_TITLE}>{active.title}</h2>
          </div>
          <p style={ARTICLE_PITCH}>{active.pitch}</p>
          <ul style={LIST}>
            {active.items.map((item) => {
              const row = (
                <>
                  <span style={LIST_LABEL}>{item.label}</span>
                  <span style={LIST_DOT} aria-hidden />
                  <span style={LIST_SUB}>{item.sub}</span>
                </>
              );
              return (
                <li key={item.label} style={LIST_ROW}>
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.external ? '_top' : undefined}
                      rel={item.external ? 'noopener noreferrer' : undefined}
                      style={LIST_LINK}
                    >
                      {row}
                    </a>
                  ) : (
                    <div style={LIST_LINK}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <a
            href={active.cta.href}
            target={active.cta.external ? '_top' : undefined}
            rel={active.cta.external ? 'noopener noreferrer' : undefined}
            style={READ_MORE}
          >
            {active.cta.label}
          </a>
        </article>
      </div>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header style={HEADER}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
        <span style={HEADER_LABEL}>HudsonKit · map</span>
        <span style={HEADER_SUB}>surfaces · apps · primitives</span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer style={FOOTER}>
      <span>app.hudsonkit.com</span>
      <span>v0.2 · live</span>
    </footer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ROOT: CSSProperties = {
  // Fill the iframe viewport. A percentage min-height does not resolve from
  // the route wrapper's own min-height, which left its light page background
  // exposed beneath shorter topic content.
  minHeight: '100vh',
  width: '100%',
  background: 'var(--hud-bg, oklch(0.18 0.02 240))',
  color: 'var(--hud-ink, oklch(0.94 0.005 240))',
  fontFamily: 'var(--hud-font-body, system-ui, sans-serif)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
};

const HEADER: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 22px',
  borderBottom: 'var(--hud-border-width, 1px) solid var(--hud-line, oklch(0.32 0.012 240))',
};

const HEADER_LABEL: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 11,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--hud-ink, oklch(0.94 0.005 240))',
};

const HEADER_SUB: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--hud-ink-3, oklch(0.50 0.01 240))',
};

const BODY: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '220px 1fr',
  minHeight: 0,
};

const SIDEBAR: CSSProperties = {
  borderRight: 'var(--hud-border-width, 1px) solid var(--hud-line, oklch(0.32 0.012 240))',
  padding: '22px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: 'var(--hud-bg-2, oklch(0.20 0.005 240))',
};

const SIDEBAR_CAP: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 10,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--hud-ink-3, oklch(0.50 0.01 240))',
  marginBottom: 10,
};

function topicButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    background: active
      ? 'var(--hud-bg-3, oklch(0.28 0.005 240))'
      : 'transparent',
    border: 'var(--hud-border-width, 1px) solid',
    borderColor: active
      ? 'var(--hud-line-strong, oklch(0.48 0.012 240))'
      : 'transparent',
    color: active
      ? 'var(--hud-ink, oklch(0.94 0.005 240))'
      : 'var(--hud-ink-1, oklch(0.86 0.005 240))',
    fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
    fontSize: 12,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    marginBottom: 4,
  };
}

const ARTICLE: CSSProperties = {
  padding: '26px 30px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
};

const ARTICLE_HEAD: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 14,
};

const ARTICLE_NUM: CSSProperties = {
  fontFamily: 'var(--hud-font-display, "Times New Roman", serif)',
  fontSize: 30,
  color: 'var(--hud-accent, oklch(0.70 0.11 42))',
  lineHeight: 1,
};

const ARTICLE_TITLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--hud-font-display, "Times New Roman", serif)',
  fontSize: 26,
  fontWeight: 400,
  lineHeight: 1.1,
  color: 'var(--hud-ink, oklch(0.94 0.005 240))',
  letterSpacing: '-0.01em',
};

const ARTICLE_PITCH: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--hud-ink-2, oklch(0.66 0.008 240))',
  maxWidth: 540,
};

const LIST: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '2px 0 0',
  display: 'grid',
  gap: 1,
  border: 'var(--hud-border-width, 1px) solid var(--hud-line, oklch(0.32 0.012 240))',
  background: 'var(--hud-line, oklch(0.32 0.012 240))',
};

const LIST_ROW: CSSProperties = {
  background: 'var(--hud-bg, oklch(0.18 0.02 240))',
  padding: 0,
};

const LIST_LINK: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  padding: '10px 14px',
  textDecoration: 'none',
  color: 'inherit',
};

const LIST_LABEL: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 12,
  letterSpacing: '0.08em',
  color: 'var(--hud-ink, oklch(0.94 0.005 240))',
  minWidth: 130,
};

const LIST_DOT: CSSProperties = {
  flex: '0 0 6px',
  height: 6,
  borderRadius: '50%',
  background: 'var(--hud-accent, oklch(0.70 0.11 42))',
  opacity: 0.7,
};

const LIST_SUB: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: 'var(--hud-ink-2, oklch(0.66 0.008 240))',
  flex: 1,
};

const READ_MORE: CSSProperties = {
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 11,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--hud-accent, oklch(0.70 0.11 42))',
  textDecoration: 'none',
  marginTop: 4,
};

const FOOTER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 22px',
  borderTop: 'var(--hud-border-width, 1px) solid var(--hud-line, oklch(0.32 0.012 240))',
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 9,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--hud-ink-3, oklch(0.50 0.01 240))',
};

const CTA_PRIMARY: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  padding: '10px 14px',
  background: 'var(--hud-accent, oklch(0.70 0.11 42))',
  color: 'var(--hud-bg, oklch(0.18 0.02 240))',
  fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  border: 'var(--hud-border-width, 1px) solid var(--hud-accent, oklch(0.70 0.11 42))',
};
