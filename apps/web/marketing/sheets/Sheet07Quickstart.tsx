import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { REPOSITORY_URL } from '@/site/seo';
import { sheetNumber } from './order';

const STEPS = [
  {
    n: '01',
    t: 'INSTALL',
    cmd: '$ bun add hudsonkit',
    caption: 'Add the workspace layer without replacing the product code your team owns.',
  },
  {
    n: '02',
    t: 'DEFINE',
    cmd: 'const app: HudsonApp = { … }',
    caption: 'Write the app contract: provider, slots, hooks, commands, and intents.',
  },
  {
    n: '03',
    t: 'BUILD',
    cmd: '$ bun dev',
    caption: 'Implement your model, renderer, and interactions inside the normal dev loop.',
  },
];

const WORKSPACE_URL = 'https://app.hudsonkit.com';
const GITHUB_URL = REPOSITORY_URL;

const FOOTER_COLS: { h: string; links: { label: string; href: string }[] }[] = [
  {
    h: 'Project',
    links: [
      { label: 'GitHub', href: GITHUB_URL },
      { label: 'Releases', href: `${GITHUB_URL}/releases` },
      { label: 'Roadmap', href: `${GITHUB_URL}/issues` },
      { label: 'Workspace', href: WORKSPACE_URL },
    ],
  },
  {
    h: 'Docs',
    links: [
      { label: 'Quickstart', href: '/docs/quickstart' },
      { label: 'Building Apps', href: '/docs/building-apps' },
      { label: 'Voice / AI', href: '/docs/voice' },
      { label: 'API', href: '/docs/api' },
    ],
  },
  {
    h: 'Apps',
    links: [
      { label: 'Talkie', href: 'https://usetalkie.com' },
      { label: 'Scout', href: 'https://github.com/arach/scout' },
      { label: 'Lattices', href: 'https://github.com/arach/lattices' },
      { label: 'Vox', href: 'https://github.com/arach/vox' },
    ],
  },
  {
    h: 'Legal',
    links: [
      { label: 'License (Apache 2.0)', href: '/license' },
      { label: 'Contributing', href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md` },
      { label: 'Security', href: `${GITHUB_URL}/security` },
    ],
  },
];

export function Sheet07Quickstart() {
  return (
    <Sheet
      id="quickstart"
      slugTitle="IMPLEMENT"
      slugSub="install · define · build"
      sheetTitle="Product Implementation Spec"
      footer={{
        mid: 'HUDSONKIT — PRODUCT SPEC → WORKING WORKSPACE',
        right: ['LICENSE', 'Apache 2.0'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('quickstart')} / Implementation · from spec to product</Eyebrow>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 80,
            alignItems: 'end',
            marginBottom: 72,
          }}
        >
          <h2 className="h-section">
            From product <em>spec</em> to working workspace.
          </h2>
          <p className="subhead" style={{ fontSize: 16 }}>
            The boundary is straightforward: your team owns the domain model, renderer, and
            interactions. Hudson provides the canvas, rails, commands, persistence, logging, and
            agent context around them. Three commands get that contract running.
          </p>
        </div>

        <div
          data-cal
          data-cal-label="quickstart cards · 3-col"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
            marginBottom: 80,
          }}
        >
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="hud-card"
              style={{
                border: 'var(--stroke-w) solid var(--ink)',
                background: 'var(--paper)',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 44,
                    lineHeight: 1,
                    color: 'var(--accent-deep)',
                  }}
                >
                  {s.n}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-2)',
                  }}
                >
                  {s.t}
                </span>
              </div>
              <pre className="code" style={{ margin: 0, fontSize: 12, padding: 12 }}>
                <span className="str">{s.cmd}</span>
              </pre>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55 }}>
                {s.caption}
              </p>
            </div>
          ))}
        </div>

        <div data-cal data-cal-label="docs preview" style={{ position: 'relative', marginBottom: 80 }}>
          <div className="embed-plate__caption">
            <span className="live" />
            EMBED · app = hudson/docs · status: live
          </div>
          <EmbedFrame height={520} padding={0}>
            <HudsonEmbed
              src="/embed/hudson/docs"
              surface="docs"
              sizing={{ mode: 'fill' }}
              density="comfy"
              template="drafting"
              consumerId="hudsonos"
              title="Hudson docs · getting started"
            />
          </EmbedFrame>
        </div>

        <div
          className="hud-card implementation-cta"
          data-cal
          data-cal-label="final CTA banner"
          style={{
            padding: '40px 48px',
            marginBottom: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 36,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                marginBottom: 12,
              }}
            >
              PRODUCT BOUNDARY · READY TO IMPLEMENT
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 34,
                lineHeight: 1.15,
                color: 'var(--ink)',
              }}
            >
              Build what makes the product <em>distinct</em>. Keep the workspace solved.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
            <a className="btn btn--accent" href={WORKSPACE_URL} target="_blank" rel="noopener noreferrer">
              ↗ Open the workspace
            </a>
            <a
              className="btn"
              style={{
                background: 'transparent',
                color: 'var(--ink)',
                borderColor: 'var(--line-strong)',
              }}
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              ★ View on GitHub
            </a>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 32,
            paddingTop: 32,
            borderTop: '1px solid var(--line-strong)',
          }}
        >
          {FOOTER_COLS.map((c) => (
            <div key={c.h}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-2)',
                  marginBottom: 12,
                }}
              >
                {c.h}
              </div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {c.links.map((l) => {
                  const external = l.href.startsWith('http');
                  return (
                    <li key={l.label}>
                      <a
                        className="footer-link"
                        href={l.href}
                        {...(external
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                        style={{ fontSize: 13, color: 'var(--ink)' }}
                      >
                        {l.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
