import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';
import { WorkspaceSpecBox } from './_components/ManifestBox';
import { PlatformFrame } from './_components/PlatformFrame';
import { SurfaceMapBlock } from './_components/ShipBlock';
import { SplitArrow } from './_components/SplitArrow';

export function Sheet04Surfaces() {
  return (
    <Sheet
      id="surfaces"
      slugTitle="CONSISTENT PRIMITIVES"
      slugSub="shared vocabulary · native code"
      sheetTitle="A Shared Workspace Vocabulary"
      footer={{
        mid: 'CONSISTENT PRIMITIVES — WEB · MACOS · IOS',
        right: ['STACK', 'NATIVE'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('surfaces')} / Consistent primitives</Eyebrow>
        </div>

        <h2 className="h-section" style={{ marginBottom: 64 }}>
          Consistent primitives. <em>Native</em> implementations.
        </h2>

        <div
          data-cal
          data-cal-label="multi-surface assembly"
          style={{
            border: 'var(--stroke-w) solid var(--ink)',
            background: 'var(--paper)',
            padding: 40,
            marginBottom: 64,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -1,
              left: -1,
              background: 'var(--ink)',
              color: 'var(--paper)',
              padding: '6px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            FIG. 05-A · WORKSPACE VOCABULARY
          </div>

          <div
            className="reflow-assembly"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr auto 1fr',
              gap: 0,
              alignItems: 'center',
              marginTop: 28,
            }}
          >
            <WorkspaceSpecBox />
            <SplitArrow />
            <div
              className="reflow-platforms"
              style={{
                gridColumn: 'span 3',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 28,
              }}
            >
              <PlatformFrame kind="ios" label="iOS" sub="SwiftUI · HudsonKit" />
              <PlatformFrame kind="macos" label="macOS" sub="SwiftUI · HudsonKit" />
              <PlatformFrame kind="web" label="Web" sub="React · hudsonkit" />
            </div>
          </div>

          <div
            className="reflow-hide-narrow"
            style={{
              marginTop: 32,
              display: 'grid',
              gridTemplateColumns: 'auto auto 1fr',
              gap: 0,
              alignItems: 'center',
            }}
          >
            <div style={{ width: 280 }} />
            <div style={{ width: 60 }} />
            <div
              data-cal
              data-cal-label="platform dims"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}
            >
              {[
                ['390 × 844', '@3x'],
                ['1024 × 768', 'window'],
                ['fluid', '@1x → ∞'],
              ].map(([d, s]) => (
                <div
                  key={d}
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-2)',
                  }}
                >
                  <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>{d}</div>
                  <div style={{ marginTop: 2 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 48,
            alignItems: 'start',
          }}
        >
          <p className="subhead" style={{ fontSize: 17 }}>
            Navigation, side rails, commands, status, canvas, and observability follow the same
            product vocabulary. Each surface implements those primitives in its native stack —
            SwiftUI on Apple platforms and React on the web.{' '}
            <em>Hudson provides the workspace model; your team still owns each product implementation.</em>
          </p>

          <div data-cal data-cal-label="surface implementation map">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
                marginBottom: 8,
              }}
            >
              IMPLEMENTATION MAP
            </div>
            <SurfaceMapBlock />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
