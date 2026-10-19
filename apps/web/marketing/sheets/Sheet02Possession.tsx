'use client';

import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';

const SPEC: Array<[string, string, boolean?]> = [
  ['NAV.HEIGHT', '48 px'],
  ['PANEL.WIDTH', '280 px'],
  ['STATUS.HEIGHT', '28 px'],
  ['ACCENT', 'var(--accent)'],
  ['INTENTS', '16 indexed', true],
  ['COMMANDS', '45 live', true],
  ['LATENCY', '< 80 ms (vox→cmd)', true],
  ['SURFACES', 'iOS · macOS · Web'],
  ['THEME', 'hudson · dark'],
  ['VERSION', 'v0.4.2'],
];

const PARTS = [
  { n: '01', t: 'DECLARE', l: 'A typed object names your app.', b: 'id, mode, intents, ports — Hudson reads it like a blueprint.' },
  { n: '02', t: 'WIRE', l: 'Intents become voice + ⌘K.', b: 'Each entry is indexed for fuzzy match, hotkeys, and the assistant.' },
  { n: '03', t: 'COMPOSE', l: 'Drop in primitives.', b: 'Frame, Nav, Panel, Canvas, Status — same chrome every app inherits.' },
  { n: '04', t: 'ADAPT', l: 'Carry the workspace language forward.', b: 'Use platform-native Hudson primitives wherever the product needs another surface.' },
];

export function Sheet02Possession() {
  return (
    <Sheet
      id="possession"
      slugTitle="LIVE WORKSPACE"
      slugSub="elevation · 1:1 scale"
      sheetTitle="Possession Mode — Live Embed"
      footer={{
        mid: 'LIVE EMBED · POSSESSION MODE — workspace = self',
        right: ['SCALE', '1 : 1'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '48px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('possession')} / Live Embed · spec ↔ live</Eyebrow>
        </div>

        <h2 className="h-section" style={{ marginBottom: 16 }}>
          The component <em>below</em> is a Hudson embed.
        </h2>

        <p className="subhead" style={{ marginBottom: 38 }}>
          This is the real workspace shell, rendered from the SDK. Same chrome, canvas,
          app windows, command surface, and live decoration layer any Hudson app inherits.
        </p>

        <div
          className="sheet02-possession__live-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 32,
            alignItems: 'start',
            marginBottom: 80,
          }}
        >
          <div>
            <EmbedSlot height="clamp(430px, 34vw, 540px)" />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                color: 'var(--ink-2)',
                textTransform: 'uppercase',
                paddingTop: 12,
                marginTop: 32,
                borderTop: '1px solid var(--line)',
              }}
            >
              <span>① CAPABILITY MAP</span>
              <span>② COMMAND DOCK</span>
              <span>③ STATUS BAR</span>
              <span>④ CANVAS · pan/zoom</span>
            </div>
          </div>

          <div>
            <div className="spec" data-cal data-cal-label="manifest spec">
              <div className="spec__row spec__row--header">
                <div>Param</div>
                <div>Value</div>
              </div>
              {SPEC.map(([k, v, accent]) => (
                <div key={k} className="spec__row">
                  <div className="spec__k">{k}</div>
                  <div className={'spec__v' + (accent ? ' spec__v--accent' : '')}>{v}</div>
                </div>
              ))}
            </div>

            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                letterSpacing: '0.06em',
                color: 'var(--ink-2)',
                marginTop: 16,
                lineHeight: 1.6,
                textTransform: 'uppercase',
              }}
            >
              Note. Every parameter on this sheet is read from the same{' '}
              <span style={{ color: 'var(--accent-deep)', fontWeight: 600 }}>manifest.ts</span> the
              embedded workspace consumes.
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <Eyebrow>Parts list · build sequence</Eyebrow>
        </div>

        <div
          data-cal
          data-cal-label="build sequence parts"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}
        >
          {PARTS.map((p) => (
            <div key={p.n} className="part">
              <div className="part__num">{p.n}</div>
              <div className="part__title">{p.t}</div>
              <h3 className="part__lede">{p.l}</h3>
              <p className="part__body">{p.b}</p>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function EmbedSlot({ height }: { height: number | string }) {
  return (
    <div style={{ position: 'relative' }}>
      <div className="embed-plate__caption">
        <span className="live" />
        FIG. 02-A · <span style={{ color: 'var(--accent-deep)', fontWeight: 600 }}>LIVE</span>
        <span style={{ color: 'var(--ink-faint)' }}> · </span>
        <span>the spec, running</span>
      </div>
      <EmbedFrame height={height}>
        <HudsonEmbed
          src="/embed/hudson/workspace"
          surface="workspace"
          sizing={{ mode: 'fill' }}
          density="comfy"
          workspace="self"
          template="drafting"
          consumerId="hudson-linen"
          title="Hudson workspace · live primitives · linen"
        />
      </EmbedFrame>
    </div>
  );
}
