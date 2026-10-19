import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';
import { PrimitiveSparkline } from './_components/PrimitiveSparkline';

const PRIMS = [
  { name: 'Frame', dim: '100% × 100%', use: 'Chrome root. Hosts nav, panels, canvas, status.' },
  { name: 'NavigationBar', dim: 'h: 48 px', use: 'Crumbs, ⌘K, install. Always pinned to top.' },
  { name: 'SidePanel', dim: 'w: 280 px', use: 'Manifest, inspector, file tree. Either side.' },
  { name: 'Canvas', dim: 'fluid', use: 'Pan/zoom workspace. Floating windows live here.' },
  { name: 'StatusBar', dim: 'h: 28 px', use: 'Live runtime: uptime, intents, logs, version.' },
  { name: 'CommandPalette', dim: '⌘K · 480 px', use: 'Fuzzy-searches every intent. Voice + keys.' },
  { name: 'TerminalDrawer', dim: 'h: 0 / 240px', use: 'Slide-up shell. Natural-language → bash.' },
  { name: 'Assistant', dim: 'overlay', use: 'AI primitive. Reads capability map, dispatches commands.' },
];

export function Sheet06Primitives() {
  return (
    <Sheet
      id="primitives"
      slugTitle="PRIMITIVES"
      slugSub="reference · all 8"
      sheetTitle="Primitives — Reference Sheet"
      footer={{
        mid: 'PRIMITIVES — REFERENCE SHEET · 8 COMPONENTS',
        right: ['LOC', '~ 2,400'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('primitives')} / Primitives · the kit</Eyebrow>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, marginBottom: 72 }}
        >
          <h2 className="h-section">
            The workspace around your tool, <em>already handled</em>.
          </h2>
          <p className="subhead" style={{ fontSize: 17, alignSelf: 'end' }}>
            Eight foundational components establish the workspace vocabulary. They compose and
            nest into the shell patterns Hudson apps share. If you&apos;ve used one Hudson workspace,
            the interaction model is already familiar.
          </p>
        </div>

        <div
          data-cal
          data-cal-label="primitives reference grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
            border: 'var(--stroke-w) solid var(--ink)',
            background: 'var(--paper)',
          }}
        >
          {PRIMS.map((p, i) => (
            <div
              key={p.name}
              style={{
                padding: 20,
                borderRight: i % 4 !== 3 ? '1px solid var(--line-strong)' : 0,
                borderBottom: i < 4 ? '1px solid var(--line-strong)' : 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minHeight: 200,
              }}
            >
              <PrimitiveSparkline name={p.name} />
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  letterSpacing: '0.1em',
                  color: 'var(--ink)',
                  fontWeight: 600,
                }}
              >
                {`<${p.name}/>`}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-2)',
                }}
              >
                {p.dim}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                {p.use}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
