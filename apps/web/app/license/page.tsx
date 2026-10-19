import type { CSSProperties } from 'react';
import { canonicalUrl } from '../../site/seo';
import Link from 'next/link';
import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { DEFAULTS } from '@/marketing/theme/defaults';
import { resolveThemeStyle } from '@/marketing/theme/resolve';

export const metadata = {
  alternates: { canonical: canonicalUrl('/license/') },
  title: 'License (Apache 2.0) · HudsonKit',
  description: 'HudsonKit is open source under Apache 2.0, including commercial use.',
};

const REVISED = '2026-10-05';

const OPEN_ITEMS = [
  'Use HudsonKit for personal projects and commercial products.',
  'Read, modify, fork, and redistribute the source.',
  'Build and sell applications using HudsonKit without a license fee.',
];

const NOTICE_ITEMS = [
  'Include a copy of the Apache 2.0 license when redistributing the software.',
  'Retain applicable copyright, attribution, and NOTICE information.',
  'Mark modified files with notices stating that you changed them.',
];

export default function LicensePage() {
  const themeStyle = resolveThemeStyle({ ...DEFAULTS });

  return (
    <main
      className="hudson-site"
      data-paper={DEFAULTS.paper}
      style={{ ...themeStyle, minHeight: '100vh', paddingBottom: 80 }}
      suppressHydrationWarning
    >
      <PageHeader />

      <article style={{ maxWidth: 880, margin: '60px auto 0', padding: '0 32px' }}>
        <Eyebrow>LIC / APACHE 2.0</Eyebrow>

        <h1
          className="h-section"
          style={{ marginTop: 24, marginBottom: 28 }}
        >
          Open source. <em>Apache 2.0.</em>
        </h1>

        <p
          className="subhead"
          style={{ fontSize: 18, lineHeight: 1.55, marginBottom: 56, maxWidth: 700 }}
        >
          HudsonKit is free to use, modify, and distribute under the Apache License,
          Version 2.0. Commercial use is welcome. No separate permission or license
          fee is required.
        </p>

        <Section num="§1" title="What you can do">
          <BulletList items={OPEN_ITEMS} />
        </Section>

        <Section num="§2" title="Redistribution requirements">
          <BulletList items={NOTICE_ITEMS} />
        </Section>

        <Section num="§3" title="The full terms">
          <p style={SECTION_P}>
            This page summarizes the license. The{' '}
            <a href="https://github.com/hudsonkit/hudson/blob/main/LICENSE.md">full Apache 2.0 license</a>{' '}
            governs use of Hudson code released under it. Third-party dependencies
            retain their own licenses; see the{' '}
            <a href="https://github.com/hudsonkit/hudson/blob/main/NOTICE.md">third-party notices</a>.
            The software is provided without warranties. The license does not
            grant rights to Hudson trademarks.
          </p>
        </Section>

        <SignatureBlock />
      </article>
    </main>
  );
}

// ─── Page chrome ─────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--ink)',
      }}
    >
      <div
        style={{
          height: 4,
          background:
            'repeating-linear-gradient(to right, var(--ink) 0 1px, transparent 1px 12px)',
          opacity: 0.4,
        }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '14px 32px',
          gap: 16,
        }}
      >
        <Link
          href="/"
          style={{
            justifySelf: 'start',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          ← back to drawings
        </Link>
        <span
          style={{
            justifySelf: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
            border: '1px solid var(--ink)',
            padding: '6px 12px',
            background: 'var(--paper-2)',
          }}
        >
          LICENSE · APACHE 2.0
        </span>
        <span
          style={{
            justifySelf: 'end',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          HUDSONKIT
        </span>
      </div>
    </header>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 44,
        paddingBottom: 36,
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            color: 'var(--accent-deep)',
            lineHeight: 1,
          }}
        >
          {num}
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gap: 10,
      }}
    >
      {items.map((item) => (
        <li
          key={item}
          style={{
            display: 'grid',
            gridTemplateColumns: '20px 1fr',
            gap: 12,
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--ink-1)',
          }}
        >
          <span
            aria-hidden
            style={{
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            ◦
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SignatureBlock() {
  return (
    <div
      style={{
        marginTop: 12,
        border: 'var(--stroke-w) solid var(--ink)',
        background: 'var(--paper-2)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
      }}
    >
      <SigCell label="Drawn by" value="Arach Tchoupani" />
      <SigCell label="Last revised" value={REVISED} mid />
      <SigCell label="Revision" value="Apache 2.0" />
    </div>
  );
}

function SigCell({ label, value, mid }: { label: string; value: string; mid?: boolean }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderRight: mid ? '1px solid var(--ink)' : undefined,
        borderLeft: mid ? '1px solid var(--ink)' : undefined,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          color: 'var(--ink)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const SECTION_P: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.6,
  color: 'var(--ink-1)',
  maxWidth: 720,
};
